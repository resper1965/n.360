import { genId, logAudit } from '../helpers';

/**
 * Análises do incidente (fatia 3, migration 0101): o registro do trabalho da equipe, várias por incidente, cada uma com autor e data. Só o
 * autor altera a própria análise (como no legado); quem alcança o incidente lê todas. O risco ao titular continua sendo a avaliação formal.
 * Encerrado não muda (o gatilho `incidente_analises_aberto` e o `incidente_analises_encerrado_upd`, da 0102, recusam a inclusão e a alteração também por SQL direto). A trilha nunca leva o texto.
 */
type Falha = { ok: false; status: 403 | 404 | 409; error: string };
const falha = (status: Falha['status'], error: string): Falha => ({ ok: false, status, error });
const incidente = (db: D1Database, projectId: string, id: string) =>
  db.prepare('SELECT protocolo, status FROM incidentes WHERE id = ? AND project_id = ?').bind(id, projectId).first<{ protocolo: string; status: string }>();
const mesmo = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** null: o incidente não é deste projeto. `pode_editar` diz se quem lê é o autor (e o incidente segue aberto). */
export async function listarAnalises(db: D1Database, projectId: string, incidenteId: string, quem: string) {
  const i = await incidente(db, projectId, incidenteId);
  if (!i) return null;
  const { results } = await db.prepare(
    `SELECT a.id, a.autor, NULLIF(u.name, '') AS autor_nome, a.texto, a.created_at, a.updated_at
       FROM incidente_analises a LEFT JOIN users u ON lower(u.email) = lower(a.autor)
      WHERE a.incidente_id = ? AND a.project_id = ? ORDER BY a.created_at, a.rowid`
  ).bind(incidenteId, projectId).all<{ id: string; autor: string; autor_nome: string | null; texto: string; created_at: string; updated_at: string }>();
  return results.map((a) => ({ ...a, pode_editar: i.status !== 'encerrado' && mesmo(a.autor, quem) }));
}

export async function criarAnalise(db: D1Database, projectId: string, incidenteId: string, ator: string, texto: string): Promise<Falha | { ok: true; id: string }> {
  const i = await incidente(db, projectId, incidenteId);
  if (!i) return falha(404, 'Incidente não encontrado');
  if (i.status === 'encerrado') return falha(409, 'Incidente encerrado não muda');
  const id = genId();
  try {
    await db.prepare('INSERT INTO incidente_analises (id, project_id, incidente_id, autor, texto) VALUES (?, ?, ?, ?, ?)').bind(id, projectId, incidenteId, ator, texto).run();
  } catch (e) {
    if (/encerrado não muda/.test(String((e as Error)?.message))) return falha(409, 'Incidente encerrado não muda');
    throw e;
  }
  await logAudit(db, 'incidente.analise', ator, `Incidente ${i.protocolo}: análise registrada`, '', '', projectId, { tipo: 'incidente', id: incidenteId });
  return { ok: true, id };
}

export async function atualizarAnalise(db: D1Database, projectId: string, incidenteId: string, analiseId: string, ator: string, texto: string): Promise<Falha | { ok: true }> {
  const i = await incidente(db, projectId, incidenteId);
  const a = i && await db.prepare('SELECT autor FROM incidente_analises WHERE id = ? AND incidente_id = ? AND project_id = ?').bind(analiseId, incidenteId, projectId).first<{ autor: string }>();
  if (!i || !a) return falha(404, 'Análise não encontrada');
  if (i.status === 'encerrado') return falha(409, 'Incidente encerrado não muda');
  if (!mesmo(a.autor, ator)) return falha(403, 'Só quem escreveu a análise pode alterá-la');
  const r = await db.prepare(`UPDATE incidente_analises SET texto = ?, updated_at = datetime('now') WHERE id = ? AND incidente_id = ? AND project_id = ?
      AND EXISTS (SELECT 1 FROM incidentes WHERE id = ? AND status <> 'encerrado')`).bind(texto, analiseId, incidenteId, projectId, incidenteId).run();
  if (!r.meta.changes) return falha(409, 'Incidente encerrado não muda');
  await logAudit(db, 'incidente.analise', ator, `Incidente ${i.protocolo}: análise alterada`, '', '', projectId, { tipo: 'incidente', id: incidenteId });
  return { ok: true };
}

/** Evento da trilha → texto da linha do tempo. Fora da lista: "Alteração". */
const EVENTO: Record<string, string> = {
  'incidente.criado': 'Registrado', 'incidente.importado': 'Importado do histórico', 'incidente.alterado': 'Registro alterado',
  'incidente.risco': 'Risco ao titular avaliado', 'incidente.comunicacao': 'Comunicação registrada', 'incidente.encerrado': 'Encerrado',
  'incidente.anexo': 'Evidência', 'incidente.acao': 'Ação corretiva', 'incidente.analise': 'Análise',
};
const mascara = (e: string) => e.replace(/^(.).*(@.*)$/, '$1***$2');

/**
 * Histórico do incidente (mais novo primeiro): a trilha com `entity_type = 'incidente'`. Do `details` só sai o que vem depois do protocolo
 * (nomes de campo, destino da comunicação, o que mudou na ação), que o código grava sem texto livre; `justification` nunca sai.
 * null = incidente fora do projeto.
 */
export async function lerHistoricoIncidente(db: D1Database, projectId: string, incidenteId: string, limite = 200) {
  const i = await incidente(db, projectId, incidenteId);
  if (!i) return null;
  const { results } = await db.prepare(
    `SELECT l.action, l.actor, l.details, l.created_at, NULLIF(u.name, '') AS nome
       FROM audit_logs l LEFT JOIN users u ON lower(u.email) = lower(l.actor)
      WHERE l.project_id = ?1 AND l.entity_type = 'incidente' AND l.entity_id = ?2
      ORDER BY l.created_at DESC, l.rowid DESC LIMIT ?3`
  ).bind(projectId, incidenteId, Math.min(Math.max(limite, 1), 500)).all<{ action: string; actor: string; details: string | null; created_at: string; nome: string | null }>();
  return results.map((r) => {
    const resto = String(r.details ?? '').split(': ').slice(1).join(': ');
    return { evento: EVENTO[r.action] ?? 'Alteração', detalhe: resto || null, nome: r.nome ?? (r.actor.includes('@') ? mascara(r.actor) : r.actor), data: r.created_at };
  });
}
