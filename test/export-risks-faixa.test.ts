import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, designarConsultor, habilitarPrivacy } from './helpers/d1';

const SO_PRIVACY = 'ex-priv';
const COM_ISO = 'ex-iso';
const chamar = (h: Record<string, string>, caminho: string) =>
  app.fetch(new Request('http://localhost' + caminho, { method: 'GET', headers: h }), workerEnv());
let consultor: Record<string, string>;
beforeAll(async () => {
  await applySchema();
  for (const p of [SO_PRIVACY, COM_ISO]) {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(p).run();
    await designarConsultor('cons@ness.lat', p);
  }
  await env.DB.prepare(`DELETE FROM projeto_modulos WHERE project_id = ? AND modulo = 'iso'`).bind(SO_PRIVACY).run();
  await habilitarPrivacy(SO_PRIVACY);
  consultor = await sessionFor({ id: 'cons:cons@ness.lat', email: 'cons@ness.lat', role: 'consultor' });
});
describe('exportação de riscos', () => {
  it('projeto só com n.privacy não baixa os riscos do n.iso', async () => {
    const r = await chamar(consultor, `/api/v1/projects/${SO_PRIVACY}/export/risks`);
    expect(r.status).toBe(403);
  });
  it('projeto com n.iso baixa', async () => {
    const r = await chamar(consultor, `/api/v1/projects/${COM_ISO}/export/risks`);
    expect(r.status).toBe(200);
  });
  it('as outras exportações continuam do núcleo (projeto só n.privacy não é barrado pela faixa)', async () => {
    const r = await chamar(consultor, `/api/v1/projects/${SO_PRIVACY}/export/vendors`);
    expect(r.status).not.toBe(403);
  });
});
