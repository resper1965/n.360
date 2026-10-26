# Frente 2A: uma regra por conceito — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cada conceito ("hoje", "controle implementado", marco do programa, fornecedor, evidência vencida, classificação do ativo) tem uma função só, e todos os leitores dos dois módulos a usam.

**Architecture:** funções e fragmentos SQL em `src/services/` (backend) e módulos pequenos em `frontend/src/` (tela), trocando as cópias locais. Nenhuma migration. Testes contra o D1 real (`cloudflare:test`) e jsdom.

**Tech Stack:** Cloudflare Workers + Hono + D1, vitest (`@cloudflare/vitest-pool-workers`), frontend vanilla JS com vitest/jsdom.

**Spec:** `docs/superpowers/specs/2026-10-20-frente2-regras-unicas-design.md` (Parte 2A).

## Global Constraints

- Comentário, mensagem e texto de tela em português (PT-BR). Sem i18n.
- Commits em português, autor `Ricardo Esper <44273656+resper1965@users.noreply.github.com>` (`git commit --author=...`), sem `Co-Authored-By` nem rodapé de IA.
- Nenhum dado real de cliente em teste ou doc.
- `test/any-catraca.test.ts`: o número de `any` em `src/` não pode subir (teto 530).
- `pedidos.ts`, `documentos.ts` e migrations 0001–0081 não mudam neste plano.
- Rodar antes de cada commit: `npx tsc --noEmit` e os testes do arquivo tocado. Backend: `npx vitest run test/<arquivo>` na raiz. Frontend: `cd frontend && npx vitest run test/<arquivo>`.
- Frontend: sem handler inline, tudo no escopo `window` quando a tela precisa; módulos ES só em build.

---

### Task 1: "Hoje" em São Paulo no servidor e evidência vencida no encarregado (A1 servidor + A5)

**Files:**
- Create: `src/services/hoje.ts`
- Modify: `src/services/avisos-prazo.ts:40-47` (move `hojeEmSaoPaulo` para `hoje.ts` e reexporta)
- Modify: `src/services/painel.ts:25` e o uso de `hoje()` em `painelDoProjeto`/`carteira`; `somarDias` local continua
- Modify: `src/services/encarregado.ts:35,40-41,80-81`
- Modify: `src/services/titular-pedidos.ts:18`, `src/services/incidentes.ts:20`, `src/services/prontidao.ts:163`, `src/services/riscos-atividade.ts:257`, `src/services/terceiros.ts:19`
- Modify: `src/services/ponto-de-partida.ts:25` (`date('now')` vira parâmetro)
- Modify: `src/services/painel.ts:127` (acrescenta `SQL_EVIDENCIA_VENCIDA`)
- Test: `test/hoje-sp.test.ts`

**Interfaces:**
- Produces: `hojeEmSaoPaulo(agora?: Date): string` (AAAA-MM-DD) e `diaMaisSP(dias: number, agora?: Date): string` em `src/services/hoje.ts`; `SQL_EVIDENCIA_VENCIDA` (string SQL, `?2` = hoje) exportado de `src/services/painel.ts`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// test/hoje-sp.test.ts
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { hojeEmSaoPaulo, diaMaisSP } from '../src/services/hoje';
import { visaoDoEncarregado } from '../src/services/encarregado';
import { applySchema, habilitarPrivacy } from './helpers/d1';

const FONTES = import.meta.glob('../src/services/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const P = 'hsp-proj';

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P),
    // validade no dia 20/10 escrita com hora: a comparação é pelo dia
    env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, valido_ate) VALUES ('hsp-ev1', ?, 'a.pdf', 'k1', '2026-10-20T23:00:00Z'), ('hsp-ev2', ?, 'b.pdf', 'k2', '2026-10-19')`).bind(P, P),
  ]);
  await habilitarPrivacy(P);
});
afterEach(() => vi.useRealTimers());

describe('"hoje" é o dia de São Paulo', () => {
  it('21h30 de Brasília ainda é o mesmo dia; meia-noite e meia de Brasília já é o seguinte', () => {
    expect(hojeEmSaoPaulo(new Date('2026-10-21T00:30:00Z'))).toBe('2026-10-20');
    expect(hojeEmSaoPaulo(new Date('2026-10-21T03:30:00Z'))).toBe('2026-10-21');
    expect(diaMaisSP(7, new Date('2026-10-21T00:30:00Z'))).toBe('2026-10-27');
  });

  it('às 21h30 de Brasília a evidência que vence hoje não está vencida no encarregado', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T00:30:00Z'));
    const v = await visaoDoEncarregado(env.DB, P);
    expect(v.secao.evidencias.vencidas).toBe(1); // só a de 19/10
  });

  it('nenhum serviço calcula "hoje" pelo relógio em UTC', () => {
    const fora = Object.entries(FONTES)
      .filter(([, src]) => /new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)|date\('now'\)\s*\)?\s*(?:OR|AND|\))/.test(src))
      .map(([arq]) => arq);
    expect(fora).toEqual([]);
  });
});
```

