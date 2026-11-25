// Cancelar um pedido de aprovação aberto: o autor (para o agente, o consultor que o concedeu) ou o consultor designado no
// projeto, com motivo. O pedido sai de "Minhas aprovações" e ninguém mais o decide. A trilha guarda quem, o pedido e o motivo.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, resetData, workerEnv, sessionFor } from './helpers/d1';
import { hashPassword } from '../src/helpers';

const P = 'p-pcan';
const SENHA = 'senha-forte-123';
const json = { 'Content-Type': 'application/json' };
const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'c-pcan' };
const AGENTE_AUD = { userId: 'u-aud', email: 'aud@ness.lat', projectId: P, concessaoId: 'c-pcan-aud', papel: 'auditor' };
const DECISAO = { 'X-Agente-Ferramenta': 'niso_pedir_aprovacao', 'X-Agente-Confirmado': '1', 'X-Agente-Motivo': encodeURIComponent('consultor pediu o cancelamento') };
const pedido = { tipo: 'dpia', ref_id: 'dp-1', papel_exigido: 'ceo', destinatarios: [{ email: 'ceo@cliente.com', nome: 'Ceo' }] };
const MOTIVO = { motivo: 'Enviado ao destinatário errado' };

const comoPessoa = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  worker.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv());
const comoAgente = (agente: object, h: Record<string, string>, caminho: string, corpo?: unknown) =>
  worker.fetch(new Request('http://localhost' + caminho, { method: 'POST', headers: { ...json, ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }),
    { ...workerEnv(), AGENTE: agente } as any);
const cancelar = (id: string) => `/api/v1/projects/${P}/pedidos/${id}/cancelar`;
const status = async (id: string) => (await env.DB.prepare('SELECT status FROM pedidos WHERE id = ?').bind(id).first<{ status: string }>())!.status;

let cons: Record<string, string>, cons2: Record<string, string>, adm: Record<string, string>, adm2: Record<string, string>, ceo: Record<string, string>;
const criar = async (h: Record<string, string>) => {
  const r = await comoPessoa(h, 'POST', `/api/v1/projects/${P}/pedidos`, pedido);
  expect(r.status, await r.clone().text()).toBe(201);
  return (await r.json<any>()).id as string;
};

beforeAll(async () => { await applySchema(); });

beforeEach(async () => {
  await resetData();
  const h = await hashPassword(SENHA);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27701', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, data_category_risk, necessity_proportionality, technical_measures, residual_risk_level, status)
      VALUES ('dp-1', ?, 'Folha', 'Salário', 'Necessário', 'Criptografia', 'Medium', 'Under Review')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-cons', 'cons@ness.lat', ?1, 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-cons2', 'cons2@ness.lat', ?1, 'Cons Dois', 'consultor', NULL, 'org_ness'),
      ('u-aud', 'aud@ness.lat', ?1, 'Aud', 'consultor', NULL, 'org_ness'),
      ('u-adm', 'adm@cliente.com', ?1, 'Adm', 'org_admin', ?2, 'org_ness'),
      ('u-adm2', 'adm2@cliente.com', ?1, 'Adm Dois', 'org_admin', ?2, 'org_ness'),
      ('u-ceo', 'ceo@cliente.com', ?1, 'Ceo', 'org_user', ?2, 'org_ness')`).bind(h, P),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES
      (?1, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'),
      (?1, 'Cons Dois', 'cons2@ness.lat', 'consultor', 'Consultor'),
      (?1, 'Aud', 'aud@ness.lat', 'consultor', 'Consultor'),
      (?1, 'Ceo', 'ceo@cliente.com', 'cliente', 'CEO')`).bind(P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-pcan', 'u-cons', ?, datetime('now', '+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em, papel) VALUES ('c-pcan-aud', 'u-aud', ?, datetime('now', '+30 days'), 'auditor')`).bind(P),
  ]);
  cons = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  cons2 = await sessionFor({ id: 'u-cons2', email: 'cons2@ness.lat', role: 'consultor' });
  adm = await sessionFor({ id: 'u-adm', email: 'adm@cliente.com', role: 'org_admin', client_project_id: P });
  adm2 = await sessionFor({ id: 'u-adm2', email: 'adm2@cliente.com', role: 'org_admin', client_project_id: P });
  ceo = await sessionFor({ id: 'u-ceo', email: 'ceo@cliente.com', role: 'org_user', client_project_id: P });
});

describe('cancelar pedido de aprovação', () => {
  it('o autor cancela com motivo; a trilha guarda quem, o pedido, tipo/ref e o motivo', async () => {
    const id = await criar(adm);
    const r = await comoPessoa(adm, 'POST', cancelar(id), MOTIVO);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await status(id)).toBe('cancelado');
    const t = await env.DB.prepare(`SELECT actor, details, justification FROM audit_logs WHERE action = 'pedido.cancelado' AND details LIKE ?`).bind(`%${id}%`).first<any>();
    expect(t.actor).toBe('adm@cliente.com');
    expect(t.details).toContain(id);
    expect(t.details).toContain('dpia dp-1');
    expect(t.justification).toBe(MOTIVO.motivo);
  });

  it('o consultor designado cancela o pedido de outra pessoa', async () => {
    const id = await criar(adm);
    expect((await comoPessoa(cons2, 'POST', cancelar(id), MOTIVO)).status).toBe(200);
    expect(await status(id)).toBe('cancelado');
  });

  it('destinatário, outro administrador da empresa e o consultor fora do projeto não cancelam', async () => {
    const id = await criar(cons);
    for (const h of [ceo, adm2]) expect((await comoPessoa(h, 'POST', cancelar(id), MOTIVO)).status).toBe(403);
    await env.DB.prepare(`DELETE FROM project_governance WHERE email = 'cons2@ness.lat'`).run();
    expect((await comoPessoa(cons2, 'POST', cancelar(id), MOTIVO)).status).toBe(403);
    expect(await status(id)).toBe('aberto');
  });

  it('motivo é obrigatório (3 a 500); pedido que não está aberto é 409', async () => {
    const id = await criar(cons);
    for (const corpo of [{}, { motivo: 'ab' }, { motivo: 'x'.repeat(501) }]) expect((await comoPessoa(cons, 'POST', cancelar(id), corpo)).status).toBe(400);
    expect((await comoPessoa(cons, 'POST', cancelar(id), MOTIVO)).status).toBe(200);
    expect((await comoPessoa(cons, 'POST', cancelar(id), MOTIVO)).status).toBe(409);
    expect((await comoPessoa(cons, 'POST', cancelar('nao-existe'), MOTIVO)).status).toBe(404);
  });

  it('cancelado some de "Minhas aprovações" e o destinatário não decide mais (individual nem lote)', async () => {
    const id = await criar(cons);
    expect((await (await comoPessoa(ceo, 'GET', '/api/v1/pedidos')).json<any>()).pedidos.map((p: any) => p.id)).toContain(id);
    expect((await comoPessoa(cons, 'POST', cancelar(id), MOTIVO)).status).toBe(200);
    expect((await (await comoPessoa(ceo, 'GET', '/api/v1/pedidos')).json<any>()).pedidos.map((p: any) => p.id)).not.toContain(id);
    expect((await comoPessoa(ceo, 'POST', `/api/v1/pedidos/${id}/aprovar`, { senha: SENHA })).status).toBe(409);
    expect((await comoPessoa(ceo, 'POST', `/api/v1/pedidos/${id}/recusar`, { senha: SENHA, motivo: 'não' })).status).toBe(409);
    // Lote: destinatário que aprova em lote (consultor, ciência), pedido cancelado é ignorado.
    const r = await comoPessoa(adm, 'POST', `/api/v1/projects/${P}/pedidos`, { ...pedido, papel_exigido: 'ciente', destinatarios: [{ email: 'cons2@ness.lat' }] });
    const outro = (await r.json<any>()).id;
    expect((await comoPessoa(adm, 'POST', cancelar(outro), MOTIVO)).status).toBe(200);
    const hash = (await env.DB.prepare('SELECT hash FROM pedidos WHERE id = ?').bind(outro).first<any>()).hash;
    const lote = await (await comoPessoa(cons2, 'POST', '/api/v1/pedidos/lote', { senha: SENHA, itens: [{ tipo: 'pedido', id: outro, hash_visto: hash }] })).json<any>();
    expect(lote, JSON.stringify(lote)).toMatchObject({ aprovados: 0, resultados: [{ id: outro, resultado: 'ignorado' }] });
    expect((await env.DB.prepare('SELECT status FROM pedido_destinatarios WHERE pedido_id = ?').bind(id).first<any>()).status).toBe('pendente');
  });

  it('o acompanhamento diz a quem pode cancelar', async () => {
    const id = await criar(adm);
    const pode = async (h: Record<string, string>) => (await (await comoPessoa(h, 'GET', `/api/v1/projects/${P}/pedidos/${id}`)).json<any>()).pode_cancelar;
    expect(await pode(adm)).toBe(true);
    expect(await pode(cons)).toBe(true);
    expect(await pode(adm2)).toBe(false);
  });
});

describe('o agente cancela pela decisão niso_pedir_aprovacao', () => {
  it('sem a decisão, 403; com, cancela e a trilha diz "agente de <consultor>"', async () => {
    const id = await criar(cons);
    expect((await comoAgente(AGENTE, {}, cancelar(id), MOTIVO)).status).toBe(403);
    expect(await status(id)).toBe('aberto');
    const r = await comoAgente(AGENTE, DECISAO, cancelar(id), MOTIVO);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await status(id)).toBe('cancelado');
    const t = await env.DB.prepare(`SELECT actor FROM audit_logs WHERE action = 'pedido.cancelado' AND details LIKE ?`).bind(`%${id}%`).first<any>();
    expect(t.actor).toMatch(/^agente de cons@ness\.lat/);
  });

  it('o agente auditor não cancela', async () => {
    const id = await criar(cons);
    expect((await comoAgente(AGENTE_AUD, {}, cancelar(id), MOTIVO)).status).toBe(403);
    expect(await status(id)).toBe('aberto');
  });
});
