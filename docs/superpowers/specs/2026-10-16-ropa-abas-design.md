# RoPA em abas, clone do legado (fase 1)

Data: 16/10/2026. Redesenho da atividade de tratamento do n.privacy: a tela passa a ser a "Registro da atividade" do legado (cabeçalho e nove abas livres), com os dados do ciclo de vida por etapa, sem perder a entrevista guiada, o pré-preenchimento, a aprovação por pedido com hash e o cadastro compartilhado com o n.iso. Decisões do dono do produto de 16/10/2026 (nota `nprivacy-paridade-telas-legado` da memória do dono), fechadas em conversa; este texto as traduz em modelo, contrato, entrega e riscos. Plano de execução em [`docs/superpowers/plans/2026-10-16-ropa-abas.md`](../plans/2026-10-16-ropa-abas.md).

Fontes lidas: 40 capturas do legado (leituras de analistas em três partes; duas conferidas direto no PNG), `AGENTS.md`, `PRODUCT.md`, `design.md`, a spec e o plano da Bancada (`2026-10-15-bancada-trilha*`, molde de fatiamento), a pesquisa de código do legado (`2026-10-14-legado-pesquisa-de-codigo.md`) e o plano F1-F6 (`2026-10-14-legado-privacidade.md`). Todo `arquivo:linha` aponta para `origin/main` em `2c50ac5`.

## 1. Problema

A F1-F6 trouxe ao n.privacy as **capacidades** do legado (teste de impacto, riscos e ações por atividade, ciclo de vida, bases extras, exportação, homologação, importação), não a **estrutura**. Quem vem do legado abre uma atividade e encontra outra coisa:

- A atividade do n.360 é uma entrevista em oito blocos (A a H, `frontend/src/views/ropa-entrevista.js:41`, 1.228 linhas) que só grava no fim (`montarPayload`, `:399`), mais uma página de cinco etapas (`frontend/src/views/atividade.js:32`, `etapasDaAtividade`) e um modal de "Ligações" (`frontend/src/views/tratamento-ligacoes.js:138`). O legado é um cabeçalho e nove abas, sem assistente e sem botão "Salvar" global.
- O ciclo de vida do dado existe como **uma linha por etapa com um sistema só** (`tratamento_ciclo`, `migrations/0074_ciclo_e_bases.sql`, PK `(ropa_id, etapa)`, `item_id` único). O legado guarda, **por etapa**, descrição, vários ativos, áreas ou parceiros e, **por titular**, o subconjunto de dados pessoais usado naquela etapa. É o núcleo do legado e não cabe no modelo atual.
- O RoPA do n.360 tem titulares e categorias como **texto livre separado por vírgula** (`ropa_records.data_subjects`, `data_categories`, `schema.sql:577`), sem catálogo, sem marca de dado sensível por item e sem ligação titular com dado.
- A base legal é uma principal mais adicionais sem finalidade própria (`src/services/bases.ts`); o legado pede finalidade obrigatória por inciso, art. 11 separado e o GDPR com as seis bases.
- Medidas de segurança, descrição da atividade, volume mensal e papel (controlador, operador) não têm lugar no modelo.

**Meta.** Quem migra do legado reconhece a tela, a ordem das abas e os rótulos, e **perde nada** do que o n.360 já tem de melhor: entrevista guiada com copiloto, "nunca perguntar duas vezes", aprovação por pedido com conteúdo congelado e hash, cadastro único com o n.iso.

## 2. Decisões do dono (não reabrir)

1. A tela **Registro da atividade**: cabeçalho (empresa, responsável, áreas, status, descrição, menu "Ações") e **nove abas livres**, sem assistente e sem botão global de salvar: **Escopo, Tratamento de Dados, Agentes de Tratamento, Medidas de Segurança, Base Jurídica, Controle de GAPs, Teste de Impacto, Riscos, Logs ROPA**. Gravação por campo (autosave) ou por confirmação de modal.
2. **Tratamento de Dados** clona as seis etapas do legado (Coleta, Uso ou Processamento, Compartilhamento Interno, Compartilhamento Externo, Armazenamento, Eliminação), modelado **por etapa** em tabelas novas e aditivas. Catálogos (tipos de titular, dados pessoais com marca de sensível, ativos, áreas, parceiros) com "+" inline e busca.
3. **Medidas de Segurança**: lista própria (Medida, Status, Descrição, excluir) **e** ligação opcional a um controle **implementado** do Anexo A do n.iso quando o projeto tem n.iso (sem redigitar).
4. **Base Jurídica**: previsão legal; art. 7º da LGPD por inciso com finalidade obrigatória; art. 11 separado com "Não Aplicável"; GDPR com as seis bases e finalidade; inciso já usado fica travado no seletor.
5. **Controle de GAPs**: Gap, Recomendação, Plano de ação, Responsável, Prazo, Status, anexo PDF ou DOC de até 5 MB, "Não Aplicável" da atividade. Estende `corrective_actions` (F2), não duplica.
6. **Teste de Impacto, Riscos, Logs**: reaproveitam F1/F2 e a trilha; rótulos e layout alinhados ao legado.
7. **Status e Ações** no cabeçalho, mapeados sobre a aprovação por pedido **sem enfraquecê-la** (seção 6). O agente de IA (MCP) nunca aprova.
8. **A entrevista fica**, realinhada às mesmas abas e na mesma ordem, gravando **nos mesmos campos**; "sem entrevista" = abrir a atividade e preencher as abas livremente. Duas portas para um modelo só.
9. **Compatibilidade**: atividades existentes (o cliente real Twyn) e suas ligações, ciclo, impacto, riscos, bases e **aprovações com hash** continuam valendo. Migration só aditiva.

Decisão tomada neste texto, para revisão do dono na seção 15: mudar um dado de etapa que alimenta o conteúdo congelado **substitui o pedido aberto e derruba a aprovação**, como mudar o mesmo dado pelo formulário antigo (seção 4.4).

## 3. Mapa do legado para o n.360 (origem única de cada campo)

A coluna "Hash" diz se o campo entra no conteúdo congelado da aprovação do tratamento (`DOCUMENTOS.tratamento`, `src/services/pedidos.ts:125-142`: 16 chaves). **Nada novo entra nesse conteúdo** (seção 4.4).

| Aba / campo do legado | Onde mora | Hash | Observação |
|---|---|---|---|
| Título da atividade | `ropa_records.nome` (novo); sem valor, `processing_purpose` | não | lista e cabeçalho mostram `nome ?? processing_purpose` |
| Empresa (leitura) | `empresas` via `lerEmpresa` (`src/services/empresas.ts`); sem cadastro, `projects.client_name` | não | |
| Responsável | `owner_parte_id` (e `owner` texto antigo) | não | já é do cadastro de partes |
| Áreas | `tratamento_departamentos` | sim (`departamentos`) | as áreas **da atividade**; o "Compartilhamento Interno" usa tabela própria |
| Descrição da atividade | `descricao_atividade` (novo) | não | até 8.000 caracteres |
| **Escopo** Finalidade | `processing_purpose` | sim | origem única; a entrevista e o copiloto escrevem aqui |
| Escopo Volume mensal | `volume_mensal` (novo) | não | texto |
| Escopo Processamento automatizado | `processamento_automatizado` (novo: `nao`, `apoio`, `decisao`) | não | `decisao` propõe "sim" em `decisao_automatizada` do teste de impacto |
| **Tratamento** por etapa | tabelas novas (seção 4.2) | não direto; escreve nas colunas do hash (4.4) | |
| **Agentes** Controlador, Operador | `papel_controlador`, `papel_operador` (novos, `NULL` = não informado) | não | |
| Agentes Transferência internacional | `international_transfers`, `transfer_safeguards`, `tratamento_transferencias` | sim | já existem; modal de transferência reaproveitado |
| Agentes Operadores e destinatários | `parte_vinculos` (`alvo_tipo = 'tratamento'`), `recipients` | sim (`partes`, `destinatarios`) | mantidos; o n.360 tem mais que o legado |
| **Medidas** | `tratamento_medidas` (novo) | não | `controle_id` opcional para o n.iso |
| **Base Jurídica** Previsão legal | `previsao_legal` (novo) | não | |
| Base art. 7º e art. 11 | principal em `base_legal_id` (hash), demais em `tratamento_bases`; `tratamento_bases.finalidade` e `ropa_records.base_legal_finalidade` (novos) | só a principal (como já é) | art. 11 "Não Aplicável": `base_art11_na` |
| Base GDPR | `tratamento_bases_gdpr` (novo, seis códigos) | não | `base_gdpr` (texto da F3) fica como "texto anterior" |
| **Controle de GAPs** | `corrective_actions` com `ropa_id` (F2) + `recomendacao` novo + `acao_anexos` novo | não | "Não Aplicável": `gaps_nao_aplicavel` |
| **Teste de Impacto** | `tratamento_impacto` (F1) + pergunta `alto_risco` | não | 1 de alto risco, 2 gerais, 11 específicas, "finalizado?" |
| **Riscos** | `risks` com `ropa_id` (F2) + `idr`, `treatment_due_date` novos | não | catálogo de motivos em `catalogo_itens` |
| **Logs ROPA** | `audit_logs` (`entity_type = 'ropa'`) | n/a | só leitura |

