# Paridade com o legado: o que ainda falta (20/10/2026)

Comparação do n.privacy com o sistema anterior (DPO as a Service), tela a tela e campo a campo.

**Fonte do legado:** dois guias gravados no próprio legado em 20/10/2026 (114 e 168 passos), que cobrem todo o menu
menos Usuários. As capturas têm dados reais de cliente e **não** estão no repositório; aqui só há rótulos de tela.

**Fonte do n.360:** leitura do código na `main` em `528de3f`. Nada foi executado (nem tela, nem teste). Cada linha traz
`arquivo:linha` para conferir. "Falta" quer dizer que a busca no código não achou; não é prova de ausência.

## Fora da conta (decisões já tomadas)

Não são lacunas, mesmo que a tela seja diferente:

- A entrevista e o modo guiado da atividade. Podem ser ajustados depois.
- A situação da atividade é **derivada**, não escolhida num select. A aprovação é feita por pedido com hash.
- Os catálogos (titulares, dados, medidas, motivos de risco) nascem vazios.
- O Painel continua no lugar do Dashboard. Usuários fica em Conta e acessos.
- Fornecedores segue a rotina de TPRM: o tipo define o método, a situação é derivada e há a fila de Avaliações.
- Exportação em CSV no lugar do Excel, e Word no lugar de "Imprimir".
- Uma empresa por projeto. Os filtros e campos "Empresa" do legado viram o seletor de projeto.

## Defeito encontrado (não é paridade, é erro)

O Painel do n.privacy conta "atividades aprovadas" pela coluna `ropa_records.status = 'Approved'`
(`src/services/painel.ts:162`). A aprovação por pedido, porém, não grava essa coluna: `pedidos.ts` só muda o status do
RIPD (`src/services/pedidos.ts:314-315`). A situação "Aprovada" é derivada dos pedidos (`src/services/ropa-abas/situacao.ts:24-25`).

Na prática, toda atividade aprovada pelo caminho atual fica fora da conta. A correção é usar a mesma regra da situação derivada.

## Lacunas de conteúdo (falta o dado, não só a tela)

São as que mais pesam na virada: sem elas, a resposta que existe no legado não tem onde morar no n.360.

### 1. RIPD (DPIA): o questionário do legado não existe

O legado divide o RIPD em quatro abas de perguntas próprias:

- **Teste de Impacto:** Resultado esperado; Benefícios; "Existem terceiros (operadores) por parte das etapas de
  tratamento?"; "Existem documentos que definem o escopo de atuação desses agentes?".
- **Conformidade:** cerca de 8 perguntas, por exemplo problema anterior ou incidente registrado; o que muda depois do
  projeto; por que os dados são coletados; quantos titulares são afetados; quem aprova mudanças; se as partes
  interessadas foram envolvidas; auditorias de acesso; disponibilidade.
- **Armazenamento:** onde os dados ficam; se ficam em território nacional; se há backup fora do país; se há
  armazenamento físico; os mecanismos de segurança.
- **Logs:** linha do tempo de reaberturas.

No n.360, o RIPD é um formulário único com textos livres (`dpia_assessments`, `schema.sql:962-988`; tela em
`frontend/src/views/privacy.js:501-690`). Parte das respostas existe, mas na **atividade**:

- operadores: aba Agentes;
- local de armazenamento: etapa Armazenamento;
- volume: aba Escopo;
- medidas: aba Medidas.

Território nacional, backup no exterior, armazenamento físico, quem aprova mudanças, partes interessadas e
problema anterior **não existem em lugar nenhum**.

**Restrição:** o conteúdo do RIPD que entra no hash dos pedidos é `COLUNAS_DPIA` (`src/services/pedidos.ts:97-101`).
Uma coluna nova só entra no hash se for acrescentada ali, e isso muda o hash das aprovações que já existem.

Há dois caminhos:

- **(a)** Uma tabela de respostas por pergunta, fora do hash, como `tratamento_impacto`. As aprovações existentes
  continuam válidas, mas a resposta pode mudar sem invalidar a aprovação.
- **(b)** Entrar no hash. É o certo para a prova, mas exige decidir o que fazer com as aprovações antigas.

**Decisão do dono.**

### 2. LIA: 12 perguntas viraram 3 textos

O legado tem três abas de quatro perguntas, mais os logs:

- **Finalidade:** finalidades; benefícios para a empresa; benefícios a terceiros; relevância dos benefícios.
- **Necessidade:** se é realmente necessário; se é proporcional; se a finalidade seria alcançada sem os dados; se
  seria com menos dados, e quais.
- **Proporcionalidade:** se há dados sensíveis; se há relação formal com o titular; se já houve tratamento anterior
  dos dados desse titular; se a coleta é direta.

O n.360 tem `finalidade_legitima`, `necessidade`, `balanceamento`, `salvaguardas` e `conclusao` (`schema.sql:1555-1559`).
A LIA é uma seção da aba Base Jurídica, não uma ficha com abas (`frontend/src/atividade/aba-base.js:94-95`,
`frontend/src/views/tratamento-ligacoes.js:39-54`).

