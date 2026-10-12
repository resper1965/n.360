/**
 * Catálogo de requisitos das resoluções do Conselho Diretor da ANPD.
 *
 * Fontes: texto publicado no Diário Oficial da União (in.gov.br), consultado em 2026-10-10:
 *   - Res. CD/ANPD 2/2022 (agentes de tratamento de pequeno porte):
 *     https://www.in.gov.br/en/web/dou/-/resolucao-cd/anpd-n-2-de-27-de-janeiro-de-2022-376562019
 *   - Res. CD/ANPD 15/2024 (comunicação de incidente de segurança):
 *     https://www.in.gov.br/en/web/dou/-/resolucao-cd/anpd-n-15-de-24-de-abril-de-2024-556243024
 *   - Res. CD/ANPD 18/2024 (encarregado):
 *     https://www.in.gov.br/en/web/dou/-/resolucao-cd/anpd-n-18-de-16-de-julho-de-2024-572632074
 *   - Res. CD/ANPD 19/2024 (transferência internacional de dados):
 *     https://www.in.gov.br/en/web/dou/-/resolucao-cd/anpd-n-19-de-23-de-agosto-de-2024-580095396
 *
 * O número do artigo é o do REGULAMENTO anexo a cada resolução, não o dos artigos de aprovação da
 * própria resolução. Duas exceções do corpo das resoluções ficam registradas só aqui: a Res. 15/2024,
 * art. 2º, deu nova redação ao art. 14, II, do regulamento da Res. 2/2022 (o título abaixo já considera);
 * a Res. 19/2024, art. 2º, parágrafo único, deu 12 meses da publicação para incorporar as cláusulas-padrão.
 *
 * Regra de seleção: entram os artigos que impõem dever ou condição ao agente de tratamento ou ao
 * encarregado. Ficam de fora objeto, definições, competências e procedimentos internos da ANPD,
 * faculdades sem dever correspondente e o texto das cláusulas-padrão (Anexo II da Res. 19/2024).
 *   - 2/2022: entram 3–7, 9 e 11–15; fora 1–2 (objeto, definições), 8 (faculdade de se organizar em
 *     entidades), 10 (promessa de regulamentação) e 16 (poder da ANPD).
 *   - 15/2024: entram 4–10; fora 1–3 (objeto, objetivos, definições) e 11–24 (processo na ANPD).
 *   - 18/2024: entram 3–5, 7–11, 13, 15, 16 e 18–21; fora 1–2 (objeto, definições), 6 (encarregado do
 *     operador é facultativo), 12 e 14 (quem pode ser encarregado) e 17 (limite de responsabilidade).
 *   - 19/2024: entram 4, 9, 16, 17, 21–23, 26–28, 32 e 33; fora 1–3 (objeto, diretrizes, definições),
 *     5–8 (caracterização e alcance da lei), 10–14 e 18–20 (decisão de adequação e equivalência, atos da
 *     ANPD), 15 (natureza das cláusulas), 24 (repete o 22), 25 (natureza das normas corporativas),
 *     29–31 (instrução do requerimento e publicação pela ANPD) e 34 (recurso).
 *
 * O título é uma frase curta em palavras próprias, não o texto da resolução. Pais vêm antes dos filhos
 * (a FK `pai_id` é checada por linha no seed).
 */

import type { RequisitoLegal } from './lgpd';

export const ANPD_VERSAO = 'Res. CD/ANPD 2/2022, 15/2024, 18/2024 e 19/2024, texto do DOU consultado em 2026-10-10';

// `res` é "15-2024"; a referência sai em "Res. CD/ANPD 15/2024".
const ref = (res: string) => `Res. CD/ANPD ${res.replace('-', '/')}`;
const resolucao = (res: string, titulo: string): RequisitoLegal => ({ id: `anpd:res${res}`, referencia: ref(res), titulo, pai_id: null });
const art = (res: string, n: string, titulo: string): RequisitoLegal => ({
  id: `anpd:res${res}:art${n}`,
  referencia: `${ref(res)}, art. ${n}`,
  titulo,
  pai_id: `anpd:res${res}`,
});

