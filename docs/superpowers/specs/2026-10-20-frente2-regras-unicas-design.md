# Frente 2: uma regra por conceito e as decisões de 20/10 (n.iso x n.privacy)

Origem: `docs/arquivo/equalizacao-modulos-2026-10-20.md` (P1 e "Decisões do dono"). A Frente 1 (defeitos P0) está no PR #463.
Desenho aprovado pelo dono em 20/10/2026, em conversa. Duas partes, dois PRs: **2A** primeiro, depois **2B**.

## Objetivo

A mesma linha do banco dá o mesmo número e segue a mesma regra, qualquer que seja a tela por onde se entra. Na 2A,
uma função por conceito, chamada por todos os leitores. Na 2B, as três decisões do dono sobre aprovação de RIPD,
aceite de risco e DPA.

Fora do escopo: componente de lista compartilhado e vocabulário de status (Frente 3), e as telas novas do legado.

---

## Parte 2A: uma regra por conceito

Não muda tela (salvo o item 4), muda número. Cada regra nasce num serviço compartilhado; os leitores antigos são
trocados por ela e nenhuma cópia local sobra.

### A1. "Hoje" em São Paulo

- **Servidor:** `hojeEmSaoPaulo()` (hoje em `src/services/avisos-prazo.ts`) sai para um módulo próprio, `src/services/hoje.ts`
  (que `avisos-prazo.ts` reexporta, para não quebrar importações). Substitui o `new Date().toISOString().slice(0, 10)` em
  `painel.ts`, `encarregado.ts` (também o `em7`: hoje mais 7 dias, a partir do dia de São Paulo), `titular-pedidos.ts`,
  `incidentes.ts`, `prontidao.ts`, `riscos-atividade.ts` (gaps) e `terceiros.ts`.
- **SQL:** consulta que compara com `date('now')` para decidir vencimento recebe o dia de São Paulo como parâmetro
  (`ponto-de-partida.ts`). As que só gravam data de carimbo (`documentos.ts`, `revisar_ate`) ficam.
- **Frontend:** `hojeSP()` em `frontend/src/ui.js` (Intl, `America/Sao_Paulo`) substitui `toISOString().slice(0, 10)` e o dia do
  fuso do navegador em `filtro-painel.js`, `views/documentos.js`, `views/gaps.js`, `views/titular.js`,
  `views/avaliacoes-terceiros.js`, `views/grc.js` e `views/monitor.js`.
- **Teste:** com o relógio às 21h30 de Brasília (00h30 UTC do dia seguinte), um prazo de hoje não aparece como vencido no
  Painel, no encarregado, na situação do pedido do titular nem nos gaps.

### A2. "Controle implementado"

- `SQL_CLASSE_CONTROLE` (`src/services/painel.ts`) é a regra única: `na`, `feito`, `andamento`, `falta`. **Entra `COMPLIANT`
  (legado) em `feito`**, que hoje cai em `andamento`.
- Passam a usá-la: gap-analysis (`src/routes/projects.ts`), passos da Bancada (`src/services/passos/contexto.ts`),
  readiness (`src/routes/readiness.ts`), coherence (`src/services/coherence.ts`), medidas do RoPA
  (`src/services/ropa-abas/medidas.ts`) e `lacunasDaFonte` (`src/services/requisitos.ts`: `feito` cobre conforme o
  mapeamento; `andamento` dá no máximo parcial, que inclui `Partial` e `In Progress` como hoje).
- **Frontend:** a mesma classificação em `frontend/src/classe-controle.js` (espelho da SQL, com teste que lê as duas listas e
  reprova divergência), usada pelos filtros e contagens da SoA em `views/compliance.js`.
- **Teste:** o mesmo projeto, com um controle em cada status, dá o mesmo "X de Y" no Painel, na Prontidão, na gap-analysis
  e na Bancada.

### A3. Marco "Em operação desde"

- A data é a **primeira aprovação registrada**, de qualquer fonte: colunas `ciso/ceo_approved_at` de `compliance_controls` e
  `ropa_records`, `dpo_approved_at` de `dpia_assessments` e `pedido_destinatarios.decidido_em` com status `aprovado` em pedidos de papel `ciso`/`ceo` do
  projeto. Uma função, `marcoDoPrograma(db, projectId)`, em `painel.ts`.
