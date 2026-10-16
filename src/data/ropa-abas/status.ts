// Literais do legado: medida "Ativo" (captura 24); gap "Pendente" (padrão) e "Concluído" (capturas 30 e 33).
// proposta: o dono confirma antes do merge do PR1 (medida "Em implantação" e "Planejado"; gap "Em andamento"; decisão de 16/10: aceitas)
export const ROTULO_MEDIDA_STATUS = { ativa: 'Ativo', em_implantacao: 'Em implantação', planejada: 'Planejado' } as const;
export const ROTULO_GAP_STATUS = { Open: 'Pendente', 'In Progress': 'Em andamento', Closed: 'Concluído' } as const;

// Aba Escopo, "processamento automatizado". Literal do legado (captura 154552): "Não, não são submetidos."
// proposta: o dono confirma antes do merge do PR1 (as outras duas opções; spec seção 15, decisão de 16/10: aceitas)
export const PROCESSAMENTO_AUTOMATIZADO = {
  nao: 'Não, não são submetidos.',
  apoio: 'Sim, como apoio à decisão humana.',
  decisao: 'Sim, com decisão automatizada.',
} as const;
