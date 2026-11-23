# Pontos menores das ondas 1 a 4: triagem e três lotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar, em três lotes pequenos, os achados "menores" adiados nos ledgers das ondas 1 a 4 que ainda existem no código (HEAD `6cc6f30` = `c0badf9` + commit de docs), começando pelos de segurança e integridade (incluindo `ehComercial` com a organização ATIVA, decisão do dono: CORRIGIR), e registrar por que o resto cai.

**Architecture:** Sem tabela nova e sem migration. Lote 1 mexe em 4 pontos do backend (`src/middleware/auth.ts`, `src/services/ot-desvio-acao.ts` + rota, `src/schemas/resources.ts`, `src/services/transferencia-projeto.ts`), cada um com teste vermelho antes. Lote 2 é só teste (frontend e backend), sem código de produção. Lote 3 é lista curta de UX e docs.

**Tech Stack:** Cloudflare Worker (Hono) + D1, vitest (`@cloudflare/vitest-pool-workers` no backend, jsdom no frontend), SPA vanilla JS (Vite).

**Fontes lidas:** ledgers `progress.md` e `task-*-report.md` das três pastas de `.superpowers/sdd/` (local, não versionado) (entrada-n360, onda3, onda4; não existe pasta separada da remediação, o que ela fechou está nas seções "Rulings da execução" das specs), `codex-findings-report.md` da onda 4, e as seções "Rulings da execução", "Não conferido" e "ABERTO" das specs das ondas 1 a 4. Toda linha arquivo:linha abaixo foi conferida neste worktree (HEAD `6cc6f30`).

## Global Constraints

- **`test/onda2-numeros.test.ts` nunca é editado.** Se um task tocar `src/services/painel*.ts` (nenhum deste plano toca), rode-o e confira `git diff --stat c4c7039 -- test/onda2-numeros.test.ts` vazio.
- **Migrations: nenhuma.** Nenhum item abaixo precisa; se aparecer a necessidade, pare e leve ao dono.
- **P0-1:** `ot` nunca é concedido nem pré-marcado. **P0-2:** agente MCP e chave de API nunca recebem dado do n.ot (`semOt`). **P0-4:** todo dado de site passa por `sitesPermitidos`. Nenhum task abaixo pode afrouxar isso; os de segurança só apertam.
- **Toda checagem que vire `async` leva `await` em todo ponto de chamada** (um `await` esquecido numa recusa falha aberto). Cada correção do Lote 1 tem mutação: reverter a correção, ver o teste novo falhar, restaurar.
- **Nunca rode a suíte inteira do backend** (leva cerca de 20 min; é do `bash scripts/ci/gate.sh` na máquina de quem mergeia). Rode só os arquivos listados no passo de verificação de cada task. Frontend: `cd frontend && npx vitest run <arquivos>` e `npm run build`.
- **Higiene de commit:** `git add` só com os caminhos de **Files**; nunca `git add -A`; `git diff --cached --stat` mostra só esses caminhos antes de commitar.
- **Teste vermelho primeiro (TDD):** escreva o teste, rode, veja a falha com a mensagem esperada, só então corrija.
- **Frontend:** `data-action`, sem handler nem estilo inline novo, `escapeHTML` em dado do servidor, textos em português. **AGENTS.md sem acentos;** CHANGELOG e telas com acentos.
- Comandos: backend `npx vitest run <arquivos>`; tipos `npx tsc --noEmit`; contrato `npm run openapi` (só quando o schema de corpo mudar: Task 3 do Lote 1).
- **Fora deste plano:** decisões do dono (ver "Decisões que não são deste plano"), auditoria dos "Não conferido" da onda 1, material de ISO 42001 e CIS.

## Triagem

Legenda. **Classe:** SEG (segurança/P0), INT (integridade de dado), UX, TESTE (higiene de teste), DOC. **Esforço:** S (menos de 1 h), M (até meio dia), L (mais). **Rec.:** `L1` a `L3` = entra no lote; `dono` = decisão do dono; `drop` = descartar com motivo; `resolvido` = não existe mais no código.

### A. Itens que ainda existem (verificados)

