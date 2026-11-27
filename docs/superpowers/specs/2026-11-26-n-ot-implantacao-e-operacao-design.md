# n.ot: Implantação e Operação

Data: 26/11/2026. Situação: **aprovada (abordagem A e decisões do dono abaixo), não construída**; plano
`docs/arquivo/planos/2026-11-26-n-ot-implantacao-e-operacao.md`. Base: leitura somente de uma cópia de trabalho sobre
`origin/main` `e734f7a`; toda referência arquivo:linha foi conferida nessa base. Nada foi rodado (sem vitest, tsc nem npm).

## O pedido

O fluxo do n.ot cresceu por camadas (fluidez, base do site, obra, sonda, desvios, assessment, painéis) e hoje mistura o trabalho
de **implantar** um site (cadastrar, levantar, revisar, aprovar a base) com o de **operar** (desvios, saúde da coleta, mudanças,
revalidação). O dono quer separar as duas coisas na tela e nas regras, com um vocabulário só, papéis coerentes entre tela e
servidor e links que levam ao lugar exato.

## Diagnóstico (conferido no código)

### Telas e navegação

- Casca `frontend/src/views/ot.js` com subtelas no endereço `?ot=`: `TELAS_OT = ['inicio', 'painel', 'sites', 'site', 'assessment',
  'relatorios', 'fornecedores', 'acessos']` (`frontend/src/ot-navegacao.js:3`); sem `?ot=` a tela é `inicio` (`ot-navegacao.js:12`). O
  endereço guarda só tela, site e modo (`escreverEndereco`, `ot-navegacao.js:18-25`): a sub-aba do site (`S.otSub`) não vai para o
  endereço, então recarregar a página perde a aba. Menu em `frontend/login.html:300-328`; visibilidade em `atualizarItemOt`
  (`frontend/src/produto.js:464-469`; Acessos só com `podeEditarOt`).
- **Início × Painel.** O Início (`frontend/src/views/ot-inicio.js:17-122`) monta "Espera por você" (`pendenciasDoPapel`, 17-67), uma
  tabela de sites e a "Postura RO-CB" com **5 chamadas e mais 3 por site** (`ot-inicio.js:75-89`: sensores, achados em rascunho e
  situação de cada site). O Painel do n.ot (`frontend/src/views/painel.js:273-286`, servidor `src/services/painel-ot.ts` e
  `src/services/painel-ot-quadros.ts`) já tem "O que fazer", "Por site", números e quadros, num `db.batch` sem consulta por site. As
  duas telas respondem a mesma pergunta com regras diferentes: o Início tira o `consultoria_admin` de quem aprova lote
  (`ot-inicio.js:98`), o servidor o aceita no projeto designado (`podeAprovar = podeVerCompleto`, `src/services/ot-inventario.ts:69`); o
  Início lista "Seu lote foi recusado" e "achados em rascunho" (`ot-inicio.js:46,65`), o Painel não.
- **Tela do site.** Régua de 3 etapas (Levantar, Revisar e aprovar, Base aprovada) e cartão "Próximo passo" (`frontend/src/views/ot-base.js:10-51`).
  Dois modos com sub-abas (`frontend/src/views/ot-site.js:15-17`): **Modo projeto** (Levantamento `ot-levantamento.js`; Revisão e aprovação
  `ot-revisao.js` + `ot-coleta.js`; Base = `montarInventario` `ot.js:118-170` + `montarFluxos` `ot.js:346-363`, juntos em `montarBase`
  `ot-site.js:53-59`) e **Modo operação** (Saúde da coleta, Desvios `ot-desvios.js`, Inventário). O Inventário do Modo operação é o mesmo
  `montarInventario` (`ot-site.js:89`), **com os botões de edição**: em operação o inventário se altera direto.
- **Acessos e sondas** (`montarAcessos`, `ot.js:403-420`) junta quatro assuntos: acesso de técnico por site, agente de coleta
  (`ot-agente.js`), integração ness.OS (`ot-integracao.js`) e sondas (`ot-sensores.js`, que também faz uma chamada por site, `ot-sensores.js:36`).

### Estados

