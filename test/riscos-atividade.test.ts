import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';

/**
 * F2.2: riscos e ações da atividade de tratamento, no MESMO cadastro do n.iso (`risks` e `corrective_actions` com `ropa_id`),
 * pelas sub-rotas do n.privacy. As rotas por id do n.iso continuam na faixa iso.
 */
const P = 'ra-proj';
const OUTRO = 'ra-outro';
const SO_PRIVACY = 'ra-priv';
const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'c-ra' };

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, extra: object = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  }), { ...workerEnv(), ...extra } as any);
const json = async <T>(r: Response) => (await r.json()) as T;
const base = (rid: string, p = P) => `/api/v1/projects/${p}/ropa/${rid}`;
type Risco = { id: string; ropa_id: string | null; risk_level: string; residual_level: string | null; asset: string; asset_id: string | null; threat: string; impact: number; probability: number };
type Acao = { id: string; ropa_id: string | null; risk_id: string | null; title: string; status: string };

let consultor: Record<string, string>, soPrivacy: Record<string, string>, soIso: Record<string, string>;

async function novoRisco(rid: string, corpo: object = {}, p = P) {
  const r = await chamar(consultor, 'POST', `${base(rid, p)}/riscos`, { threat: 'Acesso indevido', impact: 4, probability: 3, ...corpo });
  expect(r.status, await r.clone().text()).toBe(201);
  return (await json<{ id: string }>(r)).id;
}

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?1, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?2, 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-priv', 'priv@cliente.com', 'x', 'Priv', 'org_user', ?1, 'org_ness'),
      ('u-iso', 'iso@cliente.com', 'x', 'Iso', 'org_user', ?1, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-ra', ?1, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'), ('g-ra2', ?2, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-ra', 'u-cons', ?, datetime('now','+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('ra-r1', ?1, 'Folha de pagamento'), ('ra-r2', ?1, 'Marketing'), ('ra-alheio', ?2, 'Do outro')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('ra-it', ?1, 'ERP', 'sistema'), ('ra-it-o', ?2, 'Alheio', 'sistema')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('ra-pa', ?, 'pessoa', 'Responsável Exemplo')`).bind(P),
  ]);
  await habilitarPrivacy(P, OUTRO);
  await concederModulos('u-priv', ['privacy']);
  // u-iso: o gatilho deu os módulos do projeto; fica só com o n.iso
  await env.DB.prepare(`DELETE FROM usuario_modulos WHERE user_id IN ('u-iso', 'u-priv') AND modulo = ?`).bind('iso').run();
  await concederModulos('u-iso', ['iso']);
  await env.DB.prepare(`DELETE FROM usuario_modulos WHERE user_id = 'u-iso' AND modulo = 'privacy'`).run();
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  soPrivacy = await sessionFor({ id: 'u-priv', email: 'priv@cliente.com', role: 'org_user', client_project_id: P });
  soIso = await sessionFor({ id: 'u-iso', email: 'iso@cliente.com', role: 'org_user', client_project_id: P });
});

describe('riscos da atividade', () => {
  it('criado pela atividade aparece na matriz do n.iso com ropa_id; nível e residual calculados no servidor', async () => {
    const id = await novoRisco('ra-r1', { asset_id: 'ra-it', residual_impact: 2, residual_probability: 2, treatment: 'Mitigate', owner_parte_id: 'ra-pa' });
    const { risks } = await json<{ risks: Risco[] }>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/risks`));
    const r = risks.find((x) => x.id === id)!;
    expect(r).toMatchObject({ ropa_id: 'ra-r1', risk_level: 'Medium', residual_level: 'Low', asset_id: 'ra-it', asset: 'ERP' });
    const lista = await json<{ riscos: Risco[] }>(await chamar(consultor, 'GET', `${base('ra-r1')}/riscos`));
    expect(lista.riscos.map((x) => x.id)).toContain(id);
    expect((await json<{ riscos: Risco[] }>(await chamar(consultor, 'GET', `${base('ra-r2')}/riscos`))).riscos.map((x) => x.id)).not.toContain(id);
    // sem ativo, o texto do ativo é a finalidade da atividade (a coluna é NOT NULL)
    const sem = await novoRisco('ra-r2');
    expect((await env.DB.prepare('SELECT asset FROM risks WHERE id = ?').bind(sem).first<{ asset: string }>())!.asset).toBe('Marketing');
  });

  it('editar e apagar só alcançam o risco da própria atividade; atividade de outro projeto é 404', async () => {
    const id = await novoRisco('ra-r1');
    expect((await chamar(consultor, 'PUT', `${base('ra-r2')}/riscos/${id}`, { impact: 1 })).status).toBe(404);
    expect((await chamar(consultor, 'DELETE', `${base('ra-r2')}/riscos/${id}`)).status).toBe(404);
    expect((await chamar(consultor, 'GET', `${base('ra-alheio')}/riscos`)).status).toBe(404);
    expect((await chamar(consultor, 'POST', `${base('ra-alheio')}/riscos`, { threat: 'X', impact: 1, probability: 1 })).status).toBe(404);
    const put = await chamar(consultor, 'PUT', `${base('ra-r1')}/riscos/${id}`, { impact: 5, probability: 5, residual_impact: 3, residual_probability: 3 });
    expect(put.status, await put.clone().text()).toBe(200);
    const linha = await env.DB.prepare('SELECT risk_level, residual_level, threat, ropa_id FROM risks WHERE id = ?').bind(id).first();
    expect(linha).toEqual({ risk_level: 'Critical', residual_level: 'Medium', threat: 'Acesso indevido', ropa_id: 'ra-r1' });
    // null limpa o residual
    expect((await chamar(consultor, 'PUT', `${base('ra-r1')}/riscos/${id}`, { residual_impact: null })).status).toBe(200);
    expect((await env.DB.prepare('SELECT residual_impact, residual_level FROM risks WHERE id = ?').bind(id).first())).toEqual({ residual_impact: null, residual_level: null });
  });

  it('nota fora de 1..5, tratamento desconhecido, campo a mais e ativo de outro projeto são 400', async () => {
    const post = (corpo: object) => chamar(consultor, 'POST', `${base('ra-r1')}/riscos`, { threat: 'X', impact: 3, probability: 3, ...corpo });
    expect((await post({ impact: 7 })).status).toBe(400);
    expect((await post({ residual_probability: 0 })).status).toBe(400);
    expect((await post({ treatment: 'Ignorar' })).status).toBe(400);
    expect((await post({ ropa_id: 'ra-r2' })).status).toBe(400);
    expect((await post({ asset_id: 'ra-it-o' })).status).toBe(400);
  });

  it('o PUT parcial do n.iso preserva ropa_id e residual, e aceita ligar a atividade e o residual', async () => {
    const id = await novoRisco('ra-r1', { residual_impact: 2, residual_probability: 3 });
    expect((await chamar(consultor, 'PUT', `/api/v1/risks/${id}`, { owner: 'Maria', impact: 2 })).status).toBe(200);
    expect(await env.DB.prepare('SELECT ropa_id, residual_impact, residual_probability, residual_level, owner FROM risks WHERE id = ?').bind(id).first())
      .toEqual({ ropa_id: 'ra-r1', residual_impact: 2, residual_probability: 3, residual_level: 'Medium', owner: 'Maria' });
    expect((await chamar(consultor, 'PUT', `/api/v1/risks/${id}`, { ropa_id: 'ra-r2', residual_impact: 5, residual_probability: 5 })).status).toBe(200);
    expect(await env.DB.prepare('SELECT ropa_id, residual_level FROM risks WHERE id = ?').bind(id).first()).toEqual({ ropa_id: 'ra-r2', residual_level: 'Critical' });
    expect((await chamar(consultor, 'PUT', `/api/v1/risks/${id}`, { ropa_id: 'ra-alheio' })).status).toBe(400);
  });

  it('apagar o risco grava a trilha e a ação ligada sobrevive, sem o risk_id', async () => {
    const id = await novoRisco('ra-r1');
    const a = await chamar(consultor, 'POST', `${base('ra-r1')}/acoes`, { title: 'Revisar acessos', risk_id: id });
    expect(a.status, await a.clone().text()).toBe(201);
    const acao = (await json<{ id: string }>(a)).id;
    expect((await chamar(consultor, 'DELETE', `${base('ra-r1')}/riscos/${id}`)).status).toBe(200);
    expect(await env.DB.prepare('SELECT 1 FROM risks WHERE id = ?').bind(id).first()).toBeNull();
    expect(await env.DB.prepare('SELECT risk_id, ropa_id FROM corrective_actions WHERE id = ?').bind(acao).first()).toEqual({ risk_id: null, ropa_id: 'ra-r1' });
    const trilha = await env.DB.prepare(`SELECT action FROM audit_logs WHERE project_id = ? AND details LIKE ?`).bind(P, `%${id}%`).all<{ action: string }>();
    expect(trilha.results.map((t) => t.action)).toEqual(expect.arrayContaining(['registro.excluido', 'ropa.risco']));
  });
});

