import type { Bindings } from '../index';
import { enviarEmail, genId, genToken, logAudit, sha256Hex } from '../helpers';
import { appUrl } from '../config/url';
import { remetente } from './email-layout';
import { emailHomologacaoRespondida } from './emails';
import { log } from '../observability';
import { METODO_DO_TIPO, registrarAvaliacao, type Avaliacao, type TipoTerceiro } from './terceiros';
import { escolherDestinatarios, pessoasDoProjeto } from './avisos-prazo';

/**
 * F5: homologação de fornecedor por questionário. O questionário é do projeto (`homologacao_perguntas`); cada envio
 * (`homologacoes`) congela as perguntas ativas, guarda só o hash do token do link e recebe as respostas até o envio. A conclusão
 * é ato humano da consultoria e vira uma linha de `avaliacoes_terceiro` pelo `registrarAvaliacao` (a regra de validade fica lá).
 */

export const RESPOSTAS = ['sim', 'nao', 'parcial', 'na'] as const;
export type Resposta = { resposta: (typeof RESPOSTAS)[number]; justificativa?: string | null };
export type Respostas = Record<string, Resposta>;
type PerguntaCongelada = { id: string; tema: string; texto: string };

/**
 * Modelo padrão, genérico, A VALIDAR PELO CONSULTOR: não é texto jurídico nem modelo oficial. Semeado no projeto na primeira
 * leitura com id determinístico (hash do projeto e da posição); editar a pergunta a torna `origem = 'projeto'`.
 */
export const PERGUNTAS_PADRAO: ReadonlyArray<{ tema: string; texto: string }> = [
  { tema: 'Segurança da informação', texto: 'A empresa mantém uma política de segurança da informação aprovada pela direção e comunicada aos colaboradores?' },
  { tema: 'Segurança da informação', texto: 'O acesso aos dados do cliente é restrito por perfil, com segundo fator de autenticação nos acessos administrativos e remotos?' },
  { tema: 'Segurança da informação', texto: 'Os dados do cliente são criptografados em trânsito e em repouso?' },
  { tema: 'Certificações', texto: 'A empresa tem certificação ou relatório de auditoria independente vigente (por exemplo, ISO/IEC 27001, ISO/IEC 27701 ou SOC 2)? Indique qual na justificativa.' },
  { tema: 'Contrato e DPA', texto: 'A empresa aceita firmar acordo de tratamento de dados (DPA) com as obrigações de operador?' },
  { tema: 'Subprocessadores', texto: 'A empresa mantém lista atualizada de subprocessadores e avisa o cliente antes de incluir ou trocar um?' },
  { tema: 'Incidentes', texto: 'Existe processo documentado de resposta a incidentes, com comunicação ao cliente em prazo acordado?' },
  { tema: 'Incidentes', texto: 'Nos últimos 24 meses, todo incidente que envolveu dados pessoais foi comunicado aos clientes afetados?' },
  { tema: 'Transferência internacional', texto: 'Os dados do cliente são armazenados ou acessados fora do Brasil? Se sim, indique os países na justificativa.' },
  { tema: 'Retenção e eliminação', texto: 'Ao fim do contrato, a empresa devolve ou elimina os dados do cliente e fornece comprovação?' },
  { tema: 'Encarregado', texto: 'A empresa indicou encarregado ou contato responsável por proteção de dados? Indique o canal institucional na justificativa.' },
  { tema: 'Direitos dos titulares', texto: 'A empresa apoia o cliente no atendimento aos pedidos dos titulares dentro dos prazos?' },
];

type Falha = { ok: false; status: 400 | 404 | 409; error: string };
const falha = (status: Falha['status'], error: string): Falha => ({ ok: false, status, error });

/** Idempotente: só insere as perguntas padrão que o projeto ainda não tem (pergunta não se apaga, só desativa). */
export async function semearPerguntas(db: D1Database, projectId: string): Promise<void> {
  // id determinístico por projeto e posição, sem expor o id do projeto na página pública
  const ids = await Promise.all(PERGUNTAS_PADRAO.map(async (_p, i) => `hp-${(await sha256Hex(`${projectId}:homologacao:${i + 1}`)).slice(0, 24)}`));
  await db.batch(PERGUNTAS_PADRAO.map((p, i) => db.prepare(
    `INSERT OR IGNORE INTO homologacao_perguntas (id, project_id, tema, texto, ordem, origem) VALUES (?, ?, ?, ?, ?, 'padrao')`,
  ).bind(ids[i], projectId, p.tema, p.texto, (i + 1) * 10)));
}

export type Pergunta = PerguntaCongelada & { ordem: number; ativa: number; origem: 'padrao' | 'projeto' };

export async function listarPerguntas(db: D1Database, projectId: string): Promise<{ a_validar: boolean; perguntas: Pergunta[] }> {
  await semearPerguntas(db, projectId);
  const { results } = await db.prepare(`SELECT id, tema, texto, ordem, ativa, origem FROM homologacao_perguntas WHERE project_id = ? ORDER BY ordem, created_at, id`)
    .bind(projectId).all<Pergunta>();
  return { a_validar: results.some((p) => p.ativa && p.origem === 'padrao'), perguntas: results };
}

