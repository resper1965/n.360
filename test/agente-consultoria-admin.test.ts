import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv } from './helpers/d1';
import { hashPassword } from '../src/helpers';

// O consultoria_admin também conecta agente, com o alcance do consultor, SÓ nos projetos da própria organização.
const BASE = 'https://niso.ness.com.br';
const REDIRECT = 'http://127.0.0.1:33418/callback';
const f = (caminho: string, init: RequestInit = {}) => worker.fetch(new Request(BASE + caminho, init), workerEnv() as any);
const comoAgente = (caminho: string, props: any) => worker.fetch(new Request('http://localhost' + caminho), { ...workerEnv(), AGENTE: props } as any);
const form = (o: Record<string, string>) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '10.9.9.9' }, body: new URLSearchParams(o).toString() });
const campo = (html: string, nome: string) => html.match(new RegExp(`name="${nome}" value="([^"]+)"`))![1];

async function pedido() {
  const r = await f('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: 'Claude Code', token_endpoint_auth_method: 'none' }) });
  const clientId = (await r.json<any>()).client_id;
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: 'x'.repeat(43), code_challenge_method: 'S256', state: 's', resource: `${BASE}/mcp` });
  return campo(await (await f(`/oauth/authorize?${q}`)).text(), 'pedido');
}

describe('Agente do consultoria_admin', () => {
  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('senha-forte-123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO organizations (id, name, slug, status) VALUES ('org_x','Consultoria X','cx','Active'), ('org_y','Consultoria Y','cy','Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-x','Cliente X','ISO 27001','controller','Active','org_x'), ('p-y','Cliente Y','ISO 27001','controller','Active','org_y')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-ca','ca@x.lat',?,'CA','consultoria_admin','org_x')`).bind(senha),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-pa','pa@ness.lat',?,'PA','platform_admin')`).bind(senha),
    ]);
  }, 60_000);

  it('o consentimento lista só os projetos da organização dele, sem designação na governança', async () => {
    const p = await pedido();
    const html = await (await f('/oauth/authorize/entrar', form({ pedido: p, email: 'ca@x.lat', senha: 'senha-forte-123', codigo: '' }))).text();
    expect(html).toContain('Cliente X');
    expect(html).not.toContain('Cliente Y');
    expect((await f('/oauth/authorize/confirmar', form({ pedido: p, projeto: 'p-y' }))).status).toBe(403);
    // o pedido é de uso único: o forjado acima o consumiu
    const p2 = await pedido();
    await f('/oauth/authorize/entrar', form({ pedido: p2, email: 'ca@x.lat', senha: 'senha-forte-123', codigo: '' }));
    expect((await f('/oauth/authorize/confirmar', form({ pedido: p2, projeto: 'p-x' }))).status).toBe(200);
  }, 30_000);

  it('platform_admin continua sem conectar agente', async () => {
    const p = await pedido();
    expect((await f('/oauth/authorize/entrar', form({ pedido: p, email: 'pa@ness.lat', senha: 'senha-forte-123', codigo: '' }))).status).toBe(401);
  });

  it('o agente lê o projeto da organização e perde a concessão fora dela', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-x','u-ca','p-x', datetime('now','+30 days')), ('c-y','u-ca','p-y', datetime('now','+30 days'))`),
    ]);
    const P = { userId: 'u-ca', email: 'ca@x.lat', projectId: 'p-x', concessaoId: 'c-x' };
    expect((await comoAgente('/api/v1/projects/p-x/risks', P)).status).toBe(200);
    expect((await comoAgente('/api/v1/projects/p-y/risks', P)).status).toBe(403);
    expect((await comoAgente('/api/v1/projects/p-y/risks', { ...P, projectId: 'p-y', concessaoId: 'c-y' })).status).toBe(401);
  });
});
