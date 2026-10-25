// Retirada da política por controle (PR3 das políticas temáticas, Task 5): as rotas por controle saem, o pedido
// `politica` novo é recusado, publicar documento não escreve no controle e a coerência R4 lê a cobertura.
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';
import { checkCoherence } from '../src/services/coherence';

const PJ = 'p-ret';
const AG = { userId: 'u-ret', email: 'cons-ret@ness.lat', projectId: PJ, concessaoId: 'c-ret' };
const json = { 'Content-Type': 'application/json' };
let s: Record<string, string>;

const pessoa = (metodo: string, caminho: string, corpo?: unknown) =>
  worker.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...s }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv());
const agente = (metodo: string, caminho: string, corpo?: unknown) =>
  worker.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: json, body: corpo === undefined ? undefined : JSON.stringify(corpo) }),
    { ...workerEnv(), AGENTE: AG } as any);

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente Ret', 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(PJ),
    env.DB.prepare(`INSERT OR IGNORE INTO projeto_modulos (project_id, modulo) VALUES (?, 'iso')`).bind(PJ),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-ret', 'cons-ret@ness.lat', 'x', 'Cons', 'consultor', 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES (?, 'Cons', 'cons-ret@ness.lat', 'consultor', 'Consultor')`).bind(PJ),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-ret', 'u-ret', ?, datetime('now','+30 days'))`).bind(PJ),
    env.DB.prepare(`INSERT OR IGNORE INTO usuario_modulos (user_id, modulo) VALUES ('u-ret', 'iso')`),
    env.DB.prepare(`INSERT OR IGNORE INTO requisito_fontes (id, nome, versao) VALUES ('iso27001:2022', 'ISO/IEC 27001', '2022')`),
    env.DB.prepare(`INSERT OR IGNORE INTO requisitos (id, fonte_id, referencia, titulo) VALUES ('rq-ret-1', 'iso27001:2022', 'A.5.15', 'Controle de acesso'), ('rq-ret-2', 'iso27001:2022', 'A.5.24', 'Incidentes')`),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, description, requisito_id) VALUES
      ('ret-c1', ?, 'ISO 27001', 'A.5.1 Políticas', 'Implemented', 'Nota antiga do controle', NULL),
      ('ret-c2', ?, 'ISO 27001', 'A.5.15 Controle de acesso', 'Implemented', NULL, 'rq-ret-1'),
      ('ret-c3', ?, 'ISO 27001', 'A.5.24 Incidentes', 'Implemented', 'Só nota', 'rq-ret-2')`).bind(PJ, PJ, PJ),
    env.DB.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo, status) VALUES ('ret-doc-iam', ?, 'politica', 'POL-IAM-001 Controle de acesso', 'vigente')`).bind(PJ),
    env.DB.prepare(`INSERT INTO documento_requisitos (documento_id, requisito_id, project_id) VALUES ('ret-doc-iam', 'rq-ret-1', ?)`).bind(PJ),
    env.DB.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo, status, origem_control_id) VALUES ('ret-doc-c1', ?, 'politica', 'A.5.1 Políticas', 'rascunho', 'ret-c1')`).bind(PJ),
    env.DB.prepare(`INSERT INTO documento_versoes (id, project_id, documento_id, numero, texto, hash, estado, origem, criado_por) VALUES ('ret-v1', ?, 'ret-doc-c1', 1, 'Texto novo do documento', '${'a'.repeat(64)}', 'rascunho', 'humano', 'x@ness.lat')`).bind(PJ),
  ]);
  s = await sessionFor({ id: 'u-ret-adm', email: 'adm-ret@ness.lat', role: 'platform_admin', org_id: 'org_ness' });
});

const REMOVIDAS: [string, string, unknown?][] = [
  ['POST', `/api/v1/projects/${PJ}/generate-policy`, { control_id: 'A.5.1' }],
  ['POST', `/api/v1/projects/${PJ}/generate-policies-bulk`, { control_ids: ['A.5.1'] }],
  ['GET', `/api/v1/projects/${PJ}/controls/ret-c1/versions`],
  ['GET', `/api/v1/projects/${PJ}/controls/ret-c1/versions/v1`],
  ['GET', `/api/v1/projects/${PJ}/controls/ret-c1/policy`],
  ['GET', `/api/v1/projects/${PJ}/controls/ret-c1/policy/report`],
  ['POST', `/api/v1/projects/${PJ}/controls/ret-c1/restore-version`, { version_id: 'v1' }],
  ['POST', `/api/v1/projects/${PJ}/controls/ret-c1/policy`, { text: 'Texto' }],
  ['GET', `/api/v1/policies/templates`],
  ['GET', `/api/v1/policies/templates/qualquer`],
  ['POST', `/api/v1/projects/${PJ}/policies/generate-from-template`, { template_name: 'x', control_id: 'A.5.1' }],
  ['POST', `/api/v1/controls/ret-c1/approve`, { password: 'x' }],
  ['PUT', `/api/v1/controls/ret-c1/approve`, { password: 'x' }],
];

