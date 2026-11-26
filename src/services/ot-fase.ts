// Fase do site no n.ot (spec 2026-11-11 fluidez §3 e §6): em_levantamento → base_em_aprovacao → em_operacao. Cada transição é um UPDATE
// com a fase esperada no WHERE (atômico): 0 linhas alteradas = 409. As condições da base são reconferidas a cada pedido e a cada aprovação.

import { diaMaisSP, hojeEmSaoPaulo } from './hoje';

export type Fase = 'em_levantamento' | 'base_em_aprovacao' | 'em_operacao' | 'em_obra';
export type ProximoPasso = 'comecar' | 'revisar' | 'aguardar_lote' | 'pedir_base' | 'aguardar_base' | 'em_operacao' | 'revalidar';
export interface SituacaoSite {
  fase: Fase; base_pedida_em: string | null; base_aprovada_em: string | null;
  rascunhos: number; rascunhos_bloqueiam: number; lotes_em_revisao: number; zonas_4_1_1: boolean; tem_conteudo: boolean;
  proximo_passo: ProximoPasso; lote_em_revisao_id: string | null;
  obra: { ate: string; renovada: boolean; justificativa: string | null } | null; revalidar_em: string | null;
  eu_pedi_a_base: boolean;
  area: Area; etapa: 1 | 2 | 3 | 4 | null; falta: string[]; ativos: number;
}
type Ator = { id: string };
type Falha = { ok: false; status: 400 | 403 | 404 | 409; error: string };
type Resultado = { ok: true } | Falha;
export const OBRA_MAX_DIAS = 90;

/** Regra do 4.1.1 por site: zonas ativas nos níveis Purdue 2, 3 e 4. `filtro` é uma condição extra sobre ot_zonas (ex.: `site_id = ?`); binds: (projectId, …do filtro). */
export const sitesComZonas411 = (filtro: string) => `SELECT site_id FROM ot_zonas WHERE project_id = ? AND status = 'ativo' AND ${filtro}
  AND nivel_purdue IN (2, 3, 4) GROUP BY site_id HAVING count(DISTINCT nivel_purdue) = 3`;

/** Rascunho da sonda (`chave_sensor`, gravada só por `gravarPlano`) não trava a base: a sonda gera rascunho novo todo dia. */
const SEM_SONDA = ' AND a.chave_sensor IS NULL';

/** Achados de um site numa situação, nos levantamentos ativos: a fila de `GET /ot/achados?contagem=1` e o `rascunhos` da fase. */
export async function contarAchados(db: D1Database, projectId: string, siteId: string, situacao: 'rascunho' | 'enviado', semSonda = false): Promise<number> {
  const n = await db.prepare(`SELECT count(*) AS n FROM ot_achados a JOIN ot_levantamentos l ON l.id = a.levantamento_id AND l.project_id = a.project_id
    WHERE a.project_id = ? AND l.site_id = ? AND l.status = 'ativo' AND a.situacao = ?${semSonda ? SEM_SONDA : ''}`).bind(projectId, siteId, situacao).first<{ n: number }>();
  return n?.n ?? 0;
}

/** A regra do próximo passo do site, pura: `situacaoDoSite` (um site) e `blocoOt` (todos, em lote) usam esta mesma. */
export function proximoPassoDe(x: { fase: Fase; revalidar_em: string | null; tem_conteudo: boolean; zonas_4_1_1: boolean; rascunhos_bloqueiam: number; lotes_em_revisao: number }): ProximoPasso {
  return x.fase === 'em_operacao' ? (x.revalidar_em && x.revalidar_em <= diaMaisSP(60) ? 'revalidar' : 'em_operacao')
    : x.fase === 'base_em_aprovacao' ? 'aguardar_base'
      : !x.tem_conteudo && !x.zonas_4_1_1 ? 'comecar'
        : x.rascunhos_bloqueiam > 0 ? 'revisar'
          : x.lotes_em_revisao > 0 ? 'aguardar_lote'
            : x.zonas_4_1_1 ? 'pedir_base' : 'revisar';
}

export type Area = 'implantacao' | 'operacao' | 'obra';
export type EntradaEtapa = { fase: Fase; obra_ate: string | null; ativos: number; zonas_4_1_1: boolean; rascunhos_bloqueiam: number; lotes_em_revisao: number };

const RASCUNHOS = (n: number) => `Há ${n} achado(s) em rascunho para revisar`;
const LOTES = (n: number) => `Há ${n} lote(s) de aprovação em revisão`;
const ZONAS = 'Faltam zonas nos níveis Purdue 2, 3 e 4';
const ATIVO = 'Nenhum ativo no inventário do site';

