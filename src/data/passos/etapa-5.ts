// Etapa 5 da trilha (fases 29 a 33). Gerado por scripts/passos-esqueleto.mjs e editado à mão: o conteúdo daqui é o do produto.
import type { FaseDoCatalogo, Passo } from './tipos';

export const FASES_ETAPA_5: FaseDoCatalogo[] = [
  {
    "numero": 29,
    "etapa": 5,
    "titulo": "Treinamento",
    "clausula": "A.6.3",
    "objetivo": "Elaborar material e aplicar treinamento anual obrigatório de segurança da informação e privacidade para 100% dos colaboradores da empresa."
  },
  {
    "numero": 30,
    "etapa": 5,
    "titulo": "Monitoramento e Métricas",
    "clausula": "9.1",
    "objetivo": "Definir indicadores-chave de performance (KPIs) do SGSI, acompanhar a eficácia dos controles e gerar relatórios periódicos para a diretoria."
  },
  {
    "numero": 31,
    "etapa": 5,
    "titulo": "Auditoria Interna",
    "clausula": "9.2",
    "objetivo": "Executar a auditoria interna do SGSI contra todos os requisitos da norma ISO 27001. Deve ser feita por profissional independente qualificado."
  },
  {
    "numero": 32,
    "etapa": 5,
    "titulo": "Não Conformidades",
    "clausula": "10.1",
    "objetivo": "Investigar as causas-raiz de quaisquer desvios encontrados na auditoria e abrir planos de Ação Corretiva (CAPAs) para eliminar recorrências."
  },
  {
    "numero": 33,
    "etapa": 5,
    "titulo": "Análise Crítica",
    "clausula": "9.3",
    "objetivo": "Conduzir a reunião de análise crítica anual liderada pelo CEO para avaliar o desempenho do SGSI e aprovar melhorias e orçamentos."
  }
];

