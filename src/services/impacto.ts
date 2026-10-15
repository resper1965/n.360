/**
 * Teste de impacto do tratamento (n.privacy, migration 0072): as 13 perguntas do legado e a recomendação de RIPD calculada no
 * servidor, para tela, relatório, painel e agente lerem o mesmo resultado. As respostas ficam em `tratamento_impacto`, fora do
 * conteúdo congelado da aprovação do RoPA. `dpia_required` continua decisão humana: aqui só se recomenda.
 */
export type RespostaImpacto = 'sim' | 'nao' | 'nao_sei';
export type GrupoImpacto = 'geral' | 'especifico';
export type PerguntaImpacto = { id: string; grupo: GrupoImpacto; texto: string };
export type Recomendacao = { resultado: 'recomendado' | 'dispensavel_a_confirmar' | 'incompleto'; motivos: string[] };

/** 2 perguntas de critério geral e 11 de critério específico. Texto fiel ao legado; a revisão jurídica é do dono. */
export const PERGUNTAS_IMPACTO: readonly PerguntaImpacto[] = [
  { id: 'afeta_direitos', grupo: 'geral', texto: 'O tratamento pode afetar significativamente interesses e direitos dos titulares?' },
  { id: 'larga_escala', grupo: 'geral', texto: 'Será realizado o tratamento de qualquer tipo de dados pessoais em larga escala?' },
  { id: 'sensiveis', grupo: 'especifico', texto: 'Será realizado o tratamento de dados pessoais sensíveis dos titulares, ou seja, informações sobre origem racial ou étnica, convicção religiosa, opinião política, filiação a sindicato ou a organização de caráter religioso, filosófico ou político, dado referente à saúde ou à vida sexual, dado genético ou biométrico, quando vinculado a uma pessoa natural?' },
  { id: 'vulneraveis', grupo: 'especifico', texto: 'Será realizado o tratamento de dados pessoais sobre indivíduos vulneráveis?' },
  { id: 'finalidade_distinta', grupo: 'especifico', texto: 'O projeto envolve a utilização de dados pessoais para finalidade distinta daquela pela qual foi coletado?' },
  { id: 'compartilhamento_novo', grupo: 'especifico', texto: 'O projeto envolve o compartilhamento de dados pessoais com terceiros que não tinham acesso aos dados anteriormente?' },
  { id: 'monitoramento', grupo: 'especifico', texto: 'Será realizado o monitoramento sistemático de titulares de dados pessoais?' },
  { id: 'perfilizacao', grupo: 'especifico', texto: 'O projeto incluirá a avaliação (perfilização) ou pontuação (scoring) dos titulares de dados pessoais?' },
  { id: 'combinacao', grupo: 'especifico', texto: 'Conjuntos de dados pessoais serão combinados ou enriquecidos?' },
  { id: 'transferencia', grupo: 'especifico', texto: 'Existirá transferência de dados pessoais para fora do território nacional brasileiro?' },
  { id: 'tecnologia_inovadora', grupo: 'especifico', texto: 'Durante o tratamento de dados pessoais serão empregadas soluções tecnológicas ou organizacionais inovadoras?' },
  { id: 'decisao_automatizada', grupo: 'especifico', texto: 'O projeto incluirá o uso de dados pessoais para tomada de decisão automatizada com efeito legal ou significativamente similar?' },
  { id: 'legitimo_interesse', grupo: 'especifico', texto: 'O fundamento legal para o tratamento de dados é legítimo interesse?' },
];
const IDS = new Set(PERGUNTAS_IMPACTO.map((p) => p.id));
export const ehPerguntaDeImpacto = (id: string) => IDS.has(id);

/**
 * Regra do legado: RIPD recomendado quando há pelo menos um critério GERAL e pelo menos um ESPECÍFICO marcados "sim".
 * Sem isso, só fica dispensável (a confirmar por uma pessoa) com as 13 respondidas sim ou não; qualquer falta ou "não sei" é incompleto.
 */
