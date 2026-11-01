// Cifra do inventário do n.ot (modelo de ameaças, P0-8). Não usa `secret-crypto.ts` de propósito: aquele devolve como está o
// valor sem prefixo ("legado em claro"), não tem AAD nem identificador de chave. Aqui: AES-256-GCM, formato
// `ot1:<kid>:<base64(iv)>:<base64(ct)>`, AAD `project_id|tabela|id|campo` (cifra copiada para outra linha não decifra) e
// valor sem prefixo é ERRO. HMAC-SHA256 por projeto (`project_id:valor`) para achar duplicado sem decifrar (P0-5).

const PREFIXO = 'ot1';

/** Chaves do inventário. `null` = falta segredo, e quem chama responde 503 (falha fechada). */
export interface ChavesOt { cifra: Record<string, string>; kidAtual: string; hmac: string }

export function chavesOt(env: { OT_INVENTARIO_KEY?: string; OT_INVENTARIO_HMAC_KEY?: string }): ChavesOt | null {
  if (!env.OT_INVENTARIO_KEY || !env.OT_INVENTARIO_HMAC_KEY) return null;
  // shortcut: uma chave de cifra só (k1); a rotação (P2-1) acrescenta OT_INVENTARIO_KEY_K2 aqui e recifra em lote.
  return { cifra: { k1: env.OT_INVENTARIO_KEY }, kidAtual: 'k1', hmac: env.OT_INVENTARIO_HMAC_KEY };
}

export const aadOt = (projectId: string, tabela: string, id: string, campo: string) => `${projectId}|${tabela}|${id}|${campo}`;

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const desb64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
const texto = (s: string) => new TextEncoder().encode(s);

async function chaveAes(material: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', texto(material));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function cifrarOt(valor: string, chaves: ChavesOt, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: texto(aad) }, await chaveAes(chaves.cifra[chaves.kidAtual]), texto(valor));
  return `${PREFIXO}:${chaves.kidAtual}:${b64(iv)}:${b64(new Uint8Array(ct))}`;
}

export async function decifrarOt(valor: string, chaves: ChavesOt, aad: string): Promise<string> {
  const [prefixo, kid, iv, ct, ...resto] = valor.split(':');
  if (prefixo !== PREFIXO || !iv || !ct || resto.length) throw new Error('Valor sem o formato ot1 do n.ot');
  if (!Object.hasOwn(chaves.cifra, kid)) throw new Error(`Chave ${kid} do inventário desconhecida`);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: desb64(iv), additionalData: texto(aad) }, await chaveAes(chaves.cifra[kid]), desb64(ct));
  return new TextDecoder().decode(pt);
}

export async function hmacOt(chaves: ChavesOt, projectId: string, valorNormalizado: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', texto(chaves.hmac), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, texto(`${projectId}:${valorNormalizado}`)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * IP ou MAC dentro de texto livre (P0-6, P0-7): IPv4, IPv6 (4+ grupos ou `::`), MAC com `:`, `-`, `.`, `_`, espaço ou sem
 * separador. O limite olha só dígito/hex (lookaround), não `\b`: `_` e letra colada ("RTU_10.1.1.10", "IED10.1.1.10") separam.
 */
export const ENDERECO_EM_TEXTO = new RegExp([
  String.raw`(?<!\d|\d\.)\d{1,3}(?:\.\d{1,3}){3}(?!\.?\d)`,
  String.raw`(?<![0-9a-f:])(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}(?![0-9a-f:])`,
  String.raw`[0-9a-f]{0,4}::[0-9a-f]{0,4}`,
  String.raw`(?<![0-9a-f])[0-9a-f]{2}([:\- _])[0-9a-f]{2}(?:\1[0-9a-f]{2}){4}(?![0-9a-f])`,
  String.raw`(?<![0-9a-f])[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}(?![0-9a-f])`,
  String.raw`(?<![0-9a-f])[0-9a-f]{12}(?![0-9a-f])`,
].join('|'), 'i');

/** IPv4 decimal ou IPv6 canônico (o do parser de URL da plataforma); null se não for IP. Octeto com zero à esquerda é null: "010" é 8 em octal para várias ferramentas. */
export function normalizarIp(bruto: string): string | null {
  const s = bruto.trim();
  const v4 = s.split('.');
  if (v4.length === 4 && v4.every((o) => /^(0|[1-9]\d{0,2})$/.test(o) && Number(o) <= 255)) return v4.map(Number).join('.');
  if (!s.includes(':') || !/^[0-9a-fA-F:.]+$/.test(s)) return null;
  try { return new URL(`http://[${s}]`).hostname.slice(1, -1); } catch { return null; }
}

/** MAC em `aa:bb:cc:dd:ee:ff` a partir de `:`, `-`, `.` ou sem separador; null se não for MAC. */
export function normalizarMac(bruto: string): string | null {
  const hex = bruto.trim().toLowerCase().replace(/[:.-]/g, '');
  return /^[0-9a-f]{12}$/.test(hex) ? hex.match(/../g)!.join(':') : null;
}

/** IP/MAC em claro → cifra com AAD da linha e HMAC por projeto (P0-8). `null` limpa; ausente não mexe. */
export async function cifrarEnderecos(chaves: ChavesOt, projectId: string, tabela: string, id: string, d: { ip?: string | null; mac?: string | null }) {
  const out: Record<string, string | null> = {};
  for (const [campo, normalizar] of [['ip', normalizarIp], ['mac', normalizarMac]] as const) {
    const bruto = d[campo];
    if (bruto === undefined) continue;
    const valor = bruto === null ? null : normalizar(bruto);
    out[`${campo}_cifrado`] = valor && await cifrarOt(valor, chaves, aadOt(projectId, tabela, id, campo));
    out[`${campo}_hash`] = valor && await hmacOt(chaves, projectId, valor);
  }
  return out;
}

/** Máscara do MAC (P0-6): o OUI (fabricante, já em claro no cadastro) fica; o resto não. */
export const mascararMac = (mac: string) => `${mac.slice(0, 8)}:••:••:••`;
