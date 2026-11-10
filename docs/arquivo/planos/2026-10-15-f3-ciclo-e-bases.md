# F3: ciclo de vida do dado e várias bases legais (com GDPR): plano

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam caixas `- [ ]`.

**Objetivo:** fechar as lacunas 4 e 5 do plano mestre (`docs/arquivo/planos/2026-10-14-legado-privacidade.md`): o ciclo de vida do dado por etapa e mais de uma base legal por atividade, inclusive a base do GDPR, sem mexer no conteúdo congelado das aprovações.

**Arquitetura:** duas tabelas novas ligadas à atividade (`ropa_records`) e uma coluna de texto, todas aditivas (migration 0074). Serviços `src/services/ciclo.ts` e `src/services/bases.ts`; sub-rotas `GET/PUT .../ropa/:rid/ciclo` e `GET/PUT .../ropa/:rid/bases` na faixa `privacy`. A entrevista grava e lê o que hoje é "sem coluna" (origem e eliminação) e pergunta o ciclo e as bases adicionais uma vez. Nada disso entra em `DOCUMENTOS.tratamento` nem em `COLUNAS_DPIA` (`src/services/pedidos.ts`): o padrão é não incluir, e nenhuma das duas coisas é indispensável no hash.

**Insumos:** plano mestre (restrições globais, pré-preenchimento, lacunas 4 e 5, adequações, parágrafo F3); pesquisa `docs/arquivo/planos/2026-10-14-legado-pesquisa-de-codigo.md` (seções C, D, E; decisões D5 e D6); moldes F1 (`src/services/impacto.ts`, 0072, `test/impacto.test.ts`, `test/tratamento-aprovacao.test.ts`) e F2 (`src/services/riscos-atividade.ts`, 0073).

## Decisões desta fase

| # | Decisão | Por quê |
|---|---|---|
| F3-a | `tratamento_ciclo` com chave `(ropa_id, etapa)`: uma linha por etapa, com **um** item opcional e descrição | D6 (tabela nova, não `etapa` em `tratamento_itens`). Um item por etapa basta para o legado (a F6 importa "atividade, etapa, situação, item"); os demais sistemas da atividade já estão em `tratamento_itens`. Teto: etapa com vários sistemas cita os outros na descrição; se faltar, troca-se a chave por `id` numa migration aditiva |
| F3-b | Integridade no banco: CHECK de etapa e situação, `nao_aplicavel` sem item, FK com CASCADE do tratamento e do projeto, `item_id` com `ON DELETE SET NULL`, e dois gatilhos (inserir e alterar) que recusam tratamento ou item de outro projeto | Molde dos gatilhos da 0056 (`dpia_ropa_do_projeto_*`); `tratamento_itens` só confere no serviço, aqui a regra vale também para SQL direto |
| F3-c | `tratamento_bases(ropa_id, requisito_id, project_id, observacao)` sem coluna `tipo` | O tipo (art. 7, art. 11, GDPR) é derivado do id do requisito (`lgpd:art7:*`, `lgpd:art11:*`, `gdpr:art6:*`, `gdpr:art9:*`); guardar seria dado duplicado. `observacao` diz a que parte do tratamento a base se aplica |
| F3-d | `ropa_records.base_gdpr` é **texto livre** (até 300) | O catálogo `gdpr` não tem requisitos (`src/services/requisitos.ts:25`); texto jurídico novo não entra por código. Pendência jurídica registrada abaixo |
| F3-e | `base_legal_id` continua a principal; sem backfill para a tabela nova; adicional igual à principal é recusado (400) | D5: o hash de todo tratamento aprovado ficaria igual só sem cópia |
| F3-f | Nada novo no hash do tratamento nem da DPIA; as rotas novas não chamam `conferirPedidosDoDocumento` | Restrição global; o mecanismo `soSeMarcado` fica sem uso nesta fase |
| F3-g | O agente (MCP) pode gravar ciclo e bases | Nenhum dos dois é ato que a regra marque como humano (como itens e departamentos); aprovar continua humano |
| F3-h | Selo "mudou na origem": `lerLigacoes` e `GET /projects/:id/dpia` devolvem `origem_mudou` (o `origem_hash` da F1 diferente do hash atual do tratamento); a tela avisa, nada é invalidado | Simples: um `documentoAtual` por tratamento |
| F3-i | Diagrama do tratamento fica como está | Os itens do ciclo já aparecem pelo `tratamento_itens`; rotular arestas por etapa duplicaria nós. Relatório do RoPA mostra o ciclo e as bases |

## Tarefas

### F3.1: migration 0074 e schema

