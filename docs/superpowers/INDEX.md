# Índice de specs e planos

Uma linha por spec (`specs/`) e por plano sem spec própria. O status sai da evidência (PR mergeado e artefato na `main`), não do
cabeçalho do documento; conferido em 23/11/2026 sobre `origin/main` `2fc1261`; as linhas dos painéis do n.ot foram reconferidas em 26/11/2026 sobre `e734f7a`; a da spec de 26/11 foi atualizada com os PRs #633 a #643 em 27/11/2026.

Regra: o status muda **no mesmo PR que constrói**, e o plano executado por inteiro vai para [`../arquivo/planos/`](../arquivo/planos/)
no mesmo PR (`git mv`, consertando os links).

Status: **construída** (no código, pelo PR citado), **parcial**, **aprovada** (sem código ainda), **rascunho**, **referência** (texto
de apoio, não desenho de construção), **substituída**.

## Specs

| Data | Spec | Status | Prova | Plano |
|---|---|---|---|---|
| 2026-09-29 | [Landing = tela de entrada](specs/2026-09-29-landing-login-design.md) | construída | #207; `test/landing-raiz.test.ts` | — |
| 2026-10-02 | [Sistema de propostas](specs/2026-10-02-sistema-de-propostas-design.md) | construída (área desligada por `COMERCIAL_ATIVO`) | #247 a #253; `src/services/fechar-venda.ts`, migrations 0036 a 0040 | `arquivo/planos/2026-10-02-sistema-de-propostas.md`, `-propostas-fatia3/4/5.md` |
| 2026-10-04 | [Acesso de stakeholders e ciência](specs/2026-10-04-acesso-stakeholders-design.md) | construída | #254 a #258; `src/services/pedidos.ts`, migrations 0041 a 0043 | `arquivo/planos/2026-10-04-acesso-stakeholders.md` |
| 2026-10-06 | [Núcleo comum n.iso e n.privacy](specs/2026-10-06-nucleo-comum-nprivacy-design.md) | construída | #312 a #331; migrations 0047 a 0059 | `arquivo/planos/2026-10-09-nprivacy-*` |
| 2026-10-07 | [Avisos de prazo](specs/2026-10-07-avisos-de-prazo-design.md) | construída | #295; `src/services/avisos-prazo.ts`, migration 0046 | `arquivo/planos/2026-10-07-avisos-de-prazo.md` |
| 2026-10-10 | [Integração dos produtos](specs/2026-10-10-integracao-produtos-design.md) | construída | #332, #333; migrations 0061 a 0063 | `arquivo/planos/2026-10-10-integracao-produtos.md` |
| 2026-10-11 | [Importação do programa de privacidade](specs/2026-10-11-importacao-privacy-design.md) | construída (fatias 1 a 4 e F6) | #339, #349 a #351, #412; `src/routes/importacao.ts` | `arquivo/planos/2026-10-11-importacao-privacy.md`, `2026-10-15-f6-importacao-legado.md` |
| 2026-10-11 | [n.360 casca](specs/2026-10-11-n360-casca-design.md) | construída | #337; `frontend/src/produto.js` | `arquivo/planos/2026-10-11-n360-casca.md` |
| 2026-10-12 | [Módulos por pessoa](specs/2026-10-12-n360-modulos-por-pessoa-design.md) | construída | #342; migration 0066 | `arquivo/planos/2026-10-12-n360-modulos-por-pessoa.md` |
| 2026-10-14 | [Aprovação em lote](specs/2026-10-14-aprovacao-em-lote-design.md) | construída | #394; `POST /api/v1/pedidos/lote` | `arquivo/planos/2026-10-14-aprovacao-em-lote.md` |
| 2026-10-14 | [Aprovação em lote: requisitos de auditoria](specs/2026-10-14-aprovacao-em-lote-requisitos-de-auditoria.md) | rascunho (fatias A a E não construídas) | decisão pendente em `docs/estado-2026-11-05.md` (issue #439) | — |
| 2026-10-14 | [Normalização de nomes](specs/2026-10-14-normalizacao-de-nomes-design.md) | construída | #393; `src/services/nomes.ts` | `arquivo/planos/2026-10-14-normalizacao-de-nomes.md` |
| 2026-10-15 | [Bancada da trilha](specs/2026-10-15-bancada-trilha-design.md) | construída | #434; `src/routes/passos.ts`, migration 0078 | `arquivo/planos/2026-10-15-bancada-trilha.md` |
| 2026-10-16 | [RoPA em abas](specs/2026-10-16-ropa-abas-design.md) | construída | #444, #447; `src/routes/ropa-abas.ts`, migration 0079 | `arquivo/planos/2026-10-16-ropa-abas.md` |
| 2026-10-18 | [Criticidade do fornecedor](specs/2026-10-18-criticidade-fornecedor-design.md) | construída | #449; `src/services/criticidade.ts`, migration 0080 | `arquivo/planos/2026-10-18-versao-final.md` |
| 2026-10-19 | [Fornecedores e menu Cadastros](specs/2026-10-19-fornecedores-cadastros-design.md) | construída | #453 | `arquivo/planos/2026-10-18-versao-final.md` (etapa 3) |
| 2026-10-19 | [Listas do legado](specs/2026-10-19-listas-legado-design.md) | construída | #454; `frontend/src/views/gaps.js`, `lia.js` | `arquivo/planos/2026-10-18-versao-final.md` (etapa 3) |
| 2026-10-19 | [Paridade com o legado: menu](specs/2026-10-19-paridade-legado-menu-design.md) | construída | #459; migration 0081 | `arquivo/planos/2026-10-20-paridade-telas.md` (provável par; não conferido) |
| 2026-10-20 | [Frente 2: regras únicas](specs/2026-10-20-frente2-regras-unicas-design.md) | construída | #471; migration 0082 | `arquivo/planos/2026-10-20-frente2a-regras-unicas.md`, `-frente2b-decisoes.md` |
| 2026-10-20 | [Frente 3: n.iso descongelado](specs/2026-10-20-frente3-niso-listas-design.md) | construída | #471; `frontend/src/lista.js` | `arquivo/planos/2026-10-20-frente3-niso-listas.md` |
| 2026-10-20 | [TPRM e Referência jurídica](specs/2026-10-20-tprm-e-referencia-juridica-design.md) | construída | #460; `frontend/src/views/referencia-juridica.js` | — |
| 2026-10-21 | [Frente 4: ligações](specs/2026-10-21-frente4-ligacoes-design.md) | construída | #471 | `arquivo/planos/2026-10-21-frente4-ligacoes.md` |
| 2026-10-23 | [Agente decide como consultor](specs/2026-10-23-agente-decide-como-consultor-design.md) | construída | #487; `src/middleware/decisoes-agente.ts` | `arquivo/planos/2026-10-23-agente-decide-como-consultor.md` |
| 2026-10-23 | [Políticas temáticas](specs/2026-10-23-politicas-tematicas-design.md) | construída | #488 a #490; `src/data/temas-politica.ts` | `arquivo/planos/2026-10-23-politicas-tematicas-pr1.md`, `2026-10-24-...-pr2.md`, `-pr3.md` |
| 2026-10-26 | [LIA com as perguntas do legado](specs/2026-10-26-lia-12-perguntas-design.md) | construída (23 perguntas, não 12) | #507; migration 0084, `src/data/lia-perguntas.ts` | `arquivo/planos/2026-10-26-fechamento-final.md` (D2) |
| 2026-10-26 | [RIPD com questionário do legado](specs/2026-10-26-ripd-questionario-design.md) | construída | #506; migration 0083, `src/data/ripd-perguntas.ts` | `arquivo/planos/2026-10-26-fechamento-final.md` (D1) |
| 2026-10-27 | [Guia do legado: perguntas RIPD/LIA](specs/2026-10-27-guia-legado-ripd-lia-perguntas.md) | referência | texto usado por #506 e #507 | — |
| 2026-10-27 | [Paridade migrations x schema e mescla](specs/2026-10-27-paridade-migrations-e-mescla-design.md) | construída | #521; `test/migrations-consistencia.test.ts`, migration 0088 | `arquivo/planos/2026-10-27-paridade-migrations-e-mescla.md` |
| 2026-10-27 | [SLO no Worker](specs/2026-10-27-slo-no-worker-design.md) | construída | #523; `src/services/slo.ts` | `arquivo/planos/2026-10-27-slo-no-worker.md` |
| 2026-10-30 | n.ot como módulo do n.360 (modelo de ameaças P0-1 a P0-8) | construída; **a spec não está neste repositório** (fica no repositório OT2net) | migrations 0089 a 0097, `src/routes/ot.ts` | — |
| 2026-11-03 | [Portal de solicitações do titular](specs/2026-11-03-portal-solicitacoes-titular-design.md) | construída | #543; migration `0096_titular_portal.sql` | — |
| 2026-11-04 | [Incidentes no molde do legado](specs/2026-11-04-incidentes-legado-design.md) | construída (fatias 1 a 5 e 7; a 6 não será feita) | #553, #557, #558, #559, #561, #562; migrations 0098 a 0103 | — |
| 2026-11-06 | [Consulta pública pelo protocolo](specs/2026-11-06-titular-consulta-protocolo-design.md) | construída | #565; migration 0105 | `arquivo/planos/2026-11-06-titular-consulta-protocolo.md` |
| 2026-11-06 | [Identidade e encaminhamento](specs/2026-11-06-titular-identidade-encaminhamento-design.md) | construída | #564; migration 0104 | `arquivo/planos/2026-11-06-titular-identidade-encaminhamento.md` |
| 2026-11-09 | [Ciclo de avaliação do fornecedor](specs/2026-11-09-ciclo-avaliacao-fornecedor-design.md) | construída (fatias 1 a 4) | #567, #568, #570, #572; migration 0106 | `arquivo/planos/2026-11-09-modelos-fornecedor.md`, `-reavaliacao-fornecedor.md` |
| 2026-11-09 | [Requisito "não aplicável"](specs/2026-11-09-requisito-nao-aplicavel-design.md) | construída | #573; migration 0107 | `arquivo/planos/2026-11-09-requisito-nao-aplicavel.md` |
| 2026-11-14 | [Posicionamento e fluxo (guarda-chuva)](specs/2026-11-14-n360-posicionamento-e-fluxo-design.md) | aprovada (sem plano próprio, por desenho); ondas 0 a 4 construídas | #589 a #593 | — |
| 2026-11-14 | [Entrada do n.360](specs/2026-11-14-entrada-n360-design.md) | construída | #590 (`9612710`) | [`arquivo/planos/2026-11-16-entrada-n360.md`](../arquivo/planos/2026-11-16-entrada-n360.md) |
| 2026-11-14 | [Onda 0: linguagem e visibilidade](specs/2026-11-14-onda0-linguagem-e-visibilidade-design.md) | construída | #589 (`725c3b9`); `src/services/painel-ot.ts` | [`arquivo/planos/2026-11-14-onda0-linguagem-e-visibilidade.md`](../arquivo/planos/2026-11-14-onda0-linguagem-e-visibilidade.md) |
| 2026-11-16 | [Onda 1: organização direta](specs/2026-11-16-onda1-organizacao-direta-design.md) | construída | #592 (`abdc208`), gaps no #593; migration 0113 | [`arquivo/planos/2026-11-16-onda1-organizacao-direta.md`](../arquivo/planos/2026-11-16-onda1-organizacao-direta.md), [`2026-11-17-remediacao-gaps-ondas-1-2.md`](../arquivo/planos/2026-11-17-remediacao-gaps-ondas-1-2.md) |
| 2026-11-17 | [Onda 2: catálogo único de requisitos](specs/2026-11-17-onda2-catalogo-de-requisitos-design.md) | construída | #592 (`abdc208`), gaps no #593; migration 0114 | [`arquivo/planos/2026-11-17-onda2-catalogo-de-requisitos.md`](../arquivo/planos/2026-11-17-onda2-catalogo-de-requisitos.md), remediação acima |
| 2026-11-17 | [Onda 3: n.ot no núcleo](specs/2026-11-17-onda3-n-ot-no-nucleo-design.md) | construída | #593 (`c0badf9`); migrations 0115, 0116 | [`arquivo/planos/2026-11-17-onda3-n-ot-no-nucleo.md`](../arquivo/planos/2026-11-17-onda3-n-ot-no-nucleo.md) |
| 2026-11-18 | [Onda 4: jornada comum](specs/2026-11-18-onda4-jornada-comum-design.md) | construída | #593 (`c0badf9`); `src/data/programa.ts` | [`arquivo/planos/2026-11-18-onda4-jornada-comum.md`](../arquivo/planos/2026-11-18-onda4-jornada-comum.md) |
| 2026-11-19 | [Avaliação por IA em campo separado](specs/2026-11-19-avaliacao-ia-campo-separado-design.md) | construída | #596 (`b290f94`); migration 0118, `evidence.avaliacao_ia` | — |
| 2026-11-19 | [Canal do titular](specs/2026-11-19-canal-do-titular-design.md) | parcialmente construída (PR1 a PR3; PR4 a executar) | #597, #599, #600 (`14a89d5`, `be6ec3a`, `d04a2e0`); migration 0117 | [`plans/2026-11-19-canal-do-titular.md`](plans/2026-11-19-canal-do-titular.md) (Task 8 substituída por [`plans/2026-11-20-lote3-e-canal-pr4.md`](plans/2026-11-20-lote3-e-canal-pr4.md)) |
| 2026-11-19 | [Painéis do n.ot](specs/2026-11-19-paineis-do-n-ot-design.md) | construída (PR 1 a 4; o PR 5, plano por onda, não será feito por ora: fora da spec de 26/11) | #611 (`2cda0ae`), #616 (`20b1dba`), #618 (`f6bdb22`), #619 (`597e503`); `src/services/painel-ot-quadros.ts` | [`plans/2026-11-20-paineis-do-n-ot.md`](plans/2026-11-20-paineis-do-n-ot.md) |
| 2026-11-26 | [n.ot: Implantação e Operação](specs/2026-11-26-n-ot-implantacao-e-operacao-design.md) | construída (PR1a a PR8 e documentação; sem migration) | #631 (docs), #633 (PR1a + PR1b), #634 (PR2), #635 (PR3a), #636 (PR3b), #637 (PR3c), #638 (PR3d), #639 (PR4), #640 (PR5), #641 (PR6), #642 (PR7), #643 (PR8); PR9 (docs) sem número até a abertura; `src/services/ot-permissoes.ts`, `src/services/ot-implantacao.ts`, `frontend/src/views/ot-configuracao.js` | [`arquivo/planos/2026-11-26-n-ot-implantacao-e-operacao.md`](../arquivo/planos/2026-11-26-n-ot-implantacao-e-operacao.md) |

## Planos em `plans/` sem spec própria

| Data | Plano | Status | Prova |
|---|---|---|---|
| 2026-11-19 | [Higienização do repositório](plans/2026-11-19-higienizacao-do-repositorio.md) | para aprovação (só a Fase 0, de leitura, foi feita) | o próprio plano: "Nada foi alterado" |
| 2026-11-19 | [Pontos menores (três lotes)](plans/2026-11-19-pontos-menores.md) | lote 1 construído; lotes 2 e 3 a executar | #605 (`a4e9b31`); lote 3 no plano de 20/11 abaixo |
| 2026-11-19 | [Saída do GitHub Actions](plans/2026-11-19-saida-do-github-actions.md) | para aprovação, não executado | `deploy.yml` e `db-migrate.yml` seguem ativos |
| 2026-11-20 | [Lote 3 dos pontos menores e PR4 do canal](plans/2026-11-20-lote3-e-canal-pr4.md) | aprovado, a executar | #604 (`5b17283`) |
| 2026-11-20 | [Painéis do n.ot](plans/2026-11-20-paineis-do-n-ot.md) | PR 1 a 4 construídos; PR 5 é esboço, não executado | #611, #616, #618, #619; spec acima |

Planos executados de outubro e novembro: [`../arquivo/README.md`](../arquivo/README.md).
