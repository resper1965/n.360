import type { Passo } from '../../data/passos/tipos';
import type { ContextoProjeto } from './contexto';
import { avaliarPasso } from './avaliar';
import { estadoDoPasso } from './estado';
import { anotacaoAnterior, valoresDoPasso } from './valores';

/** `equipe` é a equipe da ness.: só ela vê o motivo da exceção e a anotação antiga (podem ter jargão; spec, riscos). */
export async function detalheDoPasso(db: D1Database, projectId: string, passo: Passo, ctx: ContextoProjeto, equipe: boolean) {
  const p = ctx.progresso.get(passo.id);
  const e = estadoDoPasso(passo, ctx);
  const ev = p?.evidence_id && ctx.evidencias.has(p.evidence_id)
    ? await db.prepare(`SELECT id, file_name, evaluation_status FROM evidence WHERE id = ? AND project_id = ?`).bind(p.evidence_id, projectId).first<{ id: string; file_name: string; evaluation_status: string }>()
    : null;
  return {
    ok: true,
    passo: { id: passo.id, estado: e.estado },
    valores: valoresDoPasso(passo, ctx),
    avaliacao: avaliarPasso(passo, ctx),
    prova: { evidence_id: ev?.id ?? null, arquivo: ev?.file_name ?? null, avaliacao: ev?.evaluation_status ?? null },
    responsavel: p?.assigned_to ?? null,
    prazo: p?.due_date ?? null,
    bloqueio: e.estado === 'bloqueado' ? { motivo: p!.bloqueio_motivo, responsavel: p!.bloqueio_responsavel, em: p!.bloqueado_em } : null,
    excecao: p?.excecao_motivo ? (equipe ? { motivo: p.excecao_motivo, por: p.excecao_por, em: p.excecao_em } : { justificada: true }) : null,
    anotacao_anterior: equipe ? anotacaoAnterior(p?.notes) : null,
  };
}
