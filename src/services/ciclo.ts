/**
 * Ciclo de vida do dado na atividade de tratamento (F3, migration 0074): uma linha por etapa, `registrada` ou `nao_aplicavel`, com um
 * item opcional (o sistema ou arquivo da etapa) e uma descrição. Fora do conteúdo congelado da aprovação do RoPA: gravar não substitui
 * pedido nenhum. Os gatilhos da 0074 recusam tratamento ou item de outro projeto; aqui a recusa vira 400 com os ids.
 */
export const ETAPAS_CICLO = [
  { id: 'coleta', rotulo: 'Coleta' },
  { id: 'uso', rotulo: 'Uso' },
  { id: 'compartilhamento_interno', rotulo: 'Compartilhamento interno' },
  { id: 'compartilhamento_externo', rotulo: 'Compartilhamento externo' },
  { id: 'armazenamento', rotulo: 'Armazenamento' },
  { id: 'eliminacao', rotulo: 'Eliminação' },
] as const;
export type EtapaCiclo = (typeof ETAPAS_CICLO)[number]['id'];
export const IDS_ETAPAS = ETAPAS_CICLO.map((e) => e.id) as [EtapaCiclo, ...EtapaCiclo[]];
export type SituacaoCiclo = 'registrada' | 'nao_aplicavel';

export type EtapaLida = {
  etapa: EtapaCiclo; rotulo: string; situacao: SituacaoCiclo | null; item_id: string | null; item_nome: string | null; descricao: string | null;
};
export type EtapaInformada = { etapa: EtapaCiclo; situacao: SituacaoCiclo; item_id?: string | null; descricao?: string | null };
type Falha = { ok: false; status: 400 | 404; error: string; invalidos?: string[] };

const registroDoProjeto = (db: D1Database, projectId: string, ropaId: string) =>
  db.prepare('SELECT 1 FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first();

/** As seis etapas, na ordem, com o que estiver gravado (ou nulos). null = registro não é do projeto. */
export async function lerCiclo(db: D1Database, projectId: string, ropaId: string): Promise<EtapaLida[] | null> {
  if (!(await registroDoProjeto(db, projectId, ropaId))) return null;
  const { results } = await db.prepare(
    `SELECT c.etapa, c.situacao, c.item_id, i.nome AS item_nome, c.descricao FROM tratamento_ciclo c LEFT JOIN itens i ON i.id = c.item_id
      WHERE c.ropa_id = ? AND c.project_id = ?`
  ).bind(ropaId, projectId).all<Omit<EtapaLida, 'rotulo'>>();
  return etapasDe(results);
}

/** As seis etapas na ordem, preenchidas com as linhas gravadas de UM tratamento. */
export function etapasDe(linhas: Omit<EtapaLida, 'rotulo'>[]): EtapaLida[] {
  const por = new Map(linhas.map((l) => [l.etapa, l]));
  return ETAPAS_CICLO.map((e) => {
    const l = por.get(e.id);
    return { etapa: e.id, rotulo: e.rotulo, situacao: l?.situacao ?? null, item_id: l?.item_id ?? null, item_nome: l?.item_nome ?? null, descricao: l?.descricao ?? null };
  });
}

/**
 * Grava as etapas que vieram (as outras ficam). Campo ausente mantém o gravado; `nao_aplicavel` limpa o item (CHECK do banco).
 * Etapa repetida, item de outro projeto ou `nao_aplicavel` com item são 400.
 */
export async function salvarCiclo(db: D1Database, projectId: string, ropaId: string, ator: string, etapas: EtapaInformada[]): Promise<Falha | { ok: true }> {
  const atual = await lerCiclo(db, projectId, ropaId);
  if (!atual) return { ok: false, status: 404, error: 'Registro do RoPA não encontrado' };
  const repetida = etapas.find((e, i) => etapas.findIndex((x) => x.etapa === e.etapa) !== i);
  if (repetida) return { ok: false, status: 400, error: `Etapa repetida: ${repetida.etapa}` };
  if (etapas.some((e) => e.situacao === 'nao_aplicavel' && e.item_id)) return { ok: false, status: 400, error: 'Etapa que não se aplica não tem sistema ou arquivo' };
  const ids = [...new Set(etapas.map((e) => e.item_id).filter((x): x is string => !!x))];
  if (ids.length) {
    const { results } = await db.prepare('SELECT id FROM itens WHERE project_id = ?1 AND id IN (SELECT value FROM json_each(?2))')
      .bind(projectId, JSON.stringify(ids)).all<{ id: string }>();
    const validos = new Set(results.map((r) => r.id));
    const invalidos = ids.filter((x) => !validos.has(x));
    if (invalidos.length) return { ok: false, status: 400, error: 'Item inexistente ou de outro projeto', invalidos };
  }
  const stmts = etapas.map((e) => {
    const antes = atual.find((x) => x.etapa === e.etapa)!;
    const item = e.situacao === 'nao_aplicavel' ? null : e.item_id !== undefined ? e.item_id : antes.item_id;
    const descricao = e.descricao !== undefined ? e.descricao : antes.descricao;
    return db.prepare(
      `INSERT INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao, item_id, descricao, atualizado_por) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ropa_id, etapa) DO UPDATE SET situacao = excluded.situacao, item_id = excluded.item_id, descricao = excluded.descricao,
         atualizado_por = excluded.atualizado_por, atualizado_em = CURRENT_TIMESTAMP`
    ).bind(ropaId, projectId, e.etapa, e.situacao, item ?? null, descricao || null, ator);
  });
  if (stmts.length) await db.batch(stmts);
  return { ok: true };
}

/** O ciclo em uma linha por etapa respondida, para textos derivados (DPIA, relatório). Vazio quando nada foi respondido. */
export function cicloEmTexto(etapas: EtapaLida[]): string[] {
  return etapas.filter((e) => e.situacao).map((e) => e.situacao === 'nao_aplicavel'
    ? `${e.rotulo}: não se aplica`
    : `${e.rotulo}: ${[e.item_nome, e.descricao].filter(Boolean).join(' - ') || 'registrada'}`);
}
