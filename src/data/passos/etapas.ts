import type { EtapaDoCatalogo } from './tipos';

export const ETAPAS: EtapaDoCatalogo[] = [
  { id: 1, nome: 'Mobilização e diagnóstico', resumo: 'Planejamento, entrevistas, escopo e diagnóstico inicial', fases: [0, 1, 2, 3, 4, 5, 6] },
  { id: 2, nome: 'Mapeamento e riscos', resumo: 'Ativos, processos, riscos de segurança e de privacidade e declaração de aplicabilidade', fases: [7, 8, 9, 10, 11, 12, 13] },
  { id: 3, nome: 'Implementação da segurança (ISO 27001)', resumo: 'Documentação e implementação dos controles', fases: [14, 15, 16, 17, 18, 19, 20] },
  { id: 4, nome: 'Implementação da privacidade (ISO 27701)', resumo: 'Programa de privacidade e dados pessoais', fases: [21, 22, 23, 24, 25, 26, 27, 28] },
  { id: 5, nome: 'Operação e auditoria', resumo: 'Treinamento, métricas, auditoria interna e análise crítica', fases: [29, 30, 31, 32, 33] },
  { id: 6, nome: 'Certificação', resumo: 'Melhoria contínua e auditorias de certificação, etapas 1 e 2', fases: [34, 35, 36, 37, 38, 39, 40] },
];
