import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, execSql, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';
import { ehDpo } from '../src/services/encarregado-pessoa';
import migration0062 from '../migrations/0062_dpo_encarregado.sql?raw';

/** O DPO da governança do n.iso é o encarregado do n.privacy: a mesma pessoa, um vínculo `encarregado` no projeto. */
const P = 'dp-proj';
const SEM = 'dp-sem';
const MIG = 'dp-mig';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;
let consultor: Record<string, string>;
const vinculos = async (p: string) => (await env.DB.prepare(
  `SELECT pa.nome, pa.email FROM parte_vinculos v JOIN partes pa ON pa.id = v.parte_id WHERE v.project_id = ? AND v.papel = 'encarregado' AND v.alvo_tipo = 'projeto'`
).bind(p).all<{ nome: string; email: string | null }>()).results;
const gov = (p: string, corpo: Record<string, unknown>) => chamar(consultor, 'POST', `/api/v1/projects/${p}/governance`, corpo);

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Sem', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Mig', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, SEM, MIG),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-dp', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness')`),
  ]);
  await env.DB.batch([P, SEM, MIG].map((p) => env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES (?, ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind('gc-' + p, p)));
  await habilitarPrivacy(P, SEM, MIG);
  consultor = await sessionFor({ id: 'u-dp', email: 'cons@ness.lat', role: 'consultor' });
});

describe('ehDpo', () => {
  it('reconhece DPO e encarregado(a) no cargo, ou a categoria dpo', () => {
    expect(ehDpo({ job_title: 'DPO' })).toBe(true);
    expect(ehDpo({ job_title: 'Encarregada de Dados' })).toBe(true);
    expect(ehDpo({ role_category: 'dpo', job_title: 'x' })).toBe(true);
    expect(ehDpo({ job_title: 'CISO' })).toBe(false);
    expect(ehDpo({ job_title: 'Diretor de Operações' })).toBe(false);
  });
});

describe('POST /governance', () => {
  it('membro DPO vira parte pessoa (e-mail minúsculo) com vínculo encarregado; repetir não duplica', async () => {
    const corpo = { name: 'Rita Exemplo', email: 'Rita@Cliente.com', role_category: 'executivo', job_title: 'DPO' };
    expect((await gov(P, corpo)).status).toBe(200);
    expect((await gov(P, corpo)).status).toBe(200);
    expect(await vinculos(P)).toEqual([{ nome: 'Rita Exemplo', email: 'rita@cliente.com' }]);
    const n = await env.DB.prepare(`SELECT count(*) AS n FROM partes WHERE project_id = ? AND tipo = 'pessoa'`).bind(P).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });
  it('membro CISO não ganha vínculo', async () => {
    await gov(SEM, { name: 'Caio Exemplo', email: 'caio@cliente.com', role_category: 'tech', job_title: 'CISO' });
    expect(await vinculos(SEM)).toEqual([]);
  });
});

describe('visão do encarregado', () => {
  it('devolve os encarregados do projeto', async () => {
    const v = await json<{ encarregados: { nome: string }[] }>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/encarregado`));
    expect(v.encarregados).toEqual([expect.objectContaining({ nome: 'Rita Exemplo' })]);
  });
  it('sem encarregado: prioridade alta "Nenhum encarregado indicado"', async () => {
    const v = await json<{ encarregados: unknown[]; prioridades: { nivel: string; texto: string }[] }>(await chamar(consultor, 'GET', `/api/v1/projects/${SEM}/encarregado`));
    expect(v.encarregados).toEqual([]);
    expect(v.prioridades).toContainEqual(expect.objectContaining({ nivel: 'alta', texto: expect.stringContaining('Nenhum encarregado indicado') }));
  });
});

describe('migration 0062', () => {
  it('cria parte e vínculo do DPO que já existia, e aplicada duas vezes não duplica', async () => {
    await env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('gm1', ?, ' Dora Exemplo ', 'Dora@Cliente.com', 'executivo', 'Encarregada de Dados'), ('gm2', ?, 'Caio Exemplo', NULL, 'tech', 'CISO')`).bind(MIG, MIG).run();
    await execSql(migration0062);
    await execSql(migration0062);
    expect(await vinculos(MIG)).toEqual([{ nome: 'Dora Exemplo', email: 'dora@cliente.com' }]);
    const n = await env.DB.prepare(`SELECT count(*) AS n FROM partes WHERE project_id = ?`).bind(MIG).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });
});
