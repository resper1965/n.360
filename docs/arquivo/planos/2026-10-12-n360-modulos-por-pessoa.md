# n.360 fatia 3 — módulos por pessoa — Implementation Plan

> Spec: `docs/superpowers/specs/2026-10-12-n360-modulos-por-pessoa-design.md` (autoridade).

## Global Constraints

- Worktree `C:\Users\resper\worktrees\fatia3`, branch `feat/n360-modulos-por-pessoa` (de `origin/main` 04778c9).
- Ler `AGENTS.md` e `migrations/README.md`. Schema em dois lugares (índice depois da tabela). Testes com D1 real.
- Migration nova: **0066** (a 0065 está no PR `feat/catalogo-contrato-agente`, que entra antes; se ao abrir o PR a
  0065 ainda não estiver na main, rebasear depois que ela entrar).
- Commits: `git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com" commit`,
  PT-BR, sem atribuição. Nunca push.
- Não subir `any` (`test/any-catraca.test.ts`).

## Task 1: Backend

Files: `migrations/0066_modulos_por_pessoa.sql`, `schema.sql`, `src/modulos.ts` (`modulosDaPessoa`,
`recusaDaPessoa`), `src/middleware/project-access.ts`, `src/helpers.ts` (`requireResourceAccess`),
`src/routes/users.ts` (PUT `/:id/modulos`, `POST` com `modulos`, troca de projeto), `src/schemas/users.ts`,
`src/routes/auth.ts` (`/auth/me` com `modulos`), `src/middleware/agente.ts` (principal do agente leva os módulos do
consultor), chaves de API (módulos do projeto). Tests: `test/modulos-por-pessoa.test.ts` (novo) + ajustes nos testes
que criam contas e esperam acesso a rota iso/privacy (dar módulos no helper de teste, ex. `test/helpers/d1.ts`
`habilitarPrivacy` passa a conceder também às contas do projeto, ou um helper `concederModulos`).
- [ ] TDD: migração (normalização; carga por tipo; idempotente); regra (pessoa sem módulo → 403 em rota iso/privacy de
  projeto que tem; núcleo livre; platform_admin, chave, agente); conceder (quem pode, teto, trilha antes/depois, conta
  nova com padrão e com `modulos`, troca de projeto); `/auth/me`.
- [ ] Rodar a suíte inteira do backend (`npx vitest run --exclude "nISO/**"`) — a regra nova toca todas as rotas de
  módulo; conferir falhas isoladas. `npx tsc --noEmit`.
- [ ] Commit `feat(n360): módulos por pessoa, com carga inicial e papéis normalizados (migration 0066)`.

## Task 2: Frontend

Files: `frontend/src/views/admin.js` (modal de usuário: caixas de módulos até o teto; coluna na lista),
`frontend/src/views/organizacoes.js` (contrato da organização, só platform_admin, usa `PUT /platform/orgs/:id/modulos`),
`frontend/src/produto.js` (`projetosDoProduto` e início consideram `S.user.modulos`; platform_admin vê tudo).
Tests jsdom correspondentes.
- [ ] TDD, `cd frontend && npx vitest run && npm run build && npx playwright test --workers=1`.
- [ ] Commit `feat(n360): telas de módulos por pessoa e contrato da organização`.

## Task 3: Docs

AGENTS.md (regra de acesso por pessoa; papéis normalizados; contagens com comando), migrations/README.md (0066 com
conferência: `SELECT role, count(*) FROM users GROUP BY role` sem papéis legados; `SELECT count(*) FROM usuario_modulos`),
CHANGELOG.