- Fase do site (`src/services/ot-fase.ts`): `em_levantamento → base_em_aprovacao → em_operacao ↔ em_obra`. Pedir a base exige zonas
  ativas nos níveis Purdue 2, 3 e 4, nenhum rascunho fora da sonda e nenhum lote em revisão (`faltaParaBase`, `ot-fase.ts:71-76`;
  `pedirBase`, 87-94). A base pode ser pedida **sem nenhum ativo** (a regra não olha ativos). Aprovar: só o Gestor ARCiber
  (`ehGestorArciber`, `src/routes/ot.ts:820-824`, nas rotas 1019-1026) e nunca quem pediu (`aprovarBase`, `ot-fase.ts:99-113`). Obra: só de
  `em_operacao`, até 90 dias, uma renovação (`ot-fase.ts:123-153`). Desvios só vêm da sonda e só em operação.
- Lote (migration 0092): estados efetivos `em_revisao → concluido | rejeitado`; decide quem vê completo e não criou
  (`src/routes/ot.ts:474-513`; `decidivel`, `src/services/ot-coleta.ts:420-426`). Quatro caminhos de envio: sessão de levantamento
  (`POST /levantamentos/:id/enviar`, `ot.ts:732`), fila do site (`POST /sites/:siteId/enviar`, `ot.ts:631`), "Regularizar" no desvio
  (`ot-desvios.js:59`) e Entrada manual (`POST /lotes/manual`, `ot.ts:464`). A aprovação cria ou **mescla** (`indice`, `ot-coleta.ts:154-160`);
  **não remove**: não há item de lote que tire um ativo ou fluxo do inventário.
- **Gravação direta.** Fora do lote, quem edita grava direto no inventário: `POST /ativos` (`ot.ts:267-290`), `PUT /ativos/:id`
  (292-319), `POST /fluxos` (333-353), `PUT /fluxos/:id` (355-374) e `DELETE /{sites,zonas,ativos,fluxos}/:id` (375-386). Na tela:
  "+ Novo ativo" (`ot.js:131`), "Editar" e "Remover" do ativo (`ot.js:148-149`), "Aplicar a zona ao ativo" da IA (`ot.js:302-307`),
  "Rascunho por IA" que termina no formulário do ativo (`ot.js:335-341`) e "+ Novo fluxo" (`ot.js:350`). Vale também em operação e
  não mexe na fase. O ativo criado assim nasce "não verificado (4.3.1)" (`ot.js:152`); a edição de campo do 4.3.1 zera a verificação (`ot.ts:305`).

### Vocabulário

Cinco jeitos de dizer onde o site está:

| Onde | O que diz |
|---|---|
| `FASE` (`frontend/src/ot-comum.js:140`) | Em levantamento, Base em aprovação, Em operação, Em obra |
| Régua do site (`ot-base.js:10`) | Levantar, Revisar e aprovar, Base aprovada |
| Jornada comum (`src/data/programa.ts:4-10`) | Começar, Levantar, Avaliar, Tratar, Operar |
| Próximo passo | `PASSO` (`ot-inicio.js:12`), `proximoPasso` (`ot-base.js:19-37`), `TEXTO_OT` (`src/services/programa.ts:47-50`): três textos para os mesmos sete códigos |
| Modos (`ot-site.js:16`) | Modo projeto, Modo operação |

Mais: "sonda" na tela, `sensor` no código e "Sensor de rede (Zeek)" na evidência que a tela mostra (`ot-sensores.js:7`, `ot-revisao.js:15`);
"Fornecedores do n.ot" no menu (`login.html:323`, `ot.js:33`) e "Fornecedores de OT" no Painel (`painel.js:257`); conformidade em cinco
formas com estados diferentes (`AVALIACAO` e `SITUACAO`, `ot-comum.js:143-150`; Postura do Início `ot-inicio.js:115-117`; `RESUMO_ROCB` do Painel
`painel.js:218`; Relatórios `ot-saidas.js`; Relatório de conformidade `ot-relatorio.js`).

### Links

O "O que fazer" do Painel manda tudo para a lista Sites (`aba: 'sites'`, `src/services/painel-ot.ts:80-87`; a tela só aceita
`sites`, `assessment` e `acessos`, `painel.js:634`); a régua comum também (`etapasDoOt`, `src/services/programa.ts:66-69`); o sino leva o
aviso de obra e de aceite à lista Sites (`frontend/src/globals.js:1240-1243`) porque o link do aviso é só `/ot` (`src/services/avisos-prazo.ts:259`).
O quadro "Por site" do Painel já abre o site (`painel.js:215`); o Início já abre site, modo e sub-aba (`ot-inicio.js:14,70-72`), mas o
endereço não guarda a sub-aba.

### Papéis