## 4. Modelo de dados (migration 0079)

Migration **0079** (`ls migrations/*.sql | tail -1` em `origin/main` devolve `0078_bancada_trilha.sql`). **Só aditiva**: `ALTER TABLE ... ADD COLUMN` com `NULL` ou `DEFAULT`, `CREATE TABLE`, `CREATE INDEX`, gatilhos. Nenhuma coluna existente é reescrita; nenhuma tabela é reconstruída (nem `pedidos`, nem `ropa_records`, nem `tratamento_ciclo`). Backup antes (`npm run db:backup`, `backups/README.md`); `schema.sql` recebe as mesmas mudanças (índice depois da tabela). Sem acesso ao banco remoto nesta spec.

### 4.1 Colunas novas em tabelas existentes

| Tabela | Colunas (todas `NULL` por padrão, salvo indicação) |
|---|---|
| `ropa_records` | `nome`, `descricao_atividade`, `volume_mensal`, `processamento_automatizado` (`nao`\|`apoio`\|`decisao`), `papel_controlador`, `papel_operador` (0\|1), `previsao_legal`, `base_legal_finalidade`, `base_art11_na` (0\|1), `gaps_nao_aplicavel` (0\|1), `etapas_materializadas_em`, `reaberta_em` |
| `tratamento_ciclo` | `origem` (JSON de códigos), `solicita_consentimento` (0\|1), `descricao_etapa` (até 4.000; a coluna `descricao` da 0074 tem teto de 1.000 e fica sem uso novo), `descarte` (até 2.000), `migrado` (`NOT NULL DEFAULT 0`) |
| `tratamento_bases` | `finalidade` |
| `corrective_actions` | `recomendacao` |
| `risks` | `idr` (sequencial por atividade, com retroativo na migration), `treatment_due_date` |

Nenhuma dessas colunas aparece em `DOCUMENTOS.tratamento.colunas` nem em `COLUNAS_DPIA`. `test/colunas-catraca.test.ts:94` exige que toda coluna escrita exista em `schema.sql`.

### 4.2 Tabelas novas (todas com `project_id NOT NULL REFERENCES projects ON DELETE CASCADE`, para portabilidade e cascata)

- `catalogo_itens (id, project_id, tipo, nome, sensivel, descricao_padrao, status, created_at)`; `tipo` = `titular`\|`dado`\|`medida`\|`motivo_risco`; `UNIQUE (project_id, tipo, nome)` com `nome` sem distinção de caixa; `sensivel` só vale para `dado`; `descricao_padrao` só para `motivo_risco`. Um catálogo só para os quatro vocabulários do legado (YAGNI: quatro tabelas iguais seriam o mesmo código quatro vezes). O catálogo é **do projeto**; as sementes (seção 8.3) nascem em código, na primeira leitura, `INSERT OR IGNORE` (molde de `semearCatalogo`).
- `tratamento_etapa_itens (ropa_id, etapa, item_id, local_armazenamento, project_id)`, PK `(ropa_id, etapa, item_id)`; `item_id` → `itens` (o inventário compartilhado); `local_armazenamento` só na etapa `armazenamento`. A Eliminação **não** tem linhas: herda a leitura do Armazenamento.
- `tratamento_interno_areas (ropa_id, departamento_id, project_id)` e `tratamento_externo_parceiros (ropa_id, parte_id, project_id)`: o Compartilhamento Interno e o Externo. Duas tabelas e não uma com coluna `etapa`, porque cada uma só existe para uma etapa.
- `tratamento_etapa_titulares (ropa_id, etapa, titular_id, situacao, atualizado_por, atualizado_em, project_id)`, PK `(ropa_id, etapa, titular_id)`, `situacao` = `definido`\|`nao_usa`; e `tratamento_etapa_dados (ropa_id, etapa, titular_id, dado_id, project_id)` com chave estrangeira composta para a linha do titular na etapa (`ON DELETE CASCADE`). O titular da Coleta é a **fonte**: os das outras etapas são os mesmos, e o que falta em uma etapa é `pendente` (derivado, sem linha).
- `tratamento_medidas (id, project_id, ropa_id, medida, status, descricao, controle_id, created_by, created_at, updated_at)`; `status` = `ativa`\|`em_implantacao`\|`planejada`; `controle_id` → `compliance_controls` `ON DELETE SET NULL`.
- `tratamento_bases_gdpr (ropa_id, base, finalidade, project_id)`, PK `(ropa_id, base)`, `base` = `consentimento`, `contrato`, `interesses_legitimos`, `interesses_vitais`, `obrigacao_legal`, `tarefa_publica`. Seis códigos fixos em vez de requisitos do catálogo: o catálogo do GDPR depende de material jurídico revisado (`AGENTS.md`, nota do catálogo de requisitos; `src/services/bases.ts:8` aceita `gdpr:art6:*` quando o catálogo os tiver). Quando tiver, a tabela migra por script, sem mudar a tela.
- `acao_anexos (id, project_id, acao_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by, created_at)`; `acao_id` → `corrective_actions` `ON DELETE CASCADE`. Tabela própria em vez de `evidence`: `evidence` tem fluxo de avaliação, assinatura e validade que um anexo de gap não deve herdar.

**Integridade de tenant**: um gatilho por tabela filha (molde `tratamento_ciclo_do_projeto_ins`, `migrations/0074`) recusa tratamento, item, área, parte, titular, dado ou ação de outro projeto, inclusive em SQL direto. O serviço traduz a recusa em 400 com os ids.

### 4.3 Compatibilidade do que já existe

- `tratamento_ciclo.item_id` e `descricao` seguem; `PUT /ropa/:id/ciclo` (F3) continua e passa a ser o **adaptador antigo** do modelo novo (grava o cabeçalho da etapa e, se vier `item_id`, **acrescenta** o item à etapa). `GET .../ciclo` devolve o formato antigo. A entrevista da F3 e o MCP não quebram.
- `tratamento_itens` (hash) deixa de ser editado à mão **quando a atividade já registra ativos por etapa**: vira derivado (4.4).
- `tratamento_departamentos` (hash) é "Áreas" do cabeçalho e segue editável.
- Nenhum registro existente é reescrito pela migration, exceto o retroativo de `risks.idr`.

### 4.4 O hash: nada novo no congelado, tudo por escrita derivada

Regra do `AGENTS.md` e do plano F1-F6 (`legado-privacidade.md`, cenário 2): nenhuma chave nova no conteúdo congelado fora de `soSeMarcado`; `src/services/pedidos.ts` fica **congelado em todos os pacotes**. Os dados de etapa não entram no hash por si: eles **escrevem nas colunas que já estão nele**, e só quando a pessoa edita:

