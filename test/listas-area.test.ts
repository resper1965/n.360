import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';

/** Área da atividade nas listas de RoPA, RIPD e LIA (spec 2026-10-20): nomes dos departamentos ligados, do próprio projeto. */
const db = () => env.DB;
const chamar = (h: Record<string, string>, caminho: string) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv() as any);
let consultor: Record<string, string>;

beforeEach(async () => {
  await applySchema();
  await resetData();
  await db().batch([
    db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('pa', 'Exemplo A', 'ISO 27001', 'Controller', 'Active', 'org_ness'),
      ('pb', 'Exemplo B', 'ISO 27001', 'Controller', 'Active', 'org_ness')`),
    db().prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', 'org_ness')`),
    db().prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g1', 'pa', 'Cons', 'cons@ness.lat', 'consultor', 'C')`),
  ]);
  await habilitarPrivacy('pa', 'pb');
  await concederModulos(['u-cons']);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor', org_id: 'org_ness' });
  await db().batch([
    db().prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('pe1', 'pa', 'pessoa', 'Pessoa Exemplo')`),
    db().prepare(`INSERT INTO departamentos (id, project_id, nome) VALUES ('d1', 'pa', 'Gestão'), ('d2', 'pa', 'Comercial'), ('d9', 'pb', 'Outro')`),
    db().prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, legal_basis, owner_parte_id) VALUES ('r1', 'pa', 'Folha', 'Legítimo interesse', 'pe1'), ('r2', 'pa', 'Câmeras', 'Contrato', NULL)`),
    db().prepare(`INSERT INTO tratamento_departamentos (ropa_id, departamento_id, project_id) VALUES ('r1', 'd2', 'pa'), ('r1', 'd1', 'pa')`),
    db().prepare(`INSERT INTO dpia_assessments (id, project_id, ropa_id) VALUES ('x1', 'pa', 'r1')`),
  ]);
});

describe('área da atividade nas listas', () => {
  it('RoPA, RIPD e LIA devolvem as áreas em ordem de nome; sem área, null', async () => {
    const ropa = await (await chamar(consultor, '/api/v1/projects/pa/ropa')).json() as any;
    expect(ropa.records.find((r: any) => r.id === 'r1').area).toBe('Comercial, Gestão');
    expect(ropa.records.find((r: any) => r.id === 'r2').area).toBeNull();
    const dpia = await (await chamar(consultor, '/api/v1/projects/pa/dpia')).json() as any;
    expect(dpia.assessments[0]).toMatchObject({ area: 'Comercial, Gestão', responsavel: 'Pessoa Exemplo' });
    const lias = await (await chamar(consultor, '/api/v1/projects/pa/ropa/lias')).json() as any;
    expect(lias.lias.find((l: any) => l.ropa_id === 'r1').area).toBe('Comercial, Gestão');
  });
  it('departamento de outro projeto ligado direto no banco não aparece', async () => {
    await db().prepare(`INSERT INTO tratamento_departamentos (ropa_id, departamento_id, project_id) VALUES ('r1', 'd9', 'pa')`).run();
    const ropa = await (await chamar(consultor, '/api/v1/projects/pa/ropa')).json() as any;
    expect(ropa.records.find((r: any) => r.id === 'r1').area).toBe('Comercial, Gestão');
  });
});
