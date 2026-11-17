# Onda 2: catálogo único de requisitos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `requisitos` vira o catálogo de todos os frameworks existentes (inclui os 25 itens da ONS RO-CB.BR.01), com uma leitura única de situação e progresso por framework, **sem mudar os números que o cliente vê hoje**.

**Architecture:** Primeiro trava-se o comportamento atual com testes de caracterização (PR1, sem migration). Depois uma migration só aditiva acrescenta colunas e as 25 linhas ONS em `requisitos` (mesmos ids de `ot_requisitos`), com trava de fonte para agente, chave de API e quem não tem `ot`. A avaliação continua onde está (`compliance_controls`, `ot_avaliacoes`); a situação única é **derivada por função**, sem regravar status. A validação de mapeamento passa a ser por par de fontes, com prévia exata do efeito.

**Tech Stack:** Cloudflare Worker (Hono) + D1, vitest (`@cloudflare/vitest-pool-workers`), SPA vanilla JS.

**Spec:** `docs/superpowers/specs/2026-11-17-onda2-catalogo-de-requisitos-design.md` (aprovada em 17/11/2026). Levantamento (arquivo:linha e comandos): `/tmp/claude-0/-home-user/0c1d5499-e055-503d-a651-849433c76e01/scratchpad/onda2-levantamento.md`.

## Global Constraints

- **Os três números não mudam**: indicador do n.iso ("X de Y controles aplicáveis implementados", soma de todas as normas do projeto, `src/services/prontidao.ts:154-158`), cobertura LGPD/ANPD (`src/services/requisitos.ts` `lacunasDaFonte`/`resumoDeLacunas`) e resumo do assessment do n.ot (`src/services/ot-avaliacao.ts:97-107`). Os testes da Task 1 precedem tudo e ficam verdes até o fim.
- **Nada de texto normativo de memória de modelo.** `texto` só em fonte cuja licença permite (ONS e lei sim; ISO nunca). Os 25 textos da ONS vêm da migration 0090 (já conferida contra o PDF): copiar de `ot_requisitos.descricao`, não reescrever.
- **P0-1** (`ot` nunca concedido automaticamente) e **P0-2** (agente e chave de API nunca no n.ot): a fonte ONS em `requisitos` não pode abrir caminho para eles.
- **Exportação de portabilidade nunca inclui tabela `ot_*`** (`src/portabilidade.ts:185`). `ot_avaliacoes` e `ot_requisito_evidencias` mantêm o nome.
- **Contratos do MCP e dos agentes só ganham campos**: ids `fonte:referencia` (exceção: ONS mantém o id atual `ons-ro-cb-br-01-rev00-<código>`), campo `status` em inglês nos controles, nomes `lgpd` e `anpd`, `GET /api/v1/requisitos?fonte=`, `GET /projects/:id/requisitos/lacunas`. Regenerar `docs/openapi.json` com `node scripts/gerar-openapi.mjs` quando um schema mudar.
- **Mapeamento proposto só conta depois de validado por uma pessoa**; `relacionado` nunca conta (regra de hoje, `lacunasDaFonte`).
- Migration: `schema.sql` e `migrations/0114_*.sql` juntos (conferir na main se `0114` está livre; `0113` é da onda 1 e pode ainda estar pendente), procedimento de `migrations/README.md` (backup, apply remoto, conferir, só então merge); só ADD COLUMN, INSERT OR IGNORE, tabela nova.
- Rotas que ganharem segmento novo precisam constar na tabela de segmentos de `src/modulos.ts` (há teste de cobertura).
- Texto de tela em português, sem estilo inline novo, sem handler inline (CSP).
- Comando de teste backend: `npx vitest run <arquivo>`; frontend: `NODE_OPTIONS=--no-experimental-webstorage npx vitest run --config <vitest do frontend em package.json> <arquivo>`. Gate final: `bash scripts/ci/gate.sh`.
- Dois PRs: **PR1** = Tasks 1-4 (sem migration), **PR2** = Tasks 5-10.

## File Structure

- `src/services/situacao-unica.ts` (novo): `situacaoUnica(status)`, `situacaoDoItemTecnico(s)` e o tipo `SituacaoUnica`.
- `src/services/requisitos.ts`: previa/validação por par, `fonteAceitaTexto`, filtro de fonte.
- `src/routes/requisitos.ts`, `src/schemas/requisitos.ts`: carimbo de sessão, par de fontes, prévia, filtro por módulo, `texto`.
- `src/services/prontidao.ts`, `src/services/painel.ts`: `por_norma` (aditivo).
- `src/services/situacao-requisitos.ts` (novo) + rota `GET /api/v1/projects/:projectId/requisitos-situacao`.
- `src/middleware/agente.ts` / `src/routes/requisitos.ts`: trava da fonte ONS.
- `migrations/0114_requisitos_catalogo_unico.sql`, `schema.sql`.
- `frontend/src/views/referencia-juridica.js`, `requisitos.js`, `bancada.js`, `monitor.js`.
- Testes: `test/onda2-numeros.test.ts` (novo), `test/situacao-unica.test.ts` (novo), `test/requisitos-catalogo-unico.test.ts` (novo) e os existentes de requisitos.

---

## PR1 — Base e números travados (sem migration)

