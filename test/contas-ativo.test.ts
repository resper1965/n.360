import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, resetData, resetSessions, workerEnv, sessionFor } from './helpers/d1';
import { provisionar } from '../src/sso';

/**
 * Desativar no lugar de apagar (Task 2.1): a conta some do acesso, não do banco, e a trilha guarda
 * quem desativou, quem entrou e o que mudou. Conta desativada não entra por caminho nenhum: senha,
 * SSO, sessão já aberta ou agente MCP. (Chave de API é do PROJETO, não da pessoa: não há chave
 * "própria" a cortar; ver `api_keys` no schema.sql.)
 */
const SENHA = 'Senha-forte-123!';
const A = 'proj-a';
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...headers },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv() as any);
const ativoDe = async (id: string) =>
  (await env.DB.prepare('SELECT ativo FROM users WHERE id = ?').bind(id).first<{ ativo: number }>())?.ativo;
const trilha = async (acao: string) =>
  (await env.DB.prepare('SELECT * FROM audit_logs WHERE action = ? ORDER BY created_at DESC, rowid DESC').bind(acao).all<any>()).results;
const login = async (email: string, password = SENHA) => {
  const res = await chamar('POST', '/api/v1/auth/login', {}, { email, password });
  return { status: res.status, token: ((await res.json()) as any).token as string };
};

