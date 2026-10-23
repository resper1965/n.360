# Políticas temáticas (2026-10-23)

## Problema

Uma política aberta no painel Políticas do n.iso aparece pela metade e sem visão do conjunto. O diagnóstico
(somente leitura em produção, num projeto de cliente) mostrou três causas:

1. **A nota do controle virou a política vigente.** O painel lista `compliance_controls.description` por controle. Esse
   campo guarda ao mesmo tempo texto de política e nota/justificativa do controle. `importarControle`
   (`src/services/documentos.ts:148-152`) empurra o `description` como última versão do documento; no projeto examinado a PSI
   ficou vigente com 258 caracteres de nota de governança, enquanto a versão completa (6.968 caracteres) está em
   rascunho. Duas versões antigas perderam todas as quebras de linha e aparecem como um bloco só.
2. **Dois modelos de política sem ligação.** O painel mostra uma "política" por controle (124 no projeto examinado, prévia de 80
   caracteres, modal com rolagem de 350 px). As políticas de verdade são temáticas e estão em Documentos (lá, 19 políticas,
   33 procedimentos e 2 normas, quase todos em rascunho, nenhum com pai, 4 ligados a controle).
3. **O gerador produz fragmentos.** Uma política por controle do Anexo A, 4.096 tokens de saída para um pedido de
   2.000 palavras e 10 seções, sem conferir corte (`finish_reason`), sem conferir estrutura e com contexto pobre
   (nome, setor e respostas cruas do assessment).

## Decisões do dono (23/10/2026)

1. A unidade de política é o **documento temático**; os controles apontam para ele.
2. O gerador gera **política temática**.
3. Temas: **catálogo fixo + tema livre**.
4. Geração **por seção sobre esqueleto fixo**.
5. Contexto da IA: o conjunto da seção "Contexto" abaixo.
6. Migração: **reorganização assistida**, nada fundido nem apagado sozinho.

## Modelo

- A política é um `documentos` com `tipo = 'politica'`. A PSI (Política de Segurança da Informação) é a política raiz;
  normas e procedimentos ficam abaixo pela hierarquia existente (`pai_id`, `validarHierarquia`).
- **Cobertura é `documento_requisitos`.** O catálogo de requisitos já tem os controles da ISO/IEC 27001:2022 e da
  27701:2025, e `compliance_controls.requisito_id` liga o controle ao requisito. Um controle está coberto quando um
  documento **vigente** está ligado ao requisito dele.
- **Catálogo de temas** em `src/data/temas-politica.ts`: código (ex. `POL-IAM`), título, requisitos sugeridos, se é a
  PSI e o esqueleto de seções. Parte dos 24 modelos de `src/templates/policies/v2022/`. É sugestão: a ligação real é a
  que o consultor confirma.
- **`compliance_controls.description` deixa de ser política.** Volta a ser só nota ou justificativa do controle.
  `importarControle` não empurra mais o `description` como versão; publicar documento não escreve no controle.
- **Sem migration.** As tabelas existem. A rota que liga documento a requisito sai da faixa `privacy` para `nucleo`
  (`src/modulos.ts`), porque o n.iso precisa dela.

## Geração

- **Criar:** `POST /projects/:id/politicas` com `{ tema }` (catálogo) ou `{ titulo, requisitos }` (tema livre). Cria o
  documento em rascunho com o esqueleto (títulos `## N. Nome`, cada seção marcada "a gerar") e liga os requisitos que o
  consultor confirmou na tela. Tema já existente no projeto devolve 409 com o id.
- **Esqueleto padrão:** Objetivo, Escopo, Referências, Papéis e responsabilidades, Diretrizes, Exceções, Conformidade e
  sanções, Revisão, Controle do documento. **Esqueleto da PSI:** Propósito, Compromissos (cláusula 5.2), Objetivos de
  segurança da informação e privacidade, Papéis, Políticas específicas (lista dos documentos filhos), Revisão,
  Controle do documento.
- **Gerar uma seção:** `POST /projects/:id/documentos/:docId/secoes/:n/gerar`, uma seção por chamada; a tela chama em
  sequência e mostra o progresso. A seção mora no texto do rascunho, delimitada pelo seu título; regerar troca só aquele
  trecho e preserva o que foi editado à mão no resto. Só em documento com rascunho; documento sem rascunho ganha um a
  partir da versão vigente.
- **Corte:** `runModel` (`src/agents/types.ts`) passa a informar se a resposta acabou por limite (`finish_reason =
  'length'` no gateway; o equivalente no Workers AI). Cortada: uma tentativa pedindo a continuação; se ainda cortada,
  grava a seção com o aviso visível "Seção incompleta: gere de novo ou complete à mão".
- **Conferência antes de gravar:** título presente, corpo não vazio, sem marcador de modelo (`[Organization Name]`,
  `{{…}}`). Falhou: a seção fica "a gerar" e a resposta diz o motivo; nada de texto ruim no lugar.
- **Sempre rascunho.** Publicar é ato humano (ou do agente por `niso_publicar_documento`, com o "sim", o motivo e o
  hash). Aprovação por pedido e ciência por versão seguem como em Documentos.