describe('rotas da política por controle', () => {
  it.each(REMOVIDAS)('%s %s responde 404 a pessoa', async (metodo, caminho, corpo) => {
    expect((await pessoa(metodo, caminho, corpo)).status).toBe(404);
  });

  const DO_AGENTE: [string, string, unknown][] = [
    ['POST', `/api/v1/projects/${PJ}/controls/ret-c1/restore-version`, { version_id: 'v1' }],
    ['POST', `/api/v1/projects/${PJ}/policies/generate-from-template`, { template_name: 'x', control_id: 'A.5.1' }],
    ['POST', `/api/v1/projects/${PJ}/generate-policies-bulk`, { control_ids: ['A.5.1'] }],
    ['POST', `/api/v1/projects/${PJ}/generate-policy`, { control_id: 'A.5.1' }],
    ['POST', `/api/v1/projects/${PJ}/controls/ret-c1/policy`, { text: 'Texto' }],
  ];
  it.each(DO_AGENTE)('%s %s responde 404 ao agente', async (metodo, caminho, corpo) => {
    expect((await agente(metodo, caminho, corpo)).status).toBe(404);
  });

  it('controle: a mesma concessão do agente alcança uma rota que existe (o 404 não vem da concessão)', async () => {
    const r = await agente('GET', `/api/v1/projects/${PJ}/documentos`);
    expect(r.status, await r.clone().text()).toBe(200);
  });

  it('nenhuma delas tocou o controle', async () => {
    const c = await env.DB.prepare(`SELECT description FROM compliance_controls WHERE id = 'ret-c1'`).first<any>();
    expect(c.description).toBe('Nota antiga do controle');
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM policy_versions WHERE project_id = ?`).bind(PJ).first<any>()).n).toBe(0);
  });
});

describe('pedido de política', () => {
  it('POST com tipo politica: 400 e nenhum pedido criado', async () => {
    // O consultor designado pede (o platform_admin não pede); a recusa vem antes de ler o controle.
    const cons = await sessionFor({ id: 'u-ret', email: 'cons-ret@ness.lat', role: 'consultor', org_id: 'org_ness' });
    const r = await worker.fetch(new Request(`http://localhost/api/v1/projects/${PJ}/pedidos`, { method: 'POST', headers: { ...json, ...cons }, body: JSON.stringify({ tipo: 'politica', ref_id: 'ret-c1', papel_exigido: 'ciso', destinatarios: [{ email: 'cons-ret@ness.lat' }] }) }), workerEnv());
    expect(r.status, await r.clone().text()).toBe(400);
    expect((await r.json<any>()).error).toBe('A política agora é um documento: peça a aprovação pela página da política.');
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM pedidos WHERE project_id = ?`).bind(PJ).first<any>()).n).toBe(0);
  });

  it('POST ciencia (lote por link) com tipo politica: o mesmo 400 e nenhum pedido criado', async () => {
    const cons = await sessionFor({ id: 'u-ret', email: 'cons-ret@ness.lat', role: 'consultor', org_id: 'org_ness' });
    const r = await worker.fetch(new Request(`http://localhost/api/v1/projects/${PJ}/pedidos/ciencia`, { method: 'POST', headers: { ...json, ...cons }, body: JSON.stringify({ tipo: 'politica', ref_id: 'ret-c1', destinatarios: [{ email: 'leitor@cliente.lat' }] }) }),
      { ...workerEnv(), RESEND_API_KEY: 're_teste' } as any);
    expect(r.status, await r.clone().text()).toBe(400);
    expect((await r.json<any>()).error).toBe('A política agora é um documento: peça a aprovação pela página da política.');
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM pedidos WHERE project_id = ?`).bind(PJ).first<any>()).n).toBe(0);
  });
});

describe('publicar documento que veio de controle', () => {
  it('não muda a nota nem as assinaturas do controle', async () => {
    await env.DB.prepare(`UPDATE compliance_controls SET ciso_approved_by = 'Fulano', ciso_approved_at = '2026-01-01' WHERE id = 'ret-c1'`).run();
    const r = await pessoa('POST', `/api/v1/projects/${PJ}/documentos/ret-doc-c1/versoes/1/publicar`);
    expect(r.status, await r.clone().text()).toBe(200);
    const c = await env.DB.prepare(`SELECT description, ciso_approved_by, ciso_approved_at FROM compliance_controls WHERE id = 'ret-c1'`).first<any>();
    expect(c).toEqual({ description: 'Nota antiga do controle', ciso_approved_by: 'Fulano', ciso_approved_at: '2026-01-01' });
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM policy_versions WHERE control_id = 'ret-c1'`).first<any>()).n).toBe(0);
  });
});

describe('coerência R4', () => {
  it('documento vigente que cobre o controle basta; só nota não basta', async () => {
    const r = await checkCoherence(env.DB, PJ);
    const r4 = r.issues.filter((i) => i.rule === 'control_approved_without_policy').map((i) => i.id).sort();
    // ret-c2: coberto pela POL-IAM vigente. ret-c1 e ret-c3: só nota (a publicação do documento de controle não liga requisito).
    expect(r4).toEqual(['ret-c1', 'ret-c3']);
  });

  it('histórico em policy_versions ainda conta', async () => {
    await env.DB.prepare(`INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES ('ret-pv', ?, 'ret-c3', 1, 'Antiga', 'x')`).bind(PJ).run();
    const r = await checkCoherence(env.DB, PJ);
    expect(r.issues.filter((i) => i.rule === 'control_approved_without_policy').map((i) => i.id)).toEqual(['ret-c1']);
  });
});
