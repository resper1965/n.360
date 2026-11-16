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

describe('privacy: matriz de assinatura, revogação, titular', () => {
  beforeAll(async () => {
    await concederModulos(['u-ana', 'u-beto', 'u-cris'], ['privacy', 'iso']);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, status, ciso_approved_by) VALUES ('ro-d','p-d','F','Approved','L'),('ro-c','p-c','F','Approved','L')`),
      env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, system_name, status, dpo_signature) VALUES ('dp-d','p-d','S','Approved','D'),('dp-c','p-c','S','Approved','D')`),
      env.DB.prepare(`INSERT INTO management_reviews (id, project_id, review_date, status) VALUES ('mr-d','p-d','2026-07-16','Completed'),('mr-c','p-c','2026-07-16','Completed')`),
    ]);
  });
  const corpo = { name: 'Dir', email: 'dir@d.lat', role_category: 'executivo', job_title: 'CEO' };
  const motivo = { role: 'todas', reason: 'motivo suficiente' };
  it('governança: admin direto cria e remove a linha de quem assina; o de consultoria e o de outra org, não', async () => {
    const ok = await chamar('POST', '/api/v1/projects/p-d/governance', S.beto, corpo);
    expect(ok.status, await ok.clone().text()).toBeLessThan(300);
    expect((await chamar('POST', '/api/v1/projects/p-c/governance', S.cris, corpo)).status).toBe(403);
    expect((await chamar('POST', '/api/v1/projects/p-c/governance', S.beto, corpo)).status).toBeGreaterThanOrEqual(403);
    const id = (await um<{ id: string }>(`SELECT id FROM project_governance WHERE project_id='p-d' AND email='dir@d.lat'`))!.id;
    expect((await chamar('DELETE', `/api/v1/projects/p-d/governance/${id}`, S.beto)).status).toBeLessThan(300);
  });
  it('helpers', async () => {
    const { podeMexerEmAssinaturaDe, podeRevogarAprovacao } = await import('../src/helpers');
    const beto = { id: 'u-beto', role: 'consultoria_admin', org_id: 'org_d' } as any;
    expect(await podeMexerEmAssinaturaDe(env.DB, beto, 'p-d')).toBe(true);
    expect(await podeRevogarAprovacao(env.DB, beto, 'p-d')).toBe(true);
    expect(await podeRevogarAprovacao(env.DB, beto, 'p-c')).toBe(false);
    expect(await podeRevogarAprovacao(env.DB, { ...beto, org_id: 'org_c' }, 'p-c')).toBe(false);
    for (const u of [{ id: 'a', role: 'client', agente: true }, { ...beto, agente: true }, { ...beto, id: 'apikey:k' }]) {
      expect(await podeRevogarAprovacao(env.DB, u as any, 'p-d')).toBe(false);
      expect(await podeMexerEmAssinaturaDe(env.DB, u as any, 'p-d')).toBe(false);
    }
  });
  it('revogar aprovação do ROPA: direto passa; consultoria e outra org, não', async () => {
    expect((await chamar('POST', '/api/v1/projects/p-c/ropa/ro-c/revoke-approval', S.cris, motivo)).status).toBe(403);
    expect((await chamar('POST', '/api/v1/projects/p-c/ropa/ro-c/revoke-approval', S.beto, motivo)).status).toBeGreaterThanOrEqual(403);
    const r = await chamar('POST', '/api/v1/projects/p-d/ropa/ro-d/revoke-approval', S.beto, motivo);
    expect(r.status, await r.clone().text()).toBe(200);
  });
  it('revogar aprovação do DPIA: direto passa; consultoria e outra org, não', async () => {
    const u = (p: string, d: string) => `/api/v1/projects/${p}/dpia/${d}/revoke-approval`;
    expect((await chamar('POST', u('p-c', 'dp-c'), S.cris, { reason: 'motivo suficiente' })).status).toBe(403);
    expect((await chamar('POST', u('p-c', 'dp-c'), S.beto, { reason: 'motivo suficiente' })).status).toBeGreaterThanOrEqual(403);
    const r = await chamar('POST', u('p-d', 'dp-d'), S.beto, { reason: 'motivo suficiente' });
    expect(r.status, await r.clone().text()).toBe(200);
  });
  it('excluir análise crítica: direto passa; consultoria e outra org, não', async () => {
    expect((await chamar('DELETE', '/api/v1/management-reviews/mr-c', S.cris)).status).toBe(403);
    expect((await chamar('DELETE', '/api/v1/management-reviews/mr-c', S.beto)).status).toBeGreaterThanOrEqual(403);
    const r = await chamar('DELETE', '/api/v1/management-reviews/mr-d', S.beto);
    expect(r.status, await r.clone().text()).toBe(200);
  });
  it('titular: admin direto consulta; admin de consultoria e de outra org, não', async () => {
    const q = (p: string, s: any) => chamar('GET', `/api/v1/projects/${p}/data-subject?identificador=x@y.lat`, s);
    expect((await q('p-d', S.beto)).status).toBe(200);
    expect((await q('p-c', S.cris)).status).toBe(403);
    expect((await q('p-c', S.beto)).status).toBeGreaterThanOrEqual(403);
    expect((await chamar('GET', '/api/v1/projects/p-c/data-subject/retencao', S.cris)).status).toBe(403);
    expect((await chamar('GET', '/api/v1/projects/p-d/data-subject/retencao', S.beto)).status).toBe(200);
  });
  it('ficha do ROPA: reabrir é do admin direto, não do de consultoria', async () => {
    const { montarFicha } = await import('../src/services/ropa-abas/ficha');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, status, ciso_approved_by) VALUES ('ro-f','p-d','F','Approved','L'),('ro-g','p-c','F','Approved','L')`),
    ]);
    const beto = { id: 'u-beto', email: 'beto@d.lat', role: 'consultoria_admin', org_id: 'org_d' };
    const cris = { id: 'u-cris', email: 'cris@c.lat', role: 'consultoria_admin', org_id: 'org_c' };
    expect((await montarFicha(env.DB, 'p-d', 'ro-f', beto))!.acoes.reabrir.habilitada).toBe(true);
    expect((await montarFicha(env.DB, 'p-c', 'ro-g', cris))!.acoes.reabrir.habilitada).toBe(false);
  });
});

describe('quem criou não decide', () => {
  const ator = (id: string, email: string) => ({ id, email, role: 'consultoria_admin', org_id: 'org_d' }) as any;
  it('pedido: o criador não aprova nem recusa (rota); o colega passa do portão', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, criado_por)
        VALUES ('ped-q','org_d','p-d','documento','doc-q','Doc','ciso','{}','h','Beto@D.lat')`),
      env.DB.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, email, user_id) VALUES ('pd-b','ped-q','beto@d.lat','u-beto'),('pd-a','ped-q','ana@d.lat','u-ana')`),
    ]);
    for (const acao of ['aprovar', 'recusar']) {
      const r = await chamar('POST', `/api/v1/pedidos/ped-q/${acao}`, S.beto, { senha: SENHA, motivo: 'x' });
      expect(r.status).toBe(403);
      expect((await r.json() as any).error).toMatch(/quem pediu/i);
    }
    const ok = await chamar('POST', '/api/v1/pedidos/ped-q/aprovar', S.ana, { senha: SENHA });
    expect(JSON.stringify(await ok.json())).not.toMatch(/quem pediu/i);
  });
  it('base do site: quem pediu não aprova; outro aprova', async () => {
    const { aprovarBase } = await import('../src/services/ot-fase');
    await env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase, base_pedida_por) VALUES ('s-q','p-d','SE Q','base_em_aprovacao','u-beto')`).run();
    expect(await aprovarBase(env.DB, ator('u-beto', 'beto@d.lat'), 'p-d', 's-q')).toMatchObject({ ok: false, status: 403 });
    // o colega passa do portão: falha por outra razão (sem zonas 4.1.1), nunca 403
    expect(await aprovarBase(env.DB, ator('u-ana', 'ana@d.lat'), 'p-d', 's-q')).not.toMatchObject({ status: 403 });
    expect((await um('SELECT fase FROM ot_sites WHERE id = ?', 's-q')).fase).toBe('base_em_aprovacao');
  });
  it('avaliação: quem avaliou não confirma; outro confirma', async () => {
    const { salvarAvaliacao, confirmarAvaliacao } = await import('../src/services/ot-avaliacao');
    const cod = '9.9';
    await env.DB.prepare(`INSERT OR IGNORE INTO ot_requisitos (id, framework, codigo, titulo, versao) VALUES ('rq-q', 'ONS-RO-CB.BR.01', ?, 't', 'v')`).bind(cod).run();
    const beto = ator('u-beto', 'beto@d.lat');
    expect(await salvarAvaliacao(env.DB, beto, 'p-d', cod, { situacao: 'atende' } as any)).toMatchObject({ ok: true });
    const visto = (await um<any>('SELECT updated_at u FROM ot_avaliacoes WHERE project_id = ?', 'p-d')).u;
    expect(await confirmarAvaliacao(env.DB, beto, 'p-d', cod, visto)).toMatchObject({ ok: false, status: 403 });
    expect(await confirmarAvaliacao(env.DB, ator('u-ana', 'ana@d.lat'), 'p-d', cod, visto)).toEqual({ ok: true });
  });
});

