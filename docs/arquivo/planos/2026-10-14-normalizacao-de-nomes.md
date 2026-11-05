# Normalização de nomes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo nome de pessoa, organização, departamento e ativo entra padronizado, e há como padronizar o que já existe.

**Architecture:** Uma função pura (`src/services/nomes.ts`) chamada nos esquemas de entrada e nos gravadores que os contornam; um serviço de saneamento com rotas no `nucleoApp`; um modal em Partes.

**Tech Stack:** TypeScript (Hono, Zod, D1), vitest (`cloudflare:test`), frontend vanilla JS com vitest/jsdom.

**Spec:** `docs/superpowers/specs/2026-10-14-normalizacao-de-nomes-design.md`

## Global Constraints

- Sem migration; sem dependência nova.
- Código em inglês onde já é assim, comentários e mensagens em português; UI sem emoji, sem itálico.
- Nenhum nome de cliente ou pessoa real em teste, fixture ou doc (`test/sem-dado-de-cliente.test.ts`).
- `any` não sobe (`test/any-catraca.test.ts`).
- Rota nova de projeto precisa de faixa em `src/modulos.ts` (`test/modulos-produto.test.ts`).
- Commits com `user.email=44273656+resper1965@users.noreply.github.com`; branch a partir de `origin/main`.

---

### Task 1: `normalizarNome` e `chaveNome`

**Files:**
- Create: `src/services/nomes.ts`
- Test: `test/nomes.test.ts`

**Interfaces:**
- Produces: `normalizarNome(texto: string): string`, `chaveNome(texto: string): string`.

