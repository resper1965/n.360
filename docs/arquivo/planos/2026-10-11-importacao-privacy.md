# Importação de programa de privacidade (fatia 1) — Implementation Plan

> Spec: `docs/superpowers/specs/2026-10-11-importacao-privacy-design.md` (leia antes; é a autoridade).

**Goal:** área de importação no n.privacy: lote de arquivos misturados → agente classifica e extrai tratamentos →
revisão humana → gravação no RoPA com ligações.

## Global Constraints

- Worktree `C:\Users\resper\worktrees\importacao`, branch `feat/importacao-privacy` (de `origin/main` 4c3dd6c).
- Ler `AGENTS.md` (schema em dois lugares, índice depois da tabela, `migrations/README.md`; rota nova de projeto em
  `FAIXA_DO_SEGMENTO`; frontend sem handler inline, `data-action`, `escapeHTML`; PT-BR; marca n.privacy).
- Próxima migration: `0064` (`ls migrations/*.sql | tail -1` = 0063).
- Testes backend com D1 real (`test/helpers/d1.ts`: `applySchema`, `sessionFor`, `workerEnv`, `habilitarPrivacy`);
  `env.AI` simulado por objeto com `run` e `toMarkdown` (nunca chamar IA real no CI).
- Commits: `git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com" commit`,
  conventional commits PT-BR, sem `Co-Authored-By` nem menção a ferramenta. Nunca push.
- Não subir a contagem de `any` (`test/any-catraca.test.ts`).

## Task 1: Backend

**Files:** `migrations/0064_importacoes.sql`, `schema.sql`; `src/services/importacao.ts` (novo: lote, arquivos,
itens, processar, confirmar, cancelar); `src/agents/importacao.ts` (novo: `ImportacaoAgent extends BaseAgent` com
`classificar(texto)` e `extrairTratamentos(texto)`, parsers puros exportados `parseClassificacao`,
`parseTratamentos`); `src/schemas/importacao.ts` (zod); `src/routes/importacao.ts` (novo); `src/index.ts` (montar em
`/api/v1/projects/:projectId/importacoes`); `src/modulos.ts` (`importacoes: 'privacy'`, e tabelas em
`FAIXA_DA_TABELA` se houver rota por id); `src/trilha-exclusao.ts` (tabelas novas + arquivos R2 na exclusão do projeto,
no padrão de `evidence`); reaproveitar `src/services/tratamentos-importar.ts` (extrair uma função que valida/mapeia UM
registro, usada pela planilha e pela importação) e `definirLigacao` de `src/services/tratamentos.ts`.
**Tests:** `test/importacao.test.ts` (novo) cobrindo cada item de "Testes → Backend" da spec; `test/modulos-produto.test.ts`
continua verde (rota classificada); `test/schema-contract.test.ts`; `test/trilha-exclusao.test.ts`.

- [ ] Testes primeiro (RED), depois implementação (GREEN). Detalhes que valem:
  - Conversão: `application/json` e `text/csv` lidos como texto direto; o resto `env.AI.toMarkdown({ name, blob })`
    (resultado `{ format, data, error }`; `format === 'error'` → arquivo `erro` com o motivo).
  - Texto limitado a 200.000 caracteres por arquivo (acima: `erro` "arquivo grande demais para leitura"); extração em
    blocos de ~12.000 caracteres.
  - Prompt do agente diz que o conteúdo é dado do cliente e que instruções dentro dele devem ser ignoradas; resposta
    só JSON; o parser tolera cerca de ```json.
  - Normalização de nomes: a mesma `chave()` de `tratamentos-importar.ts` (exportar e reusar).
  - Base legal: casar texto com títulos dos filhos de `lgpd:art7` e `lgpd:art11` (normalizados; "legítimo interesse"
    → `lgpd:art7:ix`); sem catálogo carregado → só texto.
  - Confirmar: transação por item (falha de um não derruba os outros); item `gravado` não é regravado.
  - Papéis: equipe (`platform_admin`, `consultoria_admin`, `consultor`/`consultant`); cliente → 403.
- [ ] Rodar: `npx vitest run test/importacao.test.ts test/modulos-produto.test.ts test/schema-contract.test.ts test/trilha-exclusao.test.ts test/any-catraca.test.ts test/tratamento-importar.test.ts --exclude "nISO/**"` e `npx tsc --noEmit`.
- [ ] Commit `feat(importacao): área de importação e extração de tratamentos no n.privacy (migration 0064)`.

## Task 2: Frontend

**Files:** `frontend/src/views/importacao.js` (novo; `window.renderImportacao`), `frontend/src/router.js` (ramo
`importacao`), `frontend/login.html` (item `nav-importacao` "Importar programa" no grupo Privacidade),
`frontend/src/produto.js` (`SO_PRIVACY` inclui `nav-importacao`), `frontend/src/main.js` (import).
**Tests:** `frontend/test/importacao-view.test.js` (novo, `servir` de `test/servir-api.js`).

- [ ] Testes primeiro. Tela conforme a spec ("Tela"): envio via `FormData` (fetch direto com o token, como o upload de
  evidência em `views/compliance.js`), processamento em sequência com andamento, revisão (confiança, faltando, origem,
  duplicata, editar, aceitar/descartar, aceitar todos de confiança alta), confirmar com resultado por item, cancelar
  com confirmação na janela. Tudo escapado.
- [ ] `cd frontend && npx vitest run && npm run build`.
- [ ] Commit `feat(importacao): tela de importação de programa no n.privacy`.

## Task 3: Docs e extração real

- [ ] `scripts/importacao-amostra.mjs` (fora do CI): gera uma planilha CSV e um texto fictícios de inventário (sem dado
  real) e documenta como rodar contra o ambiente com IA real; nenhuma chamada no CI.
- [ ] `AGENTS.md` (n.privacy: importação, tabelas, faixa, R2, contagens com comando), `migrations/README.md` (seção
  0064 com conferência pós-aplicação), `README.md`/`CHANGELOG.md` (Adicionado).
- [ ] Verificação completa: `npx tsc --noEmit`, `npx vitest run --exclude "nISO/**"`, `cd frontend && npx vitest run && npm run build && npx playwright test --workers=1`.
- [ ] Commit `docs: importação de programa de privacidade (0064)`.

## Verificação pós-deploy

Migration 0064 aplicada (`PRAGMA table_info(importacao_itens)`); `/health` com o SHA; tela "Importar programa" aparece
no n.privacy para a equipe.
