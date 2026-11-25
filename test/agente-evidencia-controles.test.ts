// O agente do consultor liga e desliga controle de uma evidência (N:N) pelo niso_executar: ligar é livre, desligar é
// DELETE (exige confirmado_pelo_usuario). A trilha registra "agente de <consultor>" e o controle. O agente auditor não liga.
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

const P = 'p-agev';
const CONS = { userId: 'u-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'c-agev' };
const AUD = { userId: 'u-aud', email: 'aud@ness.lat', projectId: P, concessaoId: 'c-agev-aud', papel: 'auditor' } as const;
const CONFIRMA = { 'X-Agente-Confirmado': '1' };
const comoAgente = (agente: object, metodo: string, caminho: string, headers: Record<string, string> = {}, corpo?: unknown) =>
  worker.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }),
    { ...workerEnv(), AGENTE: agente } as any);
const vinculos = async () =>
  (await env.DB.prepare(`SELECT control_id FROM evidencia_controles WHERE evidence_id = 'ev-1' ORDER BY control_id`).all<{ control_id: string }>()).results.map((r) => r.control_id);
const ultimaTrilha = (acao: string) => env.DB.prepare(`SELECT actor, details FROM audit_logs WHERE action = ? ORDER BY rowid DESC LIMIT 1`).bind(acao).first<{ actor: string; details: string }>();

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001:2022', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES
      ('c-1', ?1, 'ISO 27001:2022', 'A.5.1 Políticas', 'Implemented'),
      ('c-2', ?1, 'ISO 27001:2022', 'A.5.2 Papéis', 'Implemented')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES
      ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', 'org_ness'),
      ('u-aud', 'aud@ness.lat', 'x', 'Aud', 'consultor', 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES
      (?1, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'), (?1, 'Aud', 'aud@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-agev', 'u-cons', ?, datetime('now', '+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em, papel) VALUES ('c-agev-aud', 'u-aud', ?, datetime('now', '+30 days'), 'auditor')`).bind(P),
    env.DB.prepare(`INSERT INTO evidence (id, project_id, control_id, file_name, r2_key, file_hash, uploaded_by) VALUES ('ev-1', ?, 'c-1', 'p.md', 'k/1', 'h1', 'x')`).bind(P),
  ]);
});

describe('agente do consultor e a evidência N:N', () => {
  it('liga pelo código do controle; a trilha diz "agente de <consultor>" e o controle', async () => {
    const r = await comoAgente(CONS, 'POST', '/api/v1/evidence/ev-1/controles', {}, { control_id: 'A.5.2' });
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await vinculos()).toEqual(['c-1', 'c-2']);
    const t = await ultimaTrilha('evidence.controle_ligado');
    expect(t!.actor).toMatch(/^agente de cons@ness\.lat/);
    expect(t!.details).toContain('c-2');
  });

  it('desligar é DELETE: sem confirmação, 403; com, desliga pelo código e vai à trilha', async () => {
    expect((await comoAgente(CONS, 'DELETE', '/api/v1/evidence/ev-1/controles/A.5.2')).status).toBe(403);
    expect(await vinculos()).toEqual(['c-1', 'c-2']);
    const r = await comoAgente(CONS, 'DELETE', '/api/v1/evidence/ev-1/controles/A.5.2', CONFIRMA);
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await r.json<any>()).control_id).toBe('c-2');
    expect(await vinculos()).toEqual(['c-1']);
    const t = await ultimaTrilha('evidence.controle_desligado');
    expect(t!.actor).toMatch(/^agente de cons@ness\.lat/);
    expect(t!.details).toContain('c-2');
  });

  it('o DELETE da pessoa também aceita o código; controle que não está ligado é 404', async () => {
    const cons = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
    const del = (ref: string) => worker.fetch(new Request(`http://localhost/api/v1/evidence/ev-1/controles/${ref}`, { method: 'DELETE', headers: cons }), workerEnv());
    expect((await del('A.5.2')).status).toBe(404);
    expect((await del('A.5.1')).status).toBe(200);
    expect(await vinculos()).toEqual([]);
  });

  it('o agente auditor não liga nem desliga', async () => {
    expect((await comoAgente(AUD, 'POST', '/api/v1/evidence/ev-1/controles', {}, { control_id: 'A.5.1' })).status).toBe(403);
    expect((await comoAgente(AUD, 'DELETE', '/api/v1/evidence/ev-1/controles/A.5.1', CONFIRMA)).status).toBe(403);
    expect(await vinculos()).toEqual([]);
  });
});
