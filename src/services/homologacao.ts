import type { Bindings } from '../index';
import { enviarEmail, genId, genToken, logAudit, sha256Hex } from '../helpers';
import { appUrl } from '../config/url';
import { remetente } from './email-layout';
import { emailHomologacaoRespondida } from './emails';
import { log } from '../observability';
import { PODE_QUESTIONARIO, registrarAvaliacao, type Avaliacao, type TipoTerceiro } from './terceiros';
import { escolherDestinatarios, pessoasDoProjeto } from './avisos-prazo';
import { modulosDaPessoa, recusaDaPessoa } from '../modulos';
import { emailLembreteHomologacao } from './emails';
import { perguntasDoEnvio, perguntasDoProjeto, type TipoModelo, type TipoQuestionario } from './fornecedor-modelos';

/**
 * F5: homologação de fornecedor por questionário. O questionário é do projeto (`homologacao_perguntas`); cada envio
 * (`homologacoes`) congela as perguntas ativas, guarda só o hash do token do link e recebe as respostas até o envio. A conclusão
 * é ato humano da consultoria e vira uma linha de `avaliacoes_terceiro` pelo `registrarAvaliacao` (a regra de validade fica lá).
 */

export const RESPOSTAS = ['sim', 'nao', 'parcial', 'na'] as const;
export type Resposta = { resposta: (typeof RESPOSTAS)[number]; justificativa?: string | null };
export type Respostas = Record<string, Resposta>;
type PerguntaCongelada = { id: string; tema: string; texto: string };

// O conteúdo padrão mora nos modelos da consultoria (migration 0106); reexportado para quem já o importava daqui.
export { PERGUNTAS_PADRAO } from './fornecedor-modelos';

type Falha = { ok: false; status: 400 | 404 | 409; error: string };
const falha = (status: Falha['status'], error: string): Falha => ({ ok: false, status, error });

export type Pergunta = PerguntaCongelada & { ordem: number; ativa: number; origem: 'padrao' | 'projeto' };

/** O questionário do projeto para um tipo: o modelo vivo da consultoria, com os ajustes e as perguntas próprias (`perguntasDoProjeto`). */
export const listarPerguntas = (db: D1Database, projectId: string, tipo: TipoModelo) => perguntasDoProjeto(db, projectId, tipo);

/** Pergunta PRÓPRIA do projeto: `tipo` nulo vale para todos os tipos que recebem questionário. */
export async function criarPergunta(db: D1Database, projectId: string, ator: string, d: { tema: string; texto: string; ordem?: number; tipo?: TipoQuestionario | null }): Promise<{ id: string }> {
  const id = genId();
  const ordem = d.ordem ?? ((await db.prepare(`SELECT COALESCE(MAX(ordem), 0) + 10 AS o FROM homologacao_perguntas WHERE project_id = ? AND origem = 'projeto'`).bind(projectId).first<number>('o')) ?? 10);
  await db.prepare(`INSERT INTO homologacao_perguntas (id, project_id, tema, texto, ordem, tipo) VALUES (?, ?, ?, ?, ?, ?)`).bind(id, projectId, d.tema, d.texto, ordem, d.tipo ?? null).run();
  await logAudit(db, 'homologacao.perguntas', ator, `Pergunta ${id} criada no questionário de homologação`, '', '', projectId);
  return { id };
}

