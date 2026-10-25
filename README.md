# n.360 | ness.

[![CI](https://github.com/resper1965/n.360/actions/workflows/ci.yml/badge.svg)](https://github.com/resper1965/n.360/actions/workflows/ci.yml)
[![Deploy](https://github.com/resper1965/n.360/actions/workflows/deploy.yml/badge.svg)](https://github.com/resper1965/n.360/actions/workflows/deploy.yml)
[![CodeQL](https://github.com/resper1965/n.360/actions/workflows/codeql.yml/badge.svg)](https://github.com/resper1965/n.360/actions/workflows/codeql.yml)

O **n.360** é a plataforma de governança, risco e conformidade da ness. Ela tem dois módulos que
trabalham sobre **um cadastro só** (partes, itens, documentos, RoPA, DPIA, evidências):

| Módulo | Caminho | Escopo |
|---|---|---|
| **n.iso** | `/iso` | Adequação e certificação ISO 27001 e ISO 27701 |
| **n.privacy** | `/privacy` | Programa de privacidade sob a LGPD e as resoluções da ANPD |

Endereço: **<https://n360.ness.com.br>** (`APP_URL` em `wrangler.jsonc`). Os domínios antigos
`niso.ness.com.br` e `nprivacy.ness.com.br` respondem 308 para `/iso` e `/privacy`. Integrações já
configuradas continuam respondendo no lugar, sem redirecionar: `/api/*`, `/scim/*`, `/mcp`,
`/oauth/*`, `/.well-known/*`, `/health`, `/politicas*`, `/auditor*` e `/proposta*` (`fica` em
`src/config/url.ts`). O callback de SSO e o recurso OAuth do MCP ficam presos em `niso`.

### Nomes

No texto e na marca, **n.360**, **n.iso** e **n.privacy**; `n360` só no endereço. O repositório se
chama `resper1965/n.360` (renomeado em 2026-10-13; o endereço antigo `resper1965/n.iso` redireciona).
`niso` sobrou como identificador técnico mantido de propósito, e nunca aparece como nome de produto:
o Worker `niso`, o D1 `niso-db`, o pacote `mcp-server-niso`, o cabeçalho `X-nISO-Signature` e as
variáveis `NISO_*`. Trocar esses nomes quebraria deploy, banco, integrações e assinaturas de webhook
já emitidas.

---

## Quem usa o quê

### Papéis

Papéis de conta (`PAPEIS_DE_CONTA` em `src/schemas/users.ts`):

| Papel | Quem é | Alcance |
|---|---|---|
| `platform_admin` | Dono da plataforma | Tudo, todos os projetos e organizações; único que apaga conta de vez |
| `consultoria_admin` | Administrador da consultoria | Projetos da própria organização |
| `consultor` | Consultor da ness. | Só os projetos em que está designado como consultor na governança |
| `comercial` | Área comercial | Leads, levantamentos, propostas; não alcança projeto |
| `org_admin` | Administrador do cliente | O projeto do cliente, inclusive a gestão das contas dele |
| `org_user` | Usuário do cliente | O projeto do cliente |
| `client` | Cliente (leitura) | O projeto do cliente |

Há ainda o `stakeholder`, criado pelo fluxo de pedidos: só vê e decide os pedidos de aprovação e
ciência dirigidos a ele (`/api/v1/pedidos*`).

### Regra de acesso

Cada rota de projeto cai numa **faixa** (`src/modulos.ts`):

- `nucleo`: o cadastro compartilhado (partes, itens, documentos, evidências, RoPA, DPIA, pedidos,
  incidentes, governança). Vale com qualquer módulo.
- `iso`: só do n.iso (controles, SoA, riscos, auditorias, CAPA, certificação…).
- `privacy`: só do n.privacy (requisitos, terceiros, pedidos do titular, consentimentos,
  encarregado, importação, ligações e LIA do RoPA).

Rota das faixas `iso` e `privacy` só abre quando **o projeto tem o módulo E a pessoa tem o
módulo** (`projeto_modulos` e `usuario_modulos`, migration 0066); senão, 403. Rota nova de projeto
sem faixa reprova em `test/modulos-produto.test.ts`.

Habilitar o n.privacy num projeto (`PUT /api/v1/projects/:id/modulos/privacy`, cartão Produtos em
Projetos) importa as partes e os documentos que o n.iso já tem. Desligar um módulo não apaga dado.

Contas se **desativam** (`PUT /api/v1/users/:id/ativo`); conta desativada não entra por senha,
SSO, agente nem sessão aberta. Apagar de verdade é `DELETE /api/v1/users/:id?definitivo=1`, só do
`platform_admin`.

## Mapa dos módulos

O CAMINHO decide a casca (`frontend/src/produto.js`); o servidor entrega o mesmo `login.html`
para todos.

**Início do n.360 (`/`).** Um cartão por módulo habilitado e o grupo **Conta e acessos**:
Projetos (com o cartão Produtos), Usuários, Organizações, Segurança do projeto (SSO, SCIM e
política; só a equipe), Chaves de API e Conectar agente. Nos módulos, o rodapé "Conta e acessos
(n.360)" leva de volta para lá. Quem tem um módulo só entra direto nele.

**n.iso (`/iso`).** Dashboard; Comercial (Leads, Levantamentos, Propostas, Catálogo,
Configuração comercial); Implementação (Jornada, Monitor, SoA, Governança); Operação (Partes
Interessadas, Contexto, Ativos, Riscos, Fornecedores, Ciência e Gestão de Políticas, Auditorias,
CAPA, Incidentes, Análise Crítica).

**n.privacy (`/privacy`, abre em Encarregado).** Privacidade (Encarregado, Titular e pedidos,
Incidentes com o prazo da ANPD, ROPA com as marcas dos arts. 11 e 14, DPIA / RIPD, Terceiros,
Requisitos LGPD/ANPD); LIA e consentimentos ficam no tratamento e no titular; **Implantação**
(Importar programa: a IA lê inventários, listas de terceiros, documentos, DPIA/LIA e o histórico
de titulares, incidentes e consentimentos, e uma pessoa da equipe revisa item a item antes de
gravar).

**Compartilhado pelos dois.** Partes, Documentos, Evidências, Treinamento, Governança, ROPA e
DPIA, Assistente e a trilha de auditoria.

## Agentes e IA

A regra vale para tudo: **a IA rascunha, uma pessoa aprova**. Nada que a IA produz vira registro
sem revisão humana, e cada aprovação deixa assinatura e trilha.

- **Assistente (chat por módulo).** `POST /api/v1/projects/:id/chat` recebe `modulo` (`iso` ou `privacy`);
  o servidor confere que o projeto e a pessoa têm o módulo, e no n.privacy a instrução é de LGPD e
  ANPD (`src/routes/ai.ts`).
- **Rascunhos do n.privacy.** Sugestão de base legal do tratamento, resposta ao titular e
  comunicação de incidente: saída validada por esquema estrito, nada gravado no registro, PII
  mascarada antes de ir ao modelo (`src/services/rascunhos-privacy.ts`).
- **Agente consultor (MCP remoto, `/mcp`).** Entra com a conta do consultor por OAuth, fica preso a
  um projeto e tem o alcance do consultor nele; no consentimento se escolhe o papel `consultor` ou
  `auditor` (só lê e registra achado e nota; `agente_concessoes.papel`, migration 0070). Ação destrutiva exige confirmação no servidor; a
  lista fechada `FORA_DO_AGENTE` (`src/middleware/agente.ts`) recusa conta, acesso, credenciais,
  área comercial, publicação de documento, importação de programa e os rascunhos de IA da tela.
  Detalhe em [`docs/agente/`](docs/agente/README.md).
- **Skills do agente** (seis em 2026-10-14: `ls agent-skills`): `prontidao-certificacao` (pré-avaliação
  para Stage 1 e 2), `maturidade-lgpd` (achados de maturidade do programa de privacidade),
  `atendimento-titular`, `implantacao-privacy`, `migracao-programa` e `avaliacao-terceiros`, servidas
  pelo próprio MCP (`niso_skill`); roteiro de cada uma em [`docs/agente/README.md`](docs/agente/README.md).
- **MCP local** (`mcp-server-niso/`, stdio com chave de API, 38 ferramentas em 2026-10-14:
  `grep -oE 'name: "niso_[a-z_0-9]+"' mcp-server-niso/src/*.ts | sort -u | wc -l`), com filtro por
  papel. Ver [`mcp-server-niso/README.md`](mcp-server-niso/README.md).

## Arquitetura

- **Runtime:** Hono no Cloudflare Workers; um Worker serve API, páginas públicas e o frontend.
- **Banco:** D1 (SQLite), 87 tabelas
  (`grep -oE '^\s*CREATE TABLE( IF NOT EXISTS)? +[a-z_0-9]+' schema.sql | awk '{print $NF}' | sort -u | wc -l`).
  Trilha de auditoria append-only por trigger.
- **KV:** sessões, tokens e rate limit (`SESSIONS`); estado do OAuth do MCP (`OAUTH_KV`).
- **R2:** evidências, documentos e arquivos de importação (`STORAGE`); trilha arquivada (`TRILHA`).
- **IA:** Workers AI via AI Gateway (`git grep -hoE "@cf/[a-z0-9/._-]+" -- src`). Sem embedding.
- **Frontend:** JavaScript sem framework, empacotado pelo Vite. Um tema só, o escuro da marca.
- **Contrato:** `docs/openapi.json` é gerado dos schemas Zod (`npm run openapi`); editar à mão
  reprova em `test/openapi.test.ts`.

| Caminho | O que vive aqui |
|---|---|
| `src/index.ts` | Composition root: cabeçalhos, CORS, redirecionamento dos domínios antigos, autenticação, rotas. |
| `src/routes/` | 51 arquivos de rota (2026-10-14: `ls src/routes/*.ts \| grep -vc '\.test\.ts$'`). |
| `src/services/` | 43 arquivos de regra de negócio (2026-10-14: `ls src/services/*.ts \| wc -l`). |
| `src/agents/` | Agentes de IA (`ls src/agents`): política, evidência, avaliação, adequação de controle, fases, prontidão, importação, privacidade. |
| `src/modulos.ts`, `src/middleware/` | Faixas e módulos; autenticação, acesso por projeto, principal do agente. |
| `src/schemas/` | Schemas Zod de todo corpo de escrita. |
| `src/mcp/` | MCP remoto do agente consultor. |
| `frontend/` | `login.html` (a casca), `src/produto.js` (n.360, n.iso ou n.privacy pelo caminho), `src/views/` (uma tela por arquivo). |
| `frontend/public/` | Páginas públicas copiadas como estão: `politicas.html`, `auditor.html`, `_headers`. |
| `mcp-server-niso/` | Servidor MCP local. |
| `agent-skills/` | Fonte das skills do agente (`npm run skills:gerar`). |
| `migrations/` | 69 arquivos (2026-10-14: `ls migrations/*.sql \| wc -l`), última 0071 (`ls migrations/*.sql \| tail -1`). |
| `test/` | 254 arquivos de teste do backend (2026-10-14: `ls test/*.test.ts \| wc -l`). |
| `frontend/test/`, `frontend/e2e/` | 96 testes em jsdom (2026-10-14: `ls frontend/test/*.test.js \| wc -l`) e 6 specs em Chromium (`ls frontend/e2e/*.spec.js \| wc -l`). |
| `docs/` | Runbook, specs, diagnóstico de design e decisões ([índice](docs/README.md)). |
| `scripts/`, `ops/`, `backups/` | Geradores, SQL de reconciliação conferido por teste, runbook de backup. |

### Duas fontes de cabeçalho de segurança

O `secureHeaders` em `src/index.ts` só alcança resposta que o **Worker gera**. Arquivo estático é
servido pelo Workers Assets **antes** de o Worker rodar, então os mesmos cabeçalhos vivem também
em `frontend/public/_headers`. `test/cabecalhos-assets.test.ts` compara os dois e falha nas duas
direções: mudou num lugar, muda no outro.

## Rodar, testar e verificar

Pré-requisitos: **Node 22+** e uma conta Cloudflare com acesso ao projeto.

```bash
npm ci                          # backend (Worker)
npm ci --prefix frontend        # frontend (Vite)

# Banco local: schema primeiro, migrations depois
npx wrangler d1 execute niso-db --local --file=./schema.sql
npx wrangler d1 migrations apply niso-db --local

npm run dev                     # Worker + assets em http://127.0.0.1:8787 (/login, /iso, /privacy)
```

```bash
npx tsc --noEmit                      # tipos
npm test                              # backend: D1 e KV reais no pool workerd
npm run test:coverage                 # idem, com a catraca de cobertura que gateia o deploy
npm test --prefix frontend            # UI em jsdom
npm run build --prefix frontend       # build do frontend
npm run test:e2e --prefix frontend    # Chromium real sobre o build
```

Catracas que só deixam o número andar para um lado:

| Teste | O que trava |
|---|---|
| `test/any-catraca.test.ts` | `any` em `src/` não sobe (e, se descer, o `TETO` desce junto) |
| `test/colunas-catraca.test.ts` | Coluna escrita pelo código (INSERT/UPDATE) existe no schema aplicado num D1 real |
| `frontend/test/catracas-visuais.test.js` | Cor em hex nas telas, `border-radius` inline fora de `0`/`10px` (o 10px é legado tolerado; o sistema é quadrado, ver [`design.md`](design.md)), `confirm`/`alert`/`prompt` nativos, estado vazio fora de `renderEmptyState` |
| `test/sem-dado-de-cliente.test.ts` | Nome, e-mail ou identificador de cliente real no repositório |
| `vitest.config.mts` (cobertura) | Piso de cobertura do backend |

**Migrations:** toda mudança de schema entra em `schema.sql` e numa migration nova. Procedimento,
particularidades (0011 neutralizada, buraco 0031–0033) e o estado em produção em
[`migrations/README.md`](migrations/README.md). Backup antes de aplicar: `npm run db:backup`
([`backups/README.md`](backups/README.md)).

## Publicar

1. PR para a `main`; o CI roda `tsc`, as suítes, o build e o E2E. O ruleset exige os checks
   **`test`** e **`e2e`** verdes, com a branch em dia.
2. Merge na `main` dispara o **Deploy**, que **recusa publicar com migration pendente**.
3. Com migration nova: rodar **Apply DB migrations** (Actions, digitar `APLICAR`; faz backup e
   aplica) e depois **Deploy**. Ou aplicar antes do merge pelo terminal:

   ```bash
   npm run db:backup
   npx wrangler d1 migrations apply niso-db --remote
   ```

4. Conferir o que está no ar: `curl -s https://n360.ness.com.br/health` devolve o SHA do commit
   publicado (`version`) e o `app_url`.
5. Sem Actions (minutos esgotados, GitHub fora): `scripts/publicar.sh` publica da máquina do dono,
   com a suíte como portão. Runbook: [`docs/runbook-publicacao.md`](docs/runbook-publicacao.md).

| Workflow | Quando roda | O que garante |
|---|---|---|
| CI (`ci.yml`) | pull request | tsc, suítes, build, E2E, `npm audit` (informativo) |
| CodeQL (`codeql.yml`) | push, PR e semanal; pulado em repositório privado | SAST do Worker e do frontend |
| Deploy (`deploy.yml`) | push na `main` e manual (só o manual roda a suíte) | Recusa com migration pendente; injeta o SHA em `/health` |
| Apply DB migrations (`db-migrate.yml`) | manual, com confirmação | Backup antes de aplicar |
| Backup do D1 (`db-backup.yml`) | diário | Exporta e verifica o dump |
| Sonda externa (`uptime.yml`) | manual | `/health` e o login respondem como devem em `n360` e em `niso` (vigilância contínua: monitor externo e sonda interna, `docs/runbook-incidente.md`) |
| SLO (`slo.yml`) | a cada 6 h | Latência e taxa de erro |
| Drift de schema (`schema-drift.yml`) | semanal | `schema.sql` contra o D1 real |
| Conferência de dados (`conferencia-dados.yml`) | manual | Contagens de produção, só leitura |

### Configuração

Bindings em `wrangler.jsonc` (`grep '"binding"' wrangler.jsonc`): `DB`, `SESSIONS`, `OAUTH_KV`,
`STORAGE`, `TRILHA`, `AI`, `ANALYTICS`, `CF_VERSION_METADATA`, `ASSETS`.

Variáveis públicas, versionadas: `ENVIRONMENT`, `APP_URL`, `EXPORT_PUBLIC_KEY`,
`TURNSTILE_SITE_KEY`; opcionais `CF_ACCOUNT_ID` e `AI_GATEWAY_ID`.

Segredos (`npx wrangler secret put <NOME>`; só o nome aqui, nunca o valor):

| Segredo | Sem ele |
|---|---|
| `TOKEN_ENC_KEY` | Configurar SSO devolve 503 (o `client_secret` não é gravado em claro) e o histórico da importação não é processado (sem pseudonimização, nada vai ao modelo). |
| `TURNSTILE_SECRET_KEY` | O desafio anti-abuso não é exigido; só liga em par com `TURNSTILE_SITE_KEY`. |
| `SETUP_KEY` | A rota de criação do primeiro usuário fica desligada. |
| `RESEND_API_KEY` | E-mail não sai. |
| `EXPORT_SIGNING_KEY` | Export de portabilidade sai sem assinatura. |

## Documentação

| Documento | Para quê |
|---|---|
| [`docs/README.md`](docs/README.md) | Índice da documentação, agrupado por quando você vai precisar |
| [`AGENTS.md`](AGENTS.md) | Contexto canônico para quem (ou o que) mexe no código, com o comando que mede cada número |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Ambiente, verificação antes do PR, regras de schema e de teste |
| [`SECURITY.md`](SECURITY.md) | Como reportar vulnerabilidade e os invariantes que não podem regredir |
| [`CHANGELOG.md`](CHANGELOG.md) | O que mudou, versão a versão |
| [`docs/runbook-incidente.md`](docs/runbook-incidente.md) | Produção quebrou: comece aqui |
| [`docs/design/diagnostico-2026-10-12/`](docs/design/diagnostico-2026-10-12/README.md) | Diagnóstico de design do n.360, do n.iso e do n.privacy |
| [`migrations/README.md`](migrations/README.md) | Procedimento e estado das migrations |
| [`backups/README.md`](backups/README.md) | Backup e restauração do D1 |

## Licença

Proprietária — © 2026 ness. Cybersecurity. Todos os direitos reservados. Ver
[`LICENSE`](LICENSE). Visualizar o repositório não concede direito de uso, cópia ou distribuição.
Componentes de terceiros (ex.: skills adaptadas sob MIT) mantêm a própria licença e atribuição.
