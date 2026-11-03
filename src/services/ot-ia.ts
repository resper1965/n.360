// IA do n.ot (modelo de ameaças P0-7; T13, T16). Máscara PRÓPRIA, não `mascararPii` (que não pega nenhum identificador de rede):
// IPv4 (com CIDR e faixa), IPv6, MAC em 4 formatos, FQDN, hostname e número de série citados por rótulo viram tokens aleatórios
// por chamada, com o mapa só em memória. A resposta só ganha o valor de volta nos campos `ip`, `mac` e `hostname`, e só a partir de
// um token do tipo certo emitido nesta chamada; token em qualquer outro campo, token desconhecido ou endereço literal recusa a
// resposta inteira. Uma descrição por chamada, saída por esquema estrito, Workers AI pelo AI Gateway com log desligado. A IA
// rascunha; quem grava é uma pessoa, pelas rotas do inventário.
import { z } from 'zod';
import { reasoningModel } from '../config/models';
import { gatewayConfig } from '../agents/types';
import { objetoDaResposta } from '../agents/importacao';
import { normalizarIp, ENDERECO_EM_TEXTO } from './ot-cifra';

export type TipoToken = 'ip' | 'mac' | 'hostname' | 'serie';
export type MapaTokens = Map<string, { tipo: TipoToken; valor: string }>;
export interface Mascara { texto: string; mapa: MapaTokens }

/** Recusa da IA: a mensagem vai à tela (nunca com valor de endereço). */
export class RecusaIa extends Error {}

const SIGLA: Record<TipoToken, string> = { ip: 'IP', mac: 'MAC', hostname: 'HOST', serie: 'SERIE' };
const DO_TOKEN = /\[\[(IP|MAC|HOST|SERIE)_[0-9a-f]{8}\]\]/;
const PARECE_TOKEN = /(IP|MAC|HOST|SERIE)_[0-9a-f]{8}/i;

