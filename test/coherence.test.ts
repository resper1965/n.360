import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor } from './helpers/d1';

const PROJ = 'proj-coer';

function testEnv(extra: Record<string, unknown> = {}) {
  return { ...env, AI: { run: async () => ({ response: 'stub' }) }, ...extra } as any;
}

async function req(path: string, init: RequestInit = {}) {
  return worker.fetch(new Request(`http://localhost${path}`, init), testEnv());
}

describe('GET /api/v1/projects/:id/coherence', () => {
  let admin: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('password123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(PROJ, 'Cliente Coerência', 'ISO 27001', 'controller', 'Active'),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES (?,?,?,?,?,?)`)
        .bind('usr-admin-coer', 'admin-coer@ness.io', senha, 'Admin', 'platform_admin', null),

      // R1: risco em mitigação, aberto, sem controle vinculado.
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, treatment, status, control_id) VALUES (?,?,?,?,?,?,?)`)
        .bind('risk-sem-controle', PROJ, 'Banco de dados', 'Vazamento', 'Mitigate', 'Open', null),
      // Risco da atividade de tratamento (n.privacy, 0073): mitigação sem controle Annex A não é erro, a medida vive no RoPA.
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('ropa-coer', ?, 'Folha')`).bind(PROJ),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, treatment, status, control_id, ropa_id) VALUES (?,?,?,?,?,?,?,?)`)
        .bind('risk-privacidade', PROJ, 'Folha', 'Uso indevido', 'Mitigate', 'Open', null, 'ropa-coer'),

      // R3: controle aprovado sem evidência (mas com política, pra isolar a regra).
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, description) VALUES (?,?,?,?,?,?)`)
        .bind('ctrl-sem-evidencia', PROJ, 'ISO 27001:2022', 'Controle de acesso', 'Approved', 'Nota do controle'),
      env.DB.prepare(`INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES ('pv-coer', ?, 'ctrl-sem-evidencia', 1, 'Política antiga', 'x')`).bind(PROJ),

      // R4: controle aprovado sem política (a nota do controle não conta), mas com evidência, pra isolar a regra.
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, description) VALUES (?,?,?,?,?,?)`)
        .bind('ctrl-sem-politica', PROJ, 'ISO 27001:2022', 'Gestão de fornecedores', 'Approved', 'Só nota'),
      env.DB.prepare(
        `INSERT INTO evidence (id, project_id, control_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, evaluation_status)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).bind('ev-sem-politica', PROJ, 'ctrl-sem-politica', 'a.md', 'k/a.md', 'aa', 'text/markdown', 2, 'x@y', 'pending'),

      // Controle limpo: aprovado, com evidência e coberto por política vigente — não deve gerar nenhum issue.
      env.DB.prepare(`INSERT OR IGNORE INTO requisito_fontes (id, nome, versao) VALUES ('iso27001:2022', 'ISO/IEC 27001', '2022')`),
      env.DB.prepare(`INSERT OR IGNORE INTO requisitos (id, fonte_id, referencia, titulo) VALUES ('rq-coer-backup', 'iso27001:2022', 'A.8.13', 'Backup')`),
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, description, requisito_id) VALUES (?,?,?,?,?,?,?)`)
        .bind('ctrl-ok', PROJ, 'ISO 27001:2022', 'Backup', 'Approved', null, 'rq-coer-backup'),
      env.DB.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo, status) VALUES ('doc-coer', ?, 'politica', 'POL-BKP-001 Backup', 'vigente')`).bind(PROJ),
      env.DB.prepare(`INSERT INTO documento_requisitos (documento_id, requisito_id, project_id) VALUES ('doc-coer', 'rq-coer-backup', ?)`).bind(PROJ),
      env.DB.prepare(
        `INSERT INTO evidence (id, project_id, control_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, evaluation_status)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).bind('ev-ok', PROJ, 'ctrl-ok', 'b.md', 'k/b.md', 'bb', 'text/markdown', 2, 'x@y', 'pending'),
    ]);
    admin = await sessionFor({ id: 'usr-admin-coer', email: 'admin-coer@ness.io', role: 'platform_admin' });
  });

  it('detecta as 3 regras e ignora o controle sem pendências', async () => {
    const res = await req(`/api/v1/projects/${PROJ}/coherence`, { headers: admin });
    expect(res.status).toBe(200);
    const body = await res.json<any>();

    expect(body.ok).toBe(false);
    const byRule = (rule: string) => body.issues.filter((i: any) => i.rule === rule);

    expect(byRule('risk_without_control')).toHaveLength(1);
    expect(byRule('risk_without_control')[0].id).toBe('risk-sem-controle');

    expect(byRule('control_approved_without_evidence')).toHaveLength(1);
    expect(byRule('control_approved_without_evidence')[0].id).toBe('ctrl-sem-evidencia');

    expect(byRule('control_approved_without_policy')).toHaveLength(1);
    expect(byRule('control_approved_without_policy')[0].id).toBe('ctrl-sem-politica');

    expect(body.issues.some((i: any) => i.id === 'ctrl-ok')).toBe(false);
  });

  it('projeto sem nenhuma pendência devolve ok:true e issues vazio', async () => {
    const outro = 'proj-coer-limpo';
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind(outro, 'Cliente Limpo', 'ISO 27001', 'controller', 'Active'),
    ]);
    const res = await req(`/api/v1/projects/${outro}/coherence`, { headers: admin });
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body).toMatchObject({ ok: true, issue_count: 0, issues: [] });
  });
});
