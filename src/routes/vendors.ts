import { Hono } from 'hono';
import { normalizarNome } from '../services/nomes';
import { SQL_EH_FORNECEDOR } from '../services/terceiros';
import { Bindings, Variables } from '../index';

import { genId, logAudit, requireResourceAccess, erro500 } from '../helpers';
import { validateBody, createVendorSchema, vendorUpdateSchema } from '../schemas';

export const vendorsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
export const projectVendorsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


function calculateTrustScore(body: any): number {
  let score = 0;
  if (body.has_iso27001) score += 20;
  if (body.has_iso27701) score += 15;
  if (body.has_soc2) score += 15;
  if (body.has_mfa) score += 10;
  if (body.has_encryption) score += 15;
  if (body.has_backup) score += 10;
  if (body.has_incident_plan) score += 10;
  if (body.has_pentest) score += 10;
  if (body.trust_center_url && body.trust_center_url.trim().length > 0) score += 5;
  if (body.dpa_signed || (body.dpa_url && body.dpa_url.trim().length > 0)) score += 10;
  return Math.min(100, score);
}

function diligenceLevel(trustScore: number): string {
  if (trustScore > 90) return 'Low';
  if (trustScore > 60) return 'Medium';
  return 'High';
}

// ─── Direct Vendor Operations (/api/v1/vendors) ────────────────────────────

vendorsApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'vendors', id, c.get('user'));
    const v = await validateBody(c, vendorUpdateSchema);
    if (!v.success) return v.response;
    const body = v.data as any;
    const nome = String(body.name).trim();
    const ts = calculateTrustScore(body);
    const dl = diligenceLevel(ts);

    await c.env.DB.prepare(
      `UPDATE vendors SET name=?, category=?, has_iso27001=?, has_iso27701=?, has_soc2=?, trust_score=?, diligence_level=?, dpa_signed=?, notes=CASE WHEN ? THEN ? ELSE notes END, status=CASE WHEN ? THEN ? ELSE status END, has_mfa=?, has_encryption=?, has_backup=?, has_incident_plan=?, has_pentest=?, trust_center_url=?, dpa_url=?, attached_certifications=? WHERE id=?`
    ).bind(
      // observações e status ausentes no corpo ficam como estão: a edição do n.iso não os envia
      nome, body.category ?? null, body.has_iso27001 ?? 0, body.has_iso27701 ?? 0, body.has_soc2 ?? 0, ts, dl, body.dpa_signed ?? 0,
      body.notes !== undefined ? 1 : 0, body.notes ?? null, body.status !== undefined ? 1 : 0, body.status ?? 'Active',
      body.has_mfa ?? 0, body.has_encryption ?? 0, body.has_backup ?? 0, body.has_incident_plan ?? 0, body.has_pentest ?? 0, body.trust_center_url ?? null, body.dpa_url ?? null, body.attached_certifications ?? null,
      id
    ).run();
    // o nome é da parte (o gatilho vendor_nome_da_parte devolve o mesmo nome ao perfil)
    await c.env.DB.prepare('UPDATE partes SET nome = ?, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT parte_id FROM vendors WHERE id = ?) AND nome <> ?')
      .bind(nome, id, nome).run();

    const proj = await c.env.DB.prepare('SELECT project_id FROM vendors WHERE id = ?').bind(id).first<{ project_id: string | null }>();
    await logAudit(c.env.DB, 'vendor.updated', c.get('user')?.email ?? 'system', `Vendor ${id} atualizado`, '', '', proj?.project_id ?? undefined);
    return c.json({ ok: true, id, diligence_level: dl, trust_score: ts });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return erro500(c, 'Falha ao atualizar vendor', e);
  }

});

vendorsApp.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'vendors', id, c.get('user'));
    const v = await c.env.DB.prepare('SELECT project_id, name FROM vendors WHERE id = ?').bind(id).first<{ project_id: string | null; name: string }>();
    // sai só o perfil de segurança: a parte segue fornecedor nos dois módulos até ser inativada em Partes
    await c.env.DB.prepare('DELETE FROM vendors WHERE id = ?').bind(id).run();
    await logAudit(c.env.DB, 'vendor.deleted', c.get('user')?.email ?? 'system', `Avaliação de segurança de ${v?.name ?? id} removida`, '', '', v?.project_id ?? undefined);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return erro500(c, 'Falha ao excluir vendor', e);
  }
});

// ─── Project Vendor Operations (/api/v1/projects/:projectId/vendors) ──────

/**
 * Fornecedor listado = parte que é fornecedor (`SQL_EH_FORNECEDOR`), com o perfil de segurança (`vendors`) quando houver: sem perfil, `id` e as
 * colunas do perfil vêm NULL. Colunas listadas uma a uma para não haver nome repetido no resultado. A lista e o CSV usam a mesma consulta.
 */
