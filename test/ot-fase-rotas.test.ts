import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, resetData } from './helpers/d1';

type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
let gestor: H, cons: H, tec: H;

async function chamar(h: H, metodo: string, caminho: string, corpo?: unknown) {
  const ctx = createExecutionContext();
  const r = await app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return r;
}
const run = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).run();
const fase = async (s = 's1') => (await env.DB.prepare(`SELECT fase FROM ot_sites WHERE id = ?`).bind(s).first<{ fase: string }>())!.fase;
const trilhas = async (acao: string) => (await env.DB.prepare(`SELECT details, justification FROM audit_logs WHERE action = ? AND project_id = 'proj-a'`).bind(acao).all<any>()).results;
const prepararBase = () => Promise.all([2, 3, 4].map((n) => run(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES (?, 'proj-a', 's1', 'z', ?)`, `z${n}`, n)));

describe('rotas da base do site', () => {
  beforeAll(async () => { await applySchema(); });
  beforeEach(async () => {
    await resetData(); await seedTwoProjects(); await habilitarOt('proj-a', 'proj-b');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
        ('u-g', 'g@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'), ('u-t', 't@cliente.teste', 'x', 'Técnico', 'org_user', 'proj-a')`),
      env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s1', 'proj-a', 'SE Norte'), ('sb', 'proj-b', 'SE B')`),
      env.DB.prepare(`INSERT INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES ('u-t', 's1', 'proj-a', 'x')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('cons:c@ness.lat', 'c@ness.lat', 'x', 'Consultor', 'consultor')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('proj-a', 'Consultor', 'c@ness.lat', 'consultor', 'Consultor')`),
    ]);
    await concederModulos(['u-g', 'u-t', 'cons:c@ness.lat'], ['ot']);
    gestor = await sessionFor({ id: 'u-g', email: 'g@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
    tec = await sessionFor({ id: 'u-t', email: 't@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
    cons = await sessionFor({ id: 'cons:c@ness.lat', email: 'c@ness.lat', role: 'consultor' });
  });

  it('situacao: campos da fase; site de outro projeto dá 404', async () => {
    const r = await chamar(gestor, 'GET', `${P}/sites/s1/situacao`);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ fase: 'em_levantamento', rascunhos: 0, zonas_4_1_1: false, proximo_passo: 'comecar' });
    expect((await chamar(gestor, 'GET', `${P}/sites/sb/situacao`)).status).toBe(404);
  });

  it('pedir: técnico dá 403; consultor pede e a trilha leva só ids', async () => {
    await prepararBase();
    expect((await chamar(tec, 'POST', `${P}/sites/s1/base/pedir`)).status).toBe(403);
    expect((await chamar(cons, 'POST', `${P}/sites/s1/base/pedir`)).status).toBe(200);
    expect(await fase()).toBe('base_em_aprovacao');
    expect((await trilhas('ot.site.base_pedida'))[0].details).toContain('s1');
  });

  it('pedir sem as zonas: 409', async () => {
    expect((await chamar(cons, 'POST', `${P}/sites/s1/base/pedir`)).status).toBe(409);
  });

  it('aprovar: consultor 403; Gestor sem declaracao 400; com declaracao 200 e trilha', async () => {
    await prepararBase(); await chamar(cons, 'POST', `${P}/sites/s1/base/pedir`);
    expect((await chamar(cons, 'POST', `${P}/sites/s1/base/aprovar`, { declaracao: true })).status).toBe(403);
    expect((await chamar(gestor, 'POST', `${P}/sites/s1/base/aprovar`, {})).status).toBe(400);
    expect((await chamar(gestor, 'POST', `${P}/sites/s1/base/aprovar`, { declaracao: true })).status).toBe(200);
    expect(await fase()).toBe('em_operacao');
    expect(await trilhas('ot.site.base_aprovada')).toHaveLength(1);
  });

  it('devolver: consultor 403; motivo com IP 400; Gestor 200 com motivo como justificativa', async () => {
    await prepararBase(); await chamar(cons, 'POST', `${P}/sites/s1/base/pedir`);
    expect((await chamar(cons, 'POST', `${P}/sites/s1/base/devolver`, { motivo: 'faltou revisar' })).status).toBe(403);
    expect((await chamar(gestor, 'POST', `${P}/sites/s1/base/devolver`, { motivo: 'ver 10.0.0.5 de novo' })).status).toBe(400);
    expect((await chamar(gestor, 'POST', `${P}/sites/s1/base/devolver`, { motivo: 'faltou revisar' })).status).toBe(200);
    expect(await fase()).toBe('em_levantamento');
    expect((await trilhas('ot.site.base_devolvida'))[0].justification).toBe('faltou revisar');
  });
});