- Servidor: `podeVerOt` (`src/services/ot-visibilidade.ts:4-12`); `podeEditarOt`, `podeCriarLote`, `podeVerCompleto`, `sitesPermitidos`
  (`src/services/ot-inventario.ts:27-82`); `ESCRITAS_DO_TECNICO` (`ot-inventario.ts:34-35`); `ehGestorArciber` (`src/routes/ot.ts:820-824`:
  `org_admin` do projeto **ou** admin direto no cargo, `gestorArciberDireto`, `ot-inventario.ts:17-22`).
- Tela: `ehGestor = org_admin` (`frontend/src/ot-comum.js:18`), repetido em `podeAceitar` (`ot-desvios.js:18`), `ot-integracao.js:22` e
  `ot-assessment.js:24,100`. **Divergência:** o Gestor ARCiber da organização direta (que é `consultoria_admin`) é aceito pelo servidor e
  não vê os botões de aprovar base, abrir obra, aceitar desvio nem confirmar item do assessment. O Painel já usa a regra do servidor
  (`painel-ot.ts:33`).
- Cliente leitor (`client` com `ot`): `sitesPermitidos` não o filtra (todos os sites, `ot-inventario.ts:76-81`); `GET /desvios` não confere
  papel (`ot.ts:1067-1111`: nome de site, pontas, fabricante e protocolos); o Painel o corta para a frase (`painel-ot.ts:133`). Tela e
  servidor não dizem a mesma coisa sobre o que ele vê.

### Outras falhas

