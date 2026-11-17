// Desvio → ação corretiva do núcleo (onda 3). O título é lido por quem não tem o módulo ot: só vai o que a pessoa escreveu.
import { normaliza } from './copiloto-ropa';
import { TETO_LEITURA_OT } from './ot-inventario';
import type { LinhaDesvio } from './ot-desvio';

export const MSG_NOME_OT = 'O texto não pode citar o nome de ativos, zonas ou sites do projeto.';

/** Texto cita (sem caixa e sem acento) o nome de ativo/zona/site ativo do projeto? Nomes com menos de 3 letras não contam. */
export async function citaNomeOt(db: D1Database, projectId: string, ...textos: (string | undefined)[]): Promise<boolean> {
  const texto = normaliza(textos.filter(Boolean).join(' | '));
  for (const t of ['ot_ativos', 'ot_zonas', 'ot_sites']) {
    const { results } = await db.prepare(`SELECT nome FROM ${t} WHERE project_id = ? AND status = 'ativo' LIMIT ${TETO_LEITURA_OT}`).bind(projectId).all<{ nome: string }>();
    if (results.some((r) => { const n = normaliza(r.nome.trim()); return n.length >= 3 && texto.includes(n); })) return true;
  }
  return false;
}

export interface DadosAcao { titulo: string; descricao?: string; assigned_to?: string; assigned_to_parte_id?: string; prazo?: string }

/**
 * Um batch, tudo condicionado ao desvio ainda aberto e sem ligação: se outra chamada ganhou a corrida nenhuma linha entra
 * (a ação, a referência e o UPDATE se guardam um no outro) e o chamador relê. Devolve a linha do desvio se criou, senão null.
 */
export async function criarAcaoDoDesvio(db: D1Database, projectId: string, desvioId: string, sitesJson: string, userId: string, d: DadosAcao): Promise<{ acaoId: string; desvio: LinhaDesvio } | null> {
  const acaoId = crypto.randomUUID();
  const [a, , u] = await db.batch([
    db.prepare(`INSERT INTO corrective_actions (id, project_id, title, description, severity, assigned_to, assigned_to_parte_id, due_date, status, created_at)
      SELECT ?, ?, ?, ?, 'Medium', ?, ?, ?, 'Open', ? WHERE EXISTS (SELECT 1 FROM ot_desvios WHERE id = ? AND project_id = ? AND situacao = 'aberto' AND site_id IN (SELECT value FROM json_each(?)))
        AND NOT EXISTS (SELECT 1 FROM ot_referencias WHERE ot_desvio_id = ?)`)
      .bind(acaoId, projectId, d.titulo, d.descricao ?? null, d.assigned_to ?? null, d.assigned_to_parte_id || null, d.prazo ?? null, new Date().toISOString(), desvioId, projectId, sitesJson, desvioId),
    db.prepare(`INSERT INTO ot_referencias (id, project_id, acao_id, ot_site_id, ot_desvio_id, criado_por)
      SELECT ?, ?, ?, site_id, id, ? FROM ot_desvios WHERE id = ? AND project_id = ? AND EXISTS (SELECT 1 FROM corrective_actions WHERE id = ? AND project_id = ?)`)
      .bind(crypto.randomUUID(), projectId, acaoId, userId, desvioId, projectId, acaoId, projectId),
    db.prepare(`UPDATE ot_desvios SET situacao = 'tratado', nota = 'Ação corretiva aberta', atualizado_por = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND project_id = ? AND situacao = 'aberto' AND EXISTS (SELECT 1 FROM ot_referencias WHERE acao_id = ? AND project_id = ?) RETURNING *`)
      .bind(userId, desvioId, projectId, acaoId, projectId),
  ]);
  return a.meta.changes && u.results[0] ? { acaoId, desvio: u.results[0] as unknown as LinhaDesvio } : null;
}
