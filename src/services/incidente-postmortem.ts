import { logAudit } from '../helpers';
import { PERGUNTAS_POSTMORTEM, PERGUNTA_POSTMORTEM_IDS, MAX_TEXTO_POSTMORTEM } from '../data/incidente-postmortem';

/**
 * Post mortem do incidente (fatia 5, migration 0103): as 14 perguntas do legado com a resposta gravada em `incidente_postmortem`. Abre só
 * depois do encerramento (409 antes; os gatilhos da 0103 recusam também por SQL direto) e responder não reabre o incidente. A trilha leva
 * só a contagem, nunca o texto.
 */
type Falha = { ok: false; status: 400 | 404 | 409; error: string };
const incidente = (db: D1Database, projectId: string, id: string) =>
  db.prepare('SELECT protocolo, status FROM incidentes WHERE id = ? AND project_id = ?').bind(id, projectId).first<{ protocolo: string; status: string }>();

/** null: o incidente não é deste projeto. `aberto` diz se o post mortem já pode ser respondido (incidente encerrado). */
export async function lerPostmortem(db: D1Database, projectId: string, incidenteId: string) {
  const i = await incidente(db, projectId, incidenteId);
  if (!i) return null;
  const { results } = await db.prepare('SELECT pergunta, resposta FROM incidente_postmortem WHERE incidente_id = ? AND project_id = ?')
    .bind(incidenteId, projectId).all<{ pergunta: string; resposta: string }>();
  const gravadas = new Map(results.map((r) => [r.pergunta, r.resposta]));
  return {
    aberto: i.status === 'encerrado',
    perguntas: PERGUNTAS_POSTMORTEM.map((p) => ({ id: p.id, texto: p.texto, resposta: gravadas.get(p.id) ?? null })),
  };
}

/** Grava as respostas que vieram (as outras ficam); `null` ou texto em branco apaga. */
export async function salvarPostmortem(
  db: D1Database, projectId: string, incidenteId: string, ator: string, respostas: Record<string, string | null>,
): Promise<Falha | { ok: true }> {
  const ids = Object.keys(respostas);
  if (!ids.length) return { ok: false, status: 400, error: 'Mande ao menos uma resposta' };
  for (const id of ids) {
    if (!PERGUNTA_POSTMORTEM_IDS.has(id)) return { ok: false, status: 400, error: `Pergunta desconhecida: ${id}` };
    if ((respostas[id]?.length ?? 0) > MAX_TEXTO_POSTMORTEM) return { ok: false, status: 400, error: `Resposta longa demais para ${id}` };
  }
  const i = await incidente(db, projectId, incidenteId);
  if (!i) return { ok: false, status: 404, error: 'Incidente não encontrado' };
  if (i.status !== 'encerrado') return { ok: false, status: 409, error: 'O post mortem abre depois do encerramento' };
  await db.batch(ids.map((id) => {
    const v = respostas[id]?.trim() || null;
    return v
      ? db.prepare(
        `INSERT INTO incidente_postmortem (incidente_id, project_id, pergunta, resposta, updated_by) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(incidente_id, pergunta) DO UPDATE SET resposta = excluded.resposta, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`
      ).bind(incidenteId, projectId, id, v, ator)
      : db.prepare('DELETE FROM incidente_postmortem WHERE incidente_id = ? AND project_id = ? AND pergunta = ?').bind(incidenteId, projectId, id);
  }));
  await logAudit(db, 'incidente.postmortem', ator, `Incidente ${i.protocolo}: ${ids.length} resposta(s)`, '', '', projectId, { tipo: 'incidente', id: incidenteId });
  return { ok: true };
}
