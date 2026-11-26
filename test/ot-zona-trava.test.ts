import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

// Spec 2026-11-26, decisão 3 do dono: zona só muda com o site em implantação (em_levantamento) ou em obra (em_obra). Em operação e com a base
// em aprovação, criar, editar e remover zona dão 409 e nada muda no banco. A fase vai na própria mutação (sem leitura antes). D1 real.
type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
const chamar = (h: H, metodo: string, caminho: string, corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
}), workerEnv());
const TRAVA = { error: 'Zona só muda com o site em implantação ou em obra' };
const run = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).run();
const zonaNoBanco = (id: string) => env.DB.prepare('SELECT nome, status FROM ot_zonas WHERE id = ?').bind(id).first<{ nome: string; status: string }>();

let cons: H, gestor: H;
const novoSite = async (fase: string) => {
  const r = await chamar(cons, 'POST', `${P}/sites`, { nome: `SE ${fase}` });
  expect(r.status, await r.clone().text()).toBe(201);
  const id = (await r.json<{ id: string }>()).id;
  // a zona de partida entra com o site em implantação; a fase do teste vem depois, por SQL
  const z = await chamar(cons, 'POST', `${P}/zonas`, { site_id: id, nome: 'Zona antiga', nivel_purdue: 2 });
  expect(z.status, await z.clone().text()).toBe(201);
  await run(`UPDATE ot_sites SET fase = ?, obra_ate = CASE WHEN ? = 'em_obra' THEN date('now', '+10 days') END WHERE id = ?`, fase, fase, id);
  return { site: id, zona: (await z.json<{ id: string }>()).id };
};

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await run(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-gestor', 'gestor@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a')`);
  await designarConsultor('cons-ot@ness.lat', 'proj-a');
  await concederModulos(['u-gestor', 'cons:cons-ot@ness.lat'], ['ot']);
  gestor = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  cons = await sessionFor({ id: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', role: 'consultor' });
});

describe('trava de zona pela fase do site', () => {
  for (const fase of ['em_levantamento', 'em_obra']) {
    it(`${fase}: criar 201, editar 200, remover 200`, async () => {
      const { site, zona } = await novoSite(fase);
      expect((await chamar(cons, 'POST', `${P}/zonas`, { site_id: site, nome: 'Zona nova', nivel_purdue: 3 })).status).toBe(201);
      expect((await chamar(cons, 'PUT', `${P}/zonas/${zona}`, { nome: 'Zona editada' })).status).toBe(200);
      expect((await zonaNoBanco(zona))!.nome).toBe('Zona editada');
      expect((await chamar(cons, 'DELETE', `${P}/zonas/${zona}`)).status).toBe(200);
      expect((await zonaNoBanco(zona))!.status).toBe('removido');
    });
  }

  for (const fase of ['em_operacao', 'base_em_aprovacao']) {
    it(`${fase}: criar, editar e remover dão 409 e a zona não muda no banco`, async () => {
      const { site, zona } = await novoSite(fase);
      const criar = await chamar(cons, 'POST', `${P}/zonas`, { site_id: site, nome: 'Zona nova', nivel_purdue: 3 });
      expect([criar.status, await criar.json()]).toEqual([409, TRAVA]);
      expect(await env.DB.prepare(`SELECT count(*) AS n FROM ot_zonas WHERE site_id = ?`).bind(site).first('n')).toBe(1);
      const editar = await chamar(cons, 'PUT', `${P}/zonas/${zona}`, { nome: 'Zona editada' });
      expect([editar.status, await editar.json()]).toEqual([409, TRAVA]);
      const remover = await chamar(cons, 'DELETE', `${P}/zonas/${zona}`);
      expect([remover.status, await remover.json()]).toEqual([409, TRAVA]);
      expect(await zonaNoBanco(zona)).toEqual({ nome: 'Zona antiga', status: 'ativo' });
    });
  }

  it('zona inexistente segue 404 (não 409), em qualquer fase', async () => {
    await novoSite('em_operacao');
    expect((await chamar(cons, 'PUT', `${P}/zonas/nao-existe`, { nome: 'X' })).status).toBe(404);
    expect((await chamar(cons, 'DELETE', `${P}/zonas/nao-existe`)).status).toBe(404);
  });

  it('pedir a base (fase vai a base_em_aprovacao) e, em seguida, PUT de zona: 409; a zona não muda', async () => {
    const r = await chamar(cons, 'POST', `${P}/sites`, { nome: 'SE pedido' });
    const site = (await r.json<{ id: string }>()).id;
    const zonas: string[] = [];
    for (const n of [2, 3, 4]) zonas.push((await (await chamar(cons, 'POST', `${P}/zonas`, { site_id: site, nome: `Zona ${n}`, nivel_purdue: n })).json<{ id: string }>()).id);
    await run(`INSERT INTO ot_ativos (id, project_id, site_id, nome) VALUES ('at-pedido', 'proj-a', ?, 'RTU')`, site);
    const pedir = await chamar(cons, 'POST', `${P}/sites/${site}/base/pedir`, {});
    expect(pedir.status, await pedir.clone().text()).toBe(200);
    const editar = await chamar(gestor, 'PUT', `${P}/zonas/${zonas[0]}`, { nome: 'Mudou depois do pedido' });
    expect([editar.status, await editar.json()]).toEqual([409, TRAVA]);
    expect((await zonaNoBanco(zonas[0]))!.nome).toBe('Zona 2');
  });
});
