import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';

/** Rotas dos modelos de fornecedor da consultoria e do ajuste do questionário no projeto (fatia 1, migration 0106). */
const P = 'fmr-proj';
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const M = '/api/v1/fornecedor-modelos';

let consultor: Record<string, string>, adminA: Record<string, string>, adminB: Record<string, string>, plataforma: Record<string, string>, orgAdmin: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('fmr-a', 'A', 'fmr-a'), ('fmr-b', 'B', 'fmr-b')`),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'LGPD', 'Controller', 'Active', 'fmr-a')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('fmr-cons', 'cons@a.teste', 'x', 'Cons', 'consultor', NULL, 'fmr-a'),
      ('fmr-adma', 'adm@a.teste', 'x', 'Adm A', 'consultoria_admin', NULL, 'fmr-a'),
      ('fmr-admb', 'adm@b.teste', 'x', 'Adm B', 'consultoria_admin', NULL, 'fmr-b'),
      ('fmr-pa', 'pa@ness.teste', 'x', 'PA', 'platform_admin', NULL, 'org_ness'),
      ('fmr-cli', 'cli@cliente.teste', 'x', 'Cli', 'org_admin', ?1, 'fmr-a')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-fmr', ?, 'Cons', 'cons@a.teste', 'consultor', 'Consultor')`).bind(P),
  ]);
  await habilitarPrivacy(P);
  await concederModulos(['fmr-cons', 'fmr-cli'], ['privacy']);
  consultor = await sessionFor({ id: 'fmr-cons', email: 'cons@a.teste', role: 'consultor', org_id: 'fmr-a' });
  adminA = await sessionFor({ id: 'fmr-adma', email: 'adm@a.teste', role: 'consultoria_admin', org_id: 'fmr-a' });
  adminB = await sessionFor({ id: 'fmr-admb', email: 'adm@b.teste', role: 'consultoria_admin', org_id: 'fmr-b' });
  plataforma = await sessionFor({ id: 'fmr-pa', email: 'pa@ness.teste', role: 'platform_admin', org_id: 'org_ness' });
  orgAdmin = await sessionFor({ id: 'fmr-cli', email: 'cli@cliente.teste', role: 'org_admin', client_project_id: P, org_id: 'fmr-a' });
});

type Modelos = { modelos: { tipo: string; prazo_meses: number; perguntas: { id: string; texto: string }[] }[]; pode_editar: boolean };
const ler = async (h: Record<string, string>) => (await (await chamar(h, 'GET', M)).json()) as Modelos;

describe('modelos da consultoria', () => {
  it('o consultor lê e não grava; o admin da consultoria grava na própria; o tipo fora da lista é 400', async () => {
    const r = await ler(consultor);
    expect(r.pode_editar).toBe(false);
    expect(r.modelos.map((m) => m.tipo)).toEqual(['critico', 'medio', 'pequeno', 'grande_provedor']);
    expect((await chamar(consultor, 'PUT', `${M}/critico`, { prazo_meses: 6 })).status).toBe(403);
    expect((await chamar(adminA, 'PUT', `${M}/critico`, { prazo_meses: 6 })).status).toBe(200);
    expect((await chamar(adminA, 'PUT', `${M}/enorme`, { prazo_meses: 6 })).status).toBe(400);
    expect((await chamar(adminA, 'PUT', `${M}/critico`, { prazo_meses: 61 })).status).toBe(400);
    expect((await ler(adminA)).modelos[0]).toMatchObject({ tipo: 'critico', prazo_meses: 6 });
    const nova = await chamar(adminA, 'POST', `${M}/critico/perguntas`, { tema: 'Auditoria', texto: 'Há relatório de auditoria do último ano?' });
    expect(nova.status).toBe(201);
  });

  it('o admin de outra consultoria não alcança a pergunta desta; o X-Org-Id só vale para o platform_admin', async () => {
    const pergunta = (await ler(adminA)).modelos[0].perguntas[0].id;
    expect((await chamar(adminB, 'PUT', `${M}/critico/perguntas/${pergunta}`, { ativa: false })).status).toBe(404);
    expect((await chamar({ ...adminB, 'X-Org-Id': 'fmr-a' }, 'PUT', `${M}/critico/perguntas/${pergunta}`, { ativa: false })).status).not.toBe(200);
    expect((await chamar({ ...plataforma, 'X-Org-Id': 'fmr-a' }, 'PUT', `${M}/critico/perguntas/${pergunta}`, { texto: 'Revisada pela plataforma' })).status).toBe(200);
    expect((await ler(adminA)).modelos[0].perguntas[0].texto).toBe('Revisada pela plataforma');
  });

  it('o administrador do cliente não lê os modelos da consultoria, mas lê o questionário do projeto', async () => {
    expect((await chamar(orgAdmin, 'GET', M)).status).toBe(403);
    const r = await chamar(orgAdmin, 'GET', `/api/v1/projects/${P}/homologacoes/perguntas?tipo=critico`);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { perguntas: { texto: string }[] }).perguntas[0].texto).toBe('Revisada pela plataforma');
  });
});

describe('ajuste do questionário no projeto', () => {
  const ajuste = (h: Record<string, string>, id: string, ativa: boolean) => chamar(h, 'PUT', `/api/v1/projects/${P}/homologacoes/perguntas/modelo/${id}`, { ativa });
  it('a equipe desliga e religa a pergunta do modelo; o org_admin recebe 403; pergunta de outra consultoria é 404', async () => {
    const r = (await (await chamar(consultor, 'GET', `/api/v1/projects/${P}/homologacoes/perguntas?tipo=medio`)).json()) as { perguntas: { id: string; usada: boolean }[] };
    const alvo = r.perguntas[0].id;
    expect((await ajuste(orgAdmin, alvo, false)).status).toBe(403);
    expect((await ajuste(consultor, alvo, false)).status).toBe(200);
    const depois = (await (await chamar(consultor, 'GET', `/api/v1/projects/${P}/homologacoes/perguntas?tipo=medio`)).json()) as { perguntas: { id: string; usada: boolean }[] };
    expect(depois.perguntas.find((p) => p.id === alvo)!.usada).toBe(false);
    const deB = (await ler(adminB)).modelos[1].perguntas[0].id;
    expect((await ajuste(consultor, deB, false)).status).toBe(404);
    expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/homologacoes/perguntas`, { tema: 'T', texto: 'Só do pequeno', tipo: 'pequeno' })).status).toBe(201);
    expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/homologacoes/perguntas`, { tema: 'T', texto: 'X', tipo: 'grande_provedor' })).status).toBe(400);
  });
});