Confira em `src/services/encarregado.ts` o nome exato do objeto devolvido (`secao.evidencias` ou `evidencias` no topo) e ajuste a asserção ao formato real antes de rodar. Confira também o `INSERT` de `evidence` contra `schema.sql` (colunas `NOT NULL`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/hoje-sp.test.ts`
Expected: FAIL (`../src/services/hoje` não existe).

- [ ] **Step 3: Criar `src/services/hoje.ts`**

```ts
/** O dia de hoje em São Paulo (AAAA-MM-DD). Todo prazo e vencimento do produto conta neste dia, não em UTC. */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(agora).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

/** O dia de São Paulo daqui a `dias` dias (negativo volta). */
export function diaMaisSP(dias: number, agora: Date = new Date()): string {
  const d = new Date(`${hojeEmSaoPaulo(agora)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
```

Em `src/services/avisos-prazo.ts`, apagar a função local e acrescentar `export { hojeEmSaoPaulo } from './hoje';` (quem importa de lá continua funcionando).

- [ ] **Step 4: Trocar os leitores**

- `painel.ts:25`: `const hoje = () => hojeEmSaoPaulo();` (importar de `./hoje`).
- `encarregado.ts`: `const hoje = () => hojeEmSaoPaulo();` e `const em7 = diaMaisSP(7);`. Evidências:
  ```ts
  vencidas: await n(db, `SELECT count(*) AS n FROM evidence WHERE project_id = ?1 AND ${SQL_EVIDENCIA_VENCIDA}`, projectId, dia),
  vencem_em_7_dias: await n(db, `SELECT count(*) AS n FROM evidence WHERE project_id = ?1 AND valido_ate IS NOT NULL AND substr(valido_ate, 1, 10) >= ?2 AND substr(valido_ate, 1, 10) <= ?3`, projectId, dia, em7),
  ```
- `painel.ts`, logo acima de `SQL_EVIDENCIA_RUIM`:
  ```ts
  /** Evidência com validade anterior a hoje (?2, o dia de São Paulo). Comparação pelo dia: `valido_ate` pode vir com hora. */
  export const SQL_EVIDENCIA_VENCIDA = `(valido_ate IS NOT NULL AND substr(valido_ate, 1, 10) < ?2)`;
  export const SQL_EVIDENCIA_RUIM = `(${SQL_EVIDENCIA_VENCIDA} OR evaluation_status = 'non_conforming')`;
  ```
- `titular-pedidos.ts:18`, `prontidao.ts:163`, `terceiros.ts:19`: `const hoje = () => hojeEmSaoPaulo();`.
- `incidentes.ts:20`: parâmetro padrão `em = hojeEmSaoPaulo()`.
- `riscos-atividade.ts:257`: `const dia = hojeEmSaoPaulo();`.
- `ponto-de-partida.ts:25`: `valido_ate >= date('now')` vira `substr(valido_ate, 1, 10) >= ?` com o dia de `hojeEmSaoPaulo()` no bind (essa linha usa o helper `c(sql)`; troque só ela por `db.prepare(...).bind(projectId, hojeEmSaoPaulo())`).

- [ ] **Step 5: Rodar os testes**

Run: `npx tsc --noEmit && npx vitest run test/hoje-sp.test.ts test/encarregado.test.ts test/painel.test.ts test/prontidao.test.ts test/ponto-de-partida.test.ts test/avisos-prazo.test.ts test/terceiros.test.ts`
Expected: PASS. Se o padrão da varredura casar algo legítimo (gravação de carimbo, não comparação), restrinja o padrão com comentário do porquê, nunca a lista de arquivos.

- [ ] **Step 6: Commit**

```bash
git add src/services test/hoje-sp.test.ts
git commit --author="Ricardo Esper <44273656+resper1965@users.noreply.github.com>" -m "fix: hoje em São Paulo em todo prazo do servidor e evidência vencida pelo dia"
```

---

### Task 2: "Hoje" em São Paulo na tela (A1 frontend)

**Files:**
- Create: `frontend/src/hoje.js`
- Modify: `frontend/src/filtro-painel.js:10-11`, `frontend/src/views/documentos.js:24`, `frontend/src/views/gaps.js:19`, `frontend/src/views/titular.js:286,301`, `frontend/src/views/avaliacoes-terceiros.js:23`, `frontend/src/views/grc.js:253`, `frontend/src/views/monitor.js:286`
- Test: `frontend/test/hoje-sp.test.js`

**Interfaces:**
- Produces: `hojeSP(): string` e `emDiasSP(n: number): string` exportados de `frontend/src/hoje.js`.

- [ ] **Step 1: Teste que falha**

```js
// frontend/test/hoje-sp.test.js
import { describe, it, expect, afterEach, vi } from 'vitest';
import { hojeSP, emDiasSP } from '../src/hoje.js';
import { emAtraso } from '../src/views/gaps.js';

const FONTES = import.meta.glob('../src/**/*.js', { query: '?raw', import: 'default', eager: true });
afterEach(() => vi.useRealTimers());

describe('hoje na tela é o dia de São Paulo', () => {
  it('21h30 de Brasília ainda é o dia; o prazo de hoje não está em atraso', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T00:30:00Z'));
    expect(hojeSP()).toBe('2026-10-20');
    expect(emDiasSP(7)).toBe('2026-10-27');
    expect(emAtraso({ status: 'Open', prazo: '2026-10-20' })).toBe(false);
    expect(emAtraso({ status: 'Open', prazo: '2026-10-19' })).toBe(true);
  });

  it('nenhuma tela calcula hoje por toISOString nem pelo fuso do navegador', () => {
    const fora = Object.entries(FONTES)
      .filter(([arq]) => !arq.endsWith('/hoje.js'))
      .filter(([, src]) => /new Date\(\)\.toISOString\(\)\.(?:slice\(0, ?10\)|split\('T'\)\[0\])|getTimezoneOffset\(\)/.test(src))
      .map(([arq]) => arq);
    expect(fora).toEqual([]);
  });
});
```

Se `views/gaps.js` não puder ser importado isolado (dependências de tela), troque a terceira asserção por um teste do `emAtraso` dentro de `frontend/test/` que já importa a tela de gaps, e mantenha as outras duas aqui.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run test/hoje-sp.test.js`
Expected: FAIL (módulo `hoje.js` não existe).

- [ ] **Step 3: Criar `frontend/src/hoje.js`**

```js
// O dia de hoje em São Paulo (AAAA-MM-DD): o mesmo dia que o servidor usa para prazo e vencimento (src/services/hoje.ts).
export function hojeSP(agora = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(agora).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
}

export function emDiasSP(n, agora = new Date()) {
    const d = new Date(`${hojeSP(agora)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Trocar os leitores** (importar `{ hojeSP, emDiasSP }` de `../hoje.js` ou `./hoje.js`)

- `filtro-painel.js`: `const hoje = () => hojeSP();` e `const emDias = (n) => emDiasSP(n);`; atualizar o comentário da linha 9 ("o mesmo dia de São Paulo do servidor").
- `views/documentos.js:24`: `const hoje = () => hojeSP();`.
- `views/gaps.js:19`: `... String(g.prazo).slice(0, 10) < hojeSP();`.
- `views/titular.js:286`: `new Date(\`${hojeSP()}T00:00:00Z\`)`; `:301`: `const hoje = hojeSP(), ...`.
- `views/avaliacoes-terceiros.js:23`: `Date.parse(\`${hojeSP()}T00:00:00Z\`)`.
- `views/grc.js:253` e `views/monitor.js:286`: `= hojeSP();`.

- [ ] **Step 5: Rodar**

Run: `cd frontend && npx vitest run`
Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add frontend/src frontend/test/hoje-sp.test.js
git commit --author="Ricardo Esper <44273656+resper1965@users.noreply.github.com>" -m "fix: hoje em São Paulo nas telas, o mesmo dia do servidor"
```

---

### Task 3: "Controle implementado" com uma regra no servidor (A2 backend)

**Files:**
- Create: `src/services/classe-controle.ts`
- Modify: `src/services/painel.ts:263-266` (move a constante; reexporta)
- Modify: `src/routes/projects.ts:1160-1172` (gap-analysis)
- Modify: `src/services/passos/contexto.ts:7`
- Modify: `src/routes/readiness.ts:67`
- Modify: `src/services/coherence.ts:24,55,72`
- Modify: `src/services/ropa-abas/medidas.ts:19,39`
- Modify: `src/services/requisitos.ts:208,227,234` (só o "feito")
- Test: `test/classe-controle.test.ts`

**Interfaces:**
- Produces (em `src/services/classe-controle.ts`): `SQL_CLASSE_CONTROLE` (string; usa a coluna `status`), `sqlClasseControle(coluna: string): string`, `type ClasseControle = 'na' | 'feito' | 'andamento' | 'falta'`, `classeDoControle(status: string | null | undefined): ClasseControle`, `STATUS_FEITO: readonly string[]` (maiúsculas), `STATUS_FALTA: readonly string[]`.

- [ ] **Step 1: Teste que falha**

```ts
// test/classe-controle.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { classeDoControle, SQL_CLASSE_CONTROLE } from '../src/services/classe-controle';
import { applySchema, sessionFor, workerEnv, designarConsultor } from './helpers/d1';

const P = 'cc-proj';
const STATUS = ['Implemented', 'Compliant', 'Approved', 'Completed', 'Partial', 'In Progress', 'Planned', 'Missing', 'Not Applicable', null];
const chamar = (h: Record<string, string>, caminho: string) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv());
let consultor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P).run();
  await env.DB.batch(STATUS.map((s, i) => env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES (?, ?, 'ISO 27001:2022', ?, ?)`)
    .bind(`cc-${i}`, P, `A.5.${i + 1} Controle ${i}`, s)));
  await designarConsultor('cons@ness.lat', P);
  consultor = await sessionFor({ id: 'cons:cons@ness.lat', email: 'cons@ness.lat', role: 'consultor' });
});

describe('controle implementado: uma regra', () => {
  it('a função TS e a SQL classificam igual, e Compliant (legado) é feito', async () => {
    const { results } = await env.DB.prepare(`SELECT status, ${SQL_CLASSE_CONTROLE} AS classe FROM compliance_controls WHERE project_id = ?`).bind(P).all<{ status: string | null; classe: string }>();
    for (const r of results) expect(classeDoControle(r.status), String(r.status)).toBe(r.classe);
    expect(classeDoControle('Compliant')).toBe('feito');
    expect(classeDoControle('Planned')).toBe('andamento');
  });

  it('gap-analysis conta como implementado o mesmo que o Painel', async () => {
    const g = await (await chamar(consultor, `/api/v1/projects/${P}/gap-analysis`)).json<{ applicable: number; coverage_pct: number; gaps: unknown[] }>();
    // 9 aplicáveis (sem o N/A); feitos: Implemented, Compliant, Approved, Completed = 4
    expect(g.applicable).toBe(9);
    expect(g.coverage_pct).toBe(Math.round((4 / 9) * 100));
    expect(g.gaps).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/classe-controle.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Criar `src/services/classe-controle.ts`**

```ts
/**
 * Situação do controle numa palavra, a mesma em todo o produto (Painel, Prontidão, gap-analysis, Bancada, readiness, coherence,
 * medidas do RoPA, cobertura da LGPD e a SoA na tela, que espelha esta lista em frontend/src/classe-controle.js).
 * `Compliant` é a grafia legada de `Implemented`.
 */
export type ClasseControle = 'na' | 'feito' | 'andamento' | 'falta';
export const STATUS_FEITO = ['APPROVED', 'IMPLEMENTED', 'COMPLETED', 'CONFORME', 'COMPLIANT'] as const;
export const STATUS_FALTA = ['MISSING', 'NOT STARTED', 'NOT_STARTED'] as const;

const lista = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(', ');

export function sqlClasseControle(coluna: string): string {
  return `CASE WHEN ${coluna} = 'Not Applicable' THEN 'na'
  WHEN upper(${coluna}) IN (${lista(STATUS_FEITO)}) THEN 'feito'
  WHEN ${coluna} IS NULL OR trim(${coluna}) = '' OR upper(${coluna}) IN (${lista(STATUS_FALTA)}) THEN 'falta' ELSE 'andamento' END`;
}

export const SQL_CLASSE_CONTROLE = sqlClasseControle('status');

export function classeDoControle(status: string | null | undefined): ClasseControle {
  if (status === 'Not Applicable') return 'na';
  const s = (status ?? '').trim().toUpperCase();
  if ((STATUS_FEITO as readonly string[]).includes(s)) return 'feito';
  if (!s || (STATUS_FALTA as readonly string[]).includes(s)) return 'falta';
  return 'andamento';
}
```

Em `painel.ts`: apagar a constante local e `export { SQL_CLASSE_CONTROLE } from './classe-controle';` (com `import` para uso local). Trocar `SQL_CLASSE_CONTROLE.replace(/status/g, 'c.status')` por `sqlClasseControle('c.status')`.

- [ ] **Step 4: Trocar os leitores**

- **gap-analysis** (`projects.ts`): `if (classeDoControle(ctrl.status) === 'na') continue;` no lugar de `ctrl.status === NA_STATUS`; gap quando `classeDoControle(ctrl.status) !== 'feito'`; `coverage_pct` com `feitos` contados no laço (`if (classe === 'feito') feitos++`). Manter `by_status` como está.
- **passos/contexto.ts:7**: `controles_implementados: \`SELECT COUNT(*) AS n FROM compliance_controls WHERE project_id = ? AND (${SQL_CLASSE_CONTROLE}) = 'feito'\``.
- **readiness.ts:67**: `AND (${sqlClasseControle('c.status')}) = 'feito'`.
- **coherence.ts**: apagar `APROVADOS`; `classeDoControle(c.status) === 'feito'` nas linhas 55 e 72.
- **ropa-abas/medidas.ts**: linha 19 `WHERE project_id = ? AND (${SQL_CLASSE_CONTROLE}) = 'feito'`; linha 39 `const implementado = classeDoControle(r.controle_status) === 'feito';`.
- **requisitos.ts**: `IMPLEMENTADO` sai; o filtro SQL vira `AND ((${sqlClasseControle('c.status')}) = 'feito' OR c.status IN ('Partial', 'In Progress'))` nos dois ramos do UNION; onde o código decide "coberto" pelo status, usar `classeDoControle(status) === 'feito'`; "parcial" segue `Partial`/`In Progress`. `Planned` continua sem cobrir (`test/requisitos-cobertura-status.test.ts` fixa).

- [ ] **Step 5: Rodar**

Run: `npx tsc --noEmit && npx vitest run test/classe-controle.test.ts test/painel.test.ts test/prontidao.test.ts test/coherence.test.ts test/ropa-abas-medidas.test.ts test/requisitos-cobertura-status.test.ts test/agente-gap-traceability.test.ts test/jornada-evidencia.test.ts`
Expected: PASS. Se um teste antigo esperar `Compliant` fora de "feito", ele está fixando a divergência: ajuste a expectativa e diga no commit.

- [ ] **Step 6: Commit**

```bash
git add src test/classe-controle.test.ts
git commit --author="Ricardo Esper <44273656+resper1965@users.noreply.github.com>" -m "fix: controle implementado por uma regra só (Compliant conta como feito)"
```

---

### Task 4: "Controle implementado" na SoA (A2 frontend)

**Files:**
- Create: `frontend/src/classe-controle.js`
- Modify: `frontend/src/views/compliance.js:815,1224,1226,1713`
- Test: `frontend/test/classe-controle.test.js`

**Interfaces:**
- Consumes: `classeDoControle` de `src/services/classe-controle.ts` (só no teste, para comparar).
- Produces: `classeDoControle(status)` em `frontend/src/classe-controle.js`, mesma assinatura e retorno do backend.

- [ ] **Step 1: Teste que falha**

```js
// frontend/test/classe-controle.test.js
import { describe, it, expect } from 'vitest';
import { classeDoControle } from '../src/classe-controle.js';
import { classeDoControle as doServidor } from '../../src/services/classe-controle.ts';

const STATUS = ['Implemented', 'IMPLEMENTED', 'Compliant', 'Approved', 'Completed', 'Conforme', 'Partial', 'PARTIAL', 'In Progress', 'Planned', 'Missing', 'Not Started', 'NOT_STARTED', 'Not Applicable', '', null, undefined];

describe('a tela classifica o controle como o servidor', () => {
  it.each(STATUS)('%s', (s) => expect(classeDoControle(s)).toBe(doServidor(s)));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run test/classe-controle.test.js`
Expected: FAIL (módulo não existe). Se o Vite não resolver o `.ts` do servidor, confirme a mensagem; ele transpila TS sem configuração extra.

- [ ] **Step 3: Criar `frontend/src/classe-controle.js`**

```js
// Espelho de src/services/classe-controle.ts: frontend/test/classe-controle.test.js reprova se as duas listas divergirem.
const FEITO = ['APPROVED', 'IMPLEMENTED', 'COMPLETED', 'CONFORME', 'COMPLIANT'];
const FALTA = ['MISSING', 'NOT STARTED', 'NOT_STARTED'];

export function classeDoControle(status) {
    if (status === 'Not Applicable') return 'na';
    const s = String(status ?? '').trim().toUpperCase();
    if (FEITO.includes(s)) return 'feito';
    if (!s || FALTA.includes(s)) return 'falta';
    return 'andamento';
}
```

- [ ] **Step 4: Trocar os usos em `compliance.js`** (importar `{ classeDoControle }` de `../classe-controle.js`)

- `:815`: `if (classeDoControle(c.status) === 'feito') compliantSec++;`
- `:1224` (filtro `gaps`): `matchesFilter = classeDoControle(status) === 'falta';`
- `:1226` (filtro `approved`): `matchesFilter = classeDoControle(status) === 'feito';`
- `:1713`: `const classe = classeDoControle(ctrl.status); const statusType = classe === 'feito' ? 'success' : classe === 'andamento' ? 'warning' : 'danger';`

- [ ] **Step 5: Rodar**

Run: `cd frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src frontend/test/classe-controle.test.js
git commit --author="Ricardo Esper <44273656+resper1965@users.noreply.github.com>" -m "fix: SoA classifica o controle com a regra do servidor"
```

---

### Task 5: Marco "Em operação desde" pela primeira aprovação de qualquer fonte (A3)

**Files:**
- Modify: `src/services/painel.ts:372-376` (a consulta do marco)
- Test: `test/marco-programa.test.ts`

**Interfaces:**
- Produces: `SQL_MARCO_DO_PROGRAMA` (string SQL, `?1` = project_id, devolve `d`) exportada de `src/services/painel.ts`.

- [ ] **Step 1: Teste que falha**

```ts
// test/marco-programa.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { SQL_MARCO_DO_PROGRAMA } from '../src/services/painel';
import { applySchema } from './helpers/d1';

const marco = async (p: string) => (await env.DB.prepare(SQL_MARCO_DO_PROGRAMA).bind(p).first<{ d: string | null }>())?.d ?? null;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('mp-1', 'C', 'LGPD', 'Controller', 'Active', 'org_ness'), ('mp-2', 'C', 'LGPD', 'Controller', 'Active', 'org_ness'), ('mp-3', 'C', 'LGPD', 'Controller', 'Active', 'org_ness')`),
    // mp-1: só aprovação por pedido (o caminho do n.privacy)
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('mp-r1', 'mp-1', 'Folha')`),
    env.DB.prepare(`INSERT INTO pedidos (id, project_id, org_id, tipo, ref_id, titulo, conteudo, hash, papel_exigido, status, criado_por)
      VALUES ('mp-pe1', 'mp-1', 'org_ness', 'tratamento', 'mp-r1', 'Folha', '{}', 'h', 'ciso', 'aprovado', 'x@y.com')`),
    env.DB.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, email, status, decidido_em) VALUES ('mp-pd1', 'mp-pe1', 'a@b.com', 'aprovado', '2026-03-17T10:00:00Z')`),
    // mp-2: só RIPD aprovado
    env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, title, status, dpo_approved_at) VALUES ('mp-d1', 'mp-2', 'RIPD', 'Approved', '2026-04-02T10:00:00Z')`),
  ]);
});

describe('marco do programa', () => {
  it('aprovação por pedido conta', async () => expect((await marco('mp-1'))?.slice(0, 7)).toBe('2026-03'));
  it('RIPD aprovado conta', async () => expect((await marco('mp-2'))?.slice(0, 7)).toBe('2026-04'));
  it('sem aprovação, sem marco', async () => expect(await marco('mp-3')).toBeNull());
});
```

Antes de rodar, confira em `schema.sql` as colunas `NOT NULL` de `pedidos`, `pedido_destinatarios` e `dpia_assessments` e complete os `INSERT` (por exemplo `org_id`, `nome`, `conteudo_json`): o teste precisa inserir linhas válidas. O gatilho de imutabilidade da prova permite `INSERT` já decidido.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/marco-programa.test.ts`
Expected: FAIL (`SQL_MARCO_DO_PROGRAMA` não existe).

- [ ] **Step 3: Implementar em `painel.ts`**

```ts
/** Marco do programa: a primeira aprovação registrada, de qualquer fonte (colunas gravadas ou pedido aprovado pelo CISO/CEO). */
export const SQL_MARCO_DO_PROGRAMA = `SELECT min(d) AS d FROM (
    SELECT min(COALESCE(ciso_approved_at, ceo_approved_at)) AS d FROM ropa_records WHERE project_id = ?1
    UNION ALL SELECT min(COALESCE(ciso_approved_at, ceo_approved_at)) FROM compliance_controls WHERE project_id = ?1
    UNION ALL SELECT min(dpo_approved_at) FROM dpia_assessments WHERE project_id = ?1
    UNION ALL SELECT min(pd.decidido_em) FROM pedido_destinatarios pd JOIN pedidos pe ON pe.id = pd.pedido_id
      WHERE pe.project_id = ?1 AND pe.papel_exigido IN ('ciso', 'ceo') AND pd.status = 'aprovado')`;
```

e em `painelDoProjeto` trocar a consulta antiga por `db.prepare(SQL_MARCO_DO_PROGRAMA).bind(projectId)` (o `min` ignora `NULL`, então os `WHERE ... IS NOT NULL` antigos não fazem falta).

- [ ] **Step 4: Rodar**

Run: `npx tsc --noEmit && npx vitest run test/marco-programa.test.ts test/painel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/painel.ts test/marco-programa.test.ts
git commit --author="Ricardo Esper <44273656+resper1965@users.noreply.github.com>" -m "fix: marco do programa conta a aprovação por pedido e o RIPD"
```

---

### Task 6: Quem é fornecedor, um critério (A4)

**Files:**
- Modify: `src/services/terceiros.ts:55-69` (exporta `SQL_EH_FORNECEDOR`)
- Modify: `src/routes/vendors.ts:89-99` (lista e `SQL_VENDORS_VISIVEIS`)
- Modify: `src/services/passos/contexto.ts:11`
- Modify: `src/services/painel.ts:151,493`
- Modify: `src/services/ponto-de-partida.ts:27-28`
- Modify: `frontend/src/views/grc.js` (linha de fornecedor sem perfil; editar cria pelo POST; "Excluir" vira "Remover avaliação de segurança")
- Test: `test/fornecedor-criterio.test.ts`, ajuste em `frontend/test/` do grc se houver teste da lista

**Interfaces:**
- Produces: `SQL_EH_FORNECEDOR` (fragmento SQL sobre o alias `p` de `partes`) exportado de `src/services/terceiros.ts`.

Decisão de comportamento (decorre da spec, A4): a lista do n.iso mostra toda organização que é fornecedor; o perfil de segurança (`vendors`) é opcional. Por isso o "Excluir" do n.iso passa a apagar só o perfil ("Remover avaliação de segurança"); a organização continua fornecedor nos dois módulos até ser inativada em Partes.

- [ ] **Step 1: Teste que falha**

```ts
// test/fornecedor-criterio.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { listarTerceiros } from '../src/services/terceiros';
import { applySchema, sessionFor, workerEnv, designarConsultor, habilitarPrivacy } from './helpers/d1';

const P = 'fc-proj';
const chamar = (h: Record<string, string>, caminho: string) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv());
let consultor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P),
    // criada em Partes, sem perfil de segurança nem vínculo terceiro
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('fc-org', ?, 'organizacao', 'Nuvem Exemplo')`).bind(P),
    // só parte interessada: não é fornecedor
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('fc-pi', ?, 'organizacao', 'Autoridade Exemplo')`).bind(P),
    env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('fc-v', ?, 'fc-pi', 'parte_interessada', 'projeto', ?)`).bind(P, P),
  ]);
  await habilitarPrivacy(P);
  await designarConsultor('cons@ness.lat', P);
  consultor = await sessionFor({ id: 'cons:cons@ness.lat', email: 'cons@ness.lat', role: 'consultor' });
});

describe('fornecedor: o mesmo critério nos dois módulos', () => {
  it('organização criada em Partes aparece no n.iso e no n.privacy; parte interessada não', async () => {
    const { vendors } = await (await chamar(consultor, `/api/v1/projects/${P}/vendors`)).json<{ vendors: { parte_id: string; id: string | null }[] }>();
    expect(vendors.map((v) => v.parte_id).sort()).toEqual(['fc-org']);
    expect(vendors[0].id).toBeNull(); // sem perfil de segurança ainda
    expect((await listarTerceiros(env.DB, P)).map((t) => t.id)).toEqual(['fc-org']);
  });
});
```

