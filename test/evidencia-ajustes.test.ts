import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, resetData, sessionFor, workerEnv } from './helpers/d1';

/**
 * Quatro ajustes do caso Cliente Exemplo (uma migração de versão deixou evidências e
 * aprovações inconsistentes e a API não corrigia):
 *   1) PUT /evidence/:id grava documento_id (valida projeto + status vigente).
 *   2) DELETE /evidence/:id não estoura 500 quando um item de checklist aponta
 *      para a evidência (FK sem cascata em checklist_progress.evidence_id).
 *   3) PATCH /projects/:p/evidence/:id grava evaluation_notes/evaluation_status.
 *   4) Trocar o controle zera a aprovação de propósito — a resposta e a trilha
 *      declaram isso (approvals_reset).
 */
const P = 'p-acme';
const OUTRO = 'p-outro';
let consultor: Record<string, string>;
let cliente: Record<string, string>;

const json = (h: Record<string, string>) => ({ ...h, 'Content-Type': 'application/json' });
const chamar = (caminho: string, init: RequestInit) =>
  worker.fetch(new Request('http://localhost' + caminho, init), workerEnv());
const evidencia = (id: string) =>
  env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first<Record<string, unknown>>();

beforeAll(async () => { await applySchema(); });

beforeEach(async () => {
  await resetData();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Cliente Exemplo', 'ISO 27001:2022', 'Controller', 'Active')`).bind(P),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Outro', 'ISO 27001:2022', 'Controller', 'Active')`).bind(OUTRO),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('ctrl-a61', ?, 'ISO 27001:2022', 'A.6.1')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('ctrl-a51', ?, 'ISO 27001:2022', 'A.5.1')`).bind(P),
    env.DB.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo, status) VALUES ('doc-vig', ?, 'politica', 'POL-PES-001', 'vigente')`).bind(P),
    env.DB.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo, status) VALUES ('doc-obs', ?, 'politica', 'POL antiga', 'obsoleto')`).bind(P),
    env.DB.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo, status) VALUES ('doc-outro', ?, 'politica', 'De outro projeto', 'vigente')`).bind(OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', ?)`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES (?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
  ]);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', name: 'Cons', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', name: 'Cli', role: 'org_user', client_project_id: P });
});

async function inserirEvidencia(id: string, extra: Record<string, unknown> = {}) {
  const cols = { control_id: 'ctrl-a61', file_name: `${id}.md`, r2_key: `evidence/${P}/${id}.md`, file_hash: 'h', uploaded_by: 'alguem@x.com', ...extra };
  const campos = ['id', 'project_id', ...Object.keys(cols)];
  await env.DB.prepare(
    `INSERT INTO evidence (${campos.join(', ')}) VALUES (${campos.map(() => '?').join(', ')})`
  ).bind(id, P, ...Object.values(cols)).run();
}

