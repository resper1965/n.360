// Etapa 1 da trilha (fases 0 a 6). Gerado por scripts/passos-esqueleto.mjs e editado à mão: o conteúdo daqui é o do produto.
import type { FaseDoCatalogo, Passo } from './tipos';

export const FASES_ETAPA_1: FaseDoCatalogo[] = [
  {
    "numero": 0,
    "etapa": 1,
    "titulo": "Mobilização e Mandato",
    "clausula": "5.1",
    "objetivo": "Definir o patrocinador do projeto (Executive Sponsor), formalizar a equipe de implementação e assinar a Carta de Mandato. O kick-off formaliza o comprometimento da alta direção com o SGSI."
  },
  {
    "numero": 1,
    "etapa": 1,
    "titulo": "Entrevista Executiva",
    "clausula": "5.2 & 6.2",
    "objetivo": "Conduzir reuniões com C-Level para entender o apetite de risco da organização, os objetivos estratégicos de negócio e obter inputs diretos para a elaboração da Política de Segurança da Informação."
  },
  {
    "numero": 2,
    "etapa": 1,
    "titulo": "Entrevistas por Trilha",
    "clausula": "7.2",
    "objetivo": "Realizar o mapeamento das trilhas de TI, RH, Jurídico e Operações. O objetivo é entender a rotina de cada área e coletar evidências iniciais de procedimentos já existentes."
  },
  {
    "numero": 3,
    "etapa": 1,
    "titulo": "Definição de Escopo",
    "clausula": "4.3",
    "objetivo": "Mapear de forma precisa e documentada os limites físicos, organizacionais e tecnológicos do SGSI. Quaisquer exclusões de controles ou áreas devem ser tecnicamente justificadas no documento de escopo."
  },
  {
    "numero": 4,
    "etapa": 1,
    "titulo": "Gap Assessment",
    "clausula": "6.1",
    "objetivo": "Comparar a maturidade atual dos processos internos com os 93 controles da ISO 27001:2022. Identificar 'Quick Wins' (melhorias rápidas e de baixo custo) para iniciar a adequação com impacto."
  },
  {
    "numero": 5,
    "etapa": 1,
    "titulo": "Governança e Papéis",
    "clausula": "5.3",
    "objetivo": "Nomear formalmente os papéis-chave do SGSI, como o DPO (Encarregado) e o CISO (Responsável por Segurança). Criar e publicar a Matriz RACI de responsabilidades de segurança."
  },
  {
    "numero": 6,
    "etapa": 1,
    "titulo": "Contexto e Partes Interessadas",
    "clausula": "4.1 & 4.2",
    "objetivo": "Conduzir a análise de ambiente interno e externo (SWOT) e identificar os requisitos legais (ex: LGPD, resoluções ANPD) e contratuais com clientes e parceiros."
  }
];

