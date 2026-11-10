# Requisito "não aplicável" — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** um quarto estado de cobertura, `nao_aplicavel`, por projeto, com justificativa, autor e data, marcado só pela equipe.

**Architecture:** migration 0107 (`requisito_exclusoes`, também no `schema.sql`); `lacunasDaFonte` lê as exclusões no mesmo batch e
herda pelo `pai_id`; `resumoDeLacunas` tira os não aplicáveis do `total`; rotas `PUT/DELETE .../requisitos/:requisitoId/exclusao`
(faixa privacy, segmento `requisitos`); decisão `niso_excluir_requisito`; tela de Requisitos.

**Spec:** `docs/superpowers/specs/2026-11-09-requisito-nao-aplicavel-design.md`.

## Global Constraints

- Justificativa: `trim` de 20 a 2000 caracteres (CHECK no banco e zod na rota). `decidido_por` = e-mail da sessão; `decidido_em` = agora.
- Só `ehEquipeNess` grava (o agente pela decisão confirmada); `org_admin`, `client` e chave de API: 403.
- A trilha (`requisito.excluido`, `requisito.reincluido`) nunca leva a justificativa.
- `total` do resumo = `cobertos + parciais + lacunas`; `nao_aplicaveis` à parte.
- Filho de requisito excluído: `PUT` 409 ("a decisão é no requisito <ref>"); a tela não oferece o botão.

---

### Task 1: dados e cálculo
- `migrations/0107_requisito_exclusoes.sql` e o bloco em `schema.sql` (depois de `requisitos`), como na spec.
- `src/services/requisitos.ts`: `Lacuna.situacao` ganha `'nao_aplicavel'` e `exclusao?: { justificativa, decidido_por, decidido_em,
  herdada_de?: string }` (referência do ancestral); quinta consulta no batch (`SELECT requisito_id, justificativa, decidido_por,
  decidido_em FROM requisito_exclusoes WHERE project_id = ?1 AND requisito_id IN (fonte)`); a exclusão sobe pela cadeia `pai_id`
  (mapa id → requisito; para cada item, o primeiro ancestral, ele incluído, com exclusão). `resumoDeLacunas` com `nao_aplicaveis` e o
  `total` dos aplicáveis. `excluirRequisito(db, projectId, requisitoId, justificativa, ator)` e `reincluirRequisito(...)`: 404 sem o
  requisito, 409 com ancestral excluído, UPSERT/DELETE e `logAudit` sem o texto.
- `src/services/encarregado.ts`: a seção `lgpd` usa `resumoDeLacunas(lacunas)`.
- Testes: `test/requisito-nao-aplicavel.test.ts` (D1 real): cálculo (direto, herdado, com documento vigente), resumo, encarregado;
  contrato do schema e da migration.

### Task 2: rotas e agente
- `src/routes/requisitos.ts` (`projetoRequisitosApp`): `PUT /requisitos/:requisitoId/exclusao` (`requisitoExclusaoSchema` em
  `src/schemas`, `{ justificativa }` estrito) e `DELETE`, com `ehEquipeNess`.
- `src/middleware/decisoes-agente.ts`: ferramenta `niso_excluir_requisito`, ações `excluir` (PUT, corpo) e `reincluir` (DELETE); a
  descrição em `src/mcp/servidor.ts`. `src/openapi.ts` e `npm run openapi`.
- Testes no mesmo arquivo: 400, 403 (cliente, chave), 200, 404, 409, DELETE volta a lacuna, trilha sem o texto; agente com e sem decisão.

### Task 3: tela, MCP e documentação
- `frontend/src/views/requisitos.js`: `SITUACAO.nao_aplicavel` (neutro), cartão e filtro "Não aplicáveis", a justificativa, o autor e a
  data (ou "herdada de X") na coluna "O que atende"; no detalhe do requisito (`abrirRequisito`), para a equipe, "Marcar como não
  aplicável" (`pedirTexto`, 20+ caracteres) e "Voltar a aplicar"; herdado sem botão. Teste jsdom em `frontend/test/requisitos-*.test.js`.
- `src/mcp/contexto.ts` e skill `correcao-e-ajustes` (+ `npm run skills:gerar`).
- AGENTS.md (parágrafo do catálogo de requisitos, contagem das decisões), CHANGELOG, roteiro de aceite, spec construída, este plano para
  `docs/arquivo/planos/`. Gate; PR; Codex; migration com backup e o "sim"; merge com o OK.
