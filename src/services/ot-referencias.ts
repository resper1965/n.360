// Referência núcleo → OT (0115). Satélite: risco/ação/incidente apontam para site/ativo/desvio do n.ot.
export type AlvoNucleo = { tipo: 'risk' | 'acao' | 'incidente'; id: string };
export type AlvoOt = { ot_site_id?: string; ot_ativo_id?: string; ot_desvio_id?: string };
export interface LinhaReferencia {
  id: string; project_id: string; risk_id: string | null; acao_id: string | null; incidente_id: string | null;
  ot_site_id: string | null; ot_ativo_id: string | null; ot_desvio_id: string | null; criado_por: string; created_at: string;
}
type Falha = { ok: false; status: 400 | 404 | 409; error: string };

const tipoValido = (t: unknown): t is keyof typeof TABELA => typeof t === 'string' && Object.hasOwn(TABELA, t);
const TABELA = { risk: ['risks', 'risk_id'], acao: ['corrective_actions', 'acao_id'], incidente: ['incidentes', 'incidente_id'] } as const;

/** `sitesPermitidosJson` (obrigatório, P0-4): o site do alvo de OT precisa estar nele. */
export async function criarReferencia(
  db: D1Database, projectId: string, nucleo: AlvoNucleo, ot: AlvoOt, criadoPor: string, sitesPermitidosJson: string,
): Promise<{ ok: true; id: string } | Falha> {
  const alvos = [ot.ot_site_id, ot.ot_ativo_id, ot.ot_desvio_id].filter(Boolean);
  if (alvos.length !== 1) return { ok: false, status: 400, error: 'Informe exatamente um alvo de OT: site, ativo ou desvio.' };
  if (!tipoValido(nucleo.tipo)) return { ok: false, status: 400, error: 'Tipo de alvo inválido' };
  const [tab, col] = TABELA[nucleo.tipo];
  if (!(await db.prepare(`SELECT 1 FROM ${tab} WHERE id = ? AND project_id = ?`).bind(nucleo.id, projectId).first()))
    return { ok: false, status: 404, error: 'Item do núcleo não encontrado neste projeto.' };

  let siteId: string | null | undefined;
  if (ot.ot_site_id) siteId = (await db.prepare(`SELECT id AS s FROM ot_sites WHERE id = ? AND project_id = ? AND status = 'ativo'`).bind(ot.ot_site_id, projectId).first<{ s: string }>())?.s;
  else if (ot.ot_ativo_id) siteId = (await db.prepare(`SELECT a.site_id AS s FROM ot_ativos a JOIN ot_sites s ON s.id = a.site_id AND s.project_id = a.project_id WHERE a.id = ? AND a.project_id = ? AND a.status = 'ativo' AND s.status = 'ativo'`).bind(ot.ot_ativo_id, projectId).first<{ s: string }>())?.s;
  else siteId = (await db.prepare(`SELECT site_id AS s FROM ot_desvios WHERE id = ? AND project_id = ?`).bind(ot.ot_desvio_id, projectId).first<{ s: string }>())?.s;
  if (!siteId) return { ok: false, status: 404, error: 'Alvo de OT não encontrado neste projeto.' };
  if (!(await db.prepare(`SELECT 1 FROM json_each(?) WHERE value = ?`).bind(sitesPermitidosJson, siteId).first()))
    return { ok: false, status: 404, error: 'Alvo de OT não encontrado neste projeto.' };

  // O CHECK exige site ou ativo: o desvio sempre grava também o site dele.
  const siteGravado = ot.ot_site_id ?? (ot.ot_desvio_id ? siteId : null);
  const id = crypto.randomUUID();
  try {
    await db.prepare(`INSERT INTO ot_referencias (id, project_id, ${col}, ot_site_id, ot_ativo_id, ot_desvio_id, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, projectId, nucleo.id, siteGravado, ot.ot_ativo_id ?? null, ot.ot_desvio_id ?? null, criadoPor).run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e))) return { ok: false, status: 409, error: 'Este desvio já está ligado a um item.' };
    throw e;
  }
  return { ok: true, id };
}

export async function lerReferencias(
  db: D1Database, projectId: string,
  filtro: { nucleo?: AlvoNucleo; ot_site_id?: string; ot_ativo_id?: string }, sitesPermitidosJson: string,
): Promise<LinhaReferencia[]> {
  const w: string[] = []; const b: unknown[] = [];
  if (filtro.nucleo && !tipoValido(filtro.nucleo.tipo)) return [];
  if (filtro.nucleo) { w.push(`r.${TABELA[filtro.nucleo.tipo][1]} = ?`); b.push(filtro.nucleo.id); }
  if (filtro.ot_site_id) { w.push('(r.ot_site_id = ? OR r.ot_ativo_id IN (SELECT id FROM ot_ativos WHERE site_id = ? AND project_id = ?))'); b.push(filtro.ot_site_id, filtro.ot_site_id, projectId); }
  if (filtro.ot_ativo_id) { w.push('r.ot_ativo_id = ?'); b.push(filtro.ot_ativo_id); }
  // O site da referência vem do site, do ativo ou do desvio; site/ativo removido esconde a linha.
  const { results } = await db.prepare(`SELECT r.* FROM ot_referencias r
      LEFT JOIN ot_sites s ON s.id = r.ot_site_id
      LEFT JOIN ot_ativos a ON a.id = r.ot_ativo_id
      LEFT JOIN ot_sites sa ON sa.id = a.site_id
      LEFT JOIN ot_desvios d ON d.id = r.ot_desvio_id
    WHERE r.project_id = ? ${w.map((x) => 'AND ' + x).join(' ')}
      AND (r.ot_site_id IS NULL OR s.status = 'ativo') AND (r.ot_ativo_id IS NULL OR (a.status = 'ativo' AND sa.status = 'ativo'))
      AND COALESCE(s.id, a.site_id, d.site_id) IN (SELECT value FROM json_each(?))
    ORDER BY r.created_at, r.id`).bind(projectId, ...b, sitesPermitidosJson).all<LinhaReferencia>();
  return results;
}

export async function apagarReferencia(db: D1Database, projectId: string, id: string): Promise<boolean> {
  const r = await db.prepare(`DELETE FROM ot_referencias WHERE id = ? AND project_id = ?`).bind(id, projectId).run();
  return (r.meta.changes ?? 0) > 0;
}
