import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';

/** Agente MCP (consultor com concessão) lê a criticidade do fornecedor, mas não a registra: a avaliação define o tipo. */
const P = 'p-ag';
const base = `/api/v1/projects/${P}/terceiros`;
const AGENTE = { userId: 'u-ag', email: 'ag@ness.lat', projectId: P, concessaoId: 'c-ag' };
const comoAgente = (caminho: string, init: RequestInit = {}) =>
  worker.fetch(new Request('http://localhost' + caminho, init), { ...workerEnv(), AGENTE } as any);
const corpo = { impacto: 'baixo', exclusividade: 'varias_alternativas', risco_financeiro: 'baixo', conformidade: 'sem_regulamentacao', risco_reputacional: 'baixo' };

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente Ag', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-ag', 'ag@ness.lat', 'x', 'Ag', 'consultor', NULL, 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-ag', ?, 'Ag', 'ag@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-ag', 'u-ag', ?, datetime('now','+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('ag-a', ?, 'organizacao', 'Fornecedor Ag')`).bind(P),
  ]);
  await habilitarPrivacy(P);
  await concederModulos('u-ag', ['privacy']);
});

describe('criticidade e agente MCP', () => {
  it('o agente lê a criticidade do fornecedor', async () => {
    expect((await comoAgente(`${base}/ag-a/criticidades`)).status).toBe(200);
  });

  it('sem a ferramenta de decisão o agente não registra a criticidade: 403 e nada gravado', async () => {
    const res = await comoAgente(`${base}/ag-a/criticidades`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain('niso_avaliar_fornecedor');
    const n = await env.DB.prepare(`SELECT count(*) AS n FROM criticidades_terceiro WHERE parte_id = 'ag-a'`).first<{ n: number }>();
    expect(n!.n).toBe(0);
  });

  it('com niso_avaliar_fornecedor, confirmação e motivo a criticidade é registrada', async () => {
    const res = await comoAgente(`${base}/ag-a/criticidades`, { method: 'POST', body: JSON.stringify(corpo), headers: { 'Content-Type': 'application/json', 'X-Agente-Ferramenta': 'niso_avaliar_fornecedor', 'X-Agente-Confirmado': '1', 'X-Agente-Motivo': encodeURIComponent('cliente respondeu') } });
    expect(res.status, await res.clone().text()).toBeLessThan(300);
    const n = await env.DB.prepare(`SELECT count(*) AS n FROM criticidades_terceiro WHERE parte_id = 'ag-a'`).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });
});
