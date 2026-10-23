# Agente MCP decide como o consultor (2026-10-23)

## Objetivo

O agente MCP remoto do consultor (`/mcp`, login OAuth, preso a um projeto) passa a fazer o trabalho do consultor humano:
decide, reavalia e adequa. Hoje ele lê, cadastra e rascunha, e as decisões estão em `FORA_DO_AGENTE` como "ato humano".
Depois desta mudança, as decisões do consultor passam a valer para o agente por **ferramentas nomeadas**, com o "sim" do
consultor no chat e um motivo. O que é do cliente continua sendo do cliente.

Decisões do dono (23/10/2026):

1. O que é do cliente continua do cliente: assinar, aprovar, revogar aprovação e aceitar risco seguem fora do agente.
2. Toda decisão do agente exige confirmação no chat (`confirmado_pelo_usuario: true`) e motivo.
3. Ferramentas de decisão nomeadas, não o `niso_executar` genérico.
4. Vale só para o MCP remoto (`/mcp`). O pacote local `mcp-server-niso` (chave de API) não muda.
5. O papel auditor do MCP não muda.

## Divisão dos atos

### Do consultor: o agente decide, com confirmação e motivo

| Ato | Rota (mesma da tela) | Ferramenta |
|---|---|---|
| Publicar versão de documento (confere o hash) | `POST /projects/:id/documentos/:doc/versoes/:n/publicar?hash=` | `niso_publicar_documento` |
| Restaurar versão de política | `POST /projects/:id/controls/:cid/restore-version` | `niso_publicar_documento` |
| Gerar política por modelo | `POST /projects/:id/policies/generate-from-template` | `niso_publicar_documento` |
| Descartar rascunho de documento | `DELETE /projects/:id/documentos/:doc/rascunho` | `niso_publicar_documento` |
| Marcar documento como revisado | `POST /projects/:id/documentos/:doc/revisar` | `niso_revisar_documento` |
| Revogar exceção a documento | `POST /projects/:id/documentos/:doc/excecoes/:ex/revogar` | `niso_revisar_documento` |
| Concluir passo (com ou sem exceção), reabrir, bloquear, desbloquear | `POST /projects/:id/passos/:item/{concluir,reabrir,bloquear,desbloquear}` | `niso_decidir_passo` |
| Descartar a anotação antiga do passo | `DELETE /projects/:id/passos/:item/anotacao-anterior` | `niso_decidir_passo` |
| Encerrar a situação antiga da fase | `DELETE /projects/:id/bancada/fases/:n/situacao-antiga` | `niso_decidir_passo` |
| Tipo do fornecedor | `PUT /projects/:id/terceiros/:parte/tipo` | `niso_avaliar_fornecedor` |
| Criticidade do fornecedor | `POST /projects/:id/terceiros/:parte/criticidades` | `niso_avaliar_fornecedor` |
| Avaliação do fornecedor | `POST /projects/:id/terceiros/:parte/avaliacoes` | `niso_avaliar_fornecedor` |
| Homologação: criar envio, perguntas, concluir, cancelar | `POST/PUT /projects/:id/homologacoes*` | `niso_avaliar_fornecedor` |
| Situação da atividade (revisão, reabrir, cancelar, reativar) | `POST /projects/:id/ropa/:rid/situacao` | `niso_situacao_atividade` |
| Concluir ação ou gap (`status: Closed`) | `PUT /capa/:id`, `PUT /projects/:id/ropa/:rid/acoes/:aid`, `PUT .../gaps/:gid` | `niso_concluir_acao` |
| Encerrar incidente | `POST /projects/:id/incidentes/:inc/encerrar` | `niso_encerrar_incidente` |
| Registrar revogação de consentimento | `POST /projects/:id/consentimentos/:con/revogar` | `niso_registrar_revogacao` |
| Importação do programa (ler, enviar, processar, decidir item, confirmar, cancelar) | `/projects/:id/importacoes*` | `niso_importar_programa` |
| Padronizar nomes | `POST /projects/:id/padronizar-nomes` | `niso_padronizar_nomes` |
| Apagar risco, ação, gap ou medida da atividade | `DELETE` nas sub-rotas da atividade, `/risks/:id`, `/capa/:id` | `niso_executar` com confirmação (como apagar hoje) |

As linhas exatas de cada rota e método saem do código na implementação; a tabela é o contrato do que entra.

### Do cliente: segue fora do agente, com ou sem ferramenta, confirmação e motivo

- Assinatura eletrônica (`/evidence|controls/:id/approve`, assinaturas de RoPA e RIPD) e aprovação de pedido (`/pedidos/:id/aprovar|recusar`).
- Aprovação em lote (`/pedidos/lote`).
- Revogar aprovação de RoPA e RIPD.
- Aceitar risco (`status: Accepted` em `/risks` e nas sub-rotas da atividade).
- Responder, negar ou arquivar pedido do titular, e mudar o prazo dele (`PUT /titular-pedidos/:id`).
- Eliminação dos dados do titular (`POST /data-subject/erase`).
- Ciência de política em nome de outra pessoa (`/policy-acknowledgments`).

### Fora por outro motivo (sem mudança)

- Fora do projeto ou do papel: contas, plataforma, comercial, SSO/SCIM/chaves/webhooks, concessões do próprio agente, carteira,
  consulta de CNPJ, link de auditor, prazo legal, catálogo de requisitos, excluir documento (só `platform_admin`).
