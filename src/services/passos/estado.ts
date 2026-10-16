import { chaveDoCampo } from '../../data/passos/catalogo';
import type { Catalogo, Passo } from '../../data/passos/tipos';
import type { ContextoProjeto } from './contexto';
import { avaliarPasso } from './avaliar';
import { valoresDoPasso } from './valores';

export type EstadoPasso = 'nao_iniciado' | 'em_andamento' | 'bloqueado' | 'concluido';
export type SituacaoDaFase = 'pending' | 'in_progress' | 'completed' | 'blocked';
export interface EstadoDoPasso { estado: EstadoPasso; concluidoPorExcecao: boolean; atividadeEm: string | null }

export function estadoDoPasso(passo: Passo, ctx: ContextoProjeto): EstadoDoPasso {
  const p = ctx.progresso.get(passo.id);
  const momentos = [p?.checked_at, p?.bloqueado_em, ...passo.campos.map((c) => ctx.respostas.get(chaveDoCampo(passo, c))?.atualizado_em)].filter((x): x is string => !!x);
  const atividadeEm = momentos.length ? momentos.sort().at(-1)! : null;
  if (p?.bloqueio_motivo && p.bloqueio_responsavel) return { estado: 'bloqueado', concluidoPorExcecao: false, atividadeEm };
  if (p?.is_checked) return { estado: 'concluido', concluidoPorExcecao: !!p.excecao_motivo, atividadeEm };
  const mexeu = !!p?.evidence_id || !!p?.assigned_to || Object.keys(valoresDoPasso(passo, ctx)).length > 0;
  return { estado: mexeu ? 'em_andamento' : 'nao_iniciado', concluidoPorExcecao: false, atividadeEm };
}

/** Spec 4.2. `legado` é `project_phases.legado_status` (a situação manual de antes da Bancada). */
export function situacaoDaFase(estados: EstadoPasso[], legado: string | null): SituacaoDaFase {
  if (estados.includes('bloqueado')) return 'blocked';
  if (estados.length > 0 && estados.every((e) => e === 'concluido')) return 'completed';
  if (legado === 'blocked') return 'blocked';
  if (estados.some((e) => e !== 'nao_iniciado')) return 'in_progress';
  return 'pending';
}

export function situacaoDaFaseNoContexto(cat: Catalogo, ctx: ContextoProjeto, fase: number): SituacaoDaFase {
  const estados = cat.passos.filter((p) => p.fase === fase).map((p) => estadoDoPasso(p, ctx).estado);
  return situacaoDaFase(estados, ctx.fases.get(fase)?.legado_status ?? null);
}

/** Spec 4.3. O passo mais recentemente mexido, se ainda aberto; senão o próximo aberto depois dele; sem atividade, o primeiro aberto. */
export function continuar(cat: Catalogo, ctx: ContextoProjeto): { fase: number; passo: string } | null {
  const estados = cat.passos.map((p) => ({ p, ...estadoDoPasso(p, ctx) }));
  const abertos = (e: (typeof estados)[number]) => e.estado === 'nao_iniciado' || e.estado === 'em_andamento';
  if (!estados.some(abertos)) return null;
  const ultimo = estados.filter((e) => e.atividadeEm).sort((a, b) => b.atividadeEm!.localeCompare(a.atividadeEm!))[0];
  const idx = ultimo ? estados.indexOf(ultimo) : -1;
  const alvo = (ultimo && abertos(ultimo) ? ultimo : undefined)
    ?? estados.slice(idx + 1).find(abertos)
    ?? estados.find(abertos);
  return alvo ? { fase: alvo.p.fase, passo: alvo.p.id } : null;
}

/** O retrato de GET /projects/:p/bancada (spec 5.1), puro. */
export function montarBancada(cat: Catalogo, ctx: ContextoProjeto) {
  const linhas = cat.passos.map((p) => {
    const e = estadoDoPasso(p, ctx);
    const pr = ctx.progresso.get(p.id);
    const av = avaliarPasso(p, ctx);
    return {
      id: p.id, fase: p.fase, estado: e.estado, concluido_por_excecao: e.concluidoPorExcecao,
      responsavel: pr?.assigned_to ?? null, prazo: pr?.due_date ?? null, atividade_em: e.atividadeEm,
      bloqueio: e.estado === 'bloqueado' ? { motivo: pr!.bloqueio_motivo!, responsavel: pr!.bloqueio_responsavel!, em: pr!.bloqueado_em } : null,
      avaliacao_ok: av.ok, faltam: av.faltam,
    };
  });
  const fases = cat.fases.map((f) => {
    const doGrupo = linhas.filter((l) => l.fase === f.numero);
    const legado = ctx.fases.get(f.numero)?.legado_status ?? null;
    return {
      numero: f.numero,
      situacao: situacaoDaFase(doGrupo.map((l) => l.estado), legado),
      situacao_antiga: legado === 'blocked' ? 'blocked' : null,
      concluidos: doGrupo.filter((l) => l.estado === 'concluido').length,
      total: doGrupo.length,
      bloqueados: doGrupo.filter((l) => l.estado === 'bloqueado').length,
      bloqueio: doGrupo.find((l) => l.bloqueio)?.bloqueio ?? null,
    };
  });
  return {
    tem_fases: ctx.fases.size > 0,
    continuar: continuar(cat, ctx),
    totais: { passos: linhas.length, concluidos: linhas.filter((l) => l.estado === 'concluido').length, bloqueados: linhas.filter((l) => l.estado === 'bloqueado').length },
    fases,
    passos: linhas,
  };
}
