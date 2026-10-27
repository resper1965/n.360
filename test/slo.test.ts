import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData, workerEnv } from './helpers/d1';
import { avaliarSlo, verificarSlo, TETOS, CRON_SLO, type MedidaSlo } from '../src/services/slo';
import worker from '../src/index';
import wrangler from '../wrangler.jsonc?raw';
import sloMjs from '../scripts/slo.mjs?raw';

/**
 * SLO medido dentro do Worker (src/services/slo.ts, spec 2026-10-27-slo-no-worker). A avaliação é pura;
 * os números de entrada são fictícios.
 */

const medida = (o: Partial<MedidaSlo> = {}): MedidaSlo => ({ total: 1000, erros5xx: 0, totalSemIa: 900, p95Ms: 300, p99Ms: 500, ...o });

describe('avaliarSlo (puro)', () => {
  it('sistema saudável: sem violação', () => {
    expect(avaliarSlo(medida())).toEqual([]);
  });

  it('5xx acima de 1% do total (e ao menos um erro): alerta, citando taxa, contagem e teto', () => {
    const v = avaliarSlo(medida({ total: 1000, erros5xx: 20 }));
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('2.00%');
    expect(v[0]).toContain('20 de 1000');
    expect(v[0]).toContain('1%');
  });

  it('exatamente no teto de 1% não alerta; zero erro nunca alerta, qualquer que seja o total', () => {
    expect(avaliarSlo(medida({ total: 1000, erros5xx: 10 }))).toEqual([]);
    expect(avaliarSlo(medida({ total: 0, erros5xx: 0 }))).toEqual([]);
  });

  it('baixo volume: um erro em 30 requisições estoura 1% e É para alertar', () => {
    expect(avaliarSlo(medida({ total: 30, erros5xx: 1, totalSemIa: 30 })).join(' ')).toContain('1 de 30');
  });

  it('p95 acima de 800 ms com volume suficiente: alerta, citando p95, p99 e teto', () => {
    const v = avaliarSlo(medida({ p95Ms: 1672, p99Ms: 3034 }));
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('1672 ms');
    expect(v[0]).toContain('3034 ms');
    expect(v[0]).toContain('800 ms');
  });

  it('p95 só é avaliado com 20 requisições ou mais fora da IA: abaixo disso é ruído', () => {
    expect(avaliarSlo(medida({ totalSemIa: 19, p95Ms: 5000 }))).toEqual([]);
    expect(avaliarSlo(medida({ totalSemIa: 20, p95Ms: 5000 }))).toHaveLength(1);
  });

  it('os dois estourados: duas violações', () => {
    expect(avaliarSlo(medida({ erros5xx: 50, p95Ms: 900 }))).toHaveLength(2);
  });
});