export const PASSOS_ETAPA_1: Passo[] = [
  {
    "id": "p0_1",
    "fase": 0,
    "ordem": 1,
    "titulo": "Nomeação do Sponsor e da Equipe do Projeto",
    "clausula": "Cl 5.1, 5.3",
    "porQue": "A alta direção demonstra liderança (5.1) e atribui papéis, responsabilidades e autoridades do SGSI (5.3). O auditor procura a nomeação formal do patrocinador, com poder sobre recursos, e da equipe.",
    "campos": [
      {
        "id": "sponsor_name",
        "rotulo": "Nome completo do patrocinador",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "João Silva"
      },
      {
        "id": "sponsor_role",
        "rotulo": "Cargo",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "CEO, CTO, CISO"
      },
      {
        "id": "sponsor_authority",
        "rotulo": "Nível de autoridade sobre orçamento de SI",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "Total (C-Level)",
          "Parcial (Diretor)",
          "Limitada (Gerente)"
        ]
      },
      {
        "id": "team_members",
        "rotulo": "Equipe do projeto (nome — cargo — papel no SGSI)",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Maria Santos — Gerente de TI — líder do SGSI\nCarlos Lima — Jurídico — encarregado de dados\nAna Souza — RH — conscientização"
      }
    ],
    "prova": {
      "descricao": "Termo de nomeação ou ata assinada pela direção, com nomes, cargos e papéis.",
      "obrigatoria": false,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      }
    ],
    "gera": "documento"
  },
  {
    "id": "p0_2",
    "fase": 0,
    "ordem": 2,
    "titulo": "Apresentação da Metodologia",
    "clausula": "Cl 7.3, 7.4",
    "porQue": "A norma pede definir o que, quando, a quem e por quem comunicar sobre o SGSI (7.4), e que as pessoas conheçam a contribuição delas para o sistema (7.3). A apresentação da metodologia é a primeira dessas comunicações: guarde o material e a lista de presença.",
    "campos": [
      {
        "id": "date",
        "rotulo": "Data da apresentação",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "audience",
        "rotulo": "Público presente (nome e cargo)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "João Silva — Diretor-geral\nMaria Santos — Gerente de TI"
      },
      {
        "id": "topics",
        "rotulo": "Conteúdo apresentado",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Fases da jornada (diagnóstico, planejamento, implementação, auditoria)\nPapéis da equipe e da consultoria\nCritérios de aceite das entregas\nCronograma macro"
      },
      {
        "id": "material",
        "rotulo": "Onde está o material apresentado",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "pasta do projeto, Apresentacao_Kickoff_v1.pdf"
      }
    ],
    "prova": {
      "descricao": "Material apresentado e lista de presença.",
      "obrigatoria": false,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      }
    ]
  },
  {
    "id": "p0_3",
    "fase": 0,
    "ordem": 3,
    "titulo": "Ata da Reunião de Kick-off",
    "clausula": "Cl 5.1",
    "porQue": "A ata do kick-off, com a presença da alta direção, é a primeira evidência de comprometimento da liderança com o SGSI. Deve trazer data, participantes, pauta, decisões e próximos passos com responsáveis.",
    "campos": [
      {
        "id": "date",
        "rotulo": "Data do kick-off",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "participants",
        "rotulo": "Participantes (nome e cargo)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "João Silva — CEO\nMaria Santos — CISO\nPedro Oliveira — CTO"
      },
      {
        "id": "agenda",
        "rotulo": "Pauta principal",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Apresentação do projeto, escopo preliminar, cronograma, próximos passos"
      },
      {
        "id": "decisions",
        "rotulo": "Decisões tomadas",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Aprovação do cronograma, nomeação da equipe, definição de reuniões semanais"
      },
      {
        "id": "next_steps",
        "rotulo": "Próximos passos",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Agendar entrevistas executivas, iniciar gap assessment"
      }
    ],
    "prova": {
      "descricao": "Ata aprovada pelos participantes, com lista de presença.",
      "obrigatoria": true,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      },
      {
        "tipo": "evidencia_anexada",
        "rotulo": "Prova anexada"
      }
    ]
  },
  {
    "id": "p0_4",
    "fase": 0,
    "ordem": 4,
    "titulo": "Cronograma Macro do Projeto",
    "clausula": "Cl 6.2",
    "porQue": "Ao planejar como alcançar os objetivos de segurança, a norma pede o que será feito, com quais recursos, por quem, até quando e como os resultados serão avaliados. O cronograma aprovado pelo sponsor responde a isso; revisões ficam registradas.",
    "campos": [
      {
        "id": "start_date",
        "rotulo": "Data de início do projeto",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "target_cert",
        "rotulo": "Data pretendida de certificação",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "milestones",
        "rotulo": "Marcos principais",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Mês 1-2: Diagnóstico e Gap\nMês 3-4: Documentação\nMês 5-6: Implementação\nMês 7: Auditoria Interna\nMês 8: Certificação, fase 1\nMês 9: Certificação, fase 2"
      },
      {
        "id": "resources",
        "rotulo": "Recursos alocados",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "2 consultores externos, CISO interno 50%, equipe TI 20%"
      }
    ],
    "prova": {
      "descricao": "Cronograma com o registro de aprovação do sponsor (e-mail, ata ou assinatura).",
      "obrigatoria": true,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      },
      {
        "tipo": "evidencia_anexada",
        "rotulo": "Prova anexada"
      }
    ],
    "gera": "documento"
  },
  {
    "id": "p0_5",
    "fase": 0,
    "ordem": 5,
    "titulo": "Canais de Comunicação Interna do SGSI",
    "clausula": "Cl 7.4",
    "porQue": "A organização define o que comunicar sobre o SGSI, quando, a quem, quem comunica e como. O auditor verifica se os canais existem e se são de fato usados.",
    "campos": [
      {
        "id": "channels",
        "rotulo": "Canais definidos para comunicação do SGSI",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "- E-mail: sgsi@empresa.com\n- Slack: #sgsi-projeto\n- Reuniões semanais: Terça 10h\n- SharePoint: /SGSI/Documentos"
      },
      {
        "id": "internal_comm",
        "rotulo": "Como a organização comunicará o SGSI internamente?",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "Intranet + e-mail",
          "Reuniões all-hands",
          "Newsletter interna",
          "Portal dedicado"
        ]
      },
      {
        "id": "owner",
        "rotulo": "Quem é responsável por comunicar",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "líder do SGSI, com apoio da Comunicação Interna"
      }
    ],
    "prova": {
      "descricao": "Plano de comunicação com canais, público, responsáveis e frequência.",
      "obrigatoria": false,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      }
    ]
  },
  {
    "id": "p1_1",
    "fase": 1,
    "ordem": 1,
    "titulo": "Entrevista Executiva",
    "clausula": "Cl 4.1, 5.1",
    "porQue": "O que a direção espera do SGSI orienta escopo, objetivos e apetite a risco. Registre quem foi ouvido e o que foi dito: é insumo da análise de contexto (4.1) e evidência do envolvimento da liderança (5.1).",
    "campos": [
      {
        "id": "exec_names",
        "rotulo": "Executivos a serem entrevistados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "CEO — João Silva\nCTO — Maria Santos\nCFO — Carlos Lima"
      },
      {
        "id": "dates",
        "rotulo": "Datas das entrevistas",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "CEO: 15/01, CTO: 16/01, CFO: 17/01"
      },
      {
        "id": "topics",
        "rotulo": "Temas principais da entrevista",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Visão de segurança, apetite de risco, governança, orçamento, incidentes"
      },
      {
        "id": "expectations",
        "rotulo": "Expectativas declaradas pela direção",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "atender exigência de clientes, reduzir incidentes, certificar até o fim do ano"
      }
    ],
    "prova": {
      "descricao": "Registro das entrevistas com data, entrevistados e expectativas.",
      "obrigatoria": false,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      }
    ]
  },
  {
    "id": "p1_2",
    "fase": 1,
    "ordem": 2,
    "titulo": "Objetivos de Negócio e de Segurança",
    "clausula": "Cl 6.2",
    "porQue": "Os objetivos de segurança são coerentes com a política, mensuráveis quando possível, monitorados, comunicados e atualizados. Para cada um, a norma pede o plano: o que será feito, recursos, responsável, prazo e como o resultado será avaliado.",
    "campos": [
      {
        "id": "business_goals",
        "rotulo": "Objetivos de negócio que o SGSI apoia",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Atender exigência de clientes corporativos\nReduzir indisponibilidade dos sistemas de venda\nCumprir a LGPD"
      },
      {
        "id": "sec_objectives",
        "rotulo": "Objetivos de segurança (o quê, meta, prazo, responsável)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Reduzir em 50% os cliques em phishing simulado até dez/2027 — RH\nMFA em 100% dos acessos privilegiados até mar/2027 — TI"
      },
      {
        "id": "how_measured",
        "rotulo": "Como cada objetivo será medido e acompanhado",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "indicador mensal no painel do SGSI, revisado na análise crítica"
      }
    ],
    "prova": {
      "descricao": "Documento de objetivos aprovado, com metas, responsáveis e forma de medição.",
      "obrigatoria": true,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      },
      {
        "tipo": "evidencia_anexada",
        "rotulo": "Prova anexada"
      }
    ],
    "gera": "documento"
  },
  {
    "id": "p1_3",
    "fase": 1,
    "ordem": 3,
    "titulo": "Expectativas de Certificação",
    "clausula": "Certificação",
    "porQue": "Expectativa realista evita surpresa: a certificação exige o sistema em operação, com auditoria interna e análise crítica pela direção concluídas antes da auditoria do organismo certificador. Registre a norma, a data desejada e o motivo.",
    "campos": [
      {
        "id": "standards",
        "rotulo": "Norma(s) pretendida(s)",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "ISO/IEC 27001",
          "ISO/IEC 27001 e ISO/IEC 27701",
          "ISO/IEC 27701",
          "Ainda não definido"
        ]
      },
      {
        "id": "target_date",
        "rotulo": "Data desejada para a certificação",
        "tipo": "data",
        "obrigatorio": false,
        "exemplo": ""
      },
      {
        "id": "drivers",
        "rotulo": "Motivações (cliente, contrato, regulação, mercado)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "exigência contratual de um cliente, participação em licitações"
      },
      {
        "id": "body",
        "rotulo": "Organismo certificador considerado (se houver)",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "ainda em cotação"
      }
    ],
    "prova": {
      "descricao": "Registro das expectativas acordadas com o sponsor.",
      "obrigatoria": false,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      }
    ]
  },
  {
    "id": "p2_1",
    "fase": 2,
    "ordem": 1,
    "titulo": "Entrevistas com Gestores",
    "clausula": "Cl 4.1, 4.2",
    "porQue": "As entrevistas com as áreas (TI, RH, Jurídico, Operações) mostram que o contexto e os requisitos das partes interessadas foram levantados com quem conhece o processo, e não presumidos.",
    "campos": [
      {
        "id": "interviewees",
        "rotulo": "Entrevistados (nome — cargo — área)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Maria Santos — CISO — TI\nCarlos Lima — Encarregado — Jurídico\nAna Souza — Gerente — RH"
      },
      {
        "id": "dates",
        "rotulo": "Datas das entrevistas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "TI: 15/01, RH: 16/01, Jurídico: 17/01"
      },
      {
        "id": "method",
        "rotulo": "Formato das entrevistas",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "Presencial",
          "Videoconferência",
          "Híbrido",
          "Questionário escrito"
        ]
      },
      {
        "id": "notes",
        "rotulo": "Observações gerais",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Registro das entrevistas: quem, quando, formato e principais achados.",
      "obrigatoria": true,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      },
      {
        "tipo": "evidencia_anexada",
        "rotulo": "Prova anexada"
      }
    ]
  },
  {
    "id": "p2_2",
    "fase": 2,
    "ordem": 2,
    "titulo": "Evidências de Práticas Atuais",
    "clausula": "Diagnóstico",
    "porQue": "O diagnóstico vale pelo que pode ser comprovado. Separe o que tem evidência do que é só declarado: o auditor de certificação fará a mesma distinção.",
    "campos": [
      {
        "id": "practices",
        "rotulo": "Práticas existentes e onde está a evidência de cada uma",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Backup diário — relatório da ferramenta de backup\nTermo de confidencialidade na admissão — modelo do RH\nAntivírus nas estações — painel do console"
      },
      {
        "id": "documents",
        "rotulo": "Documentos existentes recebidos (políticas, procedimentos, contratos)",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "política de senhas de 2023, contrato com o provedor de nuvem"
      },
      {
        "id": "declared_only",
        "rotulo": "Práticas sem evidência (só declaradas)",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "revisão de acessos citada na entrevista, sem registro"
      }
    ],
    "prova": {
      "descricao": "Lista de práticas com a evidência correspondente anexada.",
      "obrigatoria": true,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      },
      {
        "tipo": "evidencia_anexada",
        "rotulo": "Prova anexada"
      }
    ]
  },
  {
    "id": "p2_3",
    "fase": 2,
    "ordem": 3,
    "titulo": "Relatório Consolidado de Entrevistas",
    "clausula": "Cl 4.1, 4.2",
    "porQue": "O relatório consolida o que as áreas disseram e o que foi comprovado, e alimenta a análise de contexto, o escopo e a análise de riscos. Achados que atravessam várias áreas costumam ser os de maior impacto.",
    "campos": [
      {
        "id": "total_areas",
        "rotulo": "Quantas áreas foram entrevistadas?",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "executive_summary",
        "rotulo": "Resumo executivo dos achados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Visão geral do estado de maturidade da organização"
      },
      {
        "id": "critical_gaps",
        "rotulo": "Gaps críticos (cross-functional)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Gaps que afetam múltiplas áreas"
      },
      {
        "id": "maturity_level",
        "rotulo": "Nível de maturidade estimado",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "Inicial (1)",
          "Repetível (2)",
          "Definido (3)",
          "Gerenciado (4)",
          "Otimizado (5)"
        ]
      },
      {
        "id": "recommendations",
        "rotulo": "Recomendações prioritárias",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Top 5 ações recomendadas"
      }
    ],
    "prova": {
      "descricao": "Relatório consolidado de entrevistas, revisado pelo líder do SGSI.",
      "obrigatoria": true,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      },
      {
        "tipo": "evidencia_anexada",
        "rotulo": "Prova anexada"
      }
    ],
    "gera": "documento"
  },
  {
    "id": "p3_1",
    "fase": 3,
    "ordem": 1,
    "titulo": "Declaração de Escopo do SGSI e do SGPI",
    "clausula": "Cl 4.3",
    "porQue": "O escopo considera as questões internas e externas (4.1), os requisitos das partes interessadas (4.2) e as interfaces e dependências com atividades de terceiros. Para o SGPI, deixe claro o papel da organização no tratamento de dados pessoais: controladora, operadora ou ambos.",
    "campos": [
      {
        "id": "org_name",
        "rotulo": "Nome da organização",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "locations",
        "rotulo": "Localidades incluídas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Sede São Paulo (Av. Paulista, 1000)\nFilial Rio de Janeiro\nData Center AWS us-east-1"
      },
      {
        "id": "systems",
        "rotulo": "Sistemas e infraestrutura incluídos",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "ERP SAP, CRM Salesforce, AWS EC2/RDS/S3, rede corporativa"
      },
      {
        "id": "processes",
        "rotulo": "Processos de negócio incluídos",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Vendas online, gestão financeira, RH, suporte ao cliente"
      },
      {
        "id": "exclusions",
        "rotulo": "Exclusões justificadas",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Filial Manaus (operação descontinuada em 2025)"
      },
      {
        "id": "people_count",
        "rotulo": "Número de colaboradores no escopo",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "250 internos + 50 terceirizados"
      }
    ],
    "prova": {
      "descricao": "Documento de escopo aprovado e disponível como informação documentada.",
      "obrigatoria": true,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      },
      {
        "tipo": "evidencia_anexada",
        "rotulo": "Prova anexada"
      }
    ],
    "gera": "documento"
  },
  {
    "id": "p3_2",
    "fase": 3,
    "ordem": 2,
    "titulo": "Limites Físicos e Lógicos do Escopo",
    "clausula": "Cl 4.3",
    "porQue": "Limites claros dizem o que o auditor pode visitar e testar: localidades, redes, regiões de nuvem, trabalho remoto e as interfaces com atividades de terceiros que ficam fora do escopo.",
    "campos": [
      {
        "id": "physical",
        "rotulo": "Localidades físicas no escopo",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Endereços completos dos escritórios, data centers, fábricas"
      },
      {
        "id": "cloud",
        "rotulo": "Regiões cloud no escopo",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "AWS us-east-1, Azure Brazil South, GCP southamerica-east1"
      },
      {
        "id": "remote",
        "rotulo": "Trabalho remoto incluído?",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "Sim, todos os colaboradores remotos",
          "Sim, apenas alguns",
          "Não, apenas presencial"
        ]
      },
      {
        "id": "interfaces",
        "rotulo": "Interfaces e dependências com terceiros",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Provedor de nuvem hospeda os sistemas (fora do controle direto)\nFolha de pagamento terceirizada recebe dados de RH"
      }
    ],
    "prova": {
      "descricao": "Descrição dos limites, com diagrama de rede ou de localidades.",
      "obrigatoria": true,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      },
      {
        "tipo": "evidencia_anexada",
        "rotulo": "Prova anexada"
      }
    ],
    "gera": "documento"
  },
  {
    "id": "p3_3",
    "fase": 3,
    "ordem": 3,
    "titulo": "Justificativa de Exclusões de Controles",
    "clausula": "Cl 6.1.3 d",
    "porQue": "A Declaração de Aplicabilidade justifica a exclusão de cada controle do Anexo A. \"Não se aplica\" sem motivo é não conformidade; o motivo vem do escopo e da análise de riscos, nunca da conveniência ou de o controle ainda não existir. A decisão final é registrada na SoA (fase 12).",
    "campos": [
      {
        "id": "excluded",
        "rotulo": "Controles do Anexo A considerados não aplicáveis",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "A.8.30 Desenvolvimento terceirizado\nA.7.12 Segurança do cabeamento"
      },
      {
        "id": "reason",
        "rotulo": "Justificativa de cada exclusão (por que o controle não se aplica)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "A.8.30 — a organização não contrata desenvolvimento de software\nA.7.12 — o cabeamento é do condomínio e está coberto pelo contrato de locação"
      },
      {
        "id": "reviewer",
        "rotulo": "Quem revisou as exclusões",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "líder do SGSI e consultor"
      }
    ],
    "prova": {
      "descricao": "Lista de controles excluídos com a justificativa de cada um.",
      "obrigatoria": true,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      },
      {
        "tipo": "evidencia_anexada",
        "rotulo": "Prova anexada"
      }
    ],
    "gera": "documento"
  },
  {
    "id": "p3_4",
    "fase": 3,
    "ordem": 4,
    "titulo": "Aprovação Formal do Escopo",
    "clausula": "Cl 4.3",
    "porQue": "O auditor pede a evidência de que a alta direção revisou e aprovou o escopo do SGSI. Aprovação verbal não conta.",
    "campos": [
      {
        "id": "approver",
        "rotulo": "Quem aprovou? (nome e cargo)",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "João Silva — CEO"
      },
      {
        "id": "date",
        "rotulo": "Data da aprovação",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "method",
        "rotulo": "Método de aprovação",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "Ata de reunião",
          "E-mail formal",
          "Assinatura em documento",
          "Deliberação em comitê"
        ]
      },
      {
        "id": "reference",
        "rotulo": "Referência do documento aprovado",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "DOC-ESC-001 v1.0"
      },
      {
        "id": "notes",
        "rotulo": "Observações",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Condições, ressalvas ou comentários da direção"
      }
    ],
    "prova": {
      "descricao": "Ata, e-mail formal ou assinatura da direção aprovando a versão do escopo.",
      "obrigatoria": true,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      },
      {
        "tipo": "evidencia_anexada",
        "rotulo": "Prova anexada"
      }
    ]
  },
  {
    "id": "p4_1",
    "fase": 4,
    "ordem": 1,
    "titulo": "Diagnóstico de Lacunas",
    "clausula": "Cl 4 a 10, Anexo A",
    "porQue": "O diagnóstico compara a situação atual com cada requisito das cláusulas 4 a 10 e com os controles do Anexo A. Registre o método e a contagem: o mesmo critério será usado para medir a evolução até a certificação.",
    "campos": [
      {
        "id": "assessment_method",
        "rotulo": "Método de avaliação utilizado",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "Entrevistas + evidências",
          "Questionário + validação",
          "Auditoria interna",
          "Auto-avaliação"
        ]
      },
      {
        "id": "total_controls",
        "rotulo": "Total de controles avaliados",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "93 (Anexo A completo)"
      },
      {
        "id": "compliant",
        "rotulo": "Controles conformes",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "35"
      },
      {
        "id": "partial",
        "rotulo": "Controles parcialmente implementados",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "28"
      },
      {
        "id": "non_compliant",
        "rotulo": "Controles não conformes",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "30"
      },
      {
        "id": "critical_gaps",
        "rotulo": "Gaps críticos identificados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Liste os gaps mais graves que requerem ação imediata"
      }
    ],
    "prova": {
      "descricao": "Planilha ou relatório do diagnóstico, com o método e o resultado por requisito.",
      "obrigatoria": false,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      }
    ]
  },
  {
    "id": "p4_2",
    "fase": 4,
    "ordem": 2,
    "titulo": "Relatório de Lacunas Detalhado",
    "clausula": "Diagnóstico",
    "porQue": "O relatório transforma o diagnóstico em decisão: estado atual, lacunas mais graves, caminho de correção e investimento. É a base para a direção aprovar recursos (Cl 7.1).",
    "campos": [
      {
        "id": "exec_summary",
        "rotulo": "Resumo executivo",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Visão geral do estado de conformidade da organização"
      },
      {
        "id": "compliance_pct",
        "rotulo": "Percentual de conformidade atual",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "38%"
      },
      {
        "id": "top_risks",
        "rotulo": "Top 5 riscos identificados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "1. Sem gestão de vulnerabilidades\n2. Backup sem teste\n3. Sem MFA\n4. Sem programa de awareness\n5. Sem gestão de incidentes"
      },
      {
        "id": "roadmap",
        "rotulo": "Roadmap de remediação sugerido",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Prioridade alta → média → baixa com prazos"
      },
      {
        "id": "investment",
        "rotulo": "Investimento estimado",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "R$ 200.000–350.000"
      }
    ],
    "prova": {
      "descricao": "Relatório de lacunas versionado e entregue à direção.",
      "obrigatoria": true,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      },
      {
        "tipo": "evidencia_anexada",
        "rotulo": "Prova anexada"
      }
    ],
    "gera": "documento"
  },
  {
    "id": "p4_3",
    "fase": 4,
    "ordem": 3,
    "titulo": "Apresentação do Diagnóstico à Diretoria",
    "clausula": "Cl 5.1",
    "porQue": "A apresentação mostra que a alta direção conhece o estado atual e assumiu o plano para corrigir as lacunas. Registre quem participou, o que foi decidido e os próximos passos.",
    "campos": [
      {
        "id": "approver",
        "rotulo": "Quem aprovou?",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "date",
        "rotulo": "Data da aprovação",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "method",
        "rotulo": "Método de aprovação",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "Ata de reunião",
          "E-mail formal",
          "Assinatura em documento",
          "Deliberação em comitê"
        ]
      },
      {
        "id": "compliance_pct",
        "rotulo": "Percentual de conformidade aprovado",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "38%"
      },
      {
        "id": "next_steps",
        "rotulo": "Próximos passos definidos",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Ata ou registro da apresentação, com decisões da diretoria.",
      "obrigatoria": true,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      },
      {
        "tipo": "evidencia_anexada",
        "rotulo": "Prova anexada"
      }
    ]
  },
  {
    "id": "p5_1",
    "fase": 5,
    "ordem": 1,
    "titulo": "Comitê de Segurança e Privacidade",
    "clausula": "Cl 5.1, 5.3",
    "porQue": "A norma não exige um comitê, mas exige que a direção atribua e comunique responsabilidades e autoridades. Quando o comitê existe, o auditor pede composição, atribuições, frequência e as atas das reuniões.",
    "campos": [
      {
        "id": "structure",
        "rotulo": "Estrutura hierárquica do SI",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Descreva a linha de reporte:\nCEO → CISO → Equipe SI\nCEO → Encarregado (independente)"
      },
      {
        "id": "committee",
        "rotulo": "Composição do comitê de SI",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Membros, frequência de reunião, escopo de decisões"
      },
      {
        "id": "meeting_freq",
        "rotulo": "Frequência de reuniões",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "Mensal",
          "Bimestral",
          "Trimestral",
          "Semestral"
        ]
      }
    ],
    "prova": {
      "descricao": "Ato de criação do comitê (regimento ou ata) e atas das reuniões.",
      "obrigatoria": false,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      }
    ]
  },
  {
    "id": "p5_2",
    "fase": 5,
    "ordem": 2,
    "titulo": "Papéis e Responsabilidades do SGSI",
    "clausula": "Cl 5.3, A.5.2",
    "porQue": "Papéis e responsabilidades de segurança são definidos e atribuídos conforme as necessidades da organização (A.5.2), incluindo quem garante a conformidade do SGSI e quem reporta o desempenho à direção (5.3).",
    "campos": [
      {
        "id": "roles",
        "rotulo": "Papéis definidos",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "- CISO: Responsável geral pelo SGSI\n- Encarregado: Privacidade e proteção de dados\n- Gestor de Riscos: Análise e tratamento\n- Auditor Interno: Auditoria independente"
      },
      {
        "id": "raci",
        "rotulo": "Matriz RACI simplificada",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Atividade → Responsável → Aprovador → Consultado → Informado"
      }
    ],
    "prova": {
      "descricao": "Matriz de papéis e responsabilidades aprovada e comunicada.",
      "obrigatoria": true,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      },
      {
        "tipo": "evidencia_anexada",
        "rotulo": "Prova anexada"
      }
    ],
    "gera": "documento"
  },
  {
    "id": "p5_3",
    "fase": 5,
    "ordem": 3,
    "titulo": "Nomeação do Encarregado (DPO)",
    "clausula": "LGPD Art. 41",
    "porQue": "O controlador indica o encarregado por ato formal (LGPD art. 41 e Resolução CD/ANPD nº 18/2024). A identidade e o contato dele são divulgados publicamente, de forma clara, de preferência no site. Registre também como se evita conflito de interesse com outras funções.",
    "campos": [
      {
        "id": "dpo_name",
        "rotulo": "Nome do encarregado",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "Carlos Lima"
      },
      {
        "id": "dpo_type",
        "rotulo": "Tipo de encarregado",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "Pessoa da organização",
          "Pessoa natural externa",
          "Pessoa jurídica contratada"
        ]
      },
      {
        "id": "act",
        "rotulo": "Ato formal de indicação (documento e data)",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "Portaria interna nº 12, de 10/03/2026"
      },
      {
        "id": "publication",
        "rotulo": "Onde a identidade e o contato do encarregado estão divulgados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "página de privacidade do site, rodapé do portal do cliente"
      },
      {
        "id": "conflicts",
        "rotulo": "Outras funções exercidas e como se evita conflito de interesse",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "acumula a Ouvidoria; não decide sobre os tratamentos que avalia"
      }
    ],
    "prova": {
      "descricao": "Ato de indicação assinado e a página pública com o contato do encarregado.",
      "obrigatoria": true,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      },
      {
        "tipo": "evidencia_anexada",
        "rotulo": "Prova anexada"
      }
    ],
    "gera": "documento"
  },
  {
    "id": "p6_1",
    "fase": 6,
    "ordem": 1,
    "titulo": "Análise de Contexto Interno e Externo",
    "clausula": "Cl 4.1",
    "porQue": "A organização determina as questões internas e externas relevantes para o propósito dela e que afetam a capacidade de o SGSI alcançar os resultados pretendidos. Desde a emenda de 2024, inclui avaliar se a mudança climática é uma questão relevante.",
    "campos": [
      {
        "id": "internal",
        "rotulo": "Fatores internos relevantes",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Cultura organizacional, estrutura, estratégia, capacidades técnicas, processos..."
      },
      {
        "id": "external",
        "rotulo": "Fatores externos relevantes",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Regulamentações (LGPD, BACEN), mercado, concorrência, tecnologia, ameaças cibernéticas..."
      },
      {
        "id": "swot",
        "rotulo": "Análise SWOT (opcional)",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Forças, Fraquezas, Oportunidades, Ameaças"
      }
    ],
    "prova": {
      "descricao": "Análise de contexto datada e revisada (por exemplo, na análise crítica).",
      "obrigatoria": true,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      },
      {
        "tipo": "evidencia_anexada",
        "rotulo": "Prova anexada"
      }
    ],
    "gera": "documento"
  },
  {
    "id": "p6_2",
    "fase": 6,
    "ordem": 2,
    "titulo": "Partes Interessadas e Requisitos",
    "clausula": "Cl 4.2",
    "porQue": "A organização determina as partes interessadas relevantes, os requisitos delas e quais desses requisitos serão tratados pelo SGSI. O auditor pede a ligação entre cada requisito e o controle ou processo que o atende.",
    "campos": [
      {
        "id": "stakeholders",
        "rotulo": "Partes interessadas identificadas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "- Clientes: Esperam proteção de dados\n- Reguladores (ANPD): Conformidade LGPD\n- Acionistas: Gestão de riscos\n- Colaboradores: Privacidade\n- Fornecedores: Segurança da cadeia"
      },
      {
        "id": "requirements",
        "rotulo": "Requisitos por parte interessada",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Para cada parte, listar seus requisitos de SI relevantes"
      }
    ],
    "prova": {
      "descricao": "Lista de partes interessadas com requisitos e como cada um é tratado.",
      "obrigatoria": true,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      },
      {
        "tipo": "evidencia_anexada",
        "rotulo": "Prova anexada"
      }
    ],
    "gera": "documento"
  },
  {
    "id": "p6_3",
    "fase": 6,
    "ordem": 3,
    "titulo": "Matriz de Requisitos Legais e Regulatórios",
    "clausula": "Cl 4.2, A.5.31",
    "porQue": "Requisitos legais, regulatórios e contratuais relevantes para a segurança são identificados, documentados e mantidos atualizados, com a abordagem para atendê-los (A.5.31). Inclua a LGPD e a regulamentação setorial.",
    "campos": [
      {
        "id": "legal",
        "rotulo": "Requisitos legais e regulatórios",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "LGPD, Marco Civil, regulamentação setorial (BACEN, ANS, ANATEL)"
      },
      {
        "id": "contractual",
        "rotulo": "Requisitos contratuais",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Cláusulas de SI em contratos com clientes, SLAs de disponibilidade"
      },
      {
        "id": "business",
        "rotulo": "Requisitos de negócio",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Certificação ISO para participar de licitações"
      }
    ],
    "prova": {
      "descricao": "Matriz de requisitos com fonte, responsável e data da última revisão.",
      "obrigatoria": true,
      "aceita": "ambos"
    },
    "ondeVive": [],
    "concluidoQuando": [
      {
        "tipo": "campos_preenchidos",
        "rotulo": "Campos obrigatórios preenchidos"
      },
      {
        "tipo": "evidencia_anexada",
        "rotulo": "Prova anexada"
      }
    ],
    "gera": "documento"
  }
];