| ID | Fonte | Descrição | Classe | Esf. | Verificação no código | Rec. |
|---|---|---|---|---|---|---|
| P-01 | Conhecido (dono: CORRIGIR); Codex P2 #1 pegou só `/org/config` | `ehComercial(user)` usa `user.org_direta` da SESSÃO. `platform_admin` tem sessão na `org_ness` e age numa direta por `X-Org-Id`: é tratado como comercial dessa direta (propostas, serviços, assessments e leads da direta). | SEG | S | `src/middleware/auth.ts:356` (`user.org_direta = leitura.orgDireta`, lido de `orgAChecar`, que é vazio para `platform_admin`); `src/helpers.ts:618`; usos: `propostas.ts:142`, `servicos.ts:61`, `assessments.ts:21,45`, `platform.ts:360,397`, `organizacao.ts:24`. `organizacao.ts:21,41` já usa `tipoDaOrg(orgId)` (corrigido no Codex #1); o resto não. | **L1 Task 1** |
| P-02 | Conhecido; entrada-n360 T3 ("flake"); onda 4 T8 | `test/security-mfa.test.js`: o `setTimeout(..., 50)` de `src/views/security.js` dispara depois do teardown do jsdom e lança `document is not defined`; reprovou uma rodada do portão. | TESTE | S | `frontend/src/views/security.js:78` e `:127`; `frontend/test/security-mfa.test.js` sem `useFakeTimers`. Mesmo padrão em `jornada.js`, `commercial.js`, `compliance.js` (5 ocorrências de `setTimeout(() => document...` em `src`). | **L2 Task 1** |
| P-03 | onda 3 T4 (minor) | `citaNomeOt` (a regra do texto seguro da ação criada do desvio, lida por quem não tem n.ot) compara sem normalizar hífen, espaço e pontuação: o ativo "RTU-Principal" não é pego por "RTU Principal" nem por "rtu.principal". É falso negativo = nome de ativo de OT vaza para quem não tem o módulo. | SEG | S | `src/services/ot-desvio-acao.ts:11,13` usa `normaliza` de `copiloto-ropa.ts:112` (só tira acento e caixa); a rota `ot.ts:1157`. | **L1 Task 2** |
| P-04 | onda 3 T4 (`assigned_to` livre, 200) | O campo `assigned_to` da ação criada do desvio não passa por `citaNomeOt`; é lido pelo núcleo por quem não tem n.ot. | SEG | S | `ot.ts:1157` confere só `d.titulo, d.descricao`; `schemas/ot.ts:161` aceita `livre(200)`. | **L1 Task 2** |
| P-05 | onda 3 (lista de menores) | `capaUpdateSchema.status` é `z.string()`: o guarda "quem criou a ação do desvio não a conclui" (e o do agente) só compara `=== 'Closed'`; enviar `'closed'` ou `'Closed '` grava um status que não é nenhum dos três e não passa pela recusa (e deixa `completed_at` nulo). | SEG/INT | S | `src/schemas/resources.ts:133`; `src/routes/capa.ts:26,27,40`. Os outros três caminhos de escrita já usam enum (`schemas/nucleo.ts:132,347`, `incidente-acoes.ts:10`, `ropa-abas.ts:66`). | **L1 Task 3** |
| P-06 | onda 1 (ABERTO: "corrida na transferência de projeto") | `transferirProjeto` confere "a direta não recebe projeto com conta de cliente" ANTES do batch; o `UPDATE projects` do batch não repete a condição. Uma conta de cliente criada entre a leitura e o batch entra numa direta. | INT | S | `src/services/transferencia-projeto.ts:42-45` (leitura) e `:61-63` (UPDATE sem a condição); `:96-100` já tem o ramo `'corrida'`. | **L1 Task 4** |
| P-07 | onda 3 T4 (testes não cobrem) | Rota `POST /desvios/:id/acao` com desvio já ligado a risco/incidente (`ot_referencias.acao_id` nulo) devolve 409 "Este desvio já está ligado a outro item": nenhum teste. | TESTE | S | `ot.ts:1151-1152`; `grep "ligado a outro item" test` vazio. | **L2 Task 2** |
| P-08 | onda 3 T4 (testes acoplados, reuso de `d3`) | Três testes reaproveitam o desvio `d3`; um falho derruba os seguintes por efeito colateral. | TESTE | S | `test/ot-desvio-acao.test.ts:89,92,98,103,106,107`. | **L2 Task 2** |
| P-09 | onda 3 T1 (sem teste p/ `platform_admin`) | `ot-trilha-oculta.test.ts` não cobre `platform_admin` (que vê as linhas `ot.%`: tem todos os módulos). | TESTE | S | `grep platform_admin test/ot-trilha-oculta.test.ts` vazio; regra em `ot-visibilidade.ts:10-11`. | **L2 Task 3** |
| P-10 | onda 3 T3 (testes) | O caso "de outro projeto 404" do `DELETE /ot/referencias/:id` nunca envia um DELETE de referência de outro projeto. | TESTE | S | `test/ot-referencias.test.ts:219-220` (título promete, corpo não faz). | **L2 Task 3** |
| P-11 | onda 3 T8 (teste de guarda ambíguo) | No teste "agente, chave de API e técnico são recusados" de `perguntas-padrao`, o técnico `u-tec2` não tem o privacy: o 403 pode vir do módulo, não do papel. | TESTE | S | `test/ot-fornecedores.test.ts:176` (`concederModulos(['u-tec2', AGENTE.userId], ['iso','ot'])`), `:196-201`. | **L2 Task 4** |
| P-12 | onda 3 T8 (botão envia `forn[0].id`) | "Gerar perguntas de OT" manda o id do PRIMEIRO fornecedor da lista; a rota é por projeto, o id só valida existência. Funciona, mas o rótulo sugere ação por fornecedor. | UX | S | `frontend/src/views/ot-fornecedores.js:33`. | L3 |
| P-13 | entrada-n360 T2 (minor) | Chaves de API abre já com o primeiro projeto da lista selecionado e "Nova chave" habilitado, sem escolha: dá para criar a chave no projeto errado sem ter visto qual. Só `platform_admin`. | UX/INT | S | `frontend/src/views/admin.js:559`. | L3 |
| P-14 | onda 4 (pendência docs) | `AGENTS.md` diz "botao Adicionar ao comite no Monitor"; o Monitor não existe mais como tela, o botão vive na Governança (`monitor.js`). | DOC | S | `AGENTS.md:620`; `frontend/src/views/monitor.js:331`. | L3 |
| P-15 | onda 4 T11 (minor) | Trilha do n.privacy: passo não feito cuja `tela` está fora de `TELAS_DO_PAINEL` não mostra nada (nem "Falta"), a linha fica muda. | UX | S | `frontend/src/views/painel.js:145` (ramo `: ''`). | L3 |
| P-16 | onda 4 T11 (minor) | Trilha vazia desenha caixa vazia; sem teste da ordem exibida nem das aspas. | UX/TESTE | S | `frontend/src/views/painel.js:141-146` (`trilha()` sem guarda de lista vazia). | L3 |
| P-17 | onda 4 T16 (minor) | Botão "Criar o primeiro projeto" desabilitado até carregar as organizações, sem teste. | TESTE | S | `frontend/src/views/organizacoes.js` (`__orgPrimeiroProjeto`); `frontend/test/onboarding-encadeado.test.js:204-217` testa só o clique. | L3 |
| P-18 | onda 4 T14 (minor) | Teste do teto do cliente usa organização sem `ot`: não distingue teto do projeto do teto da organização. | TESTE | M | `test/onboarding-rotas.test.ts:88-92`. | L3 |

### B. Já resolvidos (não existem mais; ficam registrados para não voltarem à fila)

| ID | Fonte | Descrição | Onde está a correção |
|---|---|---|---|
| R-01 | Conhecido | "Exportar" CSV de fornecedores e treinamentos (não é lacuna) | `grc.js:562,919` (`exportar` em `montarLista`); spec onda 4 linha 90, "RESOLVIDO (19/11/2026)" |
| R-02 | Codex P2 #1 | `/org/config` usava o tipo da sessão | `organizacao.ts:21,41` (`tipoDaOrg(orgId)`), commit `2761542` |
| R-03 | Codex P2 #2 | `proximo` do n.iso apontava fase concluída no legado | `commit a2099ac` (`services/programa.ts`) |
| R-04 | Codex P2 #3 / onda 3 T1 | "último movimento" da carteira contava `ot.%` por pessoa, não por projeto | `painel.ts:594-595`, `a79b318`, `test/carteira-ot-por-projeto.test.ts` |
| R-05 | onda 3 T2 | `sitesPermitidosJson` opcional em `criarReferencia`; `tipo` inválido ('constructor') dava 500; ativo em site removido referenciável; filtro de site sem refs de ativos | `ot-referencias.ts:10,25-26,61,71` (round 1 da T2) |
| R-06 | onda 3 T3 | `DELETE /ot/referencias/:id` não filtrava por site | `ot-referencias.ts:73` (`REF_NO_ESCOPO`) |
| R-07 | onda 2 (g) | Armadilha do parâmetro `ve` com padrão `false` | `services/requisitos.ts:133-217`: `ve: boolean` sem padrão em todas |
| R-08 | onda 1 ABERTO | SCIM reativando conta de cliente numa direta | `routes/scim.ts:211,277,330` (`MSG_DIRETA_SEM_CLIENTE`), commit `bdd65de` |
| R-09 | onda 3 | Migrações 0115 e 0116 "pendentes" | `migrations/README.md:781-787`: aplicadas 18/11/2026 13:00:13 UTC, com evidência medida |
| R-10 | entrada T4 | Decidir pedido não invalidava o cache do Início (60 s) | `painel.js:443` (`invalidarInicio`), `aprovacao-lote.js:143`, `meus-pedidos.js:159` |
| R-11 | entrada T5 | E2E `ropa-abas` intermitente por corrida de login | `frontend/e2e/shell.js:16` (`aguardarBoot`) |
| R-12 | entrada limpeza | "Trilha pede o projeto" sem confirmar | Texto não existe mais no `AGENTS.md` |
| R-13 | onda 4 T2 | Textos "no Monitor" velhos, CSS `.monitor-*` e `.roadmap-amostra` mortos | só sobra um comentário em `bancada.js:116`; `.roadmap-amostra` agora é da grade (`style.css:2212-2216`) |
| R-14 | onda 4 T4 | `jornadaAba` não zerada ao navegar | `router.js:52` |
| R-15 | onda 4 T17 / final review | `destinoDoAviso` não resolvia alias; aviso `certificado` | `produto.js:123-128`, `8d4b4a5` |
| R-16 | onda 4 T6 | `etapasDoOt` sem JSDoc de pré-filtro | `services/programa.ts:54-57` |
| R-17 | onda 4 T2/T17 | `contrato-tela-api` falhando em `ot-fornecedores.js`; espaço no fim de `erro-de-carga.test.js` | `dc59e26` |
| R-18 | onda 4 T15/T16 | "Pular" e "Continuar sem designar" sem teste; convidado sem designação silencioso | testes e aviso do passo 6 (T16 carry), `8f8d238` |