export async function atualizarPergunta(db: D1Database, projectId: string, perguntaId: string, ator: string,
  d: { tema?: string; texto?: string; ordem?: number; ativa?: boolean }): Promise<boolean> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (d.tema !== undefined) { sets.push('tema = ?'); vals.push(d.tema); }
  if (d.texto !== undefined) { sets.push('texto = ?'); vals.push(d.texto); }
  if (d.ordem !== undefined) { sets.push('ordem = ?'); vals.push(d.ordem); }
  if (d.ativa !== undefined) { sets.push('ativa = ?'); vals.push(d.ativa ? 1 : 0); }
  // só a pergunta própria do projeto; a do modelo se liga e desliga pelo ajuste (`ajustarPerguntaDoModelo`)
  const r = await db.prepare(`UPDATE homologacao_perguntas SET ${[...sets, 'updated_at = CURRENT_TIMESTAMP'].join(', ')} WHERE id = ? AND project_id = ? AND origem = 'projeto'`)
    .bind(...vals, perguntaId, projectId).run();
  if (!r.meta.changes) return false;
  await logAudit(db, 'homologacao.perguntas', ator, `Pergunta ${perguntaId} alterada (${Object.keys(d).join(', ')})`, '', '', projectId);
  return true;
}

/** % respondido: perguntas congeladas com resposta válida sobre o total. */
export function percentual(perguntas: { id: string }[], respostas: Respostas): { respondidas: number; total: number; percentual: number } {
  const total = perguntas.length;
  const validas: readonly string[] = RESPOSTAS;
  const respondidas = perguntas.filter((p) => validas.includes(respostas[p.id]?.resposta as string)).length;
  return { respondidas, total, percentual: total ? Math.round((respondidas / total) * 100) : 0 };
}

type Linha = {
  id: string; project_id: string; parte_id: string; parte_nome: string; expira_em: string; expirada: number; status: string;
  perguntas_json: string; respostas_json: string; enviada_em: string | null; resultado: string | null; avaliacao_id: string | null;
  concluida_por: string | null; concluida_em: string | null; criado_por: string | null; created_at: string;
};
const COLS = `h.id, h.project_id, h.parte_id, pa.nome AS parte_nome, h.expira_em, (datetime(h.expira_em) <= datetime('now')) AS expirada, h.status,
  h.perguntas_json, h.respostas_json, h.enviada_em, h.resultado, h.avaliacao_id, h.concluida_por, h.concluida_em, h.criado_por, h.created_at`;

const lerJson = <T>(s: string, padrao: T): T => { try { return JSON.parse(s) as T; } catch { return padrao; } };

/** `perguntas_json` é objeto `{ perguntas, fornecedor, cliente }` (nomes congelados na criação); homologação antiga é só o array. */
export function lerCongelado(s: string) {
  type C = { perguntas: PerguntaCongelada[]; fornecedor: string | null; cliente: string | null };
  const v = lerJson<PerguntaCongelada[] | Partial<C>>(s, []);
  if (Array.isArray(v)) return { perguntas: v, fornecedor: null, cliente: null } as C;
  // JSON válido que não é objeto (null, número, texto) vira questionário vazio, com o nome ao vivo.
  if (!v || typeof v !== 'object') return { perguntas: [], fornecedor: null, cliente: null } as C;
  return { perguntas: Array.isArray(v.perguntas) ? v.perguntas : [], fornecedor: v.fornecedor ?? null, cliente: v.cliente ?? null } as C;
}

function resumo(h: Linha) {
  const perguntas = lerCongelado(h.perguntas_json).perguntas;
  const respostas = lerJson<Respostas>(h.respostas_json, {});
  const { perguntas_json: _p, respostas_json: _r, expirada, ...resto } = h;
  return { ...resto, expirada: !!expirada && h.status === 'aberta', ...percentual(perguntas, respostas), _perguntas: perguntas, _respostas: respostas };
}

export async function listarHomologacoes(db: D1Database, projectId: string, parteId?: string) {
  const { results } = await db.prepare(`SELECT ${COLS} FROM homologacoes h JOIN partes pa ON pa.id = h.parte_id
     WHERE h.project_id = ?1 AND (?2 IS NULL OR h.parte_id = ?2) ORDER BY h.created_at DESC, h.rowid DESC`).bind(projectId, parteId ?? null).all<Linha>();
  return results.map((h) => { const { _perguntas, _respostas, ...r } = resumo(h); return r; });
}

