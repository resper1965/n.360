import type { ChavesOt } from './ot-cifra';
import { aadOt, decifrarOt } from './ot-cifra';
import { ativosDoSite, criarLote, indice, prepararItem, zonasDoSite } from './ot-coleta';
import { serializarAtivo, type LinhaAtivo } from './ot-inventario';
import { prepararFluxo } from './ot-fluxo-achado';
import { temPii } from './rascunhos-privacy';

// Descoberta operacional (spec 2026-11-01, L1). O achado usa a MESMA validação do item de lote (prepararItem), com a AAD de
// ot_achados; o confronto usa o MESMO índice da deduplicação, só no site da sessão (sem oráculo, P0-5); o envio decifra e
// entrega os achados ao criarLote, que recifra com a AAD do item e segue a aprovação existente.

export interface LinhaAchado {
  id: string; project_id: string; levantamento_id: string; entidade: string; dados: string; erros: string; evidencia: string;
  origem: string; situacao: string; lote_id: string | null; created_at: string; pergunta_id: string | null; lote_item_id: string | null;
  // vêm do LEFT JOIN com ot_lote_itens (DESFECHO_SQL); ausentes quando a leitura não faz o join
  item_decisao?: string | null; item_registro_id?: string | null; item_motivo?: string | null;
}

export const DESFECHO_SQL = 'i.decisao AS item_decisao, i.registro_id AS item_registro_id, i.motivo AS item_motivo';

/** O que aconteceu com o achado depois do envio: gravado no inventário, ou recusado com o motivo (null nos demais casos). */
export function desfechoDe(a: LinhaAchado) {
  if (a.situacao === 'enviado' && a.item_decisao === 'gravado') return { desfecho: 'no_inventario' as const, registro_id: a.item_registro_id ?? null };
  if (a.situacao === 'rascunho' && (a.item_decisao === 'recusado' || a.item_decisao === 'descartado'))
    return { desfecho: 'recusado' as const, motivo: a.item_motivo ?? 'Lote rejeitado' };
  return { desfecho: null };
}

/** Valida e cifra. O "nome obrigatório" e a falta do 4.3.1 ficam em `erros` como aviso: achado é rascunho e pode estar incompleto. */
export async function prepararAchado(chaves: ChavesOt, projectId: string, _siteId: string, achadoId: string, dados: Record<string, unknown>,
  zonas: Map<string, string> = new Map(), entidade = 'ativo', pontas?: { ativos: Set<string>; zonas: Set<string> }) {
  if (entidade === 'fluxo') return prepararFluxo(dados, pontas!);
  const r = await prepararItem(chaves, projectId, achadoId, dados, zonas, 'ot_achados');
  // O achado é texto de entrevista: campo de texto com CPF, e-mail ou telefone vira erro e não é gravado (mesma regra das notas).
  for (const [campo, v] of Object.entries(r.dados)) {
    if (typeof v === 'string' && !campo.endsWith('_cifrado') && !campo.endsWith('_hash') && temPii(v)) {
      delete r.dados[campo];
      r.erros.push({ campo, motivo: 'Não informe CPF, e-mail nem telefone' });
    }
  }
  return r;
}

/** Índice dos ativos do site: monte uma vez por requisição e passe a `confrontar` (uma leitura, não uma por achado). */
export const indiceDoSite = async (db: D1Database, projectId: string, siteId: string) => indice((await ativosDoSite(db, projectId, siteId)).results);

export async function confrontar(db: D1Database, projectId: string, siteId: string, dados: Record<string, unknown>,
  idx?: Awaited<ReturnType<typeof indiceDoSite>>) {
  const alvo = (idx ?? await indiceDoSite(db, projectId, siteId)).achar(dados);
  return alvo ? { confronto: 'confirma' as const, alvo_id: alvo.id } : { confronto: 'novo' as const, alvo_id: null };
}

/** Serializador único (P0-6) para os dados; confronto e alvo só para quem vê completo (A1). */
export async function serializarAchado(a: LinhaAchado, completo: boolean, chaves: ChavesOt,
  confronto?: { confronto: 'novo' | 'confirma' | 'contradiz'; alvo_id: string | null }) {
  const d = JSON.parse(a.dados) as Record<string, unknown>;
  if (a.entidade === 'fluxo') {
    return { id: a.id, levantamento_id: a.levantamento_id, entidade: a.entidade, pergunta_id: a.pergunta_id ?? null, origem: a.origem, situacao: a.situacao,
      lote_id: a.lote_id, evidencia: a.evidencia, erros: JSON.parse(a.erros), created_at: a.created_at, ...desfechoDe(a),
      dados: { ...d, ...(d.externo !== undefined && { externo: d.externo === 1 }), ...(d.via_vpn !== undefined && { via_vpn: d.via_vpn === 1 }) },
      ...(completo && confronto && { confronto: confronto.confronto, alvo_id: confronto.alvo_id }) };
  }
  const linha = { ip_cifrado: null, mac_cifrado: null, ip_hash: null, mac_hash: null, protocolos_portas: '[]', no_arciber: 0, firmware_nao_aplicavel: 0,
    nome: '', ...d, id: a.id, project_id: a.project_id } as LinhaAtivo;
  const { id: _i, project_id: _p, ...dados } = await serializarAtivo(linha, completo, chaves, 'ot_achados');
  return {
    id: a.id, levantamento_id: a.levantamento_id, entidade: a.entidade, pergunta_id: a.pergunta_id ?? null, origem: a.origem, situacao: a.situacao, lote_id: a.lote_id,
    evidencia: a.evidencia, erros: JSON.parse(a.erros), created_at: a.created_at, ...desfechoDe(a), dados,
    ...(completo && confronto && { confronto: confronto.confronto, alvo_id: confronto.alvo_id }),
  };
}

