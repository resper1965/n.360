/**
 * Catálogo de requisitos da LGPD (Lei 13.709/2018).
 *
 * Fonte: texto compilado do Planalto, consultado em 2026-10-10,
 *   https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
 *   (texto revogado, marcado com <strike>, descartado).
 *
 * Regra de seleção: entram os artigos que impõem dever ou condição ao controlador, ao operador ou ao
 * encarregado: arts. 6–12, 14–23 e 33–51. Ficam de fora os arts. 1–5 (objeto, fundamentos, alcance e
 * definições), 13 (estudos em saúde pública por órgão de pesquisa), 24–32 (poder público; o art. 23
 * entra) e 52–65 (sanções, ANPD, CNPD e disposições finais). Filhos: incisos do art. 7 (I–X), do art. 11
 * (I e as alíneas do II), do art. 18 (I–IX) e do art. 33 (I–IX).
 *
 * O título é uma frase curta em palavras próprias, não o texto da lei. Pais vêm antes dos filhos (a FK
 * `pai_id` é checada por linha no seed).
 */

export interface RequisitoLegal { id: string; referencia: string; titulo: string; pai_id: string | null }

export const LGPD_VERSAO = 'Lei 13.709/2018, texto compilado do Planalto, consultado em 2026-10-10';

const art = (n: string, titulo: string): RequisitoLegal => ({ id: `lgpd:art${n}`, referencia: `art. ${n}`, titulo, pai_id: null });
// Filho: `sub` é o inciso em romano minúsculo ("ix") ou inciso-alínea ("ii-a"); a referência sai em "art. 11, II, a".
const filho = (n: string, sub: string, titulo: string): RequisitoLegal => {
  const [inciso, alinea] = sub.split('-');
  return {
    id: `lgpd:art${n}:${sub}`,
    referencia: `art. ${n}, ${inciso.toUpperCase()}${alinea ? `, ${alinea}` : ''}`,
    titulo,
    pai_id: `lgpd:art${n}`,
  };
};

