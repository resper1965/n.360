import { describe, it, expect, beforeAll } from 'vitest';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects } from './helpers/d1';

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

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  plat = await sessionFor({ id: 'u-pa-cnpj', email: 'pa-cnpj@ness.lat', role: 'platform_admin' });
});

describe('CNPJ da organização em partes (D4, migration 0085)', () => {
  it('cria e edita com máscara; grava só dígitos; limpar com null; ausente não mexe', async () => {
    const r = await chamar(plat, 'POST', `${A}/partes`, { tipo: 'organizacao', nome: 'Fornecedora CNPJ', cnpj: '11.222.333/0001-81' });
    expect(r.status).toBe(201);
    const { id } = await json<{ id: string }>(r);
    expect(await json(await chamar(plat, 'GET', `${A}/partes/${id}`))).toMatchObject({ cnpj: '11222333000181' });
    expect((await chamar(plat, 'PUT', `${A}/partes/${id}`, { nome: 'Fornecedora CNPJ SA' })).status).toBe(200);
    expect(await json(await chamar(plat, 'GET', `${A}/partes/${id}`))).toMatchObject({ cnpj: '11222333000181' });
    expect((await chamar(plat, 'PUT', `${A}/partes/${id}`, { cnpj: null })).status).toBe(200);
    expect(await json(await chamar(plat, 'GET', `${A}/partes/${id}`))).toMatchObject({ cnpj: null });
  });

  it('recusa CNPJ inválido (400), de pessoa (400) e repetido no projeto (409); outro projeto pode repetir', async () => {
    expect((await chamar(plat, 'POST', `${A}/partes`, { tipo: 'organizacao', nome: 'DV Errado', cnpj: '11.222.333/0001-82' })).status).toBe(400);
    expect((await chamar(plat, 'POST', `${A}/partes`, { tipo: 'pessoa', nome: 'Pessoa Com CNPJ', cnpj: '45.723.174/0001-10' })).status).toBe(400);
    expect((await chamar(plat, 'POST', `${A}/partes`, { tipo: 'organizacao', nome: 'Primeira', cnpj: '45723174000110' })).status).toBe(201);
    expect((await chamar(plat, 'POST', `${A}/partes`, { tipo: 'organizacao', nome: 'Segunda', cnpj: '45.723.174/0001-10' })).status).toBe(409);
    expect((await chamar(plat, 'POST', `${B}/partes`, { tipo: 'organizacao', nome: 'Em Outro Projeto', cnpj: '45723174000110' })).status).toBe(201);
    const pessoa = await json<{ id: string }>(await chamar(plat, 'POST', `${A}/partes`, { tipo: 'pessoa', nome: 'Pessoa Simples' }));
    expect((await chamar(plat, 'PUT', `${A}/partes/${pessoa.id}`, { cnpj: '11222333000181' })).status).toBe(400);
    const terceira = await json<{ id: string }>(await chamar(plat, 'POST', `${A}/partes`, { tipo: 'organizacao', nome: 'Terceira' }));
    expect((await chamar(plat, 'PUT', `${A}/partes/${terceira.id}`, { cnpj: '45723174000110' })).status).toBe(409);
  });
});