- Criar `migrations/0074_ciclo_e_bases.sql`, `test/migration-0074.test.ts`; modificar `schema.sql` (tabelas e índices depois de `tratamento_impacto`, `base_gdpr` em `ropa_records`, gatilhos), `migrations/README.md`.
- Teste: colunas; CHECK de etapa, situação e `nao_aplicavel` com item; gatilho recusa item e tratamento de outro projeto; apagar o tratamento apaga ciclo e bases; apagar o item deixa a etapa sem item; `base_gdpr` nasce NULL.

### F3.2: serviços

- `src/services/ciclo.ts`: `ETAPAS_CICLO` (id e rótulo, na ordem), `lerCiclo(db, p, rid)` (as 6 etapas, com a resposta ou null, e o nome do item), `salvarCiclo(db, p, rid, ator, etapas)` (upsert das etapas que vieram; campo ausente mantém o gravado; item de outro projeto é 400 com `invalidos`).
- `src/services/bases.ts`: `ehBaseDoCatalogo(id)`, `lerBases(db, p, rid)` (principal, adicionais com referência e título, `base_gdpr`), `salvarBases(db, p, rid, corpo)` (`adicionais` troca o conjunto; `base_gdpr` atualiza; requisito fora das bases ou inexistente é 400; igual à principal é 400).
- Testes em `test/ciclo-bases.test.ts`.

### F3.3: rotas, esquemas, faixa e contrato

- `src/routes/ropa.ts`: `GET/PUT /:recordId/ciclo` e `GET/PUT /:recordId/bases`, trilha `ropa.ciclo` e `ropa.bases` só com nomes de etapa ou campo.
- `src/schemas/nucleo.ts`: `tratamentoCicloSchema` e `tratamentoBasesSchema`, estritos. `src/openapi.ts` e `npm run openapi`.
- `src/modulos.ts`: `ciclo|bases` em `SUBROTAS_PRIVACY`.
- Testes (mesmo arquivo): grava e lê; 400 nos inválidos; 404 em atividade de outro projeto; cliente sem escrita recebe 403; pessoa sem o n.privacy recebe 403; o agente grava.

### F3.4: quem lê as bases e o ciclo

- `src/services/tratamentos.ts` (`lerLigacoes`): LIA exigida também por base adicional e pelo texto do GDPR; `origem_mudou` na LIA e em cada DPIA.
- `src/services/encarregado.ts`: "sem base legal" considera principal, adicional ou GDPR; "LIA pendente" considera as adicionais. `src/services/requisitos.ts` não conta base legal (conferido): nada muda lá.
- `src/services/lia.ts` (`criarDpiaDoTratamento`): o fluxo leva o ciclo; a necessidade leva as bases adicionais e o GDPR.
- `src/routes/projects.ts` (`GET /dpia`): `origem_mudou`.
- Relatório do RoPA (`src/routes/ropa.ts`): bases adicionais, GDPR e ciclo.
- Testes: `test/ciclo-bases.test.ts` (LIA exigida, encarregado, DPIA herdada, relatório, `origem_mudou`), `test/tratamento-aprovacao.test.ts` (não regressão: aprovação de antes vale depois de gravar ciclo e bases, e o pedido aberto não é substituído), `test/portabilidade.test.ts` (as tabelas novas entram no export).

### F3.5: telas

- `frontend/src/views/ropa-entrevista.js`: `origem` grava a descrição da coleta e `eliminacao` a da eliminação (deixam de ser "sem coluna"); pergunta nova `ciclo` (bloco E) com as 6 etapas; perguntas novas `bases_adicionais` (bloco D, catálogo carregado, sem a principal) e `base_gdpr` (texto). Lê `GET .../ciclo` e `GET .../bases` e nunca pergunta de novo o que está gravado; grava só o que mudou.
- `frontend/src/views/tratamento-ligacoes.js` e `frontend/src/views/privacy.js`: aviso "O RoPA mudou depois que este RIPD/LIA nasceu" quando `origem_mudou`.
- Testes jsdom em `frontend/test/ropa-entrevista.test.js` e onde as telas já têm teste.

### F3.6: documentação e verificação

- `AGENTS.md` (nota curta, contagens medidas), `CHANGELOG.md` (Não publicado), `migrations/README.md`.
- `npx tsc --noEmit`; `npx vitest run` completo; `cd frontend && npx vitest run`; `npm run build --prefix frontend`; `npm run openapi` sem diff.

## Pendências fora desta fase

- **Jurídica:** catálogo do GDPR (art. 6 e art. 9) por material revisado; até lá `base_gdpr` é texto livre e a LIA só é exigida por ele quando o texto diz "legítimo interesse".
- **Técnica:** importação do ciclo e das bases do legado (F6); exportação CSV com bases e ciclo (F4).
