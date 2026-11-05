# Aprovação em lote Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aprovar vários pedidos e evidências com uma senha, e aceitar vários itens de importação de uma vez, sem enfraquecer a prova.

**Architecture:** Extrai o miolo das aprovações individuais (`decidirPedido`, `assinarEvidencia`) para funções que devolvem `{ status, corpo }`; a rota individual e o lote chamam as mesmas. Lote em `POST /api/v1/pedidos/lote`; importação ganha `.../itens/decidir`.

**Tech Stack:** TypeScript (Hono, Zod, D1), vitest (`cloudflare:test`), frontend vanilla JS (vitest/jsdom).

**Spec:** `docs/superpowers/specs/2026-10-14-aprovacao-em-lote-design.md`

## Global Constraints

- Sem migration; a aprovação individual não muda de comportamento (os testes dela seguem verdes).
- Teto de 50 itens por lote de aprovação e 200 por lote de importação.
- Sem nome de cliente ou pessoa real em teste, fixture ou doc.
- Rota nova entra em `src/openapi.ts` (rodar `npm run openapi`) e em `FORA_DO_AGENTE` (`src/middleware/agente.ts`).
- Commits com `user.email=44273656+resper1965@users.noreply.github.com`; branch a partir de `origin/main`.

---

### Task 1: Extrair `decidirPedido` e `assinarEvidencia`

**Files:** Modify `src/routes/pedidos.ts` (`decidir`), `src/routes/evidence.ts` (`handleApprove`).

**Interfaces:**
- Produces: `type Resultado = { status: number; corpo: Record<string, unknown> }`;
  `decidirPedido(c, user, pedidoId, decisao: 'aprovar' | 'recusar', a: { senha: string | null; dbUser?: DbUser; motivo?: string | null; hashVisto?: string }): Promise<Resultado>` e
  `assinarEvidencia(c, user, id, a: { senhaVerificada: boolean; password?: string; fileHash?: string; role?: string | null }): Promise<Resultado>`, com `export`.

- [ ] Reescrever cada `return c.json(x, s)` do miolo como `return { status: s ?? 200, corpo: x }` e fazer a rota chamar a função e responder `c.json(r.corpo, r.status as any)`.
- [ ] Rodar `npx vitest run test/pedidos*.test.ts test/evidence*.test.ts test/documentos-aprovacao.test.ts test/api.test.ts` (devem seguir verdes: é refatoração).
- [ ] Commit `refactor(aprovacoes): extrai decidirPedido e assinarEvidencia`.

### Task 2: `POST /api/v1/pedidos/lote`

**Files:** Modify `src/routes/pedidos.ts` (rota), `src/schemas/*` (`aprovacaoLoteSchema`), `src/middleware/agente.ts`, `src/openapi.ts` + `npm run openapi`. Test: `test/aprovacao-lote.test.ts`.

- [ ] **Teste primeiro:** lote misto (pedido aprovado; pedido com `hash_visto` errado; pedido de outro destinatário; pedido já decidido; evidência assinada; evidência do próprio autor), senha errada (401, nada muda), 51 itens (400), `tipo` desconhecido (400), trilha `aprovacao.lote`.
- [ ] Ver falhar; implementar a rota: valida o corpo, confere a senha uma vez, laço por item (try/catch por item: `ForbiddenError` e afins viram `ignorado`), `logAudit('aprovacao.lote', ...)`.
- [ ] Rodar o teste, `npm run openapi`, `npx tsc --noEmit`; commit `feat(aprovacoes): aprovação em lote de pedidos e evidências`.

### Task 3: Importação, `POST .../itens/decidir`

**Files:** Modify `src/routes/importacao.ts`, `src/services/importacao.ts` (se a decisão item a item estiver lá), `src/schemas/*`, `src/middleware/agente.ts` (já cobre `/importacoes`), `src/openapi.ts`. Test: `test/importacao-decidir-lote.test.ts`.

- [ ] Teste primeiro: aceita três itens pendentes; ignora item já gravado e id de outro lote; 409 com lote `gravando`; cliente leva 403.
- [ ] Implementar reaproveitando a função que o `PUT .../itens/:iid` já usa; commit `feat(importacao): aceitar e descartar itens em lote`.

### Task 4: Tela

**Files:** Modify `frontend/src/views/meus-pedidos.js` (ou a tela de "Minhas aprovações"), a revisão da importação; Create `frontend/src/views/aprovacao-lote.js`. Test: `frontend/test/aprovacao-lote.test.js`.

- [ ] Teste primeiro (api real com `servir`): caixa só habilita depois de abrir; "Aprovar selecionados" abre modal com contagem e senha; manda `{ senha, itens: [{tipo,id,hash_visto}] }`; mostra o resumo e os motivos; senha nunca fica no DOM depois de enviar.
- [ ] Implementar; suíte do frontend; commit `feat(aprovacoes): tela de aprovação em lote`.

### Task 5: Documentação e entrega

- [ ] CHANGELOG e `AGENTS.md` (parágrafo de pedidos: "o lote chama as mesmas funções; não é caminho novo"), `docs/agente/seguranca.md` se listar rotas fora do agente.
- [ ] `tsc`, testes relacionados, push, PR, CI, merge (cada merge pede a confirmação do dono) e `/health`.