| Edição na tela | Escrita derivada (mesma transação) |
|---|---|
| Coleta: titulares e dados | `ropa_records.data_subjects` = nomes dos titulares; `data_categories` = nomes dos dados; `dados_sensiveis` = 1 se algum dado marcado sensível, senão 0 |
| Coleta: "crianças e/ou adolescentes" | `ropa_records.criancas_adolescentes` (origem única) |
| Coleta: "Solicita consentimento?" | `tratamento_ciclo.solicita_consentimento` (não hash); sem coluna no hash, o cadastro de consentimento segue por `consent_details` |
| Eliminação: Prazo | `ropa_records.retention_period` (origem única); Descarte em `tratamento_ciclo.descarte` |
| Qualquer etapa: ativos | `tratamento_itens`: **só acrescenta** o que apareceu e **só remove** o que saiu da última etapa que o tinha (não apaga o que alguém ligou por fora, como a importação) |
| Base Jurídica: principal | `base_legal_id` e `legal_basis` (texto do inciso) |
| Agentes: transferência | `international_transfers`, `transfer_safeguards` |
| Escopo: Finalidade | `processing_purpose` |

Depois de cada escrita derivada a rota chama `conferirPedidosDoDocumento(c, 'tratamento', id, projectId)` (`src/routes/pedidos.ts:40`): conteúdo mudou, pedido aberto é substituído e a aprovação antiga deixa de valer (é o que `PUT /api/v1/ropa/:id` já faz, `src/routes/ropa.ts:43`). **Escritas que não tocam coluna do hash não chamam** a conferência (descrição de etapa, medidas, gaps, riscos, impacto, volume, descrição da atividade, finalidade por inciso, papéis).

**Teste de não regressão obrigatório**: um tratamento aprovado antes da 0079, depois de a migration e a materialização (4.5) rodarem e de a tela ser aberta, continua devolvendo CISO e CEO em `aprovacoesDoProjeto(..., 'tratamento')` (molde `test/tratamento-aprovacao.test.ts` e `test/ropa-riscos-lgpd.test.ts`).

O PUT antigo (`PUT /api/v1/ropa/:id` com `data_subjects` ou `data_categories`) segue valendo **quando a Coleta ainda não tem titulares**. Com titulares na Coleta e valor diferente do derivado, responde 409 com a mensagem "Titulares e dados desta atividade são registrados na etapa Coleta" e o caminho novo (o MCP lê o erro; seção 11).

### 4.5 Migração dos dados planos para a Coleta (materialização preguiçosa e idempotente)

Os dados planos são **texto**: não dá para migrar em SQL. Como a Bancada fez com `materializarLegado` (`docs/superpowers/specs/2026-10-15-bancada-trilha-design.md`, seção 6), a migração roda no código, na **primeira leitura** de `GET .../etapas` ou `GET .../ficha` de cada atividade, uma vez (`etapas_materializadas_em`), e **só escreve nas tabelas novas**, nunca nas colunas do hash:

1. `data_subjects` dividido em `,` ou `;` e padronizado por `normalizarNome` vira titulares do catálogo (acha o existente, cria o que não houver).
2. `data_categories` idem em dados; `sensivel = 1` para o que bate com a lista fixa de dados sensíveis do código (`SENSIVEIS_CONHECIDOS`, a mesma da entrevista, `ropa-entrevista.js:50`).
3. Coleta ganha `situacao = 'registrada'`, `migrado = 1`, **cada titular com todos os dados** (o texto antigo não diz qual dado é de qual titular; o legado exige a ligação, então o n.360 parte do superconjunto e pede confirmação: faixa "Migrado do cadastro anterior: confirme os dados de cada titular", que some quando a pessoa grava os titulares da Coleta), os ativos de `tratamento_itens` e, se existir linha da F3, `descricao` e `item_id` da etapa.
4. As demais etapas ficam `pendente`, **com as linhas da F3 quando existirem** (descrição e ativo viram os da etapa).
5. `criancas_adolescentes` e `retention_period` são lidos direto (origem única), sem cópia.
6. As áreas e as partes **não** vão para a Coleta, ao contrário do que o pedido do dono supunha: a Coleta do legado não tem campo de área nem de parceiro. As áreas seguem no cabeçalho (`tratamento_departamentos`), as partes e destinatários em "Agentes de Tratamento", e o Compartilhamento Externo oferece "Adicionar como destinatário" para o parceiro ainda fora de `parte_vinculos` (ato humano, porque `partes` está no hash).

A leitura que materializa grava como `sistema` (sem `uploaded_by` humano); a trilha do passo leva `ropa.etapas_materializadas` com contagens, sem texto.

## 5. Tratamento de Dados: as seis etapas

Etapas e rótulos (ids em `src/services/ciclo.ts`, já existem): Coleta (`coleta`), Uso ou Processamento (`uso`), Compartilhamento Interno (`compartilhamento_interno`), Compartilhamento Externo (`compartilhamento_externo`), Armazenamento (`armazenamento`), Eliminação (`eliminacao`). A F3 chama a segunda de "Uso"; o rótulo passa a ser o do legado e o id não muda.

| Etapa | Campos |
|---|---|
| Coleta | Titulares (tipo de titular e os dados que ele fornece), Ativos, Descrição, Origem dos dados (lista múltipla), "Solicita consentimento?", "Há tratamento de dados de crianças e/ou adolescentes neste processo?" |
| Uso ou Processamento | Não Aplicável, Descrição, Ativos, Titulares (herdados) |
| Compartilhamento Interno | Não Aplicável, Descrição, Ativos, Áreas (menos as da própria atividade), Titulares |
| Compartilhamento Externo | Não Aplicável, Descrição, Ativos, Parceiros, Titulares |
| Armazenamento | Não Aplicável, Descrição, Ativos (cada um com **local de armazenamento**), Titulares |
| Eliminação | Não Aplicável, Descrição, Ativos (somente leitura, os do Armazenamento), **Prazo**, **Descarte**, Titulares |

**Situação da etapa, derivada no servidor** (função pura `situacaoDaEtapa`, nunca gravada): `nao_aplicavel` se a linha do cabeçalho diz; senão `concluida` se **todas** as faltas abaixo estão vazias; senão `pendente`, com as faltas em texto.

- Coleta: descrição preenchida; pelo menos um titular, cada um com pelo menos um dado; pelo menos um ativo.
- Uso: descrição, pelo menos um ativo, todo titular da Coleta `definido` ou `nao_usa`.
- Compartilhamento Interno: o mesmo e pelo menos uma área. Externo: o mesmo e pelo menos um parceiro.
- Armazenamento: o mesmo do Uso e **local preenchido em cada ativo**.
- Eliminação: descrição, `Prazo` e `Descarte` preenchidos e todo titular definido (os ativos vêm do Armazenamento; a etapa depende do Armazenamento não estar `pendente` por falta de ativo).

**Titular por etapa**: `pendente` (sem linha), `definido` (com pelo menos um dado, **subconjunto dos dados do mesmo titular na Coleta**; o servidor recusa dado que a Coleta não tem) ou `nao_usa` ("Dados não usados nesse tratamento"). Gravar exige pelo menos um dado ou `nao_usa`, como o legado ("Gravar" só habilita com marca).

**Regras de bloqueio**: etapa "Não Aplicável" apaga e bloqueia os campos (o servidor apaga as linhas filhas e a tela pede confirmação se havia conteúdo). As etapas 2 a 6 ficam **bloqueadas até a Coleta estar concluída** (os titulares vêm dela); o legado também as acinzenta. Tirar um titular ou um dado da Coleta tira dele de todas as etapas (a tela confirma). Ativo já usado na etapa aparece **travado** no seletor (cadeado e texto, não só cor). A área da própria atividade aparece travada em Compartilhamento Interno.

**Concluído / Não Aplicável bloqueiam a conferência** (seção 6): atividade com etapa `pendente` não vai a "Conferir / Aprovar".

Catálogos com "+" inline: tipo de titular, dado pessoal (com marca "Dado sensível"), ativo (`/assets`), área (`/departamentos`), parceiro (`/partes`, tipo organização); todos passam por `normalizarNome` (`src/services/nomes.ts`), como já é regra do cadastro, e avisam de duplicata antes de criar.

## 6. Status e menu "Ações": a máquina de estados

