// Etapa 4 da trilha (fases 21 a 28): privacidade (ISO/IEC 27701 e LGPD). Esqueleto gerado por scripts/passos-esqueleto.mjs; o conteúdo daqui é o do produto.
// Regra desta etapa: nenhum prazo legal é escrito no texto. Quem precisa do prazo é remetido a "Parâmetros legais", onde ele tem fonte e revisão.
import type { Campo, Criterio, FaseDoCatalogo, Passo } from './tipos';

type Extra = Partial<Pick<Campo, 'ajuda' | 'pergunta' | 'semIA'>>;
const longo = (id: string, rotulo: string, exemplo: string, obrigatorio = false, extra: Extra = {}): Campo => ({ id, rotulo, tipo: 'texto_longo', obrigatorio, exemplo, ...extra });
const curto = (id: string, rotulo: string, exemplo: string, obrigatorio = false, extra: Extra = {}): Campo => ({ id, rotulo, tipo: 'texto', obrigatorio, exemplo, ...extra });
const esc = (id: string, rotulo: string, opcoes: string[], obrigatorio = false, extra: Extra = {}): Campo => ({ id, rotulo, tipo: 'escolha', obrigatorio, exemplo: '', opcoes, ...extra });
const data = (id: string, rotulo: string, obrigatorio = false): Campo => ({ id, rotulo, tipo: 'data', obrigatorio, exemplo: '' });
const provas = (id: string, rotulo = 'Onde estão as provas e o que elas mostram?') =>
  longo(id, rotulo, 'Impressão da tela com data, relatório do sistema, ata assinada.', true);

const CP = (rotulo: string): Criterio => ({ tipo: 'campos_preenchidos', rotulo });
const EV = (rotulo: string): Criterio => ({ tipo: 'evidencia_anexada', rotulo });
const RP = (rotulo: string): Criterio => ({ tipo: 'responsavel_e_prazo', rotulo });
const REG = (rotulo: string, entidade: Extract<Criterio, { tipo: 'registro_vinculado' }>['entidade'], minimo = 1): Criterio => ({ tipo: 'registro_vinculado', rotulo, entidade, minimo });
const DOC_APROVADO = (rotulo: string): Criterio => ({ tipo: 'pedido_de_aprovacao', rotulo, pedidoTipo: 'documento', situacao: 'aprovado' });

const SIM_PARCIAL_NAO = ['Sim', 'Parcial', 'Não'];
const DOCUMENTOS = { tela: 'documentos', rotulo: 'Abrir os documentos do sistema' } as const;
const ROPA = { tela: 'ropa', rotulo: 'Abrir os tratamentos (RoPA)' } as const;
const PEDIDOS_TITULAR = { tela: 'titular', rotulo: 'Abrir os pedidos dos titulares' } as const;

export const FASES_ETAPA_4: FaseDoCatalogo[] = [
  {
    numero: 21, etapa: 4, titulo: 'Programa de privacidade', clausula: 'LGPD art. 37, 38 e 41; ISO/IEC 27701',
    objetivo: 'Formalizar o programa de privacidade: política externa, registro das operações de tratamento (RoPA), base legal de cada tratamento e o processo do relatório de impacto (RIPD). Aqui também se decide se o sistema de privacidade será certificado sozinho ou integrado ao de segurança.',
  },
  {
    numero: 22, etapa: 4, titulo: 'Privacidade desde a concepção', clausula: 'LGPD art. 6, III e art. 46, §2',
    objetivo: 'Colocar a privacidade no começo de todo produto ou projeto novo, com um roteiro de perguntas que a equipe responde antes de coletar dado pessoal, e reduzir a coleta ao mínimo necessário.',
  },
  {
    numero: 23, etapa: 4, titulo: 'Direitos dos titulares', clausula: 'LGPD art. 18 e 19',
    objetivo: 'Abrir e divulgar o canal para os titulares exercerem seus direitos, escrever como cada pedido é atendido e medir o tempo de resposta contra os prazos cadastrados em Parâmetros legais.',
  },
  {
    numero: 24, etapa: 4, titulo: 'Consentimento e bases legais', clausula: 'LGPD art. 7 a 11',
    objetivo: 'Registrar a base legal de cada tratamento, guardar a prova do consentimento quando ele for a base e garantir que o titular possa revogá-lo com facilidade. Termos de uso e contratos passam a refletir o tratamento real.',
  },
  {
    numero: 25, etapa: 4, titulo: 'Retenção e descarte', clausula: 'LGPD art. 15 e 16; A.8.10',
    objetivo: 'Definir por quanto tempo cada tipo de dado é guardado e por quê, escrever como o descarte e a anonimização são feitos e guardar a prova de que o dado vencido foi mesmo eliminado.',
  },
  {
    numero: 26, etapa: 4, titulo: 'Transferências e compartilhamento', clausula: 'LGPD art. 33 a 36',
    objetivo: 'Mapear quem recebe dados pessoais e para onde eles vão, inclusive para fora do país. Cada transferência internacional precisa de um mecanismo legal, como as cláusulas-padrão da ANPD, e cada compartilhamento de um acordo escrito.',
  },
  {
    numero: 27, etapa: 4, titulo: 'Fornecedores e operadores', clausula: 'A.5.19 a A.5.22; LGPD art. 39',
    objetivo: 'Avaliar a segurança e a privacidade dos fornecedores que tratam dados, formalizar o acordo de tratamento de dados (DPA) com cada um e acompanhar o desempenho dos mais críticos.',
  },
  {
    numero: 28, etapa: 4, titulo: 'Incidentes de segurança e privacidade', clausula: 'A.5.24 a A.5.28; LGPD art. 48',
    objetivo: 'Preparar a equipe para responder a incidentes: treinamento, simulação com dados pessoais e um fluxo escrito de comunicação à ANPD e aos titulares. O prazo da comunicação fica em Parâmetros legais, não no texto do fluxo.',
  },
];

