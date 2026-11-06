import { logAudit, genToken, sha256Hex } from '../helpers';
import { prazoDe, proximoProtocolo } from './parametros-legais';
import { hojeEmSaoPaulo } from './hoje';

/**
 * Núcleo do n.privacy, fatia 7: pedido do titular (registro interno). Protocolo `PT-AAAA-NNNN` por projeto; o prazo vem do parâmetro
 * `titular.resposta` e é CONGELADO no registro (sem parâmetro fica nulo: "não calculado"). Respondido/negado é final: só arquiva.
 */

export const TIPOS_PEDIDO = ['confirmacao', 'acesso', 'correcao', 'anonimizacao_bloqueio_eliminacao', 'portabilidade', 'informacao_compartilhamento', 'revogacao_consentimento', 'oposicao', 'outro'] as const;
export const CANAIS_PEDIDO = ['email', 'telefone', 'formulario', 'presencial', 'outro'] as const;
export const STATUS_PEDIDO = ['recebido', 'em_andamento', 'respondido', 'negado', 'arquivado'] as const;
type TipoPedido = (typeof TIPOS_PEDIDO)[number];
type CanalPedido = (typeof CANAIS_PEDIDO)[number];
type StatusPedido = (typeof STATUS_PEDIDO)[number];
type Falha = { ok: false; status: 400 | 404 | 409; error: string };
const falha = (status: Falha['status'], error: string): Falha => ({ ok: false, status, error });

const hoje = () => hojeEmSaoPaulo();
const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export type SituacaoPrazo = 'sem_prazo' | 'encerrado' | 'no_prazo' | 'vence_hoje' | 'atrasado';
/** O prazo do pedido em relação a hoje; pedido respondido, negado ou arquivado não corre mais. */
export function situacaoDoPrazo(p: { prazo_em: string | null; status: string }, em = hoje()): SituacaoPrazo {
  if (['respondido', 'negado', 'arquivado'].includes(p.status)) return 'encerrado';
  if (!p.prazo_em) return 'sem_prazo';
  const dia = p.prazo_em.slice(0, 10);
  return dia < em ? 'atrasado' : dia === em ? 'vence_hoje' : 'no_prazo';
}

const COLS = 'id, protocolo, tipo, canal, titular_nome, titular_contato, descricao, recebido_em, prazo_em, status, respondido_em, resposta_texto, responsavel_parte_id, criado_por, created_at, updated_at, identidade_metodo, identidade_obs, identidade_por, identidade_em';
// Leitura com o nome de quem conferiu a identidade (migration 0104).
const LEITURA = `SELECT ${COLS.split(', ').map((c) => `t.${c}`).join(', ')}, NULLIF(u.name, '') AS identidade_por_nome
  FROM titular_pedidos t LEFT JOIN users u ON t.identidade_por IS NOT NULL AND lower(u.email) = lower(t.identidade_por)`;
export type Pedido = {
  id: string; protocolo: string; tipo: TipoPedido; canal: CanalPedido; titular_nome: string | null; titular_contato: string | null; descricao: string | null;
  recebido_em: string; prazo_em: string | null; status: StatusPedido; respondido_em: string | null; resposta_texto: string | null; responsavel_parte_id: string | null;
  identidade_metodo: string | null; identidade_obs: string | null; identidade_por: string | null; identidade_em: string | null; identidade_por_nome?: string | null;
};
const comSituacao = (p: Pedido) => ({ ...p, situacao_prazo: situacaoDoPrazo(p) });

export async function listarPedidos(db: D1Database, projectId: string) {
  const { results } = await db.prepare(`${LEITURA} WHERE t.project_id = ? ORDER BY t.recebido_em DESC, t.protocolo DESC`).bind(projectId).all<Pedido>();
  return results.map(comSituacao);
}

export async function lerPedido(db: D1Database, projectId: string, id: string) {
  const p = await db.prepare(`${LEITURA} WHERE t.id = ? AND t.project_id = ?`).bind(id, projectId).first<Pedido>();
  return p ? comSituacao(p) : null;
}

