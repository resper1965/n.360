import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt } from './helpers/d1';

// Falha fechada da chave do agente de coleta (L5): 'ot_coleta' é recusada em toda a API, inclusive GET.
const MSG = 'Forbidden: a chave de coleta do n.ot só vale no endpoint do agente (/ot-coleta/mcp)';
const P = '/api/v1/projects/proj-a';
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv());

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  await habilitarOt('proj-a');
  const ins = env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES (?, 'proj-a', ?, ?, ?, 'Active')`);
  await env.DB.batch([
    ins.bind('k-col', await sha256Hex('k-coleta'), 'agente', 'ot_coleta'),
    ins.bind('k-rd', await sha256Hex('k-leitura'), 'leitura', 'read'),
  ]);
});

describe('chave ot_coleta', () => {
  it('403 com a mensagem em GET, em rota do n.ot e em POST', async () => {
    for (const [m, c, corpo] of [['GET', `${P}/risks`], ['GET', `${P}/ot/levantamentos`], ['POST', `${P}/risks`, {}]] as const) {
      const r = await chamar({ 'X-API-Key': 'k-coleta' }, m, c, corpo);
      expect(r.status, `${m} ${c}`).toBe(403);
      expect((await r.json<{ error: string }>()).error).toBe(MSG);
    }
  });

  it('chave read comum continua lendo', async () => {
    expect((await chamar({ 'X-API-Key': 'k-leitura' }, 'GET', `${P}/risks`)).status).toBe(200);
  });

  it('a rota genérica de chaves não emite ot_coleta', async () => {
    const plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
    const r = await chamar(plat, 'POST', `${P}/api-keys`, { name: 'x', permissions: 'ot_coleta' });
    expect(r.status).toBe(400);
  });
});