### Task 1: Testes de caracterização dos três números

**Files:**
- Create: `test/onda2-numeros.test.ts`
- Read for setup: `test/prontidao*.test.ts`, `test/requisitos*.test.ts` (fixtures de projeto, controles, mapeamentos validados), `test/ot-avaliacao*.test.ts`

**Interfaces:**
- Produces: três grupos de testes que fixam, com dados de exemplo, os valores atuais. Nenhuma mudança em `src/`.

- [ ] **Step 1: Montar fixtures e escrever as asserções** (golden values vêm de **rodar o código atual**, conferidos à mão contra as regras do levantamento, seção 3):
  1. **Indicador do n.iso**: projeto com normas 27001:2022 e 27701:2025, controles com status `Implemented`, `Compliant`, `Partial`, `In Progress`, `Planned`, `Missing`, `Not Applicable` e um texto desconhecido. Afirmar `indicador.texto` e `{implementados, aplicaveis}` de `GET /api/v1/projects/:id/prontidao` e o `controles`/`estadoDoPrograma` do Painel (`painel.ts:351-352,450`). O teste deve mostrar que **todas as normas entram juntas** (sem filtro de `standard`).
  2. **Cobertura LGPD/ANPD**: `resumoDeLacunas(await lacunasDaFonte(db, projectId, 'lgpd'))` com: documento vigente, evidência `conforming` dentro da validade, evidência `partial`, controle `feito` ligado por mapeamento `validado_juridico` `equivalente`, o mesmo por `parcial`, controle `Planned` (não cobre), mapeamento `proposto` e `relacionado` (nunca cobrem) e um requisito excluído (`nao_aplicavel` fora do total). Afirmar o objeto `{total, cobertos, parciais, lacunas, nao_aplicaveis}`.
  3. **Assessment n.ot**: `montarAssessment` de um projeto com avaliações `atende`, `parcial`, `nao_atende`, `nao_se_aplica`, sem avaliação, e os 5 itens técnicos (`ITENS_TECNICOS`); afirmar o resumo (técnico conta `nao_atende` ou `nao_avaliado`, nunca `atende`; exceção 5.1.1 `nao_avaliado`).
- [ ] **Step 2: Rodar e ver passar** — `npx vitest run test/onda2-numeros.test.ts`. Expected: PASS na primeira execução (é caracterização). Se um valor não bate com a regra do levantamento, **pare e reporte**: é bug de entendimento ou bug do produto, não ajuste a expectativa.
- [ ] **Step 3: Mutação de sanidade** — mudar temporariamente `'Planned'` para contar como `parcial` em `lacunasDaFonte` e confirmar que o teste 2 falha; restaurar.
- [ ] **Step 4: Commit** — `git add test/onda2-numeros.test.ts && git commit -m "test(onda2): trava o indicador do n.iso, a cobertura LGPD/ANPD e o resumo do assessment do n.ot"`

### Task 2: Função de situação única derivada

**Files:**
- Create: `src/services/situacao-unica.ts`, `test/situacao-unica.test.ts`

**Interfaces:**
- Consumes: `classeDoControle` (`src/services/classe-controle.ts`).
- Produces:
  - `type SituacaoUnica = 'atende' | 'parcial' | 'nao_atende' | 'nao_se_aplica' | 'nao_avaliado'`
  - `situacaoUnica(status: string | null | undefined): SituacaoUnica`
  - `situacaoDoItemTecnico(s: 'nao_atende' | 'evidencia_no_inventario' | 'sem_evidencia' | null): { situacao: SituacaoUnica; derivado: string | null }`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from 'vitest';
import { situacaoUnica, situacaoDoItemTecnico } from '../src/services/situacao-unica';

describe('situacaoUnica (V1 → vocabulário único)', () => {
  const casos: [string | null | undefined, string][] = [
    ['Implemented', 'atende'], ['Compliant', 'atende'], ['APPROVED', 'atende'], ['COMPLETED', 'atende'], ['CONFORME', 'atende'],
    ['Partial', 'parcial'], ['In Progress', 'parcial'], ['qualquer coisa desconhecida', 'parcial'],
    ['Planned', 'nao_atende'],
    ['Missing', 'nao_avaliado'], ['NOT STARTED', 'nao_avaliado'], ['NOT_STARTED', 'nao_avaliado'], ['', 'nao_avaliado'], ['   ', 'nao_avaliado'], [null, 'nao_avaliado'], [undefined, 'nao_avaliado'],
    ['Not Applicable', 'nao_se_aplica'],
  ];
  it.each(casos)('%j → %s', (entrada, esperado) => expect(situacaoUnica(entrada)).toBe(esperado));
});

