import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';
import { provisionar } from '../src/sso';
import { sha256Hex } from '../src/helpers';
import { MSG_DIRETA_SEM_CLIENTE } from '../src/services/organizacao';

const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv() as any);
const S: Record<string, Record<string, string>> = {};

beforeAll(async () => {
  await applySchema();
  const h = await hashPassword('Senha-forte-123!');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO organizations (id, name, slug, max_projects, max_users, tipo) VALUES ('org_d','Direta','direta-d',10,10,'direta'), ('org_c','Consultoria','cons-c',10,10,'consultoria')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id, ativo) VALUES
      ('u-pa','pa@ness.lat',?,'PA','platform_admin','org_ness',1),
      ('u-beto','beto@d.lat','x','Beto','consultoria_admin','org_d',1),
      ('u-cris','cris@c.lat','x','Cris','consultoria_admin','org_c',1),
      ('u-cd','cd@d.lat','x','CD','consultor','org_d',1)`).bind(h),
  ]);
  S.pa = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  S.beto = await sessionFor({ id: 'u-beto', email: 'beto@d.lat', role: 'consultoria_admin', org_id: 'org_d' } as any);
  S.cris = await sessionFor({ id: 'u-cris', email: 'cris@c.lat', role: 'consultoria_admin', org_id: 'org_c' } as any);
  S.consultorD = await sessionFor({ id: 'u-cd', email: 'cd@d.lat', role: 'consultor', org_id: 'org_d' } as any);
});

describe('GET /api/v1/org/config', () => {
  it('admin da direta lê só a identidade, sem custo nem margem', async () => {
    const r = await chamar('GET', '/api/v1/org/config', S.beto);
    expect(r.status).toBe(200);
    expect(Object.keys(await r.json() as object).sort()).toEqual(['cnpj', 'corDestaque', 'nome', 'seloNiso']);
  });
  it('consultor da direta continua recusado', async () => {
    expect((await chamar('GET', '/api/v1/org/config', S.consultorD)).status).toBe(403);
  });
  it('admin de consultoria segue como antes (config completa)', async () => {
    const r = await chamar('GET', '/api/v1/org/config', S.cris);
    expect(r.status).toBe(200);
    expect(Object.keys(await r.json() as object)).toContain('preco');
  });
  it('admin da direta não lê a config de outra organização (X-Org-Id é ignorado)', async () => {
    const r = await chamar('GET', '/api/v1/org/config', { ...S.beto, 'X-Org-Id': 'org_c' });
    expect(Object.keys(await r.json() as object).sort()).toEqual(['cnpj', 'corDestaque', 'nome', 'seloNiso']);
  });
  it('platform_admin com X-Org-Id de direta mantém o comportamento anterior (config completa)', async () => {
    const r = await chamar('GET', '/api/v1/org/config', { ...S.pa, 'X-Org-Id': 'org_d' });
    expect(r.status).toBe(200);
    expect(Object.keys(await r.json() as object)).toContain('preco');
  });
  it('agente e chave de API seguem recusados', async () => {
    const agente = await app.fetch(new Request('http://localhost/api/v1/org/config', { headers: json }),
      { ...workerEnv(), AGENTE: { userId: 'u-beto', email: 'beto@d.lat', projectId: 'p-x', concessaoId: 'c-u-beto' } } as any);
    expect(agente.status).toBe(401);
    const chave = await chamar('GET', '/api/v1/org/config', { 'X-API-Key': 'nao-existe' });
    expect(chave.status).toBe(401);
  });
});

describe('direta não tem conta de cliente: SSO, SCIM e transferência', () => {
  const sso = (dominio: string, ativo = true) => ({ issuer: 'https://idp.exemplo.com', client_id: 'cid', client_secret: 'seg', dominios: dominio, papel_padrao: 'org_user', ativo });
  const scimHeaders = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/scim+json' });
  const contas = async (email: string) => (await env.DB.prepare('SELECT id FROM users WHERE lower(email) = ?').bind(email).all()).results;

  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES
        ('p-d','Cliente D','ISO 27001','controller','Active','org_d'),
        ('p-c','Cliente C','ISO 27001','controller','Active','org_c'),
        ('p-c2','Cliente C2','ISO 27001','controller','Active','org_c'),
        ('p-d2','Cliente D2','ISO 27001','controller','Active','org_d'),
        ('p-c3','Cliente C3','ISO 27001','controller','Active','org_c')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id, ativo) VALUES ('u-cli-c','cli@c.com','x','Cli','org_admin','p-c','org_c',1)`),
      env.DB.prepare(`INSERT INTO project_scim (project_id, token_hash) VALUES ('p-d', ?), ('p-c', ?)`).bind(await sha256Hex('tok-d'), await sha256Hex('tok-c')),
    ]);
  });

  it('token SCIM: 403 na direta, 201 na consultoria', async () => {
    const d = await chamar('POST', '/api/v1/projects/p-d/scim-token', S.pa);
    expect(d.status).toBe(403);
    expect(await d.json()).toEqual(MSG_DIRETA_SEM_CLIENTE);
    expect((await chamar('POST', '/api/v1/projects/p-c3/scim-token', S.pa)).status).toBe(201);
    expect((await env.DB.prepare(`SELECT 1 FROM project_scim WHERE project_id = 'p-d' AND criado_por = 'pa@ness.lat'`).first())).toBeNull();
  });

  it('ligar o SSO: 403 na direta (nada gravado), 200 na consultoria', async () => {
    const d = await chamar('PUT', '/api/v1/projects/p-d/sso', S.pa, sso('d.com'));
    expect(d.status).toBe(403);
    expect(await d.json()).toEqual(MSG_DIRETA_SEM_CLIENTE);
    expect(await env.DB.prepare(`SELECT 1 FROM project_sso WHERE project_id = 'p-d'`).first()).toBeNull();
    expect((await chamar('PUT', '/api/v1/projects/p-c/sso', S.pa, sso('c.com'))).status).toBe(200);
  });

  it('provisionar: config antiga numa direta lança antes de inserir; na consultoria cria', async () => {
    const claims = (email: string) => ({ iss: 'i', aud: 'a', exp: 0, iat: 0, sub: 's', email, email_verified: true, name: 'P' } as any);
    const cfg = (project_id: string) => ({ project_id, issuer: 'https://idp.exemplo.com', client_id: 'cid', client_secret: 'x', dominios: 'x.com', papel_padrao: 'org_user', ativo: 1 });
    await expect(provisionar(workerEnv(), cfg('p-d'), claims('novo@x.com'))).rejects.toThrow(MSG_DIRETA_SEM_CLIENTE.error);
    expect(await contas('novo@x.com')).toHaveLength(0);
    expect((await provisionar(workerEnv(), cfg('p-c'), claims('novo-c@x.com'))).criado).toBe(true);
  });

  it('SCIM POST /Users: 403 na direta (nada criado), 201 na consultoria', async () => {
    const d = await chamar('POST', '/scim/v2/Users', scimHeaders('tok-d'), { userName: 'scim-d@x.com' });
    expect(d.status).toBe(403);
    expect(await contas('scim-d@x.com')).toHaveLength(0);
    expect((await chamar('POST', '/scim/v2/Users', scimHeaders('tok-c'), { userName: 'scim-c@x.com' })).status).toBe(201);
  });

  it('transferência: com contas de cliente para a direta = 409 em português; sem contas, e da direta para consultoria, seguem', async () => {
    const r = await chamar('POST', '/api/v1/platform/projects/p-c/transferir', S.pa, { orgDestinoId: 'org_d', motivo: 'teste' });
    expect(r.status).toBe(409);
    expect((await r.json() as any).error).toMatch(/direta.*contas de cliente/);
    expect((await env.DB.prepare(`SELECT org_id FROM projects WHERE id = 'p-c'`).first<any>()).org_id).toBe('org_c');
    expect((await chamar('POST', '/api/v1/platform/projects/p-c2/transferir', S.pa, { orgDestinoId: 'org_d', motivo: 'teste' })).status).toBe(200);
    expect((await chamar('POST', '/api/v1/platform/projects/p-d2/transferir', S.pa, { orgDestinoId: 'org_c', motivo: 'teste' })).status).toBe(200);
  });

  it('convite de stakeholder segue permitido na direta (aprovador externo, não papel de cliente)', async () => {
    await env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-st','p-d','Ana','ana@parte.com','executivo','CEO')`).run();
    const r = await chamar('POST', '/api/v1/projects/p-d/governance/g-st/convidar', S.pa);
    expect(r.status).toBe(201);
    expect((await env.DB.prepare(`SELECT role FROM users WHERE lower(email) = 'ana@parte.com'`).first<any>()).role).toBe('stakeholder');
  });
});

