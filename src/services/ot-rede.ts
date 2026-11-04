import { normalizarIp } from './ot-cifra';

/** IPv4 → inteiro de 32 bits; IPv6 → inteiro de 128 bits (BigInt). null se não for IP. */
function paraInteiro(ip: string): { v: 4 | 6; n: bigint } | null {
  const s = normalizarIp(ip);
  if (!s) return null;
  if (!s.includes(':')) return { v: 4, n: s.split('.').reduce((a, o) => (a << 8n) + BigInt(o), 0n) };
  // normalizarIp devolve a forma do URL: `::` no máximo uma vez e IPv4 embutido já em hexadecimal
  const [cab, cau] = s.split('::');
  const a = cab ? cab.split(':') : [];
  const b = cau ? cau.split(':') : [];
  const grupos = s.includes('::') ? [...a, ...Array(8 - a.length - b.length).fill('0'), ...b] : a;
  return { v: 6, n: grupos.reduce((acc, g) => (acc << 16n) + BigInt(`0x${g}`), 0n) };
}

export function ipNaFaixa(ip: string, cidr: string): boolean {
  const [base, len] = cidr.split('/');
  const x = paraInteiro(ip);
  const y = paraInteiro(base ?? '');
  if (!x || !y || x.v !== y.v || !/^\d{1,3}$/.test(len ?? '')) return false;
  const bits = x.v === 4 ? 32 : 128;
  const n = Number(len);
  if (n > bits) return false;
  const sobra = BigInt(bits - n);
  return x.n >> sobra === y.n >> sobra;
}

const PRIVADAS = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7', 'fe80::/10'];

/** Rede interna = privados, ULA, link-local e as faixas do site. */
export const ehInterno = (ip: string, faixas: string[]): boolean => [...PRIVADAS, ...faixas].some((f) => ipNaFaixa(ip, f));
