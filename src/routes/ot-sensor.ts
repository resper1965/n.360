import { genId, logAudit, sha256Hex } from '../helpers';
import { chavesOt } from '../services/ot-cifra';
import { hojeEmSaoPaulo } from '../services/hoje';
import { ddmm, EVIDENCIA_SENSOR, filtrarNovidade, gravarPlano, planejarResumo, resumoRedeSchema, type Contagens } from '../services/ot-rede';
import { autenticarSensor } from '../services/ot-sensor';
import { detectarDesvios } from '../services/ot-desvio';
import type { Bindings } from '../index';

/**
 * Envio automático da sonda de rede do n.ot (`POST /ot-sensor/resumo`, spec 2026-11-05 §4). A resposta 200 é sempre
 * `{ recebido: true, envio_id }`: contagem ou "novo/conhecido" seria oráculo do inventário para uma máquina dentro da subestação.
 */
export const TETO_CORPO = 5 * 1024 * 1024;
export const TETO_ENVIOS_DIA = 30;

const json = (corpo: unknown, status: number, h: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...h } });
const recusa = (status: number, error: string) => json({ error }, status, status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {});

/** Lê o corpo até o teto; null se passar dele (o stream é cancelado sem ler o resto). */
async function lerAte(req: Request, teto: number): Promise<string | null> {
  if (!req.body) return '';
  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    n += value.byteLength;
    if (n > teto) { await leitor.cancel().catch(() => {}); return null; }
    partes.push(value);
  }
  const tudo = new Uint8Array(n);
  let i = 0;
  for (const p of partes) { tudo.set(p, i); i += p.byteLength; }
  return new TextDecoder().decode(tudo);
}

