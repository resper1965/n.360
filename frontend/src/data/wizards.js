// Assistentes de documento e de evidência da trilha de implementação, um por item do checklist.
// A chave é o id do item em PHASE_CHECKLISTS (src/constants.ts); o tema do assistente é o tema do item.
// frontend/test/trilha-mapa.test.js reprova chave que não existe no checklist e item sem assistente.
// `evidenceOnly`: monta o registro na tela, sem IA. Sem a flag, o texto vem da IA como rascunho e só vira
// evidência (e conclui o item) quando a pessoa aprova. `auditorTip` e `evidence` também alimentam a "Dica".
export const DOC_WIZARDS = {
  // ─── Fase 0 ───
  p0_1: {
    title: 'Nomeação do Sponsor e da Equipe do Projeto',
    fields: [
      { id: 'sponsor_name', label: 'Nome completo do patrocinador', type: 'text', required: true, placeholder: 'Ex: João Silva' },
      { id: 'sponsor_role', label: 'Cargo', type: 'text', required: true, placeholder: 'Ex: CEO, CTO, CISO' },
      { id: 'sponsor_authority', label: 'Nível de autoridade sobre orçamento de SI', type: 'select', options: ['Total (C-Level)', 'Parcial (Diretor)', 'Limitada (Gerente)'] },
      { id: 'team_members', label: 'Equipe do projeto (nome — cargo — papel no SGSI)', type: 'textarea', placeholder: 'Ex:\nMaria Santos — Gerente de TI — líder do SGSI\nCarlos Lima — Jurídico — encarregado de dados\nAna Souza — RH — conscientização' }
    ],
    auditorTip: 'A alta direção demonstra liderança (5.1) e atribui papéis, responsabilidades e autoridades do SGSI (5.3). O auditor procura a nomeação formal do patrocinador, com poder sobre recursos, e da equipe.',
    evidence: 'Termo de nomeação ou ata assinada pela direção, com nomes, cargos e papéis.',
    isoRef: 'Cl 5.1, 5.3'
  },
  p0_2: {
    title: 'Apresentação da Metodologia',
    evidenceOnly: true,
    fields: [
      { id: 'date', label: 'Data da apresentação', type: 'date', required: true },
      { id: 'audience', label: 'Público presente (nome e cargo)', type: 'textarea', required: true, placeholder: 'Ex:\nJoão Silva — Diretor-geral\nMaria Santos — Gerente de TI' },
      { id: 'topics', label: 'Conteúdo apresentado', type: 'textarea', required: true, placeholder: 'Ex:\nFases da jornada (diagnóstico, planejamento, implementação, auditoria)\nPapéis da equipe e da consultoria\nCritérios de aceite das entregas\nCronograma macro' },
      { id: 'material', label: 'Onde está o material apresentado', type: 'text', placeholder: 'Ex: pasta do projeto, Apresentacao_Kickoff_v1.pdf' }
    ],
    auditorTip: 'A norma pede definir o que, quando, a quem e por quem comunicar sobre o SGSI (7.4), e que as pessoas conheçam a contribuição delas para o sistema (7.3). A apresentação da metodologia é a primeira dessas comunicações: guarde o material e a lista de presença.',
    evidence: 'Material apresentado e lista de presença.',
    isoRef: 'Cl 7.3, 7.4'
  },
  p0_3: {
    title: 'Ata da Reunião de Kick-off',
    evidenceOnly: true,
    fields: [
      { id: 'date', label: 'Data do kick-off', type: 'date', required: true },
      { id: 'participants', label: 'Participantes (nome e cargo)', type: 'textarea', required: true, placeholder: 'Ex:\nJoão Silva — CEO\nMaria Santos — CISO\nPedro Oliveira — CTO' },
      { id: 'agenda', label: 'Pauta principal', type: 'textarea', required: true, placeholder: 'Ex: Apresentação do projeto, escopo preliminar, cronograma, próximos passos' },
      { id: 'decisions', label: 'Decisões tomadas', type: 'textarea', placeholder: 'Ex: Aprovação do cronograma, nomeação da equipe, definição de reuniões semanais' },
      { id: 'next_steps', label: 'Próximos passos', type: 'textarea', placeholder: 'Ex: Agendar entrevistas executivas, iniciar gap assessment' }
    ],
    auditorTip: 'A ata do kick-off, com a presença da alta direção, é a primeira evidência de comprometimento da liderança com o SGSI. Deve trazer data, participantes, pauta, decisões e próximos passos com responsáveis.',
    evidence: 'Ata aprovada pelos participantes, com lista de presença.',
    isoRef: 'Cl 5.1'
  },
  p0_4: {
    title: 'Cronograma Macro do Projeto',
    fields: [
      { id: 'start_date', label: 'Data de início do projeto', type: 'date', required: true },
      { id: 'target_cert', label: 'Data pretendida de certificação', type: 'date', required: true },
      { id: 'milestones', label: 'Marcos principais', type: 'textarea', required: true, placeholder: 'Ex:\nMês 1-2: Diagnóstico e Gap\nMês 3-4: Documentação\nMês 5-6: Implementação\nMês 7: Auditoria Interna\nMês 8: Certificação, fase 1\nMês 9: Certificação, fase 2' },
      { id: 'resources', label: 'Recursos alocados', type: 'textarea', placeholder: 'Ex: 2 consultores externos, CISO interno 50%, equipe TI 20%' }
    ],
    auditorTip: 'Ao planejar como alcançar os objetivos de segurança, a norma pede o que será feito, com quais recursos, por quem, até quando e como os resultados serão avaliados. O cronograma aprovado pelo sponsor responde a isso; revisões ficam registradas.',
    evidence: 'Cronograma com o registro de aprovação do sponsor (e-mail, ata ou assinatura).',
    isoRef: 'Cl 6.2'
  },
  p0_5: {
    title: 'Canais de Comunicação Interna do SGSI',
    evidenceOnly: true,
    fields: [
      { id: 'channels', label: 'Canais definidos para comunicação do SGSI', type: 'textarea', required: true, placeholder: 'Ex:\n- E-mail: sgsi@empresa.com\n- Slack: #sgsi-projeto\n- Reuniões semanais: Terça 10h\n- SharePoint: /SGSI/Documentos' },
      { id: 'internal_comm', label: 'Como a organização comunicará o SGSI internamente?', type: 'select', options: ['Intranet + e-mail', 'Reuniões all-hands', 'Newsletter interna', 'Portal dedicado'] },
      { id: 'owner', label: 'Quem é responsável por comunicar', type: 'text', placeholder: 'Ex: líder do SGSI, com apoio da Comunicação Interna' }
    ],
    auditorTip: 'A organização define o que comunicar sobre o SGSI, quando, a quem, quem comunica e como. O auditor verifica se os canais existem e se são de fato usados.',
    evidence: 'Plano de comunicação com canais, público, responsáveis e frequência.',
    isoRef: 'Cl 7.4'
  },
  // ─── Fase 1 ───
  p1_1: {
    title: 'Entrevista Executiva',
    evidenceOnly: true,
    fields: [
      { id: 'exec_names', label: 'Executivos a serem entrevistados', type: 'textarea', required: true, placeholder: 'Ex: CEO — João Silva\nCTO — Maria Santos\nCFO — Carlos Lima' },
      { id: 'dates', label: 'Datas das entrevistas', type: 'textarea', placeholder: 'Ex: CEO: 15/01, CTO: 16/01, CFO: 17/01' },
      { id: 'topics', label: 'Temas principais da entrevista', type: 'textarea', placeholder: 'Visão de segurança, apetite de risco, governança, orçamento, incidentes' },
      { id: 'expectations', label: 'Expectativas declaradas pela direção', type: 'textarea', required: true, placeholder: 'Ex: atender exigência de clientes, reduzir incidentes, certificar até o fim do ano' }
    ],
    auditorTip: 'O que a direção espera do SGSI orienta escopo, objetivos e apetite a risco. Registre quem foi ouvido e o que foi dito: é insumo da análise de contexto (4.1) e evidência do envolvimento da liderança (5.1).',
    evidence: 'Registro das entrevistas com data, entrevistados e expectativas.',
    isoRef: 'Cl 4.1, 5.1'
  },
  p1_2: {
    title: 'Objetivos de Negócio e de Segurança',
    fields: [
      { id: 'business_goals', label: 'Objetivos de negócio que o SGSI apoia', type: 'textarea', required: true, placeholder: 'Ex:\nAtender exigência de clientes corporativos\nReduzir indisponibilidade dos sistemas de venda\nCumprir a LGPD' },
      { id: 'sec_objectives', label: 'Objetivos de segurança (o quê, meta, prazo, responsável)', type: 'textarea', required: true, placeholder: 'Ex:\nReduzir em 50% os cliques em phishing simulado até dez/2027 — RH\nMFA em 100% dos acessos privilegiados até mar/2027 — TI' },
      { id: 'how_measured', label: 'Como cada objetivo será medido e acompanhado', type: 'textarea', placeholder: 'Ex: indicador mensal no painel do SGSI, revisado na análise crítica' }
    ],
    auditorTip: 'Os objetivos de segurança são coerentes com a política, mensuráveis quando possível, monitorados, comunicados e atualizados. Para cada um, a norma pede o plano: o que será feito, recursos, responsável, prazo e como o resultado será avaliado.',
    evidence: 'Documento de objetivos aprovado, com metas, responsáveis e forma de medição.',
    isoRef: 'Cl 6.2'
  },
  p1_3: {
    title: 'Expectativas de Certificação',
    evidenceOnly: true,
    fields: [
      { id: 'standards', label: 'Norma(s) pretendida(s)', type: 'select', options: ['ISO/IEC 27001', 'ISO/IEC 27001 e ISO/IEC 27701', 'ISO/IEC 27701', 'Ainda não definido'], required: true },
      { id: 'target_date', label: 'Data desejada para a certificação', type: 'date' },
      { id: 'drivers', label: 'Motivações (cliente, contrato, regulação, mercado)', type: 'textarea', required: true, placeholder: 'Ex: exigência contratual de um cliente, participação em licitações' },
      { id: 'body', label: 'Organismo certificador considerado (se houver)', type: 'text', placeholder: 'Ex: ainda em cotação' }
    ],
    auditorTip: 'Expectativa realista evita surpresa: a certificação exige o sistema em operação, com auditoria interna e análise crítica pela direção concluídas antes da auditoria do organismo certificador. Registre a norma, a data desejada e o motivo.',
    evidence: 'Registro das expectativas acordadas com o sponsor.',
    isoRef: 'Certificação'
  },
  // ─── Fase 2 ───
  p2_1: {
    title: 'Entrevistas com Gestores',
    evidenceOnly: true,
    fields: [
      { id: 'interviewees', label: 'Entrevistados (nome — cargo — área)', type: 'textarea', required: true, placeholder: 'Ex:\nMaria Santos — CISO — TI\nCarlos Lima — Encarregado — Jurídico\nAna Souza — Gerente — RH' },
      { id: 'dates', label: 'Datas das entrevistas', type: 'textarea', required: true, placeholder: 'Ex: TI: 15/01, RH: 16/01, Jurídico: 17/01' },
      { id: 'method', label: 'Formato das entrevistas', type: 'select', options: ['Presencial', 'Videoconferência', 'Híbrido', 'Questionário escrito'] },
      { id: 'notes', label: 'Observações gerais', type: 'textarea' }
    ],
    auditorTip: 'As entrevistas com as áreas (TI, RH, Jurídico, Operações) mostram que o contexto e os requisitos das partes interessadas foram levantados com quem conhece o processo, e não presumidos.',
    evidence: 'Registro das entrevistas: quem, quando, formato e principais achados.',
    isoRef: 'Cl 4.1, 4.2'
  },
  p2_2: {
    title: 'Evidências de Práticas Atuais',
    evidenceOnly: true,
    fields: [
      { id: 'practices', label: 'Práticas existentes e onde está a evidência de cada uma', type: 'textarea', required: true, placeholder: 'Ex:\nBackup diário — relatório da ferramenta de backup\nTermo de confidencialidade na admissão — modelo do RH\nAntivírus nas estações — painel do console' },
      { id: 'documents', label: 'Documentos existentes recebidos (políticas, procedimentos, contratos)', type: 'textarea', placeholder: 'Ex: política de senhas de 2023, contrato com o provedor de nuvem' },
      { id: 'declared_only', label: 'Práticas sem evidência (só declaradas)', type: 'textarea', placeholder: 'Ex: revisão de acessos citada na entrevista, sem registro' }
    ],
    auditorTip: 'O diagnóstico vale pelo que pode ser comprovado. Separe o que tem evidência do que é só declarado: o auditor de certificação fará a mesma distinção.',
    evidence: 'Lista de práticas com a evidência correspondente anexada.',
    isoRef: 'Diagnóstico'
  },
  p2_3: {
    title: 'Relatório Consolidado de Entrevistas',
    fields: [
      { id: 'total_areas', label: 'Quantas áreas foram entrevistadas?', type: 'text', required: true },
      { id: 'executive_summary', label: 'Resumo executivo dos achados', type: 'textarea', required: true, placeholder: 'Visão geral do estado de maturidade da organização' },
      { id: 'critical_gaps', label: 'Gaps críticos (cross-functional)', type: 'textarea', required: true, placeholder: 'Gaps que afetam múltiplas áreas' },
      { id: 'maturity_level', label: 'Nível de maturidade estimado', type: 'select', options: ['Inicial (1)', 'Repetível (2)', 'Definido (3)', 'Gerenciado (4)', 'Otimizado (5)'] },
      { id: 'recommendations', label: 'Recomendações prioritárias', type: 'textarea', placeholder: 'Top 5 ações recomendadas' }
    ],
    auditorTip: 'O relatório consolida o que as áreas disseram e o que foi comprovado, e alimenta a análise de contexto, o escopo e a análise de riscos. Achados que atravessam várias áreas costumam ser os de maior impacto.',
    evidence: 'Relatório consolidado de entrevistas, revisado pelo líder do SGSI.',
    isoRef: 'Cl 4.1, 4.2'
  },
  // ─── Fase 3 ───
  p3_1: {
    title: 'Declaração de Escopo do SGSI e do SGPI',
    fields: [
      { id: 'org_name', label: 'Nome da organização', type: 'text', required: true },
      { id: 'locations', label: 'Localidades incluídas', type: 'textarea', required: true, placeholder: 'Ex: Sede São Paulo (Av. Paulista, 1000)\nFilial Rio de Janeiro\nData Center AWS us-east-1' },
      { id: 'systems', label: 'Sistemas e infraestrutura incluídos', type: 'textarea', required: true, placeholder: 'Ex: ERP SAP, CRM Salesforce, AWS EC2/RDS/S3, rede corporativa' },
      { id: 'processes', label: 'Processos de negócio incluídos', type: 'textarea', required: true, placeholder: 'Ex: Vendas online, gestão financeira, RH, suporte ao cliente' },
      { id: 'exclusions', label: 'Exclusões justificadas', type: 'textarea', placeholder: 'Ex: Filial Manaus (operação descontinuada em 2025)' },
      { id: 'people_count', label: 'Número de colaboradores no escopo', type: 'text', placeholder: 'Ex: 250 internos + 50 terceirizados' }
    ],
    auditorTip: 'O escopo considera as questões internas e externas (4.1), os requisitos das partes interessadas (4.2) e as interfaces e dependências com atividades de terceiros. Para o SGPI, deixe claro o papel da organização no tratamento de dados pessoais: controladora, operadora ou ambos.',
    evidence: 'Documento de escopo aprovado e disponível como informação documentada.',
    isoRef: 'Cl 4.3'
  },
  p3_2: {
    title: 'Limites Físicos e Lógicos do Escopo',
    fields: [
      { id: 'physical', label: 'Localidades físicas no escopo', type: 'textarea', required: true, placeholder: 'Endereços completos dos escritórios, data centers, fábricas' },
      { id: 'cloud', label: 'Regiões cloud no escopo', type: 'textarea', placeholder: 'Ex: AWS us-east-1, Azure Brazil South, GCP southamerica-east1' },
      { id: 'remote', label: 'Trabalho remoto incluído?', type: 'select', options: ['Sim, todos os colaboradores remotos', 'Sim, apenas alguns', 'Não, apenas presencial'] },
      { id: 'interfaces', label: 'Interfaces e dependências com terceiros', type: 'textarea', placeholder: 'Ex:\nProvedor de nuvem hospeda os sistemas (fora do controle direto)\nFolha de pagamento terceirizada recebe dados de RH' }
    ],
    auditorTip: 'Limites claros dizem o que o auditor pode visitar e testar: localidades, redes, regiões de nuvem, trabalho remoto e as interfaces com atividades de terceiros que ficam fora do escopo.',
    evidence: 'Descrição dos limites, com diagrama de rede ou de localidades.',
    isoRef: 'Cl 4.3'
  },
  p3_3: {
    title: 'Justificativa de Exclusões de Controles',
    fields: [
      { id: 'excluded', label: 'Controles do Anexo A considerados não aplicáveis', type: 'textarea', required: true, placeholder: 'Ex:\nA.8.30 Desenvolvimento terceirizado\nA.7.12 Segurança do cabeamento' },
      { id: 'reason', label: 'Justificativa de cada exclusão (por que o controle não se aplica)', type: 'textarea', required: true, placeholder: 'Ex:\nA.8.30 — a organização não contrata desenvolvimento de software\nA.7.12 — o cabeamento é do condomínio e está coberto pelo contrato de locação' },
      { id: 'reviewer', label: 'Quem revisou as exclusões', type: 'text', placeholder: 'Ex: líder do SGSI e consultor' }
    ],
    auditorTip: 'A Declaração de Aplicabilidade justifica a exclusão de cada controle do Anexo A. "Não se aplica" sem motivo é não conformidade; o motivo vem do escopo e da análise de riscos, nunca da conveniência ou de o controle ainda não existir. A decisão final é registrada na SoA (fase 12).',
    evidence: 'Lista de controles excluídos com a justificativa de cada um.',
    isoRef: 'Cl 6.1.3 d'
  },
  p3_4: {
    title: 'Aprovação Formal do Escopo',
    evidenceOnly: true,
    fields: [
      { id: 'approver', label: 'Quem aprovou? (nome e cargo)', type: 'text', required: true, placeholder: 'Ex: João Silva — CEO' },
      { id: 'date', label: 'Data da aprovação', type: 'date', required: true },
      { id: 'method', label: 'Método de aprovação', type: 'select', options: ['Ata de reunião', 'E-mail formal', 'Assinatura em documento', 'Deliberação em comitê'], required: true },
      { id: 'reference', label: 'Referência do documento aprovado', type: 'text', placeholder: 'Ex: DOC-ESC-001 v1.0' },
      { id: 'notes', label: 'Observações', type: 'textarea', placeholder: 'Condições, ressalvas ou comentários da direção' }
    ],
    auditorTip: 'O auditor pede a evidência de que a alta direção revisou e aprovou o escopo do SGSI. Aprovação verbal não conta.',
    evidence: 'Ata, e-mail formal ou assinatura da direção aprovando a versão do escopo.',
    isoRef: 'Cl 4.3'
  },
  // ─── Fase 4 ───
  p4_1: {
    title: 'Diagnóstico de Lacunas',
    evidenceOnly: true,
    fields: [
      { id: 'assessment_method', label: 'Método de avaliação utilizado', type: 'select', options: ['Entrevistas + evidências', 'Questionário + validação', 'Auditoria interna', 'Auto-avaliação'], required: true },
      { id: 'total_controls', label: 'Total de controles avaliados', type: 'text', placeholder: 'Ex: 93 (Anexo A completo)' },
      { id: 'compliant', label: 'Controles conformes', type: 'text', placeholder: 'Ex: 35' },
      { id: 'partial', label: 'Controles parcialmente implementados', type: 'text', placeholder: 'Ex: 28' },
      { id: 'non_compliant', label: 'Controles não conformes', type: 'text', placeholder: 'Ex: 30' },
      { id: 'critical_gaps', label: 'Gaps críticos identificados', type: 'textarea', required: true, placeholder: 'Liste os gaps mais graves que requerem ação imediata' }
    ],
    auditorTip: 'O diagnóstico compara a situação atual com cada requisito das cláusulas 4 a 10 e com os controles do Anexo A. Registre o método e a contagem: o mesmo critério será usado para medir a evolução até a certificação.',
    evidence: 'Planilha ou relatório do diagnóstico, com o método e o resultado por requisito.',
    isoRef: 'Cl 4 a 10, Anexo A'
  },
  p4_2: {
    title: 'Relatório de Lacunas Detalhado',
    fields: [
      { id: 'exec_summary', label: 'Resumo executivo', type: 'textarea', required: true, placeholder: 'Visão geral do estado de conformidade da organização' },
      { id: 'compliance_pct', label: 'Percentual de conformidade atual', type: 'text', required: true, placeholder: 'Ex: 38%' },
      { id: 'top_risks', label: 'Top 5 riscos identificados', type: 'textarea', required: true, placeholder: '1. Sem gestão de vulnerabilidades\n2. Backup sem teste\n3. Sem MFA\n4. Sem programa de awareness\n5. Sem gestão de incidentes' },
      { id: 'roadmap', label: 'Roadmap de remediação sugerido', type: 'textarea', placeholder: 'Prioridade alta → média → baixa com prazos' },
      { id: 'investment', label: 'Investimento estimado', type: 'text', placeholder: 'Ex: R$ 200.000–350.000' }
    ],
    auditorTip: 'O relatório transforma o diagnóstico em decisão: estado atual, lacunas mais graves, caminho de correção e investimento. É a base para a direção aprovar recursos (Cl 7.1).',
    evidence: 'Relatório de lacunas versionado e entregue à direção.',
    isoRef: 'Diagnóstico'
  },
  p4_3: {
    title: 'Apresentação do Diagnóstico à Diretoria',
    evidenceOnly: true,
    fields: [
      { id: 'approver', label: 'Quem aprovou?', type: 'text', required: true },
      { id: 'date', label: 'Data da aprovação', type: 'date', required: true },
      { id: 'method', label: 'Método de aprovação', type: 'select', options: ['Ata de reunião', 'E-mail formal', 'Assinatura em documento', 'Deliberação em comitê'], required: true },
      { id: 'compliance_pct', label: 'Percentual de conformidade aprovado', type: 'text', placeholder: 'Ex: 38%' },
      { id: 'next_steps', label: 'Próximos passos definidos', type: 'textarea' }
    ],
    auditorTip: 'A apresentação mostra que a alta direção conhece o estado atual e assumiu o plano para corrigir as lacunas. Registre quem participou, o que foi decidido e os próximos passos.',
    evidence: 'Ata ou registro da apresentação, com decisões da diretoria.',
    isoRef: 'Cl 5.1'
  },
  // ─── Fase 5 ───
  p5_1: {
    title: 'Comitê de Segurança e Privacidade',
    evidenceOnly: true,
    fields: [
      { id: 'structure', label: 'Estrutura hierárquica do SI', type: 'textarea', required: true, placeholder: 'Descreva a linha de reporte:\nCEO → CISO → Equipe SI\nCEO → Encarregado (independente)' },
      { id: 'committee', label: 'Composição do comitê de SI', type: 'textarea', required: true, placeholder: 'Membros, frequência de reunião, escopo de decisões' },
      { id: 'meeting_freq', label: 'Frequência de reuniões', type: 'select', options: ['Mensal', 'Bimestral', 'Trimestral', 'Semestral'] }
    ],
    auditorTip: 'A norma não exige um comitê, mas exige que a direção atribua e comunique responsabilidades e autoridades. Quando o comitê existe, o auditor pede composição, atribuições, frequência e as atas das reuniões.',
    evidence: 'Ato de criação do comitê (regimento ou ata) e atas das reuniões.',
    isoRef: 'Cl 5.1, 5.3'
  },
  p5_2: {
    title: 'Papéis e Responsabilidades do SGSI',
    fields: [
      { id: 'roles', label: 'Papéis definidos', type: 'textarea', required: true, placeholder: 'Ex:\n- CISO: Responsável geral pelo SGSI\n- Encarregado: Privacidade e proteção de dados\n- Gestor de Riscos: Análise e tratamento\n- Auditor Interno: Auditoria independente' },
      { id: 'raci', label: 'Matriz RACI simplificada', type: 'textarea', placeholder: 'Atividade → Responsável → Aprovador → Consultado → Informado' }
    ],
    auditorTip: 'Papéis e responsabilidades de segurança são definidos e atribuídos conforme as necessidades da organização (A.5.2), incluindo quem garante a conformidade do SGSI e quem reporta o desempenho à direção (5.3).',
    evidence: 'Matriz de papéis e responsabilidades aprovada e comunicada.',
    isoRef: 'Cl 5.3, A.5.2'
  },
  p5_3: {
    title: 'Nomeação do Encarregado (DPO)',
    fields: [
      { id: 'dpo_name', label: 'Nome do encarregado', type: 'text', required: true, placeholder: 'Ex: Carlos Lima' },
      { id: 'dpo_type', label: 'Tipo de encarregado', type: 'select', options: ['Pessoa da organização', 'Pessoa natural externa', 'Pessoa jurídica contratada'], required: true },
      { id: 'act', label: 'Ato formal de indicação (documento e data)', type: 'text', required: true, placeholder: 'Ex: Portaria interna nº 12, de 10/03/2026' },
      { id: 'publication', label: 'Onde a identidade e o contato do encarregado estão divulgados', type: 'textarea', required: true, placeholder: 'Ex: página de privacidade do site, rodapé do portal do cliente' },
      { id: 'conflicts', label: 'Outras funções exercidas e como se evita conflito de interesse', type: 'textarea', placeholder: 'Ex: acumula a Ouvidoria; não decide sobre os tratamentos que avalia' }
    ],
    auditorTip: 'O controlador indica o encarregado por ato formal (LGPD art. 41 e Resolução CD/ANPD nº 18/2024). A identidade e o contato dele são divulgados publicamente, de forma clara, de preferência no site. Registre também como se evita conflito de interesse com outras funções.',
    evidence: 'Ato de indicação assinado e a página pública com o contato do encarregado.',
    isoRef: 'LGPD Art. 41'
  },
  // ─── Fase 6 ───
  p6_1: {
    title: 'Análise de Contexto Interno e Externo',
    fields: [
      { id: 'internal', label: 'Fatores internos relevantes', type: 'textarea', required: true, placeholder: 'Ex: Cultura organizacional, estrutura, estratégia, capacidades técnicas, processos...' },
      { id: 'external', label: 'Fatores externos relevantes', type: 'textarea', required: true, placeholder: 'Ex: Regulamentações (LGPD, BACEN), mercado, concorrência, tecnologia, ameaças cibernéticas...' },
      { id: 'swot', label: 'Análise SWOT (opcional)', type: 'textarea', placeholder: 'Forças, Fraquezas, Oportunidades, Ameaças' }
    ],
    auditorTip: 'A organização determina as questões internas e externas relevantes para o propósito dela e que afetam a capacidade de o SGSI alcançar os resultados pretendidos. Desde a emenda de 2024, inclui avaliar se a mudança climática é uma questão relevante.',
    evidence: 'Análise de contexto datada e revisada (por exemplo, na análise crítica).',
    isoRef: 'Cl 4.1'
  },
  p6_2: {
    title: 'Partes Interessadas e Requisitos',
    fields: [
      { id: 'stakeholders', label: 'Partes interessadas identificadas', type: 'textarea', required: true, placeholder: 'Ex:\n- Clientes: Esperam proteção de dados\n- Reguladores (ANPD): Conformidade LGPD\n- Acionistas: Gestão de riscos\n- Colaboradores: Privacidade\n- Fornecedores: Segurança da cadeia' },
      { id: 'requirements', label: 'Requisitos por parte interessada', type: 'textarea', required: true, placeholder: 'Para cada parte, listar seus requisitos de SI relevantes' }
    ],
    auditorTip: 'A organização determina as partes interessadas relevantes, os requisitos delas e quais desses requisitos serão tratados pelo SGSI. O auditor pede a ligação entre cada requisito e o controle ou processo que o atende.',
    evidence: 'Lista de partes interessadas com requisitos e como cada um é tratado.',
    isoRef: 'Cl 4.2'
  },
  p6_3: {
    title: 'Matriz de Requisitos Legais e Regulatórios',
    fields: [
      { id: 'legal', label: 'Requisitos legais e regulatórios', type: 'textarea', required: true, placeholder: 'Ex: LGPD, Marco Civil, regulamentação setorial (BACEN, ANS, ANATEL)' },
      { id: 'contractual', label: 'Requisitos contratuais', type: 'textarea', placeholder: 'Ex: Cláusulas de SI em contratos com clientes, SLAs de disponibilidade' },
      { id: 'business', label: 'Requisitos de negócio', type: 'textarea', placeholder: 'Ex: Certificação ISO para participar de licitações' }
    ],
    auditorTip: 'Requisitos legais, regulatórios e contratuais relevantes para a segurança são identificados, documentados e mantidos atualizados, com a abordagem para atendê-los (A.5.31). Inclua a LGPD e a regulamentação setorial.',
    evidence: 'Matriz de requisitos com fonte, responsável e data da última revisão.',
    isoRef: 'Cl 4.2, A.5.31'
  },
  // ─── Fase 7 ───
  p7_1: {
    title: 'Inventário de Ativos de Informação',
    fields: [
      { id: 'categories', label: 'Categorias de ativos mapeados', type: 'textarea', required: true, placeholder: 'Ex:\n- Hardware: servidores, laptops, mobile\n- Software: ERP, CRM, custom apps\n- Dados: bancos de dados, file servers\n- Serviços: cloud, SaaS, APIs\n- Pessoas: equipes críticas' },
      { id: 'classification', label: 'Esquema de classificação adotado', type: 'select', options: ['Público / Interno / Confidencial / Restrito', 'Baixo / Médio / Alto / Crítico', 'Outro'], required: true },
      { id: 'total_count', label: 'Quantidade total de ativos inventariados', type: 'text', placeholder: 'Ex: 250 ativos' }
    ],
    auditorTip: 'O inventário cobre informações e outros ativos associados, com proprietário definido, e é mantido atualizado. O auditor sorteia ativos e confere se estão no inventário e se o proprietário sabe disso.',
    evidence: 'Inventário de ativos com proprietário, localização e classificação.',
    isoRef: 'A.5.9'
  },
  p7_2: {
    title: 'Inventário de Dados Pessoais',
    fields: [
      { id: 'categories', label: 'Categorias de dados pessoais', type: 'textarea', required: true, placeholder: 'Ex:\nCadastrais (nome, CPF, endereço)\nFinanceiros (dados bancários)\nSensíveis (saúde: atestados)' },
      { id: 'locations', label: 'Onde estão (sistemas, bancos, arquivos, fornecedores)', type: 'textarea', required: true, placeholder: 'Ex: ERP, CRM, pasta do RH, folha de pagamento terceirizada' },
      { id: 'titulares', label: 'Categorias de titulares', type: 'textarea', required: true, placeholder: 'Ex: clientes, colaboradores, candidatos, fornecedores pessoa física' },
      { id: 'special', label: 'Há dados sensíveis ou de crianças e adolescentes?', type: 'select', options: ['Sim, dados sensíveis', 'Sim, de crianças e adolescentes', 'Sim, ambos', 'Não'] }
    ],
    auditorTip: 'O inventário de dados pessoais é a base do registro das operações de tratamento (LGPD art. 37) e do SGPI. Identifique dados sensíveis (art. 11) e de crianças e adolescentes (art. 14), que pedem base legal e cuidados próprios.',
    evidence: 'Inventário de dados pessoais por sistema ou processo; no n.privacy, os Tratamentos (RoPA).',
    isoRef: 'LGPD Art. 37, ISO/IEC 27701'
  },
  p7_3: {
    title: 'Classificação de Ativos por Criticidade',
    fields: [
      { id: 'criteria', label: 'Critérios de classificação de criticidade', type: 'textarea', required: true, placeholder: 'Como a criticidade é determinada? (impacto no negócio, sensibilidade dos dados, regulatório)' },
      { id: 'critical_assets', label: 'Ativos classificados como críticos', type: 'textarea', required: true, placeholder: 'Liste os ativos de maior criticidade' },
      { id: 'review_freq', label: 'Frequência de revisão do inventário', type: 'select', options: ['Mensal', 'Trimestral', 'Semestral', 'Anual'] }
    ],
    auditorTip: 'A informação é classificada segundo as necessidades de confidencialidade, integridade e disponibilidade e os requisitos das partes interessadas. O esquema é aplicado de forma consistente e revisado; a rotulagem segue o esquema (A.5.13).',
    evidence: 'Esquema de classificação aprovado e o inventário com a classificação aplicada.',
    isoRef: 'A.5.12'
  },
  p7_4: {
    title: 'Proprietários dos Ativos',
    evidenceOnly: true,
    fields: [
      { id: 'owners', label: 'Ativo ou grupo de ativos — proprietário (cargo)', type: 'textarea', required: true, placeholder: 'Ex:\nERP — Diretor Financeiro\nServidores de produção — Gerente de Infraestrutura\nBase de clientes — Diretor Comercial' },
      { id: 'duties', label: 'Responsabilidades comunicadas aos proprietários', type: 'textarea', placeholder: 'Ex: classificar, aprovar acessos, revisar acessos periodicamente' },
      { id: 'ack', label: 'Como o proprietário confirmou', type: 'text', placeholder: 'Ex: e-mail de aceite, assinatura, ata' }
    ],
    auditorTip: 'Todo ativo do inventário tem um proprietário: a pessoa ou função responsável por classificar, proteger e autorizar o acesso. O auditor escolhe ativos ao acaso e pergunta quem é o dono.',
    evidence: 'Inventário com o proprietário de cada ativo e o registro de ciência dele.',
    isoRef: 'A.5.9'
  },
  // ─── Fase 8 ───
  p8_1: {
    title: 'Mapeamento de Processos Críticos',
    fields: [
      { id: 'processes', label: 'Processos de negócio identificados', type: 'textarea', required: true, placeholder: 'Liste os processos principais com breve descrição' },
      { id: 'owners', label: 'Proprietários dos processos', type: 'textarea', required: true, placeholder: 'Processo → Responsável' },
      { id: 'dependencies', label: 'Dependências entre processos', type: 'textarea', placeholder: 'Quais processos dependem de quais?' }
    ],
    auditorTip: 'Saber quais processos sustentam o negócio orienta o escopo, a análise de riscos e a continuidade. Cada processo crítico tem um responsável e as dependências entre processos ficam visíveis.',
    evidence: 'Mapa de processos com responsáveis e dependências.',
    isoRef: 'Cl 4.1, 4.3'
  },
  p8_2: {
    title: 'Fluxo de Dados',
    fields: [
      { id: 'flows', label: 'Fluxos de dados identificados', type: 'textarea', required: true, placeholder: 'Descreva os fluxos: origem → processamento → destino → armazenamento' },
      { id: 'external', label: 'Fluxos externos (terceiros, cloud)', type: 'textarea', placeholder: 'Dados que saem da organização, para onde e por quê' },
      { id: 'sensitive', label: 'Fluxos de dados sensíveis', type: 'textarea', placeholder: 'Quais fluxos envolvem dados sensíveis ou regulados?' }
    ],
    auditorTip: 'O fluxo mostra por onde a informação entra, é processada, armazenada e transferida, dentro e fora da organização. Ele revela as transferências que precisam de regra (A.5.14) e as operações que entram no registro de tratamento (LGPD art. 37).',
    evidence: 'Diagrama de fluxo de dados versionado.',
    isoRef: 'A.5.14, LGPD Art. 37'
  },
  p8_3: {
    title: 'Pontos de Coleta e Descarte',
    evidenceOnly: true,
    fields: [
      { id: 'collection', label: 'Pontos de coleta de dados pessoais (canal — dados — finalidade)', type: 'textarea', required: true, placeholder: 'Ex:\nFormulário do site — nome, e-mail — contato comercial\nAdmissão — documentos pessoais — contratação' },
      { id: 'disposal', label: 'Pontos de descarte e eliminação (onde e como o dado sai)', type: 'textarea', required: true, placeholder: 'Ex:\nArquivo em papel — fragmentação\nBackups — expiração automática' },
      { id: 'gaps', label: 'Dados sem regra de descarte', type: 'textarea', placeholder: 'Ex: planilhas antigas de candidatos no servidor de arquivos' }
    ],
    auditorTip: 'A LGPD pede que o dado seja eliminado ao término do tratamento (art. 15 e 16), salvo as hipóteses de conservação previstas na lei. Saber onde o dado entra e por onde sai é a base da tabela de temporalidade e do controle A.8.10 (exclusão de informação).',
    evidence: 'Mapa de pontos de coleta e de descarte por processo.',
    isoRef: 'LGPD Art. 15, 16; A.8.10'
  },
  // ─── Fase 9 ───
  p9_1: {
    title: 'Metodologia de Gestão de Riscos',
    fields: [
      { id: 'approach', label: 'Abordagem escolhida', type: 'select', options: ['Qualitativa (matriz 5x5)', 'Semi-quantitativa', 'Quantitativa (FAIR)', 'Híbrida'], required: true },
      { id: 'impact_scale', label: 'Escala de impacto', type: 'textarea', required: true, placeholder: '1-Negligível, 2-Baixo, 3-Médio, 4-Alto, 5-Crítico\nDescreva cada nível' },
      { id: 'likelihood_scale', label: 'Escala de probabilidade', type: 'textarea', required: true, placeholder: '1-Raro, 2-Improvável, 3-Possível, 4-Provável, 5-Quase certo' },
      { id: 'acceptance', label: 'Critério de aceitação de risco', type: 'text', required: true, placeholder: 'Ex: Riscos com score ≤ 6 são aceitos' },
      { id: 'frequency', label: 'Frequência de reavaliação', type: 'select', options: ['Trimestral', 'Semestral', 'Anual', 'Após incidentes'] }
    ],
    auditorTip: 'O processo de avaliação de riscos define critérios de aceitação e de execução da avaliação e produz resultados consistentes, válidos e comparáveis quando repetido. O auditor confere se a metodologia aprovada é a mesma usada na matriz.',
    evidence: 'Metodologia aprovada pela direção, com escalas e critério de aceitação.',
    isoRef: 'Cl 6.1.2'
  },
  p9_2: {
    title: 'Workshop de Identificação de Riscos',
    evidenceOnly: true,
    fields: [
      { id: 'date', label: 'Data do workshop', type: 'date', required: true },
      { id: 'participants', label: 'Participantes (nome e área)', type: 'textarea', required: true, placeholder: 'Ex:\nMaria Santos — TI\nAna Souza — RH\nPedro Costa — Operações' },
      { id: 'format', label: 'Formato', type: 'select', options: ['Workshop presencial', 'Workshop remoto', 'Entrevistas individuais'] },
      { id: 'scenarios', label: 'Riscos identificados (ativo — ameaça — vulnerabilidade)', type: 'textarea', required: true, placeholder: 'Ex:\nERP — ransomware — backups no mesmo domínio\nBase de clientes — vazamento — acesso amplo demais' },
      { id: 'owners', label: 'Proprietários de risco indicados', type: 'textarea', placeholder: 'Ex: cada risco com o gestor da área afetada' }
    ],
    auditorTip: 'A identificação aponta riscos de perda de confidencialidade, integridade e disponibilidade no escopo e indica o proprietário de cada risco (6.1.2 c). Guarde a lista de presença e o resultado bruto do workshop.',
    evidence: 'Lista de presença e a lista de riscos levantados no workshop.',
    isoRef: 'Cl 6.1.2, 8.2'
  },
  p9_3: {
    title: 'Matriz de Riscos de Segurança',
    fields: [
      { id: 'total_risks', label: 'Total de riscos avaliados', type: 'text', required: true },
      { id: 'critical', label: 'Riscos críticos (vermelho)', type: 'textarea', required: true, placeholder: 'Score ≥ 15. Liste cada risco.' },
      { id: 'high', label: 'Riscos altos (laranja)', type: 'textarea', placeholder: 'Score 10-14' },
      { id: 'medium', label: 'Riscos médios (amarelo)', type: 'textarea', placeholder: 'Score 5-9' },
      { id: 'low', label: 'Riscos baixos (verde)', type: 'textarea', placeholder: 'Score ≤ 4' }
    ],
    auditorTip: 'A matriz analisa as consequências e a probabilidade de cada risco, determina o nível e prioriza o tratamento, sempre com os critérios da metodologia. A avaliação é refeita em intervalos planejados e quando há mudança significativa (8.2).',
    evidence: 'Matriz de riscos datada, com nível, proprietário e prioridade de cada risco.',
    isoRef: 'Cl 6.1.2, 8.2'
  },
  // ─── Fase 10 ───
  p10_1: {
    title: 'Relatório de Impacto (RIPD) de Alto Risco',
    fields: [
      { id: 'operation', label: 'Operação avaliada', type: 'text', required: true, placeholder: 'Ex: Processamento de dados de saúde, scoring de crédito' },
      { id: 'data_types', label: 'Tipos de dados envolvidos', type: 'textarea', required: true },
      { id: 'risks', label: 'Riscos à privacidade identificados', type: 'textarea', required: true },
      { id: 'measures', label: 'Medidas mitigatórias propostas', type: 'textarea', required: true },
      { id: 'dpo_opinion', label: 'Parecer do encarregado', type: 'textarea', placeholder: 'Recomendação do encarregado sobre o tratamento' }
    ],
    auditorTip: 'O relatório de impacto descreve os tipos de dados tratados, a metodologia de coleta e de garantia da segurança e a análise do controlador sobre medidas, salvaguardas e mecanismos de mitigação de risco (LGPD art. 38). A ANPD pode solicitá-lo. Registre o parecer do encarregado.',
    evidence: 'RIPD aprovado, com o parecer do encarregado; no n.privacy, a tela RIPD do tratamento.',
    isoRef: 'LGPD Art. 38, ISO/IEC 27701'
  },
  p10_2: {
    title: 'Riscos aos Direitos dos Titulares',
    fields: [
      { id: 'risks', label: 'Riscos de privacidade', type: 'textarea', required: true, placeholder: 'Liste os riscos de privacidade com impacto e probabilidade' },
      { id: 'affected_groups', label: 'Grupos de titulares afetados', type: 'textarea', required: true, placeholder: 'Clientes, colaboradores, candidatos, parceiros...' }
    ],
    auditorTip: 'Além dos riscos à organização, o SGPI avalia os riscos aos titulares: discriminação, perda de controle sobre os próprios dados, dano financeiro ou à reputação. Esses riscos entram na mesma avaliação e no mesmo tratamento do SGSI.',
    evidence: 'Registro de riscos à privacidade por tratamento, com os grupos de titulares afetados.',
    isoRef: 'ISO/IEC 27701, LGPD Art. 38'
  },
  // ─── Fase 11 ───
  p11_1: {
    title: 'Plano de Tratamento de Riscos (PTR)',
    fields: [
      { id: 'risks', label: 'Riscos a tratar (acima do critério de aceitação)', type: 'textarea', required: true, placeholder: 'Risco → Opção de tratamento → Controle → Responsável → Prazo' },
      { id: 'treatment_options', label: 'Opções de tratamento utilizadas', type: 'textarea', placeholder: 'Mitigar, Transferir, Evitar, Aceitar — para cada risco' },
      { id: 'budget', label: 'Orçamento para tratamento', type: 'text', placeholder: 'Custo estimado das ações' }
    ],
    auditorTip: 'Para cada risco acima do critério, o plano escolhe a opção de tratamento (mitigar, evitar, transferir ou aceitar), os controles, o responsável e o prazo. O plano é aprovado pelos proprietários dos riscos e executado (8.3).',
    evidence: 'Plano de tratamento aprovado, com responsáveis, prazos e situação de cada ação.',
    isoRef: 'Cl 6.1.3, 8.3'
  },
  p11_2: {
    title: 'Controles de Mitigação por Risco',
    evidenceOnly: true,
    fields: [
      { id: 'mapping', label: 'Mapeamento risco → controle', type: 'textarea', required: true, placeholder: 'Risco X → Controle A.8.24 (Criptografia)\nRisco Y → Controle A.5.15 (Controle de Acesso)' }
    ],
    auditorTip: 'Os controles são determinados pelo tratamento escolhido para cada risco e comparados com o Anexo A, para não omitir nenhum controle necessário. O mesmo mapeamento alimenta a Declaração de Aplicabilidade.',
    evidence: 'Mapeamento risco para controle, ligado ao plano de tratamento.',
    isoRef: 'Cl 6.1.3 b, c'
  },
  p11_3: {
    title: 'Aceite dos Riscos Residuais',
    evidenceOnly: true,
    fields: [
      { id: 'approver', label: 'Quem aceitou os riscos residuais?', type: 'text', required: true, placeholder: 'Deve ser a alta direção ou proprietário do risco' },
      { id: 'date', label: 'Data da aceitação', type: 'date', required: true },
      { id: 'total_accepted', label: 'Quantidade de riscos aceitos', type: 'text', required: true },
      { id: 'highest_risk', label: 'Maior risco residual aceito (score)', type: 'text', placeholder: 'Ex: R-015 (score 8/25)' },
      { id: 'justification', label: 'Justificativa da aceitação', type: 'textarea', required: true, placeholder: 'Por que os riscos residuais são aceitáveis?' }
    ],
    auditorTip: 'O plano de tratamento e a aceitação dos riscos residuais são aprovados pelos proprietários dos riscos. O auditor procura essa aprovação registrada, com nome, data e o nível de risco aceito.',
    evidence: 'Termo de aceite dos riscos residuais assinado pelos proprietários.',
    isoRef: 'Cl 6.1.3 f'
  },
  // ─── Fase 12 ───
  p12_1: {
    title: 'Declaração de Aplicabilidade (SoA) do SGSI',
    fields: [
      { id: 'total_controls', label: 'Total de controles no SoA', type: 'text', required: true, placeholder: '93 (Anexo A ISO 27001:2022)' },
      { id: 'applicable', label: 'Controles aplicáveis', type: 'text', required: true, placeholder: 'Ex: 88' },
      { id: 'excluded', label: 'Controles excluídos com justificativa', type: 'textarea', placeholder: 'Controle → Justificativa de exclusão' }
    ],
    auditorTip: 'A Declaração de Aplicabilidade lista os controles necessários, a justificativa de inclusão, se estão implementados e a justificativa de exclusão de controles do Anexo A. O auditor a usa como roteiro da auditoria.',
    evidence: 'SoA versionada e aprovada; no n.iso, a tela SoA.',
    isoRef: 'Cl 6.1.3 d'
  },
  p12_2: {
    title: 'Justificativa de Inclusões e Exclusões',
    fields: [
      { id: 'justifications', label: 'Justificativa por controle (inclusão ou exclusão)', type: 'textarea', required: true, placeholder: 'Ex:\nA.8.24 — Incluído: risco R-03 (vazamento de dados de clientes)\nA.8.30 — Excluído: a organização não contrata desenvolvimento de software' }
    ],
    auditorTip: 'Inclusões se justificam pelo tratamento de riscos ou por requisito legal ou contratual; exclusões, pela inexistência do cenário no escopo. Justificativa baseada em conveniência, ou em o controle ainda não existir, é não conformidade.',
    evidence: 'Coluna de justificativa preenchida para todos os 93 controles na SoA.',
    isoRef: 'Cl 6.1.3 d'
  },
  // ─── Fase 13 ───
  p13_1: {
    title: 'Declaração de Aplicabilidade (SoA) do SGPI',
    fields: [
      { id: 'privacy_controls', label: 'Controles de privacidade aplicáveis', type: 'textarea', required: true, placeholder: 'Liste os controles ISO 27701 aplicáveis' },
      { id: 'status', label: 'Status de implementação', type: 'textarea', required: true, placeholder: 'Controle → Status (implementado/parcial/não implementado)' }
    ],
    auditorTip: 'A declaração do SGPI inclui os controles de privacidade da ISO/IEC 27701 conforme o papel da organização (controladora, operadora ou ambos), com justificativa de inclusão e de exclusão, como na SoA do SGSI.',
    evidence: 'SoA de privacidade versionada e aprovada.',
    isoRef: 'ISO/IEC 27701'
  },
  p13_2: {
    title: 'Controles Adicionais da ISO/IEC 27701',
    fields: [
      { id: 'controls', label: 'Mapeamento de controles ISO 27701', type: 'textarea', required: true, placeholder: 'Seção → Controle → Descrição → Status' }
    ],
    auditorTip: 'Os controles de privacidade da ISO/IEC 27701 complementam o Anexo A da ISO/IEC 27001. Separe os que valem para a organização como controladora dos que valem como operadora e ligue cada um à exigência da LGPD que ele atende.',
    evidence: 'Mapeamento dos controles da 27701 com a situação de cada um.',
    isoRef: 'ISO/IEC 27701'
  },
  // ─── Fase 14 ───
  p14_1: {
    title: 'Manual do SGSI e do SGPI',
    fields: [
      { id: 'structure', label: 'Estrutura do manual (seções)', type: 'textarea', required: true, placeholder: 'Ex:\n1. Contexto e escopo\n2. Liderança e política\n3. Planejamento (riscos e objetivos)\n4. Apoio (recursos, competência, comunicação, documentos)\n5. Operação\n6. Avaliação de desempenho\n7. Melhoria' },
      { id: 'documents', label: 'Documentos referenciados pelo manual', type: 'textarea', required: true, placeholder: 'Ex: política de segurança, metodologia de riscos, SoA, procedimento de incidentes' },
      { id: 'owner', label: 'Responsável pelo manual', type: 'text', placeholder: 'Ex: líder do SGSI' }
    ],
    auditorTip: 'A norma não exige um manual, mas exige que o sistema seja estabelecido, implementado, mantido e melhorado (4.4) com a informação documentada necessária (7.5). Um manual que mostra onde cada requisito é atendido facilita a auditoria.',
    evidence: 'Manual versionado e aprovado, com remissão aos documentos do sistema.',
    isoRef: 'Cl 4.4, 7.5'
  },
  p14_2: {
    title: 'Padrão de Codificação Documental',
    evidenceOnly: true,
    fields: [
      { id: 'convention', label: 'Convenção de nomenclatura adotada', type: 'textarea', required: true, placeholder: 'Ex: [TIPO]-[CÓDIGO]-[NOME]-v[VERSÃO]\nPOL-SI-001-Política de Segurança-v1.0' },
      { id: 'types', label: 'Tipos de documentos definidos', type: 'textarea', placeholder: 'POL = Política, PRO = Procedimento, REG = Registro, FOR = Formulário' }
    ],
    auditorTip: 'Ao criar e atualizar informação documentada, a organização garante identificação e descrição adequadas: título, data, autor ou código de referência (7.5.2). Um padrão de codificação torna isso consistente.',
    evidence: 'Padrão de codificação publicado e aplicado nos documentos do sistema.',
    isoRef: 'Cl 7.5.2'
  },
  p14_3: {
    title: 'Controle de Versão e Aprovação',
    evidenceOnly: true,
    fields: [
      { id: 'tool', label: 'Onde os documentos são controlados', type: 'text', required: true, placeholder: 'Ex: n.360 (Documentos), repositório com histórico de versões' },
      { id: 'flow', label: 'Fluxo de aprovação (quem elabora, revisa e aprova)', type: 'textarea', required: true, placeholder: 'Ex: líder do SGSI elabora, comitê revisa, diretoria aprova' },
      { id: 'versioning', label: 'Regra de versão e de revisão periódica', type: 'textarea', placeholder: 'Ex: v1.0, v1.1; revisão anual ou após mudança relevante' },
      { id: 'obsolete', label: 'Como versões obsoletas são retiradas de uso', type: 'textarea', placeholder: 'Ex: versão antiga arquivada e marcada como obsoleta' }
    ],
    auditorTip: 'A informação documentada é revisada e aprovada quanto à adequação (7.5.2) e controlada: distribuição, acesso, versão, retenção e descarte (7.5.3). O auditor pede o histórico de versões de um documento e quem o aprovou.',
    evidence: 'Histórico de versões e aprovações de um documento do sistema.',
    isoRef: 'Cl 7.5.2, 7.5.3'
  },
  // ─── Fase 15 ───
  p15_1: {
    title: 'Política Geral de Segurança da Informação',
    fields: [
      { id: 'objectives', label: 'Objetivos de segurança ou a estrutura para defini-los', type: 'textarea', required: true, placeholder: 'Ex: proteger dados de clientes, garantir a disponibilidade dos serviços, cumprir a LGPD' },
      { id: 'commitments', label: 'Compromissos da direção', type: 'textarea', required: true, placeholder: 'Ex:\nAtender os requisitos legais e contratuais aplicáveis\nMelhorar continuamente o SGSI' },
      { id: 'topic_policies', label: 'Políticas de tema específico que a complementam', type: 'textarea', placeholder: 'Ex: controle de acesso, uso aceitável, backup, criptografia' },
      { id: 'approver', label: 'Quem aprova a política (nome e cargo)', type: 'text', required: true, placeholder: 'Ex: Diretor-geral' }
    ],
    auditorTip: 'A política é aprovada pela alta direção, inclui objetivos (ou a estrutura para defini-los), o compromisso de atender os requisitos aplicáveis e o de melhoria contínua, e é comunicada e disponível às partes interessadas (5.2). As políticas de tema específico são revisadas em intervalos planejados (A.5.1).',
    evidence: 'Política aprovada pela direção e registro de ciência dos colaboradores.',
    isoRef: 'Cl 5.2, A.5.1'
  },
  p15_2: {
    title: 'Segregação de Funções',
    evidenceOnly: true,
    fields: [
      { id: 'conflicts', label: 'Funções conflitantes identificadas', type: 'textarea', required: true, placeholder: 'Ex:\nQuem solicita acesso não aprova o próprio acesso\nQuem desenvolve não publica em produção sem revisão\nQuem cadastra fornecedor não aprova pagamento' },
      { id: 'controls', label: 'Como a segregação é garantida', type: 'textarea', required: true, placeholder: 'Ex: perfis no ERP, aprovação em dois níveis' },
      { id: 'compensating', label: 'Controles compensatórios onde a equipe é pequena demais para segregar', type: 'textarea', placeholder: 'Ex: revisão mensal dos registros pelo gestor' }
    ],
    auditorTip: 'Funções e áreas de responsabilidade conflitantes são segregadas. Em equipes pequenas, onde segregar não é viável, o auditor aceita controle compensatório documentado, como revisão independente.',
    evidence: 'Matriz de funções conflitantes e a configuração de perfis que a aplica.',
    isoRef: 'A.5.3'
  },
  p15_3: {
    title: 'Contato com Autoridades',
    fields: [
      { id: 'authorities', label: 'Autoridades e contatos', type: 'textarea', required: true, placeholder: 'Ex:\nANPD — incidentes com dados pessoais — canal oficial no site da ANPD\nDelegacia de crimes cibernéticos\nCorpo de Bombeiros\nAgência reguladora do setor' },
      { id: 'when', label: 'Em que situações cada autoridade é contatada', type: 'textarea', required: true, placeholder: 'Ex: incidente com dados pessoais de risco relevante, crime cibernético, emergência física' },
      { id: 'who', label: 'Quem está autorizado a fazer o contato', type: 'text', required: true, placeholder: 'Ex: encarregado (ANPD), Jurídico (polícia)' }
    ],
    auditorTip: 'A organização estabelece e mantém contato com as autoridades relevantes. O auditor pergunta quem fala com quem em um incidente e se a lista está atualizada.',
    evidence: 'Lista de autoridades com contato, situação e responsável, revisada.',
    isoRef: 'A.5.5'
  },
  p15_4: {
    title: 'Segurança em Projetos',
    evidenceOnly: true,
    fields: [
      { id: 'how', label: 'Como a segurança entra na gestão de projetos', type: 'textarea', required: true, placeholder: 'Ex:\nAvaliação de riscos de segurança na abertura do projeto\nRequisitos de segurança no escopo\nAprovação de segurança antes da entrada em produção' },
      { id: 'example', label: 'Projeto em que o processo já foi aplicado', type: 'text', placeholder: 'Ex: migração do CRM para a nuvem' },
      { id: 'owner', label: 'Responsável por acompanhar', type: 'text', placeholder: 'Ex: líder do SGSI' }
    ],
    auditorTip: 'A segurança da informação é integrada à gestão de projetos, qualquer que seja o tipo de projeto. O auditor escolhe um projeto recente e pede a avaliação de riscos e os requisitos de segurança dele.',
    evidence: 'Modelo de projeto com a etapa de segurança e um projeto real que a cumpriu.',
    isoRef: 'A.5.8'
  },
  p15_5: {
    title: 'Política de Uso Aceitável',
    fields: [
      { id: 'assets', label: 'Ativos e recursos cobertos', type: 'textarea', required: true, placeholder: 'Ex: notebooks, e-mail, internet, celulares corporativos, sistemas em nuvem' },
      { id: 'allowed', label: 'Usos permitidos e proibidos', type: 'textarea', required: true, placeholder: 'Ex:\nPermitido: uso pessoal moderado da internet\nProibido: instalar software sem autorização, compartilhar senhas' },
      { id: 'monitoring', label: 'Monitoramento e consequências do descumprimento', type: 'textarea', placeholder: 'Ex: uso monitorado conforme a política, com aviso prévio; descumprimento segue o processo disciplinar' },
      { id: 'ack', label: 'Como os colaboradores dão ciência', type: 'select', options: ['Assinatura na admissão', 'Aceite eletrônico', 'Ciência pelo portal de políticas', 'Ainda não definido'] }
    ],
    auditorTip: 'Regras de uso aceitável e procedimentos para lidar com informação e outros ativos são identificados, documentados e implementados. O auditor pede a evidência de que os colaboradores conhecem as regras.',
    evidence: 'Política de uso aceitável aprovada e registros de ciência.',
    isoRef: 'A.5.10'
  },
  p15_6: {
    title: 'Regras para Transferência de Informação',
    fields: [
      { id: 'types', label: 'Tipos de transferência cobertos', type: 'textarea', required: true, placeholder: 'Ex:\nE-mail com anexos\nCompartilhamento de arquivos em nuvem\nMídia removível\nTroca de dados com parceiros por integração' },
      { id: 'rules', label: 'Regras por nível de classificação', type: 'textarea', required: true, placeholder: 'Ex: Confidencial — só por link com prazo e senha, nunca por e-mail sem proteção' },
      { id: 'agreements', label: 'Acordos de transferência com terceiros', type: 'textarea', placeholder: 'Ex: cláusula de transferência segura no contrato com a folha de pagamento' }
    ],
    auditorTip: 'Existem regras, procedimentos ou acordos de transferência para todos os meios (eletrônico, físico e verbal), dentro da organização e com terceiros, coerentes com a classificação da informação.',
    evidence: 'Procedimento de transferência de informação e acordos com terceiros.',
    isoRef: 'A.5.14'
  },
  p15_7: {
    title: 'Gestão de Segurança de Fornecedores',
    fields: [
      { id: 'criteria', label: 'Como os fornecedores são classificados por risco', type: 'textarea', required: true, placeholder: 'Ex: crítico quando trata dados pessoais ou sustenta serviço essencial' },
      { id: 'requirements', label: 'Requisitos de segurança exigidos dos fornecedores', type: 'textarea', required: true, placeholder: 'Ex: confidencialidade, notificação de incidentes, direito de auditoria, certificações' },
      { id: 'lifecycle', label: 'Do contrato ao encerramento', type: 'textarea', placeholder: 'Ex: seleção, avaliação, contrato, monitoramento, devolução e eliminação de dados na saída' }
    ],
    auditorTip: 'Processos definidos gerenciam os riscos dos produtos e serviços de fornecedores (A.5.19), com requisitos de segurança nos contratos (A.5.20), atenção à cadeia de suprimentos de TIC (A.5.21) e monitoramento dos serviços (A.5.22).',
    evidence: 'Política de fornecedores e a lista de fornecedores classificados por risco.',
    isoRef: 'A.5.19'
  },
  p15_8: {
    title: 'Plano de Resposta a Incidentes',
    fields: [
      { id: 'phases', label: 'Fases do procedimento', type: 'textarea', required: true, placeholder: '1. Detecção e registro\n2. Classificação de severidade\n3. Contenção\n4. Erradicação\n5. Recuperação\n6. Lições aprendidas' },
      { id: 'roles', label: 'Papéis e responsabilidades na resposta', type: 'textarea', required: true, placeholder: 'Ex: coordenador do incidente, TI, Jurídico, encarregado, Comunicação' },
      { id: 'severity', label: 'Critérios de classificação de severidade', type: 'textarea', placeholder: 'Ex: crítico quando há indisponibilidade de serviço essencial ou vazamento de dados pessoais' }
    ],
    auditorTip: 'A gestão de incidentes é planejada: papéis, responsabilidades e procedimentos de detecção, avaliação (A.5.25), resposta (A.5.26), aprendizado (A.5.27) e coleta de evidências (A.5.28). Incidente com dados pessoais segue também a comunicação da LGPD (art. 48).',
    evidence: 'Plano de resposta aprovado e comunicado à equipe de resposta.',
    isoRef: 'A.5.24'
  },
  // ─── Fase 16 ───
  p16_1: {
    title: 'Verificação de Antecedentes (Triagem)',
    evidenceOnly: true,
    fields: [
      { id: 'checks', label: 'Verificações feitas antes da contratação', type: 'textarea', required: true, placeholder: 'Ex:\nConfirmação de identidade e documentos\nReferências profissionais\nComprovação de formação para cargos técnicos' },
      { id: 'proportional', label: 'Como a verificação varia com o cargo e o acesso', type: 'textarea', placeholder: 'Ex: verificação ampliada para quem acessa dados financeiros ou administra sistemas' },
      { id: 'legal', label: 'Limites legais observados', type: 'textarea', placeholder: 'Ex: só verificações necessárias à função, com ciência do candidato e respeito à LGPD e à legislação trabalhista' }
    ],
    auditorTip: 'A verificação de antecedentes é feita antes da admissão e, quando aplicável, de forma contínua, proporcional aos requisitos do negócio, à classificação da informação acessada e aos riscos, e dentro da lei. Os dados de candidatos também seguem a LGPD (finalidade e necessidade).',
    evidence: 'Procedimento de triagem e registros de verificação de admissões recentes.',
    isoRef: 'A.6.1'
  },
  p16_2: {
    title: 'Termos de Confidencialidade e Responsabilidade',
    evidenceOnly: true,
    fields: [
      { id: 'coverage', label: 'Cobertura de assinaturas', type: 'select', options: ['100% dos colaboradores', '>90% assinaram', '50-90% assinaram', '<50% assinaram'], required: true },
      { id: 'includes_third', label: 'Terceirizados também assinam?', type: 'select', options: ['Sim', 'Não', 'Parcialmente'] },
      { id: 'template', label: 'Template utilizado', type: 'textarea', placeholder: 'Descreva brevemente o que o NDA cobre' },
      { id: 'evidence_desc', label: 'Onde estão armazenados os termos assinados?', type: 'text', required: true, placeholder: 'Ex: RH — pasta digital, sistema de gestão de documentos' }
    ],
    auditorTip: 'Acordos de confidencialidade refletem as necessidades de proteção da informação, são assinados por colaboradores e terceiros relevantes e revisados periodicamente (A.6.6). As responsabilidades de segurança constam do contrato de trabalho (A.6.2). O termo é assinado antes do primeiro acesso.',
    evidence: 'Modelo do termo e os termos assinados (amostra de admissões recentes).',
    isoRef: 'A.6.6, A.6.2'
  },
  p16_3: {
    title: 'Admissão e Desligamento Seguros',
    evidenceOnly: true,
    fields: [
      { id: 'onboarding', label: 'Etapas da admissão', type: 'textarea', required: true, placeholder: 'Ex:\n1. Termo de confidencialidade assinado\n2. Acessos concedidos conforme o cargo\n3. Treinamento inicial de segurança' },
      { id: 'steps', label: 'Etapas do desligamento seguro', type: 'textarea', required: true, placeholder: '1. Revogação de acessos (mesmo dia)\n2. Devolução de equipamentos\n3. Transferência de dados\n4. Assinatura de termo de confidencialidade pós-contrato' }
    ],
    auditorTip: 'Responsabilidades que continuam após o desligamento ou a mudança de função são definidas e comunicadas (A.6.5). Junte a devolução de ativos (A.5.11) e a revogação de acessos (A.5.18): o auditor confere desligados recentes contra a lista de contas ativas.',
    evidence: 'Checklists de admissão e desligamento preenchidos e a revogação de acessos registrada.',
    isoRef: 'A.6.5, A.5.11, A.5.18'
  },
  // ─── Fase 17 ───
  p17_1: {
    title: 'Perímetros e Áreas Seguras',
    evidenceOnly: true,
    fields: [
      { id: 'perimeters', label: 'Perímetros definidos', type: 'textarea', required: true, placeholder: 'Descreva os perímetros de segurança física (áreas restritas, data center, escritório)' },
      { id: 'evidence_desc', label: 'Evidências (planta, fotos, controles de acesso)', type: 'textarea', required: true, placeholder: 'Ex: relatório da ferramenta, print da configuração, ata, lista de presença' }
    ],
    auditorTip: 'Perímetros de segurança são definidos e usados para proteger áreas que contêm informação e outros ativos associados. O auditor pode percorrer as instalações e conferir se o perímetro descrito existe.',
    evidence: 'Planta com áreas seguras demarcadas e fotos dos controles.',
    isoRef: 'A.7.1'
  },
  p17_2: {
    title: 'Monitoramento de Segurança Física',
    evidenceOnly: true,
    fields: [
      { id: 'monitoring', label: 'Como as instalações são monitoradas', type: 'textarea', required: true, placeholder: 'Ex: câmeras com gravação, alarme de intrusão, vigilância' },
      { id: 'controls', label: 'Controles implementados', type: 'textarea', required: true, placeholder: 'Ex: Catracas com crachá, biometria no data center, CFTV 24h, registro de visitantes' },
      { id: 'areas', label: 'Áreas protegidas', type: 'textarea', placeholder: 'Recepção, escritório, sala de servidores, cofre' },
      { id: 'evidence_desc', label: 'Evidências disponíveis', type: 'textarea', required: true, placeholder: 'Ex: Fotos da catraca, log de acesso do data center, registro de visitantes' }
    ],
    auditorTip: 'As instalações são monitoradas continuamente contra acesso físico não autorizado (A.7.4), e as entradas são protegidas por controles de acesso (A.7.2). Se há câmeras, a gravação é dado pessoal: informe os titulares e defina a retenção.',
    evidence: 'Registro de acessos, configuração de alarmes e aviso de monitoramento.',
    isoRef: 'A.7.4, A.7.2'
  },
  p17_3: {
    title: 'Proteção contra Ameaças Físicas e Ambientais',
    evidenceOnly: true,
    fields: [
      { id: 'threats', label: 'Ameaças físicas e ambientais avaliadas', type: 'textarea', required: true, placeholder: 'Ex: incêndio, alagamento, queda de energia, calor excessivo na sala de servidores' },
      { id: 'measures', label: 'Proteções implementadas', type: 'textarea', required: true, placeholder: 'Ex: detecção e combate a incêndio, nobreak e gerador, climatização redundante' },
      { id: 'evidence_desc', label: 'Evidências (laudos, manutenções, testes)', type: 'textarea', required: true, placeholder: 'Ex: relatório da ferramenta, print da configuração, ata, lista de presença' }
    ],
    auditorTip: 'A proteção contra ameaças físicas e ambientais (desastres naturais, ataques físicos, acidentes) é projetada e implementada a partir da avaliação de riscos. O auditor pede laudos e registros de manutenção e de teste.',
    evidence: 'Laudos de inspeção e registros de manutenção e teste dos equipamentos de proteção.',
    isoRef: 'A.7.5'
  },
  p17_4: {
    title: 'Segurança de Equipamentos',
    evidenceOnly: true,
    fields: [
      { id: 'measures', label: 'Medidas de proteção implementadas', type: 'textarea', required: true, placeholder: 'UPS, climatização, CFTV, controle de acesso ao rack, cabeamento seguro' },
      { id: 'evidence_desc', label: 'Evidências (onde estão e o que mostram)', type: 'textarea', required: true, placeholder: 'Ex: relatório da ferramenta, print da configuração, ata, lista de presença' }
    ],
    auditorTip: 'Equipamentos são posicionados e protegidos para reduzir riscos de ameaças físicas e ambientais e de acesso não autorizado (A.7.8). Os controles vizinhos cobrem ativos fora das instalações (A.7.9), manutenção (A.7.13) e descarte seguro (A.7.14).',
    evidence: 'Fotos das instalações e registros de manutenção dos equipamentos.',
    isoRef: 'A.7.8'
  },
  // ─── Fase 18 ───
  p18_1: {
    title: 'Política de Controle de Acesso',
    fields: [
      { id: 'iam_tool', label: 'Ferramenta IAM utilizada', type: 'text', required: true, placeholder: 'Ex: Azure AD, Okta, Google Workspace, AWS IAM' },
      { id: 'mfa', label: 'MFA implementado?', type: 'select', options: ['Sim, para todos os usuários', 'Sim, apenas admin/privilegiados', 'Não implementado'], required: true },
      { id: 'access_review', label: 'Revisão periódica de acessos?', type: 'select', options: ['Trimestral', 'Semestral', 'Anual', 'Não há processo'] },
      { id: 'privileged', label: 'Gestão de acessos privilegiados', type: 'textarea', placeholder: 'Como são gerenciadas contas admin? PAM? Princípio de menor privilégio?' },
      { id: 'evidence_desc', label: 'Descreva as evidências disponíveis', type: 'textarea', required: true, placeholder: 'Ex: Print da config do Azure AD com MFA habilitado, relatório de revisão de acessos, política de senhas' }
    ],
    auditorTip: 'Regras de controle de acesso físico e lógico são definidas a partir dos requisitos de negócio e de segurança (A.5.15): menor privilégio, necessidade de conhecer, concessão, revisão periódica e revogação (A.5.18) e restrição de acesso à informação (A.8.3).',
    evidence: 'Política aprovada e a última revisão de acessos registrada.',
    isoRef: 'A.5.15, A.5.18, A.8.3'
  },
  p18_2: {
    title: 'Gestão de Privilégios e Senhas',
    evidenceOnly: true,
    fields: [
      { id: 'privileged', label: 'Contas privilegiadas e quem as detém', type: 'textarea', required: true, placeholder: 'Ex: administradores do domínio, do ERP e da nuvem' },
      { id: 'how', label: 'Como privilégios são concedidos, registrados e revistos', type: 'textarea', required: true, placeholder: 'Ex: solicitação aprovada pelo gestor, cofre de senhas, revisão trimestral' },
      { id: 'auth', label: 'Regras de autenticação', type: 'textarea', required: true, placeholder: 'Ex: MFA para administradores e acesso remoto, senha longa, bloqueio após tentativas' },
      { id: 'evidence_desc', label: 'Evidências (onde estão e o que mostram)', type: 'textarea', required: true, placeholder: 'Ex: relatório da ferramenta, print da configuração, ata, lista de presença' }
    ],
    auditorTip: 'Direitos de acesso privilegiado são restritos e gerenciados (A.8.2). A gestão de informações de autenticação (A.5.17) e a autenticação segura (A.8.5) completam o quadro. O auditor pede a lista de administradores e a última revisão dela.',
    evidence: 'Lista de contas privilegiadas, revisão periódica e configuração de MFA.',
    isoRef: 'A.8.2, A.5.17, A.8.5'
  },
  p18_3: {
    title: 'Registro de Eventos e Monitoramento',
    evidenceOnly: true,
    fields: [
      { id: 'siem', label: 'SIEM/ferramenta de monitoramento', type: 'text', required: true, placeholder: 'Ex: Splunk, ELK, Datadog, Wazuh, Microsoft Sentinel' },
      { id: 'sources', label: 'Fontes de log coletadas', type: 'textarea', required: true, placeholder: 'Servidores, firewalls, AD, cloud, aplicações, endpoints' },
      { id: 'retention', label: 'Retenção de logs', type: 'text', placeholder: 'Ex: 12 meses online + 24 meses archive' },
      { id: 'alerting', label: 'Alertas configurados?', type: 'select', options: ['Sim, com playbooks', 'Sim, alertas básicos', 'Não há alertas automáticos'] },
      { id: 'evidence_desc', label: 'Evidências (dashboard, print do SIEM)', type: 'textarea', required: true }
    ],
    auditorTip: 'Registros de atividades, exceções, falhas e eventos relevantes são produzidos, armazenados, protegidos e analisados (A.8.15), e redes, sistemas e aplicações são monitorados para detectar comportamento anômalo (A.8.16).',
    evidence: 'Configuração de coleta, retenção dos registros e alertas tratados.',
    isoRef: 'A.8.15, A.8.16'
  },
  p18_4: {
    title: 'Gestão de Vulnerabilidades Técnicas',
    evidenceOnly: true,
    fields: [
      { id: 'tool', label: 'Ferramenta de scan utilizada', type: 'text', required: true, placeholder: 'Ex: Nessus, Qualys, OpenVAS, Nuclei' },
      { id: 'frequency', label: 'Frequência de scan', type: 'select', options: ['Contínuo', 'Semanal', 'Mensal', 'Trimestral', 'Ad-hoc'], required: true },
      { id: 'patching_sla', label: 'SLA de patching', type: 'textarea', placeholder: 'Crítico: 48h, Alto: 7 dias, Médio: 30 dias, Baixo: 90 dias' },
      { id: 'pentest', label: 'Último pentest realizado', type: 'date' },
      { id: 'evidence_desc', label: 'Evidências (relatório de scan, registro de patches)', type: 'textarea', required: true }
    ],
    auditorTip: 'Informações sobre vulnerabilidades técnicas são obtidas, a exposição é avaliada e medidas são tomadas. O auditor pede um relatório recente de varredura e a evidência de correção das vulnerabilidades críticas no prazo definido pela organização.',
    evidence: 'Relatório de varredura recente e registro das correções aplicadas.',
    isoRef: 'A.8.8'
  },
  p18_5: {
    title: 'Criptografia e Gestão de Chaves',
    evidenceOnly: true,
    fields: [
      { id: 'transit', label: 'Criptografia em trânsito', type: 'textarea', required: true, placeholder: 'TLS 1.2/1.3 para APIs e web, VPN para acesso remoto, protocolo para e-mail' },
      { id: 'rest', label: 'Criptografia em repouso', type: 'textarea', required: true, placeholder: 'Encryption at rest no DB, BitLocker nos endpoints, S3 encryption, KMS' },
      { id: 'key_mgmt', label: 'Gestão de chaves', type: 'textarea', placeholder: 'AWS KMS, Azure Key Vault, HashiCorp Vault, rotação de chaves' },
      { id: 'evidence_desc', label: 'Evidências (config TLS, print do KMS)', type: 'textarea', required: true }
    ],
    auditorTip: 'Regras para o uso efetivo de criptografia, incluindo a gestão de chaves criptográficas, são definidas e implementadas. O auditor confere a configuração real: protocolos em trânsito, criptografia em repouso e quem guarda e troca as chaves.',
    evidence: 'Configuração de TLS, criptografia de discos e bancos e o registro de gestão de chaves.',
    isoRef: 'A.8.24'
  },
  p18_6: {
    title: 'Segurança de Redes e Serviços',
    evidenceOnly: true,
    fields: [
      { id: 'segmentation', label: 'Segmentação e proteção da rede', type: 'textarea', required: true, placeholder: 'Ex: redes separadas para usuários, servidores e visitantes, com firewall entre elas' },
      { id: 'services', label: 'Serviços de rede e requisitos de segurança', type: 'textarea', required: true, placeholder: 'Ex: link de internet com contrato de nível de serviço, acesso remoto por VPN com MFA' },
      { id: 'wifi', label: 'Rede sem fio', type: 'textarea', placeholder: 'Ex: rede corporativa com autenticação individual; rede de visitantes isolada' },
      { id: 'evidence_desc', label: 'Evidências (diagrama de rede, regras de firewall)', type: 'textarea', required: true, placeholder: 'Ex: relatório da ferramenta, print da configuração, ata, lista de presença' }
    ],
    auditorTip: 'Redes e dispositivos de rede são protegidos, gerenciados e controlados (A.8.20); os mecanismos e requisitos de serviços de rede são definidos e monitorados (A.8.21); grupos de serviços, usuários e sistemas são segregados (A.8.22).',
    evidence: 'Diagrama de rede atualizado e regras de firewall revisadas.',
    isoRef: 'A.8.20, A.8.21, A.8.22'
  },
  // ─── Fase 19 ───
  p19_1: {
    title: 'Política de Desenvolvimento Seguro',
    fields: [
      { id: 'sdlc', label: 'Fases do SDLC seguro adotado', type: 'textarea', required: true, placeholder: 'Requisitos → Design → Coding → Testing → Deploy → Manutenção' },
      { id: 'tools', label: 'Ferramentas de segurança no pipeline', type: 'textarea', placeholder: 'SAST, DAST, SCA, secrets scanning, container scanning' }
    ],
    auditorTip: 'Regras para o desenvolvimento seguro de software e sistemas são estabelecidas e aplicadas (A.8.25), com requisitos de segurança da aplicação (A.8.26), princípios de arquitetura segura (A.8.27), codificação segura (A.8.28) e testes (A.8.29).',
    evidence: 'Política de desenvolvimento seguro aprovada e comunicada à equipe.',
    isoRef: 'A.8.25'
  },
  p19_2: {
    title: 'Ciclo de Vida de Desenvolvimento Seguro',
    evidenceOnly: true,
    fields: [
      { id: 'pipeline', label: 'Pipeline CI/CD utilizado', type: 'text', required: true, placeholder: 'Ex: GitHub Actions, GitLab CI, Jenkins, Azure DevOps' },
      { id: 'stages', label: 'Estágios de segurança no pipeline', type: 'textarea', required: true, placeholder: 'Lint → SAST → Unit Tests → Build → DAST → Deploy → Monitor' },
      { id: 'gates', label: 'Gates de segurança (bloqueiam deploy?)', type: 'select', options: ['Sim, vulnerabilidades críticas bloqueiam', 'Alertas apenas, não bloqueiam', 'Sem gates de segurança'] },
      { id: 'evidence_desc', label: 'Evidências (print do pipeline, relatório SAST)', type: 'textarea', required: true }
    ],
    auditorTip: 'O ciclo de vida aplica a política na prática: requisitos, revisão de código, análise automatizada e aprovação antes da produção. O auditor pede para ver o fluxo em uma mudança real.',
    evidence: 'Configuração do fluxo de desenvolvimento e uma mudança recente que passou por ele.',
    isoRef: 'A.8.25, A.8.28'
  },
  p19_3: {
    title: 'Testes de Segurança em Software',
    evidenceOnly: true,
    fields: [
      { id: 'sast', label: 'Ferramenta SAST', type: 'text', placeholder: 'Ex: SonarQube, Semgrep, CodeQL, Snyk Code', required: true },
      { id: 'sca', label: 'Ferramenta SCA (dependências)', type: 'text', placeholder: 'Ex: Dependabot, Snyk, Trivy, OWASP Dependency-Check' },
      { id: 'dast', label: 'Ferramenta DAST (se houver)', type: 'text', placeholder: 'Ex: OWASP ZAP, Burp Suite, Nuclei' },
      { id: 'frequency', label: 'Frequência de execução', type: 'select', options: ['A cada commit/PR', 'Diário', 'Semanal', 'Manual'] },
      { id: 'evidence_desc', label: 'Evidências (relatórios, dashboards)', type: 'textarea', required: true }
    ],
    auditorTip: 'Processos de teste de segurança são definidos e executados no ciclo de desenvolvimento, inclusive no aceite de sistemas novos e de novas versões. O auditor pede o relatório de um teste recente e o que foi feito com os achados.',
    evidence: 'Relatórios de testes de segurança e o tratamento dos achados.',
    isoRef: 'A.8.29'
  },
  // ─── Fase 20 ───
  p20_1: {
    title: 'Segregação de Ambientes',
    evidenceOnly: true,
    fields: [
      { id: 'envs', label: 'Ambientes existentes e como estão separados', type: 'textarea', required: true, placeholder: 'Ex: desenvolvimento, homologação e produção em contas de nuvem distintas' },
      { id: 'access', label: 'Quem acessa a produção', type: 'textarea', required: true, placeholder: 'Ex: só a equipe de operações; desenvolvedores sem acesso de escrita' },
      { id: 'test_data', label: 'Dados de produção em teste', type: 'select', options: ['Não são usados', 'Usados mascarados ou anonimizados', 'Usados com autorização registrada', 'Usados sem controle'] },
      { id: 'evidence_desc', label: 'Evidências (onde estão e o que mostram)', type: 'textarea', required: true, placeholder: 'Ex: relatório da ferramenta, print da configuração, ata, lista de presença' }
    ],
    auditorTip: 'Ambientes de desenvolvimento, teste e produção são separados e protegidos (A.8.31). Dados de teste são escolhidos, protegidos e gerenciados (A.8.33): dado pessoal de produção em teste precisa de justificativa e proteção equivalente.',
    evidence: 'Arquitetura dos ambientes e a lista de quem tem acesso à produção.',
    isoRef: 'A.8.31, A.8.33'
  },
  p20_2: {
    title: 'Gestão de Mudanças',
    evidenceOnly: true,
    fields: [
      { id: 'process', label: 'Fluxo de mudança', type: 'textarea', required: true, placeholder: 'Ex: solicitação, análise de impacto, aprovação, teste, janela, plano de retorno, registro' },
      { id: 'emergency', label: 'Tratamento de mudança emergencial', type: 'textarea', placeholder: 'Ex: aprovação posterior em até um dia útil, com registro' },
      { id: 'example', label: 'Exemplo de mudança registrada', type: 'text', placeholder: 'Ex: atualização do firewall em 12/05' }
    ],
    auditorTip: 'Mudanças em instalações de processamento e em sistemas seguem procedimento de gestão de mudanças. O auditor sorteia mudanças recentes e pede aprovação, teste e plano de retorno de cada uma.',
    evidence: 'Registros de mudanças recentes com aprovação e teste.',
    isoRef: 'A.8.32'
  },
  p20_3: {
    title: 'Configuração Segura (Hardening)',
    evidenceOnly: true,
    fields: [
      { id: 'baselines', label: 'Padrões de configuração adotados', type: 'textarea', required: true, placeholder: 'Ex: CIS Benchmarks para Windows Server e Linux, padrão próprio para equipamentos de rede' },
      { id: 'coverage', label: 'Ativos cobertos e como a conformidade é verificada', type: 'textarea', required: true, placeholder: 'Ex: varredura mensal de configuração nos servidores' },
      { id: 'drift', label: 'Como desvios são detectados e corrigidos', type: 'textarea', placeholder: 'Ex: alerta da ferramenta de gestão de configuração e correção registrada' },
      { id: 'evidence_desc', label: 'Evidências (onde estão e o que mostram)', type: 'textarea', required: true, placeholder: 'Ex: relatório da ferramenta, print da configuração, ata, lista de presença' }
    ],
    auditorTip: 'Configurações, inclusive de segurança, de hardware, software, serviços e redes são estabelecidas, documentadas, implementadas, monitoradas e revisadas. O auditor compara um servidor real com o padrão documentado.',
    evidence: 'Padrão de configuração documentado e relatório de conformidade.',
    isoRef: 'A.8.9'
  },
  // ─── Fase 21 ───
  p21_1: {
    title: 'Política de Privacidade Externa',
    fields: [
      { id: 'controller', label: 'Controlador e contato do encarregado', type: 'text', required: true, placeholder: 'Ex: Empresa Exemplo Ltda — privacidade@exemplo.com.br' },
      { id: 'data', label: 'Dados tratados, finalidades e bases legais', type: 'textarea', required: true, placeholder: 'Ex: nome e e-mail para contato comercial, com base no legítimo interesse' },
      { id: 'sharing', label: 'Compartilhamentos e transferências internacionais', type: 'textarea', placeholder: 'Ex: provedor de nuvem com servidores no exterior' },
      { id: 'rights', label: 'Como o titular exerce os direitos', type: 'textarea', required: true, placeholder: 'Ex: formulário no site ou e-mail do encarregado' },
      { id: 'retention', label: 'Prazos de guarda', type: 'textarea', placeholder: 'Ex: dados de clientes durante o contrato e pelo prazo legal de guarda' }
    ],
    auditorTip: 'O titular tem direito a informações claras e acessíveis sobre finalidade, forma e duração do tratamento, identificação e contato do controlador, uso compartilhado, responsabilidades dos agentes e direitos (LGPD art. 9). A política externa reúne essas informações e é aprovada antes de publicada.',
    evidence: 'Política publicada no site, com a versão aprovada guardada.',
    isoRef: 'LGPD Art. 9, ISO/IEC 27701'
  },
  p21_2: {
    title: 'Registro das Operações de Tratamento (RoPA)',
    fields: [
      { id: 'data_categories', label: 'Categorias de dados pessoais tratados', type: 'textarea', required: true, placeholder: 'Ex: Nome, CPF, e-mail, endereço, dados financeiros, dados de saúde' },
      { id: 'purposes', label: 'Finalidades de tratamento', type: 'textarea', required: true, placeholder: 'Para cada categoria, qual a finalidade?' },
      { id: 'legal_bases', label: 'Bases legais aplicáveis', type: 'textarea', placeholder: 'Consentimento, execução de contrato, legítimo interesse, obrigação legal...' },
      { id: 'retention', label: 'Prazos de retenção', type: 'textarea', placeholder: 'Categoria → Prazo → Justificativa' }
    ],
    auditorTip: 'Controlador e operador mantêm registro das operações de tratamento de dados pessoais que realizarem, especialmente quando baseado no legítimo interesse (LGPD art. 37). No n.privacy, o registro vive em Tratamentos (RoPA).',
    evidence: 'Registro das operações completo e revisado; no n.privacy, os Tratamentos aprovados.',
    isoRef: 'LGPD Art. 37, ISO/IEC 27701'
  },
  p21_3: {
    title: 'Base Legal de cada Tratamento',
    fields: [
      { id: 'mapping', label: 'Mapeamento: operação → base legal', type: 'textarea', required: true, placeholder: 'Ex:\nFolha de pagamento → cumprimento de obrigação legal (art. 7, II)\nE-mail marketing → consentimento (art. 7, I)\nAtestados médicos (dado sensível) → obrigação legal (art. 11, II, a)' }
    ],
    auditorTip: 'Cada tratamento tem uma base legal do art. 7 (dados pessoais) ou do art. 11 (dados sensíveis). Base escolhida errada contamina o tratamento inteiro; legítimo interesse pede o teste de balanceamento (LIA).',
    evidence: 'Registro do tratamento com a base legal e, quando for legítimo interesse, a LIA.',
    isoRef: 'LGPD Art. 7, 11'
  },
  p21_4: {
    title: 'Processo de RIPD para Tratamentos de Alto Risco',
    fields: [
      { id: 'criteria', label: 'Critérios que disparam o RIPD', type: 'textarea', required: true, placeholder: 'Ex:\nDados sensíveis em larga escala\nMonitoramento sistemático de titulares\nUso de tecnologia nova\nLegítimo interesse com risco alto' },
      { id: 'steps', label: 'Etapas e responsáveis', type: 'textarea', required: true, placeholder: 'Ex: área de negócio descreve, encarregado avalia, Segurança propõe medidas, diretoria aprova' },
      { id: 'review', label: 'Quando o RIPD é revisto', type: 'textarea', placeholder: 'Ex: mudança na finalidade, nos dados ou no fornecedor do tratamento' }
    ],
    auditorTip: 'O processo define quando o relatório de impacto é feito (critérios de alto risco), quem o elabora, o parecer do encarregado e a revisão quando o tratamento muda. A ANPD pode exigir o relatório (LGPD art. 38).',
    evidence: 'Procedimento de RIPD aprovado e um RIPD feito com ele.',
    isoRef: 'LGPD Art. 38, ISO/IEC 27701'
  },
  // ─── Fase 22 ───
  p22_1: {
    title: 'Privacidade desde a Concepção no Fluxo de Produto',
    evidenceOnly: true,
    fields: [
      { id: 'principles', label: 'Princípios PbD adotados', type: 'textarea', required: true, placeholder: '1. Proativo\n2. Privacidade como padrão\n3. Privacidade embutida\n4. Funcionalidade total\n5. Segurança fim-a-fim\n6. Visibilidade\n7. Respeito ao usuário' }
    ],
    auditorTip: 'As medidas de segurança e proteção de dados são observadas desde a fase de concepção do produto ou serviço até a execução (LGPD art. 46, §2). O auditor procura a etapa de privacidade no fluxo de produto e um projeto que passou por ela.',
    evidence: 'Fluxo de produto com a etapa de privacidade e um registro de aplicação.',
    isoRef: 'LGPD Art. 46 §2, ISO/IEC 27701'
  },
  p22_2: {
    title: 'Checklist de Privacidade para Novos Projetos',
    fields: [
      { id: 'checklist', label: 'Itens do checklist PbD', type: 'textarea', required: true, placeholder: '- Minimização de dados\n- Pseudonimização\n- Criptografia\n- Consentimento\n- Retenção definida' }
    ],
    auditorTip: 'O checklist é aplicado antes de um projeto tratar dados pessoais: finalidade, base legal, minimização, retenção, segurança, terceiros e necessidade de RIPD. Guarde o checklist preenchido de cada projeto.',
    evidence: 'Checklist aprovado e preenchido em projetos recentes.',
    isoRef: 'LGPD Art. 46 §2, ISO/IEC 27701'
  },
  p22_3: {
    title: 'Minimização de Dados',
    evidenceOnly: true,
    fields: [
      { id: 'measures', label: 'Medidas de minimização implementadas', type: 'textarea', required: true, placeholder: 'Campos desnecessários removidos, retenção limitada, pseudonimização' },
      { id: 'evidence_desc', label: 'Evidências', type: 'textarea', required: true }
    ],
    auditorTip: 'O princípio da necessidade limita o tratamento ao mínimo necessário para a finalidade, com dados pertinentes, proporcionais e não excessivos (LGPD art. 6, III). Mostre campos removidos, retenção reduzida ou pseudonimização aplicada.',
    evidence: 'Antes e depois de formulários ou bases, com a justificativa de cada dado mantido.',
    isoRef: 'LGPD Art. 6 III'
  },
  // ─── Fase 23 ───
  p23_1: {
    title: 'Canal de Atendimento aos Titulares',
    evidenceOnly: true,
    fields: [
      { id: 'channel', label: 'Canal implementado', type: 'text', required: true, placeholder: 'Ex: privacidade@empresa.com, formulário web, SAC dedicado' },
      { id: 'sla', label: 'Prazo de resposta adotado', type: 'text', placeholder: 'Ex: o prazo cadastrado em Parâmetros legais' },
      { id: 'published', label: 'Canal publicado (Política de Privacidade, site)?', type: 'select', options: ['Sim', 'Não'], required: true },
      { id: 'evidence_desc', label: 'Evidências (print do canal, política de privacidade)', type: 'textarea', required: true }
    ],
    auditorTip: 'O titular exerce os direitos do art. 18 mediante requerimento ao controlador. O canal precisa estar publicado, funcionando e com quem responda; o auditor pode testá-lo.',
    evidence: 'Canal publicado na política de privacidade e registros de pedidos atendidos.',
    isoRef: 'LGPD Art. 18'
  },
  p23_2: {
    title: 'Procedimento de Atendimento de Direitos',
    fields: [
      { id: 'rights', label: 'Direitos atendidos', type: 'textarea', required: true, placeholder: 'Acesso, Correção, Exclusão, Portabilidade, Oposição, Revogação' },
      { id: 'sla', label: 'Prazos de resposta', type: 'text', placeholder: 'Ex: os prazos cadastrados em Parâmetros legais, por tipo de pedido' },
      { id: 'channel', label: 'Canal de atendimento', type: 'text', placeholder: 'Ex: privacidade@empresa.com' }
    ],
    auditorTip: 'O procedimento cobre recebimento, confirmação de identidade, busca dos dados, resposta e registro de cada pedido do titular, nos prazos da lei e da regulamentação (LGPD art. 18 e 19).',
    evidence: 'Procedimento aprovado e o registro dos pedidos atendidos; no n.privacy, Pedidos do titular.',
    isoRef: 'LGPD Art. 18, 19'
  },
  p23_3: {
    title: 'Métricas de Tempo de Resposta',
    fields: [
      { id: 'sla_detail', label: 'Indicadores de tempo de resposta por tipo de direito', type: 'textarea', required: true, placeholder: 'Ex:\nAcesso: tempo médio e pedidos fora do prazo no mês\nEliminação: tempo médio e pedidos fora do prazo no mês' }
    ],
    auditorTip: 'Alguns prazos de resposta são fixados pela lei e pela regulamentação; cadastre-os em Parâmetros legais e meça o tempo real de atendimento contra eles. Pedido fora do prazo vira ação corretiva.',
    evidence: 'Relatório periódico de tempos de resposta por tipo de pedido.',
    isoRef: 'LGPD Art. 18, 19'
  },
  // ─── Fase 24 ───
  p24_1: {
    title: 'Gestão de Consentimentos',
    evidenceOnly: true,
    fields: [
      { id: 'mechanism', label: 'Mecanismo de coleta de consentimento', type: 'textarea', required: true, placeholder: 'Ex: Checkbox no cadastro, banner de cookies, opt-in por e-mail' },
      { id: 'granularity', label: 'Consentimento é granular?', type: 'select', options: ['Sim, por finalidade', 'Parcialmente', 'Consentimento único (bundle)'], required: true },
      { id: 'evidence_desc', label: 'Evidências (print do formulário, logs de consentimento)', type: 'textarea', required: true },
      { id: 'revocation', label: 'Como o titular revoga consentimento?', type: 'textarea', required: true, placeholder: 'Ex: Link no rodapé do e-mail, painel de preferências, solicitação por canal' }
    ],
    auditorTip: 'O consentimento é livre, informado e inequívoco, para finalidades determinadas, e o controlador tem o ônus de provar que o obteve (art. 8, §2). A revogação é possível a qualquer momento, por procedimento gratuito e facilitado (art. 8, §5).',
    evidence: 'Telas de coleta e de revogação e os registros de consentimento; no n.privacy, Consentimentos.',
    isoRef: 'LGPD Art. 8'
  },
  p24_2: {
    title: 'Termos de Uso e Contratos Ajustados',
    fields: [
      { id: 'docs', label: 'Documentos revisados', type: 'textarea', required: true, placeholder: 'Ex: termos de uso do site, contratos com clientes, contratos de trabalho, contratos com fornecedores' },
      { id: 'clauses', label: 'Cláusulas incluídas ou ajustadas', type: 'textarea', required: true, placeholder: 'Ex: papel de controlador e operador, confidencialidade, notificação de incidentes, eliminação ao fim do contrato' },
      { id: 'pending', label: 'Contratos pendentes de ajuste', type: 'textarea', placeholder: 'Ex: três fornecedores antigos ainda sem aditivo' }
    ],
    auditorTip: 'Contratos definem os papéis no tratamento: o operador trata segundo as instruções do controlador (LGPD art. 39), e requisitos de segurança relevantes constam dos acordos com fornecedores (A.5.20). Termos de uso precisam refletir o tratamento real.',
    evidence: 'Modelos aprovados pelo Jurídico e a lista de contratos ajustados.',
    isoRef: 'LGPD Art. 39, A.5.20'
  },
  // ─── Fase 25 ───
  p25_1: {
    title: 'Tabela de Temporalidade de Dados',
    fields: [
      { id: 'table', label: 'Tabela de temporalidade por tipo de dado', type: 'textarea', required: true, placeholder: 'Dado → Retenção → Base legal → Método de descarte' }
    ],
    auditorTip: 'Cada tipo de dado tem prazo de guarda e o fundamento dele (obrigação legal, contrato, exercício de direitos). Terminado o tratamento, o dado é eliminado, salvo as hipóteses de conservação do art. 16.',
    evidence: 'Tabela de temporalidade aprovada, com o fundamento de cada prazo.',
    isoRef: 'LGPD Art. 15, 16'
  },
  p25_2: {
    title: 'Política de Descarte e Anonimização',
    fields: [
      { id: 'methods', label: 'Métodos de descarte por tipo de mídia', type: 'textarea', required: true, placeholder: 'HD: degaussing + destruição física\nSSD: crypto-erase + destruição\nPapel: fragmentadora\nCloud: deleção + verificação' },
      { id: 'anonymization', label: 'Quando e como os dados são anonimizados', type: 'textarea', placeholder: 'Ex: dados de clientes inativos agregados para estatística, sem possibilidade razoável de reidentificação' }
    ],
    auditorTip: 'Informação é excluída quando não é mais necessária (A.8.10), e equipamentos com mídia são verificados antes do descarte ou da reutilização (A.7.14). Dado anonimizado deixa de ser pessoal, salvo quando o processo pode ser revertido com esforços razoáveis (LGPD art. 12).',
    evidence: 'Política aprovada e certificados ou registros de descarte.',
    isoRef: 'A.7.14, A.8.10, LGPD Art. 12'
  },
  p25_3: {
    title: 'Exclusão de Dados Antigos',
    evidenceOnly: true,
    fields: [
      { id: 'mechanism', label: 'Mecanismo de exclusão', type: 'select', options: ['Job automatizado (cron/scheduled)', 'Manual com checklist', 'Não implementado'], required: true },
      { id: 'frequency', label: 'Frequência de execução', type: 'text', placeholder: 'Ex: Diário, Semanal, Mensal' },
      { id: 'data_types', label: 'Tipos de dados cobertos', type: 'textarea', placeholder: 'Logs, dados de clientes inativos, backups expirados' },
      { id: 'evidence_desc', label: 'Evidências (logs de execução, relatórios)', type: 'textarea', required: true }
    ],
    auditorTip: 'Informação armazenada em sistemas, dispositivos ou outra mídia é excluída quando não é mais necessária. O auditor pede o registro da última execução da rotina de exclusão e confere uma amostra.',
    evidence: 'Registros de execução das rotinas de exclusão.',
    isoRef: 'A.8.10'
  },
  // ─── Fase 26 ───
  p26_1: {
    title: 'Mapa de Transferências Internacionais',
    fields: [
      { id: 'transfers', label: 'Transferências identificadas', type: 'textarea', required: true, placeholder: 'Destino → Dados → Mecanismo de proteção (SCC, adequação)' }
    ],
    auditorTip: 'A transferência internacional só é permitida nas hipóteses do art. 33. Dados hospedados em nuvem fora do país, ou acessados de lá, configuram transferência: mapeie país, dados, fornecedor e mecanismo.',
    evidence: 'Mapa de transferências com o mecanismo legal de cada uma.',
    isoRef: 'LGPD Art. 33'
  },
  p26_2: {
    title: 'Cláusulas-Padrão Contratuais',
    fields: [
      { id: 'sccs', label: 'Contratos com cláusulas-padrão (fornecedor — país — situação)', type: 'textarea', required: true, placeholder: 'Ex: provedor de nuvem — Estados Unidos — cláusulas da ANPD incorporadas ao contrato' }
    ],
    auditorTip: 'As cláusulas-padrão contratuais aprovadas pela ANPD (Resolução CD/ANPD nº 19/2024) são um dos mecanismos do art. 33. Elas são incorporadas ao contrato sem alteração do texto aprovado.',
    evidence: 'Contratos ou aditivos com as cláusulas-padrão incorporadas.',
    isoRef: 'LGPD Art. 33, 35'
  },
  p26_3: {
    title: 'Acordos de Compartilhamento de Dados',
    fields: [
      { id: 'shares', label: 'Compartilhamentos documentados', type: 'textarea', required: true, placeholder: 'Destinatário → Dados → Finalidade → Base legal → Contrato' }
    ],
    auditorTip: 'Todo uso compartilhado de dados tem finalidade, base legal e responsabilidades definidas por escrito, e entra no registro das operações e na informação dada ao titular (art. 9).',
    evidence: 'Acordos assinados e o registro dos compartilhamentos.',
    isoRef: 'LGPD, ISO/IEC 27701'
  },
  // ─── Fase 27 ───
  p27_1: {
    title: 'Avaliação de Segurança de Operadores e Terceiros',
    evidenceOnly: true,
    fields: [
      { id: 'criteria', label: 'Critérios de avaliação', type: 'textarea', required: true, placeholder: 'Certificações, pentest, SLA, backup, incidentes' },
      { id: 'results', label: 'Fornecedores avaliados e resultado', type: 'textarea', required: true, placeholder: 'Ex: provedor de nuvem — aprovado com base na certificação ISO 27001; folha de pagamento — aprovado com ressalvas' }
    ],
    auditorTip: 'Antes de contratar e periodicamente, o operador é avaliado quanto às garantias de segurança que oferece. O método acompanha o risco: certificação para grande provedor, questionário para médio, auditoria para crítico.',
    evidence: 'Avaliações registradas com resultado e validade; no n.privacy, Terceiros.',
    isoRef: 'A.5.19, A.5.21, LGPD Art. 39'
  },
  p27_2: {
    title: 'Cláusulas de Proteção de Dados (DPA)',
    evidenceOnly: true,
    fields: [
      { id: 'total', label: 'Total de fornecedores com DPA', type: 'text', required: true, placeholder: 'Ex: 12 de 15 fornecedores' },
      { id: 'pending', label: 'Fornecedores sem DPA (se houver)', type: 'textarea', placeholder: 'Liste os que ainda não assinaram e o plano de ação' },
      { id: 'template', label: 'Template de DPA utilizado', type: 'select', options: ['Template próprio aprovado pelo jurídico', 'Template do fornecedor (revisado)', 'Sem template padrão'] },
      { id: 'evidence_desc', label: 'Evidências (lista de DPAs, cópias)', type: 'textarea', required: true }
    ],
    auditorTip: 'Todo fornecedor que trata dados pessoais em nome da organização tem cláusula ou acordo de tratamento: instruções do controlador, confidencialidade, segurança, suboperadores, incidentes e devolução ou eliminação ao fim do contrato.',
    evidence: 'Lista de fornecedores com o acordo de tratamento assinado.',
    isoRef: 'A.5.20, LGPD Art. 39'
  },
  p27_3: {
    title: 'Monitoramento de Fornecedores',
    evidenceOnly: true,
    fields: [
      { id: 'how', label: 'Como os serviços são monitorados', type: 'textarea', required: true, placeholder: 'Ex: relatório mensal de nível de serviço, revisão anual de certificados, reunião trimestral' },
      { id: 'issues', label: 'Desvios encontrados e ações', type: 'textarea', placeholder: 'Ex: atraso em correção de vulnerabilidade, cobrado em reunião' },
      { id: 'next', label: 'Próxima revisão', type: 'date' }
    ],
    auditorTip: 'A organização monitora, revisa, avalia e gerencia as mudanças nas práticas de segurança dos fornecedores e na entrega dos serviços. O auditor pede a última revisão de um fornecedor crítico.',
    evidence: 'Registros de revisão periódica dos fornecedores críticos.',
    isoRef: 'A.5.22'
  },
  // ─── Fase 28 ───
  p28_1: {
    title: 'Treinamento da Equipe de Resposta',
    evidenceOnly: true,
    fields: [
      { id: 'date', label: 'Data do treinamento', type: 'date', required: true },
      { id: 'participants', label: 'Participantes (nome e papel na resposta)', type: 'textarea', required: true, placeholder: 'Ex:\nMaria Santos — coordenadora\nCarlos Lima — encarregado' },
      { id: 'content', label: 'Conteúdo', type: 'textarea', required: true, placeholder: 'Ex: papéis no plano de resposta, classificação de severidade, preservação de evidências, comunicação à ANPD' },
      { id: 'next', label: 'Próxima reciclagem', type: 'text', placeholder: 'Ex: anual' }
    ],
    auditorTip: 'Quem tem papel no plano de resposta precisa de competência para exercê-lo (7.2). O treinamento cobre o plano, a classificação de severidade, a preservação de evidências e a comunicação.',
    evidence: 'Lista de presença e conteúdo do treinamento da equipe de resposta.',
    isoRef: 'A.5.24, Cl 7.2'
  },
  p28_2: {
    title: 'Simulação de Incidente com Dados Pessoais',
    evidenceOnly: true,
    fields: [
      { id: 'date', label: 'Data da simulação', type: 'date', required: true },
      { id: 'scenario', label: 'Cenário simulado', type: 'textarea', required: true, placeholder: 'Ex: Ransomware no file server, vazamento de dados de clientes' },
      { id: 'participants', label: 'Participantes', type: 'textarea', required: true },
      { id: 'result', label: 'Resultado e lições aprendidas', type: 'textarea', required: true },
      { id: 'improvements', label: 'Melhorias identificadas', type: 'textarea' }
    ],
    auditorTip: 'Uma simulação (de mesa ou prática) mostra que o plano funciona: quem decide, quem comunica e em quanto tempo. Para incidente com dados pessoais, inclua a avaliação de risco aos titulares e a decisão sobre comunicar à ANPD.',
    evidence: 'Relatório da simulação com tempos, falhas e melhorias.',
    isoRef: 'A.5.24, A.5.26'
  },
  p28_3: {
    title: 'Fluxo de Comunicação à ANPD e aos Titulares',
    fields: [
      { id: 'process', label: 'Procedimento de notificação', type: 'textarea', required: true, placeholder: 'Ex: quem avalia o risco aos titulares, quem decide comunicar, quem envia, conteúdo mínimo da comunicação e prazo (cadastrado em Parâmetros legais)' }
    ],
    auditorTip: 'Incidente que possa acarretar risco ou dano relevante aos titulares é comunicado à ANPD e aos titulares (LGPD art. 48), no prazo e com o conteúdo da Resolução CD/ANPD nº 15/2024. O prazo fica em Parâmetros legais; o fluxo diz quem avalia, quem decide e quem comunica.',
    evidence: 'Fluxo aprovado e o registro dos incidentes avaliados; no n.privacy, Incidentes.',
    isoRef: 'LGPD Art. 48'
  },
  // ─── Fase 29 ───
  p29_1: {
    title: 'Treinamento Geral de Segurança e LGPD',
    evidenceOnly: true,
    fields: [
      { id: 'date', label: 'Data do treinamento', type: 'date', required: true },
      { id: 'format', label: 'Formato', type: 'select', options: ['Presencial', 'Online ao vivo', 'E-learning', 'Híbrido'], required: true },
      { id: 'attendance', label: 'Taxa de participação', type: 'text', required: true, placeholder: 'Ex: 92% (230 de 250 colaboradores)' },
      { id: 'topics', label: 'Temas cobertos', type: 'textarea', placeholder: 'Segurança da informação, phishing, senhas, clean desk, LGPD' },
      { id: 'evidence_desc', label: 'Evidências (lista de presença, relatório LMS)', type: 'textarea', required: true }
    ],
    auditorTip: 'Colaboradores e partes relevantes recebem conscientização, educação e treinamento adequados à função, com atualizações periódicas (A.6.3). A norma pede que as pessoas conheçam a política e a contribuição delas para o sistema (7.3).',
    evidence: 'Lista de presença ou relatório da plataforma de ensino, com o conteúdo.',
    isoRef: 'Cl 7.2, 7.3, A.6.3'
  },
  p29_2: {
    title: 'Campanha de Phishing e Engenharia Social',
    evidenceOnly: true,
    fields: [
      { id: 'date', label: 'Data da campanha', type: 'date', required: true },
      { id: 'scope', label: 'Público e cenário', type: 'textarea', required: true, placeholder: 'Ex: todos os colaboradores; e-mail falso de troca de senha' },
      { id: 'results', label: 'Resultados', type: 'textarea', required: true, placeholder: 'Ex: 250 envios, 18 cliques, 40 reportes ao suporte' },
      { id: 'actions', label: 'Ações para quem clicou', type: 'textarea', placeholder: 'Ex: treinamento curto e nova simulação no trimestre seguinte' }
    ],
    auditorTip: 'Simulações medem se a conscientização funciona, e a evolução dos resultados é um bom indicador (Cl 9.1). Informe os colaboradores de que campanhas acontecem e trate o resultado individual com discrição.',
    evidence: 'Relatório da campanha com resultados e ações de reforço.',
    isoRef: 'A.6.3'
  },
  p29_3: {
    title: 'Registros de Participação',
    evidenceOnly: true,
    fields: [
      { id: 'total', label: 'Total de colaboradores treinados', type: 'text', required: true },
      { id: 'coverage_pct', label: 'Percentual de cobertura', type: 'text', required: true, placeholder: 'Ex: 92%' },
      { id: 'storage', label: 'Onde estão os registros?', type: 'text', required: true, placeholder: 'Ex: LMS, planilha RH, sistema de gestão' },
      { id: 'evidence_desc', label: 'Evidências (relatório do LMS, lista)', type: 'textarea', required: true }
    ],
    auditorTip: 'A organização guarda informação documentada como evidência de competência (7.2). O auditor confere uma amostra de colaboradores contra os registros de treinamento.',
    evidence: 'Registros de participação de todos os colaboradores no escopo.',
    isoRef: 'Cl 7.2'
  },
  // ─── Fase 30 ───
  p30_1: {
    title: 'Indicadores de Desempenho (KPIs e KRIs)',
    fields: [
      { id: 'kpis', label: 'KPIs definidos', type: 'textarea', required: true, placeholder: '- % de patches aplicados em SLA\n- Tempo médio de resposta a incidentes\n- % de colaboradores treinados\n- Número de vulnerabilidades críticas\n- % de conformidade SoA' },
      { id: 'targets', label: 'Metas por KPI', type: 'textarea', placeholder: 'KPI → Meta → Frequência de medição' }
    ],
    auditorTip: 'A organização determina o que monitorar e medir, os métodos, quando medir, quem mede e quem analisa os resultados. Indicador sem meta, responsável ou frequência não sustenta a avaliação de desempenho.',
    evidence: 'Ficha de cada indicador com meta, método, frequência e responsável.',
    isoRef: 'Cl 9.1'
  },
  p30_2: {
    title: 'Painel de Conformidade',
    evidenceOnly: true,
    fields: [
      { id: 'tool', label: 'Ferramenta de dashboard', type: 'text', required: true, placeholder: 'Ex: Grafana, Power BI, n.iso dashboard, planilha' },
      { id: 'kpis', label: 'KPIs monitorados', type: 'textarea', required: true },
      { id: 'evidence_desc', label: 'Evidências (print do dashboard)', type: 'textarea', required: true }
    ],
    auditorTip: 'O painel torna os resultados de monitoramento visíveis para quem decide e alimenta a análise crítica pela direção (9.3).',
    evidence: 'Captura do painel com os indicadores e a data.',
    isoRef: 'Cl 9.1'
  },
  p30_3: {
    title: 'Evidências de Monitoramento e Medição',
    evidenceOnly: true,
    fields: [
      { id: 'content', label: 'Conteúdo do relatório', type: 'textarea', required: true, placeholder: 'KPIs, tendências, incidentes, ações corretivas, próximos passos' },
      { id: 'frequency', label: 'Frequência', type: 'select', options: ['Mensal', 'Trimestral', 'Semestral'] }
    ],
    auditorTip: 'A norma pede informação documentada como evidência dos resultados de monitoramento e medição. Guarde os relatórios periódicos, não só o painel do momento.',
    evidence: 'Relatórios periódicos de indicadores guardados com data.',
    isoRef: 'Cl 9.1'
  },
  // ─── Fase 31 ───
  p31_1: {
    title: 'Programa e Plano de Auditoria Interna',
    fields: [
      { id: 'program', label: 'Programa de auditoria (escopo, agenda, critérios)', type: 'textarea', required: true, placeholder: 'Frequência: anual\nEscopo: Todas as cláusulas + Anexo A\nCritério: ISO 27001:2022\nAuditor: independente qualificado' },
      { id: 'criteria', label: 'Critérios de auditoria', type: 'textarea', required: true },
      { id: 'scope', label: 'Escopo da auditoria', type: 'textarea', required: true }
    ],
    auditorTip: 'O programa define frequência, métodos, responsabilidades e relatórios (9.2.2); cada auditoria tem critérios e escopo, e os auditores são escolhidos para garantir objetividade e imparcialidade. Quem implementa não audita o próprio trabalho.',
    evidence: 'Programa de auditoria aprovado e o plano da auditoria do ciclo.',
    isoRef: 'Cl 9.2'
  },
  p31_2: {
    title: 'Execução da Auditoria Interna',
    evidenceOnly: true,
    fields: [
      { id: 'date', label: 'Data(s) da auditoria', type: 'text', required: true },
      { id: 'scope', label: 'Escopo coberto', type: 'textarea', required: true, placeholder: 'Cláusulas auditadas, controles do Anexo A cobertos' },
      { id: 'findings', label: 'Resumo dos achados', type: 'textarea', required: true, placeholder: 'X NCs maiores, Y NCs menores, Z observações' },
      { id: 'evidence_desc', label: 'Evidências (relatório de auditoria)', type: 'textarea', required: true }
    ],
    auditorTip: 'A auditoria interna verifica se o SGSI atende aos requisitos da organização e da norma e se está implementado e mantido de forma eficaz. Antes da certificação, o ciclo cobre todas as cláusulas e os controles aplicáveis.',
    evidence: 'Registros da auditoria (plano, entrevistas, evidências avaliadas).',
    isoRef: 'Cl 9.2'
  },
  p31_3: {
    title: 'Relatório de Auditoria Interna',
    fields: [
      { id: 'findings', label: 'Achados da auditoria', type: 'textarea', required: true, placeholder: 'NC maiores, NC menores, oportunidades de melhoria, observações' },
      { id: 'conclusion', label: 'Conclusão geral', type: 'textarea', required: true }
    ],
    auditorTip: 'Os resultados são relatados à gerência pertinente e guardados como evidência do programa e dos resultados (9.2.2). O relatório alimenta as ações corretivas (10.2) e a análise crítica (9.3).',
    evidence: 'Relatório de auditoria entregue à direção.',
    isoRef: 'Cl 9.2'
  },
  // ─── Fase 32 ───
  p32_1: {
    title: 'Registro de Não Conformidades',
    fields: [
      { id: 'ncs', label: 'Não conformidades registradas', type: 'textarea', required: true },
      { id: 'analysis', label: 'Análise de causa raiz por NC', type: 'textarea', required: true, placeholder: 'NC → Causa raiz → Método (5 Porquês, Ishikawa)' }
    ],
    auditorTip: 'Para cada não conformidade, a organização reage, controla e corrige, avalia a necessidade de eliminar a causa (analisando a causa raiz e se há casos semelhantes) e guarda a natureza da não conformidade e as ações tomadas (10.2).',
    evidence: 'Registro de não conformidades com a análise de causa; no n.iso, Ações corretivas.',
    isoRef: 'Cl 10.2'
  },
  p32_2: {
    title: 'Execução das Ações Corretivas',
    evidenceOnly: true,
    fields: [
      { id: 'actions', label: 'Ações corretivas', type: 'textarea', required: true, placeholder: 'NC → Ação corretiva → Responsável → Prazo → Status' }
    ],
    auditorTip: 'As ações corretivas são proporcionais aos efeitos da não conformidade e executadas no prazo. Corrigir o sintoma sem tratar a causa leva a não conformidade de volta.',
    evidence: 'Ações corretivas com responsável, prazo e situação.',
    isoRef: 'Cl 10.2'
  },
  p32_3: {
    title: 'Eficácia das Correções',
    evidenceOnly: true,
    fields: [
      { id: 'verifier', label: 'Quem verificou?', type: 'text', required: true },
      { id: 'date', label: 'Data da verificação', type: 'date', required: true },
      { id: 'result', label: 'Resultado', type: 'select', options: ['Todas as correções eficazes', 'Maioria eficaz, retrabalho em algumas', 'Correções ineficazes'], required: true },
      { id: 'evidence_desc', label: 'Evidências', type: 'textarea', required: true }
    ],
    auditorTip: 'A organização analisa a eficácia de toda ação corretiva tomada (10.2 d). O auditor verifica se a causa foi eliminada e se a não conformidade não se repetiu.',
    evidence: 'Registro da verificação de eficácia, com data e responsável.',
    isoRef: 'Cl 10.2'
  },
  // ─── Fase 33 ───
  p33_1: {
    title: 'Entradas da Análise Crítica',
    fields: [
      { id: 'agenda', label: 'Itens da pauta', type: 'textarea', required: true, placeholder: '1. Status de ações anteriores\n2. Mudanças internas/externas\n3. Desempenho de SI (KPIs)\n4. Resultados de auditoria\n5. NCs e ações corretivas\n6. Oportunidades de melhoria\n7. Recursos necessários' }
    ],
    auditorTip: 'A análise crítica considera a situação das ações anteriores, mudanças nas questões internas e externas e nas necessidades das partes interessadas, desempenho (não conformidades, monitoramento, auditorias, objetivos), retorno das partes interessadas, riscos e oportunidades de melhoria.',
    evidence: 'Pauta e material de entrada preparados para a reunião.',
    isoRef: 'Cl 9.3.2'
  },
  p33_2: {
    title: 'Reunião de Análise Crítica com a Alta Direção',
    evidenceOnly: true,
    fields: [
      { id: 'date', label: 'Data da reunião', type: 'date', required: true },
      { id: 'participants', label: 'Participantes da alta direção', type: 'textarea', required: true },
      { id: 'inputs_covered', label: 'Inputs obrigatórios cobertos (Cl 9.3.2)', type: 'textarea', required: true, placeholder: 'Status de ações anteriores, mudanças, desempenho SI, auditorias, NCs, melhoria contínua' },
      { id: 'evidence_desc', label: 'Evidências (ata, deliberações)', type: 'textarea', required: true }
    ],
    auditorTip: 'A alta direção analisa o SGSI em intervalos planejados para garantir que continua adequado, suficiente e eficaz. O auditor confere se quem participou é de fato a alta direção.',
    evidence: 'Convocação, lista de presença e a ata da reunião.',
    isoRef: 'Cl 9.3'
  },
  p33_3: {
    title: 'Ata da Análise Crítica',
    fields: [
      { id: 'date', label: 'Data da reunião', type: 'date', required: true },
      { id: 'participants', label: 'Participantes', type: 'textarea', required: true },
      { id: 'decisions', label: 'Decisões tomadas', type: 'textarea', required: true },
      { id: 'actions', label: 'Ações definidas', type: 'textarea', required: true }
    ],
    auditorTip: 'As saídas incluem decisões sobre oportunidades de melhoria e qualquer necessidade de mudança no SGSI (9.3.3). A ata é a evidência que o auditor sempre pede.',
    evidence: 'Ata aprovada, com decisões e ações com responsável e prazo.',
    isoRef: 'Cl 9.3.3'
  },
  // ─── Fase 34 ───
  p34_0: {
    title: 'Norma e Escopo do Certificado',
    fields: [
      { id: 'standards', label: 'Norma(s) do certificado', type: 'select', options: ['ISO/IEC 27001', 'ISO/IEC 27701 autônoma', 'ISO/IEC 27001 e ISO/IEC 27701 integradas'], required: true },
      { id: 'scope_text', label: 'Texto do escopo do certificado', type: 'textarea', required: true, placeholder: 'Ex: Desenvolvimento e operação da plataforma de vendas online, na sede de São Paulo' },
      { id: 'sites', label: 'Localidades a auditar', type: 'textarea', placeholder: 'Ex: sede São Paulo; operação remota' },
      { id: 'body', label: 'Organismo certificador', type: 'text', placeholder: 'Ex: organismo acreditado escolhido em cotação' }
    ],
    auditorTip: 'O escopo do certificado é o texto que o organismo certificador emite; ele precisa bater com o escopo do SGSI (4.3) e, para a 27701, com o do SGPI. Combine com o organismo se a 27701 será auditada de forma autônoma ou integrada à 27001.',
    evidence: 'Escopo do certificado acordado com o organismo certificador.',
    isoRef: 'Cl 4.3, Certificação'
  },
  p34_1: {
    title: 'Prontidão Final',
    evidenceOnly: true,
    fields: [
      { id: 'score', label: 'Score de prontidão', type: 'text', required: true, placeholder: 'Ex: 85%' },
      { id: 'status', label: 'Acima de 80%?', type: 'select', options: ['Sim, pronto para certificação', 'Marginal (70-80%)', 'Abaixo de 70% — não recomendado'], required: true },
      { id: 'gaps', label: 'Áreas com menor score', type: 'textarea' }
    ],
    auditorTip: 'A prontidão mostra o que ainda falta antes da auditoria do organismo: controles aplicáveis implementados, evidências válidas, auditoria interna e análise crítica concluídas. Índice alto com pré-requisito pendente não basta.',
    evidence: 'Captura da prontidão no n.iso com a data e as áreas mais fracas.',
    isoRef: 'Certificação'
  },
  p34_2: {
    title: 'Pacote de Evidências Consolidado',
    evidenceOnly: true,
    fields: [
      { id: 'status', label: 'Status da SoA', type: 'select', options: ['Completa com todas evidências', 'Completa, faltam evidências pontuais', 'Incompleta'], required: true },
      { id: 'coverage', label: 'Cobertura de evidências (%)', type: 'text', required: true },
      { id: 'location', label: 'Onde está o pacote', type: 'text', placeholder: 'Ex: portal do auditor no n.360' }
    ],
    auditorTip: 'Cada controle aplicável da SoA tem evidência válida e localizável. Um pacote organizado pelo número do controle encurta a auditoria e evita pedidos repetidos.',
    evidence: 'Pacote de evidências organizado por controle; no n.iso, o pacote de auditoria.',
    isoRef: 'Cl 6.1.3 d, Certificação'
  },
  p34_3: {
    title: 'Declaração de Prontidão do Consultor',
    fields: [
      { id: 'summary', label: 'Resumo da situação do SGSI', type: 'textarea', required: true, placeholder: 'Ex: sistema em operação há seis meses, com indicadores medidos mensalmente' },
      { id: 'done', label: 'Pré-requisitos cumpridos', type: 'textarea', required: true, placeholder: 'Ex:\nAuditoria interna completa concluída\nAnálise crítica pela direção realizada\nNão conformidades da auditoria interna tratadas\nSoA aprovada' },
      { id: 'attention', label: 'Pontos de atenção remanescentes', type: 'textarea', placeholder: 'Ex: evidência de teste de restauração do backup vence antes da auditoria' },
      { id: 'recommendation', label: 'Recomendação', type: 'select', options: ['Pronto para a auditoria de certificação', 'Pronto com ressalvas', 'Ainda não recomendado'], required: true }
    ],
    auditorTip: 'A declaração não substitui a auditoria: registra, com base em evidências, que os pré-requisitos estão cumpridos e o que ainda merece atenção. A decisão de seguir é da direção da organização.',
    evidence: 'Declaração assinada pelo consultor e entregue à direção.',
    isoRef: 'Certificação'
  },
  // ─── Fase 35 ───
  p35_1: {
    title: 'Suporte na Auditoria de Fase 1',
    evidenceOnly: true,
    fields: [
      { id: 'sent_docs', label: 'Documentos enviados', type: 'textarea', required: true },
      { id: 'sent_date', label: 'Data de envio', type: 'date', required: true }
    ],
    auditorTip: 'Na fase 1, o organismo avalia a documentação, o escopo e a preparação para a fase 2. Envie o que for pedido no prazo combinado e registre o que foi enviado.',
    evidence: 'Registro dos documentos enviados e da agenda da fase 1.',
    isoRef: 'Certificação (fase 1)'
  },
  p35_2: {
    title: 'Observações do Auditor na Fase 1',
    evidenceOnly: true,
    fields: [
      { id: 'findings', label: 'Achados documentados', type: 'textarea', required: true }
    ],
    auditorTip: 'Registre cada observação do auditor com a referência do requisito: são os pontos que ele vai verificar primeiro na fase 2.',
    evidence: 'Relatório da fase 1 e a lista de observações.',
    isoRef: 'Certificação (fase 1)'
  },
  // ─── Fase 36 ───
  p36_1: {
    title: 'Tratamento das Lacunas da Fase 1',
    evidenceOnly: true,
    fields: [
      { id: 'plan', label: 'Plano de correção', type: 'textarea', required: true, placeholder: 'Achado → Ação corretiva → Responsável → Prazo' }
    ],
    auditorTip: 'Lacunas apontadas na fase 1 precisam estar tratadas antes da fase 2. Para cada uma, registre a ação, o responsável, o prazo e a evidência da correção.',
    evidence: 'Plano de correção com a situação de cada lacuna.',
    isoRef: 'Certificação (fase 1)'
  },
  p36_2: {
    title: 'Ajuste da Documentação Conforme o Retorno',
    fields: [
      { id: 'docs', label: 'Documentos ajustados (documento — mudança — observação relacionada)', type: 'textarea', required: true, placeholder: 'Ex: Política de controle de acesso — incluída a revisão semestral — observação 3 da fase 1' },
      { id: 'versions', label: 'Novas versões e aprovação', type: 'textarea', placeholder: 'Ex: v1.1 aprovada pelo comitê em 05/08' }
    ],
    auditorTip: 'Documentos corrigidos seguem o mesmo controle de versão e de aprovação da cláusula 7.5. O auditor da fase 2 compara a versão nova com a observação que a motivou.',
    evidence: 'Documentos com a nova versão aprovada e o registro da mudança.',
    isoRef: 'Cl 7.5'
  },
  // ─── Fase 37 ───
  p37_1: {
    title: 'Simulação de Entrevistas para a Fase 2',
    evidenceOnly: true,
    fields: [
      { id: 'date', label: 'Data da simulação', type: 'date', required: true },
      { id: 'areas', label: 'Áreas e pessoas preparadas', type: 'textarea', required: true, placeholder: 'Ex: TI, RH, Jurídico, recepção' },
      { id: 'faq', label: 'Perguntas frequentes e respostas preparadas', type: 'textarea', required: true, placeholder: 'Pergunta do auditor → Resposta → Evidência de suporte' }
    ],
    auditorTip: 'Na fase 2, o auditor entrevista quem executa os processos. Simular as perguntas ajuda as pessoas a mostrar o que fazem e onde está a evidência, sem decorar respostas.',
    evidence: 'Registro da simulação com pontos fracos encontrados.',
    isoRef: 'Certificação (fase 2)'
  },
  p37_2: {
    title: 'Sala de Auditoria e Logística',
    evidenceOnly: true,
    fields: [
      { id: 'agenda', label: 'Agenda acordada com o auditor', type: 'textarea', required: true, placeholder: 'Ex: dia 1 — abertura e liderança; dia 2 — operações e TI' },
      { id: 'room', label: 'Sala, acesso à rede e acompanhantes', type: 'textarea', required: true, placeholder: 'Ex: sala 3 reservada, guia por área, crachá de visitante' },
      { id: 'evidence_access', label: 'Como o auditor acessará as evidências', type: 'textarea', placeholder: 'Ex: portal do auditor no n.360, somente leitura' }
    ],
    auditorTip: 'Agenda combinada, sala reservada, acompanhante por área e acesso às evidências evitam tempo perdido e deixam o auditor concentrado no que importa.',
    evidence: 'Agenda confirmada com o organismo e a lista de acompanhantes.',
    isoRef: 'Certificação (fase 2)'
  },
  // ─── Fase 38 ───
  p38_2: {
    title: 'Evidências Solicitadas Fornecidas',
    evidenceOnly: true,
    fields: [
      { id: 'total_requested', label: 'Total de evidências solicitadas pelo auditor', type: 'text', required: true },
      { id: 'provided', label: 'Fornecidas com sucesso', type: 'text', required: true },
      { id: 'issues', label: 'Evidências não encontradas (se houver)', type: 'textarea' }
    ],
    auditorTip: 'Registre cada evidência pedida e quando foi entregue. Pedido sem resposta vira constatação; resposta rápida e organizada mostra um sistema sob controle.',
    evidence: 'Lista de pedidos do auditor com a data de entrega.',
    isoRef: 'Certificação (fase 2)'
  },
  p38_3: {
    title: 'Registro de Observações do Auditor',
    fields: [
      { id: 'observations', label: 'Observações do auditor durante a fase 2', type: 'textarea', required: true }
    ],
    auditorTip: 'Observações e oportunidades de melhoria não são não conformidades, mas o auditor de supervisão vai perguntar o que foi feito com elas.',
    evidence: 'Lista de observações com a resposta planejada.',
    isoRef: 'Certificação (fase 2)'
  },
  p38_4: {
    title: 'Encerramento Formal da Auditoria',
    evidenceOnly: true,
    fields: [
      { id: 'date', label: 'Data do encerramento', type: 'date', required: true },
      { id: 'result', label: 'Resultado comunicado', type: 'select', options: ['Recomendação para certificação', 'Certificação com NCs menores (prazo do organismo)', 'NCs maiores (re-auditoria)', 'Não certificado'], required: true },
      { id: 'notes', label: 'Observações do auditor', type: 'textarea' }
    ],
    auditorTip: 'Na reunião de encerramento, o auditor comunica o resultado e as não conformidades encontradas. Registre o resultado e confirme os prazos para o tratamento.',
    evidence: 'Registro da reunião de encerramento com o resultado comunicado.',
    isoRef: 'Certificação (fase 2)'
  },
  // ─── Fase 39 ───
  p39_1: {
    title: 'Relatório de Auditoria Recebido',
    fields: [
      { id: 'summary', label: 'Resumo do relatório', type: 'textarea', required: true },
      { id: 'result', label: 'Resultado', type: 'select', options: ['Certificado', 'Certificado com observações', 'Não conformidades menores (prazo do organismo para correção)', 'Não conformidades maiores (nova auditoria necessária)'], required: true }
    ],
    auditorTip: 'O relatório oficial é a base das ações corretivas e da preparação para as supervisões. Confira se o escopo descrito é o acordado.',
    evidence: 'Relatório oficial do organismo certificador.',
    isoRef: 'Certificação'
  },
  p39_2: {
    title: 'Não Conformidades Menores Corrigidas',
    evidenceOnly: true,
    fields: [
      { id: 'total', label: 'Total de NCs menores', type: 'text', required: true },
      { id: 'corrected', label: 'Corrigidas', type: 'text', required: true },
      { id: 'deadline', label: 'Prazo', type: 'date' },
      { id: 'evidence_desc', label: 'Evidências enviadas à certificadora', type: 'textarea', required: true }
    ],
    auditorTip: 'O prazo para tratar não conformidades é definido pelo organismo certificador no relatório. Cumpra-o e guarde a evidência enviada; a eficácia será verificada na supervisão.',
    evidence: 'Plano de ação aceito pelo organismo e as evidências enviadas.',
    isoRef: 'Cl 10.2, Certificação'
  },
  p39_3: {
    title: 'Certificado Recebido',
    evidenceOnly: true,
    fields: [
      { id: 'cert_date', label: 'Data de emissão do certificado', type: 'date', required: true },
      { id: 'cert_body', label: 'Organismo certificador', type: 'text', required: true, placeholder: 'Ex: BSI, Bureau Veritas, DNV, TÜV' },
      { id: 'cert_number', label: 'Número do certificado', type: 'text' },
      { id: 'validity', label: 'Validade (3 anos)', type: 'date' },
      { id: 'scope', label: 'Escopo certificado', type: 'textarea' }
    ],
    auditorTip: 'Confira norma, escopo, localidades e validade no certificado. O ciclo de certificação é de três anos, com auditorias de supervisão no período.',
    evidence: 'Certificado emitido pelo organismo acreditado.',
    isoRef: 'Certificação'
  },
  p39_4: {
    title: 'Comunicação Interna sobre a Certificação',
    evidenceOnly: true,
    fields: [
      { id: 'date', label: 'Data da comunicação', type: 'date', required: true },
      { id: 'channels', label: 'Canais e público', type: 'textarea', required: true, placeholder: 'Ex: e-mail a todos os colaboradores e reunião geral' },
      { id: 'message', label: 'Mensagem e uso da marca do certificado', type: 'textarea', placeholder: 'Ex: uso da marca conforme as regras do organismo certificador' }
    ],
    auditorTip: 'Comunicar a certificação reforça o compromisso de todos com o sistema. O uso da marca de certificação segue as regras do organismo certificador.',
    evidence: 'Comunicado enviado.',
    isoRef: 'Cl 7.4'
  },
  // ─── Fase 40 ───
  p40_1: {
    title: 'Calendário de Auditorias de Supervisão',
    fields: [
      { id: 'schedule', label: 'Cronograma de supervisão', type: 'textarea', required: true, placeholder: 'Ano 1: Supervisão 1 (mês X)\nAno 2: Supervisão 2 (mês Y)\nAno 3: Recertificação (mês Z)' }
    ],
    auditorTip: 'As supervisões acontecem nos anos do ciclo de três anos; o calendário inclui as auditorias internas e a análise crítica que precisam acontecer antes de cada uma.',
    evidence: 'Calendário acordado com o organismo certificador.',
    isoRef: 'Certificação'
  },
  p40_2: {
    title: 'Melhoria Contínua',
    evidenceOnly: true,
    fields: [
      { id: 'improvements', label: 'Melhorias implementadas no período', type: 'textarea', required: true, placeholder: 'Ex: automação da revisão de acessos; redução do prazo de correção de vulnerabilidades' },
      { id: 'source', label: 'Origem de cada melhoria', type: 'textarea', placeholder: 'Ex: auditoria, incidente, indicador, sugestão de colaborador' }
    ],
    auditorTip: 'A organização melhora continuamente a adequação, a suficiência e a eficácia do SGSI (10.1). Na supervisão, o auditor procura melhorias reais desde a última visita.',
    evidence: 'Registro das melhorias com origem e resultado.',
    isoRef: 'Cl 10.1'
  },
  p40_3: {
    title: 'Preparação para a Recertificação',
    evidenceOnly: true,
    fields: [
      { id: 'expiry', label: 'Vencimento do certificado', type: 'date', required: true },
      { id: 'plan', label: 'Plano até a recertificação', type: 'textarea', required: true, placeholder: 'Ex: auditoria interna completa seis meses antes; análise crítica três meses antes' },
      { id: 'changes', label: 'Mudanças relevantes desde a certificação', type: 'textarea', placeholder: 'Ex: nova unidade, nova versão da norma, novo provedor de nuvem' }
    ],
    auditorTip: 'A recertificação acontece antes do vencimento do certificado de três anos e avalia o sistema inteiro de novo. Mudanças de escopo e de versão da norma são combinadas com o organismo com antecedência.',
    evidence: 'Plano de recertificação aprovado.',
    isoRef: 'Certificação'
  },
};

window.DOC_WIZARDS = DOC_WIZARDS;