describe('1) grava documento_id na evidência', () => {
  it('vincula documento vigente do mesmo projeto e o GET o devolve', async () => {
    await inserirEvidencia('ev-acme-a61');
    const res = await chamar(`/api/v1/evidence/ev-acme-a61`, { method: 'PUT', headers: json(consultor), body: JSON.stringify({ control_id: 'ctrl-a61', documento_id: 'doc-vig' }) });
    const body = await res.json<any>();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.ok).toBe(true);
    expect((await evidencia('ev-acme-a61'))!.documento_id).toBe('doc-vig');

    const lista = await chamar(`/api/v1/projects/${P}/evidence`, { headers: consultor });
    const { evidence } = await lista.json<any>();
    expect(evidence.find((e: any) => e.id === 'ev-acme-a61').documento_id).toBe('doc-vig');
  });

  it('documento_id: null desvincula', async () => {
    await inserirEvidencia('ev-acme-a61', { documento_id: 'doc-vig' });
    const res = await chamar(`/api/v1/evidence/ev-acme-a61`, { method: 'PUT', headers: json(consultor), body: JSON.stringify({ documento_id: null }) });
    expect(res.status).toBe(200);
    expect((await evidencia('ev-acme-a61'))!.documento_id).toBeNull();
  });

  it('documento obsoleto é rejeitado com 400 claro, sem gravar', async () => {
    await inserirEvidencia('ev-acme-a61');
    const res = await chamar(`/api/v1/evidence/ev-acme-a61`, { method: 'PUT', headers: json(consultor), body: JSON.stringify({ documento_id: 'doc-obs' }) });
    expect(res.status).toBe(400);
    expect((await res.json<any>()).error).toMatch(/vigente|obsoleto/i);
    expect((await evidencia('ev-acme-a61'))!.documento_id).toBeNull();
  });

  it('documento de outro projeto é rejeitado com 400', async () => {
    await inserirEvidencia('ev-acme-a61');
    const res = await chamar(`/api/v1/evidence/ev-acme-a61`, { method: 'PUT', headers: json(consultor), body: JSON.stringify({ documento_id: 'doc-outro' }) });
    expect(res.status).toBe(400);
    expect((await evidencia('ev-acme-a61'))!.documento_id).toBeNull();
  });

  // P2 (Codex): documento_id válido + control_id inválido num mesmo PUT não pode
  // gravar o documento e devolver 400 — valida tudo antes de escrever.
  it('documento válido com controle inválido: 400 e NADA gravado (atômico)', async () => {
    await inserirEvidencia('ev-acme-a61', { control_id: 'ctrl-a61', documento_id: null });
    const res = await chamar(`/api/v1/evidence/ev-acme-a61`, { method: 'PUT', headers: json(consultor), body: JSON.stringify({ documento_id: 'doc-vig', control_id: 'ctrl-de-outro-projeto' }) });
    expect(res.status).toBe(400);
    const ev = await evidencia('ev-acme-a61');
    expect(ev!.documento_id).toBeNull();   // documento NÃO foi gravado
    expect(ev!.control_id).toBe('ctrl-a61'); // controle inalterado
  });

  it('trocar o documento não zera a aprovação do controle (ortogonal)', async () => {
    await inserirEvidencia('ev-acme-a61', { ciso_approved_by: 'CISO', ciso_approved_at: '2026-07-21T15:49:12Z' });
    const res = await chamar(`/api/v1/evidence/ev-acme-a61`, { method: 'PUT', headers: json(consultor), body: JSON.stringify({ documento_id: 'doc-vig' }) });
    const body = await res.json<any>();
    expect(res.status).toBe(200);
    expect(body.approvals_reset).toBeFalsy();
    expect((await evidencia('ev-acme-a61'))!.ciso_approved_by).toBe('CISO');
  });
});

describe('2) DELETE de evidência referenciada por checklist não estoura 500', () => {
  it('exclui a linha, o objeto do R2 (chave legada) e solta o vínculo do item', async () => {
    await inserirEvidencia('ev-acme-sgsi-capa', { control_id: null, r2_key: 'acme/CAPA-2026-03-03.md' });
    await env.STORAGE.put('acme/CAPA-2026-03-03.md', 'conteudo');
    await env.DB.prepare(
      `INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, evidence_id) VALUES ('cp-capa', ?, 2, 'p2_1', 1, 'ev-acme-sgsi-capa')`
    ).bind(P).run();

    const res = await chamar(`/api/v1/evidence/ev-acme-sgsi-capa`, { method: 'DELETE', headers: consultor });
    const body = await res.json<any>();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.ok).toBe(true);
    expect(await evidencia('ev-acme-sgsi-capa')).toBeNull();
    expect(await env.STORAGE.get('acme/CAPA-2026-03-03.md')).toBeNull();
    const prog = await env.DB.prepare(`SELECT evidence_id, is_checked FROM checklist_progress WHERE id = 'cp-capa'`).first<any>();
    expect(prog.evidence_id).toBeNull();
    expect(prog.is_checked).toBe(1); // o item permanece, só perde o vínculo
  });
});

