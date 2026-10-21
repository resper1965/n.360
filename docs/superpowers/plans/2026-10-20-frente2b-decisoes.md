# Frente 2B: RIPD, aceite de risco e DPA — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** aplicar as três decisões do dono de 20/10/2026: RIPD aprovado por uma assinatura e invalidado quando o conteúdo muda; aceite de risco num modelo só, carimbado no servidor, com botão nos dois módulos; DPA com fonte única no documento ligado.

**Architecture:** mudanças locais nas rotas e serviços existentes (`platform.ts`, `pedidos.ts` só em `assinaturaDpia`, `risks.ts`, `riscos-atividade.ts`, `vendors.ts`, `integrations.ts`, `terceiros.ts`, `modulos.ts`) e nas telas (`privacy.js`, `grc.js`, `atividade/aba-riscos.js`). Uma migration (0082) para o aceite legado.

**Tech Stack:** Cloudflare Workers + Hono + D1, vitest (`@cloudflare/vitest-pool-workers`), frontend vanilla JS com vitest/jsdom.

**Spec:** `docs/superpowers/specs/2026-10-20-frente2-regras-unicas-design.md` (Parte 2B).

## Global Constraints

- PT-BR em comentário, mensagem e tela. Commits em português, `--author="Ricardo Esper <44273656+resper1965@users.noreply.github.com>"`, sem `Co-Authored-By` nem rodapé de IA.
- `test/any-catraca.test.ts`: `any` não sobe.
- `pedidos.ts`: só `assinaturaDpia` muda (e `COLUNAS_DPIA` pode ser exportada, sem mudar o conteúdo). O hash dos pedidos não muda.
- Schema muda em dois lugares: `schema.sql` e a migration. Leia `migrations/README.md` antes da Task 3.
- **A migration 0082 NÃO é aplicada em produção por este plano.** Só com o "sim" explícito do dono e `npm run db:backup` antes.
- Rodar `npx tsc --noEmit` e os testes do arquivo antes de cada commit; frontend com `cd frontend && npx vitest run` e `npm run build`.
- Esta frente roda na branch `claude/frente2b-decisoes`, criada a partir de `claude/frente2-regras` (a 2A ainda não está na `main`).

---

### Task 1: RIPD — uma assinatura aprova; mudar conteúdo invalida (B1)

**Files:**
- Modify: `src/services/pedidos.ts` (`assinaturaDpia`, ~linha 309; exportar `COLUNAS_DPIA`)
- Modify: `src/routes/platform.ts` (`PUT /dpia/:id`, ~linhas 72-105)
- Modify: `frontend/src/views/privacy.js` (tela do RIPD: texto das duas assinaturas; aviso antes de salvar RIPD aprovado, ~linha 708)
- Test: `test/ripd-aprovacao-unica.test.ts`; ajustar `test/dpia-aprovacao.test.ts` e `test/dpia-status-put.test.ts` onde fixam "duas assinaturas" ou "edição mantém aprovação" (diga no commit)

**Interfaces:**
- Produces: `COLUNAS_DPIA` exportada de `src/services/pedidos.ts`.

- [ ] **Step 1: Teste que falha**

```ts
// test/ripd-aprovacao-unica.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { assinaturaDpia } from '../src/services/pedidos';
import { applySchema, sessionFor, workerEnv, designarConsultor, habilitarPrivacy } from './helpers/d1';

const P = 'ru-proj';
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}) }), workerEnv());
const ler = (id: string) => env.DB.prepare('SELECT status, dpo_signature, ceo_signature, dpo_approved_at FROM dpia_assessments WHERE id = ?').bind(id).first<any>();
let consultor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P).run();
  await env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, status) VALUES ('ru-1', ?, 'Folha', 'Draft'), ('ru-2', ?, 'CRM', 'Draft'), ('ru-3', ?, 'Ponto', 'Draft')`).bind(P, P, P).run();
  await habilitarPrivacy(P);
  await designarConsultor('cons@ness.lat', P);
  consultor = await sessionFor({ id: 'cons:cons@ness.lat', email: 'cons@ness.lat', role: 'consultor' });
});

