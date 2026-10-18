// Contrato da ficha em abas (spec 2026-10-16). Ordem e rótulos são os do legado: NÃO traduzir nem reordenar.
export const ABAS = [
    { id: 'escopo', rotulo: 'Escopo' },
    { id: 'tratamento', rotulo: 'Tratamento de Dados' },
    { id: 'agentes', rotulo: 'Agentes de Tratamento' },
    { id: 'medidas', rotulo: 'Medidas de Segurança' },
    { id: 'base_juridica', rotulo: 'Base Jurídica' },
    { id: 'gaps', rotulo: 'Controle de GAPs' },
    { id: 'impacto', rotulo: 'Teste de Impacto' },
    { id: 'riscos', rotulo: 'Riscos' },
    { id: 'logs', rotulo: 'Logs ROPA' },
];
export const ETAPAS = [
    { id: 'coleta', rotulo: 'Coleta' },
    { id: 'uso', rotulo: 'Uso ou Processamento' },
    { id: 'compartilhamento_interno', rotulo: 'Compartilhamento Interno' },
    { id: 'compartilhamento_externo', rotulo: 'Compartilhamento Externo' },
    { id: 'armazenamento', rotulo: 'Armazenamento' },
    { id: 'eliminacao', rotulo: 'Eliminação' },
];
export const SITUACOES = { rascunho: 'Rascunho', em_revisao: 'Em Revisão', aprovada: 'Aprovada', cancelada: 'Cancelada' };
export const ACOES = [
    ['conferir_aprovar', 'Conferir / Aprovar', 'Conclui a análise e pede a aprovação.'],
    ['alterar_para_em_revisao', 'Alterar para "Em revisão"', 'Ideal para analisar pendências do ROPA.'],
    ['imprimir', 'Imprimir atividade', 'Gerar uma versão para impressão.'],
    ['reabrir', 'Reabrir atividade', 'Retorna a atividade para o fluxo de análise.'],
    ['reativar', 'Reativar atividade', 'Retorna o fluxo atual da atividade.'],
    ['cancelar', 'Cancelar atividade', 'Interrompe o fluxo atual da atividade.'],
    ['excluir', 'Excluir atividade', 'Remove definitivamente o cadastro.'],
];
