import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects } from './helpers/d1';

// Mudar o tipo da parte (pessoa <-> organização) pelo PUT /partes/:id: o servidor recusa com 409 quando a mudança quebraria algo.
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;

const A = '/api/v1/projects/proj-a';
const B = '/api/v1/projects/proj-b';
let plat: Record<string, string>;

const criar = async (base: string, corpo: object) => {
  const r = await chamar(plat, 'POST', `${base}/partes`, corpo);
  expect(r.status, JSON.stringify(corpo)).toBe(201);
  return (await json<{ id: string }>(r)).id;
};
const tipoDe = async (id: string) => (await env.DB.prepare('SELECT tipo FROM partes WHERE id = ?').bind(id).first<{ tipo: string }>())!.tipo;
const vincular = (parte: string, papel: string, alvo_tipo: string, alvo_id: string) =>
  env.DB.prepare('INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), 'proj-a', parte, papel, alvo_tipo, alvo_id).run();

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  plat = await sessionFor({ id: 'u-pa-tipo', email: 'pa-tipo@ness.lat', role: 'platform_admin' });
  await env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('site-tipo', 'proj-a', 'Site Genérico')`).run();
  await env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('ropa-tipo', 'proj-a', 'Atividade Genérica')`).run();
});

describe('mudar o tipo da parte', () => {
  it('pessoa sem amarras vira organização (com CNPJ no mesmo pedido), volta a pessoa, e a trilha registra', async () => {
    const id = await criar(A, { tipo: 'pessoa', nome: 'Escritório Genérico' });
    const r = await chamar(plat, 'PUT', `${A}/partes/${id}`, { tipo: 'organizacao', cnpj: '11.222.333/0001-81' });
    expect(r.status).toBe(200);
    expect(await env.DB.prepare('SELECT tipo, cnpj FROM partes WHERE id = ?').bind(id).first()).toMatchObject({ tipo: 'organizacao', cnpj: '11222333000181' });
    const trilha = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'parte.tipo_alterado' AND details LIKE ?`).bind(`%${id}%`).first<{ details: string }>();
    expect(trilha?.details).toContain('pessoa → organizacao');
    expect((await chamar(plat, 'PUT', `${A}/partes/${id}`, { tipo: 'pessoa', cnpj: null })).status).toBe(200);
    expect(await tipoDe(id)).toBe('pessoa');
  });

  it('CNPJ em pessoa segue recusado; tipo inválido é 400; parte de outro projeto é 404', async () => {
    const id = await criar(A, { tipo: 'pessoa', nome: 'Pessoa Sem Cnpj' });
    expect((await chamar(plat, 'PUT', `${A}/partes/${id}`, { cnpj: '11222333000181' })).status).toBe(400);
    expect((await chamar(plat, 'PUT', `${A}/partes/${id}`, { tipo: 'empresa' })).status).toBe(400);
    const deB = await criar(B, { tipo: 'pessoa', nome: 'Pessoa do Outro Projeto' });
    expect((await chamar(plat, 'PUT', `${A}/partes/${deB}`, { tipo: 'organizacao' })).status).toBe(404);
    expect(await tipoDe(deB)).toBe('pessoa');
  });

  it('pessoa vinculada como terceiro do projeto ganha o perfil de fornecedor ao virar organização', async () => {
    const id = await criar(A, { tipo: 'pessoa', nome: 'Terceiro Legado' });
    await vincular(id, 'terceiro', 'projeto', 'proj-a');
    expect((await chamar(plat, 'PUT', `${A}/partes/${id}`, { tipo: 'organizacao' })).status).toBe(200);
    expect(await env.DB.prepare('SELECT name FROM vendors WHERE parte_id = ?').bind(id).first()).toMatchObject({ name: 'Terceiro Legado' });
  });

  // Cada amarra sozinha recusa: tirar qualquer uma do servidor faz o caso dela falhar.
  const amarrasDaPessoa: [string, (id: string) => Promise<unknown>][] = [
    ['conta ligada', async (id) => {
      await env.DB.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, name, role) VALUES ('u-conta-tipo', 'conta-tipo@exemplo.com', 'x', 'Conta', 'org_admin')`).run();
      await env.DB.prepare(`UPDATE partes SET user_id = 'u-conta-tipo' WHERE id = ?`).bind(id).run();
    }],
    ['vínculo de encarregado', (id) => vincular(id, 'encarregado', 'projeto', 'proj-a')],
    ['vínculo de responsável', (id) => vincular(id, 'responsavel', 'tratamento', 'ropa-tipo')],
    ['linha do DPO na governança', () => env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('proj-a', 'Dpo Generico', 'dpo-generico@exemplo.com', 'dpo', 'DPO')`).run()],
  ];
  for (const [rotulo, amarrar] of amarrasDaPessoa) {
    it(`pessoa com ${rotulo} não vira organização (409)`, async () => {
      const id = await criar(A, rotulo === 'linha do DPO na governança'
        ? { tipo: 'pessoa', nome: 'Dpo Generico', email: 'dpo-generico@exemplo.com' } : { tipo: 'pessoa', nome: `Pessoa ${rotulo}` });
      await amarrar(id);
      const r = await chamar(plat, 'PUT', `${A}/partes/${id}`, { tipo: 'organizacao' });
      expect(r.status).toBe(409);
      expect((await json<{ error: string }>(r)).error).toMatch(/pessoa/i);
      expect(await tipoDe(id)).toBe('pessoa');
    });
  }

  const amarrasDaOrganizacao: [string, (id: string) => Promise<unknown>][] = [
    ['CNPJ', (id) => env.DB.prepare(`UPDATE partes SET cnpj = '45723174000110' WHERE id = ?`).bind(id).run()],
    ['tipo de fornecedor', (id) => env.DB.prepare(`UPDATE partes SET terceiro_tipo = 'medio' WHERE id = ?`).bind(id).run()],
    ['avaliação', (id) => env.DB.prepare(`INSERT INTO avaliacoes_terceiro (id, project_id, parte_id, metodo, resultado, valido_ate) VALUES (?, 'proj-a', ?, 'questionario', 'aprovado', '2099-01-01')`).bind(crypto.randomUUID(), id).run()],
    ['criticidade', (id) => env.DB.prepare(`INSERT INTO criticidades_terceiro (id, project_id, parte_id, impacto, exclusividade, risco_financeiro, conformidade, risco_reputacional, nivel) VALUES (?, 'proj-a', ?, 'baixo', 'varias_alternativas', 'baixo', 'sem_regulamentacao', 'baixo', 'baixo')`).bind(crypto.randomUUID(), id).run()],
    ['questionário', (id) => env.DB.prepare(`INSERT INTO homologacoes (id, project_id, parte_id, token_hash, expira_em, perguntas_json) VALUES (?, 'proj-a', ?, ?, '2099-01-01', '[]')`).bind(crypto.randomUUID(), id, crypto.randomUUID()).run()],
    ['perfil de fornecedor', (id) => env.DB.prepare(`INSERT INTO vendors (id, project_id, name, parte_id) VALUES (?, 'proj-a', 'Perfil', ?)`).bind(crypto.randomUUID(), id).run()],
    ['vínculo de fornecedor fora do privacy', (id) => env.DB.prepare(`INSERT INTO ot_fornecedores (id, project_id, parte_id, papel, ot_site_id, criado_por) VALUES (?, 'proj-a', ?, 'integrador', 'site-tipo', 'teste')`).bind(crypto.randomUUID(), id).run()],
    ['parceiro do compartilhamento externo', (id) => env.DB.prepare(`INSERT INTO tratamento_externo_parceiros (ropa_id, parte_id, project_id) VALUES ('ropa-tipo', ?, 'proj-a')`).bind(id).run()],
    ['papel de operador', (id) => vincular(id, 'operador', 'tratamento', 'ropa-tipo')],
    ['responsável apontando para ela', async (id) => vincular(await criar(A, { tipo: 'pessoa', nome: 'Responsável Genérico' }), 'responsavel', 'parte', id)],
  ];
  for (const [rotulo, amarrar] of amarrasDaOrganizacao) {
    it(`organização com ${rotulo} não vira pessoa (409), com mensagem genérica`, async () => {
      const id = await criar(A, { tipo: 'organizacao', nome: `Organização ${rotulo}` });
      await amarrar(id);
      const r = await chamar(plat, 'PUT', `${A}/partes/${id}`, { tipo: 'pessoa' });
      expect(r.status).toBe(409);
      const { error } = await json<{ error: string }>(r);
      expect(error).toContain('tem vínculos que dependem do tipo');
      expect(error).not.toMatch(/\bOT\b|n\.ot/i);
      expect(await tipoDe(id)).toBe('organizacao');
    });
  }
});