A LIA **não tem pedido nem hash**: não há entrada `lia` em `DOCUMENTOS` (`src/services/pedidos.ts:106-144`). Acrescentar
as perguntas não tem a restrição do RIPD.

Defeito à parte: o Word da LIA existe (`GET .../ropa/:rid/lia/docx`), mas **nenhum botão o chama**.
`window.baixarWordLia` (`frontend/src/views/tratamento-ligacoes.js:64`) não tem `data-action` em lugar nenhum.

### 3. Logs: o legado mostra antes e depois, o n.360 não

O "Logs da Atividade" do legado mostra o campo alterado (por exemplo "Tratamento de dados / Coleta / Ativo"), o usuário,
a data e, ao expandir, o valor anterior e o novo. O n.360 grava só a seção, a ação e os ids, e faz isso **de propósito**:
evita texto livre na trilha (`src/services/ropa-abas/logs.ts:15-23`).

Além disso, os eventos do RIPD e da LIA vão para `audit_logs` sem `entity_type`. A aba Logs da atividade não os lê
(`logs.ts:36-41`), e nem o RIPD nem a LIA têm aba própria de logs.

**Decisão do dono:** pode haver dado pessoal na trilha? Os valores das abas raramente são dado de titular, mas a
descrição do tratamento pode ser.

### 4. Fornecedor: cadastro, plano de ação, aprovação e assunção de risco

| Legado | n.360 | Evidência |
|---|---|---|
| CNPJ/CPF no cadastro e busca por CNPJ | Falta: `partes` não tem a coluna, por decisão ("Sem CPF") | `schema.sql:1339-1352` |
| Responsável pelo fornecedor | Falta | não achei |
| Plano de Ações (Ação, Fornecedor, Responsável, Prazo, Status) | Falta: `corrective_actions` não tem ligação com parte ou fornecedor | `schema.sql:646-668` |
| Aprovações (Fornecedor, CNPJ, Tipo, Responsável, Data de envio, Data de aprovação) | Falta a tela; o pedido `avaliacao_terceiro` é aceito pelo CHECK, mas nada o cria | `schema.sql:1234`, AGENTS.md ("Sem pedido de aprovacao da avaliacao ainda") |
| "Assunção de risco (N)" | Falta: não há estado, registro nem filtro | não achei |
| "Reavaliação necessária (N)" | Parcial: é a situação `vencida`, com grupos na fila Avaliações | `src/services/terceiros.ts:28-32`, `frontend/src/views/avaliacoes-terceiros.js:13,53` |

O CNPJ de **empresa** fornecedora não é dado pessoal. O "Sem CPF" protege a pessoa física. Vale separar as duas coisas
na decisão.

## Lacunas de tela (o dado existe, falta mostrar ou agir)

### 5. Colunas, busca e filtros nas listas

| Lista | Falta | Evidência |
|---|---|---|
| Atividades (RoPA) | colunas Área e Responsável; busca; filtros Área e Status | `frontend/src/views/privacy.js:109` (só Atividade, Base legal, Situação, Ações) |
| RIPD | colunas Área e Responsável; busca; filtro Área | `privacy.js:424,490-492` |
| LIA | coluna Área; busca; filtro Área | `frontend/src/views/lia.js:34-46` |
| Gestão de Riscos | coluna Estratégia (o dado vem em `treatment`) | `frontend/src/views/mapa-de-risco.js:76` |
| Gestão de GAPs | filtro Área (o servidor já devolve `area`) | `frontend/src/views/gaps.js:42-47` |
| Fornecedores | busca; colunas Data de envio e % do questionário (hoje só na ficha) | `frontend/src/views/terceiros.js:67-75,409-416` |
| Solicitações | coluna Nome do titular (existe em `titular_nome`); busca; exportação CSV (não existe `titular-pedidos` em `EXPORTACOES`) | `frontend/src/views/titular.js:96-137`, `src/services/exportacao.ts` |
| Áreas, Ativos | busca | `frontend/src/views/areas.js`, `frontend/src/views/sistemas.js` |
| Documentos | coluna Responsável (o campo está no modal) | `frontend/src/views/documentos-arquivo.js:61` |

Os CSVs de gaps e de riscos ignoram os filtros da tela, e o de gaps não traz Área, Recomendação nem Plano
(`src/services/exportacao.ts:76,93-97`).

### 6. Paginação

Nenhuma lista pagina. `renderDataTable` (`frontend/src/ui.js:446`) não tem paginação nem "itens por página". O legado
pagina Ativos, Dados do titular, Parceiros, Gaps e Riscos. Isso pesa em cliente grande.

### 7. Ficha da atividade

- **Medidas de Segurança sem "editar":** só há excluir. A rota `PUT /medidas/:id` existe (`src/routes/ropa-abas.ts:96`),
  mas falta o botão (`frontend/src/atividade/aba-medidas.js:201`).
