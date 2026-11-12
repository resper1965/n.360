// Coleta do n.ot (spec §7; modelo de ameaças P0-3, P0-5, P1-3, P1-5, P1-7). Planilha e entrada manual caem na MESMA tubulação:
// linhas → itens validados campo a campo → staging (`ot_lote_itens`, IP/MAC já cifrados) → aprovação de outra pessoa → `ot_ativos`.
// Nada grava direto no inventário. O export de ativos do Nozomi tem perfil de fábrica no de-para (ot-depara.ts, `NOZOMI`); Claroty e
// Tenable OT seriam outro mapa de cabeçalho como esse: não implementados sem amostra real de export.
import type { ZodType } from 'zod';
import { genId } from '../helpers';
import { otAtivoCriarSchema, TETO_ITENS_LOTE } from '../schemas/ot';
import { chave } from './tratamentos-importar';
import { aadOt, cifrarEnderecos, normalizarIp, normalizarMac, cifrarOt, decifrarOt, type ChavesOt } from './ot-cifra';
import { serializarAtivo, TETO_LEITURA_OT, type LinhaAtivo } from './ot-inventario';
import { MAC_GATEWAY_MIN_IPS, resolverPendentes } from './ot-rede';
import { fecharRegularizados } from './ot-desvio';
import type { Bindings } from '../index';
import { COLS_FLUXO, fluxosDoSite, indiceFluxos, pontasDoSite, prepararFluxo, type FluxoExistente } from './ot-fluxo-achado';

export const TETO_ITENS = TETO_ITENS_LOTE;
export const TETO_LOTES_DIA = 20;
const BLOCO = 50; // statements por batch do D1, como em tratamentos-importar

/** Cabeçalho da planilha (sem acento nem caixa, por `chave`) → campo do ativo. Coluna fora daqui é ignorada, nunca gravada. */
export const COLUNAS: Record<string, string> = {
  nome: 'nome', ativo: 'nome', nome_do_ativo: 'nome',
  ip: 'ip', endereco_ip: 'ip', ip_address: 'ip',
  mac: 'mac', endereco_mac: 'mac', mac_address: 'mac',
  fabricante: 'fabricante', fornecedor: 'fabricante', vendor: 'fabricante',
  modelo: 'modelo', model: 'modelo',
  tipo: 'tipo_dispositivo', tipo_dispositivo: 'tipo_dispositivo', tipo_de_dispositivo: 'tipo_dispositivo',
  funcao: 'funcao',
  protocolos: 'protocolos_portas', protocolos_portas: 'protocolos_portas', protocolo: 'protocolos_portas', portas: 'protocolos_portas',
  firmware: 'firmware_so_versao', firmware_so: 'firmware_so_versao', firmware_so_versao: 'firmware_so_versao', versao_firmware: 'firmware_so_versao',
  arciber: 'no_arciber', no_arciber: 'no_arciber',
  categoria: 'categoria_arciber', categoria_arciber: 'categoria_arciber',
  firmware_nao_aplicavel: 'firmware_nao_aplicavel',
  zona: 'zona',
};
const SIM = ['sim', 's', '1', 'true', 'x', 'yes'];
const NAO = ['nao', 'n', '0', 'false', 'no'];

/** Célula (já aparada, não vazia) → valor do campo, como no corpo JSON da entrada manual. */
export function valorDaCelula(campo: string, v: string): unknown {
  if (campo === 'no_arciber' || campo === 'firmware_nao_aplicavel') return SIM.includes(chave(v)) ? true : NAO.includes(chave(v)) ? false : v;
  if (campo === 'categoria_arciber') return chave(v);
  if (campo === 'protocolos_portas') {
    return v.split(/[|,;]/).map((p) => p.trim()).filter(Boolean).map((p) => {
      const [protocolo, porta] = p.split(':').map((x) => x.trim());
      return porta === undefined ? { protocolo } : { protocolo, porta: /^\d+$/.test(porta) ? Number(porta) : porta };
    });
  }
  return v;
}

/** Planilha (cabeçalho + linhas) → objetos como o corpo JSON da entrada manual. Célula vazia = campo ausente. */
export function linhasDaPlanilha(linhas: string[][]) {
  const [cab = [], ...resto] = linhas;
  const campos = cab.map((c) => COLUNAS[chave(c)]);
  const ignoradas = cab.filter((_, i) => !campos[i]);
  const itens = resto.map((l) => {
    const o: Record<string, unknown> = {};
    l.forEach((bruto, i) => {
      const campo = campos[i];
      const v = bruto.trim();
      if (!campo || !v || campo in o) return;
      o[campo] = valorDaCelula(campo, v);
    });
    return o;
  });
  semMacGateway(itens);
  return { itens, reconhecidas: campos.some(Boolean), ignoradas };
}