describe('ações da atividade', () => {
  it('cria, edita e conclui; risk_id de outra atividade é 400; outra atividade é 404', async () => {
    const outroRisco = await novoRisco('ra-r2');
    expect((await chamar(consultor, 'POST', `${base('ra-r1')}/acoes`, { title: 'X', risk_id: outroRisco })).status).toBe(400);
    const r = await chamar(consultor, 'POST', `${base('ra-r1')}/acoes`, { title: 'Ajustar retenção', due_date: '2026-12-01', assigned_to_parte_id: 'ra-pa' });
    expect(r.status, await r.clone().text()).toBe(201);
    const id = (await json<{ id: string }>(r)).id;
    const { acoes } = await json<{ acoes: Acao[] }>(await chamar(consultor, 'GET', `${base('ra-r1')}/acoes`));
    expect(acoes.find((x) => x.id === id)).toMatchObject({ title: 'Ajustar retenção', ropa_id: 'ra-r1', status: 'Open' });
    expect((await chamar(consultor, 'PUT', `${base('ra-r2')}/acoes/${id}`, { status: 'Closed' })).status).toBe(404);
    expect((await chamar(consultor, 'PUT', `${base('ra-r1')}/acoes/${id}`, { risk_id: outroRisco })).status).toBe(400);
    expect((await chamar(consultor, 'PUT', `${base('ra-r1')}/acoes/${id}`, { status: 'Closed' })).status).toBe(200);
    const linha = await env.DB.prepare('SELECT status, completed_at, title FROM corrective_actions WHERE id = ?').bind(id).first<{ status: string; completed_at: string | null; title: string }>();
    expect(linha).toMatchObject({ status: 'Closed', title: 'Ajustar retenção' });
    expect(linha!.completed_at).not.toBeNull();
    // a ação aparece na CAPA do n.iso
    const capa = await json<{ actions: Acao[] }>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/capa`));
    expect(capa.actions.find((x) => x.id === id)?.ropa_id).toBe('ra-r1');
    expect((await chamar(consultor, 'DELETE', `${base('ra-r1')}/acoes/${id}`)).status).toBe(200);
    expect(await env.DB.prepare('SELECT 1 FROM corrective_actions WHERE id = ?').bind(id).first()).toBeNull();
  });
});

describe('faixas e agente', () => {
  it('quem só tem o n.privacy lê as sub-rotas e o mapa, mas não a matriz do n.iso; quem não tem o n.privacy leva 403', async () => {
    expect((await chamar(soPrivacy, 'GET', `${base('ra-r1')}/riscos`)).status).toBe(200);
    expect((await chamar(soPrivacy, 'GET', `${base('ra-r1')}/acoes`)).status).toBe(200);
    expect((await chamar(soPrivacy, 'GET', `/api/v1/projects/${P}/ropa/riscos-mapa`)).status).toBe(200);
    expect((await chamar(soPrivacy, 'GET', `/api/v1/projects/${P}/risks`)).status).toBe(403);
    expect((await chamar(soIso, 'GET', `/api/v1/projects/${P}/risks`)).status).toBe(200);
    expect((await chamar(soIso, 'GET', `${base('ra-r1')}/riscos`)).status).toBe(403);
    expect((await chamar(soIso, 'GET', `${base('ra-r1')}/acoes`)).status).toBe(403);
    expect((await chamar(soIso, 'GET', `/api/v1/projects/${P}/ropa/riscos-mapa`)).status).toBe(403);
  });

  it('projeto só n.privacy: as sub-rotas valem e a matriz do n.iso é 403', async () => {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Só privacy', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(SO_PRIVACY).run();
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM projeto_modulos WHERE project_id = ? AND modulo = 'iso'`).bind(SO_PRIVACY),
      env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-ra3', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(SO_PRIVACY),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('ra-pr', ?, 'Atendimento')`).bind(SO_PRIVACY),
    ]);
    await habilitarPrivacy(SO_PRIVACY);
    await env.DB.prepare(`DELETE FROM projeto_modulos WHERE project_id = ? AND modulo = 'iso'`).bind(SO_PRIVACY).run();
    await novoRisco('ra-pr', {}, SO_PRIVACY);
    expect((await chamar(consultor, 'GET', `/api/v1/projects/${SO_PRIVACY}/risks`)).status).toBe(403);
    expect((await chamar(consultor, 'GET', `/api/v1/projects/${SO_PRIVACY}/ropa/riscos-mapa`)).status).toBe(200);
  });

  it('o agente cria e edita, mas não aceita risco, não conclui ação e não apaga', async () => {
    const ag = (metodo: string, caminho: string, corpo?: unknown) => chamar({}, metodo, caminho, corpo, { AGENTE });
    const r = await ag('POST', `${base('ra-r1')}/riscos`, { threat: 'Proposta do agente', impact: 2, probability: 2 });
    expect(r.status, await r.clone().text()).toBe(201);
    const id = (await json<{ id: string }>(r)).id;
    expect((await ag('PUT', `${base('ra-r1')}/riscos/${id}`, { treatment_plan: 'Rascunho' })).status).toBe(200);
    expect((await ag('PUT', `${base('ra-r1')}/riscos/${id}`, { status: 'Accepted' })).status).toBe(403);
    expect((await ag('POST', `${base('ra-r1')}/riscos`, { threat: 'Y', impact: 2, probability: 2, status: 'Accepted' })).status).toBe(403);
    expect((await ag('DELETE', `${base('ra-r1')}/riscos/${id}`)).status).toBe(403);
    const a = await ag('POST', `${base('ra-r1')}/acoes`, { title: 'Ação proposta' });
    expect(a.status).toBe(201);
    const acao = (await json<{ id: string }>(a)).id;
    expect((await ag('PUT', `${base('ra-r1')}/acoes/${acao}`, { status: 'Closed' })).status).toBe(403);
    expect((await ag('DELETE', `${base('ra-r1')}/acoes/${acao}`)).status).toBe(403);
    expect(await env.DB.prepare('SELECT status FROM risks WHERE id = ?').bind(id).first()).toEqual({ status: 'Open' });
  });

  it('o agente também não aceita risco pela rota do n.iso', async () => {
    const ag = (metodo: string, caminho: string, corpo?: unknown) => chamar({}, metodo, caminho, corpo, { AGENTE });
    const id = await novoRisco('ra-r1');
    expect((await ag('PUT', `/api/v1/risks/${id}`, { status: 'Accepted' })).status).toBe(403);
    expect((await ag('PUT', `/api/v1/risks/${id}`, { accepted_by: 'x' })).status).toBe(403);
    expect((await ag('POST', `/api/v1/projects/${P}/risks`, { asset: 'A', threat: 'T', status: 'Accepted' })).status).toBe(403);
    expect((await ag('PUT', `/api/v1/risks/${id}`, { treatment_plan: 'Rascunho' })).status).toBe(200);
  });

  // Aceite do risco residual (migration 0120): só pela rota de aceite, com senha e alçada (test/risco-aceite-residual.test.ts).
  it('o PUT da atividade não aceita o risco: Accepted é recusado e nada é carimbado', async () => {
    const id = await novoRisco('ra-r1', { treatment: 'Accept' });
    expect((await chamar(consultor, 'PUT', `${base('ra-r1')}/riscos/${id}`, { status: 'Accepted' })).status).toBe(403);
    const l = await env.DB.prepare('SELECT status, accepted_by, accepted_at FROM risks WHERE id = ?').bind(id).first<{ status: string; accepted_by: string | null; accepted_at: string | null }>();
    expect(l).toMatchObject({ status: 'Open', accepted_by: null, accepted_at: null });
  });
});

describe('mapa de risco do n.privacy', () => {
  it('lista só os riscos com atividade, do projeto, com o nome da atividade', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, impact, probability, risk_level) VALUES ('ra-iso', ?, 'Servidor', 'Risco só ISO', 2, 2, 'Low')`).bind(P),
    ]);
    await novoRisco('ra-alheio', {}, OUTRO);
    const r = await chamar(consultor, 'GET', `/api/v1/projects/${P}/ropa/riscos-mapa`);
    expect(r.status).toBe(200);
    const { riscos } = await json<{ riscos: (Risco & { atividade: string })[] }>(r);
    expect(riscos.length).toBeGreaterThan(0);
    expect(riscos.every((x) => x.ropa_id && ['ra-r1', 'ra-r2'].includes(x.ropa_id))).toBe(true);
    expect(riscos.some((x) => x.id === 'ra-iso')).toBe(false);
    expect(riscos.find((x) => x.ropa_id === 'ra-r1')).toMatchObject({ atividade: 'Folha de pagamento' });
    expect(Object.keys(riscos[0])).toEqual(expect.arrayContaining(['probability', 'impact', 'risk_level', 'residual_level', 'atividade', 'threat']));
  });
});
