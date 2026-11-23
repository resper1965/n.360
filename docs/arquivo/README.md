# Arquivo

Documentos que já cumpriram o papel: planos executados, avaliações datadas e specs superadas.
Ficam como registro de **por que** algo é como é. Não descrevem o estado atual: para isso, leia o
[`AGENTS.md`](../../AGENTS.md) e o [índice da documentação](../README.md).

Arquivados em 2026-10-06 (arrumação final, Tarefa 11), com `git mv` para preservar o histórico.

## Planos executados

| Documento | Executado em |
|---|---|
| [`planos/2026-09-29-receita-agentes-mcp-remoto.md`](planos/2026-09-29-receita-agentes-mcp-remoto.md) | PR #213 (spec no #212; a spec segue em `docs/superpowers/specs/`) |
| [`planos/2026-09-30-agente-paridade-consultor.md`](planos/2026-09-30-agente-paridade-consultor.md) | PR #221 |
| [`planos/2026-10-02-sistema-de-propostas.md`](planos/2026-10-02-sistema-de-propostas.md) | PR #247 e #248 (fatias 1 e 2) |
| [`planos/2026-10-02-propostas-fatia3.md`](planos/2026-10-02-propostas-fatia3.md) | PR #250 |
| [`planos/2026-10-02-propostas-fatia4.md`](planos/2026-10-02-propostas-fatia4.md) | PR #252 |
| [`planos/2026-10-02-propostas-fatia5.md`](planos/2026-10-02-propostas-fatia5.md) | PR #253 |
| [`planos/2026-10-04-acesso-stakeholders.md`](planos/2026-10-04-acesso-stakeholders.md) | PR #254 a #258 |
| [`enterprise-grade-plan.md`](enterprise-grade-plan.md) | Ondas 0 a 4 (CHANGELOG 8.2 a 10.0); restam 2.2, 2.3 e 3.6 |
| [`backlog-plan.md`](backlog-plan.md) | Sucedido pelo plano de fechamento de outubro (`docs/arquivo/plano-2026-10-fechamento.md`), que cita os itens dele que seguiam abertos |
| [`reconciliacao-migrations-2026-08.md`](reconciliacao-migrations-2026-08.md) | Runbook do incidente de 2026-08 (antes no topo de `migrations/README.md`) |

## Planos de outubro/2026, arquivados em 2026-10-12

Saíram de `docs/superpowers/plans/` com `git mv` na higienização de 12/10, depois de entregues (`git log --oneline --since=2026-10-06`).
As caixas `- [ ]` dos planos nunca foram marcadas: a prova da entrega é o PR, não a caixa.

| Documentos (em `planos/`) | Entregue em |
|---|---|
| [`2026-10-05-plano-mestre-execucao.md`](planos/2026-10-05-plano-mestre-execucao.md), [`2026-10-06-arrumacao-final.md`](planos/2026-10-06-arrumacao-final.md) (inventários em [`arrumacao/`](arrumacao/inventario-docs.md)) | #291 (versão 11.0.0) |
| `2026-10-07-fatia-0-chao-firme.md`, `2026-10-07-p1` a `p5`, `2026-10-07-avisos-de-prazo.md` | #293, #294, #295 |
| `2026-10-08-finalizacao-niso.md`, `2026-10-08-papeis-conectores.md` | #298, #299 (o login real em Cursor, Codex e Antigravity segue com o dono) |
| `2026-10-09-nprivacy-*` (fatias 1.1 a 8 e o plano mestre das fatias 2 a 8) | #312 a #331 |
| `2026-10-10-integracao-produtos.md` | #333 |
| `2026-10-11-n360-casca.md`, `2026-10-11-importacao-privacy.md` | #337, #339 |
| `2026-10-12-n360-modulos-por-pessoa.md`, `2026-10-12-finalizacao.md` | #342; #340 a #351 |

As specs desses planos continuam em `docs/superpowers/specs/`: descrevem o desenho vigente e o código as cita.

## Avaliações e triagens datadas

| Documento | Por que saiu |
|---|---|
| [`security-owasp-2026-08.md`](security-owasp-2026-08.md) | Avaliação OWASP de agosto; o que vale hoje está nos invariantes do `SECURITY.md` |
| [`api-triage-2026-08.md`](api-triage-2026-08.md) | Triagem de defeitos de agosto, feita contra o código daquela época |
| [`READINESS.md`](READINESS.md) | Avaliação de prontidão de agosto, não mantida desde então |