describe('paridade com scripts/slo.mjs (os tetos não podem divergir)', () => {
  const dele = (nome: string) => Number(new RegExp(`const ${nome} = ([0-9.]+);`).exec(sloMjs)![1]);
  it('mesmos tetos e mesmo volume mínimo', () => {
    expect(TETOS.taxa5xxMax).toBe(dele('TAXA_5XX_MAX'));
    expect(TETOS.p95MaxMs).toBe(dele('P95_MAX_MS'));
    expect(TETOS.volumeMinimoP95).toBe(dele('VOLUME_MINIMO_P95'));
  });
  it('mesmas rotas de IA fora do p95', () => {
    const lista = /const ROTAS_DE_IA = \[([^\]]+)\]/.exec(sloMjs)![1].split(',').map((s) => s.trim().replace(/'/g, ''));
    expect([...TETOS.rotasDeIa]).toEqual(lista);
  });
});

// ─── fluxo: consulta ao Analytics Engine, estado no KV e e-mail por transição ───

type Chamada = { url: string; token: string; sql: string };
type Email = { to: string[]; subject: string; html: string };
let consultas: Chamada[];
let emails: Email[];
/** O que o Analytics Engine responde em cada teste: dados, texto puro (erro de SQL com 200) ou status de erro. */
let ae: { geral: Record<string, number>; latencia: Record<string, number> } | { texto: string } | { status: number };

const base = (extra: Record<string, unknown> = {}) => ({
  ...workerEnv(), RESEND_API_KEY: 'chave-de-teste', ALERTA_EMAIL: 'operacao@exemplo.com', CF_ANALYTICS_TOKEN: 'token-so-leitura', CF_ACCOUNT_ID: 'conta-de-teste', ...extra,
});
const saudavel = () => ({ geral: { total: 1000, erros5xx: 0, erros4xx: 3 }, latencia: { total: 900, p95_ms: 300, p99_ms: 600 } });
const lento = () => ({ geral: { total: 1000, erros5xx: 0, erros4xx: 3 }, latencia: { total: 900, p95_ms: 1672, p99_ms: 3034 } });

describe('verificarSlo (D1 e KV reais; Analytics Engine e e-mail simulados)', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
    for (const kv of [env.SESSIONS, env.OAUTH_KV]) { await kv.delete('slo:estado'); await kv.delete('slo:ultimo'); }
    consultas = []; emails = []; ae = saudavel();
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (u: RequestInfo | URL, init?: RequestInit) => {
      const url = String(u);
      if (url.includes('analytics_engine/sql')) {
        consultas.push({ url, token: String((init?.headers as Record<string, string>)?.Authorization), sql: String(init?.body) });
        if ('status' in ae) return new Response('erro', { status: ae.status });
        if ('texto' in ae) return new Response(ae.texto, { status: 200 });
        return new Response(JSON.stringify({ data: [String(init?.body).includes('quantileWeighted') ? ae.latencia : ae.geral] }), { status: 200 });
      }
      emails.push(JSON.parse(String(init?.body)));
      return new Response('{}', { status: 200 });
    }) as typeof fetch);
  });
  afterEach(() => vi.restoreAllMocks());

  it('sem CF_ANALYTICS_TOKEN: estado sem_token, nenhuma consulta e nenhum e-mail', async () => {
    const r = await verificarSlo(base({ CF_ANALYTICS_TOKEN: undefined }));
    expect(r).toEqual({ estado: 'sem_token', alerta: null });
    expect(consultas).toHaveLength(0);
    expect(emails).toHaveLength(0);
  });

  it('dentro dos tetos: estado ok, sem e-mail; consulta com o token e a conta certos, duas consultas, só a de p95 exclui a IA', async () => {
    const r = await verificarSlo(base());
    expect(r).toEqual({ estado: 'ok', alerta: null });
    expect(emails).toHaveLength(0);
    expect(consultas).toHaveLength(2);
    expect(consultas[0].url).toBe('https://api.cloudflare.com/client/v4/accounts/conta-de-teste/analytics_engine/sql');
    expect(consultas[0].token).toBe('Bearer token-so-leitura');
    expect(consultas.filter((c) => c.sql.includes("position('/chat' IN blob2) = 0"))).toHaveLength(1);
    expect(consultas.every((c) => c.sql.includes('niso_metrics'))).toBe(true);
  });

  it('guarda a última medição no KV (para conferir sem abrir o painel da Cloudflare)', async () => {
    await verificarSlo(base());
    const ultimo = JSON.parse((await env.SESSIONS.get('slo:ultimo'))!);
    expect(ultimo).toMatchObject({ estado: 'ok', total: 1000, erros5xx: 0, p95Ms: 300, violacoes: [] });
    expect(typeof ultimo.em).toBe('string');
  });

  it('violação: um e-mail na entrada; a segunda rodada no mesmo estado não manda outro; a volta ao normal manda um', async () => {
    ae = lento();
    expect(await verificarSlo(base())).toEqual({ estado: 'violado', alerta: 'entrada' });
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toEqual(['operacao@exemplo.com']);
    expect(emails[0].html).toContain('1672 ms');

    expect(await verificarSlo(base())).toEqual({ estado: 'violado', alerta: null });
    expect(emails).toHaveLength(1);

    ae = saudavel();
    expect(await verificarSlo(base())).toEqual({ estado: 'ok', alerta: 'volta' });
    expect(emails).toHaveLength(2);
    expect(await verificarSlo(base())).toEqual({ estado: 'ok', alerta: null });
    expect(emails).toHaveLength(2);
  });

  it('o Analytics Engine responde erro de SQL como TEXTO com 200: vira sem_medida (alerta), não "sem dados"', async () => {
    ae = { texto: 'Unknown column foo' };
    expect(await verificarSlo(base())).toEqual({ estado: 'sem_medida', alerta: 'entrada' });
    expect(emails).toHaveLength(1);
    expect(emails[0].html).toContain('Unknown column');
    expect(await verificarSlo(base())).toEqual({ estado: 'sem_medida', alerta: null });
    expect(emails).toHaveLength(1);
  });

  it('token recusado (status de erro) também é sem_medida; sem linha nenhuma também', async () => {
    ae = { status: 403 };
    expect((await verificarSlo(base())).estado).toBe('sem_medida');
    await env.SESSIONS.delete('slo:estado'); await env.OAUTH_KV.delete('slo:estado'); emails = [];
    vi.mocked(globalThis.fetch).mockImplementation((async (u: RequestInfo | URL) =>
      new Response(String(u).includes('analytics_engine') ? JSON.stringify({ data: [] }) : '{}', { status: 200 })) as typeof fetch);
    expect((await verificarSlo(base())).estado).toBe('sem_medida');
  });

  it('sem_medida que volta a medir bem: um e-mail de volta', async () => {
    ae = { status: 500 };
    await verificarSlo(base());
    ae = saudavel();
    expect(await verificarSlo(base())).toEqual({ estado: 'ok', alerta: 'volta' });
    expect(emails).toHaveLength(2);
  });
});

describe('cron do SLO', () => {
  it('CRON_SLO está em triggers.crons do wrangler.jsonc e é a cada 6 horas', () => {
    expect(CRON_SLO).toBe('15 */6 * * *');
    expect(wrangler).toContain(`"${CRON_SLO}"`);
  });

  it('o scheduled despacha o cron do SLO para a verificação (sem token, só registra e termina)', async () => {
    const ctx = { waitUntil: vi.fn(), passThroughOnException() {} } as unknown as ExecutionContext;
    worker.scheduled({ cron: CRON_SLO, scheduledTime: Date.now(), noRetry() {} } as ScheduledController, base({ CF_ANALYTICS_TOKEN: undefined }) as any, ctx);
    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
    const r = await (ctx.waitUntil as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(r).toEqual({ estado: 'sem_token', alerta: null });
  });
});
