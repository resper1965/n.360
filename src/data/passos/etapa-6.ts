// Etapa 6 da trilha (fases 34 a 40). Gerado por scripts/passos-esqueleto.mjs e editado à mão: o conteúdo daqui é o do produto.
import type { FaseDoCatalogo, Passo } from './tipos';

export const FASES_ETAPA_6: FaseDoCatalogo[] = [
  {
    "numero": 34,
    "etapa": 6,
    "titulo": "Readiness Review",
    "clausula": "",
    "objetivo": "Definir a(s) norma(s) no escopo do certificado antes de contratar a certificadora: ISO 27001, ISO 27701 de forma autônoma (2ª edição, 27701:2025) ou integrado 27001+27701 — a escolha do escopo determina quais entregáveis e evidências o Stage 1 vai revisar. Revisar todos os entregáveis do SGSI/SGPI e confirmar que políticas e evidências mínimas estão disponíveis."
  },
  {
    "numero": 35,
    "etapa": 6,
    "titulo": "Preparação Stage 1",
    "clausula": "",
    "objetivo": "Organizar e compilar a documentação do sistema conforme o escopo do certificado (SGSI e/ou SGPI): Escopo, Política, SoA, RoPA/DPIA quando 27701 no escopo, e BCP — para envio ao auditor externo da certificadora."
  },
  {
    "numero": 36,
    "etapa": 6,
    "titulo": "Correções Pós-Stage 1",
    "clausula": "",
    "objetivo": "Tratar quaisquer apontamentos ou não conformidades levantadas pelo auditor na auditoria documental de Estágio 1."
  },
  {
    "numero": 37,
    "etapa": 6,
    "titulo": "Preparação Stage 2",
    "clausula": "",
    "objetivo": "Consolidar a documentação obrigatória do SGSI/SGPI (conforme o escopo do certificado) e organizar as evidências rastreáveis por controle. Confirmar que as NCs do Estágio 1 foram tratadas e que a auditoria interna/simulado cobriu o escopo do certificado."
  },
  {
    "numero": 38,
    "etapa": 6,
    "titulo": "Atendimento ao Auditor",
    "clausula": "",
    "objetivo": "Preparar owners de controle e entrevistados, definir a interface que conduz a evidência durante a auditoria e acordar reunião de abertura e logística (acessos, salas, remoto). Alinhar-se ao foco indicado pelo organismo para o Estágio 2."
  },
  {
    "numero": 39,
    "etapa": 6,
    "titulo": "Pós-Auditoria",
    "clausula": "10.2",
    "objetivo": "Mapear as não conformidades do Estágio 2, submeter plano de ação corretiva (causa raiz + correção) ao organismo e acordar o prazo para evidenciar a eficácia. Sem parecer de certificação — isso é prerrogativa do organismo acreditado."
  },
  {
    "numero": 40,
    "etapa": 6,
    "titulo": "Manutenção e Supervisão",
    "clausula": "10.1 & 9.3",
    "objetivo": "Manter o SGSI/SGPI vivo após o certificado (conforme o escopo): calendário de auditorias de supervisão (surveillance), programa de auditoria interna do próximo ciclo, reavaliação de riscos residuais na análise crítica e planejamento da recertificação ao fim do ciclo de 3 anos."
  }
];