const parteDoProjeto = async (db: D1Database, projectId: string, id: string | null | undefined) =>
  !id || !!(await db.prepare('SELECT 1 FROM partes WHERE id = ? AND project_id = ?').bind(id, projectId).first());

export type NovoPedido = { tipo: TipoPedido; canal?: CanalPedido; titular_nome?: string | null; titular_contato?: string | null; descricao?: string | null; recebido_em?: string; responsavel_parte_id?: string | null };

export async function criarPedido(db: D1Database, projectId: string, ator: string, d: NovoPedido, acompanhamentoHash: string | null = null): Promise<Falha | { ok: true; id: string; protocolo: string; prazo_em: string | null }> {
  const recebido = d.recebido_em ?? hoje();
  if (!ehData(recebido)) return falha(400, 'recebido_em precisa ser uma data AAAA-MM-DD');
  if (recebido > hoje()) return falha(400, 'recebido_em não pode estar no futuro');
  if (!(await parteDoProjeto(db, projectId, d.responsavel_parte_id))) return falha(400, 'responsavel_parte_id inexistente ou de outro projeto');
  const prazo = await prazoDe(db, 'titular.resposta', recebido);
  const id = crypto.randomUUID();
  const protocolo = await comProtocolo(db, projectId, recebido, (protocolo) => db.prepare(
    `INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, canal, titular_nome, titular_contato, descricao, recebido_em, prazo_em, responsavel_parte_id, criado_por, acompanhamento_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, projectId, protocolo, d.tipo, d.canal ?? 'outro', d.titular_nome ?? null, d.titular_contato ?? null, d.descricao ?? null, recebido, prazo, d.responsavel_parte_id ?? null, ator, acompanhamentoHash).run());
  if (!protocolo) return falha(409, 'Não foi possível gerar o protocolo; tente de novo');
  await logAudit(db, 'titular.pedido_criado', ator, `Pedido ${protocolo} (${d.tipo}) registrado; prazo ${prazo ? prazo.slice(0, 10) : 'não calculado'}`, '', '', projectId);
  return { ok: true, id, protocolo, prazo_em: prazo };
}

/** Protocolo `PT-AAAA-NNNN` (ano do recebimento) e o INSERT; duas criações juntas que pegam o mesmo número tentam o próximo. null: 3 colisões. */
async function comProtocolo(db: D1Database, projectId: string, recebido: string, inserir: (protocolo: string) => Promise<unknown>): Promise<string | null> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const protocolo = await proximoProtocolo(db, 'titular_pedidos', 'PT', projectId, Number(recebido.slice(0, 4)));
    try {
      await inserir(protocolo);
      return protocolo;
    } catch (e) {
      if (!/UNIQUE/i.test(String((e as Error)?.message))) throw e;
    }
  }
  return null;
}

export type PedidoImportado = { tipo: TipoPedido; canal?: CanalPedido | null; recebido_em: string; status: StatusPedido; respondido_em?: string | null; descricao: string };

/**
 * Importar histórico (importação, fatia 4): pedido já existente fora do sistema, com a data de recebimento e o status do registro de
 * origem (inclusive final). O protocolo do sistema é gerado como na criação; o de origem vem em `descricao`. Prazo: encerrado não tem
 * (não se recalcula prazo de pedido já respondido); aberto tem o do parâmetro, contado do recebimento, mesmo que já tenha vencido (a tela
 * e o painel do encarregado o mostram atrasado; `prazo_vencido` devolve a data). A rotina de avisos (`avisos-prazo.ts`) dá carência:
 * prazo que nasceu vencido não gera atraso na semana ISO da criação; depois, o atraso semanal volta. Sem titular: nome e contato ficam nulos.
 */
export async function importarPedido(db: D1Database, projectId: string, ator: string, d: PedidoImportado): Promise<Falha | { ok: true; id: string; protocolo: string; prazo_em: string | null; prazo_vencido: string | null }> {
  if (!ehData(d.recebido_em)) return falha(400, 'recebido_em precisa ser uma data AAAA-MM-DD');
  if (d.recebido_em > hoje()) return falha(400, 'recebido_em não pode estar no futuro');
  const final = d.status === 'respondido' || d.status === 'negado';
  const aberto = d.status === 'recebido' || d.status === 'em_andamento';
  if (d.respondido_em != null) {
    if (!ehData(d.respondido_em)) return falha(400, 'respondido_em precisa ser uma data AAAA-MM-DD');
    if (d.respondido_em > hoje()) return falha(400, 'respondido_em não pode estar no futuro');
    if (d.respondido_em < d.recebido_em) return falha(400, 'respondido_em não pode ser anterior a recebido_em');
    if (aberto) return falha(400, 'pedido em aberto não tem respondido_em');
  } else if (final) return falha(400, 'respondido_em: informe a data da resposta do pedido respondido ou negado');

  const prazo = aberto ? await prazoDe(db, 'titular.resposta', d.recebido_em) : null;
  const vencido = prazo && prazo.slice(0, 10) < hoje() ? prazo : null;
  const resposta = final ? 'Resposta dada fora do sistema; pedido importado do histórico.' : null;
  const id = crypto.randomUUID();
  const protocolo = await comProtocolo(db, projectId, d.recebido_em, (protocolo) => db.prepare(
    `INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, canal, descricao, recebido_em, prazo_em, status, respondido_em, resposta_texto, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, projectId, protocolo, d.tipo, d.canal ?? 'outro', d.descricao, d.recebido_em, prazo, d.status, d.respondido_em ?? null, resposta, ator).run());
  if (!protocolo) return falha(409, 'Não foi possível gerar o protocolo; tente de novo');
  await logAudit(db, 'titular.pedido_importado', ator, `Pedido ${protocolo} (${d.tipo}, ${d.status}) importado do histórico; recebido em ${d.recebido_em}`, '', '', projectId);
  return { ok: true, id, protocolo, prazo_em: prazo, prazo_vencido: vencido };
}

