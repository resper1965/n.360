import { genId, sha256Hex } from '../helpers';

/** Agente externo de coleta do n.ot (L5, plano 2026-11-04): chave `ot_coleta`, válida só em `/ot-coleta/mcp`. */
export const VALIDADE_PADRAO_DIAS = 7;
export const VALIDADE_MAX_DIAS = 30;
export const TETO_AGENTE_HORA = 120;

/** Emite a chave; o texto só sai aqui (no banco fica o SHA-256). */
export async function emitirChaveColeta(db: D1Database, projectId: string, nome: string, dias: number, ator: string): Promise<{ id: string; chave: string; expira_em: string }> {
  void ator; // a trilha é gravada pela rota, com o ator da sessão
  const id = genId();
  const chave = 'otc_' + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const expira_em = new Date(Date.now() + dias * 86_400_000).toISOString();
  await db.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, expires_at, status) VALUES (?, ?, ?, ?, 'ot_coleta', ?, 'Active')`)
    .bind(id, projectId, await sha256Hex(chave), nome, expira_em).run();
  return { id, chave, expira_em };
}
