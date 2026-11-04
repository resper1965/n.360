import type { z } from 'zod';
import { genId } from '../../helpers';
import type { orgaoPublicoCriarSchema, orgaoPublicoAtualizarSchema } from '../../schemas/ropa-abas';
import { exigirEditavel, falha, type Falha } from './comum';

type Criar = z.infer<typeof orgaoPublicoCriarSchema>;
type Atualizar = z.infer<typeof orgaoPublicoAtualizarSchema>;
export type OrgaoPublico = { id: string; nome: string; obrigacao_legal: string | null };
export const MAX_ORGAOS = 20;

const listar = async (db: D1Database, projectId: string, ropaId: string) => (await db.prepare(
  'SELECT id, nome, obrigacao_legal FROM tratamento_orgaos_publicos WHERE ropa_id = ? AND project_id = ? ORDER BY created_at, id',
).bind(ropaId, projectId).all<OrgaoPublico>()).results;

/** O texto de `recipients` (conteúdo congelado da aprovação) que as linhas geram. Sem linha, null. */
export const textoDosOrgaos = (orgaos: OrgaoPublico[]) =>
  orgaos.length ? orgaos.map((o) => (o.obrigacao_legal ? `${o.nome} (${o.obrigacao_legal})` : o.nome)).join('; ') : null;

/**
 * Os órgãos da atividade. `texto_anterior`: o `recipients` gravado em texto livre antes do cadastro estruturado (só sem linhas);
 * a tela o mostra para a pessoa transcrever, e o primeiro órgão cadastrado o substitui.
 */
export async function lerOrgaosPublicos(db: D1Database, projectId: string, ropaId: string) {
  const r = await db.prepare('SELECT recipients FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first<{ recipients: string | null }>();
  if (!r) return null;
  const orgaos = await listar(db, projectId, ropaId);
  const anterior = String(r.recipients ?? '').trim();
  return { orgaos, texto_anterior: !orgaos.length && anterior ? anterior : null };
}

/** Reescreve `recipients` a partir das linhas. true se o texto mudou (a rota então confere os pedidos abertos). */
async function regravarTexto(db: D1Database, projectId: string, ropaId: string): Promise<boolean> {
  const atual = await db.prepare('SELECT recipients FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first<{ recipients: string | null }>();
  const novo = textoDosOrgaos(await listar(db, projectId, ropaId));
  if ((atual?.recipients ?? null) === novo) return false;
  await db.prepare('UPDATE ropa_records SET recipients = ?, updated_at = ? WHERE id = ? AND project_id = ?').bind(novo, new Date().toISOString(), ropaId, projectId).run();
  return true;
}

export async function criarOrgaoPublico(db: D1Database, projectId: string, ropaId: string, ator: string, d: Criar): Promise<Falha | { ok: true; id: string; mudouHash: boolean }> {
  const ed = await exigirEditavel(db, projectId, ropaId);
  if (!ed.ok) return ed;
  const n = await db.prepare('SELECT COUNT(*) AS n FROM tratamento_orgaos_publicos WHERE ropa_id = ? AND project_id = ?').bind(ropaId, projectId).first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_ORGAOS) return falha(409, `No máximo ${MAX_ORGAOS} órgãos públicos por atividade`);
  const id = genId();
  await db.prepare('INSERT INTO tratamento_orgaos_publicos (id, project_id, ropa_id, nome, obrigacao_legal, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, projectId, ropaId, d.nome, d.obrigacao_legal ?? null, ator).run();
  return { ok: true, id, mudouHash: await regravarTexto(db, projectId, ropaId) };
}

export async function atualizarOrgaoPublico(db: D1Database, projectId: string, ropaId: string, id: string, d: Atualizar): Promise<Falha | { ok: true; mudouHash: boolean }> {
  const ed = await exigirEditavel(db, projectId, ropaId);
  if (!ed.ok) return ed;
  const atual = await db.prepare('SELECT nome, obrigacao_legal FROM tratamento_orgaos_publicos WHERE id = ? AND ropa_id = ? AND project_id = ?').bind(id, ropaId, projectId).first<OrgaoPublico>();
  if (!atual) return falha(404, 'Órgão público não encontrado');
  await db.prepare('UPDATE tratamento_orgaos_publicos SET nome = ?, obrigacao_legal = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ropa_id = ? AND project_id = ?')
    .bind(d.nome ?? atual.nome, d.obrigacao_legal === undefined ? atual.obrigacao_legal : d.obrigacao_legal, id, ropaId, projectId).run();
  return { ok: true, mudouHash: await regravarTexto(db, projectId, ropaId) };
}

export async function apagarOrgaoPublico(db: D1Database, projectId: string, ropaId: string, id: string): Promise<Falha | { ok: true; mudouHash: boolean }> {
  const ed = await exigirEditavel(db, projectId, ropaId);
  if (!ed.ok) return ed;
  const r = await db.prepare('DELETE FROM tratamento_orgaos_publicos WHERE id = ? AND ropa_id = ? AND project_id = ?').bind(id, ropaId, projectId).run();
  if (!r.meta.changes) return falha(404, 'Órgão público não encontrado');
  return { ok: true, mudouHash: await regravarTexto(db, projectId, ropaId) };
}
