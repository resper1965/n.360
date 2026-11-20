import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { sha256Hex } from '../src/helpers';
import { etapasDoPrograma } from '../src/services/programa';
import app from '../src/index';
import { applySchema, seedTwoProjects, habilitarOt, habilitarPrivacy, concederModulos, designarConsultor, sessionFor, workerEnv } from './helpers/d1';

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

// Custo: a régua do n.ot não consulta nada a mais (reusa o que o bloco já leu) e quem não tem o ot não dispara nenhuma consulta ot_*.
const contando = () => {
  const sqls: string[] = [];
  const DB = new Proxy(env.DB, { get: (t, k) => (k === 'prepare' ? (q: string) => { sqls.push(q); return t.prepare(q); } : (t as any)[k]?.bind?.(t) ?? (t as any)[k]) });
  return { sqls, extra: { DB } };
};
describe('custo do programa.etapas', () => {
  it('150 sites: 200 e o número de consultas não cresce com os sites; a régua conta os 151', async () => {
    const um = contando();
    await painel(cons, '', um.extra);
    await env.DB.batch(Array.from({ length: 150 }, (_, i) => env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase) VALUES (?, 'proj-a', ?, 'em_levantamento')`).bind(`mass-${i}`, `Massa ${i}`)));
    try {
      const muitos = contando();
      const d = await painel(cons, '', muitos.extra);
      expect(muitos.sqls.length).toBe(um.sqls.length);
      expect(d.programa.etapas.ot.total).toBe(151);
    } finally { await env.DB.prepare(`DELETE FROM ot_sites WHERE id LIKE 'mass-%'`).run(); }
  });
  it('quem não tem o ot: nenhuma consulta a ot_* ao montar o painel', async () => {
    for (const [h, extra] of [[semOt, {}], [{}, { AGENTE }], [{ 'X-API-Key': 'chave-programa-ot' }, {}]] as [H, Record<string, unknown>][]) {
      const c = contando();
      await painel(h, '', { ...extra, ...c.extra });
      expect(c.sqls.filter((q) => /\bot_/.test(q)), JSON.stringify(Object.keys(extra))).toEqual([]);
    }
  });
});

describe('programa.etapas.privacy', () => {
  it('quem tem o n.privacy recebe a trilha de 7 passos; quem não tem, nenhuma chave privacy', async () => {
    await habilitarPrivacy('proj-a');
    await concederModulos(['u-t'], ['iso', 'ot', 'privacy']);
    const d = await painel(tecnico, '?modulo=privacy');
    expect(Object.keys(d.programa.etapas)).toEqual(['privacy']);
    expect(d.programa.etapas.privacy.passos.map((p: any) => p.rotulo)).toEqual(['Partida', 'Encarregado e canal', 'Inventário', 'Bases e riscos', 'Terceiros', 'Documentos e cobertura', 'Titular e incidentes']);
    expect((await painel(semOt)).programa.etapas.privacy).toBeUndefined();
    expect(JSON.stringify(d.programa.etapas.privacy)).not.toMatch(/site|desvio|"ot"/i);
  });
  it('a pessoa tem o privacy, o projeto não (proj-b): sem chave privacy', async () => {
    const r = await chamar(cons, '/api/v1/projects/proj-b/painel');
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).programa.etapas.privacy).toBeUndefined();
  });
  it('etapasDoPrograma: sem o módulo privacy no pedido, a visão recebida é ignorada', async () => {
    const r = await etapasDoPrograma(env.DB, 'proj-a', ['iso'], { visaoPrivacy: { encarregados: [], tratamentos: {}, terceiros: {}, prazos_legais: { nao_definidos: [] }, pedidos_titular: {}, incidentes: {}, lgpd: {} } as any });
    expect(Object.keys(r)).toEqual(['iso']);
  });
});
