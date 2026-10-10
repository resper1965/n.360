/** O DPO da governança do n.iso é o encarregado do n.privacy: a mesma pessoa, um vínculo `encarregado` no projeto. */
export const EH_DPO = /\b(dpo|encarregad[oa])\b/i;
export const ehDpo = (g: { job_title?: string | null; role_category?: string | null }) => g.role_category === 'dpo' || EH_DPO.test(g.job_title ?? '');

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Acha a parte pessoa por e-mail (minúsculo), senão por nome normalizado; cria se não houver; garante o vínculo. Devolve o parte_id. */
export async function garantirEncarregado(db: D1Database, projectId: string, pessoa: { nome: string; email: string | null }): Promise<string> {
  const email = pessoa.email?.trim().toLowerCase() || null;
  const { results } = await db.prepare(`SELECT id, nome, email FROM partes WHERE project_id = ? AND tipo = 'pessoa' ORDER BY rowid`)
    .bind(projectId).all<{ id: string; nome: string; email: string | null }>();
  const achada = (email && results.find((p) => p.email?.trim().toLowerCase() === email)) || results.find((p) => norm(p.nome) === norm(pessoa.nome));
  const id = achada?.id ?? crypto.randomUUID();
  if (!achada) await db.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES (?, ?, 'pessoa', ?, ?)`).bind(id, projectId, pessoa.nome.trim(), email).run();
  await db.prepare(`INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, ?, ?, 'encarregado', 'projeto', ?)`)
    .bind(crypto.randomUUID(), projectId, id, projectId).run();
  return id;
}
