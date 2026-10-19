# Listas do legado no n.privacy (Gaps, Riscos, LIA, Solicitações, RIPD)

Etapa 3 do plano `docs/superpowers/plans/2026-10-18-versao-final.md`. Decisão do dono (19/10/2026): sem capturas, as telas
saem dos campos que já existem e já são gravados. Sem migration. Tudo na faixa `privacy` ou `nucleo` já existente; rota nova
de projeto entra em `src/modulos.ts` (o `test/modulos-produto.test.ts` reprova rota sem faixa).

## Menu

`SECOES_PRIVACY`, seção Avaliar: RIPD, LIA (`nav-lia`, novo), Riscos (`nav-mapa-de-risco`, rótulo "Riscos"), Gaps
(`nav-gaps`, novo), Cobertura da LGPD. Itens novos em `login.html`, só no n.privacy (`SO_PRIVACY`).

## Gaps (lista do projeto)

- Servidor: `GET /projects/:id/ropa/gaps` (lê, não grava; o agente pode ler). Base: `acoesDasAtividades()`
  (`src/services/riscos-atividade.ts`), acrescida de `recomendacao`, `action_plan` e `anexos` (contagem em `acao_anexos`).
  Cada item: `{ id, ropa_id, atividade, titulo, recomendacao, plano, responsavel, prazo, faixa, status }`.
- Tela `views/gaps.js`: colunas Atividade, Gap, Recomendação, Plano, Responsável, Prazo, Status, Anexos. Filtros na tela:
  status, responsável, faixa de prazo (vencido, 7 dias, 30 dias, sem prazo). Linha: "Abrir" leva à atividade na aba Gaps.
  Sistema vazio: estado vazio que diz que gaps nascem na aba Gaps de cada atividade.

## Riscos (modo lista)

- Servidor: `riscosDoMapa` passa a devolver também `vulnerabilidade`, `plano`, `prazo` (`treatment_due_date`),
  `responsavel` (nome da parte) e `idr`. O export `export/riscos-atividade` ganha a coluna Prazo.
- Tela `mapa-de-risco.js`: alternância "Mapa | Lista" (a escolha fica no endereço, `?vista=lista`). Lista: Atividade, Ameaça,
  Vulnerabilidade, Nível, Estratégia, Residual, Prazo, Responsável. Filtros: nível e estratégia. "Abrir" leva à atividade na
  aba Riscos.

## LIA (lista)

- Servidor: `GET /projects/:id/ropa/lias` com a mesma consulta do export `export/lia` (`src/services/exportacao.ts`). Cada
  item: `{ ropa_id, atividade, status, conclusao, concluida_por, concluida_em }`. Inclui as atividades com base de legítimo
  interesse SEM LIA, com `status: 'faltando'` (a regra de `liaExigida`).
- Tela `views/lia.js`: colunas Atividade, Situação (Faltando, Rascunho, Concluída), Conclusão (resumo), Concluída em.
  Filtro: situação. "Abrir" leva à atividade na aba Base Jurídica.

## Solicitações e RIPD (colunas)

- Pedidos do titular (`views/titular.js`, aba pedidos): colunas Canal e Respondido em; filtros tipo e status na tela.
- RIPD (`renderDPIA`, `views/privacy.js`): colunas Atividade (finalidade do RoPA ligado) e Risco residual; filtro status.

## Testes

- Servidor (D1 real): gaps com recomendação, plano e contagem de anexos, só do projeto (isolamento); riscos com os campos
  novos; LIA com a atividade faltando; agente lê as três.
- Telas (jsdom): colunas, filtros e o "Abrir" de cada lista; menu Avaliar com a ordem nova; vazio de cada uma.
- E2E: Gaps lista → filtro status → abrir atividade na aba Gaps.
