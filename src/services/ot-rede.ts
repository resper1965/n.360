import { z } from 'zod';
import { hmacOt, normalizarIp, normalizarMac, type ChavesOt } from './ot-cifra';
import { ativosDoSite, indice } from './ot-coleta';
import { gravarAchados, INSERIR_ACHADO } from './ot-depara';
import { fluxosDoSite, pontasDoSite } from './ot-fluxo-achado';
import { TETO_LEITURA_OT } from './ot-inventario';
import { prepararAchado, zonasDoSite } from './ot-levantamento';
import { genId } from '../helpers';
import { livreSemPii, TETO_ACHADOS_SESSAO } from '../schemas/ot';

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

const PRIVADAS = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', 'fc00::/7', 'fe80::/10'];

/** Rede interna = privados, ULA, link-local (IPv4 e IPv6) e as faixas do site. */
export const ehInterno = (ip: string, faixas: string[]): boolean => [...PRIVADAS, ...faixas].some((f) => ipNaFaixa(ip, f));

// Multicast, broadcast limitado, não especificado e loopback não são hosts: nem ativo, nem fluxo, nem pendência.
const NAO_HOST = ['224.0.0.0/4', '255.255.255.255/32', '0.0.0.0/32', '127.0.0.0/8', 'ff00::/8', '::/128', '::1/128'];
export const ehHost = (ip: string): boolean => !NAO_HOST.some((f) => ipNaFaixa(ip, f));

// Resumo do sensor de rede (spec §2–§3): esquema estrito; qualquer erro recusa o arquivo inteiro.
export const PROTOCOLOS_REDE = ['modbus', 'dnp3', 'iec104', 's7comm', 'enip', 'bacnet', 'opcua', 'mms', 'goose', 'http', 'https', 'ssh', 'telnet',
  'rdp', 'smb', 'snmp', 'ntp', 'dns', 'syslog', 'ftp', 'profinet'] as const;