/**
 * MAC visto com MAC_GATEWAY_MIN_IPS+ IPs distintos na mesma planilha é do roteador/firewall (a ferramenta viu vários IPs atrás dele), não
 * do ativo: sai das linhas que o trazem. Linha sem IP não conta; a mesma linha repetida (mesmo IP e MAC) não soma. Devolve quantas linhas perderam o MAC.
 */
export function semMacGateway(itens: Record<string, unknown>[]): number {
  const mac = (o: Record<string, unknown>) => (typeof o.mac === 'string' ? normalizarMac(o.mac) : null);
  const ips = new Map<string, Set<string>>();
  for (const o of itens) {
    const m = mac(o), ip = typeof o.ip === 'string' ? normalizarIp(o.ip) : null;
    if (m && ip) ips.set(m, (ips.get(m) ?? new Set()).add(ip));
  }
  let n = 0;
  for (const o of itens) { const m = mac(o); if (m && (ips.get(m)?.size ?? 0) >= MAC_GATEWAY_MIN_IPS) { delete o.mac; n++; } }
  return n;
}

type Erro = { campo: string; motivo: string };
const FORMA: Record<string, ZodType> = otAtivoCriarSchema.shape;
const CAMPOS_ITEM = new Set([...Object.keys(FORMA).filter((k) => k !== 'site_id'), 'zona']);
// P1-7: a mensagem de erro nunca carrega o valor (a do Zod para enum traz o recebido); só as nossas, de `refine`, vão como estão.
const MOTIVO: Record<string, string> = { invalid_type: 'tipo inválido', invalid_value: 'valor fora da lista', invalid_format: 'formato inválido', too_big: 'acima do tamanho', too_small: 'vazio ou abaixo do mínimo' };

/** Os campos mínimos do 4.3.1 (espelha o CHECK `ot_ativos_4_3_1`), sobre a linha na forma do banco. */
export function falta431(l: Record<string, unknown>) {
  const tem = (k: string) => typeof l[k] === 'string' && (l[k] as string).trim() !== '';
  return l.no_arciber === 1 && !(l.categoria_arciber && tem('tipo_dispositivo') && tem('fabricante') && tem('funcao') && (l.ip_cifrado || l.mac_cifrado)
    && (JSON.parse((l.protocolos_portas as string) ?? '[]') as unknown[]).length > 0 && (tem('firmware_so_versao') || l.firmware_nao_aplicavel === 1));
}
/**
 * Regra da verificação do 4.3.1: aprovação com todos os campos recoletados carimba; edição direta (PUT) que toca um deles, ou item de lote
 * que MUDA um deles em relação ao alvo, zera; o resto mantém. Sem `alvo`, basta tocar. IP/MAC comparados pelo hash (o staging não tem o claro).
 */
const CAMPOS_4_3_1 = ['no_arciber', 'categoria_arciber', 'tipo_dispositivo', 'fabricante', 'funcao', 'ip', 'mac', 'protocolos_portas', 'firmware_so_versao', 'firmware_nao_aplicavel'];
export const toca431 = (d: Record<string, unknown>, alvo?: Record<string, unknown>) => CAMPOS_4_3_1.some((k) => {
  const col = k === 'ip' || k === 'mac' ? `${k}_hash` : k;
  const v = d[k] ?? d[col];
  return v !== undefined && (!alvo || v !== (alvo[col] ?? null));
});
/** Momento com milissegundos: o `updated_at` do alvo é comparado com o do item (P1-4), e o segundo inteiro esconderia a edição. */
export const AGORA_MS = `strftime('%Y-%m-%d %H:%M:%f', 'now')`;
export const FALTA_4_3_1 = 'Ativo do ARCiber exige os campos mínimos do 4.3.1 da RO-CB.BR.01: categoria, tipo de dispositivo, fabricante, função, IP ou MAC, ao menos um protocolo/porta e firmware/SO (ou "não aplicável")';

/**
 * Um item: cada campo validado sozinho pelo esquema do ativo (o mesmo do cadastro). Campo inválido vira erro e NÃO entra em `dados`
 * (assim um IP digitado em campo livre não chega ao staging); campo desconhecido (`ip_cifrado`, `verificado_por`...) também é erro.
 * `dados` sai na forma da linha de `ot_ativos`, com IP/MAC cifrados com a AAD do item.
 */
