import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects } from './helpers/d1';

/** Saneamento do que já está gravado: o servidor recalcula o nome novo e nunca aceita texto do cliente. */
const A = '/api/v1/projects/proj-a';
const B = '/api/v1/projects/proj-b';
let plat: Record<string, string>, cliente: Record<string, string>;
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv());
type Proposta = { tabela: string; id: string; antes: string; depois: string; conflito: boolean };
const listar = async (base = A) => (await (await chamar(plat, 'GET', `${base}/padronizar-nomes`)).json()) as { propostas: Proposta[]; duplicatas: { tabela: string; nomes: string[] }[] };
const nomeDe = async (tabela: string, id: string) => (await env.DB.prepare(`SELECT nome FROM ${tabela} WHERE id = ?`).bind(id).first<{ nome: string }>())?.nome;

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user', client_project_id: 'proj-a' });
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO departamentos (id, project_id, nome) VALUES ('d1', 'proj-a', 'ti'), ('d2', 'proj-a', 'Financeiro'), ('d3', 'proj-a', 'rh'), ('d4', 'proj-a', 'RH'), ('d5', 'proj-b', 'ti')`),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('p1', 'proj-a', 'pessoa', 'maria da silva'), ('p2', 'proj-a', 'pessoa', 'João Souza')`),
    env.DB.prepare(`INSERT INTO itens (id, project_id, nome) VALUES ('i1', 'proj-a', 'servidor de arquivos')`),
  ]);
});

describe('listar', () => {
  it('traz só o que mudaria, no projeto pedido, e marca o conflito', async () => {
    const { propostas, duplicatas } = await listar();
    const por = (id: string) => propostas.find((p) => p.id === id);
    expect(por('d1')).toMatchObject({ tabela: 'departamentos', antes: 'ti', depois: 'TI', conflito: false });
    expect(por('p1')).toMatchObject({ tabela: 'partes', depois: 'Maria da Silva' });
    expect(por('i1')).toMatchObject({ tabela: 'itens', depois: 'Servidor de Arquivos' });
    expect(por('d3')).toMatchObject({ depois: 'RH', conflito: true }); // já existe "RH" no projeto
    expect(por('d2')).toBeUndefined(); // já está no padrão
    expect(por('d5')).toBeUndefined(); // outro projeto
    expect(duplicatas).toContainEqual({ tabela: 'departamentos', nomes: ['RH', 'rh'] });
  });
});

describe('aplicar', () => {
  it('aplica o que foi pedido com o texto calculado no servidor, e deixa trilha', async () => {
    const r = await chamar(plat, 'POST', `${A}/padronizar-nomes`, { itens: [{ tabela: 'departamentos', id: 'd1', antes: 'ti' }, { tabela: 'partes', id: 'p1', antes: 'maria da silva' }] });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ aplicados: 2, ignorados: [] });
    expect(await nomeDe('departamentos', 'd1')).toBe('TI');
    expect(await nomeDe('partes', 'p1')).toBe('Maria da Silva');
    const t = await env.DB.prepare(`SELECT count(*) AS n FROM audit_logs WHERE action = 'nome.padronizado' AND project_id = 'proj-a'`).first<{ n: number }>();
    expect(t?.n).toBe(2);
  });

  it('conflito, linha de outro projeto e id inexistente são ignorados, com o motivo', async () => {
    const r = await chamar(plat, 'POST', `${A}/padronizar-nomes`, { itens: [{ tabela: 'departamentos', id: 'd3', antes: 'rh' }, { tabela: 'departamentos', id: 'd5', antes: 'ti' }, { tabela: 'itens', id: 'nao-existe', antes: 'x' }] });
    const j = (await r.json()) as { aplicados: number; ignorados: { id: string; motivo: string }[] };
    expect(j.aplicados).toBe(0);
    expect(j.ignorados.map((x) => x.id).sort()).toEqual(['d3', 'd5', 'nao-existe']);
    expect(await nomeDe('departamentos', 'd3')).toBe('rh');
    expect(await nomeDe('departamentos', 'd5')).toBe('ti');
  });

  it('nome que mudou entre a lista e o clique é ignorado e não é sobrescrito', async () => {
    const { propostas } = await listar();
    const i1 = propostas.find((p) => p.id === 'i1')!;
    await env.DB.prepare(`UPDATE itens SET nome = 'servidor de e-mail' WHERE id = 'i1'`).run();
    const r = await chamar(plat, 'POST', `${A}/padronizar-nomes`, { itens: [{ tabela: 'itens', id: i1.id, antes: i1.antes }] });
    const j = (await r.json()) as { aplicados: number; ignorados: { id: string; motivo: string }[] };
    expect(j.aplicados).toBe(0);
    expect(j.ignorados[0]).toMatchObject({ id: 'i1', motivo: 'O nome mudou depois da lista' });
    expect(await nomeDe('itens', 'i1')).toBe('servidor de e-mail');
  });

  it('quem não é da equipe leva 403 e nada muda; corpo inválido é 400', async () => {
    expect((await chamar(cliente, 'POST', `${A}/padronizar-nomes`, { itens: [{ tabela: 'itens', id: 'i1', antes: 'x' }] })).status).toBe(403);
    expect((await chamar(cliente, 'GET', `${A}/padronizar-nomes`)).status).toBe(403);
    expect((await chamar(plat, 'POST', `${A}/padronizar-nomes`, { itens: [{ tabela: 'users', id: 'x', antes: 'x' }] })).status).toBe(400);
    expect((await chamar(plat, 'POST', `${A}/padronizar-nomes`, { itens: [] })).status).toBe(400);
    expect((await chamar(plat, 'GET', `${B}/padronizar-nomes`)).status).toBe(200);
  });
});
