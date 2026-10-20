import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';
import { semearCatalogo } from '../src/services/requisitos';
import { BASES_GDPR } from '../src/data/ropa-abas/gdpr';

/** Referência jurídica: validar mapeamentos (só quem está logado, só platform_admin) e as bases do GDPR. Só o D1 de teste. */
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, extra: object = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), { ...workerEnv(), ...extra } as any);
const json = async <T>(r: Response) => (await r.json()) as T;

let admin: Record<string, string>, consultor: Record<string, string>, cliente: Record<string, string>;
const estados = async () => (await env.DB.prepare(`SELECT estado, count(*) AS n FROM requisito_mapeamentos GROUP BY estado`).all<{ estado: string; n: number }>()).results;

beforeAll(async () => {
  await applySchema();
  await semearCatalogo(env.DB);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('vl-proj', 'Cliente', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-vl', 'vl-proj', 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-vl', 'u-cons', 'vl-proj', datetime('now','+30 days'))`),
  ]);
  admin = await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'platform_admin' });
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user' });
});

describe('POST /requisitos/mapeamentos/validar', () => {
  it('só platform_admin: consultor e cliente levam 403 e nada muda', async () => {
    for (const h of [consultor, cliente]) expect((await chamar(h, 'POST', '/api/v1/requisitos/mapeamentos/validar', {})).status).toBe(403);
    expect((await estados()).every((e) => e.estado === 'proposto')).toBe(true);
  });

  it('recusa quem validou vindo do corpo (esquema estrito)', async () => {
    const r = await chamar(admin, 'POST', '/api/v1/requisitos/mapeamentos/validar', { validado_por: 'Outra Pessoa' });
    expect(r.status).toBe(400);
    expect((await estados()).every((e) => e.estado === 'proposto')).toBe(true);
  });

  it('resumo conta propostos e validados; consultor lê, cliente não', async () => {
    const r = await json<{ propostos: number; validados: number }>(await chamar(consultor, 'GET', '/api/v1/requisitos/mapeamentos/resumo'));
    expect(r.propostos).toBeGreaterThan(0);
    expect(r.validados).toBe(0);
    expect((await chamar(cliente, 'GET', '/api/v1/requisitos/mapeamentos/resumo')).status).toBe(403);
  });

  it('valida com o e-mail da sessão e a data de hoje, registra a trilha e é idempotente', async () => {
    const antes = await json<{ propostos: number }>(await chamar(admin, 'GET', '/api/v1/requisitos/mapeamentos/resumo'));
    const r = await json<{ validados: number; propostos_restantes: number; validados_total: number }>(await chamar(admin, 'POST', '/api/v1/requisitos/mapeamentos/validar', {}));
    expect(r.validados).toBe(antes.propostos);
    expect(r.propostos_restantes).toBe(0);
    expect(r.validados_total).toBe(antes.propostos);
    const linha = await env.DB.prepare(`SELECT validado_por, validado_em FROM requisito_mapeamentos LIMIT 1`).first<{ validado_por: string; validado_em: string }>();
    expect(linha!.validado_por).toBe('adm@ness.lat');
    expect(linha!.validado_em).toBe(new Date().toISOString().slice(0, 10));
    const trilha = await env.DB.prepare(`SELECT count(*) AS n FROM audit_logs WHERE action = 'requisitos.mapeamento' AND actor = 'adm@ness.lat'`).first<{ n: number }>();
    expect(trilha!.n).toBeGreaterThan(0);
    const de_novo = await json<{ validados: number }>(await chamar(admin, 'POST', '/api/v1/requisitos/mapeamentos/validar', {}));
    expect(de_novo.validados).toBe(0);
  });

  it('o agente MCP não chama', async () => {
    const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'vl-proj', concessaoId: 'c-vl' };
    expect((await chamar({}, 'POST', '/api/v1/requisitos/mapeamentos/validar', {}, { AGENTE })).status).toBe(403);
    expect((await chamar({}, 'GET', '/api/v1/requisitos/gdpr-bases', undefined, { AGENTE })).status).toBe(200);
  });
});

describe('GET /requisitos/gdpr-bases', () => {
  it('devolve as seis bases, para qualquer papel', async () => {
    for (const h of [admin, consultor, cliente]) {
      const r = await json<{ id: string; rotulo: string; texto: string }[]>(await chamar(h, 'GET', '/api/v1/requisitos/gdpr-bases'));
      expect(r.map((b) => b.id).sort()).toEqual(Object.keys(BASES_GDPR).sort());
      expect(r).toHaveLength(6);
    }
  });
});

describe('GET /requisitos?fonte= traz o selo de validação', () => {
  it('requisito com mapeamento validado devolve quem e quando; sem mapeamento, nulo', async () => {
    const lista = await json<{ id: string; validado_por: string | null; validado_em: string | null }[]>(await chamar(cliente, 'GET', '/api/v1/requisitos?fonte=lgpd'));
    const com = lista.filter((r) => r.validado_por);
    expect(com.length).toBeGreaterThan(0);
    expect(com[0].validado_por).toBe('adm@ness.lat');
    expect(lista.some((r) => !r.validado_por)).toBe(true);
  });
});