export type AtualizacaoPedido = { status?: StatusPedido; resposta_texto?: string | null; responsavel_parte_id?: string | null; prazo_em?: string | null; descricao?: string | null };

export async function atualizarPedido(db: D1Database, projectId: string, id: string, ator: string, d: AtualizacaoPedido): Promise<Falha | { ok: true }> {
  const atual = await lerPedido(db, projectId, id);
  if (!atual) return falha(404, 'Pedido não encontrado');
  const final = atual.status === 'respondido' || atual.status === 'negado';
  if (final && (d.status ?? atual.status) !== atual.status && d.status !== 'arquivado') return falha(409, 'Pedido respondido ou negado só pode ser arquivado');
  if (final && (d.resposta_texto !== undefined || d.prazo_em !== undefined || d.descricao !== undefined)) return falha(409, 'Pedido respondido ou negado não muda: a resposta é o registro');
  if (atual.status === 'arquivado' && d.status !== undefined && d.status !== 'arquivado') return falha(409, 'Pedido arquivado não reabre');
  if (d.prazo_em != null && !ehData(d.prazo_em.slice(0, 10))) return falha(400, 'prazo_em precisa ser uma data AAAA-MM-DD');
  if (d.responsavel_parte_id !== undefined && !(await parteDoProjeto(db, projectId, d.responsavel_parte_id))) return falha(400, 'responsavel_parte_id inexistente ou de outro projeto');

  const novo = d.status ?? atual.status;
  const resposta = d.resposta_texto !== undefined ? d.resposta_texto : atual.resposta_texto;
  if ((novo === 'respondido' || novo === 'negado') && !String(resposta ?? '').trim()) return falha(400, 'Registre o texto da resposta para responder ou negar');
  const encerrando = (novo === 'respondido' || novo === 'negado') && atual.status !== novo;

  const sets: string[] = ['status = ?', "updated_at = datetime('now')"];
  const binds: unknown[] = [novo];
  if (d.resposta_texto !== undefined) { sets.push('resposta_texto = ?'); binds.push(d.resposta_texto); }
  if (d.responsavel_parte_id !== undefined) { sets.push('responsavel_parte_id = ?'); binds.push(d.responsavel_parte_id); }
  if (d.prazo_em !== undefined) { sets.push('prazo_em = ?'); binds.push(d.prazo_em); }
  if (d.descricao !== undefined) { sets.push('descricao = ?'); binds.push(d.descricao); }
  if (encerrando) { sets.push('respondido_em = ?'); binds.push(new Date().toISOString()); }
  // O status lido vai na WHERE: se outra pessoa respondeu, negou ou arquivou no meio, nada é sobrescrito.
  const r = await db.prepare(`UPDATE titular_pedidos SET ${sets.join(', ')} WHERE id = ? AND project_id = ? AND status = ?`).bind(...binds, id, projectId, atual.status).run();
  if (!r.meta.changes) return falha(409, 'O pedido mudou enquanto você editava; recarregue');
  await logAudit(db, 'titular.pedido_atualizado', ator, `Pedido ${atual.protocolo}: ${atual.status} → ${novo}${d.prazo_em !== undefined ? '; prazo alterado à mão' : ''}`, '', '', projectId);
  return { ok: true };
}