### C. Descartados (com motivo) e decisões do dono

| ID | Fonte | Descrição | Rec. e motivo |
|---|---|---|---|
| D-01 | onda 3 T4 | Falso positivo por substring em `citaNomeOt` (sem fronteira de palavra) | **drop.** Fronteira de palavra TROCARIA bloqueio indevido por vazamento ("agatas" não pegaria "Ágata"). Regra de vazamento falha para o lado seguro. |
| D-02 | onda 3 | `TETO_LEITURA_OT` (20000) limita a leitura de nomes em `citaNomeOt` | **drop.** Passar de 20000 nomes ativos num projeto não ocorre (inventário por site); `ot-desvio-acao.ts:12`. Se ocorrer, o teto de leitura de todo o n.ot já é o problema. |
| D-03 | onda 3 T2 | `sa` joinado só por id em `lerReferencias` | **drop.** A FK composta `(id, project_id)` já garante o projeto; `ot-referencias.ts:56-61`. |
| D-04 | onda 3 | Contrato MCP das referências com `obrigatorios: []` | **drop.** O schema é um `refine` ("um alvo do núcleo e um de OT"), não campo obrigatório; `contrato-gerado.ts:106`. |
| D-05 | onda 3 T8 | `MAX(ordem)` com corrida ao semear perguntas | **drop.** Ids determinísticos + `INSERT OR IGNORE` (`fornecedor-modelos.ts:183`); pior caso é `ordem` repetida. |
| D-06 | onda 3 T8 | Sem teste de "editor restrito 404" em `perguntas-padrao` | **drop.** Cenário inalcançável: só `org_user` é restrito por site (`ot-inventario.ts:66-72`) e ele não edita (403 no guarda do topo). |
| D-07 | onda 3 T4 | Releitura após perder a corrida sem teste de rota | **drop.** O `criarAcaoDoDesvio` já tem teste de corrida no serviço (`ot-desvio-acao.test.ts:142-151`); o ramo da rota é uma leitura de duas linhas. |
| D-08 | onda 1 ABERTO | Break-glass do `platform_admin` criar conta de cliente em direta | **drop.** É decisão registrada (spec onda 1, "Rulings", 1º item), não achado. |
| D-09 | onda 1 ABERTO | Convite de stakeholder na direta | **drop.** Decidido: permitido, travado por `remediacao-gaps.test.ts`. |
| D-10 | onda 1 "Não conferido" | Termo de uso, SCIM, assinatura da análise crítica, `confirmarAvaliacao` completa, telas `ot-*.js` (49 linhas com `org_admin`) | **drop deste plano.** Não é achado, é dívida de auditoria sem alvo no código; pedir auditoria própria (skill security-audit) se o dono quiser. |
| D-11 | entrada T2/T3 | Seletor sem marca "último usado"; `auth.ts:138` e `organizacoes.ts:56` "sem conferência do formato do id" | **drop.** Cosmético; o segundo não se reproduz (as linhas hoje são lista de MFA e INSERT com `id` derivado do slug validado, e o revisor não achou id livre do cliente). |
| D-12 | entrada T5 | Comercial sem `COMERCIAL_ATIVO` vê "sem acesso a um projeto" | **drop.** Ruling aceito pelo dono. |
| D-13 | entrada | `ponto-de-partida.js` carregado em `main.js` sem tela que o chame | **drop.** "O dono decide onde reexibir" (ledger); `AGENTS.md` já registra. |
| D-14 | onda 4 T4 | Foco da aba da Jornada depende de render síncrono | **drop.** Sem falha observada (`jornada.js:20`). |
| D-15 | onda 4 T6/T7 | Fase `skipped` do legado conta feita antes da materialização e não depois; `proximo` com `ORDER BY nome` muda desempate | **drop.** Sem efeito visível e sem expectativa definida (`programa.ts:30`); desempate é cosmético. |
| D-16 | onda 4 T10 | Passo "cobertura" do n.privacy fica falso com catálogo LGPD não carregado (desconhecido vira "não feito") | **drop.** Limite documentado na skill e na spec (onda 4, linha 94); consertar exige campo novo no payload. |
| D-17 | onda 4 T14 | 201 de equipe omite `client_project_id` | **drop.** Cosmético; o teste fixou o comportamento observado (`users.ts:265`). |
| D-18 | onda 4 T16 | Linhas de cliente restantes ainda enviam `POST /users` após fechar o assistente | **drop.** É a intenção da pessoa; nada é escrito na tela. |
| D-19 | onda 4 T7 | Mediana do teste de desempenho do painel não registrada | **drop.** O teste é um limite (< 300 ms), verde. |
| O-01 | onda 3 T8 | As 4 perguntas de OT entram em TODO questionário de fornecedor do projeto (`tipo` NULL) | **dono.** Decisão de produto (restringir a fornecedores de OT?). |
| O-02 | onda 2 (e) | Ids grossos de 27701:2025 (`A.1.1`...) sem linha no catálogo | **dono.** Conteúdo normativo. |
| O-03 | onda 2 | ISO 42001 e CIS v8.1 (material e licença) | **dono.** |
| O-04 | onda 2 (d) | `LIMITE_PREVIA` = 100 só é seguro no plano pago do D1; plano da conta não conferido | **dono.** Conferir o plano; se gratuito, `LIMITE_PREVIA = 20` (`requisitos.ts:403`). |
| O-05 | onda 2 "Não conferido" | Se `/semear` foi chamado além da contagem de `requisitos` | **dono.** Leitura de produção. |

### Contagem

- **Total triado: 60 linhas** = 18 existem (P-01 a P-18) + 18 já resolvidos (R-01 a R-18) + 19 descartados (D-01 a D-19) + 5 do dono (O-01 a O-05). Quando o mesmo achado aparece em duas fontes (ledger e spec), é uma linha só.
- **Lote 1 (segurança e integridade): 5 itens** (P-01, P-03, P-04, P-05, P-06) em 4 tasks de código + 1 de docs. **Lote 2 (higiene de teste): 6 itens** (P-02, P-07 a P-11) em 4 tasks, sem código de produção. **Lote 3 (UX e docs): 7 itens** (P-12 a P-18), lista curta.

## Decisões que não são deste plano

O-01 a O-05 acima. Nenhuma trava os lotes; os lotes não tocam nelas.

## Preflight (antes do Lote 1 e ao retomar)

- [ ] Na cópia de trabalho do executor, `git status --short && git log --oneline -3`: HEAD contém `c0badf9`. (Há um arquivo não rastreado `PR` na raiz: não é deste plano, não o inclua em commit.)
- [ ] `ls node_modules/.bin/vitest frontend/node_modules/.bin/vitest`; se faltar: `npm ci` e `cd frontend && npm ci`.
- [ ] Reconferir cada arquivo:linha do task antes de editar (`grep -n`); o plano foi escrito sobre `6cc6f30`.

## File Structure

- Lote 1: `src/middleware/auth.ts`, `src/helpers.ts` (comentário), `src/services/ot-desvio-acao.ts`, `src/routes/ot.ts`, `src/schemas/resources.ts`, `src/services/transferencia-projeto.ts`; testes novos `test/comercial-org-ativa.test.ts`; testes ampliados `test/ot-desvio-acao.test.ts`, `test/transferencia-projeto.test.ts`; docs `CHANGELOG.md`, `AGENTS.md`, `docs/openapi.json` e `mcp-server-niso/src/contrato-gerado.ts` (só se `npm run openapi` mudar algo).
- Lote 2: `frontend/test/security-mfa.test.js`, `test/ot-desvio-acao.test.ts`, `test/ot-trilha-oculta.test.ts`, `test/ot-referencias.test.ts`, `test/ot-fornecedores.test.ts`. Nenhum arquivo de `src/`.

