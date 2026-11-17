// Vocabulário único de situação de requisito (spec onda 2, decisões 2 e 3). DERIVADO: nada aqui regrava `compliance_controls.status`.
import { classeDoControle } from './classe-controle';

export type SituacaoUnica = 'atende' | 'parcial' | 'nao_atende' | 'nao_se_aplica' | 'nao_avaliado';

/** V1 (`compliance_controls.status`, texto livre) → vocabulário único. `Planned` vale `nao_atende` (não cobre na LGPD hoje). */
export function situacaoUnica(status: string | null | undefined): SituacaoUnica {
  const classe = classeDoControle(status);
  if (classe === 'na') return 'nao_se_aplica';
  if (classe === 'feito') return 'atende';
  if (classe === 'falta') return 'nao_avaliado';
  if ((status ?? '').trim().toUpperCase() === 'PLANNED') return 'nao_atende';
  return 'parcial';
}

/** Item técnico do n.ot (derivado do inventário, D2): o inventário nunca prova que atende; `derivado` guarda o valor de origem. */
export function situacaoDoItemTecnico(s: 'nao_atende' | 'evidencia_no_inventario' | 'sem_evidencia' | null): { situacao: SituacaoUnica; derivado: string | null } {
  if (s === 'nao_atende') return { situacao: 'nao_atende', derivado: s };
  return { situacao: 'nao_avaliado', derivado: s };
}