let pa: Record<string, string>;
beforeEach(async () => {
  await applySchema();
  await resetData();
  await resetSessions();
  const h = await hashPassword(SENHA);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO organizations (id, name, slug, max_projects, max_users) VALUES ('org_b', 'Consultoria B', 'consultoria-b', 100, 100)`),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Cliente A', 'ISO 27001', 'controller', 'Active')`).bind(A),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id, ativo) VALUES
      ('u-cli','cli@cliente.com',?,'Cliente','org_user',?,'org_ness',1),
      ('u-pa','pa@ness.lat',?,'PA','platform_admin',NULL,'org_ness',1),
      ('u-ab','ab@b.lat',?,'AB','consultoria_admin',NULL,'org_b',1)`)
      .bind(h, A, h, h),
  ]);
  pa = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin', org_id: 'org_ness' });
});

describe('PUT /users/:id/ativo', () => {
  it('desativa, grava a trilha com o projeto da conta e reativa', async () => {
    const r = await chamar('PUT', '/api/v1/users/u-cli/ativo', pa, { ativo: false });
    expect(r.status).toBe(200);
    expect(await ativoDe('u-cli')).toBe(0);
    const [d] = await trilha('user.desativado');
    expect(d.actor).toBe('pa@ness.lat');
    expect(d.project_id).toBe(A);
    expect(d.details).toContain('cli@cliente.com');

    expect((await chamar('PUT', '/api/v1/users/u-cli/ativo', pa, { ativo: true })).status).toBe(200);
    expect(await ativoDe('u-cli')).toBe(1);
    expect((await trilha('user.reativado'))[0].project_id).toBe(A);

    // A trilha do projeto mostra as duas.
    const t = await (await chamar('GET', `/api/v1/projects/${A}/audit-trail`, pa)).json() as any[];
    expect(t.map((x) => x.action)).toEqual(expect.arrayContaining(['user.desativado', 'user.reativado']));
  });

  it('corpo sem booleano é 400', async () => {
    expect((await chamar('PUT', '/api/v1/users/u-cli/ativo', pa, { ativo: 'nao' })).status).toBe(400);
    expect(await ativoDe('u-cli')).toBe(1);
  });

  it('mesmas guardas da gestão: org_user não desativa ninguém; consultor fora do projeto também não', async () => {
    const cli = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user', client_project_id: A });
    expect((await chamar('PUT', '/api/v1/users/u-pa/ativo', cli, { ativo: false })).status).toBe(403);
    const cons = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
    expect((await chamar('PUT', '/api/v1/users/u-cli/ativo', cons, { ativo: false })).status).toBe(403);
    expect((await chamar('PUT', '/api/v1/users/u-pa/ativo', cons, { ativo: false })).status).toBe(403);
    expect(await ativoDe('u-cli')).toBe(1);
    expect(await ativoDe('u-pa')).toBe(1);
  });

  it('trava do último administrador: não desativa o último platform_admin nem o último consultoria_admin', async () => {
    expect((await chamar('PUT', '/api/v1/users/u-pa/ativo', pa, { ativo: false })).status).toBe(409);
    expect(await ativoDe('u-pa')).toBe(1);
    const ab = await sessionFor({ id: 'u-ab', email: 'ab@b.lat', role: 'consultoria_admin', org_id: 'org_b' });
    expect((await chamar('PUT', '/api/v1/users/u-ab/ativo', ab, { ativo: false })).status).toBe(409);
    expect((await chamar('PUT', '/api/v1/users/u-ab/ativo', pa, { ativo: false })).status).toBe(409);
    expect(await ativoDe('u-ab')).toBe(1);
  });
});

describe('conta desativada não entra por caminho nenhum', () => {
  it('sessão já aberta morre na requisição seguinte', async () => {
    const { token } = await login('cli@cliente.com');
    const h = { Authorization: `Bearer ${token}` };
    expect((await chamar('GET', '/api/v1/auth/me', h)).status).toBe(200);
    expect((await chamar('PUT', '/api/v1/users/u-cli/ativo', pa, { ativo: false })).status).toBe(200);
    expect((await chamar('GET', '/api/v1/auth/me', h)).status).toBe(401);
  });

  it('login por senha é recusado com a resposta de credencial inválida', async () => {
    await chamar('PUT', '/api/v1/users/u-cli/ativo', pa, { ativo: false });
    const r = await login('cli@cliente.com');
    expect(r.status).toBe(401);
    expect(r.token).toBeUndefined();
  });

  it('SSO é recusado', async () => {
    await chamar('PUT', '/api/v1/users/u-cli/ativo', pa, { ativo: false });
    const cfg = { project_id: A, issuer: 'https://idp.exemplo.com', client_id: 'c', client_secret: 'x', dominios: 'cliente.com', papel_padrao: 'org_user', ativo: 1 };
    await expect(provisionar(env as any, cfg as any, { email: 'cli@cliente.com', email_verified: true } as any)).rejects.toThrow(/desativada/i);
  });

  it('agentes MCP da conta são revogados', async () => {
    await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('ag1', 'u-cli', ?, datetime('now', '+30 days'))`).bind(A).run();
    await chamar('PUT', '/api/v1/users/u-cli/ativo', pa, { ativo: false });
    const ag = await env.DB.prepare(`SELECT revogado_em FROM agente_concessoes WHERE id = 'ag1'`).first<{ revogado_em: string | null }>();
    expect(ag?.revogado_em).not.toBeNull();
  });
});

describe('DELETE /users/:id desativa; apagar de fato só com ?definitivo=1 e platform_admin', () => {
  it('DELETE comum desativa e a linha fica', async () => {
    const r = await chamar('DELETE', '/api/v1/users/u-cli', pa);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, desativado: true });
    expect(await ativoDe('u-cli')).toBe(0);
    expect((await trilha('user.desativado'))[0].project_id).toBe(A);
  });

  it('?definitivo=1 apaga para o platform_admin e é recusado para os demais', async () => {
    const ab = await sessionFor({ id: 'u-ab', email: 'ab@b.lat', role: 'consultoria_admin', org_id: 'org_b' });
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-cons-b','c@b.lat','x','C','consultor',NULL,'org_b')`).run();
    expect((await chamar('DELETE', '/api/v1/users/u-cons-b?definitivo=1', ab)).status).toBe(403);
    expect(await ativoDe('u-cons-b')).toBe(1);

    expect((await chamar('DELETE', '/api/v1/users/u-cli?definitivo=1', pa)).status).toBe(200);
    expect(await env.DB.prepare(`SELECT 1 FROM users WHERE id = 'u-cli'`).first()).toBeNull();
    // As travas atuais continuam: o último platform_admin não se apaga.
    expect((await chamar('DELETE', '/api/v1/users/u-pa?definitivo=1', pa)).status).toBe(409);
  });
});

