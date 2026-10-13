/**
 * Sonda interna: a cada 15 minutos (cron `CRON_SONDA`), o próprio Worker confere as dependências
 * dele — D1, os dois KV e os dois R2 — e avisa por e-mail quando uma deixa de responder.
 *
 * Por que existe: a sonda de `uptime.yml` rodava no GitHub Actions a cada 15 minutos, e cada
 * execução cobra 1 minuto arredondado (~2.900 min/mês). Com o repositório privado isso vira custo.
 * A disponibilidade de fora passa a ser de um monitor externo gratuito (passo a passo em
 * `docs/runbook-incidente.md`, seção 1); esta sonda cobre o que o monitor não vê: binding que
 * parou de responder com o Worker no ar.
 *
 * O LIMITE, e é por isso que o monitor externo continua necessário: se o Worker estiver fora do ar,
 * o cron também não roda, e esta sonda fica calada. Ela não prova disponibilidade; prova que as
 * dependências respondem quando o Worker roda.
 *
 * Um alerta por incidente: o estado ("falha") fica no KV, e só a transição manda e-mail — um
 * na queda, um na volta. Destino: `ALERTA_EMAIL` (var pública, opcional, em `wrangler.jsonc`).
 * Sem ela a sonda só grava o log estruturado. Nada de dado pessoal no log: só o nome do binding e
 * a mensagem do erro, cortada.
 */
import { enviarEmail, escapeHtml } from '../helpers';
import { appUrl } from '../config/url';
import { log } from '../observability';
import type { Bindings } from '../index';

/** A cada 15 minutos. O mesmo texto vai em `triggers.crons` do `wrangler.jsonc`. */
export const CRON_SONDA = '*/15 * * * *';

const CHAVE_ESTADO = 'sonda:estado';
const LIMITE_MS = 10_000;

export type EnvSonda = Pick<Bindings, 'DB' | 'SESSIONS' | 'OAUTH_KV' | 'STORAGE' | 'TRILHA' | 'RESEND_API_KEY' | 'APP_URL' | 'VERSAO_SHA' | 'ALERTA_EMAIL'>;

export type ResultadoSonda = { falhas: string[]; alerta: 'queda' | 'volta' | null };

/** Rejeita se a checagem passar do limite: binding pendurado não pode segurar o cron. */
function comLimite(p: Promise<unknown>): Promise<unknown> {
  return Promise.race([p, new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error(`sem resposta em ${LIMITE_MS} ms`)), LIMITE_MS))]);
}

async function checar(env: EnvSonda): Promise<string[]> {
  const checagens: [string, () => Promise<unknown>][] = [
    ['D1 DB', () => env.DB.prepare('SELECT 1').first()],
    ['KV SESSIONS', () => env.SESSIONS.get(CHAVE_ESTADO)],
    ['KV OAUTH_KV', () => env.OAUTH_KV.get(CHAVE_ESTADO)],
    ['R2 STORAGE', () => env.STORAGE.head('sonda')],
  ];
  // ponytail: TRILHA é opcional no tipo (ausente em teste e em dev); em produção está no wrangler.jsonc.
  if (env.TRILHA) checagens.push(['R2 TRILHA', () => env.TRILHA!.head('sonda')]);

  const resultados = await Promise.allSettled(checagens.map(([, fn]) => comLimite(fn())));
  return resultados.flatMap((r, i) =>
    r.status === 'rejected' ? [`${checagens[i][0]}: ${String((r.reason as Error)?.message ?? r.reason).slice(0, 200)}`] : []
  );
}

/**
 * O estado mora nos DOIS KV: se um deles é justamente o que caiu, o outro guarda que o alerta já
 * saiu. ponytail: com os dois KV fora, não há onde lembrar e o alerta repete a cada 15 minutos;
 * o caminho, se isso incomodar, é guardar o estado no D1.
 */
async function lerEstado(env: EnvSonda): Promise<'falha' | null> {
  const lidos = await Promise.allSettled([env.SESSIONS.get(CHAVE_ESTADO), env.OAUTH_KV.get(CHAVE_ESTADO)]);
  return lidos.some((r) => r.status === 'fulfilled' && r.value === 'falha') ? 'falha' : null;
}

async function gravarEstado(env: EnvSonda, falha: boolean): Promise<void> {
  await Promise.allSettled(
    [env.SESSIONS, env.OAUTH_KV].map((kv) => (falha ? kv.put(CHAVE_ESTADO, 'falha') : kv.delete(CHAVE_ESTADO)))
  );
}

async function avisar(env: EnvSonda, assunto: string, linhas: string[]): Promise<boolean> {
  if (!env.ALERTA_EMAIL) return true; // sem destino configurado: o log é o registro
  const corpo = linhas.map((l) => `<p>${escapeHtml(l)}</p>`).join('');
  return enviarEmail(env, env.ALERTA_EMAIL, assunto, corpo);
}

export async function sondaInterna(env: EnvSonda): Promise<ResultadoSonda> {
  const falhas = await checar(env);
  const anterior = await lerEstado(env);
  const versao = env.VERSAO_SHA ?? 'dev';
  let alerta: ResultadoSonda['alerta'] = null;

  if (falhas.length) log('error', { msg: 'sonda_interna', falhas, versao });

  if (falhas.length && anterior !== 'falha') {
    const ok = await avisar(env, 'n.360: dependência de produção sem resposta', [
      'A sonda interna do Worker não obteve resposta de:',
      ...falhas,
      `Versão publicada: ${versao}. Endereço: ${appUrl(env)}.`,
      'Primeiro passo: seção 0 de docs/runbook-incidente.md. Um novo e-mail sai quando tudo voltar.',
    ]);
    // Só marca o incidente se o aviso saiu; senão a próxima rodada tenta de novo.
    if (ok) { await gravarEstado(env, true); alerta = 'queda'; }
  } else if (!falhas.length && anterior === 'falha') {
    const ok = await avisar(env, 'n.360: dependências de produção respondendo de novo', [
      'A sonda interna voltou a obter resposta de D1, KV e R2.',
      `Versão publicada: ${versao}. Se houve indisponibilidade real, siga a seção 8 de docs/runbook-incidente.md.`,
    ]);
    if (ok) { await gravarEstado(env, false); alerta = 'volta'; }
  }

  if (alerta) log(alerta === 'queda' ? 'error' : 'info', { msg: 'sonda_interna_alerta', alerta, destino_configurado: !!env.ALERTA_EMAIL });
  return { falhas, alerta };
}