- [ ] **Step 1: Write the failing test** (`test/nomes.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { normalizarNome, chaveNome } from '../src/services/nomes';

const CASOS: [string, string][] = [
  ['ti', 'TI'],
  ['ger. de ti', 'Ger. de TI'],
  ['depto financeiro', 'Departamento Financeiro'],
  ['DEPTO. FINANCEIRO', 'Departamento Financeiro'],
  ['maria da silva', 'Maria da Silva'],
  ['MARIA DA SILVA', 'Maria da Silva'],
  ["  joão   d'ávila  ", "João D'Ávila"],
  ['SAP', 'SAP'],
  ['servidor de arquivos', 'Servidor de Arquivos'],
  ['McDonald', 'McDonald'],
  ['iPhone corporativo', 'iPhone Corporativo'],
  ['tecnologia da informação (ti)', 'Tecnologia da Informação (TI)'],
  ['ti/rh', 'TI/RH'],
  ['ana a. silva', 'Ana A. Silva'],
  ['acme ltda', 'Acme Ltda.'],
  ['infra e mkt', 'Infraestrutura e Marketing'],
  ['o setor', 'O Setor'],
  ['Gerência DE TI', 'Gerência de TI'],
  ['PC-001', 'PC-001'],
  ['maria-clara', 'Maria-Clara'],
  ['', ''],
  ['   ', ''],
];

describe('normalizarNome', () => {
  it.each(CASOS)('%j vira %j', (entrada, saida) => expect(normalizarNome(entrada)).toBe(saida));
  it('é idempotente', () => { for (const [, saida] of CASOS) expect(normalizarNome(saida)).toBe(saida); });
});

describe('chaveNome', () => {
  it('ignora caixa, acento e espaço repetido', () => {
    expect(chaveNome('  João   DA Silva ')).toBe(chaveNome('joao da silva'));
    expect(chaveNome('TI')).toBe(chaveNome('ti'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/nomes.test.ts`
Expected: FAIL (módulo `../src/services/nomes` não existe).

- [ ] **Step 3: Write the implementation** (`src/services/nomes.ts`)

```ts
/**
 * Padronização de nome (pessoa, organização, departamento, ativo). Pura e idempotente; as regras estão em
 * docs/superpowers/specs/2026-10-14-normalizacao-de-nomes-design.md. Sigla e abreviatura vivem aqui, em código:
 * ampliar a lista é um PR, não dado por projeto.
 */

const SIGLAS = new Set([
  'ti', 'tic', 'rh', 'dpo', 'ciso', 'ceo', 'cfo', 'cto', 'cio', 'coo', 'lgpd', 'gdpr', 'anpd', 'sgsi', 'isms', 'iso', 'erp', 'crm',
  'sap', 'sac', 'sla', 'pmo', 'csirt', 'dpia', 'ripd', 'ropa', 'rpa', 'capa', 'api', 'vpn', 'soc', 'pf', 'pj', 'cpf', 'cnpj', 'ia',
  'qa', 'bi', 'lan', 'wan', 'cctv',
]);

/** Só as sem ambiguidade; `ger.`, `adm.`, `dir.` e `coord.` ficam como digitadas. */
const ABREVIATURAS: Record<string, string> = {
  depto: 'Departamento', dpto: 'Departamento', dept: 'Departamento', mkt: 'Marketing', infra: 'Infraestrutura', ltda: 'Ltda.',
};

const CONECTORES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos', 'para', 'por', 'com', 'a', 'o']);

const maiusculoNasPartes = (s: string) => s.replace(/(^|[-'’/])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toUpperCase());

function palavra(w: string, i: number, tudoMaiusculo: boolean): string {
  const m = w.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u)!;
  const [, pre, core, pos] = m;
  if (!core) return w;
  const chave = core.toLowerCase();
  if (/^\p{L}$/u.test(core) && pos.startsWith('.')) return pre + core.toUpperCase() + pos;
  if (ABREVIATURAS[chave]) return pre + ABREVIATURAS[chave] + pos.replace(/^\./, '');
  if (SIGLAS.has(chave)) return pre + core.toUpperCase() + pos;
  if (i > 0 && CONECTORES.has(chave)) return pre + chave + pos;
  const resto = core.slice(1);
  const misto = resto !== resto.toLowerCase() && core !== core.toUpperCase();
  if (misto) return w;
  if (core === core.toUpperCase() && core.length >= 2 && core.length <= 4 && !tudoMaiusculo && /\p{L}/u.test(core)) return w;
  if (core === core.toUpperCase() && core.length >= 2 && !tudoMaiusculo && !/\p{L}/u.test(core.slice(0, 1))) return w;
  if (core === core.toUpperCase() && core.length >= 2 && !tudoMaiusculo) return w;
  return pre + maiusculoNasPartes(chave) + pos;
}

export function normalizarNome(texto: string): string {
  const t = texto.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const partes = t.split(/(\s|\/)/);
  const palavras = partes.filter((p) => p && p !== ' ' && p !== '/');
  const tudoMaiusculo = /\p{L}/u.test(t) && t === t.toUpperCase() && (palavras.length > 1 || t.length > 4);
  let i = 0;
  return partes.map((p) => (!p || p === ' ' || p === '/' ? p : palavra(p, i++, tudoMaiusculo))).join('');
}

/** Para achar duplicata (`TI` e `ti`, `João` e `Joao`); nunca é gravada. */
export const chaveNome = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/nomes.test.ts`
Expected: PASS (ajuste a função, não o teste, se algum caso falhar; as três linhas de "toda em maiúsculas" são uma só regra e devem ser reduzidas a `if (core === core.toUpperCase() && core.length >= 2 && !tudoMaiusculo) return w;` se o teste passar com ela).

- [ ] **Step 5: Commit**

```bash
git add src/services/nomes.ts test/nomes.test.ts
git commit -m "feat(nomes): normalizarNome e chaveNome"
```

### Task 2: Aplicar ao gravar

**Files:**
- Modify: `src/schemas/nucleo.ts:36` (`nome`), `src/schemas/domain.ts:360` (`name` de `assetSchema`)
- Modify: `src/services/partes.ts` (`garantir`), `src/routes/vendors.ts:125`, `src/services/encarregado-pessoa.ts:37`, `src/services/importacao.ts:636-637,681`, `src/services/itens.ts` (`stmtsCriarAtivo`)
- Test: `test/nomes-gravacao.test.ts`

**Interfaces:**
- Consumes: `normalizarNome` (Task 1).

- [ ] **Step 1: Write the failing test** (`test/nomes-gravacao.test.ts`): sessão `platform_admin` com `seedTwoProjects` (padrão de `test/documentos.test.ts`); `POST /departamentos {nome: 'depto de ti'}` grava `Departamento de TI`; `POST /partes {nome: 'maria da silva'}` grava `Maria da Silva`; `POST /assets {name: 'servidor de arquivos', ...}` grava `Servidor de Arquivos`; `PUT /departamentos/:id {nome: 'rh'}` grava `RH`; `importarPartes` com stakeholder `depto financeiro` grava `Departamento Financeiro`. Cada um confere por `SELECT nome` no D1.

- [ ] **Step 2: Run to verify it fails** — `npx vitest run test/nomes-gravacao.test.ts` (grava o texto cru).

- [ ] **Step 3: Implement**

`src/schemas/nucleo.ts`: `import { normalizarNome } from '../services/nomes';` e `const nome = z.string().trim().min(1).max(200).transform(normalizarNome);`.
`src/schemas/domain.ts`: em `assetSchema`, `name: curto.transform(normalizarNome),`.
`partes.ts` `garantir`: `const limpo = normalizarNome(nome);` e usar `limpo` no `INSERT` (a chave `norm` continua igual).
`vendors.ts:125`, `encarregado-pessoa.ts:37`, `importacao.ts:636,637,681` (`d.nome`), `itens.ts` (`b.name`): envolver o nome em `normalizarNome(...)`.

- [ ] **Step 4: Run** — `npx vitest run test/nomes-gravacao.test.ts test/nomes.test.ts test/openapi.test.ts test/importacao.test.ts test/terceiros.test.ts test/fornecedor-terceiro.test.ts` e `npx tsc --noEmit`. Expected: PASS. Corrija o teste existente que fixava nome cru, se houver, para o nome normalizado.

- [ ] **Step 5: Commit** — `git commit -m "feat(nomes): normaliza o nome ao gravar"`

### Task 3: Saneamento (serviço e rotas)

**Files:**
- Create: `src/services/padronizar-nomes.ts`
- Modify: `src/routes/nucleo.ts` (duas rotas), `src/modulos.ts` (faixa `padronizar-nomes: 'nucleo'`), `src/middleware/agente.ts` (`FORA_DO_AGENTE`), `src/schemas/nucleo.ts` (`padronizarNomesSchema`)
- Test: `test/padronizar-nomes.test.ts`

**Interfaces:**
- Produces: `propostasDeNomes(db, projectId): Promise<{ propostas: Proposta[]; duplicatas: Duplicata[] }>` e `aplicarNomes(db, projectId, ator, itens): Promise<{ aplicados: number; ignorados: { tabela: string; id: string; motivo: string }[] }>`, com `type Tabela = 'partes' | 'departamentos' | 'itens'`.

- [ ] **Step 1: Write the failing test**: semeia partes/departamentos/itens com `ti`, `Maria da silva`, `TI` etc. via SQL; `GET` lista a proposta `ti → TI` com `conflito` quando já existe `TI`; `POST` aplica as ids pedidas e deixa a trilha `nome.padronizado`; ignora conflito; ignora linha cujo nome mudou entre a lista e o clique; não toca outro projeto; consultor aplica, `org_user` leva 403.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** `src/services/padronizar-nomes.ts`: `SELECT id, nome FROM <tabela> WHERE project_id = ?` para as três tabelas (nome de tabela vem de constante, nunca do corpo); proposta quando `normalizarNome(nome) !== nome`; `conflito` quando outra linha da mesma tabela tem exatamente `depois`; `duplicatas` agrupando por `chaveNome`. `aplicarNomes` recalcula `depois` no servidor e faz `UPDATE <tabela> SET nome = ? WHERE id = ? AND project_id = ? AND nome = ?` (com `updated_at` onde a tabela tem); `meta.changes === 0` vira `ignorados` ("nome mudou"); `UNIQUE` vira "conflito". Rotas: `GET/POST /padronizar-nomes`, ambas só para `ehEquipeNess`; corpo validado por `padronizarNomesSchema` (`itens` de 1 a 200, `tabela` no enum).

- [ ] **Step 4: Run** — `npx vitest run test/padronizar-nomes.test.ts test/modulos-produto.test.ts test/agente*.test.ts` e `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(nomes): saneamento de nomes já gravados"`

### Task 4: Tela

**Files:**
- Create: `frontend/src/views/padronizar-nomes.js`; Modify: `frontend/src/main.js` (import), `frontend/src/views/partes.js` (botão)
- Test: `frontend/test/padronizar-nomes.test.js`

- [ ] **Step 1: Write the failing test** (estilo de `frontend/test/terceiros-view.test.js`, com `servir`): `abrirPadronizarNomes('p9')` lista antes → depois escapados; conflito aparece desabilitado; `aplicarPadronizarNomes('p9')` manda só as marcadas para `POST .../padronizar-nomes`; botão em Partes só para quem edita.
- [ ] **Step 2: Run to verify it fails** — `cd frontend && npx vitest run test/padronizar-nomes.test.js` (use `npm ci --include=dev` se faltar dependência: o ambiente tem `NODE_ENV=production`).
- [ ] **Step 3: Implement** o modal (`openModal`, `escapeHTML`, `data-action`, sem handler inline) e o botão "Padronizar nomes" em `partes.js`.
- [ ] **Step 4: Run** a suíte do frontend (`npx vitest run`; timeouts isolados por carga passam sozinhos).
- [ ] **Step 5: Commit** — `git commit -m "feat(nomes): tela Padronizar nomes em Partes"`

### Task 5: Documentação e entrega

- [ ] CHANGELOG (`[Não publicado]`), uma linha em `AGENTS.md` no parágrafo de partes (a regra e o saneamento).
- [ ] `npx tsc --noEmit`, `npx vitest run test/sem-dado-de-cliente.test.ts` (só arquivos do PR podem aparecer), push, PR, CI, merge e conferência do `/health` (cada merge pede a confirmação do dono).