export const SQL_VENDORS_VISIVEIS = `SELECT v.id, p.project_id, p.nome AS name, v.category, v.has_iso27001, v.has_iso27701, v.has_soc2, v.trust_score,
    v.diligence_level, v.dpa_signed, v.last_assessment_date, v.notes, v.status, v.has_mfa, v.has_encryption, v.has_backup, v.has_incident_plan,
    v.has_pentest, v.trust_center_url, v.dpa_url, v.attached_certifications, v.created_at, p.id AS parte_id
  FROM partes p LEFT JOIN vendors v ON v.parte_id = p.id WHERE p.project_id = ? AND ${SQL_EH_FORNECEDOR}`;

projectVendorsApp.get('/', async (c) => {
  const projectId = c.req.param('projectId');
  const { results } = await c.env.DB.prepare(
    `${SQL_VENDORS_VISIVEIS} ORDER BY p.nome`
  ).bind(projectId).all();
  return c.json({ ok: true, vendors: results });
});

projectVendorsApp.post('/', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const valid = await validateBody(c, createVendorSchema);
    if (!valid.success) return valid.response;
    const body = valid.data as any;
    const ts = calculateTrustScore(body);
    const dl = diligenceLevel(ts);
    const db = c.env.DB;

    // O fornecedor é a parte organização ATIVA do projeto: reaproveita a de mesmo nome (sem caixa e sem espaço nas pontas) ou cria.
    // Parte inativa de mesmo nome não serve: o perfil ficaria invisível na lista.
    // Com `parte_id` (a tela, na linha do fornecedor sem avaliação), a parte é essa, conferida no projeto; sem ele, a de mesmo nome.
    if (body.parte_id !== undefined && typeof body.parte_id !== 'string') return c.json({ error: 'parte_id inválido' }, 400);
    const achada = body.parte_id
      ? await db.prepare(`SELECT p.id FROM partes p WHERE p.id = ? AND p.project_id = ? AND ${SQL_EH_FORNECEDOR}`).bind(body.parte_id, projectId).first<{ id: string }>()
      : await db.prepare(`SELECT id FROM partes WHERE project_id = ? AND tipo = 'organizacao' AND status = 'ativa' AND lower(trim(nome)) = lower(trim(?)) ORDER BY created_at, rowid LIMIT 1`)
        .bind(projectId, body.name).first<{ id: string }>();
    if (body.parte_id && !achada) return c.json({ error: 'Fornecedor não encontrado neste projeto' }, 404);
    // perfil que já existe não é sobrescrito pelo POST (corpo parcial zeraria os campos): edição é pelo PUT
    const existente = achada ? await db.prepare('SELECT id FROM vendors WHERE parte_id = ?').bind(achada.id).first<{ id: string }>() : null;
    if (existente) return c.json({ error: 'Fornecedor já cadastrado neste projeto', id: existente.id }, 409);
    const parteId = achada?.id ?? crypto.randomUUID();
    const r = await db.batch([
      ...(achada ? [] : [db.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES (?, ?, 'organizacao', ?)`).bind(parteId, projectId, normalizarNome(body.name))]),
      db.prepare(`INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, ?, ?, 'terceiro', 'projeto', ?)`).bind(crypto.randomUUID(), projectId, parteId, projectId),
      // o gatilho vendor_perfil_do_terceiro já cria o perfil; isto cobre o vínculo que já existia sem perfil
      db.prepare('INSERT OR IGNORE INTO vendors (id, project_id, name, parte_id) VALUES (?, ?, ?, ?)').bind(genId(), projectId, body.name.trim(), parteId),
      db.prepare(
        `UPDATE vendors SET category=?, has_iso27001=?, has_iso27701=?, has_soc2=?, trust_score=?, diligence_level=?, dpa_signed=?, notes=?, has_mfa=?, has_encryption=?, has_backup=?, has_incident_plan=?, has_pentest=?, trust_center_url=?, dpa_url=?, attached_certifications=? WHERE parte_id=?`
      ).bind(
        body.category ?? null, body.has_iso27001 ?? 0, body.has_iso27701 ?? 0, body.has_soc2 ?? 0, ts, dl, body.dpa_signed ?? 0, body.notes ?? null,
        body.has_mfa ?? 0, body.has_encryption ?? 0, body.has_backup ?? 0, body.has_incident_plan ?? 0, body.has_pentest ?? 0, body.trust_center_url ?? null, body.dpa_url ?? null, body.attached_certifications ?? null,
        parteId
      ),
      db.prepare('SELECT id FROM vendors WHERE parte_id = ?').bind(parteId),
    ]);
    const id = (r[r.length - 1].results[0] as { id: string }).id;

    await logAudit(c.env.DB, 'vendor.created', c.get('user')?.email ?? 'system', `Vendor ${body.name} created for project ${projectId}`, '', '', projectId);
    return c.json({ ok: true, id, diligence_level: dl, trust_score: ts }, 201);
  } catch (e: any) {
    return erro500(c, 'Falha ao criar vendor', e);
  }
});
