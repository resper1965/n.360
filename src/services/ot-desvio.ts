// Desvio do n.ot (spec 2026-11-09-n-ot-desvio §2–§4): o que a sonda viu e não está aprovado no inventário. Calculado sobre o plano
// do resumo (antes do filtro de novidade), com ciclo aberto → tratado/aceito/regularizado e webhook `ot.desvio` sem IP nem MAC.
import type { Bindings } from '../index';
import { genId, logAudit } from '../helpers';
import { appUrl } from '../config/url';
import { chavesOt, cifrarEnderecos } from './ot-cifra';
import { ativosDoSite } from './ot-coleta';
import { TETO_LEITURA_OT } from './ot-inventario';
import type { Plano } from './ot-rede';
import { entregarEvento } from './webhook-entrega';

type Ctx = Pick<ExecutionContext, 'waitUntil'>;
export type AcaoDesvio = 'aberto' | 'reaberto' | 'fechado' | 'aceite_vencido';
export interface LinhaDesvio {
  id: string; project_id: string; site_id: string; tipo: 'fluxo' | 'ativo'; chave_sensor: string; dados: string; situacao: string;
  primeira_vez: string; ultima_vez: string; ocorrencias: number;
}
export const TETO_DESVIOS_POST = 200;
const LOTE = 1000; // chaves por leitura (json_each)
const BLOCO = 50; // statements por batch do D1

/**
 * Corpo do POST (spec §4). A ponta conhecida vira nome do ativo e da zona; a desconhecida, null. Nunca IP, MAC nem a cifra deles:
 * o corpo é montado campo a campo, sem espalhar `dados`. `acao` do item prevalece sobre a do lote.
 */
export async function corpoWebhook(env: Bindings, projectId: string, siteId: string, desvios: (LinhaDesvio & { acao?: AcaoDesvio })[],
  acao: AcaoDesvio): Promise<Record<string, unknown>> {
  const db = env.DB;
  const [site, ativos, zonas] = await Promise.all([
    db.prepare('SELECT nome FROM ot_sites WHERE id = ? AND project_id = ?').bind(siteId, projectId).first<{ nome: string }>(),
    ativosDoSite(db, projectId, siteId),
    db.prepare(`SELECT id, nome FROM ot_zonas WHERE project_id = ? AND site_id = ? AND status = 'ativo' LIMIT ${TETO_LEITURA_OT}`).bind(projectId, siteId)
      .all<{ id: string; nome: string }>(),
  ]);
  const porId = new Map(ativos.results.flatMap((a) => [[a.id, a], ...(a.ip_hash ? [[`h:${a.ip_hash}`, a]] : [])] as [string, typeof a][]));
  const zona = new Map(zonas.results.map((z) => [z.id, z.nome]));
  // ponta pelo id do ativo (fluxo) ou pelo ip_hash (pendência: a ponta pode ter entrado no inventário depois); o hash nunca sai
  const ponta = (id: unknown, hash: unknown) => {
    const a = (typeof id === 'string' ? porId.get(id) : undefined) ?? (typeof hash === 'string' ? porId.get(`h:${hash}`) : undefined);
    return { ativo: a?.nome ?? null, zona: (a && zona.get(a.zona_id as string)) ?? null };
  };
  const base = appUrl(env);
  return {
    evento: 'ot.desvio', projeto_id: projectId, site: { id: siteId, nome: site?.nome ?? null },
    desvios: desvios.slice(0, TETO_DESVIOS_POST).map((x) => {
      const d = JSON.parse(x.dados) as Record<string, unknown>;
      const [pp] = Array.isArray(d.protocolos_portas) ? d.protocolos_portas as { protocolo?: string; porta?: number }[] : [];
      return { id: x.id, acao: x.acao ?? acao, situacao: x.situacao, tipo: x.tipo, protocolo: d.protocolo ?? pp?.protocolo ?? null,
        porta: d.porta ?? pp?.porta ?? null, externo: !!d.externo, origem: ponta(d.origem_ativo_id, d.origem_ip_hash), destino: ponta(d.destino_ativo_id, d.destino_ip_hash),
        primeira_vez: x.primeira_vez, ultima_vez: x.ultima_vez, ocorrencias: x.ocorrencias, link: `${base}/ot/desvios/${x.id}` };
    }),
    nao_listados: Math.max(0, desvios.length - TETO_DESVIOS_POST),
  };
}

