import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, execSql, sessionFor, workerEnv } from './helpers/d1';
import { sha256Hex } from '../src/helpers';
import migration0066 from '../migrations/0066_modulos_por_pessoa.sql?raw';

/**
 * n.360, fatia 3 (spec 2026-10-12-n360-modulos-por-pessoa-design): o módulo é da PESSOA, além do projeto. Rota de faixa
 * iso/privacy só passa se o projeto tem o módulo E a pessoa tem; o núcleo não exige módulo da pessoa.
 */
const req = (caminho: string, init: RequestInit = {}) => worker.fetch(new Request('http://localhost' + caminho, init), workerEnv());
const json = { 'Content-Type': 'application/json' };
const modulos = async (id: string) =>
  (await env.DB.prepare('SELECT modulo FROM usuario_modulos WHERE user_id = ? ORDER BY modulo').bind(id).all<{ modulo: string }>()).results.map((r) => r.modulo);
const conta = (id: string, role: string, projeto: string | null = null, org = 'org_ness') =>
  env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES (?, ?, 'x', ?, ?, ?, ?)`)
    .bind(id, `${id}@ex.lat`, id, role, projeto, org);
const sessao = (id: string, role: string, projeto: string | null = null, org = 'org_ness') =>
  sessionFor({ id, email: `${id}@ex.lat`, role, client_project_id: projeto, org_id: org });

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO organizations (id, name, slug, modulos_contratados) VALUES ('o-duo', 'Duo', 'o-duo', '["iso","privacy"]'), ('o-priv', 'Priv', 'o-priv', '["privacy"]')`),
    // p-duo: n.iso e n.privacy; p-iso: só n.iso (o padrão da org_ness)
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-duo', 'Duo', 'x', 'c', 'Active', 'org_ness'), ('p-iso', 'Iso', 'x', 'c', 'Active', 'org_ness'), ('p-odu', 'Odu', 'x', 'c', 'Active', 'o-duo')`),
    env.DB.prepare(`INSERT OR IGNORE INTO projeto_modulos (project_id, modulo) VALUES ('p-duo', 'privacy')`),
  ]);
});

