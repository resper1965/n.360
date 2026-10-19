import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';

/** Criticidade do fornecedor pela rota: o nível vem do servidor, o tipo segue o nível (grande_provedor fica), o histórico é append-only. */
const P = 'crit-proj';
const base = `/api/v1/projects/${P}/terceiros`;

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;

const todosBaixo = { impacto: 'baixo', exclusividade: 'varias_alternativas', risco_financeiro: 'baixo', conformidade: 'sem_regulamentacao', risco_reputacional: 'baixo' };
const algoAlto = { ...todosBaixo, risco_reputacional: 'alto' };

let consultor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente Crit', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-crit', 'crit@ness.lat', 'x', 'Crit', 'consultor', NULL, 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-crit', ?, 'Crit', 'crit@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('cr-a', ?1, 'organizacao', 'Fornecedor A'), ('cr-b', ?1, 'organizacao', 'Nuvem B'), ('cr-p', ?1, 'pessoa', 'Pessoa')`).bind(P),
  ]);
  await habilitarPrivacy(P);
  await concederModulos('u-crit', ['privacy']);
  consultor = await sessionFor({ id: 'u-crit', email: 'crit@ness.lat', role: 'consultor' });
});

describe('criticidade do fornecedor', () => {
  it('sem avaliação: atual é null e o histórico vazio', async () => {
    const r = await json<{ atual: unknown; historico: unknown[] }>(await chamar(consultor, 'GET', `${base}/cr-a/criticidades`));
    expect(r).toEqual({ atual: null, historico: [] });
  });

  it('todos os blocos baixos dão Baixo e tipo pequeno', async () => {
    const r = await chamar(consultor, 'POST', `${base}/cr-a/criticidades`, todosBaixo);
    expect(r.status).toBe(201);
    expect(await json<{ nivel: string; tipo: string }>(r)).toMatchObject({ nivel: 'baixo', tipo: 'pequeno' });
    const lista = await json<{ terceiro_tipo: string; metodo: string }[]>(await chamar(consultor, 'GET', base));
    expect(lista.find((t) => t.terceiro_tipo === 'pequeno')).toBeTruthy();
  });

  it('um bloco Alto torna o nível Alto e o tipo crítico (método auditoria)', async () => {
    const r = await chamar(consultor, 'POST', `${base}/cr-a/criticidades`, algoAlto);
    expect(await json<{ nivel: string; tipo: string }>(r)).toMatchObject({ nivel: 'alto', tipo: 'critico' });
    const ficha = await json<{ terceiro_tipo: string; metodo: string }>(await chamar(consultor, 'GET', `${base}/cr-a`));
    expect(ficha).toMatchObject({ terceiro_tipo: 'critico', metodo: 'auditoria' });
  });

  it('o histórico é append-only e o atual é o mais recente', async () => {
    const r = await json<{ atual: { nivel: string }; historico: { nivel: string }[] }>(await chamar(consultor, 'GET', `${base}/cr-a/criticidades`));
    expect(r.historico.map((h) => h.nivel)).toEqual(['alto', 'baixo']);
    expect(r.atual.nivel).toBe('alto');
  });

  it('grande_provedor é mantido: a avaliação grava o nível, mas não troca o tipo', async () => {
    expect((await chamar(consultor, 'PUT', `${base}/cr-b/tipo`, { terceiro_tipo: 'grande_provedor' })).status).toBe(200);
    const r = await chamar(consultor, 'POST', `${base}/cr-b/criticidades`, algoAlto);
    expect(await json<{ nivel: string; tipo: string }>(r)).toMatchObject({ nivel: 'alto', tipo: 'grande_provedor' });
    const ficha = await json<{ terceiro_tipo: string }>(await chamar(consultor, 'GET', `${base}/cr-b`));
    expect(ficha.terceiro_tipo).toBe('grande_provedor');
  });

  it('o nível vindo no corpo é recusado (o servidor deriva)', async () => {
    expect((await chamar(consultor, 'POST', `${base}/cr-a/criticidades`, { ...todosBaixo, nivel: 'baixo' })).status).toBe(400);
  });

  it('resposta fora da lista é 400, e a faltando também', async () => {
    expect((await chamar(consultor, 'POST', `${base}/cr-a/criticidades`, { ...todosBaixo, impacto: 'enorme' })).status).toBe(400);
    const { impacto: _omitido, ...sem } = todosBaixo;
    expect((await chamar(consultor, 'POST', `${base}/cr-a/criticidades`, sem)).status).toBe(400);
  });

  it('pessoa não é terceiro: 400; parte inexistente: 404', async () => {
    expect((await chamar(consultor, 'POST', `${base}/cr-p/criticidades`, todosBaixo)).status).toBe(400);
    expect((await chamar(consultor, 'POST', `${base}/nao-existe/criticidades`, todosBaixo)).status).toBe(404);
  });
});
