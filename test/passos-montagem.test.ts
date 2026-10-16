import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

// Montagem da Bancada: as rotas existem nos caminhos finais, exigem sessão e o agente MCP não conclui passo.
// Só o copiloto segue em esqueleto (501) até o pacote D.
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string> = {}, ambiente: object = {}) =>
  worker.fetch(new Request(`http://localhost${caminho}`, { method: metodo, headers: { ...json, ...headers }, body: metodo === 'GET' || metodo === 'DELETE' ? undefined : '{}' }),
    { ...workerEnv(), ...ambiente } as never);
const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' };

describe('Bancada: montagem das rotas', () => {
  let adm: Record<string, string>;
  let leitura: Record<string, string>;
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','A','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-a','a@x.com','x','A','org_admin','p-a'), ('u-ro','ro@x.com','x','RO','org_user','p-a'), ('u-cons','cons@ness.lat','x','Cons','consultor',NULL)`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-a','Cons','cons@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-1','u-cons','p-a', datetime('now','+30 days'))`),
    ]);
    adm = await sessionFor({ id: 'u-a', email: 'a@x.com', role: 'org_admin', client_project_id: 'p-a' });
    leitura = await sessionFor({ id: 'u-ro', email: 'ro@x.com', role: 'org_user', client_project_id: 'p-a' });
  });

  it('o catálogo exige sessão', async () => {
    expect((await chamar('GET', '/api/v1/passos/catalogo')).status).toBe(401);
    expect((await chamar('GET', '/api/v1/passos/catalogo', adm)).status).toBe(200);
  });
  it('os caminhos finais existem (nem 404 de rota nem 501) para quem pode; o copiloto segue 501', async () => {
    for (const [m, c] of [['GET', '/bancada'], ['GET', '/passos/p3_3'], ['PUT', '/passos/p3_3/campos'], ['PATCH', '/passos/p3_3'], ['POST', '/passos/p3_3/concluir'],
      ['DELETE', '/bancada/fases/3/situacao-antiga']]) {
      const st = (await chamar(m, `/api/v1/projects/p-a${c}`, adm)).status;
      expect([501, 404], `${m} ${c}`).not.toContain(st);
    }
    expect((await chamar('POST', '/api/v1/projects/p-a/passos/p3_3/copiloto/rascunhar-campo', adm)).status).toBe(501);
  });
  it('org_user preenche e conclui (paridade com marcar item), mas não bloqueia', async () => {
    expect((await chamar('PUT', '/api/v1/projects/p-a/passos/p3_3/campos', leitura)).status).toBe(400); // passou do RBAC; o corpo vazio é que não vale
    expect((await chamar('POST', '/api/v1/projects/p-a/passos/p3_3/concluir', leitura)).status).toBe(409); // passou do RBAC; o critério ainda não passa
    expect((await chamar('POST', '/api/v1/projects/p-a/passos/p3_3/bloquear', leitura)).status).toBe(403);
  });
  it('o agente MCP grava campos, mas não conclui, reabre, bloqueia nem pede rascunho', async () => {
    expect((await chamar('PUT', '/api/v1/projects/p-a/passos/p3_3/campos', {}, { AGENTE })).status).toBe(400); // passou do corte do agente
    for (const c of ['concluir', 'reabrir', 'bloquear', 'desbloquear', 'copiloto/rascunhar-campo']) {
      expect((await chamar('POST', `/api/v1/projects/p-a/passos/p3_3/${c}`, {}, { AGENTE })).status, c).toBe(403);
    }
    expect((await chamar('DELETE', '/api/v1/projects/p-a/passos/p3_3/anotacao-anterior', {}, { AGENTE })).status).toBe(403);
    expect((await chamar('DELETE', '/api/v1/projects/p-a/bancada/fases/3/situacao-antiga', {}, { AGENTE })).status).toBe(403);
  });
});