describe('equipe da organização direta', () => {
  it('incidente: quem registrou não encerra (403); outra pessoa encerra (200)', async () => {
    await env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em, risco_titular, status, criado_por)
      VALUES ('in-e','p-d','IN-2026-0900','Vaz','2026-10-01','baixo','avaliado','Beto@D.lat')`).run();
    const r = await chamar('POST', '/api/v1/projects/p-d/incidentes/in-e/encerrar', S.beto, {});
    expect(r.status, await r.clone().text()).toBe(403);
    expect((await um('SELECT status FROM incidentes WHERE id = ?', 'in-e')).status).not.toBe('encerrado');
    const ok = await chamar('POST', '/api/v1/projects/p-d/incidentes/in-e/encerrar', S.ana, {});
    expect(ok.status, await ok.clone().text()).toBe(200);
  });
  it('achado de auditoria: admin direto registra; admin de consultoria segue barrado', async () => {
    await env.DB.prepare(`INSERT INTO audit_schedule (id, project_id, audit_type, title, scheduled_date) VALUES ('au-d','p-d','interna','A','2026-12-01'),('au-c','p-c','interna','A','2026-12-01')`).run();
    const corpo = { project_id: 'p-d', description: 'Achado', finding_type: 'Observation' };
    const d = await chamar('POST', '/api/v1/audits/au-d/findings', S.beto, corpo);
    expect(d.status, await d.clone().text()).toBe(200);
    expect((await um('SELECT COUNT(*) n FROM audit_findings WHERE audit_id = ?', 'au-d')).n).toBe(1);
    const c = await chamar('POST', '/api/v1/audits/au-c/findings', S.cris, corpo);
    expect(c.status).toBe(403);
    expect(await c.text()).toMatch(/não registra achado/);
  });
  it('comercial: o admin direto não acessa leads, funil nem preço; o de consultoria sim', async () => {
    for (const rota of ['/api/v1/leads', '/api/v1/funil', '/api/v1/assessments/x/pricing', '/api/v1/org/config']) {
      expect((await chamar('GET', rota, S.beto)).status, rota).toBe(403);
    }
    expect((await chamar('GET', '/api/v1/leads', S.cris)).status).toBe(200);
    expect((await chamar('GET', '/api/v1/org/config', S.cris)).status).toBe(200);
  });
  it('comercial: a flag vem do banco, não da sessão (tipo mudado vale na requisição seguinte)', async () => {
    await env.DB.prepare(`UPDATE organizations SET tipo = 'consultoria' WHERE id = 'org_d'`).run();
    try { expect((await chamar('GET', '/api/v1/leads', S.beto)).status).toBe(200); }
    finally { await env.DB.prepare(`UPDATE organizations SET tipo = 'direta' WHERE id = 'org_d'`).run(); }
    expect((await chamar('GET', '/api/v1/leads', S.beto)).status).toBe(403);
  });
  it('contas: o admin direto não cria cliente nem promove equipe a cliente; cria consultor; consultoria cria cliente', async () => {
    const base = { email: 'novo@d.lat', name: 'Novo' };
    for (const role of ['org_admin', 'org_user', 'client']) {
      expect((await chamar('POST', '/api/v1/users', S.beto, { ...base, role, client_project_id: 'p-d' })).status, role).toBe(403);
    }
    expect(await um('SELECT 1 x FROM users WHERE email = ?', 'novo@d.lat')).toBeNull();
    const ok = await chamar('POST', '/api/v1/users', S.beto, { ...base, role: 'consultor' });
    expect(ok.status, await ok.clone().text()).toBe(201);
    const id = (await ok.json() as any).id;
    const promove = await chamar('PUT', `/api/v1/users/${id}`, S.beto, { role: 'client', client_project_id: 'p-d' });
    expect(promove.status, await promove.clone().text()).toBe(403);
    const cli = await chamar('POST', '/api/v1/users', S.cris, { email: 'cli@c.lat', name: 'Cli', role: 'org_admin', client_project_id: 'p-c' });
    expect(cli.status, await cli.clone().text()).toBe(201);
  });
});
