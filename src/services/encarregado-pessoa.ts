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

/** Leva o nome e o e-mail novos do DPO à parte que casava os antigos. Não mexe se o e-mail novo já é de outra parte. */
export async function atualizarEncarregado(db: D1Database, projectId: string, antes: Pessoa, depois: Pessoa): Promise<string | null> {
  const { results } = await db.prepare(`SELECT id, nome, email FROM partes WHERE project_id = ? AND tipo = 'pessoa' ORDER BY rowid`).bind(projectId).all<Parte>();
  const parte = casa(results, antes);
  if (!parte) return null;
  const email = depois.email?.trim().toLowerCase() || null;
  if (email && results.some((p) => p.id !== parte.id && p.email?.trim().toLowerCase() === email)) return null;
  await db.prepare('UPDATE partes SET nome = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?')
    .bind(normalizarNome(depois.nome), email, parte.id, projectId).run();
  return parte.id;
}

type MembroGov = { id: string; name: string; email: string | null; role_category: string | null; job_title: string | null };

/**
 * Leva o nome e o e-mail novos da parte encarregada ao membro DPO da governança que casava os antigos.
 * Linha de consultor nunca: ela dá acesso ao projeto e autoridade de assinatura, e só a rota da governança a muda.
 * Devolve o id do membro e o e-mail que ele tinha (para a revogação do acesso de stakeholder), ou null.
 */
export async function sincronizarDpoDaParte(db: D1Database, projectId: string, antes: Pessoa, depois: Pessoa): Promise<{ id: string; email: string | null } | null> {
  const membro = await membroDpoDaParte(db, projectId, antes);
  if (!membro) return null;
  await db.prepare('UPDATE project_governance SET name = ?, email = ? WHERE id = ? AND project_id = ?')
    .bind(depois.nome, depois.email, membro.id, projectId).run();
  return { id: membro.id, email: membro.email };
}

/** O membro DPO da governança (fora linha de consultor) que a parte com estes nome e e-mail casa, ou null. */
export async function membroDpoDaParte(db: D1Database, projectId: string, antes: Pessoa): Promise<Parte | null> {
  const { results } = await db.prepare('SELECT id, name, email, role_category, job_title FROM project_governance WHERE project_id = ?').bind(projectId).all<MembroGov>();
  return casa(results.filter((m) => m.role_category !== 'consultor' && ehDpo(m)).map((m) => ({ id: m.id, nome: m.name, email: m.email })), antes) ?? null;
}

/** Partes ativas com vínculo `encarregado` que nenhum membro DPO da governança casa. */
export async function encarregadosFora(db: D1Database, projectId: string): Promise<{ parte_id: string; nome: string; email: string | null }[]> {
  const [enc, gov] = await db.batch([
    db.prepare(`SELECT p.id, p.nome, p.email FROM partes p JOIN parte_vinculos v ON v.parte_id = p.id AND v.project_id = p.project_id
       WHERE p.project_id = ? AND p.status = 'ativa' AND v.papel = 'encarregado' AND v.alvo_tipo = 'projeto' ORDER BY p.nome`).bind(projectId),
    db.prepare('SELECT name, email, role_category, job_title FROM project_governance WHERE project_id = ?').bind(projectId),
  ]);
  const dpos = (gov.results as Omit<MembroGov, 'id'>[]).filter(ehDpo);
  return (enc.results as Parte[])
    .filter((p) => !dpos.some((m) => casa([p], { nome: m.name, email: m.email })))
    .map((p) => ({ parte_id: p.id, nome: p.nome, email: p.email }));
}
