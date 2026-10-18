import { genId, logAudit } from '../../helpers';
import { chaveNome, normalizarNome } from '../nomes';
import { SENSIVEIS_CONHECIDOS } from '../../data/ropa-abas/sensiveis';
import { listarCatalogo } from './catalogos';

const partir = (texto: string | null) => [...new Set(String(texto ?? '').split(/\s*[,;]\s*/).map((t) => normalizarNome(t)).filter(Boolean))];

/**
 * Materializa os dados planos de UMA atividade nas tabelas novas, uma única vez (spec 4.5). NUNCA escreve coluna do hash: lê
 * data_subjects e data_categories e só grava nas tabelas da etapa. Devolve true se materializou agora.
 */
export async function materializar(db: D1Database, projectId: string, ropaId: string): Promise<boolean> {
  const r = await db.prepare(`SELECT data_subjects, data_categories, etapas_materializadas_em,
      (SELECT count(*) FROM tratamento_ciclo c WHERE c.ropa_id = ropa_records.id) AS ciclos,
      (SELECT count(*) FROM tratamento_itens i WHERE i.ropa_id = ropa_records.id) AS itens
    FROM ropa_records WHERE id = ? AND project_id = ?`)
    .bind(ropaId, projectId).first<{ data_subjects: string | null; data_categories: string | null; etapas_materializadas_em: string | null; ciclos: number; itens: number }>();
  if (!r || r.etapas_materializadas_em) return false;
  // Quem ganha a corrida é quem consegue marcar: os outros leem o que ele escreve.
  const ganhou = await db.prepare(`UPDATE ropa_records SET etapas_materializadas_em = datetime('now') WHERE id = ? AND project_id = ? AND etapas_materializadas_em IS NULL`)
    .bind(ropaId, projectId).run();
  if (!ganhou.meta.changes) return false;

  const titulares = partir(r.data_subjects);
  const dados = partir(r.data_categories);
  // Nada a materializar (atividade nova): a marca basta e a leitura não gasta mais consultas. Devolve false: não houve o que gravar.
  if (!titulares.length && !dados.length && !r.ciclos && !r.itens) return false;
  // Sem texto plano não há catálogo a casar: a atividade nova não gasta consultas aqui.
  const catT = new Map(titulares.length ? (await listarCatalogo(db, projectId, 'titular', { inativos: true })).map((i) => [chaveNome(i.nome), i.id]) : []);
  const catD = new Map(dados.length ? (await listarCatalogo(db, projectId, 'dado', { inativos: true })).map((i) => [chaveNome(i.nome), i.id]) : []);
  const stmts: D1PreparedStatement[] = [];
  const idDe = (mapa: Map<string, string>, tipo: 'titular' | 'dado', nome: string) => {
    const k = chaveNome(nome);
    let id = mapa.get(k);
    if (!id) {
      id = genId(); mapa.set(k, id);
      const sensivel = tipo === 'dado' && SENSIVEIS_CONHECIDOS.some((s) => chaveNome(s) === k) ? 1 : 0;
      stmts.push(db.prepare('INSERT INTO catalogo_itens (id, project_id, tipo, nome, sensivel) VALUES (?, ?, ?, ?, ?)').bind(id, projectId, tipo, nome, sensivel));
    }
    return id;
  };
  const tIds = titulares.map((n) => idDe(catT, 'titular', n));
  const dIds = dados.map((n) => idDe(catD, 'dado', n));

  // A Coleta: cabeçalho (com a linha da F3, se houver), titulares com TODOS os dados (superconjunto, `migrado = 1`) e os ativos de tratamento_itens.
  const f3 = await db.prepare('SELECT situacao, item_id, descricao FROM tratamento_ciclo WHERE ropa_id = ? AND project_id = ? AND etapa = ?')
    .bind(ropaId, projectId, 'coleta').first<{ situacao: string; item_id: string | null; descricao: string | null }>();
  if (tIds.length || f3) {
    stmts.push(db.prepare(`INSERT INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao, descricao_etapa, migrado, atualizado_por) VALUES (?, ?, 'coleta', 'registrada', ?, ?, 'sistema')
      ON CONFLICT(ropa_id, etapa) DO UPDATE SET descricao_etapa = COALESCE(tratamento_ciclo.descricao_etapa, excluded.descricao_etapa), migrado = excluded.migrado`)
      .bind(ropaId, projectId, f3?.descricao ?? null, tIds.length ? 1 : 0));
  }
  for (const t of tIds) {
    stmts.push(db.prepare(`INSERT OR IGNORE INTO tratamento_etapa_titulares (ropa_id, etapa, titular_id, situacao, atualizado_por, project_id) VALUES (?, 'coleta', ?, 'definido', 'sistema', ?)`)
      .bind(ropaId, t, projectId));
    for (const d of dIds) {
      stmts.push(db.prepare(`INSERT OR IGNORE INTO tratamento_etapa_dados (ropa_id, etapa, titular_id, dado_id, project_id) VALUES (?, 'coleta', ?, ?, ?)`)
        .bind(ropaId, t, d, projectId));
    }
  }
  stmts.push(db.prepare(`INSERT OR IGNORE INTO tratamento_etapa_itens (ropa_id, etapa, item_id, project_id) SELECT ropa_id, 'coleta', item_id, project_id FROM tratamento_itens WHERE ropa_id = ? AND project_id = ?`)
    .bind(ropaId, projectId));
  // As demais etapas da F3: o ativo e a descrição viram os da etapa (titulares ficam pendentes).
  stmts.push(db.prepare(`INSERT OR IGNORE INTO tratamento_etapa_itens (ropa_id, etapa, item_id, project_id)
    SELECT ropa_id, etapa, item_id, project_id FROM tratamento_ciclo WHERE ropa_id = ? AND project_id = ? AND etapa NOT IN ('coleta', 'eliminacao') AND item_id IS NOT NULL`)
    .bind(ropaId, projectId));
  stmts.push(db.prepare(`UPDATE tratamento_ciclo SET descricao_etapa = descricao WHERE ropa_id = ? AND project_id = ? AND descricao_etapa IS NULL AND descricao IS NOT NULL AND etapa <> 'coleta'`)
    .bind(ropaId, projectId));
  try {
    await db.batch(stmts);
  } catch (e) {
    // Sem isto a marca fica e a atividade nunca mais materializa: a próxima leitura tenta de novo.
    await db.prepare('UPDATE ropa_records SET etapas_materializadas_em = NULL WHERE id = ? AND project_id = ?').bind(ropaId, projectId).run();
    throw e;
  }
  if (tIds.length || dIds.length) {
    await logAudit(db, 'ropa.etapas_materializadas', 'sistema', `ROPA ${ropaId}: titulares ${tIds.length}, dados ${dIds.length}`, '', '', projectId);
  }
  return true;
}