---

# LOTE 1: segurança e integridade

Ordem: Task 1 (maior risco, independente), 2, 3, 4, depois 5 (docs). Um commit por task.

### Task 1: `ehComercial` segue a organização ATIVA do `platform_admin` (P-01)

**Contexto:** `authMiddleware` põe `user.org_direta` lendo o tipo da organização da SESSÃO (`orgAChecar`, que `orgDaEquipeAChecar` devolve vazio para `platform_admin`; ver `src/middleware/auth.ts:340-356`). `resolverOrg` (`src/services/organizacao.ts:42-50`) é quem escolhe a organização ativa do `platform_admin` pelo cabeçalho `X-Org-Id`. Resultado: com `X-Org-Id: org_d` (direta), `ehComercial` ainda é verdadeiro e as rotas `propostas`, `servicos`, `assessments` (preço) e os contadores de leads do `platform.ts` respondem como se a direta tivesse área comercial (decisão 11 da onda 1 diz que não tem). A correção de raiz é uma só, no middleware: os 7 pontos de uso leem `user.org_direta`.

**Files:**
- Modify: `src/middleware/auth.ts:356`, comentário em `src/helpers.ts:617`
- Create: `test/comercial-org-ativa.test.ts`

**Interfaces:**
- Consumes: `tipoDaOrg(db, orgId)` (já importada em `auth.ts:12`), `ehComercial` (`helpers.ts:618`, não muda), `X-Org-Id` (`organizacao.ts:42-50`).
- Produces: `user.org_direta` passa a significar "a organização ATIVA da requisição é direta" (sessão, ou `X-Org-Id` quando o papel é `platform_admin`). Nenhuma assinatura muda.

- [ ] **Step 1: Escrever o teste que falha** — `test/comercial-org-ativa.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

// platform_admin age na organização do X-Org-Id (a sessão dele é da org_ness): a área comercial segue o tipo da organização ATIVA
// (decisão 11: a direta não tem área comercial). Antes, `ehComercial` lia o tipo da sessão e tratava a direta como consultoria.
const chamar = (caminho: string, headers: Record<string, string>) =>
  app.fetch(new Request('http://localhost' + caminho, { headers }), workerEnv() as any);
let pa: Record<string, string>, adminCons: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  const h = await hashPassword('Senha-forte-123!');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO organizations (id, name, slug, max_projects, max_users, tipo) VALUES ('org_d','Direta','direta-d',10,10,'direta'), ('org_c','Consultoria','cons-c',10,10,'consultoria')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id, ativo) VALUES
      ('u-pa','pa@ness.lat',?,'PA','platform_admin','org_ness',1), ('u-ca','ca@cons.lat',?,'CA','consultoria_admin','org_c',1)`).bind(h, h),
    env.DB.prepare(`INSERT INTO leads (id, company_name, status, org_id) VALUES ('l-d','Prospect D','New','org_d'), ('l-c','Prospect C','New','org_c')`),
  ]);
  pa = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  adminCons = await sessionFor({ id: 'u-ca', email: 'ca@cons.lat', role: 'consultoria_admin', org_id: 'org_c' });
});

