import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { itensDoDia } from '../src/services/avisos-prazo';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';

/**
 * Frente 1 da equalização (docs/arquivo/equalizacao-modulos-2026-10-20.md, P0): defeitos que perdiam dado,
 * deixavam o agente concluir o que é ato humano ou mostravam o que não devia.
 */
const P = 'f1-proj';
const AGENTE = { userId: 'u-f1-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'c-f1' };

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, extra: object = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  }), { ...workerEnv(), ...extra } as any);
const ag = (metodo: string, caminho: string, corpo?: unknown) => chamar({}, metodo, caminho, corpo, { AGENTE });

let consultor: Record<string, string>, cliente: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-f1-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-f1-cli', 'adm@cliente.com', 'x', 'Adm', 'org_admin', ?1, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-f1', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-f1', 'u-f1-cons', ?, datetime('now','+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('f1-r1', ?, 'Folha de pagamento')`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES ('f1-pa', ?, 'pessoa', 'Responsável Exemplo', 'resp@cliente.com')`).bind(P),
  ]);
  await habilitarPrivacy(P);
  consultor = await sessionFor({ id: 'u-f1-cons', email: 'cons@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-f1-cli', email: 'adm@cliente.com', role: 'org_admin', client_project_id: P });
});

describe('Frente 1: defeitos P0', () => {
  it('excluir risco pelo n.iso mantém a ação corretiva ligada, só solta o vínculo', async () => {
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/risks`, { asset: 'ERP', threat: 'Acesso indevido', impact: 3, probability: 3 });
    expect(r.status, await r.clone().text()).toBe(201);
    const riskId = (await r.json<{ id: string }>()).id;
    const a = await chamar(consultor, 'POST', `/api/v1/projects/${P}/capa`, { title: 'Trocar senhas', assigned_to: 'Fulano', risk_id: riskId });
    const acao = (await a.json<{ id: string }>()).id;
    expect((await chamar(consultor, 'DELETE', `/api/v1/risks/${riskId}`)).status).toBe(200);
    expect(await env.DB.prepare('SELECT count(*) AS n FROM risks WHERE id = ?').bind(riskId).first()).toEqual({ n: 0 });
    expect(await env.DB.prepare('SELECT title, risk_id FROM corrective_actions WHERE id = ?').bind(acao).first()).toEqual({ title: 'Trocar senhas', risk_id: null });
  });

  it('CAPA grava causa raiz e plano de ação na criação e na edição', async () => {
    const a = await chamar(consultor, 'POST', `/api/v1/projects/${P}/capa`, { title: 'Ação', assigned_to: 'Fulano', root_cause: 'Causa', action_plan: 'Plano' });
    const id = (await a.json<{ id: string }>()).id;
    expect(await env.DB.prepare('SELECT root_cause, action_plan FROM corrective_actions WHERE id = ?').bind(id).first()).toEqual({ root_cause: 'Causa', action_plan: 'Plano' });
    expect((await chamar(consultor, 'PUT', `/api/v1/capa/${id}`, { title: 'Ação', status: 'Open', root_cause: 'Causa 2' })).status).toBe(200);
    expect(await env.DB.prepare('SELECT root_cause, action_plan FROM corrective_actions WHERE id = ?').bind(id).first()).toEqual({ root_cause: 'Causa 2', action_plan: 'Plano' });
  });

  it('o agente não conclui CAPA nem gap; edita sem concluir', async () => {
    const id = (await (await chamar(consultor, 'POST', `/api/v1/projects/${P}/capa`, { title: 'Ação do agente', assigned_to: 'Fulano' })).json<{ id: string }>()).id;
    expect((await ag('PUT', `/api/v1/capa/${id}`, { title: 'Ação do agente', status: 'Closed' })).status).toBe(403);
    expect((await ag('PUT', `/api/v1/capa/${id}`, { title: 'Ação do agente', status: 'In Progress' })).status).toBe(200);

    const base = `/api/v1/projects/${P}/ropa/f1-r1/gaps`;
    expect((await ag('POST', base, { gap: 'Já fechado', responsavel_parte_id: 'f1-pa', status: 'Closed' })).status).toBe(403);
    const g = await ag('POST', base, { gap: 'Gap do agente', responsavel_parte_id: 'f1-pa' });
    expect(g.status, await g.clone().text()).toBe(201);
    const gap = (await g.json<{ id: string }>()).id;
    expect((await ag('PUT', `${base}/${gap}`, { status: 'Closed' })).status).toBe(403);
    expect((await ag('PUT', `${base}/${gap}`, { status: 'In Progress' })).status).toBe(200);
    expect(await env.DB.prepare('SELECT status FROM corrective_actions WHERE id = ?').bind(gap).first()).toEqual({ status: 'In Progress' });
  });

  it('aviso de prazo da CAPA vai ao e-mail da parte responsável', async () => {
    await env.DB.prepare(`INSERT INTO corrective_actions (id, project_id, title, status, due_date, assigned_to_parte_id) VALUES ('f1-capa-prazo', ?, 'Com prazo', 'Open', '2026-11-10', 'f1-pa')`).bind(P).run();
    const { itens } = await itensDoDia(env.DB, '2026-11-10');
    expect(itens.find((i) => i.item_id === 'f1-capa-prazo')).toMatchObject({ fonte: 'capa', responsavel: 'resp@cliente.com' });
  });

  it('a trilha do projeto mostra o IP só à equipe da consultoria', async () => {
    await env.DB.prepare(`INSERT INTO audit_logs (id, action, actor, details, ip_address, project_id) VALUES ('f1-log', 'teste.f1', 'x@y.com', 'detalhe', '203.0.113.9', ?)`).bind(P).run();
    const daEquipe = await (await chamar(consultor, 'GET', `/api/v1/projects/${P}/audit-trail`)).json<any[]>();
    expect(daEquipe.find((l) => l.id === 'f1-log')).toMatchObject({ ip_address: '203.0.113.9' });
    const r = await chamar(cliente, 'GET', `/api/v1/projects/${P}/audit-trail`);
    expect(r.status).toBe(200);
    const doCliente = (await r.json<any[]>()).find((l) => l.id === 'f1-log');
    expect(doCliente).toMatchObject({ action: 'teste.f1' });
    expect(doCliente).not.toHaveProperty('ip_address');
    expect(doCliente).not.toHaveProperty('details'); // texto livre só para a consultoria (P0-8)
  });
});
