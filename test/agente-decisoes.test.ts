// test/agente-decisoes.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv, habilitarPrivacy } from './helpers/d1';

const P = { userId: 'u-dec', email: 'cons@ness.lat', projectId: 'p-dec', concessaoId: 'c-dec' };
const json = { 'Content-Type': 'application/json' };
const DECISAO = (ferramenta: string, motivo = 'pedido do consultor') =>
  ({ 'X-Agente-Ferramenta': ferramenta, 'X-Agente-Confirmado': '1', 'X-Agente-Motivo': encodeURIComponent(motivo) });
const comoAgente = (metodo: string, caminho: string, headers: Record<string, string> = {}, corpo?: unknown) =>
  worker.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }),
    { ...workerEnv(), AGENTE: P } as any);
const comoPessoa = (metodo: string, caminho: string, headers: Record<string, string>) =>
  worker.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers } }), workerEnv());

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-dec','Cliente','ISO 27001','controller','Active','org_ness')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-dec','cons@ness.lat','x','Cons','consultor','org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-dec','Cons','cons@ness.lat','consultor','Consultor')`),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-dec','u-dec','p-dec', datetime('now','+30 days'))`),
    env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em, risco_titular, status) VALUES ('in-1','p-dec','IN-2026-0001','Vazamento','2026-10-01','baixo','avaliado'), ('in-2','p-dec','IN-2026-0002','Outro','2026-10-01','baixo','avaliado')`),
    env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, status) VALUES ('rk-1','p-dec','Servidor','Queda','Open')`),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('ro-dec','p-dec','Folha')`),
    env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, status, ropa_id) VALUES ('rk-at','p-dec','Folha','Vazamento','Open','ro-dec')`),
    env.DB.prepare(`INSERT INTO corrective_actions (id, project_id, title, status) VALUES ('ca-1','p-dec','Backup','Open')`),
  ]);
  await habilitarPrivacy('p-dec');
  await env.DB.prepare(`INSERT OR IGNORE INTO usuario_modulos (user_id, modulo) VALUES ('u-dec','iso'), ('u-dec','privacy')`).run();
});

describe('porta de decisão do agente', () => {
  const encerrar = '/api/v1/projects/p-dec/incidentes/in-1/encerrar';

  it('sem a ferramenta, sem confirmação ou sem motivo: 403 citando a ferramenta', async () => {
    const sem = await comoAgente('POST', encerrar, { 'X-Agente-Confirmado': '1' });
    expect(sem.status).toBe(403);
    expect((await sem.json<any>()).error).toContain('niso_encerrar_incidente');
    expect((await comoAgente('POST', encerrar, { ...DECISAO('niso_encerrar_incidente'), 'X-Agente-Confirmado': '' })).status).toBe(403);
    expect((await comoAgente('POST', encerrar, { ...DECISAO('niso_encerrar_incidente'), 'X-Agente-Motivo': '' })).status).toBe(403);
    expect((await comoAgente('POST', encerrar, DECISAO('niso_decidir_passo'))).status).toBe(403);
    expect((await comoAgente('POST', encerrar, DECISAO('niso_encerrar_incidente', 'x'.repeat(501)))).status).toBe(403);
  });

  it('com a ferramenta, a confirmação e o motivo: a rota roda e a trilha guarda o motivo', async () => {
    const r = await comoAgente('POST', encerrar, DECISAO('niso_encerrar_incidente', 'cliente confirmou fim do tratamento'));
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await env.DB.prepare(`SELECT status FROM incidentes WHERE id='in-1'`).first<any>()).status).toBe('encerrado');
    const t = await env.DB.prepare(`SELECT actor, details, project_id FROM audit_logs WHERE action='agente.decisao' ORDER BY created_at DESC LIMIT 1`).first<any>();
    expect(t.actor).toMatch(/^agente de cons@ness\.lat/);
    expect(t.details).toContain('niso_encerrar_incidente');
    expect(t.details).toContain('cliente confirmou fim do tratamento');
    expect(t.project_id).toBe('p-dec');
  });

  it('ato do cliente segue recusado mesmo com ferramenta, confirmação e motivo', async () => {
    const r = await comoAgente('PUT', '/api/v1/risks/rk-1', DECISAO('niso_concluir_acao'), { status: 'Accepted' });
    expect(r.status).toBe(403);
    expect((await comoAgente('POST', '/api/v1/pedidos/lote', DECISAO('niso_concluir_acao'), {})).status).toBe(403);
  });

  it('cabeçalhos do agente numa requisição de pessoa não fazem nada', async () => {
    const r = await comoPessoa('POST', '/api/v1/projects/p-dec/incidentes/in-2/encerrar', DECISAO('niso_encerrar_incidente'));
    expect(r.status).toBe(401);
  });

  it('concluir ação: só pela decisão; editar sem fechar segue livre', async () => {
    expect((await comoAgente('PUT', '/api/v1/capa/ca-1', {}, { title: 'Backup', status: 'Closed' })).status).toBe(403);
    expect((await comoAgente('PUT', '/api/v1/capa/ca-1', {}, { title: 'Backup', status: 'In Progress' })).status).toBe(200);
    expect((await comoAgente('PUT', '/api/v1/capa/ca-1', {}, { title: 'Revisar backup', status: 'In Progress' })).status).toBe(200);
    const r = await comoAgente('PUT', '/api/v1/capa/ca-1', DECISAO('niso_concluir_acao', 'evidência do backup recebida'), { title: 'Backup', status: 'Closed' });
    expect(r.status, await r.clone().text()).toBe(200);
  });

  it('apagar risco da atividade: com confirmação, como apagar hoje', async () => {
    expect((await comoAgente('DELETE', '/api/v1/risks/rk-at')).status).toBe(403);
    expect((await comoAgente('DELETE', '/api/v1/risks/rk-at', { 'X-Agente-Confirmado': '1' })).status).toBe(200);
  });

  it('revogar aprovação e eliminar dado do titular seguem recusados mesmo com a decisão', async () => {
    expect((await comoAgente('POST', '/api/v1/projects/p-dec/ropa/ro-dec/revoke-approval', DECISAO('niso_concluir_acao'), {})).status).toBe(403);
    expect((await comoAgente('POST', '/api/v1/projects/p-dec/data-subject/erase', DECISAO('niso_concluir_acao'), {})).status).toBe(403);
  });
});