describe('migration 0066: papéis normalizados e carga inicial', () => {
  it('normaliza papéis legados, carrega o que cada conta já usa e é repetível', async () => {
    await env.DB.batch([
      conta('m-admin', 'admin'), conta('m-consultant', 'consultant'), conta('m-cliadm', 'client_admin', 'p-duo'),
      conta('m-user', 'user', 'p-iso'), conta('m-emp', 'employee', 'p-duo'), conta('m-orgadm', 'org_admin', 'p-duo'),
      conta('m-cons-duo', 'consultor', null, 'o-duo'), conta('m-cadm', 'consultoria_admin', null, 'o-priv'), conta('m-com', 'comercial', null, 'o-duo'),
      conta('m-stk', 'stakeholder', 'p-duo'),
    ]);
    // banco de antes da 0066: nenhuma linha (o gatilho de conta nova as teria criado)
    await env.DB.prepare(`DELETE FROM usuario_modulos WHERE user_id LIKE 'm-%'`).run();
    await execSql(migration0066);
    await execSql(migration0066); // repetível
    const papel = async (id: string) => (await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(id).first<{ role: string }>())!.role;
    expect(await papel('m-admin')).toBe('platform_admin');
    expect(await papel('m-consultant')).toBe('consultor');
    expect(await papel('m-cliadm')).toBe('client');
    expect(await papel('m-user')).toBe('org_user');
    expect(await papel('m-emp')).toBe('org_user');
    // clientes: os módulos do projeto
    expect(await modulos('m-cliadm')).toEqual(['iso', 'privacy']);
    expect(await modulos('m-user')).toEqual(['iso']);
    expect(await modulos('m-emp')).toEqual(['iso', 'privacy']);
    expect(await modulos('m-orgadm')).toEqual(['iso', 'privacy']);
    // equipe: o contrato da organização
    expect(await modulos('m-consultant')).toEqual(['iso']);
    expect(await modulos('m-cons-duo')).toEqual(['iso', 'privacy']);
    expect(await modulos('m-cadm')).toEqual(['privacy']);
    expect(await modulos('m-com')).toEqual(['iso', 'privacy']);
    // platform_admin tem todos sempre; stakeholder só alcança pedidos (núcleo)
    expect(await modulos('m-admin')).toEqual([]);
    expect(await modulos('m-stk')).toEqual([]);
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM usuario_modulos WHERE user_id LIKE 'm-%'`).first()).toEqual({ n: 13 });
  });

  it('conta nova recebe o padrão por gatilho (qualquer caminho de criação: SSO, SCIM, organização nova)', async () => {
    await env.DB.batch([conta('g-cli', 'org_user', 'p-duo'), conta('g-cons', 'consultor', null, 'o-priv'), conta('g-pa', 'platform_admin'), conta('g-semorg', 'consultor', null, 'org-inexistente')]);
    expect(await modulos('g-cli')).toEqual(['iso', 'privacy']);
    expect(await modulos('g-cons')).toEqual(['privacy']);
    expect(await modulos('g-pa')).toEqual([]);
    expect(await modulos('g-semorg')).toEqual(['iso']); // contrato ilegível: n.iso, como `parseModulos`
  });
});

describe('regra: a pessoa precisa do módulo', () => {
  beforeAll(async () => {
    await env.DB.batch([
      conta('r-iso', 'client', 'p-duo'), conta('r-pa', 'platform_admin'), conta('r-cons', 'consultor'),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-duo', 'C', 'r-cons@ex.lat', 'consultor', 'Consultor')`),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat) VALUES ('rk-1', 'p-duo', 'A', 'B')`),
    ]);
    // r-iso: só n.iso (o projeto tem os dois); r-cons: só n.privacy
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM usuario_modulos WHERE user_id IN ('r-iso', 'r-cons')`),
      env.DB.prepare(`INSERT INTO usuario_modulos (user_id, modulo) VALUES ('r-iso', 'iso'), ('r-cons', 'privacy')`),
    ]);
  });

  it('sem o módulo: 403 "Você não tem acesso ao n.X"; com ele: passa; núcleo livre', async () => {
    const h = await sessao('r-iso', 'client', 'p-duo');
    const priv = await req('/api/v1/projects/p-duo/terceiros', { headers: h });
    expect(priv.status).toBe(403);
    expect((await priv.json<any>()).error).toBe('Você não tem acesso ao n.privacy');
    expect((await req('/api/v1/projects/p-duo/risks', { headers: h })).status).toBe(200);
    expect((await req('/api/v1/projects/p-duo/partes', { headers: h })).status).toBe(200);
  });

  it('recurso por id (requireResourceAccess) também exige o módulo da pessoa', async () => {
    const h = await sessao('r-cons', 'consultor');
    const r = await req('/api/v1/risks/rk-1', { method: 'PUT', headers: { ...h, ...json }, body: JSON.stringify({ asset: 'Z' }) });
    expect(r.status).toBe(403);
    expect((await r.json<any>()).error).toBe('Você não tem acesso ao n.iso');
    expect((await req('/api/v1/projects/p-duo/risks', { headers: h })).status).toBe(403);
    expect((await req('/api/v1/projects/p-duo/terceiros', { headers: h })).status).toBe(200);
  });

  it('o módulo que falta no PROJETO continua com a mensagem do projeto', async () => {
    const h = await sessao('r-cons', 'consultor');
    await env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-iso', 'C', 'r-cons@ex.lat', 'consultor', 'Consultor')`).run();
    const r = await req('/api/v1/projects/p-iso/terceiros', { headers: h });
    expect(r.status).toBe(403);
    expect((await r.json<any>()).error).toContain('não habilitado neste projeto');
  });

  it('platform_admin alcança todos os módulos sem linha', async () => {
    const h = await sessao('r-pa', 'platform_admin');
    expect((await req('/api/v1/projects/p-duo/terceiros', { headers: h })).status).toBe(200);
    expect((await req('/api/v1/projects/p-duo/risks', { headers: h })).status).toBe(200);
  });

  it('chave de API: os módulos do projeto da chave', async () => {
    await env.DB.prepare(`INSERT INTO api_keys (id, project_id, name, key_hash, permissions, status) VALUES ('k-1', 'p-duo', 'k', ?, 'read', 'Active')`).bind(await sha256Hex('chave-duo')).run();
    for (const c of ['/api/v1/projects/p-duo/terceiros', '/api/v1/projects/p-duo/risks']) {
      expect((await req(c, { headers: { 'X-API-Key': 'chave-duo' } })).status, c).toBe(200);
    }
  });

  it('agente MCP: os módulos do consultor que concedeu, valendo na hora', async () => {
    await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('ac-1', 'r-cons', 'p-duo', datetime('now', '+30 days'))`).run();
    const agente = (c: string) => worker.fetch(new Request('http://localhost' + c), { ...workerEnv(), AGENTE: { userId: 'r-cons', email: 'r-cons@ex.lat', projectId: 'p-duo', concessaoId: 'ac-1' } } as any);
    expect((await agente('/api/v1/projects/p-duo/terceiros')).status).toBe(200);
    const iso = await agente('/api/v1/projects/p-duo/risks');
    expect(iso.status).toBe(403);
    expect((await iso.json<any>()).error).toBe('Você não tem acesso ao n.iso');
    await env.DB.prepare(`INSERT INTO usuario_modulos (user_id, modulo) VALUES ('r-cons', 'iso')`).run();
    expect((await agente('/api/v1/projects/p-duo/risks')).status).toBe(200);
    await env.DB.prepare(`DELETE FROM usuario_modulos WHERE user_id = 'r-cons' AND modulo = 'iso'`).run();
  });

  it('/auth/me devolve os módulos da pessoa', async () => {
    const me = async (h: Record<string, string>) => (await (await req('/api/v1/auth/me', { headers: h })).json<any>()).user.modulos;
    expect(await me(await sessao('r-iso', 'client', 'p-duo'))).toEqual(['iso']);
    expect(await me(await sessao('r-pa', 'platform_admin'))).toEqual(['iso', 'privacy']);
  });
});

describe('habilitar módulo no projeto concede às contas de cliente dele', () => {
  it('off→on: clientes do projeto recebem; stakeholder e equipe não; trilha com o módulo e a contagem', async () => {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-hab', 'Hab', 'x', 'c', 'Active', 'o-duo')`).run();
    await env.DB.prepare(`DELETE FROM projeto_modulos WHERE project_id = 'p-hab' AND modulo = 'privacy'`).run();
    await env.DB.batch([conta('h-oadm', 'org_admin', 'p-hab'), conta('h-ou', 'org_user', 'p-hab'), conta('h-stk', 'stakeholder', 'p-hab'),
      conta('h-cons', 'consultor'), conta('h-pa', 'platform_admin')]);
    expect(await modulos('h-ou')).toEqual(['iso']);
    const h = await sessao('h-pa', 'platform_admin');
    const ligar = () => req('/api/v1/projects/p-hab/modulos/privacy', { method: 'PUT', headers: { ...h, ...json }, body: JSON.stringify({ habilitado: true }) });
    const r = await ligar();
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await modulos('h-oadm')).toEqual(['iso', 'privacy']);
    expect(await modulos('h-ou')).toEqual(['iso', 'privacy']);
    expect(await modulos('h-stk')).toEqual([]);
    expect(await modulos('h-cons')).toEqual(['iso']);
    const trilha = async () => (await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'usuario.modulos' AND project_id = 'p-hab'`).all<{ details: string }>()).results;
    const log = await trilha();
    expect(log).toHaveLength(1);
    expect(log[0].details).toContain('n.privacy');
    expect(log[0].details).toContain('2 contas');
    // já ligado: não concede de novo nem escreve trilha
    await env.DB.prepare(`DELETE FROM usuario_modulos WHERE user_id = 'h-ou' AND modulo = 'privacy'`).run();
    expect((await ligar()).status).toBe(200);
    expect(await modulos('h-ou')).toEqual(['iso']);
    expect(await trilha()).toHaveLength(1);
  });

  it('a trilha está no mesmo batch: se ela falha, nem o módulo do projeto nem a concessão ficam', async () => {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-hab2', 'Hab2', 'x', 'c', 'Active', 'o-duo')`).run();
    await env.DB.prepare(`DELETE FROM projeto_modulos WHERE project_id = 'p-hab2' AND modulo = 'privacy'`).run();
    await env.DB.batch([conta('h2-ou', 'org_user', 'p-hab2'), conta('h2-pa', 'platform_admin')]);
    // Proxy sobre o D1 real: só o INSERT da trilha `usuario.modulos` aponta para tabela inexistente (falha no batch).
    const db = new Proxy(env.DB, {
      get(alvo, prop) {
        if (prop === 'prepare') {
          return (sql: string) => alvo.prepare(/INSERT INTO audit_logs/.test(sql) && sql.includes('usuario.modulos') ? sql.replace('audit_logs', 'tabela_que_nao_existe') : sql);
        }
        const v = (alvo as any)[prop];
        return typeof v === 'function' ? v.bind(alvo) : v;
      },
    });
    const h = await sessao('h2-pa', 'platform_admin');
    const r = await worker.fetch(new Request('http://localhost/api/v1/projects/p-hab2/modulos/privacy',
      { method: 'PUT', headers: { ...h, ...json }, body: JSON.stringify({ habilitado: true }) }), { ...workerEnv(), DB: db });
    expect(r.status).toBe(500);
    expect(await env.DB.prepare(`SELECT 1 FROM projeto_modulos WHERE project_id = 'p-hab2' AND modulo = 'privacy'`).first()).toBeNull();
    expect(await modulos('h2-ou')).toEqual(['iso']);
  });
});

