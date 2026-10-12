import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, habilitarPrivacy, concederModulos } from './helpers/d1';

/** Chat por mÃ³dulo: o prompt de sistema segue o mÃ³dulo pedido, e o mÃ³dulo tem de ser do projeto E da pessoa. IA simulada. */
describe('POST /projects/:id/chat com modulo', () => {
  let prompts: string[];
  const envComIa = () => ({ ...env, AI: { run: async (_m: string, o: { messages: { role: string; content: string }[] }) => { prompts.push(o.messages[0].content); return { response: 'ok' }; } } }) as any;
  const chat = (h: Record<string, string>, corpo: unknown, id = 'p-chat') =>
    worker.fetch(new Request(`http://localhost/api/v1/projects/${id}/chat`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }), envComIa());
  let admin: Record<string, string>;
  let soIso: Record<string, string>;
  let soPrivacy: Record<string, string>;
  let semModulo: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-chat','Cliente A','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-iso','Cliente B','ISO 27001','controller','Active')`),
    ]);
    await habilitarPrivacy('p-chat');
    admin = await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'platform_admin' });
    soIso = await sessionFor({ id: 'u-iso', email: 'iso@ness.lat', role: 'consultor' });
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-iso','iso@ness.lat','x','Iso','consultor')`).run();
    await concederModulos('u-iso', ['iso']);
    soPrivacy = await sessionFor({ id: 'u-pri', email: 'pri@ness.lat', role: 'consultor' });
    semModulo = await sessionFor({ id: 'u-nada', email: 'nada@ness.lat', role: 'consultor' });
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-pri','pri@ness.lat','x','Pri','consultor'), ('u-nada','nada@ness.lat','x','Nada','consultor')`),
    ]);
    // o gatilho usuario_modulos_padrao dá módulos à conta nova: parte-se do zero para o caso.
    await env.DB.prepare(`DELETE FROM usuario_modulos WHERE user_id IN ('u-pri','u-nada')`).run();
    await concederModulos('u-pri', ['privacy']);
    await env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-chat','C','pri@ness.lat','consultor','C'), ('p-chat','C','nada@ness.lat','consultor','C')`).run();
    await env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-chat','C','iso@ness.lat','consultor','C'), ('p-iso','C','iso@ness.lat','consultor','C')`).run();
  });

  beforeEach(() => { prompts = []; });

  it('privacy usa o prompt de privacidade (LGPD, sem prazo inventado)', async () => {
    const r = await chat(admin, { message: 'oi', modulo: 'privacy' });
    expect(r.status).toBe(200);
    expect(prompts[0]).toMatch(/LGPD/);
    expect(prompts[0]).toMatch(/ANPD/);
    expect(prompts[0]).toMatch(/parametros_legais/);
    expect(prompts[0]).not.toMatch(/ISO 27001/);
  });

  it('sem modulo (ou iso) mantÃ©m o prompt atual', async () => {
    for (const corpo of [{ message: 'oi' }, { message: 'oi', modulo: 'iso' }]) {
      expect((await chat(admin, corpo)).status).toBe(200);
    }
    expect(prompts).toHaveLength(2);
    for (const p of prompts) expect(p).toMatch(/ISO 27001/);
  });

  it('sem modulo, quem só tem o n.privacy cai no prompt de privacidade (200)', async () => {
    const r = await chat(soPrivacy, { message: 'oi' });
    expect(r.status).toBe(200);
    expect(prompts[0]).toMatch(/LGPD/);
  });

  it('sem modulo e sem nenhum módulo em comum, 403', async () => {
    expect((await chat(semModulo, { message: 'oi' })).status).toBe(403);
    expect(prompts).toHaveLength(0);
  });

  it('modulo iso explícito sem o n.iso, 403', async () => {
    expect((await chat(soPrivacy, { message: 'oi', modulo: 'iso' })).status).toBe(403);
    expect(prompts).toHaveLength(0);
  });

  it('modulo desconhecido responde 400', async () => {
    expect((await chat(admin, { message: 'oi', modulo: 'x' })).status).toBe(400);
    expect(prompts).toHaveLength(0);
  });

  it('pessoa sem o n.privacy recebe 403, mesmo no projeto que o tem', async () => {
    const r = await chat(soIso, { message: 'oi', modulo: 'privacy' });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toBe('VocÃª nÃ£o tem acesso ao n.privacy');
    expect(prompts).toHaveLength(0);
  });

  it('projeto sem o n.privacy recebe 403, mesmo para quem tem o mÃ³dulo', async () => {
    const r = await chat(admin, { message: 'oi', modulo: 'privacy' }, 'p-iso');
    expect(r.status).toBe(403);
    expect(prompts).toHaveLength(0);
  });
});
