# Políticas temáticas — PR3 (organizar, retirada do modelo por controle, agente e E2E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A equipe reorganiza as políticas por controle que restam em políticas temáticas, o modelo antigo de "uma política por controle" sai do produto (rotas, escritores, tela e ferramentas do agente) e o agente passa a criar e gerar políticas temáticas.

**Architecture:** Sem migration. "Organizar políticas" usa o que já existe: `documentos` (status `obsoleto`, `origem_control_id`), `documento_requisitos` (`definirRequisitosDoDocumento`, que substitui o conjunto) e `coberturaDePoliticas`. Saem as rotas por controle de `src/routes/policies.ts`, o `src/services/politica-escrita.ts`, a assinatura direta da política do controle e a tela `policies-dashboard`. `policy_versions`, as colunas `ciso_/ceo_approved_*` do controle e os pedidos `tipo = 'politica'` que já existem ficam como histórico: nenhum novo nasce deles. O agente troca `niso_generate_policy`, `niso_update_policy` e `niso_generate_policies_bulk` por `niso_criar_politica` e `niso_gerar_secao`.

**Tech Stack:** Cloudflare Workers + Hono + D1 (TypeScript), vitest com D1 real, frontend Vanilla JS + vitest/jsdom, Playwright (E2E com API mockada).

