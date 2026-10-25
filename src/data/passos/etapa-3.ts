// Etapa 3 da trilha (fases 14 a 20): documentação e controles do Anexo A. Esqueleto gerado por scripts/passos-esqueleto.mjs; o conteúdo daqui é o do produto.
import type { Campo, Criterio, FaseDoCatalogo, Passo } from './tipos';

type Extra = Partial<Pick<Campo, 'ajuda' | 'pergunta' | 'semIA'>>;
const longo = (id: string, rotulo: string, exemplo: string, obrigatorio = false, extra: Extra = {}): Campo => ({ id, rotulo, tipo: 'texto_longo', obrigatorio, exemplo, ...extra });
const curto = (id: string, rotulo: string, exemplo: string, obrigatorio = false, extra: Extra = {}): Campo => ({ id, rotulo, tipo: 'texto', obrigatorio, exemplo, ...extra });
const esc = (id: string, rotulo: string, opcoes: string[], obrigatorio = false, extra: Extra = {}): Campo => ({ id, rotulo, tipo: 'escolha', obrigatorio, exemplo: '', opcoes, ...extra });
const multi = (id: string, rotulo: string, opcoes: string[], obrigatorio = false, extra: Extra = {}): Campo => ({ id, rotulo, tipo: 'multipla', obrigatorio, exemplo: '', opcoes, ...extra });
const data = (id: string, rotulo: string, obrigatorio = false): Campo => ({ id, rotulo, tipo: 'data', obrigatorio, exemplo: '' });
const provas = (id: string, rotulo = 'Onde estão as provas e o que elas mostram?') =>
  longo(id, rotulo, 'Relatório da ferramenta com data, impressão da configuração, ata assinada.', true);

const CP = (rotulo: string): Criterio => ({ tipo: 'campos_preenchidos', rotulo });
const EV = (rotulo: string): Criterio => ({ tipo: 'evidencia_anexada', rotulo });
const RP = (rotulo: string): Criterio => ({ tipo: 'responsavel_e_prazo', rotulo });
const REG = (rotulo: string, entidade: Extract<Criterio, { tipo: 'registro_vinculado' }>['entidade'], minimo = 1): Criterio => ({ tipo: 'registro_vinculado', rotulo, entidade, minimo });
const DOC_APROVADO = (rotulo: string): Criterio => ({ tipo: 'pedido_de_aprovacao', rotulo, pedidoTipo: 'documento', situacao: 'aprovado' });

const SIM_PARCIAL_NAO = ['Sim', 'Parcial', 'Não'];
const CONTROLES = { tela: 'controls', rotulo: 'Abrir os controles do Anexo A' } as const;
const DOCUMENTOS = { tela: 'documentos', rotulo: 'Abrir os documentos do sistema' } as const;

export const FASES_ETAPA_3: FaseDoCatalogo[] = [
  {
    numero: 14, etapa: 3, titulo: 'Organizar a documentação do sistema', clausula: '7.5',
    objetivo: 'Definir como os documentos do sistema são nomeados, versionados, aprovados e listados. Ao fim, existe um manual e uma lista mestra, e qualquer documento mostra quem o aprovou e em que versão.',
  },
  {
    numero: 15, etapa: 3, titulo: 'Controles organizacionais (A.5)', clausula: 'A.5',
    objetivo: 'Escrever e aprovar as políticas e regras da organização: política geral, uso aceitável, transferência de informação, fornecedores e resposta a incidentes. Cada uma vira um documento aprovado pela direção.',
  },
  {
    numero: 16, etapa: 3, titulo: 'Controles de pessoas (A.6)', clausula: 'A.6',
    objetivo: 'Cuidar do ciclo da pessoa na organização: verificação antes da contratação, termo de confidencialidade e desligamento seguro, com acessos retirados no mesmo dia.',
  },
  {
    numero: 17, etapa: 3, titulo: 'Controles físicos (A.7)', clausula: 'A.7',
    objetivo: 'Definir os perímetros físicos, o controle de entrada de pessoas e visitantes, a vigilância por câmeras, a proteção contra incêndio e falta de energia e o descarte seguro de equipamentos e mídias.',
  },
  {
    numero: 18, etapa: 3, titulo: 'Controles tecnológicos (A.8)', clausula: 'A.8',
    objetivo: 'Comprovar na prática o acesso controlado, a criptografia, a proteção dos equipamentos, as correções de segurança, os registros de eventos e a segurança da rede, com a configuração real à mostra.',
  },
  {
    numero: 19, etapa: 3, titulo: 'Desenvolvimento seguro', clausula: 'A.8.25',
    objetivo: 'Escrever a política de desenvolvimento seguro e fazer o fluxo de trabalho da equipe segui-la: revisão de código obrigatória e testes de segurança automáticos antes de publicar.',
  },
  {
    numero: 20, etapa: 3, titulo: 'Nuvem, ambientes e mudanças', clausula: 'A.5.23, A.8.31, A.8.32',
    objetivo: 'Garantir a segurança dos serviços em nuvem e da infraestrutura: ambientes separados, mudanças aprovadas e registradas, configuração segura e quem cuida de cada parte entre a empresa e o provedor.',
  },
];