- **Teste:** programa só do n.privacy, com a atividade aprovada por pedido, deixa de ser "Em implantação".

### A4. Quem é fornecedor

- **Critério único:** parte `organizacao`, `status = 'ativa'`, que não seja só parte interessada (o `SO_PARTE_INTERESSADA` de
  `src/services/terceiros.ts`), exposto como fragmento SQL `SQL_EH_FORNECEDOR` em `terceiros.ts`.
- **Leitores:** a lista do n.iso (`src/routes/vendors.ts`, `SQL_VENDORS_VISIVEIS`), a Bancada (`passos/contexto.ts`), o Painel
  e o ponto de partida.
- **Mudança visível:** a lista de Fornecedores do n.iso passa a mostrar toda organização que é fornecedor, com o perfil de
  segurança (`vendors`) opcional: sem perfil, a linha aparece com "Sem avaliação de segurança" e o perfil é criado na primeira
  edição (o upsert por `parte_id` que já existe).
- **Teste:** organização criada em Partes aparece nos dois módulos e conta igual no Painel e na Bancada.

### A5. Evidência vencida

- Duas regras com nome, em `painel.ts`: `SQL_EVIDENCIA_VENCIDA` (`valido_ate` preenchida e `substr(valido_ate, 1, 10)` antes de
  hoje em São Paulo) e `SQL_EVIDENCIA_RUIM` (vencida ou `non_conforming`).
- O encarregado conta "vencidas" pela primeira (corrige a falta do `substr`); onde a soma é "vencida ou não conforme", o
  rótulo diz "a revisar".
- **Teste:** evidência com validade ontem e evidência não conforme contam igual no Painel e no encarregado, cada uma no
  seu rótulo.

### A6. Ativo

- Classificação padrão: **Confidencial** nos dois módulos (`src/services/itens.ts` já usa; o formulário do n.iso em
  `views/monitor.js` passa a pré-selecionar Confidencial).
- O select "Status" do n.iso (`views/monitor.js`), que o servidor ignora, sai; excluir é a exclusão lógica da Frente 1.

---

## Parte 2B: as três decisões do dono

### B1. RIPD: uma assinatura basta, e mudar o conteúdo invalida

- `assinaturaDpia` (`src/services/pedidos.ts`): a assinatura do CISO **ou** a do CEO leva o status a `Approved`. Vale pela
  rota de aprovação direta (`POST .../dpia/:id/approve`, `src/routes/platform.ts`) e pelo pedido (`registrarDecisao`).
- `PUT /dpia/:id` (`src/routes/platform.ts`): lê a linha antes, compara as colunas de `COLUNAS_DPIA`; se alguma mudou e havia
  assinatura, zera `dpo_signature`, `ceo_signature`, `dpo_approved_by` e `dpo_approved_at`, volta o status a `Draft` e grava
  `dpia.aprovacao_invalidada` na trilha do projeto (com as colunas que mudaram, sem o texto). Editar sem mudar conteúdo não
  invalida. O pedido aberto continua sendo substituído (`conferirPedidosDoDocumento`, já existe). O bloqueio de `status` no
  corpo de um RIPD aprovado sai, porque editar o conteúdo já o tira de aprovado.
- Ficam: revogação com motivo e o bloqueio de exclusão do RIPD aprovado.
- **Tela** (`frontend/src/views/privacy.js`): sai a indicação de que faltam as duas assinaturas; antes de salvar um RIPD aprovado,
  `confirmaEdicaoAprovada` avisa que a aprovação cai.
- **Teste:** uma assinatura aprova; editar conteúdo zera e grava a trilha; editar só o status de rascunho para revisão não zera.

### B2. Aceite de risco: um modelo só

- **Regra:** aceito é `status = 'Accepted'`, com `accepted_by` (e-mail da sessão) e `accepted_at` carimbados pelo servidor na
  transição. A função `carimboDeAceite` sai de `src/services/riscos-atividade.ts` (onde já existe a lógica) e passa a servir
  também `POST/PUT /risks` (`src/routes/risks.ts`). `accepted_by` e `accepted_at` vindos do corpo são ignorados nas duas rotas.
  O agente continua recusado (403).
