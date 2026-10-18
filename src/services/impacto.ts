/**
 * Teste de impacto do tratamento (n.privacy, migration 0072): as 13 perguntas do legado e a recomendação de RIPD calculada no
 * servidor, para tela, relatório, painel e agente lerem o mesmo resultado. As respostas ficam em `tratamento_impacto`, fora do
 * conteúdo congelado da aprovação do RoPA. `dpia_required` continua decisão humana: aqui só se recomenda.
 */
import { ehLegitimoInteresse } from './lia';
import { SQL_TITULOS_ADICIONAIS } from './bases';

export type RespostaImpacto = 'sim' | 'nao' | 'nao_sei';
export type GrupoImpacto = 'geral' | 'especifico' | 'alto_risco';
/** `curto` é o motivo em português, para a recomendação na tela ("há dados sensíveis"). */
export type PerguntaImpacto = { id: string; grupo: GrupoImpacto; texto: string; curto: string };
export type Recomendacao = { resultado: 'recomendado' | 'dispensavel_a_confirmar' | 'incompleto'; motivos: string[] };

/** 1 pergunta de alto risco (opcional na conta de respondidas), 2 de critério geral e 11 de critério específico. Texto fiel ao legado; a revisão jurídica é do dono. */
export const PERGUNTAS_IMPACTO: readonly PerguntaImpacto[] = [
  { id: 'alto_risco', grupo: 'alto_risco', texto: 'A atividade pode gerar alto risco ao titular de dados?', curto: 'a atividade pode gerar alto risco ao titular' },
  { id: 'afeta_direitos', grupo: 'geral', texto: 'O tratamento pode afetar significativamente interesses e direitos dos titulares?', curto: 'pode afetar significativamente os direitos dos titulares' },
  { id: 'larga_escala', grupo: 'geral', texto: 'Será realizado o tratamento de qualquer tipo de dados pessoais em larga escala?', curto: 'o tratamento é em larga escala' },
  { id: 'sensiveis', grupo: 'especifico', texto: 'Será realizado o tratamento de dados pessoais sensíveis dos titulares, ou seja, informações sobre origem racial ou étnica, convicção religiosa, opinião política, filiação a sindicato ou a organização de caráter religioso, filosófico ou político, dado referente à saúde ou à vida sexual, dado genético ou biométrico, quando vinculado a uma pessoa natural?', curto: 'há dados sensíveis' },
  { id: 'vulneraveis', grupo: 'especifico', texto: 'Será realizado o tratamento de dados pessoais sobre indivíduos vulneráveis?', curto: 'há dados de pessoas vulneráveis' },
  { id: 'finalidade_distinta', grupo: 'especifico', texto: 'O projeto envolve a utilização de dados pessoais para finalidade distinta daquela pela qual foi coletado?', curto: 'os dados são usados para finalidade distinta da coleta' },
  { id: 'compartilhamento_novo', grupo: 'especifico', texto: 'O projeto envolve o compartilhamento de dados pessoais com terceiros que não tinham acesso aos dados anteriormente?', curto: 'há compartilhamento com terceiros que não tinham acesso' },
  { id: 'monitoramento', grupo: 'especifico', texto: 'Será realizado o monitoramento sistemático de titulares de dados pessoais?', curto: 'há monitoramento sistemático' },
  { id: 'perfilizacao', grupo: 'especifico', texto: 'O projeto incluirá a avaliação (perfilização) ou pontuação (scoring) dos titulares de dados pessoais?', curto: 'há perfilização ou pontuação dos titulares' },
  { id: 'combinacao', grupo: 'especifico', texto: 'Conjuntos de dados pessoais serão combinados ou enriquecidos?', curto: 'conjuntos de dados são combinados ou enriquecidos' },
  { id: 'transferencia', grupo: 'especifico', texto: 'Existirá transferência de dados pessoais para fora do território nacional brasileiro?', curto: 'há transferência internacional' },
  { id: 'tecnologia_inovadora', grupo: 'especifico', texto: 'Durante o tratamento de dados pessoais serão empregadas soluções tecnológicas ou organizacionais inovadoras?', curto: 'há tecnologia ou solução inovadora' },
  { id: 'decisao_automatizada', grupo: 'especifico', texto: 'O projeto incluirá o uso de dados pessoais para tomada de decisão automatizada com efeito legal ou significativamente similar?', curto: 'há decisão automatizada com efeito relevante' },
  { id: 'legitimo_interesse', grupo: 'especifico', texto: 'O fundamento legal para o tratamento de dados é legítimo interesse?', curto: 'a base é o legítimo interesse' },
];
/** O modelo de importação segue as perguntas de antes: a de alto risco é da ficha, importar é outra etapa. */
export const PERGUNTAS_IMPORTAVEIS = () => PERGUNTAS_IMPACTO.filter((p) => p.grupo !== 'alto_risco');
const IDS = new Set(PERGUNTAS_IMPACTO.map((p) => p.id));
export const ehPerguntaDeImpacto = (id: string) => IDS.has(id);

