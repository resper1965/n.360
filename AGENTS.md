# n.360 — Manifesto do Agente

Se voce esta lendo isto, voce e o agente responsavel por continuar o
desenvolvimento do **n.360**, a plataforma de GRC da ness., e dos seus
modulos: **n.iso** (ISO 27001/27701, em `/iso`), **n.privacy** (LGPD/ANPD, em
`/privacy`) e **n.ot** (ARCiber, ONS RO-CB.BR.01, em `/ot`: catalogo, inventario, coleta, saidas e step-up, fatias N1 a N4, P1-1 e Levantamento L1). O repositorio, o Worker e o banco ainda se chamam `niso` por
historia; nao e o nome do produto.

Este arquivo descreve o que **existe hoje**. Historico de sprint vive no
`CHANGELOG.md` — nao acrescente narrativa de entrega aqui, ela envelhece e
passa a mentir para o proximo agente.

## Regra numero um: nao afirme sem evidencia

Em 2026-08-03, tres resumos diferentes afirmaram que PRs estavam mergeados e
que migrations 0013–0018 tinham sido aplicadas. Nenhuma das duas coisas era
verdade. O custo foi real: cinco funcionalidades quebradas em producao
(criar ativo, criar webhook, criar e revogar API key, criar DPIA, mudanca de
escopo) e ninguem percebeu, porque os relatorios diziam que estava tudo bem.

Entao:

- **Mergeado** so depois de `git cat-file -e origin/main:<arquivo>` responder.
- **Aplicado** so depois de `PRAGMA table_info(...)` mostrar a coluna.
- **Em producao** so depois de uma sonda contra a API viva. Desde o item 0.2 do
  `enterprise-grade-plan.md` (hoje em `docs/arquivo/`), `/health` distingue versao — ele devolve o SHA do
  commit publicado, injetado no deploy:

  ```
  curl -s https://n360.ness.com.br/health
  # {"status":"ok","version":"<sha>","deployment_id":"...","deployed_at":"...","app_url":"https://n360.ness.com.br"}
  ```

  (`niso.ness.com.br/health` responde o mesmo: `/health` e `/api/*` ficam no dominio antigo.)

  Compare o `version` com o SHA que voce espera. `"dev"` significa que a var nao
  foi injetada — deploy feito fora do workflow.

  A sonda antiga continua util como segunda evidencia, porque prova COMPORTAMENTO
  e nao so um rotulo:

  ```
  curl -s -X POST -H "Content-Type: application/json" -d "{}" \
    https://n360.ness.com.br/api/v1/auth/login
  ```

  Codigo atual devolve o envelope completo:

  ```json
  {"error":"Payload invalido","details":[
    {"path":"email","message":"Invalid input: expected string, received undefined"},
    {"path":"password","message":"Invalid input: expected string, received undefined"}]}
  ```

  Formato anterior ao #34 devolvia os `issues` crus do zod dentro de `details`,
  com `"code"`, `"expected"`, `"received":"undefined"` e `"message":"Required"`.
  O que distingue e a forma de cada item, nao o envelope — `error` e `details`
  existem nos dois. `test/validation-contract.test.ts` fixa esse contrato.

Cole a saida. Sem saida colada, a afirmacao nao conta.

E vale para contagem tambem: o PR que introduziu esta regra afirmou "46 tabelas"
porque `grep -c 'CREATE TABLE'` contou duas linhas de COMENTARIO, e "7 de 23
testes mockam o D1" porque `grep vi.fn()` casa mock de qualquer coisa. Os
numeros certos eram 44 e 2 de 22. `grep` conveniente nao e evidencia — confira o
que o padrao realmente casou antes de escrever o numero. **Todo numero neste arquivo
traz ao lado o comando que o mede**; numero sem comando nao entra.

## O que e o n.360, em uma tela

- **Um Worker, um banco (D1 `niso-db`), um deploy.** O endereco canonico e `https://n360.ness.com.br`
  (`APP_URL` em `wrangler.jsonc`). `/` e o inicio do n.360 (um cartao por modulo e o grupo "Conta e acessos"),
  `/iso*` a casca do n.iso, `/privacy*` a do n.privacy e `/ot*` a do n.ot. O CAMINHO decide a casca (`frontend/src/produto.js`);
  o servidor entrega o mesmo `login.html` para todos.
- **Um cadastro so.** Partes, itens, documentos, RoPA, DPIA, evidencias, pedidos e incidentes sao do nucleo e
  servem aos dois modulos. O que e so de um modulo fica na faixa dele.
- **A trava e do servidor:** `src/modulos.ts` poe cada rota de projeto numa faixa (`nucleo`, `iso`, `privacy`, `ot`).
  Faixa de modulo exige o modulo no projeto (`projeto_modulos`) **e** na pessoa (`usuario_modulos`, migration
  0066); senao 403. Rota nova de projeto sem faixa reprova em `test/modulos-produto.test.ts`.
- **n.ot (spec `2026-10-30-n-ot-modulo-n360-design`, fatias N1 a N4 e P1-1, migrations 0089 a 0092):** faixa `ot`, todas as rotas
  sob `/api/v1/projects/:projectId/ot/…`: catalogo RO-CB.BR.01 Rev.00 (`GET …/ot/requisitos`), inventario (sites, zonas, ativos,
  fluxos, acesso por site), coleta em lotes, revelar e conformidade em `src/routes/ot.ts`; indicadores, exportacao e IA em
  `src/routes/ot-saidas.ts`.
  Duas regras do modelo de ameacas que nao podem regredir: **P0-1, o `ot` nunca e concedido automaticamente** (o gatilho
  `usuario_modulos_padrao` nao o da a ninguem, e habilitar o `ot` no projeto nao o da aos clientes; so `PUT /users/:id/modulos`
  ou `POST /users` com `modulos`, com trilha; a caixa do n.ot na tela Usuarios nunca nasce marcada) e **P0-2, sem chave de API
  nem agente MCP** (`otApp` responde 403 a `apikey:` e a `agente`; `/projects/:id/ot` esta em `FORA_DO_AGENTE`). Frontend:
  casca `/ot` com uma tela (`views/ot.js`) em abas: catalogo, inventario (sites, zonas, ativos), fluxos, coleta (`views/ot-coleta.js`),
  saidas (`views/ot-saidas.js`) e acesso por site (so quem edita); papeis e formulario do ativo em `src/ot-comum.js`, que so ESCONDE o que
  a API recusaria. IP/MAC aparecem como a API devolve e ficam so na memoria da tela; "Revelar" (platform_admin, ativo mascarado) pede o
  motivo e mostra o valor num modal que some em 30 s. **P1-1 (step-up):** revelar e exportar (`POST …/ot/exportacao`, com
  `justificativa` no corpo) exigem o carimbo `totp_em` da sessao, gravado por `/auth/mfa/verify`, dos ultimos 10 min (403
  `codigo: totp_necessario`, mesmo com SSO), justificativa sem IP/MAC em `audit_logs.justification`, teto por hora em `rate_limits`
  (revelar 20/pessoa e 60/projeto; exportar 5/pessoa e 15/projeto; 429 `teto_por_hora`) e aviso ao Gestor ARCiber titular e suplente
  (sino de quem alcanca o projeto e e-mail da governanca), tudo em `src/services/ot-stepup.ts`; a tela pede o codigo (de novo se errado, sem
  perder a justificativa) e repete (`comStepUp` em `ot-comum.js`). O aviso do sino (`/projects/:id/ot`) abre o n.ot na aba Saidas
  (exportacao) ou Inventario (revelacao); trocar de projeto zera os filtros de site e zona e o lote aberto (`renderOt`). A conformidade mostra so os tres estados do servidor (nunca "atende"). Item `#nav-ot` no hub so com projeto **e** pessoa com o modulo (`atualizarItemOt`);
  o painel ainda nao tem bloco do n.ot (`views/painel.js` o ignora).
  Coleta (N3, migration 0092): `POST …/ot/lotes` (planilha CSV/XLSX em multipart, lida em memoria: nunca vai ao R2 nem a
  IA) e `POST …/ot/lotes/manual` (JSON) entram em `ot_lotes`/`ot_lote_itens` (`src/services/ot-coleta.ts`); nada grava direto
  no inventario. O tecnico (`org_user`) so cria lote, nos sites de `ot_site_acessos` (entrada exata no allow-list de `auth.ts`);
  aprovar/rejeitar e de quem `podeVerCompleto` e nunca de quem criou o lote; a aprovacao grava `verificado_por` e
  `ultima_verificacao_em` (a evidencia do 4.3.1) so quando o item trouxe todos os campos do 4.3.1; item que muda um deles sem
  recoletar, ou `PUT /ativos` que toca um deles, zera a verificacao (`toca431`). Alvo da mescla alterado depois da revisao volta o
  item a pendente e o lote a `em_revisao` (P1-4). A marca de duplicata (`possivel_duplicata`, `possiveis_duplicatas`) so sai para
  quem `podeVerCompleto` (A1). O export de portabilidade (`GET /projects/:id/export`) nunca leva tabela `ot_*` (prefixo, em
  `src/portabilidade.ts`). Troca de papel ou projeto nao concede `ot` (`recalcularModulos`). Export de ferramenta OT (Nozomi etc.)
  nao existe: sem amostra.
  Levantamento (L1 da descoberta operacional, migracao 0093, `src/services/ot-levantamento.ts`): sessoes de entrevista, visita e
  documento, roteiro de 15 perguntas (`GET …/ot/roteiro`), achados confrontados com o inventario e enviados ao lote existente
  (`/levantamentos*`, incl. `…/:id/achados` e `…/:id/enviar`; `POST …/ot/lotes` aceita `levantamento_id` para sessoes de documento).
  Operador so por funcao e turno; texto livre recusa IP/MAC/CPF/e-mail/telefone; o confronto com o inventario so sai para quem
  `podeVerCompleto`; achado so entra no inventario por lote aprovado; a leitura sem mascara da sessao vai a trilha
  (`ot.inventario.ver_sensivel`). Retencao (`src/manutencao.ts`): descartado sai em 30 dias; rascunho de sessao encerrada ha
  30 dias sai; rascunho de sessao aberta nao expira; `enviado` sem lote, de lote rejeitado ou de lote apagado volta a rascunho
  apos 1 dia. Chaves do `roteiro` so as de `ot_roteiro_perguntas` (400 nas demais). Leituras com `LIMIT` explicito (`TETO_LEITURA_OT`) por causa do teto de 500 linhas
  da consulta. Frontend: aba Levantamento (`views/ot-levantamento.js`) com notas em autosave, roteiro para achado, aba inicial
  por papel, confirmacoes com o conteudo e contagem nas abas.
  Achado de fluxo (L2, migracao 0094, `src/services/ot-fluxo-achado.ts`): validado pelo esquema do fluxo, pontas so do site da sessao; o confronto pela chave das pontas diz novo, confirma ou contradiz (externo/VPN diferente). A aprovacao do lote cria o fluxo ou atualiza so protocolo, porta, finalidade, externo e via_vpn (pontas e direcao nunca). Migracao 0094: `ot_achados.pergunta_id` e `lote_item_id`; achado de item recusado volta a rascunho na manutencao.
  De-para (L4, migracao 0095, `src/services/ot-depara.ts`, `src/services/ot-documento.ts`, `src/routes/ot-depara.ts` montado depois do otApp): na sessao de documento, planilha CSV/XLSX vira achados por mapeamento coluna→campo (proposto pela IA a partir do cabecalho e de 5 linhas mascaradas, ou pelo nome da coluna; perfil salvo em `ot_perfis_depara` por assinatura do cabecalho, reaplicado sem IA); TXT/DOCX vira achados de ativo sugeridos pela IA (`origem = 'ia'`), com a evidencia conferida no texto mascarado. Rotas `…/levantamentos/:id/depara/planilha/proposta`, `…/planilha/aplicar`, `…/depara/texto`, `GET/DELETE …/depara/perfis`. Padroes provisorios (pontos do dono): modelo `reasoningModel`; teto 10 por pessoa e 30 por projeto por hora; trecho 3000 caracteres, 20 trechos, 60 mil caracteres, 25 itens e 6000 tokens por trecho; texto extrai so ativo.
- **Dominios antigos:** `niso.ness.com.br` e `nprivacy.ness.com.br` respondem 308 para `/iso` e `/privacy`, mas
  `/api/*`, `/scim/*`, `/mcp`, `/oauth/*`, `/.well-known/*`, `/health`, `/politicas*`, `/auditor*`, `/proposta*` e
  `/homologacao*` ficam no lugar (`fica` em `src/config/url.ts`). Detalhe em "URL canonica", abaixo.

## Stack

Cloudflare Workers (Hono) + D1 + KV + R2 + Workers AI. Frontend SPA
Vanilla JS, sem framework, bundle via Vite. Deploy por `wrangler deploy`.

- **Backend**: `src/index.ts` e o composition root que monta os sub-routers de
  dominio: **59 arquivos em `src/routes/`** (`ls src/routes/*.ts | grep -vc '\.test\.ts$'`,
  2026-10-17). A lista nominal envelhecia a cada PR; leia o diretorio.
- **Painel de entrada** (estudo `docs/design/diagnostico-2026-10-14/dashboard-entrada.md`, direcao A; decisoes adotadas na secao 10
  dele): `GET /api/v1/projects/:id/painel?modulo=iso|privacy` (sem `?modulo`, os modulos do projeto que a pessoa tem; faixa `nucleo`
  com a mesma recusa de modulo feita na rota) e `GET /api/v1/carteira` (projetos de `projetosVisiveis`, consultas agrupadas; fora do
  agente). A frase de saude e o estado do programa sao funcoes puras (`saudeDoProjeto`, `estadoDoPrograma` em `src/services/painel.ts`)
  sobre a mesma lista de "O que fazer"; projeto vazio e "Comecando", nunca "Em dia". O cliente recebe so a frase, as linhas dos
  modulos e `decisoes`. As `prioridades` da visao do encarregado ganharam `grupo`, `quando`, `contexto`, `acao` e `aba` (so campos
  novos: o menu le as contagens). Tela: `frontend/src/views/painel.js` (+ `painel-graficos.js`), entrada do n.360 (`inicio`), do
  n.iso (`dashboard`) e do n.privacy (`encarregado`); uma chamada por entrada, cache de 60 s em `S.painel`, selos do menu do
  n.privacy vindos do proprio painel. O funil comercial e a tela `comercial` (`renderComercial`, `views/dashboard.js`).
  **Painel do n.iso (Frente 4):** a lista "O que fazer" traz tambem fornecedor com avaliacao vencida (filtro `vendors::vencidos`; `situacao` em `GET /vendors`) e pedido esperando decisao (conta so os pedidos abertos do projeto em que a pessoa e destinataria pendente, o mesmo casamento de `GET /api/v1/pedidos`; o item fica fora da visao do cliente, que tem `decisoes`); os selos do menu do n.iso vem do painel (`modulos.iso.selos`, `frontend/src/selos-menu.js`) e chegam tambem a visao do cliente; fornecedor reprovado conta como atraso, como no n.privacy.
  **Filtro por situacao:** o item traz `filtro` (chave fechada de `FILTROS` em `frontend/src/filtro-painel.js`, nunca dado); o botao
  navega com `{ filtroPainel }`, o `navigate` o apaga na navegacao seguinte e a lista de destino (titular pedidos/incidentes,
  terceiros, evidencias, CAPA) abre filtrada com o chip "Filtro: ... — limpar" (`filtrarDoPainel`). Do n.360 ao modulo a chave vai no
  `sessionStorage` (`n360_filtro`), nunca no endereco. Acoes vencidas das atividades abrem a faixa "vencidas" das acoes por prazo.
- **Prontidao para a certificacao (n.iso, onda 2 do diagnostico de 15/10)**: `GET /api/v1/projects/:id/prontidao` (faixa `iso`, rota em
  `src/routes/readiness.ts`, regras em `src/services/prontidao.ts`). `CRITERIOS` e o catalogo: cada um com a clausula da ISO/IEC
  27001:2022, o estagio (1 documental, 2 operacao; fonte: skill `agent-skills/prontidao-certificacao/`), a tela e a acao; `avaliarProntidao`
  (funcao pura) da a situacao (atendido, pendente, nao se aplica), o motivo, o numero, o veredito (nunca "conforme"; sempre com a
  ressalva de pre-avaliacao), o que falta (estagio, depois o que destrava mais) e `do_cliente`. Criterio novo so com clausula de origem e
  dado verificavel no cadastro. **O indicador de progresso do n.iso e um so**: "X de Y controles aplicaveis implementados", pela
  `SQL_CLASSE_CONTROLE` de `src/services/classe-controle.ts` (Painel, Prontidao, Monitor, Jornada, gap-analysis, Bancada, readiness,
  coherence, medidas do RoPA e cobertura da LGPD; `Compliant` legado conta como feito; a SoA na tela usa o espelho
  `frontend/src/classe-controle.js`, conferido por teste); evidencia vencida e `SQL_EVIDENCIA_VENCIDA` e vencida ou nao conforme e
  `SQL_EVIDENCIA_RUIM`, de `src/services/evidencia-regras.ts`. Nao some contagem no cliente nem leia campo que a API nao devolve.
  **Controle e atividade (Frente 4):** `GET /api/v1/controls/:id/atividades` lista as atividades do RoPA que usam o controle como medida; a tela de controles mostra "Usado em N atividades" e pede confirmacao antes de mudar o controle para nao implementado.
  **Regras unicas (Frente 2A, 20/10/2026):** "hoje" e o dia de Sao Paulo em todo prazo e vencimento (`hojeEmSaoPaulo`/`diaMaisSP` em
  `src/services/hoje.ts`; `hojeSP`/`emDiasSP` em `frontend/src/hoje.js`; teste que varre o fonte em `test/hoje-sp.test.ts` e
  `frontend/test/hoje-sp.test.js`); o marco "Em operacao desde" e `SQL_MARCO_DO_PROGRAMA` (`painel.ts`: colunas gravadas, RIPD e pedido
  aprovado); fornecedor e `SQL_EH_FORNECEDOR` (`src/services/terceiros.ts`: organizacao ativa que nao e so parte interessada), o mesmo
  na lista do n.iso, no n.privacy, no Painel, na Bancada e no ponto de partida.
  Tela: `frontend/src/views/prontidao.js` (a view `certification`, item "Prontidao" no grupo Implementacao). Sem fases, Jornada e
  Monitor oferecem "Carregar as fases" (`POST /api/v1/projects/:id/phases`, so a equipe, 409 se ja tem) e a prontidao, nunca um ao outro;
  ligar o n.iso num projeto tambem carrega as fases.