export const LGPD: readonly RequisitoLegal[] = [
  art('6', 'Observar a boa-fé e os princípios do tratamento (finalidade, necessidade, transparência, segurança e outros)'),
  art('7', 'Fundamentar o tratamento de dados pessoais em uma das bases legais'),
  filho('7', 'i', 'Consentimento do titular'),
  filho('7', 'ii', 'Cumprimento de obrigação legal ou regulatória'),
  filho('7', 'iii', 'Execução de políticas públicas pela administração pública'),
  filho('7', 'iv', 'Estudos por órgão de pesquisa'),
  filho('7', 'v', 'Execução de contrato ou de procedimentos preliminares a pedido do titular'),
  filho('7', 'vi', 'Exercício regular de direitos em processo judicial, administrativo ou arbitral'),
  filho('7', 'vii', 'Proteção da vida ou da incolumidade física do titular ou de terceiro'),
  filho('7', 'viii', 'Tutela da saúde por profissionais, serviços de saúde ou autoridade sanitária'),
  filho('7', 'ix', 'Legítimo interesse do controlador ou de terceiro'),
  filho('7', 'x', 'Proteção do crédito'),
  art('8', 'Obter consentimento livre, informado e inequívoco, demonstrável e revogável'),
  art('9', 'Dar ao titular acesso facilitado às informações sobre o tratamento'),
  art('10', 'Limitar o legítimo interesse a finalidades legítimas, com transparência e só os dados necessários'),
  art('11', 'Tratar dados pessoais sensíveis só nas hipóteses legais específicas'),
  filho('11', 'i', 'Consentimento específico e destacado do titular ou responsável legal'),
  filho('11', 'ii-a', 'Cumprimento de obrigação legal ou regulatória'),
  filho('11', 'ii-b', 'Execução de políticas públicas pela administração pública'),
  filho('11', 'ii-c', 'Estudos por órgão de pesquisa'),
  filho('11', 'ii-d', 'Exercício regular de direitos, inclusive em contrato e em processo'),
  filho('11', 'ii-e', 'Proteção da vida ou da incolumidade física do titular ou de terceiro'),
  filho('11', 'ii-f', 'Tutela da saúde por profissionais, serviços de saúde ou autoridade sanitária'),
  filho('11', 'ii-g', 'Prevenção à fraude e segurança do titular em identificação e autenticação'),
  art('12', 'Tratar como pessoal o dado anonimizado reversível ou usado para formar perfil comportamental'),
  art('14', 'Tratar dados de crianças e adolescentes no seu melhor interesse, com consentimento parental quando exigido'),
  art('15', 'Encerrar o tratamento nas hipóteses de término previstas em lei'),
  art('16', 'Eliminar os dados após o término do tratamento, salvo as hipóteses de conservação'),
  art('17', 'Assegurar ao titular a titularidade dos seus dados e os direitos fundamentais'),
  art('18', 'Atender aos direitos do titular mediante requisição'),
  filho('18', 'i', 'Confirmação da existência de tratamento'),
  filho('18', 'ii', 'Acesso aos dados'),
  filho('18', 'iii', 'Correção de dados incompletos, inexatos ou desatualizados'),
  filho('18', 'iv', 'Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou irregulares'),
  filho('18', 'v', 'Portabilidade dos dados a outro fornecedor'),
  filho('18', 'vi', 'Eliminação dos dados tratados com consentimento'),
  filho('18', 'vii', 'Informação sobre o uso compartilhado com entidades públicas e privadas'),
  filho('18', 'viii', 'Informação sobre a possibilidade de não consentir e suas consequências'),
  filho('18', 'ix', 'Revogação do consentimento'),
  art('19', 'Confirmar a existência de tratamento ou dar acesso aos dados nos prazos e formatos legais'),
  art('20', 'Permitir a revisão de decisões tomadas unicamente com base em tratamento automatizado'),
  art('21', 'Não usar contra o titular dados referentes ao exercício regular de seus direitos'),
  art('22', 'Respeitar a defesa dos direitos do titular em juízo, individual ou coletiva'),
  art('23', 'No poder público, tratar para finalidade pública e informar as hipóteses de tratamento'),
  art('33', 'Transferir dados pessoais ao exterior só nas hipóteses legais'),
  filho('33', 'i', 'País ou organismo internacional com grau de proteção adequado'),
  filho('33', 'ii', 'Garantias do controlador: cláusulas específicas ou padrão, normas corporativas globais, selos'),
  filho('33', 'iii', 'Cooperação jurídica internacional entre órgãos públicos'),
  filho('33', 'iv', 'Proteção da vida ou da incolumidade física do titular ou de terceiro'),
  filho('33', 'v', 'Autorização da autoridade nacional'),
  filho('33', 'vi', 'Compromisso assumido em acordo de cooperação internacional'),
  filho('33', 'vii', 'Execução de política pública ou atribuição legal do serviço público'),
  filho('33', 'viii', 'Consentimento específico e destacado do titular para a transferência'),
  filho('33', 'ix', 'Hipóteses dos incisos II, V e VI do art. 7'),
  art('34', 'Considerar os critérios de avaliação do nível de proteção do país de destino'),
  art('35', 'Usar cláusulas-padrão e garantias aprovadas pela ANPD na transferência internacional'),
  art('36', 'Comunicar à ANPD alterações nas garantias apresentadas para a transferência'),
  art('37', 'Manter registro das operações de tratamento'),
  art('38', 'Elaborar relatório de impacto à proteção de dados pessoais quando determinado'),
  art('39', 'Operador: tratar segundo as instruções do controlador'),
  art('40', 'Observar os padrões de interoperabilidade, portabilidade e guarda definidos pela ANPD'),
  art('41', 'Indicar encarregado e divulgar sua identidade e contato'),
  art('42', 'Reparar o dano causado por tratamento em violação à legislação'),
  art('43', 'Poder provar as hipóteses que afastam a responsabilidade pelo dano'),
  art('44', 'Evitar tratamento irregular: cumprir a lei e dar a segurança que o titular pode esperar'),
  art('45', 'Responder por violação de direitos do titular nas relações de consumo conforme o CDC'),
  art('46', 'Adotar medidas de segurança técnicas e administrativas desde a concepção'),
  art('47', 'Garantir a segurança da informação em todas as fases do tratamento, mesmo após o término'),
  art('48', 'Comunicar incidente à ANPD e ao titular'),
  art('49', 'Estruturar os sistemas para atender aos requisitos de segurança e aos princípios'),
  art('50', 'Formular regras de boas práticas e governança e manter programa de governança em privacidade'),
  art('51', 'Considerar os padrões técnicos estimulados pela ANPD para o controle dos dados pelo titular'),
];
