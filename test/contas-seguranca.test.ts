import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, resetData, resetSessions, workerEnv, sessionFor } from './helpers/d1';
import { provisionar } from '../src/sso';

/**
 * Três brechas da gestão de contas (spike de 11/10/2026):
 * 1. conta desativada (SCIM ou tela) ainda entrava pelo SSO;
 * 2. "esqueci a senha" criava senha local para conta de SSO/SCIM ou desativada, pulando o IdP;
 * 3. sem trava do último platform_admin, e um org_admin trocava a senha de outro org_admin.
 */
const SENHA = 'Senha-forte-123!';
const NOVA = 'Outra-senha-forte-456!';
const A = 'proj-a';
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...headers },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv() as any);
const hashDe = async (id: string) => (await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(id).first<{ password_hash: string }>())?.password_hash;
const codigos = async () => (await env.SESSIONS.list({ prefix: 'reset_token:' })).keys.length;

beforeEach(async () => {
  await applySchema();
  await resetData();
  await resetSessions();
  const h = await hashPassword(SENHA);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Cliente A', 'ISO 27001', 'controller', 'Active')`).bind(A),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id, ativo) VALUES
      ('u-sso','sso@cliente.com','sso:sem-senha-local','SSO','org_user',?,'org_ness',1),
      ('u-scim','scim@cliente.com','scim:sem-senha-local','SCIM','org_user',?,'org_ness',1),
      ('u-off','off@cliente.com',?,'Off','org_user',?,'org_ness',0),
      ('u-ok','ok@cliente.com',?,'Ok','org_user',?,'org_ness',1),
      ('u-oa1','oa1@cliente.com',?,'OA1','org_admin',?,'org_ness',1),
      ('u-oa2','oa2@cliente.com',?,'OA2','org_admin',?,'org_ness',1),
      ('u-pa','pa@ness.lat',?,'PA','platform_admin',NULL,'org_ness',1),
      ('u-pa-off','paoff@ness.lat',?,'PA off','platform_admin',NULL,'org_ness',0)`)
      .bind(A, A, h, A, h, A, h, A, h, A, h, h),
  ]);
});

describe('1. SSO não reabre conta desativada', () => {
  const cfg = { project_id: A, issuer: 'https://idp.exemplo.com', client_id: 'c', client_secret: 'x', dominios: 'cliente.com', papel_padrao: 'org_user', ativo: 1 };
  const claims = (email: string) => ({ iss: cfg.issuer, aud: 'c', exp: 0, iat: 0, sub: 's', email, email_verified: true, name: 'P' } as any);

  it('conta com ativo = 0 é recusada; a ativa entra', async () => {
    await expect(provisionar(env as any, cfg, claims('off@cliente.com'))).rejects.toThrow(/desativada/i);
    await expect(provisionar(env as any, cfg, claims('ok@cliente.com'))).resolves.toMatchObject({ id: 'u-ok', criado: false });
  });
});

describe('2. recuperação de senha só para conta com senha local e ativa', () => {
  it('SSO, SCIM e desativada: mesma resposta genérica, nenhum código gerado', async () => {
    for (const email of ['sso@cliente.com', 'scim@cliente.com', 'off@cliente.com']) {
      const r = await chamar('POST', '/api/v1/auth/forgot-password', {}, { email });
      expect(r.status, email).toBe(200);
      expect(((await r.json()) as any).reset_token, email).toBeUndefined();
    }
    expect(await codigos()).toBe(0);
    await chamar('POST', '/api/v1/auth/forgot-password', {}, { email: 'ok@cliente.com' });
    expect(await codigos()).toBe(1);
  });

  it('código emitido antes de a conta virar SSO ou ser desativada não troca a senha', async () => {
    for (const [id, email] of [['u-sso', 'sso@cliente.com'], ['u-off', 'off@cliente.com']]) {
      const antes = await hashDe(id);
      await env.SESSIONS.put('reset_token:123456', JSON.stringify({ email }), { expirationTtl: 3600 });
      const r = await chamar('POST', '/api/v1/auth/reset-password', {}, { token: '123456', newPassword: NOVA });
      expect(r.status, email).toBe(400);
      expect(await hashDe(id), email).toBe(antes);
    }
  });
});

describe('3. travas de administrador', () => {
  it('o último platform_admin ativo não é apagado nem rebaixado', async () => {
    const pa = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin', org_id: 'org_ness' });
    expect((await chamar('PUT', '/api/v1/users/u-pa', pa, { role: 'consultor' })).status).toBe(409);
    expect((await chamar('DELETE', '/api/v1/users/u-pa', pa)).status).toBe(409);
    expect((await env.DB.prepare(`SELECT role FROM users WHERE id = 'u-pa'`).first<{ role: string }>())!.role).toBe('platform_admin');
    // com outro platform_admin ativo, pode (rebaixar esbarraria no limite do plano da org de teste, que não existe)
    await env.DB.prepare(`UPDATE users SET ativo = 1 WHERE id = 'u-pa-off'`).run();
    expect((await chamar('DELETE', '/api/v1/users/u-pa', pa)).status).toBe(200);
  });

  it('org_admin não troca a senha de outro org_admin; troca a do próprio usuário comum', async () => {
    const oa1 = await sessionFor({ id: 'u-oa1', email: 'oa1@cliente.com', role: 'org_admin', client_project_id: A });
    const antes = await hashDe('u-oa2');
    expect((await chamar('PUT', '/api/v1/users/u-oa2', oa1, { password: NOVA })).status).toBe(403);
    expect(await hashDe('u-oa2')).toBe(antes);
    expect((await chamar('PUT', '/api/v1/users/u-ok', oa1, { password: NOVA })).status).toBe(200);
  });
});