/** A homologação com cada pergunta congelada e a resposta ao lado. null = não é do projeto. */
export async function lerHomologacao(db: D1Database, projectId: string, id: string) {
  const h = await db.prepare(`SELECT ${COLS} FROM homologacoes h JOIN partes pa ON pa.id = h.parte_id WHERE h.id = ? AND h.project_id = ?`).bind(id, projectId).first<Linha>();
  if (!h) return null;
  const { _perguntas, _respostas, ...r } = resumo(h);
  return { ...r, perguntas: _perguntas.map((p) => ({ ...p, resposta: _respostas[p.id]?.resposta ?? null, justificativa: _respostas[p.id]?.justificativa ?? null })) };
}

const ehQuestionario = (tipo: TipoTerceiro | null) => !!tipo && PODE_QUESTIONARIO.has(tipo);

/** `email`: o do fornecedor, gravado só enquanto a homologação está aberta (o gatilho `homologacao_email_some` o apaga), para o lembrete. */
export async function criarHomologacao(db: D1Database, projectId: string, ator: string, d: { parte_id: string; dias: number; email?: string | null }):
  Promise<Falha | { ok: true; id: string; token: string; expira_em: string; parte_nome: string }> {
  const parte = await db.prepare(`SELECT id, tipo, terceiro_tipo, nome, status FROM partes WHERE id = ? AND project_id = ?`).bind(d.parte_id, projectId)
    .first<{ id: string; tipo: string; terceiro_tipo: TipoTerceiro | null; nome: string; status: string }>();
  if (!parte) return falha(404, 'Terceiro não encontrado');
  if (parte.status !== 'ativa') return falha(409, 'Fornecedor inativo não recebe questionário: reative a organização antes');
  if (parte.tipo !== 'organizacao' || !ehQuestionario(parte.terceiro_tipo)) return falha(400, 'Este terceiro não recebe questionário: defina o tipo como médio, pequeno ou crítico');
  const tipo = parte.terceiro_tipo as TipoQuestionario; // ehQuestionario garantiu crítico, médio ou pequeno
  const ativas: PerguntaCongelada[] = await perguntasDoEnvio(db, projectId, tipo);
  if (!ativas.length) return falha(400, 'O questionário deste tipo não tem pergunta ativa');
  const token = genToken();
  const id = genId();
  const cliente = (await db.prepare('SELECT client_name FROM projects WHERE id = ?').bind(projectId).first<string>('client_name')) ?? '';
  const row = await db.prepare(`INSERT INTO homologacoes (id, project_id, parte_id, token_hash, expira_em, perguntas_json, criado_por, tipo, email_destino)
     VALUES (?, ?, ?, ?, datetime('now', ?), ?, ?, ?, ?) RETURNING expira_em`)
    .bind(id, projectId, parte.id, await sha256Hex(token), `+${d.dias} days`, JSON.stringify({ perguntas: ativas, fornecedor: parte.nome, cliente }), ator, tipo, d.email ?? null)
    .first<{ expira_em: string }>();
  await logAudit(db, 'homologacao.criada', ator, `Homologação ${id} do terceiro ${parte.id}: ${ativas.length} perguntas, link válido por ${d.dias} dias`, '', '', projectId);
  return { ok: true, id, token, expira_em: row!.expira_em, parte_nome: parte.nome };
}

export async function cancelarHomologacao(db: D1Database, projectId: string, id: string, ator: string): Promise<Falha | { ok: true }> {
  const r = await db.prepare(`UPDATE homologacoes SET status = 'cancelada', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ? AND status IN ('aberta', 'respondida')`)
    .bind(id, projectId).run();
  if (r.meta.changes) {
    await logAudit(db, 'homologacao.cancelada', ator, `Homologação ${id} cancelada`, '', '', projectId);
    return { ok: true };
  }
  const existe = await db.prepare('SELECT 1 FROM homologacoes WHERE id = ? AND project_id = ?').bind(id, projectId).first();
  return existe ? falha(409, 'Só homologação aberta ou respondida pode ser cancelada') : falha(404, 'Homologação não encontrada');
}

