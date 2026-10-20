import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, designarConsultor } from './helpers/d1';

const P = 'ar-proj';
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}) }), workerEnv());
let consultor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P).run();
  await designarConsultor('cons@ness.lat', P);
  consultor = await sessionFor({ id: 'cons:cons@ness.lat', email: 'cons@ness.lat', role: 'consultor' });
});

describe('aceite de risco: um modelo só', () => {
  it('quem e quando vêm da sessão, nunca do corpo', async () => {
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/risks`, { asset: 'ERP', threat: 'Vazamento', treatment: 'Accept', accepted_by: 'Digitado', accepted_at: '2020-01-01' });
    const { id } = await r.json<{ id: string }>();
    expect(await env.DB.prepare('SELECT status, accepted_by, accepted_at FROM risks WHERE id = ?').bind(id).first()).toEqual({ status: 'Open', accepted_by: null, accepted_at: null });
    expect((await chamar(consultor, 'PUT', `/api/v1/risks/${id}`, { status: 'Accepted', accepted_by: 'Outro', accepted_at: '2020-01-01' })).status).toBe(200);
    const l = await env.DB.prepare('SELECT status, accepted_by, accepted_at FROM risks WHERE id = ?').bind(id).first<any>();
    expect(l.status).toBe('Accepted');
    expect(l.accepted_by).toBe('cons@ness.lat');
    expect(l.accepted_at.slice(0, 4)).not.toBe('2020');
  });

  it('editar um risco já aceito não muda o carimbo', async () => {
    const { id } = await (await chamar(consultor, 'POST', `/api/v1/projects/${P}/risks`, { asset: 'ERP', threat: 'Outro', treatment: 'Accept' })).json<{ id: string }>();
    await chamar(consultor, 'PUT', `/api/v1/risks/${id}`, { status: 'Accepted' });
    const antes = await env.DB.prepare('SELECT accepted_at FROM risks WHERE id = ?').bind(id).first<any>();
    await chamar(consultor, 'PUT', `/api/v1/risks/${id}`, { treatment_plan: 'Plano' });
    expect(await env.DB.prepare('SELECT accepted_at FROM risks WHERE id = ?').bind(id).first()).toEqual(antes);
  });

  it('status fora da lista é recusado no POST', async () => {
    expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/risks`, { asset: 'ERP', threat: 'X', status: 'accepted' })).status).toBe(400);
  });

  it('aceite refeito pelo botão deixa de ser "registrado à mão"', async () => {
    const { id } = await (await chamar(consultor, 'POST', `/api/v1/projects/${P}/risks`, { asset: 'ERP', threat: 'Legado', treatment: 'Accept' })).json<{ id: string }>();
    await env.DB.prepare(`UPDATE risks SET status = 'Accepted', accepted_by = 'Digitado', aceite_manual = 1 WHERE id = ?`).bind(id).run();
    await chamar(consultor, 'PUT', `/api/v1/risks/${id}`, { status: 'Open' });
    await chamar(consultor, 'PUT', `/api/v1/risks/${id}`, { status: 'Accepted' });
    expect(await env.DB.prepare('SELECT accepted_by, aceite_manual FROM risks WHERE id = ?').bind(id).first()).toEqual({ accepted_by: 'cons@ness.lat', aceite_manual: 0 });
  });
});

