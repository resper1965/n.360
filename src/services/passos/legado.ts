import { obterCatalogo } from '../../data/passos/catalogo';

const MOTIVO = { completed: 'Fase concluída antes da Bancada (situação manual)', skipped: 'Fase dispensada antes da Bancada (situação manual)' } as const;

/**
 * Fase que o select manual deu como concluída ou dispensada: cada passo ainda não marcado ganha is_checked = 1 com a marca de exceção,
 * e a situação anterior é encerrada. Idempotente: só toca linha com is_checked = 0 e só em fase que ainda tem `legado_status`.
 * O progresso nunca anda para trás (spec, seção 6).
 */
export async function materializarLegado(db: D1Database, projectId: string): Promise<number> {
  const { results } = await db.prepare(
    `SELECT phase_number, legado_status FROM project_phases WHERE project_id = ? AND legado_status IN ('completed', 'skipped')`
  ).bind(projectId).all<{ phase_number: number; legado_status: 'completed' | 'skipped' }>();
  if (!results?.length) return 0;
  const cat = obterCatalogo();
  const upsert = db.prepare(
    `INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, checked_at, excecao_motivo, excecao_por, excecao_em)
     VALUES (lower(hex(randomblob(16))), ?, ?, ?, 1, CURRENT_TIMESTAMP, ?, 'sistema', CURRENT_TIMESTAMP)
     ON CONFLICT(project_id, phase_number, item_id) DO UPDATE SET is_checked = 1, checked_at = CURRENT_TIMESTAMP,
       excecao_motivo = excluded.excecao_motivo, excecao_por = excluded.excecao_por, excecao_em = excluded.excecao_em
     WHERE checklist_progress.is_checked = 0`
  );
  const stmts: D1PreparedStatement[] = [];
  for (const f of results) {
    for (const p of cat.passos.filter((x) => x.fase === f.phase_number)) stmts.push(upsert.bind(projectId, p.fase, p.id, MOTIVO[f.legado_status]));
    stmts.push(db.prepare(`UPDATE project_phases SET legado_status = NULL WHERE project_id = ? AND phase_number = ?`).bind(projectId, f.phase_number));
  }
  await db.batch(stmts);
  return results.length;
}
