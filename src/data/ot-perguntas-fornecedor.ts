/**
 * Perguntas de fornecedor de OT (onda 3, decisão 7). Texto nosso, curto e genérico: entram como perguntas do PROJETO no questionário
 * comum de terceiros, visível a quem não tem o n.ot; por isso não citam norma, site, papel ou dado de fornecedor algum.
 */
export const PERGUNTAS_OT_FORNECEDOR: ReadonlyArray<{ tema: string; texto: string }> = [
  { tema: 'Acesso remoto', texto: 'O acesso remoto da empresa aos nossos ambientes passa por VPN com segundo fator de autenticação?' },
  { tema: 'Contas de integração', texto: 'As contas usadas pela empresa na integração são separadas por cliente e por pessoa, sem compartilhamento de senha?' },
  { tema: 'Atualizações', texto: 'A empresa divulga e aplica correções de segurança dos seus produtos e avisa o cliente sobre cada uma?' },
  { tema: 'Incidentes', texto: 'A empresa tem plano de resposta a incidentes de segurança e avisa o cliente em prazo acordado?' },
];
