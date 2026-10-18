import type { Gravado } from './comum';
import { chaveNome } from '../nomes';

/** Mesmo conjunto de nomes, sem caixa, acento, ordem ou separador: o PUT antigo aceita o texto derivado digitado de outro jeito. */
export const mesmosNomes = (texto: string | null | undefined, derivado: string | null): boolean => {
  const chaves = (t: string | null | undefined) => [...new Set(String(t ?? '').split(/\s*[,;]\s*/).map((x) => chaveNome(x)).filter(Boolean))].sort().join('|');
  return chaves(texto) === chaves(derivado);
};

/**
 * Textos que a Coleta registra nas colunas que JÁ estão no conteúdo congelado (spec 4.4). Ordem alfabética, ", " entre nomes.
 * `temTitulares` diz se a Coleta governa o texto (o PUT antigo de /ropa/:id então só aceita o valor derivado).
 */
export async function textosDaColeta(db: D1Database, projectId: string, ropaId: string) {
  const titulares = (await db.prepare(
    `SELECT c.nome FROM tratamento_etapa_titulares t JOIN catalogo_itens c ON c.id = t.titular_id
      WHERE t.ropa_id = ? AND t.project_id = ? AND t.etapa = 'coleta' ORDER BY c.nome COLLATE NOCASE`).bind(ropaId, projectId).all<{ nome: string }>()).results.map((r) => r.nome);
  const dados = (await db.prepare(
    `SELECT DISTINCT c.nome, c.sensivel FROM tratamento_etapa_dados d JOIN catalogo_itens c ON c.id = d.dado_id
      WHERE d.ropa_id = ? AND d.project_id = ? AND d.etapa = 'coleta' ORDER BY c.nome COLLATE NOCASE`).bind(ropaId, projectId).all<{ nome: string; sensivel: number }>()).results;
  return {
    temTitulares: titulares.length > 0,
    data_subjects: titulares.join(', ') || null,
    data_categories: dados.map((d) => d.nome).join(', ') || null,
    dados_sensiveis: dados.some((d) => d.sensivel) ? 1 : 0,
  };
}

/** Escreve os textos da Coleta nas colunas do hash, só se mudaram. Chamado quando a Coleta muda; nunca na leitura. */
export async function derivarDaColeta(db: D1Database, projectId: string, ropaId: string): Promise<Gravado> {
  const novo = await textosDaColeta(db, projectId, ropaId);
  const atual = await db.prepare('SELECT data_subjects, data_categories, dados_sensiveis FROM ropa_records WHERE id = ? AND project_id = ?')
    .bind(ropaId, projectId).first<{ data_subjects: string | null; data_categories: string | null; dados_sensiveis: number }>();
  const mudou = (atual?.data_subjects ?? null) !== novo.data_subjects || (atual?.data_categories ?? null) !== novo.data_categories
    || (atual?.dados_sensiveis ?? 0) !== novo.dados_sensiveis;
  if (mudou) {
    await db.prepare('UPDATE ropa_records SET data_subjects = ?, data_categories = ?, dados_sensiveis = ?, updated_at = ? WHERE id = ? AND project_id = ?')
      .bind(novo.data_subjects, novo.data_categories, novo.dados_sensiveis, new Date().toISOString(), ropaId, projectId).run();
  }
  return { ok: true, mudouHash: mudou };
}

/**
 * Depois de a Coleta mudar: titular que saiu dela some das outras etapas (com os dados), e cada dado que a Coleta não tem mais para o
 * titular some das outras etapas. Só mexe nas tabelas da etapa; o texto do hash é o `derivarDaColeta`.
 */
export async function podarDaColeta(db: D1Database, projectId: string, ropaId: string): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM tratamento_etapa_titulares WHERE ropa_id = ? AND project_id = ? AND etapa <> 'coleta'
      AND titular_id NOT IN (SELECT titular_id FROM tratamento_etapa_titulares WHERE ropa_id = ? AND etapa = 'coleta')`).bind(ropaId, projectId, ropaId),
    db.prepare(`DELETE FROM tratamento_etapa_dados WHERE ropa_id = ? AND project_id = ? AND etapa <> 'coleta'
      AND NOT EXISTS (SELECT 1 FROM tratamento_etapa_dados c WHERE c.ropa_id = tratamento_etapa_dados.ropa_id AND c.etapa = 'coleta'
        AND c.titular_id = tratamento_etapa_dados.titular_id AND c.dado_id = tratamento_etapa_dados.dado_id)`).bind(ropaId, projectId),
  ]);
}

/**
 * `tratamento_itens` (hash) acompanha as etapas SEM apagar o que alguém ligou por fora: acrescenta o que está em alguma etapa e só
 * remove o que saiu da etapa editada e não está em nenhuma outra (spec 4.4). `antes` = ativos da etapa antes da escrita.
 * Chamar DEPOIS de gravar a etapa (lê o estado atual).
 */
export async function sincronizarItens(db: D1Database, projectId: string, ropaId: string, antes: string[]): Promise<Gravado> {
  const emUso = new Set((await db.prepare('SELECT DISTINCT item_id FROM tratamento_etapa_itens WHERE ropa_id = ? AND project_id = ?')
    .bind(ropaId, projectId).all<{ item_id: string }>()).results.map((r) => r.item_id));
  const ligados = new Set((await db.prepare('SELECT item_id FROM tratamento_itens WHERE ropa_id = ? AND project_id = ?')
    .bind(ropaId, projectId).all<{ item_id: string }>()).results.map((r) => r.item_id));
  const acrescentar = [...emUso].filter((i) => !ligados.has(i));
  const remover = antes.filter((i) => !emUso.has(i) && ligados.has(i));
  const stmts = [
    ...acrescentar.map((i) => db.prepare('INSERT OR IGNORE INTO tratamento_itens (ropa_id, item_id, project_id) VALUES (?, ?, ?)').bind(ropaId, i, projectId)),
    ...remover.map((i) => db.prepare('DELETE FROM tratamento_itens WHERE ropa_id = ? AND item_id = ? AND project_id = ?').bind(ropaId, i, projectId)),
  ];
  if (stmts.length) await db.batch(stmts);
  return { ok: true, mudouHash: stmts.length > 0 };
}
