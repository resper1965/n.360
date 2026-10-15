/**
 * Bases legais da atividade de tratamento (F3, migration 0074). `ropa_records.base_legal_id` continua a PRINCIPAL (decisão D5: está no
 * conteúdo congelado da aprovação e não é copiada); `tratamento_bases` guarda as ADICIONAIS do catálogo de requisitos e
 * `ropa_records.base_gdpr` o texto livre da base do GDPR. Nada disso entra no hash: gravar não substitui pedido nenhum.
 */

/** Requisitos que são base legal: incisos do art. 7 e do art. 11 da LGPD e, quando o catálogo os tiver, art. 6 e art. 9 do GDPR. */
export const ehBaseDoCatalogo = (id: string) => /^(lgpd:art(7|11)|gdpr:art(6|9)):./.test(id);

/**
 * Subconsulta com os títulos das bases adicionais de `r` (alias de `ropa_records`), para quem procura "legítimo interesse" em qualquer
 * base (LIA exigida, painel do encarregado). NULL quando não há adicional.
 */
export const SQL_TITULOS_ADICIONAIS = `(SELECT group_concat(qa.titulo, ' | ') FROM tratamento_bases ba JOIN requisitos qa ON qa.id = ba.requisito_id WHERE ba.ropa_id = r.id AND ba.project_id = r.project_id)`;

export type BaseLida ={ requisito_id: string; referencia: string; titulo: string; observacao: string | null };
export type Bases = { principal: { id: string; referencia: string; titulo: string } | null; adicionais: BaseLida[]; base_gdpr: string | null };
type Falha = { ok: false; status: 400 | 404; error: string; invalidos?: string[] };

/** null = registro não é do projeto. */
export async function lerBases(db: D1Database, projectId: string, ropaId: string): Promise<Bases | null> {
  const r = await db.prepare(
    `SELECT r.base_legal_id AS id, q.referencia, q.titulo, r.base_gdpr FROM ropa_records r LEFT JOIN requisitos q ON q.id = r.base_legal_id
      WHERE r.id = ? AND r.project_id = ?`
  ).bind(ropaId, projectId).first<{ id: string | null; referencia: string | null; titulo: string | null; base_gdpr: string | null }>();
  if (!r) return null;
  const { results } = await db.prepare(
    `SELECT b.requisito_id, q.referencia, q.titulo, b.observacao FROM tratamento_bases b JOIN requisitos q ON q.id = b.requisito_id
      WHERE b.ropa_id = ? AND b.project_id = ? ORDER BY q.id`
  ).bind(ropaId, projectId).all<BaseLida>();
  return {
    principal: r.id && r.referencia ? { id: r.id, referencia: r.referencia, titulo: r.titulo ?? '' } : null,
    adicionais: results,
    base_gdpr: r.base_gdpr,
  };
}

/** `adicionais` (se veio) troca o conjunto; `base_gdpr` (se veio) troca o texto. Requisito fora das bases, inexistente ou igual à principal é 400. */
export async function salvarBases(
  db: D1Database, projectId: string, ropaId: string,
  corpo: { adicionais?: { requisito_id: string; observacao?: string | null }[]; base_gdpr?: string | null },
): Promise<Falha | { ok: true }> {
  const atual = await lerBases(db, projectId, ropaId);
  if (!atual) return { ok: false, status: 404, error: 'Registro do RoPA não encontrado' };
  const stmts: D1PreparedStatement[] = [];
  if (corpo.adicionais) {
    const ids = corpo.adicionais.map((a) => a.requisito_id);
    if (new Set(ids).size !== ids.length) return { ok: false, status: 400, error: 'Base adicional repetida' };
    if (atual.principal && ids.includes(atual.principal.id)) return { ok: false, status: 400, error: 'A base principal não entra de novo como adicional' };
    const { results } = await db.prepare('SELECT id FROM requisitos WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all<{ id: string }>();
    const existem = new Set(results.map((r) => r.id));
    const invalidos = ids.filter((x) => !existem.has(x) || !ehBaseDoCatalogo(x));
    if (invalidos.length) return { ok: false, status: 400, error: 'Requisito inexistente ou que não é base legal', invalidos };
    stmts.push(
      db.prepare('DELETE FROM tratamento_bases WHERE ropa_id = ? AND project_id = ?').bind(ropaId, projectId),
      ...corpo.adicionais.map((a) => db.prepare('INSERT INTO tratamento_bases (ropa_id, requisito_id, project_id, observacao) VALUES (?, ?, ?, ?)')
        .bind(ropaId, a.requisito_id, projectId, a.observacao || null)),
    );
  }
  if (corpo.base_gdpr !== undefined) {
    stmts.push(db.prepare('UPDATE ropa_records SET base_gdpr = ? WHERE id = ? AND project_id = ?').bind(corpo.base_gdpr || null, ropaId, projectId));
  }
  if (stmts.length) await db.batch(stmts);
  return { ok: true };
}

/** As bases adicionais e a do GDPR em texto, para o que é derivado (DPIA, relatório). */
export function basesEmTexto(b: Pick<Bases, 'adicionais' | 'base_gdpr'>): string[] {
  return [
    b.adicionais.length ? `Bases adicionais: ${b.adicionais.map((a) => `${a.referencia} - ${a.titulo}${a.observacao ? ` (${a.observacao})` : ''}`).join('; ')}.` : '',
    b.base_gdpr ? `GDPR: ${b.base_gdpr}.` : '',
  ].filter(Boolean);
}
