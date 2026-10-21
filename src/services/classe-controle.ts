/**
 * Situação do controle numa palavra, a mesma em todo o produto (Painel, Prontidão, gap-analysis, Bancada, readiness, coherence,
 * medidas do RoPA e cobertura da LGPD). `Compliant` é a grafia legada de `Implemented`.
 */
export type ClasseControle = 'na' | 'feito' | 'andamento' | 'falta';
export const STATUS_FEITO = ['APPROVED', 'IMPLEMENTED', 'COMPLETED', 'CONFORME', 'COMPLIANT'] as const;
export const STATUS_FALTA = ['MISSING', 'NOT STARTED', 'NOT_STARTED'] as const;

const lista = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(', ');

/** `coluna` é sempre um nome fixo do código (ex.: `c.status`), nunca dado da requisição. */
export function sqlClasseControle(coluna: string): string {
  return `CASE WHEN ${coluna} = 'Not Applicable' THEN 'na'
  WHEN upper(${coluna}) IN (${lista(STATUS_FEITO)}) THEN 'feito'
  WHEN ${coluna} IS NULL OR trim(${coluna}) = '' OR upper(${coluna}) IN (${lista(STATUS_FALTA)}) THEN 'falta' ELSE 'andamento' END`;
}

export const SQL_CLASSE_CONTROLE = sqlClasseControle('status');

export function classeDoControle(status: string | null | undefined): ClasseControle {
  if (status === 'Not Applicable') return 'na';
  const s = (status ?? '').trim().toUpperCase();
  if ((STATUS_FEITO as readonly string[]).includes(s)) return 'feito';
  if (!s || (STATUS_FALTA as readonly string[]).includes(s)) return 'falta';
  return 'andamento';
}
