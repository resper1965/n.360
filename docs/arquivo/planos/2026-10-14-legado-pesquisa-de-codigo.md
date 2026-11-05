# Legado de privacidade no n.privacy: pesquisa de código (2026-10-14)

Pesquisa somente de leitura, feita na worktree `plano` sobre `origin/main` em `9f245f1` (#394). Nada de código foi alterado.
Serve de base para o plano de trazer ao n.privacy o que o sistema legado faz: (1) teste de impacto com 11 perguntas que gera o
RIPD; (2) riscos por atividade; (3) lacunas (gaps) por atividade; (4) ciclo de vida do dado por etapa; (5) mais de uma base legal
por tratamento, mais a base GDPR; (6) painel com faixas de prazo, exportação para Excel e impressão de RIPD e LIA; (7) homologação
de fornecedor com questionário enviado e % respondido. A premissa é não duplicar cadastro: ligar à atividade (`ropa_records`) o
que o n.iso já tem.

Convenção: `arquivo:linha` aponta para `origin/main`. Todo número vem com o comando que o mede.

Duas correções ao `AGENTS.md`, medidas agora:

- A última migration em `main` é a **0070** (`ls migrations/*.sql | tail -1` → `0070_agente_papel.sql`), e não a 0069. A 0071
  (`empresas`) existe só na branch `feat/novo-projeto-dados-empresa` (`git cat-file -e origin/main:src/services/empresas.ts`
  falha com "does not exist in 'origin/main'").
- `any` em `src/` hoje: **532** (`git grep -ahoE ': any\b|as any\b|<any>' -- 'src/*.ts' ':!*.test.ts' | wc -l`), igual ao `TETO`
  de `test/any-catraca.test.ts:19`. O `AGENTS.md` ainda diz 535.

---

## A) Riscos (`risks`)

**Tabela.** `schema.sql:489-510`: `id, project_id, asset_id → itens (SET NULL), asset TEXT NOT NULL, threat TEXT NOT NULL,
vulnerability, impact (1..5, padrão 3), probability (padrão 3), risk_score GENERATED (impact*probability) STORED, risk_level,
treatment (padrão 'Mitigate'), treatment_plan, control_id → compliance_controls (SET NULL), owner (texto), status (padrão 'Open'),
accepted_by, accepted_at, created_at, updated_at, owner_parte_id → partes (SET NULL)`. Não tem `ropa_id`, risco residual, prazo
nem CHECK em `treatment`/`status`. Índice `idx_risks_project` (`schema.sql:565`).
Histórico: `risk_history` (`schema.sql:512-520`: impact, probability, risk_level, assessment_date). Migrations que mexem em
`risks`: `git grep -l "risks" -- migrations/*.sql` → 0003, 0021, 0048 (asset_id passou a apontar para `itens`), 0049 (owner_parte_id).

**Cálculo.** `risk_level` é calculado no handler, não no banco: `src/routes/risks.ts:8-13` (≤5 Low, ≤12 Medium, ≤20 High, senão
Critical), aplicado no POST (`:36-38`) e no PUT (`:86-88`). Impacto e probabilidade são inteiros 1..5 por esquema
(`src/schemas/resources.ts:12`, `score1to5`). `treatment` e `status` são texto livre (`resources.ts:21`, `:14-28`).
Vocabulário usado: tela `Mitigate|Accept|Transfer|Avoid` (`frontend/src/views/grc.js:384`); MCP descreve `status` como
"Open, Mitigated, Closed" (`mcp-server-niso/src/ferramentas.ts:176`). O legado "aceitar / reduzir / evitar" cabe em
`Accept / Mitigate / Avoid` sem coluna nova.

**Rotas** (`src/routes/risks.ts`, montado em `src/index.ts:454`):

| Rota | Linha | Observação |
|---|---|---|
| `GET /api/v1/projects/:p/risks` | `:15` | JOIN controle e parte |
| `POST /api/v1/projects/:p/risks` | `:27` | `refForaDoProjeto` em control_id, asset_id, owner_parte_id (`:33`); grava `risk_history` (`:63-67`); trilha `risk.created` (`:69`) |
| `PUT /api/v1/risks/:id` | `:79` | `requireResourceAccess(..., 'risks', ...)` (`:82`); **substitui o registro inteiro**: campo ausente vira padrão (`:98-116`), exceto `owner_parte_id` (`:111`, "ausente mantém") |
| `DELETE /api/v1/risks/:id` | `:137` | trilha central de exclusão (`src/trilha-exclusao.ts:28`) |
| `GET /api/v1/projects/:p/risks/history` | `:149` | |

**Defeito existente (achado desta pesquisa).** A edição pela tela do n.iso (`frontend/src/views/grc.js:401-413`) manda só asset,
threat, vulnerability, impact, probability, treatment, control_id, owner e owner_parte_id. Como o PUT substitui tudo
(`risks.ts:100`, `:108`, `:113-115`), **editar um risco pela tela apaga `asset_id`, `treatment_plan` e `accepted_by/at`, e volta
`status` para 'Open'**. A ferramenta MCP contorna lendo o registro e reenviando tudo (`ferramentas.ts:748-756`). Consequência
para o plano: qualquer coluna nova em `risks` (`ropa_id`, residual, prazo) seria apagada pela tela do n.iso a cada edição, a
menos que use o padrão "ausente mantém" de `owner_parte_id` (`risks.ts:98`, `:111`), ou o PUT vire parcial (`setParcial`, como
na CAPA, `src/routes/capa.ts:25`).

**Faixa.** `src/modulos.ts:32` (`risks: 'iso'`, `'risk-matrix': 'iso'`) e `src/modulos.ts:65` (`FAIXA_DA_TABELA.risks = 'iso'`).
`requireResourceAccess` (`src/helpers.ts:298-327`) recusa por projeto sem módulo (`:309-310`) e por pessoa sem módulo
(`:321-325`), inclusive para `platform_admin` no caso do projeto.
**Brecha de faixa:** `GET /api/v1/projects/:p/export/risks` (`src/routes/integrations.ts:338-347`) cai no segmento `export`,
classificado como `nucleo` (`src/modulos.ts:23`). Um projeto só n.privacy, ou uma pessoa sem n.iso, baixa o CSV de riscos.

**Quem mais lê `risks`** (`git grep -nE "\b(FROM|JOIN|INTO|UPDATE)\s+risks\b" -- 'src/*.ts' ':!*.test.ts'`):
`routes/governance.ts:489` (revisão pela direção), `routes/integrations.ts:340` (CSV), `routes/platform.ts:347` e `:391`
(painel: críticos com score ≥15), `routes/projects.ts:791` (métricas), `:972` e `:1013` (rastreabilidade controle↔risco),
`routes/public.ts:39` (contagem global), `services/coherence.ts:30` (regra R1: risco `Mitigate` aberto sem controle é **erro**,
`coherence.ts:40-49`), `services/partes.ts:77` (conciliação do dono). Portabilidade e transferência pegam a tabela sozinhas
(`src/portabilidade.ts:173`, leitura de `sqlite_master`).

**Telas.** `frontend/src/views/grc.js`: `renderRisks` (`:19`), matriz 5×5 (`:81`), CSV (`:211`), novo (`:270`, `:333`), edição
(`:359`, `:401`), detalhe (`:417`); uso em CAPA (`:1197`, `:1269`); SoA (`compliance.js:853`, `:1227`). Menu: `nav-risks` está em
`SO_ISO` (`frontend/src/produto.js:17-19`).

**Agente MCP.** `niso_create_risk` (`mcp-server-niso/src/ferramentas.ts:145`, execução `:714`, contrato
`POST /api/v1/projects/{projectId}/risks`), `niso_update_risk` (`:161`, `:728`; descarta `accepted_by/at` do agente), `niso_list_risks`
(`:194`, `:763`). Roteiro: `src/mcp/contexto.ts:42`, `:81`. As ferramentas não filtram por módulo (`ferramentaPermitida`,
`ferramentas.ts:100-107`); a trava é a faixa no servidor.

**Pessoas e papéis.** Hoje: quem tem `iso` em `usuario_modulos` (ou `platform_admin`, `src/modulos.ts:105`; chave de API vale o
projeto, `:106`; agente vale o consultor que concedeu, `:108`). `test/modulos-por-pessoa.test.ts:94-132` usa justamente
`/risks` como exemplo de rota do n.iso que a pessoa sem `iso` NÃO alcança (`:103` espera 403).

**Se `risks` passasse a `nucleo`:**
- quebra `test/modulos-produto.test.ts:28` (espera `risks` e `capa` em `iso`), `:89` (espera 403 em projeto só n.privacy) e
  `test/modulos-por-pessoa.test.ts:103`, `:123-132`;
- **alarga permissão**: pessoa a quem foi negado o n.iso (cliente de projeto com os dois módulos) passa a ver e editar a matriz
  de riscos ISO inteira, inclusive riscos de segurança que nada têm a ver com privacidade;
- `/risk-matrix`, `coherence`, rastreabilidade e o painel continuam no n.iso, então a classificação ficaria incoerente;
- no n.iso nada muda para quem já tem o módulo.
**Projeto só n.privacy** precisaria de: rota de leitura/escrita dos riscos da atividade numa faixa que ele alcança, tela própria
(o `renderRisks` é do n.iso e assume controle, `grc.js:221`), e a regra R1 do `coherence` não pode tratar risco de privacidade sem
controle como erro (`coherence.ts:40-49`) quando o n.iso for ligado depois.

## B) Ações corretivas (`corrective_actions`)

**Tabela.** `schema.sql:618-637`: `audit_id → audit_schedule (CASCADE)`, `risk_id → risks (CASCADE)`, `control_id →
compliance_controls (CASCADE)`, `title NOT NULL, description, root_cause, action_plan, severity (padrão Medium), assigned_to
(texto), due_date, status (padrão Open), resolution, completed_at, assigned_to_parte_id → partes (SET NULL), incidente_id →
incidentes (SET NULL)`. A 0063 acrescentou `incidente_id` (`migrations/0063_*.sql:2-3`). Não tem `ropa_id`.
Atenção: apagar o risco apaga as CAPAs dele (`risk_id ... ON DELETE CASCADE`).

**Rotas** (`src/routes/capa.ts`, montadas em `src/index.ts:408-409`): `PUT /api/v1/capa/:id` (`:12`, parcial via `setParcial`,
`:25`; refs conferidas em `:22`), `DELETE /api/v1/capa/:id` (`:38`), `GET /projects/:p/capa` (`:53`), `POST /projects/:p/capa`
(`:63`, refs em `:69`). Status usados: `Open | In Progress | Closed` (`grc.js:1361`), sem CHECK.
**Faixa:** `capa: 'iso'` (`src/modulos.ts:28`) e `FAIXA_DA_TABELA.corrective_actions = 'iso'` (`:65`).

**Incidente → CAPA (0063).** O incidente é do núcleo (`modulos.ts:25`), mas a CAPA é do n.iso. A tela só oferece "Abrir CAPA" no
n.iso com o módulo ligado (`frontend/src/views/titular.js:300-301`), e chama `POST /projects/:p/capa` (`:320-324`). Coberto por
`test/incidente-nucleo.test.ts:50-65` e `frontend/test/titular-view.test.js:408-412`.

**Avisos de prazo.** Fonte `capa` (`src/services/avisos-prazo.ts:89-90`: CAPA não fechada com `due_date`), destinatário pelo texto
`assigned_to` (não pela parte), tela `/capa` (`:217`). Projeto só n.privacy: o sino levaria a uma tela do n.iso que ele não abre.
Painéis: `governance.ts:486-500` conta CAPA; `globals.js:1137` (sino).

**Gaps do legado** (lacuna, responsável, prazo, status) cabem em `corrective_actions` (`title`, `assigned_to_parte_id`,
`due_date`, `status`) mais uma coluna `ropa_id`. `refForaDoProjeto` já conhece `ropa_id → ropa_records` (`src/helpers.ts:337`),
então a guarda de tenant é uma linha nas listas de `capa.ts:22` e `:69`.

## C) Ativo e inventário

`itens` (`schema.sql:461-473`: nome, descrição, tipo `sistema|ativo|base|processo`, status, departamento) e `item_seguranca`
(`:475-487`, bloco 1:1 do n.iso: classificação, criticidade, CID). Serviço `src/services/itens.ts` (tradução para a API antiga de
ativos). Faixa: `assets: 'nucleo'` (`modulos.ts:21`), `itens: 'nucleo'` (`:67`). Mas o menu "Ativos" é `SO_ISO`
(`produto.js:18`): no n.privacy só se cria item pela entrevista ("Cadastrar agora", `ropa-entrevista.js:78-82`).

Ligação ao tratamento: `tratamento_itens (ropa_id, item_id, project_id, created_at)`, **PK (ropa_id, item_id)** (`schema.sql:1456-1463`).
Não guarda papel, etapa nem descrição. Serviço `src/services/tratamentos.ts:11`, `:23` (`definirLigacao` substitui a lista).

**Ciclo de vida.** Hoje nada guarda etapa. A entrevista pergunta "De onde vêm os dados?" (coleta, `ropa-entrevista.js:187-190`) e
"Como o dado é eliminado?" (`:205-208`), mas as duas são `semColuna`: **não são gravadas** e voltam vazias na revisão
(`:369-370`). Pôr `etapa` em `tratamento_itens` exige refazer a PK (o mesmo item aparece em mais de uma etapa) e mexe na lista
`itens` congelada no hash do tratamento (`src/services/pedidos.ts:130`). Tabela nova (`tratamento_ciclo`: `ropa_id`, `etapa`
coleta|uso|compartilhamento_interno|compartilhamento_externo|armazenamento|eliminacao, `situacao` registrado|nao_aplicavel,
`descricao`, `item_id` opcional → itens, `project_id`) não toca a PK nem o hash.

## D) RoPA, DPIA e LIA

**`ropa_records`** (`schema.sql:570-601`): finalidade, categorias, titulares, `legal_basis` (texto), consentimento, direitos,
retenção, destinatários, transferência (flag + salvaguardas), `dpia_required`, status, `owner`, aprovações CISO/CEO antigas,
`owner_parte_id` (0049), `base_legal_id → requisitos` (0054), `dados_sensiveis` e `criancas_adolescentes` (0069,
`migrations/0069_ropa_riscos_lgpd.sql:4-5`, `NOT NULL DEFAULT 0`). Ligações (0054): `tratamento_itens`, `tratamento_departamentos`,
`tratamento_transferencias` (`schema.sql:1456-1485`) e partes via `parte_vinculos` (`alvo_tipo = 'tratamento'`, `:1314-1324`).

**`dpia_assessments`** (`schema.sql:922-946`): duas famílias de coluna (tela: system_name, data_flow_description, ...; API/MCP:
processing_name, data_category_risk, technical_measures, residual_risk_level, dpo_recommendations), `ropa_id` com integridade por
três triggers (`:1488-1506`). Rotas: `GET/POST /projects/:id/dpia` (`src/routes/projects.ts:1049`, `:1055`), PUT/DELETE/aprovar/
revogar/relatório em `src/routes/platform.ts:72`, `:107`, `:130`, `:154`, `:189`; nascer do tratamento: `POST
/projects/:p/ropa/:rid/dpia` (`src/routes/ropa.ts:178`, faixa `privacy` por `modulos.ts:42`).

**`lia_assessments`** (`schema.sql:1508-1525`): uma por tratamento (`ropa_id UNIQUE`), 4 textos + `conclusao`, status
`rascunho|concluida` com CHECK. Serviço `src/services/lia.ts:33-65`; rotas `ropa.ts:152-176`.

**Como `dpia_required` e a recomendação de RIPD são calculados.** `dpia_required` é decisão humana gravada (`ropa.ts:55`, `:119`;
entrevista `ropa-entrevista.js:362`). A recomendação é só do frontend: `motivosRipd` (`ropa-entrevista.js:110-118`) com 5
gatilhos: sensível, criança, volume >10 mil, decisão automatizada, impacto alto. Três deles (`volume` `:153`, `decisao_auto` `:164`,
`impacto` `:219`) não são gravados: a recomendação **não é reproduzível** depois. O servidor só usa `dpia_required` para
`dpia_pendente` (`src/services/tratamentos.ts:112`).
**Onde entram as 11 perguntas do teste de impacto:** o lugar natural é o bloco H da entrevista (`ropa-entrevista.js:219-229`),
substituindo `volume/decisao_auto/impacto` por perguntas gravadas (tabela `tratamento_impacto` ou colunas em `ropa_records`), com o
cálculo da recomendação no SERVIDOR (para relatório, painel e agente lerem o mesmo resultado).

**O que a aprovação congela (crítico para projeto existente).** `DOCUMENTOS.tratamento` (`src/services/pedidos.ts:125-142`)
congela 16 chaves: finalidade, categorias, titulares, `base_legal_texto`, `base_legal_id`, retenção, destinatários, transferência,
salvaguardas, `dpia_requerido`, `dados_sensiveis`, `criancas_adolescentes` e as listas `itens`, `departamentos`, `partes`,
`transferencias`. A aprovação é **derivada**: vale o pedido aprovado cujo hash é o do conteúdo atual
(`src/services/documentos.ts:457-480`, comparação em `:476`). Logo:
- acrescentar uma chave ao conteúdo, ou mudar o SQL de uma lista, **muda o hash de todos os tratamentos e derruba todas as
  aprovações existentes** (e substitui os pedidos abertos, `pedidos.ts:247-261`);
- o padrão seguro já existe: `soSeMarcado` (`pedidos.ts:136-141`, `:153`): coluna que vale NULL não entra no conteúdo, então o
  hash antigo não muda. Foi assim que a 0069 entrou sem invalidar nada (`NULLIF(..., 0)`, `:129`). Para lista nova, o SQL precisa
  devolver NULL quando vazia (`NULLIF(json_group_array(...), '[]')`) e a chave entrar em `soSeMarcado`;
- `json_group_array` de lista vazia hoje dá `[]`, e `[]` está no hash dos tratamentos sem ligação: mudar essa forma também derruba.
O mesmo vale para DPIA (`COLUNAS_DPIA`, `pedidos.ts:97-101`): coluna nova fora da lista não muda hash; dentro, só com `soSeMarcado`.
Acrescentar um TIPO de pedido (ex.: aprovar LIA ou riscos) exige reconstruir `pedidos` (CHECK em `schema.sql:1192`; molde nas
0051/0055) com os gatilhos de prova imutável (`schema.sql:1210`, `:1245`).

## E) Base legal

`ropa_records.legal_basis` (texto) + `base_legal_id → requisitos` (uma só). Catálogo: `src/data/lgpd.ts:36-46` (art. 7, incisos I–X,
ids `lgpd:art7:i`…) e `:50-58` (art. 11, I e II a–g). A fonte `gdpr` existe sem requisitos (`src/services/requisitos.ts:25`; LGPD e
GDPR entram por material jurídico revisado, regra do `AGENTS.md`). Usos de `base_legal_id|legal_basis`
(`git grep -nE "base_legal_id|legal_basis" -- 'src/*.ts' 'frontend/src/*.js' 'mcp-server-niso/src/*.ts' ':!*.test.ts' | cut -d: -f1 | sort | uniq -c`):
14 arquivos, os mais densos `mcp-server-niso/src/ferramentas.ts` (13), `src/routes/ropa.ts` (8), `src/services/copiloto-ropa.ts` (7),
`frontend/src/bases-legais.js` (5), `frontend/src/views/privacy.js` (5), `src/services/encarregado.ts` (5).
LIA exigida por texto (`src/services/lia.ts:11`); encarregado cruza a base com o catálogo (`encarregado.ts:37-39`); relatório
imprime `legal_basis` (`ropa.ts:377`); importação casa texto com o catálogo (`src/services/importacao.ts:516`).

**Várias bases.** Tabela de ligação `tratamento_bases (ropa_id, requisito_id, project_id, PK (ropa_id, requisito_id))`, no molde
de `documento_requisitos`. Custo: rota de ligação (faixa `privacy`, entrar em `SUBROTAS_PRIVACY`), entrevista (`base` é escolha
única, `ropa-entrevista.js:170-172`), encarregado, LIA exigida (qualquer base de legítimo interesse), relatório, MCP. **Hash:** manter
`base_legal_id` como a base principal (já congelada) e congelar só as ADICIONAIS como lista `soSeMarcado`; não fazer backfill de
`base_legal_id` para a tabela nova pelo hash (ou o conteúdo muda). **GDPR:** coluna `base_gdpr` (texto/enum art. 6(1)(a–f)) com
`soSeMarcado`, ou requisitos `gdpr:art6:*` no catálogo (depende de material jurídico).

## F) Fornecedores

- `vendors` (`schema.sql:523-548`): perfil de segurança ISO da parte organização (flags has_iso27001, has_mfa, …, trust_score,
  dpa_signed, `parte_id` UNIQUE, `:1328`); gatilho `vendor_perfil_do_terceiro` (`:1330`) cria o perfil quando a parte vira
  terceiro. Rotas `src/routes/vendors.ts:35-141`, faixa `nucleo` (`modulos.ts:25`, `:67`).
- Terceiro do n.privacy: `partes.terceiro_tipo` (`schema.sql:1308`), `avaliacoes_terceiro` (`:1528-1541`: método, resultado,
  validade, link), `documento_partes` (DPA). Rotas `src/routes/terceiros.ts:13-53`, faixa `privacy`. Método pelo tipo:
  `METODO_DO_TIPO` (`src/services/terceiros.ts:14`).
- **Questionário de fornecedor: não existe.** `questionario` é só um rótulo de método (`terceiros.ts:10`, `terceiros.js:9`); a tela de
  fornecedor tem checkboxes de postura (`grc.js:657`). Não há envio por e-mail/link, perguntas, respostas nem %.
- Padrões reaproveitáveis de link público com token: questionário da pré-venda (`GET/POST /api/v1/assessments/public/:token`,
  `src/routes/assessments.ts:87`, `:106`, isento de sessão em `:17-19`), pedido público com código (`/api/v1/public/pedidos/*`) e
  portal do auditor (token no corpo, só hash no banco).
- Falta: modelo de questionário, envio (token por terceiro, hash no banco, validade), página pública, respostas, cálculo de %
  respondido, e o resultado virar `avaliacoes_terceiro` (o método `questionario` já existe).

## G) Painel e exportação

- Painel do encarregado: `src/services/encarregado.ts:19-118` (pedidos com `situacao_prazo` e "vence em 7 dias", `:65-70`;
  tratamentos sem base/DPIA/LIA, `:37-39`; terceiros vencidos, `:42-44`; evidência, `:58-59`; documentos, `:89`; prazos legais, `:94`).
  Faixas de prazo já calculadas para pedidos; riscos e gaps não entram.
- Painel n.iso: `src/routes/platform.ts:342-354` e `:391`.
- CSV: `src/routes/integrations.ts:338-393` (risks, vendors, training, audit-log, assets), com `safeCsvCell`; nenhum de RoPA,
  DPIA, LIA, CAPA. **Excel (.xlsx) não existe**: nenhuma biblioteca no `package.json` raiz (`agents, docx, hono, zod, …`) nem no
  frontend. Lê-se xlsx só na importação, por `env.AI.toMarkdown` (`importacao.ts:258`). O degrau mais barato é CSV com BOM
  `﻿` (Excel abre direto), padrão já usado em `frontend/src/views/tratamento-ligacoes.js:248`.
- Impressão: relatório HTML do RoPA (`ropa.ts:343`, tela `privacy.js:553`) e do RIPD (`platform.ts:189-215`, tela `privacy.js:620`).
  **Não há relatório de LIA.** A biblioteca `docx` já está instalada e usada em `src/services/documento-docx.ts:7`.

## H) Projeto existente

### Ordem segura (vale para os três cenários)

1. `npm run db:backup` (`package.json:16`).
2. Migration só com `ALTER TABLE ... ADD COLUMN` com DEFAULT/NULL e `CREATE TABLE` novas (o padrão da 0069 e da 0070); nada que
   reconstrua `ropa_records`, `dpia_assessments` ou `pedidos`. Mesma mudança em `schema.sql` (índice depois da tabela).
3. Aplicar: pelo terminal (`npx wrangler d1 migrations apply niso-db --remote`) antes do merge, ou mergear, deixar o deploy recusar
   (`.github/workflows/deploy.yml:73-78`) e rodar `db-migrate.yml`, depois o deploy.
4. Conferir com `PRAGMA table_info(...)` e sondar `/health` (regra número um do `AGENTS.md`).
Os gatilhos `projeto_modulos_do_contrato` (`migrations/0060_*.sql:7`) e `usuario_modulos_padrao` (`migrations/0066_*.sql:37`) **não
precisam ser reaplicados** se nenhum módulo novo for criado: tudo o que se propõe aqui é do n.privacy ou do núcleo.

### Cenário 1: projeto só n.iso com riscos, ações e ativos que liga o n.privacy depois

- Ligar roda `importarPartes`, `conciliarResponsaveis` e `importarDocumentos` (`src/routes/nucleo.ts:64-75`), cada uma em try/catch;
  não toca riscos nem CAPA. Os riscos e CAPAs existentes ficam com `ropa_id` NULL (coluna nova com padrão NULL): **sem backfill**,
  porque não há como saber a que atividade um risco ISO pertence. Ligar fica como ação humana (ou sugestão por nome do ativo:
  `risks.asset_id → itens ← tratamento_itens`, que dá candidatos sem decidir).
- `conciliarResponsaveis` já liga `risks.owner` e `corrective_actions.assigned_to` à parte (`src/services/partes.ts:76-81`).
- A regra R1 do `coherence` passaria a ver riscos de privacidade `Mitigate` sem controle como erro (`coherence.ts:40-49`): ajustar
  para ignorar risco com `ropa_id` ou exigir controle só de risco ISO.
- Permissão: a pessoa só com n.privacy num projeto com os dois não pode cair nas rotas `risks`/`capa` (faixa iso); precisa das rotas
  da atividade.

### Cenário 2: projeto já com n.privacy e RoPA/DPIA aprovados

- O risco central é o hash (seção D). Nenhuma coluna nova pode entrar em `DOCUMENTOS.tratamento.colunas` ou `COLUNAS_DPIA` fora de
  `soSeMarcado`; nenhuma lista existente pode mudar de SQL. Riscos, gaps, ciclo de vida e teste de impacto ficam **fora** do conteúdo
  congelado do tratamento na primeira entrega (o RoPA aprovado é o registro do art. 37; o resto é instrução dele). Se o dono quiser
  que mudar um risco invalide a aprovação, entra como lista `soSeMarcado` que vale NULL enquanto vazia.
- Teste de não regressão obrigatório: para um tratamento aprovado antes da migration, `aprovacoesDoProjeto(..., 'tratamento')`
  continua devolvendo CISO e CEO depois dela (molde: o comentário da 0069 em `pedidos.ts:139`, `test/ropa-riscos-lgpd.test.ts`).
- DPIA aprovada: mesma regra para `COLUNAS_DPIA`. As 11 respostas não podem entrar na DPIA existente; servem às DPIAs novas.
- `dpia_required` existente continua sendo a decisão; a recomendação nova (servidor) só aparece como sugestão quando discordar.

### Cenário 3: projeto que vem do legado por importação

- Entidades aceitas hoje: CHECK de `importacao_itens.entidade` (`schema.sql:1677`): tratamento, terceiro, documento, dpia, lia,
  titular_pedido, incidente, consentimento. Riscos, gaps, ciclo de vida, teste de impacto e várias bases exigem: ampliar o CHECK
  (reconstrução de `importacao_itens`, tabela sem prova imutável, custo baixo), esquema estrito novo em `src/schemas/importacao.ts`,
  `gravarX` em `src/services/importacao.ts` casando a atividade por finalidade normalizada (`finalidades.get(chave(...))`, como
  `gravarAvaliacao`, `:857-862`), e a ordem da confirmação (tratamentos primeiro, `importacao.ts:568-603`).
- DPIA importada hoje só traz `conclusao` e `riscos` como texto em `risks_identified` (`importacao.ts:878-886`); a LIA joga tudo no
  `balanceamento` (`:866-871`). Para trazer o RIPD e a LIA do legado com estrutura, o `avaliacaoPropostaSchema`
  (`src/schemas/importacao.ts:70-74`) precisa dos campos de cada um.

### Contratos que reprovam (para qualquer cenário)

| Contrato | O que exige |
|---|---|
| `test/modulos-produto.test.ts:17-21`, `:34-39` | toda rota de projeto com faixa; toda tabela de recurso por id com faixa |
| `test/contrato-isolamento-org.test.ts:359-470` | semeia toda tabela com `project_id` (tabela nova entra sozinha); rota POST/PUT sem parâmetro precisa estar em `CRIA_COM_REFERENCIA` ou `SEM_RECURSO_ALHEIO` |
| `test/trilha-exclusao.test.ts` | todo DELETE classificado em `src/trilha-exclusao.ts:16-33` |
| `test/colunas-catraca.test.ts:94` | coluna escrita em INSERT/UPDATE existe no `schema.sql` |
| `test/schema-contract.test.ts:52` | `schema.sql` aplica limpo em banco novo |
| `test/openapi.test.ts:80-91`, `:127` | rota que valida corpo no contrato (`src/openapi.ts`) e `docs/openapi.json` regenerado |
| `test/contrato-mcp.test.ts:25`, `:82` | `contrato-gerado.ts` em dia; **exatamente 39 ferramentas** (`grep -cE '^\s+name: "niso_' mcp-server-niso/src/ferramentas.ts` → 39): ferramenta nova muda o número no teste |
| `test/any-catraca.test.ts:19` | `TETO = 532` |
| `src/middleware/agente.ts:82` (`FORA_DO_AGENTE`) | decidir o que o agente não faz (concluir teste de impacto, aprovar homologação) |
| portabilidade (`src/portabilidade.ts:173`) | tabela nova precisa de `project_id` para ser exportada e apagada com o projeto |

## I) Testes que cobrem as áreas e catracas

Contagens por `git grep -lE "<padrão>" -- 'test/*.ts' 'frontend/test/*.js' 'frontend/e2e/*.js' | wc -l`:
riscos (`risks|risk_history|/risks`) 51; CAPA (`corrective_actions|/capa`) 20; RoPA (`ropa_records|/ropa`) 50; DPIA
(`dpia_assessments|/dpia`) 31; LIA (`lia_assessments|/lia`) 10; importação (`importacao`) 8.

Quebram ou exigem ajuste conforme a opção escolhida:
- **Mudar faixa de `risks`/`capa`:** `test/modulos-produto.test.ts` (`:28`, `:36`, `:89`), `test/modulos-por-pessoa.test.ts`
  (`:80-132`), `test/incidente-nucleo.test.ts` (`:50-65`), `frontend/test/produto.test.js` (`:279-305`), `frontend/test/casca-menu.test.js:61`,
  `test/agente-auditor.test.ts:99-100`, `test/mcp-remoto.test.ts:93-137`.
- **Coluna nova em `risks`/`corrective_actions`:** `test/colunas-catraca.test.ts`, `test/modulos-crud.test.ts:44`,
  `test/risco-responsavel.test.ts`, `test/ropa-capa-responsavel.test.ts`, `test/agente-gap-traceability.test.ts:69-96`
  (`niso_update_risk` reenvia uma lista fixa de campos, `ferramentas.ts:752`: campo novo some se não entrar nela),
  `test/coherence.test.ts`, `test/portabilidade.test.ts`, `test/refs-entre-projetos.test.ts`, `test/idor-tenant*.test.ts`.
- **Hash do tratamento/DPIA:** `test/tratamento-aprovacao.test.ts`, `test/pedidos-prova.test.ts`, `test/pedidos.test.ts`,
  `test/dpia-aprovacao.test.ts`, `test/ropa-riscos-lgpd.test.ts`.
- **Entrevista e ligações:** `frontend/test` da entrevista e de ligações, `test/tratamento-ligacoes.test.ts:167`, `test/lia-dpia.test.ts`.
- **Importação:** `test/importacao.test.ts`, `test/importacao-decidir-lote.test.ts`, `test/migration-0064`/`0067`/`0068`.
- **Avisos:** `test/avisos-prazo.test.ts` (fonte nova ou `TELA` por módulo).

## J) Importação

`src/services/importacao.ts` (968 linhas, `wc -l`): `MAX_TEXTO = 200_000` (`:34`), `BLOCO = 4_000` (`:36`),
`ITENS_POR_CONFIRMACAO = 30` (`:536`); tipos de arquivo `inventario|terceiros|documento|avaliacao|historico|desconhecido`
(`src/agents/importacao.ts:9`). Para o legado:

| Entidade nova | Campos mínimos do esquema estrito | Ligação |
|---|---|---|
| `risco` | atividade, motivo (ameaça), impacto 1–5, probabilidade 1–5 (ou nível baixo/médio/alto mapeado), estratégia aceitar/reduzir/evitar, residual, prazo, responsável | atividade por finalidade normalizada; responsável por nome de parte (`resolver`, `importacao.ts:624-638`) |
| `gap` | atividade, lacuna, responsável, prazo, status | idem; grava em `corrective_actions` com `ropa_id` |
| `impacto` | atividade, 11 respostas sim/não/não sei | idem |
| `ciclo` | atividade, etapa, situação, item (nome) | item por nome normalizado (já cria `itens` no tratamento, `:637`) |
| RIPD/LIA com estrutura | campos de cada seção | trocar o `avaliacaoPropostaSchema` (`src/schemas/importacao.ts:70`) |

"Limite de ferramentas": o MCP tem 39 ferramentas fixadas em teste (`test/contrato-mcp.test.ts:82-83`); a importação não é
ferramenta do agente (POST/PUT/DELETE de `/importacoes` em `FORA_DO_AGENTE`, GET cortado por `ehEquipeNess`).

---

## Pré-preenchimento hoje (pedido do dono: nunca perguntar de novo)

### 1. DPIA nasce do tratamento

`criarDpiaDoTratamento` (`src/services/lia.ts:74-96`) lê só `processing_purpose, data_subjects, data_categories` (`:78`) e as
ligações. Herda: `processing_name` ← finalidade; `system_name` ← nomes dos itens; `data_subjects_types` ← titulares;
`personal_data_categories` ← categorias; `data_flow_description` ← texto montado com itens, departamentos, partes e
transferências (`:83-88`). **Não herda:** base legal, dados sensíveis, crianças, retenção, destinatários, salvaguardas, `dpia_required`
e a recomendação (os motivos de RIPD não são gravados), riscos e medidas, responsável, encarregado, controlador.
O **"Novo RIPD" manual** (`frontend/src/views/privacy.js:451-485`) não escolhe a atividade, não liga `ropa_id` e pergunta tudo de
novo: é o caminho que mais repete pergunta.

### 2. LIA

`salvarLia` (`lia.ts:33-65`) grava só o que veio, nada do RoPA. A entrevista pré-preenche a LIA com a LIA gravada
(`ropa-entrevista.js:309`) e mostra o bloco só com base de legítimo interesse (`:177`). O rascunho do agente
(`niso_privacy_rascunhar_lia`, `ferramentas.ts:546`) também só grava os 4 textos; `sugerirTratamento` lê finalidade, categorias,
titulares, destinatários e transferência (`src/services/rascunhos-privacy.ts:52`). Na importação a LIA recebe conclusão e riscos no
`balanceamento` (`importacao.ts:866-871`). Não há relatório de LIA.

### 3. Entrevista do RoPA

Puxa do cadastro (`ropa-entrevista.js:258-269`): pessoas (`partes?tipo=pessoa`), departamentos, itens (`/assets`), o RoPA, as
ligações e a LIA. Revisão: `respostasDoRegistro` (`:284-320`) recupera finalidade, responsável (parte ou texto), áreas e sistemas
(das ligações), titulares, criança, categorias e sensíveis, base (`legal_basis` ou catálogo) e motivo deduzido, consentimento, LIA,
destinatários, retenção, transferência e `ripd`. **Pergunta de novo sempre** as `semColuna`: `volume` (`:153`), `decisao_auto`
(`:164`), `origem` (`:187`), `eliminacao` (`:205`), `impacto` (`:219`). Também: o país da transferência volta vazio (`:316`, `pais: ''`)
porque só a salvaguarda está na linha; destinatários das Ligações (partes) não aparecem na pergunta de destinatários (`:198-200`
manda ligar "depois"); a DPIA criada pela entrevista não recebe nada que a entrevista ouviu além do que já está no registro
(`:1072-1074` chama a rota sem corpo).

### 4. Dados da empresa (`empresas`, 0071, branch `feat/novo-projeto-dados-empresa`, não mergeada)

Tabela 1:1 com o projeto (razão social, CNPJ ou documento alternativo, endereço completo, CNAE, porte, representante nome e cargo;
backfill de `projects.cnpj/client_name/sector/employee_count`). Serviço com `lerEmpresa`, `gravacaoDaEmpresa`,
`espelhoDoPerfilAntigo`, `gravacaoDasPessoas` (DPO vira parte com vínculo `encarregado`). **Quem usa na branch:** só o cabeçalho do
relatório do RoPA (controlador, CNPJ, endereço e encarregado; diff em `src/routes/ropa.ts` da branch, linhas 346-363 e 450) e o
espelho do perfil antigo (`governance.ts`). **Quem deveria usar e não usa:** relatório do RIPD (`platform.ts:189-215` usa
`projects.*`), LIA (não tem relatório), comunicação de incidente (`rascunhos-privacy.ts:112-116` usa `projects.client_name` como
controlador), copiloto do RoPA (`copiloto-ropa.ts`, contexto sem empresa), roteiro e ferramentas do agente (`src/mcp/contexto.ts`),
exportações CSV/Excel. Representante legal: hoje nenhum relatório imprime.

### 5. Campos repetidos entre RoPA, DPIA e LIA

| Dado | RoPA (`ropa_records`) | DPIA (`dpia_assessments`) | LIA |
|---|---|---|---|
| Atividade/finalidade | `processing_purpose` | `processing_name` (+ `system_name` na tela) | (vem do `ropa_id`) e `finalidade_legitima` reescreve o interesse |
| Titulares | `data_subjects` | `data_subjects_types` | — |
| Categorias | `data_categories` | `personal_data_categories` | — |
| Sensíveis / crianças | `dados_sensiveis`, `criancas_adolescentes` | `data_category_risk` (texto livre) | — |
| Sistemas | `tratamento_itens` | `system_name` (cópia em texto) | — |
| Fluxo / áreas / partes / transferências | ligações | `data_flow_description` (cópia em texto) | — |
| Necessidade | — | `necessity_proportionality` | `necessidade` |
| Riscos | — | `risks_identified` (texto) | dentro de `balanceamento` |
| Medidas | — | `mitigation_measures`, `technical_measures` | `salvaguardas` |
| Base legal | `legal_basis`, `base_legal_id` | ausente | implícita |
| Controlador/encarregado | projeto/empresa/vínculo | ausente | ausente |

Regra proposta: **origem única é o RoPA e o cadastro**; DPIA e LIA guardam só o que é delas (necessidade, riscos, medidas, parecer,
conclusão). Os campos copiados (`processing_name`, `data_subjects_types`, `personal_data_categories`, `system_name`,
`data_flow_description`) passam a ser exibidos a partir do RoPA ao vivo enquanto a DPIA é rascunho e congelados quando ela é
aprovada (é o que o hash já faz). Riscos e medidas da DPIA e da LIA passam a ler os riscos da atividade (seção A), sem segundo texto.

### 6. Divergência sem invalidar aprovação

Mecanismo pronto para reaproveitar: hash canônico (`hashConteudo`, `pedidos.ts:89`). Proposta: ao criar a DPIA/LIA guardar
`origem_hash` = hash do conteúdo do tratamento naquele momento (coluna nova, nullable; fora de `COLUNAS_DPIA`, então não toca
aprovação). Em leitura, comparar com `documentoAtual(db, 'tratamento', ...)` (`pedidos.ts:147-155`): diferente → selo
"RoPA mudou depois desta DPIA/LIA" com o diff das chaves (o conteúdo é JSON por chave). Não altera a DPIA, não substitui pedido,
não derruba aprovação; a pessoa decide "atualizar a partir do RoPA" (só nos campos herdados) ou "manter". Linhas antigas
(`origem_hash` NULL) aparecem sem selo até a primeira atualização.

### Matriz campo × origem × onde preencher

| Campo | Origem (única) | Onde se preenche | Quem só lê |
|---|---|---|---|
| Controlador, CNPJ, endereço, representante | `empresas` (0071) | Dados da empresa | relatórios RoPA/RIPD/LIA, comunicação de incidente, copiloto, agente |
| Encarregado | `parte_vinculos` `encarregado` (0062) | Partes / governança | idem |
| Atividade, titulares, categorias, sensíveis, crianças, retenção | `ropa_records` | entrevista do RoPA | DPIA, LIA, relatório, agente |
| Base legal (principal e adicionais, GDPR) | `ropa_records.base_legal_id` + ligação nova | entrevista (base) | LIA exigida, encarregado, relatório |
| Sistemas, áreas, partes, transferências | ligações (0054) | entrevista e Ligações | DPIA (fluxo), diagrama, relatório |
| Ciclo de vida por etapa | tabela nova ligada ao tratamento | entrevista (blocos E/G, hoje `semColuna`) | RIPD, relatório |
| Teste de impacto (11 perguntas) e recomendação | tabela nova + cálculo no servidor | entrevista (bloco H) | `dpia_required` sugerido, RIPD, painel |
| Riscos da atividade | `risks` com `ropa_id` | tela da atividade (n.privacy) e matriz (n.iso) | RIPD (riscos e medidas), LIA (balanceamento), painel |
| Gaps da atividade | `corrective_actions` com `ropa_id` | tela da atividade e CAPA (n.iso) | painel, avisos de prazo |
| Necessidade, parecer, conclusão do RIPD | `dpia_assessments` | tela do RIPD | relatório |
| Interesse, balanceamento, conclusão da LIA | `lia_assessments` | entrevista (bloco D) e Ligações | relatório de LIA (novo) |

---

## Decisões de arquitetura

**D1. Onde moram os riscos da atividade.**
- (a) `risks` inteira para `nucleo`. Prós: zero tabela nova, uma matriz. Contras: alarga acesso de quem foi negado ao n.iso
  (`modulos-por-pessoa.test.ts:103`), deixa `/risk-matrix`, coherence e rastreabilidade incoerentes, quebra 7+ testes de faixa.
- (b) **visão filtrada**: `risks` ganha `ropa_id` (nullable, FK `ropa_records` ON DELETE SET NULL), faixa da tabela continua `iso`,
  e o n.privacy lê/escreve por sub-rotas da atividade (`/ropa/:rid/riscos[/:id]`, em `SUBROTAS_PRIVACY`) que só alcançam linha com
  `ropa_id` daquele tratamento. Prós: um cadastro; quando o n.iso é ligado, os riscos de privacidade já estão na matriz; nada de
  permissão alargada. Contras: as rotas por id do n.iso (`PUT /api/v1/risks/:id`) continuam `iso`, então o n.privacy precisa das suas;
  ajustar R1 do coherence; o PUT do n.iso precisa preservar `ropa_id` (defeito do PUT inteiro, seção A).
- (c) tabelas próprias do n.privacy. Prós: isolamento total. Contras: é exatamente o cadastro duplicado que o dono não quer; o n.iso não vê
  riscos de privacidade (27701 pede).
**Recomendação: (b).** É o modelo que o código já usa para RoPA (registro no núcleo, camada nova em `SUBROTAS_PRIVACY`,
`modulos.ts:39-46`) e para CAPA de incidente (0063). Corrigir junto o PUT de risco para parcial.

**D2. Gaps.** (a) `corrective_actions` + `ropa_id`, com sub-rotas da atividade como em D1; (b) tabela nova. **Recomendação: (a)**;
`refForaDoProjeto` já valida `ropa_id` (`helpers.ts:337`). Ajustar `TELA` dos avisos para levar à atividade quando o projeto não tem
n.iso (`avisos-prazo.ts:217`).

**D3. Risco residual e prazo do risco.** (a) colunas novas em `risks` (`residual_impact`, `residual_probability`, `due_date`); (b) só
CAPA. **Recomendação: (a)** para residual (é atributo do risco, também falta à ISO 6.1.3) e prazo via CAPA ligada (`risk_id`) para não
ter dois prazos; se o legado traz prazo no risco, importar como CAPA.

**D4. Teste de impacto.** (a) colunas em `ropa_records`; (b) tabela `tratamento_impacto (ropa_id, pergunta, resposta)`.
**Recomendação: (b)**: as perguntas são catálogo (11 hoje, podem mudar), não entram no hash, e o cálculo da recomendação vai para o
servidor. `dpia_required` continua decisão humana.

**D5. Várias bases legais.** (a) tabela de ligação para bases adicionais + `base_legal_id` como principal; (b) migrar tudo para a
ligação. **Recomendação: (a)**: (b) muda o hash de todo tratamento aprovado.

**D6. Ciclo de vida.** (a) `etapa` em `tratamento_itens` (refaz PK, mexe no hash da lista `itens`); (b) tabela nova.
**Recomendação: (b).**

**D7. Questionário de fornecedor.** (a) estender `vendors` com flags; (b) questionário próprio (modelo, envio por token, respostas)
cujo resultado vira `avaliacoes_terceiro` com método `questionario`. **Recomendação: (b)** reaproveitando o padrão do link público
da pré-venda (`assessments.ts:87-106`).

**D8. Excel.** (a) CSV com BOM; (b) biblioteca xlsx. **Recomendação: (a)** primeiro (o Excel abre; nenhum dependência nova); (b) só se
o dono exigir abas/formatação. RIPD/LIA para Word: `docx` já instalado.

## Matriz mudança × o que toca

| Mudança | Arquivos | Tabelas | Testes | Contratos |
|---|---|---|---|---|
| `risks.ropa_id` + residual + rotas da atividade | `schema.sql`, migration, `src/routes/risks.ts` (PUT parcial), rota nova em `ropa.ts`, `src/modulos.ts` (`SUBROTAS_PRIVACY`), `services/coherence.ts`, `grc.js`, `tratamento-ligacoes.js`, `ferramentas.ts:752` | `risks`, `risk_history` | modulos-produto, colunas-catraca, coherence, risco-responsavel, agente-gap-traceability, contrato-isolamento-org | openapi, contrato MCP |
| `corrective_actions.ropa_id` + rotas da atividade | `capa.ts:22`, `:69`, rota nova, `avisos-prazo.ts:89`, `:217`, `grc.js:1133+` | `corrective_actions` | modulos-crud, incidente-nucleo, avisos-prazo, ropa-capa-responsavel | openapi |
| Teste de impacto | migration, serviço novo, `ropa-entrevista.js:109-229`, `tratamentos.ts:112` | `tratamento_impacto` | entrevista (frontend), ligações | openapi; fora do hash |
| Ciclo de vida | migration, serviço, entrevista (`:187`, `:205`), relatório RoPA/RIPD | `tratamento_ciclo` | portabilidade, isolamento | openapi |
| Várias bases + GDPR | migration, `ropa.ts`, `bases-legais.js`, entrevista `:171`, `lia.ts:11`, `encarregado.ts:37`, `pedidos.ts:125-141` (`soSeMarcado`) | `tratamento_bases`, `ropa_records` | tratamento-aprovacao, pedidos-prova, encarregado, lia-dpia | openapi, MCP |
| Pré-preenchimento DPIA/LIA + selo de desatualizado | `lia.ts:74-96`, `privacy.js:451-485`, relatório RIPD `platform.ts:189` | `dpia_assessments.origem_hash`, `lia_assessments.origem_hash` | lia-dpia, dpia-campos-tela, dpia-aprovacao | fora do hash |
| Empresa nos relatórios/agente | `platform.ts:189`, relatório LIA novo, `rascunhos-privacy.ts:112`, `copiloto-ropa.ts`, `mcp/contexto.ts` | `empresas` (0071) | empresa (branch) | depende do merge da 0071 |
| Painel com faixas e exportação | `encarregado.ts`, `integrations.ts` (CSV com BOM; corrigir faixa do `export/risks`) | — | encarregado, contrato-isolamento-org | openapi |
| Questionário de fornecedor | rotas públicas novas, `terceiros.ts`, tela pública | `terceiro_questionarios`, respostas | isolamento, trilha-exclusao, pedidos-publico (molde) | openapi |
| Importação das entidades novas | `schemas/importacao.ts`, `services/importacao.ts`, `agents/importacao.ts` | `importacao_itens` (CHECK de `entidade`, reconstrução) | importacao, importacao-decidir-lote, migration nova | — |

## Adequações exatas para um projeto existente

1. Backup (`npm run db:backup`) e migration aditiva: colunas novas nullable/DEFAULT em `risks`, `corrective_actions`,
   `dpia_assessments`, `lia_assessments`; tabelas novas com `project_id NOT NULL REFERENCES projects ON DELETE CASCADE` (portabilidade e
   cascata). Mesma mudança no `schema.sql`.
2. Nenhum backfill em riscos e CAPAs (`ropa_id` fica NULL); oferecer "ligar à atividade" na tela, com candidatos por
   `risks.asset_id ∈ tratamento_itens`.
3. Nenhuma chave nova no conteúdo congelado do tratamento ou da DPIA fora de `soSeMarcado`; teste de não regressão com tratamento e
   DPIA aprovados antes da migration mantendo a aprovação.
4. `origem_hash` NULL nas DPIAs/LIAs existentes: sem selo até a primeira atualização a partir do RoPA.
5. Respostas da entrevista hoje não gravadas (`volume`, `decisao_auto`, `impacto`, `origem`, `eliminacao`) começam vazias: a primeira
   revisão de cada atividade as pergunta uma vez; depois nunca mais.
6. Bases legais: `base_legal_id` existente vira a principal sem cópia; adicionais só por ação humana ou importação.
7. Faixas: novas sub-rotas em `SUBROTAS_PRIVACY`; `risks`/`capa`/`FAIXA_DA_TABELA` sem mudança; corrigir `export/risks` (hoje
   `nucleo`) para exigir n.iso ou filtrar por faixa.
8. Pessoas e papéis: nenhum gatilho a reaplicar (0060, 0066); nenhuma concessão nova em `usuario_modulos`. Agente: decidir e registrar
   em `FORA_DO_AGENTE` (concluir teste de impacto, aprovar homologação, aceitar risco).
9. Avisos: `TELA` da fonte `capa` passa a depender do módulo do projeto; fonte nova só se o risco tiver prazo próprio (D3 diz que não).
10. Corrigir antes o PUT de risco para parcial (defeito atual que apaga `asset_id`, `treatment_plan`, aceite e status na edição pela tela).
11. Contratos: `docs/openapi.json` e `contrato-gerado.ts` regenerados; contagem de ferramentas MCP atualizada se houver ferramenta nova;
    `TETO` do `any` não pode subir.
12. Ordem: migration aplicada e conferida por `PRAGMA table_info` antes do deploy (o deploy recusa migration pendente), sonda no
    `/health` com o SHA esperado.
