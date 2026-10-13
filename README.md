# n.360 — plataforma de GRC da ness.

[![CI](https://github.com/resper1965/n.iso/actions/workflows/ci.yml/badge.svg)](https://github.com/resper1965/n.iso/actions/workflows/ci.yml)
[![Deploy](https://github.com/resper1965/n.iso/actions/workflows/deploy.yml/badge.svg)](https://github.com/resper1965/n.iso/actions/workflows/deploy.yml)
[![CodeQL](https://github.com/resper1965/n.iso/actions/workflows/codeql.yml/badge.svg)](https://github.com/resper1965/n.iso/actions/workflows/codeql.yml)
![License: Proprietary](https://img.shields.io/badge/license-Proprietary-red.svg)
![Stack](https://img.shields.io/badge/stack-Cloudflare%20Workers%20%2B%20D1%20%2B%20R2-f38020.svg)

O **n.360** é a plataforma de governança, risco e conformidade da **ness.**: um Worker, um banco,
um deploy, e dois módulos sobre **um cadastro só** (partes, itens, documentos, RoPA, DPIA,
evidências, incidentes).

| Módulo | Caminho | Para quê |
|---|---|---|
| **n.iso** | `/iso` | Adequação e certificação ISO 27001 e 27701: SoA, riscos, controles, políticas, auditorias, CAPA, jornada da certificação. |
| **n.privacy** | `/privacy` | Programa LGPD/ANPD: encarregado, RoPA (com as marcas dos arts. 11 e 14), DPIA/RIPD, LIA, pedidos do titular, incidentes com prazo da ANPD, consentimentos, terceiros, requisitos LGPD/ANPD, "Importar programa" e rascunhos de IA com aprovação humana. |

O início do n.360 (`/`) mostra um cartão por módulo e o grupo **Conta e acessos** (projetos,
usuários, organizações, chaves de API, conectar agente). O repositório e o Worker continuam
chamados `niso` por história; não é o nome do produto.

> **Produção:** [`n360.ness.com.br`](https://n360.ness.com.br) é o `APP_URL` (`wrangler.jsonc`).
> `niso.ness.com.br` e `nprivacy.ness.com.br` respondem 308 para `/iso` e `/privacy`, mas servem no
> lugar `/api/*`, `/scim/*`, `/mcp`, `/oauth/*`, `/.well-known/*`, `/health`, `/politicas*`,
> `/auditor*` e `/proposta*` (`fica` em `src/config/url.ts`): chaves de API, IdPs de SCIM,
> conectores MCP e links já enviados não quebram. O callback de SSO e o recurso do MCP ficam
> presos em `niso`. `GET /health` devolve o SHA do commit publicado e o `app_url`.

## Quem acessa o quê

- **Projeto tem o módulo E a pessoa tem o módulo.** Cada rota de projeto cai numa faixa
  (`nucleo`, `iso` ou `privacy`, em `src/modulos.ts`); a faixa de módulo exige `projeto_modulos`
  e `usuario_modulos` (migration 0066), senão 403. O núcleo vale com qualquer módulo.
- Habilitar o n.privacy num projeto (`PUT /api/v1/projects/:id/modulos/privacy`, cartão Produtos)
  importa as partes e os documentos que o n.iso já tem; desligar não apaga dado.
- Conta se **desativa**, não se apaga; apagar de verdade é só do `platform_admin`.
- Login por senha ou por SSO (o e-mail decide); a equipe configura SSO, SCIM e política em
  **Segurança do projeto**. Detalhe em [`docs/sso-scim.md`](docs/sso-scim.md).

---

## Começando

Pré-requisitos: **Node 22+** e uma conta Cloudflare com acesso ao projeto.

```bash
npm ci                          # backend (Worker)
npm ci --prefix frontend        # frontend (Vite)

# Banco local, na ordem: schema primeiro, migrations depois
npx wrangler d1 execute niso-db --local --file=./schema.sql
npx wrangler d1 migrations apply niso-db --local

npm run dev                     # Worker + assets em http://127.0.0.1:8787
```

A tela de entrada fica em `/login`; `/iso` e `/privacy` abrem as cascas dos módulos. Em
`localhost` e `127.0.0.1` o CORS é sempre liberado.

## Mapa do repositório

| Caminho | O que vive aqui |
|---|---|
| `src/` | O Worker. `index.ts` monta tudo: cabeçalhos de segurança, CORS, redirecionamento dos domínios antigos, autenticação, rate limit e os sub-routers. |
| `src/routes/` | 50 arquivos de rota (`ls src/routes/*.ts \| grep -vc '\.test\.ts$'`), um por domínio. |
| `src/modulos.ts` | A faixa de cada rota de projeto (`nucleo`, `iso`, `privacy`) e os módulos da pessoa. |
| `src/schemas/` | Schemas Zod. Todo corpo de escrita passa por aqui; é a fonte do contrato da API. |
| `src/middleware/` | Autenticação, acesso por projeto e por módulo, principal do agente, rate limit. |
| `src/services/`, `src/agents/` | Regra de negócio (40 services: `ls src/services/*.ts \| wc -l`) e os agentes de IA (`ls src/agents`). |
| `frontend/` | Vite + JavaScript sem framework. `login.html` é a casca; `src/produto.js` escolhe n.360, n.iso ou n.privacy pelo caminho; `src/views/` tem uma tela por arquivo. |
| `frontend/public/_headers` | Cabeçalhos de segurança dos **arquivos estáticos** (ver "Duas fontes de cabeçalho"). |
| `mcp-server-niso/` | Servidor MCP **local** (stdio, chave de API). O MCP **remoto**, com login, vive no Worker (`src/mcp/`). |
| `agent-skills/` | Skills do consultor servidas pelo MCP (`prontidao-certificacao`, `maturidade-lgpd`). |
| `migrations/` | 67 arquivos (`ls migrations/*.sql \| wc -l`), última 0069 (`ls migrations/*.sql \| tail -1`). Nunca editar uma já aplicada ([`migrations/README.md`](migrations/README.md)). |
| `test/` | 245 arquivos de teste do backend (`ls test/*.test.ts \| wc -l`), no pool `workerd` (D1 e KV de verdade). |
| `frontend/test/` | 92 arquivos de teste da UI (`ls frontend/test/*.test.js \| wc -l`), em jsdom. |
| `frontend/e2e/` | 6 specs em Chromium real (`ls frontend/e2e/*.spec.js \| wc -l`), sobre o build servido. |
| `docs/` | Runbook, specs, diagnóstico de design e decisões, com [índice próprio](docs/README.md). |
| `scripts/` | Geradores (`gerar-openapi.mjs`, `gerar-contrato-mcp.mjs`, `gerar-skills.mjs`) e utilitários. |

## Testes

Contagens de 2026-10-12, com o comando na tabela acima.

Três suítes, e cada uma existe porque a anterior não alcança o caso:

```bash
npm test                              # backend, D1 e KV reais
npm run test:coverage                 # idem, com a catraca de cobertura que gateia o deploy
npm test --prefix frontend            # UI em jsdom
npm run test:e2e --prefix frontend    # Chromium real sobre o build
```

A catraca de cobertura **sobe, nunca desce**: os pisos em `vitest.config.mts`
barram regressão sem inventar meta. O deploy falha se a cobertura cair abaixo
deles.

O e2e não é luxo. Dois defeitos recentes só apareceram lá: o atributo `hidden`
que não escondia (porque folha de autor vence a do agente na cascata) e um
iframe `blob:` bloqueado pelo CSP. O jsdom passava nos dois.

## Publicar

O deploy é automático a cada push na `main`, com um portão deliberado: **recusa
publicar se houver migration D1 pendente**. Publicar código que consulta tabela
inexistente já custou caro aqui.

**Pela aba Actions, sem terminal:**

1. **Apply DB migrations (manual)** → *Run workflow* → digite `APLICAR`.
   Faz backup do D1 como artifact e aplica as migrations pendentes.
2. **Deploy** → *Run workflow* na `main`. Com as migrations aplicadas, publica.

O ambiente `production` do GitHub só aceita a `main`, então o *Apply DB migrations* roda na `main`. Migration
nova só existe lá depois do merge, e o deploy que o merge dispara recusa de propósito (migration
pendente): aplique e rode *Deploy*. Para aplicar **antes** do merge, use o terminal, abaixo.

**Pelo terminal:**

```bash
npx wrangler login
npm run db:backup                                   # backup verificado antes de mutar
npx wrangler d1 migrations apply niso-db --remote
npm run deploy                                      # build do frontend + wrangler deploy
```

Depois de publicar, confira o que está no ar:

```bash
curl -s https://n360.ness.com.br/health
```

## Automação

| Workflow | Quando roda | O que garante |
|---|---|---|
| **CI** | push e pull request | tsc, as três suítes, build do frontend, `npm audit` |
| **CodeQL** | push, PR e toda segunda | SAST sobre o JS/TS do Worker e do frontend |
| **Deploy** | push na `main` e manual | Recusa com migration pendente; injeta o SHA em `/health` |
| **Apply DB migrations** | só manual, com confirmação | Backup antes de aplicar |
| **Backup do D1** | diário, 03h40 UTC | Exporta e **verifica o dump** antes de guardar; abre issue se falhar |
| **Sonda externa** | a cada 15 min | `/health` responde e o login recusa corpo vazio com o envelope certo |
| **SLO de produção** | a cada 6h | Latência e taxa de erro dentro do alvo |
| **Drift de schema** | toda segunda | `schema.sql` contra o D1 real, com a diferença conhecida documentada |

> Alarme quebrado é pior que nenhum, porque parece um. A sonda externa passou
> dias reprovando por um erro no próprio script — ver `test/workflows-shell.test.ts`,
> que existe por causa disso.

## Arquitetura

- **Runtime**: Hono no Cloudflare Workers.
- **Banco**: D1 (SQLite). Trilha de auditoria append-only por trigger.
- **Arquivos**: R2 para evidências e documentos; bucket separado para a trilha arquivada.
- **IA**: Workers AI via AI Gateway (`n-iso`): `llama-3.1-8b-instruct` e `llama-3.3-70b-instruct-fp8-fast`
  (`git grep -hoE "@cf/[a-z0-9/._-]+" -- src`). Sem embedding: a vetorização saiu no #289.
- **Contrato**: `docs/openapi.json` é **gerado** dos schemas Zod. Editar à mão cria
  uma segunda fonte de verdade, e o teste de contrato reprova a divergência.

### Duas fontes de cabeçalho de segurança

O `secureHeaders` em `src/index.ts` só alcança resposta que o **Worker gera**.
Arquivo estático é servido pelo Workers Assets **antes** de o Worker rodar, então
os mesmos cabeçalhos vivem também em `frontend/public/_headers`.

Nenhum dos dois alcança o lado do outro — não existe fonte única possível, só a
obrigação de não divergirem. `test/cabecalhos-assets.test.ts` compara os dois e
falha nas duas direções. Mudou num lugar, muda no outro.

## Configuração

Bindings e variáveis ficam em `wrangler.jsonc`.

| Binding | Tipo | Finalidade |
|---|---|---|
| `DB` | D1 | Banco relacional |
| `SESSIONS` | KV | Sessões, tokens e contadores de rate limit |
| `STORAGE` | R2 | Evidências e documentos |
| `TRILHA` | R2 | Trilha de auditoria arquivada, em cadeia encadeada |
| `OAUTH_KV` | KV | Estado do OAuth do MCP remoto (clientes, códigos, tokens) |
| `AI` | Workers AI | Inferência |
| `ANALYTICS` | Analytics Engine | Métricas de requisição (SLO) |
| `CF_VERSION_METADATA` | Version metadata | Identifica a versão publicada em `/health` |
| `ASSETS` | Workers Assets | O frontend (`frontend/dist`) |

**Variáveis** (públicas, versionadas em `wrangler.jsonc`): `ENVIRONMENT`,
`EXPORT_PUBLIC_KEY` (verifica a assinatura dos exports), `TURNSTILE_SITE_KEY`
(vai no HTML do widget), `APP_URL` (`https://n360.ness.com.br`: links de e-mail, base do SCIM, CORS e destino dos 308; padrão em
`src/config/url.ts`. O callback do SSO e o recurso do MCP continuam em `niso.ness.com.br`). Opcionais, com padrão em `src/agents/types.ts`: `CF_ACCOUNT_ID` e
`AI_GATEWAY_ID`.

**Segredos** (`npx wrangler secret put <NOME>`, nunca no git):

| Segredo | Sem ele |
|---|---|
| `RESEND_API_KEY` | E-mail não sai; o OTP do portal público falha em produção. |
| `EXPORT_SIGNING_KEY` | Export de portabilidade não é assinado. |
| `TURNSTILE_SECRET_KEY` | O desafio anti-abuso **não é exigido** — e essa é a falha segura. Ele só liga em par com `TURNSTILE_SITE_KEY`; meia configuração exigiria um desafio que a tela não teria como montar. |
| `TOKEN_ENC_KEY` | Configurar SSO devolve **503**: o `client_secret` do IdP não é gravado em claro. |
| `SETUP_KEY` | A rota de seed do primeiro usuário recusa com 403. |

## Integração com agentes (MCP)

Dois caminhos:

- **MCP remoto** (`/mcp`, com login OAuth em `/oauth/*`): o agente do consultor entra com a
  conta do consultor, fica preso a um projeto escolhido no login e tem o alcance do consultor
  nesse projeto. Ação destrutiva exige confirmação no servidor. Uso, arquitetura e segurança em
  [`docs/agente/`](docs/agente/README.md).
- **MCP local** (`mcp-server-niso/`, stdio com chave de API): filtro de ferramentas por papel —
  o auditor não escreve implementação, o consultor não registra achado de auditoria.
  Instalação, variáveis e diagnóstico em [`mcp-server-niso/README.md`](mcp-server-niso/README.md).

## Documentação

- [`docs/README.md`](docs/README.md) — **índice**, agrupado por quando você vai precisar
- [`docs/runbook-incidente.md`](docs/runbook-incidente.md) — produção quebrou: comece aqui
- [`AGENTS.md`](AGENTS.md) — contexto canônico para quem (ou o que) for mexer no código
- [`docs/sso-scim.md`](docs/sso-scim.md) — login federado, SCIM e a tela Segurança do projeto
- [`docs/agente/`](docs/agente/README.md) — o agente consultor (MCP remoto): uso, arquitetura, segurança
- [`docs/design/diagnostico-2026-10-12/`](docs/design/diagnostico-2026-10-12/README.md) — diagnóstico de design do n.360, do n.iso e do n.privacy
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — ambiente, verificação antes do PR, regras de schema e teste
- [`SECURITY.md`](SECURITY.md) — como reportar vulnerabilidade e quais invariantes não podem regredir
- [`CHANGELOG.md`](CHANGELOG.md) — o que mudou, versão a versão

## Licença

Proprietária — © 2026 ness. Cybersecurity. Todos os direitos reservados. Ver
[`LICENSE`](LICENSE). Visualizar o repositório não concede direito de uso, cópia
ou distribuição. Componentes de terceiros (ex.: skills adaptadas sob MIT) mantêm
sua própria licença e atribuição.

---
**ness.** · Cybersecurity Enterprise Grade
