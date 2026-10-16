// Etapa 3 da trilha (fases 14 a 20). Gerado por scripts/passos-esqueleto.mjs e editado à mão: o conteúdo daqui é o do produto.
import type { FaseDoCatalogo, Passo } from './tipos';

export const FASES_ETAPA_3: FaseDoCatalogo[] = [
  {
    "numero": 14,
    "etapa": 3,
    "titulo": "Arquitetura Documental",
    "clausula": "7.5",
    "objetivo": "Estruturar o padrão de nomenclatura, versionamento e templates oficiais de políticas e procedimentos do SGSI, criando a Lista Mestra de Documentos."
  },
  {
    "numero": 15,
    "etapa": 3,
    "titulo": "Controles Organizacionais (A5)",
    "clausula": "A.5",
    "objetivo": "Redigir e publicar as políticas organizacionais de SI. Implementar processos de gestão de acessos e monitoramento de ativos organizacionais de SI."
  },
  {
    "numero": 16,
    "etapa": 3,
    "titulo": "Controles de Pessoas (A6)",
    "clausula": "A.6",
    "objetivo": "Implementar background check no onboarding de novos funcionários, termos de confidencialidade (NDA) obrigatórios e processos de desligamento seguro (offboarding)."
  },
  {
    "numero": 17,
    "etapa": 3,
    "titulo": "Controles Físicos (A7)",
    "clausula": "A.7",
    "objetivo": "Definir perímetros físicos de segurança, controles de acesso de visitantes (biometria/crachá), monitoramento por CFTV e procedimentos de descarte de mídia física."
  },
  {
    "numero": 18,
    "etapa": 3,
    "titulo": "Controles Tecnológicos (A8)",
    "clausula": "A.8",
    "objetivo": "Implementar criptografia de dados (trânsito/repouso), antivírus/EDR corporativo, gerenciamento de patches e centralização de logs para auditoria de segurança."
  },
  {
    "numero": 19,
    "etapa": 3,
    "titulo": "Desenvolvimento Seguro",
    "clausula": "A.8.25",
    "objetivo": "Criar a Política de Desenvolvimento Seguro (SSDLC). Configurar code reviews obrigatórios e integrar scanners de código estático (SAST) na esteira CI/CD."
  },
  {
    "numero": 20,
    "etapa": 3,
    "titulo": "Cloud, DevOps e SRE",
    "clausula": "A.5.23",
    "objetivo": "Garantir a segurança dos serviços em nuvem AWS. Configurar o princípio de menor privilégio no IAM e ativar alarmes de monitoramento no CloudTrail."
  }
];

