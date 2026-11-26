/**
 * Evidência do tratamento ligada ao risco (N:N, migration 0122). Fica fora do estado aceito do risco (COLUNAS_RISCO em pedidos.ts):
 * ligar e desligar não mudam o hash do aceite nem o invalidam. É assim que se prova que o plano foi cumprido sem editar o plano.
 */

/** Liga; `false` se já estava ligada. O gatilho do banco recusa evidência ou risco de outro projeto. */
export async function ligarRisco(db: D1Database, ev: { id: string; project_id: string }, riskId: string, quem: string): Promise<boolean> {
  const r = await db.prepare('INSERT OR IGNORE INTO evidencia_riscos (evidence_id, risk_id, project_id, ligado_por) VALUES (?, ?, ?, ?)')
    .bind(ev.id, riskId, ev.project_id, quem).run();
  return (r.meta.changes ?? 0) > 0;
}

/** Desliga; `false` se não estava ligada. */
export async function desligarRisco(db: D1Database, evidenceId: string, riskId: string): Promise<boolean> {
  const r = await db.prepare('DELETE FROM evidencia_riscos WHERE evidence_id = ? AND risk_id = ?').bind(evidenceId, riskId).run();
  return (r.meta.changes ?? 0) > 0;
}

export type EvidenciaDoRisco = { evidence_id: string; file_name: string | null; evaluation_status: string | null; ligado_por: string | null; ligado_em: string };

/** `evidencias_tratamento` de cada risco da lista: uma consulta para o projeto inteiro. */
export async function comEvidenciasDoTratamento<T extends { id: string }>(db: D1Database, projectId: string, riscos: T[]): Promise<(T & { evidencias_tratamento: EvidenciaDoRisco[] })[]> {
  if (!riscos.length) return [];
  const { results } = await db.prepare(
    `SELECT er.risk_id, er.evidence_id, e.file_name, e.evaluation_status, er.ligado_por, er.created_at AS ligado_em
       FROM evidencia_riscos er JOIN evidence e ON e.id = er.evidence_id
      WHERE er.project_id = ? ORDER BY er.created_at, er.rowid`,
  ).bind(projectId).all<EvidenciaDoRisco & { risk_id: string }>();
  const por = new Map<string, EvidenciaDoRisco[]>();
  for (const { risk_id, ...ev } of results) (por.get(risk_id) ?? por.set(risk_id, []).get(risk_id)!).push(ev);
  return riscos.map((r) => ({ ...r, evidencias_tratamento: por.get(r.id) ?? [] }));
}
