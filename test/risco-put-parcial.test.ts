import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, designarConsultor } from './helpers/d1';

const P = 'rp-proj';
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());

let consultor: Record<string, string>;
beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('rp-it', ?, 'ERP', 'sistema')`).bind(P),
    env.DB.prepare(`INSERT INTO risks (id, project_id, asset_id, asset, threat, impact, probability, risk_level, treatment, treatment_plan, status, accepted_by, accepted_at)
      VALUES ('rp-r1', ?, 'rp-it', 'ERP', 'Acesso indevido', 4, 3, 'Medium', 'Accept', 'Plano de aceite', 'Accepted', 'Diretoria', '2026-10-01')`).bind(P),
  ]);
  await designarConsultor('cons@ness.lat', P);
  consultor = await sessionFor({ id: 'cons:cons@ness.lat', email: 'cons@ness.lat', role: 'consultor' });
});

const ler = () => env.DB.prepare('SELECT * FROM risks WHERE id = ?').bind('rp-r1').first<any>();

describe('PUT /risks/:id parcial', () => {
  it('editar só o responsável não apaga ativo, plano, status nem aceite', async () => {
    const r = await chamar(consultor, 'PUT', '/api/v1/risks/rp-r1', { asset: 'ERP', threat: 'Acesso indevido', owner: 'Maria' });
    expect(r.status).toBe(200);
    expect(await ler()).toMatchObject({ asset_id: 'rp-it', treatment: 'Accept', treatment_plan: 'Plano de aceite', status: 'Accepted', accepted_by: 'Diretoria', accepted_at: '2026-10-01', owner: 'Maria', impact: 4, probability: 3, risk_level: 'Medium' });
  });

  it('corpo sem asset nem threat é aceito e mantém os dois', async () => {
    const r = await chamar(consultor, 'PUT', '/api/v1/risks/rp-r1', { owner: 'Joana' });
    expect(r.status).toBe(200);
    expect(await ler()).toMatchObject({ asset: 'ERP', threat: 'Acesso indevido', owner: 'Joana' });
  });

  it('só o impacto: a probabilidade fica e o nível é recalculado; histórico ganha linha', async () => {
    const antes = await env.DB.prepare('SELECT count(*) n FROM risk_history WHERE risk_id = ?').bind('rp-r1').first<any>();
    const r = await chamar(consultor, 'PUT', '/api/v1/risks/rp-r1', { impact: 5 });
    expect(r.status).toBe(200);
    expect(await ler()).toMatchObject({ impact: 5, probability: 3, risk_level: 'High' });
    const depois = await env.DB.prepare('SELECT count(*) n FROM risk_history WHERE risk_id = ?').bind('rp-r1').first<any>();
    expect(depois.n).toBe(antes.n + 1);
  });

  it('null limpa o campo; aceite do corpo é ignorado (carimbo do servidor); impacto e probabilidade recalculam o nível', async () => {
    const r = await chamar(consultor, 'PUT', '/api/v1/risks/rp-r1', { treatment_plan: null, accepted_by: null, impact: 1, probability: 1 });
    expect(r.status).toBe(200);
    const linha = await ler();
    expect(linha.treatment_plan).toBeNull();
    expect(linha.accepted_by).toBe('Diretoria');
    expect(linha).toMatchObject({ impact: 1, probability: 1, risk_level: 'Low', status: 'Accepted' });
  });

  it('referência de outro projeto continua recusada e o POST ainda exige ativo e ameaça', async () => {
    const r = await chamar(consultor, 'PUT', '/api/v1/risks/rp-r1', { asset_id: 'nao-existe' });
    expect(r.status).toBe(400);
    const p = await chamar(consultor, 'POST', `/api/v1/projects/${P}/risks`, { owner: 'x' });
    expect(p.status).toBe(400);
  });
});