// `ctx` leva a entrega do webhook de desvio (waitUntil); os testes injetam `deps` na 4ª posição.
export async function handlerOtSensor(req: Request, env: Bindings, ctx: ExecutionContext,
  deps: { gravarPlano?: typeof gravarPlano; detectarDesvios?: typeof detectarDesvios } = {}): Promise<Response> {
  if (req.method !== 'POST') return recusa(405, 'Use POST');
  const auth = await autenticarSensor(env, req);
  if (!auth.ok) return recusa(auth.status, auth.error);
  const { sensor } = auth;
  const db = env.DB;

  if (Number(req.headers.get('Content-Length') ?? 0) > TETO_CORPO) return recusa(413, 'Resumo maior que 5 MB');
  const texto = await lerAte(req, TETO_CORPO);
  if (texto === null) return recusa(413, 'Resumo maior que 5 MB');
  let bruto: unknown;
  try { bruto = JSON.parse(texto); } catch { return recusa(400, 'Resumo de rede inválido: JSON malformado'); }
  const v = resumoRedeSchema.safeParse(bruto);
  if (!v.success) {
    const i = v.error.issues[0]; // caminho e mensagem do Zod, nunca o valor recebido
    return recusa(400, `Resumo de rede inválido: ${i.path.length ? `${i.path.join('.')}: ` : ''}${i.message}`);
  }
  const resumo = v.data;
  const p = resumo.periodo;
  if (!p) return recusa(400, 'Resumo de rede inválido: sem período (confira o relógio da sonda)');
  if (Date.parse(p.inicio) >= Date.parse(p.fim) || Date.parse(p.fim) > Date.now() + 3_600_000) {
    return recusa(400, 'Resumo de rede inválido: período impossível (confira o relógio da sonda)');
  }

  // A impressão (SHA-256 do corpo) cobre o reenvio do mesmo arquivo pela fila. Regenerar o mesmo período muda `gerado_em` e a
  // impressão; esse caso é coberto pelo filtro de novidade (filtrarNovidade), que pula o que já está em rascunho ou pendente.
  const impressao = await sha256Hex(texto);
  let envioId = genId();
  // O teto vai no próprio INSERT: conta os aceitos (processando ou concluídos) das últimas 24 h; o "já recebido" não chega a contar.
  const ins = await db.prepare(`INSERT INTO ot_sensor_envios (id, sensor_id, project_id, impressao, periodo_inicio, periodo_fim, capture_loss, versao_script)
    SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM ot_sensor_envios WHERE sensor_id = ? AND situacao IN ('processando', 'concluido')
      AND created_at >= datetime('now', '-1 day')) < ${TETO_ENVIOS_DIA}
    ON CONFLICT (sensor_id, impressao) DO NOTHING RETURNING atualizado_em`)
    .bind(envioId, sensor.id, sensor.projectId, impressao, p.inicio, p.fim, resumo.capture_loss ?? null, resumo.versao_script ?? null, sensor.id)
    .first<{ atualizado_em: string }>();
  // `marca` = o atualizado_em que este pedido gravou: toda escrita no envio é guardada por ela, para não mexer numa linha assumida por outro.
  let marca = ins?.atualizado_em;
  let levantamentoId: string | null = null;
  if (!marca) {
    const e = await db.prepare(`SELECT id, situacao, levantamento_id, atualizado_em < datetime('now', '-10 minutes') AS velho FROM ot_sensor_envios
      WHERE sensor_id = ? AND impressao = ?`).bind(sensor.id, impressao).first<{ id: string; situacao: string; levantamento_id: string | null; velho: number }>();
    if (!e) return recusa(429, `Limite de ${TETO_ENVIOS_DIA} envios por dia desta sonda atingido. Tente de novo amanhã.`);
    if (e.situacao === 'concluido') return json({ recebido: true, envio_id: e.id }, 200);
    // Processando há 10 min ou mais (pedido anterior morreu, ou liberou a linha após um erro capturado): assume a linha (só um pedido vence o UPDATE) e reusa a sessão anotada.
    marca = e.velho ? (await db.prepare(`UPDATE ot_sensor_envios SET atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND situacao = 'processando'
      AND atualizado_em < datetime('now', '-10 minutes') RETURNING atualizado_em`).bind(e.id).first<{ atualizado_em: string }>())?.atualizado_em : undefined;
    if (!marca) return recusa(503, 'Resumo em processamento: reenvie mais tarde');
    envioId = e.id;
    levantamentoId = e.levantamento_id;
  }

  try {
    const chaves = chavesOt(env)!;
    const site = await db.prepare('SELECT faixas_internas FROM ot_sites WHERE id = ? AND project_id = ?').bind(sensor.siteId, sensor.projectId).first<{ faixas_internas: string }>();
    const agora = new Date(); // antes de ler o inventário: o desvio regularizado depois disto não é reaberto por este plano
    const plano = await planejarResumo(db, chaves, sensor.projectId, { id: sensor.siteId, faixas: JSON.parse(site?.faixas_internas ?? '[]') as string[] }, resumo);
    const { plano: novos, repetidos } = await filtrarNovidade(db, sensor.projectId, plano);
    let k: Contagens = { ativos_novos: 0, macs_completados: 0, fluxos_criados: 0, fluxos_pendentes: 0, nao_importados: 0, pendentes_nao_importados: 0 };
    if (novos.ativos.length + novos.macs.length + novos.fluxos.length + novos.pendentes.length) {
      if (!levantamentoId) {
        // Sessão de documento já encerrada, anotada no envio antes dos achados: quem assumir a linha depois reusa esta sessão.
        // A sessão só nasce se este pedido ainda é dono da linha (a guarda vai no INSERT e no UPDATE do mesmo batch).
        const novo = genId();
        const [, anotou] = await db.batch([
          db.prepare(`INSERT INTO ot_levantamentos (id, project_id, site_id, tipo, realizado_em, documento_titulo, situacao, encerrado_em, criado_por)
            SELECT ?, ?, ?, 'documento', ?, ?, 'encerrado', CURRENT_TIMESTAMP, ?
            WHERE EXISTS (SELECT 1 FROM ot_sensor_envios WHERE id = ? AND situacao = 'processando' AND atualizado_em = ?)`)
            .bind(novo, sensor.projectId, sensor.siteId, hojeEmSaoPaulo(), `Sonda ${sensor.nome} · ${ddmm(p.inicio)} a ${ddmm(p.fim)}`, `sensor:${sensor.id}`, envioId, marca),
          db.prepare(`UPDATE ot_sensor_envios SET levantamento_id = ? WHERE id = ? AND situacao = 'processando' AND atualizado_em = ?`).bind(novo, envioId, marca),
        ]);
        if (!anotou.meta.changes) throw new Error('envio assumido por outro pedido');
        levantamentoId = novo;
      }
      const evidencia = EVIDENCIA_SENSOR(resumo.conexoes.reduce((n, x) => n + x.contagem, 0), p.inicio, p.fim);
      // Limite aceito: a marca não guarda o gravarPlano; um pedido de mais de 10 min sobreposto a uma tomada pode gravar rascunhos
      // duplicados (o filtro de novidade atenua no envio seguinte).
      k = await (deps.gravarPlano ?? gravarPlano)(db, chaves, { projectId: sensor.projectId, siteId: sensor.siteId, levantamentoId, criadoPor: `sensor:${sensor.id}`, evidencia, plano: novos });
    }
    const contagens = { ...k, ativos_conhecidos: plano.contagem.ativos_conhecidos, fluxos_conhecidos: plano.contagem.fluxos_conhecidos, repetidos };
    const fim = await db.prepare(`UPDATE ot_sensor_envios SET situacao = 'concluido', contagens = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ? AND situacao = 'processando' AND atualizado_em = ?`).bind(JSON.stringify(contagens), envioId, marca).run();
    if (!fim.meta.changes) {
      // Outro pedido assumiu a linha no meio: só responde 200 se o envio ficou concluído; senão a sonda reenvia.
      console.error('ot.sensor.resumo: envio assumido por outro pedido antes de concluir', envioId);
      const c = await db.prepare(`SELECT id FROM ot_sensor_envios WHERE sensor_id = ? AND impressao = ? AND situacao = 'concluido'`)
        .bind(sensor.id, impressao).first<{ id: string }>();
      return c ? json({ recebido: true, envio_id: c.id }, 200) : recusa(503, 'Resumo em processamento: reenvie mais tarde');
    }
    // O envio já foi gravado: falha da trilha não pode virar 5xx (a sonda reenviaria à toa). Sem IP nem credencial na trilha.
    await logAudit(db, 'ot.sensor.resumo', `sensor:${sensor.id}`, `Envio ${envioId} da sonda ${sensor.id}: levantamento ${levantamentoId ?? 'nenhum'}; `
      + Object.entries(contagens).map(([c, n]) => `${c} ${n}`).join(', '), '', '', sensor.projectId, { tipo: 'ot_sensor', id: sensor.id })
      .catch((e) => console.error('ot.sensor.resumo: falha na trilha', e));
    // Desvio sobre o plano de ANTES do filtro de novidade (o que está em rascunho ainda não está aprovado). Falha só vai ao log.
    try {
      // sem base aprovada não há o que comparar (spec fluidez §4)
      const fase = await db.prepare(`SELECT fase FROM ot_sites WHERE id = ? AND project_id = ?`).bind(sensor.siteId, sensor.projectId).first<{ fase: string }>();
      if (fase?.fase === 'em_operacao') await (deps.detectarDesvios ?? detectarDesvios)(env, ctx, { projectId: sensor.projectId, siteId: sensor.siteId, sensorId: sensor.id, plano, agora });
    } catch (e) { console.error('ot.desvio', e); }
    return json({ recebido: true, envio_id: envioId }, 200);
  } catch (e) {
    // Libera a linha deste pedido (atualizado_em volta para antes da janela de 10 min): o reenvio imediato a assume, reusa a sessão
    // anotada nela e o filtro de novidade pula o que já foi gravado. A guarda pela `marca` não toca numa linha assumida por outro.
    await db.prepare(`UPDATE ot_sensor_envios SET atualizado_em = datetime('now', '-11 minutes') WHERE id = ? AND situacao = 'processando' AND atualizado_em = ?`)
      .bind(envioId, marca).run().catch((x) => console.error('ot.sensor.resumo: falha ao liberar o envio', x));
    console.error('ot.sensor.resumo', e);
    return recusa(500, 'Falha ao processar o resumo');
  }
}
