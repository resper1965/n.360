/**
 * SLO de produção medido dentro do Worker (spec 2026-10-27-slo-no-worker).
 *
 * Mesma consulta e mesmos tetos de `scripts/slo.mjs` (o workflow `slo.yml` depende do GitHub Actions, que
 * pode ficar parado por cobrança; a vigilância não pode depender disso). Os tetos são testados contra o script
 * em `test/slo.test.ts`: se um mudar, o outro precisa mudar junto.
 */
import { enviarEmail } from '../helpers';
import { emailAlertaSonda } from './emails';
import { appUrl } from '../config/url';
import { log } from '../observability';
import { CF_ACCOUNT_ID_DEFAULT } from '../agents/types';
import type { Bindings } from '../index';

/** A cada 6 horas: a janela é de 24 h, então medir mais seguido repetiria o mesmo número. O mesmo texto vai em `triggers.crons` do `wrangler.jsonc`. */
export const CRON_SLO = '15 */6 * * *';

export type MedidaSlo = {
  total: number;
  erros5xx: number;
  /** Requisições fora das rotas de IA: é o denominador do p95. */
  totalSemIa: number;
  p95Ms: number;
  p99Ms: number;
};

export const TETOS = {
  /** 5xx sobre o total, em 24 h. */
  taxa5xxMax: 0.01,
  /** p95 em 24 h, SEM as rotas de IA (o modelo é que demora; misturar faria o p95 subir com a adoção, não com a degradação). */
  p95MaxMs: 800,
  /** Abaixo disto, p95 é ruído: uma requisição lenta domina a distribuição. */
  volumeMinimoP95: 20,
  rotasDeIa: ['/chat', '/generate', '/evaluate', '/ingest'],
} as const;

/** Frases de violação; vazia quando está dentro dos tetos. `erros5xx > 0` junto da taxa: zero erro nunca alerta. */
export function avaliarSlo(m: MedidaSlo): string[] {
  const violacoes: string[] = [];
  const taxa = m.total > 0 ? m.erros5xx / m.total : 0;
  if (m.erros5xx > 0 && taxa > TETOS.taxa5xxMax) {
    violacoes.push(
      `Taxa de 5xx em ${(taxa * 100).toFixed(2)}% nas últimas 24h (${m.erros5xx} de ${m.total}), acima do teto de ${(TETOS.taxa5xxMax * 100).toFixed(0)}%.`
    );
  }
  if (m.totalSemIa >= TETOS.volumeMinimoP95 && m.p95Ms > TETOS.p95MaxMs) {
    violacoes.push(
      `p95 de latência em ${m.p95Ms.toFixed(0)} ms nas últimas 24h (fora das rotas de IA), acima do teto de ${TETOS.p95MaxMs} ms. p99: ${m.p99Ms.toFixed(0)} ms.`
    );
  }
  return violacoes;
}

// ─── medição, estado e aviso ────────────────────────────────────────────────

const CHAVE_ESTADO = 'slo:estado';
const CHAVE_ULTIMO = 'slo:ultimo';

export type EnvSlo = Pick<Bindings, 'SESSIONS' | 'OAUTH_KV' | 'RESEND_API_KEY' | 'ALERTA_EMAIL' | 'APP_URL' | 'VERSAO_SHA' | 'CF_ACCOUNT_ID' | 'CF_ANALYTICS_TOKEN'>;
export type ResultadoSlo = { estado: 'ok' | 'violado' | 'sem_medida' | 'sem_token'; alerta: 'entrada' | 'volta' | null };

/**
 * A API de SQL do Analytics Engine responde erro de SQL como TEXTO puro com status 200. Sem o ramo do JSON.parse, um erro de
 * sintaxe viraria "sem dados" e o SLO passaria em silêncio.
 */