/** Um POST por site, montado e entregue dentro do waitUntil: a montagem ou a entrega nunca segura nem derruba quem chamou. */
export function avisar(env: Bindings, ctx: Ctx, projectId: string, desvios: (LinhaDesvio & { acao?: AcaoDesvio })[], acao: AcaoDesvio) {
  const sites = new Map<string, typeof desvios>();
  for (const d of desvios) sites.set(d.site_id, [...sites.get(d.site_id) ?? [], d]);
  for (const [siteId, lista] of sites) {
    ctx.waitUntil(corpoWebhook(env, projectId, siteId, lista, acao).then((c) => entregarEvento(env, projectId, 'ot.desvio', c))
      .catch((e) => console.error('ot.desvio', e)));
  }
}

const trilha = (env: Bindings, acao: string, ator: string, detalhe: string, projectId: string) =>
  logAudit(env.DB, acao, ator, detalhe, '', '', projectId).catch((e) => console.error('ot.desvio: falha na trilha', e));

/**
 * Upsert por (projeto, tipo, chave): novo → aberto; aberto ou aceito no prazo → só conta; tratado, regularizado (o item voltou a
 * aparecer, então saiu do inventário) ou aceito vencido → reabre. `dados` só é cifrado na criação (AAD com o id da linha).
 */
export async function detectarDesvios(env: Bindings, ctx: Ctx, a: { projectId: string; siteId: string; sensorId: string; plano: Plano; agora: Date }):
  Promise<{ abertos: number; reabertos: number; atualizados: number }> {
  const { projectId, siteId, sensorId, plano } = a;
  const db = env.DB;
  const agora = a.agora.toISOString();
  // plano.macs fica de fora (é ativo conhecido); plano.fluxos já exclui o inventário
  // pendência: os hashes das pontas internas (HMAC, não IP) ficam em `dados`, para achar a ponta que já está ou entrar no inventário
  const itens = [...plano.ativos.map((x) => ({ tipo: 'ativo' as const, ...x })), ...plano.fluxos.map((x) => ({ tipo: 'fluxo' as const, ...x })),
    ...plano.pendentes.map((x) => ({ tipo: 'fluxo' as const, chave: x.chave,
      dados: { ...x.dados, origem_ip_hash: x.origem_ip_hash, destino_ip_hash: x.destino_ip_hash } }))];
  const existentes = new Map<string, { id: string; situacao: string; vencido: number }>();
  for (let i = 0; i < itens.length; i += LOTE) {
    const { results } = await db.prepare(`SELECT id, tipo, chave_sensor, situacao, coalesce(datetime(aceito_ate) < datetime(?), 0) AS vencido FROM ot_desvios
      WHERE project_id = ? AND chave_sensor IN (SELECT value FROM json_each(?)) LIMIT ${TETO_LEITURA_OT}`)
      .bind(agora, projectId, JSON.stringify(itens.slice(i, i + LOTE).map((x) => x.chave)))
      .all<{ id: string; tipo: string; chave_sensor: string; situacao: string; vencido: number }>();
    for (const r of results) existentes.set(`${r.tipo}|${r.chave_sensor}`, r);
  }
  const chaves = chavesOt(env)!;
  const stmts: { s: D1PreparedStatement; acao?: AcaoDesvio }[] = [];
  const vistos = new Set<string>();
  for (const x of itens) {
    const k = `${x.tipo}|${x.chave}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const e = existentes.get(k);
    if (!e) {
      const id = genId();
      const { ip, mac, ...resto } = x.dados as Record<string, unknown> & { ip?: string; mac?: string };
      const dados = x.tipo === 'ativo' ? { ...resto, ...await cifrarEnderecos(chaves, projectId, 'ot_desvios', id, { ip, mac }) } : resto;
      stmts.push({ acao: 'aberto', s: db.prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez, sensor_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING *`).bind(id, projectId, siteId, x.tipo, x.chave, JSON.stringify(dados), agora, agora, sensorId) });
    } else if (e.situacao === 'aberto' || (e.situacao === 'aceito' && !e.vencido)) {
      stmts.push({ s: db.prepare(`UPDATE ot_desvios SET ultima_vez = ?, ocorrencias = ocorrencias + 1, sensor_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND situacao = ?`).bind(agora, sensorId, e.id, e.situacao) });
    } else {
      // a guarda na situação lida: mudança na tela entre a leitura e aqui não é sobrescrita
      // aceito vencido sai com a mesma ação do cron: uma situação, uma ação para o SOC
      stmts.push({ acao: e.situacao === 'aceito' ? 'aceite_vencido' : 'reaberto', s: db.prepare(`UPDATE ot_desvios SET situacao = 'aberto', aceito_ate = NULL, ultima_vez = ?, ocorrencias = ocorrencias + 1,
        sensor_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND situacao = ? RETURNING *`).bind(agora, sensorId, e.id, e.situacao) });
    }
  }
  const n = { abertos: 0, reabertos: 0, atualizados: 0 };
  const porAcao = { aberto: 0, reaberto: 0, aceite_vencido: 0, fechado: 0 };
  const avisos: (LinhaDesvio & { acao: AcaoDesvio })[] = [];
  for (let i = 0; i < stmts.length; i += BLOCO) {
    const parte = stmts.slice(i, i + BLOCO);
    const rs = await db.batch(parte.map((p) => p.s));
    rs.forEach((r, j) => {
      const acao = parte[j].acao;
      if (!acao) { n.atualizados += r.meta.changes; return; }
      for (const l of r.results as unknown as LinhaDesvio[]) avisos.push({ ...l, acao });
      n[acao === 'aberto' ? 'abertos' : 'reabertos'] += r.results.length;
      porAcao[acao] += r.results.length;
    });
  }
  // trilha antes do aviso: o estado já mudou, e o registro não pode depender da montagem do webhook
  const ator = `sensor:${sensorId}`;
  if (porAcao.aberto) await trilha(env, 'ot.desvio.aberto', ator, `${porAcao.aberto} desvio(s) aberto(s) no site ${siteId}`, projectId);
  if (porAcao.reaberto) await trilha(env, 'ot.desvio.reaberto', ator, `${porAcao.reaberto} desvio(s) reaberto(s) no site ${siteId}`, projectId);
  if (porAcao.aceite_vencido) {
    await trilha(env, 'ot.desvio.aceite_vencido', ator, `${porAcao.aceite_vencido} desvio(s) com aceite vencido reaberto(s) no site ${siteId}`, projectId);
  }
  if (avisos.length) avisar(env, ctx, projectId, avisos, 'aberto');
  return n;
}

