import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

// Onda 4, PR5: o assistente encadeado só usa rotas que já existem. Este arquivo trava o que ele precisa delas:
// P0-1 (ot nunca por padrão; só marcado), a organização direta sem conta de cliente (onda 1, decisão 8) e a designação do consultor.
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, h: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv() as any);
const modulosDe = async (email: string) => (await env.DB.prepare(`SELECT m.modulo FROM usuario_modulos m JOIN users u ON u.id = m.user_id WHERE u.email = ? ORDER BY m.modulo`).bind(email).all<{ modulo: string }>()).results.map((r) => r.modulo);
const S: Record<string, Record<string, string>> = {};
const P: Record<string, string> = {};

async function orgComAdmin(tipo: 'consultoria' | 'direta', slug: string, o: { modulos?: string[]; projeto?: string[]; maxUsuarios?: number } = {}) {
  const r = await chamar('POST', '/api/v1/platform/orgs', S.pa, { nome: `Org ${slug}`, slug, adminEmail: `admin@${slug}.lat`, adminNome: 'Admin', tipo,
    modulos: o.modulos ?? ['iso', 'privacy', 'ot'], maxProjetos: 5, maxUsuarios: o.maxUsuarios ?? 20, termoVersao: 'v1', ...(tipo === 'consultoria' ? { prefixoProposta: slug.slice(0, 3).toUpperCase() } : {}) });
  expect(r.status).toBe(201);
  const admin = await env.DB.prepare(`SELECT id, org_id FROM users WHERE email = ?`).bind(`admin@${slug}.lat`).first<{ id: string; org_id: string }>();
  S[slug] = await sessionFor({ id: admin!.id, email: `admin@${slug}.lat`, role: 'consultoria_admin', org_id: admin!.org_id });
  const pj = await chamar('POST', '/api/v1/projects', S[slug], { client_name: `Cliente ${slug}`, modulos: o.projeto ?? ['iso', 'privacy', 'ot'] });
  expect(pj.status).toBe(201);
  P[slug] = ((await pj.json()) as { id: string }).id;
}

afterEach(() => vi.restoreAllMocks());
// As organizações e projetos são só configuração (ninguém os altera nos testes); cada caso usa e-mails próprios, então roda sozinho com -t.
beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id, ativo) VALUES ('u-pa4', 'pa4@ness.lat', 'x', 'PA', 'platform_admin', 'org_ness', 1)`).run();
  S.pa = await sessionFor({ id: 'u-pa4', email: 'pa4@ness.lat', role: 'platform_admin' });
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}'));
  await orgComAdmin('consultoria', 'cons-on4');
  await orgComAdmin('direta', 'dir-on4');
  await orgComAdmin('consultoria', 'sem-ot4', { modulos: ['iso', 'privacy'], projeto: ['iso'] }); // contrato e projeto sem o ot
  await orgComAdmin('consultoria', 'lim-on4', { maxUsuarios: 1 }); // o admin já ocupa a única vaga de equipe
});

const convidar = (slug: string, corpo: Record<string, unknown>) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}'));
  return chamar('POST', '/api/v1/users', S[slug], corpo);
};
const cliente = (slug: string, email: string, modulos?: string[]) =>
  convidar(slug, { name: 'Cliente', email, role: 'org_admin', client_project_id: P[slug], ...(modulos ? { modulos } : {}) });
const equipe = (slug: string, email: string, modulos?: string[]) =>
  convidar(slug, { name: 'Equipe', email, role: 'consultor', ...(modulos ? { modulos } : {}) });

describe('P0-1: o padrão do gatilho nunca dá o ot (arrays exatos)', () => {
  for (const slug of ['cons-on4', 'dir-on4']) {
    it(`${slug}: equipe sem \`modulos\` recebe só o padrão do contrato (iso, privacy), com o ot contratado`, async () => {
      expect((await equipe(slug, `eq-pad@${slug}.lat`)).status).toBe(201);
      expect(await modulosDe(`eq-pad@${slug}.lat`)).toEqual(['iso', 'privacy']);
    });
  }
  it('cons-on4: cliente sem `modulos`, em projeto com o ot, recebe só iso e privacy', async () => {
    expect((await cliente('cons-on4', 'cli-pad@cliente.lat')).status).toBe(201);
    expect(await modulosDe('cli-pad@cliente.lat')).toEqual(['iso', 'privacy']);
  });
  it('dir-on4: a conta de cliente é recusada e nada é criado', async () => {
    const r = await cliente('dir-on4', 'cli@dir-on4.lat', ['iso']);
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toMatch(/direta/);
    expect(await env.DB.prepare(`SELECT 1 AS x FROM users WHERE email = 'cli@dir-on4.lat'`).first()).toBeNull();
  });
});

