/**
 * Lista de REFERÊNCIA de riscos de privacidade (LGPD), para o campo "motivo" da Análise de Risco da atividade.
 * É só sugestão no datalist: NÃO é semeada no catálogo do projeto (`catalogo_itens`) — respeita a decisão do dono de 16/10
 * (catálogos nascem vazios). Vira motivo do projeto só quando a pessoa grava um risco com esse texto. Cada item traz uma
 * descrição padrão que preenche a Descrição ao escolher o motivo (a pessoa edita).
 */
export const RISCOS_PRIVACIDADE: ReadonlyArray<{ nome: string; descricao_padrao: string }> = [
  { nome: 'Acesso não autorizado a dados pessoais', descricao_padrao: 'Pessoas sem necessidade ou sem autorização acessam os dados pessoais tratados na atividade.' },
  { nome: 'Vazamento de dados pessoais', descricao_padrao: 'Incidente de segurança expõe dados pessoais a quem não deveria ter acesso, dentro ou fora da organização.' },
  { nome: 'Desvio de finalidade', descricao_padrao: 'Os dados são usados para finalidade diferente da que foi informada ao titular e registrada no tratamento.' },
  { nome: 'Coleta excessiva de dados', descricao_padrao: 'São coletados mais dados do que o necessário para a finalidade (violação do princípio da minimização).' },
  { nome: 'Retenção além do necessário', descricao_padrao: 'Os dados são guardados por mais tempo do que a finalidade e a lei exigem, sem eliminação ou anonimização.' },
  { nome: 'Compartilhamento indevido com terceiros', descricao_padrao: 'Os dados são compartilhados com operadores ou terceiros sem base legal, contrato ou garantias adequadas.' },
  { nome: 'Tratamento sem base legal adequada', descricao_padrao: 'A atividade trata dados sem uma base legal da LGPD que a sustente, ou com base inadequada.' },
  { nome: 'Consentimento ausente ou inválido', descricao_padrao: 'Quando o tratamento depende de consentimento, ele não foi colhido, é genérico ou não pode ser comprovado.' },
  { nome: 'Transferência internacional sem salvaguarda', descricao_padrao: 'Dados vão para fora do país sem as garantias exigidas pela LGPD para a transferência internacional.' },
  { nome: 'Dados desatualizados ou incorretos', descricao_padrao: 'A falta de qualidade dos dados leva a decisões erradas ou a prejuízo ao titular.' },
  { nome: 'Dificuldade no atendimento aos direitos do titular', descricao_padrao: 'A organização não consegue localizar, corrigir, eliminar ou portar os dados no prazo quando o titular pede.' },
  { nome: 'Reidentificação de dados anonimizados', descricao_padrao: 'Dados tidos como anonimizados ou pseudonimizados podem ser reassociados a uma pessoa.' },
  { nome: 'Tratamento de dados sensíveis sem proteção adequada', descricao_padrao: 'Dados sensíveis (saúde, biometria, origem, religião etc.) são tratados sem as salvaguardas reforçadas que exigem.' },
  { nome: 'Tratamento de dados de crianças e adolescentes', descricao_padrao: 'Dados de crianças ou adolescentes são tratados sem o melhor interesse e sem o consentimento específico dos responsáveis.' },
  { nome: 'Decisão automatizada sem transparência', descricao_padrao: 'Decisões automatizadas afetam o titular sem informação clara nem possibilidade de revisão.' },
  { nome: 'Falta de transparência ao titular', descricao_padrao: 'O titular não recebe informação clara sobre como e por que seus dados são tratados (aviso de privacidade insuficiente).' },
  { nome: 'Operador sem contrato de tratamento (DPA)', descricao_padrao: 'Um operador trata dados em nome da organização sem contrato que defina obrigações e responsabilidades.' },
  { nome: 'Perda de disponibilidade ou integridade dos dados', descricao_padrao: 'Falha, ataque ou erro torna os dados indisponíveis ou os corrompe, afetando o titular e a atividade.' },
];