const PARA_BRUTO = ['nome', 'zona_id', 'no_arciber', 'categoria_arciber', 'tipo_dispositivo', 'fabricante', 'modelo', 'funcao', 'firmware_so_versao',
  'firmware_nao_aplicavel'] as const;

/**
 * Decifra os achados em rascunho da sessão e cria um lote manual ligado a ela. A troca rascunho → enviado (lote_id NULL) é a trava:
 * dois envios simultâneos do mesmo achado não criam dois lotes; se o lote falha, os achados tomados voltam a rascunho.
 */
export async function enviarAoLote(db: D1Database, chaves: ChavesOt, ator: { id: string }, projectId: string,
  alvo: { site_id: string; levantamento_id?: string }, achadoIds: string[]) {
  const ids = JSON.stringify([...new Set(achadoIds)]);
  const { results } = await db.prepare(`UPDATE ot_achados SET situacao = 'enviado', lote_id = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE project_id = ? AND ${alvo.levantamento_id ? 'levantamento_id = ?'
      : `levantamento_id IN (SELECT id FROM ot_levantamentos WHERE project_id = ?1 AND site_id = ? AND status = 'ativo')`} AND situacao = 'rascunho'
    AND id IN (SELECT value FROM json_each(?)) RETURNING *`)
    .bind(projectId, alvo.levantamento_id ?? alvo.site_id, ids).all<LinhaAchado>();
  const tomados = JSON.stringify(results.map((a) => a.id));
  const devolver = () => db.prepare(`UPDATE ot_achados SET situacao = 'rascunho', updated_at = CURRENT_TIMESTAMP
    WHERE situacao = 'enviado' AND lote_id IS NULL AND id IN (SELECT value FROM json_each(?))`).bind(tomados).run();
  if (results.length !== new Set(achadoIds).size) {
    if (results.length) await devolver();
    return { ok: false as const, status: 400 as const, error: 'Achado inexistente, de outro levantamento ou já enviado' };
  }
  let r: Awaited<ReturnType<typeof criarLote>>;
  try {
    const brutos: Record<string, unknown>[] = [];
    const entidades = results.map((a) => a.entidade === 'fluxo' ? 'fluxo' as const : 'ativo' as const);
    for (const a of results) {
      const d = JSON.parse(a.dados) as Record<string, unknown>;
      if (a.entidade === 'fluxo') {
        brutos.push({ ...d, ...(d.externo !== undefined && { externo: !!d.externo }), ...(d.via_vpn !== undefined && { via_vpn: !!d.via_vpn }) });
        continue;
      }
      const b: Record<string, unknown> = Object.fromEntries(PARA_BRUTO.filter((k) => d[k] !== undefined && d[k] !== null).map((k) => [k, d[k]]));
      if (b.no_arciber !== undefined) b.no_arciber = !!b.no_arciber;
      if (b.firmware_nao_aplicavel !== undefined) b.firmware_nao_aplicavel = !!b.firmware_nao_aplicavel;
      if (typeof d.protocolos_portas === 'string') b.protocolos_portas = JSON.parse(d.protocolos_portas);
      for (const campo of ['ip', 'mac'] as const) {
        const c = d[`${campo}_cifrado`];
        if (typeof c === 'string') b[campo] = await decifrarOt(c, chaves, aadOt(projectId, 'ot_achados', a.id, campo));
      }
      brutos.push(b);
    }
    // Sem alvo.levantamento_id (envio do site): o lote só liga a um levantamento se todos os achados vieram dele.
    const levs = new Set(results.map((a) => a.levantamento_id));
    r = await criarLote(db, chaves, ator, projectId, alvo.site_id, 'manual', brutos, alvo.levantamento_id ?? (levs.size === 1 ? [...levs][0] : null), entidades);
  } catch (e) {
    await devolver();
    throw e;
  }
  if (!r.ok) { await devolver(); return r; }
  const lote = r.id;
  // Um statement só (atômico): um batch de até 2.000 UPDATEs que falhasse no meio deixaria achados enviados sem lote.
  const liga = JSON.stringify(Object.fromEntries(r.itemIds.map((item, n) => [results[n].id, item])));
  await db.prepare(`UPDATE ot_achados SET lote_id = ?1, lote_item_id = (SELECT value FROM json_each(?2) WHERE key = ot_achados.id),
    updated_at = CURRENT_TIMESTAMP WHERE id IN (SELECT key FROM json_each(?2))`).bind(lote, liga).run();
  return r;
}

export { zonasDoSite };