/** O lote aprovado gravou o ativo ou o fluxo com essas chaves: o desvio deixa de ser desvio (regularizado). */
export async function fecharRegularizados(env: Bindings, ctx: Ctx, projectId: string, chaves: string[]): Promise<number> {
  if (!chaves.length) return 0;
  const { results } = await env.DB.prepare(`UPDATE ot_desvios SET situacao = 'regularizado', aceito_ate = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE project_id = ? AND situacao IN ('aberto', 'tratado', 'aceito') AND chave_sensor IN (SELECT value FROM json_each(?)) RETURNING *`)
    .bind(projectId, JSON.stringify(chaves)).all<LinhaDesvio>();
  if (!results.length) return 0;
  await trilha(env, 'ot.desvio.regularizado', 'sistema', `${results.length} desvio(s) regularizado(s) pelo lote aprovado`, projectId);
  avisar(env, ctx, projectId, results, 'fechado');
  return results.length;
}

/** Cron diário: aceite vencido volta a aberto, com aviso e trilha por projeto. */
export async function reabrirVencidos(env: Bindings, ctx: Ctx, agora: Date): Promise<number> {
  const { results } = await env.DB.prepare(`UPDATE ot_desvios SET situacao = 'aberto', aceito_ate = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE situacao = 'aceito' AND datetime(aceito_ate) < datetime(?) RETURNING *`).bind(agora.toISOString()).all<LinhaDesvio>();
  const projetos = new Map<string, LinhaDesvio[]>();
  for (const d of results) projetos.set(d.project_id, [...projetos.get(d.project_id) ?? [], d]);
  for (const [projectId, lista] of projetos) {
    try { // um projeto que falha não segura os outros
      await trilha(env, 'ot.desvio.aceite_vencido', 'sistema', `${lista.length} desvio(s) com aceite vencido reaberto(s)`, projectId);
      avisar(env, ctx, projectId, lista, 'aceite_vencido');
    } catch (e) { console.error('ot.desvio: falha ao avisar o aceite vencido', projectId, e); }
  }
  return results.length;
}
