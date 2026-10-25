import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, habilitarPrivacy } from './helpers/d1';

/** Auditoria r3, achado 2: as rotas que chamam o modelo dividem o balde `ia` (30 por hora por usuário). */
const P = 'lia-p';
let h: Record<string, string>;
const chamar = (metodo: string, caminho: string) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: metodo === 'GET' ? undefined : '{}' }), env as never);

beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P).run();
  await habilitarPrivacy(P);
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

  // Enche o balde `ia` de um usuário só dele, para o teste não depender da ordem.
  const encher = async (id: string) => {
    await env.SESSIONS.put(`ratelimit:ia:${id}`, '30', { expirationTtl: 3600 });
    return sessionFor({ id, email: `${id}@ness.lat`, role: 'platform_admin' });
  };
  const post = (hh: Record<string, string>, metodo: string, caminho: string) =>
    app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...hh }, body: metodo === 'GET' ? undefined : '{}' }), env as never);

  it.each([
    ['POST', `/api/v1/projects/${P}/generate-document`],
    ['POST', `/api/v1/projects/${P}/checklist/x/generate`],
    ['GET', `/api/v1/projects/${P}/control-adequacao/1/suggestions`],
    ['POST', `/api/v1/projects/${P}/ropa/r1/sugestao`],
    ['POST', `/api/v1/projects/${P}/titular-pedidos/t1/rascunho`],
    ['POST', `/api/v1/projects/${P}/incidentes/i1/rascunho-comunicacao`],
  ])('%s %s usa o balde ia', async (metodo, caminho) => {
    const hh = await encher('lia-' + caminho.replace(/\W/g, ''));
    expect((await post(hh, metodo, caminho)).status).toBe(429);
  });

  it('rascunho por etapa usa o balde copiloto, não o ia', async () => {
    const id = 'lia-etapa';
    await env.SESSIONS.put(`ratelimit:copiloto:${id}`, '20', { expirationTtl: 600 });
    const hh = await sessionFor({ id, email: `${id}@ness.lat`, role: 'platform_admin' });
    expect((await post(hh, 'POST', `/api/v1/projects/${P}/ropa/r1/etapas/coleta/rascunho`)).status).toBe(429);
  });

  it('interpret sem refresh (cache) não conta', async () => {
    const hh = await encher('lia-interpret-cache');
    expect((await post(hh, 'GET', `/api/v1/projects/${P}/phase-answers/1/interpret`)).status).not.toBe(429);
  });
});
