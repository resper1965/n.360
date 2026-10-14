import { normalizarNome } from './nomes';
/** O DPO da governança do n.iso é o encarregado do n.privacy: a mesma pessoa, um vínculo `encarregado` no projeto. */
export const EH_DPO = /\b(dpo|encarregad[oa])\b/i;
export const ehDpo = (g: { job_title?: string | null; role_category?: string | null }) => g.role_category === 'dpo' || EH_DPO.test(g.job_title ?? '');

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

type Pessoa = { nome: string; email: string | null };
type Parte = { id: string; nome: string; email: string | null };

/** Mesma regra de casamento de `garantirEncarregado`: e-mail minúsculo, senão nome normalizado. */
const casa = (partes: Parte[], pessoa: Pessoa) => {
  const email = pessoa.email?.trim().toLowerCase() || null;
  return (email && partes.find((p) => p.email?.trim().toLowerCase() === email)) || partes.find((p) => norm(p.nome) === norm(pessoa.nome)) || undefined;
};

/**
 * Tira o vínculo `encarregado` da parte que `antes` (ex-DPO) casava, a menos que outro membro DPO do projeto
 * (`outrosDpo`) case a mesma parte. Devolve o id da parte desvinculada, ou null se nada foi removido.
 */
export async function desfazerEncarregado(db: D1Database, projectId: string, antes: Pessoa, outrosDpo: Pessoa[]): Promise<string | null> {
  const { results } = await db.prepare(`SELECT id, nome, email FROM partes WHERE project_id = ? AND tipo = 'pessoa' ORDER BY rowid`)
    .bind(projectId).all<Parte>();
  const parte = casa(results, antes);
  if (!parte || outrosDpo.some((o) => casa(results, o)?.id === parte.id)) return null;
  const r = await db.prepare(`DELETE FROM parte_vinculos WHERE project_id = ? AND parte_id = ? AND papel = 'encarregado' AND alvo_tipo = 'projeto'`)
    .bind(projectId, parte.id).run();
  return r.meta.changes ? parte.id : null;
}

/** Acha a parte pessoa por e-mail (minúsculo), senão por nome normalizado; cria se não houver; garante o vínculo. Devolve o parte_id. */
export async function garantirEncarregado(db: D1Database, projectId: string, pessoa: { nome: string; email: string | null }): Promise<string> {
  const email = pessoa.email?.trim().toLowerCase() || null;
  const { results } = await db.prepare(`SELECT id, nome, email FROM partes WHERE project_id = ? AND tipo = 'pessoa' ORDER BY rowid`)
    .bind(projectId).all<Parte>();
  const achada = casa(results, pessoa);
  const id = achada?.id ?? crypto.randomUUID();
  if (!achada) await db.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES (?, ?, 'pessoa', ?, ?)`).bind(id, projectId, normalizarNome(pessoa.nome), email).run();
  await db.prepare(`INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, ?, ?, 'encarregado', 'projeto', ?)`)
    .bind(crypto.randomUUID(), projectId, id, projectId).run();
  return id;
}
