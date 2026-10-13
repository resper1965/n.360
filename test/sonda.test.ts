import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData, workerEnv } from './helpers/d1';
import { sondaInterna, CRON_SONDA } from '../src/services/sonda';
import worker from '../src/index';
import wrangler from '../wrangler.jsonc?raw';

/**
 * Sonda interna (src/services/sonda.ts). D1 e KV reais; a falha é injetada só no binding que
 * cai (R2 com `head` que lança). O que importa: um alerta por incidente, não um a cada 15 minutos.
 */

type Email = { to: string[]; subject: string; html: string };
let emails: Email[];

/** Um R2 de mentira que responde, e um que não responde. TRILHA não existe no wrangler.test.jsonc. */
const r2Ok = { head: async () => null } as unknown as R2Bucket;
const r2Fora = { head: async () => { throw new Error('R2 indisponível'); } } as unknown as R2Bucket;

const base = (extra: Record<string, unknown> = {}) => ({
  ...workerEnv(),
  TRILHA: r2Ok,
  RESEND_API_KEY: 'chave-de-teste',
  ALERTA_EMAIL: 'operacao@exemplo.com',
  ...extra,
});

describe('sonda interna', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
    await env.SESSIONS.delete('sonda:estado');
    await env.OAUTH_KV.delete('sonda:estado');
    emails = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (_u: RequestInfo | URL, init?: RequestInit) => {
      emails.push(JSON.parse(String(init?.body)));
      return new Response('{}', { status: 200 });
    }) as typeof fetch);
  });
  afterEach(() => vi.restoreAllMocks());

  it('tudo respondendo: nenhum alerta, nenhum e-mail', async () => {
    const r = await sondaInterna(base());
    expect(r).toEqual({ falhas: [], alerta: null });
    expect(emails).toHaveLength(0);
  });

  it('falha alerta uma vez; a falha repetida não repete; a volta avisa uma vez', async () => {
    const fora = base({ STORAGE: r2Fora });

    const r1 = await sondaInterna(fora);
    expect(r1.alerta).toBe('queda');
    expect(r1.falhas).toEqual(['R2 STORAGE: R2 indisponível']);
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toEqual(['operacao@exemplo.com']);
    expect(emails[0].subject).toContain('sem resposta');
    expect(emails[0].html).toContain('R2 STORAGE');

    expect((await sondaInterna(fora)).alerta).toBeNull();
    expect((await sondaInterna(fora)).alerta).toBeNull();
    expect(emails).toHaveLength(1);

    expect((await sondaInterna(base())).alerta).toBe('volta');
    expect(emails).toHaveLength(2);
    expect(emails[1].subject).toContain('de novo');

    expect((await sondaInterna(base())).alerta).toBeNull();
    expect(emails).toHaveLength(2);
  });

  it('KV fora: o estado no outro KV segura o alerta repetido', async () => {
    const kvFora = { get: async () => { throw new Error('KV indisponível'); }, put: async () => { throw new Error('KV indisponível'); }, delete: async () => {} };
    const fora = base({ SESSIONS: kvFora });
    expect((await sondaInterna(fora)).falhas).toEqual(['KV SESSIONS: KV indisponível']);
    await sondaInterna(fora);
    expect(emails).toHaveLength(1);
  });

  it('e-mail recusado: não marca o incidente, e a próxima rodada tenta de novo', async () => {
    vi.mocked(globalThis.fetch).mockImplementation((async () => new Response('{}', { status: 500 })) as typeof fetch);
    const fora = base({ STORAGE: r2Fora });
    expect((await sondaInterna(fora)).alerta).toBeNull();
    expect(await env.SESSIONS.get('sonda:estado')).toBeNull();
  });

  it('sem ALERTA_EMAIL: só log, nenhum envio', async () => {
    const r = await sondaInterna(base({ STORAGE: r2Fora, ALERTA_EMAIL: undefined }));
    expect(r.alerta).toBe('queda');
    expect(emails).toHaveLength(0);
  });

  it('o log de falha não leva o endereço de destino', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    await sondaInterna(base({ STORAGE: r2Fora }));
    const linhas = erro.mock.calls.map((c) => String(c[0])).join('\n');
    expect(linhas).toContain('sonda_interna');
    expect(linhas).not.toContain('operacao@exemplo.com');
  });

  it('o cron da sonda roda a sonda, e não a manutenção', async () => {
    await env.DB.prepare('INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)')
      .bind('velho', Math.floor(Date.now() / 1000) - 30 * 86400).run();
    const pendentes: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => { pendentes.push(p); }, passThroughOnException() {} } as unknown as ExecutionContext;
    worker.scheduled({ cron: CRON_SONDA, scheduledTime: Date.now(), noRetry() {} } as ScheduledController, base({ STORAGE: r2Fora }) as any, ctx);
    await Promise.all(pendentes);
    expect(emails).toHaveLength(1);
    expect(await env.DB.prepare(`SELECT key FROM rate_limits WHERE key = 'velho'`).first()).not.toBeNull();
  });

  it('wrangler.jsonc agenda o cron da sonda', () => {
    expect(CRON_SONDA).toBe('*/15 * * * *');
    expect(wrangler).toContain(`"${CRON_SONDA}"`);
  });
});
