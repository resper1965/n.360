# Onda 1: organização direta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma empresa usa o n.360 por conta própria (organização `direta`): o admin dela (`consultoria_admin`) exerce os atos que hoje são só do `org_admin` do cliente, e nenhuma pessoa aprova o que ela mesma criou.

**Architecture:** `organizations.tipo` (`consultoria` | `direta`, default `consultoria`). Dois helpers assíncronos leem o tipo **do banco** (organização da sessão, dona do projeto, ativa): `adminDireto` e `gestorArciberDireto`. As sete travas presas a `org_admin` passam a aceitar o admin direto por esses helpers; nada é derivado de `ehEquipeNess`. A regra "criador ≠ decisor" entra no servidor para pedido, base do site e avaliação do n.ot, em toda organização.

**Tech Stack:** Cloudflare Worker (Hono) + D1, vitest (`@cloudflare/vitest-pool-workers`), SPA vanilla JS.

**Spec:** `docs/superpowers/specs/2026-11-16-onda1-organizacao-direta-design.md` (aprovada em 16/11/2026). Levantamento: somente leitura, não versionado.

## Global Constraints

- O tipo é lido do banco: `organizations.tipo` da organização **da sessão** (`orgDoUsuario(user)`), igual a `projects.org_id` do projeto, com `status = 'Active'`. Nunca do `X-Org-Id`, nunca do corpo.
- Agente MCP e chave de API (`role: 'client'`, `agente === true` ou `id` começando por `apikey:`) nunca passam nas travas novas (P0-2 do n.ot).
- P0-1 do n.ot: `ot` nunca é concedido por padrão; o gatilho `usuario_modulos_padrao` não muda.
- `consultoria_admin` de organização `consultoria` continua recusado em todas as travas novas.
- `plan` não é reaproveitado (já recebe o literal `'consultoria'`); o tipo é a coluna nova.
- Migration: `schema.sql` e `migrations/0113_*.sql` juntos; procedimento de `migrations/README.md` (backup, apply remoto, conferir, só então merge). Conferir na main se `0113` ainda está livre (a última no disco é `0112_ot_assessment.sql`).
- Textos de tela em português, sem estilo inline novo, sem handler inline (CSP).
- Comando de teste backend: `npx vitest run <arquivo>`; frontend: `NODE_OPTIONS=--no-experimental-webstorage npx vitest run --config frontend/vitest.config.js <arquivo>` (conferir o config real em `package.json`). Gate final: `bash scripts/ci/gate.sh`.
- Três PRs: **PR1** = Tasks 1-2, **PR2** = Tasks 3-7, **PR3** = Tasks 8-9.

## File Structure

- `migrations/0113_organizacao_tipo.sql`, `schema.sql`: coluna `tipo`.
- `src/services/organizacao.ts`: `tipoDaOrg`, `adminDireto`, `semComercialNaDireta`.
- `src/services/ot-inventario.ts`: `gestorArciberDireto`, `CARGO_GESTOR_ARCIBER` (movido de `ot-conformidade.ts`, que reexporta), trava `podeVerCompleto`.
- `src/helpers.ts`: `podeRevogarAprovacao`, `podeMexerEmAssinaturaDe`, `somenteComercial`.
- `src/routes/ot.ts`, `painel-ot.ts`, `avisos-prazo.ts`, `data-subject.ts`, `governance.ts`, `nucleo.ts`, `platform.ts`, `ropa.ts`, `ropa-abas/*`: consumidores.
- `src/routes/pedidos.ts`, `src/services/ot-fase.ts`, `src/services/ot-avaliacao.ts`: regra criador ≠ decisor.
- `src/routes/organizacoes.ts`, `src/schemas/domain.ts`: criação com tipo e módulos.
- `test/organizacao-direta.test.ts` (novo): tudo da onda no backend; `test/contrato-isolamento-org.test.ts`: terceira organização.
- Frontend: `frontend/src/views/organizacoes.js`, `produto.js`, `admin.js`, `login.html`, `globals.js`.

---

## PR1 — Tipo e criação

### Task 1: Coluna `tipo`, criação com tipo e módulos

**Files:**
- Create: `migrations/0113_organizacao_tipo.sql`
- Modify: `schema.sql` (bloco `organizations`, ~linha 716-743), `src/schemas/domain.ts:539-550`, `src/routes/organizacoes.ts:31-71`
- Test: `test/organizacao-direta.test.ts` (novo), `test/migrations-consistencia.test.ts` (existente, deve passar)

**Interfaces:**
- Produces: `organizations.tipo TEXT NOT NULL DEFAULT 'consultoria' CHECK (tipo IN ('consultoria','direta'))`; `criarOrgSchema` aceita `tipo?: 'consultoria'|'direta'` (default `consultoria`) e `modulos?: ('iso'|'privacy'|'ot')[]`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// test/organizacao-direta.test.ts
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

const SENHA = 'Senha-forte-123!';
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv() as any);
const um = <T = any>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<T>();
const S: Record<string, Record<string, string>> = {};
const novaOrg = (o: Record<string, unknown> = {}) => ({
  nome: 'Empresa Direta', slug: 'empresa-direta', cnpj: '11222333000181', adminEmail: 'admin@direta.lat', adminNome: 'Admin Direta',
  maxProjetos: 5, maxUsuarios: 10, termoVersao: 'direta-v1-2026-11', ...o,
});

