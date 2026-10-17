import type { z } from 'zod';
import type { agentesSchema } from '../../schemas/ropa-abas';
import { exigirEditavel, type Falha, type Gravado } from './comum';

type AgentesCorpo = z.infer<typeof agentesSchema>;

/** Colunas da aba e se estão no conteúdo congelado do tratamento (`international_transfers` e `transfer_safeguards` estão). */
const COLUNAS = {
  papel_controlador: false,
  papel_operador: false,
  international_transfers: true,
  transfer_safeguards: true,
} as const;

/**
 * Controlador/operador e transferência internacional. Desmarcar `international_transfers` NÃO apaga as linhas de
 * `tratamento_transferencias`: só a pessoa as remove, pela rota própria. Campo ausente mantém; `null` em papel volta a "não informado".
 */
export async function salvarAgentes(db: D1Database, projectId: string, ropaId: string, _ator: string, corpo: AgentesCorpo): Promise<Falha | Gravado> {
  const ed = await exigirEditavel(db, projectId, ropaId);
  if (!ed.ok) return ed;
  const atual = await db.prepare('SELECT international_transfers, transfer_safeguards FROM ropa_records WHERE id = ? AND project_id = ?')
    .bind(ropaId, projectId).first<Record<string, unknown>>();
  let mudouHash = false;
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const [campo, noHash] of Object.entries(COLUNAS)) {
    const v = (corpo as Record<string, unknown>)[campo];
    if (v === undefined) continue; // ausente mantém
    sets.push(`${campo} = ?`);
    binds.push(v ?? null);
    const igual = campo === 'international_transfers' ? Number(atual?.[campo] ?? 0) === Number(v) : (v ?? null) === (atual?.[campo] ?? null);
    if (noHash && !igual) mudouHash = true;
  }
  if (sets.length) {
    await db.prepare(`UPDATE ropa_records SET ${sets.join(', ')}, updated_at = ? WHERE id = ? AND project_id = ?`).bind(...binds, new Date().toISOString(), ropaId, projectId).run();
  }
  return { ok: true, mudouHash };
}