/**
 * Ato humano. Só `respondida`: o UPDATE condicional reserva a homologação (duas conclusões ao mesmo tempo não geram duas
 * avaliações); se `registrarAvaliacao` recusar (data, tipo), o status volta a `respondida`.
 */
export async function concluirHomologacao(db: D1Database, projectId: string, id: string, ator: string,
  d: { resultado: Avaliacao['resultado']; valido_ate: string; evidencia_url?: string | null; observacao?: string | null }): Promise<Falha | { ok: true; avaliacao_id: string }> {
  const h = await lerHomologacao(db, projectId, id);
  if (!h) return falha(404, 'Homologação não encontrada');
  if (h.status !== 'respondida') return falha(409, 'Só homologação respondida pelo fornecedor pode ser concluída');
  const tipos = await db.prepare('SELECT p.terceiro_tipo, x.tipo FROM homologacoes x JOIN partes p ON p.id = x.parte_id WHERE x.id = ? AND x.project_id = ?')
    .bind(id, projectId).first<{ terceiro_tipo: TipoTerceiro | null; tipo: TipoTerceiro | null }>();
  const tipo = tipos?.terceiro_tipo ?? null;
  if (!ehQuestionario(tipo)) return falha(409, 'O tipo do terceiro mudou e ele não é mais avaliado por questionário');
  const reserva = await db.prepare(`UPDATE homologacoes SET status = 'concluida', resultado = ?, concluida_por = ?, concluida_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND project_id = ? AND status = 'respondida'`).bind(d.resultado, ator, id, projectId).run();
  if (!reserva.meta.changes) return falha(409, 'Só homologação respondida pelo fornecedor pode ser concluída');
  const observacao = `Homologação por questionário (${h.percentual}% respondido)${d.observacao ? `: ${d.observacao}` : ''}`.slice(0, 2000);
  // O método é sempre `questionario` (o servidor decide): no crítico isso difere do método formal do tipo (auditoria).
  const r = await registrarAvaliacao(db, projectId, h.parte_id, ator, { resultado: d.resultado, valido_ate: d.valido_ate, evidencia_url: d.evidencia_url, observacao }, 'questionario',
    tipos?.tipo ?? tipo); // o tipo do ENVIO: as respostas são do modelo daquele tipo
  if (!r.ok) {
    await db.prepare(`UPDATE homologacoes SET status = 'respondida', resultado = NULL, concluida_por = NULL, concluida_em = NULL WHERE id = ? AND project_id = ?`).bind(id, projectId).run();
    return r;
  }
  await db.prepare('UPDATE homologacoes SET avaliacao_id = ? WHERE id = ? AND project_id = ?').bind(r.id, id, projectId).run();
  await logAudit(db, 'homologacao.concluida', ator, `Homologação ${id} concluída (${d.resultado}), avaliação ${r.id}`, '', '', projectId);
  return { ok: true, avaliacao_id: r.id };
}

/**
 * Fatia 4 (ciclo do link). Prorrogar: só `aberta`, inclusive já vencida sem resposta; o prazo conta de agora e o lembrete volta a
 * poder sair (o prazo novo é outro). O token não muda (o gatilho `homologacao_imutavel` o protege).
 */
export async function prorrogarHomologacao(db: D1Database, projectId: string, id: string, dias: number, ator: string): Promise<Falha | { ok: true; expira_em: string }> {
  const row = await db.prepare(`UPDATE homologacoes SET expira_em = datetime('now', ?), lembrete_em = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND project_id = ? AND status = 'aberta' RETURNING expira_em`).bind(`+${dias} days`, id, projectId).first<{ expira_em: string }>();
  if (!row) {
    const existe = await db.prepare('SELECT 1 FROM homologacoes WHERE id = ? AND project_id = ?').bind(id, projectId).first();
    return existe ? falha(409, 'Só o questionário ainda sem resposta pode ser prorrogado') : falha(404, 'Homologação não encontrada');
  }
  await logAudit(db, 'homologacao.prorrogada', ator, `Homologação ${id}: link prorrogado por ${dias} dias`, '', '', projectId);
  return { ok: true, expira_em: row.expira_em };
}

