import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects } from './helpers/d1';
import { importarPartes } from '../src/services/partes';

/** O nome entra padronizado, qualquer que seja a porta: tela/API, importação de partes, ativo. */
const A = '/api/v1/projects/proj-a';
let plat: Record<string, string>;
const chamar = (metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...plat }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv());
const nomeDe = async (tabela: string, id: string) => (await env.DB.prepare(`SELECT nome FROM ${tabela} WHERE id = ?`).bind(id).first<{ nome: string }>())?.nome;

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
});

describe('nome padronizado ao gravar', () => {
  it('departamento: criar e editar', async () => {
    const r = await chamar('POST', `${A}/departamentos`, { nome: 'depto de ti' });
    const { id } = (await r.json()) as { id: string };
    expect(await nomeDe('departamentos', id)).toBe('Departamento de TI');
    await chamar('PUT', `${A}/departamentos/${id}`, { nome: 'rh' });
    expect(await nomeDe('departamentos', id)).toBe('RH');
  });

  it('parte: pessoa e organização', async () => {
    const p = (await (await chamar('POST', `${A}/partes`, { nome: 'maria da silva' })).json()) as { id: string };
    expect(await nomeDe('partes', p.id)).toBe('Maria da Silva');
    const o = (await (await chamar('POST', `${A}/partes`, { tipo: 'organizacao', nome: 'ACME LTDA' })).json()) as { id: string };
    expect(await nomeDe('partes', o.id)).toBe('Acme Ltda.');
  });

  it('ativo: criar e editar', async () => {
    const r = await chamar('POST', `${A}/assets`, { name: 'servidor de arquivos', category: 'Hardware' });
    const { id } = (await r.json()) as { id: string };
    const nome = async () => (await env.DB.prepare('SELECT nome FROM itens WHERE id = ?').bind(id).first<{ nome: string }>())?.nome;
    expect(await nome()).toBe('Servidor de Arquivos');
    await chamar('PUT', `${A}/assets/${id}`, { name: 'nas do financeiro' });
    expect(await nome()).toBe('Nas do Financeiro');
  });

  it('importação de partes: stakeholder e governança', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO stakeholders (project_id, name) VALUES ('proj-a', 'depto financeiro')`),
      env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-nm', 'proj-a', 'joão d''ávila', 'jd@exemplo.com.br', 'ciso', 'Diretor')`),
    ]);
    await importarPartes(env.DB, 'proj-a', 'pa@ness.lat');
    const nomes = (await env.DB.prepare(`SELECT nome FROM partes WHERE project_id = 'proj-a'`).all<{ nome: string }>()).results.map((x) => x.nome);
    expect(nomes).toContain('Departamento Financeiro');
    expect(nomes).toContain("João D'Ávila");
  });
});
