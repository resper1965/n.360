# Frente 3: o n.iso descongelado — lista compartilhada, vocabulário único e itens soltos

Origem: `docs/arquivo/equalizacao-modulos-2026-10-20.md` (P1 restante, P2 e "Vocabulário") e a decisão do dono de 20/10/2026 de que as telas do
n.iso deixam de ser congeladas. Desenho aprovado em conversa no mesmo dia. Depende da Frente 2 (PRs #465 e #466), que já está no branch
de origem desta.

Três partes, três PRs, nesta ordem: **3B** (vocabulário), **3A** (lista), **3C** (itens soltos). Nenhuma tem migration.

## Decisões do dono que esta spec aplica

- **Lista inteira no navegador**, com "Carregar mais 25" (o que a SoA já faz). Sem paginação no servidor.
- **Status da ação** (CAPA, gap, ação da atividade: a mesma `corrective_actions`): Aberto / Em andamento / Concluído.
  **Status do risco:** Aberto / Mitigado / Aceito / Concluído.
- **Nomes de tela**, iguais nos dois módulos:

  | Hoje | Passa a |
  |---|---|
  | "Trilha de logs" (menu do n.privacy) / "Trilha de auditoria" | Trilha de auditoria |
  | "Minhas aprovações" (menu do n.privacy) / "Meus pedidos" | Minhas aprovações |
  | Documento versionado: "Documentos" (n.iso) / "Políticas" (n.privacy) | Políticas e normas |
  | Documento em arquivo (n.privacy): "Documentos" | Documentos |
  | Situação: "Vigente" (versionado) / "Publicado" (arquivo) | Vigente |

## Restrições que valem para as três partes

- `frontend/test/catracas-visuais.test.js` trava o número de `style=` por arquivo e só deixa descer; `monitor.js`, `compliance.js`,
  `documentos.js`, `partes.js`, `titular.js` e `ui.js` já estão no teto, e arquivo novo tem teto 0. O código novo usa classes de
  `frontend/src/style.css`, nunca estilo inline.
- `frontend/test/casca-menu.test.js` fixa a estrutura e os rótulos do menu; muda junto com os nomes da 3B.
- `frontend/test/uma-lingua.test.js` reprova palavra de status em inglês e título diferente do menu.
- Uma ação primária por tela; exportar é secundário.

---

## Parte 3B: vocabulário único

### B1. Rótulos de status

- `frontend/src/rotulos.js` é a tabela única. Em `GERAL`: `closed` → **Concluído** (hoje "Fechado"); `open` → Aberto,
  `in progress` → Em andamento, `mitigated` → Mitigado, `accepted` → Aceito (conferir e acertar os que já existem). O valor `publicado` do
  documento em arquivo passa a "Vigente".
- Saem os mapas locais que repetem rótulos de status:
  - `STATUS` de `frontend/src/atividade/aba-gaps.js` (Pendente / Em andamento / Concluído), também usado por `views/gaps.js`;
  - o mapa de `frontend/src/views/mapa-de-risco.js` (Open → Pendente, Closed → Concluído);
  - as opções escritas à mão no select de edição da CAPA (`views/grc.js`, "Em Andamento");
  - o rótulo `publicado` → "Publicado" de `views/documentos-arquivo.js`.

  Todos passam a `rotuloDe`. Os valores das opções dos selects continuam os do banco.
- O filtro derivado "Em atraso" de `views/gaps.js` continua (não é status do banco).

### B2. Rótulos no CSV

- Os mapas `STATUS`, `NIVEL` e `ESTRATEGIA` de `src/services/exportacao.ts` passam a ter exatamente os rótulos da tela.
- Teste `frontend/test/rotulos-csv.test.js`: importa `rotuloDe` e os mapas do servidor (`../../src/services/exportacao.ts`, como faz o
  teste da classe do controle) e reprova divergência em cada valor dos mapas.

### B3. Nomes de tela

- Menus: `frontend/login.html` (`nav-audit-trail`, `nav-meus`, `nav-documentos`), `frontend/src/globals.js` (`NO_MENU_DE_CONTA`) e
  `ROTULOS_PRIVACY` em `frontend/src/produto.js`. O item de documento em arquivo segue "Documentos".
- Títulos: toda tela usa `tituloDaTela(navId, padrao)`; saem os títulos escritos à mão em `views/documentos.js` ('Documentos'),
  `views/meus-pedidos.js` ('Meus pedidos') e `views/admin.js` (passa a ler o menu de conta quando o item da barra está escondido).
- `uma-lingua.test.js` passa a renderizar também as telas do n.privacy (titular, gaps, lia, documentos-arquivo, terceiros) além das do
  n.iso.

---

## Parte 3A: componente de lista

### A1. `frontend/src/lista.js`

Um módulo que desenha, numa área da tela, os controles e a tabela de uma lista carregada inteira no navegador.

```js
montarLista(alvo, {
    id,               // prefixo dos ids e das data-actions (único na tela)
    colunas,          // as mesmas de renderDataTable
    linhas,           // a lista inteira, já carregada pela tela
    busca,            // (linha) => texto onde buscar; ausente = sem campo de busca
    filtros,          // [{ chave, rotulo, valor: (linha) => string, opcoes?: [[valor, rotulo]] }]; sem opcoes = tiradas das linhas
    exportar,         // { caminho: '/api/v1/...', rotulo? } ou ausente
    vazio,            // { titulo, dica, acao? } para renderEmptyState
    filtroPainel,     // { tela, aba } para filtrarDoPainel, quando a tela vem do Painel
    ordenar,          // (a, b) => número, opcional
    porPagina = 25,
}) => { atualizar(novasLinhas) }
```

- **Busca:** sem acento e sem caixa (`normalize('NFD')`), sobre o texto que `busca` devolve.
- **Filtros:** `select` por filtro, "Todos" primeiro; o rótulo da opção passa por `rotuloDe` quando a opção vem dos dados.
- **Contagem:** "N de M" quando há filtro ou busca, "M" quando não há.
- **Carregar mais:** mostra `porPagina` linhas e um botão "Carregar mais 25 · X restantes"; mudar busca ou filtro volta ao começo.
- **Exportar:** botão secundário que chama `baixarArquivo(caminho)`; erro vira `showToast` com a mensagem do servidor. Exporta a lista
  inteira do servidor (uma linha de trilha por exportação), não a filtrada.
- **Painel:** com `filtroPainel`, aplica `filtrarDoPainel` antes da busca e mostra o chip "Filtro: ... — limpar" (comportamento atual).
- **Marcação:** `co-controles`, `co-campo`, `co-campo-rotulo`, `co-contagem` (já existem em `style.css`); tabela por
  `renderDataTable`; vazio por `renderEmptyState`. Nenhum `style=`.
- **Eventos:** delegação por `data-action` (`initDelegation`), sem handler inline.
- **Teste:** `frontend/test/lista.test.js` — busca sem acento, filtro com opções dos dados e fixas, contagem, carregar mais, reinício ao
  filtrar, exportar chamando `baixarArquivo` e avisando o erro, chip do Painel.

### A2. As nove listas do n.iso

| Tela | Arquivo | Busca | Filtros | Exportar |
|---|---|---|---|---|
| Ações corretivas (CAPA) | `views/grc.js` (`renderCAPA`) | título, responsável | Status, Severidade, Origem (auditoria, risco, incidente) | não (sem rota hoje) |
| Riscos | `views/grc.js` (`renderRisks`) | ameaça, ativo, responsável | Nível, Status, Tratamento; a célula da matriz vira filtro | `/export/risks` |
| Fornecedores | `views/grc.js` (`renderVendors`) | nome | Diligência, DPA (Sim / Declarado / Não), Avaliação (com / sem) | `/export/vendors` |
| Treinamento | `views/grc.js` (`renderTraining`) | colaborador, treinamento | Status | `/export/training` |
| Auditorias | `views/grc.js` (`renderAudits`) | título | Tipo, Status | não |
| Ativos | `views/monitor.js` (`renderAssets`) | nome, responsável | Categoria, Classificação, Criticidade | `/export/assets` |
| Evidências | `views/compliance.js` (`renderEvidence`) | arquivo, controle | Avaliação, Validade (em dia / vencida / sem) | não |
| Políticas e normas | `views/documentos.js` (`renderDocumentos`) | título | Tipo, Situação | não |
| Partes | `views/partes.js` (`renderPartes`) | nome, e-mail | Tipo, Situação | não |

- **Riscos:** a matriz 5x5 continua no topo; a lista abaixo deixa de ser cartões (`.list-item`) e vira tabela com Ameaça, Ativo, Nível,
  Residual, Tratamento, Status e Responsável. Clicar na célula aplica o filtro de probabilidade e impacto da lista (o `S.riskFilter` de
  hoje vira esse filtro).
- **Políticas e normas:** a árvore (pai e filho) continua quando não há busca nem filtro; com busca ou filtro, a lista fica plana.
- **Partes:** a lista de departamentos continua separada, também pelo componente.

### A3. Listas do n.privacy que repetem o padrão

Passam ao componente, sem mudar o que a pessoa vê além do "Carregar mais" e da contagem: Gaps (`views/gaps.js`), LIA (`views/lia.js`),
RIPD e RoPA (`views/privacy.js`), Documentos (`views/documentos-arquivo.js`), Pedidos e incidentes (`views/titular.js`), Consentimentos
(`views/consentimentos.js`), a vista Lista do mapa de risco (`views/mapa-de-risco.js`), Fornecedores (`views/terceiros.js`, que troca
`.tc-filtros` por `co-controles`), Áreas (`views/areas.js`) e Sistemas (`views/sistemas.js`). A busca no servidor de Titulares e dados
pessoais (`views/catalogos.js`, `?q=`) fica como está.

---

## Parte 3C: itens soltos

### C1. CSV do n.iso em pt-BR

- `GET /projects/:id/export/{risks,vendors,training,audit-log,assets}` (`src/routes/integrations.ts`) passam a montar o arquivo por
  `montarCsv` de `src/services/exportacao.ts`: BOM, `;`, CRLF, cabeçalho em português, valores pelos rótulos de B2, `Content-Type` com
  `charset=utf-8`. A trilha (`csvComTrilha`) e os filtros de faixa continuam. O nome do arquivo fica.
- Tela: o `exportCSV` de `views/monitor.js` sai; todo uso (`grc.js`, `monitor.js`) passa a `baixarArquivo`, que avisa o erro e usa o
  nome do servidor.
- **Muda o formato** para quem consome esses CSVs (separador, cabeçalho, valores): uma linha no CHANGELOG.
- Teste: um por rota, conferindo BOM, `;`, cabeçalho e um valor traduzido.

### C2. Prazo e responsável da ação

- `due_date` da CAPA (`createCapaSchema` e `capaUpdateSchema`, `src/schemas/resources.ts`) passa a `dataIso` (AAAA-MM-DD), como o
  `prazo` do gap. Valor gravado fora do formato continua legível (a validação é só na escrita).
- O formulário de CAPA do n.iso (`views/grc.js`) torna o responsável obrigatório, como o gap. No servidor da CAPA ele segue opcional: a
  CAPA gerada por incidente e a importação nascem sem responsável.

### C3. Risco no n.iso com residual e prazo

- Formulário de criar e editar risco (`views/grc.js`): impacto e probabilidade residuais (o nível residual é calculado pelo servidor,
  `residualLevel`) e o prazo de tratamento.
- Servidor: `createRiskSchema` e `riskUpdateSchema` aceitam `treatment_due_date` (`dataIso`, nulo limpa); `POST` e `PUT /risks`
  gravam a coluna (hoje só a rota da atividade grava). Teste de criar, editar parcial e limpar.

### C4. Validade da evidência no n.iso

- `PUT /projects/:id/evidence/:eid/validade` passa à faixa `nucleo` (entra em `SUBROTAS_NUCLEO`, `src/modulos.ts`); a ligação a requisito
  (`.../requisitos`) continua `privacy`. Teste em `test/modulos-produto.test.ts` e um de projeto só do n.iso definindo a validade.
- A tabela de Evidências do n.iso ganha a coluna "Validade" (data ou "Sem validade", vencida marcada) e a ação "Definir validade" no menu da
  linha, para quem já edita evidência.

### C5. Nome do fornecedor

- `PUT /vendors/:id` (`src/routes/vendors.ts`) grava o nome por `normalizarNome`, como o `POST`. Teste.

---

## Fora do escopo

- Paginação e busca no servidor (decisão: lista no navegador).
- Ordenação por coluna clicável (o `renderDataTable` não tem; cada tela segue com a ordem do servidor ou `ordenar`).
- Integrações entre telas (controle e atividades dependentes, DPO e encarregado, Painel do n.iso): spec própria.
- Paridade com o legado que depende de decisão do dono (questionários do RIPD e da LIA, logs com antes e depois, mesclar duplicados,
  CNPJ e responsável no fornecedor, CSV das solicitações, polaridade do teste de impacto).
