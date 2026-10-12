import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/** Incidente é do núcleo (vale sem n.privacy) e a CAPA pode nascer dele (n.iso, A.5.26/A.5.27). */
const P = 'in-proj';
const OUTRO = 'in-outro';
const B = `/api/v1/projects/${P}`;

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;

let consultor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  // Os projetos nascem só com n.iso (gatilho 0060): nada de habilitarPrivacy aqui.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-in', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em) VALUES ('in-alheio', ?, 'IN-2026-0001', 'Alheio', '2026-10-01')`).bind(OUTRO),
  ]);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
});

describe('incidente sem n.privacy', () => {
  it('registra, avalia, comunica e encerra num projeto só n.iso; o resto do n.privacy continua fechado', async () => {
    const r = await chamar(consultor, 'POST', `${B}/incidentes`, { titulo: 'Acesso indevido', ciencia_em: new Date(Date.now() - 3_600_000).toISOString() });
    expect(r.status, await r.clone().text()).toBe(201);
    const { id } = await json<{ id: string }>(r);
    expect((await chamar(consultor, 'PUT', `${B}/incidentes/${id}/risco`, { risco_titular: 'sem_risco' })).status).toBe(200);
    expect((await chamar(consultor, 'POST', `${B}/incidentes/${id}/comunicacoes`, { destino: 'anpd' })).status).toBe(200);
    expect((await chamar(consultor, 'POST', `${B}/incidentes/${id}/encerrar`)).status).toBe(200);
    expect((await chamar(consultor, 'GET', `${B}/titular-pedidos`)).status).toBe(403);
  });
});

describe('CAPA do incidente', () => {
  const novoIncidente = async () => (await json<{ id: string }>(await chamar(consultor, 'POST', `${B}/incidentes`, { titulo: 'Perda de notebook', ciencia_em: '2026-10-01' }))).id;

  it('guarda incidente_id; incidente de outro projeto é 400; PUT também confere', async () => {
    const inc = await novoIncidente();
    const r = await chamar(consultor, 'POST', `${B}/capa`, { title: 'Tratar incidente', incidente_id: inc });
    expect(r.status, await r.clone().text()).toBe(201);
    const { id } = await json<{ id: string }>(r);
    expect((await env.DB.prepare('SELECT incidente_id FROM corrective_actions WHERE id = ?').bind(id).first<{ incidente_id: string }>())!.incidente_id).toBe(inc);

    const fora = await chamar(consultor, 'POST', `${B}/capa`, { title: 'X', incidente_id: 'in-alheio' });
    expect(fora.status).toBe(400);
    expect((await json<{ error: string }>(fora)).error).toBe('incidente_id inexistente ou de outro projeto');
    expect((await chamar(consultor, 'PUT', `/api/v1/capa/${id}`, { title: 'Tratar', status: 'Open', incidente_id: 'in-alheio' })).status).toBe(400);
    expect((await chamar(consultor, 'PUT', `/api/v1/capa/${id}`, { title: 'Tratar', status: 'Open', incidente_id: null })).status).toBe(200);
    expect((await env.DB.prepare('SELECT incidente_id FROM corrective_actions WHERE id = ?').bind(id).first<{ incidente_id: string | null }>())!.incidente_id).toBeNull();
  });

  it('apagar o incidente deixa a CAPA com incidente_id nulo', async () => {
    const inc = await novoIncidente();
    const { id } = await json<{ id: string }>(await chamar(consultor, 'POST', `${B}/capa`, { title: 'Tratar', incidente_id: inc }));
    await env.DB.prepare('DELETE FROM incidentes WHERE id = ?').bind(inc).run();
    const l = await env.DB.prepare('SELECT incidente_id FROM corrective_actions WHERE id = ?').bind(id).first<{ incidente_id: string | null }>();
    expect(l).not.toBeNull();
    expect(l!.incidente_id).toBeNull();
  });
});
