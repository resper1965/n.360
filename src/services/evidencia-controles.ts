/**
 * Evidência ligada a vários controles (migration 0119): o vínculo é `evidencia_controles`. `evidence.control_id` fica como o
 * PRIMEIRO vínculo, para quem ainda lê o campo (leitura compatível): ligar o primeiro controle o preenche, e desligar o controle
 * que está nele passa o campo ao vínculo mais antigo que sobrou (ou a NULL). Ligar e desligar não mexem em assinatura nem na
 * avaliação humana: a aprovação vale para o conteúdo da evidência (hash), não para o vínculo. Só a avaliação da IA
 * (`avaliacao_ia`, `evaluation_score`) é zerada quando o controle principal muda, porque foi feita contra ele.
 */

/** Os controles de cada evidência do projeto, em ordem de vínculo. */
export async function controlesDasEvidencias(db: D1Database, projectId: string): Promise<Map<string, string[]>> {
  const { results } = await db.prepare(
    'SELECT evidence_id, control_id FROM evidencia_controles WHERE project_id = ? ORDER BY rowid',
  ).bind(projectId).all<{ evidence_id: string; control_id: string }>();
  const mapa = new Map<string, string[]>();
  for (const r of results) (mapa.get(r.evidence_id) ?? mapa.set(r.evidence_id, []).get(r.evidence_id)!).push(r.control_id);
  return mapa;
}

/** As linhas de evidência com `control_ids` (todos os controles ligados). */
export async function comControles<T extends { id: string }>(db: D1Database, projectId: string, linhas: T[]): Promise<(T & { control_ids: string[] })[]> {
  if (!linhas.length) return [];
  const mapa = await controlesDasEvidencias(db, projectId);
  return linhas.map((l) => ({ ...l, control_ids: mapa.get(l.id) ?? [] }));
}

/** O controle principal depois do vínculo mudar: o atual se ainda está ligado, senão o vínculo mais antigo (ordem de inserção). */
const NOVO_PRINCIPAL = `CASE
       WHEN control_id IS NOT NULL AND EXISTS (SELECT 1 FROM evidencia_controles WHERE evidence_id = evidence.id AND control_id = evidence.control_id) THEN control_id
       ELSE (SELECT control_id FROM evidencia_controles WHERE evidence_id = evidence.id ORDER BY rowid LIMIT 1) END`;

/** Repõe `evidence.control_id`; se ele muda, zera só a avaliação da IA (o lado direito do SET lê os valores antigos). */
const sincronizarPrincipal = (db: D1Database, evidenceId: string) => db.prepare(
  `UPDATE evidence SET control_id = ${NOVO_PRINCIPAL},
     avaliacao_ia = CASE WHEN (${NOVO_PRINCIPAL}) IS control_id THEN avaliacao_ia ELSE NULL END,
     evaluation_score = CASE WHEN (${NOVO_PRINCIPAL}) IS control_id THEN evaluation_score ELSE NULL END,
     updated_at = datetime('now')
   WHERE id = ?`,
).bind(evidenceId);

/** Liga; `false` se já estava ligada. O chamador confere que o controle é do projeto da evidência. */
export async function ligarControle(db: D1Database, ev: { id: string; project_id: string }, controlId: string, quem: string): Promise<boolean> {
  const [ins] = await db.batch([
    db.prepare('INSERT OR IGNORE INTO evidencia_controles (evidence_id, control_id, project_id, ligado_por) VALUES (?, ?, ?, ?)')
      .bind(ev.id, controlId, ev.project_id, quem),
    sincronizarPrincipal(db, ev.id),
  ]);
  return (ins.meta.changes ?? 0) > 0;
}

/** Desliga; `false` se não estava ligada. */
export async function desligarControle(db: D1Database, evidenceId: string, controlId: string): Promise<boolean> {
  const [del] = await db.batch([
    db.prepare('DELETE FROM evidencia_controles WHERE evidence_id = ? AND control_id = ?').bind(evidenceId, controlId),
    sincronizarPrincipal(db, evidenceId),
  ]);
  return (del.meta.changes ?? 0) > 0;
}
