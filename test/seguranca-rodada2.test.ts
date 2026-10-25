import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { transferirProjeto } from '../src/services/transferencia-projeto';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

// Auditoria de segurança, rodada 2 (achados 3 a 7 e o logout).
const P = 'p-r2';
const json = { 'Content-Type': 'application/json' };
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...h },
    body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv());
const comoAgente = (metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, 'X-Agente-Confirmado': '1' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo) }),
    { ...workerEnv(), AGENTE: { userId: 'r2-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'c-r2' } } as any);
const um = <T = any>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<T>();

let cons: Record<string, string>, leitor: Record<string, string>, oa: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO organizations (id, name, slug, max_projects, max_users, status) VALUES ('org_r2', 'Consultoria R2', 'consultoria-r2', 10, 10, 'Active')`),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente R2', 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('r2-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'),
      ('r2-ou', 'leitor@cliente.lat', 'x', 'Leitor', 'org_user', ?, 'org_ness'),
      ('r2-oa', 'admin@cliente.lat', 'x', 'Admin', 'org_admin', ?, 'org_ness')`).bind(P, P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-r2', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-r2', 'r2-cons', ?, datetime('now', '+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, file_type, r2_key, file_hash, uploaded_by) VALUES
      ('ev-pdf', ?, 'contrato.pdf', 'application/pdf', 'evidence/p-r2/contrato.pdf', 'h1', 'x'),
      ('ev-md', ?, 'nota.md', 'text/markdown', 'evidence/p-r2/nota.md', 'h2', 'x')`).bind(P, P),
    env.DB.prepare(`INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, notes, bloqueio_motivo, bloqueio_responsavel, bloqueado_em) VALUES
      ('cp-1', ?, 1, 'p1-1', 1, NULL, NULL, NULL, NULL),
      ('cp-2', ?, 1, 'p1-2', 0, NULL, 'Falta contrato', 'Cliente', datetime('now')),
      ('cp-3', ?, 1, 'p1-3', 0, 'anotação antiga', NULL, NULL, NULL)`).bind(P, P, P),
    env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at, created_by) VALUES ('at-r2', ?, 'hash-r2', datetime('now', '+30 days'), 'cons@ness.lat')`).bind(P),
  ]);
  await env.STORAGE.put('evidence/p-r2/contrato.pdf', '%PDF-original');
  await env.STORAGE.put('evidence/p-r2/nota.md', '# nota');
  cons = await sessionFor({ id: 'r2-cons', email: 'cons@ness.lat', role: 'consultor', org_id: 'org_ness' });
  leitor = await sessionFor({ id: 'r2-ou', email: 'leitor@cliente.lat', role: 'org_user', client_project_id: P, org_id: 'org_ness' });
  oa = await sessionFor({ id: 'r2-oa', email: 'admin@cliente.lat', role: 'org_admin', client_project_id: P, org_id: 'org_ness' });
});

describe('agente não publica política por rota paralela', () => {
  it('publicar versão e descartar rascunho sem a ferramenta de decisão são recusados ao agente', async () => {
    expect((await comoAgente('POST', `/api/v1/projects/${P}/documentos/doc-x/versoes/1/publicar`)).status).toBe(403);
    expect((await comoAgente('DELETE', `/api/v1/projects/${P}/documentos/doc-x/rascunho`)).status).toBe(403);
  });
});

describe('conteúdo de evidência', () => {
  it('papel de leitura não sobrescreve arquivo que não é texto', async () => {
    const r = await chamar(leitor, 'PUT', '/api/v1/evidence/ev-pdf/content', { content: 'apagado' });
    expect(r.status).toBe(409);
    expect(await (await env.STORAGE.get('evidence/p-r2/contrato.pdf'))!.text()).toBe('%PDF-original');
  });

  it('documento em texto continua editável', async () => {
    expect((await chamar(leitor, 'PUT', '/api/v1/evidence/ev-md/content', { content: '# nota nova' })).status).toBe(200);
    expect(await (await env.STORAGE.get('evidence/p-r2/nota.md'))!.text()).toBe('# nota nova');
  });
});