describe('RIPD: uma assinatura basta e mudar conteúdo invalida', () => {
  it('só a do CEO aprova; só a do CISO também', async () => {
    await (await assinaturaDpia(env.DB, P, 'ru-1', 'ceo', 'Diretora'))!.run();
    expect((await ler('ru-1')).status).toBe('Approved');
    await (await assinaturaDpia(env.DB, P, 'ru-2', 'ciso', 'Encarregado'))!.run();
    expect((await ler('ru-2')).status).toBe('Approved');
  });

  it('editar o conteúdo de um RIPD aprovado zera as assinaturas, volta a rascunho e grava a trilha', async () => {
    const r = await chamar(consultor, 'PUT', '/api/v1/dpia/ru-2', { risks_identified: 'Risco novo' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await ler('ru-2')).toMatchObject({ status: 'Draft', dpo_signature: null, ceo_signature: null, dpo_approved_at: null });
    const log = await env.DB.prepare(`SELECT project_id, details FROM audit_logs WHERE action = 'dpia.aprovacao_invalidada'`).first<any>();
    expect(log.project_id).toBe(P);
    expect(log.details).toContain('risks_identified');
    expect(log.details).not.toContain('Risco novo');
  });

  it('PUT sem mudança de conteúdo mantém a aprovação', async () => {
    await (await assinaturaDpia(env.DB, P, 'ru-3', 'ciso', 'Encarregado'))!.run();
    const r = await chamar(consultor, 'PUT', '/api/v1/dpia/ru-3', { processing_name: 'Ponto' });
    expect(r.status).toBe(200);
    expect((await ler('ru-3')).status).toBe('Approved');
  });
});
```

Confira as colunas `NOT NULL` de `dpia_assessments` em `schema.sql` e o formato do `PUT` (`dpiaSchema` em `src/schemas/domain.ts`) e ajuste os dados mínimos.

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/ripd-aprovacao-unica.test.ts` (o CEO sozinho deixa `Under Review`).

- [ ] **Step 3: Implementar**

`assinaturaDpia`: as duas ramificações gravam `status = 'Approved'` (sem `CASE`); atualizar o JSDoc ("uma assinatura, do DPO ou da Direção, aprova o RIPD; decisão do dono de 20/10/2026"). Exportar `COLUNAS_DPIA`.

`PUT /dpia/:id` em `platform.ts`:
- ler a linha atual com as colunas de `COLUNAS_DPIA` e as de assinatura (`SELECT project_id, status, dpo_signature, ceo_signature, ${COLUNAS_DPIA.join(', ')} ...`);
- remover o bloqueio de `status` no corpo do aprovado (o 400 atual);
- depois do `UPDATE`, se havia assinatura (`dpo_signature` ou `ceo_signature` não nulos) e alguma coluna de `COLUNAS_DPIA` presente no corpo mudou (`Object.hasOwn(body, col) && (body[col] ?? null) !== (atual[col] ?? null)`), rodar
  `UPDATE dpia_assessments SET dpo_signature = NULL, ceo_signature = NULL, dpo_approved_by = NULL, dpo_approved_at = NULL, status = 'Draft' WHERE id = ?`
  e `logAudit(c.env.DB, 'dpia.aprovacao_invalidada', email, \`RIPD ${id}: conteúdo mudou (${mudaram.join(', ')}); aprovação e assinaturas zeradas, voltou a rascunho.\`, '', '', atual.project_id)`;
- `status` vindo no corpo de um RIPD aprovado sem mudança de conteúdo: mantém o comportamento seguro (ignorar e não tirar de `Approved`; quem quer reabrir revoga com motivo). Implemente removendo `status` do corpo quando `atual.status === 'Approved'` e nenhuma coluna de conteúdo mudou.
- o `logAudit('dpia_updated', ...)` passa a levar `atual.project_id`.

Tela (`privacy.js`): onde a tela diz que faltam as duas assinaturas, passar a "Aprovado por <nome>" com uma assinatura; antes do `PUT` (linha ~708) de um RIPD `Approved`, `if (!(await window.confirmar('A aprovação do RIPD cai e ele volta a rascunho.', { titulo: 'Editar RIPD aprovado', rotulo: 'Editar' }))) return;`.

- [ ] **Step 4: Rodar** — `npx tsc --noEmit && npx vitest run test/ripd-aprovacao-unica.test.ts test/dpia-*.test.ts test/pedidos*.test.ts test/documento-word*.test.ts test/marco-programa.test.ts && cd frontend && npx vitest run`

- [ ] **Step 5: Commit** — `fix: RIPD aprovado por uma assinatura e invalidado quando o conteúdo muda`

---

### Task 2: Aceite de risco carimbado no servidor nos dois módulos (B2, servidor)

**Files:**
- Modify: `src/services/riscos-atividade.ts` (exporta `carimboDeAceite`)
- Modify: `src/routes/risks.ts` (POST e PUT)
- Test: `test/aceite-risco-unico.test.ts`; ajustar `test/risco-put-parcial.test.ts` (ele grava `accepted_by: 'Diretoria'` no INSERT direto; o PUT que manda `accepted_by` no corpo passa a ser ignorado)

**Interfaces:**
- Produces: `carimboDeAceite(antes: string | null | undefined, depois: string | null | undefined, ator: string): { accepted_by: string; accepted_at: string } | null` em `src/services/riscos-atividade.ts` — devolve o carimbo só na transição para `Accepted`.

- [ ] **Step 1: Teste que falha**

```ts
// test/aceite-risco-unico.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, designarConsultor } from './helpers/d1';

const P = 'ar-proj';
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}) }), workerEnv());
let consultor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P).run();
  await designarConsultor('cons@ness.lat', P);
  consultor = await sessionFor({ id: 'cons:cons@ness.lat', email: 'cons@ness.lat', role: 'consultor' });
});

describe('aceite de risco: um modelo só', () => {
  it('quem e quando vêm da sessão, nunca do corpo', async () => {
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/risks`, { asset: 'ERP', threat: 'Vazamento', treatment: 'Accept', accepted_by: 'Digitado', accepted_at: '2020-01-01' });
    const { id } = await r.json<{ id: string }>();
    expect(await env.DB.prepare('SELECT status, accepted_by, accepted_at FROM risks WHERE id = ?').bind(id).first()).toEqual({ status: 'Open', accepted_by: null, accepted_at: null });
    expect((await chamar(consultor, 'PUT', `/api/v1/risks/${id}`, { status: 'Accepted', accepted_by: 'Outro', accepted_at: '2020-01-01' })).status).toBe(200);
    const l = await env.DB.prepare('SELECT status, accepted_by, accepted_at FROM risks WHERE id = ?').bind(id).first<any>();
    expect(l.status).toBe('Accepted');
    expect(l.accepted_by).toBe('cons@ness.lat');
    expect(l.accepted_at.slice(0, 4)).not.toBe('2020');
  });

  it('editar um risco já aceito não muda o carimbo', async () => {
    const { id } = await (await chamar(consultor, 'POST', `/api/v1/projects/${P}/risks`, { asset: 'ERP', threat: 'Outro', treatment: 'Accept' })).json<{ id: string }>();
    await chamar(consultor, 'PUT', `/api/v1/risks/${id}`, { status: 'Accepted' });
    const antes = await env.DB.prepare('SELECT accepted_at FROM risks WHERE id = ?').bind(id).first<any>();
    await chamar(consultor, 'PUT', `/api/v1/risks/${id}`, { treatment_plan: 'Plano' });
    expect(await env.DB.prepare('SELECT accepted_at FROM risks WHERE id = ?').bind(id).first()).toEqual(antes);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**

Em `riscos-atividade.ts`, extrair a regra que já existe (linhas ~70 e ~103-114):

```ts
/** Aceite feito agora (transição para `Accepted`) grava quem aceitou e quando, pela sessão. Fora da transição, nada muda. */
export function carimboDeAceite(antes: string | null | undefined, depois: string | null | undefined, ator: string) {
  return depois === 'Accepted' && antes !== 'Accepted' ? { accepted_by: ator, accepted_at: new Date().toISOString() } : null;
}
```

e usar nas duas funções da atividade (criação com `antes = null`).

Em `risks.ts`:
- POST: `accepted_by`/`accepted_at` saem do corpo; acrescentar `status` ao INSERT (`body.status ?? 'Open'`) e o carimbo `carimboDeAceite(null, body.status, user.email)`.
- PUT: `accepted_by`/`accepted_at` do corpo ignorados (o bloqueio do agente continua olhando o corpo, para recusar com 403 e não ignorar em silêncio); `const c0 = carimboDeAceite(atual.status, body.status ?? atual.status, email)`; gravar `c0?.accepted_by ?? atual.accepted_by` e `c0?.accepted_at ?? atual.accepted_at`.
- `logAudit` de `risk.created` e de aceite com `projectId`; na transição, `logAudit(db, 'risk.aceito', email, \`Risco ${id} aceito\`, '', '', projectId)`.

- [ ] **Step 4: Rodar** — `npx tsc --noEmit && npx vitest run test/aceite-risco-unico.test.ts test/risco-*.test.ts test/riscos-atividade.test.ts test/ropa-abas-riscos.test.ts test/painel.test.ts test/any-catraca.test.ts`

- [ ] **Step 5: Commit** — `fix: aceite de risco carimbado pelo servidor nos dois módulos`

---

### Task 3: Migration 0082 — aceite legado e marca "registrado à mão" (B2, dado)

**Files:**
- Create: `migrations/0082_aceite_risco.sql`
- Modify: `schema.sql` (coluna `aceite_manual` em `risks`)
- Modify: `test/schema-contract.test.ts` se ele listar colunas de `risks`
- Test: `test/migracao-0082.test.ts`

- [ ] **Step 1: Teste que falha** — aplicar o schema, inserir quatro riscos (`Accept` + nome + `Open`; `Accept` + nome vazio; `Accept` + nome + `Closed`; `Mitigate` + nome), rodar o SQL do `UPDATE` da migration (ler o arquivo com `import.meta.glob('../migrations/0082_*.sql', { query: '?raw', import: 'default', eager: true })` e executar só o `UPDATE`, porque o `applySchema` já criou a coluna) e conferir que só o primeiro vira `Accepted` com `aceite_manual = 1`, mantendo nome e data.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Migration**

```sql
-- 0082: aceite de risco num modelo só (decisão do dono de 20/10/2026, spec 2026-10-20-frente2-regras-unicas-design.md, B2).
-- O n.iso gravava o aceite como tratamento "Accept" com nome digitado e status aberto; Painel e Prontidão não o contavam.
-- Estes riscos passam a Accepted, guardando o nome e a data digitados, com aceite_manual = 1 ("aceite registrado à mão").
-- Antes de aplicar em produção (só com o "sim" do dono, depois de npm run db:backup), conferir quantos mudam:
--   SELECT count(*) FROM risks WHERE treatment = 'Accept' AND trim(COALESCE(accepted_by, '')) <> ''
--     AND COALESCE(status, 'Open') NOT IN ('Accepted', 'Closed', 'Mitigated');
ALTER TABLE risks ADD COLUMN aceite_manual INTEGER NOT NULL DEFAULT 0;
UPDATE risks SET status = 'Accepted', aceite_manual = 1
  WHERE treatment = 'Accept' AND trim(COALESCE(accepted_by, '')) <> ''
    AND COALESCE(status, 'Open') NOT IN ('Accepted', 'Closed', 'Mitigated');
```

`schema.sql`: `aceite_manual INTEGER NOT NULL DEFAULT 0` na tabela `risks`, com comentário de uma linha. Atualizar `migrations/README.md` se ele listar a última migration, e o número da última migration no `AGENTS.md` (Task 6).

- [ ] **Step 4: Rodar** — `npx vitest run test/migracao-0082.test.ts test/schema-contract.test.ts test/migrations*.test.ts`

- [ ] **Step 5: Commit** — `feat: migration 0082 leva o aceite de risco digitado a Accepted com a marca de registro à mão`

---

### Task 4: Botão "Aceitar risco" nas duas telas (B2, tela)

**Files:**
- Modify: `frontend/src/views/grc.js` (form de criação ~linhas 251-342, edição ~374-400, exibição ~213 e ~455)
- Modify: `frontend/src/atividade/aba-riscos.js` (~linhas 131-216)
- Test: `frontend/test/aceite-risco-telas.test.js`

- [ ] **Step 1: Teste que falha** — no n.iso: o formulário não tem `risk-accepted-by` nem `risk-accepted-at`; um risco com tratamento `Accept` e status `Open` mostra o botão "Aceitar risco", que chama `window.confirmar` e depois `PUT /api/v1/risks/:id` com `{ status: 'Accepted' }`; um risco aceito mostra "Aceito por X em dd/mm/aaaa" e, com `aceite_manual: 1`, "Aceite registrado à mão: X em dd/mm/aaaa". No n.privacy: a aba Riscos mostra o mesmo botão para risco com estratégia Aceitar e chama `PUT .../ropa/:rid/riscos/:id` com `{ status: 'Accepted' }`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** — tirar os dois campos e o pré-preenchimento de data; botão secundário (não primário) com `data-action` (sem handler inline); a linha de aceite usa `formatarData`. O botão só aparece para quem pode editar o risco (mesma regra de papel que já esconde editar na tela).
- [ ] **Step 4: Rodar** — `cd frontend && npx vitest run && npm run build`
- [ ] **Step 5: Commit** — `feat: botão Aceitar risco no n.iso e no n.privacy`

---

### Task 5: DPA pela fonte única (B3)

**Files:**
- Modify: `src/modulos.ts` (exceção `nucleo` para `terceiros/:parteId/documentos`)
- Modify: `src/services/terceiros.ts` (fragmento `SQL_TEM_DPA`, alias `p`)
- Modify: `src/routes/vendors.ts` (`calculateTrustScore`, POST/PUT deixam de gravar `dpa_signed`/`dpa_url`; `SQL_VENDORS_VISIVEIS` devolve `dpa` derivado, `dpa_declarado` e `dpa_documentos`)
- Modify: `src/routes/integrations.ts:360-362` (coluna DPA do CSV)
- Modify: `frontend/src/views/grc.js` (lista, ficha e formulário do fornecedor) e `frontend/src/views/terceiros.js` (aba Segurança: tirar "DPA assinado" e "DPA (link)" editáveis; mostrar declarado só leitura)
- Test: `test/dpa-fonte-unica.test.ts`, `frontend/test/dpa-fonte-unica.test.js`; ajustar `test/modulos-produto.test.ts` se ele fixar a faixa de `terceiros/...`

**Interfaces:**
- Produces: `SQL_TEM_DPA` em `src/services/terceiros.ts`: `EXISTS (SELECT 1 FROM documento_partes d WHERE d.parte_id = p.id AND d.project_id = p.project_id AND d.papel = 'dpa')`.

- [ ] **Step 1: Teste que falha (backend)**

Cenário num projeto **só do n.iso** (sem `habilitarPrivacy`): organização fornecedor com perfil `dpa_signed = 1` e `dpa_url` preenchido, sem documento ligado.
1. `GET /projects/:id/vendors` devolve `dpa: 0`, `dpa_declarado: 1` e índice sem os 10 pontos (o `trust_score` é recalculado no próximo `PUT`; o teste faz um `PUT` sem mudar nada e confere que caiu 10).
2. `POST /projects/:id/terceiros/:parteId/documentos` com um documento do projeto e `papel: 'dpa'` responde 201 (faixa núcleo, sem n.privacy).
3. Depois disso a lista devolve `dpa: 1`, `dpa_documentos` com o título, e um `PUT` devolve o índice com os 10 pontos.
4. `PUT /vendors/:id` com `dpa_signed: 0` e `dpa_url: null` não muda as colunas antigas (histórico).
5. O CSV de fornecedores escreve "Sim" na coluna DPA (documento ligado), "Declarado, sem documento" no legado e "Não" no resto.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**

- `modulos.ts`: lista `SUBROTAS_NUCLEO: RegExp[] = [/^terceiros\/[^/]+\/documentos(\/[^/]+)?$/]` conferida antes das outras em `faixaDoCaminho` (`return 'nucleo'`), com o comentário "DPA é dado comum: o n.iso liga o documento sem ter o n.privacy (decisão de 20/10/2026)".
- `calculateTrustScore(body, temDpa: boolean)`: `if (temDpa) score += 10;` no lugar da linha do `dpa_signed`/`dpa_url`. POST e PUT calculam `temDpa` com `SELECT 1 FROM partes p WHERE p.id = ? AND ${SQL_TEM_DPA}`, e o `UPDATE` deixa de tocar `dpa_signed` e `dpa_url`.
- `ligarDocumento`/`desligarDocumento` (`terceiros.ts`): ao ligar ou desligar papel `dpa`, recalcular o `trust_score` e o `diligence_level` do perfil, se houver (`vendors` por `parte_id`), para o índice não esperar a próxima edição. Exporte de `vendors.ts` uma função `recalcularIndice(db, parteId)` e chame-a aqui.
- `SQL_VENDORS_VISIVEIS`: acrescentar `(${SQL_TEM_DPA}) AS dpa`, `CASE WHEN COALESCE(v.dpa_signed, 0) = 1 OR trim(COALESCE(v.dpa_url, '')) <> '' THEN 1 ELSE 0 END AS dpa_declarado`, `v.dpa_url AS dpa_url_antigo` e `(SELECT json_group_array(json_object('id', d.id, 'titulo', d.titulo)) FROM documento_partes dp JOIN documentos d ON d.id = dp.documento_id WHERE dp.parte_id = p.id AND dp.project_id = p.project_id AND dp.papel = 'dpa') AS dpa_documentos`; a rota faz `JSON.parse` de `dpa_documentos`.
- CSV (`integrations.ts`): a coluna `dpa_signed` vira `dpa` com os três valores do Step 1.5 (cabeçalho mantido em inglês nesta frente; a padronização do CSV do n.iso é da Frente 3).
- `grc.js`: cartão "DPAs Assinados" conta `v.dpa`; a coluna DPA mostra "Sim" (`dpa`), "Declarado, sem documento" (`dpa_declarado`) ou "Não"; a ficha lista `dpa_documentos` e oferece "Ligar documento" (`GET /api/v1/projects/:id/documentos` para o select, `POST .../terceiros/:parteId/documentos` com `papel: 'dpa'`), e mostra o link antigo só leitura quando `dpa_declarado`; o formulário perde `vnd-dpa` e `vnd-dpa-url`, e `previewVendorScore` usa `v.dpa`.
- `terceiros.js` (aba Segurança): tirar `['dpa', 'dpa_signed', 'DPA assinado']` e `['dpa-url', 'dpa_url', 'DPA (link)']` dos campos editáveis; mostrar "DPA declarado, sem documento (link antigo)" só leitura quando o perfil tiver o legado e nenhum documento DPA estiver ligado.

- [ ] **Step 4: Rodar** — `npx tsc --noEmit && npx vitest run test/dpa-fonte-unica.test.ts test/fornecedor*.test.ts test/terceiros*.test.ts test/modulos-produto.test.ts test/integrations*.test.ts test/contrato-*.test.ts test/any-catraca.test.ts && cd frontend && npx vitest run && npm run build`

- [ ] **Step 5: Commit** — `fix: DPA do fornecedor pela fonte única, o documento ligado`

---

### Task 6: Documentação, suíte inteira e PR

- [ ] `CHANGELOG.md`: "Alterado (Frente 2B ...)", um item por decisão, com a migration 0082 e "aplicar só com o sim do dono".
- [ ] `AGENTS.md`: decisões aplicadas (RIPD por uma assinatura e invalidação; aceite pelo servidor e `aceite_manual`; DPA pelo documento ligado, rotas de documento do terceiro na faixa núcleo); última migration 0082.
- [ ] `npx tsc --noEmit && cd frontend && npx vitest run && npm run build && cd .. && npx vitest run`; colar o resumo no PR.
- [ ] Push de `claude/frente2b-decisoes`; PR em rascunho com base `claude/frente2-regras` (ou `main`, se a 2A já tiver entrado), template do repositório, seção "Ações necessárias após o merge" com a migration 0082 e o backup.
