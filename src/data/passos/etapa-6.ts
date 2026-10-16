// Etapa 6 da trilha (fases 34 a 40): prontidão, auditoria de certificação (etapas 1 e 2), resultado e supervisão.
// Conteúdo editorial do produto; a estrutura segue o contrato de ./tipos.
import type { FaseDoCatalogo, Passo } from './tipos';

export const FASES_ETAPA_6: FaseDoCatalogo[] = [
  {
    numero: 34, etapa: 6, titulo: 'Revisão de prontidão', clausula: 'Cl 4.3, 9.2 e 9.3',
    objetivo: 'Conferir, antes de chamar o organismo certificador, se os pré-requisitos estão cumpridos, se o escopo do certificado está combinado e se as evidências estão organizadas por controle. A decisão de seguir é da direção.',
  },
  {
    numero: 35, etapa: 6, titulo: 'Preparação para a etapa 1', clausula: 'Auditoria de certificação',
    objetivo: 'Entregar ao organismo certificador a documentação do sistema para a etapa 1 da auditoria de certificação, em que ele avalia o escopo e a preparação para a etapa 2, e registrar o que ele observar.',
  },
  {
    numero: 36, etapa: 6, titulo: 'Correções depois da etapa 1', clausula: 'Auditoria de certificação',
    objetivo: 'Tratar as lacunas apontadas na etapa 1 e ajustar a documentação, com versão e aprovação, antes da etapa 2 da auditoria de certificação.',
  },
  {
    numero: 37, etapa: 6, titulo: 'Preparação para a etapa 2', clausula: 'Auditoria de certificação',
    objetivo: 'Preparar as pessoas, as evidências e a logística para a etapa 2 da auditoria de certificação, em que o organismo avalia se o sistema está implementado e é eficaz.',
  },
  {
    numero: 38, etapa: 6, titulo: 'Atendimento ao auditor na etapa 2', clausula: 'Auditoria de certificação',
    objetivo: 'Acompanhar a etapa 2 da auditoria de certificação: fornecer as evidências pedidas, registrar as observações do auditor e participar do encerramento formal.',
  },
  {
    numero: 39, etapa: 6, titulo: 'Resultado e certificado', clausula: 'Cl 10.2',
    objetivo: 'Analisar o relatório do organismo certificador, tratar as não conformidades no prazo, receber o certificado e comunicá-lo internamente.',
  },
  {
    numero: 40, etapa: 6, titulo: 'Manutenção e supervisão', clausula: 'Cl 10.1 e 9.3',
    objetivo: 'Manter o sistema vivo depois do certificado: calendário das auditorias de supervisão, melhoria contínua e preparação da recertificação ao fim do ciclo de três anos.',
  },
];