export const PASSOS_ETAPA_5: Passo[] = [
  {
    "id": "p29_1",
    "fase": 29,
    "ordem": 1,
    "titulo": "Treinamento Geral de Segurança e LGPD",
    "clausula": "Cl 7.2, 7.3, A.6.3",
    "porQue": "Colaboradores e partes relevantes recebem conscientização, educação e treinamento adequados à função, com atualizações periódicas (A.6.3). A norma pede que as pessoas conheçam a política e a contribuição delas para o sistema (7.3).",
    "campos": [
      {
        "id": "date",
        "rotulo": "Data do treinamento",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "format",
        "rotulo": "Formato",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "Presencial",
          "Online ao vivo",
          "E-learning",
          "Híbrido"
        ]
      },
      {
        "id": "attendance",
        "rotulo": "Taxa de participação",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "92% (230 de 250 colaboradores)"
      },
      {
        "id": "topics",
        "rotulo": "Temas cobertos",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Segurança da informação, phishing, senhas, clean desk, LGPD"
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (lista de presença, relatório LMS)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Lista de presença ou relatório da plataforma de ensino, com o conteúdo.",
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
    "id": "p29_2",
    "fase": 29,
    "ordem": 2,
    "titulo": "Campanha de Phishing e Engenharia Social",
    "clausula": "A.6.3",
    "porQue": "Simulações medem se a conscientização funciona, e a evolução dos resultados é um bom indicador (Cl 9.1). Informe os colaboradores de que campanhas acontecem e trate o resultado individual com discrição.",
    "campos": [
      {
        "id": "date",
        "rotulo": "Data da campanha",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "scope",
        "rotulo": "Público e cenário",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "todos os colaboradores; e-mail falso de troca de senha"
      },
      {
        "id": "results",
        "rotulo": "Resultados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "250 envios, 18 cliques, 40 reportes ao suporte"
      },
      {
        "id": "actions",
        "rotulo": "Ações para quem clicou",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "treinamento curto e nova simulação no trimestre seguinte"
      }
    ],
    "prova": {
      "descricao": "Relatório da campanha com resultados e ações de reforço.",
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
    "id": "p29_3",
    "fase": 29,
    "ordem": 3,
    "titulo": "Registros de Participação",
    "clausula": "Cl 7.2",
    "porQue": "A organização guarda informação documentada como evidência de competência (7.2). O auditor confere uma amostra de colaboradores contra os registros de treinamento.",
    "campos": [
      {
        "id": "total",
        "rotulo": "Total de colaboradores treinados",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "coverage_pct",
        "rotulo": "Percentual de cobertura",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "92%"
      },
      {
        "id": "storage",
        "rotulo": "Onde estão os registros?",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "LMS, planilha RH, sistema de gestão"
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (relatório do LMS, lista)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Registros de participação de todos os colaboradores no escopo.",
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
    "id": "p30_1",
    "fase": 30,
    "ordem": 1,
    "titulo": "Indicadores de Desempenho (KPIs e KRIs)",
    "clausula": "Cl 9.1",
    "porQue": "A organização determina o que monitorar e medir, os métodos, quando medir, quem mede e quem analisa os resultados. Indicador sem meta, responsável ou frequência não sustenta a avaliação de desempenho.",
    "campos": [
      {
        "id": "kpis",
        "rotulo": "KPIs definidos",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "- % de patches aplicados em SLA\n- Tempo médio de resposta a incidentes\n- % de colaboradores treinados\n- Número de vulnerabilidades críticas\n- % de conformidade SoA"
      },
      {
        "id": "targets",
        "rotulo": "Metas por KPI",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "KPI → Meta → Frequência de medição"
      }
    ],
    "prova": {
      "descricao": "Ficha de cada indicador com meta, método, frequência e responsável.",
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
    "id": "p30_2",
    "fase": 30,
    "ordem": 2,
    "titulo": "Painel de Conformidade",
    "clausula": "Cl 9.1",
    "porQue": "O painel torna os resultados de monitoramento visíveis para quem decide e alimenta a análise crítica pela direção (9.3).",
    "campos": [
      {
        "id": "tool",
        "rotulo": "Ferramenta de dashboard",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "Grafana, Power BI, n.iso dashboard, planilha"
      },
      {
        "id": "kpis",
        "rotulo": "KPIs monitorados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (print do dashboard)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Captura do painel com os indicadores e a data.",
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
    "id": "p30_3",
    "fase": 30,
    "ordem": 3,
    "titulo": "Evidências de Monitoramento e Medição",
    "clausula": "Cl 9.1",
    "porQue": "A norma pede informação documentada como evidência dos resultados de monitoramento e medição. Guarde os relatórios periódicos, não só o painel do momento.",
    "campos": [
      {
        "id": "content",
        "rotulo": "Conteúdo do relatório",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "KPIs, tendências, incidentes, ações corretivas, próximos passos"
      },
      {
        "id": "frequency",
        "rotulo": "Frequência",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "Mensal",
          "Trimestral",
          "Semestral"
        ]
      }
    ],
    "prova": {
      "descricao": "Relatórios periódicos de indicadores guardados com data.",
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
    "id": "p31_1",
    "fase": 31,
    "ordem": 1,
    "titulo": "Programa e Plano de Auditoria Interna",
    "clausula": "Cl 9.2",
    "porQue": "O programa define frequência, métodos, responsabilidades e relatórios (9.2.2); cada auditoria tem critérios e escopo, e os auditores são escolhidos para garantir objetividade e imparcialidade. Quem implementa não audita o próprio trabalho.",
    "campos": [
      {
        "id": "program",
        "rotulo": "Programa de auditoria (escopo, agenda, critérios)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Frequência: anual\nEscopo: Todas as cláusulas + Anexo A\nCritério: ISO 27001:2022\nAuditor: independente qualificado"
      },
      {
        "id": "criteria",
        "rotulo": "Critérios de auditoria",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "scope",
        "rotulo": "Escopo da auditoria",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Programa de auditoria aprovado e o plano da auditoria do ciclo.",
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
    "id": "p31_2",
    "fase": 31,
    "ordem": 2,
    "titulo": "Execução da Auditoria Interna",
    "clausula": "Cl 9.2",
    "porQue": "A auditoria interna verifica se o SGSI atende aos requisitos da organização e da norma e se está implementado e mantido de forma eficaz. Antes da certificação, o ciclo cobre todas as cláusulas e os controles aplicáveis.",
    "campos": [
      {
        "id": "date",
        "rotulo": "Data(s) da auditoria",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "scope",
        "rotulo": "Escopo coberto",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Cláusulas auditadas, controles do Anexo A cobertos"
      },
      {
        "id": "findings",
        "rotulo": "Resumo dos achados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "X NCs maiores, Y NCs menores, Z observações"
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (relatório de auditoria)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Registros da auditoria (plano, entrevistas, evidências avaliadas).",
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
    "id": "p31_3",
    "fase": 31,
    "ordem": 3,
    "titulo": "Relatório de Auditoria Interna",
    "clausula": "Cl 9.2",
    "porQue": "Os resultados são relatados à gerência pertinente e guardados como evidência do programa e dos resultados (9.2.2). O relatório alimenta as ações corretivas (10.2) e a análise crítica (9.3).",
    "campos": [
      {
        "id": "findings",
        "rotulo": "Achados da auditoria",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "NC maiores, NC menores, oportunidades de melhoria, observações"
      },
      {
        "id": "conclusion",
        "rotulo": "Conclusão geral",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Relatório de auditoria entregue à direção.",
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
    "id": "p32_1",
    "fase": 32,
    "ordem": 1,
    "titulo": "Registro de Não Conformidades",
    "clausula": "Cl 10.2",
    "porQue": "Para cada não conformidade, a organização reage, controla e corrige, avalia a necessidade de eliminar a causa (analisando a causa raiz e se há casos semelhantes) e guarda a natureza da não conformidade e as ações tomadas (10.2).",
    "campos": [
      {
        "id": "ncs",
        "rotulo": "Não conformidades registradas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "analysis",
        "rotulo": "Análise de causa raiz por NC",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "NC → Causa raiz → Método (5 Porquês, Ishikawa)"
      }
    ],
    "prova": {
      "descricao": "Registro de não conformidades com a análise de causa; no n.iso, Ações corretivas.",
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
    "id": "p32_2",
    "fase": 32,
    "ordem": 2,
    "titulo": "Execução das Ações Corretivas",
    "clausula": "Cl 10.2",
    "porQue": "As ações corretivas são proporcionais aos efeitos da não conformidade e executadas no prazo. Corrigir o sintoma sem tratar a causa leva a não conformidade de volta.",
    "campos": [
      {
        "id": "actions",
        "rotulo": "Ações corretivas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "NC → Ação corretiva → Responsável → Prazo → Status"
      }
    ],
    "prova": {
      "descricao": "Ações corretivas com responsável, prazo e situação.",
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
    "id": "p32_3",
    "fase": 32,
    "ordem": 3,
    "titulo": "Eficácia das Correções",
    "clausula": "Cl 10.2",
    "porQue": "A organização analisa a eficácia de toda ação corretiva tomada (10.2 d). O auditor verifica se a causa foi eliminada e se a não conformidade não se repetiu.",
    "campos": [
      {
        "id": "verifier",
        "rotulo": "Quem verificou?",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "date",
        "rotulo": "Data da verificação",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "result",
        "rotulo": "Resultado",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "Todas as correções eficazes",
          "Maioria eficaz, retrabalho em algumas",
          "Correções ineficazes"
        ]
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Registro da verificação de eficácia, com data e responsável.",
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
    "id": "p33_1",
    "fase": 33,
    "ordem": 1,
    "titulo": "Entradas da Análise Crítica",
    "clausula": "Cl 9.3.2",
    "porQue": "A análise crítica considera a situação das ações anteriores, mudanças nas questões internas e externas e nas necessidades das partes interessadas, desempenho (não conformidades, monitoramento, auditorias, objetivos), retorno das partes interessadas, riscos e oportunidades de melhoria.",
    "campos": [
      {
        "id": "agenda",
        "rotulo": "Itens da pauta",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "1. Status de ações anteriores\n2. Mudanças internas/externas\n3. Desempenho de SI (KPIs)\n4. Resultados de auditoria\n5. NCs e ações corretivas\n6. Oportunidades de melhoria\n7. Recursos necessários"
      }
    ],
    "prova": {
      "descricao": "Pauta e material de entrada preparados para a reunião.",
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
    "id": "p33_2",
    "fase": 33,
    "ordem": 2,
    "titulo": "Reunião de Análise Crítica com a Alta Direção",
    "clausula": "Cl 9.3",
    "porQue": "A alta direção analisa o SGSI em intervalos planejados para garantir que continua adequado, suficiente e eficaz. O auditor confere se quem participou é de fato a alta direção.",
    "campos": [
      {
        "id": "date",
        "rotulo": "Data da reunião",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "participants",
        "rotulo": "Participantes da alta direção",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "inputs_covered",
        "rotulo": "Inputs obrigatórios cobertos (Cl 9.3.2)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Status de ações anteriores, mudanças, desempenho SI, auditorias, NCs, melhoria contínua"
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (ata, deliberações)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Convocação, lista de presença e a ata da reunião.",
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
    "id": "p33_3",
    "fase": 33,
    "ordem": 3,
    "titulo": "Ata da Análise Crítica",
    "clausula": "Cl 9.3.3",
    "porQue": "As saídas incluem decisões sobre oportunidades de melhoria e qualquer necessidade de mudança no SGSI (9.3.3). A ata é a evidência que o auditor sempre pede.",
    "campos": [
      {
        "id": "date",
        "rotulo": "Data da reunião",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "participants",
        "rotulo": "Participantes",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "decisions",
        "rotulo": "Decisões tomadas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "actions",
        "rotulo": "Ações definidas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Ata aprovada, com decisões e ações com responsável e prazo.",
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
