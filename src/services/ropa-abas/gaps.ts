import { atualizarAcao, apagarAcao, criarAcao, type AcaoCorpo } from '../riscos-atividade';
import type { z } from 'zod';
import type { gapAtualizarSchema, gapCriarSchema } from '../../schemas/ropa-abas';
import { exigirEditavel, falha, type Falha, type Gravado } from './comum';
import { registrarSecao } from './logs';

/**
 * Controle de GAPs (spec 7): o gap é uma `corrective_actions` da atividade (o MESMO cadastro da CAPA do n.iso e de `/acoes`), com
 * `recomendacao`. Não toca coluna do hash. Adaptadores finos de `criarAcao`/`atualizarAcao`/`apagarAcao`.
 */
const SECAO = 'Controle de GAPS';
const tituloDe = (gap: string) => gap.split('\n')[0].trim().slice(0, 120) || gap.trim().slice(0, 120);

export type GapLido = {
  id: string; gap: string; recomendacao: string | null; plano_acao: string | null; responsavel: { id: string; nome: string } | null; prazo: string | null; status: string;
  anexos: { id: string; file_name: string; file_type: string; file_size: number }[];
};

/** null: atividade não é do projeto. */
export async function listarGaps(db: D1Database, projectId: string, ropaId: string): Promise<{ gaps: GapLido[]; nao_aplicavel: boolean } | null> {
  const at = await db.prepare('SELECT gaps_nao_aplicavel FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first<{ gaps_nao_aplicavel: number | null }>();
  if (!at) return null;
  const [linhas, anexos] = await db.batch([
    db.prepare(
      `SELECT ca.id, ca.title, ca.description, ca.recomendacao, ca.action_plan, ca.due_date, ca.status, ca.assigned_to_parte_id, pa.nome AS responsavel_nome
         FROM corrective_actions ca LEFT JOIN partes pa ON pa.id = ca.assigned_to_parte_id AND pa.project_id = ca.project_id
        WHERE ca.ropa_id = ? AND ca.project_id = ? ORDER BY ca.created_at, ca.rowid`
    ).bind(ropaId, projectId),
    db.prepare(
      `SELECT x.id, x.acao_id, x.file_name, x.file_type, x.file_size FROM acao_anexos x JOIN corrective_actions ca ON ca.id = x.acao_id
        WHERE ca.ropa_id = ? AND ca.project_id = ? AND x.project_id = ca.project_id ORDER BY x.created_at, x.rowid`
    ).bind(ropaId, projectId),
  ]);
  const porGap = new Map<string, GapLido['anexos']>();
  for (const a of anexos.results as { id: string; acao_id: string; file_name: string; file_type: string; file_size: number }[]) {
    porGap.set(a.acao_id, [...(porGap.get(a.acao_id) ?? []), { id: a.id, file_name: a.file_name, file_type: a.file_type, file_size: a.file_size }]);
  }
  const gaps = (linhas.results as LinhaGap[]).map((l): GapLido => ({
    id: l.id, gap: l.description ?? l.title, recomendacao: l.recomendacao ?? null, plano_acao: l.action_plan ?? null,
    responsavel: l.assigned_to_parte_id ? { id: l.assigned_to_parte_id, nome: l.responsavel_nome ?? '' } : null,
    prazo: l.due_date ?? null, status: l.status ?? 'Open', anexos: porGap.get(l.id) ?? [],
  }));
  return { gaps, nao_aplicavel: !!at.gaps_nao_aplicavel };
}

const naCorpo = (c: z.infer<typeof gapCriarSchema> | z.infer<typeof gapAtualizarSchema>): AcaoCorpo => ({
  ...(c.gap !== undefined ? { title: tituloDe(c.gap), description: c.gap } : {}),
  ...(c.prazo !== undefined ? { due_date: c.prazo } : {}),
  ...(c.responsavel_parte_id !== undefined ? { assigned_to_parte_id: c.responsavel_parte_id } : {}),
  ...(c.status !== undefined ? { status: c.status } : {}),
  ...(c.recomendacao !== undefined ? { recomendacao: c.recomendacao } : {}),
  ...(c.plano_acao !== undefined ? { action_plan: c.plano_acao } : {}),
});

export async function criarGap(db: D1Database, projectId: string, ropaId: string, ator: string, corpo: z.infer<typeof gapCriarSchema>): Promise<Falha | { ok: true; id: string }> {
  const ed = await exigirEditavel(db, projectId, ropaId);
  if (!ed.ok) return ed;
  const na = await db.prepare('SELECT gaps_nao_aplicavel FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first<{ gaps_nao_aplicavel: number | null }>();
  if (na?.gaps_nao_aplicavel) return falha(409, 'Controle de GAPs está como Não Aplicável: desmarque para registrar gaps');
  const r = await criarAcao(db, projectId, ropaId, naCorpo(corpo));
  if (!r.ok) return falha(r.status, r.error);
  await registrarSecao(db, ator, projectId, ropaId, SECAO, 'Inclusão');
  return r;
}

export async function atualizarGap(db: D1Database, projectId: string, ropaId: string, id: string, ator: string, corpo: z.infer<typeof gapAtualizarSchema>): Promise<Falha | Gravado> {
  const ed = await exigirEditavel(db, projectId, ropaId);
  if (!ed.ok) return ed;
  const r = await atualizarAcao(db, projectId, ropaId, id, naCorpo(corpo));
  if (!r.ok) return falha(r.status, r.error);
  await registrarSecao(db, ator, projectId, ropaId, SECAO, 'Alteração');
  return { ok: true, mudouHash: false };
}

/** Os anexos saem do R2 junto: o cascade do D1 não alcança o bucket (as chaves são lidas ANTES do DELETE). */
export async function apagarGap(env: { DB: D1Database; STORAGE: R2Bucket }, projectId: string, ropaId: string, id: string, ator: string): Promise<Falha | { ok: true }> {
  const ed = await exigirEditavel(env.DB, projectId, ropaId);
  if (!ed.ok) return ed;
  const { results } = await env.DB.prepare(
    `SELECT x.r2_key FROM acao_anexos x JOIN corrective_actions ca ON ca.id = x.acao_id WHERE ca.id = ? AND ca.ropa_id = ? AND ca.project_id = ? AND x.project_id = ca.project_id`
  ).bind(id, ropaId, projectId).all<{ r2_key: string }>();
  if (!(await apagarAcao(env.DB, projectId, ropaId, id))) return falha(404, 'Gap não encontrado');
  await Promise.all(results.map((x) => env.STORAGE.delete(x.r2_key).catch(() => undefined)));
  await registrarSecao(env.DB, ator, projectId, ropaId, SECAO, 'Exclusão');
  return { ok: true };
}

/** "Não Aplicável" só vale sem gaps registrados (o legado desabilita o "+ Gaps" nesse caso). */
export async function definirGapsNaoAplicavel(db: D1Database, projectId: string, ropaId: string, ator: string, valor: boolean): Promise<Falha | { ok: true }> {
  const ed = await exigirEditavel(db, projectId, ropaId);
  if (!ed.ok) return ed;
  if (valor) {
    const n = await db.prepare('SELECT count(*) AS n FROM corrective_actions WHERE ropa_id = ? AND project_id = ?').bind(ropaId, projectId).first<{ n: number }>();
    if (n?.n) return falha(409, 'Há gaps registrados: apague-os antes de marcar Não Aplicável');
  }
  await db.prepare("UPDATE ropa_records SET gaps_nao_aplicavel = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?").bind(valor ? 1 : 0, ropaId, projectId).run();
  await registrarSecao(db, ator, projectId, ropaId, SECAO, 'Alteração');
  return { ok: true };
}

type LinhaGap = {
  id: string; title: string; description: string | null; recomendacao: string | null; action_plan: string | null; due_date: string | null;
  status: string | null; assigned_to_parte_id: string | null; responsavel_nome: string | null;
};