Duas coisas distintas, que o legado funde e o n.360 **não** funde: (a) a **situação de trabalho**, uma coluna (`ropa_records.status`, já usada: `Draft`, `Under Review`, `Active`, `Inactive`, `Approved`, `src/schemas/domain.ts:73`) e (b) a **aprovação**, que é **derivada** dos pedidos pelo hash do conteúdo atual (`aprovacoesDoProjeto`, `src/services/documentos.ts:457`) e nunca é gravada por esta feature. Quem vê o cabeçalho enxerga uma só "situação", calculada no servidor:

| Situação exibida | Quando |
|---|---|
| Cancelada | `status = 'Inactive'` |
| Aprovada | senão, há pedido aprovado com o hash do conteúdo atual (`aprovacao.ciso` ou `.ceo`, a regra de hoje, `atividade.js:83`) **e nenhum `reaberta_em` posterior a ela**, ou o status é `Approved` (assinatura direta antiga) |
| Em Revisão | senão, `status = 'Under Review'` ou aprovação reaberta (inclui "Aprovada antes, mudou depois": o selo "Aprovação desatualizada" aparece junto; e o pedido aprovado em `Under Review` **sem** reabertura é Aprovada, porque o pedido não escreve o status) |
| Rascunho | senão (`Draft`, `Active` sem aprovação) |

Ações do menu (o legado habilita e desabilita por estado; o servidor devolve `habilitada` e o motivo do bloqueio em `GET .../ficha`):

| Ação do legado | O que faz no n.360 | De, para | Quem | Trilha |
|---|---|---|---|---|
| Conferir / Aprovar | Abre a **conferência** e, sem bloqueio, o **pedido de aprovação existente** (`abrirPedidoAprovacao(projectId, 'tratamento', id)`): conteúdo congelado com hash, destinatários `ciso`/`ceo` decidem com senha e a prova é imutável. **Não existe caminho novo de aprovar.** | Em Revisão | quem pode pedir (`podePedirAprovacao`) | as do pedido |
| Alterar para "Em revisão" | Troca a situação de trabalho | Rascunho para Em Revisão | quem edita | `ropa.situacao` (campo, antes e depois) |
| Reabrir atividade | Volta à análise: `status` para `Under Review`, **motivo obrigatório** (5+ caracteres). Para assinatura direta antiga, limpa as assinaturas pela mesma função da revogação (`POST /:recordId/revoke-approval`, `ropa.ts:426`). Para aprovação por pedido **não apaga prova** (é imutável): grava o carimbo `reaberta_em`, e a situação exibida vira "Em Revisão, em nova revisão" enquanto não houver aprovação **posterior** ao carimbo (a aprovação antiga segue registrada e só deixa de valer se o conteúdo mudar, pelo hash). Uma nova decisão de aprovação depois do carimbo volta a situação para Aprovada. | Aprovada para Em Revisão | `PODE_REVOGAR_APROVACAO` (`platform_admin`, `org_admin`) | `ropa.situacao` com o motivo |
| Cancelar atividade | `status` para `Inactive`, **motivo obrigatório**; cancela o pedido de aprovação aberto (`UPDATE pedidos SET status = 'cancelado' WHERE ... AND status = 'aberto'`, o formato que `test/pedidos-prova.test.ts` aceita); a atividade fica **somente leitura** (PUT e POST das abas respondem 409 "Atividade cancelada: reative para editar") e sai das contagens do painel e da exportação | qualquer, exceto Cancelada | equipe da ness. e `org_admin` | `ropa.situacao` com o motivo |
| Reativar atividade | `Inactive` para `Under Review` | Cancelada | equipe da ness. e `org_admin` | `ropa.situacao` |
| Imprimir atividade | `GET .../ropa/:id/relatorio` (HTML para impressão, as nove abas) | qualquer | quem lê | nenhuma |
| Excluir atividade | **Segue como está**: `DELETE /api/v1/ropa/:id` (`ropa.ts:76`), ação destrutiva por último no menu, depois do separador, com confirmação digitada e a trilha de exclusão (`src/trilha-exclusao.ts:16`) | qualquer | quem já pode hoje | `ropa_deleted` |

Garantias de que a aprovação não enfraquece:

1. **Aprovar continua sendo só o pedido** (senha, autoridade da matriz de governança, segregação, hash, prova imutável pelos gatilhos `pedido_dest_prova_imutavel` e `pedido_prova_imutavel`). A conferência é um filtro a mais na tela, **não** mudou a API de pedidos.
2. **O agente MCP nunca aprova, reabre, cancela nem reativa** (`FORA_DO_AGENTE`, seção 9). Excluir continua atrás de `confirmado_pelo_usuario`, como hoje.
3. Nenhuma ação toca `ciso_approved_*`/`ceo_approved_*`, exceto a revogação que já existe.

**Conferência** (`GET .../conferencia`, função pura sobre o que o servidor já lê): **bloqueios** (impedem "Conferir / Aprovar" na tela; a API de pedidos segue como hoje): finalidade vazia; alguma etapa do Tratamento `pendente`; nenhuma base jurídica e art. 11 sem "Não Aplicável" quando há dado sensível; teste de impacto não finalizado; "Controle de GAPs" com gap `Open` sem responsável (a rota já exige). **Avisos** (não impedem): nenhuma medida de segurança; nenhum risco; nenhuma base jurídica quando não há dado sensível; transferência internacional sem salvaguarda; legítimo interesse sem LIA.

## 7. Abas: comportamento por aba

Layout comum: faixa de abas (`renderAbas`, `frontend/src/ui.js:519`, `role="tablist"`) com setas, Home e End; aba na URL (`?tela=ropa-atividade&aba=<id>`); estado da aba em **texto** no tooltip do rótulo e no `aria-label` ("Medidas de Segurança, pendente"), nunca só cor. Cada aba é um módulo (`frontend/src/atividade/aba-*.js`). Padrão **lista mais modal** do legado onde houver registros (Medidas, Gaps, Riscos, bases): o botão "+ X" abre o modal (`openModal`, que já tem "Descartar o que foi digitado?"), "Confirmar" só habilita com o mínimo preenchido, e a lista tem lixeira com confirmação.

- **Escopo**: Finalidade, Volume mensal, Processamento automatizado (`Não, não são submetidos.`, `Sim, como apoio à decisão humana.`, `Sim, com decisão automatizada.`; só a primeira foi vista no legado, as outras duas são proposta a confirmar, seção 15). Autosave por campo (`criarAutosave`, `frontend/src/bancada/autosave.js:3`).
- **Tratamento de Dados**: seção 5. Autosave nos textos; modal para titulares, ativos, áreas, parceiros.
- **Agentes de Tratamento**: "Controlador dos Dados" e "Operador dos Dados" (duas marcas, podem ser as duas), "Existe transferência internacional?" (Não, Sim: Sim abre as transferências e a salvaguarda já existentes), e os blocos que o n.360 tem a mais (operadores e destinatários).
- **Medidas de Segurança**: lista (Medida, Status, Descrição) com lixeira e "+ Medidas de Segurança". No modal: "Medida" é seletor do catálogo do projeto com "+" inline; se o projeto tem n.iso, "Ligar a um controle implementado" lista os controles `Implemented` do projeto (`GET .../medidas/controles`, vazio sem n.iso) e ao escolher preenche Medida (título do controle) e Status (`ativa`). Controle deixa de estar implementado: a medida mostra "controle deixou de estar implementado" (derivado na leitura, sem gravar).
- **Base Jurídica**: blocos na ordem do legado: Previsão Legal, Base Legal (Dados Pessoais, art. 7º), Base Legal (Dados Sensíveis, art. 11, com "Não Aplicável" que desabilita o "+ Adicionar Inciso"), Base Legal GDPR. Modal do inciso: seletor (lista de checkboxes com inciso travado se já usado) e "Finalidade" obrigatória por inciso. Entre os incisos, o primeiro é a **principal** (a que está no hash); a tela diz "Principal" e o servidor mantém a principal atual enquanto ela estiver selecionada. A LIA (`formularioLia`, `tratamento-ligacoes.js`) aparece no fim da aba quando a base é legítimo interesse (`ehLegitimoInteresse`, `src/services/lia.ts:19`).
- **Controle de GAPs**: lista (Gap, Responsável, Status) com lixeira; "+ Gaps" abre o modal de três sub-abas: **Gap** (GAP obrigatório, Recomendação), **Plano de Ação** (Plano, Responsável obrigatório, Prazo, Status padrão Pendente), **Anexo** (tabela Arquivo e Ações, "PDF ou DOC (máx. 5MB)"). "Limpar" e "Confirmar". "Não Aplicável" da atividade desabilita o "+ Gaps" e só vale sem gaps.
- **Teste de Impacto**: "Teste de impacto finalizado?" (alternância), "A atividade pode gerar alto risco ao titular de dados?" (uma marca), Critério Geral (2), Critério Específico (11). As respostas que a atividade já sabe vêm propostas (`respostasDaAtividade`, `src/services/impacto.ts`), nunca gravadas até a pessoa confirmar, como hoje. A recomendação de RIPD e o botão "Criar o RIPD a partir da atividade" ficam abaixo.
- **Riscos**: tabela IDR, Motivo, Risco, Estratégia, Risco residual, Prazo, ações ("Tratar", lixeira); "+ Registrar Risco" abre "Análise de Riscos" (Motivo do catálogo, Descrição que nasce do motivo e tem "Restaurar", Probabilidade, Impacto, Risco calculado "a calcular..."). "Tratar" preenche Estratégia (Aceitar, Mitigar, Evitar, Transferir), Residual e Prazo. O risco é o **mesmo** de `risks` e aparece na matriz do n.iso.
- **Logs ROPA**: cartões "Seção: evento / Nome / Data", mais recente primeiro, somente leitura, vindos da trilha por seção (seção 10).