export async function prepararItem(chaves: ChavesOt, projectId: string, id: string, bruto: Record<string, unknown>, zonas: Map<string, string>,
  tabela = 'ot_lote_itens') {
  const erros: Erro[] = [];
  const ok: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(bruto)) {
    if (!CAMPOS_ITEM.has(campo)) { erros.push({ campo, motivo: 'campo não aceito' }); continue; }
    if (campo === 'zona' || campo === 'zona_id') {
      const z = campo === 'zona' ? zonas.get(chave(String(valor))) : [...zonas.values()].find((x) => x === valor);
      if (z) ok.zona_id = z; else erros.push({ campo, motivo: 'zona não encontrada no site' });
      continue;
    }
    const v = FORMA[campo].safeParse(valor);
    if (v.success) ok[campo] = v.data;
    else { const i = v.error.issues[0]; erros.push({ campo, motivo: i.code === 'custom' ? i.message : MOTIVO[i.code] ?? 'valor inválido' }); }
  }
  if (ok.nome === undefined && !erros.some((e) => e.campo === 'nome')) erros.push({ campo: 'nome', motivo: 'obrigatório' });
  const { ip, mac, protocolos_portas, no_arciber, firmware_nao_aplicavel, ...resto } = ok;
  const dados: Record<string, unknown> = {
    ...resto,
    ...(no_arciber !== undefined && { no_arciber: Number(no_arciber) }),
    ...(firmware_nao_aplicavel !== undefined && { firmware_nao_aplicavel: Number(firmware_nao_aplicavel) }),
    ...(protocolos_portas !== undefined && { protocolos_portas: JSON.stringify(protocolos_portas) }),
    ...await cifrarEnderecos(chaves, projectId, tabela, id, { ip: ip as string | undefined, mac: mac as string | undefined }),
  };
  if (falta431(dados)) erros.push({ campo: '4.3.1', motivo: FALTA_4_3_1 });
  return { dados, erros };
}

export interface Existente { id: string; ip_hash: string | null; mac_hash: string | null; fabricante: string | null; modelo: string | null; nome: string; [k: string]: unknown }
const chaveNome = (d: Record<string, unknown>) => d.fabricante && d.modelo && d.nome ? `${chave(String(d.fabricante))}|${chave(String(d.modelo))}|${chave(String(d.nome))}` : null;

/**
 * Índice de duplicata (spec §7): `mac_hash`, depois `ip_hash`, depois fabricante + modelo + nome normalizados, SÓ no site do lote.
 * Restringir ao site do lote (que é sempre um site permitido) é o que tira o oráculo do P0-5: ativo de outro site nunca casa, então
 * a resposta para o IP de um site sem acesso é a mesma de um IP novo.
 */
export function indice(ativos: Existente[]) {
  const m = new Map<string, Existente>();
  const por = (a: Existente) => [a.mac_hash && `m:${a.mac_hash}`, a.ip_hash && `i:${a.ip_hash}`, chaveNome(a) && `n:${chaveNome(a)}`].filter(Boolean) as string[];
  const add = (a: Existente) => por(a).forEach((k) => m.set(k, a));
  ativos.forEach(add);
  return { add, achar: (d: Record<string, unknown>) => por(d as Existente).map((k) => m.get(k)).find(Boolean) };
}

const COLS_ATIVO = ['zona_id', 'nome', 'no_arciber', 'categoria_arciber', 'tipo_dispositivo', 'fabricante', 'modelo', 'funcao', 'ip_cifrado', 'mac_cifrado',
  'ip_hash', 'mac_hash', 'protocolos_portas', 'firmware_so_versao', 'firmware_nao_aplicavel'] as const;
export const ativosDoSite = (db: D1Database, projectId: string, siteId: string) =>
  db.prepare(`SELECT id, ${COLS_ATIVO.join(', ')}, updated_at FROM ot_ativos WHERE project_id = ? AND site_id = ? AND status = 'ativo'
    LIMIT ${TETO_LEITURA_OT}`).bind(projectId, siteId).all<Existente>();

export async function zonasDoSite(db: D1Database, projectId: string, siteId: string) {
  const z = await db.prepare(`SELECT id, nome FROM ot_zonas WHERE project_id = ? AND site_id = ? AND status = 'ativo' LIMIT ${TETO_LEITURA_OT}`).bind(projectId, siteId).all<{ id: string; nome: string }>();
  return new Map(z.results.map((x) => [chave(x.nome), x.id]));
}

