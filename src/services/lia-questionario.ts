/**
 * Questionário da LIA (n.privacy, migration 0084): as 12 perguntas do legado (`src/data/lia-perguntas.ts`) com a resposta gravada em
 * `lia_respostas`. A LIA é uma por tratamento, então a chave é o `ropa_id`. As respostas são o questionário, não a prova: gravar uma
 * nunca muda a conclusão, o status nem a regra de concluir (`salvarLia` não as lê). A sugestão da atividade (`da_atividade`) é só
 * leitura e nunca é gravada.
 */
import { ABAS_LIA, PERGUNTAS_LIA, PERGUNTA_LIA_POR_ID, ESCOLHAS_LIA, MAX_RESPOSTAS_POR_PUT, MAX_TEXTO_RESPOSTA, type AbaLia } from '../data/lia-perguntas';
import { genId } from '../helpers';

export type PerguntaLiaLida = { id: string; texto: string; tipo: 'texto' | 'escolha'; resposta: string | null; da_atividade: string | null };
export type QuestionarioLiaLido = { abas: { id: AbaLia; rotulo: string; perguntas: PerguntaLiaLida[] }[] };
type Falha = { ok: false; status: 400 | 404; error: string };

/** O que a atividade já informa: base legal, titulares e a marca de dados sensíveis. */
async function sugestoesDaAtividade(db: D1Database, projectId: string, ropaId: string): Promise<Record<'base_legal' | 'titulares' | 'dados_sensiveis', string | null>> {
  const r = await db.prepare(
    `SELECT r.legal_basis, r.data_subjects, r.dados_sensiveis, (SELECT q.referencia || ' - ' || q.titulo FROM requisitos q WHERE q.id = r.base_legal_id) AS base_legal
       FROM ropa_records r WHERE r.id = ? AND r.project_id = ?`
  ).bind(ropaId, projectId).first<{ legal_basis: string | null; data_subjects: string | null; dados_sensiveis: number | null; base_legal: string | null }>();
  const base = [r?.base_legal, r?.legal_basis].filter(Boolean).join('; ');
  return {
    base_legal: base ? `Base legal: ${base}` : null,
    titulares: r?.data_subjects?.trim() ? `Titulares: ${r.data_subjects.trim()}` : null,
    dados_sensiveis: r ? (r.dados_sensiveis ? 'A atividade está marcada com dados sensíveis (sim)' : 'A atividade não está marcada com dados sensíveis (não)') : null,
  };
}

