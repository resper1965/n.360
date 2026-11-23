# Segurança do agente consultor

Este documento é para quem vai **mexer em rota, ferramenta ou autorização** e
precisa saber o que não pode quebrar. Ele responde três perguntas: contra quem o
agente é desenhado, quais invariantes seguram o desenho, e o que checar antes de
um PR que toque a superfície do agente.

Visão geral e uso: [`README.md`](README.md). Peças e fluxos:
[`arquitetura.md`](arquitetura.md).

---

## Matriz de papéis do agente

O agente remoto tem dois papéis, escolhidos no consentimento OAuth e gravados na concessão
(`agente_concessoes.papel`, migration 0070). O papel vale **pelo banco**, relido a cada chamada.

| | Consultor | Auditor |
|---|---|---|
| Quem conecta | `consultor` designado, `consultoria_admin` da organização | Os mesmos. `platform_admin` e `comercial` não conectam em nenhum papel |
| Leitura | Tudo o que o consultor alcança no projeto (menos `FORA_DO_AGENTE`) | Só GET/HEAD numa **allow-list**: `/projects/<projeto da concessão>` e abaixo, `/portfolio`, `/audits/:id/findings`, `/evidence/:id/{content,detail,download}` (menos `FORA_DO_AGENTE`). Rota fora da lista é 403, inclusive rota nova |
| Escrita | Adequação; destrutivo com confirmação (I5); decisão do consultor com ferramenta, confirmação e motivo (I5) | **Só** `POST /audits/:id/findings` e `POST /projects/<projeto>/auditor-notes`. Qualquer outro método/rota: 403 |
| Decisão confirmada | Publicar documento, concluir passo, avaliar fornecedor, situação da atividade, concluir ação, encerrar incidente, revogar consentimento, importar programa, padronizar nomes: só pela ferramenta de decisão, com `confirmado_pelo_usuario: true` e motivo (`src/middleware/decisoes-agente.ts`). Atos do cliente seguem recusados (abaixo) | Nenhuma |
| Achado e nota de auditor | Recusados (I6) | Permitidos |
| Trilha | `agente de <email> (<cliente> / <projeto>)` | `agente auditor de <email> (<cliente> / <projeto>)` |
| Área comercial | Só se quem concedeu é do comercial (`ehComercial`, relido a cada chamada; na prática o `consultoria_admin`), e só a organização dele: lê e rascunha (quadro abaixo). Vale com o interruptor `COMERCIAL_ATIVO` desligado | Nenhuma |
| Ferramentas (`tools/list`) | 50: leitura (n.iso e n.privacy), `niso_ler`, `niso_executar`, escrita do consultor (inclusive as 8 `niso_privacy_*` de rascunho) e as 10 ferramentas de decisão; 55 com as 5 `niso_comercial_*`, se quem concedeu é do comercial | 22: leitura (inclusive as 8 `niso_privacy_*` de leitura), `niso_ler`, `niso_create_audit_finding`, `niso_create_auditor_note`, `niso_contexto`, `niso_skill` |

O filtro de ferramentas é conveniência. Quem impõe o papel é o servidor: `foraDoAuditor` em
`src/middleware/agente.ts` (allow-list) e, como segunda camada, `apiKeyRoleViolation('auditor' | 'consultant')`.

### Área comercial do agente (decisão do dono de 15/10/2026)

O agente **lê e rascunha**; o que tem efeito com o cliente ou com o preço é de uma pessoa, pela interface. A área é da
organização (não tem `project_id`), então a fronteira é outra: a organização de quem concedeu. Allow-list em
`COMERCIAL_DO_AGENTE` (`src/middleware/agente.ts`): nessas rotas, e só nelas, o principal leva o papel e a `org_id` reais de
quem concedeu, para `somenteComercial` e `exigirOrg` cortarem como cortam para a pessoa. Fora delas o agente segue `client`
preso ao projeto. Agente de quem não é do comercial cai em `FORA_DO_AGENTE`, como antes.

