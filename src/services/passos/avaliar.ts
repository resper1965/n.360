import type { Criterio, Passo } from '../../data/passos/tipos';
import type { ContextoProjeto } from './contexto';
import { valoresDoPasso } from './valores';

export interface ResultadoCriterio { tipo: string; rotulo: string; ok: boolean; detalhe?: string }
export interface Avaliacao { ok: boolean; faltam: number; criterios: ResultadoCriterio[] }

function avaliarCriterio(passo: Passo, c: Criterio, ctx: ContextoProjeto): ResultadoCriterio {
  const base = { tipo: c.tipo, rotulo: c.rotulo };
  switch (c.tipo) {
    case 'campos_preenchidos': {
      const valores = valoresDoPasso(passo, ctx);
      const alvo = c.campos ? passo.campos.filter((k) => c.campos!.includes(k.id)) : passo.campos.filter((k) => k.obrigatorio);
      const faltam = alvo.filter((k) => !valores[k.id]);
      return faltam.length ? { ...base, ok: false, detalhe: `faltam ${faltam.length} de ${alvo.length}` } : { ...base, ok: true };
    }
    case 'evidencia_anexada': {
      const id = ctx.progresso.get(passo.id)?.evidence_id;
      return id && ctx.evidencias.has(id) ? { ...base, ok: true } : { ...base, ok: false, detalhe: 'nenhum arquivo ligado a este passo' };
    }
    case 'registro_vinculado': {
      const n = ctx.entidades[c.entidade] ?? 0;
      return n >= c.minimo ? { ...base, ok: true } : { ...base, ok: false, detalhe: `${n} de ${c.minimo}` };
    }
    case 'pedido_de_aprovacao': {
      const n = c.situacao === 'qualquer'
        ? (ctx.pedidos.get(`${c.pedidoTipo}:aberto`) ?? 0) + (ctx.pedidos.get(`${c.pedidoTipo}:aprovado`) ?? 0)
        : ctx.pedidos.get(`${c.pedidoTipo}:${c.situacao}`) ?? 0;
      return n > 0 ? { ...base, ok: true } : { ...base, ok: false, detalhe: 'nenhum pedido no projeto' };
    }
    case 'entrevistas_concluidas': {
      const faltam = c.trilhas.filter((t) => !ctx.trilhas.has(t));
      return faltam.length ? { ...base, ok: false, detalhe: `falta: ${faltam.join(', ')}` } : { ...base, ok: true };
    }
    case 'responsavel_e_prazo': {
      const p = ctx.progresso.get(passo.id);
      return p?.assigned_to && p.due_date ? { ...base, ok: true } : { ...base, ok: false, detalhe: 'defina o responsável e o prazo' };
    }
    default:
      // Falha fechada: critério que o servidor não conhece nunca conta como cumprido.
      return { tipo: String((c as { tipo?: unknown }).tipo), rotulo: String((c as { rotulo?: unknown }).rotulo ?? ''), ok: false, detalhe: 'critério desconhecido' };
  }
}

/** Função pura: o "concluído quando" do passo contra o contexto do projeto. */
export function avaliarPasso(passo: Passo, ctx: ContextoProjeto): Avaliacao {
  const criterios = passo.concluidoQuando.map((c) => avaliarCriterio(passo, c, ctx));
  const faltam = criterios.filter((c) => !c.ok).length;
  return { ok: faltam === 0, faltam, criterios };
}
