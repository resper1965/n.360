import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';

/** Aceitar ou descartar vários itens da revisão de uma vez: o mesmo efeito do PUT item a item, sem senha. */
const P = 'idl-proj';
let consultor: Record<string, string>, cliente: Record<string, string>;
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request(`http://localhost/api/v1/projects/${P}/${caminho}`, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const decisaoDe = async (id: string) => (await env.DB.prepare('SELECT decisao FROM importacao_itens WHERE id = ?').bind(id).first<{ decisao: string }>())?.decisao;
type Res = { id: string; resultado: 'ok' | 'ignorado'; motivo?: string };

let lote = '';
beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27701', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'), ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-cons', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
  ]);
  await habilitarPrivacy(P);
  await concederModulos('u-cli', ['privacy']);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user', client_project_id: P });
  lote = ((await (await chamar(consultor, 'POST', 'importacoes')).json()) as { id: string }).id;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO importacao_arquivos (id, importacao_id, project_id, nome, mime, tamanho, r2_key, tipo, status) VALUES ('idl-a', ?, ?, 'f.csv', 'text/csv', 1, 'k', 'terceiros', 'processado')`).bind(lote, P),
    ...['i1', 'i2', 'i3', 'i4'].map((i) => env.DB.prepare(`INSERT INTO importacao_itens (id, importacao_id, arquivo_id, project_id, entidade, dados, decisao) VALUES (?, ?, 'idl-a', ?, 'terceiro', ?, 'pendente')`)
      .bind(`idl-${i}`, lote, P, JSON.stringify({ nome: `Fornecedor ${i}` }))),
    env.DB.prepare(`UPDATE importacao_itens SET decisao = 'gravado' WHERE id = 'idl-i4'`),
  ]);
});

describe('decidir em lote', () => {
  it('aceita os pendentes, ignora o já gravado e o que não é deste lote, com o motivo', async () => {
    const r = await chamar(consultor, 'POST', `importacoes/${lote}/itens/decidir`, { ids: ['idl-i1', 'idl-i2', 'idl-i4', 'outro-lote'], decisao: 'aceito' });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { aplicados: number; resultados: Res[] };
    expect(j.aplicados).toBe(2);
    expect(await decisaoDe('idl-i1')).toBe('aceito');
    expect(await decisaoDe('idl-i2')).toBe('aceito');
    expect(await decisaoDe('idl-i4')).toBe('gravado');
    expect(j.resultados.find((x) => x.id === 'idl-i4')).toMatchObject({ resultado: 'ignorado', motivo: 'Item já gravado' });
    expect(j.resultados.find((x) => x.id === 'outro-lote')).toMatchObject({ resultado: 'ignorado' });
  });

  it('descarta em lote', async () => {
    const r = await chamar(consultor, 'POST', `importacoes/${lote}/itens/decidir`, { ids: ['idl-i1', 'idl-i3'], decisao: 'descartado' });
    expect(((await r.json()) as { aplicados: number }).aplicados).toBe(2);
    expect(await decisaoDe('idl-i1')).toBe('descartado');
    expect(await decisaoDe('idl-i3')).toBe('descartado');
  });

  it('cliente leva 403; corpo inválido (vazio, mais de 200, decisão desconhecida) é 400; lote inexistente é 404', async () => {
    expect((await chamar(cliente, 'POST', `importacoes/${lote}/itens/decidir`, { ids: ['idl-i1'], decisao: 'aceito' })).status).toBe(403);
    expect((await chamar(consultor, 'POST', `importacoes/${lote}/itens/decidir`, { ids: [], decisao: 'aceito' })).status).toBe(400);
    expect((await chamar(consultor, 'POST', `importacoes/${lote}/itens/decidir`, { ids: Array.from({ length: 201 }, (_, i) => `x${i}`), decisao: 'aceito' })).status).toBe(400);
    expect((await chamar(consultor, 'POST', `importacoes/${lote}/itens/decidir`, { ids: ['idl-i1'], decisao: 'gravado' })).status).toBe(400);
    expect((await chamar(consultor, 'POST', 'importacoes/nao-existe/itens/decidir', { ids: ['idl-i1'], decisao: 'aceito' })).status).toBe(404);
  });
});
