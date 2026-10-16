import type { GDPR_BASES } from '../../schemas/ropa-abas';
export const BASES_GDPR: Record<(typeof GDPR_BASES)[number], { rotulo: string; texto: string }> = {
  consentimento: { rotulo: 'Consentimento', texto: 'A obtenção do consentimento do titular para que seus dados pessoais sejam processados. Deve haver uma ação deliberada por parte do titular dos dados para aderir ou dar seu consentimento.' },
  contrato: { rotulo: 'Contrato', texto: 'A firmação de um contrato com um indivíduo para o fornecimento de bens ou serviços solicitados por eles. Nesse caso, os dados são processados para cumprir o contrato.' },
  interesses_legitimos: { rotulo: 'Interesses legítimos', texto: 'Uma razão genuína e legítima obtida por sua organização para processar os dados cujo objetivo não prejudica os direitos do titular dos dados.' },
  interesses_vitais: { rotulo: 'Interesses vitais', texto: 'A necessidade do processamento dos dados para proteger a vida de alguém ou em uma situação de emergência.' },
  obrigacao_legal: { rotulo: 'Obrigação legal', texto: 'A necessidade de processamento dos dados para estar em conformidade com a lei.' },
  tarefa_publica: { rotulo: 'Tarefa pública', texto: 'A necessidade de executar tarefas de interesse público, geralmente como um órgão governamental, partido político, etc.' },
};
