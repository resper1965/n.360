import { obterCatalogo } from '../../data/passos/catalogo';
import { logAudit } from '../../helpers';
import type { ContextoProjeto } from './contexto';
import { situacaoDaFaseNoContexto } from './estado';
import type { Passo } from '../../data/passos/tipos';

/** Grava em `project_phases.status` (e `completed_at`) a situação derivada, só onde mudou. O campo é cache: Monitor, carteira e dossiê leem dele. */
export async function gravarSituacoes(db: D1Database, projectId: string, ctx: ContextoProjeto): Promise<void> {
  const cat = obterCatalogo();
  const stmts: D1PreparedStatement[] = [];
  for (const f of cat.fases) {
    const linha = ctx.fases.get(f.numero);
    if (!linha) continue;
    const nova = situacaoDaFaseNoContexto(cat, ctx, f.numero);
    if (nova === linha.status) continue;
    stmts.push(db.prepare(
      `UPDATE project_phases SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END
       WHERE project_id = ? AND phase_number = ?`
    ).bind(nova, nova, projectId, f.numero));
    linha.status = nova;
  }
  if (stmts.length) await db.batch(stmts);
}

/** Uma linha de trilha por (pessoa, passo) a cada 10 minutos: o autosave grava a cada pausa de digitação e não pode inundar `audit_logs`. */
export async function registrarGravacao(db: D1Database, projectId: string, passo: Passo, ator: string, ip: string): Promise<void> {
  const detalhe = `Campos do passo ${passo.id} salvos no projeto ${projectId}`;
  const recente = await db.prepare(
    `SELECT 1 FROM audit_logs WHERE project_id = ? AND action = 'passo.campos_salvos' AND actor = ? AND details = ? AND created_at > datetime('now', '-10 minutes') LIMIT 1`
  ).bind(projectId, ator, detalhe).first();
  if (!recente) await logAudit(db, 'passo.campos_salvos', ator, detalhe, '', ip, projectId);
}