## Specs superadas

| Documento | Por que saiu |
|---|---|
| [`readiness-check-spec.md`](readiness-check-spec.md), [`journey-questionnaire-spec.md`](journey-questionnaire-spec.md) | Specs de produto de agosto; o comportamento atual está no código e nos testes |
| [`specs/001-codebase-refactor-design.md`](specs/001-codebase-refactor-design.md), [`specs/001-featurename-baseline-speconly/`](specs/001-featurename-baseline-speconly/), [`specs/002-ui-ux-homogenization-design.md`](specs/002-ui-ux-homogenization-design.md) | Specs do Spec Kit inicial (julho/2026) |
| [`specs/2026-09-22-n360-arquitetura-design.md`](specs/2026-09-22-n360-arquitetura-design.md) | Desenho do ecossistema, superado |
| [`design/handoff-COMO-APLICAR.md`](design/handoff-COMO-APLICAR.md), [`design/handoff-PATCH-ui.md`](design/handoff-PATCH-ui.md) | Instruções de aplicação do handoff visual, já aplicado (#168) |

## Arquivados em 2026-11-05 (higienização)

Saíram com `git mv` depois de conferidos contra o código (rota, migration ou arquivo que cada um pedia). O que ainda estava
aberto neles foi levado para [`../estado-2026-11-05.md`](../estado-2026-11-05.md).

| Documento | Situação |
|---|---|
| `planos/2026-10-14-aprovacao-em-lote.md`, `2026-10-14-normalizacao-de-nomes.md`, `2026-10-15-bancada-trilha.md`, `2026-10-16-ropa-abas.md` | Executados (lote em `src/routes/pedidos.ts`, `src/services/nomes.ts`, migrations 0078 e 0079) |
| `planos/2026-10-14-legado-privacidade.md` e `2026-10-14-legado-pesquisa-de-codigo.md`; `2026-10-15-f3` a `f6` | Executados (F0 a F6, migrations 0072 a 0076) |
| `planos/2026-10-18-versao-final.md`, `2026-10-26-fechamento-final.md` | Etapas de código entregues; o que restou (revisão de textos, roteiro de aceite, virada do legado) está no estado de 05/11 |
| `planos/2026-10-27-paridade-migrations-e-mescla.md`, `2026-10-27-slo-no-worker.md` | Executados (`test/migrations-consistencia.test.ts`, `src/services/slo.ts`) |
| `specs/2026-09-29-receita-agentes-mcp-remoto-design.md`, `2026-09-30-agente-paridade-consultor-design.md` | Superadas por `docs/agente/` e pela spec "agente decide como consultor" |
| `specs/2026-10-07-fatia-jornada-design.md` | Superada pela Bancada (trilha) e pelas políticas temáticas |
| `estado-2026-10-20.md`, `plano-2026-10-fechamento.md`, `paridade-legado-2026-10-20.md`, `equalizacao-modulos-2026-10-20.md`, `avaliacao-2026-10-14.md` | Fotos datadas; os itens ainda abertos foram levados ao estado de 05/11 |

## Planos de novembro/2026, arquivados em 2026-11-23

Saíram de `docs/superpowers/plans/` com `git mv` depois de executados por inteiro. Status de cada spec no
[`../superpowers/INDEX.md`](../superpowers/INDEX.md).

| Documentos (em `planos/`) | Entregue em |
|---|---|
| [`2026-11-14-onda0-linguagem-e-visibilidade.md`](planos/2026-11-14-onda0-linguagem-e-visibilidade.md) | #589 |
| [`2026-11-16-entrada-n360.md`](planos/2026-11-16-entrada-n360.md) | #590 |
| [`2026-11-16-onda1-organizacao-direta.md`](planos/2026-11-16-onda1-organizacao-direta.md), [`2026-11-17-onda2-catalogo-de-requisitos.md`](planos/2026-11-17-onda2-catalogo-de-requisitos.md) | #592 |
| [`2026-11-17-remediacao-gaps-ondas-1-2.md`](planos/2026-11-17-remediacao-gaps-ondas-1-2.md), [`2026-11-17-onda3-n-ot-no-nucleo.md`](planos/2026-11-17-onda3-n-ot-no-nucleo.md), [`2026-11-18-onda4-jornada-comum.md`](planos/2026-11-18-onda4-jornada-comum.md) | #593 |
