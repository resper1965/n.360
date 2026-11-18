# Onda 4: jornada comum

Data: 18/11/2026. Situação: **rascunho para aprovação do dono** (decisões 1 a 4 já respondidas em 18/11/2026). Onda 4 da spec guarda-chuva
`2026-11-14-n360-posicionamento-e-fluxo-design.md`. Base: levantamento somente leitura sobre o HEAD `41ab4fc`
(`/tmp/claude-0/-home-user/0c1d5499-e055-503d-a651-849433c76e01/scratchpad/onda4-levantamento.md`, com arquivo:linha e o comando de cada número).

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

## Fora de escopo

Reescrever a trilha de 132 passos para outras normas; marca manual de exceção por etapa (F-B); plano diretor de iniciativas; autoatendimento
e cobrança; unificar as guardas de arquivo; traduzir status no banco.

## Não conferido

Uso real de cada tela (não há telemetria por tela); chaves de `parametros_legais` exigidas pela etapa 5 do n.privacy; como o roteador trata
`?tela=` de links antigos para tela removida; estado das migrations 0115/0116 em produção (pendentes até o dono aplicar).