- **Tratamento "Aceitar"** (`treatment = 'Accept'`) passa a ser só a estratégia.
- **Tela n.iso** (`frontend/src/views/grc.js`): saem os campos de quem e quando do aceite; entra o botão "Aceitar risco"
  (`window.confirmar`, depois `PUT /risks/:id` com `status: 'Accepted'`) no risco com tratamento Aceitar ainda não aceito; o
  risco aceito mostra "Aceito por X em dd/mm/aaaa" (ou "Aceite registrado à mão: X em dd/mm/aaaa").
- **Tela n.privacy** (`frontend/src/atividade/aba-riscos.js`): o mesmo botão e a mesma linha.
- **Migration 0082** (`migrations/0082_aceite_risco.sql` e `schema.sql`): `ALTER TABLE risks ADD COLUMN aceite_manual INTEGER
  NOT NULL DEFAULT 0`; `UPDATE risks SET status = 'Accepted', aceite_manual = 1 WHERE treatment = 'Accept' AND
  trim(COALESCE(accepted_by, '')) <> '' AND COALESCE(status, 'Open') NOT IN ('Accepted', 'Closed', 'Mitigated')`. O nome e a data
  digitados ficam. Cabeçalho da migration com a contagem a conferir antes (`SELECT count(*) ...` com a mesma WHERE).
  **Produção só com o "sim" do dono e `npm run db:backup` antes.**
- **Teste:** `PUT` com `accepted_by` no corpo grava o e-mail da sessão; aceite pelo n.iso aparece aceito no n.privacy e conta
  no Painel; a migration leva o caso legado a `Accepted` com `aceite_manual = 1` e não toca risco sem nome.

### B3. DPA: fonte única no documento ligado

- **Fonte:** documento ligado ao fornecedor em `documento_partes` com papel `dpa`. Uma função `temDpa` / fragmento SQL em
  `src/services/terceiros.ts`, já usada pela pendência.
- **Leitores trocados:** índice de confiança (`+10`, `src/routes/vendors.ts`), CSV de fornecedores
  (`src/routes/integrations.ts`) e a ficha (n.iso e n.privacy).
- **Escrita:** `PUT /vendors/:id` e o upsert deixam de gravar `dpa_signed` e `dpa_url` (ignorados no corpo); as colunas ficam
  como histórico, sem migration.
- **Legado:** fornecedor com `dpa_signed = 1` ou `dpa_url` e sem documento ligado aparece como "DPA declarado, sem documento"
  (com o link antigo, só leitura), continua com a pendência "DPA" e perde os 10 pontos até ligar um documento.
- **Faixa:** as rotas de ligar e desligar documento ao terceiro (`/projects/:id/terceiros/:parteId/documentos*`,
  `src/routes/terceiros.ts`) passam à faixa `nucleo` (exceção explícita em `src/modulos.ts`, com teste em
  `test/modulos-produto.test.ts`), para um projeto só do n.iso ligar o DPA.
- **Tela n.iso** (`frontend/src/views/grc.js`): a caixa "DPA assinado" e o campo de link viram a lista de documentos DPA
  ligados e "Ligar documento", o mesmo componente da ficha do n.privacy (`views/terceiros.js`).
- **Teste:** ligar o documento soma os 10 pontos e tira a pendência; `dpa_signed` no corpo não muda nada; projeto só do n.iso
  liga o DPA.

---

## Riscos e o que não fazer

- Números vão mudar no Painel e na Prontidão (A1, A2, A3, A5) e no índice de confiança (B3). O CHANGELOG diz quais e por quê.
- Não reconstruir `dpia_assessments` nem unificar as duas famílias de colunas (hash das aprovações existentes).
- Não apagar `vendors.dpa_signed`/`dpa_url` nem `risks.accepted_by` digitado: são histórico.
- `pedidos.ts` congelado no hash: B1 mexe só em `assinaturaDpia`, não em `COLUNAS_DPIA` nem em `DOCUMENTOS`.
