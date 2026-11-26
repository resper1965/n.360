// Evidência do tratamento ligada ao risco (migration 0122): prova que o plano foi cumprido sem editar o plano, que faz parte do estado
// aceito. Ligar e desligar vão à trilha, não mudam o hash do aceite nem o derrubam, e o risco mostra a lista em `evidencias_tratamento`.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, resetData, sessionFor, workerEnv, concederModulos, execSql } from './helpers/d1';
import { hashPassword } from '../src/helpers';
import migration0122 from '../migrations/0122_evidencia_riscos.sql?raw';

const P = 'p-evr';
const SENHA = 'Senha-forte-123!';
const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'c-evr' };
let ceo: Record<string, string>, cons: Record<string, string>, leitor: Record<string, string>;

const json = { 'Content-Type': 'application/json' };
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, agente?: object) =>
  worker.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...h, ...json }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }),
    agente ? ({ ...workerEnv(), AGENTE: agente } as any) : workerEnv());
const doRisco = async (h: Record<string, string>, id: string) =>
  ((await (await chamar(h, 'GET', `/api/v1/projects/${P}/risks`)).json<any>()).risks as any[]).find((r) => r.id === id);
const aceiteVigente = () => env.DB.prepare(`SELECT hash, situacao FROM risco_aceites WHERE risk_id = 'rk-1' ORDER BY aceito_em DESC LIMIT 1`).first<{ hash: string; situacao: string }>();
const trilha = (acao: string) => env.DB.prepare(`SELECT actor, details, entity_type, entity_id FROM audit_logs WHERE action = ? ORDER BY rowid DESC LIMIT 1`).bind(acao).first<any>();

beforeAll(async () => { await applySchema(); });

beforeEach(async () => {
  await resetData();
  const h = await hashPassword(SENHA);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?1, 'Cliente', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness'),
      ('p-outro', 'Outro', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('c-1', ?, 'ISO 27001:2022', 'A.8.13 Backup', 'Implemented')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-ceo', 'ceo@cliente.com', ?1, 'Carla Ceo', 'org_user', ?2, 'org_ness'),
      ('u-leitor', 'leitor@cliente.com', ?1, 'Leo Leitor', 'org_user', ?2, 'org_ness'),
      ('u-cons', 'cons@ness.lat', ?1, 'Cons', 'consultor', NULL, 'org_ness')`).bind(h, P),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES
      (?1, 'Carla Ceo', 'ceo@cliente.com', 'cliente', 'CEO'), (?1, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-evr', 'u-cons', ?, datetime('now', '+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, impact, probability, risk_level, treatment, treatment_plan, control_id, status,
        residual_impact, residual_probability, residual_level) VALUES
      ('rk-1', ?1, 'Servidor de arquivos', 'Ransomware', 5, 4, 'High', 'Mitigate', 'Backup diário', 'c-1', 'Mitigated', 2, 2, 'Low'),
      ('rk-fora', 'p-outro', 'ERP', 'Falha', 3, 3, 'Medium', 'Mitigate', NULL, NULL, 'Open', NULL, NULL, NULL)`).bind(P),
    env.DB.prepare(`INSERT INTO evidence (id, project_id, control_id, file_name, r2_key, file_hash, uploaded_by) VALUES
      ('ev-1', ?, NULL, 'relatorio-restauracao.pdf', 'k/1', 'h1', 'cons@ness.lat')`).bind(P),
  ]);
  await concederModulos(['u-ceo', 'u-leitor', 'u-cons'], ['iso']);
  ceo = await sessionFor({ id: 'u-ceo', email: 'ceo@cliente.com', name: 'Carla Ceo', role: 'org_user', client_project_id: P });
  leitor = await sessionFor({ id: 'u-leitor', email: 'leitor@cliente.com', name: 'Leo Leitor', role: 'org_user', client_project_id: P });
  cons = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
});

