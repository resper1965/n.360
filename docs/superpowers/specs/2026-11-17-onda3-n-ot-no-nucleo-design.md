# Onda 3: o n.ot aponta para o núcleo

Data: 17/11/2026. Situação: **rascunho para aprovação do dono**. Onda 3 da spec guarda-chuva
`2026-11-14-n360-posicionamento-e-fluxo-design.md`. Base: levantamento somente leitura sobre a `main` com o PR #593 da remediação
(`/tmp/claude-0/-home-user/0c1d5499-e055-503d-a651-849433c76e01/scratchpad/onda3-levantamento.md`, com arquivo:linha e o comando de cada
número). As specs e o modelo de ameaças do n.ot estão em `/home/user/ot2net/docs/superpowers/specs/` (P0-1 a P0-8 em
`2026-10-30-n-ot-modulo-n360-design.md:156-163`).

## O pedido

O n.ot deixa de ser uma ilha: risco, ação corretiva e incidente podem apontar para um ativo ou site de OT; um desvio do n.ot vira ação
corretiva por decisão de uma pessoa; o fornecedor de OT (integrador, fabricante, acesso remoto) usa o cadastro de terceiros. Sem
regredir nenhuma proteção do n.ot.

## Não regridem (travados por teste)

- **P0-1:** `ot` nunca é concedido automaticamente; precisa do módulo no projeto **e** na pessoa.
- **P0-2:** nenhuma chave de API nem agente no n.ot.
- **P0-4:** um filtro de site só (`sitesPermitidos`); **P0-6:** uma máscara só (IP/MAC); **P1-1:** step-up.
- A exportação de portabilidade nunca leva tabela `ot_*` e **nada** que revele id, nome ou existência de ativo/site de OT.
- Os três números do cliente (`test/onda2-numeros.test.ts`, que não se edita).
- Quem não tem `ot` não vê **nem a existência** de uma referência ao n.ot.

## Decisões do dono

| # | Decisão | Resposta |
|---|---|---|
| 1 | Faixa da ação vinda do desvio | **Exigir o n.iso no projeto.** `corrective_actions` continua do n.iso; o botão "Criar ação corretiva" só funciona se o projeto tem n.iso (senão, 409 "habilite o n.iso"). Não muda a faixa de ninguém |

### A rever (recomendação minha, ainda não respondida)

| # | Tema | Recomendação |
|---|---|---|
| 2 | Onde mora a referência | **Tabela satélite `ot_referencias`** (nome com prefixo `ot_`: já fora da exportação), com uma coluna por alvo do núcleo (`risk_id`, `acao_id`, `incidente_id`) e FK `ON DELETE CASCADE`. **Não** colunas em `risks`/`corrective_actions`/`incidentes`: seriam 6 colunas saindo na exportação (que o técnico e a chave de leitura alcançam) e 27 arquivos de leitura a filtrar |
| 3 | Texto da ação criada a partir do desvio | Texto escrito pela pessoa, validado com `livreSemPii` **e** recusando o nome exato de ativo, zona ou site do projeto; sugestão neutra "Tratar desvio de segurança operacional". O título aparece no painel, nos avisos de prazo (exportados), no CSV e no MCP |
| 4 | Segregação | Quem criou a ação a partir do desvio **não a conclui** (`criado_por` no satélite; recusa ao fechar a ação), alinhada à onda 1 |
| 5 | Situação do desvio ao criar a ação | Vira `tratado` com a nota "Ação corretiva aberta", na mesma operação. Reaberto/aceite vencido avisa e **não** muda a ação; `regularizado` **não** fecha a ação (concluir é decisão humana) |
| 6 | Trilha de auditoria | **Primeiro e à parte:** filtrar `action LIKE 'ot.%'` na exportação e no `GET /audit-trail` para quem não tem `ot`. Hoje quem alcança o projeto já vê que houve atividade de OT e os ids (`audit_logs` tem `project_id` e é exportado) |
| 7 | Avaliação do fornecedor de OT | Perguntas de OT entram como **perguntas do projeto** (mecanismo que já existe); sem quinto modelo. A avaliação de terceiro é da faixa `privacy`: projeto só com `ot` não a alcança, e vale o mesmo princípio da decisão 1 (exigir o módulo; avisar) |
| 8 | O que quem não tem `ot` vê do fornecedor | A **parte** (cadastro comum) aparece e é avaliada como qualquer fornecedor; o **papel de OT**, o site e o fluxo ficam escondidos |
| 9 | Referência no incidente | Entra já (com o satélite não há risco; o incidente é núcleo e o agente o lê, e não vê a referência) |

