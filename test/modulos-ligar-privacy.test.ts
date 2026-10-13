// Ligar o n.privacy num projeto que já tem trabalho do n.iso traz esse trabalho para o modelo comum (partes, vínculos,
// documentos), com as mesmas pontes repetíveis dos botões manuais. Falha numa ponte não impede o módulo de ligar.
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, e: any = workerEnv()) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), e);
const ligar = (p: string, modulo: string, habilitado: boolean, e?: any) => chamar(cadm, 'PUT', `/api/v1/projects/${p}/modulos/${modulo}`, { habilitado }, e);
const contar = async (sql: string, ...b: unknown[]) => (await env.DB.prepare(sql).bind(...b).first<{ n: number }>())!.n;

let cadm: Record<string, string>;

const semear = (p: string) => [
  env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(p),
  env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES (?, 'Ana Gestora', 'ana@exemplo.com.br', 'executivo', 'CEO')`).bind(p),
  env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES (?, 'Davi Encarregado', 'davi@exemplo.com.br', 'executivo', 'DPO')`).bind(p),
  env.DB.prepare(`INSERT INTO stakeholders (project_id, name) VALUES (?, 'Agência Reguladora')`).bind(p),
  env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, description) VALUES (?, ?, 'ISO 27001', 'A.5.1 Política', 'Implemented', 'Texto v2')`).bind(`${p}-c1`, p),
  env.DB.prepare(`INSERT INTO policy_versions (project_id, control_id, version, policy_text, created_by) VALUES (?, ?, 1, 'Texto v1', 'autor@exemplo.com.br')`).bind(p, `${p}-c1`),
  env.DB.prepare(`INSERT INTO evidence (id, control_id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES (?, ?, ?, 'politica.pdf', 'k', 'h', 'x@exemplo.com.br')`).bind(`${p}-ev`, `${p}-c1`, p),
];

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-ca', 'ca@ness.lat', 'x', 'C', 'consultoria_admin', 'org_ness')`),
    ...semear('pl1'), ...semear('pl2'), ...semear('pl3'),
    // o contrato sobe DEPOIS dos projetos: projeto novo já nasce com o que a organização contratou (gatilho da 0060)
    env.DB.prepare(`UPDATE organizations SET modulos_contratados = '["iso","privacy"]' WHERE id = 'org_ness'`),
  ]);
  cadm = await sessionFor({ id: 'u-ca', email: 'ca@ness.lat', role: 'consultoria_admin' });
  // fornecedor pelo caminho de hoje: já nasce parte (organização com vínculo terceiro)
  expect((await chamar(cadm, 'POST', '/api/v1/projects/pl1/vendors', { name: 'Fornecedor Nuvem' })).status).toBe(201);
});

