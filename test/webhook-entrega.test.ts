import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { signWebhook, verifyWebhookSignature } from '../src/helpers';
import { entregarEvento } from '../src/services/webhook-entrega';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

/**
 * Entrega de eventos aos webhooks (n.ot desvio, Task 2): só quem assina o evento literalmente recebe, com assinatura, até 3
 * tentativas e sem nunca lançar. O DoH segue o mock da suíte de SSRF (test/ssrf-dns-pinning.test.ts): o mesmo fetch injetado
 * responde a resolução e a entrega.
 */
const P = 'p-wh';
const SEM_ESPERA = { esperas: [0, 0, 0] };

/** DoH simulado: todo host resolve para `ip` (só registro A). */
const doh = (url: string, ip: string) => {
  const tipo = new URL(url).searchParams.get('type');
  return { ok: true, json: async () => ({ Answer: tipo === 'A' ? [{ type: 1, data: ip }] : [] }) } as any;
};

/** fetch simulado: DoH resolve para `ip`; a entrega responde pela fila `respostas` (status, Error ou 'pendura'), depois 200. */
function fetchSimulado(respostas: (number | Error | 'pendura')[] = [], ip = '93.184.216.34') {
  const entregas: { url: string; headers: Record<string, string>; body: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith('https://cloudflare-dns.com/')) return doh(url, ip);
    entregas.push({ url: String(url), headers: init!.headers as Record<string, string>, body: String(init!.body), init: init! });
    const r = respostas.shift() ?? 200;
    if (r instanceof Error) throw r;
    // Receptor pendurado: só termina quando o sinal aborta.
    if (r === 'pendura') return new Promise<Response>((_, rej) => init!.signal!.addEventListener('abort', () => rej(init!.signal!.reason)));
    return new Response(null, { status: r, headers: r >= 300 && r < 400 ? { Location: 'https://outro.example/x' } : {} });
  });
  return { fn: fn as unknown as typeof fetch, entregas, mock: fn };
}

const linha = (id: string) => env.DB.prepare('SELECT failure_count, last_triggered_at FROM webhooks WHERE id = ?').bind(id).first<any>();

async function semear(webhooks: [id: string, url: string, events: string, status?: string, secret?: string][]) {
  await env.DB.prepare('DELETE FROM webhooks').run();
  await env.DB.batch(webhooks.map(([id, url, events, status = 'Active', secret = 'seg-' + id]) =>
    env.DB.prepare(`INSERT INTO webhooks (id, project_id, url, events, secret, status, failure_count) VALUES (?, ?, ?, ?, ?, ?, 0)`)
      .bind(id, P, url, events, secret, status)));
}

beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'W', 'ISO 27001', 'controller', 'Active')`).bind(P).run();
});

describe('entregarEvento', () => {
  it('entrega só a quem assina ot.desvio literalmente: nem curinga, nem ot.desvio.x, nem inativo', async () => {
    await semear([
      ['w-ok', 'https://a.example/h', 'risk.created, ot.desvio'],
      ['w-curinga', 'https://b.example/h', '*'],
      ['w-prefixo', 'https://c.example/h', 'ot.desvio.x'],
      ['w-inativo', 'https://d.example/h', 'ot.desvio', 'Inactive'],
    ]);
    const f = fetchSimulado();
    expect(await entregarEvento(env as any, P, 'ot.desvio', { itens: [] }, { ...SEM_ESPERA, fetchFn: f.fn })).toEqual({ entregues: 1, falhas: 0 });
    expect(f.entregas.map(e => e.url)).toEqual(['https://a.example/h']);
    expect((await linha('w-ok')).last_triggered_at).toBeTruthy();
    expect((await linha('w-curinga')).last_triggered_at).toBeNull();
  });

  it('corpo leva o do chamador mais o envelope, e a assinatura confere com signWebhook', async () => {
    await semear([['w-sig', 'https://a.example/h', 'ot.desvio']]);
    const f = fetchSimulado();
    await entregarEvento(env as any, P, 'ot.desvio', { itens: [{ chave: 'k' }], event: 'forjado' }, { ...SEM_ESPERA, fetchFn: f.fn });
    const { body, headers } = f.entregas[0];
    expect(JSON.parse(body)).toMatchObject({ itens: [{ chave: 'k' }], event: 'ot.desvio', project_id: P });
    expect(JSON.parse(body).event_id).toBeTruthy();
    const t = Number(headers['X-nISO-Signature'].match(/t=(\d+)/)![1]);
    expect(headers['X-nISO-Signature']).toBe(await signWebhook('seg-w-sig', body, t));
    expect(await verifyWebhookSignature('seg-w-sig', body, headers['X-nISO-Signature'])).toBe(true);
  });

  it('2 falhas e depois sucesso → 1 entregue, failure_count inalterado, mesmo event_id', async () => {
    await semear([['w-retry', 'https://a.example/h', 'ot.desvio']]);
    const f = fetchSimulado([new Error('caiu'), 503, 200]);
    expect(await entregarEvento(env as any, P, 'ot.desvio', {}, { ...SEM_ESPERA, fetchFn: f.fn })).toEqual({ entregues: 1, falhas: 0 });
    expect(f.entregas).toHaveLength(3);
    expect(new Set(f.entregas.map(e => JSON.parse(e.body).event_id)).size).toBe(1);
    expect((await linha('w-retry')).failure_count).toBe(0);
  });

  it('3 falhas → failure_count + 1, sem lançar', async () => {
    await semear([['w-falha', 'https://a.example/h', 'ot.desvio']]);
    const f = fetchSimulado([500, new Error('x'), 500, 200]);
    expect(await entregarEvento(env as any, P, 'ot.desvio', {}, { ...SEM_ESPERA, fetchFn: f.fn })).toEqual({ entregues: 0, falhas: 1 });
    expect(f.entregas).toHaveLength(3);
    expect((await linha('w-falha')).failure_count).toBe(1);
  });

  it('URL interna → não chama fetchFn', async () => {
    await semear([['w-interno', 'http://169.254.169.254/latest', 'ot.desvio']]);
    const f = fetchSimulado();
    expect(await entregarEvento(env as any, P, 'ot.desvio', {}, { ...SEM_ESPERA, fetchFn: f.fn })).toEqual({ entregues: 0, falhas: 1 });
    expect(f.mock).not.toHaveBeenCalled();
  });

  it('receptor pendurado → estoura o tempo limite, conta falha e resolve', async () => {
    await semear([['w-pendura', 'https://a.example/h', 'ot.desvio']]);
    const f = fetchSimulado(['pendura', 'pendura', 'pendura']);
    expect(await entregarEvento(env as any, P, 'ot.desvio', {}, { ...SEM_ESPERA, tempoLimiteMs: 20, fetchFn: f.fn })).toEqual({ entregues: 0, falhas: 1 });
    expect(f.entregas).toHaveLength(3);
    expect((await linha('w-pendura')).failure_count).toBe(1);
  });

  it('302 → falha, sem seguir o Location (redirect manual)', async () => {
    await semear([['w-302', 'https://a.example/h', 'ot.desvio']]);
    const f = fetchSimulado([302, 302, 302]);
    expect(await entregarEvento(env as any, P, 'ot.desvio', {}, { ...SEM_ESPERA, fetchFn: f.fn })).toEqual({ entregues: 0, falhas: 1 });
    expect(f.entregas.map(e => e.url)).toEqual(Array(3).fill('https://a.example/h'));
    expect(f.entregas.every(e => e.init.redirect === 'manual')).toBe(true);
    expect((await linha('w-302')).failure_count).toBe(1);
  });

  it('host que resolve para IP interno → não entrega', async () => {
    await semear([['w-rebind', 'https://rebind.example/h', 'ot.desvio']]);
    const f = fetchSimulado([], '10.0.0.5');
    expect(await entregarEvento(env as any, P, 'ot.desvio', {}, { ...SEM_ESPERA, fetchFn: f.fn })).toEqual({ entregues: 0, falhas: 1 });
    expect(f.entregas).toHaveLength(0);
  });

  it('banco indisponível → não lança', async () => {
    const f = fetchSimulado();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await entregarEvento({ DB: undefined } as any, P, 'ot.desvio', {}, { ...SEM_ESPERA, fetchFn: f.fn })).toEqual({ entregues: 0, falhas: 0 });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('cadastro de webhook com ot.desvio', () => {
  const criar = async (sessao: Record<string, string>, events: string) =>
    app.fetch(new Request(`http://localhost/api/v1/projects/${P}/webhooks`, {
      method: 'POST', headers: { ...sessao, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://a.example/h', events }),
    }), workerEnv());

  it('quem vê mascarado (platform_admin) → 403; quem vê completo (Gestor ARCiber) → 201', async () => {
    const mascarado = await sessionFor({ id: 'u-pa', email: 'pa@x.com', role: 'platform_admin' });
    const completo = await sessionFor({ id: 'u-ga', email: 'ga@x.com', role: 'org_admin', client_project_id: P });
    const r = await criar(mascarado, 'risk.created, ot.desvio');
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: 'O evento ot.desvio exige ver o inventário completo do n.ot' });
    expect((await criar(mascarado, 'ot.desvio.x')).status).toBe(201);
    expect((await criar(completo, 'ot.desvio')).status).toBe(201);
  });
});

