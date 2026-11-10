import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

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

// Interruptor e chaves (rotas humanas, L5 Task 2). Setup de test/ot-levantamento-l2.test.ts.
describe('agente de coleta: interruptor e chaves', () => {
  type H = Record<string, string>;
  const A = `${P}/ot/agente`;
  let gestor: H, tec: H, cons: H;
  let chaveTexto = '';
  beforeAll(async () => {
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-gestor', 'gestor@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'),
      ('u-tec', 'tec@cliente.teste', 'x', 'Técnico', 'org_user', 'proj-a'),
      ('u-cli', 'cli@cliente.teste', 'x', 'Leitura', 'client', 'proj-a')`).run();
    await designarConsultor('cons-ot@ness.lat', 'proj-a');
    await concederModulos(['u-gestor', 'u-tec', 'u-cli', 'cons:cons-ot@ness.lat'], ['ot']);
    gestor = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
    tec = await sessionFor({ id: 'u-tec', email: 'tec@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
    cons = await sessionFor({ id: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', role: 'consultor' });
  });

  it('GET /agente: gestor liga, consultor emite', async () => {
    const g = await (await chamar(gestor, 'GET', A)).json<Record<string, unknown>>();
    expect(g).toMatchObject({ ligado: false, pode_ligar: true, pode_emitir: true });
    expect(g.endpoint).toMatch(/\/ot-coleta\/mcp$/);
    expect(await (await chamar(cons, 'GET', A)).json()).toMatchObject({ pode_ligar: false, pode_emitir: true });
  });

  it('chave com o interruptor desligado: 409', async () => {
    const r = await chamar(cons, 'POST', `${A}/chaves`, { nome: 'Claude Code' });
    expect(r.status).toBe(409);
    expect((await r.json<{ error: string }>()).error).toBe('Ligue o agente de coleta antes de emitir a chave');
  });

  it('PUT /agente: só o Gestor ARCiber', async () => {
    const r = await chamar(cons, 'PUT', A, { ligado: true });
    expect(r.status).toBe(403);
    expect((await r.json<{ error: string }>()).error).toBe('Só o Gestor ARCiber liga o agente de coleta');
    expect((await chamar(gestor, 'PUT', A, { ligado: true })).status).toBe(200);
    const p = await env.DB.prepare(`SELECT agente_coleta_ot AS v FROM projects WHERE id = 'proj-a'`).first<{ v: number }>();
    expect(p!.v).toBe(1);
    expect(await (await chamar(gestor, 'GET', A)).json()).toMatchObject({ ligado: true });
  });

  it('POST /agente/chaves: consultor emite com validade padrão de 7 dias; 31 dias e técnico recusados', async () => {
    const r = await chamar(cons, 'POST', `${A}/chaves`, { nome: 'Claude Code' });
    expect(r.status).toBe(201);
    const k = await r.json<{ id: string; chave: string; expira_em: string }>();
    expect(k.chave).toMatch(/^otc_[0-9a-f]{64}$/);
    chaveTexto = k.chave;
    expect(Math.abs(new Date(k.expira_em).getTime() - (Date.now() + 7 * 86400000))).toBeLessThan(60000);
    const linha = await env.DB.prepare('SELECT key_hash, permissions, project_id FROM api_keys WHERE id = ?').bind(k.id).first();
    expect(linha).toEqual({ key_hash: await sha256Hex(k.chave), permissions: 'ot_coleta', project_id: 'proj-a' });
    expect((await chamar(cons, 'POST', `${A}/chaves`, { nome: 'x', dias: 31 })).status).toBe(400);
    expect((await chamar(tec, 'POST', `${A}/chaves`, { nome: 'x' })).status).toBe(403);
  });

  it('GET lista sem segredo; DELETE revoga; chave read do projeto: 404', async () => {
    const r = await chamar(cons, 'GET', `${A}/chaves`);
    expect(r.status).toBe(200);
    const texto = await r.clone().text();
    expect(texto).not.toContain('key_hash');
    expect(texto).not.toContain('otc_');
    const { chaves } = await r.json<{ chaves: Record<string, unknown>[] }>();
    expect(chaves.every((k) => !('chave' in k) && Object.keys(k).sort().join() === 'expira_em,id,nome,status,ultimo_uso')).toBe(true);
    expect(chaves.map((k) => k.id)).not.toContain('k-rd');
    const alvo = chaves.find((k) => k.nome === 'Claude Code')!;
    expect((await chamar(gestor, 'DELETE', `${A}/chaves/${alvo.id}`)).status).toBe(200);
    const s = await env.DB.prepare('SELECT status FROM api_keys WHERE id = ?').bind(alvo.id).first<{ status: string }>();
    expect(s!.status).toBe('Revoked');
    expect((await chamar(gestor, 'DELETE', `${A}/chaves/k-rd`)).status).toBe(404);
  });

  it('trilha das 4 ações, sem o texto da chave', async () => {
    expect((await chamar(gestor, 'PUT', A, { ligado: false })).status).toBe(200);
    const { results } = await env.DB.prepare(`SELECT action, details FROM audit_logs WHERE action LIKE 'ot.agente.%'`).all<{ action: string; details: string }>();
    expect(new Set(results.map((l) => l.action))).toEqual(new Set(['ot.agente.ligado', 'ot.agente.desligado', 'ot.agente.chave_emitida', 'ot.agente.chave_revogada']));
    expect(results.some((l) => l.details.includes(chaveTexto) || l.details.includes('otc_'))).toBe(false);
  });
});
