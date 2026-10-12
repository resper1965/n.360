import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';
import { tratamentoPropostoSchema } from '../src/schemas/importacao';

/** Riscos do tratamento: dados sensíveis (LGPD art. 11) e crianças e adolescentes (art. 14), migration 0069. */
const P = 'rl-proj';
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const flags = (id: string) => env.DB.prepare('SELECT dados_sensiveis, criancas_adolescentes FROM ropa_records WHERE id = ?').bind(id).first();

describe('RoPA: dados sensíveis (art. 11) e crianças e adolescentes (art. 14)', () => {
  let consultor: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-rl', 'rl@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness')`),
      env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-rl', ?, 'Cons', 'rl@ness.lat', 'consultor', 'Consultor')`).bind(P),
    ]);
    await habilitarPrivacy(P);
    consultor = await sessionFor({ id: 'u-rl', email: 'rl@ness.lat', role: 'consultor' });
  });

  it('criar sem os campos grava 0 nos dois; criar com 1/true grava 1', async () => {
    const r0 = await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa`, { processing_purpose: 'Folha' });
    expect(r0.status, await r0.clone().text()).toBe(201);
    expect(await flags(((await r0.json()) as { id: string }).id)).toEqual({ dados_sensiveis: 0, criancas_adolescentes: 0 });

    const r1 = await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa`, { processing_purpose: 'Saúde ocupacional', dados_sensiveis: 1, criancas_adolescentes: true });
    expect(r1.status, await r1.clone().text()).toBe(201);
    expect(await flags(((await r1.json()) as { id: string }).id)).toEqual({ dados_sensiveis: 1, criancas_adolescentes: 1 });
  }, 30_000);

  it('editar liga e desliga; ausente no corpo preserva; a lista devolve os dois', async () => {
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa`, { processing_purpose: 'Matrícula escolar' });
    const { id } = (await r.json()) as { id: string };
    expect((await chamar(consultor, 'PUT', `/api/v1/ropa/${id}`, { processing_purpose: 'Matrícula escolar', dados_sensiveis: 1, criancas_adolescentes: 'sim' })).status).toBe(200);
    expect(await flags(id)).toEqual({ dados_sensiveis: 1, criancas_adolescentes: 1 });
    expect((await chamar(consultor, 'PUT', `/api/v1/ropa/${id}`, { processing_purpose: 'Matrícula escolar v2' })).status).toBe(200);
    expect(await flags(id)).toEqual({ dados_sensiveis: 1, criancas_adolescentes: 1 });
    expect((await chamar(consultor, 'PUT', `/api/v1/ropa/${id}`, { processing_purpose: 'Matrícula escolar v2', dados_sensiveis: 0, criancas_adolescentes: false })).status).toBe(200);
    expect(await flags(id)).toEqual({ dados_sensiveis: 0, criancas_adolescentes: 0 });
    await chamar(consultor, 'PUT', `/api/v1/ropa/${id}`, { processing_purpose: 'Matrícula escolar v2', criancas_adolescentes: 1 });
    const lista = (await (await chamar(consultor, 'GET', `/api/v1/projects/${P}/ropa`)).json()) as { records: Record<string, unknown>[] };
    expect(lista.records.find((x) => x.id === id)).toMatchObject({ dados_sensiveis: 0, criancas_adolescentes: 1 });
  }, 30_000);

  it('o relatório do RoPA mostra os dois riscos', async () => {
    await env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, dados_sensiveis, criancas_adolescentes) VALUES ('rl-rep', ?, 'Prontuário pediátrico', 1, 1)`).bind(P).run();
    const r = await chamar(consultor, 'GET', `/api/v1/projects/${P}/ropa/report`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('Dados sensíveis (art. 11)');
    expect(html).toContain('Crianças e adolescentes (art. 14)');
  }, 30_000);

  it('planilha: colunas de dados sensíveis e de crianças e adolescentes, com sim/não', async () => {
    const csv = 'Finalidade;Dados sensíveis;Crianças e adolescentes\nBiometria;sim;não\nCreche;não;sim';
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa/importar`, { csv });
    expect(r.status, await r.clone().text()).toBe(200);
    const rs = (await env.DB.prepare(`SELECT processing_purpose, dados_sensiveis, criancas_adolescentes FROM ropa_records WHERE project_id = ? AND processing_purpose IN ('Biometria', 'Creche') ORDER BY processing_purpose`).bind(P).all()).results;
    expect(rs).toEqual([
      { processing_purpose: 'Biometria', dados_sensiveis: 1, criancas_adolescentes: 0 },
      { processing_purpose: 'Creche', dados_sensiveis: 0, criancas_adolescentes: 1 },
    ]);
  }, 30_000);

  it('importação de programa: os dois campos são opcionais no tratamento proposto', () => {
    expect(tratamentoPropostoSchema.safeParse({ finalidade: 'X' }).success).toBe(true);
    expect(tratamentoPropostoSchema.safeParse({ finalidade: 'X', dados_sensiveis: true, criancas_adolescentes: false }).success).toBe(true);
  });
});