describe('evidência do tratamento ligada ao risco', () => {
  it('ligar e desligar não mudam o hash do aceite nem o derrubam; a trilha registra; o risco mostra a lista', async () => {
    const hashVisto = (await doRisco(ceo, 'rk-1')).aceite.hash;
    expect((await chamar(ceo, 'POST', '/api/v1/risks/rk-1/aceite', { senha: SENHA, hash_visto: hashVisto })).status).toBe(200);
    const antes = await aceiteVigente();
    expect(antes!.situacao).toBe('vigente');

    const r = await chamar(cons, 'POST', '/api/v1/evidence/ev-1/riscos', { risk_id: 'rk-1' });
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await aceiteVigente()).toEqual(antes);
    const lista = (await doRisco(cons, 'rk-1')).evidencias_tratamento;
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ evidence_id: 'ev-1', file_name: 'relatorio-restauracao.pdf', ligado_por: 'cons@ness.lat' });
    expect((await doRisco(cons, 'rk-1')).aceite.situacao).toBe('aceito');
    expect(await trilha('evidence.risco_ligado')).toMatchObject({ actor: 'cons@ness.lat', entity_type: 'risk', entity_id: 'rk-1' });

    // Ligar de novo não duplica.
    expect((await chamar(cons, 'POST', '/api/v1/evidence/ev-1/riscos', { risk_id: 'rk-1' })).status).toBe(200);

    const d = await chamar(cons, 'DELETE', '/api/v1/evidence/ev-1/riscos/rk-1');
    expect(d.status, await d.clone().text()).toBe(200);
    expect(await aceiteVigente()).toEqual(antes);
    expect((await doRisco(cons, 'rk-1')).evidencias_tratamento).toEqual([]);
    expect(await trilha('evidence.risco_desligado')).toMatchObject({ entity_type: 'risk', entity_id: 'rk-1' });
    expect((await chamar(cons, 'DELETE', '/api/v1/evidence/ev-1/riscos/rk-1')).status).toBe(404);
  });

  it('risco de outro projeto ou inexistente: 404, sem gravar; o banco também recusa', async () => {
    for (const risk_id of ['rk-fora', 'rk-nada']) {
      expect((await chamar(cons, 'POST', '/api/v1/evidence/ev-1/riscos', { risk_id })).status, risk_id).toBe(404);
    }
    await expect(env.DB.prepare(`INSERT INTO evidencia_riscos (evidence_id, risk_id, project_id) VALUES ('ev-1', 'rk-fora', ?)`).bind(P).run()).rejects.toThrow();
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM evidencia_riscos').first<{ n: number }>())!.n).toBe(0);
  });

  it('leitor do cliente não liga; o agente do consultor liga e desliga (desligar com confirmação)', async () => {
    expect((await chamar(leitor, 'POST', '/api/v1/evidence/ev-1/riscos', { risk_id: 'rk-1' })).status).toBe(403);
    const r = await chamar({}, 'POST', '/api/v1/evidence/ev-1/riscos', { risk_id: 'rk-1' }, AGENTE);
    expect(r.status, await r.clone().text()).toBe(201);
    expect((await trilha('evidence.risco_ligado')).actor).toMatch(/^agente de cons@ness\.lat/);
    expect((await chamar({}, 'DELETE', '/api/v1/evidence/ev-1/riscos/rk-1', undefined, AGENTE)).status).toBe(403);
    expect((await chamar({ 'X-Agente-Confirmado': '1' }, 'DELETE', '/api/v1/evidence/ev-1/riscos/rk-1', undefined, AGENTE)).status).toBe(200);
  });

  it('apagar a evidência leva o vínculo', async () => {
    await chamar(cons, 'POST', '/api/v1/evidence/ev-1/riscos', { risk_id: 'rk-1' });
    await env.DB.prepare(`DELETE FROM evidence WHERE id = 'ev-1'`).run();
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM evidencia_riscos').first<{ n: number }>())!.n).toBe(0);
  });

  it('a migration 0122 é a mesma definição do schema.sql e é repetível', async () => {
    const def = async () => ((await env.DB.prepare(`SELECT sql FROM sqlite_master WHERE name = 'evidencia_riscos'`).first<{ sql: string }>())?.sql ?? '').replace(/\s+/g, ' ');
    const doSchema = await def();
    await execSql('DROP TABLE evidencia_riscos;');
    await execSql(migration0122);
    expect(await def()).toBe(doSchema);
    await execSql(migration0122);
  });
});
