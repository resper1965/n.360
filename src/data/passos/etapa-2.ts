// Etapa 2 da trilha (fases 7 a 13). Gerado por scripts/passos-esqueleto.mjs e editado à mão: o conteúdo daqui é o do produto.
import type { FaseDoCatalogo, Passo } from './tipos';

export const FASES_ETAPA_2: FaseDoCatalogo[] = [
  {
    "numero": 7,
    "etapa": 2,
    "titulo": "Inventário de Ativos e Dados",
    "clausula": "A.5.9",
    "objetivo": "Listar e classificar todos os ativos de informação, softwares, hardwares e dados pessoais (RoPA). Atribuir owners (proprietários) para cada ativo do SGSI/SGPI."
  },
  {
    "numero": 8,
    "etapa": 2,
    "titulo": "Mapeamento de Processos",
    "clausula": "",
    "objetivo": "Desenhar os principais fluxos de dados e processos de negócio, documentando como a informação entra, é processada e sai da organização, identificando pontos críticos de risco."
  },
  {
    "numero": 9,
    "etapa": 2,
    "titulo": "Riscos de Segurança",
    "clausula": "6.1.2",
    "objetivo": "Identificar ameaças e vulnerabilidades para cada ativo do inventário. Calcular o risco bruto usando a metodologia impacto × probabilidade e mapear os controles mitigadores do Anexo A."
  },
  {
    "numero": 10,
    "etapa": 2,
    "titulo": "Riscos de Privacidade",
    "clausula": "27701",
    "objetivo": "Avaliar os riscos relacionados à privacidade dos dados de titulares (PII). Conduzir DPIA/RIPD para os fluxos identificados como de alto risco para os direitos dos titulares."
  },
  {
    "numero": 11,
    "etapa": 2,
    "titulo": "Tratamento de Riscos",
    "clausula": "6.1.3",
    "objetivo": "Definir a opção de tratamento (Evitar, Transferir, Aceitar ou Mitigar) para cada risco. Elaborar o Plano de Tratamento de Riscos (RTP) com cronogramas e responsáveis."
  },
  {
    "numero": 12,
    "etapa": 2,
    "titulo": "SoA do SGSI",
    "clausula": "6.1.3d",
    "objetivo": "Elaborar a Declaração de Aplicabilidade (SoA) para os 93 controles da ISO 27001:2022. Todo controle excluído deve possuir uma justificativa robusta aprovada pela direção."
  },
  {
    "numero": 13,
    "etapa": 2,
    "titulo": "SoA do SGPI",
    "clausula": "27701",
    "objetivo": "Mapear e justificar a aplicabilidade dos controles adicionais de privacidade da ISO 27701 (Anexos A e B), gerando o Statement of Applicability específico para dados pessoais."
  }
];