export const PASSOS_ETAPA_6: Passo[] = [
  {
    "id": "p34_0",
    "fase": 34,
    "ordem": 1,
    "titulo": "Norma e Escopo do Certificado",
    "clausula": "Cl 4.3, Certificação",
    "porQue": "O escopo do certificado é o texto que o organismo certificador emite; ele precisa bater com o escopo do SGSI (4.3) e, para a 27701, com o do SGPI. Combine com o organismo se a 27701 será auditada de forma autônoma ou integrada à 27001.",
    "campos": [
      {
        "id": "standards",
        "rotulo": "Norma(s) do certificado",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "ISO/IEC 27001",
          "ISO/IEC 27701 autônoma",
          "ISO/IEC 27001 e ISO/IEC 27701 integradas"
        ]
      },
      {
        "id": "scope_text",
        "rotulo": "Texto do escopo do certificado",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Desenvolvimento e operação da plataforma de vendas online, na sede de São Paulo"
      },
      {
        "id": "sites",
        "rotulo": "Localidades a auditar",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "sede São Paulo; operação remota"
      },
      {
        "id": "body",
        "rotulo": "Organismo certificador",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "organismo acreditado escolhido em cotação"
      }
    ],
    "prova": {
      "descricao": "Escopo do certificado acordado com o organismo certificador.",
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
    "id": "p34_1",
    "fase": 34,
    "ordem": 2,
    "titulo": "Prontidão Final",
    "clausula": "Certificação",
    "porQue": "A prontidão mostra o que ainda falta antes da auditoria do organismo: controles aplicáveis implementados, evidências válidas, auditoria interna e análise crítica concluídas. Índice alto com pré-requisito pendente não basta.",
    "campos": [
      {
        "id": "score",
        "rotulo": "Score de prontidão",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "85%"
      },
      {
        "id": "status",
        "rotulo": "Acima de 80%?",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "Sim, pronto para certificação",
          "Marginal (70-80%)",
          "Abaixo de 70% — não recomendado"
        ]
      },
      {
        "id": "gaps",
        "rotulo": "Áreas com menor score",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Captura da prontidão no n.iso com a data e as áreas mais fracas.",
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
    "id": "p34_2",
    "fase": 34,
    "ordem": 3,
    "titulo": "Pacote de Evidências Consolidado",
    "clausula": "Cl 6.1.3 d, Certificação",
    "porQue": "Cada controle aplicável da SoA tem evidência válida e localizável. Um pacote organizado pelo número do controle encurta a auditoria e evita pedidos repetidos.",
    "campos": [
      {
        "id": "status",
        "rotulo": "Status da SoA",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "Completa com todas evidências",
          "Completa, faltam evidências pontuais",
          "Incompleta"
        ]
      },
      {
        "id": "coverage",
        "rotulo": "Cobertura de evidências (%)",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "location",
        "rotulo": "Onde está o pacote",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "portal do auditor no n.360"
      }
    ],
    "prova": {
      "descricao": "Pacote de evidências organizado por controle; no n.iso, o pacote de auditoria.",
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
    "id": "p34_3",
    "fase": 34,
    "ordem": 4,
    "titulo": "Declaração de Prontidão do Consultor",
    "clausula": "Certificação",
    "porQue": "A declaração não substitui a auditoria: registra, com base em evidências, que os pré-requisitos estão cumpridos e o que ainda merece atenção. A decisão de seguir é da direção da organização.",
    "campos": [
      {
        "id": "summary",
        "rotulo": "Resumo da situação do SGSI",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "sistema em operação há seis meses, com indicadores medidos mensalmente"
      },
      {
        "id": "done",
        "rotulo": "Pré-requisitos cumpridos",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Auditoria interna completa concluída\nAnálise crítica pela direção realizada\nNão conformidades da auditoria interna tratadas\nSoA aprovada"
      },
      {
        "id": "attention",
        "rotulo": "Pontos de atenção remanescentes",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "evidência de teste de restauração do backup vence antes da auditoria"
      },
      {
        "id": "recommendation",
        "rotulo": "Recomendação",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "Pronto para a auditoria de certificação",
          "Pronto com ressalvas",
          "Ainda não recomendado"
        ]
      }
    ],
    "prova": {
      "descricao": "Declaração assinada pelo consultor e entregue à direção.",
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
    "id": "p35_1",
    "fase": 35,
    "ordem": 1,
    "titulo": "Suporte na Auditoria de Fase 1",
    "clausula": "Certificação (fase 1)",
    "porQue": "Na fase 1, o organismo avalia a documentação, o escopo e a preparação para a fase 2. Envie o que for pedido no prazo combinado e registre o que foi enviado.",
    "campos": [
      {
        "id": "sent_docs",
        "rotulo": "Documentos enviados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "sent_date",
        "rotulo": "Data de envio",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Registro dos documentos enviados e da agenda da fase 1.",
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
    "id": "p35_2",
    "fase": 35,
    "ordem": 2,
    "titulo": "Observações do Auditor na Fase 1",
    "clausula": "Certificação (fase 1)",
    "porQue": "Registre cada observação do auditor com a referência do requisito: são os pontos que ele vai verificar primeiro na fase 2.",
    "campos": [
      {
        "id": "findings",
        "rotulo": "Achados documentados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Relatório da fase 1 e a lista de observações.",
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
    "id": "p36_1",
    "fase": 36,
    "ordem": 1,
    "titulo": "Tratamento das Lacunas da Fase 1",
    "clausula": "Certificação (fase 1)",
    "porQue": "Lacunas apontadas na fase 1 precisam estar tratadas antes da fase 2. Para cada uma, registre a ação, o responsável, o prazo e a evidência da correção.",
    "campos": [
      {
        "id": "plan",
        "rotulo": "Plano de correção",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Achado → Ação corretiva → Responsável → Prazo"
      }
    ],
    "prova": {
      "descricao": "Plano de correção com a situação de cada lacuna.",
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
    "id": "p36_2",
    "fase": 36,
    "ordem": 2,
    "titulo": "Ajuste da Documentação Conforme o Retorno",
    "clausula": "Cl 7.5",
    "porQue": "Documentos corrigidos seguem o mesmo controle de versão e de aprovação da cláusula 7.5. O auditor da fase 2 compara a versão nova com a observação que a motivou.",
    "campos": [
      {
        "id": "docs",
        "rotulo": "Documentos ajustados (documento — mudança — observação relacionada)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Política de controle de acesso — incluída a revisão semestral — observação 3 da fase 1"
      },
      {
        "id": "versions",
        "rotulo": "Novas versões e aprovação",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "v1.1 aprovada pelo comitê em 05/08"
      }
    ],
    "prova": {
      "descricao": "Documentos com a nova versão aprovada e o registro da mudança.",
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
    "id": "p37_1",
    "fase": 37,
    "ordem": 1,
    "titulo": "Simulação de Entrevistas para a Fase 2",
    "clausula": "Certificação (fase 2)",
    "porQue": "Na fase 2, o auditor entrevista quem executa os processos. Simular as perguntas ajuda as pessoas a mostrar o que fazem e onde está a evidência, sem decorar respostas.",
    "campos": [
      {
        "id": "date",
        "rotulo": "Data da simulação",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "areas",
        "rotulo": "Áreas e pessoas preparadas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "TI, RH, Jurídico, recepção"
      },
      {
        "id": "faq",
        "rotulo": "Perguntas frequentes e respostas preparadas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Pergunta do auditor → Resposta → Evidência de suporte"
      }
    ],
    "prova": {
      "descricao": "Registro da simulação com pontos fracos encontrados.",
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
    "id": "p37_2",
    "fase": 37,
    "ordem": 2,
    "titulo": "Sala de Auditoria e Logística",
    "clausula": "Certificação (fase 2)",
    "porQue": "Agenda combinada, sala reservada, acompanhante por área e acesso às evidências evitam tempo perdido e deixam o auditor concentrado no que importa.",
    "campos": [
      {
        "id": "agenda",
        "rotulo": "Agenda acordada com o auditor",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "dia 1 — abertura e liderança; dia 2 — operações e TI"
      },
      {
        "id": "room",
        "rotulo": "Sala, acesso à rede e acompanhantes",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "sala 3 reservada, guia por área, crachá de visitante"
      },
      {
        "id": "evidence_access",
        "rotulo": "Como o auditor acessará as evidências",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "portal do auditor no n.360, somente leitura"
      }
    ],
    "prova": {
      "descricao": "Agenda confirmada com o organismo e a lista de acompanhantes.",
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
    "id": "p38_2",
    "fase": 38,
    "ordem": 1,
    "titulo": "Evidências Solicitadas Fornecidas",
    "clausula": "Certificação (fase 2)",
    "porQue": "Registre cada evidência pedida e quando foi entregue. Pedido sem resposta vira constatação; resposta rápida e organizada mostra um sistema sob controle.",
    "campos": [
      {
        "id": "total_requested",
        "rotulo": "Total de evidências solicitadas pelo auditor",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "provided",
        "rotulo": "Fornecidas com sucesso",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "issues",
        "rotulo": "Evidências não encontradas (se houver)",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Lista de pedidos do auditor com a data de entrega.",
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
    "id": "p38_3",
    "fase": 38,
    "ordem": 2,
    "titulo": "Registro de Observações do Auditor",
    "clausula": "Certificação (fase 2)",
    "porQue": "Observações e oportunidades de melhoria não são não conformidades, mas o auditor de supervisão vai perguntar o que foi feito com elas.",
    "campos": [
      {
        "id": "observations",
        "rotulo": "Observações do auditor durante a fase 2",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Lista de observações com a resposta planejada.",
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
    "id": "p38_4",
    "fase": 38,
    "ordem": 3,
    "titulo": "Encerramento Formal da Auditoria",
    "clausula": "Certificação (fase 2)",
    "porQue": "Na reunião de encerramento, o auditor comunica o resultado e as não conformidades encontradas. Registre o resultado e confirme os prazos para o tratamento.",
    "campos": [
      {
        "id": "date",
        "rotulo": "Data do encerramento",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "result",
        "rotulo": "Resultado comunicado",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "Recomendação para certificação",
          "Certificação com NCs menores (prazo do organismo)",
          "NCs maiores (re-auditoria)",
          "Não certificado"
        ]
      },
      {
        "id": "notes",
        "rotulo": "Observações do auditor",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Registro da reunião de encerramento com o resultado comunicado.",
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
    "id": "p39_1",
    "fase": 39,
    "ordem": 1,
    "titulo": "Relatório de Auditoria Recebido",
    "clausula": "Certificação",
    "porQue": "O relatório oficial é a base das ações corretivas e da preparação para as supervisões. Confira se o escopo descrito é o acordado.",
    "campos": [
      {
        "id": "summary",
        "rotulo": "Resumo do relatório",
        "tipo": "texto_longo",
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
          "Certificado",
          "Certificado com observações",
          "Não conformidades menores (prazo do organismo para correção)",
          "Não conformidades maiores (nova auditoria necessária)"
        ]
      }
    ],
    "prova": {
      "descricao": "Relatório oficial do organismo certificador.",
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
    "id": "p39_2",
    "fase": 39,
    "ordem": 2,
    "titulo": "Não Conformidades Menores Corrigidas",
    "clausula": "Cl 10.2, Certificação",
    "porQue": "O prazo para tratar não conformidades é definido pelo organismo certificador no relatório. Cumpra-o e guarde a evidência enviada; a eficácia será verificada na supervisão.",
    "campos": [
      {
        "id": "total",
        "rotulo": "Total de NCs menores",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "corrected",
        "rotulo": "Corrigidas",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "deadline",
        "rotulo": "Prazo",
        "tipo": "data",
        "obrigatorio": false,
        "exemplo": ""
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências enviadas à certificadora",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Plano de ação aceito pelo organismo e as evidências enviadas.",
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
    "id": "p39_3",
    "fase": 39,
    "ordem": 3,
    "titulo": "Certificado Recebido",
    "clausula": "Certificação",
    "porQue": "Confira norma, escopo, localidades e validade no certificado. O ciclo de certificação é de três anos, com auditorias de supervisão no período.",
    "campos": [
      {
        "id": "cert_date",
        "rotulo": "Data de emissão do certificado",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "cert_body",
        "rotulo": "Organismo certificador",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "BSI, Bureau Veritas, DNV, TÜV"
      },
      {
        "id": "cert_number",
        "rotulo": "Número do certificado",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": ""
      },
      {
        "id": "validity",
        "rotulo": "Validade (3 anos)",
        "tipo": "data",
        "obrigatorio": false,
        "exemplo": ""
      },
      {
        "id": "scope",
        "rotulo": "Escopo certificado",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Certificado emitido pelo organismo acreditado.",
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
    "id": "p39_4",
    "fase": 39,
    "ordem": 4,
    "titulo": "Comunicação Interna sobre a Certificação",
    "clausula": "Cl 7.4",
    "porQue": "Comunicar a certificação reforça o compromisso de todos com o sistema. O uso da marca de certificação segue as regras do organismo certificador.",
    "campos": [
      {
        "id": "date",
        "rotulo": "Data da comunicação",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "channels",
        "rotulo": "Canais e público",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "e-mail a todos os colaboradores e reunião geral"
      },
      {
        "id": "message",
        "rotulo": "Mensagem e uso da marca do certificado",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "uso da marca conforme as regras do organismo certificador"
      }
    ],
    "prova": {
      "descricao": "Comunicado enviado.",
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
    "id": "p40_1",
    "fase": 40,
    "ordem": 1,
    "titulo": "Calendário de Auditorias de Supervisão",
    "clausula": "Certificação",
    "porQue": "As supervisões acontecem nos anos do ciclo de três anos; o calendário inclui as auditorias internas e a análise crítica que precisam acontecer antes de cada uma.",
    "campos": [
      {
        "id": "schedule",
        "rotulo": "Cronograma de supervisão",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Ano 1: Supervisão 1 (mês X)\nAno 2: Supervisão 2 (mês Y)\nAno 3: Recertificação (mês Z)"
      }
    ],
    "prova": {
      "descricao": "Calendário acordado com o organismo certificador.",
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
    "id": "p40_2",
    "fase": 40,
    "ordem": 2,
    "titulo": "Melhoria Contínua",
    "clausula": "Cl 10.1",
    "porQue": "A organização melhora continuamente a adequação, a suficiência e a eficácia do SGSI (10.1). Na supervisão, o auditor procura melhorias reais desde a última visita.",
    "campos": [
      {
        "id": "improvements",
        "rotulo": "Melhorias implementadas no período",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "automação da revisão de acessos; redução do prazo de correção de vulnerabilidades"
      },
      {
        "id": "source",
        "rotulo": "Origem de cada melhoria",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "auditoria, incidente, indicador, sugestão de colaborador"
      }
    ],
    "prova": {
      "descricao": "Registro das melhorias com origem e resultado.",
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
    "id": "p40_3",
    "fase": 40,
    "ordem": 3,
    "titulo": "Preparação para a Recertificação",
    "clausula": "Certificação",
    "porQue": "A recertificação acontece antes do vencimento do certificado de três anos e avalia o sistema inteiro de novo. Mudanças de escopo e de versão da norma são combinadas com o organismo com antecedência.",
    "campos": [
      {
        "id": "expiry",
        "rotulo": "Vencimento do certificado",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "plan",
        "rotulo": "Plano até a recertificação",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "auditoria interna completa seis meses antes; análise crítica três meses antes"
      },
      {
        "id": "changes",
        "rotulo": "Mudanças relevantes desde a certificação",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "nova unidade, nova versão da norma, novo provedor de nuvem"
      }
    ],
    "prova": {
      "descricao": "Plano de recertificação aprovado.",
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
  }
];
