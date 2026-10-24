/**
 * Catálogo de temas de política (spec 2026-10-23). É SUGESTÃO: a ligação real é a que o consultor confirma em
 * `documento_requisitos`. Controles em código do Anexo A da ISO/IEC 27001:2022.
 */
export type TemaPolitica = { codigo: string; titulo: string; psi?: true; controles: string[] };

export const ESQUELETO_PADRAO = ['Objetivo', 'Escopo', 'Referências', 'Papéis e responsabilidades', 'Diretrizes', 'Exceções', 'Conformidade e sanções', 'Revisão', 'Controle do documento'];
export const ESQUELETO_PSI = ['Propósito', 'Compromissos da direção', 'Objetivos de segurança da informação e privacidade', 'Papéis e responsabilidades', 'Políticas específicas', 'Revisão', 'Controle do documento'];
export const esqueletoDo = (tema: { psi?: true }) => (tema.psi ? ESQUELETO_PSI : ESQUELETO_PADRAO);
export const requisitoDoControle = (codigo: string) => `iso27001:2022:${codigo}`;

export const TEMAS_POLITICA: TemaPolitica[] = [
  { codigo: 'POL-PSI', titulo: 'Política de Segurança da Informação', psi: true, controles: ['A.5.1', 'A.5.2', 'A.5.4', 'A.5.36'] },
  { codigo: 'POL-IAM', titulo: 'Política de Controle de Acesso e Identidade', controles: ['A.5.15', 'A.5.16', 'A.5.17', 'A.5.18', 'A.8.2', 'A.8.3', 'A.8.5'] },
  { codigo: 'POL-AST', titulo: 'Política de Gestão de Ativos e Classificação da Informação', controles: ['A.5.9', 'A.5.10', 'A.5.11', 'A.5.12', 'A.5.13', 'A.7.10', 'A.8.10'] },
  { codigo: 'POL-CRY', titulo: 'Política de Criptografia e Gestão de Chaves', controles: ['A.8.24'] },
  { codigo: 'POL-SUP', titulo: 'Política de Segurança no Relacionamento com Fornecedores', controles: ['A.5.19', 'A.5.20', 'A.5.21', 'A.5.22', 'A.5.23'] },
  { codigo: 'POL-IRP', titulo: 'Política de Gestão de Incidentes de Segurança da Informação', controles: ['A.5.24', 'A.5.25', 'A.5.26', 'A.5.27', 'A.5.28', 'A.6.8'] },
  { codigo: 'POL-BCM', titulo: 'Política de Continuidade de Negócios e Resiliência', controles: ['A.5.29', 'A.5.30', 'A.8.13', 'A.8.14'] },
  { codigo: 'POL-SDL', titulo: 'Política de Desenvolvimento Seguro', controles: ['A.8.25', 'A.8.26', 'A.8.27', 'A.8.28', 'A.8.29', 'A.8.30', 'A.8.31', 'A.8.32', 'A.8.33'] },
  { codigo: 'POL-HR', titulo: 'Política de Segurança da Informação em Pessoas', controles: ['A.6.1', 'A.6.2', 'A.6.3', 'A.6.4', 'A.6.5', 'A.6.6'] },
  { codigo: 'POL-RMT', titulo: 'Política de Trabalho Remoto e Dispositivos', controles: ['A.6.7', 'A.7.9', 'A.8.1'] },
  { codigo: 'POL-NET', titulo: 'Política de Segurança de Redes', controles: ['A.8.20', 'A.8.21', 'A.8.22', 'A.8.23'] },
  { codigo: 'POL-OPS', titulo: 'Política de Segurança nas Operações', controles: ['A.8.6', 'A.8.7', 'A.8.8', 'A.8.9', 'A.8.15', 'A.8.16', 'A.8.17', 'A.8.19', 'A.8.32'] },
  { codigo: 'POL-FIS', titulo: 'Política de Segurança Física e do Ambiente', controles: ['A.7.1', 'A.7.2', 'A.7.3', 'A.7.4', 'A.7.5', 'A.7.6', 'A.7.7', 'A.7.8', 'A.7.11', 'A.7.12', 'A.7.13', 'A.7.14'] },
  { codigo: 'POL-COM', titulo: 'Política de Conformidade Legal e Proteção de Registros', controles: ['A.5.31', 'A.5.32', 'A.5.33', 'A.5.34', 'A.5.35'] },
  { codigo: 'POL-CLD', titulo: 'Política de Uso de Serviços em Nuvem', controles: ['A.5.23'] },
  { codigo: 'POL-LOG', titulo: 'Política de Registro e Monitoramento', controles: ['A.8.15', 'A.8.16', 'A.8.17'] },
];