export const PASSOS_ETAPA_3: Passo[] = [
  {
    "id": "p14_1",
    "fase": 14,
    "ordem": 1,
    "titulo": "Manual do SGSI e do SGPI",
    "clausula": "Cl 4.4, 7.5",
    "porQue": "A norma não exige um manual, mas exige que o sistema seja estabelecido, implementado, mantido e melhorado (4.4) com a informação documentada necessária (7.5). Um manual que mostra onde cada requisito é atendido facilita a auditoria.",
    "campos": [
      {
        "id": "structure",
        "rotulo": "Estrutura do manual (seções)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "1. Contexto e escopo\n2. Liderança e política\n3. Planejamento (riscos e objetivos)\n4. Apoio (recursos, competência, comunicação, documentos)\n5. Operação\n6. Avaliação de desempenho\n7. Melhoria"
      },
      {
        "id": "documents",
        "rotulo": "Documentos referenciados pelo manual",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "política de segurança, metodologia de riscos, SoA, procedimento de incidentes"
      },
      {
        "id": "owner",
        "rotulo": "Responsável pelo manual",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "líder do SGSI"
      }
    ],
    "prova": {
      "descricao": "Manual versionado e aprovado, com remissão aos documentos do sistema.",
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
    "id": "p14_2",
    "fase": 14,
    "ordem": 2,
    "titulo": "Padrão de Codificação Documental",
    "clausula": "Cl 7.5.2",
    "porQue": "Ao criar e atualizar informação documentada, a organização garante identificação e descrição adequadas: título, data, autor ou código de referência (7.5.2). Um padrão de codificação torna isso consistente.",
    "campos": [
      {
        "id": "convention",
        "rotulo": "Convenção de nomenclatura adotada",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "[TIPO]-[CÓDIGO]-[NOME]-v[VERSÃO]\nPOL-SI-001-Política de Segurança-v1.0"
      },
      {
        "id": "types",
        "rotulo": "Tipos de documentos definidos",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "POL = Política, PRO = Procedimento, REG = Registro, FOR = Formulário"
      }
    ],
    "prova": {
      "descricao": "Padrão de codificação publicado e aplicado nos documentos do sistema.",
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
    "id": "p14_3",
    "fase": 14,
    "ordem": 3,
    "titulo": "Controle de Versão e Aprovação",
    "clausula": "Cl 7.5.2, 7.5.3",
    "porQue": "A informação documentada é revisada e aprovada quanto à adequação (7.5.2) e controlada: distribuição, acesso, versão, retenção e descarte (7.5.3). O auditor pede o histórico de versões de um documento e quem o aprovou.",
    "campos": [
      {
        "id": "tool",
        "rotulo": "Onde os documentos são controlados",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "n.360 (Documentos), repositório com histórico de versões"
      },
      {
        "id": "flow",
        "rotulo": "Fluxo de aprovação (quem elabora, revisa e aprova)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "líder do SGSI elabora, comitê revisa, diretoria aprova"
      },
      {
        "id": "versioning",
        "rotulo": "Regra de versão e de revisão periódica",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "v1.0, v1.1; revisão anual ou após mudança relevante"
      },
      {
        "id": "obsolete",
        "rotulo": "Como versões obsoletas são retiradas de uso",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "versão antiga arquivada e marcada como obsoleta"
      }
    ],
    "prova": {
      "descricao": "Histórico de versões e aprovações de um documento do sistema.",
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
    "id": "p15_1",
    "fase": 15,
    "ordem": 1,
    "titulo": "Política Geral de Segurança da Informação",
    "clausula": "Cl 5.2, A.5.1",
    "porQue": "A política é aprovada pela alta direção, inclui objetivos (ou a estrutura para defini-los), o compromisso de atender os requisitos aplicáveis e o de melhoria contínua, e é comunicada e disponível às partes interessadas (5.2). As políticas de tema específico são revisadas em intervalos planejados (A.5.1).",
    "campos": [
      {
        "id": "objectives",
        "rotulo": "Objetivos de segurança ou a estrutura para defini-los",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "proteger dados de clientes, garantir a disponibilidade dos serviços, cumprir a LGPD"
      },
      {
        "id": "commitments",
        "rotulo": "Compromissos da direção",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Atender os requisitos legais e contratuais aplicáveis\nMelhorar continuamente o SGSI"
      },
      {
        "id": "topic_policies",
        "rotulo": "Políticas de tema específico que a complementam",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "controle de acesso, uso aceitável, backup, criptografia"
      },
      {
        "id": "approver",
        "rotulo": "Quem aprova a política (nome e cargo)",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "Diretor-geral"
      }
    ],
    "prova": {
      "descricao": "Política aprovada pela direção e registro de ciência dos colaboradores.",
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
    "id": "p15_2",
    "fase": 15,
    "ordem": 2,
    "titulo": "Segregação de Funções",
    "clausula": "A.5.3",
    "porQue": "Funções e áreas de responsabilidade conflitantes são segregadas. Em equipes pequenas, onde segregar não é viável, o auditor aceita controle compensatório documentado, como revisão independente.",
    "campos": [
      {
        "id": "conflicts",
        "rotulo": "Funções conflitantes identificadas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Quem solicita acesso não aprova o próprio acesso\nQuem desenvolve não publica em produção sem revisão\nQuem cadastra fornecedor não aprova pagamento"
      },
      {
        "id": "controls",
        "rotulo": "Como a segregação é garantida",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "perfis no ERP, aprovação em dois níveis"
      },
      {
        "id": "compensating",
        "rotulo": "Controles compensatórios onde a equipe é pequena demais para segregar",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "revisão mensal dos registros pelo gestor"
      }
    ],
    "prova": {
      "descricao": "Matriz de funções conflitantes e a configuração de perfis que a aplica.",
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
    "id": "p15_3",
    "fase": 15,
    "ordem": 3,
    "titulo": "Contato com Autoridades",
    "clausula": "A.5.5",
    "porQue": "A organização estabelece e mantém contato com as autoridades relevantes. O auditor pergunta quem fala com quem em um incidente e se a lista está atualizada.",
    "campos": [
      {
        "id": "authorities",
        "rotulo": "Autoridades e contatos",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "ANPD — incidentes com dados pessoais — canal oficial no site da ANPD\nDelegacia de crimes cibernéticos\nCorpo de Bombeiros\nAgência reguladora do setor"
      },
      {
        "id": "when",
        "rotulo": "Em que situações cada autoridade é contatada",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "incidente com dados pessoais de risco relevante, crime cibernético, emergência física"
      },
      {
        "id": "who",
        "rotulo": "Quem está autorizado a fazer o contato",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "encarregado (ANPD), Jurídico (polícia)"
      }
    ],
    "prova": {
      "descricao": "Lista de autoridades com contato, situação e responsável, revisada.",
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
    "id": "p15_4",
    "fase": 15,
    "ordem": 4,
    "titulo": "Segurança em Projetos",
    "clausula": "A.5.8",
    "porQue": "A segurança da informação é integrada à gestão de projetos, qualquer que seja o tipo de projeto. O auditor escolhe um projeto recente e pede a avaliação de riscos e os requisitos de segurança dele.",
    "campos": [
      {
        "id": "how",
        "rotulo": "Como a segurança entra na gestão de projetos",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Avaliação de riscos de segurança na abertura do projeto\nRequisitos de segurança no escopo\nAprovação de segurança antes da entrada em produção"
      },
      {
        "id": "example",
        "rotulo": "Projeto em que o processo já foi aplicado",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "migração do CRM para a nuvem"
      },
      {
        "id": "owner",
        "rotulo": "Responsável por acompanhar",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "líder do SGSI"
      }
    ],
    "prova": {
      "descricao": "Modelo de projeto com a etapa de segurança e um projeto real que a cumpriu.",
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
    "id": "p15_5",
    "fase": 15,
    "ordem": 5,
    "titulo": "Política de Uso Aceitável",
    "clausula": "A.5.10",
    "porQue": "Regras de uso aceitável e procedimentos para lidar com informação e outros ativos são identificados, documentados e implementados. O auditor pede a evidência de que os colaboradores conhecem as regras.",
    "campos": [
      {
        "id": "assets",
        "rotulo": "Ativos e recursos cobertos",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "notebooks, e-mail, internet, celulares corporativos, sistemas em nuvem"
      },
      {
        "id": "allowed",
        "rotulo": "Usos permitidos e proibidos",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Permitido: uso pessoal moderado da internet\nProibido: instalar software sem autorização, compartilhar senhas"
      },
      {
        "id": "monitoring",
        "rotulo": "Monitoramento e consequências do descumprimento",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "uso monitorado conforme a política, com aviso prévio; descumprimento segue o processo disciplinar"
      },
      {
        "id": "ack",
        "rotulo": "Como os colaboradores dão ciência",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "Assinatura na admissão",
          "Aceite eletrônico",
          "Ciência pelo portal de políticas",
          "Ainda não definido"
        ]
      }
    ],
    "prova": {
      "descricao": "Política de uso aceitável aprovada e registros de ciência.",
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
    "id": "p15_6",
    "fase": 15,
    "ordem": 6,
    "titulo": "Regras para Transferência de Informação",
    "clausula": "A.5.14",
    "porQue": "Existem regras, procedimentos ou acordos de transferência para todos os meios (eletrônico, físico e verbal), dentro da organização e com terceiros, coerentes com a classificação da informação.",
    "campos": [
      {
        "id": "types",
        "rotulo": "Tipos de transferência cobertos",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "E-mail com anexos\nCompartilhamento de arquivos em nuvem\nMídia removível\nTroca de dados com parceiros por integração"
      },
      {
        "id": "rules",
        "rotulo": "Regras por nível de classificação",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Confidencial — só por link com prazo e senha, nunca por e-mail sem proteção"
      },
      {
        "id": "agreements",
        "rotulo": "Acordos de transferência com terceiros",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "cláusula de transferência segura no contrato com a folha de pagamento"
      }
    ],
    "prova": {
      "descricao": "Procedimento de transferência de informação e acordos com terceiros.",
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
    "id": "p15_7",
    "fase": 15,
    "ordem": 7,
    "titulo": "Gestão de Segurança de Fornecedores",
    "clausula": "A.5.19",
    "porQue": "Processos definidos gerenciam os riscos dos produtos e serviços de fornecedores (A.5.19), com requisitos de segurança nos contratos (A.5.20), atenção à cadeia de suprimentos de TIC (A.5.21) e monitoramento dos serviços (A.5.22).",
    "campos": [
      {
        "id": "criteria",
        "rotulo": "Como os fornecedores são classificados por risco",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "crítico quando trata dados pessoais ou sustenta serviço essencial"
      },
      {
        "id": "requirements",
        "rotulo": "Requisitos de segurança exigidos dos fornecedores",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "confidencialidade, notificação de incidentes, direito de auditoria, certificações"
      },
      {
        "id": "lifecycle",
        "rotulo": "Do contrato ao encerramento",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "seleção, avaliação, contrato, monitoramento, devolução e eliminação de dados na saída"
      }
    ],
    "prova": {
      "descricao": "Política de fornecedores e a lista de fornecedores classificados por risco.",
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
    "id": "p15_8",
    "fase": 15,
    "ordem": 8,
    "titulo": "Plano de Resposta a Incidentes",
    "clausula": "A.5.24",
    "porQue": "A gestão de incidentes é planejada: papéis, responsabilidades e procedimentos de detecção, avaliação (A.5.25), resposta (A.5.26), aprendizado (A.5.27) e coleta de evidências (A.5.28). Incidente com dados pessoais segue também a comunicação da LGPD (art. 48).",
    "campos": [
      {
        "id": "phases",
        "rotulo": "Fases do procedimento",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "1. Detecção e registro\n2. Classificação de severidade\n3. Contenção\n4. Erradicação\n5. Recuperação\n6. Lições aprendidas"
      },
      {
        "id": "roles",
        "rotulo": "Papéis e responsabilidades na resposta",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "coordenador do incidente, TI, Jurídico, encarregado, Comunicação"
      },
      {
        "id": "severity",
        "rotulo": "Critérios de classificação de severidade",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "crítico quando há indisponibilidade de serviço essencial ou vazamento de dados pessoais"
      }
    ],
    "prova": {
      "descricao": "Plano de resposta aprovado e comunicado à equipe de resposta.",
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
    "id": "p16_1",
    "fase": 16,
    "ordem": 1,
    "titulo": "Verificação de Antecedentes (Triagem)",
    "clausula": "A.6.1",
    "porQue": "A verificação de antecedentes é feita antes da admissão e, quando aplicável, de forma contínua, proporcional aos requisitos do negócio, à classificação da informação acessada e aos riscos, e dentro da lei. Os dados de candidatos também seguem a LGPD (finalidade e necessidade).",
    "campos": [
      {
        "id": "checks",
        "rotulo": "Verificações feitas antes da contratação",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Confirmação de identidade e documentos\nReferências profissionais\nComprovação de formação para cargos técnicos"
      },
      {
        "id": "proportional",
        "rotulo": "Como a verificação varia com o cargo e o acesso",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "verificação ampliada para quem acessa dados financeiros ou administra sistemas"
      },
      {
        "id": "legal",
        "rotulo": "Limites legais observados",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "só verificações necessárias à função, com ciência do candidato e respeito à LGPD e à legislação trabalhista"
      }
    ],
    "prova": {
      "descricao": "Procedimento de triagem e registros de verificação de admissões recentes.",
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
    "id": "p16_2",
    "fase": 16,
    "ordem": 2,
    "titulo": "Termos de Confidencialidade e Responsabilidade",
    "clausula": "A.6.6, A.6.2",
    "porQue": "Acordos de confidencialidade refletem as necessidades de proteção da informação, são assinados por colaboradores e terceiros relevantes e revisados periodicamente (A.6.6). As responsabilidades de segurança constam do contrato de trabalho (A.6.2). O termo é assinado antes do primeiro acesso.",
    "campos": [
      {
        "id": "coverage",
        "rotulo": "Cobertura de assinaturas",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "100% dos colaboradores",
          ">90% assinaram",
          "50-90% assinaram",
          "<50% assinaram"
        ]
      },
      {
        "id": "includes_third",
        "rotulo": "Terceirizados também assinam?",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "Sim",
          "Não",
          "Parcialmente"
        ]
      },
      {
        "id": "template",
        "rotulo": "Template utilizado",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Descreva brevemente o que o NDA cobre"
      },
      {
        "id": "evidence_desc",
        "rotulo": "Onde estão armazenados os termos assinados?",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "RH — pasta digital, sistema de gestão de documentos"
      }
    ],
    "prova": {
      "descricao": "Modelo do termo e os termos assinados (amostra de admissões recentes).",
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
    "id": "p16_3",
    "fase": 16,
    "ordem": 3,
    "titulo": "Admissão e Desligamento Seguros",
    "clausula": "A.6.5, A.5.11, A.5.18",
    "porQue": "Responsabilidades que continuam após o desligamento ou a mudança de função são definidas e comunicadas (A.6.5). Junte a devolução de ativos (A.5.11) e a revogação de acessos (A.5.18): o auditor confere desligados recentes contra a lista de contas ativas.",
    "campos": [
      {
        "id": "onboarding",
        "rotulo": "Etapas da admissão",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "1. Termo de confidencialidade assinado\n2. Acessos concedidos conforme o cargo\n3. Treinamento inicial de segurança"
      },
      {
        "id": "steps",
        "rotulo": "Etapas do desligamento seguro",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "1. Revogação de acessos (mesmo dia)\n2. Devolução de equipamentos\n3. Transferência de dados\n4. Assinatura de termo de confidencialidade pós-contrato"
      }
    ],
    "prova": {
      "descricao": "Checklists de admissão e desligamento preenchidos e a revogação de acessos registrada.",
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
    "id": "p17_1",
    "fase": 17,
    "ordem": 1,
    "titulo": "Perímetros e Áreas Seguras",
    "clausula": "A.7.1",
    "porQue": "Perímetros de segurança são definidos e usados para proteger áreas que contêm informação e outros ativos associados. O auditor pode percorrer as instalações e conferir se o perímetro descrito existe.",
    "campos": [
      {
        "id": "perimeters",
        "rotulo": "Perímetros definidos",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Descreva os perímetros de segurança física (áreas restritas, data center, escritório)"
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (planta, fotos, controles de acesso)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "relatório da ferramenta, print da configuração, ata, lista de presença"
      }
    ],
    "prova": {
      "descricao": "Planta com áreas seguras demarcadas e fotos dos controles.",
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
    "id": "p17_2",
    "fase": 17,
    "ordem": 2,
    "titulo": "Monitoramento de Segurança Física",
    "clausula": "A.7.4, A.7.2",
    "porQue": "As instalações são monitoradas continuamente contra acesso físico não autorizado (A.7.4), e as entradas são protegidas por controles de acesso (A.7.2). Se há câmeras, a gravação é dado pessoal: informe os titulares e defina a retenção.",
    "campos": [
      {
        "id": "monitoring",
        "rotulo": "Como as instalações são monitoradas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "câmeras com gravação, alarme de intrusão, vigilância"
      },
      {
        "id": "controls",
        "rotulo": "Controles implementados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Catracas com crachá, biometria no data center, CFTV 24h, registro de visitantes"
      },
      {
        "id": "areas",
        "rotulo": "Áreas protegidas",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Recepção, escritório, sala de servidores, cofre"
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências disponíveis",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Fotos da catraca, log de acesso do data center, registro de visitantes"
      }
    ],
    "prova": {
      "descricao": "Registro de acessos, configuração de alarmes e aviso de monitoramento.",
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
    "id": "p17_3",
    "fase": 17,
    "ordem": 3,
    "titulo": "Proteção contra Ameaças Físicas e Ambientais",
    "clausula": "A.7.5",
    "porQue": "A proteção contra ameaças físicas e ambientais (desastres naturais, ataques físicos, acidentes) é projetada e implementada a partir da avaliação de riscos. O auditor pede laudos e registros de manutenção e de teste.",
    "campos": [
      {
        "id": "threats",
        "rotulo": "Ameaças físicas e ambientais avaliadas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "incêndio, alagamento, queda de energia, calor excessivo na sala de servidores"
      },
      {
        "id": "measures",
        "rotulo": "Proteções implementadas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "detecção e combate a incêndio, nobreak e gerador, climatização redundante"
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (laudos, manutenções, testes)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "relatório da ferramenta, print da configuração, ata, lista de presença"
      }
    ],
    "prova": {
      "descricao": "Laudos de inspeção e registros de manutenção e teste dos equipamentos de proteção.",
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
    "id": "p17_4",
    "fase": 17,
    "ordem": 4,
    "titulo": "Segurança de Equipamentos",
    "clausula": "A.7.8",
    "porQue": "Equipamentos são posicionados e protegidos para reduzir riscos de ameaças físicas e ambientais e de acesso não autorizado (A.7.8). Os controles vizinhos cobrem ativos fora das instalações (A.7.9), manutenção (A.7.13) e descarte seguro (A.7.14).",
    "campos": [
      {
        "id": "measures",
        "rotulo": "Medidas de proteção implementadas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "UPS, climatização, CFTV, controle de acesso ao rack, cabeamento seguro"
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (onde estão e o que mostram)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "relatório da ferramenta, print da configuração, ata, lista de presença"
      }
    ],
    "prova": {
      "descricao": "Fotos das instalações e registros de manutenção dos equipamentos.",
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
    "id": "p18_1",
    "fase": 18,
    "ordem": 1,
    "titulo": "Política de Controle de Acesso",
    "clausula": "A.5.15, A.5.18, A.8.3",
    "porQue": "Regras de controle de acesso físico e lógico são definidas a partir dos requisitos de negócio e de segurança (A.5.15): menor privilégio, necessidade de conhecer, concessão, revisão periódica e revogação (A.5.18) e restrição de acesso à informação (A.8.3).",
    "campos": [
      {
        "id": "iam_tool",
        "rotulo": "Ferramenta IAM utilizada",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "Azure AD, Okta, Google Workspace, AWS IAM"
      },
      {
        "id": "mfa",
        "rotulo": "MFA implementado?",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "Sim, para todos os usuários",
          "Sim, apenas admin/privilegiados",
          "Não implementado"
        ]
      },
      {
        "id": "access_review",
        "rotulo": "Revisão periódica de acessos?",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "Trimestral",
          "Semestral",
          "Anual",
          "Não há processo"
        ]
      },
      {
        "id": "privileged",
        "rotulo": "Gestão de acessos privilegiados",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Como são gerenciadas contas admin? PAM? Princípio de menor privilégio?"
      },
      {
        "id": "evidence_desc",
        "rotulo": "Descreva as evidências disponíveis",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Print da config do Azure AD com MFA habilitado, relatório de revisão de acessos, política de senhas"
      }
    ],
    "prova": {
      "descricao": "Política aprovada e a última revisão de acessos registrada.",
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
    "id": "p18_2",
    "fase": 18,
    "ordem": 2,
    "titulo": "Gestão de Privilégios e Senhas",
    "clausula": "A.8.2, A.5.17, A.8.5",
    "porQue": "Direitos de acesso privilegiado são restritos e gerenciados (A.8.2). A gestão de informações de autenticação (A.5.17) e a autenticação segura (A.8.5) completam o quadro. O auditor pede a lista de administradores e a última revisão dela.",
    "campos": [
      {
        "id": "privileged",
        "rotulo": "Contas privilegiadas e quem as detém",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "administradores do domínio, do ERP e da nuvem"
      },
      {
        "id": "how",
        "rotulo": "Como privilégios são concedidos, registrados e revistos",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "solicitação aprovada pelo gestor, cofre de senhas, revisão trimestral"
      },
      {
        "id": "auth",
        "rotulo": "Regras de autenticação",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "MFA para administradores e acesso remoto, senha longa, bloqueio após tentativas"
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (onde estão e o que mostram)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "relatório da ferramenta, print da configuração, ata, lista de presença"
      }
    ],
    "prova": {
      "descricao": "Lista de contas privilegiadas, revisão periódica e configuração de MFA.",
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
    "id": "p18_3",
    "fase": 18,
    "ordem": 3,
    "titulo": "Registro de Eventos e Monitoramento",
    "clausula": "A.8.15, A.8.16",
    "porQue": "Registros de atividades, exceções, falhas e eventos relevantes são produzidos, armazenados, protegidos e analisados (A.8.15), e redes, sistemas e aplicações são monitorados para detectar comportamento anômalo (A.8.16).",
    "campos": [
      {
        "id": "siem",
        "rotulo": "SIEM/ferramenta de monitoramento",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "Splunk, ELK, Datadog, Wazuh, Microsoft Sentinel"
      },
      {
        "id": "sources",
        "rotulo": "Fontes de log coletadas",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Servidores, firewalls, AD, cloud, aplicações, endpoints"
      },
      {
        "id": "retention",
        "rotulo": "Retenção de logs",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "12 meses online + 24 meses archive"
      },
      {
        "id": "alerting",
        "rotulo": "Alertas configurados?",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "Sim, com playbooks",
          "Sim, alertas básicos",
          "Não há alertas automáticos"
        ]
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (dashboard, print do SIEM)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Configuração de coleta, retenção dos registros e alertas tratados.",
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
    "id": "p18_4",
    "fase": 18,
    "ordem": 4,
    "titulo": "Gestão de Vulnerabilidades Técnicas",
    "clausula": "A.8.8",
    "porQue": "Informações sobre vulnerabilidades técnicas são obtidas, a exposição é avaliada e medidas são tomadas. O auditor pede um relatório recente de varredura e a evidência de correção das vulnerabilidades críticas no prazo definido pela organização.",
    "campos": [
      {
        "id": "tool",
        "rotulo": "Ferramenta de scan utilizada",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "Nessus, Qualys, OpenVAS, Nuclei"
      },
      {
        "id": "frequency",
        "rotulo": "Frequência de scan",
        "tipo": "escolha",
        "obrigatorio": true,
        "exemplo": "",
        "opcoes": [
          "Contínuo",
          "Semanal",
          "Mensal",
          "Trimestral",
          "Ad-hoc"
        ]
      },
      {
        "id": "patching_sla",
        "rotulo": "SLA de patching",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "Crítico: 48h, Alto: 7 dias, Médio: 30 dias, Baixo: 90 dias"
      },
      {
        "id": "pentest",
        "rotulo": "Último pentest realizado",
        "tipo": "data",
        "obrigatorio": false,
        "exemplo": ""
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (relatório de scan, registro de patches)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Relatório de varredura recente e registro das correções aplicadas.",
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
    "id": "p18_5",
    "fase": 18,
    "ordem": 5,
    "titulo": "Criptografia e Gestão de Chaves",
    "clausula": "A.8.24",
    "porQue": "Regras para o uso efetivo de criptografia, incluindo a gestão de chaves criptográficas, são definidas e implementadas. O auditor confere a configuração real: protocolos em trânsito, criptografia em repouso e quem guarda e troca as chaves.",
    "campos": [
      {
        "id": "transit",
        "rotulo": "Criptografia em trânsito",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "TLS 1.2/1.3 para APIs e web, VPN para acesso remoto, protocolo para e-mail"
      },
      {
        "id": "rest",
        "rotulo": "Criptografia em repouso",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Encryption at rest no DB, BitLocker nos endpoints, S3 encryption, KMS"
      },
      {
        "id": "key_mgmt",
        "rotulo": "Gestão de chaves",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "AWS KMS, Azure Key Vault, HashiCorp Vault, rotação de chaves"
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (config TLS, print do KMS)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Configuração de TLS, criptografia de discos e bancos e o registro de gestão de chaves.",
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
    "id": "p18_6",
    "fase": 18,
    "ordem": 6,
    "titulo": "Segurança de Redes e Serviços",
    "clausula": "A.8.20, A.8.21, A.8.22",
    "porQue": "Redes e dispositivos de rede são protegidos, gerenciados e controlados (A.8.20); os mecanismos e requisitos de serviços de rede são definidos e monitorados (A.8.21); grupos de serviços, usuários e sistemas são segregados (A.8.22).",
    "campos": [
      {
        "id": "segmentation",
        "rotulo": "Segmentação e proteção da rede",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "redes separadas para usuários, servidores e visitantes, com firewall entre elas"
      },
      {
        "id": "services",
        "rotulo": "Serviços de rede e requisitos de segurança",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "link de internet com contrato de nível de serviço, acesso remoto por VPN com MFA"
      },
      {
        "id": "wifi",
        "rotulo": "Rede sem fio",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "rede corporativa com autenticação individual; rede de visitantes isolada"
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (diagrama de rede, regras de firewall)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "relatório da ferramenta, print da configuração, ata, lista de presença"
      }
    ],
    "prova": {
      "descricao": "Diagrama de rede atualizado e regras de firewall revisadas.",
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
    "id": "p19_1",
    "fase": 19,
    "ordem": 1,
    "titulo": "Política de Desenvolvimento Seguro",
    "clausula": "A.8.25",
    "porQue": "Regras para o desenvolvimento seguro de software e sistemas são estabelecidas e aplicadas (A.8.25), com requisitos de segurança da aplicação (A.8.26), princípios de arquitetura segura (A.8.27), codificação segura (A.8.28) e testes (A.8.29).",
    "campos": [
      {
        "id": "sdlc",
        "rotulo": "Fases do SDLC seguro adotado",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Requisitos → Design → Coding → Testing → Deploy → Manutenção"
      },
      {
        "id": "tools",
        "rotulo": "Ferramentas de segurança no pipeline",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "SAST, DAST, SCA, secrets scanning, container scanning"
      }
    ],
    "prova": {
      "descricao": "Política de desenvolvimento seguro aprovada e comunicada à equipe.",
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
    "id": "p19_2",
    "fase": 19,
    "ordem": 2,
    "titulo": "Ciclo de Vida de Desenvolvimento Seguro",
    "clausula": "A.8.25, A.8.28",
    "porQue": "O ciclo de vida aplica a política na prática: requisitos, revisão de código, análise automatizada e aprovação antes da produção. O auditor pede para ver o fluxo em uma mudança real.",
    "campos": [
      {
        "id": "pipeline",
        "rotulo": "Pipeline CI/CD utilizado",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "GitHub Actions, GitLab CI, Jenkins, Azure DevOps"
      },
      {
        "id": "stages",
        "rotulo": "Estágios de segurança no pipeline",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "Lint → SAST → Unit Tests → Build → DAST → Deploy → Monitor"
      },
      {
        "id": "gates",
        "rotulo": "Gates de segurança (bloqueiam deploy?)",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "Sim, vulnerabilidades críticas bloqueiam",
          "Alertas apenas, não bloqueiam",
          "Sem gates de segurança"
        ]
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (print do pipeline, relatório SAST)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Configuração do fluxo de desenvolvimento e uma mudança recente que passou por ele.",
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
    "id": "p19_3",
    "fase": 19,
    "ordem": 3,
    "titulo": "Testes de Segurança em Software",
    "clausula": "A.8.29",
    "porQue": "Processos de teste de segurança são definidos e executados no ciclo de desenvolvimento, inclusive no aceite de sistemas novos e de novas versões. O auditor pede o relatório de um teste recente e o que foi feito com os achados.",
    "campos": [
      {
        "id": "sast",
        "rotulo": "Ferramenta SAST",
        "tipo": "texto",
        "obrigatorio": true,
        "exemplo": "SonarQube, Semgrep, CodeQL, Snyk Code"
      },
      {
        "id": "sca",
        "rotulo": "Ferramenta SCA (dependências)",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "Dependabot, Snyk, Trivy, OWASP Dependency-Check"
      },
      {
        "id": "dast",
        "rotulo": "Ferramenta DAST (se houver)",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "OWASP ZAP, Burp Suite, Nuclei"
      },
      {
        "id": "frequency",
        "rotulo": "Frequência de execução",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "A cada commit/PR",
          "Diário",
          "Semanal",
          "Manual"
        ]
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (relatórios, dashboards)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": ""
      }
    ],
    "prova": {
      "descricao": "Relatórios de testes de segurança e o tratamento dos achados.",
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
    "id": "p20_1",
    "fase": 20,
    "ordem": 1,
    "titulo": "Segregação de Ambientes",
    "clausula": "A.8.31, A.8.33",
    "porQue": "Ambientes de desenvolvimento, teste e produção são separados e protegidos (A.8.31). Dados de teste são escolhidos, protegidos e gerenciados (A.8.33): dado pessoal de produção em teste precisa de justificativa e proteção equivalente.",
    "campos": [
      {
        "id": "envs",
        "rotulo": "Ambientes existentes e como estão separados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "desenvolvimento, homologação e produção em contas de nuvem distintas"
      },
      {
        "id": "access",
        "rotulo": "Quem acessa a produção",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "só a equipe de operações; desenvolvedores sem acesso de escrita"
      },
      {
        "id": "test_data",
        "rotulo": "Dados de produção em teste",
        "tipo": "escolha",
        "obrigatorio": false,
        "exemplo": "",
        "opcoes": [
          "Não são usados",
          "Usados mascarados ou anonimizados",
          "Usados com autorização registrada",
          "Usados sem controle"
        ]
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (onde estão e o que mostram)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "relatório da ferramenta, print da configuração, ata, lista de presença"
      }
    ],
    "prova": {
      "descricao": "Arquitetura dos ambientes e a lista de quem tem acesso à produção.",
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
    "id": "p20_2",
    "fase": 20,
    "ordem": 2,
    "titulo": "Gestão de Mudanças",
    "clausula": "A.8.32",
    "porQue": "Mudanças em instalações de processamento e em sistemas seguem procedimento de gestão de mudanças. O auditor sorteia mudanças recentes e pede aprovação, teste e plano de retorno de cada uma.",
    "campos": [
      {
        "id": "process",
        "rotulo": "Fluxo de mudança",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "solicitação, análise de impacto, aprovação, teste, janela, plano de retorno, registro"
      },
      {
        "id": "emergency",
        "rotulo": "Tratamento de mudança emergencial",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "aprovação posterior em até um dia útil, com registro"
      },
      {
        "id": "example",
        "rotulo": "Exemplo de mudança registrada",
        "tipo": "texto",
        "obrigatorio": false,
        "exemplo": "atualização do firewall em 12/05"
      }
    ],
    "prova": {
      "descricao": "Registros de mudanças recentes com aprovação e teste.",
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
    "id": "p20_3",
    "fase": 20,
    "ordem": 3,
    "titulo": "Configuração Segura (Hardening)",
    "clausula": "A.8.9",
    "porQue": "Configurações, inclusive de segurança, de hardware, software, serviços e redes são estabelecidas, documentadas, implementadas, monitoradas e revisadas. O auditor compara um servidor real com o padrão documentado.",
    "campos": [
      {
        "id": "baselines",
        "rotulo": "Padrões de configuração adotados",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "CIS Benchmarks para Windows Server e Linux, padrão próprio para equipamentos de rede"
      },
      {
        "id": "coverage",
        "rotulo": "Ativos cobertos e como a conformidade é verificada",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "varredura mensal de configuração nos servidores"
      },
      {
        "id": "drift",
        "rotulo": "Como desvios são detectados e corrigidos",
        "tipo": "texto_longo",
        "obrigatorio": false,
        "exemplo": "alerta da ferramenta de gestão de configuração e correção registrada"
      },
      {
        "id": "evidence_desc",
        "rotulo": "Evidências (onde estão e o que mostram)",
        "tipo": "texto_longo",
        "obrigatorio": true,
        "exemplo": "relatório da ferramenta, print da configuração, ata, lista de presença"
      }
    ],
    "prova": {
      "descricao": "Padrão de configuração documentado e relatório de conformidade.",
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
  }
];
