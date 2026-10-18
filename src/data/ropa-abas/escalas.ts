// Cinco níveis. Literais do legado (captura 38): "Ocorrência provável" e "Impacto com efeitos relevantes para titulares" (nota 4 de cada).
// proposta: o dono confirma antes do merge do PR1 (os outros quatro rótulos de cada escala, no tom do legado; decisão de 16/10: aceitas)
export const PROBABILIDADE = [
  { nota: 1, rotulo: 'Ocorrência muito improvável' }, { nota: 2, rotulo: 'Ocorrência improvável' }, { nota: 3, rotulo: 'Ocorrência possível' },
  { nota: 4, rotulo: 'Ocorrência provável' }, { nota: 5, rotulo: 'Ocorrência muito provável' },
] as const;
export const IMPACTO = [
  { nota: 1, rotulo: 'Impacto desprezível para titulares' }, { nota: 2, rotulo: 'Impacto com efeitos leves para titulares' }, { nota: 3, rotulo: 'Impacto com efeitos moderados para titulares' },
  { nota: 4, rotulo: 'Impacto com efeitos relevantes para titulares' }, { nota: 5, rotulo: 'Impacto com efeitos graves para titulares' },
] as const;
export const NIVEL_ROTULO = { Low: 'Baixo', Medium: 'Médio', High: 'Alto', Critical: 'Crítico' } as const;
export const ESTRATEGIA_ROTULO = { Accept: 'Aceitar', Mitigate: 'Mitigar', Avoid: 'Evitar', Transfer: 'Transferir' } as const;
