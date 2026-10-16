// Etapa 4 da trilha (fases 21 a 28). Gerado por scripts/passos-esqueleto.mjs e editado à mão: o conteúdo daqui é o do produto.
import type { FaseDoCatalogo, Passo } from './tipos';

export const FASES_ETAPA_4: FaseDoCatalogo[] = [
  {
    "numero": 21,
    "etapa": 4,
    "titulo": "Programa de Privacidade",
    "clausula": "27701",
    "objetivo": "Estruturar o SGPI: nomear formalmente o encarregado (DPO), manter o RoPA (registro das operações de tratamento) e o processo de DPIA para tratamentos de alto risco. Definir se o SGPI será certificado de forma autônoma (27701:2025, 2ª edição) ou integrado ao SGSI 27001."
  },
  {
    "numero": 22,
    "etapa": 4,
    "titulo": "Privacy by Design",
    "clausula": "",
    "objetivo": "Integrar requisitos de privacidade desde a concepção de novos produtos ou sistemas. Garantir a minimização de dados pessoais coletados."
  },
  {
    "numero": 23,
    "etapa": 4,
    "titulo": "Direitos dos Titulares",
    "clausula": "",
    "objetivo": "Criar e divulgar o canal oficial para titulares exercerem seus direitos (confirmação, acesso, exclusão). Definir o SLA de resposta legal."
  },
  {
    "numero": 24,
    "etapa": 4,
    "titulo": "Consentimento e Bases Legais",
    "clausula": "",
    "objetivo": "Mapear as bases legais de todas as operações de tratamento. Implementar cookie banner e fluxos de consentimento revogáveis e transparentes."
  },
  {
    "numero": 25,
    "etapa": 4,
    "titulo": "Retenção e Descarte",
    "clausula": "A.8.10",
    "objetivo": "Elaborar a Tabela de Temporalidade de dados. Implementar rotinas (manuais ou automatizadas) para descarte seguro e definitivo de informações expiradas."
  },
  {
    "numero": 26,
    "etapa": 4,
    "titulo": "Transferências e Compartilhamento",
    "clausula": "",
    "objetivo": "Mapear compartilhamentos com terceiros e transferências internacionais de dados, exigindo cláusulas contratuais padrão (SCCs) adequadas."
  },
  {
    "numero": 27,
    "etapa": 4,
    "titulo": "Fornecedores e Operadores",
    "clausula": "A.5.19",
    "objetivo": "Auditar a postura de segurança e privacidade dos fornecedores críticos. Exigir e assinar acordos de tratamento de dados (DPAs) com fornecedores."
  },
  {
    "numero": 28,
    "etapa": 4,
    "titulo": "Incidentes",
    "clausula": "A.5.24-28",
    "objetivo": "Formalizar o plano de resposta a incidentes. Definir severidade, canais de comunicação, comitê de crise (CSIRT) e o fluxo de notificação à ANPD (em até 72h)."
  }
];