export const PASSOS_ETAPA_2: Passo[] = [
  {
    "id": "p7_1",
    "fase": 7,
    "ordem": 1,
    "titulo": "Inventário de Ativos de Informação",
    "clausula": "A.5.9",
    "porQue": "O inventário cobre informações e outros ativos associados, com proprietário definido, e é mantido atualizado. O auditor sorteia ativos e confere se estão no inventário e se o proprietário sabe disso.",
    "campos": [
      {
        "id": "categories",
        "rotulo": "Categorias de ativos mapeados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "- Hardware: servidores, laptops, mobile\n- Software: ERP, CRM, custom apps\n- Dados: bancos de dados, file servers\n- Serviços: cloud, SaaS, APIs\n- Pessoas: equipes críticas"
      },
      {
        "id": "classification",
        "rotulo": "Esquema de classificação adotado",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "Público / Interno / Confidencial / Restrito",
          "Baixo / Médio / Alto / Crítico",
          "Outro"
        ]
      },
      {
        "id": "total_count",
        "rotulo": "Quantidade total de ativos inventariados",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "250 ativos"
      }
    ],
    "prova": {
      "descricao": "Inventário de ativos com proprietário, localização e classificação.",
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
    "id": "p7_2",
    "fase": 7,
    "ordem": 2,
    "titulo": "Inventário de Dados Pessoais",
    "clausula": "LGPD Art. 37, ISO/IEC 27701",
    "porQue": "O inventário de dados pessoais é a base do registro das operações de tratamento (LGPD art. 37) e do SGPI. Identifique dados sensíveis (art. 11) e de crianças e adolescentes (art. 14), que pedem base legal e cuidados próprios.",
    "campos": [
      {
        "id": "categories",
        "rotulo": "Categorias de dados pessoais",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Cadastrais (nome, CPF, endereço)\nFinanceiros (dados bancários)\nSensíveis (saúde: atestados)"
      },
      {
        "id": "locations",
        "rotulo": "Onde estão (sistemas, bancos, arquivos, fornecedores)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "ERP, CRM, pasta do RH, folha de pagamento terceirizada"
      },
      {
        "id": "titulares",
        "rotulo": "Categorias de titulares",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "clientes, colaboradores, candidatos, fornecedores pessoa física"
      },
      {
        "id": "special",
        "rotulo": "Há dados sensíveis ou de crianças e adolescentes?",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "Sim, dados sensíveis",
          "Sim, de crianças e adolescentes",
          "Sim, ambos",
          "Não"
        ]
      }
    ],
    "prova": {
      "descricao": "Inventário de dados pessoais por sistema ou processo; no n.privacy, os Tratamentos (RoPA).",
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
    "id": "p7_3",
    "fase": 7,
    "ordem": 3,
    "titulo": "Classificação de Ativos por Criticidade",
    "clausula": "A.5.12",
    "porQue": "A informação é classificada segundo as necessidades de confidencialidade, integridade e disponibilidade e os requisitos das partes interessadas. O esquema é aplicado de forma consistente e revisado; a rotulagem segue o esquema (A.5.13).",
    "campos": [
      {
        "id": "criteria",
        "rotulo": "Critérios de classificação de criticidade",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Como a criticidade é determinada? (impacto no negócio, sensibilidade dos dados, regulatório)"
      },
      {
        "id": "critical_assets",
        "rotulo": "Ativos classificados como críticos",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Liste os ativos de maior criticidade"
      },
      {
        "id": "review_freq",
        "rotulo": "Frequência de revisão do inventário",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "Mensal",
          "Trimestral",
          "Semestral",
          "Anual"
        ]
      }
    ],
    "prova": {
      "descricao": "Esquema de classificação aprovado e o inventário com a classificação aplicada.",
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
    "id": "p7_4",
    "fase": 7,
    "ordem": 4,
    "titulo": "Proprietários dos Ativos",
    "clausula": "A.5.9",
    "porQue": "Todo ativo do inventário tem um proprietário: a pessoa ou função responsável por classificar, proteger e autorizar o acesso. O auditor escolhe ativos ao acaso e pergunta quem é o dono.",
    "campos": [
      {
        "id": "owners",
        "rotulo": "Ativo ou grupo de ativos — proprietário (cargo)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "ERP — Diretor Financeiro\nServidores de produção — Gerente de Infraestrutura\nBase de clientes — Diretor Comercial"
      },
      {
        "id": "duties",
        "rotulo": "Responsabilidades comunicadas aos proprietários",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "classificar, aprovar acessos, revisar acessos periodicamente"
      },
      {
        "id": "ack",
        "rotulo": "Como o proprietário confirmou",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "e-mail de aceite, assinatura, ata"
      }
    ],
    "prova": {
      "descricao": "Inventário com o proprietário de cada ativo e o registro de ciência dele.",
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
    "id": "p8_1",
    "fase": 8,
    "ordem": 1,
    "titulo": "Mapeamento de Processos Críticos",
    "clausula": "Cl 4.1, 4.3",
    "porQue": "Saber quais processos sustentam o negócio orienta o escopo, a análise de riscos e a continuidade. Cada processo crítico tem um responsável e as dependências entre processos ficam visíveis.",
    "campos": [
      {
        "id": "processes",
        "rotulo": "Processos de negócio identificados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Liste os processos principais com breve descrição"
      },
      {
        "id": "owners",
        "rotulo": "Proprietários dos processos",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Processo → Responsável"
      },
      {
        "id": "dependencies",
        "rotulo": "Dependências entre processos",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Quais processos dependem de quais?"
      }
    ],
    "prova": {
      "descricao": "Mapa de processos com responsáveis e dependências.",
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
    "id": "p8_2",
    "fase": 8,
    "ordem": 2,
    "titulo": "Fluxo de Dados",
    "clausula": "A.5.14, LGPD Art. 37",
    "porQue": "O fluxo mostra por onde a informação entra, é processada, armazenada e transferida, dentro e fora da organização. Ele revela as transferências que precisam de regra (A.5.14) e as operações que entram no registro de tratamento (LGPD art. 37).",
    "campos": [
      {
        "id": "flows",
        "rotulo": "Fluxos de dados identificados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Descreva os fluxos: origem → processamento → destino → armazenamento"
      },
      {
        "id": "external",
        "rotulo": "Fluxos externos (terceiros, cloud)",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Dados que saem da organização, para onde e por quê"
      },
      {
        "id": "sensitive",
        "rotulo": "Fluxos de dados sensíveis",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Quais fluxos envolvem dados sensíveis ou regulados?"
      }
    ],
    "prova": {
      "descricao": "Diagrama de fluxo de dados versionado.",
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
    "id": "p8_3",
    "fase": 8,
    "ordem": 3,
    "titulo": "Pontos de Coleta e Descarte",
    "clausula": "LGPD Art. 15, 16; A.8.10",
    "porQue": "A LGPD pede que o dado seja eliminado ao término do tratamento (art. 15 e 16), salvo as hipóteses de conservação previstas na lei. Saber onde o dado entra e por onde sai é a base da tabela de temporalidade e do controle A.8.10 (exclusão de informação).",
    "campos": [
      {
        "id": "collection",
        "rotulo": "Pontos de coleta de dados pessoais (canal — dados — finalidade)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Formulário do site — nome, e-mail — contato comercial\nAdmissão — documentos pessoais — contratação"
      },
      {
        "id": "disposal",
        "rotulo": "Pontos de descarte e eliminação (onde e como o dado sai)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Arquivo em papel — fragmentação\nBackups — expiração automática"
      },
      {
        "id": "gaps",
        "rotulo": "Dados sem regra de descarte",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "planilhas antigas de candidatos no servidor de arquivos"
      }
    ],
    "prova": {
      "descricao": "Mapa de pontos de coleta e de descarte por processo.",
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
    "id": "p9_1",
    "fase": 9,
    "ordem": 1,
    "titulo": "Metodologia de Gestão de Riscos",
    "clausula": "Cl 6.1.2",
    "porQue": "O processo de avaliação de riscos define critérios de aceitação e de execução da avaliação e produz resultados consistentes, válidos e comparáveis quando repetido. O auditor confere se a metodologia aprovada é a mesma usada na matriz.",
    "campos": [
      {
        "id": "approach",
        "rotulo": "Abordagem escolhida",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "Qualitativa (matriz 5x5)",
          "Semi-quantitativa",
          "Quantitativa (FAIR)",
          "Híbrida"
        ]
      },
      {
        "id": "impact_scale",
        "rotulo": "Escala de impacto",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "1-Negligível, 2-Baixo, 3-Médio, 4-Alto, 5-Crítico\nDescreva cada nível"
      },
      {
        "id": "likelihood_scale",
        "rotulo": "Escala de probabilidade",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "1-Raro, 2-Improvável, 3-Possível, 4-Provável, 5-Quase certo"
      },
      {
        "id": "acceptance",
        "rotulo": "Critério de aceitação de risco",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "Riscos com score ≤ 6 são aceitos"
      },
      {
        "id": "frequency",
        "rotulo": "Frequência de reavaliação",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "Trimestral",
          "Semestral",
          "Anual",
          "Após incidentes"
        ]
      }
    ],
    "prova": {
      "descricao": "Metodologia aprovada pela direção, com escalas e critério de aceitação.",
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
    "id": "p9_2",
    "fase": 9,
    "ordem": 2,
    "titulo": "Workshop de Identificação de Riscos",
    "clausula": "Cl 6.1.2, 8.2",
    "porQue": "A identificação aponta riscos de perda de confidencialidade, integridade e disponibilidade no escopo e indica o proprietário de cada risco (6.1.2 c). Guarde a lista de presença e o resultado bruto do workshop.",
    "campos": [
      {
        "id": "date",
        "rotulo": "Data do workshop",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "participants",
        "rotulo": "Participantes (nome e área)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Maria Santos — TI\nAna Souza — RH\nPedro Costa — Operações"
      },
      {
        "id": "format",
        "rotulo": "Formato",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "Workshop presencial",
          "Workshop remoto",
          "Entrevistas individuais"
        ]
      },
      {
        "id": "scenarios",
        "rotulo": "Riscos identificados (ativo — ameaça — vulnerabilidade)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "ERP — ransomware — backups no mesmo domínio\nBase de clientes — vazamento — acesso amplo demais"
      },
      {
        "id": "owners",
        "rotulo": "Proprietários de risco indicados",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "cada risco com o gestor da área afetada"
      }
    ],
    "prova": {
      "descricao": "Lista de presença e a lista de riscos levantados no workshop.",
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
    "id": "p9_3",
    "fase": 9,
    "ordem": 3,
    "titulo": "Matriz de Riscos de Segurança",
    "clausula": "Cl 6.1.2, 8.2",
    "porQue": "A matriz analisa as consequências e a probabilidade de cada risco, determina o nível e prioriza o tratamento, sempre com os critérios da metodologia. A avaliação é refeita em intervalos planejados e quando há mudança significativa (8.2).",
    "campos": [
      {
        "id": "total_risks",
        "rotulo": "Total de riscos avaliados",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "critical",
        "rotulo": "Riscos críticos (vermelho)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Score ≥ 15. Liste cada risco."
      },
      {
        "id": "high",
        "rotulo": "Riscos altos (laranja)",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Score 10-14"
      },
      {
        "id": "medium",
        "rotulo": "Riscos médios (amarelo)",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Score 5-9"
      },
      {
        "id": "low",
        "rotulo": "Riscos baixos (verde)",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Score ≤ 4"
      }
    ],
    "prova": {
      "descricao": "Matriz de riscos datada, com nível, proprietário e prioridade de cada risco.",
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
    "id": "p10_1",
    "fase": 10,
    "ordem": 1,
    "titulo": "Relatório de Impacto (RIPD) de Alto Risco",
    "clausula": "LGPD Art. 38, ISO/IEC 27701",
    "porQue": "O relatório de impacto descreve os tipos de dados tratados, a metodologia de coleta e de garantia da segurança e a análise do controlador sobre medidas, salvaguardas e mecanismos de mitigação de risco (LGPD art. 38). A ANPD pode solicitá-lo. Registre o parecer do encarregado.",
    "campos": [
      {
        "id": "operation",
        "rotulo": "Operação avaliada",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "Processamento de dados de saúde, scoring de crédito"
      },
      {
        "id": "data_types",
        "rotulo": "Tipos de dados envolvidos",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "risks",
        "rotulo": "Riscos à privacidade identificados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "measures",
        "rotulo": "Medidas mitigatórias propostas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "dpo_opinion",
        "rotulo": "Parecer do encarregado",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Recomendação do encarregado sobre o tratamento"
      }
    ],
    "prova": {
      "descricao": "RIPD aprovado, com o parecer do encarregado; no n.privacy, a tela RIPD do tratamento.",
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
    "id": "p10_2",
    "fase": 10,
    "ordem": 2,
    "titulo": "Riscos aos Direitos dos Titulares",
    "clausula": "ISO/IEC 27701, LGPD Art. 38",
    "porQue": "Além dos riscos à organização, o SGPI avalia os riscos aos titulares: discriminação, perda de controle sobre os próprios dados, dano financeiro ou à reputação. Esses riscos entram na mesma avaliação e no mesmo tratamento do SGSI.",
    "campos": [
      {
        "id": "risks",
        "rotulo": "Riscos de privacidade",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Liste os riscos de privacidade com impacto e probabilidade"
      },
      {
        "id": "affected_groups",
        "rotulo": "Grupos de titulares afetados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Clientes, colaboradores, candidatos, parceiros..."
      }
    ],
    "prova": {
      "descricao": "Registro de riscos à privacidade por tratamento, com os grupos de titulares afetados.",
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
    "id": "p11_1",
    "fase": 11,
    "ordem": 1,
    "titulo": "Plano de Tratamento de Riscos (PTR)",
    "clausula": "Cl 6.1.3, 8.3",
    "porQue": "Para cada risco acima do critério, o plano escolhe a opção de tratamento (mitigar, evitar, transferir ou aceitar), os controles, o responsável e o prazo. O plano é aprovado pelos proprietários dos riscos e executado (8.3).",
    "campos": [
      {
        "id": "risks",
        "rotulo": "Riscos a tratar (acima do critério de aceitação)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Risco → Opção de tratamento → Controle → Responsável → Prazo"
      },
      {
        "id": "treatment_options",
        "rotulo": "Opções de tratamento utilizadas",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Mitigar, Transferir, Evitar, Aceitar — para cada risco"
      },
      {
        "id": "budget",
        "rotulo": "Orçamento para tratamento",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "Custo estimado das ações"
      }
    ],
    "prova": {
      "descricao": "Plano de tratamento aprovado, com responsáveis, prazos e situação de cada ação.",
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
    "id": "p11_2",
    "fase": 11,
    "ordem": 2,
    "titulo": "Controles de Mitigação por Risco",
    "clausula": "Cl 6.1.3 b, c",
    "porQue": "Os controles são determinados pelo tratamento escolhido para cada risco e comparados com o Anexo A, para não omitir nenhum controle necessário. O mesmo mapeamento alimenta a Declaração de Aplicabilidade.",
    "campos": [
      {
        "id": "mapping",
        "rotulo": "Mapeamento risco → controle",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Risco X → Controle A.8.24 (Criptografia)\nRisco Y → Controle A.5.15 (Controle de Acesso)"
      }
    ],
    "prova": {
      "descricao": "Mapeamento risco para controle, ligado ao plano de tratamento.",
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
    "id": "p11_3",
    "fase": 11,
    "ordem": 3,
    "titulo": "Aceite dos Riscos Residuais",
    "clausula": "Cl 6.1.3 f",
    "porQue": "O plano de tratamento e a aceitação dos riscos residuais são aprovados pelos proprietários dos riscos. O auditor procura essa aprovação registrada, com nome, data e o nível de risco aceito.",
    "campos": [
      {
        "id": "approver",
        "rotulo": "Quem aceitou os riscos residuais?",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "Deve ser a alta direção ou proprietário do risco"
      },
      {
        "id": "date",
        "rotulo": "Data da aceitação",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "total_accepted",
        "rotulo": "Quantidade de riscos aceitos",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "highest_risk",
        "rotulo": "Maior risco residual aceito (score)",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "R-015 (score 8/25)"
      },
      {
        "id": "justification",
        "rotulo": "Justificativa da aceitação",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Por que os riscos residuais são aceitáveis?"
      }
    ],
    "prova": {
      "descricao": "Termo de aceite dos riscos residuais assinado pelos proprietários.",
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
    "id": "p12_1",
    "fase": 12,
    "ordem": 1,
    "titulo": "Declaração de Aplicabilidade (SoA) do SGSI",
    "clausula": "Cl 6.1.3 d",
    "porQue": "A Declaração de Aplicabilidade lista os controles necessários, a justificativa de inclusão, se estão implementados e a justificativa de exclusão de controles do Anexo A. O auditor a usa como roteiro da auditoria.",
    "campos": [
      {
        "id": "total_controls",
        "rotulo": "Total de controles no SoA",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "93 (Anexo A ISO 27001:2022)"
      },
      {
        "id": "applicable",
        "rotulo": "Controles aplicáveis",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "88"
      },
      {
        "id": "excluded",
        "rotulo": "Controles excluídos com justificativa",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Controle → Justificativa de exclusão"
      }
    ],
    "prova": {
      "descricao": "SoA versionada e aprovada; no n.iso, a tela SoA.",
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
    "id": "p12_2",
    "fase": 12,
    "ordem": 2,
    "titulo": "Justificativa de Inclusões e Exclusões",
    "clausula": "Cl 6.1.3 d",
    "porQue": "Inclusões se justificam pelo tratamento de riscos ou por requisito legal ou contratual; exclusões, pela inexistência do cenário no escopo. Justificativa baseada em conveniência, ou em o controle ainda não existir, é não conformidade.",
    "campos": [
      {
        "id": "justifications",
        "rotulo": "Justificativa por controle (inclusão ou exclusão)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "A.8.24 — Incluído: risco R-03 (vazamento de dados de clientes)\nA.8.30 — Excluído: a organização não contrata desenvolvimento de software"
      }
    ],
    "prova": {
      "descricao": "Coluna de justificativa preenchida para todos os 93 controles na SoA.",
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
    "id": "p13_1",
    "fase": 13,
    "ordem": 1,
    "titulo": "Declaração de Aplicabilidade (SoA) do SGPI",
    "clausula": "ISO/IEC 27701",
    "porQue": "A declaração do SGPI inclui os controles de privacidade da ISO/IEC 27701 conforme o papel da organização (controladora, operadora ou ambos), com justificativa de inclusão e de exclusão, como na SoA do SGSI.",
    "campos": [
      {
        "id": "privacy_controls",
        "rotulo": "Controles de privacidade aplicáveis",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Liste os controles ISO 27701 aplicáveis"
      },
      {
        "id": "status",
        "rotulo": "Status de implementação",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Controle → Status (implementado/parcial/não implementado)"
      }
    ],
    "prova": {
      "descricao": "SoA de privacidade versionada e aprovada.",
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
    "id": "p13_2",
    "fase": 13,
    "ordem": 2,
    "titulo": "Controles Adicionais da ISO/IEC 27701",
    "clausula": "ISO/IEC 27701",
    "porQue": "Os controles de privacidade da ISO/IEC 27701 complementam o Anexo A da ISO/IEC 27001. Separe os que valem para a organização como controladora dos que valem como operadora e ligue cada um à exigência da LGPD que ele atende.",
    "campos": [
      {
        "id": "controls",
        "rotulo": "Mapeamento de controles ISO 27701",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Seção → Controle → Descrição → Status"
      }
    ],
    "prova": {
      "descricao": "Mapeamento dos controles da 27701 com a situação de cada um.",
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