/** Todas as condições da base, na ordem de `faltaParaBase` de hoje (rascunho, lote, zonas) e o ativo por último. Só contagens. */
export function condicoesDaBase(x: EntradaEtapa): string[] {
  return [x.rascunhos_bloqueiam > 0 && RASCUNHOS(x.rascunhos_bloqueiam), x.lotes_em_revisao > 0 && LOTES(x.lotes_em_revisao),
    !x.zonas_4_1_1 && ZONAS, x.ativos === 0 && ATIVO].filter((t): t is string => !!t);
}

/** Spec 2026-11-26 §1 e §4: só o que falta para sair da etapa ATUAL (a tela mostra uma etapa por vez). */
export function faltaParaAvancar(x: EntradaEtapa): string[] {
  switch (areaEEtapa(x).etapa) {
    case 1: return [ZONAS];
    case 2: return [ATIVO];
    case 3: return condicoesDaBase(x).filter((t) => t !== ZONAS && t !== ATIVO);
    default: return []; // 4: pode pedir (ou espera o Gestor); operação: nada
  }
}

/** Área e etapa (1 Cadastrar, 2 Levantar, 3 Revisar, 4 Aprovar a base). A fase do banco fica; isto é só o nome. */
export function areaEEtapa(x: EntradaEtapa): { area: Area; etapa: 1 | 2 | 3 | 4 | null } {
  if (x.fase === 'em_operacao') return { area: 'operacao', etapa: null };
  const area: Area = x.fase === 'em_obra' || (x.fase === 'base_em_aprovacao' && x.obra_ate) ? 'obra' : 'implantacao';
  if (x.fase === 'base_em_aprovacao') return { area, etapa: 4 };
  const etapa = x.rascunhos_bloqueiam > 0 || x.lotes_em_revisao > 0 ? 3 : !x.zonas_4_1_1 ? 1 : x.ativos === 0 ? 2 : 4;
  return { area, etapa };
}

export async function situacaoDoSite(db: D1Database, projectId: string, siteId: string, quemId?: string): Promise<SituacaoSite | null> {
  const row = await db.prepare(`SELECT fase, base_pedida_por, base_pedida_em, base_aprovada_em, obra_ate, obra_renovada, obra_justificativa FROM ot_sites WHERE id = ? AND project_id = ? AND status = 'ativo'`)
    .bind(siteId, projectId).first<{ fase: Fase; base_pedida_por: string | null; base_pedida_em: string | null; base_aprovada_em: string | null; obra_ate: string | null; obra_renovada: number; obra_justificativa: string | null }>();
  if (!row) return null;
  const site = { fase: row.fase, base_pedida_em: row.base_pedida_em, base_aprovada_em: row.base_aprovada_em };
  const obra = row.obra_ate ? { ate: row.obra_ate, renovada: !!row.obra_renovada, justificativa: row.obra_justificativa } : null;
  const [rascunhos, rascunhos_bloqueiam, lotes, zonas, conteudo, rev] = await Promise.all([
    contarAchados(db, projectId, siteId, 'rascunho'),
    contarAchados(db, projectId, siteId, 'rascunho', true),
    db.prepare(`SELECT count(*) AS n, (SELECT id FROM ot_lotes WHERE project_id = ? AND site_id = ? AND status = 'em_revisao' ORDER BY created_at, id LIMIT 1) AS primeiro
      FROM ot_lotes WHERE project_id = ? AND site_id = ? AND status = 'em_revisao'`).bind(projectId, siteId, projectId, siteId).first<{ n: number; primeiro: string | null }>(),
    db.prepare(sitesComZonas411('site_id = ?')).bind(projectId, siteId).first(),
    db.prepare(`SELECT (SELECT 1 FROM ot_levantamentos WHERE project_id = ? AND site_id = ? AND status = 'ativo' LIMIT 1) AS lev,
      (SELECT count(*) FROM ot_ativos WHERE project_id = ? AND site_id = ? AND status = 'ativo') AS ativos`).bind(projectId, siteId, projectId, siteId).first<{ lev: number | null; ativos: number }>(),
    db.prepare(`SELECT date(min(ultima_verificacao_em), '+24 months') AS em FROM ot_ativos WHERE project_id = ? AND site_id = ? AND status = 'ativo' AND no_arciber = 1`)
      .bind(projectId, siteId).first<{ em: string | null }>(),
  ]);
  const revalidar_em = rev?.em ?? null;
  const zonas_4_1_1 = !!zonas;
  const ativos = conteudo?.ativos ?? 0;
  const tem_conteudo = !!conteudo?.lev || ativos > 0;
  const lotes_em_revisao = lotes?.n ?? 0;
  const proximo_passo = proximoPassoDe({ fase: site.fase, revalidar_em, tem_conteudo, zonas_4_1_1, rascunhos_bloqueiam, lotes_em_revisao });
  const e = { fase: site.fase, obra_ate: row.obra_ate, ativos, zonas_4_1_1, rascunhos_bloqueiam, lotes_em_revisao };
  return { ...site, rascunhos, rascunhos_bloqueiam, lotes_em_revisao, zonas_4_1_1, tem_conteudo, proximo_passo, lote_em_revisao_id: lotes?.primeiro ?? null, obra, revalidar_em,
    eu_pedi_a_base: !!quemId && row.fase === 'base_em_aprovacao' && row.base_pedida_por === quemId, ...areaEEtapa(e), falta: faltaParaAvancar(e), ativos };
}

