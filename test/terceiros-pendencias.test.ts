import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { pendenciasDe } from '../src/services/terceiros';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';
import { somarMeses } from '../src/services/fornecedor-modelos';
import { hojeEmSaoPaulo } from '../src/services/hoje';

// a validade não passa do prazo do modelo do tipo (fatia 2): 6 meses cabe em qualquer tipo
const DENTRO_DO_PRAZO = somarMeses(hojeEmSaoPaulo(), 6);

/** Pendências do TPRM por fornecedor: tipo, criticidade, avaliação vigente e DPA (skill avaliacao-terceiros). */
const P = 'tp-proj';
const OUTRO = 'tp-outro';
const base = `/api/v1/projects/${P}/terceiros`;
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const completo = { terceiro_tipo: 'medio', nivel: 'baixo', situacao: 'vigente', dpa: true } as const;
type Item = { id: string; pendencias: string[] };

describe('pendenciasDe', () => {
  it('completo = vazia', () => expect(pendenciasDe(completo)).toEqual([]));
  it.each([
    [{ terceiro_tipo: null }, ['Tipo']],
    [{ nivel: null }, ['Criticidade']],
    [{ situacao: 'pendente' }, ['Avaliação']],
    [{ situacao: 'vencida' }, ['Avaliação']],
    [{ situacao: 'reprovada' }, ['Avaliação']],
    [{ dpa: false }, ['DPA']],
    [{ terceiro_tipo: null, nivel: null, situacao: 'pendente', dpa: false }, ['Tipo', 'Criticidade', 'Avaliação', 'DPA']],
  ] as const)('%j', (mudanca, esperado) => expect(pendenciasDe({ ...completo, ...mudanca } as never)).toEqual(esperado));
});

describe('GET /terceiros traz pendencias', () => {
  let consultor: Record<string, string>;
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente TP', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Outro TP', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-tp', 'tp@ness.lat', 'x', 'TP', 'consultor', NULL, 'org_ness')`),
      env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-tp', ?, 'TP', 'tp@ness.lat', 'consultor', 'Consultor')`).bind(P),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('tp-a', ?1, 'organizacao', 'Fornecedor Exemplo'), ('tp-b', ?1, 'organizacao', 'Fornecedor Sem Nada'), ('tp-x', ?2, 'organizacao', 'Fornecedor Alheio')`).bind(P, OUTRO),
      env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo, status) VALUES ('tp-d', ?, 'DPA Exemplo', 'vigente')`).bind(P),
    ]);
    await habilitarPrivacy(P, OUTRO);
    consultor = await sessionFor({ id: 'u-tp', email: 'tp@ness.lat', role: 'consultor' });
  });

  it('sem nada: as quatro pendências; completo: vazia; outro projeto não vaza', async () => {
    let l = (await (await chamar(consultor, 'GET', base)).json()) as Item[];
    expect(l.find((t) => t.id === 'tp-b')!.pendencias).toEqual(['Tipo', 'Criticidade', 'Avaliação', 'DPA']);
    expect(l.some((t) => t.id === 'tp-x')).toBe(false);
    expect((await chamar(consultor, 'PUT', `${base}/tp-a/tipo`, { terceiro_tipo: 'medio' })).status).toBe(200);
    expect((await chamar(consultor, 'POST', `${base}/tp-a/criticidades`, { impacto: 'baixo', exclusividade: 'varias_alternativas', risco_financeiro: 'baixo', conformidade: 'sem_regulamentacao', risco_reputacional: 'baixo' })).status).toBe(201);
    expect((await chamar(consultor, 'POST', `${base}/tp-a/avaliacoes`, { resultado: 'aprovado', valido_ate: DENTRO_DO_PRAZO })).status).toBe(201);
    expect((await chamar(consultor, 'POST', `${base}/tp-a/documentos`, { documento_id: 'tp-d', papel: 'dpa' })).status).toBe(201);
    l = (await (await chamar(consultor, 'GET', base)).json()) as Item[];
    expect(l.find((t) => t.id === 'tp-a')!.pendencias).toEqual([]);
    const ficha = (await (await chamar(consultor, 'GET', `${base}/tp-a`)).json()) as { pendencias: string[] };
    expect(ficha.pendencias).toEqual([]);
  });
});
