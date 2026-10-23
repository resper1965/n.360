import { sqlClasseControle } from './classe-controle';

export type DocumentoQueCobre = { id: string; titulo: string; status: 'rascunho' | 'vigente' | 'obsoleto' };
export type CoberturaPoliticas = {
  aplicaveis: number;
  cobertos: number;
  sem_cobertura: { id: string; title: string }[];
  por_controle: Record<string, DocumentoQueCobre[]>;
  por_documento: Record<string, number>;
};

/**
 * Cobertura dos controles por política temática (spec 2026-10-23): o controle aponta para o requisito (`requisito_id`) e a
 * política declara os requisitos que cobre (`documento_requisitos`). Coberto = ao menos uma política VIGENTE ligada.
 * Rascunho aparece em `por_controle` (a tela mostra "em rascunho"), mas não conta; obsoleto não aparece.
 */
export async function coberturaDePoliticas(db: D1Database, projectId: string): Promise<CoberturaPoliticas> {
  const [controles, ligacoes] = await Promise.all([
    db.prepare(`SELECT id, title, requisito_id FROM compliance_controls WHERE project_id = ? AND ${sqlClasseControle('status')} != 'na' ORDER BY title`)
      .bind(projectId).all<{ id: string; title: string; requisito_id: string | null }>(),
    db.prepare(
      `SELECT dr.requisito_id, d.id, d.titulo, d.status FROM documento_requisitos dr
       JOIN documentos d ON d.id = dr.documento_id AND d.project_id = dr.project_id
       WHERE dr.project_id = ? AND d.tipo = 'politica' AND d.status != 'obsoleto' ORDER BY d.titulo`
    ).bind(projectId).all<{ requisito_id: string; id: string; titulo: string; status: DocumentoQueCobre['status'] }>(),
  ]);

  const porRequisito = new Map<string, DocumentoQueCobre[]>();
  for (const l of ligacoes.results) porRequisito.set(l.requisito_id, [...(porRequisito.get(l.requisito_id) ?? []), { id: l.id, titulo: l.titulo, status: l.status }]);

  const r: CoberturaPoliticas = { aplicaveis: 0, cobertos: 0, sem_cobertura: [], por_controle: {}, por_documento: {} };
  for (const c of controles.results) {
    r.aplicaveis++;
    const docs = (c.requisito_id && porRequisito.get(c.requisito_id)) || [];
    if (docs.length) r.por_controle[c.id] = docs;
    for (const d of docs) r.por_documento[d.id] = (r.por_documento[d.id] ?? 0) + 1;
    if (docs.some((d) => d.status === 'vigente')) r.cobertos++;
    else r.sem_cobertura.push({ id: c.id, title: c.title });
  }
  return r;
}
