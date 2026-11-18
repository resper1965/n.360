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

/** Lista FECHADA do que decide se um passo da trilha do n.privacy está feito: cada chave tem a sua regra em `criterioPrivacy`. */
export const CRITERIOS_PRIVACY = ['algum_cadastro', 'encarregado', 'inventario_completo', 'bases_e_riscos', 'terceiros_em_dia', 'prazos_e_atrasos', 'cobertura_lgpd'] as const;
export type CriterioPrivacy = (typeof CRITERIOS_PRIVACY)[number];
export type PassoPrivacy = { id: string; ordem: number; rotulo: string; etapa: EtapaComum; criterio: CriterioPrivacy; tela: string; acao: string };

/**
 * As 7 etapas da skill `implantacao-privacy` (decisão 2: só derivadas, sem marca manual). `rotulo` é o mesmo da tabela da skill
 * (`test/agente-skills.test.ts` cobra). Ordem na trilha = ordem das etapas comuns; `ordem` é o número da skill.
 */
export const PASSOS_PRIVACY: readonly PassoPrivacy[] = [
  { id: 'partida', ordem: 0, rotulo: 'Partida', etapa: 'comecar', criterio: 'algum_cadastro', tela: 'importacao', acao: 'Trazer o que já existe' },
  { id: 'encarregado', ordem: 1, rotulo: 'Encarregado', etapa: 'comecar', criterio: 'encarregado', tela: 'encarregado', acao: 'Indicar o encarregado' },
  { id: 'inventario', ordem: 2, rotulo: 'Inventário', etapa: 'levantar', criterio: 'inventario_completo', tela: 'ropa', acao: 'Abrir os tratamentos' },
  { id: 'bases_e_riscos', ordem: 3, rotulo: 'Bases e riscos', etapa: 'avaliar', criterio: 'bases_e_riscos', tela: 'ropa', acao: 'Fazer LIA e RIPD' },
  { id: 'terceiros', ordem: 4, rotulo: 'Terceiros', etapa: 'tratar', criterio: 'terceiros_em_dia', tela: 'terceiros', acao: 'Avaliar os fornecedores' },
  { id: 'documentos', ordem: 6, rotulo: 'Documentos e cobertura', etapa: 'tratar', criterio: 'cobertura_lgpd', tela: 'requisitos', acao: 'Ver as lacunas' },
  { id: 'titular', ordem: 5, rotulo: 'Titular e incidentes', etapa: 'operar', criterio: 'prazos_e_atrasos', tela: 'titular', acao: 'Ver os pedidos' },
];
