# LIA com as perguntas do legado (D2)

> Atualização de 27/10/2026: as 12 perguntas abaixo eram aproximadas. O guia real do legado traz 23 (7 + 5 + 11), todas em texto livre, com o texto exato em `docs/superpowers/specs/2026-10-27-guia-legado-ripd-lia-perguntas.md` e em `src/data/lia-perguntas.ts`. Onde este texto diz "12", leia 23; a migration 0084 não mudou.

Decisão do dono, 26/10/2026: a LIA do legado (12 perguntas em três abas) entra como ficha com abas. A LIA não tem pedido nem hash
(`DOCUMENTOS` em `src/services/pedidos.ts` não tem `lia`), então não há a restrição do RIPD. Fonte: `docs/paridade-legado-2026-10-20.md`,
seção 2 (guias do legado; capturas com dado real NÃO entram no repositório). Molde pronto: o RIPD de 26/10 (`src/routes/ripd-questionario.ts`,
`src/services/ripd-questionario.ts`, `src/data/ripd-perguntas.ts`, `frontend/src/views/ripd-ficha.js`, migration 0083).

## As 12 perguntas (as redações são do legado; revisar com o dono)

- **Finalidade:** finalidades; benefícios para a empresa; benefícios a terceiros; relevância dos benefícios.
- **Necessidade:** se é realmente necessário; se é proporcional; se a finalidade seria alcançada sem os dados; se seria com menos dados, e quais.
- **Proporcionalidade:** se há dados sensíveis; se há relação formal com o titular; se já houve tratamento anterior dos dados desse titular; se a coleta é direta.
- **Logs:** linha do tempo dos eventos da LIA.

Perguntas de escolha: sim, não ou não sei. As demais, texto livre (até 2000). Todas em `src/data/lia-perguntas.ts`, com `// texto a confirmar com o dono`
onde a redação for aproximada.

## Dado (migration 0084, aditiva)

Tabela `lia_respostas` no molde de `dpia_respostas`: `ropa_id` (a LIA é uma por tratamento, `lia_assessments.ropa_id` único), `project_id`,
`pergunta`, `resposta`, `updated_by`, `updated_at`; PK `(ropa_id, pergunta)`; gatilho que recusa `ropa_id` de outro projeto. As colunas atuais de
`lia_assessments` (`finalidade_legitima`, `necessidade`, `balanceamento`, `salvaguardas`, `conclusao`) **continuam**: LIA existente segue válida e
editável; elas viram a aba **Conclusão** (balanceamento, salvaguardas, conclusão). A regra de concluir não muda (exige finalidade, necessidade,
balanceamento e conclusão); acrescentar que as 12 respostas não bloqueiam a conclusão (são o questionário, não a prova). Nunca aplicar em produção;
sem `wrangler`.

## Serviço, rotas, tela

- `GET/PUT /projects/:id/ropa/:rid/lia/questionario` (mesma faixa e permissões do `PUT .../lia`; estrito; máx. 40; `null` apaga; pergunta desconhecida
  400). Sugestão da atividade só leitura (`da_atividade`): dados sensíveis (marca da atividade), base legal, titulares.
- Logs da LIA: eventos gravados com `entity_type = 'lia'` (o 8º parâmetro de `logAudit` já existe), aba Logs sem texto livre.
- Tela: a LIA vira página `lia-ficha` (`views/lia-ficha.js`, `?tela=lia-ficha&ropa=<id>&aba=<aba>`), aberta pela seção da Base Jurídica e pela lista
  de LIA (`views/lia.js`). Abas: Finalidade, Necessidade, Proporcionalidade, Conclusão, Logs. Autosave por campo, "A atividade já indica" sem gravar.
  Reabrir mantém a confirmação já existente. `limparFichaDoEndereco`, router, `TELAS_DOS_MODULOS`, `pedidoDoHub` tratam `lia-ficha`.
- Word da LIA (`GET .../lia/docx`) passa a incluir as 12 respostas, por aba.
- Importação: `docs/modelos-importacao/lia.csv` continua aceito; acrescentar as 12 colunas opcionais (cabeçalho exato do modelo mantém o caminho sem IA) e gravar
  em `lia_respostas` pelo `salvarLia`/importador (`src/services/importacao.ts`, `gravarAvaliacao`). Modelo e teste de amostra fictícia.

## Testes

Servidor (D1 real): GET/PUT; pergunta desconhecida 400; isolamento entre projetos; LIA existente sem respostas continua concluível; resposta não
muda nada na conclusão; logs com `entity_type`. Migration (`test/migration-0084.test.ts`, contagens de tabelas). Telas (jsdom): as abas, autosave,
sugestão sem gravar, reabrir com confirmação. Word com as respostas. Importação com a amostra fictícia. E2E: lista de LIA → ficha → aba Necessidade → responder → recarregar.
Contratos: classificação das rotas novas em `contrato-isolamento-org`, `src/openapi.ts` + `npm run openapi`, `any-catraca`, `contrato-tela-api`.
