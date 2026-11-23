# Onda 4: jornada comum

Data: 18/11/2026. Situação: **aprovada e construída (#593)**. Onda 4 da spec guarda-chuva
`2026-11-14-n360-posicionamento-e-fluxo-design.md`. Base: levantamento somente leitura sobre o HEAD `41ab4fc`
(arquivo:linha e o comando de cada número; não versionado).

## O pedido

Hoje cada módulo mostra o progresso do seu jeito: o n.iso em quatro telas (Painel, Jornada, Prontidão, Monitor), o n.privacy só no Painel e na
skill do agente, o n.ot por site. Falta uma jornada comum: as mesmas cinco etapas em todo módulo (Começar, Levantar, Avaliar, Tratar,
Operar), cada módulo com os seus passos, e um caminho único da organização criada até o primeiro passo.

## Não regridem (travados por teste)

- Os três números do cliente (`test/onda2-numeros.test.ts`, que não se edita).
- **P0-1/P0-2:** o n.ot só aparece para quem tem o módulo na pessoa **e** no projeto; nunca para agente nem chave de API. A régua comum
  **não desenha nem conta** uma etapa do n.ot para quem não o tem (nada de "4 de 5" que denuncie uma quinta).
- Nenhuma rota de API some; o agente (MCP) não perde nada.
- Links antigos (`?tela=monitor`, `certification`, e-mails, avisos) viram alias, nunca 404.
- Faixa por módulo (`src/modulos.ts`) e toda rota nova classificada (`contrato-isolamento-org`, `contrato-tela-api`).

## Decisões do dono

| # | Tema | Resposta (18/11/2026) |
|---|---|---|
| 1 | Telas do n.iso | **Monitor sai; Prontidão vira aba da Jornada.** Painel segue como entrada (do cliente e dos três módulos) |
| 2 | Trilha do n.privacy | **Só derivada dos dados**; sem marca manual nem migration. Marca manual só se o consultor pedir depois |
| 3 | Onboarding encadeado | **Assistente de projeto + passo "Pessoas e acessos"**, terminando no primeiro passo de cada módulo escolhido |
| 4 | Plano diretor (OT2net) | **Adiar**; só uma etiqueta de onda/prioridade nas ações da etapa Tratar, depois |

### Adotado com a aprovação da spec (recomendação minha)

| # | Tema | Recomendação |
|---|---|---|
| 5 | Etapas comuns | Cinco, com nomes fixos: Começar, Levantar, Avaliar, Tratar, Operar (o OT2net usava as mesmas cinco: `0002_seed_fases.sql`) |
| 6 | Fronteira no n.iso (conteúdo) | Começar = fases 0-6; Levantar = 7-8 (inventário, processos e fluxos); Avaliar = 9-10 (riscos de segurança e de privacidade); Tratar = 11-28 (tratamento, SoA, implementação 27001 e 27701); Operar = 29-40 (operação, auditoria, certificação) |
| 7 | Onde a régua aparece | No Início (linha do projeto) e no topo do Painel de cada módulo, como **campo novo `programa.etapas` em `GET /projects/:id/painel`**; sem rota nova |
| 8 | "Em operação" e o n.ot | A primeira base aprovada de um site conta como marco **só para quem tem `ot`** (o estado do programa já é por espectador) |
| 9 | Modelo | **Derivação pura** (opção F-A do levantamento): catálogo estático em `src/data/programa.ts` + `src/services/programa.ts`; nenhuma tabela nova, nenhuma migration |

## Modelo

- `src/data/programa.ts`: as 5 etapas e, por módulo, a lista de passos com critério de **chave fechada** (como `ENTIDADES` de
  `src/data/passos/tipos.ts`). Rótulos pt-BR no catálogo.
- `src/services/programa.ts`: `etapasDoPrograma(db, projectId, modulosVisiveis, ator)` reaproveita o que já existe: `montarBancada`
  (n.iso, agrupando as fases pelas faixas do item 6), `visao` do encarregado e `lacunasDaFonte` (n.privacy), `situacaoDoSite` por site
  permitido (n.ot). Devolve, por módulo visível, `{etapa, feitos, total, proximo}`.
- Só lê. Nenhum número da onda 2 muda: o indicador de controles e a cobertura da LGPD continuam vindo das mesmas funções.
- O n.ot entra apenas se `modulos` (projeto ∩ pessoa, sem agente nem chave) tem `ot`; os sites vêm filtrados por `sitesPermitidos` (P0-4).
- A trilha do n.privacy usa as 7 etapas da skill `implantacao-privacy`; cada uma lê o que o app já tem (encarregado, RoPA, LIA/RIPD,
  terceiros, titular e incidentes, documentos e cobertura). A etapa 5 depende de `parametros_legais`, que é global: conta como pronta
  quando as chaves de prazo que `titular_pedidos`/`incidentes` usam existem (a lista exata sai do plano). A skill e
  `src/mcp/skills-gerado.ts` são regenerados juntos.

## Entrega: cinco PRs, o de menor risco primeiro (nenhum com migration)

1. **Limpeza do n.iso:** Monitor fora do menu; `monitor` → Jornada (alias) com a grade etapa × fase no topo da Jornada; "Exportar riscos"
   passa para Riscos; apagar `renderPortfolio` e `showGapAnalysis` (mortos; `monitor.js` hospeda outras seis telas e **não** se apaga);
   texto "41 fases" de `dashboard.js:79`. Atualiza `casca-menu`, `router`, `monitor-view`, `jornada-prontidao`, README e AGENTS.
2. **Prontidão como aba da Jornada:** `certification` vira alias; `TELAS` dos passos, `TELA_DO_AVISO` e os contratos acompanham. A rota
   `/prontidao` fica (lida por Jornada, onda 2 e testes).
3. **Modelo comum (F-A):** `programa.etapas` no `/painel`, régua no Início e no Painel, marco do n.ot em `estadoDoPrograma` (só com `ot`).
   Testes P0: sem `ot`, agente e chave não veem nem contam o n.ot; onda 2 intocada.
4. **Trilha do n.privacy na tela** (7 etapas derivadas), skill e `skills-gerado.ts` juntos.
5. **Onboarding encadeado:** organização criada → assistente de projeto → passo "Pessoas e acessos" (convites e módulos por pessoa; `ot`
   sempre desmarcado, P0-1; respeita as travas da onda 1) → primeiro passo de cada módulo escolhido, inclusive `ot`. Consultoria e direta.
   Sem autoatendimento (fora de escopo).

## Testes

- Frontend: menu e roteador (`casca-menu`, `router`), alias de `monitor` e `certification`, aba Prontidão, régua sem `ot` (mock de API que
  falha se o n.ot for pedido), assistente encadeado.
- Backend: `programa.etapas` por perfil (equipe com e sem `ot`, cliente, agente, chave de API); nenhum campo a mais quando não há `ot`;
  `contrato-isolamento-org` e `contrato-tela-api` cobrem o que mudar; `onda2-numeros` intocado.
- E2E existentes que abrem `?tela=project-detail` e o Painel continuam verdes.

## Riscos

- O estado do programa é **por espectador** (já é assim desde a entrada): a mesma organização pode mostrar "Começando" a quem não tem `ot`
  e "Em implantação" a quem tem. Não vaza nada; fica registrado.
- O GET da bancada grava (`materializarLegado`, `gravarSituacoes`); a régua não pode chamá-lo de forma que mude estado. Usar a função pura de
  estado, não a rota.
- O PR 5 toca convite e módulos por pessoa (onda 1 e P0-1): revisão em modelo forte.

## Rulings da execução

Decidido durante a execução e conferido no código (ledger `.superpowers/sdd/2026-11-18-onda4-jornada-comum/progress.md`).

- `certification` e `monitor` viram alias na lista fechada `ALIAS_DE_TELA` (`frontend/src/produto.js:142`); `certification` segue também em `TELA_DO_AVISO` (`globals.js:1155`). O catálogo de telas não mudou. "Exportar riscos" já estava em Riscos (`grc.js:208`).
- **RESOLVIDO (19/11/2026):** os CSV de fornecedores e de treinamentos **não** perderam a entrada na tela: as listas de Fornecedores e de Treinamentos já têm o botão "Exportar CSV" (`frontend/src/views/grc.js`, `exportar` em `montarLista`; `frontend/test/listas-niso-grc.test.js`). O "Exportar" do Monitor era uma segunda entrada. Nada a recolocar.
- A grade da Jornada usa as 6 etapas do catálogo de passos; a régua usa as 5 comuns. Duas formas de agrupar convivem na mesma tela.
- O n.ot não tem Painel: a régua dele aparece em "Ver situação" do Início e no assistente.
- As chaves de `parametros_legais` da etapa 5 do n.privacy são as 3 de `CHAVES` (`src/services/parametros-legais.ts:9`). "Canal do titular" não tem campo (a etapa 1 é só o encarregado). O passo "cobertura" da trilha do n.privacy fica falso (não feito) quando o catálogo da LGPD não está carregado: o desconhecido aparece como não feito. A skill `implantacao-privacy` diz o mesmo (limite da plataforma, não lacuna do cliente).
- Aviso de prazo `certificado` clicado no n.privacy ou no n.ot vai a `/iso?tela=certification` (`destinoDoAviso` resolve o alias; a aba Prontidão abre); `monitor` idem. O alvo da Bancada acompanha o alias no endereço.
- O bloco `ot` do `/painel` soma 6 consultas agrupadas ao lote que já tinha (sem consulta por site). O teste de desempenho do painel (`test/painel.test.ts`, mediana < 300 ms) segue verde depois do PR3 e do PR4; o valor exato da mediana não foi registrado nos relatórios.
- O cliente lê a régua, não navega por ela (sem "Abrir"). O estado do programa é por espectador.
- O OpenAPI só descreve corpo de requisição: `docs/openapi.json` e `mcp-server-niso/src/contrato-gerado.ts` não mudaram desde `c4c7039`.
- A escolha de módulos do **projeto** no assistente seguiu como era (P0-1 é sobre a pessoa). Na pessoa, o assistente oferece só os módulos do projeto que quem convida também tem (espelho do teto; o servidor decide), com o `ot` desmarcado e explicado.
- "Continuar sem designar" (passo 5) deixa o consultor convidado sem designação: ele não vê o projeto. O passo 6 lista cada um nessa situação ("Designe em Governança"); "Pular" mostra o mesmo aviso. Falha da designação não repete o convite no retry (só a designação). `emailEnviado:false` mantém o passo até a pessoa seguir.
- Respostas tardias do assistente (criar projeto, convidar, primeiros passos, consulta de CNPJ) conferem que o assistente é o mesmo antes de escrever.
- Pendências menores adiadas (uma linha cada):
  - textos "no Monitor" velhos em `bancada.js:212` e `prontidao.js:80`; CSS `.monitor-*` e `.roadmap-amostra` mortos;
  - `jornadaAba` não é zerada em `navigate(S.view)`; o foco da aba depende de render síncrono;
  - `destinoDoAviso` não resolve alias (`produto.js:142`, inofensivo hoje);
  - `AGENTS.md:620`: "Adicionar ao comitê no Monitor" precisa ser conferido (Governança segue em `monitor.js`);
  - `etapasDoOt` recebe `sitesPermitidos` já filtrados (o chamador filtra, P0-4); fase `skipped` do legado conta como feita antes da materialização e não depois;
  - `proximo` do n.iso: a lista de sites `ORDER BY nome` mexe no desempate; passo da trilha com tela fora da lista não mostra estado; caixa vazia sem passos; sem teste da ordem exibida;
  - resposta 201 de equipe omite `client_project_id`; o teste do teto do cliente usa uma organização sem `ot` (não distingue teto do projeto e da organização);
  - depois de fechar o assistente no meio de convites, as linhas de cliente restantes ainda enviam `POST /users` (intenção da pessoa; nada escrito na tela); o botão "Criar o primeiro projeto" desabilitado até as organizações carregarem não tem teste.

## Fora de escopo

Reescrever a trilha de 132 passos para outras normas; marca manual de exceção por etapa (F-B); plano diretor de iniciativas; autoatendimento
e cobrança; unificar as guardas de arquivo; traduzir status no banco.

## Não conferido

Uso real de cada tela (não há telemetria por tela); chaves de `parametros_legais` exigidas pela etapa 5 do n.privacy; como o roteador trata
`?tela=` de links antigos para tela removida; estado das migrations 0115/0116 em produção (pendentes até o dono aplicar).