export const PASSOS_ETAPA_4: Passo[] = [
  // ---------------------------------------------------------------- fase 21
  {
    id: 'p21_1', fase: 21, ordem: 1,
    titulo: 'Aprovar a política de privacidade externa',
    clausula: 'LGPD art. 9; ISO/IEC 27701',
    porQue: 'O titular tem direito a informações claras e de fácil acesso sobre finalidade, forma e duração do tratamento, identificação e contato do controlador, uso compartilhado, responsabilidades dos agentes e direitos (LGPD art. 9). A política externa reúne isso e é aprovada antes de publicada; o auditor compara o texto com o que a empresa de fato faz.',
    campos: [
      curto('controller', 'Quem é o controlador e como falar com o encarregado?', 'Empresa Exemplo Ltda, privacidade@exemplo.com.br.', true, { semIA: true }),
      longo('data', 'Que dados são tratados, para quê e com qual base legal?', 'Nome e e-mail para contato comercial, com base no legítimo interesse.', true),
      longo('sharing', 'Com quem os dados são compartilhados, inclusive fora do país?', 'Provedor de nuvem com servidores no exterior.'),
      longo('rights', 'Como o titular exerce os direitos?', 'Formulário no site ou e-mail do encarregado.', true),
      longo('retention', 'Por quanto tempo os dados são guardados?', 'Dados de clientes durante o contrato e pelo prazo legal de guarda.'),
      esc('sgpi_formalizado', 'O programa de privacidade (SGPI) está formalizado?', SIM_PARCIAL_NAO, false, { pergunta: 'p21_q2' }),
      esc('sgpi_modelo', 'O SGPI será conduzido como sistema autônomo (27701:2025) ou integrado ao SGSI 27001?', ['Autônomo', 'Integrado', 'A definir'], false, { pergunta: 'p21_q5' }),
    ],
    prova: { descricao: 'Política publicada no site, com a versão aprovada guardada.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [DOCUMENTOS],
    concluidoQuando: [
      CP('Controlador, dados, direitos e compartilhamentos escritos'),
      EV('Política publicada e versão aprovada anexadas'),
      DOC_APROVADO('Política de privacidade aprovada no n.360'),
    ],
    gera: 'documento',
  },
  {
    id: 'p21_2', fase: 21, ordem: 2,
    titulo: 'Documentar o registro das operações de tratamento (RoPA)',
    clausula: 'LGPD art. 37; ISO/IEC 27701',
    porQue: 'O controlador e o operador mantêm registro das operações de tratamento de dados pessoais que realizam, especialmente quando baseadas em legítimo interesse (LGPD art. 37). O auditor sorteia um tratamento e confere finalidade, base legal, categorias de dados e prazo de guarda.',
    campos: [
      longo('data_categories', 'Quais categorias de dados pessoais são tratadas?', 'Nome, CPF, e-mail, endereço, dados financeiros.', true),
      longo('purposes', 'Para qual finalidade cada categoria é tratada?', 'Nome e e-mail: contato comercial. CPF e endereço: emissão de nota fiscal.', true),
      longo('legal_bases', 'Qual é a base legal de cada uma?', 'Contato comercial: legítimo interesse. Nota fiscal: obrigação legal.'),
      longo('retention', 'Por quanto tempo cada categoria é guardada?', 'Dados fiscais: pelo prazo legal de guarda; contato comercial: até o titular pedir a saída.'),
      esc('papel_organizacao', 'Qual é o papel da organização no tratamento?', ['Controlador', 'Operador', 'Ambos'], false, { pergunta: 'p21_q1' }),
      esc('ropa_mantido', 'Existe registro das operações (RoPA) mantido e atualizado?', SIM_PARCIAL_NAO, false, { pergunta: 'p21_q3' }),
    ],
    prova: { descricao: 'Registro das operações completo e revisto; no n.privacy, os Tratamentos aprovados.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [ROPA],
    concluidoQuando: [
      CP('Categorias, finalidades e bases legais escritas'),
      EV('Registro das operações anexado'),
      REG('Ao menos um tratamento cadastrado', 'atividades_ropa'),
      { tipo: 'pedido_de_aprovacao', rotulo: 'Tratamentos aprovados no n.360', pedidoTipo: 'tratamento', situacao: 'aprovado' },
    ],
    gera: 'documento',
  },
  {
    id: 'p21_3', fase: 21, ordem: 3,
    titulo: 'Definir a base legal de cada tratamento',
    clausula: 'LGPD art. 7 e 11',
    porQue: 'Cada tratamento se apoia em uma base legal do art. 7 (dado pessoal) ou do art. 11 (dado sensível). Base escolhida errada contamina o tratamento inteiro, e o legítimo interesse pede o teste de balanceamento (LIA). O auditor abre um tratamento e pergunta por que aquela base.',
    campos: [
      longo('mapping', 'Para cada operação, qual é a base legal do art. 7?', 'Folha de pagamento: obrigação legal (art. 7, II).\nE-mail de divulgação: consentimento (art. 7, I).', true),
      longo('sensitive', 'Quais operações tratam dado sensível (art. 11) e em que base?', 'Atestados médicos: cumprimento de obrigação legal (art. 11, II, a).', false, { semIA: true }),
      longo('lia', 'Quais tratamentos usam legítimo interesse e onde está o teste?', 'Prospecção comercial a clientes antigos: LIA arquivada na pasta do tratamento.'),
    ],
    prova: { descricao: 'Registro do tratamento com a base legal e, quando for legítimo interesse, a LIA.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [ROPA, { tela: 'requisitos', rotulo: 'Abrir os requisitos de privacidade' }],
    concluidoQuando: [
      CP('Base legal de cada operação escrita'),
      EV('Registro com as bases legais anexado'),
      REG('Ao menos um tratamento cadastrado', 'atividades_ropa'),
    ],
    gera: 'documento',
  },
  {
    id: 'p21_4', fase: 21, ordem: 4,
    titulo: 'Definir o processo do relatório de impacto (RIPD)',
    clausula: 'LGPD art. 38',
    porQue: 'O processo diz quando o relatório de impacto é feito (critérios de alto risco), quem o elabora, o parecer do encarregado e a revisão quando o tratamento muda. A ANPD pode pedir o relatório ao controlador (LGPD art. 38). O auditor pede o procedimento e um relatório feito com ele.',
    campos: [
      longo('criteria', 'Que situações exigem o relatório de impacto?', 'Dados sensíveis em larga escala.\nMonitoramento sistemático de pessoas.\nTecnologia nova.\nLegítimo interesse com risco alto.', true),
      longo('steps', 'Quais são as etapas e quem responde por cada uma?', 'A área de negócio descreve, o encarregado avalia, Segurança propõe medidas, a diretoria aprova.', true),
      longo('review', 'Quando o relatório é revisto?', 'Mudança na finalidade, nos dados ou no fornecedor do tratamento.'),
      esc('ripd_processo', 'Há processo de relatório de impacto para tratamentos de alto risco?', ['Sim', 'Sob demanda', 'Não'], false, { pergunta: 'p21_q4' }),
    ],
    prova: { descricao: 'Procedimento de RIPD aprovado e um RIPD feito com ele.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'dpia', rotulo: 'Abrir os relatórios de impacto' }],
    concluidoQuando: [
      CP('Critérios, etapas e responsáveis escritos'),
      EV('Procedimento aprovado e um relatório feito anexados'),
      REG('Ao menos um relatório de impacto elaborado', 'ripd'),
    ],
    gera: 'documento',
  },

  // ---------------------------------------------------------------- fase 22
  {
    id: 'p22_1', fase: 22, ordem: 1,
    titulo: 'Integrar a privacidade desde a concepção ao fluxo de produto',
    clausula: 'LGPD art. 46, §2',
    porQue: 'As medidas de segurança e proteção de dados são observadas desde a concepção do produto ou serviço até a sua execução (LGPD art. 46, §2). O auditor procura a etapa de privacidade no fluxo de produto e um projeto que passou por ela.',
    campos: [
      longo('principles', 'Quais princípios de privacidade o fluxo aplica e em que etapa?', 'Coletar só o necessário (desenho). Privacidade como padrão (configuração inicial). Revisão antes da publicação.', true),
      esc('pbd_aplicado', 'A privacidade desde a concepção é aplicada em novos projetos e produtos?', ['Sim', 'Às vezes', 'Não'], false, { pergunta: 'p22_q1' }),
      curto('projeto_exemplo', 'Qual projeto recente passou por essa etapa?', 'Novo aplicativo de agendamento.'),
    ],
    prova: { descricao: 'Fluxo de produto com a etapa de privacidade e um registro de aplicação.', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [],
    concluidoQuando: [
      CP('Princípios e etapa de privacidade no fluxo escritos'),
      RP('Responsável e prazo para incluir a etapa no fluxo'),
    ],
  },
  {
    id: 'p22_2', fase: 22, ordem: 2,
    titulo: 'Aplicar o roteiro de privacidade em novos projetos',
    clausula: 'LGPD art. 46, §2',
    porQue: 'O roteiro é respondido antes de um projeto tratar dado pessoal: finalidade, base legal, minimização, prazo de guarda, segurança, terceiros e necessidade de relatório de impacto. O auditor pede o roteiro preenchido de um projeto recente.',
    campos: [
      longo('checklist', 'Quais perguntas o roteiro traz?', 'Qual a finalidade?\nQual a base legal?\nPrecisamos de cada dado?\nPor quanto tempo guardamos?\nHá terceiros envolvidos?\nPrecisa de relatório de impacto?', true),
      longo('ciclo_desenvolvimento', 'Como a privacidade entra no ciclo de desenvolvimento?', 'O roteiro é obrigatório na abertura do projeto e revisto pelo encarregado antes da publicação.', false, { pergunta: 'p22_q2' }),
    ],
    prova: { descricao: 'Roteiro aprovado e preenchido em projetos recentes.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [DOCUMENTOS],
    concluidoQuando: [
      CP('Perguntas do roteiro e forma de uso escritas'),
      EV('Roteiro aprovado e preenchido em um projeto anexado'),
      DOC_APROVADO('Roteiro aprovado no n.360'),
    ],
    gera: 'documento',
  },
  {
    id: 'p22_3', fase: 22, ordem: 3,
    titulo: 'Reduzir a coleta de dados ao mínimo necessário',
    clausula: 'LGPD art. 6, III',
    porQue: 'O princípio da necessidade limita o tratamento ao mínimo necessário para a finalidade, com dados pertinentes, proporcionais e não excessivos (LGPD art. 6, III). O auditor quer ver campos que foram removidos, prazos reduzidos ou dados pseudonimizados.',
    campos: [
      longo('measures', 'Que medidas de minimização foram aplicadas?', 'Campo de data de nascimento removido do cadastro de contato; guarda de currículos limitada a seis meses; CPF só onde há nota fiscal.', true),
      provas('evidence_desc', 'Que provas mostram o antes e o depois?'),
    ],
    prova: { descricao: 'Formulários ou bases antes e depois, com a justificativa de cada dado mantido.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [ROPA],
    concluidoQuando: [
      CP('Medidas de minimização escritas'),
      EV('Antes e depois dos formulários ou bases anexados'),
      REG('Ao menos um tratamento cadastrado', 'atividades_ropa'),
    ],
  },

  // ---------------------------------------------------------------- fase 23
  {
    id: 'p23_1', fase: 23, ordem: 1,
    titulo: 'Implantar o canal de atendimento aos titulares',
    clausula: 'LGPD art. 18',
    porQue: 'O titular exerce os direitos do art. 18 por requerimento ao controlador. O canal precisa estar publicado, funcionando e com alguém que responda; o auditor pode enviar um pedido de teste.',
    campos: [
      curto('channel', 'Qual é o canal de atendimento?', 'privacidade@empresa.com.br e formulário no site.', true),
      esc('published', 'O canal está publicado na política de privacidade e no site?', ['Sim', 'Não'], true),
      curto('sla', 'Qual prazo de resposta a empresa adota?', 'O prazo cadastrado em Parâmetros legais.'),
      esc('canal_direitos', 'Há canal para o exercício dos direitos dos titulares?', ['Sim', 'Informal', 'Não'], false, { pergunta: 'p23_q1' }),
      provas('evidence_desc', 'Que provas mostram o canal (tela do site, pedido de teste respondido)?'),
    ],
    prova: { descricao: 'Canal publicado na política de privacidade e registros de pedidos atendidos.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [PEDIDOS_TITULAR],
    concluidoQuando: [
      CP('Canal, prazo adotado e publicação informados'),
      EV('Tela do canal e pedido de teste anexados'),
    ],
  },
  {
    id: 'p23_2', fase: 23, ordem: 2,
    titulo: 'Escrever o procedimento de atendimento de direitos',
    clausula: 'LGPD art. 18 e 19',
    porQue: 'O procedimento cobre o recebimento, a confirmação de identidade, a busca dos dados, a resposta e o registro de cada pedido, nos prazos fixados pela lei e pela regulamentação da ANPD (LGPD art. 18 e 19). O auditor acompanha um pedido do início ao fim.',
    campos: [
      longo('rights', 'Quais direitos o procedimento atende?', 'Confirmação e acesso, correção, eliminação, portabilidade, oposição, revogação do consentimento.', true),
      longo('sla', 'Quais prazos de resposta valem?', 'Os prazos cadastrados em Parâmetros legais, por tipo de pedido.'),
      longo('steps', 'Quais são as etapas do atendimento?', 'Recebimento, confirmação de identidade, busca nos sistemas, resposta e registro.', true),
      curto('channel', 'Por qual canal os pedidos chegam?', 'privacidade@empresa.com.br'),
    ],
    prova: { descricao: 'Procedimento aprovado e o registro dos pedidos atendidos; no n.privacy, os Pedidos do titular.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [PEDIDOS_TITULAR, DOCUMENTOS],
    concluidoQuando: [
      CP('Direitos atendidos e etapas do atendimento escritos'),
      EV('Procedimento aprovado anexado'),
      DOC_APROVADO('Procedimento aprovado no n.360'),
    ],
    gera: 'documento',
  },
  {
    id: 'p23_3', fase: 23, ordem: 3,
    titulo: 'Medir o tempo de resposta aos titulares',
    clausula: 'LGPD art. 18 e 19',
    porQue: 'Alguns prazos de resposta são fixados pela lei e pela regulamentação. Cadastre-os em Parâmetros legais e meça o tempo real de atendimento contra eles. O auditor pede o relatório e o que foi feito com o pedido que passou do prazo.',
    campos: [
      longo('sla_detail', 'Que indicadores de tempo de resposta são acompanhados, por tipo de direito?', 'Acesso: tempo médio e pedidos fora do prazo no mês.\nEliminação: tempo médio e pedidos fora do prazo no mês.', true),
      esc('prazos_monitorados', 'Os prazos de atendimento estão definidos e são monitorados?', SIM_PARCIAL_NAO, false, { pergunta: 'p23_q2' }),
      provas('evidence_desc', 'Que relatório mostra os tempos?'),
    ],
    prova: { descricao: 'Relatório periódico de tempos de resposta por tipo de pedido.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [PEDIDOS_TITULAR],
    concluidoQuando: [
      CP('Indicadores de tempo de resposta escritos'),
      EV('Relatório de tempos de resposta anexado'),
    ],
    gera: 'documento',
  },

  // ---------------------------------------------------------------- fase 24
  {
    id: 'p24_1', fase: 24, ordem: 1,
    titulo: 'Registrar as bases legais e o consentimento',
    clausula: 'LGPD art. 7 e 8',
    porQue: 'O consentimento é livre, informado e inequívoco, para finalidades determinadas, e cabe ao controlador provar que o obteve (art. 8, §2). O titular pode revogá-lo a qualquer momento, por procedimento gratuito e facilitado (art. 8, §5). O auditor pede o registro de um consentimento e o caminho da revogação.',
    campos: [
      longo('mechanism', 'Como o consentimento é coletado e registrado?', 'Caixa de marcação no cadastro, aviso de cookies e aceite por e-mail, todos com data e versão do texto.', true),
      esc('granularity', 'O consentimento é separado por finalidade?', ['Sim, por finalidade', 'Parcialmente', 'Consentimento único para tudo'], true),
      longo('revocation', 'Como o titular revoga o consentimento?', 'Link no rodapé do e-mail, painel de preferências ou pedido pelo canal do encarregado.', true),
      esc('bases_mapeadas', 'As bases legais de cada tratamento foram mapeadas?', ['Todas', 'Algumas', 'Não'], false, { pergunta: 'p24_q1' }),
      esc('consent_registrado', 'O consentimento, quando aplicável, é registrado e revogável?', SIM_PARCIAL_NAO, false, { pergunta: 'p24_q2' }),
      provas('evidence_desc', 'Que provas existem (tela de coleta, registros de consentimento)?'),
    ],
    prova: { descricao: 'Telas de coleta e de revogação e os registros de consentimento; no n.privacy, os Consentimentos.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [ROPA, PEDIDOS_TITULAR],
    concluidoQuando: [
      CP('Coleta, separação por finalidade e revogação descritas'),
      EV('Telas de coleta e de revogação anexadas'),
      REG('Ao menos um tratamento cadastrado', 'atividades_ropa'),
    ],
  },
  {
    id: 'p24_2', fase: 24, ordem: 2,
    titulo: 'Ajustar os termos de uso e os contratos',
    clausula: 'LGPD art. 39; A.5.20',
    porQue: 'Os contratos definem os papéis no tratamento: o operador trata os dados segundo as instruções do controlador (LGPD art. 39), e os requisitos de segurança relevantes constam dos acordos com fornecedores (A.5.20). Os termos de uso precisam refletir o tratamento real.',
    campos: [
      longo('docs', 'Quais documentos foram revistos?', 'Termos de uso do site, contratos com clientes, contratos de trabalho, contratos com fornecedores.', true),
      longo('clauses', 'Que cláusulas foram incluídas ou ajustadas?', 'Papéis de controlador e operador, confidencialidade, aviso de incidentes, eliminação dos dados ao fim do contrato.', true),
      longo('pending', 'Quais contratos ainda faltam ajustar?', 'Três fornecedores antigos ainda sem aditivo.'),
    ],
    prova: { descricao: 'Modelos aprovados pelo Jurídico e a lista de contratos ajustados.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [DOCUMENTOS, { tela: 'vendors', rotulo: 'Abrir o cadastro de fornecedores' }],
    concluidoQuando: [
      CP('Documentos revistos e cláusulas ajustadas escritos'),
      EV('Modelos aprovados e lista de contratos ajustados anexados'),
      DOC_APROVADO('Modelo de contrato aprovado no n.360'),
    ],
    gera: 'documento',
  },

  // ---------------------------------------------------------------- fase 25
  {
    id: 'p25_1', fase: 25, ordem: 1,
    titulo: 'Elaborar a tabela de temporalidade de dados',
    clausula: 'LGPD art. 15 e 16',
    porQue: 'Cada tipo de dado tem prazo de guarda e o fundamento dele (obrigação legal, contrato, exercício de direitos). Terminado o tratamento, o dado é eliminado, salvo as hipóteses de conservação do art. 16. O auditor sorteia um tipo de dado e pergunta por que ele ainda existe.',
    campos: [
      longo('table', 'Para cada tipo de dado, qual é o prazo, o fundamento e o método de descarte?', 'Notas fiscais: prazo legal de guarda, obrigação legal, eliminação segura.\nCurrículos: seis meses, consentimento, exclusão do banco.', true),
      esc('politica_retencao', 'Existe política de retenção e descarte de dados?', ['Sim', 'Rascunho', 'Não'], false, { pergunta: 'p25_q1' }),
    ],
    prova: { descricao: 'Tabela de temporalidade aprovada, com o fundamento de cada prazo.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [DOCUMENTOS, ROPA],
    concluidoQuando: [
      CP('Prazo, fundamento e método de descarte por tipo de dado escritos'),
      EV('Tabela de temporalidade aprovada anexada'),
      DOC_APROVADO('Tabela de temporalidade aprovada no n.360'),
    ],
    gera: 'documento',
  },
  {
    id: 'p25_2', fase: 25, ordem: 2,
    titulo: 'Definir a política de descarte e anonimização',
    clausula: 'A.7.14, A.8.10; LGPD art. 12',
    porQue: 'A informação é excluída quando não é mais necessária (A.8.10) e os equipamentos com mídia são verificados antes do descarte ou da reutilização (A.7.14). O dado anonimizado deixa de ser pessoal, salvo quando o processo pode ser revertido com esforços razoáveis (LGPD art. 12).',
    campos: [
      longo('methods', 'Como cada tipo de mídia é descartado?', 'HD: apagamento e destruição física.\nSSD: apagamento criptográfico.\nPapel: fragmentadora.\nNuvem: exclusão com verificação.', true),
      longo('anonymization', 'Quando e como os dados são anonimizados?', 'Dados de clientes inativos são agregados para estatística, sem possibilidade razoável de reidentificação.'),
      longo('descarte_seguro', 'Como o descarte seguro de dados é executado e comprovado?', 'Rotina mensal de exclusão com relatório; descarte de equipamento com termo assinado.', false, { pergunta: 'p25_q2' }),
    ],
    prova: { descricao: 'Política aprovada e certificados ou registros de descarte.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [DOCUMENTOS],
    concluidoQuando: [
      CP('Métodos de descarte e regra de anonimização escritos'),
      EV('Política aprovada e registros de descarte anexados'),
      DOC_APROVADO('Política de descarte aprovada no n.360'),
    ],
    gera: 'documento',
  },
  {
    id: 'p25_3', fase: 25, ordem: 3,
    titulo: 'Comprovar a exclusão dos dados antigos',
    clausula: 'A.8.10',
    porQue: 'A informação guardada em sistemas, dispositivos ou outra mídia é excluída quando não é mais necessária. O auditor pede o registro da última execução da rotina de exclusão e confere uma amostra.',
    campos: [
      esc('mechanism', 'Como a exclusão é feita?', ['Rotina automática (agendada)', 'Manual, com roteiro', 'Não implementado'], true),
      curto('frequency', 'Com que frequência a exclusão roda?', 'Mensal.'),
      longo('data_types', 'Que tipos de dados ela cobre?', 'Registros de acesso, dados de clientes inativos, cópias de segurança vencidas.'),
      provas('evidence_desc', 'Que provas mostram a última execução?'),
    ],
    prova: { descricao: 'Registros de execução das rotinas de exclusão.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [],
    concluidoQuando: [
      CP('Forma, frequência e tipos de dados da exclusão informados'),
      EV('Registro da última execução anexado'),
    ],
  },

  // ---------------------------------------------------------------- fase 26
  {
    id: 'p26_1', fase: 26, ordem: 1,
    titulo: 'Mapear as transferências internacionais',
    clausula: 'LGPD art. 33',
    porQue: 'A transferência internacional só é permitida nas hipóteses do art. 33. Dado hospedado em nuvem fora do país, ou acessado de lá, é transferência: mapeie país, dados, fornecedor e mecanismo. O auditor pede a lista e o mecanismo de cada linha.',
    campos: [
      longo('transfers', 'Que transferências internacionais existem, para onde e com qual mecanismo?', 'Provedor de nuvem, Estados Unidos, dados de clientes, cláusulas-padrão da ANPD.', true, { semIA: true }),
      esc('transferencias', 'Há transferências internacionais de dados?', ['Não', 'Sim, com salvaguardas', 'Sim, sem salvaguardas', 'Não mapeado'], false, { pergunta: 'p26_q1', semIA: true }),
    ],
    prova: { descricao: 'Mapa de transferências com o mecanismo legal de cada uma.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [ROPA],
    concluidoQuando: [
      CP('Transferências e mecanismos escritos'),
      EV('Mapa de transferências anexado'),
    ],
    gera: 'documento',
  },
  {
    id: 'p26_2', fase: 26, ordem: 2,
    titulo: 'Incorporar as cláusulas-padrão contratuais',
    clausula: 'LGPD art. 33 e 35',
    porQue: 'As cláusulas-padrão contratuais aprovadas pela ANPD no regulamento de transferência internacional são um dos mecanismos do art. 33 e entram no contrato sem alteração do texto aprovado. O auditor abre o contrato do provedor e procura as cláusulas.',
    campos: [
      longo('sccs', 'Em quais contratos as cláusulas-padrão foram incorporadas (fornecedor, país, situação)?', 'Provedor de nuvem, Estados Unidos, cláusulas da ANPD incorporadas ao contrato.', true, { semIA: true }),
      longo('salvaguardas', 'Quais salvaguardas (cláusulas-padrão ou outro mecanismo) estão em uso?', 'Cláusulas-padrão da ANPD em dois contratos; um fornecedor ainda sem mecanismo, em negociação.', false, { pergunta: 'p26_q2', semIA: true }),
    ],
    prova: { descricao: 'Contratos ou aditivos com as cláusulas-padrão incorporadas.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [DOCUMENTOS, { tela: 'vendors', rotulo: 'Abrir o cadastro de fornecedores' }],
    concluidoQuando: [
      CP('Contratos com cláusulas-padrão e salvaguardas escritos'),
      EV('Contratos ou aditivos com as cláusulas anexados'),
    ],
    gera: 'documento',
  },
  {
    id: 'p26_3', fase: 26, ordem: 3,
    titulo: 'Formalizar os acordos de compartilhamento de dados',
    clausula: 'LGPD art. 9',
    porQue: 'Todo uso compartilhado de dados tem finalidade, base legal e responsabilidades definidas por escrito, e entra no registro das operações e na informação dada ao titular (art. 9). O auditor escolhe um destinatário e pede o acordo.',
    campos: [
      longo('shares', 'Quem recebe dados, quais, para quê e com qual contrato?', 'Contabilidade externa: dados da folha, obrigações fiscais, obrigação legal, contrato de serviços com cláusula de dados.', true),
    ],
    prova: { descricao: 'Acordos assinados e o registro dos compartilhamentos.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [ROPA, DOCUMENTOS],
    concluidoQuando: [
      CP('Destinatários, dados, finalidades e contratos escritos'),
      EV('Acordos assinados anexados'),
    ],
    gera: 'documento',
  },

  // ---------------------------------------------------------------- fase 27
  {
    id: 'p27_1', fase: 27, ordem: 1,
    titulo: 'Avaliar a segurança dos operadores e terceiros',
    clausula: 'A.5.19, A.5.21; LGPD art. 39',
    porQue: 'Antes de contratar e periodicamente, o operador é avaliado quanto às garantias de segurança que oferece. O método acompanha o risco: certificação para grande provedor, questionário para médio, auditoria para crítico. O auditor pede a avaliação de um fornecedor crítico e sua validade.',
    campos: [
      longo('criteria', 'Que critérios a avaliação usa?', 'Certificações, teste de invasão, nível de serviço, cópia de segurança, histórico de incidentes.', true),
      longo('results', 'Quais fornecedores foram avaliados e com que resultado?', 'Provedor de nuvem: aprovado, com base na certificação ISO 27001.\nFolha de pagamento: aprovado com ressalvas.', true),
      esc('fornecedores_avaliados', 'Os fornecedores críticos passam por avaliação de segurança?', ['Sim', 'Alguns', 'Não'], false, { pergunta: 'p27_q1' }),
    ],
    prova: { descricao: 'Avaliações registradas com resultado e validade; no n.privacy, os Terceiros.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'terceiros', rotulo: 'Abrir os terceiros avaliados' }, { tela: 'vendors', rotulo: 'Abrir o cadastro de fornecedores' }],
    concluidoQuando: [
      CP('Critérios e resultados das avaliações escritos'),
      EV('Avaliações registradas anexadas'),
      REG('Ao menos um fornecedor cadastrado', 'fornecedores'),
    ],
  },
  {
    id: 'p27_2', fase: 27, ordem: 2,
    titulo: 'Incluir as cláusulas de proteção de dados (DPA) nos contratos',
    clausula: 'A.5.20; LGPD art. 39',
    porQue: 'Todo fornecedor que trata dados pessoais em nome da organização tem cláusula ou acordo de tratamento: instruções do controlador, confidencialidade, segurança, subcontratados, incidentes e devolução ou eliminação ao fim do contrato. O auditor cruza a lista de fornecedores com os acordos assinados.',
    campos: [
      curto('total', 'Quantos fornecedores já têm o DPA assinado?', '12 de 15 fornecedores.', true),
      longo('pending', 'Quais ainda não assinaram e qual é o plano?', 'Três fornecedores de pequeno porte; aditivo enviado, retorno até o fim do mês.'),
      esc('template', 'Qual modelo de DPA é usado?', ['Modelo próprio aprovado pelo Jurídico', 'Modelo do fornecedor, revisado', 'Sem modelo padrão']),
      esc('dpa_cobertura', 'Os contratos têm cláusulas de proteção de dados (DPA)?', ['Com todos', 'Com principais', 'Sem DPA'], false, { pergunta: 'p27_q2' }),
      provas('evidence_desc', 'Onde está a lista de DPAs e as cópias assinadas?'),
    ],
    prova: { descricao: 'Lista de fornecedores com o acordo de tratamento assinado.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'vendors', rotulo: 'Abrir o cadastro de fornecedores' }, DOCUMENTOS],
    concluidoQuando: [
      CP('Quantidade de DPAs assinados e pendências informadas'),
      EV('Lista de DPAs e cópias assinadas anexadas'),
      REG('Ao menos um fornecedor cadastrado', 'fornecedores'),
    ],
  },
  {
    id: 'p27_3', fase: 27, ordem: 3,
    titulo: 'Monitorar o desempenho dos fornecedores',
    clausula: 'A.5.22',
    porQue: 'A organização monitora, revê, avalia e gerencia as mudanças nas práticas de segurança dos fornecedores e na entrega dos serviços. O auditor pede a última revisão de um fornecedor crítico e o que foi cobrado dele.',
    campos: [
      longo('how', 'Como os serviços são acompanhados?', 'Relatório mensal de nível de serviço, revisão anual de certificados e reunião trimestral.', true),
      longo('issues', 'Que desvios foram encontrados e o que foi feito?', 'Atraso na correção de vulnerabilidade, cobrado em reunião e corrigido em duas semanas.'),
      data('next', 'Quando é a próxima revisão?'),
    ],
    prova: { descricao: 'Registros de revisão periódica dos fornecedores críticos.', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [{ tela: 'vendors', rotulo: 'Abrir o cadastro de fornecedores' }],
    concluidoQuando: [
      CP('Forma de acompanhamento e desvios escritos'),
      RP('Responsável e data da próxima revisão'),
    ],
  },

  // ---------------------------------------------------------------- fase 28
  {
    id: 'p28_1', fase: 28, ordem: 1,
    titulo: 'Treinar a equipe de resposta a incidentes',
    clausula: 'A.5.24; Cl 7.2',
    porQue: 'Quem tem papel no plano de resposta precisa de competência para exercê-lo (7.2). O treinamento cobre o plano, a classificação de gravidade, a preservação de evidências e a comunicação. O auditor pede a lista de presença e o conteúdo.',
    campos: [
      data('date', 'Quando foi o treinamento?', true),
      longo('participants', 'Quem participou e qual é o papel de cada um na resposta?', 'Nome e papel: coordenadora, encarregado, TI, Jurídico.', true, { semIA: true }),
      longo('content', 'O que o treinamento cobriu?', 'Papéis no plano, classificação de gravidade, preservação de evidências, comunicação à ANPD e aos titulares.', true),
      curto('next', 'Quando será a próxima reciclagem?', 'Anual.'),
    ],
    prova: { descricao: 'Lista de presença e conteúdo do treinamento da equipe de resposta.', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [{ tela: 'training', rotulo: 'Abrir os treinamentos' }],
    concluidoQuando: [
      CP('Data, participantes e conteúdo do treinamento informados'),
      REG('Ao menos um treinamento registrado', 'treinamentos'),
    ],
  },
  {
    id: 'p28_2', fase: 28, ordem: 2,
    titulo: 'Simular um incidente com dados pessoais',
    clausula: 'A.5.24, A.5.26',
    porQue: 'Uma simulação (de mesa ou prática) mostra que o plano funciona: quem decide, quem comunica e em quanto tempo. Em incidente com dados pessoais, inclua a avaliação do risco aos titulares e a decisão sobre comunicar à ANPD. O auditor pede o relatório com tempos, falhas e melhorias.',
    campos: [
      data('date', 'Quando foi a simulação?', true),
      longo('scenario', 'Qual cenário foi simulado?', 'Notebook com dados de clientes perdido; ataque que bloqueia o servidor de arquivos.', true),
      longo('participants', 'Quem participou?', 'Nome e papel de cada participante.', true, { semIA: true }),
      longo('result', 'O que aconteceu e o que a equipe aprendeu?', 'A equipe levou 40 minutos para decidir quem avisava o encarregado; o contato estava desatualizado.', true),
      longo('improvements', 'Que melhorias foram identificadas?', 'Atualizar a lista de contatos e treinar um substituto para o coordenador.'),
      esc('plano_testado', 'Existe plano de resposta a incidentes?', ['Sim, testado', 'Sim, não testado', 'Não'], false, { pergunta: 'p28_q1' }),
    ],
    prova: { descricao: 'Relatório da simulação com tempos, falhas e melhorias.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'capa', rotulo: 'Abrir as ações corretivas' }],
    concluidoQuando: [
      CP('Data, cenário, resultado e participantes da simulação escritos'),
      EV('Relatório da simulação anexado'),
    ],
  },
  {
    id: 'p28_3', fase: 28, ordem: 3,
    titulo: 'Definir o fluxo de comunicação à ANPD e aos titulares',
    clausula: 'LGPD art. 48',
    porQue: 'O incidente que possa acarretar risco ou dano relevante aos titulares é comunicado à ANPD e a eles (LGPD art. 48), no prazo e com o conteúdo fixados no regulamento de comunicação de incidente da ANPD. O prazo fica em Parâmetros legais; o fluxo diz quem avalia, quem decide e quem comunica.',
    campos: [
      longo('process', 'Como a comunicação é feita, passo a passo?', 'Quem avalia o risco aos titulares, quem decide comunicar, quem envia, conteúdo mínimo da comunicação e prazo (o cadastrado em Parâmetros legais).', true),
      curto('decisor', 'Quem decide comunicar?', 'Cargo e substituto, como na nomeação.', true, { semIA: true }),
      esc('fluxo_comunicacao', 'O fluxo de comunicação a titulares e à ANPD está definido?', SIM_PARCIAL_NAO, false, { pergunta: 'p28_q2' }),
    ],
    prova: { descricao: 'Fluxo aprovado e o registro dos incidentes avaliados; no n.privacy, os Incidentes.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'titular', rotulo: 'Abrir os incidentes' }, DOCUMENTOS],
    concluidoQuando: [
      CP('Fluxo de comunicação e decisor escritos'),
      EV('Fluxo aprovado anexado'),
      DOC_APROVADO('Fluxo de comunicação aprovado no n.360'),
    ],
    gera: 'documento',
  },
];