const IPV6 = /(?<![\w:.])(?:[0-9a-f]{0,4}:){2,7}(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f]{0,4})(?:%\w+)?(?:\/\d{1,3})?(?![\w:])/gi;
// Limite por lookaround de hex/dígito, não `\b`: `_` e letra colada ("rtu01_192.168.0.5", "MAC_001a2b3c4d5e") separam.
const MAC = /(?<![0-9a-f])[0-9a-f]{2}([:\- _])[0-9a-f]{2}(?:\1[0-9a-f]{2}){4}(?![0-9a-f])|(?<![0-9a-f])[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}(?![0-9a-f])|(?<![0-9a-f])[0-9a-f]{12}(?![0-9a-f])/gi;
const IPV4 = /(?<!\d|\d\.)(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2}(?!\d)|-(?:(?:\d{1,3}\.){3})?\d{1,3}(?!\d))?(?!\.?\d)/g;
const FQDN = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\b(?!\.?[\w-])/gi;
// Rótulo + valor: o valor (grupo 3) vira token. Sem `:`/`=`, só valor com dígito, `-` ou `_` (senão "o host responde" perderia a palavra).
const HOST_ROTULADO = /\b(hostname|nome d[eo] host|host)(\s*[:=]\s*|\s+(?=[\w.-]*[\d_-]))([A-Za-z0-9][\w.-]*[A-Za-z0-9]|[A-Za-z0-9])/gi;
const SERIE = /(\bs\/n|\bsn|\bserial|\bn[uú]mero de s[eé]rie|\bn[ºo°]\.? de s[eé]rie)(\s*[:#=]?\s*)([A-Z0-9][A-Z0-9-]{3,})/gi;

/** O que ainda parece endereço depois da máscara (o mesmo padrão do esquema do inventário): a chamada não acontece. */
const RESIDUO = ENDERECO_EM_TEXTO;

const sorteio = () => [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('');

// shortcut: hostname sem ponto e sem rótulo ("SE-NORTE-RTU01" solto no texto) não é reconhecido; a rota de zona nem manda o nome
// do ativo. Se a coleta por descrição livre (N3) precisar, acrescentar os nomes do inventário do site à máscara.
/** Token novo deste tipo no mapa (o mapa é da chamada). */
export function tokenNovo(mapa: MapaTokens, tipo: TipoToken, valor: string): string {
  const t = `[[${SIGLA[tipo]}_${sorteio()}]]`;
  mapa.set(t, { tipo, valor });
  return t;
}

/** `mapa` permite mascarar várias partes de uma mesma chamada (células) num mapa só. */
export function mascararParaIa(texto: string, mapa: MapaTokens = new Map()): Mascara {
  const porValor = new Map<string, string>();
  const token = (tipo: TipoToken, valor: string) => {
    const chave = `${tipo}|${valor}`;
    let t = porValor.get(chave);
    if (!t) { t = tokenNovo(mapa, tipo, valor); porValor.set(chave, t); }
    return t;
  };
  const v6 = (m: string) => (normalizarIp(m.replace(/(%\w+)?(\/\d{1,3})?$/, '')) ? token('ip', m) : m);
  let t = texto.replace(IPV6, v6).replace(MAC, (m) => token('mac', m)).replace(IPV4, (m) => token('ip', m)).replace(FQDN, (m) => token('hostname', m));
  t = t.replace(HOST_ROTULADO, (_m, r: string, s: string, v: string) => r + s + token('hostname', v));
  t = t.replace(SERIE, (_m, r: string, s: string, v: string) => r + s + token('serie', v));
  return { texto: t, mapa };
}

export function garantirSemEndereco(texto: string): void {
  if (RESIDUO.test(texto)) throw new RecusaIa('A máscara do n.ot não removeu todo endereço do texto: a IA não foi chamada');
}

const RESTAURAVEL: Record<string, TipoToken> = { ip: 'ip', mac: 'mac', hostname: 'hostname' };
const RECUSA_TOKEN = 'A resposta da IA trouxe identificador de rede fora dos campos de IP, MAC ou hostname: recusada';

function semTokenNemEndereco(v: unknown): void {
  if (typeof v === 'string') { if (PARECE_TOKEN.test(v) || RESIDUO.test(v)) throw new RecusaIa(RECUSA_TOKEN); return; }
  if (Array.isArray(v)) { v.forEach(semTokenNemEndereco); return; }
  if (v && typeof v === 'object') Object.values(v).forEach(semTokenNemEndereco);
}

/** Restaura os tokens SÓ em ip/mac/hostname de primeiro nível; qualquer outro identificador em qualquer campo recusa tudo. */
export function restaurarSaida<T extends Record<string, unknown>>(saida: T, mapa: MapaTokens): T {
  const out: Record<string, unknown> = {};
  for (const [campo, v] of Object.entries(saida)) {
    const tipo = Object.hasOwn(RESTAURAVEL, campo) ? RESTAURAVEL[campo] : undefined;
    if (!tipo || v === null || v === undefined) { semTokenNemEndereco(v); out[campo] = v; continue; }
    const achado = typeof v === 'string' && DO_TOKEN.test(v.trim()) ? mapa.get(v.trim()) : undefined;
    if (!achado || achado.tipo !== tipo) throw new RecusaIa(`A resposta da IA trouxe ${campo} que não veio da descrição: recusada`);
    out[campo] = achado.valor;
  }
  return out as T;
}

interface ModeloIa { run: (modelo: string, entrada: unknown, opcoes?: unknown) => Promise<unknown> }
export type EnvIa = { AI?: unknown; [k: string]: unknown };

async function chamarModelo(env: EnvIa, sistema: string, textoMascarado: string, jsonSchema: Record<string, unknown>, maxTokens: number): Promise<unknown> {
  garantirSemEndereco(textoMascarado);
  const ai = env.AI as ModeloIa | undefined;
  if (!ai || typeof ai.run !== 'function') throw new RecusaIa('IA indisponível neste ambiente');
  let resposta: unknown;
  try {
    const r = await ai.run(reasoningModel(env), {
      messages: [{ role: 'system', content: sistema }, { role: 'user', content: textoMascarado }],
      response_format: { type: 'json_schema', json_schema: jsonSchema }, temperature: 0.1, max_tokens: maxTokens,
    }, { gateway: { id: gatewayConfig(env).gatewayId, collectLog: false, skipCache: true } });
    resposta = (r as { response?: unknown } | null)?.response;
  } catch {
    throw new RecusaIa('A IA não respondeu; tente de novo');
  }
  return typeof resposta === 'string' ? objetoDaResposta(resposta) : resposta;
}

/**
 * Uma chamada, um texto: mascara, confere que nada sobrou (senão não chama), pede JSON pelo esquema, valida estrito e restaura.
 * Só Workers AI (dado de infraestrutura crítica não sai da Cloudflare), pelo gateway do repo, sem log nem cache.
 */
export async function perguntarIa<S extends z.ZodType<Record<string, unknown>>>(
  env: EnvIa, sistema: string, usuario: string, esquema: S, jsonSchema: Record<string, unknown>,
  mascarar: (t: string) => Mascara = mascararParaIa, maxTokens = 800,
): Promise<z.infer<S>> {
  const m = mascarar(usuario);
  const bruto = await chamarModelo(env, sistema, m.texto, jsonSchema, maxTokens);
  const v = esquema.safeParse(bruto);
  if (!v.success) throw new RecusaIa('A resposta da IA veio fora do formato esperado');
  return restaurarSaida(v.data, m.mapa);
}

/** Lista de itens sobre texto JÁ mascarado (o chamador guarda o mapa para conferir a evidência). `camposComToken` ficam com o token intacto. */
export async function perguntarIaItens<I extends z.ZodType<Record<string, unknown>>>(
  env: EnvIa, sistema: string, usuario: Mascara, item: I, jsonSchema: Record<string, unknown>,
  opcoes: { maxTokens?: number; camposComToken?: string[]; maxItens?: number } = {},
): Promise<z.infer<I>[]> {
  if ((opcoes.camposComToken ?? []).some((c) => Object.hasOwn(RESTAURAVEL, c))) throw new Error('camposComToken não pode incluir ip, mac ou hostname');
  const bruto = await chamarModelo(env, sistema, usuario.texto, jsonSchema, opcoes.maxTokens ?? 2000);
  const v = z.object({ itens: z.array(item).max(opcoes.maxItens ?? 50) }).strict().safeParse(bruto);
  if (!v.success) throw new RecusaIa('A resposta da IA veio fora do formato esperado');
  const separados = new Set(opcoes.camposComToken ?? []);
  return v.data.itens.map((it: Record<string, unknown>) => {
    const guardado: Record<string, unknown> = {};
    const resto: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(it)) {
      if (!separados.has(k)) { resto[k] = val; continue; }
      if (typeof val !== 'string') throw new RecusaIa(RECUSA_TOKEN);
      // tira os tokens desta chamada; o que sobrar não pode parecer token nem endereço
      let sobra = val;
      for (const t of val.match(TOKENS_G) ?? []) { if (!usuario.mapa.has(t)) throw new RecusaIa(RECUSA_TOKEN); sobra = sobra.replaceAll(t, ' '); }
      semTokenNemEndereco(sobra);
      guardado[k] = val;
    }
    return { ...restaurarSaida(resto, usuario.mapa), ...guardado } as z.infer<I>;
  });
}

const TOKENS_G = new RegExp(DO_TOKEN.source, 'g');
const MARCADOR: Record<string, string> = { IP: '[IP]', MAC: '[MAC]', HOST: '[HOST]', SERIE: '[SERIE]' };
/** Troca cada token por um marcador, para gravar evidência sem endereço. */
export function semTokens(texto: string): string {
  return texto.replace(TOKENS_G, (_m, s: string) => MARCADOR[s]);
}