afterEach(() => vi.restoreAllMocks());
beforeAll(async () => {
  await applySchema();
  const h = await hashPassword(SENHA);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id, ativo) VALUES ('u-pa','pa@ness.lat',?,'PA','platform_admin','org_ness',1)`).bind(h),
  ]);
  S.pa = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
});

describe('criação de organização com tipo', () => {
  it('sem tipo nasce consultoria', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}'));
    const r = await chamar('POST', '/api/v1/platform/orgs', S.pa, novaOrg({ nome: 'C', slug: 'cons-x', adminEmail: 'a@cons.lat' }));
    expect(r.status).toBe(201);
    expect((await um('SELECT tipo FROM organizations WHERE id = ?', 'org_cons-x')).tipo).toBe('consultoria');
  });
  it('direta com módulos escolhidos na criação', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}'));
    const r = await chamar('POST', '/api/v1/platform/orgs', S.pa, novaOrg({ tipo: 'direta', modulos: ['iso', 'privacy'] }));
    expect(r.status).toBe(201);
    const o = await um('SELECT tipo, modulos_contratados m FROM organizations WHERE id = ?', 'org_empresa-direta');
    expect(o.tipo).toBe('direta');
    expect(JSON.parse(o.m)).toEqual(['iso', 'privacy']);
  });
  it('tipo inválido é recusado e o tipo não muda depois de criado', async () => {
    expect((await chamar('POST', '/api/v1/platform/orgs', S.pa, novaOrg({ slug: 'x-y-z', adminEmail: 'z@z.lat', tipo: 'outra' }))).status).toBe(400);
    const r = await chamar('PUT', '/api/v1/platform/orgs/org_empresa-direta', S.pa, { tipo: 'consultoria' });
    expect(r.status).toBe(400); // atualizarOrgSchema é strict: não aceita o campo
    expect((await um('SELECT tipo FROM organizations WHERE id = ?', 'org_empresa-direta')).tipo).toBe('direta');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/organizacao-direta.test.ts`
Expected: FAIL (`no such column: tipo` / schema recusa `tipo`).

- [ ] **Step 3: Implementar**

`migrations/0113_organizacao_tipo.sql`:
```sql
-- 0113 — organização do tipo direta (spec 2026-11-16 onda 1). Aditiva: DEFAULT 'consultoria' dispensa backfill.
-- Verificar depois de aplicar: SELECT count(*) FROM organizations WHERE tipo = 'consultoria' → igual ao total de organizações.
ALTER TABLE organizations ADD COLUMN tipo TEXT NOT NULL DEFAULT 'consultoria' CHECK (tipo IN ('consultoria', 'direta'));
```
`schema.sql`, no `CREATE TABLE organizations`, depois de `modulos_contratados`:
```sql
    modulos_contratados TEXT NOT NULL DEFAULT '["iso"]',
    tipo TEXT NOT NULL DEFAULT 'consultoria' CHECK (tipo IN ('consultoria', 'direta'))
```
(Conferir a vírgula: `modulos_contratados` hoje é a última coluna, linha 743.)

`src/schemas/domain.ts`, em `criarOrgSchema`, antes do `}).strict()`:
```ts
  tipo: z.enum(['consultoria', 'direta']).default('consultoria'),
  modulos: z.array(z.enum(['iso', 'privacy', 'ot'])).min(1).optional(),
```
`src/routes/organizacoes.ts`, no INSERT de `organizations` acrescentar `tipo` e `modulos_contratados`:
```ts
db.prepare(`INSERT INTO organizations (id, name, slug, plan, max_projects, max_users, owner_id, status, cnpj, prefixo_proposta,
  proximo_numero, termo_aceito_em, termo_versao, tipo, modulos_contratados) VALUES (?, ?, ?, 'consultoria', ?, ?, ?, 'Active', ?, ?, 1, datetime('now'), ?, ?, ?)`)
  .bind(id, b.nome, b.slug, b.maxProjetos, b.maxUsuarios, adminId, b.cnpj ?? null, b.prefixoProposta ?? null, b.termoVersao, b.tipo,
    JSON.stringify(b.modulos ?? ['iso'])),
```
Na linha de auditoria, incluir `tipo ${b.tipo}` no texto de `org.criada`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/organizacao-direta.test.ts test/migrations-consistencia.test.ts test/organizacoes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add migrations/0113_organizacao_tipo.sql schema.sql src/schemas/domain.ts src/routes/organizacoes.ts test/organizacao-direta.test.ts
git commit -m "feat(onda1): organizations.tipo e criação com tipo e módulos"
```

### Task 2: `tipoDaOrg`, `adminDireto`, `gestorArciberDireto`

**Files:**
- Modify: `src/services/organizacao.ts` (fim do arquivo), `src/services/ot-inventario.ts` (topo), `src/services/ot-conformidade.ts:9`
- Test: `test/organizacao-direta.test.ts`

**Interfaces:**
- Produces:
  - `tipoDaOrg(db: D1Database, orgId: string | null): Promise<'consultoria' | 'direta' | null>`
  - `adminDireto(db, user: {role?, org_id?, id?, agente?}|null|undefined, projectId: string): Promise<boolean>`
  - `gestorArciberDireto(db, user: {…, email?}, projectId): Promise<boolean>` (em `ot-inventario.ts`)
  - `CARGO_GESTOR_ARCIBER` agora definido em `ot-inventario.ts` e reexportado por `ot-conformidade.ts` (evita ciclo de import).

- [ ] **Step 1: Escrever o teste que falha** (acrescentar ao arquivo; fixtures: org direta `org_d`, consultoria `org_c`, projetos `p-d` e `p-c`)

```ts
import { adminDireto } from '../src/services/organizacao';
import { gestorArciberDireto } from '../src/services/ot-inventario';

describe('adminDireto / gestorArciberDireto', () => {
  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO organizations (id, name, slug, max_projects, max_users, tipo) VALUES ('org_d','Direta','direta-d',10,10,'direta'), ('org_c','Consultoria','cons-c',10,10,'consultoria')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-d','D','ISO 27001','controller','Active','org_d'),('p-c','C','ISO 27001','controller','Active','org_c')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title, is_primary) VALUES ('p-d','Ana','ana@d.lat','operacoes','Gestor ARCiber',1)`),
    ]);
  });
  const ad = { id: 'u-ad', email: 'ana@d.lat', role: 'consultoria_admin', org_id: 'org_d' };
  it('admin da organização direta, no projeto dela', async () => expect(await adminDireto(env.DB, ad, 'p-d')).toBe(true));
  it('não em projeto de outra organização', async () => expect(await adminDireto(env.DB, ad, 'p-c')).toBe(false));
  it('consultoria_admin de consultoria não passa', async () => expect(await adminDireto(env.DB, { ...ad, org_id: 'org_c' }, 'p-c')).toBe(false));
  it('outros papéis, agente e chave de API não passam', async () => {
    for (const u of [{ ...ad, role: 'consultor' }, { ...ad, role: 'org_admin' }, { ...ad, agente: true }, { ...ad, id: 'apikey:k' }, null]) {
      expect(await adminDireto(env.DB, u as any, 'p-d')).toBe(false);
    }
  });
  it('organização suspensa não passa', async () => {
    await env.DB.prepare(`UPDATE organizations SET status = 'Suspended' WHERE id = 'org_d'`).run();
    expect(await adminDireto(env.DB, ad, 'p-d')).toBe(false);
    await env.DB.prepare(`UPDATE organizations SET status = 'Active' WHERE id = 'org_d'`).run();
  });
  it('gestor: admin direto que consta no cargo (e-mail igual)', async () => {
    expect(await gestorArciberDireto(env.DB, ad, 'p-d')).toBe(true);
    expect(await gestorArciberDireto(env.DB, { ...ad, email: 'outro@d.lat' }, 'p-d')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/organizacao-direta.test.ts -t "adminDireto"`
Expected: FAIL (funções não existem).

- [ ] **Step 3: Implementar**

Fim de `src/services/organizacao.ts`:
```ts
export type TipoOrg = 'consultoria' | 'direta';

/** O tipo da organização, lido do banco. Organização inexistente = `null`. */
export async function tipoDaOrg(db: D1Database, orgId: string | null | undefined): Promise<TipoOrg | null> {
  if (!orgId) return null;
  const r = await db.prepare('SELECT tipo FROM organizations WHERE id = ?').bind(orgId).first<{ tipo: TipoOrg }>();
  return r?.tipo ?? null;
}

/**
 * O `consultoria_admin` da organização DIRETA (a empresa que usa o n.360 por conta própria), no projeto dela. As quatro condições
 * juntas: papel, organização da SESSÃO (`org_id`, nunca o `X-Org-Id`), `projects.org_id` igual a ela e tipo `direta` lido do banco
 * com a organização ativa. Pessoa apenas: agente e chave de API entram como `client` e, por garantia, também são recusados aqui.
 */
export async function adminDireto(
  db: D1Database, user: { role?: string | null; org_id?: string | null; id?: string | null; agente?: boolean } | null | undefined, projectId: string,
): Promise<boolean> {
  if (!user || user.role !== 'consultoria_admin' || user.agente === true || String(user.id ?? '').startsWith('apikey:')) return false;
  const org = orgDoUsuario(user);
  if (!org) return false;
  return !!await db.prepare(`SELECT 1 FROM organizations o JOIN projects p ON p.org_id = o.id
    WHERE o.id = ? AND p.id = ? AND o.tipo = 'direta' AND o.status = 'Active'`).bind(org, projectId).first();
}
```
Topo de `src/services/ot-inventario.ts` (imports) e, depois de `podeAprovar`:
```ts
import { adminDireto } from './organizacao';

/** Cargo do Gestor ARCiber em `project_governance` (spec §3): a mesma regra no 4.2.1 e no aviso do step-up (ot-stepup.ts). */
export const CARGO_GESTOR_ARCIBER = `lower(trim(job_title)) = 'gestor arciber'`;

/** Gestor ARCiber da organização direta: o admin direto que também consta no cargo (titular ou suplente), pelo e-mail. */
export async function gestorArciberDireto(db: D1Database, u: AtorOt, projectId: string): Promise<boolean> {
  if (!await adminDireto(db, u, projectId)) return false;
  return !!await db.prepare(`SELECT 1 FROM project_governance WHERE project_id = ? AND ${CARGO_GESTOR_ARCIBER} AND lower(email) = lower(?)`)
    .bind(projectId, u.email).first();
}
```
`src/services/ot-conformidade.ts:9`: trocar a definição por `export { CARGO_GESTOR_ARCIBER } from './ot-inventario';` (e ajustar o `import { FLUXO_VISIVEL } from './ot-inventario'` para também importar `CARGO_GESTOR_ARCIBER`, pois o arquivo a usa na linha 54).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/organizacao-direta.test.ts test/ot-modulo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/organizacao.ts src/services/ot-inventario.ts src/services/ot-conformidade.ts test/organizacao-direta.test.ts
git commit -m "feat(onda1): adminDireto e gestorArciberDireto, lidos do banco"
```

**Entrega PR1:** `bash scripts/ci/gate.sh`, abrir PR (rascunho), depois do aceite do dono: backup, `wrangler d1 execute niso-db --remote --file migrations/0113_organizacao_tipo.sql`, conferir a query da migration, só então merge. (Ver `migrations/README.md:24-35`.)

---

## PR2 — As travas e a regra de pessoa diferente

### Task 3: n.ot aceita o admin direto (Gestor, inventário completo, painel, avisos)

**Files:**
- Modify: `src/routes/ot.ts:771,814,821,828,1011,1019,1039,1047,1129`, `src/services/ot-inventario.ts:33-44`, `src/services/painel-ot.ts:19,23`, `src/services/avisos-prazo.ts:324`
- Test: `test/organizacao-direta.test.ts`

**Interfaces:**
- Consumes: `adminDireto`, `gestorArciberDireto` (Task 2).
- Produces: `ehGestorArciber(c, projectId): Promise<boolean>` (era síncrona); `podeVerCompleto` aceita o admin direto.

- [ ] **Step 1: Escrever o teste que falha** (fixture: projeto `p-d` com módulo `ot`, usuário Ana com `ot`; o teste chama `PUT /api/v1/projects/p-d/ot/agente` com `{ligado: true}`; conferir o schema real `otAgenteInterruptorSchema` e a URL montada em `test/ot-modulo.test.ts`)

```ts
describe('n.ot: Gestor ARCiber na organização direta', () => {
  it('admin direto designado Gestor liga o agente de coleta; o não designado não; o de consultoria não', async () => {
    // Ana (ana@d.lat) consta como Gestor ARCiber em p-d; Beto é admin direto sem o cargo; Cris é admin de consultoria.
    // Conceder `ot` ao projeto e às três pessoas pelo helper concederModulos (test/helpers/d1.ts) e projeto_modulos.
    expect((await chamar('PUT', '/api/v1/projects/p-d/ot/agente', S.ana, { ligado: true })).status).toBe(200);
    expect((await chamar('PUT', '/api/v1/projects/p-d/ot/agente', S.beto, { ligado: true })).status).toBe(403);
    expect((await chamar('PUT', '/api/v1/projects/p-d/ot/agente', S.cris, { ligado: true })).status).toBe(403);
  });
  it('podeVerCompleto: admin direto sim; consultoria_admin de consultoria sem designação não', async () => {
    const { podeVerCompleto } = await import('../src/services/ot-inventario');
    expect(await podeVerCompleto(env.DB, { id: 'u-beto', email: 'beto@d.lat', role: 'consultoria_admin', org_id: 'org_d' } as any, 'p-d')).toBe(true);
    expect(await podeVerCompleto(env.DB, { id: 'u-cris', email: 'cris@c.lat', role: 'consultoria_admin', org_id: 'org_c' } as any, 'p-c')).toBe(false);
  });
  it('agente e chave de API do projeto direto continuam recusados', async () => {
    const { podeVerCompleto } = await import('../src/services/ot-inventario');
    for (const u of [{ id: 'apikey:k', role: 'client' }, { id: 'ag', role: 'client', agente: true }]) {
      expect(await podeVerCompleto(env.DB, { ...u, email: 'x@d.lat' } as any, 'p-d')).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/organizacao-direta.test.ts -t "n.ot"`
Expected: FAIL (Ana recebe 403; `podeVerCompleto` do Beto é false).

- [ ] **Step 3: Implementar**

`src/routes/ot.ts:814`:
```ts
const ehGestorArciber = async (c: C, projectId: string) => {
  const u = c.get('user');
  if (u.role === 'org_admin' && u.client_project_id === projectId) return true;
  return gestorArciberDireto(c.env.DB, u, projectId);
};
```
Importar `gestorArciberDireto` de `../services/ot-inventario`. Em **todos** os usos (`:771, :821, :828, :1011, :1019, :1039, :1047, :1129`) trocar `ehGestorArciber(c, X)` por `await ehGestorArciber(c, X)` (todos já estão em handlers `async`; no `:821` é dentro de um objeto, `pode_ligar: await ehGestorArciber(c, projectId)`).

`src/services/ot-inventario.ts`, `podeVerCompleto`: depois da linha `if (u.role !== 'consultoria_admin') return false;` ficar:
```ts
  if (u.role !== 'consultoria_admin') return false;
  if (await adminDireto(db, u, projectId)) return true;
  return !!await db.prepare(`SELECT 1 FROM projects WHERE id = ? AND id IN (${PROJETOS_DO_CONSULTOR_SQL})`).bind(projectId, u.email).first();
```
(O `AtorOt` não tem `org_id`: acrescentar `org_id?: string | null` à interface `AtorOt`, e conferir que a rota passa o `user` da sessão inteiro.)

`src/services/painel-ot.ts:19,23`: depois de `const pessoa = ...`:
```ts
  const direto = pessoa && await gestorArciberDireto(db, ator, projectId);
  const gestor = (ator.role === 'org_admin' && ator.client_project_id === projectId) || direto;
  const aprova = pessoa && (ator.role === 'org_admin' || ehConsultor(ator) || await adminDireto(db, ator, projectId));
```
(`ator` precisa de `org_id`: `AtorPainelOt` herda `AtorOt`; passar o usuário inteiro em `src/routes/painel.ts`.)

`src/services/avisos-prazo.ts:324`: `SO_GESTOR` passa a incluir o admin direto designado:
```ts
const destinos = SO_GESTOR.has(item.fonte)
  ? await filtrarGestores(db, item.project_id, comModulo)
  : item.fonte === 'ot_revisao' ? comModulo : escolherDestinatarios(comModulo, item.responsavel);
```
com, no mesmo arquivo:
```ts
/** org_admin do projeto (o `pessoasDoProjeto` já prende o cliente ao client_project_id) ou o admin direto designado Gestor ARCiber. */
async function filtrarGestores(db: D1Database, projectId: string, pessoas: Pessoa[]): Promise<Pessoa[]> {
  const r: Pessoa[] = [];
  for (const p of pessoas) {
    if (p.role === 'org_admin' || (p.role === 'consultoria_admin' && await gestorArciberDireto(db, p as any, projectId))) r.push(p);
  }
  return r;
}
```
Conferir se `Pessoa` carrega `org_id`/`email`/`id`; se faltar, estender a consulta de `pessoasDoProjeto` para incluí-los (e garantir que `consultoria_admin` da organização do projeto está na lista de pessoas; se `pessoasDoProjeto` só traz quem tem acesso, ele já inclui o admin da organização).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/organizacao-direta.test.ts test/ot-modulo.test.ts test/avisos-prazo.test.ts test/painel.test.ts` (nomes reais: `ls test | grep -E "ot-|painel|avisos"`; rodar todos os de n.ot)
Expected: PASS, sem regressão no P0-1/P0-2.

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat(onda1): o admin direto exerce o Gestor ARCiber no n.ot"
```

### Task 4: Matriz de assinatura, revogação e titular aceitam o admin direto

**Files:**
- Modify: `src/helpers.ts:24,498` (+ helpers novos), `src/routes/governance.ts:179,249,567`, `src/routes/nucleo.ts:257`, `src/routes/data-subject.ts:19,100`, `src/routes/platform.ts:151`, `src/routes/ropa.ts:545`, `src/services/ropa-abas/situacao.ts:51,83`, `src/services/ropa-abas/ficha.ts:76`
- Test: `test/organizacao-direta.test.ts`

**Interfaces:**
- Produces:
  - `podeMexerEmAssinaturaDe(db, u, projectId): Promise<boolean>` = `podeMexerEmAssinatura(u, projectId) || adminDireto(db, u, projectId)`.
  - `podeRevogarAprovacao(db, u, projectId): Promise<boolean>` = `PODE_REVOGAR_APROVACAO.has(role) || adminDireto(...)`.
  - `papelDe(user, podePedir, bloqueios, direto = false)`: `podeRevogar` também vale quando `direto`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
describe('privacy: matriz de assinatura, revogação, titular', () => {
  it('admin direto cria a linha de quem assina; o admin de consultoria não', async () => {
    const corpo = { name: 'Dir', email: 'dir@d.lat', role_category: 'executivo', job_title: 'CEO' };
    expect((await chamar('POST', '/api/v1/projects/p-d/governance', S.beto, corpo)).status).toBeLessThan(300);
    expect((await chamar('POST', '/api/v1/projects/p-c/governance', S.cris, corpo)).status).toBe(403);
  });
  it('helpers', async () => {
    const { podeMexerEmAssinaturaDe, podeRevogarAprovacao } = await import('../src/helpers');
    const beto = { id: 'u-beto', role: 'consultoria_admin', org_id: 'org_d' } as any;
    expect(await podeMexerEmAssinaturaDe(env.DB, beto, 'p-d')).toBe(true);
    expect(await podeRevogarAprovacao(env.DB, beto, 'p-d')).toBe(true);
    expect(await podeRevogarAprovacao(env.DB, { ...beto, org_id: 'org_c' }, 'p-c')).toBe(false);
    expect(await podeRevogarAprovacao(env.DB, { id: 'a', role: 'client', agente: true } as any, 'p-d')).toBe(false);
  });
  it('titular: admin direto consulta; admin de consultoria não', async () => {
    // GET /api/v1/projects/p-d/data-subject?... : conferir a query real em test/data-subject*.test.ts
    expect((await chamar('GET', '/api/v1/projects/p-d/data-subject?email=x@y.lat', S.beto)).status).not.toBe(403);
    expect((await chamar('GET', '/api/v1/projects/p-c/data-subject?email=x@y.lat', S.cris)).status).toBe(403);
  });
});
```
(Ajustar corpo e URL aos reais: `test/governanca-designacao-consultor.test.ts` e o teste de data-subject mostram o formato.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/organizacao-direta.test.ts -t "privacy"`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/helpers.ts`, depois de `podeMexerEmAssinatura` e de `PODE_REVOGAR_APROVACAO`:
```ts
import { adminDireto } from './services/organizacao'; // já há import de organizacao no arquivo: acrescentar ao existente

export const podeMexerEmAssinaturaDe = async (db: D1Database, u: Parameters<typeof podeMexerEmAssinatura>[0] & { org_id?: string | null; id?: string | null }, projectId: string) =>
  podeMexerEmAssinatura(u, projectId) || adminDireto(db, u, projectId);

export const podeRevogarAprovacao = async (db: D1Database, u: { role?: string | null; org_id?: string | null; id?: string | null; agente?: boolean } | null | undefined, projectId: string) =>
  PODE_REVOGAR_APROVACAO.has(u?.role ?? '') || adminDireto(db, u, projectId);
```
Substituir os usos:
- `governance.ts:179,249` e `nucleo.ts:257`: `!podeMexerEmAssinatura(c.get('user'), projectId)` → `!(await podeMexerEmAssinaturaDe(c.env.DB, c.get('user'), projectId))`.
- `governance.ts:567`, `platform.ts:151`, `ropa.ts:545`: `!PODE_REVOGAR_APROVACAO.has(user?.role ?? '')` → `!(await podeRevogarAprovacao(c.env.DB, user, projectId))` (em `ropa.ts` o `projectId` é lido logo abaixo: mover a leitura para antes).
- `data-subject.ts`: `autorizado(c)` vira `async` e inclui `|| await adminDireto(c.env.DB, u, c.req.param('projectId'))`; trocar os usos (`:100` e demais chamadas) por `await autorizado(c)`. O `consultoria_admin` de consultoria segue fora.
- `ropa-abas/situacao.ts:51`: `papelDe(user, podePedirAprovacao, bloqueios, direto = false)` com `podeRevogar: PODE_REVOGAR_APROVACAO.has(user?.role ?? '') || direto`; em `ficha.ts:76` e `situacao.ts:83` passar `await adminDireto(db, user, projectId)` (threading de `db` e `projectId` até lá: ver as funções que chamam, ambas já têm `db`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/organizacao-direta.test.ts` e os testes de governança, ropa e data-subject (`ls test | grep -E "governanc|ropa|data-subject|titular|revog"`).
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat(onda1): assinatura, revogação e titular aceitam o admin direto"
```

### Task 5: Quem criou não decide (pedido, base do site, avaliação do n.ot)

**Files:**
- Modify: `src/routes/pedidos.ts:226-260` (`decidirPedido`), `src/services/ot-fase.ts:94-104` (`aprovarBase`), `src/services/ot-avaliacao.ts:125-139` (`confirmarAvaliacao`)
- Test: `test/organizacao-direta.test.ts` e os testes existentes de pedidos/ot que decidiam o próprio pedido

**Interfaces:**
- Produces: `decidirPedido` devolve 403 quando `pedido.criado_por` (e-mail) é o decisor; `aprovarBase` devolve `{ok:false,status:403}` quando `base_pedida_por === ator.id`; `confirmarAvaliacao` devolve 403 quando `atualizado_por === ator.id`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
describe('quem criou não decide', () => {
  it('pedido: o criador não aprova nem recusa o próprio pedido', async () => {
    // Criar pedido com Beto (POST /api/v1/projects/p-d/pedidos, corpo mínimo como em test/pedidos*.test.ts) e decidir com o mesmo.
    // Esperado: 403 com a mensagem; o colega na matriz decide e recebe 200.
    expect(r.status).toBe(403);
    expect((await r.json() as any).error).toMatch(/quem pediu/i);
  });
  it('base do site: quem pediu não aprova; outro admin aprova', async () => {
    // Montar site em 'base_em_aprovacao' com base_pedida_por = 'u-beto' (UPDATE direto em ot_sites, como test/ot-fase*.test.ts).
    const { aprovarBase } = await import('../src/services/ot-fase');
    const r1 = await aprovarBase(env.DB, { id: 'u-beto' } as any, 'p-d', 'site-1');
    expect(r1).toMatchObject({ ok: false, status: 403 });
  });
  it('avaliação: quem avaliou não confirma', async () => {
    const { confirmarAvaliacao } = await import('../src/services/ot-avaliacao');
    // Salvar avaliação com atualizado_por = 'u-beto', depois confirmar com o mesmo ator.
    expect(await confirmarAvaliacao(env.DB, { id: 'u-beto' } as any, 'p-d', '4.2.1', visto)).toMatchObject({ ok: false, status: 403 });
  });
});
```
(Fixtures completas seguem os testes vizinhos: `test/pedidos-*.test.ts`, `test/ot-fase*.test.ts`, `test/ot-avaliacao*.test.ts`. O implementador copia o setup de lá.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/organizacao-direta.test.ts -t "quem criou"`
Expected: FAIL (hoje decide).

- [ ] **Step 3: Implementar**

`src/routes/pedidos.ts`, em `decidirPedido`, logo depois de `const { pedido, dest } = meu;`:
```ts
  // Segregação de funções (spec onda 1): quem pediu não decide o que pediu. `criado_por` é o e-mail de quem criou.
  if (pedido.criado_por.toLowerCase() === (user.email ?? '').toLowerCase()) {
    return { status: 403, corpo: { error: 'Quem pediu a aprovação não a decide. Peça a outra pessoa.' } };
  }
```
`src/services/ot-fase.ts`, `aprovarBase`: no `WHERE`, logo depois de `AND fase = 'base_em_aprovacao'`, inserir `AND base_pedida_por IS NOT ?`, e o `.bind` fica:
```ts
.bind(ator.id, siteId, projectId, ator.id, projectId, siteId, projectId, siteId, projectId, siteId)
```
(o 4º valor é o novo). No ramo de falha:
```ts
const site = await db.prepare(`SELECT fase, base_pedida_por FROM ot_sites WHERE id = ? AND project_id = ? AND status = 'ativo'`).bind(siteId, projectId).first<{ fase: Fase; base_pedida_por: string | null }>();
if (!site) return { ok: false, status: 404, error: 'Site não encontrado' };
if (site.fase === 'base_em_aprovacao' && site.base_pedida_por === ator.id) return { ok: false, status: 403, error: 'Quem pediu a base não a aprova. Peça a outra pessoa.' };
```
`src/services/ot-avaliacao.ts`, `confirmarAvaliacao`: no `WHERE` acrescentar `AND atualizado_por IS NOT ?` (bind: `ator.id, mesesMaisSP(12), projectId, rq.id, visto, ator.id`); no ramo de falha, ler também `atualizado_por`:
```ts
const a = await db.prepare('SELECT confirmado_em, atualizado_por FROM ot_avaliacoes WHERE project_id = ? AND requisito_id = ?').bind(projectId, rq.id).first<{ confirmado_em: string | null; atualizado_por: string | null }>();
if (!a) return falha(404, 'Avaliação não encontrada');
if (!a.confirmado_em && a.atualizado_por === ator.id) return falha(403, 'Quem avaliou o item não o confirma. Peça a outra pessoa.');
```
(Conferir que `falha(status, msg)` aceita 403; o handler de `ot.ts:775` repassa `r.status`.)

- [ ] **Step 4: Rodar a suíte de pedidos e n.ot, consertar os testes que decidiam o próprio pedido**

Run: `npx vitest run test/organizacao-direta.test.ts` e `npx vitest run test -t "pedido|base|avalia"`.
Os testes existentes em que o mesmo usuário cria e decide devem passar a usar duas pessoas: trocar o decisor por um segundo usuário na matriz (não afrouxar a regra). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat(onda1): quem criou não decide, em pedido, base do site e avaliação do n.ot"
```

### Task 6: Regras da equipe direta (incidente, achado de auditoria, comercial, contas de cliente)

**Files:**
- Modify: `src/routes/titular.ts:421-426`, `src/middleware/auth.ts:379-382`, `src/helpers.ts:619-627` (`somenteComercial`), `src/routes/users.ts:~228`
- Test: `test/organizacao-direta.test.ts`

**Interfaces:**
- Consumes: `tipoDaOrg`, `adminDireto` (Tasks 1-2).
- Decisões aplicadas: 6 (encerrar incidente exige pessoa diferente de quem registrou), 7 (achado de auditoria liberado ao admin direto), 8 (direta só cria equipe), 11 (sem área comercial na direta).

- [ ] **Step 1: Escrever o teste que falha**

```ts
describe('equipe da organização direta', () => {
  it('incidente: a mesma pessoa que registrou não encerra; outra pessoa encerra', async () => { /* criar incidente com criado_por = e-mail do Beto; encerrar com Beto → 403; com Ana (admin direto também) → 200 */ });
  it('achado de auditoria: admin direto registra; admin de consultoria segue barrado', async () => {
    // POST de achado (isAuditWrite): copiar rota e corpo de test/ (grep isAuditWrite em src/auth-policy.ts)
    expect(rDireta.status).not.toBe(403);
    expect(rConsultoria.status).toBe(403);
  });
  it('comercial: o admin direto não acessa leads nem funil; o de consultoria sim', async () => {
    expect((await chamar('GET', '/api/v1/leads', S.beto)).status).toBe(403);
    expect((await chamar('GET', '/api/v1/leads', S.cris)).status).toBe(200);
  });
  it('contas: o admin direto não cria conta de cliente; cria consultor', async () => {
    const base = { email: 'novo@d.lat', name: 'Novo' };
    expect((await chamar('POST', '/api/v1/users', S.beto, { ...base, role: 'org_admin', client_project_id: 'p-d' })).status).toBe(403);
    expect((await chamar('POST', '/api/v1/users', S.beto, { ...base, role: 'consultor' })).status).toBeLessThan(300);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/organizacao-direta.test.ts -t "equipe da organização direta"`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`titular.ts` (`/:id/encerrar`), antes de `encerrarIncidente`:
```ts
const inc = await c.env.DB.prepare('SELECT criado_por FROM incidentes WHERE id = ? AND project_id = ?').bind(c.req.param('id'), c.req.param('projectId')).first<{ criado_por: string | null }>();
if (inc?.criado_por && inc.criado_por.toLowerCase() === (c.get('user').email ?? '').toLowerCase()) {
  return c.json({ error: 'Quem registrou o incidente não o encerra. Peça a outra pessoa.' }, 403);
}
```
Para o admin direto passar no guard `ehEquipeNess`: nada muda (já passa).

`auth.ts:379`, trocar a condição por:
```ts
if (!apiKey && !agente && PAPEIS_IMPLEMENTACAO.has(user.role) && isAuditWrite(method, path)
    && !(user.role === 'consultoria_admin' && await tipoDaOrg(c.env.DB, orgDoUsuario(user)) === 'direta')) {
```
(Importar `tipoDaOrg`, `orgDoUsuario` de `../services/organizacao`; confirmar que o middleware tem `c.env.DB`. A decisão fica registrada pela trilha de auditoria normal da escrita.)

`helpers.ts`, `somenteComercial` passa a negar o admin direto:
```ts
export async function somenteComercial(c: {...; env?: { DB: D1Database } }, next) {
  const u = c.get('user');
  if (!ehComercial(u)) return c.json({ error: '...' }, 403);
  if (u?.role === 'consultoria_admin' && c.env?.DB && await tipoDaOrg(c.env.DB, orgDoUsuario(u)) === 'direta') {
    return c.json({ error: 'Forbidden: a organização direta não tem área comercial.' }, 403);
  }
  await next();
}
```
(Estender o tipo de `c` com `env?: { DB: D1Database }` e `get` com o campo `org_id`; `AtorAutorizado` ganha `org_id?`.)

`users.ts`, depois de calcular `orgCriador` e `ehCliente`:
```ts
if (ehAdminDaOrg(admin) && ehCliente && await tipoDaOrg(c.env.DB, orgCriador) === 'direta') {
  return c.json({ error: 'Forbidden: a organização direta tem só equipe; não cria conta de cliente.' }, 403);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/organizacao-direta.test.ts test/organizacoes.test.ts test/cadastro-consultoria-admin.test.ts test/leads-assessments-org.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat(onda1): regras da equipe da organização direta (incidente, auditoria, comercial, contas)"
```

### Task 7: Isolamento: terceira organização `direta` no contrato

**Files:**
- Modify: `test/contrato-isolamento-org.test.ts` (fixtures e varredura `app.routes`, ~linhas 11-31 e 395-412)
- Test: o próprio.

- [ ] **Step 1: Ler o arquivo e mapear** onde as duas organizações e os principais são semeados e onde a varredura confere "A não toca B".

- [ ] **Step 2: Acrescentar** a organização `org_dir` (tipo `direta`) com projeto `p-dir` e um `consultoria_admin` dela; a varredura cobre os dois sentidos: o admin direto não alcança nenhum projeto de `org_a`/`org_b`/ness, e nenhum principal das outras organizações alcança `p-dir`. Incluir agente e chave de API do `p-dir` nas travas novas (recusados).

- [ ] **Step 3: Rodar**

Run: `npx vitest run test/contrato-isolamento-org.test.ts test/idor-tenant.test.ts test/org-corte.test.ts`
Expected: PASS. Qualquer vazamento é bug de produto: corrigir a trava, não o teste.

- [ ] **Step 4: Gate e commit**

```bash
git add test/contrato-isolamento-org.test.ts
git commit -m "test(onda1): organização direta no contrato de isolamento"
```
**Entrega PR2:** `bash scripts/ci/gate.sh`; PR (rascunho).

---

## PR3 — Textos e telas

### Task 8: Textos, criação de organização na tela e "decisões" da equipe

**Files:**
- Modify: `frontend/src/views/organizacoes.js:99,141,152,160-161,366`, `frontend/src/produto.js:368`, `frontend/src/views/admin.js:208`, `frontend/login.html:340` (ou o caminho real), `src/routes/painel.ts:37`, `src/services/painel.ts:~499`
- Test: `frontend/test/` (arquivo vizinho de `organizacoes`), `test/painel*.test.ts`

- [ ] **Step 1: Testes que falham.** Frontend: o formulário de criar organização mostra o seletor "Tipo" (Consultoria/Direta) e o conjunto de módulos, envia `tipo` e `modulos` em `POST /platform/orgs`, e a lista mostra o tipo. Backend: `GET /api/v1/projects/:id/painel` manda `decisoes` também a `consultoria_admin`/`consultor` quando há pedido esperando a própria pessoa (hoje só papel de cliente, `routes/painel.ts:37`).
- [ ] **Step 2: Rodar e ver falhar** (`npx vitest run test/painel.test.ts` e o teste do front).
- [ ] **Step 3: Implementar.** "Consultorias" → "Organizações" nos cinco lugares; seletor e módulos na criação; coluna "Tipo" na lista; texto de ajuda "Direta: a empresa usa o n.360 por conta própria". No painel: `decisoes` vai a quem é destinatário pendente de pedido (a consulta de pedidos já existe para "Minhas aprovações", `globals.js:1071`: reutilizar, não duplicar). Frases voltadas ao cliente que dizem "consultoria" ficam, exceto onde a organização direta as vê (`painel.js:163-167,393`): usar o tipo da organização, devolvido em `GET /me` ou na carteira (acrescentar `org_tipo` ao payload do usuário, lido do banco).
- [ ] **Step 4: Rodar** `bash scripts/ci/gate.sh` (inclui frontend).
- [ ] **Step 5: Commit** `git commit -m "feat(onda1): textos e telas da organização direta"`.

### Task 9: Documentação e verificação de implantação

**Files:**
- Modify: `AGENTS.md`, `CHANGELOG.md`, `migrations/README.md` (corrigir "0109" para a última real)
- Test: nenhum

- [ ] **Step 1:** AGENTS.md: acrescentar "organização direta" (tipo, helpers `adminDireto`/`gestorArciberDireto`, regra criador ≠ decisor, tipo imutável, lido só do banco) onde já constam os invariantes P0-1/P0-2.
- [ ] **Step 2:** CHANGELOG.md: entrada da onda 1 com as quatro mudanças de comportamento que valem **também para consultorias** (regra de pessoa diferente em pedido, base e avaliação).
- [ ] **Step 3:** Depois do deploy: `curl -s https://n360.ness.com.br/health` e conferir o SHA do merge; criar uma organização `direta` de teste pelo `platform_admin` e entrar como o admin dela.
- [ ] **Step 4: Commit** `git commit -m "docs(onda1): AGENTS, CHANGELOG e README de migrations"`.

---

## Self-Review

- **Spec:** tipo e criação (T1), helpers lidos do banco (T2), as sete travas: Gestor, `podeVerCompleto`, painel, avisos (T3); assinatura, revogação, titular (T4); decisão 4/5 (T5); decisões 6, 7, 8, 11 (T6); 9, 14 sem código (T1 testa a imutabilidade); isolamento (T7); textos, módulos, "decisões" (T8); decisão 12 (termo próprio): sem código, o `platform_admin` informa um `termoVersao` próprio da direta; o texto do termo não foi conferido e fica fora do repositório. Decisão 2 (consultor só os designados) é o comportamento atual: sem tarefa.
- **Placeholders:** os corpos de teste de T3-T6 são esqueletos nos pontos em que o setup copia de testes vizinhos (indicados por arquivo); o implementador completa a fixture, não a regra.
- **Tipos:** `adminDireto(db, user, projectId)`, `gestorArciberDireto(db, u, projectId)`, `podeMexerEmAssinaturaDe`, `podeRevogarAprovacao`, `tipoDaOrg` mantêm as mesmas assinaturas entre as tarefas.
- **Riscos para a revisão:** (1) T5 muda comportamento de consultorias (testes antigos que decidiam o próprio pedido); (2) T6/decisão 8: sem contas de cliente na direta, o técnico `org_user` do n.ot (por site) não existe nela; a equipe direta enxerga todos os sites; (3) `ehGestorArciber` virou assíncrona: conferir todos os nove usos.
