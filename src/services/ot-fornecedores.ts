// Fornecedor de OT (0116). Satélite: uma parte fornecedora do cadastro comum ganha papel, site e/ou fluxo no n.ot.
import { SQL_EH_FORNECEDOR } from './terceiros';

export type PapelOt = 'integrador' | 'fabricante' | 'acesso_remoto';
export interface LinhaFornecedor {
  id: string; parte_id: string; parte_nome: string; papel: PapelOt; ot_site_id: string | null; ot_fluxo_id: string | null;
  site_efetivo_id: string; created_at: string;
}
type Falha = { ok: false; status: 400 | 404 | 422; error: string };
const NAO_ACHADO = 'Alvo de OT não encontrado neste projeto.';

/** Site de um vínculo: o do site, ou o do fluxo. Preso ao projeto; site e fluxo removidos não valem. */
const SITE_DO_FLUXO = `SELECT f.site_id AS s FROM ot_fluxos f JOIN ot_sites s ON s.id = f.site_id AND s.project_id = f.project_id
  WHERE f.id = ? AND f.project_id = ? AND f.status = 'ativo' AND s.status = 'ativo'`;

/** `sitesPermitidosJson` obrigatório: o site efetivo (do site, ou do fluxo) precisa estar nele. Repetir o mesmo vínculo devolve o existente. */
export async function criarFornecedor(
  db: D1Database, projectId: string, v: { parte_id: string; papel: PapelOt; ot_site_id?: string; ot_fluxo_id?: string },
  criadoPor: string, sitesPermitidosJson: string,
): Promise<{ ok: true; id: string; criado: boolean } | Falha> {
  if (!v.ot_site_id && !v.ot_fluxo_id) return { ok: false, status: 400, error: 'Informe ot_site_id e/ou ot_fluxo_id.' };
  const parte = await db.prepare(`SELECT p.id FROM partes p WHERE p.id = ? AND p.project_id = ?`).bind(v.parte_id, projectId).first();
  if (!parte) return { ok: false, status: 404, error: 'Parte não encontrada neste projeto.' };
  if (!(await db.prepare(`SELECT 1 FROM partes p WHERE p.id = ? AND p.project_id = ? AND ${SQL_EH_FORNECEDOR}`).bind(v.parte_id, projectId).first()))
    return { ok: false, status: 422, error: 'Só uma organização fornecedora ativa pode ser ligada como fornecedor de OT.' };

  const doSite = v.ot_site_id ? (await db.prepare(`SELECT id AS s FROM ot_sites WHERE id = ? AND project_id = ? AND status = 'ativo'`).bind(v.ot_site_id, projectId).first<{ s: string }>())?.s : undefined;
  const doFluxo = v.ot_fluxo_id ? (await db.prepare(SITE_DO_FLUXO).bind(v.ot_fluxo_id, projectId).first<{ s: string }>())?.s : undefined;
  if ((v.ot_site_id && !doSite) || (v.ot_fluxo_id && !doFluxo)) return { ok: false, status: 404, error: NAO_ACHADO };
  if (doSite && doFluxo && doSite !== doFluxo) return { ok: false, status: 400, error: 'O fluxo não pertence ao site informado.' };
  const siteId = (doSite ?? doFluxo)!;
  if (!(await db.prepare(`SELECT 1 FROM json_each(?) WHERE value = ?`).bind(sitesPermitidosJson, siteId).first())) return { ok: false, status: 404, error: NAO_ACHADO };

  const id = crypto.randomUUID();
  const site = v.ot_site_id ?? null, fluxo = v.ot_fluxo_id ?? null;
  const r = await db.prepare(`INSERT INTO ot_fornecedores (id, project_id, parte_id, papel, ot_site_id, ot_fluxo_id, criado_por)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM ot_fornecedores WHERE project_id = ? AND parte_id = ? AND papel = ? AND ot_site_id IS ? AND ot_fluxo_id IS ?)`)
    .bind(id, projectId, v.parte_id, v.papel, site, fluxo, criadoPor, projectId, v.parte_id, v.papel, site, fluxo).run();
  if ((r.meta.changes ?? 0) > 0) return { ok: true, id, criado: true };
  const ja = await db.prepare(`SELECT id FROM ot_fornecedores WHERE project_id = ? AND parte_id = ? AND papel = ? AND ot_site_id IS ? AND ot_fluxo_id IS ?`)
    .bind(projectId, v.parte_id, v.papel, site, fluxo).first<{ id: string }>();
  return { ok: true, id: ja!.id, criado: false };
}

/** Só o que o escopo de sites alcança; NULL de site resolve pelo fluxo; site, fluxo ou parte removidos escondem a linha. */
export async function lerFornecedores(
  db: D1Database, projectId: string, sitesPermitidosJson: string, filtro: { ot_site_id?: string; parte_id?: string } = {},
): Promise<LinhaFornecedor[]> {
  const w: string[] = []; const b: unknown[] = [];
  if (filtro.ot_site_id) { w.push('AND COALESCE(s.id, f.site_id) = ?'); b.push(filtro.ot_site_id); }
  if (filtro.parte_id) { w.push('AND o.parte_id = ?'); b.push(filtro.parte_id); }
  const { results } = await db.prepare(`SELECT o.id, o.parte_id, p.nome AS parte_nome, o.papel, o.ot_site_id, o.ot_fluxo_id, COALESCE(s.id, f.site_id) AS site_efetivo_id, o.created_at
      FROM ot_fornecedores o
      JOIN partes p ON p.id = o.parte_id AND p.project_id = o.project_id
      LEFT JOIN ot_sites s ON s.id = o.ot_site_id AND s.status = 'ativo'
      LEFT JOIN ot_fluxos f ON f.id = o.ot_fluxo_id AND f.status = 'ativo'
      LEFT JOIN ot_sites sf ON sf.id = f.site_id AND sf.status = 'ativo'
    WHERE o.project_id = ? ${w.join(' ')}
      AND (o.ot_site_id IS NULL OR s.id IS NOT NULL) AND (o.ot_fluxo_id IS NULL OR sf.id IS NOT NULL)
      AND COALESCE(s.id, f.site_id) IN (SELECT value FROM json_each(?))
    ORDER BY o.created_at, o.id`).bind(projectId, ...b, sitesPermitidosJson).all<LinhaFornecedor>();
  return results;
}

/** Quem tem site restrito só remove vínculo cujo site efetivo está no escopo (site removido: sem escopo, só o consultor irrestrito alcança via CASCADE). */
export async function apagarFornecedor(db: D1Database, projectId: string, id: string, sitesPermitidosJson: string): Promise<boolean> {
  const r = await db.prepare(`DELETE FROM ot_fornecedores WHERE id = ? AND project_id = ?
      AND COALESCE(ot_site_id, (SELECT site_id FROM ot_fluxos WHERE id = ot_fornecedores.ot_fluxo_id)) IN (SELECT value FROM json_each(?))`)
    .bind(id, projectId, sitesPermitidosJson).run();
  return (r.meta.changes ?? 0) > 0;
}