## 8. API

Prefixo: `/api/v1/projects/:projectId/ropa/:recordId/...`, montado em `src/routes/ropa-abas.ts` (arquivo novo, para não inchar `ropa.ts`, 640 linhas). Corpo **estrito** (campo a mais é 400); respostas de erro no envelope de sempre. Toda rota nova de projeto tem faixa em `src/modulos.ts` (`test/modulos-produto.test.ts` reprova sem). Todas são **faixa `privacy`** (`SUBROTAS_PRIVACY`, `src/modulos.ts:46`), exceto o que já é `nucleo`.

### 8.1 PR1

| Método e rota | Faz | Agente MCP |
|---|---|---|
| `GET .../ficha` | cabeçalho, situação, ações habilitadas, estado de cada aba, módulos do projeto | lê |
| `PUT .../escopo` | `{ nome?, descricao_atividade?, finalidade?, volume_mensal?, processamento_automatizado?, owner_parte_id?, areas_ids? }`; ausente mantém, `null` limpa | grava |
| `PUT .../agentes` | `{ papel_controlador?, papel_operador?, international_transfers?, transfer_safeguards? }` | grava |
| `GET/POST .../medidas`, `PUT/DELETE .../medidas/:medidaId` | lista própria; `controle_id` opcional | grava; apagar é humano |
| `GET .../medidas/controles`, `GET .../medidas/sugestoes` | controles implementados do projeto, só se o projeto tem n.iso (senão `[]`), e as medidas sugeridas | lê |
| `GET .../riscos/motivos` | motivos de risco com a descrição padrão (PR1: do código; PR2: do catálogo do projeto, mesma forma) | lê |
| `GET/PUT .../base-juridica` | `{ previsao_legal?, lgpd?: [{requisito_id, finalidade}], art11?: {nao_aplicavel, incisos}, gdpr?: [{base, finalidade}] }`; cada lista, se vier, **substitui** | grava |
| `GET/POST .../gaps`, `PUT/DELETE .../gaps/:id`, `PUT .../gaps/nao-aplicavel` | gap = `corrective_actions` + `recomendacao`; Responsável obrigatório | grava; apagar é humano |
| `POST/GET/DELETE .../gaps/:id/anexos[/:anexoId]` | PDF/DOC/DOCX até 5 MiB, conferido pelo conteúdo | **fora** |
| `GET .../logs` | trilha por seção, `?limite` e `?antes` | lê |
| `GET .../conferencia` | bloqueios e avisos | lê |
| `POST .../situacao` | `{ acao: 'enviar_revisao'\|'reabrir'\|'cancelar'\|'reativar', motivo? }` | **fora** |
| `GET .../relatorio` | HTML de impressão da atividade | **fora** (exportação em arquivo é pela tela) |

Rotas que **ficam e a tela usa**: `/impacto`, `/riscos`, `/acoes`, `/ligacoes`, `/transferencias`, `/itens`, `/departamentos`, `/lia`, `/dpia`, `/bases`, `/ciclo`, `POST .../approve`, `POST .../revoke-approval`, `PUT` e `DELETE /api/v1/ropa/:id`. O teste de impacto ganha a pergunta `alto_risco` (seção 12). Os riscos ganham `idr` na leitura e na criação e `treatment_due_date` no corpo.

### 8.2 PR2

| Método e rota | Faz |
|---|---|
| `GET .../etapas` | as seis etapas com tudo (cabeçalho, ativos, áreas, parceiros, titulares com dados, situação derivada e faltas); materializa na primeira leitura |
| `PUT .../etapas/:etapa` | `{ nao_aplicavel?, descricao?, origem?, solicita_consentimento?, criancas_adolescentes?, prazo?, descarte? }` (`prazo` grava `retention_period`) |
| `PUT .../etapas/:etapa/ativos` | `{ ativos: [{ item_id, local_armazenamento? }] }`, substitui |
| `PUT .../etapas/compartilhamento_interno/areas` | `{ departamentos_ids }` |
| `PUT .../etapas/compartilhamento_externo/parceiros` | `{ partes_ids }` |
| `PUT .../etapas/coleta/titulares` | `{ titulares: [{ titular_id, dados_ids }] }`, substitui (e confirma remoções) |
| `PUT .../etapas/:etapa/titulares/:titularId` | `{ dados_ids, nao_usa? }` |
| `POST .../etapas/:etapa/rascunho` | copiloto: rascunha a descrição da etapa (**fora do agente**) |
| `GET/POST /api/v1/projects/:p/catalogos/:tipo`, `PUT .../:id` | tipos `titulares`, `dados`, `medidas`, `motivos-risco`; `?q=` busca; sem DELETE (inativa por `status`) |

`/catalogos` entra em `FAIXA_DO_SEGMENTO` como `privacy`. **Os catálogos nascem vazios** (decisão do dono de 16/10/2026, seção 15): nada é semeado; o `GET` do projeto novo devolve `[]` e a tela oferece o "+" inline.

### 8.3 Conteúdo fixo (pacote B, texto do dono); sem semente de catálogo

Escritas **em código** (`src/data/ropa-abas/`), com revisão jurídica do dono (`AGENTS.md`: material de terceiro não é texto normativo): títulos dos incisos (já em `src/data/lgpd.ts:36-58`), as seis bases do GDPR (texto das capturas 28 e 29), a lista de origens dos dados, os motivos de risco com descrição padrão (três vistos no legado), as escalas de probabilidade e de impacto e os níveis de risco, os dados sensíveis conhecidos (só uma sugestão de marca ao criar um dado pelo "+"), status de medida e de gap. **Fora do código, por decisão do dono (16/10/2026): titulares, dados pessoais, medidas de segurança e motivos de risco.** Eles são catálogo do projeto, nascem vazios e são criados pela pessoa (ou, numa etapa futura e separada, pela importação do legado). **O que as capturas não mostram** (opções de listas que o legado só exibe abertas) fica em proposta marcada e entra na seção 15.

## 9. Agente de IA, copiloto e PII

