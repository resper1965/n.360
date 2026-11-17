import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, sessionFor, workerEnv } from './helpers/d1';

const db = () => env.DB;
const c = (id: string, standard: string, title: string, status: string) =>
  db().prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, description) VALUES (?, 'pn', ?, ?, ?, '')`).bind(id, standard, title, status);
const indicador = async () => {
  const h = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor', iat: Date.now() });
  const r = await app.fetch(new Request('http://localhost/api/v1/projects/pn/prontidao', { headers: h }), workerEnv() as any);
  const corpo = (await r.json()) as any;
  return { ...corpo.indicador, por_norma: corpo.indicador_por_norma, chaves: Object.keys(corpo.indicador) };
};

beforeEach(async () => {
  await applySchema();
  await resetData();
  await db().batch([
    db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id, scope) VALUES ('pn', 'Exemplo', 'ISO 27001, ISO 27701', 'Controller', 'Active', 'org_ness', 'Plataforma')`),
    db().prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness')`),
    db().prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g1', 'pn', 'Cons', 'cons@ness.lat', 'consultor', 'C')`),
  ]);
});

describe('indicador.por_norma', () => {
  it('a soma por norma é o número somado; "na" sai; ordem por standard; legada mostra o standard cru', async () => {
    await db().batch([
      c('a1', 'ISO 27001:2022', 'A.5.1', 'Implemented'), c('a2', 'ISO 27001:2022', 'A.5.2', 'Partial'), c('a3', 'ISO 27001:2022', 'A.5.3', 'Not Applicable'),
      c('b1', 'ISO 27701:2025', 'A.1.1', 'Implemented'), c('b2', 'ISO 27701:2025', 'A.1.2', 'Missing'),
      c('l1', 'ISO 27001:2013', 'A.5.1', 'Missing'),
    ]);
    const i = await indicador();
    expect(i.chaves).toEqual(['implementados', 'aplicaveis', 'texto']);
    expect(i.texto).toBe('2 de 5 controles aplicáveis implementados');
    expect(i.por_norma.map((x: any) => [x.standard, x.rotulo, x.implementados, x.aplicaveis])).toEqual([
      ['ISO 27001:2013', 'ISO 27001:2013', 0, 1], ['ISO 27001:2022', 'ISO 27001:2022', 1, 2], ['ISO 27701:2025', 'ISO 27701:2025', 1, 2],
    ]);
    expect(i.por_norma[1].texto).toBe('1 de 2 controles aplicáveis implementados');
    const soma = (k: string) => i.por_norma.reduce((t: number, x: any) => t + x[k], 0);
    expect(soma('implementados')).toBe(i.implementados);
    expect(soma('aplicaveis')).toBe(i.aplicaveis);
  });
  it('uma norma só gera um item; só "na" ou sem controles não gera nenhum', async () => {
    await db().batch([c('a1', 'ISO 27001:2022', 'A.5.1', 'Implemented'), c('x1', 'ISO 27701:2025', 'A.1.1', 'Not Applicable')]);
    expect((await indicador()).por_norma.map((x: any) => x.standard)).toEqual(['ISO 27001:2022']);
    await db().prepare(`DELETE FROM compliance_controls`).run();
    expect((await indicador()).por_norma).toEqual([]);
  });
});
