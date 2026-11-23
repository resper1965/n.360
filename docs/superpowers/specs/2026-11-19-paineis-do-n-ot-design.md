# Painéis do n.ot

Data: 19/11/2026. Situação: **aprovada (recomendações adotadas), não construída**; plano `2026-11-20-paineis-do-n-ot.md` (#604), a executar. Base: leitura
somente de uma cópia de trabalho sobre origin/main `c0badf9` mais o commit de docs `6cc6f30`; nada foi rodado (sem vitest, tsc nem npm).
Referência de ideias: repositório OT2net (HEAD `87ee6b9`, fora deste), só leitura.

## O pedido

O n.ot não tem Painel. A régua comum dele só aparece em "Ver situação" do Início do n.360 e no assistente (ruling da onda 4,
`2026-11-18-onda4-jornada-comum-design.md:92`). O dono quer planejar os painéis do n.ot: o que cada público precisa ver, de onde vem cada
número, o que nunca aparece para quem, e em que ordem entregar.

## Não regridem (travados por teste)

- **P0-1/P0-2:** o n.ot só existe para quem tem `ot` na pessoa **e** no projeto; agente e chave de API nunca (`src/routes/painel.ts:27-33`,
  middleware `src/routes/ot.ts:36-42`, `FORA_DO_AGENTE` em `src/middleware/agente.ts:98-99`). Quem não tem `ot` não aprende que o n.ot
  existe: nenhuma chave, contagem, texto ou chamada (`test/programa-rota.test.ts:40,58-60,68,120`; `frontend/test/painel-regua.test.js:26,82-91`).
- **P0-4:** todo número sai de `sitesPermitidos` (`src/services/ot-inventario.ts:64-71`); o técnico (org_user) só vê os sites dele e nenhum
  total do projeto que denuncie os outros.
- **P0-6:** IP e MAC nunca entram em painel (nem mascarados); nome de ativo e de sonda também não (`src/services/painel-ot.ts:9-12`).
- O Início do n.360 continua **sem contagem de ativos ou achados** (oráculo do inventário, `2026-11-14-onda0-linguagem-e-visibilidade-design.md:55-56`).
- Os três números do cliente (`test/onda2-numeros.test.ts`) e a mediana do painel < 300 ms (`test/painel.test.ts:316-339`).
- Nenhuma rota some; o agente (MCP) não perde nada; toda rota nova classificada (`src/modulos.ts`, `contrato-isolamento-org`, `contrato-tela-api`).

## O que existe hoje (telas e números)

| Tela | Onde | Números que mostra | Fonte |
|---|---|---|---|
| Início do n.360, linha n.ot e "Ver situação" | `frontend/src/views/painel.js:265-273` | "X de Y sites em operação", "N desvios abertos"; régua de 5 etapas | `blocoOt` (`src/services/painel-ot.ts:91`), `etapasDoOt` (`src/services/programa.ts:152-165`) |
| Itens "O que fazer" do n.ot (só equipe) | `src/services/painel-ot.ts:67-76` | sondas paradas, revisões vencidas do assessment, desvios abertos fora de obra, lotes em revisão, bases aguardando, obras vencendo em 7 dias, aceites vencendo em 7 dias | 1 `db.batch` de 10 consultas agrupadas (`painel-ot.ts:29-55`) |
| Carteira do consultor | `src/services/painel.ts:543-549` | sondas paradas, desvios abertos, lotes em revisão por projeto | `carteira` (`painel.ts:564`) |
| Início do n.ot | `frontend/src/views/ot-inicio.js:74-122` | "Espera por você" (`pendenciasDoPapel`, 17-67); tabela Sites: fase, próximo passo, desvios abertos, sonda (109-111); Postura RO-CB: atende, parcial, não atende, não se aplica, não avaliado, a confirmar (115-117) | 5 chamadas + **3 por site** (`ot-inicio.js:86-89`: sensores, achados, situação) |
| Cabeçalho do site | `frontend/src/views/ot-base.js:40-51` | régua de 3 etapas (Levantar, Revisar e aprovar, Base aprovada), "em operação desde", obra até | `situacaoDoSite` (`src/services/ot-fase.ts:44-68`) |
| Relatórios (saídas) | `frontend/src/views/ot-saidas.js:42-65` | completude do 4.3.1 (%), ARCiber completos, sem zona, sem IP, sem MAC, fluxos externos sem VPN; ativos por zona e nível Purdue; RO-CB por item (não atende, evidência no inventário, sem evidência) e prazo | `/ot/indicadores` (`src/services/ot-indicadores.ts:17-63`), `/ot/conformidade` (`src/services/ot-conformidade.ts:44-72`) |
| Assessment RO-CB | `frontend/src/views/ot-assessment.js:41-50` | os 7 contadores do `resumo` + filtros "meus"/"revisar", por categoria | `montarAssessment` (`src/services/ot-avaliacao.ts:32-107`) |
| Sondas (Acessos) | `frontend/src/views/ot-sensores.js:148-159` | "X de N em dia", último resumo, desvios abertos | rotas de sonda, só `podeVerCompleto` (`src/routes/ot.ts:889-892`) |
| Desvios, Fornecedores, Relatório de conformidade | `ot-desvios.js:30`, `ot-fornecedores.js:26`, `ot-relatorio.js:30-39` | listas, sem resumo numérico | `/ot/desvios`, `/ot/fornecedores`, `/ot/relatorio/conformidade` |

O servidor **já aceita** `GET /projects/:id/painel?modulo=ot` (`src/routes/painel.ts:10,23-34`; `test/painel-ot-rota.test.ts:41`), mas a
tela só desenha o Painel do n.iso e do n.privacy; `blocoOt` devolve `cobertura`, `vencimentos` e `riscos` vazios (`painel-ot.ts:92`).

## O que dá para mostrar (dados que já existem)

- **Cobertura do inventário por site e por nível Purdue:** zonas ativas por `nivel_purdue` 0-5 (`migrations/0091_ot_inventario.sql:31`); regra
  4.1.1 = níveis 2, 3 e 4 (`ot-fase.ts:21-22`); ativos completos no 4.3.1 (`SQL_COMPLETO_4_3_1`, `ot-indicadores.ts:11-13`); ativos do ARCiber
  sem verificação e vencidos (`ot-conformidade.ts:84-86`, já agrupado por site em `conformidadePorSite`, 75-101, sem fan-out).
- **Fluxos e exposição:** `externo`, `via_vpn` por fluxo (`0091:95-96`); "fluxo externo sem VPN" já é o 4.1.3 (`ot-indicadores.ts:28,40`);
  visibilidade por `FLUXO_VISIVEL` (`ot-inventario.ts:73-77`).
- **Desvios:** situação `aberto | regularizado | tratado | aceito`, `aceito_ate`, `primeira_vez`, `ultima_vez` (`migrations/0108_ot_desvios.sql:13-18`).
  **Não há data de cada mudança de situação**: a trilha grava eventos agregados por rodada (`src/services/ot-desvio.ts:148-151,174`). Dá para
  desenhar "abertos por mês de primeira detecção" e o estado de hoje; não dá para desenhar "abertos no fim de cada mês" sem gravar foto.
- **Base e revalidação:** `fase`, `base_pedida_em`, `base_aprovada_em`, `obra_ate`, `obra_renovada` (`ot-fase.ts:45-46`); revalidar = menor
  `ultima_verificacao_em` + 24 meses, aviso 60 dias antes (`ot-fase.ts:36,58`; `painel-ot.ts:52-53` já em lote).
- **Assessment:** item de política com `atende | parcial | nao_atende | nao_se_aplica` (`ot-avaliacao.ts:23`); itens técnicos 4.1.1, 4.1.2,
  4.1.3, 4.2.1, 4.3.1 derivados do inventário, que nunca afirmam "atende" (`ot-conformidade.ts:21`, `ot-avaliacao.ts:76-79,98`); 5.1.1 é exceção.
  Prazos ONS: 8 itens de 18 meses e 16 de 27 meses a partir de 09/07/2021 (`migrations/0090_ot_requisitos.sql:21-45`, `ot-conformidade.ts:10`):
  **os dois prazos já venceram** (jan/2023 e out/2023).
- **Sondas e credenciais:** em dia ≤ 26 h, atrasada ≤ 72 h, parada acima ou sem credencial (`src/services/ot-sensor.ts:39-44`); credencial vence
  em 365 dias, aviso 30 dias antes (`ot-sensor.ts:12,46-49`). Acessos de técnico por site em `ot_site_acessos`; agente de coleta e chaves em `/ot/agente*`.
- **Fornecedores de OT:** `ot_fornecedores` com papel `integrador | fabricante | acesso_remoto`, ligado a site ou a fluxo
  (`migrations/0116_ot_fornecedores.sql:3-14`); a situação da avaliação do fornecedor vem do cadastro de terceiros do núcleo
  (`src/services/encarregado.ts:124-126`).
- **Referências ot → núcleo:** `ot_referencias` liga risco, ação ou incidente a site, ativo ou desvio (`migrations/0115_ot_referencias.sql:3-19`);
  a ação de um desvio é uma `corrective_actions` comum (`src/services/ot-desvio-acao.ts:24-27`), com `severity`, `due_date`, `status`
  (`migrations/0004_sprint567.sql:39-54`) e título que não pode citar nome de ativo, zona ou site (`ot-desvio-acao.ts:6`).

## Públicos e as perguntas de cada um

| Público | Quem é no app | Pergunta que o painel responde |
|---|---|---|
| Gestor ARCiber | `org_admin` do projeto, ou admin direto no cargo (`ot-inventario.ts:17-22`) | "O que espera a minha aprovação? Estamos conformes à RO-CB? Onde está a exposição? O que vence?" |
| Consultor / consultoria_admin designado | equipe (`podeEditarOt`, `podeVerCompleto`) | "Em que etapa cada site está, o que trava a base, o que eu faço hoje, o que vence em 90 dias?" |
| Admin da organização direta | `consultoria_admin` de organização `direta` (`src/services/organizacao.ts:220-228`) | as do consultor, sem consultoria no meio |
| Técnico por site | `org_user` com `ot` e vínculo em `ot_site_acessos` | "Nos meus sites: o que eu levanto ou reviso, e o que voltou recusado?" |
| Cliente leitor | `client` com `ot` | "Como está o programa de OT, em uma frase e uma régua?" |

**Achado que pede decisão:** o Gestor ARCiber é `org_admin`, e `org_admin` cai na visão de cliente do painel (`src/helpers.ts:205`;
`src/routes/painel.ts:37`), que tira `fazer` (`src/services/painel.ts:491-492`; `test/painel-ot-rota.test.ts:50-54`). Os itens dele
(bases, obras, aceites, revisões) são calculados e jogados fora. No n.iso e no n.privacy isso faz sentido (a consultoria conduz); no n.ot,
quem aprova é ele.

## Proposta: um Painel do n.ot, seis quadros

Não seis telas: **uma tela "Painel" no n.ot**, desenhada pelo mesmo `telaDoModulo` (`frontend/src/views/painel.js:202-235`), com topo
(identidade, frase de saúde, régua comum) e quadros `pn-quadro`. Cada "painel" pedido vira um quadro; "Por site" leva à tela do site que
já existe. Gráficos pelos que já existem em `painel-graficos.js` (cobertura empilhada, vencimentos, mapa, linha mensal), todos com
"Ver como tabela".

| Quadro | O que mostra | Fonte | Vazio | Quem **não** vê |
|---|---|---|---|---|
| **Visão geral** (topo) | frase de saúde, régua das 5 etapas, próximo passo, "O que fazer agora" | `/painel?modulo=ot` como hoje (`painel-ot.ts:67-93`, `programa.ts:152-165`) | "Cadastrar o primeiro site" (`painel-ot.ts:93`) | cliente leitor e técnico: sem "Abrir" na régua (`painel.js:148`) |
| **Por site** | uma linha por site permitido: fase, próximo passo, desvios abertos, sonda (pior estado), revalidar até, obra até | mesmo lote do `blocoOt` (as consultas por site já estão lá, `painel-ot.ts:46-54`) + sondas já lidas (`painel-ot.ts:40-44`) | "Cadastre o primeiro site" | coluna sonda: só `podeVerCompleto` (a rota de sonda é dele); técnico: só os sites dele, sem total do projeto |
| **Conformidade RO-CB** | barras empilhadas por categoria da norma: política (atende / parcial / não atende+não avaliado; "não se aplica" em texto) e técnicos (evidência / sem evidência / não atende); a confirmar; revisar | contagem agrupada de `ot_avaliacoes` + `conformidadePorSite` (já em lote) | "Catálogo da RO-CB.BR.01 ainda não carregado" | técnico (é da organização, não do site dele) |
| **Desvios e exposição** | estado de hoje (regularizado / tratado+aceito / aberto) por site; abertos por mês de primeira detecção, 12 meses; fluxos externos sem VPN | `ot_desvios` agrupado por site e por `substr(primeira_vez,1,7)`; contagem de `FLUXO_VISIVEL` externo | "Nenhum desvio. Desvio aparece quando a sonda vê o que a base aprovada não tem." | cliente leitor; nunca chave do sensor, IP ou MAC |
| **Vencimentos, 90 dias** | obras, aceites de desvio, revalidação de 24 meses, revisão do assessment, credencial de sonda, ações dos desvios | `graficoVencimentos` (`painel-graficos.js:78`); rótulo = nome do site ou código do requisito, nunca ativo nem sonda | "Nenhum prazo nos próximos 90 dias" | credencial de sonda: só `podeVerCompleto`; aceites: só Gestor (como `painel-ot.ts:75`); técnico e cliente leitor não veem o quadro |
| **Fornecedores e riscos de OT** | fornecedores por papel, com avaliação vencida ou pendente, e quais de `acesso_remoto` estão em fluxo externo sem VPN; mapa de risco dos riscos ligados a site/ativo do n.ot | `ot_fornecedores` + terceiros do núcleo; `ot_referencias` → `risks` (`graficoMapa`, `painel-graficos.js:48`) | "Nenhum fornecedor de OT" / "Nenhum risco ligado ao n.ot" | técnico e cliente leitor; **depende das migrations 0115/0116 aplicadas** |

**Contagem de ativos dentro do Painel do n.ot:** o quadro de conformidade e o de cobertura mostram agregados que `/ot/indicadores` já
devolve hoje à mesma pessoa, sobre os mesmos sites (`ot-indicadores.ts:17-63`). Não é exposição nova. A regra do oráculo continua valendo
para o Início do n.360 (os campos novos só saem com `?modulo=ot`).

**Visão por papel no `?modulo=ot` (proposta):** Gestor ARCiber, consultor e admin direto: tudo. Técnico: topo (régua só dos sites dele) e
Por site; os itens dele (rascunhos, lote recusado) entram em "O que fazer". Cliente leitor: frase, régua sem "Abrir" e o resumo de
Conformidade em números (sem item por item).

## A régua do n.ot no Painel do n.ot

Nada novo no servidor: `programa.etapas.ot` já vem no `/painel?modulo=ot` (`src/services/painel.ts:477`) e `reguaDe` já a desenha no topo
(`painel.js:148,204`). Basta o n.ot ter a tela. Convivem duas réguas: a comum de 5 etapas (Painel) e a do site de 3 (`ot-base.js:10-11`);
o mapa entre elas é `ETAPA_DO_PASSO_OT` (`programa.ts:139-141`). O texto de `painel.js:124-127` e o ruling da onda 4 (`onda4:92`) mudam.

## Plano diretor de iniciativas por onda

**O que é, com exemplo.** Hoje um desvio vira ação ("Fechar o acesso remoto do integrador sem VPN", prazo 30/01). Com dez ações em cinco
sites, o Gestor quer dizer o que vem primeiro. "Onda" é essa ordem: Onda 1 = o que reduz exposição já (fluxo externo sem VPN, 4.1.3);
Onda 2 = fortalecer (hardening, patches, 4.3.3 e 4.4.x); Onda 3 = otimizar (logs e resposta, 4.6.x). O OT2net mostrava exatamente isso em três
cartões (`ot2net/frontend/src/app/dashboard/(auth)/projetos/[id]/fase/fase2/page.tsx:104-118`).

- **Opção A, etiqueta na ação:** coluna `onda` (1, 2, 3 ou vazia) em `corrective_actions`; "prioridade" é o `severity` que já existe. O
  Painel do n.ot ganha "Plano de tratamento por onda": por onda, ações abertas, concluídas e vencidas (só as ligadas ao n.ot por `ot_referencias`).
  Uma migration aditiva, um campo no formulário de ação, nenhuma entidade nova.
- **Opção B, entidade iniciativa:** tabela `iniciativas` (nome, onda, prioridade, responsável, situação) e `iniciativa_id` na ação. Agrupa
  "Segmentação Purdue" com cinco ações em cinco sites. Custa tabela, CRUD, contrato e testes, e cria um problema P0: uma iniciativa é do
  núcleo e o nome dela pode revelar o n.ot a quem não tem o módulo (a regra de nome de `ot-desvio-acao.ts:6` teria de valer lá também).
- **Derivar sem gravar** (onda pelo prazo ONS 18/27 meses) não serve: os dois prazos já venceram.

**Recomendação: A**, no último PR, só se o dono confirmar; é a decisão 4 da onda 4 ("só uma etiqueta de onda/prioridade nas ações da
etapa Tratar, depois"). B fica para quando o consultor pedir agrupamento ou orçamento.

**Do OT2net, o que vale trazer:** as três ondas com nome (acima); as cinco fases, já adotadas (`ot2net/packages/db/migrations/tenant/0002_seed_fases.sql:2-7`).
Fica para depois: impacto duplo, segurança e operacional, no risco (`ot2net/backend/src/routes/riscos.ts:23-24,38-40`), porque o risco do
núcleo tem um impacto só. **Não trazer:** números fixos no código como se fossem dados (68,4%, 14, 22, 08 em
`fase1/page.tsx:93-109`); geração simulada (`fase2/page.tsx:60-61`); orçamento (`BudgetDashboard.tsx`); o Gantt (`RoadmapTimeline.tsx:20-35`
pede início e fim, a ação só tem prazo). Há divergência entre rota e modelo das iniciativas (`iniciativas.ts:13-21` × `schema.prisma:79-99`).

## Abordagem técnica

- **Derivação pura, sem tabela** (PR 1 a 4). Os quadros novos saem de `blocoOt`, num segundo conjunto de consultas montado **só quando o
  pedido é `?modulo=ot`** (o n.360 não paga nem recebe). Sem rota nova: a porta P0-1/P0-2 do `/painel` já existe e está testada.
- **Orçamento de D1:** no máximo **dois `db.batch` a mais** por `?modulo=ot`: um com as consultas agrupadas novas (cerca de 8, todas com
  `site_id IN (SELECT value FROM json_each(?))` e `GROUP BY site_id`) e o de `conformidadePorSite` (4 consultas, reaproveitado). Nenhuma
  consulta por site; teto `TETO_LEITURA_OT`. Teste no molde de `test/programa-rota.test.ts:109` (150 sites: o número de consultas não cresce).
- **Sem cache no servidor.** A tela segue com os 60 s por pessoa de `S.painel` (`painel.js:15,439-440`).
- **Itens técnicos e assessment:** não chamar `montarAssessment` (lê roteiros e evidências); contar `ot_avaliacoes` agrupado e reusar
  `conformidadePorSite`. A regra "o inventário nunca afirma atende" vale no gráfico.
- **Visão do Gestor:** em `?modulo=ot`, o Gestor ARCiber (o mesmo critério de `painel-ot.ts:25`) recebe o bloco do n.ot com `fazer` e os
  quadros; o resto da resposta de cliente fica igual.

## Estrutura da tela

- `frontend/src/views/ot.js`: tela `painel` em `TITULOS` e `MONTAR` (`ot.js:32-33`), que chama `renderPainel(c, h, a, 'ot')`.
  `frontend/src/ot-navegacao.js:3` ganha `painel`; `frontend/login.html:300` ganha `nav-ot-painel`; `SO_OT` e a lista de
  `frontend/src/produto.js:33,466` acompanham.
- `frontend/src/views/painel.js`: `telaDoModulo` ganha o ramo `m === 'ot'` (como o do n.privacy, 222-235): Por site e Desvios. O resto
  (cobertura, vencimentos, mapa) já é genérico. Vazio com texto, nunca zero falso (`painel.js:156-157`).
- Nenhuma tela nova de gráfico: `graficoCobertura`, `graficoVencimentos`, `graficoMapa`, `graficoPedidos` (linha mensal) como estão.

## Contrato, OpenAPI e MCP

Sem rota nova (PR 1 a 4). O OpenAPI só descreve corpo de requisição (ruling da onda 4, `onda4:97`): nada muda. O MCP não ganha nada: o
agente recebe 403 em `?modulo=ot` e o painel geral sem `modulos.ot` (`test/painel-ot-rota.test.ts:79-96`). No PR 5 o campo `onda` entra no
corpo de ação: `docs/openapi.json` e `mcp-server-niso/src/contrato-gerado.ts` são regenerados, e a ferramenta de ação do agente o aceita
(é do núcleo, não do n.ot).

## Testes

- **P0 servidor:** pessoa sem `ot`, agente, chave de API e projeto sem `ot`: nenhuma chave nova, contagem ou texto do n.ot (`semRastroDoOt`,
  `programa-rota.test.ts:40`), e **nenhuma consulta a `ot_*`** (`programa-rota.test.ts:120`). O n.360 (sem `?modulo`) não traz os campos
  novos nem para quem tem `ot`. Técnico: só os sites dele, nenhum total do projeto; sem conformidade nem fornecedores. Nenhum IP, MAC,
  nome de ativo, nome de sonda ou chave de sensor na resposta (busca por padrão de IP/MAC na resposta inteira).
- **P0 tela:** mock de `api` que lança erro se a URL tiver `/ot` em todo teste do n.iso e do n.privacy (`painel-regua.test.js:26`);
  menu `nav-ot-painel` escondido sem `ot`; sem a chave `ot` na resposta, nada do n.ot no DOM (elemento, `aria-label` ou texto).
- **Números:** cada quadro bate com a tela de origem nos mesmos dados (Conformidade = `/ot/assessment` `resumo`; exposição = `/ot/indicadores`).
- **Desempenho:** 150 sites, consultas constantes; `test/painel.test.ts` < 300 ms segue verde.
- **Papel:** Gestor recebe `fazer` em `?modulo=ot` e continua sem ele no n.360 (se a decisão 1 for esta); cliente leitor sem "Abrir".

## Entrega: cinco PRs, o de menor risco primeiro

1. **Tela Painel do n.ot** (só front, **sem migration**): aba Painel com topo, régua e "O que fazer" do `/painel?modulo=ot` de hoje;
   quadros sem dado não aparecem. Menu, endereço, testes P0 da tela.
2. **Visão do Gestor e Por site** (servidor, **sem migration**): Gestor ARCiber recebe `fazer` em `?modulo=ot`; quadro Por site pelo lote
   que `blocoOt` já tem. Testes por papel.
3. **Conformidade, Desvios e Vencimentos** (servidor + tela, **sem migration**): os dois batches, os três quadros, teste de 150 sites.
4. **Fornecedores e riscos de OT** (**sem migration**, mas exige 0115/0116 aplicadas em produção antes do deploy): consulta a uma tabela
   ausente derruba o painel inteiro.
5. **Plano por onda** (**com migration**, aditiva em `corrective_actions`), só se a pergunta 6 for "sim". Depois disso, se a pergunta 2
   for "sim", o Início do n.ot vira alias do Painel e some o fan-out de 3 chamadas por site (`ot-inicio.js:86-89`).

## Perguntas ao dono (com recomendação)

| # | Pergunta | Recomendação |
|---|---|---|
| 1 | O Gestor ARCiber (`org_admin`) vê o Painel do n.ot como a equipe ("O que fazer", quadros)? | **Sim, só no `?modulo=ot`**; o Início do n.360 dele fica como está |
| 2 | O Painel substitui o Início do n.ot? | **Sim, depois do PR 5**, com `inicio` como alias; "Espera por você" é mais detalhada que o "O que fazer" do servidor e precisa ser comparada antes |
| 3 | O cliente leitor (`client`) com `ot` vê o quê? | Frase, régua sem "Abrir" e o resumo de Conformidade em números; nada de desvios, vencimentos, fornecedores ou sondas |
| 4 | O técnico vê o quê? | Régua e Por site dos sites dele e os itens dele; nada da organização |
| 5 | Agregados de ativos (cobertura do 4.3.1, por nível Purdue) dentro do Painel do n.ot? | **Sim**, os mesmos que `/ot/indicadores` já dá à mesma pessoa; o Início do n.360 continua sem |
| 6 | Plano por onda: etiqueta na ação (A) ou entidade iniciativa (B)? | **A**, com `severity` como prioridade; B adiada |
| 7 | Desvios ao longo do tempo: basta "abertos por mês de primeira detecção"? | **Sim**; foto mensal (tabela nova) só se o Gestor pedir a curva de abertos |
| 8 | Acessos (técnicos por site, agente, chaves) no Painel? | **Não**: ficam na aba Acessos; no Painel, só a credencial de sonda vencendo |

## Fora de escopo

Painel na carteira ou no n.360 além do que já existe; exportar o Painel em PDF (o relatório de conformidade já existe); orçamento e
Gantt; impacto duplo no risco; plano diretor com iniciativas (opção B).

## Não conferido

Estado das migrations 0115/0116 em produção; se algum `client` tem `ot` em produção; uso real de cada tela (não há telemetria por tela);
tempo real das consultas novas no D1 de produção; a consulta exata da situação da avaliação do fornecedor a reaproveitar (a lógica está em
`src/services/encarregado.ts:120-126`, a origem não foi lida); a divergência em que `blocoOt` conta sondas paradas para `podeEditarOt`
(`painel-ot.ts:68`) enquanto a rota de sonda exige `podeVerCompleto` (`ot.ts:892`), o que pode mostrar ao platform_admin um número que ele
não abre; no OT2net, se `req.prisma` já é por inquilino (as contagens de `backend/src/routes/dashboard.ts:26-29` não filtram `tenant_id`);
nenhum teste foi rodado.
