import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

// O agente (MCP) não reescreve a política pelo controle: a descrição é nota, e o texto da política é o documento
// (ver politicas-agente.test.ts). A imposição é do servidor (env.AGENTE), não de instrução de prompt.
const P = { userId: 'u-ag', email: 'cons-ag@ness.lat', projectId: 'p-ag', concessaoId: 'c-ag' };
const aiStub = { run: async () => ({ response: '# Política gerada pelo agente\n\nTexto.' }) };

const json = { 'Content-Type': 'application/json' };
const comoAgente = (caminho: string, init: RequestInit = {}) =>
  worker.fetch(new Request('http://localhost' + caminho, { ...init, headers: { ...json, ...(init.headers ?? {}) } }), { ...workerEnv(), AGENTE: P, AI: aiStub } as any);
let humano: Record<string, string>;
const comoHumano = (caminho: string, init: RequestInit = {}) =>
  worker.fetch(new Request('http://localhost' + caminho, { ...init, headers: { ...json, ...humano, ...(init.headers ?? {}) } }), { ...workerEnv(), AI: aiStub } as any);

const controle = (id: string) =>
  env.DB.prepare(`SELECT description, ciso_approved_by, ceo_approved_by FROM compliance_controls WHERE id = ?`).bind(id).first<{ description: string; ciso_approved_by: string | null; ceo_approved_by: string | null }>();

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-ag','Cliente Exemplo','ISO 27001','controller','Active')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-ag','cons-ag@ness.lat','x','Cons','consultor')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-h','humano-ag@ness.lat','x','Humano','platform_admin')`),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-ag','Cons','cons-ag@ness.lat','consultor','Consultor')`),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-ag','u-ag','p-ag', datetime('now','+30 days'))`),
    // controle com política vigente, aprovada pelo CISO, e um pedido de aprovação aberto
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description, ciso_approved_by) VALUES ('ag-c1','p-ag','ISO 27001:2022','A.5.1 Políticas','Política vigente do cliente','ciso@exemplo.com.br')`),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES ('ag-c2','p-ag','ISO 27001:2022','A.5.2 Gerada','Catálogo')`),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES ('ag-c3','p-ag','ISO 27001:2022','A.5.3 Edição humana','Catálogo')`),
  ]);
  humano = await sessionFor({ id: 'u-h', email: 'humano-ag@ness.lat', role: 'platform_admin' });
});

describe('o agente não contorna o rascunho por PUT /controls/:id', () => {
  const put = (corpo: object) => comoAgente('/api/v1/controls/ag-c3', { method: 'PUT', body: JSON.stringify(corpo) });

  it('reescrever a descrição (o texto da política) é recusado, e nada muda', async () => {
    const antes = await controle('ag-c3');
    const r = await put({ description: 'Reescrita direta pelo agente' });
    expect(r.status).toBe(403);
    expect(await r.text()).toContain('niso_criar_politica');
    expect(await controle('ag-c3')).toEqual(antes);
  });

  it('título sozinho e a justificativa de "Não aplicável" continuam passando', async () => {
    expect((await put({ title: 'A.5.3 Edição humana (renomeado)' })).status).toBe(200);
    const na = await put({ status: 'Not Applicable', description: 'Fora do escopo: o cliente não opera este processo.' });
    expect(na.status, await na.clone().text()).toBe(200);
    expect((await controle('ag-c3'))?.description).toBe('Fora do escopo: o cliente não opera este processo.');
  });

  it('o humano segue podendo editar a descrição por este PUT', async () => {
    const r = await comoHumano('/api/v1/controls/ag-c1', { method: 'PUT', body: JSON.stringify({ description: 'Ajuste humano' }) });
    expect(r.status).toBe(200);
    expect((await controle('ag-c1'))?.description).toBe('Ajuste humano');
  });
});