const ip = z.string().refine((s) => normalizarIp(s) !== null, 'IP inválido');
const quando = z.iso.datetime();
const porta = z.number().int().min(0).max(65535);
const protocolo = z.enum(PROTOCOLOS_REDE);
export const resumoRedeSchema = z.object({
  formato: z.literal('n.ot-resumo-rede/1'),
  gerado_em: quando,
  periodo: z.object({ inicio: quando, fim: quando }).strict().optional(),
  zeek_versao: z.string().max(50).regex(/^[\w.+-]+$/).optional(),
  capture_loss: z.number().min(0).max(100).optional(), // percentual do capture_loss.log do Zeek
  versao_script: z.string().regex(/^[\w.+-]{1,20}$/).optional(),
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
  ativos: { chave: string; dados: Record<string, unknown> }[];
  macs: { chave: string; dados: { ip: string; mac: string; nome: string } }[];
  fluxos: { chave: string; dados: Record<string, unknown> }[];
  pendentes: { chave: string; origem_ip_hash: string | null; destino_ip_hash: string | null; dados: Record<string, unknown> }[];
  contagem: { ativos_novos: number; ativos_conhecidos: number; macs_completados: number; fluxos_criados: number; fluxos_pendentes: number;
    fluxos_conhecidos: number; macs_gateway_ignorados: number };
}

/** Chave de novidade (HMAC por projeto, com o site): o mesmo IP em outro site é outra chave. */
export const chaveAtivo = (chaves: ChavesOt, projectId: string, siteId: string, ip: string) => hmacOt(chaves, projectId, `${siteId}|${ip}`);
/** Lado externo (`null`) vira o literal `ext`: nunca o IP nem o HMAC do IP externo. */
export const chaveFluxo = (chaves: ChavesOt, projectId: string, siteId: string, o: string | null, d: string | null, protocolo: string, porta: number) =>
  hmacOt(chaves, projectId, `${siteId}|${o ?? 'ext'}|${d ?? 'ext'}|${protocolo}|${porta}`);

const contar = (p: Plano) => {
  p.contagem.ativos_novos = p.ativos.length;
  p.contagem.macs_completados = p.macs.length;
  p.contagem.fluxos_criados = p.fluxos.length;
  p.contagem.fluxos_pendentes = p.pendentes.length;
  return p;
};

/**
 * Resumo validado → achados de ativo, MACs a completar, fluxos com pontas do site e pendências (só hash). Comparação por `ip_hash` no
 * índice do site, sem decifrar. Na pendência o lado externo fica com hash nulo: IP externo nunca é guardado, nem como HMAC.
 */
export async function planejarResumo(db: D1Database, chaves: ChavesOt, projectId: string, site: { id: string; faixas: string[] }, resumo: ResumoRede): Promise<Plano> {
  const [ativos, fluxosInv] = await Promise.all([ativosDoSite(db, projectId, site.id), fluxosDoSite(db, projectId, site.id)]);
  const idx = indice(ativos.results);
  // Fluxo já no inventário (mesmas pontas, protocolo e porta) não vira achado (spec §1/§4.4); o bidirecional cobre o sentido inverso.
  const norm = (p: unknown) => String(p ?? "").trim().toLowerCase();
  const pontaInv = (f: Record<string, unknown>, lado: string) => String(f[`${lado}_ativo_id`] ?? f[`${lado}_zona_id`] ?? '');
  const inventario = new Set(fluxosInv.flatMap((f) => {
    const o = pontaInv(f, 'origem'), d = pontaInv(f, 'destino');
    return [`${o}|${d}|${norm(f.protocolo)}|${f.porta}`, ...(f.direcao === 'bidirecional' ? [`${d}|${o}|${norm(f.protocolo)}|${f.porta}`] : [])];
  }));
  const hashes = new Map<string, string>();
  const hash = async (x: string) => hashes.get(x) ?? hashes.set(x, await hmacOt(chaves, projectId, x)).get(x)!;
  const interno = (x: string) => ehInterno(x, site.faixas);
  const doSite = async (x: string) => idx.achar({ ip_hash: await hash(x) });

  const plano: Plano = { ativos: [], macs: [], fluxos: [], pendentes: [], contagem: { ativos_novos: 0, ativos_conhecidos: 0, macs_completados: 0, fluxos_criados: 0, fluxos_pendentes: 0, fluxos_conhecidos: 0, macs_gateway_ignorados: 0 } };
  const conexoes = resumo.conexoes.map((c) => ({ ...c, origem: normalizarIp(c.origem)!, destino: normalizarIp(c.destino)! }))
    .filter((c) => ehHost(c.origem) && ehHost(c.destino));
  // ativo novo só para IP que originou conexão, tem MAC, ou foi destino de TCP/aplicação identificada (outstation só responde; sem MAC no Zeek).
  // Broadcast de sub-rede só recebe UDP sem aplicação, então fica de fora.
  const vivos = new Set(conexoes.flatMap((c) => [c.origem, ...(c.transporte === 'tcp' || c.aplicacao ? [c.destino] : [])]));
  // Sonda atrás de roteador/firewall: IPs de outra sub-rede chegam com o MAC do gateway. MAC em 3+ IPs do resumo (externos contam) é dele,
  // não do ativo: nem completa MAC, nem vai no ativo novo, nem dá fabricante (o script tira o fabricante do OUI desse MAC).
  const ipsPorMac = new Map<string, Set<string>>();
  for (const a of resumo.ativos) {
    const m = a.mac && normalizarMac(a.mac);
    if (m) ipsPorMac.set(m, (ipsPorMac.get(m) ?? new Set()).add(normalizarIp(a.ip)!));
  }
  const ipsVistos = new Set<string>();
  for (const a0 of resumo.ativos) {
    const gateway = !!a0.mac && ipsPorMac.get(normalizarMac(a0.mac)!)!.size >= 3;
    const a = gateway ? { ...a0, mac: undefined, fabricante: undefined } : a0;
    const x = normalizarIp(a.ip)!;
    if (!interno(x) || !ehHost(x) || ipsVistos.has(x)) continue;
    ipsVistos.add(x); // IP conhecido repetido também conta uma vez só
    if (gateway) plano.contagem.macs_gateway_ignorados++;
    const mac = a.mac && normalizarMac(a.mac)!;
    const existente = await doSite(x);
    if (existente) {
      plano.contagem.ativos_conhecidos++;
      // nome do ativo existente: sem ele o item do lote seria recusado por "nome obrigatório"
      if (mac && !existente.mac_hash) plano.macs.push({ chave: await chaveAtivo(chaves, projectId, site.id, x), dados: { ip: x, mac, nome: existente.nome } });
      continue;
    }
    if (!mac && !vivos.has(x)) continue;
    const [p] = a.protocolos;
    // até 100 portas (teto de protocolos_portas do ativo); o script ordena as portas, então ficam as menores
    const pp = !p ? undefined : a.portas_servico.length ? a.portas_servico.slice(0, 100).map((porta) => ({ protocolo: p, porta })) : [{ protocolo: p }];
    // nome é obrigatório na aprovação; gerado sem IP
    const nome = `${a.fabricante || 'Dispositivo'} (${p || 'rede'}) #${plano.ativos.length + 1}`;
    plano.ativos.push({ chave: await chaveAtivo(chaves, projectId, site.id, x),
      dados: { ip: x, nome, ...(mac && { mac }), ...(a.fabricante && { fabricante: a.fabricante }), ...(pp && { protocolos_portas: pp }) } });
  }

  const vistos = new Set<string>();
  for (const c of conexoes) {
    const o = c.origem, d = c.destino;
    const io = interno(o), id = interno(d);
    if (!io && !id) continue; // não é fluxo do site
    const protocolo = c.aplicacao ?? c.transporte;
    // a chave decide a duplicata: mesmas pontas internas, protocolo e porta dão o mesmo item
    const chave = await chaveFluxo(chaves, projectId, site.id, io ? o : null, id ? d : null, protocolo, c.porta);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const dados: Record<string, unknown> = { protocolo, porta: c.porta, direcao: 'unidirecional', ...(!(io && id) && { externo: true }) };
    const ao = io ? (await doSite(o))?.id : undefined, ad = id ? (await doSite(d))?.id : undefined;
    if ((io && !ao) || (id && !ad)) {
      plano.pendentes.push({ chave, origem_ip_hash: io ? await hash(o) : null, destino_ip_hash: id ? await hash(d) : null, dados });
      continue;
    }
    if (inventario.has(`${ao ?? ''}|${ad ?? ''}|${norm(protocolo)}|${c.porta}`)) { plano.contagem.fluxos_conhecidos++; continue; }
    plano.fluxos.push({ chave, dados: { ...(ao && { origem_ativo_id: ao }), ...(ad && { destino_ativo_id: ad }), ...dados } });
  }
  return contar(plano);
}

const LOTE_CHAVES = 1000;
/**
 * Tira do plano o que já está no projeto com a mesma `chave_sensor`: achado em rascunho, descartado há menos de 90 dias ou pendência.
 * Enviado (ou descartado há mais tempo) volta a ser novidade. Uma consulta por lote de chaves.
 */
export async function filtrarNovidade(db: D1Database, projectId: string, plano: Plano): Promise<{ plano: Plano; repetidos: number }> {
  const todas = [...plano.ativos, ...plano.macs, ...plano.fluxos, ...plano.pendentes].map((x) => x.chave);
  const vistas = new Set<string>();
  for (let i = 0; i < todas.length; i += LOTE_CHAVES) {
    const lote = JSON.stringify(todas.slice(i, i + LOTE_CHAVES));
    const { results } = await db.prepare(`SELECT chave_sensor AS c FROM ot_achados WHERE project_id = ? AND chave_sensor IN (SELECT value FROM json_each(?))
        AND (situacao = 'rascunho' OR (situacao = 'descartado' AND updated_at > datetime('now', '-90 days')))
      UNION SELECT chave_sensor FROM ot_fluxos_pendentes WHERE project_id = ? AND chave_sensor IN (SELECT value FROM json_each(?))
      LIMIT ${TETO_LEITURA_OT}`).bind(projectId, lote, projectId, lote).all<{ c: string }>();
    for (const r of results) vistas.add(r.c);
  }
  const novo = <T extends { chave: string }>(xs: T[]) => xs.filter((x) => !vistas.has(x.chave));
  const filtrado = contar({ ativos: novo(plano.ativos), macs: novo(plano.macs), fluxos: novo(plano.fluxos), pendentes: novo(plano.pendentes),
    contagem: { ...plano.contagem } });
  return { plano: filtrado, repetidos: todas.length - [...filtrado.ativos, ...filtrado.macs, ...filtrado.fluxos, ...filtrado.pendentes].length };
}

export const INSERIR_ACHADO_SENSOR = (entidade: 'ativo' | 'fluxo') => INSERIR_ACHADO('consultor', entidade, true);
export const TETO_PENDENTES_SESSAO = 2000;
export type Contagens = { ativos_novos: number; macs_completados: number; fluxos_criados: number; fluxos_pendentes: number; nao_importados: number;
  pendentes_nao_importados: number };

/**
 * Grava o plano na sessão: achados (ativos novos, MACs, fluxos) com `chave_sensor` e pendências só com hash. Teto lido uma vez: só as
 * vagas livres são cifradas; a guarda do INSERT segura a corrida. Se os achados falharem, as pendências desta chamada saem antes do erro.
 */
export async function gravarPlano(db: D1Database, chaves: ChavesOt, a: { projectId: string; siteId: string; levantamentoId: string; criadoPor: string;
  evidencia: string; plano: Plano }): Promise<Contagens> {
  const { projectId, siteId, levantamentoId, criadoPor, evidencia, plano } = a;
  const [n, np] = await Promise.all([
    db.prepare('SELECT count(*) AS n FROM ot_achados WHERE levantamento_id = ?').bind(levantamentoId).first<{ n: number }>(),
    db.prepare('SELECT count(*) AS n FROM ot_fluxos_pendentes WHERE levantamento_id = ?').bind(levantamentoId).first<{ n: number }>(),
  ]);
  const planejados = [...plano.ativos.map((x) => ['novo', x] as const), ...plano.macs.map((x) => ['mac', x] as const), ...plano.fluxos.map((x) => ['fluxo', x] as const)];
  const itens = planejados.slice(0, Math.max(0, TETO_ACHADOS_SESSAO - (n?.n ?? 0)));
  const pendentes = plano.pendentes.slice(0, Math.max(0, TETO_PENDENTES_SESSAO - (np?.n ?? 0)));

  const [zonas, pontas] = await Promise.all([zonasDoSite(db, projectId, siteId), pontasDoSite(db, projectId, siteId)]);
  const stmts: D1PreparedStatement[] = [];
  for (const [tipo, { chave, dados }] of itens) {
    const entidade = tipo === 'fluxo' ? 'fluxo' : 'ativo';
    const id = genId(); // o mesmo id na AAD da cifra e na linha
    const p = await prepararAchado(chaves, projectId, siteId, id, dados, zonas, entidade, pontas);
    stmts.push(db.prepare(INSERIR_ACHADO_SENSOR(entidade)).bind(id, projectId, levantamentoId, JSON.stringify(p.dados), JSON.stringify(p.erros), evidencia,
      criadoPor, chave, levantamentoId));
  }
  // Pendências primeiro: se os achados falharem, as desta chamada saem antes do erro (um novo envio não as duplica).
  const idsPend = pendentes.map(() => genId());
  const pend = pendentes.map((p, i) => db.prepare(`INSERT INTO ot_fluxos_pendentes (id, project_id, levantamento_id, origem_ip_hash, destino_ip_hash, dados,
    chave_sensor) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(idsPend[i], projectId, levantamentoId, p.origem_ip_hash, p.destino_ip_hash,
    JSON.stringify({ ...p.dados, evidencia }), p.chave));
  let criados: number;
  try {
    for (let i = 0; i < pend.length; i += 50) await db.batch(pend.slice(i, i + 50));
    criados = await gravarAchados(db, stmts);
  } catch (e) {
    await db.prepare('DELETE FROM ot_fluxos_pendentes WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(idsPend)).run()
      .catch((x) => console.error('ot.rede: falha ao limpar pendências', x));
    throw e;
  }
  // A guarda só recusa depois que a sessão enche, e ela não esvazia no meio: os gravados são os primeiros `criados` itens.
  const gravados = itens.slice(0, criados);
  const conta = (t: string) => gravados.filter(([x]) => x === t).length;
  return { ativos_novos: conta('novo'), macs_completados: conta('mac'), fluxos_criados: conta('fluxo'), fluxos_pendentes: pendentes.length,
    nao_importados: planejados.length - criados, pendentes_nao_importados: plano.pendentes.length - pendentes.length };
}

export const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const EVIDENCIA_SENSOR = (n: number, inicio: string, fim: string) => `Sensor de rede (Zeek): ${n} conexões entre ${ddmm(inicio)} e ${ddmm(fim)}`;

/**
 * Segunda passagem (spec §3.4): pendência cujos hashes internos agora casam com ativos do site da sua sessão vira achado de fluxo nessa
 * sessão (mesmo encerrada) e sai da tabela. Só lê as pendências que citam o ip_hash de um ativo desta aprovação (`ativoIds`).
 * Sessão cheia (teto de 2.000): a pendência fica. Pendência malformada é pulada. Devolve quantas viraram achado.
 */
export async function resolverPendentes(db: D1Database, chaves: ChavesOt, projectId: string, ativoIds: string[]): Promise<number> {
  const { results } = await db.prepare(`WITH h AS (SELECT ip_hash FROM ot_ativos WHERE project_id = ? AND ip_hash IS NOT NULL
      AND id IN (SELECT value FROM json_each(?)))
    SELECT p.id, p.levantamento_id, p.origem_ip_hash, p.destino_ip_hash, p.dados, p.chave_sensor, l.site_id, l.criado_por
    FROM ot_fluxos_pendentes p JOIN ot_levantamentos l ON l.id = p.levantamento_id AND l.project_id = p.project_id
    WHERE p.project_id = ? AND (p.origem_ip_hash IN (SELECT ip_hash FROM h) OR p.destino_ip_hash IN (SELECT ip_hash FROM h))
    ORDER BY p.created_at, p.id LIMIT ${TETO_LEITURA_OT}`).bind(projectId, JSON.stringify(ativoIds), projectId)
    .all<{ id: string; levantamento_id: string; origem_ip_hash: string | null; destino_ip_hash: string | null; dados: string; chave_sensor: string | null;
      site_id: string; criado_por: string }>();
  const sites = new Map<string, Promise<[ReturnType<typeof indice>, Awaited<ReturnType<typeof pontasDoSite>>]>>();
  const doSite = (s: string) => sites.get(s) ?? sites.set(s, Promise.all([ativosDoSite(db, projectId, s).then((r) => indice(r.results)), pontasDoSite(db, projectId, s)])).get(s)!;
  const pares: D1PreparedStatement[][] = [];
  for (const p of results) {
    const [idx, pontas] = await doSite(p.site_id);
    const ao = p.origem_ip_hash ? idx.achar({ ip_hash: p.origem_ip_hash })?.id : undefined;
    const ad = p.destino_ip_hash ? idx.achar({ ip_hash: p.destino_ip_hash })?.id : undefined;
    if ((p.origem_ip_hash && !ao) || (p.destino_ip_hash && !ad)) continue;
    let evidencia: unknown, fluxo: Record<string, unknown>;
    try { ({ evidencia, ...fluxo } = JSON.parse(p.dados) as Record<string, unknown>); } // prepararFluxo recusa campo desconhecido
    catch (e) { console.error('ot: pendência de fluxo malformada', p.id, e); continue; }
    const id = genId();
    const r = await prepararAchado(chaves, projectId, p.site_id, id, { ...(ao && { origem_ativo_id: ao }), ...(ad && { destino_ativo_id: ad }), ...fluxo },
      undefined, 'fluxo', pontas);
    // Batch atômico [INSERT só se a pendência ainda existe, DELETE só se o achado entrou]: aprovação simultânea não repete o achado;
    // sessão cheia (INSERT recusado pelo teto) deixa a pendência. criado_por: quem abriu a sessão (a criação é do sistema).
    pares.push([
      // a chave da pendência passa ao achado: o filtro de novidade continua a vê-la
      db.prepare(`${INSERIR_ACHADO_SENSOR('fluxo')} AND EXISTS (SELECT 1 FROM ot_fluxos_pendentes WHERE id = ?)`).bind(id, projectId, p.levantamento_id,
        JSON.stringify(r.dados), JSON.stringify(r.erros), String(evidencia ?? ''), p.criado_por, p.chave_sensor, p.levantamento_id, p.id),
      db.prepare(`DELETE FROM ot_fluxos_pendentes WHERE id = ? AND project_id = ? AND EXISTS (SELECT 1 FROM ot_achados WHERE id = ?)`).bind(p.id, projectId, id),
    ]);
  }
  let criados = 0;
  for (let i = 0; i < pares.length; i += 25) {
    const rs = await db.batch(pares.slice(i, i + 25).flat());
    for (let j = 0; j < rs.length; j += 2) criados += rs[j].meta.changes;
  }
  return criados;
}
