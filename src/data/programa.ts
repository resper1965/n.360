// Onda 4 (spec 2026-11-18, decisões 5, 6 e 9): as cinco etapas comuns a todo módulo e a fronteira do n.iso por fase do catálogo.
// Catálogo estático, rótulos em português; nada aqui lê banco.

export const ETAPAS_COMUNS = [
  { id: 'comecar', rotulo: 'Começar' },
  { id: 'levantar', rotulo: 'Levantar' },
  { id: 'avaliar', rotulo: 'Avaliar' },
  { id: 'tratar', rotulo: 'Tratar' },
  { id: 'operar', rotulo: 'Operar' },
] as const;
export type EtapaComum = (typeof ETAPAS_COMUNS)[number]['id'];

/** Decisão 6: as fases do catálogo de passos (0 a 40) por etapa, intervalos fechados. Mudar aqui muda a régua do n.iso inteira. */
export const FASES_DO_ISO: Readonly<Record<EtapaComum, readonly [number, number]>> = {
  comecar: [0, 6], levantar: [7, 8], avaliar: [9, 10], tratar: [11, 28], operar: [29, 40],
};

export function etapaDaFase(fase: number): EtapaComum | null {
  for (const { id } of ETAPAS_COMUNS) {
    const [de, ate] = FASES_DO_ISO[id];
    if (fase >= de && fase <= ate) return id;
  }
  return null;
}
