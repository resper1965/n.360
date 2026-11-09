# Validade e reavaliação do fornecedor (fatia 2) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a validade da avaliação não passa do prazo do modelo do tipo, e a avaliação feita noutro tipo deixa de valer ("Reavaliar").

**Architecture:** sem migration (a 0106 já trouxe `avaliacoes_terceiro.tipo_avaliado`). `prazoDoTipo` em `src/services/fornecedor-modelos.ts`;
`registrarAvaliacao` confere o teto e grava `tipo_avaliado`; `situacaoDe` ganha `reavaliar`; painel, encarregado e telas passam a conhecê-la.

**Spec:** `docs/superpowers/specs/2026-11-09-ciclo-avaliacao-fornecedor-design.md`, seção 3 (fatia 2 da seção 8).

## Global Constraints

- Teto: `valido_ate` ≤ hoje (São Paulo) + `prazo_meses` do modelo do tipo ATUAL, da organização do projeto; acima, 400 com a data máxima.
- `tipo_avaliado` é gravado pelo servidor em toda avaliação (manual, questionário, importação); nunca vem do corpo.
- `reavaliar`: avaliação mais recente não reprovada, no prazo, com `tipo_avaliado` diferente do tipo atual. Não conta como vigente; o selo e o
  painel a contam como pendente (não como atraso). Vencida continua vencida; reprovada continua reprovada.

---

### Task 1: servidor
- `src/services/fornecedor-modelos.ts`: `prazoDoTipo(db, projectId, tipo): Promise<number>` (semeia e lê `fornecedor_modelos`) e
  `somarMeses(dia, n): string` (AAAA-MM-DD, UTC).
- `src/services/terceiros.ts`: `Avaliacao.tipo_avaliado`; `COLS_AVALIACAO` com a coluna; `Situacao` com `reavaliar`;
  `situacaoDe(ultima, em = hoje(), tipoAtual = null)`; `listarTerceiros` passa o tipo; `registrarAvaliacao` confere o teto (400
  "A validade passa do prazo máximo do tipo (N meses): até dd/mm/aaaa") e grava `tipo_avaliado`; `lerTerceiro` devolve `validade_maxima`.
- `src/services/painel.ts` (selo `fornecedores.pendentes`) e `src/services/encarregado.ts` (`pendentes`, `com_pendencia`) contam `reavaliar`.
- Teste `test/reavaliacao-fornecedor.test.ts` (D1 real): teto pelo prazo do modelo (e pelo prazo editado), 400 acima dele, `tipo_avaliado`
  gravado, criticidade que troca o tipo vira `reavaliar` com a pendência "Avaliação", avaliação nova no tipo atual volta a `vigente`, selo e
  encarregado contam como pendente; `situacaoDe` puro em `test/terceiros.test.ts`.

### Task 2: telas
- `frontend/src/views/terceiros.js`: `SITUACOES.reavaliar` ("Reavaliar", aviso); na ficha, "Reavaliar: o tipo mudou de X para Y"; o campo
  "Vale até" da nova avaliação vem com `validade_maxima` e `max`.
- `frontend/src/views/avaliacoes-terceiros.js`: grupo "Reavaliar: tipo mudou" depois de "Vencidas"; reprovadas sobem para junto das vencidas.
- Testes jsdom em `terceiros-view.test.js` e `avaliacoes-terceiros-view.test.js`.

### Task 3: documentação, gate e PR
- `AGENTS.md`, `CHANGELOG.md`, `docs/roteiro-aceite.md` (passo da reavaliação), spec (fatia 2 construída). Gate; PR; Codex; merge só com o OK do dono.
