import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { normalizarNome } from '../src/services/nomes';
import { applySchema, sessionFor, workerEnv, designarConsultor } from './helpers/d1';

/** Spec 3C (C2, C3, C5): prazo da CAPA como data, risco do n.iso com residual e prazo, nome do fornecedor normalizado na edição. */
const P = 'cpr-proj';
const chamar = (h: Record<string, string>, caminho: string, metodo = 'GET', corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
}), workerEnv());
let consultor: Record<string, string>;
const risco = (id: string) => env.DB.prepare('SELECT * FROM risks WHERE id = ?').bind(id).first<Record<string, unknown>>();

beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P).run();
  await designarConsultor('cons@ness.lat', P);
  consultor = await sessionFor({ id: 'cons:cons@ness.lat', email: 'cons@ness.lat', role: 'consultor' });
});

describe('prazo da CAPA', () => {
  it('data fora de AAAA-MM-DD é recusada na criação e na edição; a data certa grava', async () => {
    expect((await chamar(consultor, `/api/v1/projects/${P}/capa`, 'POST', { title: 'Ação', due_date: '31/12/2026' })).status).toBe(400);
    const r = await chamar(consultor, `/api/v1/projects/${P}/capa`, 'POST', { title: 'Ação', due_date: '2026-12-31' });
    expect(r.status).toBe(201);
    const { id } = await r.json<{ id: string }>();
    expect((await chamar(consultor, `/api/v1/capa/${id}`, 'PUT', { title: 'Ação', status: 'Open', due_date: 'amanhã' })).status).toBe(400);
    expect((await chamar(consultor, `/api/v1/capa/${id}`, 'PUT', { title: 'Ação', status: 'Open', due_date: '2027-01-15' })).status).toBe(200);
    expect(await env.DB.prepare('SELECT due_date FROM corrective_actions WHERE id = ?').bind(id).first()).toEqual({ due_date: '2027-01-15' });
  });
});

describe('risco do n.iso com residual e prazo', () => {
  it('POST grava prazo e residual (nível calculado); PUT parcial mantém, null limpa, data inválida é 400', async () => {
    const r = await chamar(consultor, `/api/v1/projects/${P}/risks`, 'POST', {
      asset: 'ERP', threat: 'Vazamento', impact: 5, probability: 4, treatment_due_date: '2026-11-30', residual_impact: 2, residual_probability: 2,
    });
    expect(r.status).toBe(201);
    const { id } = await r.json<{ id: string }>();
    expect(await risco(id)).toMatchObject({ treatment_due_date: '2026-11-30', residual_impact: 2, residual_probability: 2, residual_level: 'Low' });

    expect((await chamar(consultor, `/api/v1/risks/${id}`, 'PUT', { threat: 'Vazamento de dados' })).status).toBe(200);
    expect(await risco(id)).toMatchObject({ treatment_due_date: '2026-11-30', residual_level: 'Low' });

    expect((await chamar(consultor, `/api/v1/risks/${id}`, 'PUT', { treatment_due_date: '30/11/2026' })).status).toBe(400);
    expect((await chamar(consultor, `/api/v1/risks/${id}`, 'PUT', { treatment_due_date: null })).status).toBe(200);
    expect((await risco(id))?.treatment_due_date).toBeNull();
    expect((await chamar(consultor, `/api/v1/projects/${P}/risks`, 'POST', { asset: 'ERP', threat: 'X', treatment_due_date: 'logo' })).status).toBe(400);
  });
});

describe('nome do fornecedor', () => {
  it('PUT /vendors/:id grava o nome normalizado na parte, como o POST', async () => {
    const r = await chamar(consultor, `/api/v1/projects/${P}/vendors`, 'POST', { name: 'Fornecedor Exemplo' });
    expect(r.status).toBe(201);
    const { id } = await r.json<{ id: string }>();
    expect((await chamar(consultor, `/api/v1/vendors/${id}`, 'PUT', { name: '  acme   ltda ' })).status).toBe(200);
    const parte = await env.DB.prepare('SELECT p.nome FROM partes p JOIN vendors v ON v.parte_id = p.id WHERE v.id = ?').bind(id).first<{ nome: string }>();
    expect(parte?.nome).toBe(normalizarNome('  acme   ltda '));
  });
});
