import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

// O KV SESSIONS guarda outras coisas além de sessões. Só `session_<token>` com conta, papel e carimbo é sessão.
const me = (token: string) =>
  app.fetch(new Request('https://n360.ness.com.br/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } }), workerEnv());

describe('sessão só pela chave própria', () => {
  beforeAll(applySchema);

  it('chave sem o prefixo session_ não é sessão', async () => {
    await env.SESSIONS.put('qualquer_registro', JSON.stringify({ email: 'a@b.lat' }));
    expect((await me('qualquer_registro')).status).toBe(401);
  });

  it('registro sob session_ sem conta, papel ou carimbo é recusado', async () => {
    await env.SESSIONS.put('session_sem-conta', JSON.stringify({ email: 'a@b.lat', iat: Date.now() }));
    expect((await me('sem-conta')).status).toBe(401);
  });

  it('sessão normal continua valendo', async () => {
    const h = await sessionFor({ id: 'u-ok', email: 'ok@b.lat', role: 'platform_admin', name: 'Ok' });
    const token = h.Authorization.replace('Bearer ', '');
    expect((await me(token)).status).toBe(200);
  });
});