export const PASSOS_ETAPA_6: Passo[] = [
  // ── Fase 34: Revisão de prontidão ──────────────────────────────────────────
  {
    id: 'p34_0', fase: 34, ordem: 1,
    titulo: 'Definir as normas e o escopo do certificado',
    clausula: 'Cl 4.3',
    porQue: 'O escopo do certificado é o texto que o organismo emite, e precisa bater com o escopo do sistema (Cl 4.3), com as localidades e com a declaração de aplicabilidade. Se a 27701 entrar, combine com o organismo se ela será auditada junto da 27001 ou de forma autônoma.',
    campos: [
      { id: 'standards', rotulo: 'Quais normas constarão no certificado?', tipo: 'escolha', obrigatorio: true, exemplo: '', opcoes: ['ISO 27001', 'ISO 27701 (autônomo)', '27001 + 27701 (integrado)'], pergunta: 'p34_q3' },
      { id: 'scope_text', rotulo: 'Qual o texto do escopo que sairá no certificado?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Desenvolvimento e operação da plataforma de vendas online, na sede de São Paulo e em trabalho remoto.' },
      { id: 'sites', rotulo: 'Quais localidades serão auditadas?', tipo: 'texto_longo', obrigatorio: false, exemplo: 'Sede de São Paulo e operação remota.' },
      { id: 'body', rotulo: 'Qual organismo certificador foi escolhido?', tipo: 'texto', obrigatorio: false, exemplo: 'Organismo acreditado escolhido em cotação.' },
    ],
    prova: { descricao: 'Escopo do certificado acordado por escrito com o organismo certificador.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'context', rotulo: 'Abrir o contexto e o escopo' }, { tela: 'certification', rotulo: 'Abrir a prontidão para certificação' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Normas e texto do escopo do certificado escritos' },
      { tipo: 'evidencia_anexada', rotulo: 'Escopo acordado com o organismo anexado' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos um documento vigente (política ou escopo)', entidade: 'documentos_vigentes', minimo: 1 },
    ],
    gera: 'documento',
  },
  {
    id: 'p34_1', fase: 34, ordem: 2,
    titulo: 'Conferir a prontidão final',
    clausula: 'Cl 9.2, 9.3 e 6.1.3',
    porQue: 'Antes de chamar o organismo, o auditor da consultoria precisa ver o que ainda falta: controles aplicáveis implementados, evidências válidas, auditoria interna e análise crítica concluídas (Cl 9.2 e 9.3). Índice alto com pré-requisito pendente não basta, porque o auditor externo encontra a pendência logo no primeiro dia.',
    campos: [
      { id: 'score', rotulo: 'Qual o índice de prontidão hoje?', tipo: 'texto', obrigatorio: true, exemplo: '85%' },
      { id: 'status', rotulo: 'O índice está acima de 80%?', tipo: 'escolha', obrigatorio: true, exemplo: '', opcoes: ['Sim, pronto para certificação', 'Marginal (70-80%)', 'Abaixo de 70% — não recomendado'] },
      { id: 'gaps', rotulo: 'Quais lacunas residuais ainda impedem a etapa 1 da auditoria de certificação?', tipo: 'texto_longo', obrigatorio: false, exemplo: 'Falta o teste de restauração do backup e a revisão semestral de acessos do segundo semestre.', pergunta: 'p34_q2' },
      { id: 'review_done', rotulo: 'Foi conduzida uma revisão de prontidão?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Parcial', 'Não'], pergunta: 'p34_q1' },
    ],
    prova: { descricao: 'Captura da prontidão no n.360 com a data e as áreas mais fracas.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'certification', rotulo: 'Abrir a prontidão para certificação' }, { tela: 'soa', rotulo: 'Abrir a declaração de aplicabilidade' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Índice, situação e lacunas preenchidos' },
      { tipo: 'evidencia_anexada', rotulo: 'Captura da prontidão com a data anexada' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos dez controles implementados na declaração', entidade: 'controles_implementados', minimo: 10 },
    ],
  },
  {
    id: 'p34_2', fase: 34, ordem: 3,
    titulo: 'Consolidar o pacote de evidências por controle',
    clausula: 'Cl 6.1.3 d',
    porQue: 'O auditor percorre a declaração de aplicabilidade controle a controle (Cl 6.1.3 d) e pede a evidência de cada um. Um pacote organizado pelo número do controle encurta a auditoria e evita pedidos repetidos.',
    campos: [
      { id: 'status', rotulo: 'Qual a situação das evidências da declaração de aplicabilidade?', tipo: 'escolha', obrigatorio: true, exemplo: '', opcoes: ['Completa com todas evidências', 'Completa, faltam evidências pontuais', 'Incompleta'] },
      { id: 'coverage', rotulo: 'Que percentual dos controles aplicáveis tem evidência válida?', tipo: 'texto', obrigatorio: true, exemplo: '94% (87 de 93 controles aplicáveis)' },
      { id: 'location', rotulo: 'Onde está o pacote?', tipo: 'texto', obrigatorio: false, exemplo: 'Portal do auditor no n.360, somente leitura.' },
    ],
    prova: { descricao: 'Pacote de evidências organizado por controle (no n.360, o pacote de auditoria).', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [{ tela: 'evidence', rotulo: 'Abrir as evidências' }, { tela: 'soa', rotulo: 'Abrir a declaração de aplicabilidade' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Situação, cobertura e local do pacote informados' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos dez controles implementados na declaração', entidade: 'controles_implementados', minimo: 10 },
      { tipo: 'responsavel_e_prazo', rotulo: 'Responsável e prazo para fechar as evidências que faltam' },
    ],
  },
  {
    id: 'p34_3', fase: 34, ordem: 4,
    titulo: 'Emitir a declaração de prontidão do consultor',
    clausula: 'Cl 9.2 e 9.3',
    porQue: 'A declaração não substitui a auditoria do organismo: registra, com base em evidências, que os pré-requisitos estão cumpridos (auditoria interna e análise crítica concluídas, não conformidades tratadas) e o que ainda merece atenção. A decisão de seguir para a certificação é da direção da organização.',
    campos: [
      { id: 'summary', rotulo: 'Como está o sistema hoje, em poucas linhas?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Sistema em operação há seis meses, com indicadores medidos todo mês e uma auditoria interna completa.' },
      { id: 'done', rotulo: 'Quais pré-requisitos já estão cumpridos?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Auditoria interna concluída; análise crítica feita; não conformidades tratadas; declaração de aplicabilidade aprovada.' },
      { id: 'attention', rotulo: 'Quais pontos de atenção restam?', tipo: 'texto_longo', obrigatorio: false, exemplo: 'A evidência do teste de restauração do backup vence antes da auditoria.' },
      { id: 'recommendation', rotulo: 'Qual a recomendação do consultor?', tipo: 'escolha', obrigatorio: true, exemplo: '', opcoes: ['Pronto para a auditoria de certificação', 'Pronto com ressalvas', 'Ainda não recomendado'] },
      { id: 'direction_decision', rotulo: 'Quem da direção recebeu a declaração e decidiu seguir?', tipo: 'texto', obrigatorio: false, semIA: true, exemplo: 'Nome e cargo, com a data da decisão.' },
    ],
    prova: { descricao: 'Declaração assinada pelo consultor e entregue à direção.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'certification', rotulo: 'Abrir a prontidão para certificação' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Resumo, pré-requisitos e recomendação escritos' },
      { tipo: 'evidencia_anexada', rotulo: 'Declaração assinada anexada' },
    ],
    gera: 'documento',
  },

  // ── Fase 35: Preparação para a etapa 1 ─────────────────────────────────────
  {
    id: 'p35_1', fase: 35, ordem: 1,
    titulo: 'Apoiar o organismo na etapa 1 da auditoria de certificação',
    clausula: 'Auditoria de certificação',
    porQue: 'Na etapa 1, o organismo certificador avalia a informação documentada do sistema, as condições do local e a preparação para a etapa 2. Envie o que for pedido no prazo combinado e registre o que foi enviado e quando.',
    campos: [
      { id: 'sent_docs', rotulo: 'Quais documentos foram enviados ao organismo?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Escopo, política de segurança, declaração de aplicabilidade, relatório de riscos, relatório da auditoria interna e ata da análise crítica.' },
      { id: 'sent_date', rotulo: 'Em que data foram enviados?', tipo: 'data', obrigatorio: true, exemplo: '' },
      { id: 'docs_complete', rotulo: 'A documentação obrigatória está completa e aprovada?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Parcial', 'Não'], pergunta: 'p35_q1' },
      { id: 'evidence_organized', rotulo: 'As evidências estão organizadas e rastreáveis?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Parcial', 'Não'], pergunta: 'p35_q2' },
    ],
    prova: { descricao: 'Registro dos documentos enviados e da agenda da etapa 1.', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [{ tela: 'certification', rotulo: 'Abrir a prontidão para certificação' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Documentos enviados e data de envio preenchidos' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos um documento vigente no n.360', entidade: 'documentos_vigentes', minimo: 1 },
      { tipo: 'responsavel_e_prazo', rotulo: 'Responsável e prazo definidos no passo' },
    ],
  },
  {
    id: 'p35_2', fase: 35, ordem: 2,
    titulo: 'Registrar as observações do auditor na etapa 1',
    clausula: 'Auditoria de certificação',
    porQue: 'Registre cada observação do auditor com a referência do requisito: são os pontos que ele vai verificar primeiro na etapa 2. O relatório da etapa 1 diz se o sistema está pronto para seguir ou se há lacunas a fechar antes.',
    campos: [
      { id: 'findings', rotulo: 'Quais observações o auditor registrou, com a referência do requisito?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Observação 1: sem evidência de revisão de acessos (A.5.18). Observação 2: escopo do certificado diferente do escopo da política (Cl 4.3).' },
      { id: 'report_date', rotulo: 'Quando o relatório da etapa 1 foi recebido?', tipo: 'data', obrigatorio: false, exemplo: '' },
    ],
    prova: { descricao: 'Relatório da etapa 1 e a lista de observações.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'certification', rotulo: 'Abrir a prontidão para certificação' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Observações do auditor escritas, com o requisito' },
      { tipo: 'evidencia_anexada', rotulo: 'Relatório da etapa 1 anexado' },
    ],
  },

  // ── Fase 36: Correções depois da etapa 1 ───────────────────────────────────
  {
    id: 'p36_1', fase: 36, ordem: 1,
    titulo: 'Tratar as lacunas apontadas na etapa 1',
    clausula: 'Auditoria de certificação',
    porQue: 'As lacunas da etapa 1 precisam estar tratadas antes da etapa 2, porque o auditor volta a elas. Para cada uma, registre a ação, o responsável, o prazo e a evidência da correção.',
    campos: [
      { id: 'treated', rotulo: 'Os achados da etapa 1 foram tratados?', tipo: 'escolha', obrigatorio: true, exemplo: '', opcoes: ['Todos', 'Alguns', 'Nenhum'], pergunta: 'p36_q1' },
      { id: 'plan', rotulo: 'Qual o plano e o prazo para as pendências que restam?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Observação 1: criar a rotina de revisão de acessos; responsável: gerente de TI; prazo: 15/06; evidência: primeira revisão assinada.', pergunta: 'p36_q2' },
    ],
    prova: { descricao: 'Plano de correção com a situação de cada lacuna.', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [{ tela: 'capa', rotulo: 'Abrir as ações corretivas' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Situação dos achados e plano com prazo escritos' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos uma ação corretiva cadastrada', entidade: 'acoes_corretivas', minimo: 1 },
      { tipo: 'responsavel_e_prazo', rotulo: 'Responsável e prazo definidos no passo' },
    ],
  },
  {
    id: 'p36_2', fase: 36, ordem: 2,
    titulo: 'Ajustar a documentação conforme o retorno do auditor',
    clausula: 'Cl 7.5.2 e 7.5.3',
    porQue: 'Documento corrigido segue o mesmo controle de atualização (identificação, análise e aprovação, Cl 7.5.2) e de versão (Cl 7.5.3) dos demais. O auditor da etapa 2 compara a versão nova com a observação que a motivou.',
    campos: [
      { id: 'docs', rotulo: 'Quais documentos mudaram, o que mudou e por qual observação?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Política de controle de acesso: incluída a revisão semestral, por causa da observação 3 da etapa 1.' },
      { id: 'versions', rotulo: 'Quais são as novas versões e quem as aprovou?', tipo: 'texto_longo', obrigatorio: false, semIA: true, exemplo: 'Versão 1.1, aprovada pelo comitê de segurança em 05/08.' },
    ],
    prova: { descricao: 'Documentos com a nova versão aprovada e o registro da mudança.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'documentos', rotulo: 'Abrir os documentos' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Documentos, mudanças e observações relacionadas escritos' },
      { tipo: 'evidencia_anexada', rotulo: 'Documentos com a nova versão anexados' },
      { tipo: 'pedido_de_aprovacao', rotulo: 'Pedido de aprovação do documento aprovado', pedidoTipo: 'documento', situacao: 'aprovado' },
    ],
    gera: 'documento',
  },

  // ── Fase 37: Preparação para a etapa 2 ─────────────────────────────────────
  {
    id: 'p37_1', fase: 37, ordem: 1,
    titulo: 'Simular as entrevistas da etapa 2 e fechar as pendências',
    clausula: 'Auditoria de certificação',
    porQue: 'Na etapa 2, o auditor entrevista quem executa os processos e pede para ver o registro na hora. A simulação ajuda as pessoas a mostrar o que fazem e onde está a evidência, sem decorar resposta, e confirma que as constatações da etapa 1 estão fechadas.',
    campos: [
      { id: 'date', rotulo: 'Em que data foi a simulação?', tipo: 'data', obrigatorio: true, exemplo: '' },
      { id: 'areas', rotulo: 'Que áreas e pessoas foram preparadas?', tipo: 'texto_longo', obrigatorio: true, semIA: true, exemplo: 'TI, RH, Jurídico e recepção: gerente e dois integrantes de cada área.' },
      { id: 'faq', rotulo: 'Quais perguntas prováveis, respostas e evidências foram combinadas?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Como é concedido um acesso? Mostra a solicitação aprovada no sistema de chamados.' },
      { id: 'nc_treated', rotulo: 'As não conformidades da etapa 1 foram tratadas e verificadas?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Todas', 'Algumas', 'Nenhuma'], pergunta: 'p37_q3' },
      { id: 'simulado', rotulo: 'Foi feita auditoria interna ou simulado cobrindo o escopo do certificado?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Parcial', 'Não'], pergunta: 'p37_q4' },
    ],
    prova: { descricao: 'Registro da simulação, com os pontos fracos encontrados.', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [{ tela: 'audits', rotulo: 'Abrir o programa de auditorias' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Data, pessoas preparadas e perguntas combinadas escritas' },
      { tipo: 'responsavel_e_prazo', rotulo: 'Responsável e prazo definidos no passo' },
    ],
  },
  {
    id: 'p37_2', fase: 37, ordem: 2,
    titulo: 'Organizar documentação, evidências, agenda e sala da auditoria',
    clausula: 'Auditoria de certificação',
    porQue: 'Documentação completa, evidências localizáveis por controle, agenda combinada, sala reservada e um acompanhante por área evitam tempo perdido e deixam o auditor concentrado no que importa.',
    campos: [
      { id: 'agenda', rotulo: 'Qual a agenda acordada com o auditor?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Dia 1: abertura e liderança. Dia 2: operações e TI. Dia 3: encerramento.' },
      { id: 'room', rotulo: 'Qual a sala, o acesso à rede e quem acompanhará o auditor?', tipo: 'texto_longo', obrigatorio: true, semIA: true, exemplo: 'Sala 3 reservada, rede de visitantes, um acompanhante por área e crachá de visitante.' },
      { id: 'evidence_access', rotulo: 'Como o auditor acessará as evidências?', tipo: 'texto_longo', obrigatorio: false, exemplo: 'Portal do auditor no n.360, somente leitura, com acesso por link.' },
      { id: 'docs_complete', rotulo: 'A documentação obrigatória do sistema (e do programa de privacidade, se estiver no escopo) está completa e aprovada?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Parcial', 'Não'], pergunta: 'p37_q1' },
      { id: 'evidence_by_control', rotulo: 'As evidências dos controles estão organizadas e rastreáveis por controle?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Parcial', 'Não'], pergunta: 'p37_q2' },
    ],
    prova: { descricao: 'Agenda confirmada com o organismo e lista de acompanhantes.', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [{ tela: 'evidence', rotulo: 'Abrir as evidências' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Agenda, sala e acompanhantes definidos' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos um documento vigente no n.360', entidade: 'documentos_vigentes', minimo: 1 },
      { tipo: 'responsavel_e_prazo', rotulo: 'Responsável e prazo definidos no passo' },
    ],
  },

  // ── Fase 38: Atendimento ao auditor na etapa 2 ─────────────────────────────
  {
    id: 'p38_2', fase: 38, ordem: 1,
    titulo: 'Acompanhar a auditoria e fornecer as evidências pedidas',
    clausula: 'Auditoria de certificação',
    porQue: 'Durante a etapa 2, o auditor pede evidências de controles e processos por amostragem. Registre cada pedido e quando foi entregue: pedido sem resposta pode virar constatação, e resposta rápida e organizada mostra um sistema sob controle.',
    campos: [
      { id: 'total_requested', rotulo: 'Quantas evidências o auditor pediu?', tipo: 'texto', obrigatorio: true, exemplo: '42' },
      { id: 'provided', rotulo: 'Quantas foram fornecidas?', tipo: 'texto', obrigatorio: true, exemplo: '40, as outras duas no dia seguinte' },
      { id: 'issues', rotulo: 'Alguma evidência não foi encontrada? Qual?', tipo: 'texto_longo', obrigatorio: false, exemplo: 'Registro da revisão de acessos de junho; localizado no dia seguinte no sistema de chamados.' },
      { id: 'owners_ready', rotulo: 'Os responsáveis pelos controles e as pessoas entrevistadas estão preparados?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Parcial', 'Não'], pergunta: 'p38_q1' },
      { id: 'evidence_contact', rotulo: 'Há um responsável por conduzir a evidência durante a auditoria?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Não'], pergunta: 'p38_q2' },
      { id: 'focus_areas', rotulo: 'Quais áreas ou processos o organismo indicou como foco da etapa 2?', tipo: 'texto_longo', obrigatorio: false, exemplo: 'Gestão de acessos, desenvolvimento seguro e resposta a incidentes.', pergunta: 'p38_q3' },
      { id: 'opening_logistics', rotulo: 'A reunião de abertura e a logística (acessos, salas, remoto) estão acordadas?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Parcial', 'Não'], pergunta: 'p38_q4' },
    ],
    prova: { descricao: 'Lista de pedidos do auditor com a data de entrega de cada um.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'evidence', rotulo: 'Abrir as evidências' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Pedidos e entregas contados' },
      { tipo: 'evidencia_anexada', rotulo: 'Lista de pedidos e entregas anexada' },
    ],
  },
  {
    id: 'p38_3', fase: 38, ordem: 2,
    titulo: 'Registrar as observações do auditor',
    clausula: 'Auditoria de certificação',
    porQue: 'Observações e oportunidades de melhoria não são não conformidades, mas o auditor da supervisão vai perguntar o que foi feito com elas. Registre cada uma com a resposta planejada.',
    campos: [
      { id: 'observations', rotulo: 'Quais observações o auditor fez durante a etapa 2?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Oportunidade: automatizar o aviso de desligamento de pessoas. Observação: ata do comitê sem lista de presença.' },
      { id: 'response', rotulo: 'O que a organização pretende fazer com cada uma?', tipo: 'texto_longo', obrigatorio: false, exemplo: 'Automatizar o aviso de desligamento até o fim do ano; incluir lista de presença no modelo de ata.' },
    ],
    prova: { descricao: 'Lista de observações do auditor com a resposta planejada.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'capa', rotulo: 'Abrir as ações corretivas' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Observações do auditor escritas' },
      { tipo: 'evidencia_anexada', rotulo: 'Lista de observações anexada' },
    ],
    gera: 'documento',
  },
  {
    id: 'p38_4', fase: 38, ordem: 3,
    titulo: 'Encerrar formalmente a auditoria',
    clausula: 'Auditoria de certificação',
    porQue: 'Na reunião de encerramento, o auditor apresenta as conclusões e as não conformidades encontradas; a decisão de certificar é do organismo, depois de analisar o relatório (ISO/IEC 17021-1, 9.5). Registre o resultado comunicado e os prazos para o tratamento.',
    campos: [
      { id: 'date', rotulo: 'Em que data foi o encerramento?', tipo: 'data', obrigatorio: true, exemplo: '' },
      { id: 'result', rotulo: 'Qual resultado o auditor comunicou?', tipo: 'escolha', obrigatorio: true, exemplo: '', opcoes: ['Recomendação para certificação', 'Certificação com NCs menores (prazo do organismo)', 'NCs maiores (re-auditoria)', 'Não certificado'] },
      { id: 'notes', rotulo: 'Que prazos e observações o auditor informou?', tipo: 'texto_longo', obrigatorio: false, exemplo: 'Duas não conformidades menores; plano de ação em até 30 dias.' },
    ],
    prova: { descricao: 'Registro da reunião de encerramento, com o resultado comunicado.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'certification', rotulo: 'Abrir a prontidão para certificação' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Data e resultado comunicado preenchidos' },
      { tipo: 'evidencia_anexada', rotulo: 'Registro da reunião de encerramento anexado' },
    ],
  },

  // ── Fase 39: Resultado e certificado ───────────────────────────────────────
  {
    id: 'p39_1', fase: 39, ordem: 1,
    titulo: 'Analisar o relatório oficial da auditoria',
    clausula: 'Cl 10.2',
    porQue: 'O relatório oficial do organismo é a base das ações corretivas (Cl 10.2) e da preparação para as supervisões. Confira se o escopo descrito é o acordado e se cada não conformidade cita o requisito.',
    campos: [
      { id: 'summary', rotulo: 'Qual o resumo do relatório?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Sistema implementado e eficaz; duas não conformidades menores (A.5.18 e Cl 9.3.3) e uma oportunidade de melhoria.' },
      { id: 'result', rotulo: 'Qual o resultado?', tipo: 'escolha', obrigatorio: true, exemplo: '', opcoes: ['Certificado', 'Certificado com observações', 'Não conformidades menores (prazo do organismo para correção)', 'Não conformidades maiores (nova auditoria necessária)'] },
      { id: 'nc_found', rotulo: 'Houve não conformidades na etapa 2?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Nenhuma', 'Só menores', 'Maiores e menores'], pergunta: 'p39_q1' },
    ],
    prova: { descricao: 'Relatório oficial do organismo certificador.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'certification', rotulo: 'Abrir a prontidão para certificação' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Resumo e resultado do relatório preenchidos' },
      { tipo: 'evidencia_anexada', rotulo: 'Relatório oficial anexado' },
    ],
    gera: 'documento',
  },
  {
    id: 'p39_2', fase: 39, ordem: 2,
    titulo: 'Tratar as não conformidades da auditoria de certificação',
    clausula: 'Cl 10.2',
    porQue: 'O organismo define no relatório o prazo para a correção, a análise da causa e a ação corretiva de cada não conformidade (Cl 10.2) e confere a evidência antes de decidir a certificação; não conformidade maior precisa estar resolvida antes. Cumpra o prazo e guarde o que enviou.',
    campos: [
      { id: 'total', rotulo: 'Quantas não conformidades o relatório trouxe?', tipo: 'texto', obrigatorio: true, exemplo: '2 menores' },
      { id: 'corrected', rotulo: 'Quantas já foram corrigidas?', tipo: 'texto', obrigatorio: true, exemplo: '1 de 2' },
      { id: 'deadline', rotulo: 'Até quando o organismo deu prazo?', tipo: 'data', obrigatorio: false, exemplo: '' },
      { id: 'plan_accepted', rotulo: 'O plano de ação corretiva (causa e correção) foi aceito pelo organismo?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Em análise', 'Não'], pergunta: 'p39_q2' },
      { id: 'deadline_agreed', rotulo: 'Qual o prazo acordado para tratar as não conformidades e comprovar a eficácia?', tipo: 'texto_longo', obrigatorio: false, exemplo: 'Plano em 30 dias; evidência da correção em 90 dias, verificada na primeira supervisão.', pergunta: 'p39_q3' },
      { id: 'evidence_desc', rotulo: 'Que evidências foram enviadas ao organismo?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Plano de ação, registro da revisão de acessos de 20/07 e a ata corrigida da análise crítica.' },
    ],
    prova: { descricao: 'Plano de ação aceito pelo organismo e as evidências enviadas.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'capa', rotulo: 'Abrir as ações corretivas' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Total, corrigidas e evidências enviadas preenchidos' },
      { tipo: 'evidencia_anexada', rotulo: 'Plano de ação e evidências enviadas anexados' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos uma ação corretiva cadastrada', entidade: 'acoes_corretivas', minimo: 1 },
    ],
  },
  {
    id: 'p39_3', fase: 39, ordem: 3,
    titulo: 'Conferir o certificado recebido',
    clausula: 'Certificação',
    porQue: 'Confira no certificado a norma, o escopo, as localidades e a validade. O ciclo de certificação é de três anos, com auditorias de supervisão no período (ISO/IEC 17021-1, 9.6).',
    campos: [
      { id: 'cert_date', rotulo: 'Em que data o certificado foi emitido?', tipo: 'data', obrigatorio: true, exemplo: '' },
      { id: 'cert_body', rotulo: 'Qual o organismo certificador?', tipo: 'texto', obrigatorio: true, exemplo: 'Nome do organismo, como está no certificado.' },
      { id: 'cert_number', rotulo: 'Qual o número do certificado?', tipo: 'texto', obrigatorio: false, exemplo: 'Número impresso no certificado.' },
      { id: 'validity', rotulo: 'Até quando o certificado é válido?', tipo: 'data', obrigatorio: false, exemplo: '' },
      { id: 'scope', rotulo: 'Qual o escopo que consta no certificado?', tipo: 'texto_longo', obrigatorio: false, exemplo: 'Desenvolvimento e operação da plataforma de vendas online, na sede de São Paulo.' },
    ],
    prova: { descricao: 'Certificado emitido pelo organismo certificador acreditado.', obrigatoria: true, aceita: 'arquivo' },
    ondeVive: [{ tela: 'certification', rotulo: 'Abrir a prontidão para certificação' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Data de emissão e organismo preenchidos' },
      { tipo: 'evidencia_anexada', rotulo: 'Certificado anexado' },
    ],
  },
  {
    id: 'p39_4', fase: 39, ordem: 4,
    titulo: 'Comunicar a certificação internamente',
    clausula: 'Cl 7.4',
    porQue: 'A cláusula 7.4 pede definir o que, quando, com quem e como comunicar sobre o sistema. Comunicar a certificação reforça o compromisso de todos; o uso da marca de certificação segue as regras do organismo certificador.',
    campos: [
      { id: 'date', rotulo: 'Em que data a comunicação foi feita?', tipo: 'data', obrigatorio: true, exemplo: '' },
      { id: 'channels', rotulo: 'Por quais canais e para quem?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'E-mail a todas as pessoas do escopo e apresentação na reunião geral do mês.' },
      { id: 'message', rotulo: 'Qual foi a mensagem e como a marca do certificado será usada?', tipo: 'texto_longo', obrigatorio: false, exemplo: 'Agradecimento à equipe; marca usada só no site e nas propostas, conforme as regras do organismo.' },
    ],
    prova: { descricao: 'Comunicado enviado.', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Data, canais e público preenchidos' },
      { tipo: 'responsavel_e_prazo', rotulo: 'Responsável e prazo definidos no passo' },
    ],
  },

  // ── Fase 40: Manutenção e supervisão ───────────────────────────────────────
  {
    id: 'p40_1', fase: 40, ordem: 1,
    titulo: 'Montar o calendário das auditorias de supervisão',
    clausula: 'Certificação',
    porQue: 'Depois do certificado, o organismo faz auditorias de supervisão ao menos uma vez por ano (a primeira em até 12 meses da decisão de certificação) e, ao fim dos três anos, a recertificação (ISO/IEC 17021-1, 9.6). O calendário deve incluir a auditoria interna e a análise crítica que precisam acontecer antes de cada uma.',
    campos: [
      { id: 'schedule', rotulo: 'Quais são as datas previstas das supervisões e da recertificação?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Ano 1: supervisão em maio. Ano 2: supervisão em maio. Ano 3: recertificação em abril.' },
      { id: 'calendar_defined', rotulo: 'Há calendário de auditorias de supervisão definido?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Parcial', 'Não'], pergunta: 'p40_q1' },
    ],
    prova: { descricao: 'Calendário acordado com o organismo certificador.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'audits', rotulo: 'Abrir o programa de auditorias' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Datas das supervisões e da recertificação escritas' },
      { tipo: 'evidencia_anexada', rotulo: 'Calendário acordado com o organismo anexado' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos uma auditoria agendada', entidade: 'auditorias', minimo: 1 },
    ],
    gera: 'documento',
  },
  {
    id: 'p40_2', fase: 40, ordem: 2,
    titulo: 'Manter a melhoria contínua do sistema',
    clausula: 'Cl 10.1 e 9.3',
    porQue: 'A organização melhora continuamente a adequação, a suficiência e a eficácia do sistema (Cl 10.1). Na supervisão, o auditor procura melhorias reais desde a última visita, o programa de auditoria interna do novo ciclo e a reavaliação dos riscos residuais aceitos.',
    campos: [
      { id: 'improvements', rotulo: 'Que melhorias foram implementadas no período?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Automação da revisão de acessos; prazo de correção de vulnerabilidades reduzido de 30 para 15 dias.' },
      { id: 'source', rotulo: 'De onde veio cada melhoria?', tipo: 'texto_longo', obrigatorio: false, exemplo: 'Auditoria interna, incidente, indicador ou sugestão de colaborador.' },
      { id: 'next_program', rotulo: 'O programa de auditoria interna do próximo ciclo foi aprovado?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Em elaboração', 'Não'], pergunta: 'p40_q2' },
      { id: 'residual_ok', rotulo: 'Os riscos residuais aceitos continuam aceitáveis na análise crítica?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Reavaliar', 'Não'], pergunta: 'p40_q3' },
    ],
    prova: { descricao: 'Registro das melhorias, com a origem e o resultado de cada uma.', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [{ tela: 'management-review', rotulo: 'Abrir a análise crítica' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Melhorias do período descritas' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos uma auditoria agendada para o próximo ciclo', entidade: 'auditorias', minimo: 1 },
      { tipo: 'responsavel_e_prazo', rotulo: 'Responsável e prazo definidos no passo' },
    ],
  },
  {
    id: 'p40_3', fase: 40, ordem: 3,
    titulo: 'Planejar a recertificação (fim dos três anos)',
    clausula: 'Certificação',
    porQue: 'A recertificação acontece antes do vencimento do certificado de três anos e avalia o sistema inteiro de novo (ISO/IEC 17021-1, 9.6). Mudanças de escopo e de versão da norma são combinadas com o organismo com antecedência.',
    campos: [
      { id: 'expiry', rotulo: 'Quando o certificado vence?', tipo: 'data', obrigatorio: true, exemplo: '' },
      { id: 'plan', rotulo: 'Qual o plano até a recertificação?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Auditoria interna completa seis meses antes; análise crítica três meses antes; reserva da data com o organismo.' },
      { id: 'changes', rotulo: 'Que mudanças relevantes ocorreram desde a certificação?', tipo: 'texto_longo', obrigatorio: false, exemplo: 'Nova unidade em Curitiba, novo provedor de nuvem e nova versão da norma.' },
      { id: 'recert_planned', rotulo: 'A recertificação (fim do ciclo de três anos) está planejada?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'A planejar', 'Não se aplica ainda'], pergunta: 'p40_q4' },
    ],
    prova: { descricao: 'Plano de recertificação aprovado.', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [{ tela: 'certification', rotulo: 'Abrir a prontidão para certificação' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Vencimento e plano até a recertificação escritos' },
      { tipo: 'responsavel_e_prazo', rotulo: 'Responsável e prazo definidos no passo' },
    ],
  },
];
