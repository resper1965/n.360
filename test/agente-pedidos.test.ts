// O agente do consultor (MCP) cria pedidos de aprovação e de ciência pela decisão niso_pedir_aprovacao e lê a fila do
// projeto; aprovar segue só do destinatário, com a senha dele. O pedido conta como do consultor que concedeu o agente
// (criado_por = e-mail dele, segregação inclusa); a trilha diz "agente de <consultor>".
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

const P = 'p-agped';
const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'c-agped' };
const json = { 'Content-Type': 'application/json' };
const DECISAO = { 'X-Agente-Ferramenta': 'niso_pedir_aprovacao', 'X-Agente-Confirmado': '1', 'X-Agente-Motivo': encodeURIComponent('consultor pediu o envio ao CEO') };
const comoAgente = (metodo: string, caminho: string, headers: Record<string, string> = {}, corpo?: unknown) =>
  worker.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }),
    { ...workerEnv(), AGENTE } as any);
const comoPessoa = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  worker.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv());
const pedido = { tipo: 'dpia', ref_id: 'dp-1', papel_exigido: 'ceo', destinatarios: [{ email: 'ceo@cliente.com', nome: 'Ceo' }] };

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27701', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, data_category_risk, necessity_proportionality, technical_measures, residual_risk_level, status)
      VALUES ('dp-1', ?, 'Folha', 'Salário', 'Necessário', 'Criptografia', 'Medium', 'Under Review')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-ceo', 'ceo@cliente.com', 'x', 'Ceo', 'org_user', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('g-cons', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'),
      ('g-ceo', ?, 'Ceo', 'ceo@cliente.com', 'cliente', 'CEO')`).bind(P, P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-agped', 'u-cons', ?, datetime('now', '+30 days'))`).bind(P),
  ]);
});

describe('agente do consultor e os pedidos', () => {
  it('sem a decisão (ferramenta, confirmação e motivo) o agente não cria pedido', async () => {
    const r = await comoAgente('POST', `/api/v1/projects/${P}/pedidos`, {}, pedido);
    expect(r.status).toBe(403);
    expect((await r.json<any>()).error).toContain('niso_pedir_aprovacao');
    expect((await comoAgente('POST', `/api/v1/projects/${P}/pedidos`, { ...DECISAO, 'X-Agente-Confirmado': '' }, pedido)).status).toBe(403);
  });

  it('com a decisão cria; o pedido aparece em "Minhas aprovações" do destinatário e na fila que o agente lê', async () => {
    const r = await comoAgente('POST', `/api/v1/projects/${P}/pedidos`, DECISAO, pedido);
    expect(r.status, await r.clone().text()).toBe(201);
    const { id } = await r.json<any>();

    // Conta como do consultor que concedeu: é ele quem não pode decidir o que pediu.
    expect((await env.DB.prepare('SELECT criado_por FROM pedidos WHERE id = ?').bind(id).first<any>()).criado_por).toBe('cons@ness.lat');
    const trilha = await env.DB.prepare(`SELECT actor FROM audit_logs WHERE action = 'pedido.criado' AND details LIKE ?`).bind(`%${id}%`).first<any>();
    expect(trilha.actor).toMatch(/^agente de cons@ness\.lat/);
    const decisao = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'agente.decisao' ORDER BY rowid DESC LIMIT 1`).first<any>();
    expect(decisao.details).toContain('niso_pedir_aprovacao');
    expect(decisao.details).toContain('consultor pediu o envio ao CEO');

    const ceo = await sessionFor({ id: 'u-ceo', email: 'ceo@cliente.com', role: 'org_user', client_project_id: P });
    const meus = await (await comoPessoa('GET', '/api/v1/pedidos', ceo)).json<any>();
    expect(meus.pedidos.map((p: any) => p.id)).toContain(id);

    // Ler a fila não é decisão: o niso_ler (GET puro) basta.
    const fila = await comoAgente('GET', `/api/v1/projects/${P}/pedidos`);
    expect(fila.status, await fila.clone().text()).toBe(200);
    expect((await fila.json<any>()).pedidos.map((p: any) => p.id)).toContain(id);
    expect((await comoAgente('GET', `/api/v1/projects/${P}/pedidos/${id}`)).status).toBe(200);
  });

  it('o agente não aprova nem recusa em nome de ninguém, nem com a decisão', async () => {
    const { id } = await (await comoAgente('POST', `/api/v1/projects/${P}/pedidos`, DECISAO, pedido)).json<any>();
    for (const acao of ['aprovar', 'recusar']) {
      const r = await comoAgente('POST', `/api/v1/pedidos/${id}/${acao}`, DECISAO, { senha: 'x', hash_visto: 'x', motivo: 'x' });
      expect(r.status).toBe(403);
    }
    expect((await comoAgente('POST', '/api/v1/pedidos/lote', DECISAO, { senha: 'x', itens: [] })).status).toBe(403);
    expect((await env.DB.prepare(`SELECT status FROM pedido_destinatarios WHERE pedido_id = ?`).bind(id).first<any>()).status).toBe('pendente');
  });

  it('o consultor não decide o pedido que o agente dele criou', async () => {
    const { id } = await (await comoAgente('POST', `/api/v1/projects/${P}/pedidos`, DECISAO,
      { ...pedido, papel_exigido: 'ciente', destinatarios: [{ email: 'cons@ness.lat' }] })).json<any>();
    const cons = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
    const meus = await (await comoPessoa('GET', '/api/v1/pedidos', cons)).json<any>();
    expect(meus.pedidos.map((p: any) => p.id)).not.toContain(id);
  });

  it('reenviar o link de ciência segue pela interface', async () => {
    expect((await comoAgente('POST', `/api/v1/projects/${P}/pedidos/qualquer/reenviar`, DECISAO, {})).status).toBe(403);
  });
});
