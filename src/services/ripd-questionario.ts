/**
 * Questionário do RIPD (n.privacy/n.iso, migration 0083): as perguntas do legado (`src/data/ripd-perguntas.ts`) com a resposta gravada em
 * `dpia_respostas`, FORA de `COLUNAS_DPIA` e do hash da aprovação. Gravar resposta nunca derruba assinatura nem pedido: este serviço não
 * toca `dpia_assessments`. A sugestão da atividade (`da_atividade`) é só leitura e nunca é gravada.
 */
import { ABAS_RIPD, PERGUNTAS_RIPD, PERGUNTA_RIPD_POR_ID, ESCOLHAS_RIPD, MAX_RESPOSTAS_POR_PUT, MAX_TEXTO_RESPOSTA, type AbaRipd } from '../data/ripd-perguntas';
import { genId } from '../helpers';

export type PerguntaLida = { id: string; texto: string; tipo: 'texto' | 'escolha'; resposta: string | null; da_atividade: string | null };
export type QuestionarioLido = { abas: { id: AbaRipd; rotulo: string; perguntas: PerguntaLida[] }[] };
type Falha = { ok: false; status: 400 | 404; error: string };

/** O que a atividade ligada ao RIPD já informa: operadores (aba Agentes), local de armazenamento (etapa Armazenamento) e volume mensal (Escopo). */
async function sugestoesDaAtividade(db: D1Database, projectId: string, ropaId: string | null): Promise<Record<'operadores' | 'armazenamento' | 'volume', string | null>> {
  if (!ropaId) return { operadores: null, armazenamento: null, volume: null };
  const [reg, ops, arm] = await db.batch([
    db.prepare('SELECT volume_mensal FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId),
    db.prepare(
      `SELECT DISTINCT p.nome FROM parte_vinculos v JOIN partes p ON p.id = v.parte_id
        WHERE v.alvo_tipo = 'tratamento' AND v.alvo_id = ? AND v.project_id = ? AND v.papel = 'operador' ORDER BY p.nome`
    ).bind(ropaId, projectId),
    db.prepare(
      `SELECT i.nome AS item, COALESCE(c.descricao_etapa, c.descricao) AS descricao FROM tratamento_ciclo c LEFT JOIN itens i ON i.id = c.item_id
        WHERE c.ropa_id = ? AND c.project_id = ? AND c.etapa = 'armazenamento' AND c.situacao = 'registrada'`
    ).bind(ropaId, projectId),
  ]);
  const volume = (reg.results[0] as { volume_mensal: string | null } | undefined)?.volume_mensal?.trim() || null;
  const operadores = (ops.results as { nome: string }[]).map((o) => o.nome);
  const etapa = arm.results[0] as { item: string | null; descricao: string | null } | undefined;
  const local = etapa ? [etapa.item, etapa.descricao?.trim()].filter(Boolean).join(': ') || null : null;
  return { operadores: operadores.length ? `Operadores: ${operadores.join(', ')}` : null, armazenamento: local, volume };
}

/** As perguntas por aba, com a resposta gravada e a sugestão da atividade. null = o RIPD não é do projeto. */
export async function lerQuestionario(db: D1Database, projectId: string, dpiaId: string): Promise<QuestionarioLido | null> {
  const dpia = await db.prepare('SELECT ropa_id FROM dpia_assessments WHERE id = ? AND project_id = ?').bind(dpiaId, projectId).first<{ ropa_id: string | null }>();
  if (!dpia) return null;
  const { results } = await db.prepare('SELECT pergunta, resposta FROM dpia_respostas WHERE dpia_id = ? AND project_id = ?').bind(dpiaId, projectId)
    .all<{ pergunta: string; resposta: string }>();
  const gravadas = new Map(results.map((r) => [r.pergunta, r.resposta]));
  const sug = await sugestoesDaAtividade(db, projectId, dpia.ropa_id);
  return {
    abas: ABAS_RIPD.map((a) => ({
      id: a.id, rotulo: a.rotulo,
      perguntas: PERGUNTAS_RIPD.filter((p) => p.aba === a.id).map((p) => ({
        id: p.id, texto: p.texto, tipo: p.tipo, resposta: gravadas.get(p.id) ?? null, da_atividade: p.sugestao ? sug[p.sugestao] : null,
      })),
    })),
  };
}

/** Grava as respostas que vieram (as outras ficam); `null` apaga. Pergunta desconhecida ou escolha fora de sim/nao/nao_sei é 400. */
export async function salvarQuestionario(
  db: D1Database, projectId: string, dpiaId: string, ator: string, respostas: Record<string, string | null>,
): Promise<Falha | { ok: true }> {
  const ids = Object.keys(respostas);
  if (!ids.length || ids.length > MAX_RESPOSTAS_POR_PUT) return { ok: false, status: 400, error: `Mande de 1 a ${MAX_RESPOSTAS_POR_PUT} respostas` };
  for (const id of ids) {
    const p = PERGUNTA_RIPD_POR_ID.get(id);
    if (!p) return { ok: false, status: 400, error: `Pergunta desconhecida: ${id}` };
    const v = respostas[id];
    if (v === null) continue;
    if (p.tipo === 'escolha' && !(ESCOLHAS_RIPD as readonly string[]).includes(v)) return { ok: false, status: 400, error: `Resposta inválida para ${id}: use sim, nao ou nao_sei` };
    if (v.length > MAX_TEXTO_RESPOSTA) return { ok: false, status: 400, error: `Resposta longa demais para ${id}` };
  }
  if (!(await db.prepare('SELECT 1 FROM dpia_assessments WHERE id = ? AND project_id = ?').bind(dpiaId, projectId).first())) return { ok: false, status: 404, error: 'RIPD não encontrado' };
  const stmts = ids.map((id) => {
    const v = respostas[id]?.trim() || null; // resposta em branco apaga, como o null
    return v
      ? db.prepare(
        `INSERT INTO dpia_respostas (dpia_id, project_id, pergunta, resposta, updated_by) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(dpia_id, pergunta) DO UPDATE SET resposta = excluded.resposta, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`
      ).bind(dpiaId, projectId, id, v, ator)
      : db.prepare('DELETE FROM dpia_respostas WHERE dpia_id = ? AND project_id = ? AND pergunta = ?').bind(dpiaId, projectId, id);
  });
  // Uma linha de trilha por aba tocada: só a aba e a contagem, nunca o texto digitado.
  for (const aba of new Set(ids.map((id) => PERGUNTA_RIPD_POR_ID.get(id)!.aba))) {
    const rotulo = ABAS_RIPD.find((a) => a.id === aba)!.rotulo;
    const n = ids.filter((id) => PERGUNTA_RIPD_POR_ID.get(id)!.aba === aba).length;
    stmts.push(db.prepare(
      `INSERT INTO audit_logs (id, action, actor, details, project_id, entity_type, entity_id, field, created_at)
       VALUES (?, 'dpia.questionario', ?, ?, ?, 'dpia', ?, ?, datetime('now'))`
    ).bind(genId(), ator, `RIPD ${dpiaId}: ${n} resposta(s) em ${rotulo}`, projectId, dpiaId, `${rotulo} / Respostas`));
  }
  await db.batch(stmts);
  return { ok: true };
}

export type LinhaDeLogRipd = { evento: string; nome: string; data: string };

/** Ação gravada → texto da linha do tempo. Ação fora da lista aparece como "Alteração". */
const EVENTO_DA_ACAO: Record<string, string> = {
  dpia_created: 'Criado', 'dpia.criada_do_tratamento': 'Criado a partir da atividade', dpia_updated: 'Dados alterados',
  'dpia.aprovacao_invalidada': 'Aprovação derrubada por mudança de conteúdo', 'dpia.approved': 'Assinado', 'dpia.approval_revoked': 'Aprovação revogada (reaberto)',
  'dpia.questionario': 'Questionário respondido',
};
const mascara = (e: string) => e.replace(/^(.).*(@.*)$/, '$1***$2');

/** Trilha do RIPD (mais nova primeiro). Nunca devolve `details` nem `justification`: o motivo da revogação e o texto digitado não saem. null = RIPD fora do projeto. */
export async function lerLogsRipd(db: D1Database, projectId: string, dpiaId: string, limite = 50): Promise<LinhaDeLogRipd[] | null> {
  if (!(await db.prepare('SELECT 1 FROM dpia_assessments WHERE id = ? AND project_id = ?').bind(dpiaId, projectId).first())) return null;
  const { results } = await db.prepare(
    `SELECT l.action, l.actor, l.field, l.created_at, NULLIF(u.name, '') AS nome
       FROM audit_logs l LEFT JOIN users u ON lower(u.email) = lower(l.actor)
      WHERE l.project_id = ?1 AND l.entity_type = 'dpia' AND l.entity_id = ?2
      ORDER BY l.created_at DESC, l.rowid DESC LIMIT ?3`
  ).bind(projectId, dpiaId, Math.min(Math.max(limite, 1), 200)).all<{ action: string; actor: string; field: string | null; created_at: string; nome: string | null }>();
  return results.map((r) => ({
    evento: `${EVENTO_DA_ACAO[r.action] ?? 'Alteração'}${r.field ? ` (${r.field.split(' / ')[0]})` : ''}`,
    nome: r.nome ?? (r.actor.includes('@') ? mascara(r.actor) : r.actor), data: r.created_at,
  }));
}