/** As perguntas por aba, com a resposta gravada e a sugestão da atividade. null = a atividade não é do projeto. */
export async function lerQuestionarioLia(db: D1Database, projectId: string, ropaId: string): Promise<QuestionarioLiaLido | null> {
  if (!(await db.prepare('SELECT 1 FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first())) return null;
  const { results } = await db.prepare('SELECT pergunta, resposta FROM lia_respostas WHERE ropa_id = ? AND project_id = ?').bind(ropaId, projectId)
    .all<{ pergunta: string; resposta: string }>();
  const gravadas = new Map(results.map((r) => [r.pergunta, r.resposta]));
  const sug = await sugestoesDaAtividade(db, projectId, ropaId);
  return {
    abas: ABAS_LIA.map((a) => ({
      id: a.id, rotulo: a.rotulo,
      perguntas: PERGUNTAS_LIA.filter((p) => p.aba === a.id).map((p) => ({
        id: p.id, texto: p.texto, tipo: p.tipo, resposta: gravadas.get(p.id) ?? null, da_atividade: p.sugestao ? sug[p.sugestao] : null,
      })),
    })),
  };
}

/** Grava as respostas que vieram (as outras ficam); `null` apaga. Pergunta desconhecida ou escolha fora de sim/nao/nao_sei é 400. */
export async function salvarQuestionarioLia(
  db: D1Database, projectId: string, ropaId: string, ator: string, respostas: Record<string, string | null>,
): Promise<Falha | { ok: true }> {
  const ids = Object.keys(respostas);
  if (!ids.length || ids.length > MAX_RESPOSTAS_POR_PUT) return { ok: false, status: 400, error: `Mande de 1 a ${MAX_RESPOSTAS_POR_PUT} respostas` };
  for (const id of ids) {
    const p = PERGUNTA_LIA_POR_ID.get(id);
    if (!p) return { ok: false, status: 400, error: `Pergunta desconhecida: ${id}` };
    const v = respostas[id];
    if (v === null) continue;
    if (p.tipo === 'escolha' && !(ESCOLHAS_LIA as readonly string[]).includes(v)) return { ok: false, status: 400, error: `Resposta inválida para ${id}: use sim, nao ou nao_sei` };
    if (v.length > MAX_TEXTO_RESPOSTA) return { ok: false, status: 400, error: `Resposta longa demais para ${id}` };
  }
  if (!(await db.prepare('SELECT 1 FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first())) return { ok: false, status: 404, error: 'Registro do RoPA não encontrado' };
  const stmts = ids.map((id) => {
    const v = respostas[id]?.trim() || null; // resposta em branco apaga, como o null
    return v
      ? db.prepare(
        `INSERT INTO lia_respostas (ropa_id, project_id, pergunta, resposta, updated_by) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(ropa_id, pergunta) DO UPDATE SET resposta = excluded.resposta, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`
      ).bind(ropaId, projectId, id, v, ator)
      : db.prepare('DELETE FROM lia_respostas WHERE ropa_id = ? AND project_id = ? AND pergunta = ?').bind(ropaId, projectId, id);
  });
  // Uma linha de trilha por aba tocada: só a aba e a contagem, nunca o texto digitado.
  for (const aba of new Set(ids.map((id) => PERGUNTA_LIA_POR_ID.get(id)!.aba))) {
    const rotulo = ABAS_LIA.find((a) => a.id === aba)!.rotulo;
    const n = ids.filter((id) => PERGUNTA_LIA_POR_ID.get(id)!.aba === aba).length;
    stmts.push(db.prepare(
      `INSERT INTO audit_logs (id, action, actor, details, project_id, entity_type, entity_id, field, created_at)
       VALUES (?, 'lia.questionario', ?, ?, ?, 'lia', ?, ?, datetime('now'))`
    ).bind(genId(), ator, `LIA do tratamento ${ropaId}: ${n} resposta(s) em ${rotulo}`, projectId, ropaId, `${rotulo} / Respostas`));
  }
  await db.batch(stmts);
  return { ok: true };
}

export type LinhaDeLogLia = { evento: string; nome: string; data: string };

/** Ação gravada → texto da linha do tempo. Ação fora da lista aparece como "Alteração". */
const EVENTO_DA_ACAO: Record<string, string> = {
  'lia.criada': 'Criada', 'lia.atualizada': 'Dados alterados', 'lia.concluida': 'Concluída', 'lia.questionario': 'Questionário respondido',
};
const mascara = (e: string) => e.replace(/^(.).*(@.*)$/, '$1***$2');

/** Trilha da LIA (mais nova primeiro). Nunca devolve `details` nem `justification`: o texto digitado não sai. null = atividade fora do projeto. */
export async function lerLogsLia(db: D1Database, projectId: string, ropaId: string, limite = 50): Promise<LinhaDeLogLia[] | null> {
  if (!(await db.prepare('SELECT 1 FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first())) return null;
  const { results } = await db.prepare(
    `SELECT l.action, l.actor, l.field, l.created_at, NULLIF(u.name, '') AS nome
       FROM audit_logs l LEFT JOIN users u ON lower(u.email) = lower(l.actor)
      WHERE l.project_id = ?1 AND l.entity_type = 'lia' AND l.entity_id = ?2
      ORDER BY l.created_at DESC, l.rowid DESC LIMIT ?3`
  ).bind(projectId, ropaId, Math.min(Math.max(limite, 1), 200)).all<{ action: string; actor: string; field: string | null; created_at: string; nome: string | null }>();
  return results.map((r) => ({
    evento: `${EVENTO_DA_ACAO[r.action] ?? 'Alteração'}${r.field ? ` (${r.field.split(' / ')[0]})` : ''}`,
    nome: r.nome ?? (r.actor.includes('@') ? mascara(r.actor) : r.actor), data: r.created_at,
  }));
}