**Spec:** `docs/superpowers/specs/2026-10-23-politicas-tematicas-design.md` (seções Telas, O que sai e o que fica, Agente MCP, Testes). Já entregue: PR1 (#488: cobertura, lista e página em Documentos, "Coberto por" no controle, `importarControle` sem empurrar a nota) e PR2 (#489: catálogo de temas, `POST /politicas`, `POST /documentos/:id/secoes/:n/gerar`, página `politica`).

## Global Constraints

- Português em código, mensagens e UI; sem itálico nem emoji; `ness.`, `n.iso`, `n.privacy`.
- Sem migration; nenhuma tabela nem coluna sai do banco. Nenhum dado real de cliente em teste ou doc (`test/sem-dado-de-cliente.test.ts`).
- Nada automático na reorganização: cada incorporar/promover é um ato de uma pessoa da equipe (`ehEquipeNess`), com `logAudit`.
- Incorporar nunca apaga versão: o documento de origem vira `obsoleto` e as versões ficam.
- `compliance_controls.description` é nota do controle: nenhum código novo a lê como texto de política.
- Rota nova de projeto precisa de faixa (`test/modulos-produto.test.ts`). Ferramenta nova do agente sobre rota do openapi usa `t.contrato(...)`, nunca `t.enviar` por string (`test/contrato-mcp.test.ts`).
- `docs/openapi.json` e `mcp-server-niso/src/contrato-gerado.ts` só se regeneram (`npm run openapi`; o contrato pelo script que o teste indica), nunca à mão.
- Catracas: `test/any-catraca.test.ts` (não subir `any`; se descer, baixar o `TETO`), `frontend/test/catracas-visuais.test.js` (teto de `style=` por arquivo).
- Commits em português, `--author="Ricardo Esper <44273656+resper1965@users.noreply.github.com>"`, sem rodapé de IA. `npx tsc --noEmit` e os testes tocados antes de cada commit.

## Decisões deste plano (o que a spec não fixava)

1. **Pedido `tipo = 'politica'`:** `POST /projects/:id/pedidos` com esse tipo passa a responder 400 ("A política agora é um documento: peça a aprovação pela página da política."). Os pedidos que já existem continuam legíveis e decidíveis (a prova não muda). `TipoPedido` não perde o valor.
2. **`POST /controls/:id/approve` sai.** Era a assinatura da política do controle; sem a tela e com a política no documento, a aprovação é o pedido `tipo = 'documento'`. As colunas `ciso_/ceo_approved_*` ficam só para leitura (prontidão A.5.1, avisos de prazo, auditor).
3. **Coerência R4** (`control_approved_without_policy`, `src/services/coherence.ts`): o controle tem política quando há documento vigente que o cobre (`coberturaDePoliticas(...).por_controle`) ou histórico em `policy_versions`; a nota (`description`) deixa de contar.
4. **Prontidão:** nada muda (o critério já aceita política vigente em Documentos; a aprovação antiga do A.5.1 é só alternativa histórica).
5. **Promover** zera `origem_control_id`. Consequência aceita: `POST .../documentos/importar` de novo pode recriar um documento por controle para aquele controle; ele reaparece em Organizar.
6. **Rotas de leitura por controle também saem** (`GET controls/:cid/policy`, `.../policy/report`, `.../versions`, `.../versions/:versionId`, `GET /policies/templates*`): o único leitor era o modal que sai. `PolicyGeneratorService` sai junto se nada mais o importar; `src/templates/` fica.
7. **Ficam:** `generate-document`, `approve-document` e `checklist/:itemId/generate` em `policies.ts`; `PolicyAgent`; `policy-acknowledgments` e sua tela; `importarDocumentos`.

## Arquivos

- Modify `src/routes/politicas.ts` — `GET /politicas/organizar`, `POST /politicas/organizar/incorporar`, `POST /documentos/:id/promover`.
- Modify `src/schemas/documentos.ts` (+ export em `src/schemas/index.ts` se for o padrão) — `incorporarSchema`, `promoverSchema`.
- Create `frontend/src/views/organizar-politicas.js`; modify `frontend/src/views/documentos.js`, `frontend/src/views/politica.js`, `frontend/src/router.js`, `frontend/src/produto.js`, `frontend/login.html` (se as views são registradas lá).
- Modify `mcp-server-niso/src/ferramentas.ts`, `src/mcp/servidor.ts`, `src/mcp/contexto.ts`, `src/middleware/decisoes-agente.ts`, `src/middleware/agente.ts`, `src/routes/controls.ts` (mensagem do agente).
- Modify `src/routes/policies.ts`, `src/routes/pedidos.ts`, `src/routes/controls.ts`, `src/routes/documentos.ts`, `src/services/documentos.ts`, `src/services/coherence.ts`, `src/modulos.ts`, `src/middleware/rate-limit.ts`, `src/schemas/corpos.ts`, `src/openapi.ts`, `src/data/passos/etapa-3.ts`, `src/data/passos/tipos.ts`.
- Delete `src/services/politica-escrita.ts`, `src/services/policy-generator.ts` (se órfão) e os testes só deles.
- Modify `frontend/src/views/compliance.js` (sai o modal e o painel por controle).
- Tests: `test/politicas-organizar.test.ts`, `frontend/test/organizar-politicas-view.test.js`, `frontend/test/politica-view.test.js`, `test/politicas-agente.test.ts`, `frontend/e2e/politicas.spec.js`; ajustes listados em cada tarefa.
- Docs: `AGENTS.md`, `CHANGELOG.md`, `docs/agente/README.md`, `docs/agente/arquitetura.md`, `docs/agente/seguranca.md`, `mcp-server-niso/README.md`, `README.md`, `agent-skills/*` + `npm run skills:gerar` se citarem as ferramentas antigas.

---

### Task 1: Organizar políticas (servidor)

**Files:**
- Modify: `src/routes/politicas.ts`, `src/schemas/documentos.ts`, `src/openapi.ts` (registrar as três rotas como as outras de `politicas`)
- Test: `test/politicas-organizar.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/v1/projects/:projectId/politicas/organizar` → `{ por_controle: [{ id, titulo, status, controle_id, controle, requisito_id }], tematicas: [{ id, titulo, status }], sem_cobertura: [{ id, title }] }`. `por_controle` = documentos `tipo = 'politica'` com `origem_control_id` não nulo e `status <> 'obsoleto'`, com o código e título do controle (`compliance_controls.title`) e o `requisito_id` dele; `tematicas` = `tipo = 'politica'`, `origem_control_id` nulo, `status <> 'obsoleto'`; `sem_cobertura` vem de `coberturaDePoliticas`. Ordenar por título.
  - `POST /api/v1/projects/:projectId/politicas/organizar/incorporar` corpo `{ origem: string, destino: string }` → `{ ok: true, requisitos: number }`.
  - `POST /api/v1/projects/:projectId/documentos/:id/promover` corpo `{ titulo: string (3..200), requisitos: string[] (1..200) }` → `{ ok: true }`.
- Consumes: `ehEquipeNess` (`src/helpers.ts`), `requisitosDoDocumento`/`definirRequisitosDoDocumento` (`src/services/requisitos.ts`), `atualizarDocumento` (`src/services/documentos.ts`, devolve `tituloMudou`), `conferirPedidosDoDocumento` (como a rota `PUT /documentos/:id` usa), `coberturaDePoliticas`, `logAudit`, `validateBody`.

Regras:
- As três rotas: só `ehEquipeNess(c.get('user'))`, senão 403 `{ error: 'Só a equipe da consultoria organiza políticas' }`. Documento de outro projeto ou inexistente: 404.
- **Incorporar:** `origem` tem de ser política por controle (`origem_control_id` não nulo, não `obsoleto`), senão 400; `destino` tem de ser política temática (`origem_control_id` nulo, não `obsoleto`, `tipo = 'politica'`), senão 400; `origem === destino` é 400. O controle de origem sem `requisito_id` dá 409 `{ error: 'O controle não está no catálogo de requisitos; ligue a mão' }`. Passos, nesta ordem: (1) `definirRequisitosDoDocumento(destino, [...atuais, requisito_id])` (sem duplicar); (2) `UPDATE documentos SET status = 'obsoleto', updated_at = datetime('now') WHERE id = ? AND project_id = ? AND status <> 'obsoleto'`; (3) `logAudit('politica.incorporada', ..., 'Documento <origem> incorporado a <destino>')`. As versões da origem ficam intactas.
- **Promover:** só documento com `origem_control_id` não nulo e não `obsoleto` (senão 400). `atualizarDocumento(..., { titulo })` (com `conferirPedidosDoDocumento` se `tituloMudou`, como a rota PUT), `definirRequisitosDoDocumento(id, requisitos)` (400 com `desconhecidos` se algum não existe; validar ANTES de mudar o título), `UPDATE documentos SET origem_control_id = NULL WHERE id = ? AND project_id = ?`, `logAudit('politica.promovida', ...)`.

- [ ] **Step 1: Teste que falha** — `test/politicas-organizar.test.ts`, D1 real, no molde de `test/politicas-geracao.test.ts` (PR2) para semear projeto, usuário da equipe e catálogo. Casos:
  - `GET organizar` separa por controle e temáticas, ignora `obsoleto`, traz `sem_cobertura`.
  - incorporar: destino ganha o requisito do controle (sem perder os que tinha), origem fica `obsoleto`, `SELECT count(*) FROM documento_versoes WHERE documento_id = origem` não muda, trilha `politica.incorporada`.
  - incorporar com destino por controle, origem temática, origem = destino ou origem já obsoleta: 400; controle sem `requisito_id`: 409.
  - promover: título e requisitos novos, `origem_control_id` nulo, some de `por_controle` e aparece em `tematicas`; requisito desconhecido: 400 e o título não mudou.
  - papel `client`/`org_admin`: 403 nas três.
- [ ] **Step 2:** `npx vitest run test/politicas-organizar.test.ts` — FAIL.
- [ ] **Step 3: Implementar** as rotas em `src/routes/politicas.ts` (antes da rota de geração) e os esquemas `.strict()` em `src/schemas/documentos.ts`, ao lado de `politicaCriarSchema`. Registrar no `src/openapi.ts` como `politicas` já está; `npm run openapi` e regenerar o contrato do MCP.
- [ ] **Step 4:** testes do arquivo, `test/modulos-produto.test.ts`, `test/contrato-mcp.test.ts`, `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `Políticas: organizar (incorporar e promover) no servidor`.

---

### Task 2: Tela "Organizar políticas"

**Files:**
- Create: `frontend/src/views/organizar-politicas.js`
- Modify: `frontend/src/views/documentos.js` (item "Organizar políticas" no `renderMaisAcoes` do topo, só para a equipe), `frontend/src/router.js`, `frontend/src/produto.js` (tela compartilhada pelos dois módulos, como `politica`), `frontend/login.html` se as views forem carregadas por lá
- Test: `frontend/test/organizar-politicas-view.test.js`

**Interfaces:**
- Consumes: as três rotas da Task 1; `PUT /documentos/:id/requisitos` (ligar um controle sem cobertura a uma política: GET dos requisitos atuais + PUT com o novo, como `ligarRequisitoDocumento` em `documentos.js`); `abrirPolitica`; `montarLista`, `openModal`, `renderEmptyState`, `renderStatusBadge`, `escapeHTML`, `showToast`, `tituloDaTela`.
- Produces: `window.renderOrganizarPoliticas(c, h, a)`; view `organizar-politicas`.

Tela (sem `.btn-primary` por linha; uma ação principal no máximo):
- Topo: "X de Y controles aplicáveis cobertos por política vigente" (o mesmo de `GET .../documentos/cobertura`).
- Bloco "Políticas por controle" (`montarLista`): título, controle, situação; ações "Incorporar a…" (modal com `<select>` das temáticas → POST incorporar) e "Promover a temática" (modal com título preenchido pelo atual e seletor de requisitos do catálogo `GET /api/v1/requisitos?fonte=iso27001:2022`, pré-marcado com o `requisito_id` do controle → POST promover). Sem temáticas: "Incorporar" desabilitado com o motivo em texto.
- Bloco "Controles sem política": cada um com "Ligar a uma política" (modal com as temáticas) e "Criar política do tema sugerido" (abre o "Nova política" de `documentos.js`).
- Vazio: `renderEmptyState` "Não há políticas por controle a organizar."
- Fora da equipe, a tela mostra `renderEmptyState` com "Só a equipe da consultoria organiza políticas." e não chama as rotas.

- [ ] **Step 1: Teste que falha** (jsdom, no molde de `frontend/test/politica-view.test.js`): renderiza as duas listas a partir de um `api` falso; "Incorporar" envia `{ origem, destino }` e recarrega; "Promover" envia título e requisitos; papel `client` não chama `GET organizar`; o item do menu "Mais" só aparece para a equipe.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `cd frontend && npx vitest run test/organizar-politicas-view.test.js test/catracas-visuais.test.js test/router.test.js` — PASS.
- [ ] **Step 5: Commit** `Políticas: tela Organizar políticas`.

---

### Task 3: Controles cobertos editáveis na página da política

**Files:**
- Modify: `frontend/src/views/politica.js` (bloco de requisitos, hoje só leitura, linha ~37)
- Test: `frontend/test/politica-view.test.js`

**Interfaces:**
- Consumes: `GET/PUT /api/v1/projects/:id/documentos/:docId/requisitos`, `GET /api/v1/requisitos?fonte=iso27001:2022`.

Regras: editável só quando o documento tem rascunho e o papel edita (a mesma condição `edita` que já mostra "Gerar"). Cada requisito vira um selo com "×" (aria-label "Desligar A.x.y"); abaixo, `<select>` do catálogo sem os já ligados e "Ligar". O PUT manda o conjunto inteiro; se o GET dos requisitos falhou, não mostrar o seletor (o PUT substituiria os que existem — mesma guarda de `documentos.js`, `requisitosOk`). Depois do PUT, re-render da página.

- [ ] **Step 1:** testes: com rascunho, "×" manda o PUT sem aquele id; "Ligar" manda o PUT com o novo; sem rascunho ou papel de leitura, nenhum botão; GET falho, sem seletor.
- [ ] **Step 2–4:** FAIL → implementar → PASS (`frontend/test/politica-view.test.js`, catracas).
- [ ] **Step 5: Commit** `Políticas: controles cobertos editáveis na página`.

---

### Task 4: Agente — `niso_criar_politica` e `niso_gerar_secao`

**Files:**
- Modify: `mcp-server-niso/src/ferramentas.ts` (saem `niso_generate_policy` ~:267/:800, `niso_update_policy` ~:389/:904, `niso_generate_policies_bulk` ~:319/:850; entram as duas novas), `src/mcp/servidor.ts` (`BLOQUEADAS` perde `niso_generate_policies_bulk`; texto da `niso_publicar_documento` ~:177 sem "restaura, gera por modelo"), `src/middleware/decisoes-agente.ts` (saem `restaurar_versao` e `gerar_por_modelo`), `src/middleware/agente.ts` (sai o `generate-policies-bulk` de `acaoDestrutiva` ~:171 e do comentário ~:185), `src/mcp/contexto.ts` (:13, :43, :61), `src/routes/controls.ts:109` (mensagem: "o texto da política é o documento: use niso_criar_politica / niso_gerar_secao"), `mcp-server-niso/src/index.ts` (:111, :134), descrição de `niso_update_control` (~:411, sem "policy text")
- Test: `test/politicas-agente.test.ts`; ajustar `test/contrato-mcp.test.ts` (:83 contagem, :87/:94 exemplo de escrita vetada), `test/agente-privacy-ferramentas.test.ts` (:116 e o título desatualizado :109), `test/agente-auditor.test.ts` (:100, :132, :156), `test/agente-principal.test.ts` (:51/:58), `test/agente-paridade.test.ts` (:44), `test/seguranca-rodada2.test.ts` (:48-53), `test/mcp-remoto.test.ts` (:94/:121)

**Interfaces:**
- Produces:
  - `niso_criar_politica` `{ projectId, tema?: string, titulo?: string, requisitos?: string[] }` (exatamente um de `tema` ou `titulo`+`requisitos`) → `t.contrato("POST /api/v1/projects/{projectId}/politicas", { projectId }, corpo)`. Descrição: cria em rascunho; tema já existente devolve o id.
  - `niso_gerar_secao` `{ projectId, documentoId, secao: number }` → `t.contrato("POST /api/v1/projects/{projectId}/documentos/{id}/secoes/{n}/gerar", ...)` (usar os nomes de parâmetro que o contrato gerado tiver). Descrição: gera uma seção do rascunho; publicar é `niso_publicar_documento`.
  - As duas são escrita do consultor (não entram em `READ_TOOLS` nem em `AUDITOR_WRITE_TOOLS`).
- Contagens esperadas: `TOOLS` 39 → 38; consultor remoto 50 → 50 (sai `generate` e `update`, `bulk` já estava bloqueada; entram 2); auditor 22 → 22. Confira com o teste, não com a soma.

- [ ] **Step 1: Teste que falha** `test/politicas-agente.test.ts` (no molde de `test/politica-agente.test.ts`, principal agente consultor): `niso_criar_politica` com tema cria rascunho (201) e repetir dá 409 com id; `niso_gerar_secao` com o modelo falso grava a seção no rascunho; publicar pela rota sem os cabeçalhos da decisão é recusado; papel auditor não vê nenhuma das duas.
- [ ] **Step 2:** FAIL. **Step 3:** implementar e trocar os exemplos dos testes listados por outra escrita/destrutiva que continua existindo (`niso_create_evidence`; `/data-subject/erase`). Apagar `test/politica-agente.test.ts` só nos casos que exercem as ferramentas/rotas que saem (manter o de `PUT /controls`, :145-168).
- [ ] **Step 4:** `npx vitest run test/politicas-agente.test.ts test/contrato-mcp.test.ts test/agente-*.test.ts test/seguranca-rodada2.test.ts test/mcp-remoto.test.ts test/politica-agente.test.ts`, `npx tsc --noEmit`, `cd mcp-server-niso && npm run build` — PASS.
- [ ] **Step 5: Commit** `Agente: niso_criar_politica e niso_gerar_secao no lugar das ferramentas por controle`.

---

### Task 5: Retirada das rotas e escritores por controle (servidor)

**Files:**
- Modify: `src/routes/policies.ts` — saem `POST generate-policy` (:17-88), `POST generate-policies-bulk` (:215-287), `GET controls/:cid/versions` e `.../versions/:versionId` (:289-314), `politicaDoControle`/`ControleComPolitica` (:321-335), `GET controls/:cid/policy` (:337-354), `GET .../policy/report` (:356-393), `POST .../restore-version` (:395-418), `POST controls/:cid/policy` (:423-466), `GET /policies/templates*` (:469-496), `POST policies/generate-from-template` (:498-541). Ficam `generate-document`, `approve-document`, `checklist/:itemId/generate`. Limpar imports órfãos (confira cada um com grep antes de apagar).
- Delete: `src/services/politica-escrita.ts`; `src/services/policy-generator.ts` e `test/policy-generator.test.ts` se `grep -rn "policy-generator" src test` só achar eles.
- Modify: `src/routes/documentos.ts:141` (publicar não chama mais `aplicarTextoNoControle`) e `src/services/documentos.ts` (`alvoDaPublicacao` ~:349, `garantirDocumentoDoControle` ~:245, `espelharTexto` ~:282 saem se ficarem sem chamador; `importarDocumentos` fica).
- Modify: `src/routes/controls.ts` — sai `POST /:id/approve` (:284-345) e o import de `assinaturaPolitica` se ficar órfão (a função em `pedidos.ts` fica se `registrarDecisao` a usar).
- Modify: `src/routes/pedidos.ts` — `POST` com `tipo = 'politica'` → 400 `{ error: 'A política agora é um documento: peça a aprovação pela página da política.' }`, antes de qualquer leitura; os pedidos existentes seguem.
- Modify: `src/services/coherence.ts` R4 (Decisão 3).
- Modify: `src/modulos.ts` (:32 saem `generate-policies-bulk` e `generate-policy`; :34 `policies` sai se nenhuma rota restante usar o segmento — confira `approve-document`/`generate-document`), `src/middleware/rate-limit.ts:24` (tirar os dois nomes da regex `ia`), `src/schemas/corpos.ts` (saem `politicaGerarSchema`, `politicasLoteSchema`, `versaoRestaurarSchema`, `politicaTextoSchema`, `politicaDeTemplateSchema` se órfãos), `src/openapi.ts` (imports :78-81/:129 e entradas :267, :268, :284, :311, mais a do `approve` de controle), depois `npm run openapi` e o contrato do MCP.
- Modify: `src/data/passos/etapa-3.ts:127` (`ondeVive: [{ tela: 'documentos', rotulo: 'Abrir as políticas' }]`) e `src/data/passos/tipos.ts:18` (sai `'policies-dashboard'` de `TELAS`); se o catálogo de passos tiver versão, suba `catalogo_versao`.
- Tests a apagar ou ajustar (inventário; confira cada um rodando): `test/policies.test.ts` (sai o que é de rota removida), `test/politica-escritores.test.ts` (apagar; o que valer para `PUT /controls` fica), `test/policies-templates.test.ts` (apagar), `test/erro-sem-vazamento.test.ts` (:230, :261: trocar por rota de IA que fica, ex. `generate-document`), `test/controle-por-codigo.test.ts` (:41, :64), `test/minimizacao-assinatura.test.ts` (:44 URL `…/policy`, :86 relatório), `test/apikey-role.test.ts` (trocar o caminho de exemplo por `generate-document`), `test/vetorizacao-removida.test.ts:59` (idem), `test/idor-tenant-project-scoped.test.ts:45`, e os que usam `POST …/controls/X/policy` como preparação (`pedidos-documento.test.ts:165`, `pedido-politica.test.ts:133`, `pedidos-publico.test.ts:342/:362`, `fatia-jornada-ponta-a-ponta.test.ts:59`): semear o texto por `UPDATE compliance_controls` direto ou trocar o cenário para pedido `tipo = 'documento'`; os testes de criar pedido `politica` passam a esperar 400.
- Test novo: `test/politicas-retirada.test.ts` — cada rota removida responde 404; `POST pedidos` com `tipo: 'politica'` dá 400; publicar versão de documento com `origem_control_id` não muda `compliance_controls.description` nem as colunas de assinatura; R4 some quando um documento vigente cobre o controle e aparece quando só há nota.

- [ ] **Step 1:** escrever `test/politicas-retirada.test.ts` — FAIL.
- [ ] **Step 2:** remover e ajustar, na ordem: rotas e escritores → `documentos.ts` → controls/pedidos → coherence → modulos/rate-limit/schemas/openapi → `npm run openapi` + contrato → passos.
- [ ] **Step 3:** `npx tsc --noEmit`, `npx vitest run test/politicas-retirada.test.ts` e depois a suíte de backend inteira (`npx vitest run`), porque a retirada toca muitos testes — PASS. `test/any-catraca.test.ts`: se o número de `any` cair, baixe o `TETO` lá.
- [ ] **Step 4: Commit** `Políticas: retira as rotas e os escritores da política por controle`.

---

### Task 6: Retirada da tela por controle (frontend)

**Files:**
- Modify: `frontend/src/views/compliance.js` — saem `generatePolicyForControl` (:338-349) e o botão "Gerar Política AI" (:189); `renderPoliciesDashboard` (:1737-1831); `avisarQueAnulaAssinaturas`; `openGeneratePolicyModal` inteiro (:1838-~2207) com `__cmpViewPolicyVersion`, `doRestorePolicyVersion`; `togglePolicyGenFields`, `doGeneratePolicy`, `signPolicy` (:2209-2274); `publicarRascunhoPolitica`/`descartarRascunhoPolitica` (:2590-2608); `bulkGeneratePolicies` (:2492-2506); `openPolicyReport`; os registros em `window` correspondentes. `renderAcknowledgments` fica.
- Modify: `frontend/src/router.js:97`, `frontend/src/produto.js` (:36 `DO_ISO_SEM_ITEM`, :122 `TELAS_DOS_MODULOS`), `frontend/src/views/meus-pedidos.js` (a opção de criar pedido `politica`, se existir, sai; ler e decidir os existentes fica).
- Tests: apagar `frontend/test/politica-modal.test.js` e `frontend/test/politica-rascunho.test.js`; ajustar `pedido-politica.test.js:73`, `selos-fato.test.js:82`, `contrato-consumidores.test.js` (:75, :120), `erro-de-carga.test.js:66`, `router.test.js` (:16, :27, :179-185). Teto da catraca de `style=` em `compliance.js` baixa se a catraca exigir.

- [ ] **Step 1:** remover; `grep -rn "policies-dashboard\|openGeneratePolicyModal\|generatePolicyForControl\|signPolicy\|openPolicyReport\|bulkGeneratePolicies" frontend/src frontend/test frontend/e2e src` não deve imprimir nada (fora `CHANGELOG`).
- [ ] **Step 2:** `cd frontend && npx vitest run && npm run build` — PASS.
- [ ] **Step 3: Commit** `Políticas: retira a tela de política por controle`.

---

### Task 7: E2E criar → gerar → publicar

**Files:**
- Create: `frontend/e2e/politicas.spec.js` (molde: `frontend/e2e/fornecedores.spec.js`, API mockada com estado, dados fictícios, `servirShell`)

Roteiro: login como consultor (projeto com `modulos: ['iso']`) → Documentos → "Nova política" → escolher um tema do catálogo (mock de `GET .../politicas/temas`) → `POST .../politicas` devolve `{ id }` → a página da política abre com as seções "a gerar" → "Gerar seções pendentes" (mock de `POST .../secoes/:n/gerar` troca a marca da seção no texto do rascunho mockado) → as seções aparecem prontas → "Abrir em Documentos" → publicar o rascunho (`POST .../versoes/:n/publicar?hash=`) → a situação vira "Vigente". Afirme o que a tela mostra, não só as chamadas.

- [ ] **Step 1:** escrever e rodar `cd frontend && npx playwright test e2e/politicas.spec.js` (Chromium já instalado; nunca `playwright install`) — PASS.
- [ ] **Step 2: Commit** `Políticas: E2E criar, gerar e publicar`.

---

### Task 8: Documentação e verificação

**Files:** `AGENTS.md` (parágrafo de Documentos: "A tela por controle sai no PR3" vira o estado atual; Organizar; pedido `politica` só histórico; as ferramentas do agente; `policies-dashboard` some das menções), `CHANGELOG.md`, `docs/agente/README.md` (:69 contagem, :164), `docs/agente/arquitetura.md:200`, `docs/agente/seguranca.md:141`, `mcp-server-niso/README.md` (:22, :144, :176, :187-188), `README.md:118`, `agent-skills/*` (`grep -rn "generate_policy\|update_policy" agent-skills`; se houver, ajuste e `npm run skills:gerar`).

Todo número novo em `AGENTS.md` vai com o comando que o mede.

- [ ] **Step 1:** atualizar os textos; `grep -rn "niso_generate_policy\|niso_update_policy\|generate_policies_bulk\|policies-dashboard\|generate-from-template\|restore-version" -- . ':!CHANGELOG.md' ':!docs/arquivo' ':!docs/superpowers'` (via `git grep`) não imprime nada.
- [ ] **Step 2:** `bash scripts/ci/gate.sh` — tudo verde, saída colada no relatório.
- [ ] **Step 3: Commit** `Políticas temáticas, PR3: documentação`.