/** Batches de até BLOCO statements; um grupo (array) nunca se parte entre batches: o `changes()` do item lê o statement anterior. */
async function emBlocos(db: D1Database, itens: (D1PreparedStatement | D1PreparedStatement[])[]) {
  let bloco: D1PreparedStatement[] = [];
  for (const g of itens) {
    const s = [g].flat();
    if (bloco.length && bloco.length + s.length > BLOCO) { await db.batch(bloco); bloco = []; }
    bloco.push(...s);
  }
  if (bloco.length) await db.batch(bloco);
}

type Falha = { ok: false; status: 400 | 403 | 404 | 409 | 429; error: string };

/**
 * Cria o lote (planilha ou manual) já em revisão. O site precisa estar entre os permitidos (a rota passa a lista). `entidades[n]` é o tipo de
 * `brutos[n]` (ausente = ativo); só o envio de achados o passa: nada no corpo do usuário escolhe a entidade.
 */
export async function criarLote(db: D1Database, chaves: ChavesOt, ator: { id: string }, projectId: string, siteId: string, fonte: 'planilha' | 'manual',
  brutos: Record<string, unknown>[], levantamentoId: string | null = null, entidades: ('ativo' | 'fluxo')[] = []):
  Promise<Falha | { ok: true; id: string; itens: number; com_erro: number; possiveis_duplicatas: number; itemIds: string[] }> {
  if (!brutos.length) return { ok: false, status: 400, error: 'Lote sem itens' };
  if (brutos.length > TETO_ITENS) return { ok: false, status: 400, error: `Lote acima de ${TETO_ITENS} itens` };
  const hoje = await db.prepare(`SELECT count(*) AS n FROM ot_lotes WHERE criado_por = ? AND created_at > datetime('now', '-1 day')`).bind(ator.id).first<{ n: number }>();
  if ((hoje?.n ?? 0) >= TETO_LOTES_DIA) return { ok: false, status: 429, error: `Limite de ${TETO_LOTES_DIA} lotes por dia atingido` };

  const [mapaZonas, ativos] = await Promise.all([zonasDoSite(db, projectId, siteId), ativosDoSite(db, projectId, siteId)]);
  const idx = indice(ativos.results);
  const [pontas, fluxos] = entidades.includes('fluxo') ? await Promise.all([pontasDoSite(db, projectId, siteId), fluxosDoSite(db, projectId, siteId)]) : [];
  const idxF = indiceFluxos(fluxos ?? []);
  const loteId = genId();
  await db.prepare(`INSERT INTO ot_lotes (id, project_id, site_id, fonte, criado_por, levantamento_id) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(loteId, projectId, siteId, fonte, ator.id, levantamentoId).run();
  try {
    let comErro = 0, dups = 0;
    const stmts: D1PreparedStatement[] = [];
    const itemIds: string[] = [];
    for (const [n, bruto] of brutos.entries()) {
      const id = genId();
      const entidade = entidades[n] ?? 'ativo';
      const { dados, erros } = entidade === 'fluxo' ? prepararFluxo(bruto, pontas!) : await prepararItem(chaves, projectId, id, bruto, mapaZonas);
      const dup = entidade === 'fluxo' ? idxF.achar(dados) : idx.achar(dados);
      comErro += Number(erros.length > 0);
      dups += Number(!!dup);
      itemIds.push(id);
      stmts.push(db.prepare(`INSERT INTO ot_lote_itens (id, project_id, lote_id, linha, entidade, dados, erros, duplicata_de, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${AGORA_MS})`)
        .bind(id, projectId, loteId, n + 2, entidade, JSON.stringify(dados), JSON.stringify(erros), dup?.id ?? null));
    }
    await emBlocos(db, stmts);
    await db.prepare(`UPDATE ot_lotes SET status = 'em_revisao', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(loteId).run();
    return { ok: true, id: loteId, itens: brutos.length, com_erro: comErro, possiveis_duplicatas: dups, itemIds };
  } catch (e) {
    await db.prepare(`UPDATE ot_lotes SET status = 'erro', motivo = 'Falha ao gravar os itens', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(loteId).run();
    throw e;
  }
}

export interface LinhaItem { id: string; project_id: string; linha: number; entidade: string; dados: string; erros: string; duplicata_de: string | null; decisao: string; motivo: string | null; registro_id: string | null; updated_at?: string }

/**
 * Item pelo serializador único do ativo (P0-6). P0-5/A1 (decisão do dono): a marca de duplicata é oráculo de "este IP existe", então quem
 * não vê completo não recebe `possivel_duplicata`, nem o alvo, nem o motivo de alvo alterado; só quem vê completo (e aprova) os vê.
 */
export async function serializarItem(i: LinhaItem, completo: boolean, chaves: ChavesOt) {
  const d = JSON.parse(i.dados) as Record<string, unknown>;
  if (i.entidade === 'fluxo') {
    return { id: i.id, linha: i.linha, entidade: 'fluxo', decisao: i.decisao, motivo: motivoVisivel(i.motivo, completo), erros: JSON.parse(i.erros) as Erro[],
      ...(completo && { possivel_duplicata: !!i.duplicata_de, duplicata_de: i.duplicata_de, registro_id: i.registro_id }), dados: d };
  }
  const linha = { ip_cifrado: null, mac_cifrado: null, ip_hash: null, mac_hash: null, protocolos_portas: '[]', no_arciber: 0, firmware_nao_aplicavel: 0, ...d,
    id: i.id, project_id: i.project_id } as LinhaAtivo;
  const { id: _i, project_id: _p, ...dados } = await serializarAtivo(linha, completo, chaves, 'ot_lote_itens');
  return {
    id: i.id, linha: i.linha, entidade: 'ativo', decisao: i.decisao, motivo: motivoVisivel(i.motivo, completo), erros: JSON.parse(i.erros) as Erro[],
    ...(completo && { possivel_duplicata: !!i.duplicata_de, duplicata_de: i.duplicata_de, registro_id: i.registro_id }),
    dados,
  };
}

/** Recifra IP/MAC do staging (AAD do item) para a linha do inventário (AAD do ativo); o hash por projeto é o mesmo. */
async function recifrar(chaves: ChavesOt, projectId: string, itemId: string, ativoId: string, d: Record<string, unknown>) {
  for (const campo of ['ip', 'mac']) {
    const c = d[`${campo}_cifrado`];
    if (typeof c !== 'string') continue;
    const claro = await decifrarOt(c, chaves, aadOt(projectId, 'ot_lote_itens', itemId, campo));
    d[`${campo}_cifrado`] = await cifrarOt(claro, chaves, aadOt(projectId, 'ot_ativos', ativoId, campo));
  }
}

/**
 * Aprova: item sem erro vira ativo (novo, ou mesclado na duplicata do site, recalculada AGORA e não na hora do upload); item com
 * erro é recusado. Cada ativo gravado recebe `verificado_por` e `ultima_verificacao_em` (evidência do 4.3.1). A trava é a troca
 * `em_revisao` → `gravando` (duas aprovações simultâneas gravam uma vez); lote preso em `gravando` há 10 min é retomado.
 */
export async function aprovarLote(db: D1Database, chaves: ChavesOt, ator: { id: string; email: string }, projectId: string, sites: string, loteId: string,
  desvio?: { env: Bindings; ctx: Pick<ExecutionContext, 'waitUntil'> }):
  Promise<Falha | { ok: true; criados: number; atualizados: number; recusados: number; pendentes: number; fluxos_pendentes_resolvidos: number }> {
  const lote = await decidivel(db, ator, projectId, sites, loteId);
  if (!lote.ok) return lote;
  const trava = await db.prepare(`UPDATE ot_lotes SET status = 'gravando', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?
    AND (status = 'em_revisao' OR (status = 'gravando' AND updated_at < datetime('now', '-10 minutes')))`).bind(loteId, projectId).run();
  if (!trava.meta.changes) return { ok: false, status: 409, error: 'O lote não está em revisão' };

  const [{ results: itens }, ativos, zonas, pontas, fluxos] = await Promise.all([
    db.prepare(`SELECT id, project_id, linha, entidade, dados, erros, duplicata_de, decisao, motivo, registro_id, updated_at FROM ot_lote_itens WHERE lote_id = ? AND decisao = 'pendente' ORDER BY linha LIMIT ${TETO_ITENS}`).bind(loteId).all<LinhaItem>(),
    ativosDoSite(db, projectId, lote.site_id),
    db.prepare(`SELECT id FROM ot_zonas WHERE project_id = ? AND site_id = ? AND status = 'ativo' LIMIT ${TETO_LEITURA_OT}`).bind(projectId, lote.site_id).all<{ id: string }>(),
    pontasDoSite(db, projectId, lote.site_id),
    fluxosDoSite(db, projectId, lote.site_id),
  ]);
  const idxF = indiceFluxos(fluxos);
  const zonasAtivas = new Set(zonas.results.map((z) => z.id));
  const idx = indice(ativos.results);
  const tocados = new Set<string>(); // ativos criados ou mesclados nesta aprovação: linhas do mesmo lote foram revisadas juntas
  const n = { criados: 0, atualizados: 0, recusados: 0 };
  const stmts: (D1PreparedStatement | D1PreparedStatement[])[] = [];
  const recusar = (i: LinhaItem, motivo: string) => {
    n.recusados++;
    stmts.push(db.prepare(`UPDATE ot_lote_itens SET decisao = 'recusado', motivo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(motivo, i.id));
  };
  for (const i of itens) {
    if ((JSON.parse(i.erros) as Erro[]).length) { recusar(i, ITEM_COM_ERRO); continue; }
    const d = JSON.parse(i.dados) as Record<string, unknown>;
    if (i.entidade === 'fluxo') {
      const sumiu = (['origem', 'destino'] as const).some((l) => (d[`${l}_ativo_id`] && !pontas.ativos.has(d[`${l}_ativo_id`] as string))
        || (d[`${l}_zona_id`] && !pontas.zonas.has(d[`${l}_zona_id`] as string)));
      if (sumiu) { recusar(i, PONTA_REMOVIDA); continue; }
      // Regra do confronto do fluxo: casou na chave (confirma ou contradiz, recalculado agora) atualiza só os campos do item; senão, cria.
      const alvo = idxF.achar(d);
      const fluxoId = alvo?.id ?? genId();
      // Pontas e direção são a chave do casamento: o UPDATE nunca as grava (bidirecional casado ao contrário trocaria as pontas).
      const cols = (['protocolo', 'porta', 'finalidade', 'externo', 'via_vpn'] as const).filter((k) => d[k] !== undefined);
      const novo: Record<string, unknown> = { direcao: 'unidirecional', externo: 0, via_vpn: 0, ...d };
      stmts.push([alvo
        ? db.prepare(`UPDATE ot_fluxos SET ${cols.map((k) => `${k} = ?, `).join('')}updated_at = ${AGORA_MS} WHERE id = ? AND project_id = ? AND status = 'ativo'`)
          .bind(...cols.map((k) => d[k]), fluxoId, projectId)
        : db.prepare(`INSERT INTO ot_fluxos (id, project_id, site_id, ${COLS_FLUXO.join(', ')}) VALUES (?, ?, ?, ${COLS_FLUXO.map(() => '?').join(', ')})`)
          .bind(fluxoId, projectId, lote.site_id, ...COLS_FLUXO.map((k) => novo[k] ?? null)),
      db.prepare(`UPDATE ot_lote_itens SET decisao = CASE WHEN changes() > 0 THEN 'gravado' ELSE 'pendente' END,
        registro_id = CASE WHEN changes() > 0 THEN ? END, motivo = CASE WHEN changes() > 0 THEN NULL ELSE ? END, updated_at = ${AGORA_MS} WHERE id = ?`)
        .bind(fluxoId, FLUXO_SUMIU, i.id)]);
      idxF.add({ ...(alvo ? { ...alvo, ...Object.fromEntries(cols.map((k) => [k, d[k]])) } : novo), id: fluxoId } as FluxoExistente);
      n[alvo ? 'atualizados' : 'criados']++;
      continue;
    }
    if (d.zona_id && !zonasAtivas.has(d.zona_id as string)) { recusar(i, ZONA_REMOVIDA); continue; }
    const alvo = idx.achar(d);
    // P1-4: o alvo de agora não é o revisado (outro, sumiu, ou editado depois da revisão do item): o item volta a pendente, nada é gravado.
    if (alvo ? !tocados.has(alvo.id) && (alvo.id !== i.duplicata_de || String(alvo.updated_at) > String(i.updated_at)) : !!i.duplicata_de) {
      stmts.push(db.prepare(`UPDATE ot_lote_itens SET duplicata_de = ?, motivo = ?, updated_at = ${AGORA_MS} WHERE id = ?`).bind(alvo?.id ?? null, ALVO_MUDOU, i.id));
      continue;
    }
    const ativoId = alvo?.id ?? genId();
    await recifrar(chaves, projectId, i.id, ativoId, d);
    const linha: Record<string, unknown> = { protocolos_portas: '[]', no_arciber: 0, firmware_nao_aplicavel: 0, ...alvo, ...d };
    if (falta431(linha)) { recusar(i, FALTA_4_3_1); continue; }
    const vals = COLS_ATIVO.map((k) => linha[k] ?? null);
    const recoletado = !falta431({ ...d, no_arciber: 1 });
    const verificacao = recoletado ? `verificado_por = ?, ultima_verificacao_em = CURRENT_TIMESTAMP` : alvo && toca431(d, alvo) ? `verificado_por = NULL, ultima_verificacao_em = NULL` : null;
    stmts.push([alvo
      // O WHERE compara o updated_at lido: edição entre a leitura e a gravação não é sobrescrita (changes() = 0 deixa o item pendente).
      ? db.prepare(`UPDATE ot_ativos SET ${COLS_ATIVO.map((k) => `${k} = ?`).join(', ')}${verificacao ? `, ${verificacao}` : ''},
          updated_at = ${AGORA_MS} WHERE id = ? AND project_id = ? AND status = 'ativo' AND (? OR updated_at = ?)`)
        .bind(...vals, ...(recoletado ? [ator.email] : []), ativoId, projectId, Number(tocados.has(ativoId)), alvo.updated_at)
      : db.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, ${COLS_ATIVO.join(', ')}, verificado_por, ultima_verificacao_em, updated_at)
          VALUES (?, ?, ?, ${COLS_ATIVO.map(() => '?').join(', ')}, ?, ${recoletado ? 'CURRENT_TIMESTAMP' : 'NULL'}, ${AGORA_MS})`)
        .bind(ativoId, projectId, lote.site_id, ...vals, recoletado ? ator.email : null),
    db.prepare(`UPDATE ot_lote_itens SET decisao = CASE WHEN changes() > 0 THEN 'gravado' ELSE 'pendente' END,
      registro_id = CASE WHEN changes() > 0 THEN ? END, motivo = CASE WHEN changes() > 0 THEN NULL ELSE ? END, updated_at = ${AGORA_MS} WHERE id = ?`)
      .bind(ativoId, ALVO_MUDOU, i.id)]);
    idx.add({ ...linha, id: ativoId } as Existente);
    tocados.add(ativoId);
    n[alvo ? 'atualizados' : 'criados']++;
  }
  await emBlocos(db, stmts);
  const pendentes = (await db.prepare(`SELECT count(*) AS n FROM ot_lote_itens WHERE lote_id = ? AND decisao = 'pendente'`).bind(loteId).first<{ n: number }>())?.n ?? 0;
  // Item que voltou a pendente deixa o lote em revisão para outra decisão; sem pendente, concluído.
  await db.prepare(pendentes
    ? `UPDATE ot_lotes SET status = 'em_revisao', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    : `UPDATE ot_lotes SET status = 'concluido', decidido_por = ?, decidido_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(...(pendentes ? [] : [ator.email]), loteId).run();
  // shortcut: na corrida rara em que o alvo muda entre a leitura e o batch, `atualizados` conta o item que ficou pendente; `pendentes` vem do banco.
  // Segunda passagem do sensor de rede (n.ot L3): só quando a aprovação criou ou atualizou ativo.
  // O lote já está gravado: falha aqui não derruba a aprovação (a próxima aprovação tenta de novo).
  let fluxos_pendentes_resolvidos = 0;
  if (tocados.size) {
    try { fluxos_pendentes_resolvidos = await resolverPendentes(db, chaves, projectId, [...tocados]); }
    catch (e) { console.error('ot: segunda passagem do sensor de rede falhou', e); }
  }
  // Desvio cuja chave o lote gravou vira regularizado. A chave vem do achado de origem (o item do lote não a carrega). Falha só no log.
  if (desvio && n.criados + n.atualizados) {
    try {
      const { results } = await db.prepare(`SELECT DISTINCT a.chave_sensor AS c FROM ot_achados a JOIN ot_lote_itens i ON i.id = a.lote_item_id
        WHERE i.lote_id = ? AND i.decisao = 'gravado' AND a.project_id = ? AND a.chave_sensor IS NOT NULL LIMIT ${TETO_LEITURA_OT}`).bind(loteId, projectId).all<{ c: string }>();
      await fecharRegularizados(desvio.env, desvio.ctx, projectId, results.map((r) => r.c));
    } catch (e) { console.error('ot.desvio: falha ao regularizar', e); }
  }
  await devolverRecusados(db, loteId);
  return { ok: true, ...n, pendentes, fluxos_pendentes_resolvidos };
}

const ALVO_MUDOU = 'O ativo de destino mudou depois da revisão: revise o item de novo';
const FLUXO_SUMIU = 'O fluxo de destino foi removido depois da revisão: revise o item de novo';
const ITEM_COM_ERRO = 'Item com erro de validação';
const PONTA_REMOVIDA = 'Uma ponta do fluxo foi removida';
const ZONA_REMOVIDA = 'A zona do item foi removida';
/** Motivos gerados pela aprovação (estado do inventário, não texto do revisor): quem não vê completo não os lê (oráculo, A1). */
export const MOTIVOS_DO_SISTEMA = new Set([ALVO_MUDOU, FLUXO_SUMIU, ITEM_COM_ERRO, PONTA_REMOVIDA, ZONA_REMOVIDA, FALTA_4_3_1]);
const RECUSADO_NA_APROVACAO = 'Recusado na aprovação';

/** Motivo do revisor (já sem PII, `livreSemPii`) e "Lote rejeitado" ficam visíveis; os do sistema viram texto genérico para quem não vê completo. */
export const motivoVisivel = (motivo: string | null, completo: boolean) => !completo && motivo !== null && MOTIVOS_DO_SISTEMA.has(motivo) ? RECUSADO_NA_APROVACAO : motivo;

export async function rejeitarLote(db: D1Database, ator: { id: string; email: string }, projectId: string, sites: string, loteId: string, motivo: string): Promise<Falha | { ok: true }> {
  const lote = await decidivel(db, ator, projectId, sites, loteId);
  if (!lote.ok) return lote;
  const r = await db.prepare(`UPDATE ot_lotes SET status = 'rejeitado', motivo = ?, decidido_por = ?, decidido_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND project_id = ? AND status = 'em_revisao'`).bind(motivo, ator.email, loteId, projectId).run();
  if (!r.meta.changes) return { ok: false, status: 409, error: 'O lote não está em revisão' };
  await db.prepare(`UPDATE ot_lote_itens SET decisao = 'descartado', updated_at = CURRENT_TIMESTAMP WHERE lote_id = ? AND decisao = 'pendente'`).bind(loteId).run();
  await devolverRecusados(db, loteId);
  return { ok: true };
}

/** Achado cujo item do lote foi recusado ou descartado volta a rascunho na hora. `lote_item_id` fica: é por ele que o motivo continua legível. */
const DEVOLVER = (db: D1Database, loteId: string) => db.prepare(`UPDATE ot_achados SET situacao = 'rascunho', lote_id = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE situacao = 'enviado' AND lote_id = ? AND lote_item_id IN (SELECT id FROM ot_lote_itens WHERE lote_id = ? AND decisao IN ('recusado', 'descartado'))`).bind(loteId, loteId);
/** `lote_id = ?`: o reenvio muda `lote_id` antes de religar `lote_item_id`; sem isso a devolução do lote antigo puxaria o achado reenviado. */
export async function devolverRecusados(db: D1Database, loteId: string): Promise<number> {
  return (await DEVOLVER(db, loteId).run()).meta.changes ?? 0;
}

/** Recusa um item pendente (decisão item a item): o achado ligado volta a rascunho na mesma chamada. */
export async function recusarItem(db: D1Database, ator: { id: string }, projectId: string, sites: string, loteId: string, itemId: string, motivo: string): Promise<Falha | { ok: true }> {
  const lote = await decidivel(db, ator, projectId, sites, loteId);
  if (!lote.ok) return lote;
  const item = await db.prepare(`SELECT decisao FROM ot_lote_itens WHERE id = ? AND lote_id = ? AND project_id = ?`).bind(itemId, loteId, projectId).first<{ decisao: string }>();
  if (!item) return { ok: false, status: 404, error: 'Item não encontrado' };
  // Atômico com o estado do lote: durante `gravando` (aprovação em curso) ou depois de decidido o item não muda.
  // batch: as duas instruções comitam juntas; `changes` da primeira segue valendo para o 409.
  const [r] = await db.batch([db.prepare(`UPDATE ot_lote_itens SET decisao = 'recusado', motivo = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND lote_id = ? AND decisao = 'pendente' AND EXISTS (SELECT 1 FROM ot_lotes WHERE id = ? AND project_id = ? AND status = 'em_revisao')`)
    .bind(motivo, itemId, loteId, loteId, projectId), DEVOLVER(db, loteId)]);
  if (!r.meta.changes) return { ok: false, status: 409, error: 'O item já foi decidido ou o lote não está em revisão' };
  return { ok: true };
}

/** Lote do projeto, em site permitido (revalidado na decisão, não só na revisão: P1-4), e que não foi criado por quem decide (§12.1, 6). */
async function decidivel(db: D1Database, ator: { id: string }, projectId: string, sites: string, loteId: string): Promise<Falha | { ok: true; site_id: string }> {
  const l = await db.prepare(`SELECT site_id, criado_por FROM ot_lotes WHERE id = ? AND project_id = ? AND site_id IN (SELECT value FROM json_each(?))`)
    .bind(loteId, projectId, sites).first<{ site_id: string; criado_por: string }>();
  if (!l) return { ok: false, status: 404, error: 'Lote não encontrado' };
  if (l.criado_por === ator.id) return { ok: false, status: 403, error: 'Forbidden: quem criou o lote não o aprova nem rejeita; a decisão é de outra pessoa' };
  return { ok: true, site_id: l.site_id };
}
