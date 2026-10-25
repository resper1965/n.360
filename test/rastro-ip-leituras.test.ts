import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/** Auditoria r3, achado 6: IP e navegador saem de audit-pack e policy-acknowledgments para quem não é da consultoria. */
const P = 'rip-p';
const AGENTE = { userId: 'u-rip-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'c-rip' };
const chamar = (h: Record<string, string>, caminho: string, extra: object = {}) =>
  app.fetch(new Request('http://localhost' + caminho, { headers: h }), { ...workerEnv(), ...extra } as any);
let consultor: Record<string, string>, cliente: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-rip-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-rip-cli', 'adm@cliente.com', 'x', 'Adm', 'org_admin', ?1, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-rip', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-rip', 'u-rip-cons', ?, datetime('now','+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO audit_logs (id, action, actor, details, ip_address, project_id) VALUES ('rip-log', 'teste.rip', 'x@y.com', 'detalhe', '203.0.113.9', ?)`).bind(P),
    env.DB.prepare(`INSERT INTO policy_acknowledgments (id, project_id, policy_type, user_name, user_email, ip_address, user_agent) VALUES ('rip-ack', ?, 'ISP', 'Maria', 'maria@empresa.com', '198.51.100.7', 'Mozilla/5.0')`).bind(P),
  ]);
  consultor = await sessionFor({ id: 'u-rip-cons', email: 'cons@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-rip-cli', email: 'adm@cliente.com', role: 'org_admin', client_project_id: P });
});

const trilhaDoPack = async (r: Response) => (await r.json<any>()).pack.audit_trail.find((l: any) => l.id === 'rip-log');
const ackDe = async (r: Response) => (await r.json<any[]>()).find((a) => a.id === 'rip-ack');

describe('IP e navegador só para a equipe da consultoria', () => {
  it('audit-pack: equipe vê o IP; cliente e agente não', async () => {
    const url = `/api/v1/projects/${P}/audit-pack`;
    expect(await trilhaDoPack(await chamar(consultor, url))).toMatchObject({ ip_address: '203.0.113.9' });
    const doCliente = await trilhaDoPack(await chamar(cliente, url));
    expect(doCliente).toMatchObject({ action: 'teste.rip' });
    expect(doCliente).not.toHaveProperty('ip_address');
    const doAgente = await trilhaDoPack(await chamar({}, url, { AGENTE }));
    expect(doAgente).not.toHaveProperty('ip_address');
  });

  it('policy-acknowledgments: equipe vê IP e navegador; cliente e agente não', async () => {
    const url = `/api/v1/projects/${P}/policy-acknowledgments`;
    expect(await ackDe(await chamar(consultor, url))).toMatchObject({ ip_address: '198.51.100.7', user_agent: 'Mozilla/5.0' });
    for (const r of [await chamar(cliente, url), await chamar({}, url, { AGENTE })]) {
      expect(r.status).toBe(200);
      const a = await ackDe(r);
      expect(a).toMatchObject({ user_email: 'maria@empresa.com' });
      expect(a).not.toHaveProperty('ip_address');
      expect(a).not.toHaveProperty('user_agent');
    }
  });
});
