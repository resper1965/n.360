import { z } from 'zod';
import { hmacOt, normalizarIp, normalizarMac, type ChavesOt } from './ot-cifra';
import { ativosDoSite, indice } from './ot-coleta';
import { livreSemPii } from '../schemas/ot';

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

// Resumo do sensor de rede (spec §2–§3): esquema estrito; qualquer erro recusa o arquivo inteiro.
export const PROTOCOLOS_REDE = ['modbus', 'dnp3', 'iec104', 's7comm', 'enip', 'bacnet', 'opcua', 'mms', 'goose', 'http', 'https', 'ssh', 'telnet',
  'rdp', 'smb', 'snmp', 'ntp', 'dns', 'syslog', 'ftp'] as const;
const ip = z.string().refine((s) => normalizarIp(s) !== null, 'IP inválido');
const quando = z.iso.datetime();
const porta = z.number().int().min(0).max(65535);
const protocolo = z.enum(PROTOCOLOS_REDE);
export const resumoRedeSchema = z.object({
  formato: z.literal('n.ot-resumo-rede/1'),
  gerado_em: quando,
  periodo: z.object({ inicio: quando, fim: quando }).strict().optional(),
  zeek_versao: z.string().max(50).regex(/^[\w.+-]+$/).optional(),
  ativos: z.array(z.object({
    ip,
    mac: z.string().refine((s) => normalizarMac(s) !== null, 'MAC inválido').optional(),
    fabricante: livreSemPii(100).optional(),
    protocolos: z.array(protocolo).max(PROTOCOLOS_REDE.length),
    portas_servico: z.array(porta).max(65536),
    primeira_vez: quando.optional(),
    ultima_vez: quando.optional(),
  }).strict()).max(5000),
  conexoes: z.array(z.object({
    origem: ip,
    destino: ip,
    transporte: z.enum(['tcp', 'udp', 'icmp']),
    porta,
    aplicacao: protocolo.nullable(),
    contagem: z.number().int().min(1),
    primeira_vez: quando,
    ultima_vez: quando,
  }).strict()).max(20000),
}).strict();
export type ResumoRede = z.infer<typeof resumoRedeSchema>;

export interface Plano {
  ativos: Record<string, unknown>[];
  macs: { ip: string; mac: string }[];
  fluxos: Record<string, unknown>[];
  pendentes: { origem_ip_hash: string | null; destino_ip_hash: string | null; dados: Record<string, unknown> }[];
  contagem: { ativos_novos: number; ativos_conhecidos: number; macs_completados: number; fluxos_criados: number; fluxos_pendentes: number };
}

/**
 * Resumo validado → achados de ativo, MACs a completar, fluxos com pontas do site e pendências (só hash). Comparação por `ip_hash` no
 * índice do site, sem decifrar. Na pendência o lado externo fica com hash nulo: IP externo nunca é guardado, nem como HMAC.
 */
export async function planejarResumo(db: D1Database, chaves: ChavesOt, projectId: string, site: { id: string; faixas: string[] }, resumo: ResumoRede): Promise<Plano> {
  const idx = indice((await ativosDoSite(db, projectId, site.id)).results);
  const hashes = new Map<string, string>();
  const hash = async (x: string) => hashes.get(x) ?? hashes.set(x, await hmacOt(chaves, projectId, x)).get(x)!;
  const interno = (x: string) => ehInterno(x, site.faixas);
  const doSite = async (x: string) => idx.achar({ ip_hash: await hash(x) });

  const plano: Plano = { ativos: [], macs: [], fluxos: [], pendentes: [], contagem: { ativos_novos: 0, ativos_conhecidos: 0, macs_completados: 0, fluxos_criados: 0, fluxos_pendentes: 0 } };
  const novos = new Set<string>();
  for (const a of resumo.ativos) {
    const x = normalizarIp(a.ip)!;
    if (!interno(x) || novos.has(x)) continue;
    const mac = a.mac && normalizarMac(a.mac)!;
    const existente = await doSite(x);
    if (existente) {
      plano.contagem.ativos_conhecidos++;
      if (mac && !existente.mac_hash) plano.macs.push({ ip: x, mac });
      continue;
    }
    novos.add(x);
    const [p] = a.protocolos;
    // até 100 portas (teto de protocolos_portas do ativo); o script ordena as portas, então ficam as menores
    const pp = !p ? undefined : a.portas_servico.length ? a.portas_servico.slice(0, 100).map((porta) => ({ protocolo: p, porta })) : [{ protocolo: p }];
    // nome é obrigatório na aprovação; gerado sem IP
    const nome = `${a.fabricante || 'Dispositivo'} (${p || 'rede'}) #${plano.ativos.length + 1}`;
    plano.ativos.push({ ip: x, nome, ...(mac && { mac }), ...(a.fabricante && { fabricante: a.fabricante }), ...(pp && { protocolos_portas: pp }) });
  }

  const vistos = new Set<string>();
  for (const c of resumo.conexoes) {
    const o = normalizarIp(c.origem)!, d = normalizarIp(c.destino)!;
    const io = interno(o), id = interno(d);
    if (!io && !id) continue; // não é fluxo do site
    const dados: Record<string, unknown> = { protocolo: c.aplicacao ?? c.transporte, porta: c.porta, direcao: 'unidirecional', ...(!(io && id) && { externo: true }) };
    const ao = io ? (await doSite(o))?.id : undefined, ad = id ? (await doSite(d))?.id : undefined;
    if ((io && !ao) || (id && !ad)) {
      const p = { origem_ip_hash: io ? await hash(o) : null, destino_ip_hash: id ? await hash(d) : null, dados };
      const k = JSON.stringify(p);
      if (!vistos.has(k)) { vistos.add(k); plano.pendentes.push(p); }
      continue;
    }
    const f = { ...(ao && { origem_ativo_id: ao }), ...(ad && { destino_ativo_id: ad }), ...dados };
    const k = JSON.stringify(f);
    if (!vistos.has(k)) { vistos.add(k); plano.fluxos.push(f); }
  }
  plano.contagem.ativos_novos = plano.ativos.length;
  plano.contagem.macs_completados = plano.macs.length;
  plano.contagem.fluxos_criados = plano.fluxos.length;
  plano.contagem.fluxos_pendentes = plano.pendentes.length;
  return plano;
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const EVIDENCIA_SENSOR = (n: number, inicio: string, fim: string) => `Sensor de rede (Zeek): ${n} conexões entre ${ddmm(inicio)} e ${ddmm(fim)}`;