- **Controle de GAPs na ficha:** não mostra a coluna Prazo nem o status "Em atraso". A regra existe na tela do projeto
  (`frontend/src/views/gaps.js:12-20`) e não é usada na ficha (`frontend/src/atividade/aba-gaps.js:37-44`).
- **Eliminação:** os ativos vêm herdados do Armazenamento, só leitura, sem escolha própria
  (`frontend/src/atividade/etapas.js:79-85`).
- **Armazenamento:** o local é um campo na linha, sem editar ou excluir em modal como no legado (`etapas.js:70-78`).

### 8. Ficha do RIPD e reabrir

- O RIPD é um modal, não uma página com abas. O título usa `system_name`, que fica **vazio** no RIPD criado a partir da
  atividade sem sistemas (`src/services/lia.ts:169`, `privacy.js:516`).
- `technical_measures`, `residual_risk_level`, `dpo_recommendations` e `data_category_risk` não podem ser editados na
  tela (`privacy.js:665-690`); estão só na API, no PDF e no Word.
- **Reabrir:**
  - No RIPD, o equivalente é "Revogar aprovação", só para administrador e com motivo (`src/routes/platform.ts:130-152`).
  - Na LIA, reabre direto, sem confirmação (`tratamento-ligacoes.js:50,73-74`).
  - O legado pede "Confirma a reabertura do formulário?".

### 9. Mesclar ou trocar (ícone amarelo do legado)

O legado tem uma ação de trocar ou mesclar em Ativos e Parceiros. O n.360 não tem como unir dois itens ou duas partes
movendo os vínculos. "Padronizar nomes" só lista as duplicatas e manda unir à mão
(`frontend/src/views/padronizar-nomes.js:24`).

### 10. Ações e indicadores menores

- **Excluir ativo:** a tela não oferece, embora a API apague (`src/routes/project-assets.ts:68`). Nas outras telas,
  "Excluir" é inativar (áreas, titulares, dados, parceiros), o que está coerente com o histórico.
- **Painel:** faltam % de Gaps concluídos, % de Riscos concluídos e um indicador geral de mapeamento. As solicitações
  aparecem por semana (12 semanas), não por mês (`src/services/painel.ts:192,222-226`).

## Forma e rótulo

Não bloqueiam a virada, mas o usuário do legado vai notar:

- **Teste de impacto:** no legado é caixa de marcar. No n.360 é Sim / Não / "Não sei agora", e o alto risco tem a
  **polaridade invertida**: "Sim, há alto risco" contra "Não há alto risco" (`frontend/src/atividade/aba-impacto.js:11,62`).
  Conferir no modelo de importação.
- **GDPR:** o botão diz "+ Adicionar Inciso" (`frontend/src/atividade/aba-base.js:93`). O certo é "+ Base Legal".
- **Compartilhamento externo:** diz "Parceiros". O legado diz "Organização/Instituição".
- **Medidas:** o botão diz "+ Medidas de Segurança" (o legado diz "+ Medida"). A tela mostra "Ativa" e o servidor
  grava "Ativo".
- **Tabela de etapas:** a coluna diz "Concluído". O legado diz "Registrado".
- **Modais de cadastro:** não têm "Limpar". "É um dado sensível?" é um select, e no legado é uma caixa de marcar.
- **Origem dos dados:** é escolha múltipla (o legado parece usar uma só). Agentes deixa marcar Operador e Controlador
  juntos. Conferir se o legado permite.

## O que já está equivalente

Os seis itens de Cadastros, Documentos em arquivo (com "Sem vencimento" e anexo), as nove abas da atividade e as seis
etapas do Tratamento de Dados (titulares e dados por etapa, "Não aplicável", consentimento, crianças). Também já estão:

- **GAPs:** o Controle de GAPs com as abas Gap, Plano de Ação e Anexo, e a Gestão de GAPs do projeto.
- **Riscos:** o Tratar Risco com as abas Risco, Tratamento e Risco residual (com Recalcular), e a Gestão de Riscos com
  os filtros Motivo, Área e Status.
- **Fornecedor:** as cinco perguntas de criticidade e o questionário de homologação.
- **Painel:** os prazos das ações em faixas e os riscos por nível.

## Pedidos ao dono

1. **RIPD:** respostas fora do hash (caminho a) ou dentro (caminho b)? E o texto exato das perguntas de Conformidade:
   várias estão cortadas nas capturas.
2. **LIA com as 12 perguntas:** pode seguir sem a restrição do hash. Confirmar se ela ganha página própria com abas.
3. **Logs com antes e depois:** aceita valor anterior e novo na trilha da atividade?
4. **Fornecedor:** entram CNPJ (só de pessoa jurídica) e Responsável? Plano de Ações, Aprovações e Assunção de risco
   entram agora ou ficam para depois (estão vazios no legado desta cliente)?
5. **Mesclar ativos e parceiros:** entra?
