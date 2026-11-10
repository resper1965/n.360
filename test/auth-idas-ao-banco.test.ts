import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * #369: o D1 fica longe do usuário (ENAM) e cada consulta é uma viagem. O authMiddleware faz as leituras de toda requisição
 * (organização suspensa, documentos legais e aceites, política do projeto e TOTP) num batch só. Este teste conta as viagens
 * ao D1 de uma requisição simples (o sino) e reprova se o middleware voltar a consultar uma a uma. Dados fictícios.
 */
const ORG = 'ib-org', P = 'ib-proj';

/** O D1 real, contando as viagens: cada first/all/run/raw de um statement e cada batch. */
function contador() {
  const real = env.DB;
  const ida = { n: 0 };
  const reais = new WeakMap<object, D1PreparedStatement>();
  const embrulha = (s: D1PreparedStatement): D1PreparedStatement => {
    const p = new Proxy(s, {
      get(alvo, k) {
        if (k === 'bind') return (...a: unknown[]) => embrulha(alvo.bind(...a));
        if (k === 'first' || k === 'all' || k === 'run' || k === 'raw') return (...a: unknown[]) => { ida.n++; return (alvo as any)[k](...a); };
        const v = (alvo as any)[k];
        return typeof v === 'function' ? v.bind(alvo) : v;
      },
    });
    reais.set(p, s);
    return p;
  };
  const db = new Proxy(real, {
    get(alvo, k) {
      if (k === 'prepare') return (sql: string) => embrulha(alvo.prepare(sql));
      if (k === 'batch') return (stmts: D1PreparedStatement[]) => { ida.n++; return alvo.batch(stmts.map((s) => reais.get(s) ?? s)); };
      const v = (alvo as any)[k];
      return typeof v === 'function' ? v.bind(alvo) : v;
    },
  });
  return { db, ida };
}

const sino = async (h: Record<string, string>) => {
  const { db, ida } = contador();
  const r = await worker.fetch(new Request('http://localhost/api/v1/notifications', { headers: h }), { ...workerEnv(), DB: db } as any);
  return { status: r.status, idas: ida.n };
};

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO organizations (id, name, slug, status) VALUES (?1, 'Consultoria', ?1, 'Active')`).bind(ORG),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'LGPD', 'Controller', 'Active', ?)`).bind(P, ORG),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('ib-cons', 'cons@ib.lat', 'x', 'Cons', 'consultor', NULL, ?1),
      ('ib-cli', 'cli@ib.lat', 'x', 'Cli', 'org_admin', ?2, ?1)`).bind(ORG, P),
    env.DB.prepare(`INSERT INTO legal_documents (id, kind, version, classification, title, url, published_at) VALUES ('ib-termo', 'terms', '1', 'comum', 'Termos', NULL, datetime('now'))`),
    env.DB.prepare(`INSERT INTO project_security_policy (project_id, mfa_obrigatorio) VALUES (?, 0)`).bind(P),
  ]);
});

describe('viagens ao D1 por requisição (#369)', () => {
  it('consultor de outra consultoria (checa a suspensão e os documentos legais): o middleware faz uma viagem só', async () => {
    const r = await sino(await sessionFor({ id: 'ib-cons', email: 'cons@ib.lat', role: 'consultor', org_id: ORG }));
    expect(r.status).toBe(200);
    expect(r.idas).toBeLessThanOrEqual(2); // o batch do middleware e a consulta do sino
  });

  it('cliente com política de segurança no projeto (lê também a política e o TOTP): ainda uma viagem só no middleware', async () => {
    const r = await sino(await sessionFor({ id: 'ib-cli', email: 'cli@ib.lat', role: 'org_admin', client_project_id: P, org_id: ORG }));
    expect(r.status).toBe(200);
    expect(r.idas).toBeLessThanOrEqual(2);
  });

  it('consultoria suspensa continua barrada (403) pelo mesmo batch', async () => {
    await env.DB.prepare(`UPDATE organizations SET status = 'Suspended' WHERE id = ?`).bind(ORG).run();
    const r = await sino(await sessionFor({ id: 'ib-cons', email: 'cons@ib.lat', role: 'consultor', org_id: ORG }));
    expect(r.status).toBe(403);
    await env.DB.prepare(`UPDATE organizations SET status = 'Active' WHERE id = ?`).bind(ORG).run();
  });
});
