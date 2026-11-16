import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

const pedir = (h: Record<string, string>, caminho: string, extra: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, { headers: h }), { ...workerEnv(), ...extra });

const A = '/api/v1/projects/proj-a/ot/requisitos';
const B = '/api/v1/projects/proj-b/ot/requisitos';
const CHAVE = 'chave-ot-escrita';
const AGENTE = { userId: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', projectId: 'proj-a', concessaoId: 'c-ot' };

const CODIGOS = ['4.1.1', '4.1.2', '4.1.3', '4.1.4', '4.2.1', '4.2.2', '4.3.1', '4.3.2', '4.3.3', '4.4.1', '4.4.2', '4.5.1',
  '4.5.1.1', '4.5.1.2', '4.5.1.3', '4.5.1.4', '4.5.1.5', '4.5.1.6', '4.6.1', '4.6.2', '4.6.3', '4.6.4', '4.6.5', '4.6.6', '5.1.1'];

let plat: Record<string, string>;
let cliOt: Record<string, string>;
let cliSemOt: Record<string, string>;
let cliB: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  // proj-a tem o n.ot; proj-b não (só o n.iso do contrato da org_ness dos testes)
  await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-ot', 'u-ot@cliente.teste', 'x', 'Com OT', 'org_user', 'proj-a'),
      ('u-sem', 'u-sem@cliente.teste', 'x', 'Sem OT', 'org_user', 'proj-a'),
      ('u-b', 'u-b@cliente.teste', 'x', 'Outro projeto', 'org_user', 'proj-b')`),
    env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('key-ot', 'proj-a', ?, 'escrita', 'write', 'Active')`).bind(await sha256Hex(CHAVE)),
  ]);
  await designarConsultor(AGENTE.email, 'proj-a');
  await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-ot', ?, 'proj-a', datetime('now', '+30 days'))`).bind(AGENTE.userId).run();
  await concederModulos(['u-ot', 'u-b', AGENTE.userId], ['ot']);
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  cliOt = await sessionFor({ id: 'u-ot', email: 'u-ot@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  cliSemOt = await sessionFor({ id: 'u-sem', email: 'u-sem@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  cliB = await sessionFor({ id: 'u-b', email: 'u-b@cliente.teste', role: 'org_user', client_project_id: 'proj-b' });
});

describe('n.ot: GET /ot/requisitos e as travas do módulo', () => {
  it('projeto E pessoa com ot: 200 com os 25 itens do catálogo em ordem natural de código', async () => {
    const r = await pedir(cliOt, A);
    expect(r.status, await r.clone().text()).toBe(200);
    const { requisitos } = await r.json<{ requisitos: { codigo: string; titulo: string; prazo_meses: number | null }[] }>();
    expect(requisitos).toHaveLength(25);
    expect(requisitos.map((q) => q.codigo)).toEqual(CODIGOS);
    expect(requisitos[0]).toMatchObject({ codigo: '4.1.1', titulo: 'Segregação em zonas de segurança', prazo_meses: 27 });
  });

  it('platform_admin acessa', async () => {
    expect((await pedir(plat, A)).status).toBe(200);
  });

  it('403 quando o PROJETO não tem ot (mesmo para quem tem todos os módulos)', async () => {
    const r = await pedir(plat, B);
    expect(r.status).toBe(403);
    expect((await r.json<{ error: string }>()).error).toContain('n.ot');
  });

  it('403 quando a PESSOA não tem ot, no projeto que tem', async () => {
    const r = await pedir(cliSemOt, A);
    expect(r.status).toBe(403);
    expect((await r.json<{ error: string }>()).error).toContain('n.ot');
  });

  it('403 para conta de OUTRO projeto, mesmo com o módulo', async () => {
    expect((await pedir(cliB, A)).status).toBe(403);
  });

  it('sem sessão: 401', async () => {
    expect((await pedir({}, A)).status).toBe(401);
  });

  it('P0-2: chave de API (mesmo de escrita) é recusada', async () => {
    const r = await pedir({ 'X-API-Key': CHAVE }, A);
    expect(r.status).toBe(403);
    expect((await r.json<{ error: string }>()).error).toMatch(/n\.ot/);
  });

  it('P0-2: agente MCP é recusado, inclusive com decisão confirmada', async () => {
    const decisao = { 'X-Agente-Confirmado': '1', 'X-Agente-Ferramenta': 'niso_decidir_passo', 'X-Agente-Motivo': 'pedido do consultor' };
    for (const h of [{}, decisao]) {
      const r = await pedir(h, A, { AGENTE });
      expect(r.status).toBe(403);
      expect((await r.json<{ error: string }>()).error).toContain('fora do alcance do agente');
    }
  });

  it('o painel do projeto traz o bloco do n.ot', async () => {
    for (const q of ['', '?modulo=ot']) {
      const r = await pedir(plat, `/api/v1/projects/proj-a/painel${q}`);
      expect(r.status, `${q} ${await r.clone().text()}`).toBe(200);
    }
    expect(Object.keys((await (await pedir(plat, '/api/v1/projects/proj-a/painel')).json<{ modulos: object }>()).modulos)).toEqual(['iso', 'ot']);
  });

  // Por último: liga o n.ot no proj-b.
  it('P0-1: ligar o n.ot no projeto (PUT /modulos/ot) não o concede às contas de cliente; só a concessão explícita', async () => {
    await env.DB.batch([
      env.DB.prepare(`UPDATE organizations SET modulos_contratados = '["iso","ot"]' WHERE id = 'org_ness'`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-b2', 'u-b2@cliente.teste', 'x', 'Cliente B', 'org_user', 'proj-b')`),
    ]);
    const r = await app.fetch(new Request('http://localhost/api/v1/projects/proj-b/modulos/ot', {
      method: 'PUT', headers: { ...plat, 'Content-Type': 'application/json' }, body: JSON.stringify({ habilitado: true }),
    }), workerEnv());
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await env.DB.prepare(`SELECT 1 FROM projeto_modulos WHERE project_id = 'proj-b' AND modulo = 'ot'`).first()).not.toBeNull();
    expect(await env.DB.prepare(`SELECT 1 FROM usuario_modulos WHERE user_id = 'u-b2' AND modulo = 'ot'`).first()).toBeNull();
  });
});