describe('trilha de acessos e de alterações', () => {
  it('login por senha grava auth.login com o projeto; e-mail inexistente não entra na trilha', async () => {
    expect((await login('cli@cliente.com')).status).toBe(200);
    const [l] = await trilha('auth.login');
    expect(l.actor).toBe('cli@cliente.com');
    expect(l.project_id).toBe(A);

    expect((await login('ninguem@nao-existe.com')).status).toBe(401);
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE actor LIKE '%ninguem@nao-existe.com%' OR details LIKE '%ninguem@nao-existe.com%'`).first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it('user.updated grava antes e depois por campo, com o projeto, e nunca a senha', async () => {
    const r = await chamar('PUT', '/api/v1/users/u-cli', pa, { name: 'Novo Nome', password: 'Outra-senha-forte-456!' });
    expect(r.status).toBe(200);
    const linhas = await trilha('user.updated');
    const nome = linhas.find((x: any) => x.field === 'name');
    expect(nome).toMatchObject({ entity_type: 'user', entity_id: 'u-cli', old_value: 'Cliente', new_value: 'Novo Nome', project_id: A });
    for (const x of linhas) {
      expect(String(x.old_value ?? '')).not.toContain('Outra-senha');
      expect(String(x.new_value ?? '')).not.toContain('Outra-senha');
      expect(x.field).not.toBe('password');
    }
    const t = await (await chamar('GET', `/api/v1/projects/${A}/audit-trail`, pa)).json() as any[];
    expect(t.some((x) => x.action === 'user.updated' && x.field === 'name')).toBe(true);
  });
});

describe('trilha de quem sai do projeto e da exclusão', () => {
  it('cliente movido de A para B: a troca aparece na trilha dos DOIS projetos', async () => {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('proj-b', 'Cliente B', 'ISO 27001', 'controller', 'Active')`).run();
    expect((await chamar('PUT', '/api/v1/users/u-cli', pa, { client_project_id: 'proj-b' })).status).toBe(200);
    for (const p of [A, 'proj-b']) {
      const t = await (await chamar('GET', `/api/v1/projects/${p}/audit-trail`, pa)).json() as any[];
      const linha = t.find((x) => x.action === 'user.updated' && x.field === 'client_project_id' && x.entity_id === 'u-cli');
      expect(linha, `trilha de ${p}`).toMatchObject({ old_value: A, new_value: 'proj-b' });
    }
  });

  it('DELETE comum (desativa) não grava registro.excluido; o definitivo grava', async () => {
    const conta = async () => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'registro.excluido' AND details LIKE '%/users/u-cli%'`).first<{ n: number }>())!.n;
    // audit_logs é append-only e sobrevive ao resetData: conta-se a diferença.
    const antes = await conta();
    expect((await chamar('DELETE', '/api/v1/users/u-cli', pa)).status).toBe(200);
    expect(await conta()).toBe(antes);
    expect((await chamar('DELETE', '/api/v1/users/u-cli?definitivo=1', pa)).status).toBe(200);
    expect(await conta()).toBe(antes + 1);
  });
});

describe('GET /users', () => {
  it('devolve ativo', async () => {
    await chamar('PUT', '/api/v1/users/u-cli/ativo', pa, { ativo: false });
    const lista = await (await chamar('GET', '/api/v1/users', pa)).json() as any[];
    expect(lista.find((u) => u.id === 'u-cli').ativo).toBe(false);
    expect(lista.find((u) => u.id === 'u-pa').ativo).toBe(true);
  });
});