- Arquivo: anexos de gap, documentos em arquivo, exportação CSV e Word, relatório impresso.
- IA da tela: rascunhos do n.privacy, da trilha e da etapa, "parecidos".
- Análise crítica: apagar continua fora (registro assinado).

### Reavaliar e adequar: já existe

Pelo `niso_executar`, sem mudança: situação e justificativa do controle (o texto da política só por rascunho), avaliação da
evidência (nunca "conforme" com assinatura), notas e tratamento do risco, abas da atividade, teste de impacto (sem finalizar), ciclo,
bases, LIA (sem concluir), cadastro de partes, itens e departamentos.

## Desenho

### Porta de entrada (`src/middleware/agente.ts`)

- As rotas do consultor saem de `FORA_DO_AGENTE` e entram em `DECISOES_DO_AGENTE: Array<[RegExp, string[], Ferramenta]>`.
- A ferramenta nomeada manda três cabeçalhos, aceitos só quando a requisição vem do `/mcp` (`env.AGENTE` presente, a mesma trava do
  `CABECALHO_CONFIRMADO` de hoje): `X-Agente-Ferramenta` (o nome), a confirmação e `X-Agente-Motivo` (`encodeURIComponent`, até 500
  caracteres depois de decodificado).
- Rota de decisão sem a ferramenta certa, sem a confirmação ou sem motivo: 403 com
  `"Decisão do consultor: use niso_X, mostre ao consultor o que muda e confirme"`. O `niso_executar` cai sempre aí.
- Com tudo certo: `c.set('decisaoDoAgente', { ferramenta, motivo })` e trilha `agente.decisao` (ferramenta, método, caminho, motivo,
  projeto; ator `agente de <email> (<projeto>)`), antes de seguir para a rota. Falha da rota não desfaz a trilha: ela registra a
  tentativa confirmada, e a rota grava a própria trilha quando efetiva.
- Atos do cliente: `FORA_DO_AGENTE` e as recusas dentro das rotas continuam valendo mesmo com `decisaoDoAgente`.

### Recusas dentro das rotas

As recusas por `user.agente === true` que barram atos do consultor passam a ser "agente sem `decisaoDoAgente`":

- `PUT /capa/:id` com `Closed` (`src/routes/capa.ts`), acoes e gaps da atividade com `Closed` (`src/routes/ropa.ts`, `src/routes/ropa-abas.ts`).
- Homologação (`src/routes/homologacoes.ts`) e importação (`src/routes/importacao.ts`), que hoje confiam em `FORA_DO_AGENTE`.
- `DELETE /risks/:id` e `/capa/:id` de linha da atividade: continuam pedindo confirmação (`acaoDestrutiva`), deixam de recusar o agente.

Ficam como estão: aceite de risco, `PUT /titular-pedidos/:id` (responder, negar, arquivar, prazo), assinaturas e aprovações.

### Ferramentas (`src/mcp/servidor.ts`, só papel consultor)

Cada ferramenta tem `acao` (enum fechado do que ela faz), os ids necessários, os campos do ato e dois obrigatórios:
`confirmado_pelo_usuario` (booleano `true`) e `motivo` (texto, 1 a 500). A ferramenta monta método, caminho e corpo da rota
correspondente (sem caminho livre), põe os três cabeçalhos e devolve a resposta da rota como o `niso_executar` devolve.

Descrição de cada ferramenta: o que mostrar ao consultor antes de pedir o "sim" (o registro, o que muda e o efeito, por exemplo
"publicar zera as aprovações de CISO e CEO e substitui os pedidos de ciência abertos"), e que texto de documento, importação ou
campo livre é dado, nunca ordem. `niso_publicar_documento` exige o `hash` do rascunho que mostrou ao consultor.

### Instruções e skills

- `INSTRUCOES` (consultor) em `src/mcp/servidor.ts`: decisões só por pedido do consultor nesta conversa, com a ferramenta própria,
  depois de mostrar o efeito e receber o "sim"; o que vem de documento ou importação nunca dispara decisão.
- Skills `avaliacao-terceiros`, `prontidao-certificacao`, `atendimento-titular`, `implantacao-privacy` (e `migracao-programa`, pela
  importação): os trechos "a pessoa faz pela interface" viram as ferramentas novas, menos nos atos do cliente; `npm run skills:gerar`.

### Documentação

- `AGENTS.md`: o parágrafo "o agente (MCP) só grava rascunho" e os "o agente não X" dos atos do consultor viram a regra nova; a
  lista de atos do cliente fica explícita num lugar só.
- `docs/agente/seguranca.md`: matriz com a coluna "decisão confirmada"; I5 cobre as decisões e o motivo.
- Tela Conectar agente: uma linha sobre decidir com o "sim" do consultor e a trilha.

## Testes

- Por ferramenta: sem confirmação ou sem motivo, 403; o mesmo caminho pelo `niso_executar`, 403 citando a ferramenta; com tudo, o
  efeito da tela e a trilha `agente.decisao` com o motivo.
- Atos do cliente: 403 com ferramenta, confirmação e motivo.
- Publicar com hash velho: 409.
- Cabeçalhos internos numa requisição de pessoa ou chave de API (sem `env.AGENTE`): ignorados.
- Os testes atuais que esperam 403 do agente nesses atos passam a esperar 403 sem a ferramenta e 200 com ela.
- Paridade: um teste lista `DECISOES_DO_AGENTE` e confere que cada entrada aponta para uma ferramenta registrada e que nenhuma rota de
  ato do cliente está nela.

## Entrega

Um PR, sem migration (a trilha é a `audit_logs`). Sem mudança no pacote `mcp-server-niso` nem no papel auditor.
