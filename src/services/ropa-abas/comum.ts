/** Falha de regra dos serviços da ficha em abas: a rota a devolve como `{ error }` com o status. */
export type Falha = { ok: false; status: 400 | 403 | 404 | 409; error: string; invalidos?: string[] };
export const falha = (status: Falha['status'], error: string, invalidos?: string[]): Falha => ({ ok: false, status, error, ...(invalidos ? { invalidos } : {}) });
/** `mudouHash`: a escrita tocou coluna do conteúdo congelado; a rota então chama `conferirPedidosDoDocumento` (spec 4.4). */
export type Gravado = { ok: true; mudouHash: boolean };

export type AtividadeBasica = { id: string; status: string | null; processing_purpose: string };

/** A atividade do projeto, ou null (404). */
export const atividadeDoProjeto = (db: D1Database, projectId: string, ropaId: string) =>
  db.prepare('SELECT id, status, processing_purpose FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first<AtividadeBasica>();

/** Toda escrita de aba passa por aqui: 404 se não é do projeto, 409 se está cancelada (somente leitura, spec 6). */
export async function exigirEditavel(db: D1Database, projectId: string, ropaId: string): Promise<Falha | { ok: true; atividade: AtividadeBasica }> {
  const a = await atividadeDoProjeto(db, projectId, ropaId);
  if (!a) return falha(404, 'Registro do RoPA não encontrado');
  if (a.status === 'Inactive') return falha(409, 'Atividade cancelada: reative para editar');
  return { ok: true, atividade: a };
}