async function consultar(conta: string, token: string, sql: string): Promise<Record<string, unknown>> {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${conta}/analytics_engine/sql`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: sql,
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`Analytics Engine devolveu ${r.status}: ${texto.slice(0, 200)}`);
  let json: { data?: Record<string, unknown>[] };
  try { json = JSON.parse(texto); } catch { throw new Error(`Resposta não-JSON do Analytics Engine: ${texto.slice(0, 200)}`); }
  const linha = json.data?.[0];
  if (!linha) throw new Error('O Analytics Engine não devolveu linha: a consulta ou o dataset mudou de forma');
  return linha;
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

async function medir(conta: string, token: string): Promise<MedidaSlo> {
  const semIa = TETOS.rotasDeIa.map((r) => `position('${r}' IN blob2) = 0`).join(' AND ');
  const geral = await consultar(conta, token,
    `SELECT sum(_sample_interval) AS total,
       sum(if(toUInt32(index1) >= 500, _sample_interval, 0)) AS erros5xx,
       sum(if(toUInt32(index1) >= 400 AND toUInt32(index1) < 500, _sample_interval, 0)) AS erros4xx
     FROM niso_metrics WHERE timestamp > NOW() - INTERVAL '24' HOUR FORMAT JSON`);
  const latencia = await consultar(conta, token,
    `SELECT sum(_sample_interval) AS total,
       quantileWeighted(0.95)(double1, _sample_interval) AS p95_ms,
       quantileWeighted(0.99)(double1, _sample_interval) AS p99_ms
     FROM niso_metrics WHERE timestamp > NOW() - INTERVAL '24' HOUR AND ${semIa} FORMAT JSON`);
  return { total: num(geral.total), erros5xx: num(geral.erros5xx), totalSemIa: num(latencia.total), p95Ms: num(latencia.p95_ms), p99Ms: num(latencia.p99_ms) };
}

/** O estado mora nos DOIS KV, como o da sonda: se um deles cai, o outro lembra que o alerta já saiu. */
async function lerEstado(env: EnvSlo): Promise<'violado' | 'sem_medida' | null> {
  const lidos = await Promise.allSettled([env.SESSIONS.get(CHAVE_ESTADO), env.OAUTH_KV.get(CHAVE_ESTADO)]);
  const v = lidos.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []));
  return v.includes('violado') ? 'violado' : v.includes('sem_medida') ? 'sem_medida' : null;
}

async function gravarEstado(env: EnvSlo, estado: 'violado' | 'sem_medida' | null): Promise<void> {
  await Promise.allSettled([env.SESSIONS, env.OAUTH_KV].map((kv) => (estado ? kv.put(CHAVE_ESTADO, estado) : kv.delete(CHAVE_ESTADO))));
}

async function avisar(env: EnvSlo, assunto: string, linhas: string[]): Promise<boolean> {
  if (!env.ALERTA_EMAIL) return true; // sem destino configurado: o log é o registro
  return enviarEmail(env, env.ALERTA_EMAIL, assunto, emailAlertaSonda(assunto, linhas));
}

/**
 * Mede o SLO das últimas 24 h e avisa por transição: um e-mail ao entrar em `violado` ou `sem_medida`, um ao voltar a `ok`.
 * `sem_medida` também alerta: vigilância calada não pode virar prova de saúde. Sem `CF_ANALYTICS_TOKEN` não há o que medir
 * (estado `sem_token`): só o log, sem e-mail.
 */
export async function verificarSlo(env: EnvSlo): Promise<ResultadoSlo> {
  if (!env.CF_ANALYTICS_TOKEN) {
    log('warn', { msg: 'slo_sem_token', dica: 'wrangler secret put CF_ANALYTICS_TOKEN (token só de leitura de Analytics)' });
    return { estado: 'sem_token', alerta: null };
  }
  const versao = env.VERSAO_SHA ?? 'dev';
  let estado: 'ok' | 'violado' | 'sem_medida';
  let linhas: string[];
  let registro: Record<string, unknown>;
  try {
    const m = await medir(env.CF_ACCOUNT_ID || CF_ACCOUNT_ID_DEFAULT, env.CF_ANALYTICS_TOKEN);
    const violacoes = avaliarSlo(m);
    estado = violacoes.length ? 'violado' : 'ok';
    linhas = [...violacoes, `Medido nas últimas 24h: ${m.total} requisições, ${m.erros5xx} com 5xx, p95 ${m.p95Ms.toFixed(0)} ms e p99 ${m.p99Ms.toFixed(0)} ms (fora das rotas de IA).`];
    registro = { ...m, violacoes };
  } catch (e) {
    estado = 'sem_medida';
    const motivo = String((e as Error)?.message ?? e).slice(0, 300);
    linhas = [`Não foi possível medir o SLO: ${motivo}`, 'Sem medição, não há como saber se o sistema está dentro dos tetos. Confira o token CF_ANALYTICS_TOKEN (só leitura de Analytics) e o dataset niso_metrics.'];
    registro = { erro: motivo };
  }
  const em = new Date().toISOString();
  log(estado === 'ok' ? 'info' : 'error', { msg: 'slo_medido', estado, versao, ...registro });
  await env.SESSIONS.put(CHAVE_ULTIMO, JSON.stringify({ em, estado, ...registro })).catch(() => undefined);

  const anterior = await lerEstado(env);
  let alerta: ResultadoSlo['alerta'] = null;
  const rodape = [`Versão publicada: ${versao}. Endereço: ${appUrl(env)}.`, 'Primeiro passo: seção 1 de docs/runbook-incidente.md.'];
  if (estado !== 'ok' && anterior !== estado) {
    const assunto = estado === 'violado' ? 'n.360: SLO de produção violado' : 'n.360: não foi possível medir o SLO de produção';
    if (await avisar(env, assunto, [...linhas, ...rodape])) { await gravarEstado(env, estado); alerta = 'entrada'; }
  } else if (estado === 'ok' && anterior) {
    if (await avisar(env, 'n.360: SLO de produção de volta ao normal', [...linhas, `Versão publicada: ${versao}.`])) { await gravarEstado(env, null); alerta = 'volta'; }
  }
  return { estado, alerta };
}
