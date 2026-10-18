import { genId } from '../../helpers';
import { modulosDoProjeto } from '../../modulos';
import type { z } from 'zod';
import type { medidaCriarSchema, medidaAtualizarSchema } from '../../schemas/ropa-abas';
import { atividadeDoProjeto, exigirEditavel, falha, type Falha } from './comum';

type Criar = z.infer<typeof medidaCriarSchema>;
type Atualizar = z.infer<typeof medidaAtualizarSchema>;

export type MedidaLida = {
  id: string; medida: string; status: string; descricao: string | null; controle_id: string | null;
  controle: { id: string; titulo: string; implementado: boolean } | null;
  controle_deixou_de_estar_implementado: boolean; created_at: string;
};

/** Controles do n.iso já implementados no projeto. `[]` quando o projeto não tem o n.iso (e no projeto novo, sem controle nenhum). */
export async function controlesImplementados(db: D1Database, projectId: string): Promise<{ id: string; titulo: string }[]> {
  if (!(await modulosDoProjeto(db, projectId)).includes('iso')) return [];
  const { results } = await db.prepare(`SELECT id, title AS titulo FROM compliance_controls WHERE project_id = ? AND status = 'Implemented' ORDER BY title`)
    .bind(projectId).all<{ id: string; titulo: string }>();
  return results;
}

/** Nomes de medida já usados neste projeto (vazio no projeto novo: nenhuma lista é semeada). */
export async function sugestoesDeMedida(db: D1Database, projectId: string): Promise<string[]> {
  const { results } = await db.prepare('SELECT DISTINCT medida FROM tratamento_medidas WHERE project_id = ? ORDER BY medida').bind(projectId).all<{ medida: string }>();
  return results.map((r) => r.medida);
}

/** null = a atividade não é do projeto. Ordem de criação. O estado do controle é lido na hora, nunca gravado. */
export async function listarMedidas(db: D1Database, projectId: string, ropaId: string): Promise<MedidaLida[] | null> {
  if (!(await atividadeDoProjeto(db, projectId, ropaId))) return null;
  const { results } = await db.prepare(
    `SELECT m.id, m.medida, m.status, m.descricao, m.controle_id, m.created_at, c.title AS controle_titulo, c.status AS controle_status
       FROM tratamento_medidas m LEFT JOIN compliance_controls c ON c.id = m.controle_id AND c.project_id = m.project_id
      WHERE m.ropa_id = ? AND m.project_id = ? ORDER BY m.created_at, m.rowid`
  ).bind(ropaId, projectId).all<{ id: string; medida: string; status: string; descricao: string | null; controle_id: string | null; created_at: string; controle_titulo: string | null; controle_status: string | null }>();
  return results.map((r) => {
    const implementado = r.controle_status === 'Implemented';
    return {
      id: r.id, medida: r.medida, status: r.status, descricao: r.descricao, controle_id: r.controle_id, created_at: r.created_at,
      controle: r.controle_id && r.controle_titulo !== null ? { id: r.controle_id, titulo: r.controle_titulo, implementado } : null,
      controle_deixou_de_estar_implementado: !!r.controle_id && r.controle_titulo !== null && !implementado,
    };
  });
}

const CONTROLE_RECUSADO = 'Controle inexistente, de outro projeto ou não implementado';
const controleValido = async (db: D1Database, projectId: string, controleId: string) =>
  (await controlesImplementados(db, projectId)).some((c) => c.id === controleId);

export async function criarMedida(db: D1Database, projectId: string, ropaId: string, ator: string, d: Criar): Promise<Falha | { ok: true; id: string }> {
  const ed = await exigirEditavel(db, projectId, ropaId);
  if (!ed.ok) return ed;
  if (d.controle_id && !(await controleValido(db, projectId, d.controle_id))) return falha(400, CONTROLE_RECUSADO);
  const id = genId();
  await db.prepare('INSERT INTO tratamento_medidas (id, project_id, ropa_id, medida, status, descricao, controle_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, projectId, ropaId, d.medida, d.status, d.descricao ?? null, d.controle_id || null, ator).run();
  return { ok: true, id };
}

const CAMPOS = ['medida', 'status', 'descricao', 'controle_id'] as const; // allowlist: o nome da coluna nunca vem do corpo

export async function atualizarMedida(db: D1Database, projectId: string, ropaId: string, id: string, d: Atualizar): Promise<Falha | { ok: true }> {
  const ed = await exigirEditavel(db, projectId, ropaId);
  if (!ed.ok) return ed;
  if (!(await db.prepare('SELECT 1 FROM tratamento_medidas WHERE id = ? AND ropa_id = ? AND project_id = ?').bind(id, ropaId, projectId).first())) return falha(404, 'Medida não encontrada');
  if (d.controle_id && !(await controleValido(db, projectId, d.controle_id))) return falha(400, CONTROLE_RECUSADO);
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const campo of CAMPOS) {
    const v = d[campo];
    if (v === undefined) continue;
    sets.push(`${campo} = ?`);
    binds.push(v || null);
  }
  if (sets.length) {
    await db.prepare(`UPDATE tratamento_medidas SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ropa_id = ? AND project_id = ?`)
      .bind(...binds, id, ropaId, projectId).run();
  }
  return { ok: true };
}

export async function apagarMedida(db: D1Database, projectId: string, ropaId: string, id: string): Promise<Falha | { ok: true }> {
  const ed = await exigirEditavel(db, projectId, ropaId);
  if (!ed.ok) return ed;
  const r = await db.prepare('DELETE FROM tratamento_medidas WHERE id = ? AND ropa_id = ? AND project_id = ?').bind(id, ropaId, projectId).run();
  return r.meta.changes ? { ok: true } : falha(404, 'Medida não encontrada');
}