describe('situacaoDoItemTecnico (V3, D2: nunca vira atende)', () => {
  it('nao_atende fica nao_atende', () => expect(situacaoDoItemTecnico('nao_atende')).toEqual({ situacao: 'nao_atende', derivado: 'nao_atende' }));
  it('evidencia_no_inventario NÃO vira atende', () => {
    const r = situacaoDoItemTecnico('evidencia_no_inventario');
    expect(r.situacao).toBe('nao_avaliado');
    expect(r.derivado).toBe('evidencia_no_inventario');
  });
  it('sem_evidencia e nulo viram nao_avaliado', () => {
    expect(situacaoDoItemTecnico('sem_evidencia').situacao).toBe('nao_avaliado');
    expect(situacaoDoItemTecnico(null)).toEqual({ situacao: 'nao_avaliado', derivado: null });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/situacao-unica.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar**

```ts
// src/services/situacao-unica.ts
// Vocabulário único de situação de requisito (spec onda 2, decisões 2 e 3). DERIVADO: nada aqui regrava `compliance_controls.status`.
import { classeDoControle } from './classe-controle';

export type SituacaoUnica = 'atende' | 'parcial' | 'nao_atende' | 'nao_se_aplica' | 'nao_avaliado';

const PARCIAIS_CONHECIDOS = new Set(['PARTIAL', 'IN PROGRESS']);

/** V1 (`compliance_controls.status`, texto livre) → vocabulário único. `Planned` vale `nao_atende` (não cobre na LGPD hoje). */
export function situacaoUnica(status: string | null | undefined): SituacaoUnica {
  const classe = classeDoControle(status);
  if (classe === 'na') return 'nao_se_aplica';
  if (classe === 'feito') return 'atende';
  if (classe === 'falta') return 'nao_avaliado';
  const s = (status ?? '').trim().toUpperCase();
  if (s === 'PLANNED') return 'nao_atende';
  return PARCIAIS_CONHECIDOS.has(s) || s.length > 0 ? 'parcial' : 'nao_avaliado';
}

/** Item técnico do n.ot (derivado do inventário, D2): o inventário nunca prova que atende; `derivado` guarda o valor de origem. */
export function situacaoDoItemTecnico(s: 'nao_atende' | 'evidencia_no_inventario' | 'sem_evidencia' | null): { situacao: SituacaoUnica; derivado: string | null } {
  if (s === 'nao_atende') return { situacao: 'nao_atende', derivado: s };
  return { situacao: 'nao_avaliado', derivado: s };
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run test/situacao-unica.test.ts test/onda2-numeros.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add src/services/situacao-unica.ts test/situacao-unica.test.ts && git commit -m "feat(onda2): situação única derivada de status e do item técnico"`

### Task 3: Controles sempre ligados ao requisito + sonda de produção

**Files:**
- Modify: o que o levantamento indicar entre `src/services/project-setup.ts:40-50` (`stmtControles`), `src/routes/projects.ts:390-391,1070,1102`, `src/services/fechar-venda.ts:118-119`
- Create: `scripts/ops/sonda-onda2.sql` (ou o diretório de sondas que o repositório já usa; `ls scripts`)
- Test: `test/onda2-numeros.test.ts` (novo bloco) ou `test/requisitos-ligacao.test.ts`

**Interfaces:**
- Consumes: `ligarControles(db, projectId?)` (`src/services/requisitos.ts`).
- Produces: invariante "controle de 27001:2022 e 27701:2025 criado por qualquer caminho tem `requisito_id` quando o catálogo foi semeado".

- [ ] **Step 1: Escrever o teste que falha** — semear o catálogo (`semearCatalogo(env.DB)`), criar um projeto pelos três caminhos (criação de projeto, `POST .../seed-27001-2022`, `.../seed-27701-2025`, fechar venda) e afirmar `SELECT count(*) FROM compliance_controls WHERE project_id = ? AND standard IN (<27001:2022>,<27701:2025>) AND requisito_id IS NULL` = 0.
- [ ] **Step 2: Rodar e ver o resultado.** Se **já** passa (o `stmtControles` já define `requisito_id` pelo mesmo critério do código), o teste fica como travamento e **não se muda `src/`**: ver o Step 4 do levantamento ("ligarControles ... o mesmo critério do stmtControles"). Se falha, em cada caminho que falhar chamar `await ligarControles(db, projectId)` logo depois da criação dos controles.
- [ ] **Step 3: Sonda de produção** — arquivo SQL **somente leitura**, com comentário de cabeçalho dizendo que é para rodar com `wrangler d1 execute niso-db --remote --file ...` e **não altera nada**:

```sql
-- Sonda da onda 2 (somente leitura). Rodar ANTES da migration 0114 e guardar a saída no PR.
SELECT 'requisitos_por_fonte' AS sonda, fonte_id AS chave, count(*) AS n FROM requisitos GROUP BY fonte_id;
SELECT 'status_distintos' AS sonda, status AS chave, count(*) AS n FROM compliance_controls GROUP BY status ORDER BY n DESC;
SELECT 'controles_sem_requisito' AS sonda, standard AS chave, count(*) AS n FROM compliance_controls WHERE requisito_id IS NULL GROUP BY standard;
SELECT 'nao_aplicavel_sem_justificativa' AS sonda, 'Not Applicable' AS chave, count(*) AS n FROM compliance_controls
  WHERE status = 'Not Applicable' AND trim(COALESCE(description, '')) = '';
SELECT 'mapeamentos' AS sonda, estado AS chave, count(*) AS n FROM requisito_mapeamentos GROUP BY estado;
SELECT 'ot_requisitos' AS sonda, 'linhas' AS chave, count(*) AS n FROM ot_requisitos;
```

- [ ] **Step 4: Rodar** `npx vitest run test/onda2-numeros.test.ts test/requisitos*.test.ts test/projects*.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(onda2): controles sempre ligados ao requisito e sonda de produção"` (a sonda **não é executada** aqui: fica para o dono, antes da migration).

### Task 4: Carimbo da sessão em `POST` e `PUT /requisitos/mapeamentos`

**Files:**
- Modify: `src/schemas/requisitos.ts:22-35` (`mapeamentoSchema`), `src/routes/requisitos.ts` (POST ~`/mapeamentos`, PUT ~`/mapeamentos`), `frontend/src/views/requisitos.js:~297-302` (parar de mandar `validado_por`/`validado_em`)
- Test: `test/requisitos*.test.ts` (existentes) e `test/onda2-numeros.test.ts`

**Interfaces:**
- Produces: `validado_por` = e-mail da sessão e `validado_em` = hoje (`hojeEmSaoPaulo()`), definidos pelo servidor quando `estado = 'validado_juridico'`; `null` quando `proposto`. O corpo pode continuar trazendo os campos (compatibilidade), **mas são ignorados**.

- [ ] **Step 1: Teste que falha** — `PUT /api/v1/requisitos/mapeamentos` com `{ de_id, para_id, tipo: 'equivalente', estado: 'validado_juridico', validado_por: 'Fulano Qualquer', validado_em: '2020-01-01' }` pela sessão de `platform_admin` `pa@ness.lat`: depois, `SELECT validado_por, validado_em` do par = `pa@ness.lat` e a data de hoje (não os do corpo). Idem no `POST`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** No schema, remover a exigência de `validado_por`/`validado_em` do `superRefine` (manter os campos `nullish()` para não quebrar clientes que ainda os enviam). Nas duas rotas: `const por = m.estado === 'validado_juridico' ? c.get('user').email : null; const em = m.estado === 'validado_juridico' ? hojeEmSaoPaulo() : null;` e usar `por`/`em` no `bind` em lugar de `m.validado_por`/`m.validado_em`. Trilha (`logAudit`) inclui o e-mail.
- [ ] **Step 4: Frontend** — em `requisitos.js` parar de enviar os dois campos e remover o campo de digitar o nome, se houver; ajustar o teste do frontend correspondente (`frontend/test/requisitos*.test.js`).
- [ ] **Step 5: Rodar** `npx vitest run test/requisitos*.test.ts` e o teste do frontend → PASS; `node scripts/gerar-openapi.mjs` e commitar o diff se houver.
- [ ] **Step 6: Commit** — `git commit -m "fix(onda2): quem valida o mapeamento é a sessão, nunca o corpo"`

**Entrega PR1:** `bash scripts/ci/gate.sh`; PR (rascunho). Rodar a sonda de produção antes de começar o PR2 (precisa do dono).

---

## PR2 — Catálogo único (migration aditiva)

### Task 5: Migration 0114 e as 25 linhas ONS em `requisitos`

**Files:**
- Create: `migrations/0114_requisitos_catalogo_unico.sql`, `test/requisitos-catalogo-unico.test.ts`
- Modify: `schema.sql` (tabelas `requisitos` ~1411-1421 e `ot_requisitos` ~2240), `migrations/README.md` (ver Task 10)

**Interfaces:**
- Produces: colunas `requisitos.texto TEXT`, `requisitos.fonte_texto TEXT`, `requisitos.categoria TEXT`; `ot_requisitos.requisito_id TEXT REFERENCES requisitos(id)`; fonte `ons-ro-cb-br-01` em `requisito_fontes`; 25 linhas em `requisitos` com **o mesmo `id`** de `ot_requisitos`.

- [ ] **Step 1: Teste que falha**

```ts
it('a ONS está no catálogo com os mesmos ids, texto e categoria de ot_requisitos', async () => {
  const { results } = await env.DB.prepare(
    `SELECT o.id, o.codigo, o.titulo, o.descricao, o.categoria, r.id AS rid, r.fonte_id, r.referencia, r.titulo AS rtitulo, r.texto, r.categoria AS rcat, o.requisito_id
       FROM ot_requisitos o LEFT JOIN requisitos r ON r.id = o.id`).all<any>();
  expect(results.length).toBe(25);
  for (const x of results) {
    expect(x.rid).toBe(x.id);
    expect(x.fonte_id).toBe('ons-ro-cb-br-01');
    expect(x.referencia).toBe(x.codigo);
    expect(x.rtitulo).toBe(x.titulo);
    expect(x.texto).toBe(x.descricao);
    expect(x.rcat).toBe(x.categoria);
    expect(x.requisito_id).toBe(x.id);
  }
});
```
(O setup usa `applySchema()` do `test/helpers/d1.ts`; confira como `ot_requisitos` é populada nos testes do n.ot, em `schema.sql` ou executando a migration 0090, e faça o mesmo para a 0114.)

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar a migration** (conferir `ls migrations | tail -3` e o número livre antes):

```sql
-- 0114 — onda 2: catálogo único de requisitos (spec 2026-11-17). Aditiva e repetível.
-- Verificar depois de aplicar:
--   SELECT count(*) FROM requisitos WHERE fonte_id = 'ons-ro-cb-br-01'                 → 25
--   SELECT count(*) FROM ot_requisitos WHERE requisito_id IS NULL                       → 0
ALTER TABLE requisitos ADD COLUMN texto TEXT;
ALTER TABLE requisitos ADD COLUMN fonte_texto TEXT;
ALTER TABLE requisitos ADD COLUMN categoria TEXT;
ALTER TABLE ot_requisitos ADD COLUMN requisito_id TEXT REFERENCES requisitos(id);

INSERT OR IGNORE INTO requisito_fontes (id, nome, versao, vigente_desde)
  VALUES ('ons-ro-cb-br-01', 'ONS RO-CB.BR.01 (requisitos mínimos de segurança cibernética)', 'Rev.00', '2021-07-09');

-- Mesmo id de ot_requisitos: nenhuma FK nem URL existente muda. O texto é o da norma pública, portado e conferido na 0090.
INSERT OR IGNORE INTO requisitos (id, fonte_id, referencia, titulo, papel, pai_id, texto, fonte_texto, categoria)
  SELECT id, 'ons-ro-cb-br-01', codigo, titulo, NULL, NULL, descricao,
         'ONS RO-CB.BR.01 Rev.00, vigência 09/07/2021; texto portado de OT2net e conferido contra o PDF (migration 0090)', categoria
    FROM ot_requisitos;

UPDATE ot_requisitos SET requisito_id = id WHERE requisito_id IS NULL;
```
Em `schema.sql`: acrescentar as quatro colunas nas duas tabelas (`ot_requisitos.requisito_id` no `CREATE TABLE`, na mesma ordem do `ALTER`) e as linhas da fonte/requisitos **do mesmo jeito que o schema.sql do repositório já faz com a carga 0090** (confira; se o `schema.sql` não carrega as 25 linhas, o teste carrega a migration inteira). `test/migrations-consistencia.test.ts` precisa passar.
- [ ] **Step 4: Rodar** `npx vitest run test/requisitos-catalogo-unico.test.ts test/migrations-consistencia.test.ts test/ot-*.test.ts test/requisitos*.test.ts test/onda2-numeros.test.ts` → PASS. **Os números da Task 1 não mudam** (a fonte ONS nunca entra em `lacunasDaFonte('lgpd')`).
- [ ] **Step 5: Commit** — `git commit -m "feat(onda2): ONS no catálogo único de requisitos (migration 0114)"`

### Task 6: Trava da fonte ONS e filtro por módulo

**Files:**
- Modify: `src/routes/requisitos.ts` (`GET /fontes`, `GET /`, `GET /:id`, e as rotas de projeto em `projetoRequisitosApp`), `src/services/requisitos.ts` (filtros), `src/modulos.ts` (helper)
- Test: `test/requisitos-catalogo-unico.test.ts`

**Interfaces:**
- Produces: `FONTES_DO_OT = ['ons-ro-cb-br-01'] as const` e `fonteVisivel(fonteId: string, modulos: readonly Modulo[], principal: { agente?: boolean; id?: string }): boolean` (em `src/modulos.ts`): `false` para fonte do n.ot quando o principal é agente, chave de API (`id` começando por `apikey:`) ou não tem o módulo `ot`.

- [ ] **Step 1: Testes que falham** (cada um com status exato):
  1. `GET /api/v1/requisitos?fonte=ons-ro-cb-br-01`: pessoa **com** `ot` → 25 itens; pessoa só com `iso`/`privacy` → lista vazia (`[]`); agente e chave de API → `[]` mesmo que a conta de origem tenha `ot`.
  2. `GET /api/v1/requisitos/fontes`: a ONS só aparece para quem tem `ot` e é pessoa.
  3. `GET /api/v1/requisitos/ons-ro-cb-br-01-rev00-4.1.1` → 404 para quem não vê a fonte (não 403: não revelar a existência).
  4. Rotas de projeto (`/projects/:id/requisitos/...`): `GET lacunas?fonte=ons-ro-cb-br-01`, `POST/DELETE` de exclusão de requisito ONS, e `PUT` de requisitos de documento e de evidência com um id ONS: **agente e chave de API → 403/404 conforme a rota; pessoa sem `ot` → idem; pessoa com `ot` → só a equipe que já pode (regra atual)**. Descobrir as rotas exatas com `grep -n "projetoRequisitosApp\.\(get\|post\|put\|delete\)" src/routes/requisitos.ts` e listar no relatório cada uma com o status esperado.
  5. P0-2: o agente de um consultor com a concessão normal tenta marcar um requisito ONS como não aplicável → recusado.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** `fonteVisivel` em `src/modulos.ts` usando `modulosDaPessoa(db, user)` (já existe, `src/modulos.ts:131`). Em `listarRequisitos`/`listarFontes`, filtrar no SQL por `fonte_id NOT IN (...)` quando `!fonteVisivel(...)` (passar `incluirOt: boolean` do handler); em `lerRequisito` devolver `null` se a fonte não é visível. Nas rotas de projeto: no começo de cada handler que recebe `fonte` ou ids de requisito, carregar a fonte do requisito (`SELECT fonte_id FROM requisitos WHERE id IN (...)`) e recusar se for do n.ot e `!fonteVisivel`. **Todo ponto que fica `async` precisa de `await`** (um `await` esquecido numa recusa falha aberto; tenha um teste negativo por rota e uma mutação: tire um `await`, veja o teste falhar, restaure).
- [ ] **Step 4: Rodar** `npx vitest run test/requisitos*.test.ts test/ot-modulo.test.ts test/modulos-por-pessoa.test.ts test/contrato-isolamento-org.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(onda2): fonte ONS só para quem tem o n.ot; agente e chave de API recusados"`

### Task 7: Indicador do n.iso com detalhe por framework

**Files:**
- Modify: `src/services/prontidao.ts` (`contagensDoProjeto` ~154-185 e o retorno), `src/services/painel.ts` (se mostrar o número), `frontend/src/views/bancada.js:~115`, `frontend/src/views/monitor.js:~62`, `docs/openapi.json` (regenerar)
- Test: `test/onda2-numeros.test.ts` (o texto/valores somados **não mudam**) e `test/prontidao*.test.ts`, `frontend/test/bancada*.test.js`

**Interfaces:**
- Produces: `indicador.por_norma: { standard: string; rotulo: string; implementados: number; aplicaveis: number; texto: string }[]` **aditivo**; `indicador.implementados`, `indicador.aplicaveis` e `indicador.texto` ficam idênticos.

- [ ] **Step 1: Teste que falha** — no projeto da Task 1 (27001+27701): `por_norma` tem dois itens; a soma de `implementados` e `aplicaveis` por norma é igual ao total somado; o texto somado é o mesmo da Task 1. Projeto com uma norma só: `por_norma` com um item (a tela não mostra o detalhe).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** Na consulta de controles de `contagensDoProjeto`, acrescentar uma consulta `SELECT standard, classe, count(*) ... GROUP BY standard, classe` (mesma `SQL_CLASSE_CONTROLE`) e montar `por_norma`, com rótulo humano por constante da norma (`ISO_27001_2022_STANDARD` → "ISO 27001:2022", etc.; normas legadas mostram o `standard` cru). Não tocar na fórmula somada (`aplicaveis`, `prontidao.ts:42`).
- [ ] **Step 4: Frontend** — em `bancada.js` e `monitor.js`, quando `indicador.por_norma?.length > 1`, mostrar abaixo do texto somado uma linha por norma ("ISO 27001:2022: 40 de 90") e uma nota: "O número acima soma as normas do projeto." Sem estilo inline; reaproveitar classes existentes.
- [ ] **Step 5: Rodar** testes backend e frontend relevantes + `node scripts/gerar-openapi.mjs`.
- [ ] **Step 6: Commit** — `git commit -m "feat(onda2): indicador do n.iso com detalhe por norma, número somado intacto"`

### Task 8: Validação de mapeamento por par de fontes com prévia exata

**Files:**
- Modify: `src/services/requisitos.ts` (`validarMapeamentosPropostos`, nova `previaDeValidacao`, `lacunasDaFonte` ganha parâmetro de simulação), `src/schemas/requisitos.ts` (`validarMapeamentosSchema`), `src/routes/requisitos.ts` (`POST /mapeamentos/validar`, novo `GET /mapeamentos/previa`), `frontend/src/views/referencia-juridica.js:~69-75,139`
- Test: `test/requisitos*.test.ts`, `frontend/test/referencia-juridica*.test.js`

**Interfaces:**
- Consumes: `lacunasDaFonte(db, projectId, fonte)`, `resumoDeLacunas`.
- Produces:
  - `validarMapeamentosSchema = z.object({ de_fonte: id, para_fonte: id }).strict()` (**os dois obrigatórios**: acaba o "validar tudo").
  - `GET /api/v1/requisitos/mapeamentos/previa?de=<fonte>&para=<fonte>` (só `platform_admin`) → `{ propostos: number; por_tipo: {equivalente,parcial,relacionado}; projetos_afetados: number; efeito: { cobertos: number; parciais: number }; truncado: boolean }`, onde `efeito` é a **soma, nos projetos, da mudança em `resumoDeLacunas(lacunas da fonte "para")`** se esses pares fossem validados agora.
  - `lacunasDaFonte(db, projectId, fonte, opcoes?: { simular?: { de: string; para: string } })`: com `simular`, mapeamentos `proposto` entre as duas fontes contam como `validado_juridico` (não grava nada).

- [ ] **Step 1: Testes que falham**
  1. `POST /mapeamentos/validar` sem `de_fonte`/`para_fonte` → 400 (hoje validaria tudo).
  2. Só os pares entre as duas fontes informadas passam a `validado_juridico`; `validado_por` é o e-mail da sessão; pares de outras fontes continuam `proposto`.
  3. **A prévia bate com o efeito real**: montar um projeto com controle `feito` ligado a um requisito ISO com par `proposto` `equivalente` para um requisito LGPD; `GET /previa?de=iso27001:2022&para=lgpd` → `efeito.cobertos` = 1 e `projetos_afetados` = 1; depois `POST /validar` e conferir que `resumoDeLacunas(lacunasDaFonte(...,'lgpd')).cobertos` subiu exatamente 1.
  4. Não-admin (consultor, agente) → 403 nas duas rotas.
  5. Idempotente: repetir a validação não muda nada (`validados: 0`).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** `lacunasDaFonte`: na consulta de controles (`ctrls`), trocar `m.estado = 'validado_juridico'` por `(m.estado = 'validado_juridico' OR (?4 = 1 AND m.estado = 'proposto' AND <de e para nas fontes simuladas>))`, com os binds novos; sem `simular`, o comportamento e o SQL efetivo ficam idênticos (os testes da Task 1 provam). `previaDeValidacao`: projetos com controles ligados à fonte `de` (`SELECT DISTINCT c.project_id FROM compliance_controls c JOIN requisitos r ON r.id = c.requisito_id WHERE r.fonte_id = ?`), `LIMIT 500` (`truncado: true` se passar; comentário `shortcut: 500 projetos, paginar se a base crescer`), somando `resumoDeLacunas` com e sem simulação. `validarMapeamentosPropostos(db, validadoPor, de, para)` com `DA_FONTE` trocado por `EXISTS requisito de r.fonte_id = de` **e** `EXISTS requisito para r.fonte_id = para` (nos dois sentidos de `de_id`/`para_id`). Auditoria registra as fontes.
- [ ] **Step 4: Frontend** — em `referencia-juridica.js`, trocar o botão "Validar N mapeamentos" por: selecionar o par de fontes, botão "Ver o efeito" (chama `/previa` e mostra "Vai cobrir X e parcial Y requisitos em Z projetos"), e "Validar" só habilitado depois da prévia. Texto em português, sem inline.
- [ ] **Step 5: Rodar** `npx vitest run test/requisitos*.test.ts test/onda2-numeros.test.ts test/contrato-*.test.ts`, os testes do frontend, `node scripts/gerar-openapi.mjs`.
- [ ] **Step 6: Commit** — `git commit -m "feat(onda2): validação de mapeamento por par de fontes, com prévia exata do efeito"`

### Task 9: Leitura única de situação por requisito

**Files:**
- Create: `src/services/situacao-requisitos.ts`, `test/situacao-requisitos.test.ts`
- Modify: `src/routes/requisitos.ts` (ou o arquivo de rotas de projeto que o levantamento indicar), `src/modulos.ts` (tabela de segmentos), `docs/openapi.json`

**Interfaces:**
- Consumes: `situacaoUnica`, `situacaoDoItemTecnico` (Task 2), `fonteVisivel` (Task 6), `montarAssessment`/`ITENS_TECNICOS` do n.ot.
- Produces: `leituraUnica(db, projectId, principal): Promise<LinhaSituacao[]>` e `GET /api/v1/projects/:projectId/requisitos-situacao`, com
  `type LinhaSituacao = { requisito_id: string; fonte_id: string; referencia: string; titulo: string; situacao: SituacaoUnica; origem: 'n.iso' | 'n.ot'; derivado?: string }`.

**Decisão de desenho (spec, decisão 1):** é uma **função/consulta no serviço, não uma `VIEW`** (D1 sem `CREATE VIEW` hoje: `grep -c "CREATE VIEW" schema.sql` = 0). As linhas vêm de `compliance_controls` (via `situacaoUnica`, só os com `requisito_id`) e, **somente se o principal é pessoa com o módulo `ot`** (`fonteVisivel`), de `ot_avaliacoes` e dos 5 itens técnicos derivados (`situacaoDoItemTecnico`, com `derivado`). Não grava nada e **não entra na exportação** (não é tabela).

- [ ] **Step 1: Testes que falham** — (1) projeto com controles em vários status e requisito ligado: a leitura devolve a situação unificada por tabela de correspondência; controle sem `requisito_id` não aparece; (2) pessoa **sem** `ot`: nenhuma linha `origem: 'n.ot'`; agente e chave de API idem, mesmo com a conta de origem tendo `ot`; (3) pessoa com `ot`: 25 linhas ONS (as 20 de política com a situação de `ot_avaliacoes` ou `nao_avaliado`, os 5 técnicos com `derivado`, **nenhum `atende` vindo do inventário**); (4) segmento novo mapeado em `src/modulos.ts` (o teste de cobertura de segmentos passa); (5) o export de portabilidade do projeto não contém nenhuma coisa nova.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** `leituraUnica` com uma consulta por fonte de dados (sem N+1) e a rota (segmento novo `requisitos-situacao`: conferir o padrão em `src/modulos.ts:30-60` e mapear para o núcleo, sem módulo próprio, já que o conteúdo do n.ot é filtrado dentro do serviço; documentar a escolha em um comentário).
- [ ] **Step 4: Rodar** `npx vitest run test/situacao-requisitos.test.ts test/onda2-numeros.test.ts test/modulos*.test.ts test/contrato-isolamento-org.test.ts test/portabilidade*.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(onda2): leitura única de situação por requisito, sem regravar status"`

### Task 10: Texto normativo, documentação e fecho

**Files:**
- Modify: `src/schemas/requisitos.ts` (`requisitoAtualizarSchema`), `src/routes/requisitos.ts` (`PUT /:id`), `src/services/requisitos.ts` (`fonteAceitaTexto`), `AGENTS.md`, `CHANGELOG.md`, `migrations/README.md`, `docs/superpowers/specs/2026-11-17-onda2-catalogo-de-requisitos-design.md` ("Rulings da execução")
- Test: `test/requisitos-catalogo-unico.test.ts`

**Interfaces:**
- Produces: `fonteAceitaTexto(fonteId: string): boolean` = `false` para `iso27001:2022` e `iso27701:2025` (e qualquer fonte `iso*`), `true` para as demais; `PUT /api/v1/requisitos/:id` aceita `texto` e `fonte_texto` opcionais (`strict`), só `platform_admin`.

- [ ] **Step 1: Testes que falham** — (1) invariante: `SELECT count(*) FROM requisitos WHERE fonte_id LIKE 'iso%' AND texto IS NOT NULL` = 0 depois de `semearCatalogo`; (2) `PUT /requisitos/iso27001:2022:A.5.1` com `texto` → 400/403 com mensagem em português ("o texto da ISO é protegido por licença"); (3) `PUT` de `texto` em requisito ONS ou LGPD → 200 e grava `fonte_texto`; (4) exigir `fonte_texto` quando `texto` vier (barra "texto sem origem"); (5) auditoria registra a mudança de texto.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** o guard e o schema (`texto: z.string().trim().min(1).max(20000).optional()`, `fonte_texto: z.string().trim().min(5).max(500).optional()`, com `superRefine`: `texto` exige `fonte_texto`).
- [ ] **Step 4: Documentação.**
  - `AGENTS.md` (sem acentos, só o que existe hoje, verificado no código): catálogo único (fontes, ONS em `requisitos` com os mesmos ids), situação única derivada (`situacaoUnica`, `situacaoDoItemTecnico`), `ot_avaliacoes` e `ot_requisito_evidencias` seguem `ot_*` por causa da portabilidade e do P0-2, `fonteVisivel`, indicador com `por_norma`, validação de mapeamento por par de fontes com prévia, leitura única (função, não view), regra de texto por licença.
  - `CHANGELOG.md`: entrada da onda 2, destacando **o que muda para quem já usa**: mapeamento não é mais validado "de uma vez" (agora por par de fontes, com prévia); `PUT /mapeamentos` carimba a sessão; o catálogo ONS aparece em `GET /requisitos` só para quem tem `ot`; indicador do n.iso ganha o detalhe por norma, sem trocar o número.
  - `migrations/README.md`: seção 0114 com status **PENDENTE de aplicar** (nunca "aplicada"), a query de verificação do cabeçalho da migration e o comando de apply, cabeçalho com a última migration e o total de arquivos (`ls migrations/*.sql | wc -l`).
  - Spec: "Rulings da execução" com o que for decidido (ex.: leitura única como função; `lacunasDaFonte` com simulação; limite de 500 projetos na prévia).
- [ ] **Step 5: Rodar** `bash scripts/ci/gate.sh` (ou os arquivos relacionados + `tsc --noEmit` se o gate completo for lento) e `npx vitest run test/migrations-consistencia.test.ts test/openapi.test.ts`.
- [ ] **Step 6: Commit** — `git commit -m "feat(onda2): texto normativo só onde a licença permite; docs da onda 2"`

**Entrega PR2:** `bash scripts/ci/gate.sh`; PR (rascunho). **Antes do merge:** rodar a sonda da Task 3 em produção, backup, aplicar a `0114` (depois da `0113`, se ainda pendente), conferir as duas queries do cabeçalho da migration.

---

## Self-Review

- **Spec:** decisões 1 (cada um onde está + leitura única: Task 9), 4 (indicador somado + por norma: Task 7), 10 (42001/CIS fora: nenhuma tarefa, Task 10 registra), 2 e 3 (situação derivada, `Planned` → `nao_atende`: Task 2), 5 (validação por par, prévia, carimbo da sessão: Tasks 4 e 8), 6 (texto por licença: Tasks 5 e 10), 7 (filtro por módulo: Task 6); entrega 1 (testes + função + `ligarControles` + carimbo + sonda: Tasks 1-4); entrega 2 (migration, ONS, trava, filtro, indicador, validação, leitura: Tasks 5-9).
- **Placeholders:** as Tasks 3, 6 e 9 mandam descobrir rotas e pontos de chamada por `grep` (o levantamento cita arquivo:linha, mas as rotas de projeto não foram lidas linha a linha); o resultado da descoberta vai ao relatório. Os valores esperados da Task 1 vêm de rodar o código atual, de propósito (caracterização).
- **Tipos:** `SituacaoUnica`, `situacaoUnica`, `situacaoDoItemTecnico` (Task 2) são consumidos na Task 9; `fonteVisivel`/`FONTES_DO_OT` (Task 6) na Task 9; `lacunasDaFonte(..., { simular })` (Task 8) mantém o comportamento sem a opção (provado pela Task 1).
- **Riscos para a revisão:** (1) mudança de contrato do `POST /mapeamentos/validar` (exige o par) e do `PUT/POST /mapeamentos` (ignora `validado_por` do corpo); (2) `ot_requisitos.requisito_id` com FK nova: conferir se `foreign_keys` e a ordem da carga em testes quebram algum teste do n.ot; (3) `fonteVisivel` async em várias rotas: `await` em todo ponto (fail-open), com mutação; (4) a prévia roda `lacunasDaFonte` por projeto (limite de 500 e `truncado`); (5) a migration `0114` depende de `0113` só pela numeração.
