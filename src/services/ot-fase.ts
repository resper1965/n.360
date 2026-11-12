// Fase do site no n.ot (spec 2026-11-11 fluidez §3 e §6): em_levantamento → base_em_aprovacao → em_operacao. Cada transição é um UPDATE
// com a fase esperada no WHERE (atômico): 0 linhas alteradas = 409. As condições da base são reconferidas a cada pedido e a cada aprovação.

export type Fase = 'em_levantamento' | 'base_em_aprovacao' | 'em_operacao' | 'em_obra';
export type ProximoPasso = 'comecar' | 'revisar' | 'aguardar_lote' | 'pedir_base' | 'aguardar_base' | 'em_operacao';
export interface SituacaoSite {
  fase: Fase; base_pedida_em: string | null; base_aprovada_em: string | null;
  rascunhos: number; lotes_em_revisao: number; zonas_4_1_1: boolean; tem_conteudo: boolean;
  proximo_passo: ProximoPasso; lote_em_revisao_id: string | null;
}
type Ator = { id: string };
type Resultado = { ok: true } | { ok: false; status: 404 | 409; error: string };

/** Regra do 4.1.1 por site: zonas ativas nos níveis Purdue 2, 3 e 4. `filtro` é uma condição extra sobre ot_zonas (ex.: `site_id = ?`); binds: (projectId, …do filtro). */
export const sitesComZonas411 = (filtro: string) => `SELECT site_id FROM ot_zonas WHERE project_id = ? AND status = 'ativo' AND ${filtro}
  AND nivel_purdue IN (2, 3, 4) GROUP BY site_id HAVING count(DISTINCT nivel_purdue) = 3`;

/** Achados de um site numa situação, nos levantamentos ativos: a fila de `GET /ot/achados?contagem=1` e o `rascunhos` da fase. */
export async function contarAchados(db: D1Database, projectId: string, siteId: string, situacao: 'rascunho' | 'enviado'): Promise<number> {
  const n = await db.prepare(`SELECT count(*) AS n FROM ot_achados a JOIN ot_levantamentos l ON l.id = a.levantamento_id AND l.project_id = a.project_id
    WHERE a.project_id = ? AND l.site_id = ? AND l.status = 'ativo' AND a.situacao = ?`).bind(projectId, siteId, situacao).first<{ n: number }>();
  return n?.n ?? 0;
}

export async function situacaoDoSite(db: D1Database, projectId: string, siteId: string): Promise<SituacaoSite | null> {
  const site = await db.prepare(`SELECT fase, base_pedida_em, base_aprovada_em FROM ot_sites WHERE id = ? AND project_id = ? AND status = 'ativo'`)
    .bind(siteId, projectId).first<{ fase: Fase; base_pedida_em: string | null; base_aprovada_em: string | null }>();
  if (!site) return null;
  const [rascunhos, lotes, zonas, conteudo] = await Promise.all([
    contarAchados(db, projectId, siteId, 'rascunho'),
    db.prepare(`SELECT count(*) AS n, (SELECT id FROM ot_lotes WHERE project_id = ? AND site_id = ? AND status = 'em_revisao' ORDER BY created_at, id LIMIT 1) AS primeiro
      FROM ot_lotes WHERE project_id = ? AND site_id = ? AND status = 'em_revisao'`).bind(projectId, siteId, projectId, siteId).first<{ n: number; primeiro: string | null }>(),
    db.prepare(sitesComZonas411('site_id = ?')).bind(projectId, siteId).first(),
    db.prepare(`SELECT (SELECT 1 FROM ot_levantamentos WHERE project_id = ? AND site_id = ? AND status = 'ativo' LIMIT 1)
      OR (SELECT 1 FROM ot_ativos WHERE project_id = ? AND site_id = ? AND status = 'ativo' LIMIT 1) AS tem`).bind(projectId, siteId, projectId, siteId).first<{ tem: number | null }>(),
  ]);
  const zonas_4_1_1 = !!zonas;
  const tem_conteudo = !!conteudo?.tem;
  const lotes_em_revisao = lotes?.n ?? 0;
  const proximo_passo: ProximoPasso =
    site.fase === 'em_operacao' || site.fase === 'em_obra' ? 'em_operacao'
      : site.fase === 'base_em_aprovacao' ? 'aguardar_base'
        : !tem_conteudo && !zonas_4_1_1 ? 'comecar'
          : rascunhos > 0 ? 'revisar'
            : lotes_em_revisao > 0 ? 'aguardar_lote'
              : zonas_4_1_1 ? 'pedir_base' : 'revisar';
  return { ...site, rascunhos, lotes_em_revisao, zonas_4_1_1, tem_conteudo, proximo_passo, lote_em_revisao_id: lotes?.primeiro ?? null };
}

/** A primeira condição da base que falha, em texto para a tela; null se todas valem. */
function faltaParaBase(s: SituacaoSite): string | null {
  if (s.rascunhos > 0) return `Há ${s.rascunhos} achado(s) em rascunho para revisar`;
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
  if (s.fase !== 'em_levantamento') return { ok: false, status: 409, error: 'O site não está em levantamento' };
  const falta = faltaParaBase(s);
  if (falta) return { ok: false, status: 409, error: falta };
  return transitar(db, projectId, siteId, 'em_levantamento', `fase = 'base_em_aprovacao', base_pedida_em = CURRENT_TIMESTAMP, base_pedida_por = ?`, [ator.id], 'O site não está em levantamento');
}

export async function aprovarBase(db: D1Database, ator: Ator, projectId: string, siteId: string): Promise<Resultado> {
  const s = await situacaoDoSite(db, projectId, siteId);
  if (!s) return { ok: false, status: 404, error: 'Site não encontrado' };
  if (s.fase !== 'base_em_aprovacao') return { ok: false, status: 409, error: 'A base não está em aprovação' };
  if (faltaParaBase(s)) return { ok: false, status: 409, error: 'As condições da base mudaram desde o pedido' };
  return transitar(db, projectId, siteId, 'base_em_aprovacao', `fase = 'em_operacao', base_aprovada_em = CURRENT_TIMESTAMP, base_aprovada_por = ?`, [ator.id], 'A base não está em aprovação');
}

export async function devolverBase(db: D1Database, _ator: Ator, projectId: string, siteId: string): Promise<Resultado> {
  return transitar(db, projectId, siteId, 'base_em_aprovacao', `fase = 'em_levantamento', base_pedida_em = NULL, base_pedida_por = NULL`, [], 'A base não está em aprovação');
}
