# Como contribuir

Este repositório é o n.360 em produção (a plataforma e os módulos n.iso e n.privacy),
processando dados de conformidade e dados pessoais de clientes reais. As regras abaixo existem por causa de
defeitos que já aconteceram aqui — não por formalidade.

## Ambiente

```bash
npm ci
npm ci --prefix frontend
npm run dev            # worker local em http://localhost:8787 (/login, /iso, /privacy)
```

O banco local é um D1 em `.wrangler/`. Para criá-lo do zero:

```bash
npx wrangler d1 execute niso-db --local --file=./schema.sql
npx wrangler d1 migrations apply niso-db --local
```

## Antes de abrir o PR

```bash
npx tsc --noEmit                                  # sem erro
npx vitest run <arquivos de teste que você tocou> # a suíte completa é do CI
cd frontend && npx vitest run <arquivos> && npm run build   # se tocou a UI
cd frontend && npm run test:e2e                   # se tocou casca, menu ou navegação (Chromium sobre o build)
cd mcp-server-niso && npm run build               # se tocou o servidor MCP
npm run skills:gerar                              # se tocou agent-skills/ (commite src/mcp/skills-gerado.ts)
npm run openapi                                   # se tocou schema Zod de rota (commite docs/openapi.json)
```

Catracas que reprovam o PR mesmo sem você ter tocado no assunto delas:

| Teste | Reprova |
|---|---|
| `test/any-catraca.test.ts` | `any` em `src/` acima do `TETO`; e também abaixo dele: quem tipou baixa o `TETO` no mesmo PR |
| `test/colunas-catraca.test.ts` | Coluna escrita por INSERT/UPDATE que não existe no schema aplicado |
| `test/modulos-produto.test.ts` | Rota de projeto sem faixa (`nucleo`, `iso` ou `privacy`) em `src/modulos.ts` |
| `frontend/test/catracas-visuais.test.js` | Cor em hex nas telas, `border-radius` inline fora de `0`/`10px`, `confirm`/`alert`/`prompt` nativos, estado vazio fora de `renderEmptyState` |
| `test/sem-dado-de-cliente.test.ts` | Nome, e-mail ou identificador de cliente real |
| `test/workflows-actions-sha.test.ts` | Action do GitHub sem SHA fixo |

O CI (`.github/workflows/ci.yml`) roda mais do que isso: a suíte completa do worker e do
frontend **com cobertura** (a catraca de cobertura reprova se cair), o E2E em Chromium
(`frontend/e2e/`) e `npm audit --audit-level=high` nos três pacotes (informativo). O ruleset da
`main` exige os checks `test` e `e2e` verdes, com a branch em dia com a base.

## Branch e commit

- Branch sempre a partir de **`origin/main`** (`git fetch && git switch -c <nome> origin/main`),
  nunca da `main` local: uma `main` local com commits não publicados já vazou trabalho alheio
  para um PR (#204, revertido no #206).
- Nome pelo assunto: `fix/…`, `feat/…`, `docs/…`, `chore/…`, `test/…`.
- Commit em português, no padrão conventional (`fix:`, `feat:`, `docs:`, `chore:`, `test:`).
- Mensagem de commit no imperativo, explicando **por quê**, não o quê — o diff já
  diz o quê.
- Um PR resolve um problema. PR que faz três coisas é revisado como zero.
- Preencha o template de PR. A seção "Ações necessárias após o merge" não é
  opcional: **merge não coloca nada em produção**, e quem faz o deploy precisa
  saber o que aplicar.

## Banco de dados

Esta é a fonte de defeito mais cara do repositório. Já aconteceu de o código
consultar tabela que não existia em produção.

1. Toda mudança de schema entra em **dois** lugares: `schema.sql` (o canônico,
   usado para criar banco novo) e uma migration numerada em `migrations/`.
2. `test/schema-contract.test.ts` roda `schema.sql` contra um D1 real e verifica
   que as colunas que o código usa existem. Coluna nova sem cobertura ali é
   coluna que vai faltar em produção.
3. Ordem importa em `schema.sql`: índice depois da tabela. Um `CREATE INDEX`
   antes do `CREATE TABLE` derruba a criação do banco inteiro — e só aparece em
   banco novo, nunca no seu, que já tem a tabela.
4. O cabeçalho da migration diz o que verificar antes de aplicar em produção.
   Migration que reconstrói tabela com PII exige `PRAGMA table_info` antes.
5. Número da migration nova: o seguinte ao da última (`ls migrations/*.sql | tail -1`), com 4
   dígitos. Antes de abrir o PR, confira se outro PR aberto não pegou o mesmo número. Leia
   [`migrations/README.md`](migrations/README.md): 0011 é neutralizada e 0031–0033 não existem.
6. Migration não sai do PR para a produção sozinha: o deploy recusa com migration pendente.
   O caminho (aplicar antes pelo terminal, ou mergear e rodar *Apply DB migrations*) está no
   [`README.md`](README.md#publicar).

## Testes

Teste que passa sem exercitar o código não é teste — é decoração. A suíte antiga
mockava o D1 devolvendo `{ok: true}` para qualquer query, e por isso não pegou
nenhum dos defeitos reais. Hoje nenhum arquivo de teste mocka o D1 inteiro (ver o
`AGENTS.md`, com o comando que mede).

- Caminho novo de banco → teste de integração com D1 real (miniflare), no estilo
  de `test/schema-contract.test.ts`.
- Autenticação, autorização, isolamento de tenant → teste que confirma o **403**,
  não só o 200 do caminho feliz. Rota do n.privacy: o projeto do teste precisa do módulo
  (`habilitarPrivacy(...)` de `test/helpers/d1.ts`), e o 403 sem o módulo também se testa.
- Lógica não trivial (parser, cálculo, guarda de segurança) deixa uma verificação
  executável para trás.

## Segurança

Leia `SECURITY.md` — a tabela de invariantes lista o que não pode regredir e onde
cada um é garantido. PR que toca um deles precisa dizer no corpo qual e por quê.

Nunca no repositório: chave, token, ID de conta, hostname interno, dado de cliente ou nome
de pessoa real (`test/sem-dado-de-cliente.test.ts` reprova). O repositório é público. Segredo vai em
`wrangler secret put`. Vulnerabilidade não vira issue pública — veja `SECURITY.md`.

## Estilo

Siga o código ao redor. O repositório é PT-BR: comentário, mensagem de erro e
texto de UI em português. Sem framework no frontend — é Vanilla JS por decisão,
não por falta de tempo.

Comentário explica **por que**, não o que. Comentário que narra a linha seguinte
é ruído que envelhece.