describe('ligar o n.privacy traz o que o n.iso já tem', () => {
  it('partes, vínculos (encarregado incluso), documento da política e a evidência ligada a ele', async () => {
    const r = await ligar('pl1', 'privacy', true);
    expect(r.status).toBe(200);
    const corpo = await r.json() as { ok: boolean; importados: { partes: number; documentos: number }; avisos: string[] };
    expect(corpo).toEqual({ ok: true, importados: { partes: 3, documentos: 1 }, avisos: [] });

    const partes = (await env.DB.prepare(`SELECT nome, tipo FROM partes WHERE project_id = 'pl1' ORDER BY nome`).all<{ nome: string; tipo: string }>()).results;
    expect(partes.map((p) => p.nome)).toEqual(['Agência Reguladora', 'Ana Gestora', 'Davi Encarregado', 'Fornecedor Nuvem']);
    const papeis = (await env.DB.prepare(
      `SELECT p.nome, v.papel FROM parte_vinculos v JOIN partes p ON p.id = v.parte_id WHERE v.project_id = 'pl1' AND v.alvo_tipo = 'projeto' ORDER BY p.nome`
    ).all<{ nome: string; papel: string }>()).results;
    expect(papeis).toEqual([
      { nome: 'Agência Reguladora', papel: 'parte_interessada' },
      { nome: 'Ana Gestora', papel: 'responsavel' },
      { nome: 'Davi Encarregado', papel: 'encarregado' },
      { nome: 'Fornecedor Nuvem', papel: 'terceiro' },
    ]);

    const doc = await env.DB.prepare(`SELECT id FROM documentos WHERE project_id = 'pl1' AND origem_control_id = 'pl1-c1'`).first<{ id: string }>();
    expect(doc).toBeTruthy();
    expect(await contar(`SELECT COUNT(*) AS n FROM evidence WHERE id = 'pl1-ev' AND documento_id = ?`, doc!.id)).toBe(1);

    // a trilha das pontes, no projeto certo
    for (const acao of ['partes.importadas', 'partes.conciliadas', 'documentos.importados']) {
      expect(await contar(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = ? AND project_id = 'pl1'`, acao)).toBe(1);
    }
    // nada vazou para os outros projetos
    expect(await contar(`SELECT COUNT(*) AS n FROM partes WHERE project_id IN ('pl2', 'pl3')`)).toBe(0);
    expect(await contar(`SELECT COUNT(*) AS n FROM documentos WHERE project_id IN ('pl2', 'pl3')`)).toBe(0);
    expect(await contar(`SELECT COUNT(*) AS n FROM evidence WHERE project_id IN ('pl2', 'pl3') AND documento_id IS NOT NULL`)).toBe(0);
  });

  it('desligar e religar não duplica nada', async () => {
    const antes = await Promise.all([
      contar(`SELECT COUNT(*) AS n FROM partes WHERE project_id = 'pl1'`),
      contar(`SELECT COUNT(*) AS n FROM parte_vinculos WHERE project_id = 'pl1'`),
      contar(`SELECT COUNT(*) AS n FROM documentos WHERE project_id = 'pl1'`),
    ]);
    expect((await ligar('pl1', 'privacy', false)).status).toBe(200);
    const r = await ligar('pl1', 'privacy', true);
    expect(await r.json()).toEqual({ ok: true, importados: { partes: 0, documentos: 0 }, avisos: [] });
    expect(await Promise.all([
      contar(`SELECT COUNT(*) AS n FROM partes WHERE project_id = 'pl1'`),
      contar(`SELECT COUNT(*) AS n FROM parte_vinculos WHERE project_id = 'pl1'`),
      contar(`SELECT COUNT(*) AS n FROM documentos WHERE project_id = 'pl1'`),
    ])).toEqual(antes);
  });

  it('ligar o n.iso não roda as pontes; o privacy já ligado também não', async () => {
    expect((await ligar('pl2', 'iso', false)).status).toBe(409); // único módulo
    expect(await (await ligar('pl2', 'iso', true)).json()).toEqual({ ok: true });
    expect(await (await ligar('pl1', 'privacy', true)).json()).toEqual({ ok: true });
    expect(await contar(`SELECT COUNT(*) AS n FROM partes WHERE project_id = 'pl2'`)).toBe(0);
  });

  it('uma ponte que falha não impede o módulo de ligar: as outras rodam e a resposta traz o aviso', async () => {
    const db = new Proxy(env.DB, {
      get(alvo, prop) {
        if (prop === 'prepare') {
          return (sql: string) => {
            if (sql.includes('FROM stakeholders WHERE project_id')) throw new Error('falha injetada');
            return alvo.prepare(sql);
          };
        }
        const v = (alvo as any)[prop];
        return typeof v === 'function' ? v.bind(alvo) : v;
      },
    });
    const r = await ligar('pl3', 'privacy', true, { ...workerEnv(), DB: db });
    expect(r.status).toBe(200);
    const corpo = await r.json() as { ok: boolean; importados: { partes: number; documentos: number }; avisos: string[] };
    expect(corpo.ok).toBe(true);
    expect(corpo.importados).toEqual({ partes: 0, documentos: 1 });
    expect(corpo.avisos).toHaveLength(1);
    expect(corpo.avisos[0]).toMatch(/pessoas e organizações/);
    expect(JSON.stringify(corpo)).not.toContain('falha injetada');
    expect(await contar(`SELECT COUNT(*) AS n FROM projeto_modulos WHERE project_id = 'pl3' AND modulo = 'privacy'`)).toBe(1);
  });
});

describe('importarDocumentos liga a evidência do controle ao documento (botão manual também)', () => {
  it('evidência nova num controle que já tem documento é ligada na reimportação', async () => {
    const doc = await env.DB.prepare(`SELECT id FROM documentos WHERE origem_control_id = 'pl1-c1'`).first<{ id: string }>();
    await env.DB.prepare(`INSERT INTO evidence (id, control_id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES ('pl1-ev2', 'pl1-c1', 'pl1', 'b.pdf', 'k2', 'h2', 'x@exemplo.com.br')`).run();
    const r = await chamar(cadm, 'POST', '/api/v1/projects/pl1/documentos/importar');
    expect(r.status).toBe(200);
    expect(await contar(`SELECT COUNT(*) AS n FROM evidence WHERE project_id = 'pl1' AND control_id = 'pl1-c1' AND documento_id = ?`, doc!.id)).toBe(2);
  });
});