export const ANPD: readonly RequisitoLegal[] = [
  resolucao('2-2022', 'Regulamento da LGPD para agentes de tratamento de pequeno porte'),
  art('2-2022', '3', 'Perder o regime diferenciado com tratamento de alto risco, receita acima do limite ou grupo econômico'),
  art('2-2022', '4', 'Avaliar se o tratamento é de alto risco (um critério geral e um específico)'),
  art('2-2022', '5', 'Comprovar o enquadramento como pequeno porte em até 15 dias, quando a ANPD pedir'),
  art('2-2022', '6', 'Cumprir o restante da LGPD, bases legais, princípios e direitos do titular, mesmo com a dispensa'),
  art('2-2022', '7', 'Informar sobre o tratamento e atender os titulares por meio eletrônico, impresso ou equivalente'),
  art('2-2022', '9', 'Manter o registro das operações de tratamento, admitida a forma simplificada'),
  art('2-2022', '11', 'Sem encarregado indicado, manter canal de comunicação com o titular'),
  art('2-2022', '12', 'Adotar medidas de segurança essenciais, proporcionais ao risco e à realidade do agente'),
  art('2-2022', '13', 'Política simplificada de segurança da informação, proporcional ao porte'),
  art('2-2022', '14', 'Prazo em dobro para titulares, comunicação de incidente, declaração completa e pedidos da ANPD'),
  art('2-2022', '15', 'Fornecer a declaração simplificada ao titular em até 15 dias do requerimento'),

  resolucao('15-2024', 'Regulamento de Comunicação de Incidente de Segurança'),
  art('15-2024', '4', 'Comunicar à ANPD e ao titular o incidente que possa acarretar risco ou dano relevante'),
  art('15-2024', '5', 'Avaliar o risco ou dano relevante pelos critérios do regulamento (dados sensíveis, larga escala etc.)'),
  art('15-2024', '6', 'Comunicar a ANPD em 3 dias úteis, por formulário, com o conteúdo mínimo e via encarregado ou representante'),
  art('15-2024', '7', 'Pedir à ANPD, com fundamento, sigilo das informações protegidas por lei'),
  art('15-2024', '8', 'Enviar à ANPD, quando pedido, informações adicionais, registro das operações, RIPD e relatório do incidente'),
  art('15-2024', '9', 'Comunicar o titular em 3 dias úteis, em linguagem simples, de forma direta, e juntar a declaração'),
  art('15-2024', '10', 'Registrar todo incidente, mesmo o não comunicado, com conteúdo mínimo, por pelo menos 5 anos'),

  resolucao('18-2024', 'Regulamento sobre a atuação do encarregado'),
  art('18-2024', '3', 'Indicar o encarregado por ato formal escrito, datado e assinado, com atividades e forma de atuação'),
  art('18-2024', '4', 'Designar formalmente substituto do encarregado para ausências, impedimentos e vacância'),
  art('18-2024', '5', 'Pessoa jurídica de direito público: indicar encarregado e publicar a indicação no diário oficial'),
  art('18-2024', '7', 'Definir as qualificações profissionais exigidas do encarregado'),
  art('18-2024', '8', 'Divulgar e manter atualizadas a identidade e o contato do encarregado'),
  art('18-2024', '9', 'Publicar identidade e contato do encarregado em destaque no sítio eletrônico'),
  art('18-2024', '10', 'Prover meios, autonomia técnica e acesso à alta direção ao encarregado, e ouvi-lo nas decisões'),
  art('18-2024', '11', 'O agente de tratamento responde pela conformidade do tratamento'),
  art('18-2024', '13', 'Encarregado capaz de se comunicar com titulares e ANPD com clareza, em português'),
  art('18-2024', '15', 'Atividades do encarregado: reclamações dos titulares, comunicações da ANPD e orientação interna'),
  art('18-2024', '16', 'Encarregado assiste em incidentes, registro, RIPD, segurança, contratos, transferências e governança'),
  art('18-2024', '18', 'Encarregado atua com ética, integridade e autonomia técnica, sem conflito de interesse'),
  art('18-2024', '19', 'Acumular funções ou agentes só sem prejuízo das atribuições e sem conflito de interesse'),
  art('18-2024', '20', 'Encarregado declara ao agente qualquer situação de possível conflito de interesse'),
  art('18-2024', '21', 'Evitar conflito de interesse do encarregado: não indicar, mitigar ou substituir'),

  resolucao('19-2024', 'Regulamento de Transferência Internacional de Dados e cláusulas-padrão contratuais'),
  art('19-2024', '4', 'Verificar se há transferência internacional, se a LGPD se aplica e se há base e mecanismo válidos'),
  art('19-2024', '9', 'Transferir só com finalidade informada, base legal, mecanismo válido e no mínimo necessário'),
  art('19-2024', '16', 'Adotar as cláusulas-padrão na íntegra e sem alteração, em contrato entre exportador e importador'),
  art('19-2024', '17', 'Entregar as cláusulas ao titular em 15 dias e publicar aviso em linguagem simples sobre a transferência'),
  art('19-2024', '21', 'Cláusulas específicas só com circunstância excepcional comprovada e sujeição à LGPD e à ANPD'),
  art('19-2024', '22', 'Submeter à aprovação da ANPD a íntegra das cláusulas, incluindo as específicas'),
  art('19-2024', '23', 'Usar a redação das cláusulas-padrão sempre que possível e justificar cada cláusula específica'),
  art('19-2024', '26', 'Normas corporativas globais vinculadas a programa de governança em privacidade'),
  art('19-2024', '27', 'Conteúdo mínimo das normas corporativas globais'),
  art('19-2024', '28', 'Submeter as normas corporativas globais à aprovação da ANPD'),
  art('19-2024', '32', 'Dar transparência ao titular das cláusulas específicas ou normas corporativas globais'),
  art('19-2024', '33', 'Alterar cláusulas específicas ou normas corporativas globais só com aprovação prévia da ANPD'),
];