Confira o nome do campo do id da parte em `listarTerceiros` (`id` ou `parte_id`) e ajuste.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/fornecedor-criterio.test.ts`
Expected: FAIL (a lista do n.iso vem vazia).

- [ ] **Step 3: Implementar**

Em `terceiros.ts`, depois de `SO_PARTE_INTERESSADA`:

```ts
/** Quem é fornecedor, igual nos dois módulos e em toda contagem: organização ativa que não é só parte interessada. Alias `p` = partes. */
export const SQL_EH_FORNECEDOR = `p.tipo = 'organizacao' AND p.status = 'ativa' AND NOT (${SO_PARTE_INTERESSADA})`;
```

e `listarTerceiros` passa a usar `WHERE project_id = ?1 AND ${SQL_EH_FORNECEDOR}`.

Em `vendors.ts`:

```ts
/** Fornecedor listado = parte que é fornecedor (`SQL_EH_FORNECEDOR`), com o perfil de segurança quando houver. A lista e o CSV usam a mesma consulta. */
export const SQL_VENDORS_VISIVEIS = `SELECT v.*, p.id AS parte_id, p.nome AS name, v.id AS id FROM partes p
  LEFT JOIN vendors v ON v.parte_id = p.id WHERE p.project_id = ? AND ${SQL_EH_FORNECEDOR}`;