describe('3) PATCH grava notas de avaliação', () => {
  it('grava evaluation_notes e evaluation_status e registra autor na trilha', async () => {
    await inserirEvidencia('ev-acme-a61');
    const res = await chamar(`/api/v1/projects/${P}/evidence/ev-acme-a61`, { method: 'PATCH', headers: json(consultor), body: JSON.stringify({ evaluation_notes: 'Revisado pelo consultor', evaluation_status: 'partial' }) });
    const body = await res.json<any>();
    expect(res.status, JSON.stringify(body)).toBe(200);
    const ev = await evidencia('ev-acme-a61');
    expect(ev!.evaluation_notes).toBe('Revisado pelo consultor');
    expect(ev!.evaluation_status).toBe('partial');
    const log = await env.DB.prepare(`SELECT actor FROM audit_logs WHERE action = 'evidence.evaluation_updated' AND details LIKE '%ev-acme-a61%' ORDER BY created_at DESC`).first<any>();
    expect(log.actor).toBe('cons@ness.lat');
  });

  it('status fora do domínio é 400', async () => {
    await inserirEvidencia('ev-acme-a61');
    const res = await chamar(`/api/v1/projects/${P}/evidence/ev-acme-a61`, { method: 'PATCH', headers: json(consultor), body: JSON.stringify({ evaluation_status: 'aprovado' }) });
    expect(res.status).toBe(400);
  });

  // P1 (Codex): 'conforming' é a assinatura do Líder SGSI, não um veredito de nota.
  it("'conforming' é recusado pelo PATCH (vem da assinatura, não da nota)", async () => {
    await inserirEvidencia('ev-acme-a61');
    const res = await chamar(`/api/v1/projects/${P}/evidence/ev-acme-a61`, { method: 'PATCH', headers: json(consultor), body: JSON.stringify({ evaluation_status: 'conforming' }) });
    expect(res.status).toBe(400);
    expect((await evidencia('ev-acme-a61'))!.evaluation_status).not.toBe('conforming');
  });

  it('papel só-leitura (org_user) não altera avaliação (403)', async () => {
    await inserirEvidencia('ev-acme-a61');
    const res = await chamar(`/api/v1/projects/${P}/evidence/ev-acme-a61`, { method: 'PATCH', headers: json(cliente), body: JSON.stringify({ evaluation_notes: 'tentativa' }) });
    expect(res.status).toBe(403);
    expect((await evidencia('ev-acme-a61'))!.evaluation_notes).toBeNull();
  });
});

describe('4) trocar o controle zera a aprovação, declarado', () => {
  it('control_id null zera a aprovação, responde approvals_reset e registra na trilha', async () => {
    await inserirEvidencia('ev-acme-sgsi-capa', { ciso_approved_by: 'CISO: Ana Exemplo', ciso_approved_at: '2026-07-21T15:49:12Z' });
    const res = await chamar(`/api/v1/evidence/ev-acme-sgsi-capa`, { method: 'PUT', headers: json(consultor), body: JSON.stringify({ control_id: null }) });
    const body = await res.json<any>();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.relinked).toBe(true);
    expect(body.approvals_reset).toBe(true);
    const ev = await evidencia('ev-acme-sgsi-capa');
    expect(ev!.control_id).toBeNull();
    expect(ev!.ciso_approved_by).toBeNull();
    const log = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'evidence.relinked' AND details LIKE '%ev-acme-sgsi-capa%' ORDER BY created_at DESC`).first<any>();
    expect(String(log.details)).toMatch(/Ana Exemplo|assinaturas apagadas/i);
  });

  it('trocar o controle sem aprovação prévia não marca approvals_reset', async () => {
    await inserirEvidencia('ev-acme-sgsi-training');
    const res = await chamar(`/api/v1/evidence/ev-acme-sgsi-training`, { method: 'PUT', headers: json(consultor), body: JSON.stringify({ control_id: 'ctrl-a51' }) });
    const body = await res.json<any>();
    expect(res.status).toBe(200);
    expect(body.relinked).toBe(true);
    expect(body.approvals_reset).toBe(false);
  });
});
