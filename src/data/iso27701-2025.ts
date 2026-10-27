// Catálogo de controles do Anexo A da ISO/IEC 27701:2025 (adotada no Brasil como
// ABNT NBR ISO/IEC 27701:2026). O Anexo A da edição 2025 reorganizou os controles
// de privacidade em tabelas por papel:
//   - Tabela A.1 — controles específicos do CONTROLADOR de DP (31 controles);
//   - Tabela A.2 — controles específicos do OPERADOR de DP (18 controles);
//   - Tabela A.3 — controles de SEGURANÇA DA INFORMAÇÃO, comuns ao controlador e ao operador (29 controles, A.3.3 a A.3.31).
// A numeração é de 4 níveis (ex.: A.1.2.6), diferente da edição 2019.
//
// IMPORTANTE (licença): os TÍTULOS abaixo são redigidos em palavras próprias, a
// partir do PROPÓSITO de cada controle — NÃO reproduzem o texto normativo da
// ABNT/ISO (conteúdo licenciado). Servem só como rótulo de trabalho no SGPI; o
// texto oficial deve ser consultado na norma adquirida.
//
// `code` é o identificador do controle (estrutural, citável); `title` é o rótulo
// próprio. O id de linha em compliance_controls é gerado (genId) — o code vai no
// título, como já é o padrão dos controles 27001 do projeto.

export interface Iso27701Control {
  code: string;
  title: string;
}

// Tabela A.1 — Controlador de DP (31).
export const ISO_27701_2025_CONTROLLER: readonly Iso27701Control[] = [
  { code: 'A.1.2.2', title: 'Identificação e documentação da finalidade do tratamento' },
  { code: 'A.1.2.3', title: 'Identificação das bases legais do tratamento' },
  { code: 'A.1.2.4', title: 'Definição de quando e como obter consentimento' },
  { code: 'A.1.2.5', title: 'Obtenção e registro do consentimento' },
  { code: 'A.1.2.6', title: 'Avaliação de impacto à privacidade (DPIA)' },
  { code: 'A.1.2.7', title: 'Contratos com operadores de DP' },
  { code: 'A.1.2.8', title: 'Acordo de controladoria conjunta' },
  { code: 'A.1.2.9', title: 'Registros das atividades de tratamento' },
  { code: 'A.1.3.2', title: 'Determinação e cumprimento de obrigações com os titulares' },
  { code: 'A.1.3.3', title: 'Definição das informações a prestar aos titulares' },
  { code: 'A.1.3.4', title: 'Prestação de informações aos titulares' },
  { code: 'A.1.3.5', title: 'Mecanismo para alterar ou retirar o consentimento' },
  { code: 'A.1.3.6', title: 'Mecanismo para oposição ao tratamento' },
  { code: 'A.1.3.7', title: 'Atendimento a acesso, correção e exclusão' },
  { code: 'A.1.3.8', title: 'Repasse de correções e exclusões a terceiros' },
  { code: 'A.1.3.9', title: 'Fornecimento de cópia dos DP tratados' },
  { code: 'A.1.3.10', title: 'Processo de atendimento a solicitações dos titulares' },
  { code: 'A.1.3.11', title: 'Governança de decisões automatizadas' },
  { code: 'A.1.4.2', title: 'Limitação da coleta ao necessário' },
  { code: 'A.1.4.3', title: 'Limitação do tratamento ao necessário' },
  { code: 'A.1.4.4', title: 'Exatidão e qualidade dos DP' },
  { code: 'A.1.4.5', title: 'Definição de objetivos de minimização de DP' },
  { code: 'A.1.4.6', title: 'Desidentificação ou eliminação ao fim do tratamento' },
  { code: 'A.1.4.7', title: 'Proteção de arquivos temporários' },
  { code: 'A.1.4.8', title: 'Política de retenção de DP' },
  { code: 'A.1.4.9', title: 'Descarte seguro de DP' },
  { code: 'A.1.4.10', title: 'Controles de transmissão de DP' },
  { code: 'A.1.5.2', title: 'Bases para transferência internacional de DP' },
  { code: 'A.1.5.3', title: 'Registro de países e organizações de destino' },
  { code: 'A.1.5.4', title: 'Registros de transferências de DP' },
  { code: 'A.1.5.5', title: 'Registros de divulgação de DP a terceiros' },
] as const;

// Tabela A.2 — Operador de DP (18).
export const ISO_27701_2025_PROCESSOR: readonly Iso27701Control[] = [
  { code: 'A.2.2.2', title: 'Acordo com o cliente controlador' },
  { code: 'A.2.2.3', title: 'Restrição ao tratamento aos propósitos do cliente' },
  { code: 'A.2.2.4', title: 'Vedação de uso para marketing e publicidade' },
  { code: 'A.2.2.5', title: 'Alerta sobre instruções que violem a lei' },
  { code: 'A.2.2.6', title: 'Suporte às obrigações do cliente com os titulares' },
  { code: 'A.2.2.7', title: 'Registros das atividades de tratamento' },
  { code: 'A.2.3.2', title: 'Apoio ao cumprimento de obrigações com os titulares' },
  { code: 'A.2.4.2', title: 'Proteção de arquivos temporários' },
  { code: 'A.2.4.3', title: 'Devolução, transferência ou descarte de DP' },
  { code: 'A.2.4.4', title: 'Controles de transmissão de DP' },
  { code: 'A.2.5.2', title: 'Fundamento para transferência internacional de DP' },
  { code: 'A.2.5.3', title: 'Registro de países e organizações de destino' },
  { code: 'A.2.5.4', title: 'Registros de divulgação de DP a terceiros' },
  { code: 'A.2.5.5', title: 'Notificação de solicitações de divulgação de DP' },
  { code: 'A.2.5.6', title: 'Divulgações de DP legalmente obrigatórias' },
  { code: 'A.2.5.7', title: 'Transparência sobre subcontratados' },
  { code: 'A.2.5.8', title: 'Autorização para uso de subcontratados' },
  { code: 'A.2.5.9', title: 'Notificação de troca de subcontratado' },
] as const;

