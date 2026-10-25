import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';
import { coberturaDePoliticas } from '../src/services/cobertura-politicas';

const P = 'p-cob';
let s: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente Cob', 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT OR IGNORE INTO projeto_modulos (project_id, modulo) VALUES (?, 'iso')`).bind(P),
    env.DB.prepare(`INSERT OR IGNORE INTO requisito_fontes (id, nome, versao) VALUES ('iso27001:2022', 'ISO/IEC 27001', '2022')`),
    env.DB.prepare(`INSERT OR IGNORE INTO requisitos (id, fonte_id, referencia, titulo) VALUES ('rq-a515', 'iso27001:2022', 'A.5.15', 'Controle de acesso'), ('rq-a518', 'iso27001:2022', 'A.5.18', 'Direitos de acesso'), ('rq-a524', 'iso27001:2022', 'A.5.24', 'Incidentes')`),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, requisito_id) VALUES
      ('cc-15', ?, 'ISO 27001', 'A.5.15 Controle de acesso', 'Implemented', 'rq-a515'),
      ('cc-18', ?, 'ISO 27001', 'A.5.18 Direitos de acesso', 'In Progress', 'rq-a518'),
      ('cc-24', ?, 'ISO 27001', 'A.5.24 Incidentes', 'Missing', 'rq-a524'),
      ('cc-na', ?, 'ISO 27001', 'A.7.1 Perímetro', 'Not Applicable', NULL)`).bind(P, P, P, P),
    env.DB.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo, status) VALUES ('doc-iam', ?, 'politica', 'POL-IAM-001 Controle de acesso', 'vigente'), ('doc-inc', ?, 'politica', 'POL-IRP-001 Incidentes', 'rascunho'), ('doc-proc', ?, 'procedimento', 'PRO-ACC-001', 'vigente')`).bind(P, P, P),
    env.DB.prepare(`INSERT INTO documento_requisitos (documento_id, requisito_id, project_id) VALUES ('doc-iam', 'rq-a515', ?), ('doc-iam', 'rq-a518', ?), ('doc-inc', 'rq-a524', ?), ('doc-proc', 'rq-a524', ?)`).bind(P, P, P, P),
  ]);
  s = await sessionFor({ id: 'cob-c', email: 'c@ness.lat', role: 'platform_admin', org_id: 'org_ness' });
});

describe('cobertura de políticas', () => {
  it('conta só política VIGENTE e só controle aplicável', async () => {
    const r = await coberturaDePoliticas(env.DB, P);
    expect(r.aplicaveis).toBe(3);
    expect(r.cobertos).toBe(2);                          // A.5.15 e A.5.18 pela POL-IAM vigente
    expect(r.sem_cobertura.map((x) => x.id)).toEqual(['cc-24']); // rascunho e procedimento não cobrem
    expect(r.sem_cobertura[0].requisito_id).toBe('rq-a524');
    expect(r.por_documento).toMatchObject({ 'doc-iam': 2, 'doc-inc': 1 });
    expect(r.por_controle['cc-24']).toEqual([{ id: 'doc-inc', titulo: 'POL-IRP-001 Incidentes', status: 'rascunho' }]);
    expect(r.por_controle['cc-15'][0]).toMatchObject({ id: 'doc-iam', status: 'vigente' });
  });

  it('rota responde e não é engolida por /documentos/:id', async () => {
    const res = await app.fetch(new Request(`http://localhost/api/v1/projects/${P}/documentos/cobertura`, { headers: s }), workerEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ aplicaveis: 3, cobertos: 2 });
  });

  it('projeto sem controles: tudo zero', async () => {
    const r = await coberturaDePoliticas(env.DB, 'p-inexistente');
    expect(r).toEqual({ aplicaveis: 0, cobertos: 0, sem_cobertura: [], por_controle: {}, por_documento: {} });
  });
});

describe('cobertura sem o n.iso', () => {
  it('projeto só com privacy: forma vazia', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-cob-priv', 'Cliente Priv', 'LGPD', 'controller', 'Active', 'org_ness')`),
      env.DB.prepare(`INSERT INTO projeto_modulos (project_id, modulo) VALUES ('p-cob-priv', 'privacy')`),
      env.DB.prepare(`DELETE FROM projeto_modulos WHERE project_id = 'p-cob-priv' AND modulo = 'iso'`),
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('cc-priv', 'p-cob-priv', 'ISO 27001', 'A.5.1', 'Missing')`),
    ]);
    const res = await app.fetch(new Request('http://localhost/api/v1/projects/p-cob-priv/documentos/cobertura', { headers: s }), workerEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ aplicaveis: 0, cobertos: 0, sem_cobertura: [], por_controle: {}, por_documento: {} });
  });
});