- **O agente (MCP) só rascunha.** Pode ler e gravar campos de aba (é o mesmo papel do consultor que concedeu; o texto é rascunho até a pessoa conferir), e **nunca**: `situacao`, `anexos`, `relatorio`, `apagar` medida, gap, risco (já recusado, `src/middleware/agente.ts`), `approve`. `FORA_DO_AGENTE` ganha as linhas do plano (tarefa 0.4). Conferir/Aprovar é pedido de aprovação, que o agente já não decide (`src/services/pedidos.ts`).
- **Copiloto** (`POST .../ropa/copiloto`, `src/services/copiloto-ropa.ts`, molde): hoje propõe finalidade, categorias, titulares, destinatários, retenção, base, sistemas e áreas a partir de um parágrafo. Na PR2 passa a propor **por etapa** (`descricao_por_etapa`, `origem`) e **ids de catálogo** para titulares e dados (nunca texto livre), e ganha "Rascunhar a descrição desta etapa" (`POST .../etapas/:etapa/rascunho`). Regras herdadas e testadas: contexto do **banco**, do projeto da rota; texto livre por `mascararPii` (`src/services/rascunhos-privacy.ts:31`); descrição do usuário é **dado**, não instrução; o modelo **nunca decide** dado sensível, crianças e adolescentes, transferência nem salvaguarda (esses campos não existem no contrato de saída; indício vira `avisos` por regex do servidor); saída por esquema zod estrito, campo fora do contrato some; falha do modelo é `{ indisponivel: true }`; trilha `agente.rascunho` **sem o texto**. Toda saída chega "Proposta do assistente: confira", por campo, com Aceitar e Descartar; aceitar copia para o campo e o autosave grava como qualquer digitação.
- **PII.** Nenhum dado pessoal em fixture, em exemplo ou na trilha. Catálogos de teste usam nomes genéricos ("Titular exemplo A", "Dado exemplo 1"). A trilha de aba guarda **seção, ação, ids e contagens**, nunca texto livre nem nome de dado (`logAudit` de `ropa.ciclo` já é assim, `ropa.ts:228`). A coluna `old_value`/`new_value` de `audit_logs` não é usada para texto desta feature. A única exceção é o **motivo** de reabrir e de cancelar, gravado em `justification` pela trilha `ropa.situacao` (como `ropa.approval_revoked`, `src/routes/ropa.ts:426`); a aba Logs ROPA **não** o mostra. Antes do PR, conferir à mão (e com `git grep`) que nenhuma fixture, exemplo ou documento traz dado de cliente; o hook do repositório e a regra do `AGENTS.md` valem.

## 10. Logs ROPA

Nova escrita (`registrarSecao`, `src/services/ropa-logs.ts`): uma linha em `audit_logs` com `entity_type = 'ropa'`, `entity_id` = id da atividade, `field` = nome da seção legível ("Controle de GAPS / Alteração", como o legado), `action` = `ropa.secao`, `project_id`. `GET .../logs` lê essas linhas **e** as antigas (`details LIKE 'ROPA <id>%'`, que as rotas F1-F3 já gravam: `ropa.impacto`, `ropa.ciclo`, `ropa.itens`...), traduz o `action` para a seção, e devolve `{ secao, evento, nome, data }` sem o texto. `audit_logs` é append-only (migration 0025); nada é apagado ao excluir a atividade.

## 11. Relatório, exportação, importação, MCP

- **Relatório HTML do RoPA** (`GET .../ropa/report`, `src/routes/ropa.ts:506`): a lista de cada atividade passa a imprimir o ciclo por etapa (hoje `cicloEmTexto`, `src/services/ciclo.ts`) a partir do modelo novo, e exclui atividade cancelada. **Novo**: `GET .../ropa/:id/relatorio` (imprimir atividade), as nove abas, mesmo cabeçalho do controlador (`lerEmpresa`, `dpo`). Word da atividade: **cortado** da fase 1.
- **Exportação CSV** (`src/services/exportacao.ts:40`, `atividades`): ganha as colunas `situacao` e `nome`; exclui cancelada (a F4 não conhece o estado).
- **Importação** (`src/services/importacao.ts`, `tratamentos-importar.ts`): continua gravando o plano (finalidade, texto de titulares e categorias, `tratamento_itens`); a materialização cuida do resto na primeira abertura. A entidade `ciclo` da F6 grava o cabeçalho da etapa (compatível). Nenhum CHECK novo em `importacao_itens`.
- **MCP** (`mcp-server-niso`, 39 ferramentas fixadas em `test/contrato-mcp.test.ts:82`): **nenhuma ferramenta nova na fase 1** (o contador não muda). `niso_privacy_ropa_detalhe` e a leitura de `/ligacoes` devolvem também `etapas`, `situacao` e `medidas`; `niso_privacy_atualizar_tratamento` entende o 409 de titulares e dados (tarefa do pacote R, PR3); as rotas novas entram no OpenAPI (`src/openapi.ts`, `docs/openapi.json` regenerado) e o agente as usa por `niso_executar`. O roteiro do agente (`src/mcp/contexto.ts`) cita as abas.

## 12. Teste de impacto: a pergunta que faltava

O legado tem **uma** pergunta de alto risco fora dos dois grupos ("A atividade pode gerar alto risco ao titular de dados?"). `PERGUNTAS_IMPACTO` (`src/services/impacto.ts:16`) ganha `alto_risco` com `grupo = 'alto_risco'`. Regra nova em `recomendarRipd`: `alto_risco = 'sim'` sozinha recomenda o RIPD (afirmação humana de risco alto); a pergunta é **opcional** na conta de "dispensável a confirmar" (as 13 antigas continuam bastando), para que **nenhum teste já respondido vire "incompleto"** por causa dela. É uma suposição sobre o legado (a captura mostra só a marca): vai à seção 15 junto com as demais.

## 13. Telas e remoções

### 13.1 O que muda, fica ou sai

| Hoje | Destino |
|---|---|
| `frontend/src/views/atividade.js` (página de cinco etapas, `etapasDaAtividade`, `desenharTrilha`, `desenharProximo`) | **substituída** pela casca de abas (cabeçalho e nove abas). O "próximo passo" vira o **selo de estado por aba** e o primário "Continuar de onde parou" quando em modo guiado. `etapasDaAtividade` sai; o cálculo de estado de aba é do servidor (`ficha`). PR1. |
| `frontend/src/views/tratamento-ligacoes.js`: `blocoRiscos`, `blocoAcoes`, `formularioLia` | **reaproveitados** nas abas Riscos, Gaps e Base Jurídica (movidos para `frontend/src/atividade/`). PR1. |
| `tratamento-ligacoes.js`: modal "Ligações" (`openLigacoesTratamento`, `:138`), itens, departamentos, base legal, parte, diagrama | **redirecionado**: cada bloco vive na aba dele (itens e áreas no Tratamento, partes e transferências em Agentes, base em Base Jurídica); o **diagrama Mermaid** fica como botão "Ver o fluxo" no Tratamento (é derivado, `src/services/tratamentos.ts`). Modal sai na PR3. |
| `ropa-entrevista.js` (blocos A a H, `sessionStorage`, `montarPayload`) | **absorvido** pelo **modo guiado** (seção 14): o catálogo de perguntas, as ajudas, os exemplos, o copiloto e o pré-preenchimento ficam; o motor de wizard, o `sessionStorage` e o "gravar tudo no fim" saem. PR3. A rota `ropa-entrevista` redireciona para `ropa-atividade` em modo guiado. |
| `privacy.js` `renderROPA` (lista) | **fica**, com coluna "Situação" derivada, `nome ?? finalidade` e "Nova atividade" abrindo a escolha (guiada ou direta). A "Edição avançada" (`openNewROPAModal`, `openEditROPAModal`) sai da tela na PR3; a API que ela usa fica. |
| `produto.js:215` `nav-ropa: 'Tratamentos (RoPA)'` | **rótulo mantido** (o legado chama o menu de "Atividades" e o n.360 já chama de "Tratamentos (RoPA)"; mudar o menu mexeria em `frontend/test/casca-menu.test.js`). A tela "Registro da atividade" é a ficha. Sem item novo de menu. |

### 13.2 Regras visuais (`design.md`)