- **Pedidos de aprovacao/ciencia (acesso de stakeholders)**: tabelas `pedidos`
  (conteudo congelado + SHA-256) e `pedido_destinatarios` (a prova por pessoa).
  Regras em `src/services/pedidos.ts` (`podePedir`, `autoridadeNoPedido`,
  `conferirVigencia`, `registrarDecisao`). Rotas: `/api/v1/pedidos*` (o
  destinatario; unico prefixo de dado do papel `stakeholder`),
  `/api/v1/projects/:projectId/pedidos*` (quem pede: criar, ciencia em lote,
  painel, reenvio), `/api/v1/public/pedidos/ver|codigo|ciencia` (link com codigo,
  token so no corpo) e `POST /api/v1/public/auditor/pedidos` (a prova, para o
  auditor externo, token no corpo, paginada; o portal inteiro esta em
  `src/routes/public-auditor.ts`). **A prova e imutavel**: o trigger
  `pedido_dest_prova_imutavel` recusa UPDATE em linha decidida, e
  `pedido_prova_imutavel` (0043) recusa mudar hash, conteudo e documento de
  qualquer pedido e status/substituto de pedido fechado (`org_id` fica livre:
  a transferencia de projeto o atualiza). DELETE fica livre no banco so para o
  projeto cascatear. No fonte, todo `UPDATE pedidos` leva `status = 'aberto'` e
  todo `UPDATE pedido_destinatarios` leva `status = 'pendente'` na WHERE do
  proprio statement (a unica excecao e `UPDATE pedidos SET org_id = ?`), sem
  DELETE nem REPLACE; `test/pedidos-prova.test.ts` le o fonte e reprova o que
  fugir disso. Correcao e pedido novo. Ninguem define a senha de outra pessoa: no `PUT /users/:id` o gestor so pede a redefinicao
  (`redefinir_senha`; `password` de outro e ignorado), a senha vira `SEM_SENHA` e o link de criar senha vai ao e-mail da conta; o
  e-mail de outra conta so o `platform_admin` troca. Conta com `requires_password_change = 1` nao aprova nem assina ate trocar a senha (`recusaSenhaDeOutro` em `src/helpers.ts`, nos pedidos, no lote e
  nas assinaturas diretas). A linha de quem assina na governanca (`linhaDeAssinatura`: Direcao, Lider SGSI/CISO, DPO/encarregado)
  so o `org_admin` do proprio projeto cria, altera ou remove (`podeMexerEmAssinatura`), tambem pela parte encarregada.
- **E-mail do pedido de aprovacao**: `POST /api/v1/projects/:projectId/pedidos` com papel `ciso`/`ceo` manda a cada destinatario, uma vez, o
  `emailPedidoAprovacao` (quem pede, tipo e titulo, papel, "sem data marcada", botao para `/?tela=meus-pedidos`, `reply_to` de quem pediu;
  `telaPedida` em `frontend/src/produto.js` aceita `meus-pedidos` para qualquer papel). Nao ha reenvio para aprovacao (o "Reenviar" e so da
  ciencia por link). Falha de envio vai ao log (`pedido_aprovacao_email_falhou`) e o pedido continua criado. Teste: `test/emails-avisos.test.ts`.
