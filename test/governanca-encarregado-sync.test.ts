import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';

/** DPO da governança e encarregado do n.privacy: a mesma pessoa, sincronizada nos dois sentidos. */
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
let h: Record<string, string>;
const PROJ = ['gs-1', 'gs-2', 'gs-3', 'gs-4', 'gs-5'];
const gov = (p: string, corpo: Record<string, unknown>) => chamar(h, 'POST', `/api/v1/projects/${p}/governance`, corpo);
const dpo = (name: string, email: string, id?: string) => ({ id, name, email, role_category: 'dpo', job_title: 'DPO' });
const encarregadas = async (p: string) => (await env.DB.prepare(
  `SELECT pa.id, pa.nome, pa.email FROM parte_vinculos v JOIN partes pa ON pa.id = v.parte_id WHERE v.project_id = ? AND v.papel = 'encarregado' AND v.alvo_tipo = 'projeto'`
).bind(p).all<{ id: string; nome: string; email: string | null }>()).results;
const membroId = async (p: string) => (await env.DB.prepare('SELECT id FROM project_governance WHERE project_id = ? AND role_category = ?').bind(p, 'dpo').first<{ id: string }>())!.id;
const fora = async (p: string) => (await (await chamar(h, 'GET', `/api/v1/projects/${p}/governance/encarregados-fora`)).json()) as { parte_id: string; nome: string }[];

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    ...PROJ.map((p) => env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(p)),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-gs', 'cons-gs@ness.lat', 'x', 'Cons', 'platform_admin', 'org_ness')`),
  ]);
  await habilitarPrivacy(...PROJ);
  h = await sessionFor({ id: 'u-gs', email: 'cons-gs@ness.lat', role: 'platform_admin' });
});

describe('DPO -> parte', () => {
  it('mudar nome e e-mail do membro atualiza a mesma parte', async () => {
    await gov('gs-1', dpo('Ana Silva', 'ana@x.com'));
    const id = await membroId('gs-1');
    expect((await gov('gs-1', dpo('Ana Souza', 'ana.souza@x.com', id))).status).toBe(200);
    const v = await encarregadas('gs-1');
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ nome: 'Ana Souza', email: 'ana.souza@x.com' });
    const n = await env.DB.prepare(`SELECT count(*) AS n FROM partes WHERE project_id = 'gs-1' AND tipo = 'pessoa'`).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });
  it('e-mail novo já de outra parte: a antiga não muda e o vínculo passa para a outra', async () => {
    await gov('gs-2', dpo('Ana Silva', 'ana@x.com'));
    await env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES ('gs-outra', 'gs-2', 'pessoa', 'Outra Pessoa', 'ana.souza@x.com')`).run();
    await gov('gs-2', dpo('Ana Souza', 'ana.souza@x.com', await membroId('gs-2')));
    const v = await encarregadas('gs-2');
    expect(v.map((p) => p.id)).toEqual(['gs-outra']);
    const antiga = await env.DB.prepare(`SELECT nome, email FROM partes WHERE project_id = 'gs-2' AND email = 'ana@x.com'`).first();
    expect(antiga).toMatchObject({ nome: 'Ana Silva' });
  });
});

describe('parte -> DPO', () => {
  it('PUT da parte encarregada leva nome e e-mail ao membro DPO', async () => {
    await gov('gs-3', dpo('Bia Lima', 'bia@x.com'));
    const [parte] = await encarregadas('gs-3');
    const r = await chamar(h, 'PUT', `/api/v1/projects/gs-3/partes/${parte.id}`, { nome: 'Bia Costa', email: 'bia.costa@x.com' });
    expect(r.status).toBe(200);
    const m = await env.DB.prepare(`SELECT name, email FROM project_governance WHERE project_id = 'gs-3' AND role_category = 'dpo'`).first();
    expect(m).toMatchObject({ name: 'Bia Costa', email: 'bia.costa@x.com' });
  });
});

describe('encarregados-fora', () => {
  it('parte encarregada sem membro DPO aparece; com o membro, some', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES ('gs-p4', 'gs-4', 'pessoa', 'Caio Dias', 'caio@x.com')`),
      env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('gs-v4', 'gs-4', 'gs-p4', 'encarregado', 'projeto', 'gs-4')`),
    ]);
    expect((await fora('gs-4')).map((p) => p.parte_id)).toEqual(['gs-p4']);
    await gov('gs-4', dpo('Caio Dias', 'caio@x.com'));
    expect(await fora('gs-4')).toEqual([]);
  });
  it('parte de outro projeto nunca aparece', async () => {
    expect(await fora('gs-5')).toEqual([]);
  });
});