describe('platform_admin com X-Org-Id: a área comercial segue o tipo da organização ativa', () => {
  for (const rota of ['/api/v1/propostas', '/api/v1/servicos']) {
    it(`${rota}: direta 403; consultoria 200; sem cabeçalho (org_ness) 200; organização inexistente 403`, async () => {
      expect((await chamar(rota, { ...pa, 'X-Org-Id': 'org_d' })).status).toBe(403);
      expect((await chamar(rota, { ...pa, 'X-Org-Id': 'org_c' })).status).toBe(200);
      expect((await chamar(rota, pa)).status).toBe(200);
      expect((await chamar(rota, { ...pa, 'X-Org-Id': 'org_nao_existe' })).status).toBe(403);
    });
  }

  it('dashboard: o lead da direta não é contado para o platform_admin nela; o da consultoria é', async () => {
    const leads = async (org: string) => (await (await chamar('/api/v1/dashboard', { ...pa, 'X-Org-Id': org })).json<{ leads: number }>()).leads;
    expect(await leads('org_d')).toBe(0);
    expect(await leads('org_c')).toBe(1);
  });

  it('o cabeçalho de quem não é platform_admin continua ignorado (o da consultoria segue comercial, mesmo apontando a direta)', async () => {
    expect((await chamar('/api/v1/propostas', { ...adminCons, 'X-Org-Id': 'org_d' })).status).toBe(200);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run test/comercial-org-ativa.test.ts`. Esperado: falham `propostas` e `servicos` ("expected 200 to be 403", direta) e o dashboard (`expected 1 to be 0`); os casos de consultoria, sem cabeçalho e do `consultoria_admin` já passam.

- [ ] **Step 3: Implementar** — em `src/middleware/auth.ts`, logo depois de `user.org_direta = leitura.orgDireta;` (linha 356):

```ts
  // O platform_admin age na organização do X-Org-Id (a da sessão é a org_ness): o tipo que vale é o da ATIVA. Organização inexistente
  // dá `null` (não direta); quem a recusa é `resolverOrg`. Uma consulta, só para platform_admin que manda o cabeçalho.
  const orgAtiva = user.role === 'platform_admin' ? c.req.header('X-Org-Id')?.trim() : '';
  if (orgAtiva) user.org_direta = (await tipoDaOrg(c.env.DB, orgAtiva)) === 'direta';
```

E o comentário de `src/helpers.ts:617` passa a: `// Organização direta (decisão 11) não tem área comercial: `org_direta` é posto pelo authMiddleware (tipo da organização ATIVA, lido no banco: a da sessão, ou o X-Org-Id do platform_admin).`

- [ ] **Step 4: Verde e mutação.** `npx vitest run test/comercial-org-ativa.test.ts` (3 casos verdes). Mutação: apague as duas linhas novas, o teste volta a falhar; restaure.

- [ ] **Step 5: Regressão dos arquivos afetados** (nenhum é a suíte inteira): `npx vitest run test/comercial-acesso.test.ts test/comercial-desligado.test.ts test/agente-comercial.test.ts test/organizacao-direta.test.ts test/organizacao.test.ts test/remediacao-gaps.test.ts test/org-contexto.test.ts test/assessments.test.ts test/contrato-isolamento-org.test.ts test/contrato-isolamento-topo.test.ts test/sso-org.test.ts` e `npx tsc --noEmit`. Esperado: tudo verde. Se algum teste existente esperava `platform_admin` + `X-Org-Id` de direta com 200 nas rotas comerciais, ele codifica o defeito: ajuste a asserção para 403 e registre no commit (não ajuste nenhum outro).
- Nota de escopo (não corrigir aqui): `assessments` com `platform_admin` numa direta continua acessível pelo ramo `somenteNess` (o `platform_admin` é da ness.), mas `semPreco` (`assessments.ts:45`) agora tira as colunas `pricing_*`, que é o que a decisão 11 pede. O agente (`agente.ts:214`, `servidor.ts:429`) lê `org_direta` da concessão e não usa `X-Org-Id`: inalterado.

- [ ] **Step 6: Commit:**

```bash
git add src/middleware/auth.ts src/helpers.ts test/comercial-org-ativa.test.ts
git diff --cached --stat   # só esses 3
git commit -m "fix(org): ehComercial segue a organização ativa do platform_admin (X-Org-Id de direta não tem área comercial)"
```

---

### Task 2: texto seguro da ação do desvio: pontuação e responsável (P-03, P-04)

**Contexto:** `citaNomeOt` (`src/services/ot-desvio-acao.ts:9-16`) impede que o título e a descrição da ação (lida no núcleo por quem não tem o n.ot) citem nome de ativo, zona ou site. Dois furos: (a) `normaliza` só tira acento e caixa, então "RTU Principal" e "rtu.principal" não casam com o ativo "RTU-Principal"; (b) `assigned_to` (texto livre, 200) nunca é conferido. A comparação por substring continua (D-01: é o lado seguro).

**Files:**
- Modify: `src/services/ot-desvio-acao.ts:9-16`, `src/routes/ot.ts:1157`
- Test: `test/ot-desvio-acao.test.ts` (novo `it` no `describe('POST /desvios/:id/acao')`, depois da linha 122)

**Interfaces:**
- Consumes: `normaliza` (`copiloto-ropa.ts:112`), `TETO_LEITURA_OT`.
- Produces: `citaNomeOt(db, projectId, ...textos)` mesma assinatura; compara sem pontuação e sem espaço. Nomes com menos de 3 caracteres alfanuméricos continuam ignorados.

- [ ] **Step 1: Teste que falha** — em `test/ot-desvio-acao.test.ts`, depois do teste "nome de ativo, zona ou site...":

```ts
  it('hífen, espaço e pontuação não escondem o nome (RTU-Principal); o responsável também é conferido', async () => {
    await desvio('d4b');
    for (const titulo of ['Revisar o RTU Principal do pátio', 'Revisar rtu.principal', 'Revisar RTU  -  Principal', 'Segregar a zona_controle']) {
      const r = await acao(cons, 'd4b', { ...ok, titulo });
      expect(r.status, titulo).toBe(400);
      expect((await r.json<{ error: string }>()).error).toBe('O texto não pode citar o nome de ativos, zonas ou sites do projeto.');
    }
    expect((await acao(cons, 'd4b', { ...ok, assigned_to: 'Equipe da Subestação Ágata' })).status).toBe(400);
    expect(await n(`SELECT count(*) n FROM ot_referencias WHERE ot_desvio_id = 'd4b'`)).toBe(0);
    expect((await acao(cons, 'd4b', { ...ok, titulo: 'Texto inócuo sobre processo' })).status).toBe(201); // o nome "ab" (2 letras) e o texto comum seguem passando
  });
```

- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run test/ot-desvio-acao.test.ts -t "hífen, espaço"`. Esperado: `expected 201 to be 400` para "Revisar o RTU Principal do pátio".

- [ ] **Step 3: Implementar** — `src/services/ot-desvio-acao.ts`:

```ts
// Sem acento, sem caixa, e SEM separador: "RTU-Principal", "RTU Principal" e "rtu.principal" são o mesmo nome. Substring de propósito: o erro seguro é bloquear.
const compacta = (t: string) => normaliza(t).replace(/[^\p{L}\p{N}]+/gu, '');

/** Texto cita o nome de ativo/zona/site ativo do projeto? Nomes com menos de 3 letras ou dígitos não contam. */
export async function citaNomeOt(db: D1Database, projectId: string, ...textos: (string | undefined)[]): Promise<boolean> {
  const texto = compacta(textos.filter(Boolean).join(' | '));
  for (const t of ['ot_ativos', 'ot_zonas', 'ot_sites']) {
    const { results } = await db.prepare(`SELECT nome FROM ${t} WHERE project_id = ? AND status = 'ativo' LIMIT ${TETO_LEITURA_OT}`).bind(projectId).all<{ nome: string }>();
    if (results.some((r) => { const n = compacta(r.nome); return n.length >= 3 && texto.includes(n); })) return true;
  }
  return false;
}
```

E `src/routes/ot.ts:1157`: `if (await citaNomeOt(db, projectId, d.titulo, d.descricao, d.assigned_to)) return c.json({ error: MSG_NOME_OT }, 400);`

- [ ] **Step 4: Verde e mutação.** `npx vitest run test/ot-desvio-acao.test.ts`. Mutações (restaurar cada uma): trocar `compacta` por `normaliza` falha o `it` novo; tirar `d.assigned_to` da chamada falha a linha do responsável.

- [ ] **Step 5: Verificação:** `npx vitest run test/ot-desvio-acao.test.ts test/ot-referencias.test.ts test/contrato-isolamento-org.test.ts && npx tsc --noEmit`.

- [ ] **Step 6: Commit:**

```bash
git add src/services/ot-desvio-acao.ts src/routes/ot.ts test/ot-desvio-acao.test.ts
git commit -m "fix(ot): o texto da ação do desvio não esconde nome de ativo, zona ou site por hífen, espaço ou no responsável"
```

---

### Task 3: status da CAPA só aceita os três valores (P-05)

**Contexto:** `PUT /api/v1/capa/:id` valida `status` como `z.string()` (`src/schemas/resources.ts:133`). As recusas "agente não conclui" e "criador do desvio não conclui" (`capa.ts:26-27`) comparam `=== 'Closed'`, então `'closed'` as contorna e grava um status que nenhuma tela entende. O schema de criação já é enum (`nucleo.ts:132`).

**Files:**
- Modify: `src/schemas/resources.ts:133`
- Test: `test/ot-desvio-acao.test.ts` (no `describe('concluir a ação do desvio')`, depois do teste da linha 167)
- Regenerar: `docs/openapi.json`, `mcp-server-niso/src/contrato-gerado.ts` (`capaUpdateSchema` está em `src/openapi.ts:212`)

**Interfaces:** `capaUpdateSchema.status` passa a `z.enum(['Open', 'In Progress', 'Closed'])`; 400 para qualquer outro valor.

- [ ] **Step 1: Conferir o que os testes e telas enviam hoje** (para não quebrar legítimo): `grep -rn "'/api/v1/capa/" test | grep -n PUT`; `grep -n "status" frontend/src/views/grc.js | sed -n 1,10p` (as telas só mandam os três: `grc.js:1427`).

- [ ] **Step 2: Teste que falha** (novo `it`, usa `nova`, `capa`, `status` já definidos no describe):

```ts
  it('status fora de Open, In Progress e Closed: 400 e a ação não muda (não se contorna a recusa com "closed")', async () => {
    const id = await nova('d-st');
    for (const s of ['closed', 'CLOSED', 'Closed ', 'Done', '']) {
      expect((await capa(cons, id, { status: s })).status, JSON.stringify(s)).toBe(400);
    }
    expect(await status(id)).toBe('Open');
    expect((await capa(cons, id, { status: 'Closed' })).status).toBe(403); // o criador segue recusado com o valor certo
  });
```

- [ ] **Step 3: Ver falhar:** `npx vitest run test/ot-desvio-acao.test.ts -t "status fora"`. Esperado: `expected 200 to be 400` (para `'closed'`).

- [ ] **Step 4: Implementar** — `src/schemas/resources.ts:133`: `status: z.enum(['Open', 'In Progress', 'Closed'], { message: 'Status inválido' }),`. (Se a versão do zod do repo usar `errorMap`/`required_error`, siga o padrão de `nucleo.ts:132`: `z.enum([...])` sem mensagem também serve.)

- [ ] **Step 5: Verde, mutação, contrato.** `npx vitest run test/ot-desvio-acao.test.ts test/capa-responsavel-servidor.test.ts test/ropa-capa-responsavel.test.ts test/validacao-corpo.test.ts test/idor-tenant.test.ts test/refs-entre-projetos.test.ts test/openapi.test.ts`. Mutação: voltar para `z.string()` falha o `it` novo. Depois `npm run openapi` e `git diff --stat docs/openapi.json mcp-server-niso/src/contrato-gerado.ts`: se mudou, o diff deve ser só o enum de `status` do `PUT /capa/{id}`; rode `npx vitest run test/contrato-mcp.test.ts test/openapi.test.ts` de novo. Se algum teste legado enviava outro status, ele codificava o defeito: corrija só aquela asserção e cite no commit.

- [ ] **Step 6: Commit:**

```bash
git add src/schemas/resources.ts test/ot-desvio-acao.test.ts docs/openapi.json mcp-server-niso/src/contrato-gerado.ts
git commit -m "fix(capa): PUT /capa só aceita Open, In Progress e Closed (a recusa de quem criou a ação do desvio não se contorna com 'closed')"
```

---

### Task 4: transferência para direta fecha a janela da conta de cliente (P-06)

**Contexto:** `transferirProjeto` confere "a direta não recebe projeto com conta de cliente" com um `SELECT` ANTES do batch (`transferencia-projeto.ts:42-45`); o `UPDATE projects` do batch (`:61-63`) só repete "destino ativo". Uma conta de cliente criada no meio entra numa direta. Mover a condição para dentro do UPDATE a torna atômica; o ramo `'corrida'` (`:96-100`) já trata `changes = 0`.

**Files:**
- Modify: `src/services/transferencia-projeto.ts:61-63`
- Test: `test/transferencia-projeto.test.ts` (novo `describe` no fim; usa `semearProjeto`, `env`, `applySchema`)

**Interfaces:** `transferirProjeto(db, { projetoId, orgDestinoId, motivo, atorEmail, ip })` (assinatura inalterada). Novo comportamento: se uma conta de cliente aparecer entre a leitura e o batch, nada é movido e o resultado é `{ ok: false, motivo: 'corrida' }`.

- [ ] **Step 1: Teste que falha** — em `test/transferencia-projeto.test.ts`:

```ts
describe('janela entre a conferência e o batch (destino direta)', () => {
  it('conta de cliente que nasce depois da conferência: nada é movido (corrida), nem o projeto nem as concessões', async () => {
    await semearProjeto('p-janela');
    await env.DB.prepare(`INSERT OR IGNORE INTO organizations (id, name, slug, max_projects, max_users, tipo) VALUES ('org_dj','Direta J','direta-j',5,5,'direta')`).run();
    // o SELECT de conferência (primeira consulta a `users`) enxerga "sem clientes"; a conta nasce em seguida, antes do batch
    const ctx = new Proxy(env.DB, {
      get(alvo, k) {
        const v = (alvo as any)[k];
        if (k !== 'prepare') return typeof v === 'function' ? v.bind(alvo) : v;
        return (sql: string) => {
          if (!sql.trimStart().startsWith('SELECT 1 FROM users WHERE client_project_id')) return v.call(alvo, sql);
          return { bind: () => ({ first: async () => {
            await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-janela','janela@cliente.lat','x','J','org_user','p-janela')`).run();
            return null;
          } }) };
        };
      },
    }) as unknown as D1Database;
    const r = await transferirProjeto(ctx, { projetoId: 'p-janela', orgDestinoId: 'org_dj', motivo: MOTIVO, atorEmail: 'pa@ness.lat', ip: '1.1.1.1' } as any);
    expect(r).toEqual({ ok: false, motivo: 'corrida' });
    expect((await um('SELECT org_id FROM projects WHERE id = ?', 'p-janela')).org_id).toBe('org_ness');
    expect((await um(`SELECT count(*) n FROM agente_concessoes WHERE project_id = 'p-janela' AND revogado_em IS NULL`)).n).toBeGreaterThan(0); // nada revogado
  });
});
```

- [ ] **Step 2: Ver falhar:** `npx vitest run test/transferencia-projeto.test.ts -t "janela"`. Esperado: `r` é `{ ok: true, ... }` e o projeto foi movido para `org_dj`. (Se `EntradaTransferencia` tiver outro nome de campo, ajuste ao tipo exportado em `transferencia-projeto.ts`; o `as any` é só para o `ip`/campos opcionais.)

- [ ] **Step 3: Implementar** — o `UPDATE` do batch passa a:

```ts
    db.prepare(`UPDATE projects SET org_id = ? WHERE id = ? AND org_id = ?
        AND EXISTS (SELECT 1 FROM organizations WHERE id = ? AND status = 'Active')
        AND NOT EXISTS (SELECT 1 FROM organizations d WHERE d.id = ? AND d.tipo = 'direta'
          AND EXISTS (SELECT 1 FROM users WHERE client_project_id = ? AND role IN ('org_admin', 'org_user', 'client')))`)
      .bind(e.orgDestinoId, e.projetoId, origem, e.orgDestinoId, e.orgDestinoId, e.projetoId),
```

O resto do batch já depende de `changes() > 0` (auditoria) e `DESTA` (as demais escritas), então nada mais é movido nem revogado quando o UPDATE não age.

- [ ] **Step 4: Verde e mutação.** `npx vitest run test/transferencia-projeto.test.ts` (todo o arquivo). Mutação: tirar o `NOT EXISTS` novo falha o `it` novo.

- [ ] **Step 5: Verificação:** `npx vitest run test/transferencia-projeto.test.ts test/organizacao-direta.test.ts test/remediacao-gaps.test.ts test/contrato-isolamento-org.test.ts && npx tsc --noEmit`.

- [ ] **Step 6: Commit:**

```bash
git add src/services/transferencia-projeto.ts test/transferencia-projeto.test.ts
git commit -m "fix(org): a transferência para direta confere as contas de cliente dentro do UPDATE (sem janela entre a leitura e o batch)"
```

---

### Task 5: docs do Lote 1

**Files:** `CHANGELOG.md` (seção "[Não publicado]", com acentos), `AGENTS.md` (sem acentos), specs `docs/superpowers/specs/2026-11-16-onda1-organizacao-direta-design.md` ("Rulings da execução").

- [ ] **Step 1:** CHANGELOG, uma linha por task (1: área comercial segue a organização ativa do `platform_admin`; 2: texto seguro da ação do desvio; 3: status da CAPA; 4: janela da transferência).
- [ ] **Step 2:** `AGENTS.md`: na regra da direta/`ehComercial` (procure `org_direta`), uma frase: "`org_direta` e o tipo da organizacao ATIVA (a da sessao, ou o `X-Org-Id` do `platform_admin`)"; na regra do texto seguro (`citaNomeOt`), acrescentar "sem pontuacao nem espaco; o responsavel tambem e conferido".
- [ ] **Step 3:** Spec da onda 1: no item ABERTO de menores adiados, marcar "corrida na transferência de projeto" como **RESOLVIDO** (data e este plano); manter abertos só o break-glass (decisão registrada) e dizer que a reativação por SCIM já está resolvida (`scim.ts:277,330`).
- [ ] **Step 4:** `git add CHANGELOG.md AGENTS.md docs/superpowers/specs/2026-11-16-onda1-organizacao-direta-design.md && git commit -m "docs: pontos menores do lote 1 (ehComercial, texto seguro, status da CAPA, transferência)"`.

**Verificação do lote 1 (arquivos, nunca a suíte inteira):** `npx vitest run test/comercial-org-ativa.test.ts test/comercial-acesso.test.ts test/comercial-desligado.test.ts test/agente-comercial.test.ts test/organizacao-direta.test.ts test/remediacao-gaps.test.ts test/ot-desvio-acao.test.ts test/ot-referencias.test.ts test/transferencia-projeto.test.ts test/capa-responsavel-servidor.test.ts test/contrato-isolamento-org.test.ts test/contrato-isolamento-topo.test.ts test/openapi.test.ts && npx tsc --noEmit`. `test/onda2-numeros.test.ts` não é tocado: `git diff --stat c4c7039 -- test/onda2-numeros.test.ts` vazio. O portão (`bash scripts/ci/gate.sh`) é de quem mergeia.

---

# LOTE 2: higiene de teste (sem código de produção)

Regra do lote: nenhum arquivo de `src/` ou `frontend/src/` muda. Se um teste novo falhar por defeito real, pare e abra o achado (não corrija no lote).

### Task 1: o timer do foco no `security-mfa` (P-02, o flake)

**Contexto:** `openSecurityModal` e `doMfaSetup` agendam `setTimeout(() => document.getElementById(...)?.focus(), 50)` (`frontend/src/views/security.js:78,127`). O teste termina antes dos 50 ms; o ambiente jsdom é destruído e o timer dispara com `document` indefinido: `ReferenceError: document is not defined` como erro não tratado, que reprovou uma rodada do portão. Correção só no teste: relógio falso para `setTimeout` e `clearTimeout`, limpeza a cada teste, e um teste que de fato exerce o foco.

**Files:** Modify `frontend/test/security-mfa.test.js`.

**Interfaces:** `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` (só esses dois: o `blob.text()` de `baixarCodigosMfa` e as promises seguem reais).

- [ ] **Step 1: Reproduzir** (opcional, determinístico): `cd frontend && npx vitest run test/security-mfa.test.js --repeat 20`. Quando o flake aparecer, a saída traz `document is not defined` em `Unhandled Errors`. Se não aparecer, o teste de foco do Step 2 ainda falha por ausência de relógio falso, então o vermelho é garantido.

- [ ] **Step 2: Teste que falha** — acrescente ao fim do `describe('ativação')` (ele já tem `ateOCodigo()`):

```js
  it('o foco vai para o campo do código depois de 50 ms (timer controlado pelo teste, nada pendente depois dele)', async () => {
    await ateOCodigo();
    expect(document.activeElement).not.toBe($('mfa-codigo'));
    vi.advanceTimersByTime(50);
    expect(document.activeElement).toBe($('mfa-codigo'));
  });
```

Rode `cd frontend && npx vitest run test/security-mfa.test.js -t "o foco vai"`: falha (`vi.advanceTimersByTime` sem relógio falso avisa que os timers não são falsos).

- [ ] **Step 3: Implementar** — no topo do arquivo, ajuste o import e o `beforeEach`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
...
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); // o foco do modal agenda 50 ms: sem relógio falso ele dispara depois do teardown
  apiMock.mockReset();
  document.body.innerHTML = MODAL;
  window.doLogout = vi.fn();
  S.user = { email: 'ana@exemplo.test' };
});

afterEach(() => {
  vi.clearAllTimers(); // timer pendente morre aqui, não depois do fim do ambiente
  vi.useRealTimers();
});
```

- [ ] **Step 4: Verde e estabilidade.** `cd frontend && npx vitest run test/security-mfa.test.js --repeat 50` (nenhum `Unhandled Errors`); depois `npx vitest run test/security-mfa.test.js test/globals-shell.test.js` e `npm run build`. Mutação: remova o `afterEach` e rode `--repeat 20`: o foco pendente do teste anterior pode atingir o seguinte (o teste de foco sozinho deixa de ser determinístico). Restaure.

- [ ] **Step 5: Mesma varredura nos outros três arquivos com o padrão** (só diagnóstico, sem editar produção): `grep -rn "setTimeout(() => document" frontend/src/views/jornada.js frontend/src/views/commercial.js frontend/src/views/compliance.js`; para cada, `grep -ln "<view>" frontend/test/*.test.js` e rode esses testes com `--repeat 10`. Se algum mostrar o mesmo erro, aplique o mesmo `beforeEach/afterEach` ao teste dele neste task (um commit só).

- [ ] **Step 6: Commit:**

```bash
git add frontend/test/security-mfa.test.js
git commit -m "test(security): relógio falso no foco do modal de MFA (acaba o 'document is not defined' depois do teardown)"
```

### Task 2: `POST /desvios/:id/acao`: desvio ligado a outro item e testes desacoplados (P-07, P-08)

**Files:** Modify `test/ot-desvio-acao.test.ts`.

- [ ] **Step 1: Teste novo** (no `describe('POST /desvios/:id/acao')`; usa `desvio`, `acao`, `cons`, `run`, `n`, `ok`):

```ts
  it('desvio já ligado a um risco: 409 "ligado a outro item", sem ação nova e a referência de risco intacta', async () => {
    await desvio('d-risco');
    await run(`INSERT INTO risks (id, project_id, asset, threat) VALUES ('r-d', 'proj-a', 'a', 't') ON CONFLICT DO NOTHING`);
    await run(`INSERT INTO ot_referencias (id, project_id, risk_id, ot_site_id, ot_desvio_id, criado_por) VALUES ('ref-risco', 'proj-a', 'r-d', 's1', 'd-risco', 'u')`);
    const antes = await n(`SELECT count(*) n FROM corrective_actions`);
    const r = await acao(cons, 'd-risco', ok);
    expect(r.status).toBe(409);
    expect((await r.json<{ error: string }>()).error).toBe('Este desvio já está ligado a outro item.');
    expect(await n(`SELECT count(*) n FROM corrective_actions`)).toBe(antes);
    expect(await n(`SELECT count(*) n FROM ot_referencias WHERE ot_desvio_id = 'd-risco'`)).toBe(1);
  });
```

Rode `npx vitest run test/ot-desvio-acao.test.ts -t "ligado a um risco"`: já passa (cobre comportamento existente; é o objetivo). Mutação para provar que pega: em `ot.ts:1152` troque o 409 por `c.json({ ok: true, ... })`; o teste falha; restaure.

- [ ] **Step 2: Desacoplar o `d3`** — os três testes das linhas 88-122 (`sem n.iso`, `texto com IP`, `nome de ativo`...) hoje compartilham `d3` por efeito colateral. Dê um id próprio a cada um (`d3a`, `d3b`, ...) e passe o novo id nas chamadas `acao(cons, 'd3x', ...)` e nos `count(*)` da mesma `it`. Confirme que cada `it` passa sozinho: `npx vitest run test/ot-desvio-acao.test.ts -t "sem n.iso"`, `-t "texto com IP"`, `-t "desvio de outro projeto"`; depois o arquivo inteiro.

- [ ] **Step 3: Commit:** `git add test/ot-desvio-acao.test.ts && git commit -m "test(ot): desvio ligado a outro item (409) e testes da ação do desvio sem desvio compartilhado"`.

### Task 3: trilha oculta para `platform_admin` e DELETE de referência de outro projeto (P-09, P-10)

**Files:** Modify `test/ot-trilha-oculta.test.ts`, `test/ot-referencias.test.ts`.

- [ ] **Step 1: `platform_admin` na trilha** — em `ot-trilha-oculta.test.ts`, no `beforeAll`, depois de `concederModulos(...)`: `await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id, ativo) VALUES ('t-pa','t-pa@ness.lat','x','PA','platform_admin','org_ness',1)`).run();` e `pa = await sessionFor({ id: 't-pa', email: 't-pa@ness.lat', role: 'platform_admin' });` (declare `let pa: Record<string, string>;` junto aos outros). Novo `it` no primeiro `describe`:

```ts
  it('platform_admin (todos os módulos) vê as linhas ot.% de um projeto com ot; e do projeto sem ot não vê nenhuma', async () => {
    expect(await texto(await chamar(pa, '/api/v1/projects/proj-a/audit-trail'))).toContain(ID);
    expect(await texto(await chamar(pa, '/api/v1/projects/proj-b/audit-trail'))).not.toContain(ID + '-B');
  });
```

Rode `npx vitest run test/ot-trilha-oculta.test.ts`. Se o `platform_admin` NÃO vir as linhas de `proj-a`, isso é defeito de verdade (`podeVerOt` exige `modulosDaPessoa` com `ot`): pare e abra o achado.

- [ ] **Step 2: DELETE de outro projeto** — em `ot-referencias.test.ts`, depois do `it('DELETE: 200 e some...')` (linha 219):

```ts
  it('DELETE de referência de OUTRO projeto: 404 e a linha continua lá', async () => {
    await run(`INSERT OR IGNORE INTO risks (id, project_id, asset, threat) VALUES ('riskB', 'proj-b', 'a', 't')`);
    await run(`INSERT OR IGNORE INTO ot_sites (id, project_id, nome) VALUES ('siteB', 'proj-b', 'siteB')`);
    await run(`INSERT INTO ot_referencias (id, project_id, risk_id, ot_site_id, criado_por) VALUES ('ref-b', 'proj-b', 'riskB', 'siteB', 'u')`);
    expect((await chamar(cons, 'DELETE', `${P}/ot/referencias/ref-b`)).status).toBe(404);
    expect(await env.DB.prepare(`SELECT 1 AS x FROM ot_referencias WHERE id = 'ref-b'`).first()).not.toBeNull();
  });
```

Mutação: em `apagarReferencia` (`ot-referencias.ts:73`) tire `AND r.project_id = ?`; o teste falha; restaure. E renomeie o título do teste antigo para `'DELETE: 200 e some; de novo 404'` (o "de outro projeto" passou para o novo).

- [ ] **Step 3: Commit:** `git add test/ot-trilha-oculta.test.ts test/ot-referencias.test.ts && git commit -m "test(ot): platform_admin na trilha e DELETE de referência de outro projeto"`.

### Task 4: o 403 das perguntas de OT é do papel, não do módulo (P-11)

**Files:** Modify `test/ot-fornecedores.test.ts` (no `describe('perguntas de OT na avaliação do fornecedor')`, depois do teste "agente, chave de API e técnico são recusados", linha 196).

- [ ] **Step 1: Teste novo:**

```ts
  it('técnico COM ot e privacy (o módulo não é o motivo) continua recusado: o 403 é do papel', async () => {
    await concederModulos(['u-tec2'], ['privacy']);
    expect((await chamar(tec, 'POST', URL())).status).toBe(403);
    expect(await nperg()).toBe(0);
  });
```

Rode `npx vitest run test/ot-fornecedores.test.ts`. Mutação: remova a guarda de escrita do topo para o técnico no `otApp.on([...])` (procure `podeEditarOt` perto do topo de `src/routes/ot.ts`); este teste e o 403 do papel passam a ser 200: o teste falha. Restaure.

- [ ] **Step 2: Commit:** `git add test/ot-fornecedores.test.ts && git commit -m "test(ot): o 403 das perguntas de OT para o técnico é do papel (privacy concedido)"`.

**Verificação do lote 2:** `cd frontend && npx vitest run test/security-mfa.test.js --repeat 20`; na raiz `npx vitest run test/ot-desvio-acao.test.ts test/ot-trilha-oculta.test.ts test/ot-referencias.test.ts test/ot-fornecedores.test.ts`. `git diff --stat origin/main -- src frontend/src` vazio neste lote.

---

# LOTE 3: UX e docs (lista curta; cada item vira task só quando for pegar)

Cada um é S, sem migration, sem rota nova. Teste primeiro onde houver comportamento.

1. **P-14 (DOC)** `AGENTS.md:620`: trocar "botao Adicionar ao comite no Monitor" por "na Governanca (`views/monitor.js`)". Sem teste.
2. **P-13 (UX/INT)** `frontend/src/views/admin.js:559`: Chaves de API sem projeto pré-escolhido: `S.apiKeysProjectId` começa vazio, o `<select>` ganha a opção "Escolha o projeto" e "Nova chave" fica `disabled` até escolher (já existe o ramo `pid ? '' : 'disabled'`). Teste em `frontend/test/admin-usuarios-apikeys.test.js`: a tela abre com o botão desabilitado e sem chamar `GET /projects/:id/api-keys`.
3. **P-15 e P-16 (UX)** `frontend/src/views/painel.js:141-146` (`trilha()`): passo não feito com `tela` fora de `TELAS_DO_PAINEL` mostra `estado('falta', 'Falta')` em vez de linha muda; lista vazia não desenha a caixa. Testes em `frontend/test/painel-regua.test.js`: tela fora da lista → texto "Falta"; lista vazia → sem `.pn-passos`; ordem dos passos igual à do servidor (fixa o que a T11 deixou sem teste).
4. **P-12 (UX)** `frontend/src/views/ot-fornecedores.js:33`: o botão "Gerar perguntas de OT" não depende do primeiro fornecedor (a rota é por projeto); trocar o rótulo para "Gerar perguntas de OT para o projeto" e deixar o `id` do primeiro só como âncora de existência (comportamento igual). Teste em `frontend/test/ot-fornecedores.test.js`: o rótulo e o `data-args`.
5. **P-17 (TESTE)** `frontend/test/onboarding-encadeado.test.js`: "Criar o primeiro projeto" começa `disabled` e habilita quando `carregarOrgs` resolve (promessa adiada, como o teste da T16).
6. **P-18 (TESTE, M)** `test/onboarding-rotas.test.ts:88-92`: criar um projeto SEM `ot` numa organização COM `ot` e um projeto COM `ot` numa organização SEM `ot`; o cliente com `['ot']` é 400 no primeiro (teto do projeto) e 400 no segundo (teto da organização). Distingue as duas causas.
7. Comando de verificação do lote: `cd frontend && npx vitest run test/admin-usuarios-apikeys.test.js test/painel-regua.test.js test/ot-fornecedores.test.js test/onboarding-encadeado.test.js && npm run build` e `npx vitest run test/onboarding-rotas.test.ts`.

---

## Ordem de execução e riscos

- Lote 1 antes de tudo; Task 1 é a única que muda comportamento de produção de uma rota que o dono já mandou corrigir. As Tasks 2 e 3 só apertam recusas (nenhuma afrouxa P0).
- Risco da Task 1: `platform_admin` operando numa direta deixa de ver preço de assessment e de listar propostas e serviços (é o pedido). Se alguma tela do `platform_admin` listava essas áreas ao escolher uma direta, ela passa a mostrar 403; a decisão 11 já diz que a direta não tem área comercial, então o ajuste da tela (esconder a área quando a organização ativa é direta) é Lote 3 se aparecer.
- Risco da Task 3: um cliente externo (integração por chave de API) que enviava status fora dos três deixa de passar (400). As telas e o agente só mandam os três; conferir `grep` do Step 1 antes de mergear.
- Não conferido neste plano: o comportamento exato do `Proxy` do Task 4 do Lote 1 contra o driver do pool de workers (se o `bind` do statement real for chamado fora do `prepare` interceptado, ajuste o interceptador para devolver um objeto com `bind().first()`); e as fixtures citadas nos testes novos dos Lotes 2 e 3 foram lidas, não executadas (não rodei vitest, tsc nem npm, por instrução).
