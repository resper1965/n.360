import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv() as any);
const S: Record<string, Record<string, string>> = {};

beforeAll(async () => {
  await applySchema();
  const h = await hashPassword('Senha-forte-123!');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO organizations (id, name, slug, max_projects, max_users, tipo) VALUES ('org_d','Direta','direta-d',10,10,'direta'), ('org_c','Consultoria','cons-c',10,10,'consultoria')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id, ativo) VALUES
      ('u-pa','pa@ness.lat',?,'PA','platform_admin','org_ness',1),
      ('u-beto','beto@d.lat','x','Beto','consultoria_admin','org_d',1),
      ('u-cris','cris@c.lat','x','Cris','consultoria_admin','org_c',1),
      ('u-cd','cd@d.lat','x','CD','consultor','org_d',1)`).bind(h),
  ]);
  S.pa = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  S.beto = await sessionFor({ id: 'u-beto', email: 'beto@d.lat', role: 'consultoria_admin', org_id: 'org_d' } as any);
  S.cris = await sessionFor({ id: 'u-cris', email: 'cris@c.lat', role: 'consultoria_admin', org_id: 'org_c' } as any);
  S.consultorD = await sessionFor({ id: 'u-cd', email: 'cd@d.lat', role: 'consultor', org_id: 'org_d' } as any);
});

describe('GET /api/v1/org/config', () => {
  it('admin da direta lê só a identidade, sem custo nem margem', async () => {
    const r = await chamar('GET', '/api/v1/org/config', S.beto);
    expect(r.status).toBe(200);
    expect(Object.keys(await r.json() as object).sort()).toEqual(['cnpj', 'corDestaque', 'nome', 'seloNiso']);
  });
  it('consultor da direta continua recusado', async () => {
    expect((await chamar('GET', '/api/v1/org/config', S.consultorD)).status).toBe(403);
  });
  it('admin de consultoria segue como antes (config completa)', async () => {
    const r = await chamar('GET', '/api/v1/org/config', S.cris);
    expect(r.status).toBe(200);
    expect(Object.keys(await r.json() as object)).toContain('preco');
  });
  it('admin da direta não lê a config de outra organização (X-Org-Id é ignorado)', async () => {
    const r = await chamar('GET', '/api/v1/org/config', { ...S.beto, 'X-Org-Id': 'org_c' });
    expect(Object.keys(await r.json() as object)).not.toContain('preco');
  });
  it('platform_admin com X-Org-Id de direta mantém o comportamento anterior (config completa)', async () => {
    const r = await chamar('GET', '/api/v1/org/config', { ...S.pa, 'X-Org-Id': 'org_d' });
    expect(r.status).toBe(200);
    expect(Object.keys(await r.json() as object)).toContain('preco');
  });
  it('agente e chave de API seguem recusados', async () => {
    const agente = await app.fetch(new Request('http://localhost/api/v1/org/config', { headers: json }),
      { ...workerEnv(), AGENTE: { userId: 'u-beto', email: 'beto@d.lat', projectId: 'p-x', concessaoId: 'c-u-beto' } } as any);
    expect(agente.status).toBe(401);
    const chave = await chamar('GET', '/api/v1/org/config', { 'X-API-Key': 'nao-existe' });
    expect(chave.status).toBe(401);
  });
});
