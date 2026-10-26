import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, sessionFor, workerEnv } from './helpers/d1';

/** O responsável da CAPA é obrigatório no servidor, como o do gap (a tela já exigia). */
const P = 'cr-1';
let h: Record<string, string>;
const chamar = (metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv() as any);

beforeEach(async () => {
  await applySchema();
  await resetData();
  await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Cliente', 'ISO 27001', 'controller', 'Active')`).bind(P).run();
  h = await sessionFor({ id: 'u-cr', email: 'cr@ness.lat', role: 'platform_admin' });
});

describe('responsável da CAPA', () => {
  it('criar sem responsável é 400; com texto livre, 201', async () => {
    expect((await chamar('POST', `/api/v1/projects/${P}/capa`, { title: 'X' })).status).toBe(400);
    expect((await chamar('POST', `/api/v1/projects/${P}/capa`, { title: 'X', assigned_to: '   ' })).status).toBe(400);
    expect((await chamar('POST', `/api/v1/projects/${P}/capa`, { title: 'X', assigned_to: 'Ana' })).status).toBe(201);
  });

  it('a CAPA de incidente nasce sem responsável (ele vem depois)', async () => {
    await env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em) VALUES ('cr-i', ?, 'IN-1', 'Vazou', '2026-10-01')`).bind(P).run();
    expect((await chamar('POST', `/api/v1/projects/${P}/capa`, { title: 'Tratar', incidente_id: 'cr-i' })).status).toBe(201);
  });

  it('editar: limpar o responsável é 400; mexer em outro campo de ação antiga sem responsável segue valendo', async () => {
    const { id } = await (await chamar('POST', `/api/v1/projects/${P}/capa`, { title: 'X', assigned_to: 'Ana' })).json() as { id: string };
    expect((await chamar('PUT', `/api/v1/capa/${id}`, { title: 'X', status: 'Open', assigned_to: '' })).status).toBe(400);
    expect((await chamar('PUT', `/api/v1/capa/${id}`, { title: 'X', status: 'In Progress' })).status).toBe(200);
    await env.DB.prepare(`UPDATE corrective_actions SET assigned_to = NULL WHERE id = ?`).bind(id).run();
    expect((await chamar('PUT', `/api/v1/capa/${id}`, { title: 'X', status: 'Closed' })).status).toBe(200);
  });
});