- **Limite:** as rotas de geração entram na regra `ia` de `src/middleware/rate-limit.ts`, com faixa própria por usuário.

## Contexto

Um montador só, `contextoDaPolitica(db, projectId, requisitos)`, lido do cadastro:

- empresa: setor, porte, atividade (`empresas`);
- escopo do SGSI e normas do projeto;
- controles cobertos: situação na SoA e a nota/justificativa (orienta Papéis e Diretrizes);
- governança: papéis nomeados (Direção, CIO/Líder SGSI, DPO);
- sistemas e ativos: nome e classificação;
- riscos ligados aos controles do tema: ameaça e nível;
- políticas existentes: texto vigente da PSI (quando o tema é outro) e títulos das irmãs.

Fora: dado pessoal de titular, respostas cruas do assessment, texto de fornecedor ou de importação. O contexto entra num
bloco "DADOS DO PROJETO", com a regra de que é dado e nunca instrução.

## Telas

- **Políticas** (n.iso e n.privacy, uma tela só): lista de documentos `tipo = 'politica'` por `montarLista`, com código e
  título, situação (vigente, rascunho, revisão vencida), controles cobertos, aprovação derivada e ciência da versão
  vigente. No topo, "X de Y controles aplicáveis cobertos por política vigente", contado no servidor; abaixo, os
  controles aplicáveis sem cobertura, com "Criar política do tema sugerido". Ação principal: "Nova política" (catálogo +
  tema livre).
- **Página da política:** texto inteiro renderizado em markdown (sem caixa de 350 px); à direita, controles cobertos
  (editáveis no rascunho), hierarquia e histórico. Rascunho também renderizado, com progresso das seções e "Regerar
  seção". Publicar, pedir aprovação e ciência são as ações de Documentos.
- **Controles:** cada controle mostra "Coberto por POL-IAM-001 (vigente)" ou "Sem política", com link. Sai o
  "Visualizar / Gerar política" do controle.
- **Organizar políticas** (em Mais, só equipe): lista os documentos por controle que restam e os controles cobertos e
  não cobertos. Por documento por controle: **incorporar** a um temático (vira `obsoleto`, histórico preservado) ou
  **promover** a temático (título e requisitos). Por controle: ligar a uma política. Nada automático.
- **Impressão:** sai o relatório por controle; entra a impressão do documento (texto renderizado, controle do
  documento, aprovações derivadas).

## O que sai e o que fica

- **Saem:** `POST .../generate-policy`, `.../generate-policies-bulk`, `.../policies/generate-from-template`,
  `POST /controls/:id/policy`, `.../restore-version`, o relatório impresso por controle e os botões que os chamam;
  `aplicarTextoNoControle`, `gravarPolitica` e `gravarRascunhoDoAgente` (`src/services/politica-escrita.ts`); o uso da
  tabela `policy_templates` (a tabela fica no banco).
- **Ficam como histórico, só leitura:** `policy_versions`, as colunas de aprovação CISO/CEO do controle e os pedidos
  `tipo = 'politica'` existentes. Nenhum novo nasce deles.
- **Fora deste trabalho:** `generate-document` e `checklist/:itemId/generate` (só devolvem texto); entram no limite de
  taxa pela correção da auditoria da rodada 3.

## Agente MCP

- `niso_generate_policy` e `niso_update_policy` (remoto e `mcp-server-niso`) dão lugar a `niso_criar_politica` (tema ou
  tema livre, rascunho) e `niso_gerar_secao` (rascunho). Publicar segue por `niso_publicar_documento`.
- Saem de `DECISOES` (`src/middleware/decisoes-agente.ts`) as entradas de `restore-version` e
  `generate-from-template`. Instruções (`src/mcp/contexto.ts`), skills (`agent-skills/`) e `AGENTS.md` acompanham.

## Testes

- Geração com modelo falso: resposta cortada pede continuação e, cortada de novo, grava "incompleta"; resposta sem título
  ou com marcador de modelo não grava.
- Regerar uma seção preserva o texto editado à mão nas outras.
- Nota do controle nunca vira versão de documento (`importarControle`, `garantirDocumentoDoControle`).
- Indicador de cobertura conta só documento vigente e só controle aplicável.
- Organizar: incorporar torna o documento `obsoleto` e preserva versões; promover liga os requisitos.
- Agente: cria e gera rascunho; publicar sem a decisão é recusado.
- `test/modulos-produto.test.ts` com as rotas novas; frontend: página da política renderiza o texto inteiro; E2E: criar,
  gerar, publicar.

## Entrega

Três PRs, cada um publicável sozinho:

1. Modelo, cobertura e telas: lista de políticas, página da política, "coberto por" no controle, rota de requisitos do
   documento em `nucleo`, e `importarControle` sem empurrar o `description`.
2. Catálogo de temas, contexto e geração por seção (com detecção de corte e conferência).
3. Organizar políticas, retirada das rotas e escritores antigos, ferramentas MCP novas e documentação.

Ação de dado, fora do código: no projeto examinado, a PSI tem a v5 completa em rascunho; publicá-la pela tela de Documentos
corrige já o que foi visto.
