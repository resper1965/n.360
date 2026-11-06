import { logAudit } from '../helpers';
import { temPii } from './rascunhos-privacy';

/** Conferência de identidade do titular (spec 2026-11-06): só registro; nunca trava responder. Quem e quando vêm da sessão. */
export const METODOS_IDENTIDADE = ['documento_foto', 'dados_cadastrais', 'canal_autenticado', 'presencial', 'outro'] as const;
export type MetodoIdentidade = (typeof METODOS_IDENTIDADE)[number];
type Falha = { ok: false; status: 400 | 404; error: string };

/** Número de documento não entra na observação: 7+ dígitos seguidos, com ponto, hífen ou espaço no meio. */
export const temNumeroDeDocumento = (t: string) => /\d(?:[.\- ]?\d){6,}/.test(t) || temPii(t);

export async function salvarIdentidade(db: D1Database, projectId: string, pedidoId: string, ator: string,
  d: { metodo: MetodoIdentidade | null; observacao?: string | null }): Promise<Falha | { ok: true }> {
  const obs = d.metodo ? d.observacao?.trim() || null : null;
  if (obs && temNumeroDeDocumento(obs)) return { ok: false, status: 400, error: 'A observação não aceita número de documento, CPF, e-mail nem telefone' };
  const p = await db.prepare('SELECT protocolo FROM titular_pedidos WHERE id = ? AND project_id = ?').bind(pedidoId, projectId).first<{ protocolo: string }>();
  if (!p) return { ok: false, status: 404, error: 'Pedido não encontrado' };
  await db.prepare(`UPDATE titular_pedidos SET identidade_metodo = ?, identidade_obs = ?, identidade_por = ?, identidade_em = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND project_id = ?`).bind(d.metodo, obs, d.metodo ? ator : null, d.metodo ? new Date().toISOString() : null, pedidoId, projectId).run();
  await logAudit(db, 'titular_pedido.identidade', ator, `Pedido ${p.protocolo}: ${d.metodo ?? 'conferência removida'}`, '', '', projectId);
  return { ok: true };
}
