import { lacunasDaFonte, resumoDeLacunas } from './requisitos';

/**
 * Painel "ponto de partida": o que o projeto já tem no cadastro compartilhado, a cobertura da LGPD/ANPD e os controles ISO que a
 * privacidade já adianta. É CONSULTA, nunca grava. `iso_ajudados` usa só cobertura por documento ou evidência (não por controle,
 * para a ISO não contar como ajuda a si mesma) e só mapeamento `validado_juridico`.
 */
export interface PontoDePartida {
  cadastro: {
    tratamentos: number; dpias: number; documentos_vigentes: number; evidencias_validas: number; itens: number;
    terceiros: number; encarregado: boolean; incidentes: number; treinamentos_concluidos: number;
  };
  cobertura: { fonte: 'lgpd' | 'anpd'; total: number; cobertos: number; parciais: number; lacunas: number }[];
  iso_ajudados: { requisito_id: string; referencia: string; titulo: string; por: string[] }[];
}

const FONTES = ['lgpd', 'anpd'] as const;

export async function pontoDePartida(db: D1Database, projectId: string): Promise<PontoDePartida> {
  const c = (sql: string) => db.prepare(sql).bind(projectId);
  const r = await db.batch([
    c('SELECT count(*) AS n FROM ropa_records WHERE project_id = ?'),
    c('SELECT count(*) AS n FROM dpia_assessments WHERE project_id = ?'),
    c(`SELECT count(*) AS n FROM documentos WHERE project_id = ? AND status = 'vigente'`),
    c(`SELECT count(*) AS n FROM evidence WHERE project_id = ? AND evaluation_status = 'conforming' AND (valido_ate IS NULL OR valido_ate >= date('now'))`),
    c(`SELECT count(*) AS n FROM itens WHERE project_id = ? AND status = 'ativo'`),
    c(`SELECT count(DISTINCT p.id) AS n FROM partes p JOIN parte_vinculos v ON v.parte_id = p.id
        WHERE p.project_id = ? AND p.tipo = 'organizacao' AND p.status = 'ativa' AND v.papel = 'terceiro' AND v.alvo_tipo = 'projeto'`),
    c(`SELECT count(DISTINCT p.id) AS n FROM partes p JOIN parte_vinculos v ON v.parte_id = p.id
        WHERE p.project_id = ? AND p.status = 'ativa' AND v.papel = 'encarregado' AND v.alvo_tipo = 'projeto'`),
    c('SELECT count(*) AS n FROM incidentes WHERE project_id = ?'),
    c(`SELECT count(*) AS n FROM training_records WHERE project_id = ? AND status = 'Completed'`),
  ]);
  const n = (i: number) => (r[i].results[0] as { n: number } | undefined)?.n ?? 0;

  const cobertura: PontoDePartida['cobertura'] = [];
  const porDocOuEvidencia = new Map<string, string>(); // requisito_id -> referência
  for (const fonte of FONTES) {
    const itens = await lacunasDaFonte(db, projectId, fonte);
    cobertura.push({ fonte, ...resumoDeLacunas(itens) });
    for (const i of itens) {
      if (i.situacao === 'coberto' && i.origens.some((o) => o.tipo !== 'controle')) porDocOuEvidencia.set(i.requisito_id, i.referencia);
    }
  }

  const iso_ajudados: PontoDePartida['iso_ajudados'] = [];
  if (porDocOuEvidencia.size) {
    const ids = [...porDocOuEvidencia.keys()];
    const { results } = await db.prepare(
      `SELECT m.de_id AS requisito_id, r.referencia AS referencia, r.titulo AS titulo, m.para_id AS para_id
         FROM requisito_mapeamentos m JOIN requisitos r ON r.id = m.de_id
        WHERE m.para_id IN (${ids.map(() => '?').join(',')}) AND m.estado = 'validado_juridico' AND m.tipo IN ('equivalente', 'parcial')
        ORDER BY r.rowid`
    ).bind(...ids).all<{ requisito_id: string; referencia: string; titulo: string; para_id: string }>();
    const agrupado = new Map<string, PontoDePartida['iso_ajudados'][number]>();
    for (const m of results) {
      const item = agrupado.get(m.requisito_id) ?? { requisito_id: m.requisito_id, referencia: m.referencia, titulo: m.titulo, por: [] };
      const ref = porDocOuEvidencia.get(m.para_id)!;
      if (!item.por.includes(ref)) item.por.push(ref);
      agrupado.set(m.requisito_id, item);
    }
    iso_ajudados.push(...agrupado.values());
  }

  return {
    cadastro: {
      tratamentos: n(0), dpias: n(1), documentos_vigentes: n(2), evidencias_validas: n(3), itens: n(4),
      terceiros: n(5), encarregado: n(6) > 0, incidentes: n(7), treinamentos_concluidos: n(8),
    },
    cobertura,
    iso_ajudados,
  };
}