/** A primeira condição da base que falha, em texto para a tela; null se todas valem. */
function faltaParaBase(s: SituacaoSite): string | null {
  if (s.rascunhos_bloqueiam > 0) return `Há ${s.rascunhos_bloqueiam} achado(s) em rascunho para revisar`;
  if (s.lotes_em_revisao > 0) return `Há ${s.lotes_em_revisao} lote(s) de aprovação em revisão`;
  if (!s.zonas_4_1_1) return 'Faltam zonas nos níveis Purdue 2, 3 e 4';
  return null;
}

/** Aplica a transição `de → para`; distingue 404 (site não é deste projeto) de 409 (fase mudou). */
async function transitar(db: D1Database, projectId: string, siteId: string, de: Fase, set: string, binds: unknown[], erro409: string): Promise<Resultado> {
  const r = await db.prepare(`UPDATE ot_sites SET ${set}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ? AND status = 'ativo' AND fase = ?`)
    .bind(...binds, siteId, projectId, de).run();
  if (r.meta.changes) return { ok: true };
  const existe = await db.prepare(`SELECT 1 AS x FROM ot_sites WHERE id = ? AND project_id = ? AND status = 'ativo'`).bind(siteId, projectId).first();
  return existe ? { ok: false, status: 409, error: erro409 } : { ok: false, status: 404, error: 'Site não encontrado' };
}

export async function pedirBase(db: D1Database, ator: Ator, projectId: string, siteId: string): Promise<Resultado> {
  const s = await situacaoDoSite(db, projectId, siteId);
  if (!s) return { ok: false, status: 404, error: 'Site não encontrado' };
  if (s.fase !== 'em_levantamento' && s.fase !== 'em_obra') return { ok: false, status: 409, error: 'O site não está em levantamento nem em obra' };
  const falta = faltaParaBase(s);
  if (falta) return { ok: false, status: 409, error: falta };
  return transitar(db, projectId, siteId, s.fase, `fase = 'base_em_aprovacao', base_pedida_em = CURRENT_TIMESTAMP, base_pedida_por = ?`, [ator.id], 'O site não está em levantamento nem em obra');
}

const LIMPA_OBRA = 'obra_ate = NULL, obra_justificativa = NULL, obra_renovada = 0, obra_aberta_em = NULL, obra_aberta_por = NULL';

/** Atômico: as condições da base vão no WHERE do UPDATE, então um rascunho ou lote que chegue depois do pedido barra a aprovação. */
export async function aprovarBase(db: D1Database, ator: Ator, projectId: string, siteId: string): Promise<{ ok: true; fechouObra: boolean } | Falha> {
  const antes = await db.prepare(`SELECT obra_ate FROM ot_sites WHERE id = ? AND project_id = ?`).bind(siteId, projectId).first<{ obra_ate: string | null }>();
  const r = await db.prepare(`UPDATE ot_sites SET fase = 'em_operacao', base_aprovada_em = CURRENT_TIMESTAMP, base_aprovada_por = ?, ${LIMPA_OBRA}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND project_id = ? AND status = 'ativo' AND fase = 'base_em_aprovacao' AND base_pedida_por IS NOT ?
    AND NOT EXISTS (SELECT 1 FROM ot_achados a JOIN ot_levantamentos l ON l.id = a.levantamento_id AND l.project_id = a.project_id
      WHERE a.project_id = ? AND l.site_id = ? AND l.status = 'ativo' AND a.situacao = 'rascunho'${SEM_SONDA})
    AND NOT EXISTS (SELECT 1 FROM ot_lotes WHERE project_id = ? AND site_id = ? AND status = 'em_revisao')
    AND id IN (${sitesComZonas411('site_id = ?')})`)
    .bind(ator.id, siteId, projectId, ator.id, projectId, siteId, projectId, siteId, projectId, siteId).run();
  if (r.meta.changes) return { ok: true, fechouObra: !!antes?.obra_ate };
  const site = await db.prepare(`SELECT fase, base_pedida_por FROM ot_sites WHERE id = ? AND project_id = ? AND status = 'ativo'`).bind(siteId, projectId).first<{ fase: Fase; base_pedida_por: string | null }>();
  if (!site) return { ok: false, status: 404, error: 'Site não encontrado' };
  if (site.fase === 'base_em_aprovacao' && site.base_pedida_por === ator.id) return { ok: false, status: 403, error: 'Quem pediu a base não a aprova. Peça a outra pessoa.' };
  return { ok: false, status: 409, error: site.fase === 'base_em_aprovacao' ? 'As condições da base mudaram desde o pedido' : 'A base não está em aprovação' };
}