## O que existe hoje (resumo)

- Faixas (`src/modulos.ts`): `risks` e `corrective_actions` são do n.iso; `incidentes`, `partes` e `vendors` são núcleo; `terceiros` e
  `homologacoes` são do n.privacy. O OT só remove por status (`status='removido'`), então a FK nunca dispara: a leitura da referência
  filtra `status='ativo'` e `sitesPermitidos`.
- `ot_desvios` tem `UNIQUE(project_id, tipo, chave_sensor)`: uma ação por desvio é natural (idempotência via `UNIQUE(ot_desvio_id)`).
- `corrective_actions` não tem `criado_por`; o satélite o guarda.
- `partes.terceiro_tipo` é porte/criticidade, não natureza; nenhuma rota cria o pedido `avaliacao_terceiro`; no n.ot o fabricante é texto
  livre e o acesso remoto é só `externo`/`via_vpn`.

## O que muda

### Entrega 1: fechar a fuga de `ot.%` na trilha e na exportação (sem migration)

- `GET /projects/:id/audit-trail` e a exportação de portabilidade omitem as linhas `action LIKE 'ot.%'` de `audit_logs` para quem não
  tem o módulo `ot` (pessoa) e para agente e chave de API (nunca).
- O teste de isolamento passa a procurar o **id** de ativo/site de OT no export, não só nomes (o teste atual só procura nomes).

### Entrega 2: `ot_referencias` (migration `0115`, aditiva)

- Tabela `ot_referencias (id, project_id, risk_id, acao_id, incidente_id, ot_site_id, ot_ativo_id, ot_desvio_id, criado_por,
  created_at)`: exatamente um alvo do núcleo (CHECK), ao menos um alvo de OT (CHECK), FKs com `ON DELETE CASCADE`,
  `UNIQUE(ot_desvio_id)`.
- Rotas só sob `/projects/:id/ot/referencias` (ler, criar, apagar): herdam P0-1 e P0-2; filtram `status='ativo'` e `sitesPermitidos`.
- Nenhuma leitura do núcleo faz JOIN no satélite. Os detalhes de risco, ação e incidente mostram o bloco "n.ot" só na tela do n.ot ou
  quando o servidor o manda a quem tem o módulo (por uma rota `/ot/...`).

### Entrega 3: desvio vira ação corretiva

- `POST /projects/:id/ot/desvios/:id/acao` (sob `ot/`): `podeEditarOt`, desvio visível pelo site, só pessoa (nunca agente nem chave de API),
  exige n.iso no projeto (409 em português), texto validado (decisão 3), cria a ação + o vínculo + marca o desvio `tratado` numa operação.
- Idempotente: um desvio, uma ação; chamar de novo devolve a existente.
- Botão em `ot-desvios.js`; bloco "n.ot" nos detalhes.

### Entrega 4: fornecedor de OT

- Satélite `ot_fornecedores (project_id, parte_id, papel CHECK IN ('integrador','fabricante','acesso_remoto'), ot_site_id, ot_fluxo_id)`
  com FK em `partes` `ON DELETE CASCADE`; rota e tela sob `/ot/`. Perguntas de OT como perguntas do projeto (decisão 7).

## Testes

- Isolamento: exportação sem id de OT e sem `ot.%` para técnico e chave de leitura; pessoa sem `ot`, agente e chave: nem a existência da
  referência; técnico fora do site não vê a referência; `audit-trail` sem `ot.%` para quem não tem o módulo.
- Satélite: CHECKs, `UNIQUE(ot_desvio_id)`, CASCADE (D1 precisa aplicar FKs: **não conferido em produção**).
- Desvio → ação: idempotência, 409 sem n.iso, recusa de texto com IP/MAC e com nome de ativo, segregação ao fechar, agente/chave recusados.
- Os três números da onda 2 intactos; `contrato-isolamento-org` cobre as rotas novas.

## Entrega

Quatro PRs, o mais arriscado primeiro: (1) fuga da trilha/exportação; (2) `0115` + referências; (3) desvio → ação; (4) fornecedor de OT.
A `0115` segue o procedimento de `migrations/README.md` (backup, apply remoto, conferir, só então merge); o `db-migrate.yml` é manual.

## Não conferido

Módulos dos projetos em produção (quantos com `ot` têm `iso`/`privacy`); se o D1 de produção aplica `PRAGMA foreign_keys` (o CASCADE
depende); o volume de `ot.%` em `audit_logs` em produção; se a carteira (`painel.ts:571-582`) filtra por módulo antes de listar títulos
de ações; importação/mesclar/padronizar-nomes (se recriam ações).