```

com a ordenação da lista trocada para `ORDER BY p.nome`. Conferir o CSV (`src/routes/integrations.ts`, `SQL_VENDORS_VISIVEIS`): colunas do perfil vêm `NULL` para quem não tem perfil; o CSV deve escrever vazio, não "null".

`passos/contexto.ts:11`: `fornecedores: \`SELECT COUNT(*) AS n FROM partes p WHERE p.project_id = ? AND ${SQL_EH_FORNECEDOR}\``.

`painel.ts:151` e `:493`: trocar `p.tipo = 'organizacao' AND p.status = 'ativa' AND p.terceiro_tipo IS NOT NULL` por `${SQL_EH_FORNECEDOR}`.

`ponto-de-partida.ts:27-28`: `SELECT count(*) AS n FROM partes p WHERE p.project_id = ? AND ${SQL_EH_FORNECEDOR}`.

Frontend `grc.js` (lista de fornecedores do n.iso): linha com `id` nulo mostra "Sem avaliação de segurança" no lugar do índice; o botão de editar de uma linha sem `id` abre o mesmo formulário e, ao salvar, chama `POST /api/v1/projects/:id/vendors` com o nome da parte (a rota já reaproveita a parte de mesmo nome e cria o perfil). O rótulo do excluir vira "Remover avaliação de segurança" e a confirmação diz que o fornecedor continua cadastrado.