/**
 * Novo link: cria outra homologação para o mesmo fornecedor, com as perguntas ATUAIS do modelo (as respostas parciais não passam:
 * as perguntas podem ter mudado), e só então cancela a aberta. Se a antiga deixou de estar aberta no meio (o fornecedor enviou),
 * a nova é cancelada e a resposta é 409: nada se perde.
 */
export async function novoLinkHomologacao(db: D1Database, projectId: string, id: string, ator: string, d: { dias: number; email?: string | null }):
  ReturnType<typeof criarHomologacao> {
  const antiga = await db.prepare('SELECT parte_id, status FROM homologacoes WHERE id = ? AND project_id = ?').bind(id, projectId).first<{ parte_id: string; status: string }>();
  if (!antiga) return falha(404, 'Homologação não encontrada');
  if (antiga.status !== 'aberta') return falha(409, 'Só o questionário ainda sem resposta ganha link novo');
  const r = await criarHomologacao(db, projectId, ator, { parte_id: antiga.parte_id, dias: d.dias, email: d.email });
  if (!r.ok) return r;
  const c = await db.prepare(`UPDATE homologacoes SET status = 'cancelada', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ? AND status = 'aberta'`).bind(id, projectId).run();
  if (!c.meta.changes) {
    await db.prepare(`UPDATE homologacoes SET status = 'cancelada', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'aberta'`).bind(r.id).run();
    return falha(409, 'O fornecedor enviou o questionário enquanto o link novo era criado: revise o enviado');
  }
  await logAudit(db, 'homologacao.novo_link', ator, `Homologação ${id} substituída por ${r.id}`, '', '', projectId);
  return r;
}

type AvisoDoLink = { id: string; project_id: string; parte_nome: string; marca: string };
const MARCAS: { tipo: string; titulo: string; texto: (n: string) => string; sql: string }[] = [
  { tipo: 'homologacao_vence', titulo: 'Questionário vence em 3 dias', texto: (n) => `O link do questionário de ${n} vence em até 3 dias sem resposta.`,
    sql: `h.status = 'aberta' AND datetime(h.expira_em) > datetime('now') AND datetime(h.expira_em) <= datetime('now', '+3 days')` },
  // janela de 7 dias: pega o dia que a rotina não rodou, sem avisar de novo o que venceu há muito (o NOT EXISTS segura o repetido)
  { tipo: 'homologacao_vencida', titulo: 'Questionário vencido sem resposta', texto: (n) => `O link do questionário de ${n} venceu sem resposta. Prorrogue ou gere um link novo.`,
    sql: `h.status = 'aberta' AND datetime(h.expira_em) <= datetime('now') AND datetime(h.expira_em) > datetime('now', '-7 days')` },
  { tipo: 'homologacao_parada', titulo: 'Questionário respondido aguardando conclusão', texto: (n) => `${n} respondeu o questionário há 2 dias ou mais. Revise e conclua.`,
    sql: `h.status = 'respondida' AND datetime(h.enviada_em) <= datetime('now', '-2 days')` },
];

/**
 * Rotina das 08:00 (junto dos avisos de prazo, `src/index.ts`). Sino da equipe (faixa privacy; os consultores designados ou os
 * consultoria_admin, a regra de `escolherDestinatarios`) para o link que vence em 3 dias, o vencido sem resposta e o respondido
 * parado; uma vez por homologação, marca e vencimento (prorrogar rearma). E UM lembrete por e-mail ao fornecedor, só com
 * `email_destino` e com o envio configurado de verdade (sem a chave, marcar enviado seria mentir). O e-mail não leva o link:
 * o banco só tem o hash do token. Falha de item vai a `falhas` e o resto segue.
 */
