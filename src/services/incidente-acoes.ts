import { logAudit, refForaDoProjeto, setParcial } from '../helpers';

/**
 * Ações corretivas do incidente (fatia 4, spec 2026-11-04-incidentes-legado-design). A ação é a MESMA `corrective_actions` da CAPA do n.iso
 * e do gap da atividade, ligada por `incidente_id` (0063), agora nos dois módulos. `tratamento` (0100) é contenção, correção ou
 * aperfeiçoamento; o prazo fica opcional em todos (o legado o desligava na contenção). O protocolo `<protocolo>-PA01` é derivado pela ordem
 * de criação, sem coluna. Nada é criado sozinho na abertura do incidente. A ação segue depois do encerramento: a correção costuma vir depois.
 */
export const TRATAMENTOS_ACAO = ['contencao', 'correcao', 'aperfeicoamento'] as const;
export const STATUS_ACAO_INCIDENTE = ['Open', 'In Progress', 'Closed'] as const;
export type AcaoIncidenteCorpo = {
  title?: string; description?: string | null; tratamento?: (typeof TRATAMENTOS_ACAO)[number] | null; assigned_to_parte_id?: string | null;
  due_date?: string | null; status?: (typeof STATUS_ACAO_INCIDENTE)[number];
};
type Falha = { ok: false; status: 400 | 404; error: string };
const falha = (status: Falha['status'], error: string): Falha => ({ ok: false, status, error });

const incidente = (db: D1Database, projectId: string, id: string) =>
  db.prepare('SELECT protocolo FROM incidentes WHERE id = ? AND project_id = ?').bind(id, projectId).first<{ protocolo: string }>();

/** null: o incidente não é deste projeto. */
export async function listarAcoesDoIncidente(db: D1Database, projectId: string, incidenteId: string) {
  const i = await incidente(db, projectId, incidenteId);
  if (!i) return null;
  const { results } = await db.prepare(
    `SELECT ca.id, ca.title, ca.description, ca.tratamento, ca.assigned_to_parte_id, pa.nome AS assigned_to_parte_nome, ca.due_date, ca.status,
            ca.completed_at, ca.created_at
       FROM corrective_actions ca LEFT JOIN partes pa ON pa.id = ca.assigned_to_parte_id AND pa.project_id = ca.project_id
      WHERE ca.incidente_id = ? AND ca.project_id = ? ORDER BY ca.created_at, ca.rowid`
  ).bind(incidenteId, projectId).all<Record<string, unknown>>();
  return results.map((a, n) => ({ ...a, protocolo: `${i.protocolo}-PA${String(n + 1).padStart(2, '0')}` }));
}

export async function criarAcaoDoIncidente(db: D1Database, projectId: string, incidenteId: string, ator: string, d: AcaoIncidenteCorpo): Promise<Falha | { ok: true; id: string }> {
  const i = await incidente(db, projectId, incidenteId);
  if (!i) return falha(404, 'Incidente não encontrado');
  if (await refForaDoProjeto(db, projectId, d, ['assigned_to_parte_id'])) return falha(400, 'assigned_to_parte_id inexistente ou de outro projeto');
  const id = crypto.randomUUID();
  const status = d.status ?? 'Open';
  const agora = new Date().toISOString();
  await db.prepare(
    `INSERT INTO corrective_actions (id, project_id, incidente_id, title, description, tratamento, assigned_to_parte_id, due_date, status, completed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, projectId, incidenteId, d.title, d.description ?? null, d.tratamento ?? null, d.assigned_to_parte_id || null, d.due_date ?? null,
    status, status === 'Closed' ? agora : null, agora).run();
  await logAudit(db, 'incidente.acao', ator, `Incidente ${i.protocolo}: ação corretiva criada`, '', '', projectId, { tipo: 'incidente', id: incidenteId });
  return { ok: true, id };
}

export async function atualizarAcaoDoIncidente(db: D1Database, projectId: string, incidenteId: string, acaoId: string, ator: string, d: AcaoIncidenteCorpo): Promise<Falha | { ok: true }> {
  const i = await incidente(db, projectId, incidenteId);
  const acao = i && await db.prepare('SELECT status FROM corrective_actions WHERE id = ? AND incidente_id = ? AND project_id = ?').bind(acaoId, incidenteId, projectId).first<{ status: string }>();
  if (!i || !acao) return falha(404, 'Ação não encontrada');
  if (await refForaDoProjeto(db, projectId, d, ['assigned_to_parte_id'])) return falha(400, 'assigned_to_parte_id inexistente ou de outro projeto');
  const p = setParcial(d, { title: null, description: null, tratamento: null, assigned_to_parte_id: null, due_date: null, status: 'Open' });
  const sets = p.sql ? [p.sql] : [];
  const binds = [...p.binds];
  // Concluir carimba a data; reabrir a limpa; status igual ou ausente não mexe.
  if (d.status !== undefined && d.status !== acao.status) { sets.push('completed_at = ?'); binds.push(d.status === 'Closed' ? new Date().toISOString() : null); }
  if (!sets.length) return { ok: true };
  await db.prepare(`UPDATE corrective_actions SET ${sets.join(', ')} WHERE id = ? AND incidente_id = ? AND project_id = ?`).bind(...binds, acaoId, incidenteId, projectId).run();
  await logAudit(db, 'incidente.acao', ator, `Incidente ${i.protocolo}: ação corretiva alterada (${Object.keys(d).filter((k) => (d as Record<string, unknown>)[k] !== undefined).join(', ')})`, '', '', projectId, { tipo: 'incidente', id: incidenteId });
  return { ok: true };
}