export const PASSOS_ETAPA_4: Passo[] = [
  {
    "id": "p21_1",
    "fase": 21,
    "ordem": 1,
    "titulo": "Política de Privacidade Externa",
    "clausula": "LGPD Art. 9, ISO/IEC 27701",
    "porQue": "O titular tem direito a informações claras e acessíveis sobre finalidade, forma e duração do tratamento, identificação e contato do controlador, uso compartilhado, responsabilidades dos agentes e direitos (LGPD art. 9). A política externa reúne essas informações e é aprovada antes de publicada.",
    "campos": [
      {
        "id": "controller",
        "rotulo": "Controlador e contato do encarregado",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "Empresa Exemplo Ltda — privacidade@exemplo.com.br"
      },
      {
        "id": "data",
        "rotulo": "Dados tratados, finalidades e bases legais",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "nome e e-mail para contato comercial, com base no legítimo interesse"
      },
      {
        "id": "sharing",
        "rotulo": "Compartilhamentos e transferências internacionais",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "provedor de nuvem com servidores no exterior"
      },
      {
        "id": "rights",
        "rotulo": "Como o titular exerce os direitos",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "formulário no site ou e-mail do encarregado"
      },
      {
        "id": "retention",
        "rotulo": "Prazos de guarda",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "dados de clientes durante o contrato e pelo prazo legal de guarda"
      }
    ],
    "prova": {
      "descricao": "Política publicada no site, com a versão aprovada guardada.",
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
    "id": "p21_2",
    "fase": 21,
    "ordem": 2,
    "titulo": "Registro das Operações de Tratamento (RoPA)",
    "clausula": "LGPD Art. 37, ISO/IEC 27701",
    "porQue": "Controlador e operador mantêm registro das operações de tratamento de dados pessoais que realizarem, especialmente quando baseado no legítimo interesse (LGPD art. 37). No n.privacy, o registro vive em Tratamentos (RoPA).",
    "campos": [
      {
        "id": "data_categories",
        "rotulo": "Categorias de dados pessoais tratados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Nome, CPF, e-mail, endereço, dados financeiros, dados de saúde"
      },
      {
        "id": "purposes",
        "rotulo": "Finalidades de tratamento",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Para cada categoria, qual a finalidade?"
      },
      {
        "id": "legal_bases",
        "rotulo": "Bases legais aplicáveis",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Consentimento, execução de contrato, legítimo interesse, obrigação legal..."
      },
      {
        "id": "retention",
        "rotulo": "Prazos de retenção",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Categoria → Prazo → Justificativa"
      }
    ],
    "prova": {
      "descricao": "Registro das operações completo e revisado; no n.privacy, os Tratamentos aprovados.",
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
    "id": "p21_3",
    "fase": 21,
    "ordem": 3,
    "titulo": "Base Legal de cada Tratamento",
    "clausula": "LGPD Art. 7, 11",
    "porQue": "Cada tratamento tem uma base legal do art. 7 (dados pessoais) ou do art. 11 (dados sensíveis). Base escolhida errada contamina o tratamento inteiro; legítimo interesse pede o teste de balanceamento (LIA).",
    "campos": [
      {
        "id": "mapping",
        "rotulo": "Mapeamento: operação → base legal",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Folha de pagamento → cumprimento de obrigação legal (art. 7, II)\nE-mail marketing → consentimento (art. 7, I)\nAtestados médicos (dado sensível) → obrigação legal (art. 11, II, a)"
      }
    ],
    "prova": {
      "descricao": "Registro do tratamento com a base legal e, quando for legítimo interesse, a LIA.",
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
    "id": "p21_4",
    "fase": 21,
    "ordem": 4,
    "titulo": "Processo de RIPD para Tratamentos de Alto Risco",
    "clausula": "LGPD Art. 38, ISO/IEC 27701",
    "porQue": "O processo define quando o relatório de impacto é feito (critérios de alto risco), quem o elabora, o parecer do encarregado e a revisão quando o tratamento muda. A ANPD pode exigir o relatório (LGPD art. 38).",
    "campos": [
      {
        "id": "criteria",
        "rotulo": "Critérios que disparam o RIPD",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Dados sensíveis em larga escala\nMonitoramento sistemático de titulares\nUso de tecnologia nova\nLegítimo interesse com risco alto"
      },
      {
        "id": "steps",
        "rotulo": "Etapas e responsáveis",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "área de negócio descreve, encarregado avalia, Segurança propõe medidas, diretoria aprova"
      },
      {
        "id": "review",
        "rotulo": "Quando o RIPD é revisto",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "mudança na finalidade, nos dados ou no fornecedor do tratamento"
      }
    ],
    "prova": {
      "descricao": "Procedimento de RIPD aprovado e um RIPD feito com ele.",
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
    "id": "p22_1",
    "fase": 22,
    "ordem": 1,
    "titulo": "Privacidade desde a Concepção no Fluxo de Produto",
    "clausula": "LGPD Art. 46 §2, ISO/IEC 27701",
    "porQue": "As medidas de segurança e proteção de dados são observadas desde a fase de concepção do produto ou serviço até a execução (LGPD art. 46, §2). O auditor procura a etapa de privacidade no fluxo de produto e um projeto que passou por ela.",
    "campos": [
      {
        "id": "principles",
        "rotulo": "Princípios PbD adotados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "1. Proativo\n2. Privacidade como padrão\n3. Privacidade embutida\n4. Funcionalidade total\n5. Segurança fim-a-fim\n6. Visibilidade\n7. Respeito ao usuário"
      }
    ],
    "prova": {
      "descricao": "Fluxo de produto com a etapa de privacidade e um registro de aplicação.",
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
    "id": "p22_2",
    "fase": 22,
    "ordem": 2,
    "titulo": "Checklist de Privacidade para Novos Projetos",
    "clausula": "LGPD Art. 46 §2, ISO/IEC 27701",
    "porQue": "O checklist é aplicado antes de um projeto tratar dados pessoais: finalidade, base legal, minimização, retenção, segurança, terceiros e necessidade de RIPD. Guarde o checklist preenchido de cada projeto.",
    "campos": [
      {
        "id": "checklist",
        "rotulo": "Itens do checklist PbD",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "- Minimização de dados\n- Pseudonimização\n- Criptografia\n- Consentimento\n- Retenção definida"
      }
    ],
    "prova": {
      "descricao": "Checklist aprovado e preenchido em projetos recentes.",
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
    "id": "p22_3",
    "fase": 22,
    "ordem": 3,
    "titulo": "Minimização de Dados",
    "clausula": "LGPD Art. 6 III",
    "porQue": "O princípio da necessidade limita o tratamento ao mínimo necessário para a finalidade, com dados pertinentes, proporcionais e não excessivos (LGPD art. 6, III). Mostre campos removidos, retenção reduzida ou pseudonimização aplicada.",
    "campos": [
      {
        "id": "measures",
        "rotulo": "Medidas de minimização implementadas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Campos desnecessários removidos, retenção limitada, pseudonimização"
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
      "descricao": "Antes e depois de formulários ou bases, com a justificativa de cada dado mantido.",
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
    "id": "p23_1",
    "fase": 23,
    "ordem": 1,
    "titulo": "Canal de Atendimento aos Titulares",
    "clausula": "LGPD Art. 18",
    "porQue": "O titular exerce os direitos do art. 18 mediante requerimento ao controlador. O canal precisa estar publicado, funcionando e com quem responda; o auditor pode testá-lo.",
    "campos": [
      {
        "id": "channel",
        "rotulo": "Canal implementado",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "privacidade@empresa.com, formulário web, SAC dedicado"
      },
      {
        "id": "sla",
        "rotulo": "Prazo de resposta adotado",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "o prazo cadastrado em Parâmetros legais"
      },
      {
        "id": "published",
        "rotulo": "Canal publicado (Política de Privacidade, site)?",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "Sim",
          "Não"
        ]
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (print do canal, política de privacidade)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Canal publicado na política de privacidade e registros de pedidos atendidos.",
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
    "id": "p23_2",
    "fase": 23,
    "ordem": 2,
    "titulo": "Procedimento de Atendimento de Direitos",
    "clausula": "LGPD Art. 18, 19",
    "porQue": "O procedimento cobre recebimento, confirmação de identidade, busca dos dados, resposta e registro de cada pedido do titular, nos prazos da lei e da regulamentação (LGPD art. 18 e 19).",
    "campos": [
      {
        "id": "rights",
        "rotulo": "Direitos atendidos",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Acesso, Correção, Exclusão, Portabilidade, Oposição, Revogação"
      },
      {
        "id": "sla",
        "rotulo": "Prazos de resposta",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "os prazos cadastrados em Parâmetros legais, por tipo de pedido"
      },
      {
        "id": "channel",
        "rotulo": "Canal de atendimento",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "privacidade@empresa.com"
      }
    ],
    "prova": {
      "descricao": "Procedimento aprovado e o registro dos pedidos atendidos; no n.privacy, Pedidos do titular.",
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
    "id": "p23_3",
    "fase": 23,
    "ordem": 3,
    "titulo": "Métricas de Tempo de Resposta",
    "clausula": "LGPD Art. 18, 19",
    "porQue": "Alguns prazos de resposta são fixados pela lei e pela regulamentação; cadastre-os em Parâmetros legais e meça o tempo real de atendimento contra eles. Pedido fora do prazo vira ação corretiva.",
    "campos": [
      {
        "id": "sla_detail",
        "rotulo": "Indicadores de tempo de resposta por tipo de direito",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Acesso: tempo médio e pedidos fora do prazo no mês\nEliminação: tempo médio e pedidos fora do prazo no mês"
      }
    ],
    "prova": {
      "descricao": "Relatório periódico de tempos de resposta por tipo de pedido.",
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
    "id": "p24_1",
    "fase": 24,
    "ordem": 1,
    "titulo": "Gestão de Consentimentos",
    "clausula": "LGPD Art. 8",
    "porQue": "O consentimento é livre, informado e inequívoco, para finalidades determinadas, e o controlador tem o ônus de provar que o obteve (art. 8, §2). A revogação é possível a qualquer momento, por procedimento gratuito e facilitado (art. 8, §5).",
    "campos": [
      {
        "id": "mechanism",
        "rotulo": "Mecanismo de coleta de consentimento",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Checkbox no cadastro, banner de cookies, opt-in por e-mail"
      },
      {
        "id": "granularity",
        "rotulo": "Consentimento é granular?",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "Sim, por finalidade",
          "Parcialmente",
          "Consentimento único (bundle)"
        ]
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (print do formulário, logs de consentimento)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "revocation",
        "rotulo": "Como o titular revoga consentimento?",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Link no rodapé do e-mail, painel de preferências, solicitação por canal"
      }
    ],
    "prova": {
      "descricao": "Telas de coleta e de revogação e os registros de consentimento; no n.privacy, Consentimentos.",
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
    "id": "p24_2",
    "fase": 24,
    "ordem": 2,
    "titulo": "Termos de Uso e Contratos Ajustados",
    "clausula": "LGPD Art. 39, A.5.20",
    "porQue": "Contratos definem os papéis no tratamento: o operador trata segundo as instruções do controlador (LGPD art. 39), e requisitos de segurança relevantes constam dos acordos com fornecedores (A.5.20). Termos de uso precisam refletir o tratamento real.",
    "campos": [
      {
        "id": "docs",
        "rotulo": "Documentos revisados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "termos de uso do site, contratos com clientes, contratos de trabalho, contratos com fornecedores"
      },
      {
        "id": "clauses",
        "rotulo": "Cláusulas incluídas ou ajustadas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "papel de controlador e operador, confidencialidade, notificação de incidentes, eliminação ao fim do contrato"
      },
      {
        "id": "pending",
        "rotulo": "Contratos pendentes de ajuste",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "três fornecedores antigos ainda sem aditivo"
      }
    ],
    "prova": {
      "descricao": "Modelos aprovados pelo Jurídico e a lista de contratos ajustados.",
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
    "id": "p25_1",
    "fase": 25,
    "ordem": 1,
    "titulo": "Tabela de Temporalidade de Dados",
    "clausula": "LGPD Art. 15, 16",
    "porQue": "Cada tipo de dado tem prazo de guarda e o fundamento dele (obrigação legal, contrato, exercício de direitos). Terminado o tratamento, o dado é eliminado, salvo as hipóteses de conservação do art. 16.",
    "campos": [
      {
        "id": "table",
        "rotulo": "Tabela de temporalidade por tipo de dado",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Dado → Retenção → Base legal → Método de descarte"
      }
    ],
    "prova": {
      "descricao": "Tabela de temporalidade aprovada, com o fundamento de cada prazo.",
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
    "id": "p25_2",
    "fase": 25,
    "ordem": 2,
    "titulo": "Política de Descarte e Anonimização",
    "clausula": "A.7.14, A.8.10, LGPD Art. 12",
    "porQue": "Informação é excluída quando não é mais necessária (A.8.10), e equipamentos com mídia são verificados antes do descarte ou da reutilização (A.7.14). Dado anonimizado deixa de ser pessoal, salvo quando o processo pode ser revertido com esforços razoáveis (LGPD art. 12).",
    "campos": [
      {
        "id": "methods",
        "rotulo": "Métodos de descarte por tipo de mídia",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "HD: degaussing + destruição física\nSSD: crypto-erase + destruição\nPapel: fragmentadora\nCloud: deleção + verificação"
      },
      {
        "id": "anonymization",
        "rotulo": "Quando e como os dados são anonimizados",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "dados de clientes inativos agregados para estatística, sem possibilidade razoável de reidentificação"
      }
    ],
    "prova": {
      "descricao": "Política aprovada e certificados ou registros de descarte.",
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
    "id": "p25_3",
    "fase": 25,
    "ordem": 3,
    "titulo": "Exclusão de Dados Antigos",
    "clausula": "A.8.10",
    "porQue": "Informação armazenada em sistemas, dispositivos ou outra mídia é excluída quando não é mais necessária. O auditor pede o registro da última execução da rotina de exclusão e confere uma amostra.",
    "campos": [
      {
        "id": "mechanism",
        "rotulo": "Mecanismo de exclusão",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "Job automatizado (cron/scheduled)",
          "Manual com checklist",
          "Não implementado"
        ]
      },
      {
        "id": "frequency",
        "rotulo": "Frequência de execução",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "Diário, Semanal, Mensal"
      },
      {
        "id": "data_types",
        "rotulo": "Tipos de dados cobertos",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Logs, dados de clientes inativos, backups expirados"
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (logs de execução, relatórios)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Registros de execução das rotinas de exclusão.",
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
    "id": "p26_1",
    "fase": 26,
    "ordem": 1,
    "titulo": "Mapa de Transferências Internacionais",
    "clausula": "LGPD Art. 33",
    "porQue": "A transferência internacional só é permitida nas hipóteses do art. 33. Dados hospedados em nuvem fora do país, ou acessados de lá, configuram transferência: mapeie país, dados, fornecedor e mecanismo.",
    "campos": [
      {
        "id": "transfers",
        "rotulo": "Transferências identificadas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Destino → Dados → Mecanismo de proteção (SCC, adequação)"
      }
    ],
    "prova": {
      "descricao": "Mapa de transferências com o mecanismo legal de cada uma.",
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
    "id": "p26_2",
    "fase": 26,
    "ordem": 2,
    "titulo": "Cláusulas-Padrão Contratuais",
    "clausula": "LGPD Art. 33, 35",
    "porQue": "As cláusulas-padrão contratuais aprovadas pela ANPD (Resolução CD/ANPD nº 19/2024) são um dos mecanismos do art. 33. Elas são incorporadas ao contrato sem alteração do texto aprovado.",
    "campos": [
      {
        "id": "sccs",
        "rotulo": "Contratos com cláusulas-padrão (fornecedor — país — situação)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "provedor de nuvem — Estados Unidos — cláusulas da ANPD incorporadas ao contrato"
      }
    ],
    "prova": {
      "descricao": "Contratos ou aditivos com as cláusulas-padrão incorporadas.",
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
    "id": "p26_3",
    "fase": 26,
    "ordem": 3,
    "titulo": "Acordos de Compartilhamento de Dados",
    "clausula": "LGPD, ISO/IEC 27701",
    "porQue": "Todo uso compartilhado de dados tem finalidade, base legal e responsabilidades definidas por escrito, e entra no registro das operações e na informação dada ao titular (art. 9).",
    "campos": [
      {
        "id": "shares",
        "rotulo": "Compartilhamentos documentados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Destinatário → Dados → Finalidade → Base legal → Contrato"
      }
    ],
    "prova": {
      "descricao": "Acordos assinados e o registro dos compartilhamentos.",
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
    "id": "p27_1",
    "fase": 27,
    "ordem": 1,
    "titulo": "Avaliação de Segurança de Operadores e Terceiros",
    "clausula": "A.5.19, A.5.21, LGPD Art. 39",
    "porQue": "Antes de contratar e periodicamente, o operador é avaliado quanto às garantias de segurança que oferece. O método acompanha o risco: certificação para grande provedor, questionário para médio, auditoria para crítico.",
    "campos": [
      {
        "id": "criteria",
        "rotulo": "Critérios de avaliação",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Certificações, pentest, SLA, backup, incidentes"
      },
      {
        "id": "results",
        "rotulo": "Fornecedores avaliados e resultado",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "provedor de nuvem — aprovado com base na certificação ISO 27001; folha de pagamento — aprovado com ressalvas"
      }
    ],
    "prova": {
      "descricao": "Avaliações registradas com resultado e validade; no n.privacy, Terceiros.",
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
    "id": "p27_2",
    "fase": 27,
    "ordem": 2,
    "titulo": "Cláusulas de Proteção de Dados (DPA)",
    "clausula": "A.5.20, LGPD Art. 39",
    "porQue": "Todo fornecedor que trata dados pessoais em nome da organização tem cláusula ou acordo de tratamento: instruções do controlador, confidencialidade, segurança, suboperadores, incidentes e devolução ou eliminação ao fim do contrato.",
    "campos": [
      {
        "id": "total",
        "rotulo": "Total de fornecedores com DPA",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "12 de 15 fornecedores"
      },
      {
        "id": "pending",
        "rotulo": "Fornecedores sem DPA (se houver)",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Liste os que ainda não assinaram e o plano de ação"
      },
      {
        "id": "template",
        "rotulo": "Template de DPA utilizado",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "Template próprio aprovado pelo jurídico",
          "Template do fornecedor (revisado)",
          "Sem template padrão"
        ]
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (lista de DPAs, cópias)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Lista de fornecedores com o acordo de tratamento assinado.",
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
    "id": "p27_3",
    "fase": 27,
    "ordem": 3,
    "titulo": "Monitoramento de Fornecedores",
    "clausula": "A.5.22",
    "porQue": "A organização monitora, revisa, avalia e gerencia as mudanças nas práticas de segurança dos fornecedores e na entrega dos serviços. O auditor pede a última revisão de um fornecedor crítico.",
    "campos": [
      {
        "id": "how",
        "rotulo": "Como os serviços são monitorados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "relatório mensal de nível de serviço, revisão anual de certificados, reunião trimestral"
      },
      {
        "id": "issues",
        "rotulo": "Desvios encontrados e ações",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "atraso em correção de vulnerabilidade, cobrado em reunião"
      },
      {
        "id": "next",
        "rotulo": "Próxima revisão",
        "tipo": "data",
        "obrigatorio": false,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Registros de revisão periódica dos fornecedores críticos.",
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
    "id": "p28_1",
    "fase": 28,
    "ordem": 1,
    "titulo": "Treinamento da Equipe de Resposta",
    "clausula": "A.5.24, Cl 7.2",
    "porQue": "Quem tem papel no plano de resposta precisa de competência para exercê-lo (7.2). O treinamento cobre o plano, a classificação de severidade, a preservação de evidências e a comunicação.",
    "campos": [
      {
        "id": "date",
        "rotulo": "Data do treinamento",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "participants",
        "rotulo": "Participantes (nome e papel na resposta)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Maria Santos — coordenadora\nCarlos Lima — encarregado"
      },
      {
        "id": "content",
        "rotulo": "Conteúdo",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "papéis no plano de resposta, classificação de severidade, preservação de evidências, comunicação à ANPD"
      },
      {
        "id": "next",
        "rotulo": "Próxima reciclagem",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "anual"
      }
    ],
    "prova": {
      "descricao": "Lista de presença e conteúdo do treinamento da equipe de resposta.",
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
    "id": "p28_2",
    "fase": 28,
    "ordem": 2,
    "titulo": "Simulação de Incidente com Dados Pessoais",
    "clausula": "A.5.24, A.5.26",
    "porQue": "Uma simulação (de mesa ou prática) mostra que o plano funciona: quem decide, quem comunica e em quanto tempo. Para incidente com dados pessoais, inclua a avaliação de risco aos titulares e a decisão sobre comunicar à ANPD.",
    "campos": [
      {
        "id": "date",
        "rotulo": "Data da simulação",
        "tipo": "data",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "scenario",
        "rotulo": "Cenário simulado",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Ransomware no file server, vazamento de dados de clientes"
      },
      {
        "id": "participants",
        "rotulo": "Participantes",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "result",
        "rotulo": "Resultado e lições aprendidas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      },
      {
        "id": "improvements",
        "rotulo": "Melhorias identificadas",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Relatório da simulação com tempos, falhas e melhorias.",
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
    "id": "p28_3",
    "fase": 28,
    "ordem": 3,
    "titulo": "Fluxo de Comunicação à ANPD e aos Titulares",
    "clausula": "LGPD Art. 48",
    "porQue": "Incidente que possa acarretar risco ou dano relevante aos titulares é comunicado à ANPD e aos titulares (LGPD art. 48), no prazo e com o conteúdo da Resolução CD/ANPD nº 15/2024. O prazo fica em Parâmetros legais; o fluxo diz quem avalia, quem decide e quem comunica.",
    "campos": [
      {
        "id": "process",
        "rotulo": "Procedimento de notificação",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "quem avalia o risco aos titulares, quem decide comunicar, quem envia, conteúdo mínimo da comunicação e prazo (cadastrado em Parâmetros legais)"
      }
    ],
    "prova": {
      "descricao": "Fluxo aprovado e o registro dos incidentes avaliados; no n.privacy, Incidentes.",
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
