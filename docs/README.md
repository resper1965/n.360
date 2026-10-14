# Documentação do n.360

O n.360 é a plataforma; n.iso (`/iso`) e n.privacy (`/privacy`) são os módulos, sobre um cadastro só.

Índice do que existe em `docs/`, agrupado por **quando você vai precisar**. Cada
linha diz o que o documento responde — não o que ele contém.

Para o essencial do projeto (o que é, como rodar, como publicar), a porta de
entrada é o [`README.md`](../README.md) da raiz.

---

## Estou de plantão e algo quebrou

| Documento | Responde |
|---|---|
| [`manual-equipe-ness.md`](manual-equipe-ness.md) | Passo a passo para a equipe da ness. operar clientes no n.360: papéis, criar conta, cliente novo, migração, transferência, agentes de IA, desativar e excluir, rotina do n.privacy. |
| [`runbook-incidente.md`](runbook-incidente.md) | Produção não responde, deploy ruim, banco corrompido, alguém perdeu o segundo fator, suspeita de acesso indevido. Começa pelo "primeiro minuto" e vai até a comunicação. |
| [`runbook-publicacao.md`](runbook-publicacao.md) | Como o código chega à produção pelo Actions, como publicar da máquina do dono quando o Actions não roda (`scripts/publicar.sh`), migration, rollback, orçamento de minutos e o checklist para tornar o repositório privado. |

## Vou mexer no banco

| Documento | Responde |
|---|---|
| [`retencao.md`](retencao.md) | Quanto tempo cada tabela guarda dado, e por quê. A política que o cron executa vive em `src/manutencao.ts`; este documento explica cada prazo. Os dois não podem divergir. |
| [`drift-schema-conhecido.txt`](drift-schema-conhecido.txt) | A diferença aceita entre `schema.sql` e o D1 de produção, para o workflow semanal de drift não gritar por ruído conhecido. |

## Vou mexer em autenticação ou acesso

| Documento | Responde |
|---|---|
| [`sso-scim.md`](sso-scim.md) | Como funciona o login federado (OIDC), a tela Segurança do projeto e o provisionamento SCIM 2.0 — inclusive a pergunta que toda revisão de fornecedor faz: quando alguém é desligado no IdP do cliente, o acesso aqui cai sozinho? |
| [`portabilidade.md`](portabilidade.md) | O caminho de saída dos dados de um tenant (LGPD art. 18, V), e por que a assinatura do export é assimétrica. |

## Vou mexer no agente consultor (MCP remoto)

| Documento | Responde |
|---|---|
| [`agente/README.md`](agente/README.md) | O que é o agente, como o consultor conecta o Claude Code, o Codex, o Cursor ou o Antigravity, o que ele lê, grava e o que pede o seu "sim"; o que o cliente vê e revoga; solução de problemas. |
| [`agente/arquitetura.md`](agente/arquitetura.md) | Como a conexão nasce e como cada chamada é decidida (com diagramas), o mapa de arquivos, os dados, os prazos, e como estender com skill, ferramenta ou rota. |
| [`agente/seguranca.md`](agente/seguranca.md) | Contra quem o agente é desenhado, os 12 invariantes e o teste de cada um, os limites que **não** são garantia, e o checklist para um PR que toque a superfície do agente. |

## Vou escrever ou depurar teste

| Documento | Responde |
|---|---|
| [`testing.md`](testing.md) | Como ler o resultado detalhado — qual teste caiu, em que linha, e quanto do código está coberto. |
| [`mcp-e2e-validation.md`](mcp-e2e-validation.md) | Roteiro manual de validação da integração MCP, com os papéis de consultor e auditor separados. |

## Quero entender uma decisão ou o estado do trabalho

| Documento | Responde |
|---|---|
| [`plano-2026-10-fechamento.md`](plano-2026-10-fechamento.md) | Foto de 08/10/2026 do plano de outubro. Não está todo entregue: seguem abertos H2 (MFA do `platform_admin`), F2 (login OAuth em Cursor, Codex e Antigravity), F4, F5 e T5, do dono ou dependentes de decisão. |
| [`superpowers/specs/`](superpowers/specs/) | O desenho vigente de cada funcionalidade grande. Do n.360 e do n.privacy: [`n.360 como casca`](superpowers/specs/2026-10-11-n360-casca-design.md), [`módulos por pessoa`](superpowers/specs/2026-10-12-n360-modulos-por-pessoa-design.md), [`núcleo comum e n.privacy`](superpowers/specs/2026-10-06-nucleo-comum-nprivacy-design.md), [`integração dos módulos`](superpowers/specs/2026-10-10-integracao-produtos-design.md), [`importação do programa de privacidade`](superpowers/specs/2026-10-11-importacao-privacy-design.md). Do n.iso e da plataforma: landing, MCP remoto, paridade do agente, propostas, stakeholders, avisos de prazo, jornada. |
| [`arquivo/`](arquivo/README.md) | O que já foi executado ou ficou superado: os planos de outubro/2026 (n.privacy fatias 1 a 8, n.360, módulos por pessoa, importação, finalização), a arrumação final de 06/10, o plano enterprise-grade, a avaliação OWASP de 2026-08, triagens e specs antigas. Registro, não instrução. |

## Design

| Documento | Responde |
|---|---|
| [`design/diagnostico-2026-10-12/`](design/diagnostico-2026-10-12/README.md) | Diagnóstico de design de 12/10/2026 (método Impeccable): [`n.360`](design/diagnostico-2026-10-12/n360-portal.md), [`n.iso`](design/diagnostico-2026-10-12/n-iso.md), [`n.privacy`](design/diagnostico-2026-10-12/n-privacy.md) e [`detector e acessibilidade`](design/diagnostico-2026-10-12/detector-e-acessibilidade.md). As ondas 1 a 3 (#358 a #360) já corrigiram parte: confira o código antes de seguir uma linha. |
| [`design/handoff-ness-v1/`](design/handoff-ness-v1/) | O pacote de handoff visual da ness.: protótipos `.dc.html` navegáveis e tokens do design system (o patch de implementação, já aplicado, foi para `arquivo/design/`). Metade das decisões só aparece em interação — abra os protótipos no navegador antes de mexer na UI. |
| [`../design.md`](../design.md) | Os princípios do design system aplicados no produto; os valores vivem em `frontend/src/style.css` (`:root`). |

## Gerado por script — não editar à mão

| Arquivo | Gerado por |
|---|---|
| [`openapi.json`](openapi.json) | `npm run openapi`, a partir dos schemas Zod que as rotas já usam. Editar à mão cria uma segunda fonte de verdade, e `test/openapi.test.ts` reprova a divergência. |
| [`export-public-key.json`](export-public-key.json) | A chave pública Ed25519 que verifica a assinatura dos exports de portabilidade. A privada é secret e nunca sai do Worker. |

---

## Onde está o resto

| Assunto | Lugar |
|---|---|
| Contexto canônico para quem (ou o que) for trabalhar no código | [`../AGENTS.md`](../AGENTS.md) |
| Princípios que não se negociam | [`../CONSTITUTION.md`](../CONSTITUTION.md) |
| Ambiente, verificação antes do PR, regras de schema e teste | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) |
| Como reportar vulnerabilidade e quais invariantes não podem regredir | [`../SECURITY.md`](../SECURITY.md) |
| O que mudou, versão a versão | [`../CHANGELOG.md`](../CHANGELOG.md) |
| Instalação e diagnóstico do servidor MCP local | [`../mcp-server-niso/README.md`](../mcp-server-niso/README.md) |
| Estado e procedimento das migrations | [`../migrations/README.md`](../migrations/README.md) |
