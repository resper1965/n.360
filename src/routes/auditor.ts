import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { logAudit, requireResourceAccess, erro500, sha256Hex, refForaDoProjeto, genId } from '../helpers';
import { validateBody, auditorResponseSchema, auditorNoteSchema } from '../schemas';

export const auditorApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

export type TokenAuditor = { id: string; project_id: string; expires_at: string };

/**
 * O token do link do auditor externo, procurado pelo SHA-256 (o banco não guarda o token, migration
 * 0045). Vencido ou revogado não vale. `datetime(expires_at)` normaliza o formato: linha gravada em
 * ISO 8601 ('2026-11-06T12:00:00.000Z') comparada como texto com `datetime('now')`
 * ('2026-11-06 12:00:00') valia até o fim do dia, porque 'T' > ' '.
 */
export async function tokenDoAuditor(db: D1Database, token: string): Promise<TokenAuditor | null> {
  return db.prepare(
    `SELECT id, project_id, expires_at FROM auditor_tokens
      WHERE token_hash = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')`
  ).bind(await sha256Hex(token)).first<TokenAuditor>();
}

auditorApp.put('/auditor-notes/:id/respond', async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    // A nota carrega o projeto do auditor externo. Sem esta checagem, qualquer
    // sessão autenticada respondia a nota de qualquer cliente só com o id dela
    // — a sonda gravou uma resposta na nota do outro tenant e recebeu 200.
    await requireResourceAccess(c.env.DB, 'auditor_notes', id, user);
    const v = await validateBody(c, auditorResponseSchema);
    if (!v.success) return v.response;
    const { response } = v.data;
    if (!response) return c.json({ error: 'response is required' }, 400);
    
    await c.env.DB.prepare(`
      UPDATE auditor_notes 
      SET response = ?, responded_by = ?, responded_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(response, user.id, id).run();
    
    await logAudit(c.env.DB, 'auditor_note.responded', user.email, `Nota de auditor ${id} respondida`);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao responder nota de auditor', e);
  }
});

/**
 * Nota do agente AUDITOR remoto (MCP). O auditor externo grava pelo portal, com o token do link; a equipe não grava
 * nota de auditor (quem implementa não audita). O projeto vem da rota, já conferido pelo projectAccessMiddleware
 * contra o projeto da concessão; `auditor_token` guarda a concessão, nunca um segredo.
 */
auditorApp.post('/projects/:projectId/auditor-notes', async (c) => {
  const user = c.get('user');
  const agente = c.env.AGENTE;
  if (!agente || user.agente_papel !== 'auditor') {
    return c.json({ error: 'Forbidden: nota de auditor é do auditor (portal do auditor externo ou agente auditor)' }, 403);
  }
  try {
    const projectId = c.req.param('projectId');
    const v = await validateBody(c, auditorNoteSchema);
    if (!v.success) return v.response;
    const { control_id, note_type, content } = v.data;
    const fora = await refForaDoProjeto(c.env.DB, projectId, { control_id }, ['control_id']);
    if (fora) return c.json({ error: `${fora} inexistente ou de outro projeto` }, 400);
    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO auditor_notes (id, project_id, auditor_token, control_id, note_type, content) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, projectId, `agente:${agente.concessaoId}`, control_id || null, note_type || 'question', content).run();
    await logAudit(c.env.DB, 'auditor_note.created', user.email, `Nota de auditor ${id} criada`, '', c.req.header('CF-Connecting-IP') ?? '', projectId);
    return c.json({ ok: true, id });
  } catch (e) {
    return erro500(c, 'Falha ao criar nota de auditor', e);
  }
});

auditorApp.get('/projects/:id/auditor-notes', async (c) => {
  try {
    const projectId = c.req.param('id');
    const notes = await c.env.DB.prepare(`
      SELECT n.*, cc.standard as control_standard, cc.title as control_title 
      FROM auditor_notes n
      LEFT JOIN compliance_controls cc ON n.control_id = cc.id AND cc.project_id = n.project_id
      WHERE n.project_id = ? 
      ORDER BY n.created_at DESC
    `).bind(projectId).all();
    return c.json({ ok: true, notes: notes.results || [] });
  } catch (e: any) {
    return erro500(c, 'Falha ao buscar notas', e);
  }
});