export function recomendarRipd(respostas: Record<string, RespostaImpacto | undefined>): Recomendacao {
  const sim = (g: GrupoImpacto) => PERGUNTAS_IMPACTO.filter((p) => p.grupo === g && respostas[p.id] === 'sim').map((p) => p.id);
  const gerais = sim('geral');
  const especificos = sim('especifico');
  if (gerais.length && especificos.length) return { resultado: 'recomendado', motivos: [...gerais, ...especificos] };
  const todasRespondidas = PERGUNTAS_IMPACTO.every((p) => respostas[p.id] === 'sim' || respostas[p.id] === 'nao');
  return { resultado: todasRespondidas ? 'dispensavel_a_confirmar' : 'incompleto', motivos: [] };
}

export type Impacto = {
  perguntas: { id: string; grupo: GrupoImpacto; texto: string; resposta: RespostaImpacto | null }[];
  recomendacao: Recomendacao;
  finalizado_em: string | null;
};

/** O teste do tratamento (catálogo com as respostas gravadas), ou null se o registro não é do projeto. */
export async function lerImpacto(db: D1Database, projectId: string, ropaId: string): Promise<Impacto | null> {
  const rec = await db.prepare('SELECT impacto_finalizado_em FROM ropa_records WHERE id = ? AND project_id = ?')
    .bind(ropaId, projectId).first<{ impacto_finalizado_em: string | null }>();
  if (!rec) return null;
  const { results } = await db.prepare('SELECT pergunta, resposta FROM tratamento_impacto WHERE ropa_id = ? AND project_id = ?')
    .bind(ropaId, projectId).all<{ pergunta: string; resposta: RespostaImpacto }>();
  // Pergunta que saiu do catálogo fica no banco, mas não conta nem aparece.
  const respostas: Record<string, RespostaImpacto> = Object.fromEntries(results.filter((l) => IDS.has(l.pergunta)).map((l) => [l.pergunta, l.resposta]));
  return {
    perguntas: PERGUNTAS_IMPACTO.map((p) => ({ ...p, resposta: respostas[p.id] ?? null })),
    recomendacao: recomendarRipd(respostas),
    finalizado_em: rec.impacto_finalizado_em,
  };
}

/** Grava as respostas que vieram (as outras ficam) e, se `finalizar` vier, marca ou desmarca o teste como finalizado. */
export async function salvarImpacto(
  db: D1Database, projectId: string, ropaId: string, ator: string,
  corpo: { respostas: Record<string, RespostaImpacto>; finalizar?: boolean },
): Promise<{ ok: true } | { ok: false; status: 400 | 404; error: string }> {
  if (!(await db.prepare('SELECT 1 FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first())) {
    return { ok: false, status: 404, error: 'Registro do RoPA não encontrado' };
  }
  const ids = Object.keys(corpo.respostas);
  const desconhecida = ids.find((id) => !ehPerguntaDeImpacto(id));
  if (desconhecida) return { ok: false, status: 400, error: `Pergunta desconhecida: ${desconhecida}` };
  const stmts = ids.map((id) => db.prepare(
    `INSERT INTO tratamento_impacto (ropa_id, project_id, pergunta, resposta, atualizado_por) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ropa_id, pergunta) DO UPDATE SET resposta = excluded.resposta, atualizado_por = excluded.atualizado_por, atualizado_em = CURRENT_TIMESTAMP`
  ).bind(ropaId, projectId, id, corpo.respostas[id], ator));
  if (corpo.finalizar !== undefined) {
    stmts.push(db.prepare('UPDATE ropa_records SET impacto_finalizado_em = ? WHERE id = ? AND project_id = ?')
      .bind(corpo.finalizar ? new Date().toISOString() : null, ropaId, projectId));
  }
  if (stmts.length) await db.batch(stmts);
  return { ok: true };
}