export const PASSOS_ETAPA_3: Passo[] = [
  // ---------------------------------------------------------------- fase 14
  {
    id: 'p14_1', fase: 14, ordem: 1,
    titulo: 'Elaborar o manual do sistema de gestão',
    clausula: 'Cl 4.4, 7.5',
    porQue: 'A norma não exige um manual, mas o auditor quer ver que o sistema está estabelecido, implementado e mantido (4.4), com a informação documentada que a organização julgou necessária (7.5). Um manual que aponta onde cada requisito é atendido encurta a auditoria.',
    campos: [
      longo('structure', 'Quais seções o manual tem?', '1. Contexto e escopo\n2. Liderança e política\n3. Planejamento (riscos e objetivos)\n4. Apoio (recursos, competência, documentos)\n5. Operação\n6. Avaliação de desempenho\n7. Melhoria', true),
      longo('documents', 'Quais documentos o manual referencia?', 'Política de segurança, metodologia de riscos, declaração de aplicabilidade, procedimento de incidentes.', true),
      curto('owner', 'Quem cuida do manual e o mantém atualizado?', 'Nome e cargo, como na nomeação.', false, { semIA: true }),
    ],
    prova: { descricao: 'Manual versionado e aprovado, com remissão aos documentos do sistema.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [DOCUMENTOS],
    concluidoQuando: [
      CP('Seções do manual e documentos referenciados escritos'),
      EV('Manual aprovado anexado como prova'),
      REG('Ao menos um documento vigente no n.360', 'documentos_vigentes'),
    ],
    gera: 'documento',
  },
  {
    id: 'p14_2', fase: 14, ordem: 2,
    titulo: 'Definir o padrão de codificação dos documentos',
    clausula: 'Cl 7.5.2',
    porQue: 'Ao criar e atualizar informação documentada, a organização garante identificação e descrição adequadas: título, data, autor ou código de referência (7.5.2). O auditor abre dois documentos ao acaso e espera ver o mesmo padrão nos dois.',
    campos: [
      longo('convention', 'Qual é o padrão de nome e código dos documentos?', '[TIPO]-[ÁREA]-[NÚMERO] v[VERSÃO]\nPOL-SI-001 v1.0 Política de Segurança da Informação', true),
      longo('types', 'Quais tipos de documento existem e qual a sigla de cada um?', 'POL = política, PRO = procedimento, REG = registro, FOR = formulário'),
      esc('padrao_nomenclatura', 'Existe padrão de nomenclatura e versionamento de documentos?', SIM_PARCIAL_NAO, false, { pergunta: 'p14_q1' }),
    ],
    prova: { descricao: 'Padrão de codificação publicado e aplicado nos documentos do sistema.', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [DOCUMENTOS],
    concluidoQuando: [
      CP('Padrão de nome e código escrito'),
      REG('Ao menos um documento vigente que segue o padrão', 'documentos_vigentes'),
    ],
  },
  {
    id: 'p14_3', fase: 14, ordem: 3,
    titulo: 'Controlar versões e aprovações dos documentos',
    clausula: 'Cl 7.5.2, 7.5.3',
    porQue: 'A informação documentada é revisada e aprovada quanto à adequação (7.5.2) e controlada quanto a distribuição, acesso, versão, retenção e descarte (7.5.3). O auditor pede o histórico de versões de um documento e quem o aprovou.',
    campos: [
      curto('tool', 'Onde os documentos ficam sob controle?', 'n.360 (Documentos), com histórico de versões.', true),
      longo('flow', 'Quem elabora, quem revisa e quem aprova?', 'O líder do SGSI elabora, o comitê revisa, a diretoria aprova.', true),
      longo('versioning', 'Como a versão muda e de quanto em quanto tempo o documento é revisto?', 'v1.0, v1.1; revisão anual ou após mudança relevante.'),
      longo('obsolete', 'Como as versões antigas saem de uso?', 'A versão antiga é arquivada e marcada como obsoleta; só a vigente fica visível.'),
      esc('lista_mestra', 'A Lista Mestra de Documentos está criada e mantida?', ['Sim', 'Rascunho', 'Não'], false, { pergunta: 'p14_q2' }),
    ],
    prova: { descricao: 'Histórico de versões e aprovações de um documento do sistema.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [DOCUMENTOS],
    concluidoQuando: [
      CP('Local de controle e fluxo de aprovação escritos'),
      EV('Histórico de versões e aprovação de um documento anexado'),
      DOC_APROVADO('Ao menos um documento aprovado no n.360'),
    ],
  },

  // ---------------------------------------------------------------- fase 15
  {
    id: 'p15_1', fase: 15, ordem: 1,
    titulo: 'Redigir a política geral de segurança da informação',
    clausula: 'Cl 5.2, A.5.1',
    porQue: 'A política é aprovada pela alta direção, traz os objetivos (ou a estrutura para defini-los), o compromisso de atender os requisitos aplicáveis e o de melhoria contínua, e está comunicada e disponível às partes interessadas (5.2). As políticas de tema específico são revistas em intervalos planejados (A.5.1).',
    campos: [
      longo('objectives', 'Quais são os objetivos de segurança da informação?', 'Proteger os dados dos clientes, manter os serviços disponíveis e cumprir a LGPD.', true),
      longo('commitments', 'A que a direção se compromete?', 'Atender os requisitos legais e contratuais aplicáveis.\nMelhorar continuamente o sistema de gestão.', true),
      longo('topic_policies', 'Quais políticas específicas complementam esta?', 'Controle de acesso, uso aceitável, backup, criptografia.'),
      curto('approver', 'Quem da direção aprova a política?', 'Nome e cargo, como na ata de aprovação.', true, { semIA: true }),
      esc('politicas_publicadas', 'As políticas organizacionais de SI foram publicadas?', ['Publicadas', 'Em revisão', 'Não'], false, { pergunta: 'p15_q1' }),
    ],
    prova: { descricao: 'Política aprovada pela direção e registro de ciência dos colaboradores.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'documentos', rotulo: 'Abrir as políticas' }],
    concluidoQuando: [
      CP('Objetivos, compromissos e aprovador escritos'),
      EV('Política aprovada e registro de ciência anexados'),
      DOC_APROVADO('Política aprovada pela direção no n.360'),
    ],
    gera: 'documento',
  },
  {
    id: 'p15_2', fase: 15, ordem: 2,
    titulo: 'Segregar as funções conflitantes',
    clausula: 'A.5.3',
    porQue: 'Funções e áreas de responsabilidade conflitantes são segregadas. Em equipe pequena, onde segregar não é viável, o auditor aceita controle compensatório documentado, como revisão independente.',
    campos: [
      longo('conflicts', 'Quais funções conflitam entre si?', 'Quem pede o acesso não o aprova.\nQuem programa não publica em produção sem revisão.\nQuem cadastra fornecedor não aprova o pagamento.', true),
      longo('controls', 'Como a separação é garantida na prática?', 'Perfis distintos no ERP; aprovação em dois níveis.', true),
      longo('compensating', 'Onde a equipe é pequena demais, qual controle compensa?', 'Revisão mensal dos registros pelo gestor.'),
      esc('gestao_acessos', 'Existe processo formal de gestão de acessos (pedido, aprovação, revisão e retirada)?', SIM_PARCIAL_NAO, false, { pergunta: 'p15_q2' }),
    ],
    prova: { descricao: 'Matriz de funções conflitantes e a configuração de perfis que a aplica.', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [CONTROLES],
    concluidoQuando: [
      CP('Funções conflitantes e forma de separação escritas'),
      RP('Responsável e prazo para fechar a separação'),
    ],
  },
  {
    id: 'p15_3', fase: 15, ordem: 3,
    titulo: 'Formalizar o contato com autoridades',
    clausula: 'A.5.5',
    porQue: 'A organização estabelece e mantém contato com as autoridades relevantes. O auditor pergunta quem fala com quem em um incidente e se a lista está atualizada.',
    campos: [
      longo('authorities', 'Com quais autoridades a organização fala, e por qual canal?', 'ANPD (incidente com dados pessoais): canal oficial do site da autoridade.\nPolícia especializada em crimes cibernéticos.\nCorpo de Bombeiros.\nAgência reguladora do setor.', true),
      longo('when', 'Em que situação cada autoridade é acionada?', 'Incidente com dados pessoais de risco relevante, crime cibernético, emergência física.', true),
      curto('who', 'Quem está autorizado a fazer o contato?', 'Encarregado (ANPD) e Jurídico (polícia).', true, { semIA: true }),
    ],
    prova: { descricao: 'Lista de autoridades com contato, situação e responsável, revisada.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [DOCUMENTOS],
    concluidoQuando: [
      CP('Autoridades, situações e responsável escritos'),
      EV('Lista de autoridades revisada e anexada'),
    ],
    gera: 'documento',
  },
  {
    id: 'p15_4', fase: 15, ordem: 4,
    titulo: 'Incluir a segurança na gestão de projetos',
    clausula: 'A.5.8',
    porQue: 'A segurança da informação é integrada à gestão de projetos, qualquer que seja o tipo de projeto. O auditor escolhe um projeto recente e pede a avaliação de riscos e os requisitos de segurança dele.',
    campos: [
      longo('how', 'Em que momento do projeto a segurança entra e como?', 'Avaliação de riscos na abertura.\nRequisitos de segurança no escopo.\nAprovação de segurança antes de entrar em produção.', true),
      curto('example', 'Em qual projeto recente isso já foi aplicado?', 'Migração do sistema de vendas para a nuvem.'),
      curto('owner', 'Quem acompanha?', 'Nome e cargo.', false, { semIA: true }),
    ],
    prova: { descricao: 'Modelo de projeto com a etapa de segurança e um projeto real que a cumpriu.', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [{ tela: 'risks', rotulo: 'Abrir a análise de riscos' }],
    concluidoQuando: [
      CP('Forma de incluir a segurança nos projetos escrita'),
      RP('Responsável e prazo para aplicar no próximo projeto'),
    ],
  },
  {
    id: 'p15_5', fase: 15, ordem: 5,
    titulo: 'Definir as regras de uso aceitável',
    clausula: 'A.5.10',
    porQue: 'Regras de uso aceitável e procedimentos para lidar com a informação e outros ativos são identificados, documentados e implementados. O auditor pede a prova de que os colaboradores conhecem as regras.',
    campos: [
      longo('assets', 'Quais ativos e recursos a política cobre?', 'Notebooks, e-mail, internet, celulares corporativos, sistemas em nuvem.', true),
      longo('allowed', 'O que é permitido e o que é proibido?', 'Permitido: uso pessoal moderado da internet.\nProibido: instalar programa sem autorização, compartilhar senha.', true),
      longo('monitoring', 'O que é monitorado e o que acontece em caso de descumprimento?', 'Uso monitorado conforme a política, com aviso prévio; descumprimento segue o processo disciplinar.'),
      esc('ack', 'Como os colaboradores dão ciência?', ['Assinatura na admissão', 'Aceite eletrônico', 'Ciência pelo portal de políticas', 'Ainda não definido']),
      longo('monitoramento_ativos', 'Como o monitoramento de ativos organizacionais é feito?', 'Inventário revisado a cada seis meses; ferramenta de gestão de equipamentos aponta máquinas sem atualização.', false, { pergunta: 'p15_q3' }),
    ],
    prova: { descricao: 'Política de uso aceitável aprovada e registros de ciência.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [DOCUMENTOS, { tela: 'assets', rotulo: 'Abrir o inventário de ativos' }],
    concluidoQuando: [
      CP('Ativos cobertos, usos permitidos e proibidos escritos'),
      EV('Política aprovada e registros de ciência anexados'),
      REG('Ao menos um ativo no inventário', 'ativos'),
    ],
    gera: 'documento',
  },
  {
    id: 'p15_6', fase: 15, ordem: 6,
    titulo: 'Definir as regras de transferência de informação',
    clausula: 'A.5.14',
    porQue: 'Existem regras, procedimentos ou acordos de transferência para todos os meios (eletrônico, físico e verbal), dentro da organização e com terceiros, coerentes com a classificação da informação. O auditor pergunta como um arquivo confidencial chega a um parceiro.',
    campos: [
      longo('types', 'Quais formas de transferência a regra cobre?', 'E-mail com anexos.\nArquivos em nuvem compartilhados.\nMídia removível.\nIntegração de dados com parceiros.', true),
      longo('rules', 'Qual é a regra para cada nível de classificação?', 'Confidencial: só por link com prazo e senha, nunca por e-mail sem proteção.', true),
      longo('agreements', 'Quais acordos de transferência existem com terceiros?', 'Cláusula de transferência segura no contrato com a empresa de folha de pagamento.'),
    ],
    prova: { descricao: 'Procedimento de transferência de informação e acordos com terceiros.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [DOCUMENTOS],
    concluidoQuando: [
      CP('Formas de transferência e regras por classificação escritas'),
      EV('Procedimento aprovado anexado'),
    ],
    gera: 'documento',
  },
  {
    id: 'p15_7', fase: 15, ordem: 7,
    titulo: 'Gerir a segurança nos fornecedores',
    clausula: 'A.5.19 a A.5.22',
    porQue: 'Processos definidos gerenciam os riscos dos produtos e serviços de fornecedores (A.5.19), com requisitos de segurança nos contratos (A.5.20), atenção à cadeia de suprimentos de tecnologia (A.5.21) e monitoramento dos serviços (A.5.22). O auditor sorteia um fornecedor e pede o contrato e a avaliação.',
    campos: [
      longo('criteria', 'Como os fornecedores são classificados por risco?', 'Crítico quando trata dados pessoais ou sustenta um serviço essencial.', true),
      longo('requirements', 'Que requisitos de segurança são exigidos deles?', 'Confidencialidade, aviso de incidentes, direito de auditoria, certificações.', true),
      longo('lifecycle', 'Como é o caminho do contrato ao encerramento?', 'Seleção, avaliação, contrato, monitoramento, devolução e eliminação de dados na saída.'),
    ],
    prova: { descricao: 'Política de fornecedores e a lista de fornecedores classificados por risco.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'vendors', rotulo: 'Abrir o cadastro de fornecedores' }, DOCUMENTOS],
    concluidoQuando: [
      CP('Classificação por risco e requisitos de segurança escritos'),
      EV('Política e lista de fornecedores classificados anexadas'),
      REG('Ao menos um fornecedor cadastrado', 'fornecedores'),
    ],
    gera: 'documento',
  },
  {
    id: 'p15_8', fase: 15, ordem: 8,
    titulo: 'Elaborar o plano de resposta a incidentes',
    clausula: 'A.5.24 a A.5.28',
    porQue: 'A gestão de incidentes é planejada, com papéis e procedimentos de detecção, avaliação (A.5.25), resposta (A.5.26), aprendizado (A.5.27) e coleta de evidências (A.5.28). Se o incidente envolve dados pessoais, o plano precisa levar também à comunicação prevista no art. 48 da LGPD.',
    campos: [
      longo('phases', 'Quais são as fases do procedimento?', '1. Detecção e registro\n2. Classificação de gravidade\n3. Contenção\n4. Eliminação da causa\n5. Recuperação\n6. Lições aprendidas', true),
      longo('roles', 'Quem faz o quê na resposta?', 'Coordenador do incidente, TI, Jurídico, encarregado e Comunicação.', true),
      longo('severity', 'Como a gravidade é classificada?', 'Crítico quando há parada de serviço essencial ou vazamento de dados pessoais.'),
    ],
    prova: { descricao: 'Plano de resposta aprovado e comunicado à equipe de resposta.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [DOCUMENTOS],
    concluidoQuando: [
      CP('Fases, papéis e classificação de gravidade escritos'),
      EV('Plano aprovado e comunicado à equipe anexado'),
      DOC_APROVADO('Plano de resposta aprovado no n.360'),
    ],
    gera: 'documento',
  },

  // ---------------------------------------------------------------- fase 16
  {
    id: 'p16_1', fase: 16, ordem: 1,
    titulo: 'Verificar os antecedentes antes da contratação',
    clausula: 'A.6.1',
    porQue: 'A verificação de antecedentes é feita antes da admissão e, quando aplicável, de forma contínua, proporcional aos requisitos do negócio, à classificação da informação acessada e aos riscos, e dentro da lei. Os dados do candidato também seguem a LGPD (finalidade e necessidade).',
    campos: [
      longo('checks', 'Que verificações são feitas antes da contratação?', 'Confirmação de identidade e documentos.\nReferências profissionais.\nComprovação de formação em cargos técnicos.', true),
      longo('proportional', 'Como a verificação muda com o cargo e o acesso?', 'Verificação ampliada para quem acessa dados financeiros ou administra sistemas.'),
      longo('legal', 'Quais limites legais são respeitados?', 'Só o necessário à função, com ciência do candidato, respeitando a LGPD e a legislação trabalhista.'),
      esc('triagem_admissao', 'Há verificação de antecedentes na admissão?', ['Sim', 'Para cargos críticos', 'Não'], false, { pergunta: 'p16_q1' }),
    ],
    prova: { descricao: 'Procedimento de triagem e registros de verificação de admissões recentes.', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [],
    concluidoQuando: [
      CP('Verificações e limites legais escritos'),
      RP('Responsável e prazo para aplicar a triagem'),
    ],
  },
  {
    id: 'p16_2', fase: 16, ordem: 2,
    titulo: 'Colher os termos de confidencialidade',
    clausula: 'A.6.6, A.6.2',
    porQue: 'Os acordos de confidencialidade refletem as necessidades de proteção da informação, são assinados por colaboradores e terceiros relevantes e revistos periodicamente (A.6.6). As responsabilidades de segurança constam do contrato de trabalho (A.6.2). O auditor confere uma amostra de termos assinados antes do primeiro acesso.',
    campos: [
      esc('coverage', 'Quantos colaboradores já assinaram?', ['100% dos colaboradores', 'Mais de 90% assinaram', 'Entre 50% e 90% assinaram', 'Menos de 50% assinaram'], true),
      esc('includes_third', 'Os terceirizados também assinam?', ['Sim', 'Não', 'Parcialmente']),
      longo('template', 'O que o modelo de termo cobre?', 'Sigilo de informações de clientes, duração da obrigação após o fim do vínculo, penalidades.'),
      curto('evidence_desc', 'Onde ficam guardados os termos assinados?', 'RH, pasta digital com controle de acesso.', true),
      esc('nda_obrigatorio', 'Termos de confidencialidade (NDA) obrigatórios?', SIM_PARCIAL_NAO, false, { pergunta: 'p16_q2' }),
    ],
    prova: { descricao: 'Modelo do termo e os termos assinados (amostra de admissões recentes).', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [],
    concluidoQuando: [
      CP('Cobertura de assinaturas e local de guarda informados'),
      EV('Modelo do termo e amostra de termos assinados anexados'),
    ],
  },
  {
    id: 'p16_3', fase: 16, ordem: 3,
    titulo: 'Formalizar a admissão e o desligamento seguros',
    clausula: 'A.6.5, A.5.11, A.5.18',
    porQue: 'As responsabilidades que continuam após o desligamento ou a mudança de função são definidas e comunicadas (A.6.5). Somam-se a devolução de ativos (A.5.11) e a retirada de acessos (A.5.18): o auditor confere desligados recentes contra a lista de contas ativas.',
    campos: [
      longo('onboarding', 'Quais são as etapas da admissão?', '1. Termo de confidencialidade assinado\n2. Acessos concedidos conforme o cargo\n3. Treinamento inicial de segurança', true),
      longo('steps', 'Quais são as etapas do desligamento?', '1. Acessos retirados no mesmo dia\n2. Devolução dos equipamentos\n3. Transferência dos dados de trabalho\n4. Lembrete do sigilo que continua após o contrato', true),
      esc('offboarding', 'Há processo de desligamento seguro?', SIM_PARCIAL_NAO, false, { pergunta: 'p16_q3' }),
    ],
    prova: { descricao: 'Roteiros de admissão e desligamento preenchidos e a retirada de acessos registrada.', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [],
    concluidoQuando: [
      CP('Etapas da admissão e do desligamento escritas'),
      RP('Responsável e prazo para aplicar o roteiro'),
    ],
  },

  // ---------------------------------------------------------------- fase 17
  {
    id: 'p17_1', fase: 17, ordem: 1,
    titulo: 'Definir os perímetros e as áreas seguras',
    clausula: 'A.7.1',
    porQue: 'Os perímetros de segurança são definidos e usados para proteger as áreas que contêm informação e outros ativos associados. O auditor pode percorrer as instalações e conferir se o perímetro descrito existe.',
    campos: [
      longo('perimeters', 'Quais são os perímetros e as áreas restritas?', 'Recepção (pública), escritório (só colaboradores), sala de servidores (só TI), arquivo de RH (só RH).', true),
      multi('controles_fisicos', 'Quais controles físicos existem?', ['Perímetro/portaria', 'Controle de visitantes', 'CFTV', 'Descarte de mídia', 'Sala-cofre/DC'], false, { pergunta: 'p17_q1' }),
      provas('evidence_desc', 'Que provas existem (planta, fotos, controle de acesso)?'),
    ],
    prova: { descricao: 'Planta com áreas seguras demarcadas e fotos dos controles.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [],
    concluidoQuando: [
      CP('Perímetros e provas descritos'),
      EV('Planta e fotos dos controles anexadas'),
    ],
  },
  {
    id: 'p17_2', fase: 17, ordem: 2,
    titulo: 'Monitorar a segurança física',
    clausula: 'A.7.4, A.7.2',
    porQue: 'As instalações são monitoradas continuamente contra acesso físico não autorizado (A.7.4) e as entradas são protegidas por controles de acesso (A.7.2). Se há câmeras, a gravação é dado pessoal: os titulares são avisados e o prazo de guarda é definido.',
    campos: [
      longo('monitoring', 'Como as instalações são monitoradas?', 'Câmeras com gravação, alarme de intrusão e vigilância na portaria.', true),
      longo('controls', 'Quais controles de entrada existem?', 'Catraca com crachá, biometria na sala de servidores, registro de visitantes.', true),
      longo('areas', 'Quais áreas ficam protegidas?', 'Recepção, escritório, sala de servidores, cofre.'),
      provas('evidence_desc', 'Que provas existem do monitoramento?'),
    ],
    prova: { descricao: 'Registro de acessos, configuração de alarmes e aviso de monitoramento.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [],
    concluidoQuando: [
      CP('Monitoramento e controles de entrada escritos'),
      EV('Registro de acessos e aviso de monitoramento anexados'),
    ],
  },
  {
    id: 'p17_3', fase: 17, ordem: 3,
    titulo: 'Proteger contra ameaças físicas e ambientais',
    clausula: 'A.7.5',
    porQue: 'A proteção contra ameaças físicas e ambientais (desastres naturais, ataques, acidentes) é projetada e implementada a partir da avaliação de riscos. O auditor pede laudos e registros de manutenção e de teste.',
    campos: [
      longo('threats', 'Quais ameaças físicas e ambientais foram avaliadas?', 'Incêndio, alagamento, queda de energia, calor excessivo na sala de servidores.', true),
      longo('measures', 'Quais proteções estão instaladas?', 'Detecção e combate a incêndio, nobreak e gerador, ar-condicionado redundante.', true),
      provas('evidence_desc', 'Que provas existem (laudos, manutenções, testes)?'),
    ],
    prova: { descricao: 'Laudos de inspeção e registros de manutenção e teste dos equipamentos de proteção.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'risks', rotulo: 'Abrir a análise de riscos' }],
    concluidoQuando: [
      CP('Ameaças avaliadas e proteções instaladas escritas'),
      EV('Laudos e registros de manutenção anexados'),
    ],
  },
  {
    id: 'p17_4', fase: 17, ordem: 4,
    titulo: 'Proteger os equipamentos e descartar as mídias com segurança',
    clausula: 'A.7.8, A.7.14',
    porQue: 'Os equipamentos são posicionados e protegidos para reduzir riscos de ameaças físicas e ambientais e de acesso não autorizado (A.7.8). Antes do descarte ou da reutilização, equipamentos com mídia de armazenamento são verificados para que dados e programas licenciados sejam removidos (A.7.14).',
    campos: [
      longo('measures', 'Quais proteções os equipamentos têm?', 'Nobreak, climatização, chave no armário de rede, cabeamento organizado.', true),
      longo('descarte_midia', 'Como o descarte seguro de mídia física é feito?', 'HD: apagamento e destruição física. Papel: fragmentadora. Registro de cada descarte com data e responsável.', false, { pergunta: 'p17_q2' }),
      provas('evidence_desc', 'Que provas existem (fotos, manutenção, descarte)?'),
    ],
    prova: { descricao: 'Fotos das instalações, registros de manutenção e comprovantes de descarte.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'assets', rotulo: 'Abrir o inventário de ativos' }],
    concluidoQuando: [
      CP('Proteções e método de descarte escritos'),
      EV('Fotos, manutenções e comprovantes de descarte anexados'),
    ],
  },

  // ---------------------------------------------------------------- fase 18
  {
    id: 'p18_1', fase: 18, ordem: 1,
    titulo: 'Definir a política de controle de acesso',
    clausula: 'A.5.15, A.5.18, A.8.3',
    porQue: 'As regras de controle de acesso físico e lógico partem dos requisitos de negócio e de segurança (A.5.15): menor privilégio, necessidade de conhecer, concessão, revisão periódica e retirada (A.5.18), com restrição do acesso à informação (A.8.3). O auditor pede a última revisão de acessos.',
    campos: [
      curto('iam_tool', 'Qual ferramenta gerencia as contas e os acessos?', 'Microsoft Entra ID, Google Workspace, Okta.', true),
      esc('mfa', 'A verificação em duas etapas está ligada?', ['Sim, para todos os usuários', 'Sim, apenas administradores e privilegiados', 'Não implementado'], true),
      esc('access_review', 'Com que frequência os acessos são revistos?', ['Trimestral', 'Semestral', 'Anual', 'Não há processo']),
      longo('privileged', 'Como as contas de administrador são geridas?', 'Contas nominais, sem uso diário, aprovadas pelo gestor e revistas a cada trimestre.'),
      provas('evidence_desc', 'Que provas existem (configuração, última revisão de acessos)?'),
    ],
    prova: { descricao: 'Política aprovada e a última revisão de acessos registrada.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [DOCUMENTOS, CONTROLES],
    concluidoQuando: [
      CP('Ferramenta de acessos e uso da verificação em duas etapas informados'),
      EV('Política aprovada e última revisão de acessos anexadas'),
      DOC_APROVADO('Política de controle de acesso aprovada no n.360'),
    ],
    gera: 'documento',
  },
  {
    id: 'p18_2', fase: 18, ordem: 2,
    titulo: 'Gerir os acessos privilegiados e as senhas',
    clausula: 'A.8.2, A.5.17, A.8.5',
    porQue: 'Os direitos de acesso privilegiado são restritos e gerenciados (A.8.2). A gestão das informações de autenticação (A.5.17) e a autenticação segura (A.8.5) completam o quadro. O auditor pede a lista de administradores e a última revisão dela.',
    campos: [
      longo('privileged', 'Quais são as contas privilegiadas e quem as detém?', 'Administradores do domínio, do ERP e da nuvem: cinco pessoas, todas nominais.', true),
      longo('how', 'Como o acesso privilegiado é concedido, registrado e revisto?', 'Pedido aprovado pelo gestor, cofre de senhas, revisão trimestral.', true),
      longo('auth', 'Quais são as regras de autenticação?', 'Verificação em duas etapas para administradores e acesso remoto; senha longa; bloqueio após tentativas.', true),
      provas('evidence_desc', 'Que provas existem (lista de administradores, configuração)?'),
    ],
    prova: { descricao: 'Lista de contas privilegiadas, revisão periódica e configuração da verificação em duas etapas.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [CONTROLES],
    concluidoQuando: [
      CP('Contas privilegiadas, concessão e regras de autenticação escritas'),
      EV('Lista de administradores e configuração anexadas'),
      REG('Ao menos um controle implementado na declaração', 'controles_implementados'),
    ],
  },
  {
    id: 'p18_3', fase: 18, ordem: 3,
    titulo: 'Registrar eventos e monitorar os sistemas',
    clausula: 'A.8.15, A.8.16',
    porQue: 'Registros de atividades, exceções, falhas e eventos relevantes são produzidos, guardados, protegidos e analisados (A.8.15), e redes, sistemas e aplicações são monitorados para detectar comportamento anômalo (A.8.16). O auditor pede um alerta real e o que foi feito com ele.',
    campos: [
      curto('siem', 'Qual ferramenta reúne e monitora os registros?', 'Wazuh, Microsoft Sentinel, Datadog.', true),
      longo('sources', 'De quais fontes os registros são coletados?', 'Servidores, firewall, diretório de usuários, nuvem, aplicações, estações de trabalho.', true),
      curto('retention', 'Por quanto tempo os registros são guardados?', '12 meses acessíveis e 24 meses arquivados.'),
      esc('alerting', 'Há alertas configurados?', ['Sim, com roteiro de tratamento', 'Sim, alertas básicos', 'Não há alertas automáticos']),
      esc('logs_centralizados', 'Os registros são centralizados para auditoria?', SIM_PARCIAL_NAO, false, { pergunta: 'p18_q4' }),
      provas('evidence_desc', 'Que provas existem (painel, relatório de alertas)?'),
    ],
    prova: { descricao: 'Configuração de coleta, prazo de guarda dos registros e alertas tratados.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [CONTROLES],
    concluidoQuando: [
      CP('Ferramenta, fontes e guarda dos registros informadas'),
      EV('Configuração da coleta e exemplo de alerta tratado anexados'),
    ],
  },
  {
    id: 'p18_4', fase: 18, ordem: 4,
    titulo: 'Gerir vulnerabilidades, correções e proteção contra vírus',
    clausula: 'A.8.8, A.8.7',
    porQue: 'As informações sobre vulnerabilidades técnicas são obtidas, a exposição é avaliada e medidas são tomadas (A.8.8); a proteção contra códigos maliciosos é implementada (A.8.7). O auditor pede um relatório recente de varredura e a prova de que as falhas críticas foram corrigidas no prazo que a própria organização definiu.',
    campos: [
      curto('tool', 'Qual ferramenta faz a varredura de vulnerabilidades?', 'Nessus, Qualys, OpenVAS.', true),
      esc('frequency', 'Com que frequência a varredura roda?', ['Contínua', 'Semanal', 'Mensal', 'Trimestral', 'Sob demanda'], true),
      longo('patching_sla', 'Em quanto tempo cada gravidade deve ser corrigida?', 'Crítica: 48 horas. Alta: 7 dias. Média: 30 dias. Baixa: 90 dias.'),
      data('pentest', 'Quando foi o último teste de invasão?'),
      esc('antivirus', 'O antivírus/EDR corporativo está implantado?', SIM_PARCIAL_NAO, false, { pergunta: 'p18_q2' }),
      esc('patches', 'A gestão de correções (patches) está formalizada?', SIM_PARCIAL_NAO, false, { pergunta: 'p18_q3' }),
      provas('evidence_desc', 'Que provas existem (relatório de varredura, registro das correções)?'),
    ],
    prova: { descricao: 'Relatório de varredura recente e registro das correções aplicadas.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [CONTROLES],
    concluidoQuando: [
      CP('Ferramenta, frequência e prazos de correção informados'),
      EV('Relatório de varredura e correções anexados'),
    ],
  },
  {
    id: 'p18_5', fase: 18, ordem: 5,
    titulo: 'Configurar a criptografia e a gestão de chaves',
    clausula: 'A.8.24',
    porQue: 'São definidas e implementadas regras para o uso efetivo da criptografia, incluindo a gestão das chaves. O auditor confere a configuração real: protocolos em trânsito, criptografia em repouso e quem guarda e troca as chaves.',
    campos: [
      longo('transit', 'Como os dados são protegidos em trânsito?', 'TLS 1.2 ou superior nas APIs e no site; VPN no acesso remoto.', true),
      longo('rest', 'Como os dados são protegidos em repouso?', 'Criptografia do banco e dos discos dos notebooks; armazenamento em nuvem cifrado.', true),
      longo('key_mgmt', 'Quem guarda e troca as chaves, e como?', 'Serviço de chaves do provedor de nuvem, com troca anual e acesso restrito.'),
      esc('cripto_ambos', 'Os dados são criptografados em trânsito e em repouso?', ['Ambos', 'Só trânsito', 'Não'], false, { pergunta: 'p18_q1' }),
      provas('evidence_desc', 'Que provas existem (configuração do TLS, serviço de chaves)?'),
    ],
    prova: { descricao: 'Configuração de TLS, criptografia de discos e bancos e o registro de gestão de chaves.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [CONTROLES],
    concluidoQuando: [
      CP('Criptografia em trânsito e em repouso descritas'),
      EV('Configurações de TLS, discos e chaves anexadas'),
    ],
  },
  {
    id: 'p18_6', fase: 18, ordem: 6,
    titulo: 'Proteger a rede e os serviços de rede',
    clausula: 'A.8.20, A.8.21, A.8.22',
    porQue: 'As redes e os dispositivos de rede são protegidos, gerenciados e controlados (A.8.20); os mecanismos e requisitos de segurança dos serviços de rede são definidos e monitorados (A.8.21); grupos de serviços, usuários e sistemas são segregados (A.8.22). O auditor pede o diagrama e as regras do firewall.',
    campos: [
      longo('segmentation', 'Como a rede é dividida e protegida?', 'Redes separadas para usuários, servidores e visitantes, com firewall entre elas.', true),
      longo('services', 'Quais serviços de rede existem e que segurança se exige deles?', 'Link de internet com contrato de nível de serviço; acesso remoto por VPN com verificação em duas etapas.', true),
      longo('wifi', 'Como é a rede sem fio?', 'Rede corporativa com autenticação individual; rede de visitantes isolada.'),
      provas('evidence_desc', 'Que provas existem (diagrama de rede, regras do firewall)?'),
    ],
    prova: { descricao: 'Diagrama de rede atualizado e regras do firewall revistas.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [CONTROLES],
    concluidoQuando: [
      CP('Divisão da rede e serviços de rede descritos'),
      EV('Diagrama de rede e regras do firewall anexados'),
    ],
  },

  // ---------------------------------------------------------------- fase 19
  {
    id: 'p19_1', fase: 19, ordem: 1,
    titulo: 'Redigir a política de desenvolvimento seguro',
    clausula: 'A.8.25',
    porQue: 'As regras para o desenvolvimento seguro de software e sistemas são estabelecidas e aplicadas (A.8.25), com requisitos de segurança da aplicação (A.8.26), princípios de arquitetura segura (A.8.27), codificação segura (A.8.28) e testes (A.8.29). O auditor pede o documento e a prova de que a equipe o conhece.',
    campos: [
      longo('sdlc', 'Quais fases o ciclo de desenvolvimento seguro tem?', 'Requisitos, desenho, programação, testes, publicação e manutenção, com uma verificação de segurança em cada uma.', true),
      longo('tools', 'Quais ferramentas de segurança entram no fluxo?', 'Análise do código (SAST), análise de dependências, busca de senhas esquecidas no código.'),
      esc('sdlc_documentado', 'Há um ciclo de desenvolvimento seguro documentado?', SIM_PARCIAL_NAO, false, { pergunta: 'p19_q1' }),
    ],
    prova: { descricao: 'Política de desenvolvimento seguro aprovada e comunicada à equipe.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [DOCUMENTOS],
    concluidoQuando: [
      CP('Fases do ciclo e ferramentas de segurança escritas'),
      EV('Política aprovada e comunicada à equipe anexada'),
      DOC_APROVADO('Política de desenvolvimento seguro aprovada no n.360'),
    ],
    gera: 'documento',
  },
  {
    id: 'p19_2', fase: 19, ordem: 2,
    titulo: 'Aplicar o ciclo de desenvolvimento seguro no dia a dia',
    clausula: 'A.8.25, A.8.28',
    porQue: 'A política só vale se o fluxo de trabalho a aplica: requisitos, revisão de código, análise automática e aprovação antes da produção. O auditor pede para ver o fluxo em uma mudança real, do pedido à publicação.',
    campos: [
      curto('pipeline', 'Qual esteira de publicação a equipe usa?', 'GitHub Actions, GitLab CI, Jenkins.', true),
      longo('stages', 'Quais verificações de segurança a esteira roda, e em que ordem?', 'Análise estática, testes, build, análise de dependências, publicação.', true),
      esc('gates', 'Uma falha crítica de segurança bloqueia a publicação?', ['Sim, falhas críticas bloqueiam', 'Só alerta, não bloqueia', 'Sem barreira de segurança']),
      esc('revisao_codigo', 'A revisão de código com foco em segurança acontece?', ['Obrigatória', 'Eventual', 'Não'], false, { pergunta: 'p19_q3' }),
      provas('evidence_desc', 'Que provas existem (esteira, uma mudança real revisada)?'),
    ],
    prova: { descricao: 'Configuração do fluxo de desenvolvimento e uma mudança recente que passou por ele.', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [],
    concluidoQuando: [
      CP('Esteira e verificações de segurança descritas'),
      RP('Responsável e prazo para travar a publicação sem revisão'),
    ],
  },
  {
    id: 'p19_3', fase: 19, ordem: 3,
    titulo: 'Testar a segurança do software',
    clausula: 'A.8.29',
    porQue: 'Os processos de teste de segurança são definidos e executados no ciclo de desenvolvimento, inclusive na aceitação de sistemas novos e de novas versões. O auditor pede o relatório de um teste recente e o que foi feito com os achados.',
    campos: [
      curto('sast', 'Qual ferramenta analisa o código-fonte (SAST)?', 'SonarQube, Semgrep, CodeQL.', true),
      curto('sca', 'Qual ferramenta analisa as dependências?', 'Dependabot, Snyk, Trivy.'),
      curto('dast', 'Qual ferramenta testa a aplicação em execução (DAST), se houver?', 'OWASP ZAP, Burp Suite.'),
      esc('frequency', 'Com que frequência os testes rodam?', ['A cada alteração de código', 'Diária', 'Semanal', 'Manual']),
      esc('testes_pipeline', 'Há testes de segurança (código, aplicação, dependências) na esteira?', ['Sim', 'Alguns', 'Não'], false, { pergunta: 'p19_q2' }),
      provas('evidence_desc', 'Que provas existem (relatórios, painel)?'),
    ],
    prova: { descricao: 'Relatórios de testes de segurança e o tratamento dos achados.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [CONTROLES],
    concluidoQuando: [
      CP('Ferramentas e frequência dos testes informadas'),
      EV('Relatório de teste recente e tratamento dos achados anexados'),
    ],
  },

  // ---------------------------------------------------------------- fase 20
  {
    id: 'p20_1', fase: 20, ordem: 1,
    titulo: 'Separar os ambientes de desenvolvimento, teste e produção',
    clausula: 'A.8.31, A.8.33',
    porQue: 'Os ambientes de desenvolvimento, teste e produção são separados e protegidos (A.8.31). Os dados de teste são escolhidos, protegidos e geridos (A.8.33): dado pessoal de produção em teste exige justificativa e proteção equivalente.',
    campos: [
      longo('envs', 'Quais ambientes existem e como são separados?', 'Desenvolvimento, homologação e produção em contas de nuvem distintas.', true),
      longo('access', 'Quem acessa a produção?', 'Só a equipe de operações; desenvolvedores sem acesso de escrita.', true),
      esc('test_data', 'Dados de produção são usados em teste?', ['Não são usados', 'Usados mascarados ou anonimizados', 'Usados com autorização registrada', 'Usados sem controle']),
      provas('evidence_desc', 'Que provas existem (desenho dos ambientes, lista de acessos)?'),
    ],
    prova: { descricao: 'Arquitetura dos ambientes e a lista de quem tem acesso à produção.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [CONTROLES],
    concluidoQuando: [
      CP('Ambientes e acessos à produção descritos'),
      EV('Desenho dos ambientes e lista de acessos anexados'),
    ],
  },
  {
    id: 'p20_2', fase: 20, ordem: 2,
    titulo: 'Gerir as mudanças na infraestrutura',
    clausula: 'A.8.32',
    porQue: 'As mudanças nas instalações de processamento e nos sistemas seguem um procedimento de gestão de mudanças. O auditor sorteia mudanças recentes e pede aprovação, teste e plano de retorno de cada uma.',
    campos: [
      longo('process', 'Como uma mudança é pedida, aprovada e feita?', 'Pedido, análise de impacto, aprovação, teste, janela combinada, plano de retorno e registro.', true),
      longo('emergency', 'Como a mudança de emergência é tratada?', 'Aprovação posterior em até um dia útil, com registro.'),
      curto('example', 'Qual mudança recente serve de exemplo?', 'Atualização do firewall em 12/05, com aprovação do gestor de TI.'),
      esc('iac', 'A infraestrutura é descrita em código, com revisão de segurança?', SIM_PARCIAL_NAO, false, { pergunta: 'p20_q2' }),
    ],
    prova: { descricao: 'Registros de mudanças recentes com aprovação e teste.', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [],
    concluidoQuando: [
      CP('Fluxo de mudança e tratamento de emergência escritos'),
      RP('Responsável e prazo para registrar as mudanças'),
    ],
  },
  {
    id: 'p20_3', fase: 20, ordem: 3,
    titulo: 'Configurar com segurança os sistemas e a nuvem',
    clausula: 'A.8.9, A.5.23',
    porQue: 'As configurações, inclusive as de segurança, de hardware, software, serviços e redes são estabelecidas, documentadas, implementadas, monitoradas e revistas (A.8.9). No uso de serviços em nuvem, os processos de contratação, uso, gestão e saída são definidos (A.5.23). O auditor compara um servidor real com o padrão documentado e pergunta o que é do provedor e o que é da empresa.',
    campos: [
      longo('baselines', 'Quais padrões de configuração segura são adotados?', 'Guias CIS para Windows Server e Linux; padrão próprio para equipamentos de rede.', true),
      longo('coverage', 'Quais ativos são cobertos e como a conformidade é conferida?', 'Varredura mensal de configuração nos servidores.', true),
      longo('drift', 'Como os desvios são detectados e corrigidos?', 'Alerta da ferramenta de configuração e correção registrada.'),
      longo('responsabilidade_nuvem', 'Como a responsabilidade compartilhada com o provedor de nuvem é tratada?', 'Provedor: infraestrutura física e plataforma. Empresa: contas, acessos, configuração e dados. Matriz anexa ao contrato.', false, { pergunta: 'p20_q1' }),
      esc('segredos', 'A gestão de segredos (senhas e chaves de sistemas) é centralizada?', ['Sim (cofre)', 'Parcial', 'Não'], false, { pergunta: 'p20_q3' }),
      provas('evidence_desc', 'Que provas existem (padrão adotado, relatório de conformidade)?'),
    ],
    prova: { descricao: 'Padrão de configuração documentado e relatório de conformidade.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [CONTROLES],
    concluidoQuando: [
      CP('Padrões de configuração e cobertura descritos'),
      EV('Padrão documentado e relatório de conformidade anexados'),
    ],
  },
];