| Pode | Rota | Fica com a pessoa |
|---|---|---|
| Listar e ler leads, funil, levantamentos (respostas e blocos), propostas (com a prévia) e serviços | `GET /leads`, `/leads/:id`, `/funil`, `/assessments`, `/assessments/:id{,/answers,/block/:n}`, `/propostas`, `/propostas/:id{,/previa}`, `/servicos`, `/servicos/:id` | Preço de levantamento (`/assessments/:id/pricing`), documento e Word da proposta, consulta e enriquecimento de CNPJ |
| Criar lead e mudar o status dele | `POST /leads`, `PUT /leads/:id/status` | Marcar ganho (`Won`, a rota recusa ao agente), apagar lead |
| Criar proposta (nasce rascunho) e editar a que está em rascunho | `POST /propostas`, `PUT /propostas/:id` (a rota recusa ao agente o que não é `rascunho`) | Gerar, enviar, link, aceite manual, aprovar desconto, revisão, aceite e recusa do cliente (fechar venda) |
| — | — | Configuração comercial e preço (`/org`, `/pricing-config`, `/proposals/config/pricing`), catálogo (escrita em `/servicos`), o fluxo antigo `/proposals` |

Ferramentas: `niso_comercial_listar`, `niso_comercial_ler`, `niso_comercial_criar_lead`, `niso_comercial_status_lead` e
`niso_comercial_rascunhar_proposta` (`src/mcp/servidor.ts`), só no `tools/list` do agente consultor de quem é do comercial,
com esquema estrito. A trilha leva `agente de <email> (<cliente> / <projeto>)`: o projeto é o da conexão, não o da proposta.
Teste: `test/agente-comercial.test.ts`.

**Separação de funções (I13).** A mesma conta não tem, no mesmo projeto, concessão ativa de consultor **e** de
auditor. O consentimento recusa o segundo papel (409, "revogue o outro acesso"); se os dois coexistirem por
corrida, `concessaoValida` recusa os dois (falha fechada). A regra é sobre concessões de agente: a sessão humana
do consultor segue sem gravar achado (I6), como antes.

---

## A decisão que explica todo o resto

O agente tem **o mesmo alcance do consultor humano, preso a um projeto**.

Não existe uma "API do agente" separada. Cada chamada do agente é uma requisição
interna às rotas `/api/v1/*` de sempre, feita pelo próprio Worker com um
principal especial. Por isso a segurança do agente é, quase toda, a segurança
das rotas — mais uma camada que diz **o que o agente não pode tocar** e **o que
ele só toca com confirmação**.

O principal que `resolverAgente` devolve tem três propriedades, e é bom saber de
cor por quê:

| Propriedade | Valor | Por quê |
|---|---|---|
| `role` | `client` | É o papel que todo o isolamento de tenant já conhece. O `projectAccessMiddleware` e o `requireResourceAccess` tratam `client` como "só o `client_project_id` dele". |
| `client_project_id` | o projeto escolhido no login | A fronteira. Um consultor humano designado em três clientes alcança os três (e só eles, desde a D5); o agente alcança um. |
| `id` | o `users.id` **real** do consultor | Armadilha. Rota que age sobre "o usuário atual" age sobre a conta do consultor, que vale em todos os projetos em que ele está designado. É a causa dos dois achados críticos de 30/09/2026 (abaixo). |

A terceira linha é o que mais surpreende. Se você criar uma rota de "minha
conta" (trocar senha, aceitar termo, ler notificação, configurar MFA), ela
**precisa** entrar na lista de rotas proibidas ao agente. A regra geral vem do
quadro acima: **toda rota que usa `user.id` sem `project_id` é suspeita**.

---

## Contra quem o agente é desenhado

| Quem | O que tenta | Como o desenho responde |
|---|---|---|
| **Um usuário de um cliente** (até um papel só de leitura) | Planta texto numa evidência, entrevista ou nota para induzir o agente do consultor a agir (injeção de prompt) | O agente só alcança o que o consultor alcança, num projeto. Ações destrutivas exigem confirmação no servidor. Rotas de acesso e conta ficam fora. Veja "Limites conhecidos". |
| **Terceiro na internet** | Abusar do OAuth: phishing de consentimento, roubo de código, repetir um pedido, adivinhar senha | Pedido de uso único com TTL de 10 min, bloqueio por tentativas compartilhado com o login, TOTP com reuso bloqueado, página que escapa tudo e roda sob o CSP global, que proíbe moldura (`frame-ancestors 'none'`, `src/index.ts`). |
| **Consultor revogado, rebaixado ou desligado** | Continuar usando um token ainda não expirado | A concessão é revalidada **a cada chamada**; trocar a senha revoga tudo. |
| **O próprio agente** | Sair do projeto, ampliar o próprio acesso, forjar identidade | Projeto é a fronteira por recurso, `/agentes` e conta pessoal são proibidos, a identidade só nasce de `env.AGENTE`. |