Criar site termina na lista (`ot.js:193` só redesenha a tela atual); desvio vazio sem sonda leva a Acessos, tela global
(`ot-desvios.js:46`); o técnico precisa de conta criada no n.360 antes de receber acesso (`ot.js:425`); vincular fornecedor de OT exige a
parte já cadastrada (`ot-fornecedores.js:27,36`); "Criar ação corretiva" aparece sempre e só erra no envio se o projeto não tem n.iso
(`ot-desvios.js:57`; `ot.ts:1149`); `AGENTS.md:668` diz que o n.ot não tem Painel (desatualizado); `docs/superpowers/INDEX.md` dava os painéis
como "sem código" em `origin/main` `e734f7a` (linhas 61 e 71; desatualizado: #611, #616, #618 e #619 entregues; corrigido junto com esta spec).

## Decisões do dono (aprovadas)

1. **Abordagem A:** duas áreas, **Implantação** e **Operação**, mais **Configuração**.
2. **Quem opera, por papel:** a ness (consultor) implanta; na operação o consultor revisa e o técnico do cliente trabalha no campo; o
   Gestor ARCiber decide.
3. **Tudo por lote:** ativo e fluxo registrados à mão viram achado e entram por lote aprovado por outra pessoa, na implantação e na
   operação (na operação, como **Mudança**). Acaba a gravação direta.
4. **Cliente leitor = como o Painel:** só Painel resumido, Assessment e Relatórios; sites, desvios e inventário fora, no servidor e na tela.
5. **O Painel vira a tela inicial do n.ot.** O Início some; o "Espera por você" do técnico (rascunhos, lote recusado) entra no Painel
   do servidor; acabam as 3 chamadas por site.

## Desenho

### 1. Vocabulário único

O site está em uma de três **áreas**: **Implantação**, **Operação** ou **Obra**. Na Implantação há quatro **etapas**:
**1 Cadastrar**, **2 Levantar**, **3 Revisar**, **4 Aprovar a base**. Somem "Modo projeto", "Modo operação" e a régua de 3.

A fase do banco (`ot_sites.fase`) continua; o nome sai de um mapa, sem migration:

| Banco (`fase`) | Condição | Área | Etapa |
|---|---|---|---|
| `em_levantamento` | `proximo_passo = comecar`, ou `revisar` sem rascunho (faltam zonas) | Implantação | 1 Cadastrar |
| `em_levantamento` | zonas ok, nenhum ativo ativo no site e nenhum rascunho | Implantação | 2 Levantar |
| `em_levantamento` | rascunho fora da sonda ou lote em revisão (`revisar`, `aguardar_lote`) | Implantação | 3 Revisar |
| `em_levantamento` | `pedir_base` | Implantação | 4 Aprovar a base |
| `base_em_aprovacao` sem `obra_ate` | `aguardar_base` | Implantação | 4 Aprovar a base |
| `em_operacao` | — | Operação | — |
| `em_obra`, ou `base_em_aprovacao` com `obra_ate` | — | Obra | 1, 2, 3 ou 4, pela mesma regra da Implantação (a zona pode mudar na obra) |

Função pura nova `areaEEtapa(sit)` em `src/services/ot-fase.ts`, usada por `situacaoDoSite` e por `blocoOt` (o mesmo cálculo em lote). O
"o que falta" mostra só o que falta para sair da **etapa atual** (`faltaParaAvancar`: etapa 1, as zonas; etapa 2, o ativo; etapa 3,
rascunhos e lotes; etapa 4, nada); a checagem completa da base fica separada (`condicoesDaBase`, todas as condições, cuja primeira é o 409
de `pedirBase`).

De-para dos textos:

| Hoje | Passa a ser |
|---|---|
| Em levantamento / Base em aprovação (`FASE`) | Implantação · etapa N (nome da etapa) |
| Em operação | Operação |
| Em obra | Obra até dd/mm |
| Levantar / Revisar e aprovar / Base aprovada (régua do site) | 1 Cadastrar · 2 Levantar · 3 Revisar · 4 Aprovar a base |
| Modo projeto / Modo operação | Implantação / Operação (a tela do site mostra a área do site; não há chave de modo) |
| `TEXTO_OT.comecar` "Começar o levantamento do site" | "Implantação: cadastrar o site (zonas dos níveis 2, 3 e 4)" |
| `TEXTO_OT.revisar` / `aguardar_lote` | "Implantação: revisar os achados" / "Implantação: decidir o lote" |
| `TEXTO_OT.pedir_base` / `aguardar_base` | "Implantação: pedir a aprovação da base" / "Implantação: aprovar a base" |
| `TEXTO_OT.em_operacao` / `revalidar` | "Operação: acompanhar" / "Operação: revalidar os ativos" |
| "Sensor de rede (Zeek)" na tela | "Sonda de rede" (o prefixo gravado na evidência não muda: `ot-revisao.js:15` lê o valor do banco) |
| "Fornecedores do n.ot" | "Fornecedores de OT" |
| Lote de aprovação (operação) | Mudança (é um lote; na operação a tela o chama de Mudança) |

As cinco etapas comuns (`ETAPAS_COMUNS`) **não mudam**: são de todos os módulos. Muda só o texto do próximo passo do n.ot.

### 2. Menu

| Grupo | Itens | Quem vê |
|---|---|---|
| **Operação** | Painel; Sites; Desvios (de todos os sites); Assessment RO-CB.BR.01; Relatórios | Painel, Assessment e Relatórios: todos com `ot`. Sites e Desvios: todos menos o leitor (técnico: só os sites dele) |
| **Implantação** | Lista de verificação do projeto; Sites em implantação | quem edita (`podeEditarOt`); o técnico vê "Sites em implantação" dos sites dele |
| **Configuração** | Acessos de técnicos; Sondas; Agente de coleta; Integração ness.OS; Fornecedores de OT | só quem edita; Sondas só `podeVerCompleto` (a rota de sonda já é dele, `ot.ts:889-892`) |

Tela inicial (sem `?ot=`): o servidor diz em `GET /ot/permissoes` (`tela_inicial`): **Implantação** enquanto nenhum site permitido
está em operação e a pessoa edita; **Painel** nos demais casos (leitor e técnico sempre Painel). Endereços antigos continuam:
`?ot=inicio` abre o Painel; `?ot=acessos` abre Configuração › Acessos de técnicos (ou o Painel, para quem não edita).

### 3. Lista de verificação do projeto

`GET /api/v1/projects/:id/ot/implantacao` (só `podeEditarOt`; técnico, leitor, agente e chave de API: 403). Um `db.batch`, nenhuma
consulta por site. Cada passo: `{ id, texto, estado: 'feito' | 'falta' | 'opcional', detalhe, link: { tela, site?, aba? } }`.

| `id` | Feito quando | Link |
|---|---|---|
| `modulo` | ao menos uma pessoa do cliente (`client_project_id = projeto`) com `ot` em `usuario_modulos` | n.360 › Usuários (`/?tela=users`) |
| `gestor` | `project_governance` com o cargo Gestor ARCiber e e-mail (`CARGO_GESTOR_ARCIBER`, `ot-inventario.ts:14`) | n.360 › Papéis e comitê |
| `tecnicos` | ao menos uma linha em `ot_site_acessos` | Configuração › Acessos de técnicos |
| `site` | ao menos um site ativo | Implantação › Sites em implantação (abre "Novo site") |
| `sonda` | sonda **ativa** com envio `concluido`; **instalada** = credencial ativa; credencial e envio contam só de sonda ativa (`ot_sensores.situacao = 'ativa'`; três números no `detalhe`) | Configuração › Sondas |
| `agente` | `projects.agente_coleta_ot = 1` | Configuração › Agente de coleta; estado `opcional` quando falta |
| `fornecedores` | ao menos um `ot_fornecedores` ativo | Configuração › Fornecedores de OT |
| `assessment` | ao menos uma linha em `ot_avaliacoes` | Operação › Assessment |
| `base` | ao menos um site com `base_aprovada_em` | o primeiro site em implantação, na etapa dele |

Só contagens e estados: nenhum nome de pessoa, ativo, sonda, IP ou MAC. O `detalhe` leva números ("2 de 3 sondas com primeiro envio").

### 4. Site em Implantação (assistente)

Uma etapa por vez. Topo: as quatro etapas, a atual marcada (`aria-current="step"`), e um cartão **"Para avançar"** com a lista
`falta` do servidor e um único botão primário. Conteúdo por etapa:

1. **Cadastrar:** dados do site (o formulário de hoje) e as zonas; falta = zonas dos níveis 2, 3 e 4.
2. **Levantar:** sessões de levantamento (`montarLevantamento` de hoje), "Trazer dados" e "+ Ativo"/"+ Fluxo", que criam **achado**.
3. **Revisar:** entrada única "Revisar" com a fila de achados e os lotes (`montarRevisao` + `montarColeta` de hoje).
4. **Aprovar a base:** inventário e fluxos **só leitura**, "Pedir aprovação" (quem edita) e "Aprovar"/"Devolver" (Gestor que não pediu).

Criar site abre o site novo na etapa 1 (`POST /sites` já devolve `id`, `ot.ts:150`). Qualquer etapa já feita pode ser aberta para ler.

### 5. Site em Operação

Abas: **Desvios**, **Saúde da coleta**, **Inventário** (só leitura, com os fluxos), **Mudanças**, **Revalidação**.

- **Mudanças:** os lotes do site criados depois de `base_aprovada_em` (derivada; sem coluna nova), em duas listas: **abertas** (em
  revisão) e **concluídas**; e "Registrar mudança", que **sempre cria um levantamento de visita novo** para aquela mudança (nunca reusa outra sessão aberta) e
  leva ao formulário de achado; o envio dessa sessão é a Mudança (um lote). A
  retenção apaga todo lote não concluído com mais de 7 dias (`src/manutencao.ts:155`, P0-3): uma Mudança recusada some da lista em
  7 dias, e o registro dela fica na trilha (`ot.lote.rejeitado`, com o motivo). Mudar o inventário em operação é só por aqui (ou pelo
  "Regularizar" do desvio, que já cria achado).
- **Revalidação:** `revalidar_em` (`ot-fase.ts:58`) para todos; os ativos do ARCiber com verificação vencida ou a vencer em 60 dias só
  para quem vê completo (`aprovar_lote` = `podeVerCompleto`; técnico e platform_admin veem só a data) e "Nova visita de revalidação" (levantamento).
- **Obra** é a exceção formal: em obra o site mostra o assistente nas quatro etapas, com a faixa "Obra até dd/mm" (a zona pode mudar
  na obra, então a etapa 1 também existe; o servidor já permite `pedirBase` a partir de `em_obra`, `ot-fase.ts:90`).

### 6. Papéis

O servidor passa a expor o que a pessoa pode, e a tela para de recalcular:
`GET /api/v1/projects/:id/ot/permissoes` →
`{ editar, criar_lote, aprovar_lote, ver_sondas, gestor, leitor, tecnico, tela_inicial }`, todos booleanos menos `tela_inicial`
(`'painel' | 'implantacao'`). Sem ids. `gestor` = `ehGestorArciber`; `aprovar_lote` = `podeVerCompleto`; `editar` = `podeEditarOt`.

| Ação | Gestor ARCiber | Consultor designado | consultoria_admin designado / admin direto | platform_admin | Técnico (`org_user`) | Leitor (`client`) |
|---|---|---|---|---|---|---|
| Painel | completo | completo | completo | completo | Meus sites e Meu trabalho | frase, régua sem "Abrir", resumo da RO-CB |
| Sites, Desvios, Inventário | todos | todos | todos | todos (IP/MAC mascarado) | só os dele | **não** (403) |
| Assessment, Relatórios | sim | sim | sim | sim | sim (como hoje) | sim (leitura) |
| Implantação (lista de verificação) | sim | sim | sim | sim | não | não |
| Registrar achado, levantamento | sim | sim | sim | sim | nos sites dele | não |
| Decidir lote / Mudança | sim, se não criou | sim, se não criou | sim, se não criou | não (não vê completo) | não | não |
| Pedir a base | sim | sim | sim | sim | não | não |
| Aprovar/devolver base, abrir/renovar obra, aceitar desvio | **sim** (inclui admin direto no cargo) | não | só se for o Gestor da direta | não | não | não |
| Configuração | sim | sim | sim | sim (Sondas: não, não vê completo) | não | não |

**Quem é o leitor:** a mesma regra do Painel (`painel-ot.ts:38`): papel de cliente (`PAPEIS_CLIENTE`, `src/helpers.ts:205`) que não é o
Gestor ARCiber do projeto nem o técnico (`org_user`); na prática, `client`. Uma função só (`ehLeitorOt`) serve o Painel, as
permissões e o middleware.

Leitor no servidor: um middleware no `otApp` responde 403 ao leitor em toda rota do n.ot fora da lista fechada
`ROTAS_DO_LEITOR` = `GET /requisitos`, `GET /assessment`, `GET /conformidade`, `GET /indicadores`, `GET /relatorio/conformidade`,
`GET /permissoes`. `sitesPermitidos` não muda (os agregados dos relatórios seguem sobre todos os sites do projeto). Nessas rotas, o
que é inventário sai da resposta do leitor: `por_zona` dos indicadores (nome e id de zona e site, `ot-indicadores.ts:24-27,54`; fica
`por_nivel`) e o `subsidio` de cada item do assessment (`ot-avaliacao.ts:82-114`). O Relatório de conformidade mantém a tabela de
sites (decisão 1). No `por_site` do assessment o leitor recebe nome e fase do site, coerente com a decisão 1, mas nenhum `site_id`
(revisão do PR2); a tela não lhe mostra "Abrir site" nem o subsídio. Na régua comum, o próximo passo do leitor não leva `site` (o Início do n.360 também o mostra, `painel.ts:477`).

O técnico vê no Painel **Meus sites** (o "Por site" dele, já cortado por `sitesPermitidos`) e **Meu trabalho**: os achados em
rascunho dos sites dele que ele criou e os lotes dele recusados nos últimos 7 dias (depois disso a retenção já os apagou, `src/manutencao.ts:155`), com link ao site e à etapa.

### 7. Links profundos

O endereço passa a guardar a aba: `/ot?ot=site&site=<id>&aba=<aba>`. O endereço só valida o formato; a tela do site, depois de ler a
`area` da situação, confere a aba contra as abas daquela área e, se não for uma delas (mesmo com formato válido), abre a da etapa atual
(Implantação, Obra) ou a primeira (Operação) e reescreve o endereço. Item de "O que fazer" e próximo passo da régua ganham `site` (quando o item é de um site só) e `aba`; com mais de um site,
o item leva a Operação › Desvios ou a Implantação › Sites em implantação, já filtrados. O sino: o link gravado no
aviso passa a levar o alvo (`/projects/<id>/ot?site=<site>` na obra, `/projects/<id>/ot?desvio=<desvio>` no aceite,
`/projects/<id>/ot?ot=assessment` na revisão); o clique abre o site, o desvio (pelo caminho que já resolve `/ot/desvios/<id>`,
`ot.js:52-68`) ou o Assessment.

No assistente (Implantação, Obra), a aba pedida só vale até a etapa atual; uma etapa que ainda não chegou abre a atual. Consequências assumidas:
um desvio de site em Implantação ou Obra abre a etapa atual e o destaque do desvio se perde (desvio só tem tela em Operação); links para o inventário (`base`) ou
as sondas antes da etapa 4 também caem na etapa atual; um lote ou levantamento pedido numa etapa que ainda não chegou mostra o aviso "este item é de uma etapa
que ainda não chegou" e o pedido é descartado. Sem a situação do servidor a tela do site não desenha o assistente: mostra o erro com "Tentar de novo" (falha fechada).

### Regras do servidor novas ou alteradas

| Regra | Onde | Muda |
|---|---|---|
| Área e etapa do site | `areaEEtapa`, `faltaParaAvancar`, `condicoesDaBase` em `ot-fase.ts` | nova (pura) |
| Pedir a base exige ao menos um ativo ativo no site | `faltaParaBase`, `aprovarBase` | **alterada** (decisão 2) |
| Ativo e fluxo só entram, mudam ou saem por lote | rotas de escrita de `ativos` e `fluxos` saem; o item de lote ganha `alvo_id` e `remover` | alterada |
| Lote aprovado remove ativo/fluxo (`remover: true` com `alvo_id` do mesmo site), com a mesma trava P1-4 da alteração (alvo editado depois da revisão: o item volta a pendente; o UPDATE compara o `updated_at` lido) | `aprovarLote` (`ot-coleta.ts:266`) | nova |
| Alteração por `alvo_id`: o alvo é o do `alvo_id` (não o do índice), `duplicata_de = alvo_id` na criação do item (senão a trava P1-4, `ot-coleta.ts:320`, devolve "alvo mudou"); dispensa `nome` (`ot-coleta.ts:133`) e, no fluxo, as pontas (`ot-fluxo-achado.ts:62-63`); a regra do 4.3.1 (`toca431`, recoleta carimba) vale igual | `criarLote`, `prepararItem`, `prepararFluxo`, `aprovarLote` | nova |
| O agente de coleta não manda `alvo_id` nem `remover` (recusa uniforme, como `zona`) | `registrarAchados` (`src/services/ot-agente.ts:142`) | nova |
| Zona: criar, editar e remover só com o site em Implantação (`em_levantamento`) ou em Obra (`em_obra`); 409 em `em_operacao` e `base_em_aprovacao` (decisão 3). A fase vai na própria mutação (`INSERT … SELECT … WHERE EXISTS`, `UPDATE … AND EXISTS`), sem leitura antes | rotas de zona (`src/routes/ot.ts:178-203` e o DELETE do laço `:375-386`) | nova |
| Leitor só lê Painel, Assessment e Relatórios | middleware no `otApp` | nova |
| Técnico tem "Meu trabalho" no Painel | `blocoOt` / `respostaDoOt` | nova |
| Itens do Painel com `site` e `aba` | `ItemFazer` (`src/services/painel.ts:32`), `etapasDoOt` | alterada |
| Link do aviso de obra e de aceite | `avisos-prazo.ts:259` | alterada |
| "Criar ação corretiva" só aparece com o n.iso | `GET /ot/permissoes` ganha `acao_corretiva` | alterada (tela) |

### Endpoints

| Rota | Novo ou alterado | Contrato |
|---|---|---|
| `GET /ot/permissoes` | novo | `{ editar, criar_lote, aprovar_lote, ver_sondas, gestor, leitor, tecnico, acao_corretiva, tela_inicial }` |
| `GET /ot/implantacao` | novo | `{ passos: Passo[] }` (seção 3); 403 para quem não edita |
| `GET /ot/sites/:id/situacao` | alterado | ganha `area: 'implantacao' \| 'operacao' \| 'obra'`, `etapa: 1 \| 2 \| 3 \| 4 \| null`, `falta: string[]` |
| `GET /painel?modulo=ot` | alterado | `por_site[]` ganha `area` e `etapa`; `fazer[]` ganha `site?` e `aba?`; técnico recebe `meu_trabalho: ItemFazer[]` |
| `POST /levantamentos/:id/achados` e `PUT …/achados/:aid` | alterado | `dados` aceita `alvo_id` (ativo ou fluxo do site) e `remover: true` (só com `alvo_id`) |
| `GET /ot/lotes/:id` | alterado | ganha `nomes_alvos: Record<id, string>` (nome do ativo ou rota do fluxo de cada `alvo_id`, só do site do lote), para a tela dizer "Remover: X" / "Alterar: X" |
| `GET /ot/indicadores`, `GET /ot/assessment` | alterado | sem `por_zona` e sem `subsidio` para o leitor |
| `POST /ot/zonas`, `PUT /ot/zonas/:id`, `DELETE /ot/zonas/:id` | alterado | 409 com o site em operação ou com a base em aprovação |
| `POST/PUT /ot/ativos*`, `POST/PUT /ot/fluxos*`, `DELETE /ot/ativos/:id`, `DELETE /ot/fluxos/:id` | **somem** | o OpenAPI e `contrato-tela-api` acompanham |
| `DELETE /ot/sites/:id` | fica | estrutura do site |

### O que some

A tela Início (`ot-inicio.js`) e o item de menu `nav-ot-inicio`; `pendenciasDoPapel` (vai para o servidor); a régua de 3 e os rótulos
de modo; "Acessos e sondas" como tela única; as seis rotas de escrita direta de ativo e fluxo; as cópias de papel na tela (`ehGestor`,
`podeAceitar`, `podeAprovarOt` com o recorte do `consultoria_admin`).

## Invariantes P0 do n.ot (não podem quebrar)

- **Módulo na pessoa E no projeto** (`podeVerOt`); o `ot` nunca é concedido automaticamente (P0-1).
- **Agente e chave de API nunca** (`otApp` 403, `ot.ts:37-43`; `FORA_DO_AGENTE`) (P0-2). As rotas novas ficam sob o `otApp` e herdam o 403.
- **Quem não tem `ot` não sabe de OT:** nenhuma chave, contagem, texto ou consulta `ot_*` no Painel do n.360, na carteira, no sino ou
  no menu (`test/programa-rota.test.ts`, `frontend/test/painel-regua.test.js`). O `site` novo nos itens só sai dentro do bloco `ot`.
- **`sitesPermitidos` é o único filtro de site** (P0-4): toda consulta nova usa `site_id IN (SELECT value FROM json_each(?))`; o técnico
  não recebe total do projeto que denuncie outros sites (a lista de verificação não é dele).
- **Sem IP, MAC ou nome de sonda/ativo** em Painel, lista de verificação, aviso, trilha ou mensagem de erro (P0-6, P1-7).
- **Quem criou não decide** (lote, base, avaliação) e a aprovação de lote continua o único lugar que carimba a verificação do 4.3.1.

## Riscos

- **Fixtures dos testes** usam `POST /ot/ativos` e `POST /ot/fluxos` em 9 arquivos (`test/ot-agente-mcp`, `ot-coleta`, `ot-inventario`,
  `ot-levantamento`, `ot-levantamento-l2`, `ot-rede`, `ot-saidas`, `ot-stepup` e `ot-tecnico`): um ajudante cria por achado e lote,
  aprovado por outra pessoa. O lote aprovado carimba a verificação do 4.3.1 quando o item é completo: números de verificação nos testes
  de saídas mudam. Teto de 20 lotes por dia por pessoa (`ot-coleta.ts:17,196`): um lote por preparação, não um por ativo.
- **E2E:** `frontend/e2e/ot.spec.js` roda no portão (`scripts/ci/gate.sh:103`) e trava Início, "Modo operação", "+ Novo ativo" e
  "Acessos e sondas" (`ot.spec.js:43-47,120,335,434,484-521,627-665`): cada PR que muda esses textos atualiza o E2E junto.
- **Renomear ativo sem IP nem MAC** não casa pelo `indice` (`ot-coleta.ts:154-160`): por isso o achado de alteração leva `alvo_id`.
- **Pedir base com ativo obrigatório** muda testes de fase que aprovam base só com zonas (`test/ot-fase*.test.ts`). A ordem das
  mensagens de `condicoesDaBase` é a de hoje (rascunho, lote, zonas) com o ativo por último: o 409 dos casos atuais não muda.
- **Leitor:** quem é `client` com `ot` hoje e abre Sites passa a receber 403; a tela some com o menu antes (mesmo PR).
- **Lote de um só item** por "Editar" na operação gera muitos lotes: a tela agrupa os achados em rascunho e envia de uma vez (como hoje).
- **Sondas por site** em Configuração continuam uma chamada por site (`ot-sensores.js:36`): fica como está (só quem edita, raro).

## Decisões do dono sobre as perguntas abertas (26/11/2026: "sim às 4", as recomendações valem)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | O Relatório de conformidade do leitor mostra a tabela de sites (nome e fase), como hoje (`ot-avaliacao.ts:185`)? | **Sim**: é o relatório formal entregue ao cliente; o Painel continua sem site |
| 2 | Pedir a base passa a exigir ao menos um ativo no site? | **Sim** (a etapa 2 Levantar só faz sentido assim) |
| 3 | Zona criada, editada ou removida em operação também só por Mudança? | **Não por Mudança**: zona é estrutura (etapa 1); em operação, só em Obra, com trava no servidor (409 em operação e com a base em aprovação) |
| 4 | O platform_admin vê a lista de verificação? | **Sim** (`podeEditarOt` já o inclui); Sondas continua fora dele |

## Fora de escopo

PR5 dos painéis (plano por onda, etiqueta na ação); migração de dados (nenhuma é necessária: a fase do banco fica, Mudanças é
derivada de `base_aprovada_em`, a remoção por lote vai no JSON do item, que o CHECK da 0092 aceita); convite de técnico sem conta
(segue em Usuários do n.360; o atalho de `ot.js:425` fica); cadastro de parte dentro de Fornecedores de OT; renomear `sensor` no código;
mexer nas cinco etapas comuns.

## Não conferido

Uso real de cada tela; quantos `client` têm `ot` em produção; se algum fluxo externo (planilha antiga, script) chama `POST /ot/ativos`;
tempo das consultas novas no D1 de produção. Nenhum teste foi rodado.