- [ ] **Step 4: Rodar**

Run: `npx tsc --noEmit && npx vitest run test/fornecedor-criterio.test.ts test/fornecedor-terceiro.test.ts test/fornecedores-ficha.test.ts test/terceiros.test.ts test/terceiros-pendencias.test.ts test/painel.test.ts test/ponto-de-partida.test.ts && cd frontend && npx vitest run`
Expected: PASS. Teste antigo que exija o vínculo `terceiro` para listar no n.iso está fixando a divergência: ajuste e diga no commit.

- [ ] **Step 5: Commit**

```bash
git add src frontend test/fornecedor-criterio.test.ts
git commit --author="Ricardo Esper <44273656+resper1965@users.noreply.github.com>" -m "fix: fornecedor tem um critério só nos dois módulos e nas contagens"
```

---

### Task 7: Ativo nasce Confidencial e o select de status sai (A6)

**Files:**
- Modify: `frontend/src/views/monitor.js:1620,1658,1699,1712,1747-1749,1760`
- Test: `frontend/test/ativo-padrao.test.js` (ou o teste existente do monitor que já monta o formulário de ativo: `grep -ln "monitor" frontend/test`)

- [ ] **Step 1: Teste que falha**

Teste que abre o formulário de novo ativo do n.iso e confere que a classificação pré-selecionada é `Confidential`, e que o formulário de edição não tem campo de status nem o envia no `PUT`. Use o padrão do teste de monitor existente (mock de `api` por `vi.hoisted`, como em `frontend/test/privacy-ropa-view.test.js`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run test/ativo-padrao.test.js`
Expected: FAIL (vem `Internal` e o status existe).

- [ ] **Step 3: Implementar**

- `:1699`: pré-selecionar `Confidential`.
- `:1620,1658`: o padrão de exibição sem classificação passa a `Confidential` (é o que o servidor grava).
- `:1747-1749`: apagar o select de status; `:1760`: tirar `status` do corpo do `PUT`.

- [ ] **Step 4: Rodar**

Run: `cd frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit --author="Ricardo Esper <44273656+resper1965@users.noreply.github.com>" -m "fix: ativo nasce Confidencial nos dois módulos; status ignorado sai da tela"
```

---

### Task 8: Documentação, suíte inteira e PR

**Files:**
- Modify: `CHANGELOG.md` (seção "[Não publicado]": "Corrigido (Frente 2A ...)", um item por regra, dizendo quais números mudam)
- Modify: `AGENTS.md` (painel: `SQL_CLASSE_CONTROLE` agora em `src/services/classe-controle.ts`, inclui `Compliant`; "hoje" em `src/services/hoje.ts` e `frontend/src/hoje.js`; fornecedor por `SQL_EH_FORNECEDOR`; marco por `SQL_MARCO_DO_PROGRAMA`; tirar a menção a `blocoRiscos`/`blocoAcoes` de `tratamento-ligacoes.js`, que não existem mais)

- [ ] **Step 1:** Atualizar os dois arquivos.
- [ ] **Step 2:** `npx tsc --noEmit && cd frontend && npx vitest run && npm run build && cd .. && npx vitest run` (suíte inteira, ~13 min). Expected: tudo PASS; colar o resumo no PR.
- [ ] **Step 3:** Commit, push para `claude/frente2-regras`, PR em rascunho pelo template do repositório, assinatura de atividade do PR.