/**
 * Regra do legado: RIPD recomendado quando há pelo menos um critério GERAL e pelo menos um ESPECÍFICO marcados "sim".
 * Alto risco sim recomenda sozinho. Sem isso, só fica dispensável (a confirmar por uma pessoa) com as 13 respondidas sim ou não; qualquer falta ou "não sei" é incompleto.
 */
export function recomendarRipd(respostas: Record<string, RespostaImpacto | undefined>): Recomendacao {
  const sim = (g: GrupoImpacto) => PERGUNTAS_IMPACTO.filter((p) => p.grupo === g && respostas[p.id] === 'sim').map((p) => p.id);
  const gerais = sim('geral');
  const especificos = sim('especifico');
  const alto = respostas.alto_risco === 'sim';
  if (alto || (gerais.length && especificos.length)) return { resultado: 'recomendado', motivos: [...(alto ? ['alto_risco'] : []), ...gerais, ...especificos] };
  // `alto_risco` é opcional na conta: as 13 do legado respondidas continuam bastando para "dispensável".
  const todasRespondidas = PERGUNTAS_IMPACTO.filter((p) => p.grupo !== 'alto_risco').every((p) => respostas[p.id] === 'sim' || respostas[p.id] === 'nao');
  return { resultado: todasRespondidas ? 'dispensavel_a_confirmar' : 'incompleto', motivos: [] };
}

export type Impacto = {
  perguntas: { id: string; grupo: GrupoImpacto; texto: string; curto: string; resposta: RespostaImpacto | null; da_atividade: RespostaImpacto | null }[];
  recomendacao: Recomendacao;
  finalizado_em: string | null;
};

type DadosDaAtividade = {
  dados_sensiveis: number | null; criancas_adolescentes: number | null; international_transfers: number | null; transferencias: number;
  legal_basis: string | null; base_titulo: string | null; adicionais: string | null; base_gdpr: string | null;
  processamento_automatizado?: string | null;
};

/**
 * O que a atividade já responde do teste, para a tela não perguntar de novo. Só o que a origem GARANTE: a marca 1 é sempre escolha
 * de alguém, mas o 0 também é o padrão de quem não respondeu (importação, edição avançada), então sensível, criança e transferência
 * só propõem "sim". O legítimo interesse propõe "não" quando há base e nenhuma delas é legítimo interesse. Larga escala, decisão
 * automatizada e as demais não têm coluna: ficam com a pessoa. Nada disso é gravado nem entra na recomendação até a pessoa confirmar.
 */
export function respostasDaAtividade(a: DadosDaAtividade): Record<string, RespostaImpacto> {
  const out: Record<string, RespostaImpacto> = {};
  if (a.dados_sensiveis) out.sensiveis = 'sim';
  if (a.criancas_adolescentes) out.vulneraveis = 'sim';
  if (a.international_transfers || a.transferencias > 0) out.transferencia = 'sim';
  if (a.processamento_automatizado === 'decisao') out.decisao_automatizada = 'sim';
  if (ehLegitimoInteresse(a.legal_basis, a.base_titulo, a.adicionais, a.base_gdpr)) out.legitimo_interesse = 'sim';
  else if (String(a.legal_basis || a.base_titulo || '').trim()) out.legitimo_interesse = 'nao';
  return out;
}

/** O teste do tratamento (catálogo com as respostas gravadas e o que a atividade já responde), ou null se o registro não é do projeto. */
export async function lerImpacto(db: D1Database, projectId: string, ropaId: string): Promise<Impacto | null> {
  const rec = await db.prepare(
    `SELECT r.impacto_finalizado_em, r.dados_sensiveis, r.criancas_adolescentes, r.international_transfers, r.legal_basis, r.base_gdpr, r.processamento_automatizado,
            q.titulo AS base_titulo, ${SQL_TITULOS_ADICIONAIS} AS adicionais,
            (SELECT count(*) FROM tratamento_transferencias t WHERE t.ropa_id = r.id AND t.project_id = r.project_id) AS transferencias
       FROM ropa_records r LEFT JOIN requisitos q ON q.id = r.base_legal_id WHERE r.id = ? AND r.project_id = ?`
  ).bind(ropaId, projectId).first<DadosDaAtividade & { impacto_finalizado_em: string | null }>();
  if (!rec) return null;
  const { results } = await db.prepare('SELECT pergunta, resposta FROM tratamento_impacto WHERE ropa_id = ? AND project_id = ?')
    .bind(ropaId, projectId).all<{ pergunta: string; resposta: RespostaImpacto }>();
  // Pergunta que saiu do catálogo fica no banco, mas não conta nem aparece.
  const respostas: Record<string, RespostaImpacto> = Object.fromEntries(results.filter((l) => IDS.has(l.pergunta)).map((l) => [l.pergunta, l.resposta]));
  const daAtividade = respostasDaAtividade(rec);
  return {
    // `resposta` é só o gravado (a importação e o RIPD leem assim); `da_atividade` é proposta, à espera da pessoa.
    perguntas: PERGUNTAS_IMPACTO.map((p) => ({ ...p, resposta: respostas[p.id] ?? null, da_atividade: daAtividade[p.id] ?? null })),
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
