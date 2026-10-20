import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * B3 (decisão de 20/10/2026): o DPA do fornecedor é o documento ligado com papel `dpa` (`documento_partes`), a mesma fonte da
 * pendência do n.privacy. `dpa_signed` e `dpa_url` do perfil ficam como histórico ("declarado, sem documento") e não contam ponto.
 */
const P = 'dpa-iso';
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());

type Linha = { id: string | null; parte_id: string; name: string; trust_score: number | null; dpa: number; dpa_declarado: number; dpa_url_antigo: string | null; dpa_documentos: { id: string; titulo: string }[] };
let admin: Record<string, string>;
const lista = async () => ((await (await chamar(admin, 'GET', `/api/v1/projects/${P}/vendors`)).json()) as { vendors: Linha[] }).vendors;
const linha = async (parte: string) => (await lista()).find((v) => v.parte_id === parte)!;
const perfil = (parte: string) => env.DB.prepare('SELECT id, trust_score, diligence_level, dpa_signed, dpa_url FROM vendors WHERE parte_id = ?').bind(parte)
  .first<{ id: string; trust_score: number; diligence_level: string; dpa_signed: number; dpa_url: string | null }>();
// PUT sem mudar nada (o legado vem no corpo, como a tela antiga mandava): só o índice é recalculado
const editar = async (parte: string, extra: object = {}) => {
  const v = (await perfil(parte))!;
  const r = await chamar(admin, 'PUT', `/api/v1/vendors/${v.id}`, { name: 'Nuvem Legada', has_iso27001: 1, dpa_signed: 1, dpa_url: 'https://dpa.exemplo.com', ...extra });
  expect(r.status).toBe(200);
  return (await r.json()) as { trust_score: number };
};

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('dpa-leg', ?1, 'organizacao', 'Nuvem Legada'), ('dpa-sem', ?1, 'organizacao', 'Sem Nada'), ('dpa-doc', ?1, 'organizacao', 'Com Documento')`).bind(P),
    // o vínculo de terceiro faz o gatilho criar o perfil de segurança
    env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('dv1', ?1, 'dpa-leg', 'terceiro', 'projeto', ?1), ('dv2', ?1, 'dpa-sem', 'terceiro', 'projeto', ?1), ('dv3', ?1, 'dpa-doc', 'terceiro', 'projeto', ?1)`).bind(P),
    env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo) VALUES ('dpa-d1', ?1, 'DPA Nuvem'), ('dpa-d2', ?1, 'DPA Outro')`).bind(P),
    env.DB.prepare(`INSERT INTO documento_partes (documento_id, parte_id, papel, project_id) VALUES ('dpa-d2', 'dpa-doc', 'dpa', ?)`).bind(P),
  ]);
  // o legado: DPA marcado à mão e link antigo, com os 10 pontos de antes
  await env.DB.prepare(`UPDATE vendors SET dpa_signed = 1, dpa_url = 'https://dpa.exemplo.com', has_iso27001 = 1, trust_score = 30, diligence_level = 'High' WHERE parte_id = 'dpa-leg'`).run();
  admin = await sessionFor({ id: 'u-adm', email: 'adm@ness.io', role: 'admin' });
});

describe('DPA pela fonte única', () => {
  it('o projeto é só do n.iso', async () => {
    const { results } = await env.DB.prepare('SELECT modulo FROM projeto_modulos WHERE project_id = ?').bind(P).all<{ modulo: string }>();
    expect(results.map((r) => r.modulo)).toEqual(['iso']);
  });

  it('legado sem documento: dpa 0, declarado 1 com o link antigo; o PUT recalcula sem os 10 pontos e não mexe nas colunas antigas', async () => {
    // o índice da lista já sai sem os 10 pontos do legado (calculado na leitura), antes de qualquer edição; o gravado ainda é 30
    expect(await linha('dpa-leg')).toMatchObject({ dpa: 0, dpa_declarado: 1, dpa_url_antigo: 'https://dpa.exemplo.com', dpa_documentos: [], trust_score: 20 });
    expect(await perfil('dpa-leg')).toMatchObject({ trust_score: 30 });
    expect((await editar('dpa-leg')).trust_score).toBe(20);
    expect(await perfil('dpa-leg')).toMatchObject({ trust_score: 20, dpa_signed: 1, dpa_url: 'https://dpa.exemplo.com' });
    // dpa_signed: 0 e dpa_url: null no corpo também são ignorados: as colunas são histórico
    await editar('dpa-leg', { dpa_signed: 0, dpa_url: null });
    expect(await perfil('dpa-leg')).toMatchObject({ dpa_signed: 1, dpa_url: 'https://dpa.exemplo.com' });
  });

  it('projeto só do n.iso liga o DPA (faixa núcleo); o índice soma os 10 pontos na hora e desligar os tira', async () => {
    const r = await chamar(admin, 'POST', `/api/v1/projects/${P}/terceiros/dpa-leg/documentos`, { documento_id: 'dpa-d1', papel: 'dpa' });
    expect(r.status).toBe(201);
    expect(await perfil('dpa-leg')).toMatchObject({ trust_score: 30 });
    expect(await linha('dpa-leg')).toMatchObject({ dpa: 1, dpa_documentos: [{ id: 'dpa-d1', titulo: 'DPA Nuvem' }] });
    expect((await editar('dpa-leg')).trust_score).toBe(30);

    expect((await chamar(admin, 'DELETE', `/api/v1/projects/${P}/terceiros/dpa-leg/documentos/dpa-d1?papel=dpa`)).status).toBe(200);
    expect(await perfil('dpa-leg')).toMatchObject({ trust_score: 20 });
    expect(await linha('dpa-leg')).toMatchObject({ dpa: 0, dpa_declarado: 1, dpa_documentos: [] });
  });

  it('documento ligado como contrato não é DPA', async () => {
    expect((await chamar(admin, 'POST', `/api/v1/projects/${P}/terceiros/dpa-sem/documentos`, { documento_id: 'dpa-d1', papel: 'contrato' })).status).toBe(201);
    expect(await linha('dpa-sem')).toMatchObject({ dpa: 0, dpa_declarado: 0, dpa_documentos: [] });
    expect(await perfil('dpa-sem')).toMatchObject({ trust_score: 0 });
  });

  it('POST de perfil novo: dpa_signed no corpo não grava nem pontua', async () => {
    await env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('dpa-novo', ?, 'organizacao', 'Novo Exemplo')`).bind(P).run();
    const r = await chamar(admin, 'POST', `/api/v1/projects/${P}/vendors`, { name: 'Novo Exemplo', parte_id: 'dpa-novo', dpa_signed: 1, dpa_url: 'https://x.exemplo.com' });
    expect(r.status).toBe(201);
    expect(((await r.json()) as { trust_score: number }).trust_score).toBe(0);
    expect(await perfil('dpa-novo')).toMatchObject({ dpa_signed: 0, dpa_url: null });
  });

  it('CSV: Sim (documento ligado), Declarado, sem documento (legado) e Não', async () => {
    const csv = await (await chamar(admin, 'GET', `/api/v1/projects/${P}/export/vendors`)).text();
    const [cab, ...linhas] = csv.split('\n');
    expect(cab.split(',').at(-1)).toBe('dpa');
    const dpaDe = (nome: string) => linhas.find((l) => l.startsWith(`"${nome}"`))!.split('","').at(-1)!.replace(/"$/, '');
    expect(dpaDe('Com Documento')).toBe('Sim');
    expect(dpaDe('Nuvem Legada')).toBe('Declarado, sem documento');
    expect(dpaDe('Sem Nada')).toBe('Não');
  });
});
