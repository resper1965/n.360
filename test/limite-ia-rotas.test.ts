import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor } from './helpers/d1';

/** Auditoria r3, achado 2: as rotas que chamam o modelo dividem o balde `ia` (30 por hora por usuário). */
const P = 'lia-p';
let h: Record<string, string>;
const chamar = (metodo: string, caminho: string) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: metodo === 'GET' ? undefined : '{}' }), env as never);

beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P).run();
  h = await sessionFor({ id: 'lia-root', email: 'lia@ness.lat', role: 'platform_admin' });
});

describe('limite de IA nas rotas que chamam o modelo', () => {
  it('readiness-check?ai=1: a 31a chamada na hora dá 429; sem ai=1 não conta', async () => {
    const url = `/api/v1/projects/${P}/readiness-check`;
    for (let i = 0; i < 5; i++) expect((await chamar('GET', url)).status).toBe(200);
    for (let i = 0; i < 30; i++) expect((await chamar('GET', url + '?ai=1')).status).toBe(200);
    expect((await chamar('GET', url + '?ai=1')).status).toBe(429);
    expect((await chamar('GET', url)).status).toBe(200);
  });

  it('generate-document e checklist/generate usam o mesmo balde', async () => {
    // O balde já está cheio do teste anterior (mesmo usuário): as duas rotas barram antes da rota.
    expect((await chamar('POST', `/api/v1/projects/${P}/generate-document`)).status).toBe(429);
    expect((await chamar('POST', `/api/v1/projects/${P}/checklist/x/generate`)).status).toBe(429);
  });
});
