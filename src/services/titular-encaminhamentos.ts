import { genId, logAudit } from '../helpers';
import { hojeEmSaoPaulo } from './hoje';

/** Encaminhamento do pedido do titular a uma pessoa do cadastro (spec 2026-11-06). O ponto focal responde por fora; o DPO registra. */
type Falha = { ok: false; status: 400 | 404 | 409; error: string };
const falha = (status: Falha['status'], error: string): Falha => ({ ok: false, status, error });
const ABERTOS = ['recebido', 'em_andamento'];
const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export type SituacaoEncaminhamento = 'no_prazo' | 'vence_hoje' | 'atrasado' | 'encerrado';
export const situacaoDoEncaminhamento = (e: { status: string; prazo: string }, hoje = hojeEmSaoPaulo()): SituacaoEncaminhamento =>
  e.status !== 'aguardando' ? 'encerrado' : e.prazo < hoje ? 'atrasado' : e.prazo === hoje ? 'vence_hoje' : 'no_prazo';

const pedido = (db: D1Database, projectId: string, id: string) =>
  db.prepare('SELECT protocolo, tipo, status FROM titular_pedidos WHERE id = ? AND project_id = ?').bind(id, projectId).first<{ protocolo: string; tipo: string; status: string }>();

export async function listarEncaminhamentos(db: D1Database, projectId: string, pedidoId: string) {
  if (!(await pedido(db, projectId, pedidoId))) return null;
  const { results } = await db.prepare(
    `SELECT e.id, e.parte_id, p.nome AS parte_nome, e.prazo, e.mensagem, e.status, e.retorno, e.enviado_por, e.enviado_em, e.retorno_por, e.retorno_em
       FROM titular_pedido_encaminhamentos e JOIN partes p ON p.id = e.parte_id
      WHERE e.pedido_id = ? AND e.project_id = ? ORDER BY e.created_at, e.rowid`
  ).bind(pedidoId, projectId).all<{ status: string; prazo: string } & Record<string, unknown>>();
  return results.map((e) => ({ ...e, situacao: situacaoDoEncaminhamento(e) }));
}

export async function criarEncaminhamento(db: D1Database, projectId: string, pedidoId: string, ator: string, d: { parte_id: string; prazo: string; mensagem: string }) {
  const p = await pedido(db, projectId, pedidoId);
  if (!p) return falha(404, 'Pedido não encontrado');
  if (!ABERTOS.includes(p.status)) return falha(409, 'Só pedido em aberto pode ser encaminhado');
  if (!ehData(d.prazo) || d.prazo < hojeEmSaoPaulo()) return falha(400, 'O prazo é uma data de hoje em diante');
  const parte = await db.prepare(`SELECT nome, email FROM partes WHERE id = ? AND project_id = ? AND tipo = 'pessoa' AND status = 'ativa' AND trim(COALESCE(email, '')) <> ''`)
    .bind(d.parte_id, projectId).first<{ nome: string; email: string }>();
  if (!parte) return falha(400, 'Escolha uma pessoa ativa do cadastro, com e-mail');
  const id = genId();
  await db.batch([
    db.prepare(`INSERT INTO titular_pedido_encaminhamentos (id, pedido_id, project_id, parte_id, prazo, mensagem, enviado_por) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, pedidoId, projectId, d.parte_id, d.prazo, d.mensagem, ator),
    db.prepare(`INSERT INTO titular_pedido_tratativas (id, pedido_id, project_id, tipo, texto, autor) VALUES (?, ?, ?, 'encaminhamento', ?, ?)`)
      .bind(genId(), pedidoId, projectId, `Encaminhado a ${parte.nome}, prazo ${dataBr(d.prazo)}`, ator),
  ]);
  await logAudit(db, 'titular_pedido.encaminhamento', ator, `Pedido ${p.protocolo}: encaminhado (parte ${d.parte_id})`, '', '', projectId);
  return { ok: true as const, id, parte, protocolo: p.protocolo, tipo: p.tipo };
}

export async function atualizarEncaminhamento(db: D1Database, projectId: string, pedidoId: string, encId: string, ator: string,
  d: { status: 'respondido'; retorno: string } | { status: 'cancelado' }) {
  const p = await pedido(db, projectId, pedidoId);
  if (!p) return falha(404, 'Pedido não encontrado');
  const retorno = d.status === 'respondido' ? d.retorno : null;
  const r = await db.prepare(`UPDATE titular_pedido_encaminhamentos SET status = ?, retorno = ?, retorno_por = ?, retorno_em = CURRENT_TIMESTAMP
      WHERE id = ? AND pedido_id = ? AND project_id = ? AND status = 'aguardando' RETURNING parte_id`).bind(d.status, retorno, ator, encId, pedidoId, projectId).first<{ parte_id: string }>();
  if (!r) {
    const existe = await db.prepare('SELECT 1 FROM titular_pedido_encaminhamentos WHERE id = ? AND pedido_id = ? AND project_id = ?').bind(encId, pedidoId, projectId).first();
    return existe ? falha(409, 'Encaminhamento já respondido ou cancelado') : falha(404, 'Encaminhamento não encontrado');
  }
  await logAudit(db, 'titular_pedido.encaminhamento', ator, `Pedido ${p.protocolo}: encaminhamento ${d.status} (parte ${r.parte_id})`, '', '', projectId);
  return { ok: true as const };
}
