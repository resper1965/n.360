/**
 * Perguntas do questionário do RIPD (migration 0083). Tudo o que é texto de pergunta mora aqui: trocar a redação é editar este arquivo.
 * As respostas ficam em `dpia_respostas`, fora do hash da aprovação. O id é estável (é a chave gravada): nunca renomeie um id em uso.
 *
 * Fonte: o guia gravado do legado (docs/superpowers/specs/2026-10-27-guia-legado-ripd-lia-perguntas.md): 4 + 29 + 5 perguntas, com o
 * texto do legado. No legado toda resposta é caixa de texto, então todas são `texto`; o tipo `escolha` fica no código, sem uso. A ordem do
 * array é a numeração mostrada na tela (por aba). Texto cortado no guia do legado seria marcado com `// texto parcial no guia do legado: confirmar o final`; hoje nenhum está.
 */
export const ABAS_RIPD = [
  { id: 'teste_impacto', rotulo: 'Teste de Impacto' },
  { id: 'conformidade', rotulo: 'Conformidade' },
  { id: 'armazenamento', rotulo: 'Armazenamento' },
] as const;
export type AbaRipd = (typeof ABAS_RIPD)[number]['id'];

export const ESCOLHAS_RIPD = ['sim', 'nao', 'nao_sei'] as const;
export type EscolhaRipd = (typeof ESCOLHAS_RIPD)[number];

/** `sugestao` diz de onde a tela pode propor "A atividade já indica": nunca é gravada. */
export type PerguntaRipd = { id: string; aba: AbaRipd; texto: string; tipo: 'texto' | 'escolha'; sugestao?: 'operadores' | 'armazenamento' | 'volume' | 'sensiveis'; bloco?: 'base_legal' };

