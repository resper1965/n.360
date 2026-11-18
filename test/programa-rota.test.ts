import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { sha256Hex } from '../src/helpers';
import app from '../src/index';
import { applySchema, seedTwoProjects, habilitarOt, concederModulos, designarConsultor, sessionFor, workerEnv } from './helpers/d1';

// Onda 4: programa.etapas no painel. P0-1/P0-2/P0-4: sem `ot` (pessoa ou projeto), agente e chave de API não veem nem CONTAM o n.ot.
type H = Record<string, string>;
const AGENTE = { userId: 'cons:cons-ag4@ness.lat', email: 'cons-ag4@ness.lat', projectId: 'proj-a', concessaoId: 'c-ag4' };
const chamar = (h: H, caminho: string, extra: Record<string, unknown> = {}) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), { ...(workerEnv() as any), ...extra });
const painel = async (h: H, q = '', extra: Record<string, unknown> = {}) => { const r = await chamar(h, `/api/v1/projects/proj-a/painel${q}`, extra); expect(r.status).toBe(200); return (await r.json()) as any; };
let semOt: H, cons: H, tecnico: H;

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-s', 's@cliente.teste', 'x', 'Sem OT', 'org_admin', 'proj-a'), ('u-t', 't@cliente.teste', 'x', 'Tecnico', 'org_user', 'proj-a')`),
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase) VALUES ('s1', 'proj-a', 'SE Norte Exemplo', 'em_operacao')`),
    env.DB.prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez) VALUES
      ('d1', 'proj-a', 's1', 'fluxo', 'k1', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z')`),
    // fase 0 concluída pelo select antigo, ainda não materializada: o painel conta, mas não pode gravar
    env.DB.prepare(`INSERT INTO project_phases (id, project_id, phase_number, title, status, legado_status) VALUES ('ph0', 'proj-a', 0, 'Mobilização', 'completed', 'completed')`),
  ]);
  await env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('key-p4', 'proj-a', ?, 'programa', 'write', 'Active')`).bind(await sha256Hex('chave-programa-ot')).run();
  await designarConsultor(AGENTE.email, 'proj-a');
  await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-ag4', ?, 'proj-a', datetime('now', '+30 days'))`).bind(AGENTE.userId).run();
  await concederModulos([AGENTE.userId], ['iso', 'ot']);
  await concederModulos(['u-s'], ['iso']);
  await concederModulos(['u-t'], ['iso', 'ot']);
  await designarConsultor('c4@ness.lat', 'proj-a', 'proj-b');
  const c = await env.DB.prepare(`SELECT id FROM users WHERE email = 'c4@ness.lat'`).first<{ id: string }>();
  await concederModulos([c!.id], ['iso', 'ot']);
  semOt = await sessionFor({ id: 'u-s', email: 's@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  tecnico = await sessionFor({ id: 'u-t', email: 't@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  cons = await sessionFor({ id: c!.id, email: 'c4@ness.lat', role: 'consultor' });
});

const semRastroDoOt = (d: any) => {
  expect(Object.keys(d.programa.etapas)).toEqual(['iso']);
  const p = JSON.stringify(d.programa);
  for (const x of ['"ot"', 'site', 'Site', 'desvio', 'SE Norte']) expect(p, x).not.toContain(x);
  expect(d.programa.etapas.iso.total).toBe(41);
  expect(d.programa.etapas.iso.etapas.map((e: any) => e.total)).toEqual([7, 2, 2, 18, 12]);
};

describe('programa.etapas por perfil', () => {
  it('consultor com o ot: iso e ot; o site em operação com desvio aberto está em Tratar; nenhum nome de site', async () => {
    const d = await painel(cons);
    expect(Object.keys(d.programa.etapas).sort()).toEqual(['iso', 'ot']);
    expect(d.programa.etapas.ot).toMatchObject({ etapa: 'tratar', feitos: 0, total: 1, proximo: { texto: 'Tratar os desvios abertos', tela: 'ot', aba: 'sites' } });
    expect(JSON.stringify(d.programa)).not.toContain('SE Norte');
  });
  it('?modulo=iso: só a régua do iso, mesmo para quem tem o ot', async () => {
    expect(Object.keys((await painel(cons, '?modulo=iso')).programa.etapas)).toEqual(['iso']);
  });
  it('pessoa sem o ot: nenhuma chave, contagem ou texto do n.ot', async () => semRastroDoOt(await painel(semOt)));
  it('agente MCP: nenhuma chave, contagem ou texto do n.ot (P0-2)', async () => semRastroDoOt(await painel({}, '', { AGENTE })));
  it('chave de API: nenhuma chave, contagem ou texto do n.ot (P0-2)', async () => semRastroDoOt(await painel({ 'X-API-Key': 'chave-programa-ot' })));
  it('técnico com o ot e sem acesso ao site: o ot vem com 0 sites (P0-4), não com o site do projeto', async () => {
    const d = await painel(tecnico);
    expect(d.programa.etapas.ot).toMatchObject({ total: 0, etapa: 'comecar', proximo: { texto: 'Cadastrar o primeiro site' } });
  });
});

describe('projeto sem o módulo ot (P0-1)', () => {
  it('a pessoa tem o ot, o projeto não: nenhuma chave, contagem ou texto do n.ot', async () => {
    const r = await chamar(cons, '/api/v1/projects/proj-b/painel');
    expect(r.status).toBe(200);
    const d = (await r.json()) as any;
    expect(Object.keys(d.programa.etapas)).toEqual(['iso']);
    expect(JSON.stringify(d.programa)).not.toMatch(/"ot"|site|desvio/i);
  });
});

describe('o painel só lê (o GET da Bancada grava; o programa não)', () => {
  it('fase concluída pelo select antigo conta na régua e continua sem materializar depois do GET /painel', async () => {
    const d = await painel(cons, '?modulo=iso');
    expect(d.programa.etapas.iso.etapas[0]).toMatchObject({ id: 'comecar', feitos: 1, total: 7 });
    const fase = await env.DB.prepare(`SELECT status, legado_status FROM project_phases WHERE id = 'ph0'`).first();
    expect(fase).toEqual({ status: 'completed', legado_status: 'completed' });
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM checklist_progress WHERE project_id = 'proj-a'`).first<{ n: number }>())!.n).toBe(0);
  });
});

describe('marco do n.ot (decisão 8): só para quem tem o ot', () => {
  it('a primeira base aprovada põe o programa em operação para quem tem o ot; quem não tem continua sem marco', async () => {
    await env.DB.prepare(`UPDATE ot_sites SET base_aprovada_em = '2026-05-04 10:00:00' WHERE id = 's1'`).run();
    try {
      expect((await painel(cons)).programa).toMatchObject({ estado: 'operacao', desde: '2026-05' });
      expect((await painel(semOt)).programa.estado).not.toBe('operacao');
      expect((await painel({}, '', { AGENTE })).programa.estado).not.toBe('operacao');
      expect((await painel({ 'X-API-Key': 'chave-programa-ot' })).programa.estado).not.toBe('operacao');
      expect((await painel(tecnico)).programa.estado).not.toBe('operacao'); // o site aprovado não é dele (P0-4)
    } finally {
      await env.DB.prepare(`UPDATE ot_sites SET base_aprovada_em = NULL WHERE id = 's1'`).run();
    }
  });
});