// Tabela A.3 — Segurança da informação, comum ao controlador e ao operador de DP (29).
// O comentário de cada linha é o controle do Anexo A da 27001:2022 de mesmo tema, pareado pelo TÍTULO (confira na 27002:2022 antes de citar o par).
export const ISO_27701_2025_SECURITY: readonly Iso27701Control[] = [
  { code: 'A.3.3', title: 'Políticas de segurança da informação' }, // 27001:2022 A.5.1
  { code: 'A.3.4', title: 'Papéis e responsabilidades pela segurança' }, // 27001:2022 A.5.2
  { code: 'A.3.5', title: 'Classificação da informação' }, // 27001:2022 A.5.12
  { code: 'A.3.6', title: 'Rotulagem da informação' }, // 27001:2022 A.5.13
  { code: 'A.3.7', title: 'Transferência de informação' }, // 27001:2022 A.5.14
  { code: 'A.3.8', title: 'Gestão de identidade' }, // 27001:2022 A.5.16
  { code: 'A.3.9', title: 'Direitos de acesso' }, // 27001:2022 A.5.18
  { code: 'A.3.10', title: 'Segurança da informação nos contratos de fornecedores' }, // 27001:2022 A.5.20
  { code: 'A.3.11', title: 'Planejamento e preparação para incidentes' }, // 27001:2022 A.5.24
  { code: 'A.3.12', title: 'Resposta a incidentes de segurança' }, // 27001:2022 A.5.26
  { code: 'A.3.13', title: 'Requisitos legais, regulatórios e contratuais' }, // 27001:2022 A.5.31
  { code: 'A.3.14', title: 'Proteção de registros' }, // 27001:2022 A.5.33
  { code: 'A.3.15', title: 'Análise crítica independente da segurança' }, // 27001:2022 A.5.35
  { code: 'A.3.16', title: 'Conformidade com políticas, regras e normas de segurança' }, // 27001:2022 A.5.36
  { code: 'A.3.17', title: 'Conscientização, educação e treinamento' }, // 27001:2022 A.6.3
  { code: 'A.3.18', title: 'Acordos de confidencialidade' }, // 27001:2022 A.6.6
  { code: 'A.3.19', title: 'Mesa limpa e tela limpa' }, // 27001:2022 A.7.7
  { code: 'A.3.20', title: 'Mídias de armazenamento' }, // 27001:2022 A.7.10
  { code: 'A.3.21', title: 'Descarte seguro ou reutilização de equipamentos' }, // 27001:2022 A.7.14
  { code: 'A.3.22', title: 'Dispositivos dos usuários (endpoint)' }, // 27001:2022 A.8.1
  { code: 'A.3.23', title: 'Autenticação segura' }, // 27001:2022 A.8.5
  { code: 'A.3.24', title: 'Backup das informações' }, // 27001:2022 A.8.13
  { code: 'A.3.25', title: 'Registro de eventos (log)' }, // 27001:2022 A.8.15
  { code: 'A.3.26', title: 'Uso de criptografia' }, // 27001:2022 A.8.24
  { code: 'A.3.27', title: 'Ciclo de vida de desenvolvimento seguro' }, // 27001:2022 A.8.25
  { code: 'A.3.28', title: 'Requisitos de segurança da aplicação' }, // 27001:2022 A.8.26
  { code: 'A.3.29', title: 'Arquitetura e engenharia de sistemas seguros' }, // 27001:2022 A.8.27
  { code: 'A.3.30', title: 'Desenvolvimento terceirizado' }, // 27001:2022 A.8.30
  { code: 'A.3.31', title: 'Informações de teste' }, // 27001:2022 A.8.33
] as const;

export const ISO_27701_2025_STANDARD = 'ISO 27701:2025';

// Papéis (projects.org_role é texto livre no nISO). Normaliza para decidir quais
// tabelas semear: Controlador → A.1; Operador → A.2; ambos → A.1 + A.2. A A.3 (segurança) vale para os dois papéis e vai sempre.
export function controlsForRole(orgRole: string | null | undefined): Iso27701Control[] {
  const r = (orgRole || '').toLowerCase();
  const isController = /control/.test(r) || /both|amb/.test(r) || r.trim() === '';
  const isProcessor = /process|operad/.test(r) || /both|amb/.test(r);
  const out: Iso27701Control[] = [];
  if (isController) out.push(...ISO_27701_2025_CONTROLLER);
  if (isProcessor) out.push(...ISO_27701_2025_PROCESSOR);
  out.push(...ISO_27701_2025_SECURITY);
  return out;
}