export const PERGUNTAS_RIPD: readonly PerguntaRipd[] = [
  // Teste de Impacto (4)
  { id: 'resultado_esperado', aba: 'teste_impacto', texto: 'Resultado Esperado', tipo: 'texto' },
  { id: 'beneficios', aba: 'teste_impacto', texto: 'Benefícios', tipo: 'texto' },
  { id: 'terceiros_operadores', aba: 'teste_impacto', texto: 'Existem terceiros responsáveis (Operadores) por parte das etapas de tratamento?', tipo: 'texto', sugestao: 'operadores' },
  { id: 'documentos_escopo_agentes', aba: 'teste_impacto', texto: 'Existem documentos que definam o escopo de atuação destes agentes de tratamento?', tipo: 'texto' },
  // Conformidade (29; no legado, 3 páginas: 1 a 6, 7 a 16 e 17 a 29)
  { id: 'problema_anterior', aba: 'conformidade', texto: 'Já foi identificado algum problema anterior com o cumprimento das normas de proteção de dados pessoais? Por exemplo, houve algum incidente de segurança devidamente registrado, inclusive com a elaboração de documento descrevendo o que ocorreu, quais medidas foram tomadas e como evitar que o incidente volte a acontecer?', tipo: 'texto' },
  { id: 'o_que_muda', aba: 'conformidade', texto: 'Se aplicável, em que medida os dados pessoais serão tratados de forma distinta após a implementação do projeto / processo / sistema, comparado com a realidade atualmente?', tipo: 'texto' },
  { id: 'por_que_coletados', aba: 'conformidade', texto: 'Por que os dados pessoais estão sendo coletados?', tipo: 'texto' },
  { id: 'quantos_titulares', aba: 'conformidade', texto: 'Quantos titulares, aproximadamente, este projeto / processo / sistema irá afetar? Favor responder com porcentagem, por exemplo: "todos os clientes da empresa, 20% dos clientes, 2% dos indivíduos há mais de seis meses", etc.', tipo: 'texto', sugestao: 'volume' },
  { id: 'quem_aprova_mudancas', aba: 'conformidade', texto: 'Quem aprova alterações no projeto / processo / sistema no futuro?', tipo: 'texto' },
  { id: 'partes_envolvidas', aba: 'conformidade', texto: 'Todas as partes interessadas, isto é, os titulares dos dados, estiveram envolvidas nas discussões sobre como seus dados pessoais serão utilizados? Para responder essa questão não é necessário indicar as partes interessadas no início do documento, apenas destacar aqui caso relevante – por exemplo, "os correntistas foram informados na política do app", etc.', tipo: 'texto' },
  { id: 'dados_sensiveis', aba: 'conformidade', texto: 'Haverá tratamento de dados pessoais sensíveis? Se sim, quais?', tipo: 'texto', sugestao: 'sensiveis' },
  { id: 'dados_necessarios', aba: 'conformidade', texto: 'Os dados tratados são os estritamente necessários para a finalidade de tratamento?', tipo: 'texto' },
  { id: 'origem_dados', aba: 'conformidade', texto: 'Qual a origem dos dados pessoais? Informar se os dados são coletados diretamente do titular ou se é coletado de alguma base de dado interna da Cia. (Liste/nomeie qualquer sistema interno associado a esse tratamento e explique por que existe essa associação.)', tipo: 'texto' },
  { id: 'como_coletados', aba: 'conformidade', texto: 'Como os dados pessoais são coletados/transferidos da fonte? Ex: Documento Físico, formulário WEB, documento digitalizado, entre outros.', tipo: 'texto' },
  { id: 'finalidade_diferente', aba: 'conformidade', texto: 'Existe uma diferença entre a(s) finalidade(s) para a(s) qual(is) os dados foram coletados e a(s) finalidade(s) para a(s) qual(is) eles estão sendo usados?', tipo: 'texto' },
  { id: 'dados_de_terceiros', aba: 'conformidade', texto: 'Algum dado pessoal foi obtido por meio de terceiro(s)? Em caso afirmativo, nomeie-o(s) e indique qual a relação do terceiro com a Cia. (Indique qual o dado pessoal e para qual finalidade está sendo usado.)', tipo: 'texto' },
  { id: 'quem_acessa', aba: 'conformidade', texto: 'Quem terá acesso aos dados pessoais envolvidos no processo? Por exemplo, quais departamentos/áreas da Cia terão acesso a quais dados pessoais especificamente?', tipo: 'texto' },
  { id: 'acesso_do_titular', aba: 'conformidade', texto: 'Os dados pessoais serão acessados por seus titulares?', tipo: 'texto' },
  { id: 'contratos_compartilhamento', aba: 'conformidade', texto: 'Caso os dados pessoais estejam sendo compartilhados externamente, quais contratos/acordos garantem a segurança dos dados pessoais?', tipo: 'texto' },
  { id: 'transferencia_internacional', aba: 'conformidade', texto: 'Há transferência internacional dos dados pessoais? Se sim, fundamentada em qual dos mecanismos de transferência presentes na LGPD ou determinados pela ANPD?', tipo: 'texto' },
  { id: 'auditorias_acesso', aba: 'conformidade', texto: 'Há auditorias em curso ou planejadas para registrar quem acessa os dados pessoais, quando etc.?', tipo: 'texto' },
  { id: 'disponibilidade', aba: 'conformidade', texto: 'Quais medidas estão sendo adotadas para garantir a disponibilidade de acesso aos dados pessoais apenas àqueles com legitimidade para acessá-los?', tipo: 'texto' },
  { id: 'disponibilizacao_ao_titular', aba: 'conformidade', texto: 'Existe algum meio ou processo que permita a disponibilização dos dados pessoais aos seus titulares?', tipo: 'texto' },
  { id: 'onde_formato_ciclo', aba: 'conformidade', texto: 'Onde e em que formato os dados pessoais serão mantidos durante todos os estágios em seu ciclo de vida? Por exemplo, os dados podem ser acessados e lidos livremente, ou há mecanismos de criptografia ou outro tipo de restrição para evitar que terceiros possam ter acesso aos dados?', tipo: 'texto' },
  { id: 'atualizacao_precisao', aba: 'conformidade', texto: 'Os dados pessoais serão mantidos atualizados? Como eles serão verificados quanto à precisão?', tipo: 'texto' },
  { id: 'tempo_de_retencao', aba: 'conformidade', texto: 'Por quanto tempo os dados serão mantidos?', tipo: 'texto' },
  { id: 'recuperacao_incidente', aba: 'conformidade', texto: 'Existe algum procedimento para recuperar dados pessoais em casos de Incidentes de Segurança?', tipo: 'texto' },
  { id: 'controles_seguranca', aba: 'conformidade', texto: 'Quais são os controles de segurança em vigor para os dados pessoais? (ajuda; no legado a resposta é uma lista de opções com "Outras (especifique)")', tipo: 'texto' },
  { id: 'decisao_automatizada', aba: 'conformidade', texto: 'As decisões que envolvem dados pessoais são tomadas exclusivamente por meios automáticos? Por exemplo, não há uma avaliação feita por funcionários da Cia, mas apenas pelos sistemas para tomada de decisões sobre concessão de crédito ou outras atividades? Em caso afirmativo, forneça detalhes.', tipo: 'texto' },
  { id: 'risco_ao_titular', aba: 'conformidade', texto: 'Qual é o risco potencial sobre os titulares caso haja divulgação não autorizada ou uso indevido dos dados pessoais?', tipo: 'texto' },
  { id: 'consentimento', aba: 'conformidade', texto: 'O titular dos dados pessoais forneceu consentimento para o tratamento de seus dados para uma ou mais finalidades? Se sim, o consentimento é livre, informado e inequívoco?', tipo: 'texto' },
  { id: 'retirada_consentimento', aba: 'conformidade', texto: 'O titular será capaz de retirar o consentimento?', tipo: 'texto' },
  { id: 'bases_legais', aba: 'conformidade', texto: 'Qual ou quais as Bases Legais para este tratamento de dados? Justifique: Se o tratamento dos dados pessoais é necessário para atender aos legítimos interesses da Cia ou de terceiros, favor preencher a seção 5 "Avaliação de Legítimo Interesse".', tipo: 'texto', bloco: 'base_legal' },
  // Armazenamento (5)
  { id: 'onde_ficam', aba: 'armazenamento', texto: 'Onde são armazenados os dados?', tipo: 'texto', sugestao: 'armazenamento' },
  { id: 'territorio_nacional', aba: 'armazenamento', texto: 'Os dados são armazenados em território nacional?', tipo: 'texto' },
  { id: 'backup_exterior', aba: 'armazenamento', texto: 'Há backup dos dados fora do território nacional?', tipo: 'texto' },
  { id: 'armazenamento_fisico', aba: 'armazenamento', texto: 'Há armazenamento físico de dados?', tipo: 'texto' },
  { id: 'mecanismos_seguranca', aba: 'armazenamento', texto: 'Quais mecanismos são utilizados para garantir a segurança do armazenamento dos dados pessoais? (ajuda; no legado a resposta é uma lista de opções com "Outros (especifique)")', tipo: 'texto' },
];

export const PERGUNTA_RIPD_POR_ID = new Map(PERGUNTAS_RIPD.map((p) => [p.id, p]));
/** Teto do corpo do PUT e do texto de cada resposta (o CHECK do banco repete o do texto). */
export const MAX_RESPOSTAS_POR_PUT = 40;
export const MAX_TEXTO_RESPOSTA = 2000;
