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
}
type Ator = { id: string };
type Falha = { ok: false; status: 400 | 404 | 409; error: string };
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

export async function situacaoDoSite(db: D1Database, projectId: string, siteId: string): Promise<SituacaoSite | null> {
  const row = await db.prepare(`SELECT fase, base_pedida_em, base_aprovada_em, obra_ate, obra_renovada, obra_justificativa FROM ot_sites WHERE id = ? AND project_id = ? AND status = 'ativo'`)
    .bind(siteId, projectId).first<{ fase: Fase; base_pedida_em: string | null; base_aprovada_em: string | null; obra_ate: string | null; obra_renovada: number; obra_justificativa: string | null }>();
  if (!row) return null;
  const site = { fase: row.fase, base_pedida_em: row.base_pedida_em, base_aprovada_em: row.base_aprovada_em };
  const obra = row.obra_ate ? { ate: row.obra_ate, renovada: !!row.obra_renovada, justificativa: row.obra_justificativa } : null;
  const [rascunhos, rascunhos_bloqueiam, lotes, zonas, conteudo, rev] = await Promise.all([
    contarAchados(db, projectId, siteId, 'rascunho'),
    contarAchados(db, projectId, siteId, 'rascunho', true),
    db.prepare(`SELECT count(*) AS n, (SELECT id FROM ot_lotes WHERE project_id = ? AND site_id = ? AND status = 'em_revisao' ORDER BY created_at, id LIMIT 1) AS primeiro
      FROM ot_lotes WHERE project_id = ? AND site_id = ? AND status = 'em_revisao'`).bind(projectId, siteId, projectId, siteId).first<{ n: number; primeiro: string | null }>(),
    db.prepare(sitesComZonas411('site_id = ?')).bind(projectId, siteId).first(),
    db.prepare(`SELECT (SELECT 1 FROM ot_levantamentos WHERE project_id = ? AND site_id = ? AND status = 'ativo' LIMIT 1)
      OR (SELECT 1 FROM ot_ativos WHERE project_id = ? AND site_id = ? AND status = 'ativo' LIMIT 1) AS tem`).bind(projectId, siteId, projectId, siteId).first<{ tem: number | null }>(),
    db.prepare(`SELECT date(min(ultima_verificacao_em), '+24 months') AS em FROM ot_ativos WHERE project_id = ? AND site_id = ? AND status = 'ativo' AND no_arciber = 1`)
      .bind(projectId, siteId).first<{ em: string | null }>(),
  ]);
  const revalidar_em = rev?.em ?? null;
  const zonas_4_1_1 = !!zonas;
  const tem_conteudo = !!conteudo?.tem;
  const lotes_em_revisao = lotes?.n ?? 0;
  const proximo_passo: ProximoPasso =
    site.fase === 'em_operacao' ? (revalidar_em && revalidar_em <= diaMaisSP(60) ? 'revalidar' : 'em_operacao')
      : site.fase === 'base_em_aprovacao' ? 'aguardar_base'
        : !tem_conteudo && !zonas_4_1_1 ? 'comecar'
          : rascunhos_bloqueiam > 0 ? 'revisar'
            : lotes_em_revisao > 0 ? 'aguardar_lote'
              : zonas_4_1_1 ? 'pedir_base' : 'revisar';
  return { ...site, rascunhos, rascunhos_bloqueiam, lotes_em_revisao, zonas_4_1_1, tem_conteudo, proximo_passo, lote_em_revisao_id: lotes?.primeiro ?? null, obra, revalidar_em };
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
    WHERE id = ? AND project_id = ? AND status = 'ativo' AND fase = 'base_em_aprovacao'
    AND NOT EXISTS (SELECT 1 FROM ot_achados a JOIN ot_levantamentos l ON l.id = a.levantamento_id AND l.project_id = a.project_id
      WHERE a.project_id = ? AND l.site_id = ? AND l.status = 'ativo' AND a.situacao = 'rascunho'${SEM_SONDA})
    AND NOT EXISTS (SELECT 1 FROM ot_lotes WHERE project_id = ? AND site_id = ? AND status = 'em_revisao')
    AND id IN (${sitesComZonas411('site_id = ?')})`)
    .bind(ator.id, siteId, projectId, projectId, siteId, projectId, siteId, projectId, siteId).run();
  if (r.meta.changes) return { ok: true, fechouObra: !!antes?.obra_ate };
  const site = await db.prepare(`SELECT fase FROM ot_sites WHERE id = ? AND project_id = ? AND status = 'ativo'`).bind(siteId, projectId).first<{ fase: Fase }>();
  if (!site) return { ok: false, status: 404, error: 'Site não encontrado' };
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