describe('POST /api/v1/webhooks/test/:id (resposta inalterada)', () => {
  let sessao: Record<string, string>;
  let espiao: ReturnType<typeof vi.spyOn>;
  const testar = () => app.fetch(new Request('http://localhost/api/v1/webhooks/test/w-teste', { method: 'POST', headers: sessao }), workerEnv());

  beforeAll(async () => { sessao = await sessionFor({ id: 'u-ga', email: 'ga@x.com', role: 'org_admin', client_project_id: P }); });
  beforeEach(async () => { await semear([['w-teste', 'https://93.184.216.34/h', 'risk.created']]); });
  afterEach(() => espiao.mockRestore());

  it('sucesso → { ok: true, status } com o corpo de teste assinado e last_triggered_at gravado', async () => {
    espiao = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const r = await testar();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, status: 204 });
    const [, init] = espiao.mock.calls[0] as [string, RequestInit];
    const corpo = JSON.parse(String(init.body));
    expect(Object.keys(corpo)).toEqual(['event', 'event_id', 'project_id', 'timestamp']);
    expect(corpo).toMatchObject({ event: 'test', project_id: P });
    expect(await verifyWebhookSignature('seg-w-teste', String(init.body), (init.headers as any)['X-nISO-Signature'])).toBe(true);
    expect((await linha('w-teste')).last_triggered_at).toBeTruthy();
  });

  it('destino fora → 502 com request_id e failure_count + 1', async () => {
    espiao = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('caiu'));
    const r = await testar();
    expect(r.status).toBe(502);
    expect(await r.json()).toMatchObject({ ok: false, error: 'Falha ao disparar o webhook de teste', request_id: expect.any(String) });
    expect((await linha('w-teste')).failure_count).toBe(1);
  });

  it('302 → mesma forma de resposta de um não-2xx: { ok: true, status: 302 }, sem seguir', async () => {
    espiao = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'https://outro.example/x' } }));
    const r = await testar();
    expect(await r.json()).toEqual({ ok: true, status: 302 });
    expect(espiao).toHaveBeenCalledTimes(1);
    expect((espiao.mock.calls[0][1] as RequestInit).redirect).toBe('manual');
  });

  it('host que resolve para IP interno → 400 da guarda de rebinding, sem entrega', async () => {
    await semear([['w-teste', 'https://rebind.example/h', 'risk.created']]);
    espiao = vi.spyOn(globalThis, 'fetch').mockImplementation((async (url: string) => doh(url, '10.0.0.5')) as any);
    const r = await testar();
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'Webhook host resolves to a non-public address (SSRF Guard)' });
    expect(espiao.mock.calls.every(([u]) => String(u).startsWith('https://cloudflare-dns.com/'))).toBe(true);
  });

  it('URL interna → 400 da guarda de SSRF, sem fetch', async () => {
    await semear([['w-teste', 'http://10.0.0.1/h', 'risk.created']]);
    espiao = vi.spyOn(globalThis, 'fetch');
    const r = await testar();
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'Invalid or forbidden webhook URL (SSRF Guard)' });
    expect(espiao).not.toHaveBeenCalled();
  });
});