export async function criarPergunta(db: D1Database, projectId: string, ator: string, d: { tema: string; texto: string; ordem?: number }): Promise<{ id: string }> {
  const id = genId();
  const ordem = d.ordem ?? ((await db.prepare('SELECT COALESCE(MAX(ordem), 0) + 10 AS o FROM homologacao_perguntas WHERE project_id = ?').bind(projectId).first<number>('o')) ?? 10);
  await db.prepare(`INSERT INTO homologacao_perguntas (id, project_id, tema, texto, ordem) VALUES (?, ?, ?, ?, ?)`).bind(id, projectId, d.tema, d.texto, ordem).run();
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
  // texto ou tema editado deixa de ser o padrão: o consultor assumiu a pergunta
  if (d.tema !== undefined || d.texto !== undefined) sets.push(`origem = 'projeto'`);
  const r = await db.prepare(`UPDATE homologacao_perguntas SET ${[...sets, 'updated_at = CURRENT_TIMESTAMP'].join(', ')} WHERE id = ? AND project_id = ?`)
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

const ehQuestionario = (tipo: TipoTerceiro | null) => !!tipo && METODO_DO_TIPO[tipo] === 'questionario';

export async function criarHomologacao(db: D1Database, projectId: string, ator: string, d: { parte_id: string; dias: number }):
  Promise<Falha | { ok: true; id: string; token: string; expira_em: string; parte_nome: string }> {
  const parte = await db.prepare(`SELECT id, tipo, terceiro_tipo, nome FROM partes WHERE id = ? AND project_id = ?`).bind(d.parte_id, projectId)
    .first<{ id: string; tipo: string; terceiro_tipo: TipoTerceiro | null; nome: string }>();
  if (!parte) return falha(404, 'Terceiro não encontrado');
  if (parte.tipo !== 'organizacao' || !ehQuestionario(parte.terceiro_tipo)) return falha(400, 'Este terceiro não é avaliado por questionário: defina o tipo como médio ou pequeno');
  const { perguntas } = await listarPerguntas(db, projectId);
  const ativas: PerguntaCongelada[] = perguntas.filter((p) => p.ativa).map(({ id, tema, texto }) => ({ id, tema, texto }));
  if (!ativas.length) return falha(400, 'O questionário do projeto não tem pergunta ativa');
  const token = genToken();
  const id = genId();
  const cliente = (await db.prepare('SELECT client_name FROM projects WHERE id = ?').bind(projectId).first<string>('client_name')) ?? '';
  const row = await db.prepare(`INSERT INTO homologacoes (id, project_id, parte_id, token_hash, expira_em, perguntas_json, criado_por)
     VALUES (?, ?, ?, ?, datetime('now', ?), ?, ?) RETURNING expira_em`)
    .bind(id, projectId, parte.id, await sha256Hex(token), `+${d.dias} days`, JSON.stringify({ perguntas: ativas, fornecedor: parte.nome, cliente }), ator).first<{ expira_em: string }>();
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
  d: { resultado: Avaliacao['resultado']; valido_ate: string; observacao?: string | null }): Promise<Falha | { ok: true; avaliacao_id: string }> {
  const h = await lerHomologacao(db, projectId, id);
  if (!h) return falha(404, 'Homologação não encontrada');
  if (h.status !== 'respondida') return falha(409, 'Só homologação respondida pelo fornecedor pode ser concluída');
  const tipo = await db.prepare('SELECT terceiro_tipo FROM partes WHERE id = ? AND project_id = ?').bind(h.parte_id, projectId).first<TipoTerceiro | null>('terceiro_tipo');
  if (!ehQuestionario(tipo ?? null)) return falha(409, 'O tipo do terceiro mudou e ele não é mais avaliado por questionário');
  const reserva = await db.prepare(`UPDATE homologacoes SET status = 'concluida', resultado = ?, concluida_por = ?, concluida_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND project_id = ? AND status = 'respondida'`).bind(d.resultado, ator, id, projectId).run();
  if (!reserva.meta.changes) return falha(409, 'Só homologação respondida pelo fornecedor pode ser concluída');
  const observacao = `Homologação por questionário (${h.percentual}% respondido)${d.observacao ? `: ${d.observacao}` : ''}`.slice(0, 2000);
  const r = await registrarAvaliacao(db, projectId, h.parte_id, ator, { resultado: d.resultado, valido_ate: d.valido_ate, observacao });
  if (!r.ok) {
    await db.prepare(`UPDATE homologacoes SET status = 'respondida', resultado = NULL, concluida_por = NULL, concluida_em = NULL WHERE id = ? AND project_id = ?`).bind(id, projectId).run();
    return r;
  }
  await db.prepare('UPDATE homologacoes SET avaliacao_id = ? WHERE id = ? AND project_id = ?').bind(r.id, id, projectId).run();
  await logAudit(db, 'homologacao.concluida', ator, `Homologação ${id} concluída (${d.resultado}), avaliação ${r.id}`, '', '', projectId);
  return { ok: true, avaliacao_id: r.id };
}

// ─── Lado do fornecedor (rotas públicas) ────────────────────────────────────────────────────────────────────────────

type Aberta = { id: string; project_id: string; parte_id: string; perguntas_json: string; respostas_json: string; expira_em: string };

/** Só homologação ABERTA e no prazo: inexistente, vencida, enviada ou cancelada dão o mesmo null (sem oráculo). */
export async function homologacaoDoToken(db: D1Database, token: string): Promise<Aberta | null> {
  return db.prepare(`SELECT id, project_id, parte_id, perguntas_json, respostas_json, expira_em FROM homologacoes
     WHERE token_hash = ? AND status = 'aberta' AND datetime(expira_em) > datetime('now')`).bind(await sha256Hex(token)).first<Aberta>();
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