describe('Pessoas e acessos: o que as rotas garantem', () => {
  it('o ot só entra marcado, com trilha `usuario.modulos`; resposta 201 com emailEnviado', async () => {
    const r = await equipe('cons-on4', 'eq-ot@cons-on4.lat', ['iso', 'ot']);
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ email: 'eq-ot@cons-on4.lat', role: 'consultor', emailEnviado: true }); // equipe: `client_project_id` vem ausente (undefined), não null
    expect(await modulosDe('eq-ot@cons-on4.lat')).toEqual(['iso', 'ot']);
    expect(await env.DB.prepare(`SELECT 1 AS x FROM audit_logs WHERE action = 'usuario.modulos' AND details LIKE '%eq-ot@cons-on4.lat%'`).first()).not.toBeNull();
  });
  it('cliente marcado: presa ao projeto, com exatamente os módulos marcados', async () => {
    const r = await cliente('cons-on4', 'cli-marc@cliente.lat', ['iso']);
    expect(r.status).toBe(201);
    expect(((await r.json()) as { client_project_id: string }).client_project_id).toBe(P['cons-on4']);
    expect(await modulosDe('cli-marc@cliente.lat')).toEqual(['iso']);
  });
  it('equipe da direta passa, com o padrão', async () => {
    expect((await equipe('dir-on4', 'eq-dir@dir-on4.lat', ['iso'])).status).toBe(201);
    expect(await modulosDe('eq-dir@dir-on4.lat')).toEqual(['iso']);
  });
});

describe('teto de módulos (tetoDaConta): vem da conta que se cria', () => {
  it('cliente com o ot num projeto SEM o ot: 400 e nada criado', async () => {
    const r = await cliente('sem-ot4', 'cli-teto@cliente.lat', ['ot']);
    expect(r.status).toBe(400);
    expect(await env.DB.prepare(`SELECT 1 AS x FROM users WHERE email = 'cli-teto@cliente.lat'`).first()).toBeNull();
  });
  it('equipe com o ot em organização que não o contrata: 400 e nada criado', async () => {
    const r = await equipe('sem-ot4', 'eq-teto@sem-ot4.lat', ['iso', 'ot']);
    expect(r.status).toBe(400);
    expect(await env.DB.prepare(`SELECT 1 AS x FROM users WHERE email = 'eq-teto@sem-ot4.lat'`).first()).toBeNull();
  });
  it('regra real: só o teto da conta nova conta; os módulos de quem convida não são conferidos', async () => {
    // O consultoria_admin de cons-on4 não tem o `ot` em `usuario_modulos` (o gatilho nunca o dá) e mesmo assim pode marcá-lo,
    // porque a organização o contrata. Quem precisa de trava a mais é o fluxo (P0-1: só marcado), não a rota.
    expect(await modulosDe('admin@cons-on4.lat')).not.toContain('ot');
    expect((await equipe('cons-on4', 'eq-teto-ok@cons-on4.lat', ['ot'])).status).toBe(201);
    expect(await modulosDe('eq-teto-ok@cons-on4.lat')).toEqual(['ot']);
  });
});

describe('o que o assistente encadeado repete ou reenvia', () => {
  it('limite de equipe do plano: 409', async () => {
    const r = await equipe('lim-on4', 'eq@lim-on4.lat');
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: string }).error).toMatch(/Limite de usuários/);
  });
  it('convite repetido (mesmo e-mail, até com outra caixa): 400 e uma conta só', async () => {
    expect((await equipe('cons-on4', 'repete@cons-on4.lat')).status).toBe(201);
    const r = await equipe('cons-on4', 'REPETE@cons-on4.lat');
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toBe('Email já cadastrado');
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE lower(email) = 'repete@cons-on4.lat'`).first<{ n: number }>())!.n).toBe(1);
  });
});

describe('designação do consultor (governança)', () => {
  for (const slug of ['cons-on4', 'dir-on4']) {
    it(`${slug}: o admin designa o consultor convidado no projeto: 200 {ok:true} e a linha existe`, async () => {
      const email = `desig@${slug}.lat`;
      expect((await equipe(slug, email)).status).toBe(201);
      const r = await chamar('POST', `/api/v1/projects/${P[slug]}/governance`, S[slug], { name: 'Consultor', email, role_category: 'consultor', job_title: 'Consultor' });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ ok: true });
      expect(await env.DB.prepare(`SELECT 1 AS x FROM project_governance WHERE project_id = ? AND email = ? AND role_category = 'consultor'`).bind(P[slug], email).first()).not.toBeNull();
    });
  }
});
