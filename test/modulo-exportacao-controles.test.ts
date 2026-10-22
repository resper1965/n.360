import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

// A trava de módulo por pessoa vale também no export completo, em GET /controls e em GET /client/dashboard.
const req = async (caminho: string, h: Record<string, string>) => worker.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv());

describe('trava de módulo: export, controles e painel do cliente', () => {
  let soIso: Record<string, string>, soPriv: Record<string, string>, ambos: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-mx', 'MX', 'x', 'c', 'Active', 'org_ness')`),
      env.DB.prepare(`INSERT OR IGNORE INTO projeto_modulos (project_id, modulo) VALUES ('p-mx', 'iso'), ('p-mx', 'privacy')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
        ('mx-iso', 'mx-iso@ex.lat', 'x', 'I', 'org_user', 'p-mx', 'org_ness'),
        ('mx-priv', 'mx-priv@ex.lat', 'x', 'P', 'org_user', 'p-mx', 'org_ness'),
        ('mx-ambos', 'mx-ambos@ex.lat', 'x', 'A', 'org_user', 'p-mx', 'org_ness')`),
      env.DB.prepare(`DELETE FROM usuario_modulos WHERE user_id IN ('mx-iso', 'mx-priv', 'mx-ambos')`),
      env.DB.prepare(`INSERT INTO usuario_modulos (user_id, modulo) VALUES ('mx-iso', 'iso'), ('mx-priv', 'privacy'), ('mx-ambos', 'iso'), ('mx-ambos', 'privacy')`),
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES ('ctl-mx', 'p-mx', 'ISO 27001', 'A.5.1 Política', 'texto da política')`),
    ]);
    const s = (id: string) => sessionFor({ id, email: `${id}@ex.lat`, role: 'org_user', client_project_id: 'p-mx', org_id: 'org_ness' });
    [soIso, soPriv, ambos] = await Promise.all([s('mx-iso'), s('mx-priv'), s('mx-ambos')]);
  });

  it('export completo exige todos os módulos do projeto', async () => {
    expect((await req('/api/v1/projects/p-mx/export', soIso)).status).toBe(403);
    expect((await req('/api/v1/projects/p-mx/export', soPriv)).status).toBe(403);
    expect((await req('/api/v1/projects/p-mx/export', ambos)).status).toBe(200);
  });

  it('GET /controls vem vazio para quem não tem o n.iso', async () => {
    expect(await (await req('/api/v1/controls', soPriv)).json()).toEqual([]);
    expect(((await (await req('/api/v1/controls', soIso)).json()) as unknown[]).length).toBe(1);
  });

  it('GET /client/dashboard sem fases e controles para quem não tem o n.iso', async () => {
    const r = (await (await req('/api/v1/client/dashboard', soPriv)).json()) as { controls: unknown[]; phases: unknown[] };
    expect(r.controls).toEqual([]);
    expect(r.phases).toEqual([]);
    const ok = (await (await req('/api/v1/client/dashboard', soIso)).json()) as { controls: unknown[] };
    expect(ok.controls.length).toBe(1);
  });
});