describe('conceder: PUT /users/:id/modulos', () => {
  beforeAll(async () => {
    await env.DB.batch([
      conta('c-oadm', 'org_admin', 'p-duo'), conta('c-ou', 'org_user', 'p-duo'), conta('c-ou-iso', 'org_user', 'p-iso'),
      conta('c-pa', 'platform_admin'), conta('c-cons', 'consultor'), conta('c-cons-livre', 'consultor'),
      conta('c-cadm', 'consultoria_admin', null, 'o-priv'), conta('c-cons-priv', 'consultor', null, 'o-priv'),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-duo', 'C', 'c-cons@ex.lat', 'consultor', 'Consultor')`),
    ]);
  });
  const put = async (h: Record<string, string>, id: string, m: string[]) =>
    req(`/api/v1/users/${id}/modulos`, { method: 'PUT', headers: { ...h, ...json }, body: JSON.stringify({ modulos: m }) });

  it('quem gere a conta concede até o teto, e a trilha leva antes e depois', async () => {
    const h = await sessao('c-oadm', 'org_admin', 'p-duo');
    const r = await put(h, 'c-ou', ['privacy']);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toEqual({ ok: true, modulos: ['privacy'] });
    expect(await modulos('c-ou')).toEqual(['privacy']);
    const log = await env.DB.prepare(`SELECT actor, details, project_id FROM audit_logs WHERE action = 'usuario.modulos' ORDER BY rowid DESC LIMIT 1`).first<any>();
    expect(log.actor).toBe('c-oadm@ex.lat');
    expect(log.project_id).toBe('p-duo'); // o projeto da conta-alvo
    expect(log.details).toContain('c-ou@ex.lat');
    expect(log.details).toContain('iso, privacy');
    expect(log.details).toContain('→ privacy');
  });

  it('a lista de contas mostra os módulos de cada uma e o teto do que quem lista pode conceder', async () => {
    const lista = async (h: Record<string, string>) => (await (await req('/api/v1/users', { headers: h })).json<any[]>());
    const doOrgAdmin = await lista(await sessao('c-oadm', 'org_admin', 'p-duo'));
    const ou = doOrgAdmin.find((u) => u.id === 'c-oadm');
    expect(ou.modulos).toEqual(['iso', 'privacy']);
    expect(ou.teto_modulos).toEqual(['iso', 'privacy']);
    const doPa = await lista(await sessao('c-pa', 'platform_admin'));
    const isoSo = doPa.find((u) => u.id === 'c-ou-iso');
    expect(isoSo.teto_modulos).toEqual(['iso', 'privacy']); // platform_admin concede qualquer um
    expect(doPa.find((u) => u.id === 'c-pa').modulos).toEqual(['iso', 'privacy']);
    const doCadm = await lista(await sessao('c-cadm', 'consultoria_admin', null, 'o-priv'));
    expect(doCadm.find((u) => u.id === 'c-cons-priv').teto_modulos).toEqual(['privacy']);
  });

  it('teto: cliente só recebe módulo do projeto dele; equipe, do contrato da organização', async () => {
    const r = await put(await sessao('c-pa', 'platform_admin'), 'c-ou-iso', ['iso', 'privacy']);
    expect(r.status).toBe(200); // platform_admin concede qualquer um
    const cons = await sessao('c-cons', 'consultor');
    await env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-iso', 'C', 'c-cons@ex.lat', 'consultor', 'Consultor')`).run();
    const fora = await put(cons, 'c-ou-iso', ['privacy']);
    expect(fora.status).toBe(400);
    expect((await fora.json<any>()).error).toContain('n.privacy');
    const cadm = await sessao('c-cadm', 'consultoria_admin', null, 'o-priv');
    expect((await put(cadm, 'c-cons-priv', ['iso'])).status).toBe(400);
    expect((await put(cadm, 'c-cons-priv', [])).status).toBe(200);
    expect(await modulos('c-cons-priv')).toEqual([]);
  });

  it('o que a conta já tem fora do teto de quem edita fica (não se perde módulo dado pelo platform_admin)', async () => {
    await env.DB.batch([conta('c-oadm-iso', 'org_admin', 'p-iso'), conta('c-alvo', 'org_user', 'p-iso')]);
    expect((await put(await sessao('c-pa', 'platform_admin'), 'c-alvo', ['iso', 'privacy'])).status).toBe(200);
    const oadm = await sessao('c-oadm-iso', 'org_admin', 'p-iso'); // teto: n.iso (o do projeto)
    const r = await put(oadm, 'c-alvo', ['iso']);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, modulos: ['iso', 'privacy'] });
    expect(await modulos('c-alvo')).toEqual(['iso', 'privacy']);
    expect((await put(oadm, 'c-alvo', [])).status).toBe(200);
    expect(await modulos('c-alvo')).toEqual(['privacy']);
    const log = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'usuario.modulos' AND details LIKE '%c-alvo@ex.lat%' ORDER BY rowid DESC LIMIT 1`).first<any>();
    expect(log.details).toContain('iso, privacy → privacy');
    expect((await put(oadm, 'c-alvo', ['privacy'])).status).toBe(400); // pedir fora do teto continua recusado
  });

  it('quem não gere a conta não concede', async () => {
    expect((await put(await sessao('c-ou', 'org_user', 'p-duo'), 'c-ou', ['iso'])).status).toBe(403);
    expect((await put(await sessao('c-cons', 'consultor'), 'c-cons-livre', ['iso'])).status).toBe(403); // conta de equipe
    expect((await put(await sessao('c-cons-livre', 'consultor'), 'c-ou', ['iso'])).status).toBe(403); // não designado
    expect((await put(await sessao('c-cadm', 'consultoria_admin', null, 'o-priv'), 'c-ou', ['iso'])).status).toBe(404); // outra organização
    expect((await put(await sessao('c-pa', 'platform_admin'), 'nao-existe', ['iso'])).status).toBe(404);
    expect((await put(await sessao('c-pa', 'platform_admin'), 'c-ou', ['xyz'])).status).toBe(400);
  });

  it('conta nova: sem o campo, o padrão; com o campo, só o pedido (no teto)', async () => {
    const h = await sessao('c-oadm', 'org_admin', 'p-duo');
    const criar = (email: string, extra: Record<string, unknown> = {}) => req('/api/v1/users', { method: 'POST', headers: { ...h, ...json },
      body: JSON.stringify({ email, password: 'Senha-forte-123!', name: 'N', role: 'org_user', client_project_id: 'p-duo', ...extra }) });
    const a = await criar('nova-a@ex.lat');
    expect(a.status, await a.clone().text()).toBe(201);
    expect(await modulos((await a.json<any>()).id)).toEqual(['iso', 'privacy']);
    const b = await criar('nova-b@ex.lat', { modulos: ['iso'] });
    expect(b.status).toBe(201);
    expect(await modulos((await b.json<any>()).id)).toEqual(['iso']);
    const cons = await sessao('c-cons', 'consultor');
    const c = await req('/api/v1/users', { method: 'POST', headers: { ...cons, ...json },
      body: JSON.stringify({ email: 'nova-c@ex.lat', password: 'Senha-forte-123!', name: 'N', role: 'org_user', client_project_id: 'p-iso', modulos: ['privacy'] }) });
    expect(c.status).toBe(400);
    expect(await env.DB.prepare(`SELECT 1 FROM users WHERE email = 'nova-c@ex.lat'`).first()).toBeNull();
  });

  it('troca de projeto do cliente recalcula: interseção com o que tinha; vazio → os do projeto novo', async () => {
    const pa = await sessao('c-pa', 'platform_admin');
    await env.DB.batch([conta('t-1', 'org_user', 'p-duo'), conta('t-2', 'org_user', 'p-duo')]);
    await put(pa, 't-2', ['privacy']);
    const mover = (id: string) => req(`/api/v1/users/${id}`, { method: 'PUT', headers: { ...pa, ...json }, body: JSON.stringify({ client_project_id: 'p-iso' }) });
    expect((await mover('t-1')).status).toBe(200);
    expect(await modulos('t-1')).toEqual(['iso']); // tinha os dois: fica o que o projeto novo tem
    const log = await env.DB.prepare(`SELECT details, project_id FROM audit_logs WHERE action = 'usuario.modulos' AND details LIKE '%t-1@ex.lat%'`).first<any>();
    expect(log.project_id).toBe('p-iso');
    expect(log.details).toContain('iso, privacy → iso');
    expect((await mover('t-2')).status).toBe(200);
    expect(await modulos('t-2')).toEqual(['iso']); // só n.privacy: interseção vazia → os do projeto novo
  });
});
