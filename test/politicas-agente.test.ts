import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { ferramentaPermitida, TOOLS } from '../mcp-server-niso/src/ferramentas';
import { applySchema, workerEnv } from './helpers/d1';

// O agente cria a política temática e gera uma seção por vez; tudo cai em RASCUNHO. Publicar é decisão.
const P = { userId: 'u-pa', email: 'cons-pa@ness.lat', projectId: 'p-pa', concessaoId: 'c-pa' };
const AI = { run: async () => ({ choices: [{ message: { content: 'Texto da seção.' }, finish_reason: 'stop' }] }) };
const json = { 'Content-Type': 'application/json' };
const comoAgente = (caminho: string, init: RequestInit = {}) =>
  worker.fetch(new Request('http://localhost' + caminho, { ...init, headers: { ...json, ...(init.headers ?? {}) } }), { ...workerEnv(), AGENTE: P, AI } as never);

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-pa','Cliente Exemplo','ISO 27001','controller','Active','org_ness')`),
    env.DB.prepare(`INSERT OR IGNORE INTO projeto_modulos (project_id, modulo) VALUES ('p-pa', 'iso')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-pa','cons-pa@ness.lat','x','Cons','consultor')`),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-pa','Cons','cons-pa@ness.lat','consultor','Consultor')`),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-pa','u-pa','p-pa', datetime('now','+30 days'))`),
    env.DB.prepare(`INSERT OR IGNORE INTO requisito_fontes (id, nome, versao) VALUES ('iso27001:2022', 'ISO/IEC 27001', '2022')`),
    env.DB.prepare(`INSERT OR IGNORE INTO requisitos (id, fonte_id, referencia, titulo) VALUES ('iso27001:2022:A.8.24', 'iso27001:2022', 'A.8.24', 'Criptografia')`),
  ]);
});

describe('niso_criar_politica e niso_gerar_secao', () => {
  let id: string;
  it('criar pelo tema dá 201 em rascunho e repetir dá 409 com o id', async () => {
    const r = await comoAgente('/api/v1/projects/p-pa/politicas', { method: 'POST', body: JSON.stringify({ tema: 'POL-CRY' }) });
    expect(r.status, await r.clone().text()).toBe(201);
    id = (await r.json<{ id: string }>()).id;
    const dup = await comoAgente('/api/v1/projects/p-pa/politicas', { method: 'POST', body: JSON.stringify({ tema: 'POL-CRY' }) });
    expect(dup.status).toBe(409);
    expect((await dup.json<{ id: string }>()).id).toBe(id);
  });

  it('gerar a seção grava no rascunho, com corpo {} como o agente manda', async () => {
    const r = await comoAgente(`/api/v1/projects/p-pa/documentos/${id}/secoes/1/gerar`, { method: 'POST', body: '{}' });
    expect(r.status, await r.clone().text()).toBe(200);
    const t = await env.DB.prepare(`SELECT texto FROM documento_versoes WHERE documento_id = ? AND estado = 'rascunho'`).bind(id).first<{ texto: string }>();
    expect(t?.texto).toContain('Texto da seção.');
  });

  it('publicar sem os cabeçalhos da decisão é recusado', async () => {
    const r = await comoAgente(`/api/v1/projects/p-pa/documentos/${id}/versoes/1/publicar`, { method: 'POST' });
    expect(r.status).toBe(403);
    expect(await env.DB.prepare(`SELECT 1 FROM documento_versoes WHERE documento_id = ? AND estado = 'vigente'`).bind(id).first()).toBeNull();
  });

  it('as ferramentas existem para o consultor e o auditor não vê nenhuma', () => {
    const nomes = TOOLS.map((t) => t.name);
    for (const n of ['niso_criar_politica', 'niso_gerar_secao']) {
      expect(nomes).toContain(n);
      expect(ferramentaPermitida(n, 'consultant')).toBe(true);
      expect(ferramentaPermitida(n, 'auditor')).toBe(false);
    }
    for (const n of ['niso_generate_policy', 'niso_update_policy', 'niso_generate_policies_bulk']) expect(nomes).not.toContain(n);
  });
});
