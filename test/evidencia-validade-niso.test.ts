import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, designarConsultor } from './helpers/d1';

/** Spec 3C (C4): projeto só do n.iso define a validade da evidência; ligar requisito continua do n.privacy. */
const P = 'evn-proj';
const chamar = (h: Record<string, string>, caminho: string, metodo = 'GET', corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
}), workerEnv());
let consultor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES ('evn-e', ?, 'laudo.pdf', 'evidence/evn/laudo.pdf', 'h', 'x')`).bind(P),
  ]);
  await designarConsultor('cons@ness.lat', P);
  consultor = await sessionFor({ id: 'cons:cons@ness.lat', email: 'cons@ness.lat', role: 'consultor' });
});

describe('validade da evidência pelo n.iso', () => {
  it('projeto sem o n.privacy define e limpa a validade', async () => {
    expect(await env.DB.prepare(`SELECT modulo FROM projeto_modulos WHERE project_id = ?`).bind(P).all().then((r) => r.results)).toEqual([{ modulo: 'iso' }]);
    const r = await chamar(consultor, `/api/v1/projects/${P}/evidence/evn-e/validade`, 'PUT', { valido_ate: '2027-03-31' });
    expect(r.status).toBe(200);
    expect(await env.DB.prepare('SELECT valido_ate FROM evidence WHERE id = ?').bind('evn-e').first()).toEqual({ valido_ate: '2027-03-31' });
    expect((await chamar(consultor, `/api/v1/projects/${P}/evidence/evn-e/validade`, 'PUT', { valido_ate: null })).status).toBe(200);
  });

  it('os requisitos da evidência continuam exigindo o n.privacy', async () => {
    expect((await chamar(consultor, `/api/v1/projects/${P}/evidence/evn-e/requisitos`)).status).toBe(403);
  });
});