- **Uma ação primária por tela**: na ficha, "Conferir / Aprovar" fica no menu "Ações" (não é botão solto) e o primário da tela é o do contexto (em modo guiado, "Continuar"; senão nenhum). Modal conta como tela: seu "Confirmar" é o primário.
- `renderMaisAcoes` para mais de três ações; o destrutivo ("Cancelar atividade", "Excluir atividade") por último, depois do separador.
- Geometria quadrada, tokens, nada abaixo de `--fs-xs`, sem itálico, sem emoji, sem ícone decorativo (o legado usa ícones; o n.360 usa texto), cor nunca sozinha para estado.
- **Sem `style=`** nos arquivos novos (teto 0 em `frontend/test/catracas-visuais.test.js:97`); classes novas num bloco "Atividade em abas" no fim de `style.css`; eventos por `data-action`.
- Hierarquia de títulos: h1 é o `#header-title` (o nome da atividade), h2 cada aba, h3 cada etapa e cada bloco.
- **Acessibilidade** (WCAG 2.1 AA): abas com `role="tablist"`, setas, Home, End, `aria-selected`, painel `role="tabpanel"` com `aria-labelledby`; acordeão por `button` com `aria-expanded`; modal com foco preso (o `openModal`); "Salvo às HH:MM" em `role="status"`; campo com `label` associado; obrigatório em texto; item travado com `aria-disabled` e texto "já usado"; teclado completo. Sem responsividade (`PRODUCT.md`, escopo).

## 14. Entrevista guiada e modo direto: duas portas, um modelo

**Modo guiado** é um **painel** na página da atividade (à direita, como o copiloto da Bancada), não um assistente separado. Percorre as abas **na ordem delas** e escreve nos **mesmos endpoints**, por pergunta (autosave), de modo que:

- **Não há estado de entrevista.** O progresso é derivado do dado: a pergunta atual é a **primeira lacuna na ordem das abas** (a mesma conta de `pendencias`, hoje `ropa-entrevista.js:430`, feita pelo servidor em `GET .../ficha` como `proxima_pergunta`). Qualquer pessoa retoma de onde o dado parou; trocar de máquina não perde nada; nada de `sessionStorage` (hoje a entrevista guarda lá, `:238`).
- A pessoa pode sair do guiado a qualquer hora e continuar nas abas, e o contrário. "Não sei agora" continua existindo e fica registrado como pergunta adiada **no navegador** (só esse estado local; não é dado).

Mapeamento dos blocos da entrevista para as abas, na ordem:

| Bloco atual | Perguntas | Passa a escrever em |
|---|---|---|
| A, "A atividade" | atividade, em uma frase, quem responde, qual área | Escopo (nome, finalidade, responsável) e cabeçalho (áreas) |
| B, "De quem são os dados" | titulares; crianças | Tratamento, Coleta (titulares; `criancas_adolescentes`) |
| C, "Quais dados" | tipos de dado; sensíveis | Tratamento, Coleta (dados, aplicados a cada titular como ponto de partida) |
| D, "Por que a empresa usa" | motivo, base, consentimento, LIA, outras hipóteses, GDPR | Base Jurídica (e Coleta: "Solicita consentimento?"); LIA no fim da aba |
| E, "De onde vêm e onde passam" | origem, sistemas, ciclo por etapa | Coleta (origem) e os ativos de cada etapa |
| F, "Com quem compartilha" | envia para fora?, para quem | Compartilhamento Externo (parceiros) e Agentes (destinatários) |
| G, "Quanto tempo ficam" | prazo, eliminação | Eliminação (Prazo e Descarte), Armazenamento |
| H, "Transferência e RIPD" | exterior, país, RIPD | Agentes (transferência), Teste de Impacto, RIPD |
| (novo) | medidas de segurança | Medidas de Segurança |
| (derivadas ou opcionais) | gaps, riscos | Gaps e Riscos: o guiado **sugere** ("Quer registrar os gaps agora?"), não pergunta |

**"Nunca perguntar duas vezes"** fica mais forte: como o guiado lê o dado real, não existe pergunta "sem coluna" (`semColuna`, hoje cinco: volume, decisão automatizada, origem, eliminação, impacto). Todas ganham coluna neste desenho (seção 3).

**Modo direto** ("sem entrevista"): "Nova atividade" abre um diálogo com **Nome**, **Área** e **Responsável** (os três campos do cabeçalho), cria o rascunho e abre a ficha nas abas livres. O mesmo diálogo oferece "Preencher com a entrevista guiada", marcada como padrão para a equipe e **desmarcada** para quem veio do legado (decisão de produto: a equipe da ness. que migra clientes usa o direto).

## 15. Decisões em aberto (só o que muda o trabalho)

Decididas pelo dono em **16/10/2026** (nenhuma está mais em aberto):

1. **DECIDIDA (16/10/2026): opções que as capturas não mostram.** Os valores que esta spec propõe para o que o legado só exibe aberto (as **opções de Origem dos Dados**, os **status** de Medida e de Gap, as **opções de "processamento automatizado"**, as **escalas de Probabilidade e Impacto** e a **descrição padrão dos motivos** de risco) estão **aceitos**. O dono os **confirma antes do merge da PR1** (muda o texto, não o desenho). Os motivos de risco não são mais conteúdo em código (item 3).
2. **DECIDIDA (16/10/2026): edição na Coleta derruba a aprovação.** Mudar titular, dado ou ativo de uma atividade aprovada escreve nas colunas do hash e substitui o pedido, como o formulário antigo já fazia (seção 4.4). Fica o desenho da spec: derivar para o hash (o RoPA aprovado é o registro do art. 37 e precisa refletir o que a empresa trata).
3. **DECIDIDA (16/10/2026): sistema vazio primeiro; catálogos sem semente.** Nenhuma importação de dados do legado faz parte deste trabalho (é uma etapa separada, depois). Os catálogos (**tipos de titular, dados pessoais com a marca de sensível, medidas, motivos de risco**) e os cadastros que a ficha usa (**ativos, áreas, parceiros**) **começam VAZIOS**: **nenhuma lista é semeada** em migration nem em código, e nenhum teste depende de dado preexistente. Todo estado vazio explica o que a coisa é e oferece o "+" para criar ali mesmo (inline). A materialização preguiçosa (seção 4.5) fica só como compatibilidade dos registros planos que o próprio n.360 já tem; **nada é desenhado para importar o legado**. Isto substitui a alternativa "semeamos uma lista curta própria" e a espera pelo export do legado.

Não são decisões em aberto, ficam decididas aqui: sem feature flag (seção 17), "Logs ROPA" com o rótulo do legado, menu sem item novo, Word da atividade fora, aviso de prazo de risco e de gap em projeto só n.privacy fora (seção 17).

## 16. Testes

