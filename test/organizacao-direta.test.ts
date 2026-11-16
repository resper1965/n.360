import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { adminDireto, tipoDaOrg } from '../src/services/organizacao';
import { gestorArciberDireto } from '../src/services/ot-inventario';
import { applySchema, workerEnv, sessionFor, habilitarOt, concederModulos } from './helpers/d1';

const SENHA = 'Senha-forte-123!';
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv() as any);
const um = <T = any>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<T>();
const S: Record<string, Record<string, string>> = {};
const novaOrg = (o: Record<string, unknown> = {}) => ({
  nome: 'Empresa Direta', slug: 'empresa-direta', cnpj: '11222333000181', adminEmail: 'admin@direta.lat', adminNome: 'Admin Direta',
  maxProjetos: 5, maxUsuarios: 10, termoVersao: 'direta-v1-2026-11', ...o,
});

afterEach(() => vi.restoreAllMocks());
beforeAll(async () => {
  await applySchema();
  const h = await hashPassword(SENHA);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id, ativo) VALUES ('u-pa','pa@ness.lat',?,'PA','platform_admin','org_ness',1)`).bind(h),
  ]);
  S.pa = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
});

describe('criação de organização com tipo', () => {
  it('sem tipo nasce consultoria', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}'));
    const r = await chamar('POST', '/api/v1/platform/orgs', S.pa, novaOrg({ nome: 'C', slug: 'cons-x', adminEmail: 'a@cons.lat' }));
    expect(r.status).toBe(201);
    expect((await um('SELECT tipo FROM organizations WHERE id = ?', 'org_cons-x')).tipo).toBe('consultoria');
  });
  it('direta com módulos escolhidos na criação', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}'));
    const r = await chamar('POST', '/api/v1/platform/orgs', S.pa, novaOrg({ tipo: 'direta', modulos: ['iso', 'privacy'] }));
    expect(r.status).toBe(201);
    const o = await um('SELECT tipo, modulos_contratados m FROM organizations WHERE id = ?', 'org_empresa-direta');
    expect(o.tipo).toBe('direta');
    expect(JSON.parse(o.m)).toEqual(['iso', 'privacy']);
  });
  it('tipo inválido é recusado e o tipo não muda depois de criado', async () => {
    expect((await chamar('POST', '/api/v1/platform/orgs', S.pa, novaOrg({ slug: 'x-y-z', adminEmail: 'z@z.lat', tipo: 'outra' }))).status).toBe(400);
    const r = await chamar('PUT', '/api/v1/platform/orgs/org_empresa-direta', S.pa, { tipo: 'consultoria' });
    expect(r.status).toBe(400); // atualizarOrgSchema é strict: não aceita o campo
    expect((await um('SELECT tipo FROM organizations WHERE id = ?', 'org_empresa-direta')).tipo).toBe('direta');
  });
});

describe('adminDireto / gestorArciberDireto', () => {
  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO organizations (id, name, slug, max_projects, max_users, tipo) VALUES ('org_d','Direta','direta-d',10,10,'direta'), ('org_c','Consultoria','cons-c',10,10,'consultoria')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-d','D','ISO 27001','controller','Active','org_d'),('p-c','C','ISO 27001','controller','Active','org_c')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title, is_primary) VALUES ('p-d','Ana','ana@d.lat','operacoes','Gestor ARCiber',1)`),
    ]);
  });
  const ad = { id: 'u-ad', email: 'ana@d.lat', role: 'consultoria_admin', org_id: 'org_d' };
  it('admin da organização direta, no projeto dela', async () => expect(await adminDireto(env.DB, ad, 'p-d')).toBe(true));
  it('não em projeto de outra organização', async () => expect(await adminDireto(env.DB, ad, 'p-c')).toBe(false));
  it('consultoria_admin de consultoria não passa', async () => expect(await adminDireto(env.DB, { ...ad, org_id: 'org_c' }, 'p-c')).toBe(false));
  it('outros papéis, agente e chave de API não passam', async () => {
    for (const u of [{ ...ad, role: 'consultor' }, { ...ad, role: 'org_admin' }, { ...ad, agente: true }, { ...ad, id: 'apikey:k' }, null]) {
      expect(await adminDireto(env.DB, u as any, 'p-d')).toBe(false);
    }
  });
  it('organização suspensa não passa', async () => {
    await env.DB.prepare(`UPDATE organizations SET status = 'Suspended' WHERE id = 'org_d'`).run();
    try { expect(await adminDireto(env.DB, ad, 'p-d')).toBe(false); }
    finally { await env.DB.prepare(`UPDATE organizations SET status = 'Active' WHERE id = 'org_d'`).run(); }
  });
  it('gestor: admin direto que consta no cargo (e-mail igual)', async () => {
    expect(await gestorArciberDireto(env.DB, ad, 'p-d')).toBe(true);
    expect(await gestorArciberDireto(env.DB, { ...ad, email: 'outro@d.lat' }, 'p-d')).toBe(false);
  });
  it('gestor: e-mail vazio ou ausente não passa, mesmo com linha de governança sem e-mail', async () => {
    await env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title, is_primary) VALUES ('p-d','Sem email','','operacoes','Gestor ARCiber',0)`).run();
    expect(await gestorArciberDireto(env.DB, { ...ad, email: '' }, 'p-d')).toBe(false);
    expect(await gestorArciberDireto(env.DB, { ...ad, email: undefined as any }, 'p-d')).toBe(false);
  });
  it('gestor: e-mail sem diferenciar maiúsculas', async () => expect(await gestorArciberDireto(env.DB, { ...ad, email: 'ANA@D.LAT' }, 'p-d')).toBe(true));
  it('sessão nova sem org_id, org_id vazio ou projeto inexistente não passam', async () => {
    const iat = Date.parse('2026-10-04T00:00:00Z'); // ms, como compara orgDoUsuario
    expect(await adminDireto(env.DB, { ...ad, org_id: undefined, iat } as any, 'p-d')).toBe(false);
    expect(await adminDireto(env.DB, { ...ad, org_id: '', iat } as any, 'p-d')).toBe(false);
    expect(await adminDireto(env.DB, ad, 'p-inexistente')).toBe(false);
  });
  it('tipoDaOrg', async () => {
    expect(await tipoDaOrg(env.DB, 'org_d')).toBe('direta');
    expect(await tipoDaOrg(env.DB, 'org_c')).toBe('consultoria');
    expect(await tipoDaOrg(env.DB, 'org_nope')).toBeNull();
    expect(await tipoDaOrg(env.DB, null)).toBeNull();
  });
});

describe('n.ot: Gestor ARCiber na organização direta', () => {
  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES
        ('u-ana','ana@d.lat','x','Ana','consultoria_admin','org_d'),('u-beto','beto@d.lat','x','Beto','consultoria_admin','org_d'),
        ('u-cris','cris@c.lat','x','Cris','consultoria_admin','org_c')`),
    ]);
    await habilitarOt('p-d', 'p-c');
    await concederModulos(['u-ana', 'u-beto', 'u-cris'], ['ot']);
    S.ana = await sessionFor({ id: 'u-ana', email: 'ana@d.lat', role: 'consultoria_admin', org_id: 'org_d' } as any);
    S.beto = await sessionFor({ id: 'u-beto', email: 'beto@d.lat', role: 'consultoria_admin', org_id: 'org_d' } as any);
    S.cris = await sessionFor({ id: 'u-cris', email: 'cris@c.lat', role: 'consultoria_admin', org_id: 'org_c' } as any);
  });
  it('admin direto designado Gestor liga o agente; o não designado e o de consultoria não', async () => {
    expect((await chamar('PUT', '/api/v1/projects/p-d/ot/agente', S.ana, { ligado: true })).status).toBe(200);
    expect((await chamar('PUT', '/api/v1/projects/p-d/ot/agente', S.beto, { ligado: true })).status).toBe(403);
    expect((await chamar('PUT', '/api/v1/projects/p-d/ot/agente', S.cris, { ligado: true })).status).toBe(403);
    expect((await chamar('PUT', '/api/v1/projects/p-c/ot/agente', S.cris, { ligado: true })).status).toBe(403);
  });
  const GATED: [string, string, unknown][] = [
    ['POST', '/assessment/4.1.1/confirmar', {}], ['POST', '/sites/x/base/aprovar', {}], ['POST', '/sites/x/base/devolver', {}],
    ['POST', '/sites/x/obra/abrir', {}], ['POST', '/sites/x/obra/renovar', {}], ['POST', '/desvios/x/aceitar', {}],
  ];
  it('as demais rotas só do Gestor: Beto e Cris recebem 403 (Gestor), Ana passa o portão', async () => {
    for (const [m, r, b] of GATED) {
      for (const quem of [S.beto, S.cris]) {
        const res = await chamar(m, '/api/v1/projects/p-d/ot' + r, quem, b);
        expect(res.status, r).toBe(403);
      }
      const a = await chamar(m, '/api/v1/projects/p-d/ot' + r, S.ana, b);
      expect(JSON.stringify(await a.json()), r).not.toMatch(/só o Gestor ARCiber/);
    }
  });
  it('GET /agente: pode_ligar só para o Gestor designado', async () => {
    expect((await (await chamar('GET', '/api/v1/projects/p-d/ot/agente', S.ana)).json() as any).pode_ligar).toBe(true);
    expect((await (await chamar('GET', '/api/v1/projects/p-d/ot/agente', S.beto)).json() as any).pode_ligar).toBe(false);
  });
  it('projeto da organização direta não é alcançável por admin de outra organização', async () => {
    expect((await chamar('GET', '/api/v1/projects/p-d/ot/agente', S.cris)).status).toBeGreaterThanOrEqual(403);
  });
  it('podeVerCompleto: admin direto sim; consultoria_admin sem designação, agente e chave de API não', async () => {
    const { podeVerCompleto } = await import('../src/services/ot-inventario');
    expect(await podeVerCompleto(env.DB, { id: 'u-beto', email: 'beto@d.lat', role: 'consultoria_admin', org_id: 'org_d' }, 'p-d')).toBe(true);
    expect(await podeVerCompleto(env.DB, { id: 'u-cris', email: 'cris@c.lat', role: 'consultoria_admin', org_id: 'org_c' }, 'p-c')).toBe(false);
    expect(await podeVerCompleto(env.DB, { id: 'u-cris', email: 'cris@c.lat', role: 'consultoria_admin', org_id: 'org_c' }, 'p-d')).toBe(false);
    for (const u of [{ id: 'apikey:k', role: 'consultoria_admin' }, { id: 'ag', role: 'consultoria_admin', agente: true }]) {
      expect(await podeVerCompleto(env.DB, { ...u, email: 'beto@d.lat', org_id: 'org_d' }, 'p-d')).toBe(false);
    }
  });
  it('aviso e painel: pessoasDoProjeto traz o org_id do admin direto, que então é Gestor', async () => {
    const { pessoasDoProjeto } = await import('../src/services/avisos-prazo');
    const ps = await pessoasDoProjeto(env.DB, 'p-d');
    const ana = ps.find((p) => p.id === 'u-ana')!;
    expect(await gestorArciberDireto(env.DB, ana, 'p-d')).toBe(true);
    expect(await gestorArciberDireto(env.DB, ps.find((p) => p.id === 'u-beto')!, 'p-d')).toBe(false);
    await env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase, obra_ate) VALUES ('s-ap','p-d','SE Leste','base_em_aprovacao',NULL)`).run();
    const { blocoOt } = await import('../src/services/painel-ot');
    const b: any = await blocoOt(env.DB, 'p-d', { id: 'u-ana', email: 'ana@d.lat', role: 'consultoria_admin', org_id: 'org_d' }, '2026-11-16', new Date('2026-11-16'));
    const textos = (b.itens as any[]).map((i) => i.texto).join('|');
    expect(textos).toMatch(/base aguardando aprovação/);
    const bb: any = await blocoOt(env.DB, 'p-d', { id: 'u-beto', email: 'beto@d.lat', role: 'consultoria_admin', org_id: 'org_d' }, '2026-11-16', new Date('2026-11-16'));
    expect((bb.itens as any[]).map((i) => i.texto).join('|')).not.toMatch(/base aguardando aprovação/);
  });
});