export async function avisosDeHomologacao(env: Pick<Bindings, 'DB' | 'RESEND_API_KEY' | 'APP_URL'>): Promise<{ avisos: number; lembretes: number; falhas: string[] }> {
  const db = env.DB;
  const r = { avisos: 0, lembretes: 0, falhas: [] as string[] };
  const pessoas = new Map<string, Awaited<ReturnType<typeof pessoasDoProjeto>>>();
  const destinosDe = async (projectId: string) => {
    if (!pessoas.has(projectId)) {
      const todas = await pessoasDoProjeto(db, projectId);
      const comModulo = [];
      for (const p of todas) if (!recusaDaPessoa('privacy', await modulosDaPessoa(db, p))) comModulo.push(p);
      pessoas.set(projectId, escolherDestinatarios(comModulo, null));
    }
    return pessoas.get(projectId)!;
  };
  for (const m of MARCAS) {
    try {
      const { results } = await db.prepare(`SELECT h.id, h.project_id, pa.nome AS parte_nome, h.id || ':' || COALESCE(date(h.expira_em), '') AS marca
         FROM homologacoes h JOIN partes pa ON pa.id = h.parte_id AND pa.project_id = h.project_id WHERE pa.status = 'ativa' AND ${m.sql}`).all<AvisoDoLink>();
      for (const h of results) {
        try {
          const destinos = await destinosDe(h.project_id);
          if (!destinos.length) continue;
          const alvo = m.tipo === 'homologacao_parada' ? h.id : h.marca;
          const res = await db.batch(destinos.map((p) => db.prepare(`INSERT INTO notifications (id, user_id, type, title, message, read, link, target_id, created_at)
              SELECT ?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, datetime('now')
               WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE type = ?3 AND target_id = ?7 AND user_id = ?2)`)
            .bind(genId(), p.id, m.tipo, m.titulo, m.texto(h.parte_nome), `/projects/${h.project_id}/terceiros`, alvo)));
          r.avisos += res.reduce((n, x) => n + (x.meta.changes ?? 0), 0);
        } catch (e) { r.falhas.push(`${m.tipo} ${h.id}: ${e instanceof Error ? e.message : String(e)}`); }
      }
    } catch (e) { r.falhas.push(`${m.tipo}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (env.RESEND_API_KEY) await lembretes(env, r);
  if (r.falhas.length) log('error', { msg: 'homologacao_avisos', ...r });
  return r;
}

async function lembretes(env: Pick<Bindings, 'DB' | 'RESEND_API_KEY' | 'APP_URL'>, r: { lembretes: number; falhas: string[] }) {
  const db = env.DB;
  const { results } = await db.prepare(`SELECT h.id, h.project_id, h.email_destino, h.created_at, h.expira_em, h.criado_por, h.perguntas_json, pa.nome AS parte_nome
     FROM homologacoes h JOIN partes pa ON pa.id = h.parte_id AND pa.project_id = h.project_id
     WHERE h.status = 'aberta' AND h.enviada_em IS NULL AND h.lembrete_em IS NULL AND h.email_destino IS NOT NULL AND pa.status = 'ativa'
       AND datetime(h.expira_em) > datetime('now') AND datetime(h.expira_em) <= datetime('now', '+3 days')`)
    .all<{ id: string; project_id: string; email_destino: string; created_at: string; expira_em: string; criado_por: string | null; perguntas_json: string; parte_nome: string }>();
  for (const h of results) {
    try {
      // reserva antes de enviar: duas rotinas ao mesmo tempo não mandam dois lembretes
      const reserva = await db.prepare(`UPDATE homologacoes SET lembrete_em = CURRENT_TIMESTAMP WHERE id = ? AND lembrete_em IS NULL AND status = 'aberta'`).bind(h.id).run();
      if (!reserva.meta.changes) continue;
      const congelado = lerCongelado(h.perguntas_json);
      const cliente = congelado.cliente ?? (await db.prepare('SELECT client_name FROM projects WHERE id = ?').bind(h.project_id).first<string>('client_name')) ?? '';
      const quem = h.criado_por ? await db.prepare(`SELECT u.name AS nome, u.email, o.name AS organizacao FROM users u LEFT JOIN organizations o ON o.id = u.org_id
         WHERE lower(u.email) = lower(?)`).bind(h.criado_por).first<{ nome: string | null; email: string; organizacao: string | null }>() : null;
      const m = emailLembreteHomologacao({ cliente, fornecedor: congelado.fornecedor ?? h.parte_nome, enviadoEm: h.created_at, expiraEm: h.expira_em, quem });
      const ok = await enviarEmail(env, h.email_destino, m.assunto, m, { from: remetente('n.privacy', cliente), ...(quem ? { replyTo: quem.email } : {}) });
      if (ok) r.lembretes++;
      else {
        await db.prepare('UPDATE homologacoes SET lembrete_em = NULL WHERE id = ?').bind(h.id).run();
        r.falhas.push(`lembrete ${h.id}: envio recusado`);
      }
    } catch (e) { r.falhas.push(`lembrete ${h.id}: ${e instanceof Error ? e.message : String(e)}`); }
  }
}

// ─── Lado do fornecedor (rotas públicas) ────────────────────────────────────────────────────────────────────────────

type Aberta = { id: string; project_id: string; parte_id: string; perguntas_json: string; respostas_json: string; expira_em: string };

/** Só homologação ABERTA, no prazo e de fornecedor ATIVO: inexistente, vencida, enviada, cancelada ou de organização inativa dão o mesmo null (sem oráculo). */
export async function homologacaoDoToken(db: D1Database, token: string): Promise<Aberta | null> {
  return db.prepare(`SELECT h.id, h.project_id, h.parte_id, h.perguntas_json, h.respostas_json, h.expira_em FROM homologacoes h JOIN partes p ON p.id = h.parte_id
     WHERE h.token_hash = ? AND h.status = 'aberta' AND datetime(h.expira_em) > datetime('now') AND p.status = 'ativa'`).bind(await sha256Hex(token)).first<Aberta>();
}

/** O que a página do fornecedor vê: o cliente, o próprio nome, as perguntas congeladas e as próprias respostas. */
export async function visaoDoFornecedor(db: D1Database, h: Aberta) {
  const { perguntas, fornecedor, cliente } = lerCongelado(h.perguntas_json);
  // Antiga sem nomes congelados: valor ao vivo (compatível). Nova: nunca ao vivo, senão renomear a parte vaza dado ao link público.
  const [projeto, parte] = cliente !== null && fornecedor !== null ? [cliente, fornecedor] : await Promise.all([
    db.prepare('SELECT client_name FROM projects WHERE id = ?').bind(h.project_id).first<string>('client_name'),
    db.prepare('SELECT nome FROM partes WHERE id = ? AND project_id = ?').bind(h.parte_id, h.project_id).first<string>('nome'),
  ]);
  const respostas = lerJson<Respostas>(h.respostas_json, {});
  return { cliente: projeto ?? '', fornecedor: parte ?? '', expira_em: h.expira_em, perguntas, respostas, ...percentual(perguntas, respostas) };
}

/**
 * Mescla as respostas do corpo nas gravadas. Pergunta que não é deste envio: 400. `enviar` fecha (status `respondida`) no mesmo
 * UPDATE condicional; null = o link deixou de valer no meio (o mesmo 404 da rota).
 */
export async function gravarRespostas(db: D1Database, h: Aberta, novas: Respostas, enviar: boolean):
  Promise<Falha | null | { ok: true; respondidas: number; total: number; percentual: number }> {
  const perguntas = lerCongelado(h.perguntas_json).perguntas;
  const validas = new Set(perguntas.map((p) => p.id));
  if (Object.keys(novas).some((k) => !validas.has(k))) return falha(400, 'Resposta para pergunta que não está neste questionário');
  // ponytail: ler-mesclar-gravar sem trava; um fornecedor responde de cada vez. Se houver edição simultânea, guardar versão.
  const respostas = { ...lerJson<Respostas>(h.respostas_json, {}), ...novas };
  const r = await db.prepare(`UPDATE homologacoes SET respostas_json = ?, updated_at = CURRENT_TIMESTAMP
       ${enviar ? `, status = 'respondida', enviada_em = CURRENT_TIMESTAMP` : ''}
     WHERE id = ? AND status = 'aberta' AND datetime(expira_em) > datetime('now')`).bind(JSON.stringify(respostas), h.id).run();
  if (!r.meta.changes) return null;
  const p = percentual(perguntas, respostas);
  // rascunho não vai à trilha (seria uma linha por clique); o envio vai, só com a contagem
  if (enviar) await logAudit(db, 'homologacao.enviada', `fornecedor:${h.id}`, `Homologação ${h.id} enviada: ${p.respondidas} de ${p.total} respondidas`, '', '', h.project_id);
  return { ok: true, ...p };
}

/**
 * Sino e e-mail da equipe quando o fornecedor envia: os consultores designados (sem nenhum, os consultoria_admin da organização),
 * pela regra dos avisos de prazo. Só o nome da parte e o percentual respondido, nunca resposta nem token. Chamada só depois do
 * UPDATE condicional que fechou o envio, então reenvio da página (404) não avisa de novo; o NOT EXISTS segura a mesma pessoa duas
 * vezes no mesmo envio, e o e-mail só vai a quem o sino acabou de avisar. E-mail que falha vai ao log e não derruba nada.
 */
export async function avisarEnvio(env: Pick<Bindings, 'DB' | 'RESEND_API_KEY' | 'APP_URL'>, h: Aberta, p: { respondidas: number; total: number; percentual: number }): Promise<number> {
  const db = env.DB;
  const [parte, cliente] = await Promise.all([
    db.prepare('SELECT nome FROM partes WHERE id = ? AND project_id = ?').bind(h.parte_id, h.project_id).first<string>('nome'),
    db.prepare('SELECT client_name FROM projects WHERE id = ?').bind(h.project_id).first<string>('client_name'),
  ]);
  const destinos = escolherDestinatarios(await pessoasDoProjeto(db, h.project_id), null);
  if (!destinos.length) return 0;
  const r = await db.batch(destinos.map((p) => db.prepare(`INSERT INTO notifications (id, user_id, type, title, message, read, link, target_id, created_at)
      SELECT ?1, ?2, 'homologacao_enviada', 'Homologação respondida', ?3, 0, ?4, ?5, datetime('now')
       WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE type = 'homologacao_enviada' AND target_id = ?5 AND user_id = ?2)`)
    .bind(genId(), p.id, `${parte ?? 'O fornecedor'} enviou o questionário de homologação. Revise e conclua.`, `/projects/${h.project_id}/terceiros`, h.id)));
  const novos = destinos.filter((_, i) => r[i]?.meta.changes);
  let falhas = 0;
  for (const d of novos) {
    try {
      const m = emailHomologacaoRespondida({ nome: d.name ?? null, fornecedor: parte ?? 'O fornecedor', cliente: cliente ?? '', ...p, link: `${appUrl(env)}/privacy?tela=terceiros` });
      if (!(await enviarEmail(env, d.email, m.assunto, m, { from: remetente('n.privacy') }))) falhas++;
    } catch { falhas++; }
  }
  if (falhas) log('error', { msg: 'homologacao_email_falhou', homologacao_id: h.id, projeto: h.project_id, falhas });
  return novos.length;
}