- **Backend, D1 real** (`cloudflare:test`, molde `test/ciclo-bases.test.ts`, `applySchema`, `workerEnv`, `sessionFor`; nunca mock do D1 inteiro): migration 0079 sobre dados de antes (molde `test/migration-0074.test.ts`); materialização (texto vira catálogo e Coleta, idempotente, não toca coluna do hash); **aprovação de antes continua valendo** (4.4); cada rota de escrita: hash muda ou não muda conforme a tabela da seção 4.4; situação derivada e máquina de estados (todas as transições, papéis, motivo, pedido aberto cancelado, somente leitura, agente 403); conferência; titular por etapa (dado fora da Coleta recusado, `nao_usa`, remoção em cascata); Eliminação herda; gatilhos de tenant (SQL direto recusa); base jurídica (principal estável, finalidade obrigatória, art. 11 N/A exclusivo); gap (responsável obrigatório, anexo: tamanho, tipo pelo conteúdo, isolamento, R2 limpo ao apagar); IDR sequencial e retroativo; logs (legado e novo, sem texto); `alto_risco` sem regredir o "dispensável"; isolamento entre projetos e entre organizações (`test/contrato-isolamento-org.test.ts:101`, `:139`: toda rota nova entra em `CRIA_COM_REFERENCIA` ou `SEM_RECURSO_ALHEIO`); faixa (`test/modulos-produto.test.ts`); `test/trilha-exclusao.test.ts` (todo DELETE novo classificado); OpenAPI e contrato MCP regenerados (`test/openapi.test.ts`, `test/contrato-mcp.test.ts`); catraca de `any`.
- **Frontend, jsdom** (`frontend/test/`, `vi.mock('../src/api.js')`): casca (abas, teclado, rótulos exatos e ordem, aba na URL), cabeçalho, menu Ações habilitado por estado, cada aba (autosave, modal com "Confirmar" desabilitado até o mínimo, lixeira com confirmação), acordeões de etapa (estado derivado, bloqueio, cadeado, titular pendente), catálogo inline com aviso de duplicata, guiado (primeira lacuna, dois modos sobre o mesmo dado), copiloto marca "proposta".
- **E2E (Playwright, `frontend/e2e/ropa-abas.spec.js`)**: abre pela lista, percorre as nove abas, preenche Coleta, vê a etapa concluir, tenta "Conferir / Aprovar" com pendência (bloqueado), completa, pede aprovação, cancela e reativa.
- **Catracas e a11y**: `style=` zero nos arquivos novos, um `.btn-primary` por tela, um `h1`, todo campo com `label`, `frontend/test/atividade-a11y.test.js`.
- **Verificação do `AGENTS.md`**: "mergeado" só com `git cat-file -e origin/main:<arquivo>`; "aplicado" só com `PRAGMA table_info(ropa_records)` mostrando `volume_mensal`; "em produção" só com `/health` e uma sonda; contagens do `AGENTS.md` (tabelas: 93 hoje, `grep -oE '^\s*CREATE TABLE( IF NOT EXISTS)? +[a-z_0-9]+' schema.sql | awk '{print $NF}' | sort -u | wc -l`; migrations: 0079; ferramentas MCP: 39) atualizadas com o comando ao lado.

## 17. Entrega, lançamento, riscos e cortes

### Entrega em três PRs (detalhe, pacotes e donos de arquivo no plano)

- **PR1, a casca e as abas.** Contrato (migration 0079 **inteira**, esquemas, rotas montadas, faixas, agente), backend das abas (Escopo, Agentes, Medidas, Base Jurídica, Gaps, Impacto, Riscos, Logs, situação, conferência, relatório) e frontend da casca com **todas as nove abas**; o Tratamento de Dados entra como **ponte** (as seis etapas com Não Aplicável, descrição e um ativo pela rota F3 `/ciclo`: é a única peça descartável, cerca de cem linhas). A migration inteira vai na PR1 (um número, um backup, uma aplicação), com as tabelas de etapa ainda sem uso. Entrevista e Ligações seguem acessíveis (botão "Continuar a entrevista" na ficha).
- **PR2, Tratamento de Dados por etapa.** Catálogos, materialização, etapas, titular por etapa, escrita derivada, conferência real, acordeões e modais, copiloto por etapa. A ponte sai.
- **PR3, entrevista realinhada, modo direto e limpezas.** Painel guiado, diálogo "Nova atividade", redirecionamentos, remoção do que sobrou (`ropa-entrevista.js` motor, `tratamento-ligacoes.js` modal, edição avançada), MCP e OpenAPI, `AGENTS.md`, `docs/README.md`.

**Por que três e não dois nem um.** Um só PR teria ~15 mil linhas e uma migration com 20 objetos revisados de uma vez; dois deixam a PR1 sem a peça mais difícil e mais arriscada (a materialização e a escrita derivada do hash), que merece revisão própria. A migration inteira vai na PR1 de propósito: aplicar duas migrations em sequência é risco sem ganho (a segunda só traria o que a PR2 usa).

### Lançamento

**Sem feature flag**: a ficha nova e a atividade antiga não convivem (duas fontes de verdade para a situação e para o estado do ciclo seriam piores que o risco). Ordem do `AGENTS.md`: `npm run db:backup`; aplicar a 0079 **antes** do merge (`npx wrangler d1 migrations apply niso-db --remote`; a migration é aditiva e o código anterior a ignora); `PRAGMA table_info(ropa_records)` mostrando `volume_mensal` (colar a saída); merge por squash (o deploy recusa migration pendente); `curl -s https://n360.ness.com.br/health` e comparar o `version` com o SHA; sonda `GET .../ropa/<id>/ficha` com sessão de teste; abrir no projeto de homologação uma atividade aprovada antes, ver que a aprovação **continua** (4.4). **Ensaio sobre cópia do banco** antes da PR2 (a materialização lê texto do cliente real): restaurar um backup num D1 local, rodar `GET .../etapas` em todas as atividades e conferir contagem de titulares, dados e ativos contra o texto e `tratamento_itens`, e `aprovacoesDoProjeto` antes e depois. **Volta atrás**: reverter o commit de merge (as colunas e tabelas ficam e não atrapalham).

### Riscos

1. **Hash.** Uma escrita derivada que toque a coluna errada derruba aprovação de cliente real. Mitigação: `pedidos.ts` congelado; a tabela da seção 4.4 vira teste (uma linha de teste por linha da tabela, hash antes e depois); teste de não regressão da aprovação de antes; ensaio sobre cópia do banco.
2. **Materialização com texto sujo.** Texto livre dividido por vírgula pode partir "Clientes (pessoa física, jurídica)" em dois. Mitigação: o superconjunto é conservador (todo dado a todo titular), a faixa "Migrado: confirme" pede revisão, nada do hash é reescrito, e o catálogo aceita renomear e unir (PR3, padronizar nomes já existe, `src/services/padronizar-nomes.ts`).
3. **Dois caminhos para o mesmo dado** (PUT antigo e aba nova). Mitigação: 409 quando divergem e a Coleta já tem titulares; `PUT /ciclo` como adaptador; o MCP é ajustado na PR3.
4. **Conferência bloqueando demais** quem migra de um sistema onde nada era obrigatório. Mitigação: só o essencial bloqueia, o resto é aviso; o bloqueio é da **tela**, a API de pedidos segue igual (o consultor pode pedir a aprovação por outro caminho se precisar, e ele fica na trilha).
5. **Anexos em R2** não são alcançados pelo cascade do D1 (como as importações, `AGENTS.md`). Mitigação: apagar o gap apaga o objeto; **não existe rota de exclusão de projeto**, e se existir um dia precisa limpar o prefixo `acoes/<project_id>/`.
6. **Edição concorrente.** O autosave por campo é "a última gravação vence", sem o `vistos` da Bancada. Mitigação: "Salvo às HH:MM por Fulano" e `atualizado_em` por seção; conflito de texto fica para depois (corte).
7. **Texto jurídico no ar sem revisão** (GDPR, motivos de risco, escalas). Mitigação: pacote B marca "proposta do assistente" no PR e o dono confirma antes do merge (decisão em aberto 1).
8. **Perda de função escondida** nas telas que saem (`atividade.js`, ligações, entrevista). Mitigação: tarefa de varredura de chamadores com `git grep` por `window.*` removido e teste por chamador, como a Bancada fez.

### Cortes (fica fora e por quê)

Word da atividade (o HTML imprime); aviso de prazo para risco e gap em projeto **só n.privacy** (a fonte `capa` leva o sino ao `/capa`, que o n.privacy não abre, `src/services/avisos-prazo.ts:221`; é a D2 da pesquisa e merece o seu PR); `vistos` do autosave; ferramentas MCP novas; importador do catálogo do legado; DPIA e LIA no estilo do legado (o dono ainda não mandou as capturas); Dashboard, Cadastros e Solicitações do legado (fora do RoPA); reconstrução de `tratamento_ciclo`, `ropa_records` ou `pedidos`; responsividade (`PRODUCT.md`).

## 18. O que este documento não afirma

Nada foi rodado contra o banco de produção nem contra o remoto. Contagens citadas (tabelas 93, ferramentas 39, última migration 0078) saíram dos comandos escritos ao lado, rodados em `origin/main` na worktree desta spec. As leituras das capturas são de analistas; os dois pontos conferidos no PNG (a etapa Coleta, com a Origem dos Dados em lista de rolagem, e o modal de Medidas de Segurança, com Medida e Status como seletores) batem com as notas, e o que as notas chamam de incerto está na seção 15.
