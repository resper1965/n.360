import type { ChavesOt } from './ot-cifra';
import { aadOt, decifrarOt } from './ot-cifra';
import { ativosDoSite, criarLote, indice, prepararItem, zonasDoSite } from './ot-coleta';
import { serializarAtivo, type LinhaAtivo } from './ot-inventario';

// Descoberta operacional (spec 2026-11-01, L1). O achado usa a MESMA validação do item de lote (prepararItem), com a AAD de
// ot_achados; o confronto usa o MESMO índice da deduplicação, só no site da sessão (sem oráculo, P0-5); o envio decifra e
// entrega os achados ao criarLote, que recifra com a AAD do item e segue a aprovação existente.

export interface LinhaAchado {
  id: string; project_id: string; levantamento_id: string; entidade: string; dados: string; erros: string; evidencia: string;
  origem: string; situacao: string; lote_id: string | null; created_at: string;
}

/** Valida e cifra. O "nome obrigatório" e a falta do 4.3.1 ficam em `erros` como aviso: achado é rascunho e pode estar incompleto. */
export async function prepararAchado(chaves: ChavesOt, projectId: string, _siteId: string, achadoId: string, dados: Record<string, unknown>,
  zonas: Map<string, string> = new Map()) {
  return prepararItem(chaves, projectId, achadoId, dados, zonas, 'ot_achados');
}

export async function confrontar(db: D1Database, projectId: string, siteId: string, dados: Record<string, unknown>) {
  const idx = indice((await ativosDoSite(db, projectId, siteId)).results);
  const alvo = idx.achar(dados);
  return alvo ? { confronto: 'confirma' as const, alvo_id: alvo.id } : { confronto: 'novo' as const, alvo_id: null };
}

/** Serializador único (P0-6) para os dados; confronto e alvo só para quem vê completo (A1). */
export async function serializarAchado(a: LinhaAchado, completo: boolean, chaves: ChavesOt,
  confronto?: { confronto: 'novo' | 'confirma'; alvo_id: string | null }) {
  const d = JSON.parse(a.dados) as Record<string, unknown>;
  const linha = { ip_cifrado: null, mac_cifrado: null, ip_hash: null, mac_hash: null, protocolos_portas: '[]', no_arciber: 0, firmware_nao_aplicavel: 0,
    nome: '', ...d, id: a.id, project_id: a.project_id } as LinhaAtivo;
  const { id: _i, project_id: _p, ...dados } = await serializarAtivo(linha, completo, chaves, 'ot_achados');
  return {
    id: a.id, levantamento_id: a.levantamento_id, entidade: a.entidade, origem: a.origem, situacao: a.situacao, lote_id: a.lote_id,
    evidencia: a.evidencia, erros: JSON.parse(a.erros), created_at: a.created_at, dados,
    ...(completo && confronto && { confronto: confronto.confronto, alvo_id: confronto.alvo_id }),
  };
}

const PARA_BRUTO = ['nome', 'zona_id', 'no_arciber', 'categoria_arciber', 'tipo_dispositivo', 'fabricante', 'modelo', 'funcao', 'firmware_so_versao',
  'firmware_nao_aplicavel'] as const;

/** Decifra os achados em rascunho da sessão e cria um lote manual ligado a ela; marca os enviados. */
export async function enviarAoLote(db: D1Database, chaves: ChavesOt, ator: { id: string }, projectId: string,
  lev: { id: string; site_id: string }, achadoIds: string[]) {
  const { results } = await db.prepare(`SELECT * FROM ot_achados WHERE project_id = ? AND levantamento_id = ? AND situacao = 'rascunho'
    AND id IN (SELECT value FROM json_each(?))`).bind(projectId, lev.id, JSON.stringify(achadoIds)).all<LinhaAchado>();
  if (results.length !== achadoIds.length) return { ok: false as const, status: 400 as const, error: 'Achado inexistente, de outra sessão ou já enviado' };
  const brutos: Record<string, unknown>[] = [];
  for (const a of results) {
    const d = JSON.parse(a.dados) as Record<string, unknown>;
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
  const r = await criarLote(db, chaves, ator, projectId, lev.site_id, 'manual', brutos, lev.id);
  if (r.ok) {
    await db.prepare(`UPDATE ot_achados SET situacao = 'enviado', lote_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (SELECT value FROM json_each(?))`)
      .bind(r.id, JSON.stringify(achadoIds)).run();
  }
  return r;
}

export { zonasDoSite };