describe('migrate-27701(.2025): controles sem requisito ficam visíveis', () => {
  const ctrl = (proj: string, id: string, std: string) =>
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, description) VALUES (?, ?, ?, ?, 'Implemented', '')`).bind(id, proj, std, id + ' — x');
  const auditoria = async (acao: string) => (await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = ? ORDER BY rowid DESC LIMIT 1`).bind(acao).first<{ details: string }>())!.details;

  beforeAll(async () => {
    const { semearCatalogo } = await import('../src/services/requisitos');
    await semearCatalogo(env.DB);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('pmx', 'X', 'ISO 27001, ISO 27701', 'Controller', 'Active', 'org_d')`),
      ctrl('pmx', '7.2.1', 'ISO 27701:2019'), // -> A.1.1 (grosso, fora do catálogo)
      ctrl('pmx', '5.4', 'ISO 27701:2019'), // -> A.3.3 (existe no catálogo)
      ctrl('pmx', 'A.5.1.1', 'ISO 27001:2013'), // -> A.5.1 (existe no catálogo 27001:2022)
    ]);
  });

  it('27701:2025 lista o id grosso, liga o real, e não muda os números', async () => {
    const r = await chamar('POST', '/api/v1/projects/pmx/migrate-27701-2025', S.beto);
    const b: any = await r.json();
    expect(r.status).toBe(200);
    expect(b.sem_requisito).toEqual(['A.1.1']);
    expect({ criados: b.new_controls_created, gaps: b.gaps }).toEqual({ criados: 2, gaps: ['A.1.18', 'A.1.20', 'A.2.14', 'A.2.15', 'A.3.33', 'A.3.36'] });
    const lig = await env.DB.prepare(`SELECT requisito_id FROM compliance_controls WHERE project_id = 'pmx' AND standard = 'ISO 27701:2025' AND id = 'A.3.3'`).first<{ requisito_id: string | null }>();
    expect(lig?.requisito_id).toBeTruthy();
    expect(await auditoria('migration.27701.2025')).toContain('1 sem requisito');
  });

  it('27001:2022 informa sem_requisito (vazio quando tudo liga) e cita na auditoria', async () => {
    const r = await chamar('POST', '/api/v1/projects/pmx/migrate-27701', S.beto);
    const b: any = await r.json();
    expect(r.status).toBe(200);
    expect(b.sem_requisito).toEqual([]);
    expect(b.new_controls_created).toBe(1);
    expect(await auditoria('migration.27701')).toContain('0 sem requisito');
  });
});