describe('ciência de política', () => {
  const corpo = (email: string) => ({ policy_type: 'Política de SI', user_name: 'Alguém', user_email: email });

  it('papel de leitura registra só a própria ciência', async () => {
    expect((await chamar(leitor, 'POST', `/api/v1/projects/${P}/policy-acknowledgments`, corpo('ceo@cliente.lat'))).status).toBe(403);
    expect((await chamar(leitor, 'POST', `/api/v1/projects/${P}/policy-acknowledgments`, corpo('leitor@cliente.lat'))).status).toBe(200);
  });

  it('administrador do cliente registra a de outra pessoa, e a trilha diz quem registrou', async () => {
    expect((await chamar(oa, 'POST', `/api/v1/projects/${P}/policy-acknowledgments`, corpo('colab@cliente.lat'))).status).toBe(200);
    const log = await um(`SELECT actor, details FROM audit_logs WHERE action = 'policy.ciencia_registrada' AND details LIKE '%colab@cliente.lat%'`);
    expect(log?.actor).toBe('admin@cliente.lat');
  });

  it('o agente não registra ciência', async () => {
    expect((await comoAgente('POST', `/api/v1/projects/${P}/policy-acknowledgments`, corpo('cons@ness.lat'))).status).toBe(403);
  });
});

describe('checklist antigo', () => {
  const item = (item_id: string, is_checked: boolean, notes?: string) => ({ items: [{ phase_number: 1, item_id, is_checked, ...(notes ? { notes } : {}) }] });

  it('o agente não desmarca passo concluído', async () => {
    expect((await comoAgente('PUT', `/api/v1/projects/${P}/checklist-progress`, item('p1-1', false))).status).toBe(403);
    expect((await um(`SELECT is_checked FROM checklist_progress WHERE id = 'cp-1'`)).is_checked).toBe(1);
  });

  it('passo bloqueado não se conclui', async () => {
    expect((await chamar(cons, 'PUT', `/api/v1/projects/${P}/checklist-progress`, item('p1-2', true))).status).toBe(409);
  });

  it('a anotação gravada: o agente não troca, e item sem notes não a apaga', async () => {
    expect((await comoAgente('PUT', `/api/v1/projects/${P}/checklist-progress`, item('p1-3', false, 'outra'))).status).toBe(403);
    expect((await chamar(cons, 'PUT', `/api/v1/projects/${P}/checklist-progress`, item('p1-3', false))).status).toBe(200);
    expect((await um(`SELECT notes FROM checklist_progress WHERE id = 'cp-3'`)).notes).toBe('anotação antiga');
  });
});

describe('logout', () => {
  it('apaga só a sessão, nunca uma chave qualquer do KV', async () => {
    await env.SESSIONS.put('outra_coisa', 'valor');
    await chamar({ Authorization: 'Bearer outra_coisa' }, 'POST', '/api/v1/auth/logout');
    expect(await env.SESSIONS.get('outra_coisa')).toBe('valor');
  });
});

describe('transferência de projeto', () => {
  it('revoga o link do auditor externo', async () => {
    const r = await transferirProjeto(env.DB, { projetoId: P, orgDestinoId: 'org_r2', motivo: 'teste', atorEmail: 'pa@ness.lat', ip: '' });
    expect(r.ok).toBe(true);
    const t = await um(`SELECT revoked_at, revoked_by FROM auditor_tokens WHERE id = 'at-r2'`);
    expect(t.revoked_at).not.toBeNull();
    expect(t.revoked_by).toBe('pa@ness.lat');
    expect((await um(`SELECT details FROM audit_logs WHERE action = 'projeto.transferido'`)).details).toContain('links de auditor revogados: 1');
  });
});