export async function devolverBase(db: D1Database, _ator: Ator, projectId: string, siteId: string): Promise<Resultado> {
  return transitar(db, projectId, siteId, 'base_em_aprovacao', `fase = CASE WHEN obra_ate IS NOT NULL THEN 'em_obra' ELSE 'em_levantamento' END, base_pedida_em = NULL, base_pedida_por = NULL`, [], 'A base não está em aprovação');
}

const diaReal = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
type DadosObra = { justificativa: string; ate: string };

/** Só de em_operacao; `ate` de amanhã até hoje + 90 dias (dias de São Paulo). */
export async function abrirObra(db: D1Database, ator: Ator, projectId: string, siteId: string, d: DadosObra): Promise<Resultado> {
  if (!diaReal(d.ate) || d.ate <= hojeEmSaoPaulo() || d.ate > diaMaisSP(OBRA_MAX_DIAS)) return { ok: false, status: 400, error: `O prazo da obra vai de amanhã até ${OBRA_MAX_DIAS} dias` };
  return transitar(db, projectId, siteId, 'em_operacao',
    `fase = 'em_obra', obra_ate = ?, obra_justificativa = ?, obra_renovada = 0, obra_aberta_em = CURRENT_TIMESTAMP, obra_aberta_por = ?`, [d.ate, d.justificativa, ator.id], 'O site não está em operação');
}

/** Uma renovação por obra, de até 90 dias além do prazo atual. */
export async function renovarObra(db: D1Database, _ator: Ator, projectId: string, siteId: string, d: DadosObra): Promise<Resultado> {
  const o = await db.prepare(`SELECT obra_ate FROM ot_sites WHERE id = ? AND project_id = ? AND status = 'ativo' AND fase IN ('em_obra', 'base_em_aprovacao') AND obra_ate IS NOT NULL AND obra_renovada = 0`)
    .bind(siteId, projectId).first<{ obra_ate: string }>();
  if (!o) {
    const existe = await db.prepare(`SELECT 1 AS x FROM ot_sites WHERE id = ? AND project_id = ? AND status = 'ativo'`).bind(siteId, projectId).first();
    return existe ? { ok: false, status: 409, error: 'A obra não existe ou já foi renovada' } : { ok: false, status: 404, error: 'Site não encontrado' };
  }
  const atual = o.obra_ate.slice(0, 10);
  if (atual < hojeEmSaoPaulo()) return { ok: false, status: 409, error: 'A obra já venceu' };
  const limite = new Date(`${atual}T00:00:00Z`); limite.setUTCDate(limite.getUTCDate() + OBRA_MAX_DIAS);
  if (!diaReal(d.ate) || d.ate <= atual || d.ate > limite.toISOString().slice(0, 10)) return { ok: false, status: 400, error: `O novo prazo vai até ${OBRA_MAX_DIAS} dias além do atual` };
  const r = await db.prepare(`UPDATE ot_sites SET obra_ate = ?, obra_justificativa = ?, obra_renovada = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND project_id = ? AND status = 'ativo' AND fase IN ('em_obra', 'base_em_aprovacao') AND obra_ate = ? AND obra_renovada = 0`)
    .bind(d.ate, d.justificativa, siteId, projectId, o.obra_ate).run();
  return r.meta.changes ? { ok: true } : { ok: false, status: 409, error: 'A obra mudou, tente de novo' };
}

/** Obras com prazo antes de `hoje` (AAAA-MM-DD, São Paulo) voltam a em_operacao. Devolve os sites para quem chama avisar e entregar os desvios. */
export async function vencerObras(db: D1Database, hoje: string): Promise<{ siteId: string; projectId: string }[]> {
  const { results } = await db.prepare(`UPDATE ot_sites SET fase = 'em_operacao', ${LIMPA_OBRA}, base_pedida_em = NULL, base_pedida_por = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE status = 'ativo' AND fase IN ('em_obra', 'base_em_aprovacao') AND obra_ate IS NOT NULL AND obra_ate < ? RETURNING id, project_id`)
    .bind(hoje).all<{ id: string; project_id: string }>();
  return results.map((r) => ({ siteId: r.id, projectId: r.project_id }));
}