- **Aprovacao em lote** (`POST /api/v1/pedidos/lote`): nao e caminho novo de aprovacao. Cada item passa por `decidirPedido` (`src/routes/pedidos.ts`) ou `assinarEvidencia` (`src/routes/evidence.ts`), as mesmas funcoes da rota individual; a senha e conferida uma vez e o `hash_visto` de cada item tem de bater com o conteudo atual. So aprova, ate 50 itens, fora do agente. Mexer na regra de autoridade ou de segregacao e mexer nas duas funcoes, e o lote acompanha.
- **URL canonica**: `src/config/url.ts` (`appUrl(env)`, var `APP_URL`; o padrao do codigo e o `wrangler.jsonc` sao
  `https://n360.ness.com.br`, desde o #340). Link de e-mail, base do
  SCIM e CORS saem dali, nunca do host da requisicao. `niso.ness.com.br` e `nprivacy.ness.com.br` respondem 308 para
  `/iso` e `/privacy` do n.360 (`HOST_DO_MODULO`); `n-iso.ness.com.br` e `niso.ness.workers.dev` tambem, para `/iso`
  (#290). **Ficam no dominio antigo, sem redirecionar** (`fica(caminho)`): `/api/*`, `/scim/*`, `/mcp`, `/oauth/*`,
  `/.well-known/*`, `/health`, `/politicas*`, `/auditor*`, `/proposta*`, `/homologacao*` (links ja enviados, IdP de SCIM, conectores MCP, chaves
  de API). **SSO:** o `redirect_uri` enviado ao IdP e a constante `URL_NISO` (`niso`, o unico que os IdPs dos clientes cadastraram)
  quando o `appUrl` e o padrao de producao (`APP_URL_PADRAO`); com outro `APP_URL`, e o proprio `APP_URL` (`redirectUriDe` em
  `src/routes/public.ts`). Telas: o login pergunta `POST /api/v1/public/sso/iniciar` (`entrarComSso`, `frontend/src/globals.js`) e a equipe configura SSO, SCIM e politica em `frontend/src/views/seguranca-projeto.js`. So o redirecionamento final (`/#sso_token=`, `/#sso_erro=`) e absoluto no `appUrl`. **MCP:** o recurso e `RECURSO_MCP`
  (`https://niso.ness.com.br/mcp`) e `hostsPermitidosMcp` aceita `niso` alem do host do `appUrl`. **Volta atras:** `APP_URL`
  de volta para `niso` (o Worker e o frontend deixam de redirecionar: o host do `APP_URL` nunca redireciona, e o frontend le o
  `app_url` do `/health`). Sem dado nem migration; o widget do Turnstile precisa ter os dois hostnames.
- **Nomes padronizados**: `normalizarNome` (`src/services/nomes.ts`) roda ao gravar parte, departamento e ativo (esquemas em `src/schemas/nucleo.ts` e os gravadores que os contornam: `partes.ts`, `vendors.ts`, `encarregado-pessoa.ts`, `importacao.ts`, `itens.ts`). Gravador novo de nome passa por ela. O que ja estava gravado se arruma em Partes > Mais > Padronizar nomes (`src/services/padronizar-nomes.ts`; o agente usa `niso_padronizar_nomes`); nada e unido sozinho. A duplicata de parte ou item se mescla em Padronizar nomes (`POST /projects/:id/mesclar`, `src/services/mesclar.ts`: prévia sem `confirmar`, uma transacao, duplicado inativo, trilha `cadastro.mesclado` so com ids; fora do agente).
- **E-mail**: todo e-mail sai de `montarEmail` (`src/services/email-layout.ts`, o invólucro: tabela de 600px, fundo claro, marca do produto e `ness.` com o ponto em #00ade8, "Quem pede", "O que fazer", "Até quando" em dd/mm/aaaa de Brasília, botão #0b1326 com texto branco, link em texto, rodapé com o motivo e o contato, e a versão em texto puro). O texto de cada e-mail mora em `src/services/emails.ts` (o resumo de prazos em `avisos-prazo.ts`); `enviarEmail` exige `{ html, text }`. Remetente sempre `@ness.com.br`: `remetente(produto, quem)` dá "Cliente via n.360" ou "n.360 | ness.", e `replyTo` vai para quem pediu. E-mail novo entra em `emails.ts`, ganha amostra em `scripts/emails-amostra.mjs` (gera `docs/design/emails/`) e teste em `test/emails-marca.test.ts`. O convite não leva senha: leva o link de criar a senha (ver Contas).
- **Contas**: conta de usuario se **desativa**, nao se apaga (`PUT /api/v1/users/:id/ativo`; `DELETE /api/v1/users/:id` so desativa). Apagar de verdade e `DELETE ...?definitivo=1`, so `platform_admin`; conta com historico (FK sem cascata, ex. marcacoes de checklist e aceites de termo) e ANONIMIZADA em vez de apagada: fica sem identidade e sem acesso, o e-mail e liberado e a trilha leva `user.anonimizado`. Conta desativada nao entra por senha, SSO, agente MCP nem sessao aberta; chave de API e do projeto, nao da pessoa, e continua valendo ate ser revogada em Chaves de API. Ninguem desativa nem exclui a propria conta (409). Nao reintroduza `DELETE FROM users` fora dessa rota.
  **Convite com link (15/10/2026, migration 0077):** conta nova (`POST /users`, organizacao nova e seu reenvio, convite de stakeholder) nasce SEM
  senha utilizavel (`SEM_SENHA` = `convite:sem-senha-local`, que `verifyPassword` nunca casa) e com `requires_password_change = 1`;
  `enviarBoasVindas` (`src/routes/users.ts`) emite o convite (`src/services/convite.ts`: `genToken`, so o SHA-256 em `convites_senha`, 72 h,
  uma linha por conta) e o e-mail leva `appUrl/#convite=<token>` (fragmento) e nunca senha. A tela (`consumirConvite`/`doCriarSenha` em
  `frontend/src/globals.js`, caixa `criar-senha-box` em `login.html`) manda o token no CORPO de `POST /api/v1/auth/criar-senha` (publico,
  10 por IP a cada 10 min, `criarSenhaSchema` com a politica de senha de sempre) e entra pelo login normal. O "Esqueci a senha" tem um
  codigo de 6 digitos por conta (`reset_conta:<id>` no KV; o novo substitui o anterior), pedido no maximo 5 vezes por hora por conta, e
  `POST /auth/reset-password` exige e-mail e codigo, com 5 tentativas por hora por conta (`rateLimitD1`), de qualquer IP. Uso unico pelo `DELETE ... RETURNING`;
  reenviar (`POST /users/:id/reenviar-convite`, quem gere a conta, 5/h por conta, so com primeiro acesso pendente) substitui a linha e
  invalida o link anterior. Token desconhecido, vencido, usado, substituido, de conta desativada ou de SSO/SCIM: a MESMA resposta 400.
  Dominio de e-mail com SSO ativo (`configPorDominio`) nao ganha link; um dominio tem no maximo um SSO ativo (`PUT /projects/:id/sso` da 409)
  e dominio de provedor publico nao tem SSO. `password` no `POST /users` e aceito e IGNORADO. Trilha
  `auth.senha_criada_convite` e `user.convite_reenviado`, sem o token. Anonimizar apaga o convite. Teste: `test/convite-senha.test.ts`.
- **IP e navegador so para a equipe**: `semIpENavegador` (`src/helpers.ts`) tira `ip_address` e `user_agent` de quem nao e `ehEquipeNess` (o agente roda como `client`, entao perde) em audit-pack, audit-trail e `policy-acknowledgments`; em `GET /data-subject` so o principal nao humano (agente, chave de API) perde, porque o `org_admin` atende o titular (art. 18) com esses dados. Leitura nova de trilha passa por ela. Teste: `test/rastro-ip-leituras.test.ts`.
- **Middleware**: `src/middleware/auth.ts` (sessao, chave de API, RBAC
  write-guard por metodo+rota) e `src/middleware/project-access.ts` (isolamento
  multi-tenant em `/api/v1/projects/:projectId/*`).
- **Services** (`src/services/`, 60 arquivos em 2026-10-18: `ls src/services/*.ts | wc -l`; mais 18 em `src/services/ropa-abas/`, `ls src/services/ropa-abas/*.ts | wc -l`): entre eles
  `soa-logic.ts` (gate de aplicabilidade N/A da SoA; os 93 controles do Anexo A 2022 estao em `src/data/iso27001-2022.ts`), `migration-service.ts` (2013→2022),
  `pedidos.ts`, `organizacao.ts`, `fechar-venda.ts`,
  `preco-proposta.ts`, `transferencia-projeto.ts`, `totp.ts`, `data-subject.ts`.
- **Agents** (`src/agents/`): policy, evidence, assessment, control-adequacao,
  phase-interpretation, readiness, importacao e privacidade (`ls src/agents`). O `privacidade` so
  RASCUNHA no n.privacy (sugestao do tratamento, resposta ao titular, comunicacao de incidente): a saida
  passa por zod estrito, nada e gravado no registro e a trilha `agente.rascunho` nao leva o texto
  (`src/services/rascunhos-privacy.ts`). O copiloto da entrevista do RoPA (`POST .../ropa/copiloto`,
  `src/services/copiloto-ropa.ts`) segue a mesma regra, mas chama o modelo `reasoning` direto em JSON mode: so PROPOE
  respostas a partir de uma descricao livre, nunca decide sensivel, crianca nem transferencia, e a tela marca cada proposta.
- **Frontend**: `frontend/src/` → `frontend/dist`, servido pelo binding ASSETS.
  - `frontend/login.html` — o app de verdade (login + SPA), entrada do Vite
    (`vite.config.js: rollupOptions.input`), com `src/main.js`, `router.js`,
    `state.js` (estado global `S`), `api.js`, `ui.js`, `globals.js`,
    `src/views/*.js`. Serve `/`, `/login` e toda rota desconhecida. Desde
    2026-09-29 a tela de entrada É a landing: login na primeira dobra, seções
    institucionais abaixo, tudo dentro de `#login-overlay`
    (`docs/superpowers/specs/2026-09-29-landing-login-design.md`). **Não
    recrie `frontend/public/index.html`**: ele voltaria a tomar `/` com CSS
    próprio — foi assim que a landing antiga saiu da marca. Sem `index.html`,
    `/` cai no catch-all de `src/index.ts`, que entrega `/login`
    (`test/landing-raiz.test.ts`). Atenção: `vite.config.js` tem
    `emptyOutDir: false`, então um `dist/index.html` de build antigo sobrevive
    localmente — apague antes de testar a raiz com `wrangler dev`.
  - `frontend/public/politicas.html` — portal público de confirmação de
    leitura de política (LGPD art. 18 / ISO A.6.3). Serve `/politicas`
    (`/politicas.html` redireciona, 307, via `html_handling` do Workers
    Assets). Ficou fora de `dist/` por meses até 2026-08 — não estava na
    lista de entradas do Vite, então nunca era copiado; qualquer link externo
    para ele caía silenciosamente na tela de login. Confira antes de mexer:
    `curl -sL <domínio>/politicas.html` deve devolver o título "Portal de
    Ciência de Políticas", não o do app.
  - `frontend/public/auditor.html` (+ `auditor.js`, `auditor.css`) — portal do auditor externo,
    somente leitura. Serve `/auditor`; o link sai de `POST /api/v1/projects/:id/auditor-token` (cartão
    em Auditorias) com o token no fragmento, e a página fala só com `/api/v1/public/auditor/*`
    (`src/routes/public-auditor.ts`), token no corpo, só o hash no banco.
  - `frontend/public/homologacao.html` (+ `homologacao.js`, `homologacao.css`) — questionário de homologação do fornecedor.
    Serve `/homologacao`; o link sai de `POST /api/v1/projects/:id/homologacoes` com o token no fragmento, e a página fala só
    com `/api/v1/public/homologacao/*` (`src/routes/public-homologacao.ts`), token no corpo, só o hash no banco.
  - Arquivo novo em `frontend/public/` é copiado como está — mesmo padrão de
    `marked.min.js`, `favicon.svg`. Não precisa de entrada no Vite.
- **Schema**: `schema.sql` — **108 tabelas** (2026-10-27: `grep -oE '^\s*CREATE TABLE( IF NOT EXISTS)? +[a-z_0-9]+' schema.sql | awk '{print $NF}' | sort -u | wc -l`;
  em 2026-10-05 o mesmo 58 (antes da 0046) saiu do `schema.sql` aplicado num SQLite em memoria). Migrations
  numeradas em `migrations/`, ultima a **0088** (`ls migrations/*.sql | tail -1`). Procedimento
  de migration nova e o que ha de particular (0011 neutralizada, buraco 0031–0033) em
  `migrations/README.md` — leia antes de tocar em migration.
- **Cadastro da empresa (migration 0071)**: `empresas`, 1:1 com `projects` (`project_id` e a chave), em `src/services/empresas.ts`
  e `src/routes/empresa.ts` (`GET/PUT /projects/:id/empresa`, faixa `nucleo`; edita a equipe com acesso e o `org_admin`). CNPJ so
  digitos com dígito verificador (`cnpjValido` em `src/schemas/corpos.ts`), unico por organizacao (409); sem CPF de ninguem. As colunas
  antigas de `projects` (cnpj, employee_count, sector, client_name) sao espelhadas a cada gravacao. `POST /projects` aceita `empresa` e
  `pessoas` (representante e DPO viram `partes`, o DPO com o vinculo `encarregado`) no mesmo batch. `GET /projects/consulta-cnpj/:cnpj`
  (BrasilAPI pelo servidor, sem QSA) e so de `platform_admin`/`consultoria_admin`, com limite por usuario, e fica fora do agente.
- **Inventario (ativos)**: vive em `itens` (nucleo fino) + `item_seguranca` (bloco do n.iso, 1:1), antes `assets`
  (migration 0048). `src/services/itens.ts` traduz as duas tabelas para o formato antigo da API de ativos
  (`name`, `owner`, `status` Active/Removido...), entao tela, MCP e CSV nao mudaram. Coluna nova no inventario:
  acrescente em `CAMPOS` la, nunca interpole nome vindo da requisicao.
- **Documentos (politicas)**: `documentos` + `documento_versoes` (migration 0050, fatia 3.1), em `src/services/documentos.ts`
  e `src/routes/documentos.ts`. Uma versao vigente e um rascunho por documento (indices parciais unicos); hash e o SHA-256
  canonico dos pedidos. **O documento e a unica fonte da politica**; `compliance_controls.description` e nota do
  controle e `policy_versions` e so historico (nenhum codigo novo as le como texto de politica). Nao existe mais escritor por controle
  (`politica-escrita.ts` saiu), e o **agente (MCP) grava rascunho** (`niso_criar_politica`, `niso_gerar_secao`) e publica pela ferramenta `niso_publicar_documento`, com confirmacao, motivo e o hash do rascunho
  (a rota decide por `c.get('user')?.agente === true`; publicar e `POST .../versoes/:n/publicar?hash=`; a tela manda o hash
  do rascunho que mostrou e rascunho regravado depois da 409; descartar o rascunho tambem e decisao); `PUT /controls/:id` recusa ao agente mudar `description` fora da justificativa de N/A. `POST .../documentos/importar` copia para ca so o que tem sinal de politica (versao, aprovacao
  ou pedido); `description` preenchida nao basta (em producao e texto de catalogo em quase todo controle). Com historico em `policy_versions`, o `description` do controle NAO entra como versao (e nota do controle); so entra quando nao ha historico. **Politica tematica (spec `docs/superpowers/specs/2026-10-23-politicas-tematicas-design.md`):** a cobertura e `documento_requisitos` x `compliance_controls.requisito_id`; `GET /projects/:id/documentos/cobertura` (`src/services/cobertura-politicas.ts`) conta controle aplicavel coberto por politica VIGENTE; a tela Documentos mostra o indicador, os controles sem politica e a coluna Controles, e a de Controles mostra 'Coberto por'. 'Gestao de politicas' saiu do menu e a tela por controle saiu com as suas rotas (geracao, lote, modelos, leitura e relatorio da politica do controle, versoes, restauracao e `POST/PUT /controls/:id/approve`: respondem 404, lista em `test/politicas-retirada.test.ts`); `generate-document`, `approve-document` e `checklist/:itemId/generate` ficam. **Geracao (PR2):** catalogo `src/data/temas-politica.ts` (16 temas, `grep -c "codigo: 'POL-" src/data/temas-politica.ts`, sugestao de controles; PSI com esqueleto proprio); `POST /projects/:id/politicas` cria o documento em rascunho com o esqueleto `## N. Titulo` e liga os requisitos (tema ja existente: 409, reconhecido pelo codigo no inicio do titulo); `POST .../documentos/:id/secoes/:n/gerar` gera UMA secao (`PoliticaSecaoAgent`, contexto de `contextoDaPolitica` em `src/services/contexto-politica.ts`, sem e-mail nem dado de titular), detecta corte (`ModelRunResult.cortada`; uma continuacao, depois o aviso 'Secao incompleta') e confere antes de gravar (`conferirSecao`, 422 sem gravar). Sempre rascunho; regra `ia` do limite de taxa. Tela: pagina `politica` (`frontend/src/views/politica.js`; os controles cobertos se editam ali, com rascunho) e 'Nova politica' em Documentos.
  **Organizar (PR3, sem migration):** `src/routes/politicas.ts`, faixa `nucleo`, so a equipe (`ehEquipeNess`), cada ato com `logAudit`, nada automatico. `GET /projects/:id/politicas/organizar` lista o que ha para arrumar (`sem_cobertura` traz `requisito_id`); `POST .../politicas/organizar/incorporar` liga o requisito do controle ao documento tematico e marca a origem `obsoleto` (o texto nao e copiado; nenhuma versao e apagada); `POST .../documentos/:id/promover` zera `origem_control_id` e faz do documento por controle uma politica propria. Tela `organizar-politicas`, em "Mais" de Documentos. `POST .../documentos/importar` pode recriar documento por controle, que reaparece em Organizar.
  **Ciencia por versao (3.3, migration 0051)**: `pedidos.tipo = 'documento'` tem `ref_id = documentos.id` e congela a versao
  VIGENTE (`titulo`, `texto`, `numero`; `DOCUMENTOS.documento` em `src/services/pedidos.ts` e um subselect). Publicar versao
  (rota ou escritor de politica) chama `conferirPedidosDoDocumento(c, 'documento', ...)` e substitui o pedido aberto; a ciencia
  da versao antiga fica no pedido antigo. O portal publico `/politicas` lista so documentos com versao vigente e grava a ciencia
  por `registrarCienciaPortal`: linha de `pedido_destinatarios` JA DECIDIDA (`canal = 'portal'`, hash, IP, user-agent) num pedido
  `ciente` "em pe" (`criado_por = 'sistema:portal'`, um aberto por documento, indice unico parcial). Quem leu pelo portal nao e
  copiado para o pedido novo; a ciencia leva o `numero` lido e versao que ja nao e a vigente da 409 sem registrar. O codigo do portal
  (`POST /public/policies/request-otp`) so vai a e-mail ligado ao projeto (conta, governanca, ou o mesmo dominio de conta ou governanca do cliente, fora `DOMINIOS_PUBLICOS` e da consultoria; parte pessoa
  NAO abre o portal pelo e-mail exato, pois o agente cadastra parte e nao pode ampliar o acesso por ai; o DPO entra pela governanca); fora disso a resposta e a
  mesma e nada e enviado; limites por IP, projeto e e-mail; o nome digitado nao vai no e-mail. Nada novo entra em `policy_acknowledgments` pelo portal; o registro manual interno
  (`POST /projects/:id/policy-acknowledgments`) ainda escreve nela ate a 3.4: a propria ciencia qualquer papel registra; a de outra pessoa,
  so a equipe ou o `org_admin`, com trilha `policy.ciencia_registrada`; o agente nao registra. A aprovacao CISO/CEO de documento e o pedido `tipo = 'documento'` (3.4, abaixo). O pedido `tipo = 'politica'` novo (aprovacao ou ciencia) responde 400; os antigos seguem legiveis e decidiveis, e as colunas `ciso_/ceo_approved_*` do controle so servem de leitura (prontidao A.5.1, avisos de prazo, auditor). A coerencia R4 (`control_approved_without_policy`) le a cobertura vigente (`coberturaDePoliticas`) ou `policy_versions`, nunca `description`.
  **Tela, hierarquia e aprovacao por versao (3.4)**: `frontend/src/views/documentos.js` (`#nav-documentos`). A hierarquia e regra do
  servidor (`validarHierarquia`: politica sem pai; norma sob politica; procedimento sob norma ou politica; ciclo e impossivel por
  construcao). `PUT /documentos/:id` edita metadados (nunca o texto), `POST .../revisar` renova `revisar_ate` sem versao, e a
  fonte `documento` de `src/services/avisos-prazo.ts` avisa a revisao vencida. A aprovacao CISO/CEO de documento e **derivada
  dos pedidos** (`tipo = 'documento'`, papel `ciso`/`ceo`): vale o pedido aprovado cujo hash e o do conteudo vigente agora, entao
  versao nova invalida sozinha sem apagar prova; `registrarDecisao` nao assina nada em controle/DPIA para documento (a prova e a
  linha do destinatario). `GET /documentos/:id/ciencias` lista quem deu ciencia de qual versao e por qual canal.
  **Excecoes (3.5, migration 0052)**: `documento_excecoes` (escopo, motivo, `vence_em`, `status` ativa|revogada) em
  `src/services/excecoes.ts`, rotas `/documentos/:id/excecoes` (listar, criar, editar, `POST .../revogar`). A aprovacao e um pedido
  `tipo = 'excecao'` (`ref_id` = a excecao, congela escopo/motivo/prazo, papel `ciso`/`ceo`); a situacao e DERIVADA (revogada,
  vencida, aprovada, aguardando, sem_pedido) e mudar escopo/motivo/prazo invalida a aprovacao sozinho. Revogar cancela o pedido
  aberto; o agente revoga pela ferramenta `niso_revisar_documento`, com confirmacao e motivo. A fonte `excecao` dos avisos de prazo avisa o vencimento.
- **Catalogo de requisitos (fatia 2, migration 0053)**: `requisito_fontes`, `requisitos` e `requisito_mapeamentos` sao GLOBAIS (sem
  `project_id`); `documento_requisitos` liga documento a requisito (por projeto) e `compliance_controls.requisito_id` liga o controle.
  Servico em `src/services/requisitos.ts` (`semearCatalogo`, `ligarControles`, `lacunasDaFonte`), rotas em `src/routes/requisitos.ts`
  (`/api/v1/requisitos*`, e `/projects/:id/requisitos/lacunas` e `/documentos/:id/requisitos`). Depois do seed o BANCO e a fonte da
  verdade: titulo e mapeamento sao dado editavel so pelo `platform_admin`, com `logAudit`; o seed e `INSERT OR IGNORE` e nunca
  sobrescreve edicao. Mapeamento `proposto` so aparece para consultor e administrador; `validado_juridico` exige `validado_por` e
  `validado_em` (CHECK). A cobertura de um artigo (`lacunasDaFonte`) conta documento VIGENTE ligado ou controle `Implemented` (ou `Compliant`, legado) ligado por
  mapeamento validado `equivalente`; `Implemented` com mapeamento `parcial` e parcial, e `Partial`/`In Progress` dao no maximo parcial
  (`equivalente` ou `parcial`); `Planned`, `Missing`, N/A e sem status, `relacionado` e `proposto` nao cobrem (`test/requisitos-cobertura-status.test.ts`). LGPD e GDPR entram por
  material juridico revisado, nao por codigo. O agente so le (`FORA_DO_AGENTE`).
- **RoPA como tratamento ligado (fatia 4, migrations 0054 e 0055)**: `ropa_records` CONTINUA sendo a tabela do tratamento (sem rename:
  a spec diz `tratamentos`, mas renomear tocaria 30+ arquivos por so um nome). `src/services/tratamentos.ts` e as rotas
  `/projects/:id/ropa/:rid/{ligacoes,itens,departamentos,transferencias,diagrama}` ligam o registro a itens, departamentos e
  transferencias (`tratamento_itens`, `tratamento_departamentos`, `tratamento_transferencias`, todas com `project_id`); as PARTES do
  tratamento sao `parte_vinculos` com `alvo_tipo = 'tratamento'` (sem tabela propria) e a base legal e `ropa_records.base_legal_id` →
  `requisitos`. Excluir o registro apaga as ligacoes e os vinculos. O diagrama Mermaid e DERIVADO (`diagramaDoTratamento`), nunca
  guardado, com rotulos sanitizados. A aprovacao por pedido (`tipo = 'tratamento'`, 0055 reconstroi `pedidos` no molde da 0051 e ja
  aceita `avaliacao_terceiro` da fatia 6) congela o registro e tudo o que ele liga (o diagrama sai dessas colunas); e DERIVADA
  (`aprovacoesDoProjeto(..., 'tratamento')`), mudar registro, item, departamento, parte ou transferencia invalida e substitui o pedido
  aberto, status nao. **Decisao do dono (26/10/2026, D6):** trocar os titulares, os dados ou os ativos da Coleta (o que entra no conteudo congelado; a descricao da Coleta nao entra) de uma atividade aprovada por pedido deixa a aprovacao desatualizada e pede nova aprovacao, sem mexer na prova do pedido anterior; `test/ropa-etapas-rotas.test.ts` fixa isso. Convive com a aprovacao direta antiga (`POST .../approve`), que no n.privacy saiu da tela (onda 2: a aprovacao da
  atividade e so o pedido, na etapa 5 da pagina da atividade; o POST segue no servidor por compatibilidade, o n.iso ainda assina no modal
  Detalhes, e a assinatura antiga gravada conta como aprovacao feita). `GET .../ligacoes` traz `aprovacao_anterior` (a aprovacao mais
  recente quando nenhuma vale mais, porque a atividade mudou depois) e `pedidos_abertos`. `POST /projects/:id/ropa/importar` (CSV) cria
  `Draft`, devolve as linhas recusadas e nao duplica (chave: finalidade).
- **Ficha da atividade em abas (n.privacy, migration 0079, PR1; spec `docs/superpowers/specs/2026-10-16-ropa-abas-design.md`).** A atividade de
  tratamento abre em `frontend/src/views/atividade.js` como cabecalho (nome, responsavel, areas, descricao), nove abas livres na ordem e com os
  rotulos do legado (Escopo, Tratamento de Dados, Agentes de Tratamento, Medidas de Seguranca, Base Juridica, Controle de GAPs, Teste de Impacto,
  Riscos, Logs ROPA) e o menu "Acoes". Um modulo por aba em `frontend/src/atividade/` (`montar(painel, ctx)` devolve `{ esvaziar }`, que a casca chama
  antes de trocar de aba); nao ha botao "Salvar" global: cada aba grava sozinha ("Salvo as HH:MM") ou ao confirmar o proprio modal. A aba Tratamento
  de Dados e as seis etapas (PR2, abaixo). **Rotas** em `src/routes/ropa-abas.ts`
  (`/projects/:id/ropa/:rid/{ficha,escopo,agentes,medidas,base-juridica,gaps,logs,conferencia,situacao,relatorio,riscos/motivos}`), faixa `privacy`;
  os esquemas ficam em `src/schemas/ropa-abas.ts`, os servicos em `src/services/ropa-abas/` e o conteudo fixo em `src/data/ropa-abas/` (as opcoes
  marcadas `// proposta:` esperam a confirmacao do dono). **A situacao e DERIVADA, nunca gravada** (`situacaoDaAtividade`): Rascunho, Em Revisao,
  Aprovada (vem dos pedidos de aprovacao com o hash vigente) e Cancelada (`status = 'Inactive'`); `POST .../situacao` so envia para revisao, reabre,
  cancela e reativa, e aprovar continua sendo o pedido (`src/services/pedidos.ts`). `GET .../conferencia` lista bloqueios e avisos e o menu "Acoes"
  devolve o motivo de cada item desabilitado, em texto. Atividade aprovada por pedido nao se apaga (`DELETE /ropa/:id` da 409; cancele pela situacao) e o `PUT /ropa/:id` com `status` diferente do gravado passa pela situacao (`Inactive` cancela, `Under Review` envia para revisao; o agente recebe 403, a ferramenta `niso_situacao_atividade` vale so em `/situacao`; chave de API, papel `client`, tambem recebe 403 ao cancelar ou enviar para revisao por ali). Atividade cancelada recusa escrita (409) pelas abas e tambem pelas sub-rotas antigas
  (`projectRopaApp.use('/:recordId/*')` e `PUT /ropa/:id` em `src/routes/ropa.ts`). **O hash dos pedidos nao mudou** (`pedidos.ts`, `documentos.ts` e as
  migrations 0001 a 0078 estao congelados): so escrita que toca coluna congelada (`finalidade`, `international_transfers`, `transfer_safeguards`,
  principal da base) chama `conferirPedidosDoDocumento`; volume, descricao, nome, papeis, medidas, gaps, riscos, impacto e situacao mantem a aprovacao.
  **Os catalogos nascem VAZIOS** (decisao do dono de 16/10): nenhuma lista de titulares, dados, medidas ou motivos de risco e semeada; cada tela explica o
  vazio e oferece criar ali mesmo. Gap e a mesma `corrective_actions` do n.iso (com `recomendacao` e anexos PDF/DOC de ate 5 MiB, conferidos pelo
  conteudo); o agente MCP escreve nas abas e muda a situacao pela ferramenta `niso_situacao_atividade` (confirmacao e motivo); apagar risco, acao, gap ou medida vai por `niso_executar` com confirmacao; nao anexa nem imprime o relatorio (`FORA_DO_AGENTE`). Importar do
  legado e etapa separada: o modelo de importacao segue sem a pergunta `alto_risco` (`PERGUNTAS_IMPORTAVEIS`). **Remocoes (PR3, pacote R):** o
  modal "Ligacoes da atividade" (`frontend/src/views/tratamento-ligacoes.js`) saiu; a API dos seus blocos continua (partes, transferencias, LIA, RIPD,
  Word da LIA, pedido de aprovacao e importacao de planilha). A rota `ropa-entrevista` redireciona para a ficha (com `?modo=guiado` quando ha atividade
  gravada; sem ela, a lista do RoPA), e o consentimento abre a ficha. `niso_privacy_ropa_detalhe` devolve situacao, etapas e medidas. O modo guiado e o painel
  `frontend/src/atividade/guiado.js` sobre as abas (a pergunta vem de `ficha.proxima_pergunta`); o motor da entrevista em `ropa-entrevista.js` saiu. E2E do sistema vazio em
  `frontend/e2e/ropa-abas.spec.js`; formas de resposta que a tela le em `test/ropa-abas-formas-front.test.ts`.
- **Tratamento de Dados por etapa (PR2, sem migration; plano `docs/superpowers/plans/2026-10-16-ropa-abas.md`).** A aba tem seis etapas em ordem
  (`ETAPAS` em `src/schemas/ropa-abas.ts`). A Coleta define titulares e dados; as outras usam so o que ela definiu, e cada titular tem situacao
  por etapa (`definido` ou `nao_usa`). As etapas 2 a 6 travam (409 no servidor) enquanto a Coleta estiver pendente. A situacao de cada etapa e
  DERIVADA (`situacaoDaEtapa`, `src/services/ropa-abas/etapas.ts`: concluida, pendente com `faltas`, ou nao aplicavel). **A Eliminacao tem ativos
  proprios (migration 0087, 27/10/2026)**, na mesma `tratamento_etapa_itens` das outras etapas (a 0087 refaz a tabela para o CHECK aceitar
  `eliminacao` e copia os ativos do Armazenamento, entao a atividade antiga continua vendo os mesmos); sem ativo ela fica pendente, salvo com o
  Armazenamento Nao Aplicavel. Escrita que muda o texto
  congelado (titulares, dados, sensivel, ativos, prazo, descarte) reescreve o hash em `src/services/ropa-abas/derivada.ts` e so ai chama
  `conferirPedidosDoDocumento`. Catalogos do projeto (`catalogo_itens`: titulares e dados; medidas e motivos de risco) nascem vazios e se criam na
  tela (`GET/POST/PUT /projects/:id/catalogos/:tipo`, `src/services/ropa-abas/catalogos.ts`); ativo, area e parceiro reusam `/assets`,
  `/departamentos` e `/partes`. Contagens (2026-10-18, salvo onde marcado): 6 etapas (`ETAPAS`); 8 rotas de etapa e 3 de catalogo em `src/routes/ropa-abas.ts`
  (`grep -c "ropaAbasApp\.\(get\|put\|post\)('/etapas" src/routes/ropa-abas.ts`; `grep -c "catalogosApp\.\(get\|put\|post\)(" src/routes/ropa-abas.ts`);
  21 modulos em `frontend/src/atividade/` (2026-10-21, `ls frontend/src/atividade/*.js | wc -l`); 30 testes de backend `ropa-*` (2026-10-21, `ls test/ropa-*.test.ts | wc -l`).
  Copiloto por etapa (`POST .../ropa/:rid/etapas/:etapa/rascunho`, `src/services/copiloto-etapa.ts`, botao em cada etapa editavel): PROPOE a
  descricao a partir da ficha e de uma nota opcional; a pessoa aceita (Aceitar copia o texto para o campo e o autosave grava), nada grava sozinho.
  Sem base (nenhum titular na Coleta, ativo, area, descricao nem nota) o modelo nao e chamado (`sem_base: true`, sem trilha); com base, a resposta traz `fontes` (o que foi enviado).
  E2E das etapas vazias em `frontend/e2e/ropa-etapas.spec.js`.
- **Órgãos públicos destinatários (migration 0097):** na aba Agentes, um órgão por linha (`tratamento_orgaos_publicos`: nome e obrigação legal,
  até 20 por atividade, gatilho de projeto), rotas `GET|POST /projects/:id/ropa/:rid/orgaos-publicos` e `PUT|DELETE .../:id` (faixa `privacy`),
  serviço `src/services/ropa-abas/orgaos-publicos.ts`. `ropa_records.recipients` segue no conteúdo congelado: cada escrita o regrava a partir das
  linhas (`textoDosOrgaos`) e, se mudou, confere os pedidos. O texto livre antigo sai como `texto_anterior` ate o primeiro cadastro, que o substitui (a tela pede confirmacao).
  Na aba Controle de GAPs, `pendente` so quando ha gap aberto sem responsavel; gap aberto com os campos preenchidos conta como feito (`estadoDasAbas`).
- **DPIA e LIA do tratamento (fatia 5, migration 0056)**: `dpia_assessments.ropa_id` tem integridade no BANCO por tres triggers
  (`dpia_ropa_do_projeto_ins/_upd` recusam registro inexistente OU de outro projeto; `dpia_ropa_apagada` zera a referencia ao apagar o
  tratamento), sem reconstruir a tabela (assinatura e deriva historica). `lia_assessments` e a LIA (uma por tratamento, `ropa_id`
  unico, some com ele; concluir exige finalidade, necessidade, balanceamento e conclusao; concluida so reabre). `src/services/lia.ts`:
  `liaExigida` vale quando a base do catalogo OU o texto livre diz "legitimo interesse" (sem acento nem caixa) e so aparece em
  `GET .../ropa/:rid/ligacoes` (`lia`, `dpias`, `dpia_pendente`), nao bloqueia. `POST .../ropa/:rid/dpia` cria a DPIA `Draft` ligada e
  pre-preenchida (409 com o id se ja existe). As duas familias de colunas da DPIA NAO foram unificadas (hash de aprovacoes existentes).
- **Teste de impacto do tratamento (migration 0072)**: `tratamento_impacto` (uma resposta `sim|nao|nao_sei` por pergunta, chave
  `(ropa_id, pergunta)`, some com o tratamento) e `ropa_records.impacto_finalizado_em`. O catalogo (13 perguntas: 2 de criterio geral e
  11 de especifico) e a regra moram em `src/services/impacto.ts`: RIPD `recomendado` com ao menos um geral E um especifico em "sim";
  sem isso, `dispensavel_a_confirmar` so com as 13 respondidas sim ou nao, senao `incompleto`. E sugestao: `dpia_required` continua
  decisao humana. Rotas `GET/PUT /projects/:id/ropa/:rid/impacto` (faixa `privacy`); o agente responde mas nao finaliza (403 com
  `finalizar`). Fica FORA do conteudo congelado da aprovacao (nada entra em `COLUNAS_DPIA` nem em `DOCUMENTOS.tratamento.colunas`):
  responder nao substitui pedido. A DPIA criada do tratamento herda tambem base legal e retencao (`necessity_proportionality`),
  destinatarios (fluxo), riscos do registro e as respostas "sim" do teste (`risks_identified`); DPIA e LIA guardam `origem_hash`, o hash
  do conteudo do tratamento quando nasceram. Nunca perguntar de novo: `GET .../impacto` traz por pergunta `curto` (o motivo em portugues
  da recomendacao) e `da_atividade` (`respostasDaAtividade`): sensivel, crianca e transferencia (coluna ou transferencia ligada) so propoem
  "sim" (o 0 tambem e o padrao de quem nao respondeu); legitimo interesse propoe "sim" pela base principal, adicional ou GDPR, e "nao" so
  quando ha base e nenhuma e legitimo interesse. `resposta` continua sendo so o gravado (importacao e RIPD leem assim) e a recomendacao so
  conta o gravado: a proposta vira resposta quando a pessoa salva. Na tela: etapa 2 da pagina da atividade (proposta marcada "Vindo da
  atividade: confira", uma recomendacao so, a do servidor, `frontend/src/recomendacao-ripd.js`) e "Novo RIPD" que escolhe a atividade e
  cria por `POST .../ropa/:rid/dpia`.
- **Riscos e acoes da atividade (F2, migration 0073)**: `risks.ropa_id` e `corrective_actions.ropa_id` (SET NULL ao apagar a atividade)
  e o risco residual (`residual_impact`, `residual_probability`, `residual_level` calculado no servidor). E o MESMO cadastro do n.iso:
  `src/services/riscos-atividade.ts` (com `riskLevel`, a faixa unica de nivel) serve as sub-rotas `/projects/:id/ropa/:rid/{riscos,acoes}`
  e o mapa `GET /projects/:id/ropa/riscos-mapa` (so riscos com atividade), todos na faixa `privacy` (`SUBROTAS_PRIVACY`); as rotas por id
  (`/risks/:id`, `/capa/:id`) e as listas `/risks` e `/capa` continuam `iso`. Toda consulta filtra `ropa_id` E `project_id`. Apagar o
  risco anula `risk_id` da acao antes (a acao sobrevive). O `PUT /risks/:id` parcial preserva e aceita `ropa_id` e residual. O agente cria
  e edita; aceitar risco (`status: Accepted`) a rota recusa ao agente (ato do cliente); concluir acao (`Closed`) e decisao (`niso_concluir_acao`) e o DELETE vai por `niso_executar` com confirmacao. Regra R1 do
  `coherence` ignora risco com `ropa_id`; o aviso de prazo de acao em projeto sem n.iso leva a `/ropa`. Telas: etapa 4 da pagina da
  atividade (aba Riscos, `frontend/src/atividade/aba-riscos.js`), "Mapa de
  risco" na secao Avaliar do n.privacy (`views/mapa-de-risco.js`, nivel por texto em cada celula, mesma faixa do `riskLevel`; ele e a matriz do n.iso, `grc.js`, usam
  `frontend/src/nivel-risco.js`; "Abrir a atividade" leva a pagina dela); o painel do encarregado conta riscos
  altos em aberto e acoes vencidas das atividades (`riscos` em `GET .../encarregado`).
- **Ciclo de vida e bases legais da atividade (F3, migration 0074)**: `tratamento_ciclo` (uma linha por etapa: coleta, uso,
  compartilhamento interno e externo, armazenamento, eliminacao; `registrada` ou `nao_aplicavel`; um `item_id` opcional, SET NULL; chave
  `(ropa_id, etapa)`; gatilhos `tratamento_ciclo_do_projeto_*` recusam tratamento ou item de outro projeto) em `src/services/ciclo.ts`, e
  `tratamento_bases` (bases ADICIONAIS do catalogo, so incisos do art. 7 e do art. 11 e, quando existirem, art. 6 e 9 do GDPR) mais
  `ropa_records.base_gdpr` (texto livre: o catalogo `gdpr` nao tem requisitos) em `src/services/bases.ts`. `base_legal_id` continua a
  PRINCIPAL, sem copia; adicional igual a ela e 400. Rotas `GET/PUT /projects/:id/ropa/:rid/{ciclo,bases}` (faixa `privacy`; o agente
  grava as duas). Tudo FORA do conteudo congelado: nao chamam `conferirPedidosDoDocumento`. Quem le: LIA exigida (`lerLigacoes`) e o
  painel do encarregado (sem base, LIA pendente) consideram principal, adicional e GDPR; a DPIA criada do tratamento herda o ciclo
  (fluxo) e as bases (necessidade); o relatorio do RoPA mostra os dois. Selo "mudou na origem": `origem_mudou` em `GET .../ligacoes`
  (LIA e DPIAs) e em `GET /projects/:id/dpia`, comparando `origem_hash` com o hash atual (`comOrigemMudou` em `src/services/lia.ts`); so
  aviso. Entrevista: origem e eliminacao gravam a descricao da coleta e da eliminacao; a pergunta `ciclo` (so com a atividade gravada,
  etapas do servidor: a atividade nova grava e segue direto para ela) e `bases_adicionais`/`base_gdpr` no bloco D; so o que mudou e regravado.
- **Pagina da atividade (n.privacy, onda 2 do diagnostico de 15/10, sem migration)**: `frontend/src/views/atividade.js`, tela
  `ropa-atividade` (`window.abrirAtividade(projectId, ropaId)`; e pagina e nao painel porque o app tem um modal so e dela se abrem o pedido
  de aprovacao, o RIPD e as ligacoes). Trilha de cinco etapas (Dados da atividade, Teste de impacto, RIPD ou LIA, Riscos e acoes,
  Aprovacao), cada uma com o estado escrito (`etapasDaAtividade`: feito, pendente, nao se aplica, mudou depois da aprovacao, aguardando
  decisao) e o proximo passo como a UNICA acao primaria da tela (`etapaDoProximoPasso`; os formularios reaproveitados recebem
  `primaria = false`). RIPD na etapa 3 quando exigido, recomendado pelo teste ou ja criado (o pedido do RIPD fica no detalhe dele); LIA
  quando a base e legitimo interesse. A linha do RoPA no n.privacy tem um botao so, "Abrir"; o Painel (acoes por prazo) e o mapa de risco
  tambem abrem a pagina. O modal de ligacoes (`openLigacoesTratamento`, "Editar ligacoes" na etapa 1) ficou so com base legal, sugestao
  da IA, sistemas, departamentos, partes, transferencias e diagrama. A entrevista nao pergunta mais volume, decisao automatica nem impacto
  de vazamento (so alimentavam uma segunda recomendacao de RIPD na tela) nem tem o bloco do teste: a atividade nova grava, segue para o
  ciclo de vida e termina na pagina. Teste: `frontend/test/atividade-view.test.js`.
- **Exportacao, Word e faixas de prazo (F4, sem migration)**: CSV que abre no Excel em pt-BR (`src/services/exportacao.ts`: BOM,
  `;`, CRLF, toda celula entre aspas, celula que comeca com `= + - @`, tab ou CR ganha `'`, teto de 5.000 linhas com `X-Exportacao-Truncada`)
  em `GET /projects/:id/export/{atividades,ripd}` (nucleo) e `export/{riscos-atividade,acoes-atividade,lia}` (faixa `privacy`; riscos
  aceitam `probabilidade`/`impacto`, a celula do mapa; acoes aceitam `faixa`). RIPD e LIA em Word (`src/services/documento-word.ts`, com os
  auxiliares de `documento-docx.ts`): `GET .../dpia/:id/docx` (nucleo) e `GET .../ropa/:rid/lia/docx` (privacy), lidos AO VIVO da empresa,
  do encarregado, da atividade, das bases, do ciclo, do teste de impacto e dos riscos; rascunho com "RASCUNHO" no cabecalho, que leva o logo da organizacao do projeto (`logoComoDataUri`, o mesmo da
  proposta; sem logo ou com falha, o nome); o RIPD leva a
  aprovacao derivada dos pedidos e o hash do conteudo (nao ha coluna de versao). Rotas em `src/routes/exportacao.ts`, em `FORA_DO_AGENTE`;
  trilha `exportacao.csv`/`exportacao.docx` so com tipo e contagem. O painel do encarregado ganhou `acoes_por_prazo` (vencidas, ate 30,
  31 a 90, 91 a 150, mais de 150 dias, sem prazo; `faixaDePrazo` em `src/services/riscos-atividade.ts`), clicavel na tela. Download no
  frontend: `baixarArquivo` de `frontend/src/api.js` (token no cabecalho). As `/export/*` do n.iso (`risks`, `vendors`, `training`, `audit-log`,
  `assets`, em `src/routes/integrations.ts`) tem a mesma trilha `exportacao.csv` (`csvComTrilha`), estao em `FORA_DO_AGENTE` e, desde a
  Frente 3C (21/10/2026), saem no mesmo formato pt-BR (`montarCsv`: BOM, `;`, CRLF, cabecalho em portugues, rotulos de `exportacao.ts`).
- **Terceiros tipificados (fatia 6, migration 0057)**: o terceiro e uma `partes` do tipo `organizacao` com `terceiro_tipo`
  (`grande_provedor|medio|pequeno|critico`) e `src/services/terceiros.ts` (rotas `/projects/:id/terceiros*`). **O tipo define o
  metodo** formal (`METODO_DO_TIPO`: trust_center, questionario, questionario, auditoria) e o SERVIDOR decide, nao o corpo. Quem RECEBE
  questionario de homologacao e desacoplado do metodo (`PODE_QUESTIONARIO`: medio, pequeno e **critico**; grande provedor fica fora); a
  avaliacao gerada pelo questionario grava metodo `questionario` mesmo no critico (cujo metodo formal e auditoria). `avaliacoes_terceiro`
  guarda o HISTORICO (resultado, `valido_ate` obrigatorio e futuro, link http(s) de evidencia) e a situacao e DERIVADA da mais recente
  (`situacaoDe`: pendente, vigente, vencida, reprovada). `documento_partes` liga documento a terceiro como DPA/contrato/outro (a spec pede
  `documentos.tipo = 'contrato'`; mudar esse CHECK reconstruiria `documentos` e quatro tabelas filhas). Efeitos do vencimento: fonte
  `avaliacao_terceiro` nos avisos de prazo (titulo com o numero de tratamentos que usam o terceiro) e
  `terceiros_com_avaliacao_vencida` em `GET .../ropa/:rid/ligacoes`. Sem pedido de aprovacao da avaliacao ainda (o CHECK da 0055 ja aceita).
  **Homologacao por questionario (F5, migration 0075):** `homologacao_perguntas` (o questionario do projeto; o modelo padrao generico
  e semeado na primeira leitura, `origem = 'padrao'` = "a validar pelo consultor"; pergunta nao se apaga, desativa) e `homologacoes`
  (um envio por terceiro de tipo medio/pequeno: so o SHA-256 do token, `expira_em`, perguntas CONGELADAS (`perguntas_json` e o objeto `{perguntas, fornecedor, cliente}`: nome do fornecedor e do cliente tambem congelam na criacao; o array antigo e aceito e le o nome ao vivo, `lerCongelado`), respostas imutaveis depois do
  envio pelo gatilho `homologacao_imutavel`). Servico `src/services/homologacao.ts`; rotas `/projects/:id/homologacoes*` (faixa privacy;
  escrever e so da equipe, `ehEquipeNess`; o agente consultor escreve pela ferramenta `niso_avaliar_fornecedor`, com confirmacao e motivo) e `POST /api/v1/public/homologacao/{ver,salvar,enviar}`
  (token no CORPO, 404 igual para inexistente/vencido/enviado/cancelado, limite por IP), pagina `frontend/public/homologacao.*`. Concluir
  (so `respondida`, ato humano) chama `registrarAvaliacao` e grava `avaliacoes_terceiro` com metodo `questionario`; a situacao e os avisos
  de prazo do terceiro seguem como estao. E-mail do link so com `RESEND_API_KEY`; o endereco nao e gravado. O envio do fornecedor avisa no
  sino os consultores designados (sem nenhum, os `consultoria_admin`; `avisarEnvio`, regra de `escolherDestinatarios`), so com o nome da
  parte, e os MESMOS recebem e-mail (`emailHomologacaoRespondida`: fornecedor, % respondido, link `/privacy?tela=terceiros`; nunca token nem
  resposta; so a quem o sino acabou de avisar, entao nao repete); falha do aviso ou do e-mail vai ao log e nao derruba o envio.
- **Criticidade do fornecedor (migration 0080, spec `docs/superpowers/specs/2026-10-18-criticidade-fornecedor-design.md`)**: cinco respostas (impacto, exclusividade, risco financeiro, conformidade, risco reputacional) gravadas em `criticidades_terceiro` (histórico append-only, a última é a atual). O NÍVEL é derivado no servidor (`nivelDaCriticidade` em `src/services/criticidade.ts`: qualquer Alto → Alto, senão qualquer Médio → Médio, senão Baixo) e o tipo segue o nível (`tipoDaCriticidade`: Alto → crítico, Médio → médio, Baixo → pequeno), salvo `grande_provedor`, que é escolha manual. Rotas `GET|POST /projects/:id/terceiros/:parteId/criticidades`, faixa `privacy` pelo segmento `terceiros`; o agente registra pela ferramenta `niso_avaliar_fornecedor` (`registrar_criticidade`), com confirmacao e motivo. Bloco na ficha do terceiro (`frontend/src/views/terceiros.js`). Contagens de 2026-10-18: `npx vitest` nos arquivos `test/criticidade-terceiro*.test.ts` (16 testes) e `frontend/test/criticidade-terceiro-view.test.js` (7 testes).
- **Documentos do legado (migration 0081, spec `docs/superpowers/specs/2026-10-19-paridade-legado-menu-design.md`, frente B)**: `documentos_arquivo` é um arquivo (PDF/DOC/DOCX até 10 MB, tipo conferido pelo conteúdo como nos anexos do gap) com nome, tipo, situação, vencimento ou "sem vencimento" e responsável; não é o documento versionado (políticas, `documentos`). Serviço `src/services/documentos-arquivo.ts`, rotas `/projects/:id/documentos-arquivo` (faixa `nucleo`; escrita fora do agente MCP), arquivo no R2 em `documentos-arquivo/<project_id>/<id>/<nome>`. O vencimento é a fonte `documento_arquivo` dos avisos de prazo. Tela `frontend/src/views/documentos-arquivo.js` (`#nav-documentos-arquivo`, só n.privacy, rótulo "Documentos"; no n.privacy os versionados aparecem como "Políticas"). `departamentos.descricao` (mesma migration) entra na tela Áreas. Contagens de 2026-10-19: `npx vitest run test/documentos-arquivo.test.ts` (8 testes) e `frontend/test/documentos-arquivo-view.test.js` (7 testes). **Como DPA e como cobertura (migration 0086, 27/10/2026):** o arquivo liga a fornecedor (`documentos_arquivo_partes`, papel `dpa`/`contrato`/`outro`, pela mesma rota `POST .../terceiros/:id/documentos` com `arquivo_id` no lugar de `documento_id`; desligar leva `?origem=arquivo`) e a requisito (`documentos_arquivo_requisitos`, `GET`/`PUT .../documentos-arquivo/:id/requisitos`). Só vale **publicado e com arquivo anexado** (`SQL_ARQUIVO_VALE`, `src/services/terceiros.ts`): `SQL_TEM_DPA`, o índice de confiança e a cobertura (`lacunasDaFonte`, origem `documento` com `arquivo: true`) usam a mesma regra; publicar, anexar, remover o arquivo ou apagar o documento refaz o índice do fornecedor. A mescla de partes move essas ligações; o agente MCP só lê (a rota recusa `arquivo_id` ao agente e `PUT .../documentos-arquivo/*` é `FORA_DO_AGENTE`). Teste: `test/documentos-arquivo-ligacoes.test.ts`.
- **RIPD com o questionário do legado (migration 0083, spec `docs/superpowers/specs/2026-10-26-ripd-questionario-design.md`)**: as respostas do questionário (abas Teste de Impacto, Conformidade e Armazenamento) ficam em `dpia_respostas` (PK `dpia_id`+`pergunta`, gatilho de projeto), **fora de `COLUNAS_DPIA` e do hash**: gravar resposta não derruba assinatura nem pedido (`test/ripd-questionario.test.ts` prova hash e situação intactos). Perguntas e abas em `src/data/ripd-perguntas.ts` (os textos do legado, `docs/superpowers/specs/2026-10-27-guia-legado-ripd-lia-perguntas.md`: 4 + 29 + 5 perguntas, todas em texto livre como no legado; nenhuma ficou marcada como parcial depois da confirmação do dono). A tela numera por aba e agrupa a Conformidade em "Perguntas 1 a 6", "7 a 16" e "17 a 29"; a pergunta das bases legais mostra, só leitura e nunca gravado, as bases LGPD da atividade, `base_legal` no GET); serviço `src/services/ripd-questionario.ts`; rotas `GET|PUT /projects/:id/dpia/:dpiaId/questionario` e `GET .../logs` em `src/routes/ripd-questionario.ts` (faixa `nucleo`). A sugestão `da_atividade` (operadores, local de armazenamento, volume mensal, dados sensíveis) é só leitura e nunca é gravada. Os eventos do RIPD gravam `audit_logs.entity_type = 'dpia'` (`logAudit`, 8º parâmetro) e a aba Logs lê só eles, sem texto livre nem motivo. O RIPD é uma página com abas (`frontend/src/views/ripd-ficha.js`, `?tela=ripd-ficha&dpia=&aba=`, `limparFichaDoEndereco`), não mais um modal; a aba Dados edita também `technical_measures`, `residual_risk_level`, `dpo_recommendations` e `data_category_risk` e avisa antes de salvar campo do hash num RIPD aprovado.
- **LIA com as 23 perguntas do legado (migration 0084, spec `docs/superpowers/specs/2026-10-26-lia-12-perguntas-design.md`)**: as respostas (abas Finalidade, Necessidade e Proporcionalidade) ficam em `lia_respostas` (PK `ropa_id`+`pergunta`, gatilho de projeto); as colunas de `lia_assessments` continuam e são a aba Conclusão, e a regra de concluir não mudou (as 23 respostas não bloqueiam a conclusão). Perguntas em `src/data/lia-perguntas.ts` (7 de Finalidade, 5 de Necessidade e 11 de Proporcionalidade, texto exato do guia do legado, `docs/superpowers/specs/2026-10-27-guia-legado-ripd-lia-perguntas.md`; todas em texto livre), serviço `src/services/lia-questionario.ts`, rotas `GET|PUT /projects/:id/ropa/:rid/lia/questionario` e `GET .../lia/logs` (faixa `privacy`). Eventos da LIA gravam `audit_logs.entity_type = 'lia'`. Tela `frontend/src/views/lia-ficha.js` (`?tela=lia-ficha&ropa=&aba=`). O Word e o CSV de importação da LIA trazem as 23 respostas (colunas opcionais no modelo `lia`).
- **Titular, incidente e consentimento (fatia 7, migration 0058, SO registro interno)**: `titular_pedidos` (protocolo `PT-AAAA-NNNN` por projeto),
  `incidentes` (`IN-AAAA-NNNN`; encerrar exige risco avaliado e, se `relevante`, a comunicacao a ANPD registrada: CHECK do banco, vale para SQL
  direto) e `consentimentos` (prova ligada ao tratamento; revogar nao apaga). **Nenhum prazo legal mora no codigo nem na migration:**
  `parametros_legais` (global) guarda cada prazo com FONTE e REVISAO, editavel so pelo `platform_admin` com trilha; sem o valor o prazo e
  nulo ("nao calculado") e nada quebra. O prazo e CONGELADO no registro na criacao (`somarPrazo`: horas, dias corridos ou dias uteis, sem
  feriado). Avisos de prazo ganharam as fontes `titular_pedido` e `incidente` (um item por comunicacao pendente). Rotas:
  `/api/v1/parametros-legais`, `/projects/:id/{titular-pedidos,incidentes,consentimentos}`; o agente registra e avalia; encerrar incidente (`niso_encerrar_incidente`) e revogar consentimento (`niso_registrar_revogacao`) sao decisoes com confirmacao e motivo; responder, negar, arquivar e prazo do pedido do titular sao do cliente. **Portal publico do titular: ATIVO** (migration 0096, spec `docs/superpowers/specs/2026-11-03-portal-solicitacoes-titular-design.md`, revê a decisão de 09/10 só para o portal): link por projeto (`titular_portais`, só o SHA-256 do token; gerar/desativar em `/projects/:id/titular-portal`, equipe e `org_admin`), recepção pública `POST /api/v1/public/titular-pedidos/abrir` (token no corpo, limite por IP e por projeto, cria pedido `canal='formulario'`, devolve o protocolo; sem CPF no intake), página `/solicitacao` (`frontend/public/solicitacao.*`) e tratativas do atendimento (`titular_pedido_tratativas`, `/titular-pedidos/:id/tratativas`). O **conector externo segue fora**; o agente não opera o portal.
  **Quem grava (o cliente age, 15/10):** equipe e o `org_admin` do PROPRIO projeto registram e respondem o pedido do titular (status e
  resposta, inclusive a partir do rascunho de IA) e registram, avaliam e comunicam o incidente; `org_user` e `client` so leem (o allow-list
  de so leitura de `src/middleware/auth.ts`, sem entrada para estas rotas). **Encerrar incidente e so da equipe da consultoria, no
  SERVIDOR** (`ehEquipeNess` em `POST .../incidentes/:id/encerrar`; `org_admin`, `org_user` e `client` recebem 403; o agente MCP so encerra pela ferramenta `niso_encerrar_incidente` (a porta o trata como equipe naquela rota); o CHECK da 0058 segue valendo). Registrar/revogar consentimento e editar prazo legal continuam, na tela, so com
  a equipe (`podeEditar` em `frontend/src/views/titular.js`; o servidor nao tem corte de papel nessas rotas alem do allow-list e, no prazo
  legal, do `platform_admin`). Contrato em `test/cliente-titular-incidente.test.ts`.
- **Visoes, evidencia com validade e casca (fatia 8, migration 0059)**: `evidence.valido_ate` (opcional) e `evidencia_requisitos` ligam a
  evidencia a requisito (`/projects/:id/evidence/:eid/{requisitos,validade}`, no router de requisitos, SEM tocar `evidence.ts`; a `validade` e faixa `nucleo`
  desde a Frente 3C, entao o n.iso a define na lista de Evidencias; `requisitos` segue `privacy`). A rotina
  diaria de avisos chama `vencerEvidencias` ANTES de avisar: evidencia vencida volta a `pending` (a assinatura gravada NAO e apagada, ela
  atesta o conteudo), uma linha de trilha por evidencia, idempotente; fonte `evidencia` nos avisos. A cobertura da LGPD (`lacunasDaFonte`) conta
  evidencia `conforming` em dia (cobre) ou `partial` (parcial). `GET /projects/:id/encarregado` (`src/services/encarregado.ts`) e SO consulta:
  pedidos do titular, incidentes, tratamentos sem base/DPIA/LIA, terceiros, documentos, evidencias, LGPD e prazos legais nao cadastrados, com a
  lista "o que fazer" priorizada; funciona com tudo vazio. Menu do n.privacy (alternativa A do estudo `docs/design/diagnostico-2026-10-14/menu-privacy.md`;
  `organizarMenuPrivacy` e `SECOES_PRIVACY` em `frontend/src/produto.js`, rotulos so do modulo em `ROTULOS_PRIVACY`): Painel no topo, cinco secoes FIXAS
  (titulo que nao e botao e nao recolhe, itens em `ul`/`li`): Mapear (Tratamentos (RoPA), Importar programa), Cadastros (Pessoas, Areas e Sistemas, cada um a sua tela: `partes`, `areas` e `sistemas`;
  Fornecedores, Titulares e dados pessoais), Avaliar (RIPD, LIA, Riscos, Gaps, Cobertura da LGPD), Responder (Pedidos do titular, Incidentes, Consentimentos, os tres abrem a tela titular na aba) e Provar
  (Documentos, Evidencias, Treinamento, Papeis e comite), e o Assistente no fim. Minhas aprovacoes e Trilha de logs ficam no menu de conta
  (`#account-menu`) so no n.privacy (`FORA_DO_MENU_PRIVACY`). **Telas do legado (19/10/2026, sem migration):** Fornecedores (`views/terceiros.js`)
  e a lista dos terceiros com nivel de criticidade, DPA e atividades (vinculo ao tratamento e etapa Compartilhamento Externo, sem
  duplicar) e a ficha em pagina propria (`?tela=terceiro&parte=&aba=`) com sete abas; a aba Seguranca edita o perfil de `vendors`
  (o mesmo do n.iso; o PUT mantem `notes` e `status` ausentes no corpo). Titulares e dados pessoais (`views/catalogos.js`) gere os
  catalogos do RoPA. Gaps (`views/gaps.js`, `GET .../ropa/gaps`) e LIA (`views/lia.js`, `GET .../ropa/lias`, inclui a atividade de
  legitimo interesse sem LIA) listam o projeto inteiro; Riscos tem a vista Mapa | Lista (`?vista=lista`). Fornecedores segue a rotina de TPRM: `pendencias` em `GET .../terceiros` (tipo, criticidade, avaliacao, DPA) e a fila `avaliacoes-terceiros`. A Referencia juridica (`referencia-juridica`, em Mais) le `GET /requisitos?fonte=` e `GET /requisitos/gdpr-bases`; a validacao em lote (`POST /requisitos/mapeamentos/validar`) e do platform_admin e grava o e-mail da sessao. Os "Abrir" levam a atividade
  na aba certa (`abrirAtividade(projectId, ropaId, aba)`). Selos de `frontend/src/selos-menu.js`: numero = total a tratar, contorno ambar =
  pendente, fundo vermelho = atraso; o Painel tem selo so com atraso. Areas esta nos dois menus (no n.iso e o cadastro de departamentos; Partes so remete a ela). O n.iso e o n.360 mantem estrutura de menu e acordeao
  (`frontend/test/casca-menu.test.js` fixa a estrutura), mas as telas do n.iso NAO estao mais congeladas (decisao de 20/10/2026, abaixo); a barra dos tres e acessivel: grupo fechado fora do Tab (`visibility`), recolhida com o
  texto so visualmente escondido e a dica `#sidebar-dica` ao passar e ao focar. A casca de cada modulo e a entrada do n.360 estao no paragrafo de produtos
  abaixo (Frontend, n.360).
- **n.iso e n.privacy sao MODULOS do n.360 sobre o mesmo cadastro (decisao de 09/10/2026, migration 0060; casca n.360 em 11/10).**
  Um Worker, um banco, um deploy; um dominio (`n360.ness.com.br`, em `routes` do `wrangler.jsonc`; `niso` e `nprivacy` ficam como
  redirecionamento, ver URL canonica). O cliente pode ter um, o outro ou os dois. (Comentarios antigos no codigo ainda dizem
  "produtos separados"; e o mesmo modelo.) **A trava e do servidor:** `src/modulos.ts` poe cada rota de projeto numa FAIXA (`FAIXA_DO_SEGMENTO` e
  `SUBROTAS_PRIVACY`): `nucleo` (o cadastro compartilhado: partes, itens, documentos, evidencia, RoPA, DPIA, pedidos, governanca),
  `iso` (controles, SoA, riscos, auditorias, jornada…) ou `privacy` (requisitos por projeto, terceiros, titular, incidentes,
  consentimentos, encarregado, ligacoes/LIA/importacao do RoPA). O `projectAccessMiddleware` e o `requireResourceAccess` (pela
  `FAIXA_DA_TABELA`) devolvem 403 se o projeto nao tem o produto, inclusive para o `platform_admin`. Projeto sem nenhum modulo e
  inexistente (passa, e a rota da o 404 dela). **Rota nova de projeto precisa de faixa:** `test/modulos-produto.test.ts` reprova.
  **Acesso por PESSOA (n.360, fatia 3, migration 0066; spec `docs/superpowers/specs/2026-10-12-n360-modulos-por-pessoa-design.md`):** rota de
  faixa `iso`/`privacy` so passa se o projeto tem o modulo **E** a pessoa tem (`usuario_modulos`; 403 "Voce nao tem acesso ao n.X");
  faixa `nucleo` nao exige modulo da pessoa. `modulosDaPessoa` (`src/modulos.ts`): `platform_admin` tem todos sem linha, chave de API
  vale os modulos do projeto da chave, agente MCP os do consultor que concedeu; a consulta e por requisicao (a mudanca vale na hora).
  `GET /auth/me` devolve `modulos`; o frontend cruza com os do projeto (`modulosVisiveis`, `produto.js`). Quem concede e quem ja gere a
  conta, com teto (cliente: modulos do projeto dele; equipe: contrato da organizacao; `platform_admin`, qualquer um):
  `PUT /users/:id/modulos`, trilha `usuario.modulos` com antes e depois; `POST /users` aceita `modulos`. O gatilho
  `usuario_modulos_padrao` da a conta nova o padrao (cliente: modulos do projeto; equipe: contrato). Habilitar um modulo num projeto
  concede aos clientes dele na hora; a equipe da consultoria recebe pela tela Usuarios. Tirar modulo do contrato da organizacao
  (`PUT /platform/orgs/:id/modulos`, tela Consultorias) nao tira de pessoas nem de projetos, so limita o que se concede depois. **Papeis
  normalizados:** a 0066 gravou `admin`→`platform_admin`, `consultant`→`consultor`, `client_admin`→`client`, `user`/`employee`→`org_user`
  (o mapa de `src/middleware/auth.ts` continua para sessoes antigas); confira com `SELECT role, count(*) FROM users GROUP BY role`.
  O gatilho `projeto_modulos_do_contrato` (0060) da ao projeto novo o que a organizacao contratou (`modulos_contratados`, padrao
  `["iso"]`); `POST /projects` aceita `modulos` dentro do contrato e projeto sem `iso` nasce sem a trilha de fases. Os projetos que
  ja existiam ficaram so com `iso`: o n.privacy e habilitado por projeto (`PUT /projects/:id/modulos/privacy`, cartao Produtos na
  lista de projetos), depois de a organizacao contratar. Ligar o `privacy` (de desligado a ligado) roda `importarPartes`,
  `conciliarResponsaveis` e `importarDocumentos` no projeto, cada uma em try/catch (falha vira `avisos` na resposta, o modulo fica
  ligado; `test/modulos-ligar-privacy.test.ts`). Desligar nao apaga dado. **Frontend (n.360, 11/10/2026):** o n.360 e a plataforma-mae e os dois produtos sao modulos dele; o CAMINHO decide a casca
  (`frontend/src/produto.js`, `produtoAtual`): `/` e o inicio do n.360 (o painel de entrada, `views/painel.js`: uma linha por modulo
  habilitado, "Abrir" vai a `/iso` ou `/privacy`), `/iso*` a casca do n.iso, `/privacy*` a do n.privacy (o n.privacy abre em Encarregado). O servidor
  entrega o mesmo `login.html` para qualquer um (catch-all). Quem tem um modulo so entra direto nele; equipe da ness. sem projeto
  vai ao n.iso; cliente sem projeto com modulo ve "sem acesso". O cliente com projeto entra no Painel do n.iso (`dashboard`, visao de
  cliente: "Esperando a sua decisao", e a direita a fase em curso da jornada, `jornada` do `GET .../painel`, so na visao dele), nao mais
  na Jornada, que segue no menu (`project-detail`). Nos modulos a casca aplica marca, titulo e menu (`SO_ISO`,
  `SO_PRIVACY`) e filtra os projetos pelo produto. `destinoLegado` (async) leva quem abre `niso`/`nprivacy` ao modulo no `app_url` que o `/health` da mesma origem devolve; se
  ele for o proprio host, ou o `/health` falhar, fica onde esta. O item Inicio do menu so aparece no n.360; nos modulos a volta e
  o link "n.360" do rodape. Login unico (a sessao e por origem: na troca, todos entram de novo uma vez).
  **Conta e acessos (n.360, fatia 2):** Projetos (com o cartao Produtos), Usuarios, Consultorias (o tenant; view `organizacoes`), Chaves de API e Conectar agente
  ficam no grupo "Conta e acessos" (`group-conta` em `login.html`), que so o n.360 mostra (`SO_N360`); o papel continua decidindo
  cada item (`updateHeaderUser`), e o grupo sem item do papel some. Nos modulos o rodape traz "Conta e acessos (n.360)", que leva a
  `/?tela=<primeira tela da conta que o papel ve>`. O boot do n.360 le o `?tela=` uma vez (`telaPedida`): so valores de
  `TELAS_DA_CONTA`, so se o item estiver visivel para o papel, e o parametro sai do endereco (`history.replaceState`); a tela pedida
  vence o "um modulo so, entra nele". "Seguranca do projeto" (SSO, SCIM e politica; so a equipe) fica em "Conta e acessos",
  so no n.360 (`NAV_DO_HUB` em `frontend/src/produto.js`).
  E2E em `frontend/e2e/n360.spec.js`; `frontend/e2e/shell.js` entrega `dist/login.html` em `/iso` e `/privacy` (o servidor do
  Playwright nao faz fallback de SPA). Testes de backend que usam rota do
  n.privacy chamam `habilitarPrivacy(...)` de `test/helpers/d1.ts`.
  **DPO e encarregado (Frente 4):** a governanca e o cadastro de partes ficam em sincronia nos dois sentidos (`atualizarEncarregado`, `sincronizarDpoDaParte` em `src/services/encarregado-pessoa.ts`; a parte nunca muda linha de consultor e, se o e-mail antigo sai da matriz, a conta de stakeholder dele e revogada como no POST da governanca); `GET /projects/:id/governance/encarregados-fora` lista o encarregado que ainda nao esta no comite (botao "Adicionar ao comite" no Monitor).
  **Integracao (0061-0063):** fornecedor e terceiro sao a mesma parte (`vendors.parte_id`; `vendors` e o perfil de seguranca da parte,
  nao um cadastro paralelo, e e opcional: a lista do n.iso mostra todo fornecedor e "Remover avaliacao de seguranca" apaga so o perfil); o DPO da governanca e o encarregado (vinculo `encarregado` em `parte_vinculos`, 0062); incidente vive no
  nucleo e gera CAPA (`corrective_actions.incidente_id`, 0063). O catalogo LGPD/ANPD (`src/data/lgpd.ts`, `src/data/anpd.ts`) traz um
  mapeamento proposto para a ISO (`src/data/mapeamento-privacidade-iso.ts`) que so conta como cobertura depois de validado por
  humano. O painel `GET /projects/:id/ponto-de-partida` (`src/routes/ponto-de-partida.ts`) mostra o que cada produto ja aproveita do outro.
- **Importacao de programa de privacidade (n.privacy, fatia 1, migration 0064; spec em `docs/superpowers/specs/2026-10-11-importacao-privacy-design.md`).**
  Rotas em `src/routes/importacao.ts`, montadas em `/api/v1/projects/:projectId/importacoes` na faixa `privacy` (`src/modulos.ts`); so a
  equipe da consultoria (`ehEquipeNess`), cliente recebe 403. Tabelas `importacoes` (lote), `importacao_arquivos` e `importacao_itens`
  (a proposta, um item por linha; `entidade` `tratamento`, `terceiro` desde a fatia 2 (migration 0067), `documento`, `dpia` e `lia` desde a fatia 3, `titular_pedido`, `incidente` e `consentimento` desde a fatia 4). Arquivo no R2 `STORAGE`, chave `importacoes/<project_id>/<lote>/<arquivo>`. Regras em
  `src/services/importacao.ts`; o `ImportacaoAgent` (`src/agents/importacao.ts`) classifica o arquivo e extrai, conforme o tipo
  (`inventario` → tratamentos, `terceiros` → terceiros, `documento` → um documento por arquivo, tirado so do primeiro bloco, `avaliacao` →
  DPIA ou LIA item a item pelo campo `tipo` da resposta, `historico` → pedido do titular, incidente ou consentimento pelo campo `registro`;
  `desconhecido` fica `aguardando`), pelo
  `BaseAgent.runModel`, tratando o texto do arquivo como dado e nunca como instrucao, e cada item e validado por esquema estrito no servidor.
  **Processamento em passos, um por chamada** (`processar` devolve `restantes` e a tela repete): o primeiro converte, classifica e
  guarda o texto em `<r2_key>.txt`; cada seguinte extrai um bloco de ~4.000 caracteres (`BLOCO`, cortado so em quebra de linha;
  `bloco_atual`/`blocos_total`/`blocos_falhos` em `importacao_arquivos`). Resposta que nao le (JSON truncado) divide o bloco ao meio,
  ate 2 niveis; bloco que nao le nem assim fica anotado e os outros seguem. Teto de 200.000 caracteres (`MAX_TEXTO`). O status do lote
  e acertado num `finally`; se o Worker morrer no meio, o lote preso em `processando` e retomado pela confirmacao depois de 10 minutos
  (`updated_at` renovado a cada chamada), a mesma regra da trava de gravacao.
  **Revisao humana obrigatoria:** nada vira RoPA sem a pessoa aceitar o item na tela e confirmar. `confirmar` grava no maximo 30 itens por
  chamada (`ITENS_POR_CONFIRMACAO`, a tela repete ate `restantes` zerar), um item por transacao, e o lote fica em status `gravando` (trava
  por UPDATE condicional; processar, enviar, editar item e cancelar recebem 409; trava de gravacao interrompida e retomada apos 10 minutos).
  **Terceiro (fatia 2):** `gravarTerceiro` casa a parte organizacao por nome normalizado (a existente e reaproveitada; duplicata nasce
  `descartado` e, aceita, nao cria outra parte), liga aos tratamentos ja cadastrados por finalidade normalizada (papel `operador`) na mesma
  transacao que marca o item `gravado`, e depois chama `definirTipo`, `registrarAvaliacao` (so com validade no futuro, sem repetir a mesma) e
  `ligarDocumento` (DPA pelo titulo) de `src/services/terceiros.ts`; o que falhar nesses passos vira `aviso` no resultado, sem desfazer a parte.
  Tipo de parte ja tipificada nao e trocado pelo arquivo. `duplicata_de`/`registro_id` apontam para o registro da entidade (sem FK).
  **Documento e avaliacao (fatia 3, migration 0068):** `gravarDocumento` cria pelo `criarDocumento` de `src/services/documentos.ts` um
  documento em RASCUNHO (nunca publicado) com o texto convertido (`<r2_key>.txt`) como versao 1; titulo normalizado igual ao de um documento
  do projeto recusa. Depois copia o arquivo original para `evidence/<projeto>/` e grava a evidencia com `evidence.documento_id` (a 0068);
  `lerDocumento` devolve `evidencias`. `gravarAvaliacao` casa o tratamento por finalidade normalizada (sem ele, `recusado`): DPIA pelo
  `criarDpiaDoTratamento` de `src/services/lia.ts` (`Draft`; riscos e a conclusao (marcada como do arquivo) em
  `risks_identified`; parecer do DPO fica vazio), LIA pelo `salvarLia` em rascunho (conclusao e riscos no `balanceamento`; concluir e de uma pessoa); DPIA/LIA ja existente
  no tratamento recusa. Ordem da confirmacao: tratamentos, depois documentos, depois o resto (DPIA/LIA acham o tratamento e o terceiro acha o
  DPA gravados na mesma confirmacao). Falha depois da criacao (evidencia, riscos da DPIA) vira `aviso` mais log estruturado, sem desfazer o registro;
  falha da marca `gravado` vira `recusado` com o id criado.
  **Historico operacional (fatia 4, sem migration):** dado pessoal minimo. Antes de qualquer texto ir ao modelo, `mascararPii` troca
  e-mail, CPF e telefone: na classificacao por `[dado pessoal]`, na extracao do historico pelo pseudonimo `tit-<16 hex>` de
  `pseudonimizador` (HMAC-SHA256 com a `TOKEN_ENC_KEY`, separado por projeto; sem a chave o arquivo fica `erro` e nada vai ao modelo).
  Os esquemas (`pedidoPropostoSchema`, `incidentePropostoSchema`, `consentimentoPropostoSchema`) nao tem campo de nome, CPF, e-mail ou
  telefone; `titular_ref` so aceita o pseudonimo (o que o modelo devolver fora do formato e pseudonimizado no servidor), e o trecho de
  `origem` nao e guardado. Nome, endereco e afins nao sao detectaveis por regex: o prompt proibe devolve-los, o esquema estrito recusa
  campo a mais e uma pessoa revisa. Gravacao pelas funcoes "importar historico" dos servicos (`importarPedido` em
  `src/services/titular-pedidos.ts`, `importarIncidente` em `incidentes.ts`, `importarConsentimento` em `consentimentos.ts`): datas e status
  do registro de origem (final inclusive), protocolo do sistema gerado como na criacao (ano da data de origem), protocolo de origem na
  primeira linha da descricao (`Protocolo original: ...`, e por ela que a duplicata e achada). **Avisos de prazo:** registro encerrado
  entra sem prazo (nao se recalcula); registro aberto recebe o prazo do parametro contado da data de origem, mesmo vencido (a tela e o
  painel do encarregado o mostram atrasado, e o resultado traz `aviso`). Carencia em `src/services/avisos-prazo.ts` (`itensDoDia`): pedido
  do titular e comunicacao de incidente cujo prazo e anterior ao dia de `created_at` nao geram atraso na semana ISO da criacao; da semana
  seguinte em diante o atraso semanal volta, como para qualquer registro. D-7 e D0 so saem no proprio dia, entao nunca sao retroativos.
  Vale igual para pedido e incidente criados a mao com data antiga (prazo que ja nasce vencido).
  O pseudonimo usa uma subchave (`HMAC(TOKEN_ENC_KEY, "n.iso/importacao/titular_ref/v1")`), nao a chave de cifra direto. Consentimento exige o tratamento do RoPA de mesma finalidade normalizada (o gravado na mesma confirmacao vale;
  sem ele, `recusado`). Duplicata: pedido pelo protocolo de origem; incidente pelo protocolo de origem ou titulo e dia da ciencia;
  consentimento pelo pseudonimo, finalidade e data.
  **Legado (F6, migration 0076; plano `docs/superpowers/plans/2026-10-15-f6-importacao-legado.md`):** entidades `risco`, `gap`, `impacto`,
  `ciclo` e `bases` (CHECK ampliado por rebuild de `importacao_itens`, mais a coluna `aviso`, que guarda o aviso da gravacao). Gravacao por
  `GRAVAR_DA_ATIVIDADE` com os servicos da F1 a F3 (`criarRisco`, `criarAcao`, `salvarImpacto`, `salvarCiclo`, `salvarBases`); atividade pela
  finalidade normalizada (sem ela, `recusado`); responsavel (pessoa), ativo e sistema por nome, sem criar nada (aviso). **A importacao nunca
  sobrescreve:** impacto so as perguntas sem resposta (nao finaliza), ciclo so a etapa sem linha, bases so acrescentam, GDPR so se vazia; aceite
  de risco nao entra (status `aceito` vira aberto, com aviso); prazo do risco vira acao ligada. Duplicata: risco por (atividade, ameaca), acao
  por (atividade, titulo), ciclo por (atividade, etapa), impacto pela atividade com teste respondido. Texto livre de risco e acao passa por
  `mascararPii` (`semPii`). Ordem da confirmacao: tratamentos, documentos, riscos, acoes, impacto/ciclo/bases, depois o resto. Nenhum tipo de
  arquivo novo (`importacao_arquivos.tipo` tem CHECK): riscos, acoes, impacto e ciclo vem de arquivo `avaliacao`, item a item pelo `tipo`.
  RIPD e LIA aceitam as secoes do legado (`avaliacaoPropostaSchema`). **Modelos de CSV sem IA** (`src/services/importacao-modelos.ts`,
  `MODELOS`; exemplos ficticios em `docs/modelos-importacao/`, conferidos por `test/importacao-legado.test.ts`): CSV cujo cabecalho e
  exatamente o de um modelo vira itens `pendente` de confianca alta sem chamar a IA (`origem` so "registro N do modelo X"); o modelo de pedidos
  nao tem coluna de titular. **Reconciliacao**: `GET .../importacoes/:id/reconciliacao` (e `/csv`), so contagens e motivos genericos
  (`motivoGenerico`); `sem_pendencia` e o criterio da virada. Roteiro por cliente: `docs/runbook-migracao-legado.md`.
  O agente MCP opera a importacao so pela ferramenta `niso_importar_programa` (confirmacao e motivo; a porta o trata como equipe naquela rota); a revisao item a item continua sendo do consultor, que diz o "sim" na conversa. **Nao existe rota de exclusao de projeto**: se um dia existir, ela precisa limpar o
  prefixo `importacoes/<project_id>/` do R2, que o cascade do D1 nao alcanca. Teste de extracao real fica fora do CI:
  `node scripts/importacao-amostra.mjs` gera CSV e HTML ficticios e diz como subir pela tela num ambiente com a IA real.
- **Área comercial desligável (decisão do dono de 15/10/2026).** A var `COMERCIAL_ATIVO` (`wrangler.jsonc`, hoje `"false"`;
  ausente também desliga; `comercialAtivo` em `src/helpers.ts`) esconde na interface leads, levantamentos, propostas, catálogo,
  configuração comercial e preços, e faz as rotas deles (`/leads`, `/funil`, `/proposals`, `/servicos`, `/propostas`,
  `/assessments`, `/pricing-config`, `/client/{proposal,assessment}`, `/public/propostas`) responderem 404 a pessoa e chave de
  API (`src/index.ts`). Nada é apagado; `"true"` religa tudo como era (a suíte roda ligada, `wrangler.test.jsonc`; o desligado
  em `test/comercial-desligado.test.ts`). `/api/v1/org` fica: com a área desligada, nome, CNPJ, cor e logo (que vão nos
  documentos Word do projeto) estão em Conta e acessos, "Identidade da consultoria" (`identidade-org`, a tela de
  `config-comercial.js` só com identidade), para `platform_admin` e `consultoria_admin`. O projeto nasce pelo "Novo projeto" da
  tela Projetos (`POST /projects`), que para o n.iso semeia fases e controles com as mesmas funções do aceite da proposta
  (`stmtsFases`, `stmtControles`, `catalogosDoProjeto` em `src/services/project-setup.ts`); o prefixo de proposta é opcional na
  criação da organização. O agente MCP NÃO passa pelo interruptor: lê e rascunha a área comercial da organização de quem
  concedeu, se essa pessoa é do comercial (`COMERCIAL_DO_AGENTE` em `src/middleware/agente.ts`, as `niso_comercial_*`;
  matriz em `docs/agente/seguranca.md`).
- **Bindings** (`grep '"binding"' wrangler.jsonc`): DB (D1), SESSIONS e OAUTH_KV (KV),
  STORAGE e TRILHA (R2), AI, ANALYTICS (Analytics Engine), CF_VERSION_METADATA, ASSETS.
- **Rotinas agendadas** (`grep -A2 '"triggers"' wrangler.jsonc`): `10 4 * * *` roda a manutencao
  (`src/manutencao.ts`, purga, retencao e semeadura idempotente do catalogo de requisitos) e `0 11 * * *` (08:00 em Brasilia) os avisos de prazo
  (`src/services/avisos-prazo.ts`: sino em D-7 e D0, aviso agregado por pessoa e projeto no atraso, so a quem tem o modulo da fonte (`FAIXA_DA_FONTE`),
  e-mail-resumo; idempotencia em `avisos_prazo`); `*/15 * * * *` a sonda interna (`src/services/sonda.ts`:
  D1, KV e R2; um e-mail para `ALERTA_EMAIL` na queda e um na volta, estado nos dois KV); `15 */6 * * *` o SLO de producao
  (`src/services/slo.ts`: 5xx e p95 de 24h no Analytics Engine, tetos iguais aos de `scripts/slo.mjs`, um e-mail por transicao e tambem quando nao consegue medir;
  exige o secret `CF_ANALYTICS_TOKEN`, so leitura de Analytics; ultima medicao no KV `slo:ultimo`). O
  `scheduled` de `src/index.ts` despacha por `event.cron`; cron desconhecido cai na manutencao.
- **MCP**: `mcp-server-niso/` expoe o produto a clientes MCP com filtro de
  ferramenta por papel. Ver `mcp-server-niso/README.md`.
- **Skills do consultor**: `agent-skills/<nome>/` (SKILL.md + references + scripts) e a fonte; o
  Worker nao le disco (oito em 2026-10-27, `ls agent-skills | wc -l`: `prontidao-certificacao`, `maturidade-lgpd`,
  `atendimento-titular`, `implantacao-privacy`, `migracao-programa`, `avaliacao-terceiros`, `cadastro-cliente` e `correcao-e-ajustes`), entao `npm run skills:gerar` escreve `src/mcp/skills-gerado.ts` (commitado; o
  `test/agente-skills.test.ts` falha se ficar velho). O agente as le pelo MCP com `niso_skill`,
  atras do login. Skill nova = pasta nova + gerar + roteiro em `src/mcp/contexto.ts`.
- **Trilha de implementacao do n.iso (faixa `iso`; spec `docs/superpowers/specs/2026-10-15-bancada-trilha-design.md`, codinome interno "Bancada").**
  Tela de tres colunas (trilha, cartao do passo, assistente) em `frontend/src/views/bancada.js` e `frontend/src/bancada/*`; e a unica
  tela de jornada: o select manual de situacao da fase e o campo livre de anotacao sairam. **O passo e o modelo:** 132 passos, um por item de
  `PHASE_CHECKLISTS`, em `src/data/passos/etapa-1.ts` a `etapa-6.ts` (6 etapas, 41 fases; contagem:
  `grep -c "^    id: 'p" src/data/passos/etapa-*.ts`, soma 132), com tipos e validacao em `tipos.ts`/`catalogo.ts` e o contrato em
  `contracts/bancada/*.json`. Cada passo tem `campos` (texto, escolha, data...), `prova` (descricao e se e obrigatoria),
  `ondeVive` e `concluidoQuando`. O catalogo sai de `GET /api/v1/passos/catalogo` (versionado: o frontend refaz a busca quando
  `catalogo_versao` muda). Rotas, em `src/routes/passos.ts`: `GET /projects/:id/bancada` (retrato: estado de cada passo e de cada fase),
  `GET /projects/:id/passos/:itemId`, `PUT .../campos` (autosave no servidor, com `vistos` para o aviso de edicao concorrente),
  `POST .../{concluir,reabrir,bloquear,desbloquear}`, `DELETE .../anotacao-anterior` e `DELETE /projects/:id/bancada/fases/:n/situacao-antiga`;
  os servicos puros ficam em `src/services/passos/` (`estado`, `avaliar`, `detalhe`, `fase`, `contexto`, `valores`, `legado`).
  **O estado e derivado, o servidor avalia:** o "Concluido quando" (`avaliar.ts`; tipos `campos_preenchidos`, `evidencia_anexada`,
  `registro_vinculado`, `pedido_de_aprovacao`, `entrevistas_concluidas`, `responsavel_e_prazo`) e conferido no servidor em
  `concluir` (409 com os criterios que faltam), nunca pelo frontend; a situacao da fase (`situacaoDaFase`, `project_phases.status`
  e so cache gravado por `gravarSituacoes`) sai dos passos: algum bloqueado = `blocked`, todos concluidos = `completed`, algum mexido =
  `in_progress`. **Excecao e bloqueio:** concluir sem cumprir os criterios so com excecao (motivo obrigatorio, so equipe da consultoria,
  trilha `passo.concluido_com_excecao`); bloquear exige motivo e responsavel, nao vale em passo concluido, e concluir passo bloqueado
  da 409; bloquear e desbloquear sao de quem administra o projeto. Concluir, reabrir, bloquear e desbloquear sao decisoes: o agente as toma pela ferramenta `niso_decidir_passo`, com confirmacao e motivo.
  **Migration 0078** (aditiva): `checklist_progress` ganha `bloqueio_motivo`, `bloqueio_responsavel`, `bloqueado_em`, `excecao_motivo`,
  `excecao_por`, `excecao_em`; `project_phase_answers.updated_by`; `project_phases.legado_status` congela a situacao manual
  antiga ate a trilha assumir a fase. Conferir: `PRAGMA table_info(checklist_progress)`.
  **Assistente (IA, `src/routes/passos-copiloto.ts`, `src/services/copiloto-passo.ts`, `frontend/src/bancada/copiloto.js`):** tres modos,
  `rascunhar-campo`, `da-conversa` (o que o cliente disse vira propostas por campo) e `revisao` (pontos que o auditor questionaria, nunca
  parecer de certificacao). So PROPOE: nenhuma rota grava resposta ou progresso, a pessoa aceita na tela e o autosave grava. Campo com
  `semIA: true` (decisao e nome de pessoa) nunca e enviado nem proposto. E pedido pela equipe da consultoria ou pelo administrador do cliente;
  o agente MCP e recusado (`FORA_DO_AGENTE`: ele ja e a IA).
- **Documentacao do agente**: `docs/agente/` (uso, arquitetura com diagramas, seguranca e o
  checklist de PR). Leia `docs/agente/seguranca.md` antes de criar rota nova: o principal do
  agente carrega o `users.id` real do consultor, e rota de "minha conta" entra em
  `FORA_DO_AGENTE`.
- **MCP remoto** (consultor ou auditor, papel gravado em `agente_concessoes.papel` pela migration 0070 e relido a cada
  chamada; matriz em `docs/agente/seguranca.md`): agente com alcance de consultor preso a um projeto (`src/mcp/servidor.ts`); `/mcp` em `src/mcp/`; login OAuth em `/oauth/*`
  (`src/routes/oauth-autorizacao.ts`); principal agente em
  `src/middleware/agente.ts`; gestao das concessoes em `src/routes/agentes.ts`;
  tabela `agente_concessoes`; KV `OAUTH_KV`. Regra: **so `ROTAS_OAUTH` passam
  pelo `OAuthProvider`** (`src/index.ts`) — o resto continua no Hono. KV
  `OAUTH_KV` (id `fc8dfff4…`) criado em 2026-09-29 e declarado no `wrangler.jsonc`. Recurso fixo em
  `niso.ness.com.br` (`RECURSO_MCP`, nao segue o `APP_URL`). Clientes: Claude Code verificado em producao (30/09/2026); Cursor,
  Codex e Antigravity seguem "A confirmar" na tela Conectar agente (ver CHANGELOG).
  **O agente decide como o consultor (spec `docs/superpowers/specs/2026-10-23-agente-decide-como-consultor-design.md`).** O catalogo das decisoes
  (10 ferramentas, 35 acoes; `grep -cE "^\s+\{ ferramenta: 'niso_" src/middleware/decisoes-agente.ts` conta as entradas de `DECISOES`, 2026-10-25: 35) e `src/middleware/decisoes-agente.ts`; `src/mcp/servidor.ts` gera as ferramentas dele (`DECISAO_FERRAMENTAS`) so para o papel consultor. A porta e
  `resolverAgente` (`src/middleware/agente.ts`): a rota de decisao exige os cabecalhos `X-Agente-Ferramenta`, `X-Agente-Confirmado: 1` (so o booleano `true` em
  `confirmado_pelo_usuario`) e `X-Agente-Motivo` (1 a 500 caracteres); valendo, o principal ganha `agente_decisao` e `ehEquipeNess` o aceita naquela rota e so nela.
  A trilha `agente.decisao` e gravada ANTES da rota rodar: registra a tentativa confirmada mesmo que a rota falhe. O texto de documento, de importacao ou de campo livre
  e dado, nunca autoriza decisao. **Atos do CLIENTE seguem recusados ao agente, com ou sem ferramenta**: assinatura (`/approve`), `/pedidos` (aprovar, recusar, lote),
  `revoke-approval(s)`, aceite de risco (`status: Accepted`), `PUT /titular-pedidos` (responder, negar, arquivar, prazo), `/data-subject/erase` e `/policy-acknowledgments`.
  **O agente so LE a governanca** (`GET`; POST, PUT, PATCH e DELETE de `/projects/:id/governance*` estao em `FORA_DO_AGENTE`: a linha da governanca da acesso, assinatura e abre o portal de politicas). `niso_ler` e `niso_executar` recusam `/api/v1/public`, `/api/v1/auth` e `/api/v1/assessments/public` (`caminhoSeguro`, `src/mcp/servidor.ts`): o agente nao responde como fornecedor nem toca login. **Login OAuth pendente** (`/oauth/authorize/entrar` grava a marca do `password_hash`, `/oauth/authorize/confirmar` a confere) e recusado se a senha mudou, a conta foi desativada ou tem troca de senha obrigatoria (400 "Pedido expirado").

## Decisoes de produto ja tomadas — nao reabrir

- **Sem i18n.** O produto e PT-BR. Comentario, mensagem de erro e texto de UI em
  portugues. A camada de traducao foi removida por decisao explicita.
- **Sem alternancia de tema.** Um tema so, o escuro da marca.
- **Sem framework no frontend.** Vanilla e decisao, nao divida.
- **Responsividade fora de escopo** ate segunda ordem.
- **Equalizacao n.iso x n.privacy (20/10/2026, `docs/equalizacao-modulos-2026-10-20.md`).** A mesma entidade segue a mesma regra e
  aparece do mesmo jeito nos dois modulos: (1) RIPD aprovado PERDE a aprovacao quando o conteudo muda, como atividade e documento;
  (2) aceite de risco e um modelo so, `status = Accepted` carimbado no servidor (quem e quando), nos dois modulos; (3) o DPA do
  fornecedor tem fonte unica, o documento ligado em `documento_partes` (papel `dpa`), e `vendors.dpa_signed` passa a ser derivado
  dele; (4) as telas do n.iso deixam de ser congeladas: listas, rotulos e vocabulario de status sao os mesmos dos dois modulos.
- **Decisoes de 20/10/2026 (Frente 2B da equalizacao n.iso x n.privacy; spec `docs/superpowers/specs/2026-10-20-frente2-regras-unicas-design.md`).**
  (1) RIPD: uma assinatura (DPO ou Direcao) aprova (`assinaturaDpia`); mudar coluna de conteudo (`COLUNAS_DPIA`) num RIPD assinado zera as
  assinaturas, volta a `Draft` e grava `dpia.aprovacao_invalidada` (`PUT /dpia/:id`, `src/routes/platform.ts`). (2) Aceite de risco e um
  modelo so: `status = Accepted`, com `accepted_by`/`accepted_at` carimbados pela sessao na transicao (`carimboDeAceite` em
  `src/services/riscos-atividade.ts`, usado por `/risks` e pelas sub-rotas da atividade); o corpo nunca define quem nem quando; mudar
  impacto, probabilidade ou residual de risco aceito o devolve a `Open` sem o aceite (`aceiteCaiu`, trilha `risk.aceite_invalidado`); sair de `Accepted` por `status` tambem limpa `accepted_by`, `accepted_at` e `aceite_manual` e grava `risk.aceite_invalidado`; botao
  "Aceitar risco" nos dois modulos (`frontend/src/aceite-risco.js`); a migration 0082 levou o aceite digitado antigo a `Accepted` com
  `risks.aceite_manual = 1` ("Aceite registrado a mao"). (3) DPA: a fonte e o documento ligado ao fornecedor (`documento_partes`, papel
  `dpa`; `SQL_TEM_DPA` em `src/services/terceiros.ts`); o indice de confianca, a lista, a ficha e o CSV leem dali; `vendors.dpa_signed`/
  `dpa_url` ficam so como historico ("DPA declarado, sem documento", sem os 10 pontos); ligar e desligar documento do terceiro
  (`/terceiros/:parteId/documentos*`) e faixa `nucleo` (`SUBROTAS_NUCLEO` em `src/modulos.ts`) e recalcula o indice.

## Restricoes Tecnicas

- O catch-all estatico (`c.env.ASSETS.fetch`) DEVE ser a ultima rota em
  `src/index.ts`.
- `authMiddleware` roda antes das rotas `/api/v1/*`; `projectAccessMiddleware`
  logo apos, em `/api/v1/projects/:projectId/*`. Rotas realmente publicas (auth,
  public) sao montadas antes do `authMiddleware`.
- Chave de API autoriza escrita pelo campo `permissions` (`write`/`admin`), nao
  pelo allow-list — este existe para papeis **humanos** read-only. Ver o
  comentario em `auth.ts` antes de mexer.
- `SETUP_KEY` e segredo (`wrangler secret put SETUP_KEY`); sem ele `/auth/setup`
  fica desabilitado (falha fechada). Nunca commitar segredo em `wrangler.jsonc`.
- Segredos e tokens usam CSPRNG (`genToken`/`genNumericCode`), nunca
  `Math.random`.
- **Vetorizacao (Vectorize/RAG) removida em 2026-10-06**: o indice de producao
  tinha 1 vetor e nenhum indice de metadados (toda consulta filtrada por
  `project_id` voltava vazia), a tela "Knowledge Base" chamava rotas que nao
  existiam, chat/agentes/MCP nao usavam vetor, e vetores nunca eram apagados na
  exclusao de projeto nem no pedido do titular. Busca futura comeca por texto no
  D1, nao por embedding. A tabela `project_knowledge` ficou orfa (ver CHANGELOG).
- Schema muda em **dois** lugares: `schema.sql` e uma migration. Em `schema.sql`,
  indice **depois** da tabela — `CREATE INDEX` antes do `CREATE TABLE` derruba a
  criacao de banco novo e so aparece em banco novo.
- Antes de migration em producao: `npm run db:backup` (ver `backups/README.md`).
- Frontend: sem modulos ES em runtime, tudo no escopo `window`. Estado global `S`.

## Divida conhecida — nao finja que nao existe

Ao mexer nestas areas, voce esta em terreno que ja falhou antes:

- **495 `any` em `src/`** (medido em 2026-10-25, fora `*.test.ts`:
  `git grep -ahoE ': any\b|as any\b|<any>' -- 'src/*.ts' ':!*.test.ts' | wc -l`).
  `tsc --noEmit` limpo diz pouco. Tipar o que voce tocar e melhoria barata; nao
  precisa de permissao (o `-a` importa: `fechar-venda.ts` tem byte NUL e o
  `git grep` sem ele conta menos). `test/any-catraca.test.ts` reprova se o numero subir — e
  tambem se descer sem baixar o `TETO` la.
- **Nenhum dos 328 arquivos de teste do backend mocka o D1 inteiro** (2026-10-18;
  `ls test/*.test.ts | wc -l`). Todos os que tocam banco usam o D1 real do
  `cloudflare:test`. Sobram dubles PONTUAIS de proposito: falha injetada
  (`helpers.test.ts`, `evidencia-upload-controle.test.ts`), linha legada que o schema atual
  nao aceita (`api.test.ts`) e Proxy sobre o D1 real para simular erro ou corrida
  (`erro-sem-vazamento`, `pedidos-corrida`, `revisao-final-decididos`, `avisos-prazo`, `politica-escritores`,
  `modulos-ligar-privacy`, entre outros; em 2026-10-14 o comando abaixo casa 18 linhas em 12 arquivos, todas
  dubles pontuais ou parametro com nome `DB`). Medicao:
  `git grep -nE "prepare\s*[:(]\s*(vi\.fn|\(|async)|\bDB\s*:" -- test` e conferir
  cada ocorrencia. Teste mockado nao pega deriva de schema — foi exatamente
  assim que o codebase acumulou consulta a tabela inexistente. Caminho novo de
  banco: teste de integracao real, no estilo de `test/schema-contract.test.ts`.
- **Frontend com pouco teste por linha.** ~20,7 mil linhas de JS (2026-10-18)
  (`cat frontend/src/*.js frontend/src/views/*.js | wc -l`), 142 arquivos de teste em jsdom
  (`ls frontend/test/*.test.js | wc -l`) e 8 specs E2E em Chromium (`ls frontend/e2e/*.spec.js`),
  que rodam no CI. `test/e2e/mfa.py` e legado, fora do CI. As 38 telas de `frontend/src/views/` (2026-10-18) sao
  importadas por ao menos um teste (2026-10-15: `for f in frontend/src/views/*.js; do grep -rlq "views/$(basename $f .js)" frontend/test frontend/e2e || echo $f; done`
  nao imprime nada), mas as grandes (`compliance.js`, `monitor.js`, `grc.js`, `project.js`, todas acima de 1.400 linhas)
  tem teste so de fatias.
- **6 leituras de corpo cruas em 4 arquivos** (2026-10-12: `git grep -n "c\.req\.json" -- 'src/routes/*.ts'`
  da 7 linhas em 5 arquivos; a de `policies.ts` passa o corpo por `safeParse` e nao conta): `control-adequacao`,
  `controls` (le so para recusar `maturity`, depois `validateBody`), `phase-questionnaire` e
  `scim` (3, formato SCIM). Elas validam campo a campo no handler; o `bodyGuard` global cobre
  teto de tamanho e poluicao de prototipo. O T3 (#259) fechou as demais.
- ~~**324 handlers `onclick=` inline**~~ **RESOLVIDO.** A migracao para delegacao
  de eventos terminou (PRs #121–#134) e `'unsafe-inline'` saiu de `script-src`
  em `src/index.ts`. Sobra 1 ocorrencia de `onclick=` no frontend. NAO
  reintroduzir handler inline nem `<script>` inline: quebram sob o CSP atual e
  reabrem o buraco.
- **Direitos do titular nao cobrem PII em texto livre.** A busca e por igualdade
  em colunas conhecidas (`FONTES_PII` em `src/services/data-subject.ts`).
- **`npm audit` esta em zero nos tres pacotes** (2026-10-25: `npm audit` na raiz, em `frontend` e em `mcp-server-niso`). Presos
  por `overrides`: na raiz `undici`, `body-parser`, `fast-uri`, `zod`, `vite`, `ip-address`, `sharp` e os pacotes MCP (puxados pelo
  `agents` e pelo pool de testes); no `frontend`, `undici` (puxado pelo `jsdom`). O npm 10 desta maquina quebra no `npm install` com
  `overrides` (`Cannot read properties of null (reading 'edgesOut')`): regenere o lock com `npx -y npm@11 install`. O job `audit` do
  CI segue informativo (`continue-on-error`). Rode `npm audit` antes de repetir qualquer afirmacao sobre ele.

## Segundo fator (MFA) — e como destravar alguem

O MFA e opcional e nasce desligado (`totp_enabled = 0`). Ativar e acao do
proprio usuario, pelo cartao de perfil no rodape da barra lateral — nao pela
pagina de Configuracoes, que e escondida para papeis de cliente.

Quem perde o autenticador cai numa sessao `mfa_pending`, que so alcanca
`/auth/mfa/verify` e `/status`. Sem os codigos de recuperacao, o unico caminho
e o banco:

```
npx wrangler d1 execute niso-db --remote --command \
  "UPDATE users SET totp_enabled=0, totp_secret=NULL, totp_recovery_hashes=NULL, \
   totp_last_window=NULL WHERE email='alguem@exemplo.com';"
```

Acesso ao D1 sempre vence o segundo fator — em qualquer sistema. E por isso que
esse acesso e o que precisa ser protegido, nao o MFA.

Ao mexer nas rotas de MFA, lembre: **401 ali e resposta esperada a erro do
usuario**, nao sessao expirada. `frontend/src/api.js` isenta
`/api/v1/auth/mfa/*` do logout automatico justamente por isso — sem a isencao,
errar um digito destruia a sessao.

## Regras da ness.

- Marca: ness. (sempre minusculo, com ponto).
- Layout: Enterprise Grade, header de 64px (`--hdr-h` em `frontend/src/style.css`), sem blur.
- **Fonte única dos tokens: `frontend/src/style.css` (`:root`).** Não repita
  valores aqui — a cópia anterior (#070b14, "proibido peso 600") envelheceu e
  a landing antiga seguiu a cópia, não o app. Hoje: `--bg #0b1326`,
  `--surface #162244`, `--accent #00ade8`, `--text #f1f5f9`.
- Tipografia: Inter no corpo; Montserrat 500 na marca, 600 em títulos; JetBrains Mono para hash e código (carregada no
  `login.html`). Escala em tokens `--fs-xs` (11px, o piso) a `--fs-2xl`; nada abaixo de 11px, nada de peso 300 ou 700.
- Uma lingua na tela: valor do banco por `rotuloDe` (`frontend/src/rotulos.js`, a tabela unica de status dos dois modulos: acao Aberto / Em andamento / Concluido, risco Aberto / Mitigado / Aceito / Concluido; o CSV usa os mesmos rotulos em `src/services/exportacao.ts`, conferidos por `frontend/test/rotulos-csv.test.js`; nada de mapa local de status), data por `formatarData` (`ui.js`,
  dd/mm/aaaa), titulo da tela = rotulo do menu (`tituloDaTela`). Modal so por `openModal` (Fechar, foco preso, pergunta
  antes de descartar), selo so por `renderStatusBadge`, vazio so por `renderEmptyState`. Detalhe em `design.md`.
- Lista so por `montarLista` (`frontend/src/lista.js`, Frente 3A): a lista inteira vem do servidor e a tela busca (sem acento), filtra,
  conta ("N de M"), mostra 25 por vez ("Carregar mais") e exporta pela rota CSV do servidor (`baixarArquivo`, erro avisado); o filtro
  do Painel (`filtroPainel`) e o predicado extra (`filtrarPor`, a celula da matriz de riscos) passam por ela. As listas do n.iso e do
  n.privacy usam o componente; Consentimentos ainda nao (botoes de situacao com contagem). Nao recrie busca ou filtro a mao na tela.
- Produtos: `n.360` (a plataforma), `n.iso` e `n.privacy` (os modulos), com o ponto em accent, como a marca `ness.`.
- Proibido: italicos, emojis/icones (excecao: a seta funcional das etapas da ficha, `at-chevron`, que mostra aberto/fechado), accent como background de area.
- Uma acao principal por tela (um `.btn-primary` visivel); acima de tres secundarias, `renderMaisAcoes` (`frontend/src/ui.js`); nenhum primario por linha de tabela; destrutivo so no fim do menu. O projeto ativo mora so no seletor da barra lateral. Detalhe em `design.md`.
- Geometria: o sistema e quadrado (`--radius: 0`). Desde a onda 3 (15/10/2026) nao sobra raio em px no CSS nem
  inline (`git grep -nE "border-radius:\s*[1-9][0-9.]*(px|rem)" -- frontend/src` nao imprime nada); so os circulos de
  50%. Inline so `0` (`frontend/test/catracas-visuais.test.js`); novo nasce quadrado.
- Estilo inline so para valor calculado; o resto usa as classes do fim de `frontend/src/style.css` (componentes e
  utilitarios sobre tokens). A catraca trava o teto de `style=` por arquivo: 1.002 no frontend em 2026-10-15
  (`git grep -o "style=" -- 'frontend/src/*.js' 'frontend/src/views/*.js' | wc -l`), eram 1.740; nas quatro telas
  grandes, 249 (eram 973).
- Login: tela dividida — marca à esquerda, cartão à direita; empilha abaixo
  de 900px.

## Documentos que valem a leitura

- `docs/README.md` — indice da documentacao; `docs/arquivo/` guarda o que ja foi executado
- `docs/plano-2026-10-fechamento.md` — foto de 08/10 do plano de outubro, com as pendencias do dono (H2, F2, F4, F5, T5)
- `docs/superpowers/specs/` — o desenho vigente de cada funcionalidade grande (n.360, modulos por pessoa, importacao,
  integracao, nucleo do n.privacy); plano executado vai para `docs/arquivo/planos/`
- `docs/design/diagnostico-2026-10-12/` — diagnostico de design do n.360, do n.iso e do n.privacy
- `CONTRIBUTING.md` — verificacao antes do PR, regras de schema e de teste
- `SECURITY.md` — invariantes de seguranca que nao podem regredir
- `backups/README.md` — runbook de backup e restauracao
- `docs/runbook-migracao-legado.md` — virada de um cliente do sistema anterior para o n.360 (modelos de CSV, reconciliacao, desligamento)
- `docs/runbook-publicacao.md` — publicacao pelo Actions, plano B local (`scripts/publicar.sh`),
  orcamento de minutos e checklist do repositorio privado
- `migrations/README.md` — estado real das migrations em producao e como
  reconciliar quando a `d1_migrations` divergir do banco
- `test/e2e/README.md` — o E2E legado de MFA (o E2E principal e `frontend/e2e/`)
- `CONSTITUTION.md`, `design.md` — principios e identidade visual

## Specs e planos

Mudanca de arquitetura ou de comportamento comeca por spec (`docs/superpowers/specs/`, pela skill
`brainstorming`) e plano (`docs/superpowers/plans/`, pela `writing-plans`); plano executado vai para
`docs/arquivo/planos/`. O Spec Kit do inicio (`.specify/`, `.gemini/commands/`) saiu em 2026-10-12: nada o
usava. Constituicao: `CONSTITUTION.md`. Design: `design.md`.

## Skills instaladas

`.agents/skills/`, simlinkadas em `.claude/skills/` (a excecao e o `ponytail`, pasta real em
`.claude/skills/ponytail/`, fora de `.agents/skills/` e do `skills-lock.json`). O texto completo vive em
cada skill — nao duplicar as regras aqui, senao as duas copias divergem (foi o
que aconteceu com a copia inline do ponytail).

| Skill | Quando atua |
|---|---|
| `using-superpowers` | Abertura de qualquer conversa. Injetada automaticamente pelo hook de SessionStart: consultar skill antes de responder ou agir. |
| `ponytail` | Toda tarefa de codigo. Escada YAGNI, menor diff que funciona, reusar antes de escrever. Nunca simplifica: entendimento do problema, validacao em trust boundary, tratamento de erro, seguranca, acessibilidade. |
| `brainstorming` | Antes de construir feature ou mudar comportamento: extrair intencao e requisito antes de codigo |
| `writing-plans` | Virar spec em plano de implementacao executavel |
| `executing-plans` | Executar plano escrito em sessao separada, com checkpoint de revisao |
| `subagent-driven-development` | Executar plano com tarefas independentes na sessao atual |
| `dispatching-parallel-agents` | 2+ tarefas independentes, sem estado compartilhado |
| `using-git-worktrees` | Isolar workspace antes de executar plano |
| `test-driven-development` | RED-GREEN-REFACTOR durante implementacao |
| `systematic-debugging` | Bug, teste falhando ou comportamento inesperado — antes de propor correcao |
| `verification-before-completion` | Antes de dizer "pronto"/"passou": rodar o comando e conferir a saida |
| `requesting-code-review` | Entre tarefas; achado critico bloqueia |
| `receiving-code-review` | Ao receber feedback de review: verificar tecnicamente antes de implementar |
| `code-review` | Review de diff contra padrao do repo e contra a spec |
| `finishing-a-development-branch` | Fechamento de branch |
| `writing-skills` | Criar ou editar skill |
| `security-threat-model` | Modelagem de ameaca de uma area do codigo, sob pedido explicito |
| `security-audit` | Caca a vulnerabilidade exploravel |
| `webapp-testing` | Teste de UI via navegador |
| `iso27001` / `iso27701` | Referencia normativa: Annex A, clausulas, SoA, DPIA, ROPA |
| `find-skills` | Descobrir e instalar skill nova |

### Superpowers

As 14 skills de processo acima (de `using-superpowers` a `writing-skills`) sao o
[Superpowers](https://github.com/obra/superpowers) (MIT, `LICENSE.txt` em cada
pasta), vendorizado em vez de instalado como plugin — assim a versao fica travada
em `skills-lock.json` e vale para todo mundo que clona o repo, sem cada um instalar
marketplace na mao.

O bootstrap e `.claude/hooks/superpowers-session-start.sh`, registrado como
SessionStart em `.claude/settings.json`: ele injeta o texto de `using-superpowers`
no inicio da sessao. Sem esse hook as skills ficam no disco e o agente nao sabe que
precisa consultar uma antes de agir — que e o ponto do Superpowers.

Atualizar: `npx skills update` (reescreve `skills-lock.json`). O CLI copia para
`.claude/skills/`; devolva ao padrao do repo movendo a pasta para `.agents/skills/`
e refazendo o symlink.

**Telemetria:** o companion visual do `brainstorming` carrega um logo do site do
autor, o que revela versao e uso. `.claude/settings.json` define
`SUPERPOWERS_DISABLE_TELEMETRY=1` — nao remova. Os scripts em
`brainstorming/scripts/` sobem servidor HTTP **local** (localhost, com token) e so
rodam sob pedido explicito.

**Aviso sobre `iso27001` / `iso27701`:** sao material de terceiro (Socket e Snyk
limpos, so markdown, sem script). Os scanners verificam malware, **nao** a
exatidao do texto normativo. Nao emita documento de conformidade para cliente com
base so nessas skills sem conferir contra a norma publicada.

## Portões de revisão — o que existe e o que não existe

O repositório está **público** (`gh api repos/resper1965/n.360 --jq .visibility`, 2026-10-14) e
**vai ficar privado** (decisão do dono). O código já está pronto para isso desde 2026-10-13; a parte
de configuração do GitHub é do dono e está no checklist de
[`docs/runbook-publicacao.md`](docs/runbook-publicacao.md) (seção 5). Em privado, minuto de Actions é
cobrado, code scanning exige GitHub Advanced Security e ruleset exige plano pago.

- **CodeQL** (`.github/workflows/codeql.yml`) roda enquanto o repositório for público; em privado o
  job se pula sozinho (`if: github.event.repository.private == false`) em vez de falhar no upload,
  como em 2026-08. No lugar dele: `npm audit` no CI (informativo), Dependabot e secret scanning.
  Última execução: `gh api "repos/resper1965/n.360/actions/workflows/codeql.yml/runs?per_page=1"`.
- **Codex** revisa o diff, atrelado à assinatura e não à visibilidade do repo.
- **A suíte roda uma vez, no PR.** O `ci.yml` dispara só em `pull_request` (com cancelamento da
  execução superada); o push na `main` não roda CI. `test/workflows-economia.test.ts` reprova a
  volta do `push`, de `paths`/`paths-ignore` e do `schedule` no `uptime.yml`.
- **Vigilância de produção** (`docs/runbook-incidente.md`, seção 1): monitor externo gratuito (ação
  do dono), sonda interna do Worker a cada 15 min (`src/services/sonda.ts`, e-mail para
  `ALERTA_EMAIL`) e `slo.yml` a cada 6 h. O `uptime.yml` ficou só manual.

### Protecao da `main` e deploy — ja configurados

**Desde 16/10/2026 o portao de PR e LOCAL**: `bash scripts/ci/ship.sh <PR>` atualiza o PR com a main, roda `scripts/ci/gate.sh` (tipos,
build e testes do frontend, build do MCP, testes do backend e E2E, uma suite por vez, `--retry=1`), grava o status `gate/local` no commit,
mergeia e espera o `/health` com o SHA. O ruleset exige PR, branch em dia e esse status; os builds de branch da Cloudflare ficam desligados
e so a `main` builda e publica (`publicar.sh`). Detalhe em `docs/runbook-publicacao.md`, secao 0. O que segue descreve o arranjo de
15/10/2026.

**Desde 15/10/2026 o repositorio e privado e o portao de PR e o deploy rodam no Workers Builds da Cloudflare**, nao no
GitHub Actions (o dono nao paga minutos do Actions; os workflows estao desabilitados, nao apagados). Build command
`bash scripts/ci/build.sh` (na `main` chama `scripts/ci/publicar.sh`: tsc, build, recusa migration pendente; nas outras
branches chama `scripts/ci/verificar.sh`: a suite inteira e o E2E), deploy command
`npx wrangler deploy --var VERSAO_SHA:$WORKERS_CI_COMMIT_SHA`, preview command que nao publica nada. O ruleset exige o
check run do Workers Builds. Migration: backup e `wrangler d1 migrations apply` pelo terminal ANTES do merge. Passo a
passo e configuracao do painel em `docs/runbook-publicacao.md`, secao 0. O texto abaixo descreve o fluxo pelo Actions.

- **Ruleset "main protegida"**: exige PR, exige os checks **`test` e `e2e`**
  (`gh api repos/resper1965/n.360/rulesets/20312002`), exige branch atualizado com a base,
  bloqueia delecao e force-push. `bypass_actors` vazio — em rulesets, admin do repo **nao**
  tem bypass automatico.
- Nao exija check que pode deixar de existir (o `CodeQL`, se o repo ficar privado): um check
  obrigatorio inexistente trava todo merge para sempre.
- **Deploy e automatico** desde 2026-08-03: merge na `main` dispara
  `.github/workflows/deploy.yml`, que roda `npm ci`, `tsc --noEmit`, o build do
  frontend, **recusa se houver migration pendente**, e so entao publica. A suite
  NAO roda no deploy do merge (ja passou no PR, sobre a mesma arvore); roda no
  disparo manual (`workflow_dispatch`), o caminho de hotfix. Sem Actions, o plano B
  e `scripts/publicar.sh` (`docs/runbook-publicacao.md`). O secret `CLOUDFLARE_API_TOKEN` e **environment secret** de
  `production`, nao repository secret — assim so jobs que declaram
  `environment: production` o enxergam (conferido em 2026-10-14:
  `gh api repos/resper1965/n.360/environments/production/secrets` lista o token e
  `gh api repos/resper1965/n.360/actions/secrets` volta vazio).
- **O ambiente `production` aceita deploy só da `main`** (2026-10-08,
  `gh api repos/resper1965/n.360/environments/production/deployment-branch-policies`): uma branch
  qualquer não consegue rodar job com o token de deploy. Consequência para migration: o workflow
  `db-migrate.yml` só roda na `main`, onde a migration nova ainda não existe antes do merge. Ordem
  possível: (a) aplicar pelo terminal (`npx wrangler d1 migrations apply niso-db --remote`, depois do
  `npm run db:backup`) e só então mergear; ou (b) mergear (o deploy recusa, de propósito, e abre
  issue), rodar *Apply DB migrations* e depois *Deploy*.
- **Actions presas por SHA** (`test/workflows-actions-sha.test.ts` reprova action solta); o
  Dependabot `github-actions` abre o PR de atualização com o SHA novo.
- `wrangler secret put` grava no **Worker**, nao no Actions. Sao lugares
  diferentes; o Worker nao precisa do token de deploy e nao deve carrega-lo.