// ─── Portal público de solicitações (migration 0096, spec 2026-11-03) ─────────────────────────────

/** Gera (ou regenera) o link público do projeto; só o SHA-256 do token fica no banco, o token sai uma vez. */
export async function gerarPortal(db: D1Database, projectId: string, ator: string): Promise<{ token: string }> {
  const token = genToken();
  await db.prepare(
    `INSERT INTO titular_portais (project_id, token_hash, ativo, criado_por) VALUES (?, ?, 1, ?)
     ON CONFLICT(project_id) DO UPDATE SET token_hash = excluded.token_hash, ativo = 1, criado_por = excluded.criado_por, updated_at = CURRENT_TIMESTAMP`,
  ).bind(projectId, await sha256Hex(token), ator).run();
  await logAudit(db, 'titular.portal', ator, 'Link público do portal de solicitações gerado (o token anterior deixa de valer)', '', '', projectId);
  return { token };
}

/** Estado do portal do projeto (sem o token). null = nunca foi gerado. */
export async function lerPortal(db: D1Database, projectId: string): Promise<{ ativo: boolean; criado_por: string | null; created_at: string } | null> {
  const r = await db.prepare('SELECT ativo, criado_por, created_at FROM titular_portais WHERE project_id = ?').bind(projectId).first<{ ativo: number; criado_por: string | null; created_at: string }>();
  return r ? { ativo: r.ativo === 1, criado_por: r.criado_por, created_at: r.created_at } : null;
}

export async function desativarPortal(db: D1Database, projectId: string, ator: string): Promise<boolean> {
  const r = await db.prepare("UPDATE titular_portais SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND ativo = 1").bind(projectId).run();
  if (r.meta.changes) await logAudit(db, 'titular.portal', ator, 'Link público do portal de solicitações desativado', '', '', projectId);
  return !!r.meta.changes;
}

/** Projeto do token do link, só se o portal está ativo. null (inexistente ou desligado) dá o mesmo 404 na rota pública. */
export async function portalDoToken(db: D1Database, token: string): Promise<{ project_id: string } | null> {
  return db.prepare("SELECT project_id FROM titular_portais WHERE token_hash = ? AND ativo = 1").bind(await sha256Hex(token)).first<{ project_id: string }>();
}

export type AberturaPortal = { tipo: TipoPedido; titular_nome: string; titular_contato: string; descricao: string };

// Código de acompanhamento (migration 0105): 16 símbolos sem ambíguos (0/O, 1/I/L), ~79 bits; só o SHA-256 vai ao banco.
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const agrupar = (s: string) => s.match(/.{4}/g)!.join('-');

