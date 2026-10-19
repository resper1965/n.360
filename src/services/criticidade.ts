/**
 * Regra pura da avaliação de criticidade do fornecedor (spec 2026-10-18). Sem imports de runtime: o schema zod
 * (src/schemas/nucleo.ts) usa estes valores, e importar `services/terceiros` daqui criaria um ciclo com `helpers`.
 */
import type { TipoTerceiro } from './terceiros';

/** Cinco blocos, cada um com uma resposta. As opções são gravadas como estão; o nível é derivado. */
export const RESPOSTAS_CRITICIDADE = {
  impacto: ['alto', 'medio', 'baixo'],
  exclusividade: ['sem_alternativas', 'poucas_alternativas', 'varias_alternativas'],
  risco_financeiro: ['alto', 'medio', 'baixo'],
  conformidade: ['regulamentado', 'sem_regulamentacao'],
  risco_reputacional: ['alto', 'medio', 'baixo'],
} as const;
export type RespostasCriticidade = { [K in keyof typeof RESPOSTAS_CRITICIDADE]: (typeof RESPOSTAS_CRITICIDADE)[K][number] };
export type NivelCriticidade = 'alto' | 'medio' | 'baixo';

/** Cada resposta vira um nível de risco; o pior critério manda (qualquer Alto → Alto; senão qualquer Médio → Médio). */
const NIVEL_DA_RESPOSTA: Record<keyof RespostasCriticidade, Record<string, NivelCriticidade>> = {
  impacto: { alto: 'alto', medio: 'medio', baixo: 'baixo' },
  exclusividade: { sem_alternativas: 'alto', poucas_alternativas: 'medio', varias_alternativas: 'baixo' },
  risco_financeiro: { alto: 'alto', medio: 'medio', baixo: 'baixo' },
  conformidade: { regulamentado: 'alto', sem_regulamentacao: 'baixo' },
  risco_reputacional: { alto: 'alto', medio: 'medio', baixo: 'baixo' },
};

export function nivelDaCriticidade(r: RespostasCriticidade): NivelCriticidade {
  const niveis = (Object.keys(NIVEL_DA_RESPOSTA) as (keyof RespostasCriticidade)[]).map((k) => NIVEL_DA_RESPOSTA[k][r[k]]);
  if (niveis.includes('alto')) return 'alto';
  return niveis.includes('medio') ? 'medio' : 'baixo';
}

const TIPO_DO_NIVEL: Record<NivelCriticidade, TipoTerceiro> = { alto: 'critico', medio: 'medio', baixo: 'pequeno' };

/** O nível define o tipo; grande_provedor é escolha manual e nunca é trocado aqui. */
export function tipoDaCriticidade(nivel: NivelCriticidade, tipoAtual: TipoTerceiro | null): TipoTerceiro {
  if (tipoAtual === 'grande_provedor') return tipoAtual;
  return TIPO_DO_NIVEL[nivel];
}
