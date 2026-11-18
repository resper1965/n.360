import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

// Onda 4, PR5: o assistente encadeado só usa rotas que já existem. Este arquivo trava o que ele precisa delas:
// P0-1 (ot nunca por padrão; só marcado), a organização direta sem conta de cliente (onda 1, decisão 8) e a designação do consultor.
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, h: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv() as any);
const modulosDe = async (email: string) => (await env.DB.prepare(`SELECT m.modulo FROM usuario_modulos m JOIN users u ON u.id = m.user_id WHERE u.email = ? ORDER BY m.modulo`).bind(email).all<{ modulo: string }>()).results.map((r) => r.modulo);
const S: Record<string, Record<string, string>> = {};
const P: Record<string, string> = {};

async function orgComAdmin(tipo: 'consultoria' | 'direta', slug: string) {
  const r = await chamar('POST', '/api/v1/platform/orgs', S.pa, { nome: `Org ${slug}`, slug, adminEmail: `admin@${slug}.lat`, adminNome: 'Admin', tipo,
    modulos: ['iso', 'privacy', 'ot'], maxProjetos: 5, maxUsuarios: 20, termoVersao: 'v1', ...(tipo === 'consultoria' ? { prefixoProposta: slug.slice(0, 3).toUpperCase() } : {}) });
  expect(r.status).toBe(201);
  const admin = await env.DB.prepare(`SELECT id, org_id FROM users WHERE email = ?`).bind(`admin@${slug}.lat`).first<{ id: string; org_id: string }>();
  S[slug] = await sessionFor({ id: admin!.id, email: `admin@${slug}.lat`, role: 'consultoria_admin', org_id: admin!.org_id });
  const pj = await chamar('POST', '/api/v1/projects', S[slug], { client_name: `Cliente ${slug}`, modulos: ['iso', 'ot'] });
  expect(pj.status).toBe(201);
  P[slug] = ((await pj.json()) as { id: string }).id;
}

afterEach(() => vi.restoreAllMocks());
beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id, ativo) VALUES ('u-pa4', 'pa4@ness.lat', 'x', 'PA', 'platform_admin', 'org_ness', 1)`).run();
  S.pa = await sessionFor({ id: 'u-pa4', email: 'pa4@ness.lat', role: 'platform_admin' });
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}'));
  await orgComAdmin('consultoria', 'cons-on4');
  await orgComAdmin('direta', 'dir-on4');
});

describe('Pessoas e acessos: o que as rotas garantem', () => {
  it('P0-1: convite sem `modulos` nunca dá o ot (gatilho), mesmo com o ot contratado e no projeto', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}'));
    const r = await chamar('POST', '/api/v1/users', S['cons-on4'], { name: 'Equipe Um', email: 'eq1@cons-on4.lat', role: 'consultor' });
    expect(r.status).toBe(201);
    expect(await modulosDe('eq1@cons-on4.lat')).not.toContain('ot');
  });
  it('o ot só entra marcado, com trilha `usuario.modulos`', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}'));
    expect((await chamar('POST', '/api/v1/users', S['cons-on4'], { name: 'Equipe Dois', email: 'eq2@cons-on4.lat', role: 'consultor', modulos: ['iso', 'ot'] })).status).toBe(201);
    expect(await modulosDe('eq2@cons-on4.lat')).toEqual(['iso', 'ot']);
    expect(await env.DB.prepare(`SELECT 1 AS x FROM audit_logs WHERE action = 'usuario.modulos' AND details LIKE '%eq2@cons-on4.lat%'`).first()).not.toBeNull();
  });
  it('consultoria: conta de cliente presa ao projeto novo, com os módulos marcados', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}'));
    const r = await chamar('POST', '/api/v1/users', S['cons-on4'], { name: 'Gestora', email: 'gestora@cliente.lat', role: 'org_admin', client_project_id: P['cons-on4'], modulos: ['iso'] });
    expect(r.status).toBe(201);
    expect(await modulosDe('gestora@cliente.lat')).toEqual(['iso']);
  });
  it('direta: conta de cliente é recusada (onda 1, decisão 8); equipe passa', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}'));
    const r = await chamar('POST', '/api/v1/users', S['dir-on4'], { name: 'Cliente', email: 'cli@dir-on4.lat', role: 'org_user', client_project_id: P['dir-on4'], modulos: ['iso'] });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toMatch(/direta/);
    expect((await chamar('POST', '/api/v1/users', S['dir-on4'], { name: 'Equipe', email: 'eq@dir-on4.lat', role: 'consultor', modulos: ['iso'] })).status).toBe(201);
  });
  it('o admin designa o consultor convidado no projeto (governança)', async () => {
    const r = await chamar('POST', `/api/v1/projects/${P['cons-on4']}/governance`, S['cons-on4'], { name: 'Equipe Um', email: 'eq1@cons-on4.lat', role_category: 'consultor', job_title: 'Consultor' });
    expect(r.status).toBeLessThan(300);
    expect(await env.DB.prepare(`SELECT 1 AS x FROM project_governance WHERE project_id = ? AND email = 'eq1@cons-on4.lat' AND role_category = 'consultor'`).bind(P['cons-on4']).first()).not.toBeNull();
  });
});