export function gerarCodigoAcompanhamento(): string {
  let s = '';
  const byte = new Uint8Array(1);
  while (s.length < 16) {
    crypto.getRandomValues(byte);
    if (byte[0] < 248) s += ALFABETO[byte[0] % 31]; // 248 = 31 * 8: sem viés de módulo
  }
  return agrupar(s);
}

/** O código como digitado (minúsculas, espaço, hífen) no formato canônico; null se não pode ser um código. */
export function normalizarCodigo(s: string): string | null {
  const limpo = s.toUpperCase().replace(/[\s-]/g, '');
  return limpo.length === 16 && [...limpo].every((ch) => ALFABETO.includes(ch)) ? agrupar(limpo) : null;
}

/** Abre um pedido pela recepção pública: canal `formulario`, status `recebido`, protocolo gerado como na criação interna, e o código de
 *  acompanhamento, devolvido só aqui (o banco guarda o hash). */
export async function abrirPedidoPortal(db: D1Database, projectId: string, d: AberturaPortal): Promise<Falha | { ok: true; id: string; protocolo: string; prazo_em: string | null; codigo: string }> {
  const codigo = gerarCodigoAcompanhamento();
  const r = await criarPedido(db, projectId, 'sistema:portal', { tipo: d.tipo, canal: 'formulario', titular_nome: d.titular_nome, titular_contato: d.titular_contato, descricao: d.descricao }, await sha256Hex(codigo));
  return r.ok ? { ...r, codigo } : r;
}

export type ConsultaPublica = { protocolo: string; tipo: string; status: string; recebido_em: string; prazo_em: string | null; respondido_em: string | null };

/** Consulta pública: acha pelo hash do código e confere o protocolo. null para qualquer falha (a rota dá o mesmo 404). */
export async function consultarPedidoPortal(db: D1Database, protocolo: string, codigo: string): Promise<ConsultaPublica | null> {
  const canonico = normalizarCodigo(codigo);
  if (!canonico) return null;
  const p = await db.prepare('SELECT protocolo, tipo, status, recebido_em, prazo_em, respondido_em FROM titular_pedidos WHERE acompanhamento_hash = ?')
    .bind(await sha256Hex(canonico)).first<ConsultaPublica>();
  return p && p.protocolo === protocolo.toUpperCase() ? p : null;
}

// ─── Tratativas do atendimento (migration 0096) ───────────────────────────────────────────────────

export const TIPOS_TRATATIVA = ['comunicacao_titular', 'encaminhamento', 'evidencia', 'nota'] as const;
export type TipoTratativa = (typeof TIPOS_TRATATIVA)[number];
export type Tratativa = { id: string; tipo: TipoTratativa; texto: string; autor: string | null; created_at: string };

export async function listarTratativas(db: D1Database, projectId: string, pedidoId: string): Promise<Tratativa[] | null> {
  if (!(await db.prepare('SELECT 1 FROM titular_pedidos WHERE id = ? AND project_id = ?').bind(pedidoId, projectId).first())) return null;
  const { results } = await db.prepare(
    'SELECT id, tipo, texto, autor, created_at FROM titular_pedido_tratativas WHERE pedido_id = ? AND project_id = ? ORDER BY created_at, rowid',
  ).bind(pedidoId, projectId).all<Tratativa>();
  return results;
}

export async function adicionarTratativa(db: D1Database, projectId: string, pedidoId: string, ator: string, d: { tipo: TipoTratativa; texto: string }): Promise<Falha | { ok: true; id: string }> {
  if (!(await db.prepare('SELECT 1 FROM titular_pedidos WHERE id = ? AND project_id = ?').bind(pedidoId, projectId).first())) return falha(404, 'Pedido não encontrado');
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO titular_pedido_tratativas (id, pedido_id, project_id, tipo, texto, autor) VALUES (?, ?, ?, ?, ?, ?)').bind(id, pedidoId, projectId, d.tipo, d.texto, ator).run();
  await logAudit(db, 'titular.tratativa', ator, `Tratativa (${d.tipo}) registrada no pedido ${pedidoId}`, '', '', projectId);
  return { ok: true, id };
}