---

## Invariantes

Cada linha diz **o que não pode regredir**, onde o código garante, e qual teste
reprova a regressão. Se você alterar um destes pontos, o PR precisa explicar por
quê (mesma regra do [`SECURITY.md`](../../SECURITY.md)).

| # | Invariante | Onde é garantido | Teste |
|---|---|---|---|
| **I1** | A identidade do agente só existe em `env.AGENTE`, numa **cópia** do ambiente feita pelo `/mcp`. Nenhum cabeçalho, token ou parâmetro de requisição externa a cria. O cabeçalho de confirmação é inerte sem ela. | `src/mcp/servidor.ts` (`requisicaoInterna`), `src/middleware/auth.ts` | `agente-paridade` — "o cabeçalho de confirmação é inerte fora do agente" |
| **I2** | **O projeto é a fronteira.** Recurso de outro projeto não é lido nem alterado, nem por id direto nem por listagem global. | `role: 'client'` + `client_project_id`; `requireProjectAccess`, `requireResourceAccess` | `agente-paridade` — id direto, `/portfolio`, `/projects`, `/controls` |
| **I3** | O caminho é avaliado **decodificado**. `%`, `#`, `\`, segmentos `.` e `..` e qualquer caminho que o parser de URL reescreva são recusados antes da API. | `caminhoSeguro` (`servidor.ts`), `resolverAgente` | `agente-principal` — caminhos percent-encoded e de travessia |
| **I4** | Há uma lista fechada de rotas **fora do alcance** do agente (tabela abaixo), recusada mesmo com confirmação. | `FORA_DO_AGENTE` em `src/middleware/agente.ts` | `agente-paridade` — "rotas fora do alcance mesmo com confirmação" |
| **I5** | Ação destrutiva e decisão do consultor exigem confirmação **imposta no servidor**. Destrutiva: apagar (`DELETE`) (`revoke-approval(s)` e `data-subject/erase` são atos do cliente, `FORA_DO_AGENTE`). Decisão (catálogo `src/middleware/decisoes-agente.ts`, 10 ferramentas e 35 ações; `grep -cE "^\s+\{ ferramenta: 'niso_" src/middleware/decisoes-agente.ts`, 2026-10-25: 35): `resolverAgente` exige `X-Agente-Ferramenta` da rota certa, `X-Agente-Confirmado: 1` e `X-Agente-Motivo` (1 a 500 caracteres, `encodeURIComponent`); sem eles, 403. Valendo, o principal leva `agente_decisao` e `ehEquipeNess` o aceita só naquela rota. A trilha `agente.decisao` (ferramenta, método, caminho, motivo, projeto) é gravada ANTES da rota rodar, então registra a tentativa confirmada mesmo que a rota falhe. Texto de documento, importação ou campo livre é dado e nunca autoriza decisão. Só o booleano `true` em `confirmado_pelo_usuario` vira o cabeçalho; o texto `"true"` não vale. Cada uma que passa grava `agente.acao_destrutiva` com o projeto. | `acaoDestrutiva`, `resolverAgente`, `genericas` (`servidor.ts`), hook em `auth.ts` | `agente-paridade`, `agente-ferramentas-genericas` |
| **I6** | O agente **consultor** não registra achado de auditoria nem nota de auditor (ISO 27001, 9.2: quem implementa não audita). O agente **auditor** só lê e grava achado e nota. | `apiKeyRoleViolation` e `isAuditWrite` em `src/auth-policy.ts`; `foraDoAuditor` em `src/middleware/agente.ts`; a rota `POST /projects/:id/auditor-notes` só aceita o agente auditor | `agente-paridade` — "escrita de auditor continua recusada"; `agente-auditor` — escrita forjada, regressão do consultor |
| **I7** | A concessão é revalidada **a cada chamada**: não revogada, não expirada (30 dias), conta ativa, papel de conta `consultor` ou `consultoria_admin` (os demais não conectam agente), **papel do agente igual ao do token** (concessão trocada derruba), projeto da organização do consultor (multiconsultoria, #253) e pessoa **ainda designada** na governança do projeto. | `concessaoValida` (`agente.ts`), chamada pelo `/mcp` (401) e por `resolverAgente` | `mcp-remoto` — revogada, designação removida, expirada (401); `agentes-acesso` — o agente cai na chamada seguinte à revogação |
| **I8** | Trocar ou redefinir a senha revoga as concessões do usuário. | `revogarAgentesPorTrocaDeSenha` (`src/helpers.ts`) | `agente-principal` — "troca de senha derruba o agente" |
| **I9** | O fluxo OAuth usa a mesma contagem e o mesmo bloqueio do login do app; senha errada, conta inativa e papel sem acesso dão a **mesma** resposta; senha provisória barra a conexão; o escopo é fixado pelo papel escolhido (`niso:consultor` ou `niso:auditor`; papel desconhecido é 400), nunca pelo que o cliente pediu; o pedido é de uso único. | `src/routes/oauth-autorizacao.ts`, `registrarFalhaLogin` (`routes/auth.ts`) | `oauth-autorizacao` |
| **I10** | `niso_skill` só lê de um mapa embutido. `nome` e `arquivo` **nunca** viram caminho de disco. | `skill()` em `servidor.ts` (`Object.hasOwn`) | `agente-skills` — nome inexistente, `../`, `..\` |
| **I11** | Segredo de integração não sai: a listagem de webhooks não devolve `secret`, e o export de portabilidade omite webhook, SSO, SCIM e `repository_token`. | `routes/integrations.ts`, `src/portabilidade.ts` | `webhooks-segredo`, `portabilidade` |
| **I13** | **Separação de funções**: a mesma conta não tem agente consultor e auditor ativos no mesmo projeto. | `/authorize/confirmar` (409) e o `NOT EXISTS` de `concessaoValida` | `agente-auditor` — "separação de funções" |
| **I12** | **O consultor humano só alcança os projetos em que consta como `consultor` na governança** (`project_governance.role_category = 'consultor'`, e-mail sem caixa, conta ativa). Vale para rota de projeto, recurso por id e listagem entre projetos (`/projects`, `/portfolio`, `/controls`, `/dashboard`, `/dashboard/stats`, `/users`). É a **mesma** regra da concessão do agente (I7): uma função, `consultorDesignado`, e um SQL, `PROJETOS_DO_CONSULTOR_SQL`. Tirar a linha da governança derruba o acesso na requisição seguinte. Erro na consulta nega. O `consultoria_admin` alcança os projetos da própria organização (multiconsultoria, #253); só o `platform_admin` vê todos. | `src/helpers.ts` (`requireProjectAccess`, `requireResourceAccess`, `projetosVisiveis`), `src/middleware/project-access.ts`, `src/routes/users.ts` | `consultor-escopo` |

### O que está fora do alcance (I4) e por quê

| Rota | Motivo |
|---|---|
| `/users`, `/admin/users` | Gestão de usuários: controle de acesso, não conteúdo do SGSI. |
| `/platform` | Administração da plataforma (organizações). |
| `/dashboard` | Agrega todos os clientes. |
| `/assessments`, `/leads`, `/proposals`, `/funil`, `/org`, `/servicos`, `/propostas` | Área comercial, salvo a allow-list de leitura e rascunho acima (`COMERCIAL_DO_AGENTE`), para o agente de quem é do comercial. |
| `/projects/:id/{sso,security-policy,scim-token,api-keys,webhooks}` e `/webhooks` | Configuração de segurança do cliente. O agente não amplia acesso. |
| `/api/v1/public/*`, `/api/v1/auth/*`, `/api/v1/assessments/public/*` | Rotas sem sessão (portais, link com token, login): `niso_ler` e `niso_executar` as recusam em `caminhoSeguro` ("caminho de API recusado"), senão o agente responderia como fornecedor ou ciente. |
| `/auth/*`, `/legal/*`, `/notifications` | **Conta pessoal do consultor** (veja a terceira linha do primeiro quadro). |
| `/projects/:id/ot` e sub-rotas | n.ot (modelo de ameaças P0-2): o inventário do ARCiber não vai ao modelo. A rota também recusa chave de API e agente (`src/routes/ot.ts`). |
| `/projects/:id/auditor-token` | Emitiria uma credencial externa de até 365 dias e permitiria forjar nota de auditor. |
| `POST`/`PUT`/`PATCH`/`DELETE /projects/:id/governance` e sub-rotas | A governança dá acesso (consultor), autoridade de assinatura e abre o portal de políticas ao e-mail e ao domínio do membro. O agente só lê (`GET`); quem mantém o comitê é uma pessoa. |
| `POST /projects` | O agente é preso a um projeto; criar outro contradiz isso. `GET /projects` continua valendo, escopado. |
| `GET /carteira` | A carteira agrega todos os projetos do consultor; o agente está preso a um projeto. O painel do projeto (`GET /projects/:id/painel`) segue legível, na visão da consultoria. |
| `GET /projects/consulta-cnpj/:cnpj` | Consulta externa à Receita (BrasilAPI) do assistente "Novo projeto", que o agente não usa (não cria projeto). A rota também corta por papel (`platform_admin`, `consultoria_admin`) e tem limite por usuário. O cadastro da empresa (`GET /projects/:id/empresa`) segue legível pelo agente; a edição (`PUT`) é recusada pela própria rota, que só aceita a equipe e o `org_admin` (o agente entra como `client`). |
| `/agentes` | O agente não gere o próprio acesso. |
| `POST /projects/:id/mesclar` | Mesclar parte ou item duplicado move vínculos e inativa um cadastro: ato do consultor, pela interface, com a prévia do que muda. |
| `PUT /projects/:id/empresa` (não está na lista: é exceção) | O cadastro da empresa do projeto o agente com o papel de consultor GRAVA (`podeEditarEmpresa`), com o "sim" do consultor no chat pedido pela skill `cadastro-cliente`; a trilha leva "agente de <email>" e só os NOMES dos campos. O agente auditor e a chave de API só leem. |
| `/projects/:id/{ropa,dpia}/:id/revoke-approval`, `revoke-approval(s)` de controle | Desaprovar é ato do cliente (a direção), pela interface, com ou sem confirmação. |
| `DELETE /management-reviews/:id` | Excluir análise crítica destrói registro assinado: só pela interface. |
| `POST`/`PUT /evidence/:id/approve` e `.../signatures/approve` | Assinatura eletrônica é ato humano, com a senha de quem assina. |
| `POST /projects/:id/approve-document` | Aceitar o documento gerado no checklist grava a evidência e conclui o item: é a pessoa que decide, depois de ler o rascunho. Gerar (`POST /projects/:id/checklist/:item/generate` e `.../generate-document`) só devolve o texto, sem gravar nada. |
| `PUT`/`DELETE /parametros-legais*` | Prazo legal é parâmetro revisado pelo jurídico e editado pelo administrador da plataforma; o agente só lê. |
| `POST /projects/:id/incidentes/:id/encerrar`, `POST /projects/:id/consentimentos/:id/revogar` | Fora do `niso_executar`: só pelas ferramentas de decisão `niso_encerrar_incidente` e `niso_registrar_revogacao`, com confirmação e motivo. |
| Aceite de risco (`status: Accepted`), `PUT /titular-pedidos/:id` (responder, negar, arquivar, prazo), `POST /data-subject/erase`, `/policy-acknowledgments`, `/pedidos/*` (aprovar, recusar, lote) | Atos do cliente: a própria rota ou o `FORA_DO_AGENTE` recusa ao agente, com ou sem confirmação e motivo. Apagar risco, ação, gap ou medida da atividade vai por `niso_executar` com confirmação; concluir ação (`Closed`) é a decisão `niso_concluir_acao`. |
| `POST /projects/:id/pedidos` e `POST /projects/:id/pedidos/ciencia` | Pedir aprovação ou ciência é decisão do consultor: `niso_pedir_aprovacao`, com confirmação e motivo. O pedido conta como do consultor que concedeu (`criado_por` é o e-mail dele, então ele não decide o que o agente pediu) e a trilha `pedido.criado` diz "agente de <consultor>". Ler a fila (`GET /projects/:id/pedidos*`) é `niso_ler`. Reenviar o link de ciência é pela interface (`FORA_DO_AGENTE`); aprovar e recusar seguem do destinatário, com a senha dele. |
| `/projects/:id/importacoes*` | Importação de programa: só pela ferramenta `niso_importar_programa`, com confirmação e motivo; a revisão item a item é do consultor, na conversa. |
| `POST /projects/:id/documentos/:id/versoes/:n/publicar`, `DELETE /projects/:id/documentos/:id/rascunho`, `POST /projects/:id/documentos/:id/revisar` e `POST /projects/:id/documentos/:id/excecoes/:id/revogar` | Política: o agente **propõe** (`niso_criar_politica` e `niso_gerar_secao` gravam um rascunho do documento da política) e publicar, descartar, marcar revisado e revogar exceção são decisões (`niso_publicar_documento`, `niso_revisar_documento`), com confirmação, motivo e o hash do rascunho. Publicar zera as aprovações e substitui os pedidos abertos. `PUT /controls/:id` também recusa ao agente mudar a descrição, que é a nota do controle, salvo a justificativa de "Não aplicável". |
| `POST`, `PUT` e `DELETE /requisitos*` | O catálogo de requisitos (títulos, mapeamentos e seed) é edição do administrador da plataforma, com trilha: o agente só lê. Ligar requisito a documento (`PUT /projects/:id/documentos/:id/requisitos`) continua aberto, porque é metadado sem efeito de aprovação. |
| `PUT /ropa/:id` com `status` diferente do gravado | O agente não muda a situação da atividade pelo PUT (403): a decisão é `niso_situacao_atividade`, só em `/situacao`. `DELETE /ropa/:id` de atividade aprovada por pedido dá 409 para todos. |
| `POST /projects/:id/ropa/copiloto`, `POST /projects/:id/ropa/:id/sugestao`, `POST /projects/:id/titular-pedidos/:id/rascunho`, `POST /projects/:id/incidentes/:id/rascunho-comunicacao` | Rascunho de IA do n.privacy é da tela, para a pessoa revisar antes de aplicar; o agente já é a IA e grava pelas rotas de edição, com aprovação. |
| `POST /projects/:id/similares` | Parecidos por significado (embeddings do Workers AI) servem ao "Cadastrar agora" da entrevista do RoPA, na tela; o agente já é a IA e não precisa do recurso. A rota também corta por papel (`platform_admin`, `consultor`, `consultant`). |

Fonte da lista: `FORA_DO_AGENTE` em `src/middleware/agente.ts`. Mudou lá, muda aqui.

### Ferramentas nomeadas do n.privacy: o que gravam e por que só rascunho

As 16 `niso_privacy_*` (`mcp-server-niso/src/ferramentas.ts`) são finas sobre rotas que o consultor já usa; **não ampliam o
alcance**: tudo o que fazem o `niso_executar` já fazia. O ganho é de forma: esquema estrito (campo desconhecido é recusado antes
da API, inclusive `status`), projeto fixo e uma descrição que manda pedir aprovação humana. O servidor continua sendo quem
autoriza: faixa do módulo (projeto **e** pessoa), tenant do projeto e `FORA_DO_AGENTE`.

| Ferramenta | Rota | O que grava | O que nunca faz |
|---|---|---|---|
| `propor_tratamento` | `POST /projects/:id/ropa` | Tratamento novo; a rota grava sempre `Draft`. Recusa finalidade já cadastrada | Definir status, aprovar |
| `atualizar_tratamento` | `PUT /ropa/:id` | Só os campos enviados | Mudar status (o esquema não tem o campo). Em registro aprovado, a edição substitui o pedido de aprovação aberto (regra da rota), e a ferramenta avisa |
| `ligar_tratamento` | `PUT .../ropa/:id/itens`, `.../departamentos`, `PUT /ropa/:id` | Soma itens e departamentos aos ligados; base legal do catálogo | Desligar (só pela interface ou `niso_executar`) |
| `criar_dpia_do_tratamento` | `POST .../ropa/:id/dpia` | DPIA `Draft` pré-preenchida; 409 com o id se já existe | Aprovar a DPIA |
| `rascunhar_lia` | `PUT .../ropa/:id/lia` | Campos da LIA em rascunho; LIA concluída é recusada (409) | Enviar `status` (concluir ou reabrir) |
| `registrar_pedido_titular` | `POST .../titular-pedidos` | Pedido com protocolo; o prazo sai do parâmetro | Definir prazo, responder, encerrar |
| `registrar_incidente` | `POST .../incidentes` e, se pedido, `PUT .../incidentes/:id/risco` | Incidente e avaliação de risco | Encerrar, registrar comunicação enviada, definir prazo |
| `ligar_documento_requisito` | `PUT .../documentos/:id/requisitos` | Soma requisitos aos ligados | Publicar o documento |

Por que só rascunho: no n.privacy a aprovação é prova (pedido com conteúdo congelado e hash, assinatura com autoridade na
matriz de Governança) e a conclusão de LIA, o encerramento de incidente e a revogação de consentimento têm consequência
jurídica. Um modelo pode ser induzido por conteúdo do cliente (Limites conhecidos, item 2); o que ele grava precisa continuar
revisável por uma pessoa antes de valer. Concluir ou reabrir a LIA também é recusado ao agente na própria rota
(`PUT .../lia` com `status` dá 403 quando `user.agente`), então nem o `niso_executar` conclui. **Lacuna conhecida:** mudar o
status de ciclo de vida do tratamento (`PUT /ropa/:id` com `Under Review`, `Active` ou `Inactive`) segue alcançável pelo
`niso_executar`, porque `FORA_DO_AGENTE` decide por caminho e método, não pelo corpo; `Approved` nunca passa pela edição.

---

## Limites conhecidos

Documentar o que **não** é garantia é parte da segurança. Foi isso que a revisão
independente de 30/09/2026 avaliou e descartou como vulnerabilidade, e o motivo.

1. **A confirmação é do modelo.** O servidor exige o cabeçalho, mas não consegue
   distinguir um "sim" real do usuário de um "sim" que o modelo foi induzido a
   dizer. O controle que cobre isso é a **aprovação por chamada de ferramenta do
   cliente MCP** (Claude Code, Codex, Cursor), que mostra o método, o caminho e
   `confirmado_pelo_usuario: true` antes de executar — **desde que o consultor
   não tenha liberado a ferramenta de forma permanente**. Não a libere para
   `niso_executar`.
2. **Injeção de prompt por conteúdo.** O agente lê evidências, entrevistas e
   notas escritas por usuários do cliente. Um papel só de leitura consegue
   escrever alguns desses textos. O servidor não concede ao agente mais do que o
   consultor já tem, mas um modelo enganado age com a autoridade do consultor
   **dentro daquele projeto**. O dano fica contido por I2, I4, I5 e I6.
3. **O consentimento é a decisão do consultor.** A tela OAuth lista o que o
   agente faz. Se o texto ficar defasado, o consultor consente em cima de algo
   falso (já aconteceu entre o #221 e o #222). Mudou o alcance, mude o texto de
   `src/routes/oauth-autorizacao.ts` no mesmo PR.
4. **Concessões antigas ganham poderes novos sem novo consentimento.** O escopo
   é fixo pelo papel (`niso:consultor`), então uma concessão emitida antes de uma mudança
   de alcance a herda. As concessões anteriores à 0070 viram `consultor` (default da coluna). Mudança que **amplia** o alcance merece aviso aos
   administradores de cliente.
5. **`GET /projects/:id/export` é alcançável.** Devolve todo o conteúdo do
   projeto, como para qualquer membro. Desde o #222 ele não leva segredo de
   integração, e a ferramenta corta a resposta em 100.000 caracteres.
6. **O agente define a validade da evidência** (`PUT /projects/:id/evidence/:eid/validade`, faixa `nucleo` desde a Frente 3C, 21/10/2026),
   também em projeto só do n.iso. Uma validade no passado faz a rotina diária devolver a evidência conforme a `pending` e baixa a
   Prontidão; a assinatura gravada fica, e a trilha registra `evidencia.validade` com quem mudou. É decisão de produto (o consultor faz o
   mesmo pela tela), não falha; quem ainda não pode é o papel de leitura (`org_user`, `client`).

Achados da revisão final do #221, ambos provados por sonda e corrigidos antes
de chegarem à produção: `POST /auth/reset-password-first` (o agente definiria a
senha do consultor) e `POST /projects/:id/auditor-token` (credencial externa
de 365 dias). Veja I4.

---

## Antes de abrir um PR que toque a superfície do agente

Rota nova, ferramenta nova ou mudança de autorização. Responda, por escrito, na
descrição do PR:

1. **A rota age sobre a conta do usuário em vez de sobre o projeto?** (usa
   `user.id` sem `project_id`, lê ou grava algo "meu") → entra em `FORA_DO_AGENTE`.
2. **Ela guarda ou devolve credencial?** (chave, token, segredo, senha, código)
   → `FORA_DO_AGENTE`, e nunca na resposta de listagem.
3. **Ela amplia quem tem acesso?** (designar, convidar, criar usuário, emitir
   token) → `FORA_DO_AGENTE`.
4. **Ela é por id?** (`/:id` fora de `/projects/:projectId`) → chama
   `requireResourceAccess` antes de qualquer leitura ou escrita. Teste com o id de
   **outro** projeto.
5. **Ela destrói algo que o consultor não refaz?** → `acaoDestrutiva`.
6. **Mudou o que o agente consegue fazer?** → atualize o texto do consentimento
   (`oauth-autorizacao.ts`), `INSTRUCOES`/`ROTEIROS`/`MAPA_DA_APP`
   (`src/mcp/contexto.ts`) e a lista de "fora do alcance" aqui.
7. **Ferramenta nova?** Se for de escrita, entra em `ferramentas.ts` e herda o
   papel; se for só do servidor remoto, nasce em `servidor.ts` e **não** chama a
   API sem passar por `requisicaoInterna`.

Teste de portão: faça a chamada **como agente** (`env.AGENTE`, como em
`test/agente-paridade.test.ts`), com dois projetos semeados, e prove que o
segundo não aparece.

---

## Se algo der errado

| Situação | O que fazer |
|---|---|
| Suspeita de uso indevido de um agente | Revogue na tela de Governança do projeto, cartão "Agentes com acesso". Corta na **próxima chamada** (I7). |
| Conta do consultor possivelmente comprometida | Troque a senha: isso revoga **todas** as concessões dele (I8). Depois, siga o [`runbook-incidente.md`](../runbook-incidente.md). |
| Revogar todos os agentes de um consultor de uma vez | Faça backup (`npm run db:backup`) e rode no D1: `UPDATE agente_concessoes SET revogado_em = datetime('now'), revogado_por = 'incidente' WHERE user_id = '<id>' AND revogado_em IS NULL;` |
| Ver o que um agente fez | A trilha (`audit_logs`) guarda toda **escrita** (e toda exclusão, também pelo gancho central `registro.excluido`) com o ator `agente de <consultor> (<cliente> / <projeto>)`, e `agente.acao_destrutiva` para toda ação destrutiva (até 01/10/2026 o rótulo era `agente.exclusao`; as linhas antigas o mantêm). **Leitura não é registrada**: o único sinal é `ultimo_uso_em` da concessão. |

---

## Mapa dos testes que guardam o agente

| Arquivo | Guarda |
|---|---|
| `test/agente-principal.test.ts` | Identidade interna, caminhos codificados e de travessia. |
| `test/agente-paridade.test.ts` | Fronteira de projeto, lista fora do alcance, confirmação, trilha, direitos do titular. |
| `test/agente-ferramentas-genericas.test.ts` | `niso_ler` e `niso_executar`: binário, corte, confirmação booleana. |
| `test/agentes-acesso.test.ts` | Revogação, expiração, designação, listagem para o cliente. |
| `test/oauth-autorizacao.test.ts` | Login OAuth, MFA, bloqueio, escopo, texto do consentimento. |
| `test/mcp-remoto.test.ts` | Handshake, ferramentas listadas, 401 após revogar. |
| `test/agente-comercial.test.ts` | Área comercial: leitura e rascunho da própria organização com o interruptor desligado, nada de gerar, enviar, aceitar, ganho, preço ou catálogo, outra organização 404, agente de quem não é do comercial recusado (papel relido), `tools/list` e as `niso_comercial_*`. |
| `test/agente-auditor.test.ts` | Papel auditor: leitura nos dois módulos, 403 em toda escrita do consultor (forjada na API e pelo MCP), achado e nota com a trilha, papel relido do banco, separação de funções, `tools/list` por papel, platform_admin e comercial recusados. |
| `test/agente-skills.test.ts` | Módulo embutido em dia, `niso_skill` sem vazamento, roteiro 4, as quatro skills do n.privacy. |
| `test/agente-privacy-ferramentas.test.ts` | As 16 `niso_privacy_*`: esquema estrito, escrita em `Draft` e rascunho sem aprovar, faixa do módulo (projeto e pessoa), projeto de outra organização, auditor só lê, `FORA_DO_AGENTE` mantido, contagem do `tools/list` por papel. |
| `test/agente-gap-traceability.test.ts` | Diagnóstico acima de 100 controles, edição parcial de risco. |
| `test/webhooks-segredo.test.ts`, `test/portabilidade.test.ts` | Segredo de integração fora da listagem e do export. |
