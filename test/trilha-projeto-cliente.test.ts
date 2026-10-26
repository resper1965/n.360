import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, resetSessions, workerEnv, sessionFor } from './helpers/d1';

/**
 * Trilha do projeto (P0-8): o cliente lê quem fez o quê e quando, mas não o texto livre (`details`,
 * `justification`, antes/depois) nem IP e navegador; a consultoria vê tudo. O filtro é por `project_id`:
 * linha sem projeto que só cita o id no texto não aparece em trilha nenhuma.
 */
const A = 'proj-trilha-a';
const B = 'proj-trilha-b';
const chamar = (caminho: string, h: Record<string, string>) =>
  app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv() as any);
const lerTrilha = async (p: string, h: Record<string, string>) => (await (await chamar(`/api/v1/projects/${p}/audit-trail`, h)).json()) as any[];

let pa: Record<string, string>;
let cli: Record<string, string>;
beforeEach(async () => {
  await applySchema();
  await resetData();
  await resetSessions();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Cliente A', 'ISO 27001', 'controller', 'Active')`).bind(A),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Cliente B', 'ISO 27001', 'controller', 'Active')`).bind(B),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id, ativo) VALUES ('u-cli-t','cli-t@cliente.com','x','Cliente','org_user',?,'org_ness',1)`).bind(A),
    env.DB.prepare(`INSERT INTO audit_logs (id, action, actor, details, justification, ip_address, project_id, field, old_value, new_value)
      VALUES ('tr-a1','teste.trilha','quem@x.com','segredo de A','porque sim','1.2.3.4',?,'campo','antes','depois')`).bind(A),
    env.DB.prepare(`INSERT INTO audit_logs (id, action, actor, details, project_id) VALUES ('tr-b1','teste.trilha.b','quem@x.com','so de B',?)`).bind(B),
    env.DB.prepare(`INSERT INTO audit_logs (id, action, actor, details, project_id) VALUES ('tr-n1','teste.trilha.global','quem@x.com',?,NULL)`).bind(`cita ${A} no texto`),
  ]);
  pa = await sessionFor({ id: 'u-pa-t', email: 'pa-t@ness.lat', role: 'platform_admin', org_id: 'org_ness' });
  cli = await sessionFor({ id: 'u-cli-t', email: 'cli-t@cliente.com', role: 'org_user', client_project_id: A });
});

describe('GET /projects/:id/audit-trail', () => {
  it('cliente e consultoria leem a mesma trilha: o cliente sem details, justificativa, antes/depois, IP', async () => {
    const eq = (await lerTrilha(A, pa)).find((x) => x.id === 'tr-a1');
    expect(eq).toMatchObject({ details: 'segredo de A', justification: 'porque sim', ip_address: '1.2.3.4', old_value: 'antes', new_value: 'depois' });

    const r = await chamar(`/api/v1/projects/${A}/audit-trail`, cli);
    expect(r.status).toBe(200);
    const doCli = ((await r.json()) as any[]).find((x) => x.id === 'tr-a1');
    expect(doCli).toMatchObject({ action: 'teste.trilha', actor: 'quem@x.com', field: 'campo' });
    for (const k of ['details', 'justification', 'old_value', 'new_value', 'ip_address', 'user_agent']) expect(doCli).not.toHaveProperty(k);
  });

  it('isola por project_id: nada de B em A, e linha sem projeto que só cita o id não entra', async () => {
    for (const h of [pa, cli]) {
      const ids = (await lerTrilha(A, h)).map((x) => x.id);
      expect(ids).toContain('tr-a1');
      expect(ids).not.toContain('tr-b1');
      expect(ids).not.toContain('tr-n1');
    }
    expect((await lerTrilha(B, pa)).map((x) => x.id)).toEqual(['tr-b1']);
    // O cliente de A não lê a trilha de B.
    expect((await chamar(`/api/v1/projects/${B}/audit-trail`, cli)).status).toBe(403);
  });
});
