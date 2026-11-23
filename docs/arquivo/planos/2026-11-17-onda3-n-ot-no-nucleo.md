# Onda 3: o n.ot aponta para o núcleo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Risco, ação corretiva e incidente podem apontar para um ativo ou site de OT (visível só a quem tem o módulo `ot`); um desvio do n.ot vira ação corretiva por decisão de uma pessoa; o fornecedor de OT usa o cadastro de terceiros. Sem regredir nenhuma proteção do n.ot.

**Architecture:** Uma tabela satélite `ot_referencias` (prefixo `ot_`: já fora da exportação de portabilidade) guarda toda referência núcleo→OT; nenhuma leitura do núcleo faz JOIN nela, e só rotas sob `/ot/` a leem (herdam P0-1 e P0-2). Antes de tudo, fecha-se a fuga que já existe: linhas `ot.%` de `audit_logs` saem no `audit-trail` e na exportação para quem não tem o `ot`. O fornecedor de OT é um segundo satélite (`ot_fornecedores`) sobre `partes`.

**Tech Stack:** Cloudflare Worker (Hono) + D1, vitest (`@cloudflare/vitest-pool-workers`), SPA vanilla JS.

**Spec:** `docs/superpowers/specs/2026-11-17-onda3-n-ot-no-nucleo-design.md` (aprovada em 17/11/2026). Levantamento (arquivo:linha e comandos): somente leitura, não versionado. Specs e modelo de ameaças do n.ot: repositório OT2net, fora deste (P0-1 a P0-8 em `2026-10-30-n-ot-modulo-n360-design.md:156-163`).

## Global Constraints

- **Os três números do cliente não mudam:** `test/onda2-numeros.test.ts` **não é editado** (`git diff --stat -- test/onda2-numeros.test.ts` vazio em todo commit).
- **P0-1:** `ot` nunca é concedido automaticamente; módulo no projeto **e** na pessoa (`recusaDoModulo`/`modulosDaPessoa` em `src/modulos.ts`, `fonteVisivel` para o princípio "pessoa com o módulo; agente e chave de API nunca").
- **P0-2:** nenhuma chave de API nem agente no n.ot (`otApp.use('*')` em `src/routes/ot.ts:31-37`). **Todas as rotas novas do n.ot ficam sob `otApp`.**
- **P0-4:** um filtro de site (`sitesPermitidos`); **P0-6:** uma máscara (IP/MAC); a trilha do n.ot leva só ids e contagens (`src/routes/ot.ts:121-123`).
- **A exportação de portabilidade nunca leva tabela `ot_*`** (`src/portabilidade.ts:184-185`) **nem id/nome/existência de ativo ou site de OT.**
- **Quem não tem `ot` não vê nem a existência de uma referência:** nenhuma leitura do núcleo (`risks`, `corrective_actions`, `incidentes`) faz JOIN em `ot_referencias`/`ot_fornecedores`. Única exceção permitida: a checagem de segregação do Task 5, que só **recusa** e nunca revela.
- **Texto da ação criada a partir do desvio:** `livreSemPii` + recusa do nome exato de ativo, zona ou site do projeto (o título sai no painel, nos avisos exportados, no CSV e no MCP).
- **Toda checagem que vire `async` leva `await` em todo ponto de chamada** (um `await` esquecido numa recusa falha aberto): teste negativo com status exato por rota + mutação (tire o `await`/a condição, veja o teste falhar, restaure).
- Migrations: `schema.sql` e `migrations/011N_*.sql` juntos; procedimento de `migrations/README.md` (backup, apply remoto pelo workflow manual `db-migrate.yml`, conferir, só então merge); só aditivas. Conferir `ls migrations | tail -3` antes de numerar (`0113` e `0114` já aplicadas em produção).
- Segmentos de rota novos precisam constar em `src/modulos.ts`; textos de tela em português, sem estilo inline novo nem handler inline (CSP), `escapeHTML` em dado vindo do servidor.
- Comandos: backend `npx vitest run <arquivo>`; frontend `NODE_OPTIONS=--no-experimental-webstorage npx vitest run --config <vitest do frontend em package.json> <arquivo>`; `npx tsc --noEmit`; `npm run openapi`; gate `bash scripts/ci/gate.sh`.
- **Fora deste plano:** ISO 42001/CIS, mapear os ids da 27701:2025, workflows do GitHub, as questões de UX/UI do dono.
- Quatro PRs: **PR1** = Task 1; **PR2** = Tasks 2-3; **PR3** = Tasks 4-6; **PR4** = Tasks 7-8; Task 9 fecha a documentação de cada PR.

## File Structure

- `src/services/ot-visibilidade.ts` (novo): `podeVerOt(db, user, projectId)`.
- `src/routes/projects.ts` (`audit-trail`), `src/portabilidade.ts` (+ chamadores): filtro `ot.%`.
- `migrations/0115_ot_referencias.sql`, `schema.sql`; `src/services/ot-referencias.ts` (novo); rotas em `src/routes/ot.ts` (foi onde ficaram; `src/routes/ot-referencias.ts` não foi criado).
- `src/services/ot-desvio-acao.ts` (novo) + rota `POST /ot/desvios/:id/acao`; guarda em `src/routes/capa.ts` (`PUT /:id`).
- `migrations/0116_ot_fornecedores.sql`, `src/services/ot-fornecedores.ts` (novo) + rotas sob `/ot/`.
- Frontend: `frontend/src/views/ot-desvios.js`, blocos "n.ot" nos detalhes de risco/ação/incidente, tela de fornecedores do n.ot.
- Testes: `test/ot-referencias.test.ts` (novo), `test/ot-trilha-oculta.test.ts` (novo), `test/ot-desvio-acao.test.ts` (novo), `test/ot-fornecedores.test.ts` (novo), mais os existentes de isolamento.

---

## PR1 — Fechar a fuga de `ot.%` (sem migration)

### Task 1: Trilha e exportação sem linhas `ot.%` para quem não tem o `ot`

**Files:**
- Create: `src/services/ot-visibilidade.ts`, `test/ot-trilha-oculta.test.ts`
- Modify: `src/routes/projects.ts:1298-1308` (`GET /:id/audit-trail`), `src/portabilidade.ts` (`exportarProjeto` e o filtro por tabela perto da linha 203), os chamadores de `exportarProjeto` (`grep -rn "exportarProjeto" src`)

**Interfaces:**
- Produces:
  - `podeVerOt(db: D1Database, user: { id?: string; role?: string; client_project_id?: string | null; agente?: boolean } | undefined, projectId: string): Promise<boolean>` = `agente !== true` && id não começa por `apikey:` && o módulo `ot` está na pessoa (`modulosDaPessoa`) **e** no projeto (`modulosDoProjeto`).
  - `exportarProjeto(env, projectId, comRastro = false, veOt = false)`: quando `veOt` é falso (padrão, fecha por padrão), as linhas de `audit_logs` com `action LIKE 'ot.%'` ficam de fora.

- [ ] **Step 1: Escrever os testes que falham** (reaproveite fixtures de `test/ot-inventario.test.ts` e `test/ot-modulo.test.ts`: projeto com os módulos `iso` e `ot`, pessoa só com `iso`, pessoa com `ot`, técnico `org_user`, chave de API de leitura; insira por SQL duas linhas em `audit_logs`: `('ot.desvio.tratado', entity_type 'ot_desvio', entity_id 'DESVIO-ID-123')` e `('capa_created', ...)`)

```ts
describe('audit-trail sem ot.% para quem não tem o ot', () => {
  it('pessoa sem ot não recebe linhas ot.% nem o id da entidade de OT', async () => {
    const r = await chamar('GET', '/api/v1/projects/p-ot/audit-trail', S.soIso);
    expect(r.status).toBe(200);
    const corpo = JSON.stringify(await r.json());
    expect(corpo).not.toContain('ot.desvio.tratado');
    expect(corpo).not.toContain('DESVIO-ID-123');
    expect(corpo).toContain('capa_created');
  });
  it('pessoa com ot (projeto com ot) continua vendo', async () => {
    const corpo = JSON.stringify(await (await chamar('GET', '/api/v1/projects/p-ot/audit-trail', S.comOt)).json());
    expect(corpo).toContain('ot.desvio.tratado');
  });
  it('chave de API e técnico não recebem ot.%', async () => { /* S.chave, S.tecnico: mesmo expect negativo */ });
});
describe('exportação sem ot.%', () => {
  it('o export de quem não tem ot não contém ot.% nem o id', async () => { /* GET export do projeto com S.soIso e S.chaveLeitura: 'DESVIO-ID-123' ausente; com S.comOt (se a rota permitir) presente */ });
});
```
(Descubra as URLs reais: `grep -rn "exportarProjeto\|/export" src/routes | head`; ajuste.)

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/ot-trilha-oculta.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** `src/services/ot-visibilidade.ts`:

```ts
import { modulosDaPessoa, modulosDoProjeto } from '../modulos';

/** Pessoa com o módulo ot na PESSOA e no PROJETO (P0-1); agente e chave de API nunca (P0-2). Falha fechada. */
export async function podeVerOt(
  db: D1Database,
  user: { id?: string; role?: string; client_project_id?: string | null; agente?: boolean } | undefined,
  projectId: string,
): Promise<boolean> {
  if (!user || user.agente === true || String(user.id ?? '').startsWith('apikey:')) return false;
  const [pessoa, projeto] = await Promise.all([modulosDaPessoa(db, user), modulosDoProjeto(db, projectId)]);
  return pessoa.includes('ot') && projeto.includes('ot');
}
```
  `audit-trail`: `const veOt = await podeVerOt(c.env.DB, c.get('user'), projectId);` e a consulta passa a `... WHERE project_id = ?${veOt ? '' : " AND action NOT LIKE 'ot.%'"} ...` (sem interpolar dado de requisição; a condição é constante do código). `exportarProjeto`: novo parâmetro `veOt = false`; no laço, `t === 'audit_logs' && !veOt` filtra `action LIKE 'ot.%'` (como o filtro de `avisos_prazo` logo acima); cada chamador passa `await podeVerOt(...)`.
  **Procure outros leitores de `audit_logs` que devolvam linhas a quem não tem `ot`:** `grep -rn "FROM audit_logs" src` e liste no relatório cada um com a decisão (filtrar, ou justificar por que não devolve linhas de OT); todo o que lista ação+entidade a quem alcança o projeto recebe o mesmo filtro.
  **Confira também que toda auditoria do n.ot usa o prefixo `ot.`:** `grep -rn "trilha(c, '" src/routes/ot*.ts` e `grep -rn "logAudit(.*'ot" src` — se houver ação do n.ot fora do prefixo, registre e ajuste o filtro (por exemplo `entity_type LIKE 'ot_%'`).
- [ ] **Step 4: Rodar e ver passar** — `npx vitest run test/ot-trilha-oculta.test.ts test/ot-inventario.test.ts test/ot-modulo.test.ts test/portabilidade*.test.ts test/contrato-isolamento-org.test.ts`.
- [ ] **Step 5: Mutação** — tire o filtro de `audit-trail` (ou o `await podeVerOt`) e veja o teste falhar; restaure. Idem no export.
- [ ] **Step 6: Commit** — `git commit -m "fix(ot): audit-trail e exportação não mostram ações ot.% a quem não tem o n.ot"`

**Entrega PR1:** `bash scripts/ci/gate.sh`; PR (rascunho).

---

## PR2 — `ot_referencias` (migration 0115)

### Task 2: Tabela satélite e serviço

**Files:**
- Create: `migrations/0115_ot_referencias.sql`, `src/services/ot-referencias.ts`, `test/ot-referencias.test.ts`
- Modify: `schema.sql`, `migrations/README.md` (seção 0115: **PENDENTE de aplicar**, nunca "aplicada")

**Interfaces:**
- Produces: tabela `ot_referencias`; `criarReferencia`, `lerReferencias`, `apagarReferencia` (assinaturas abaixo).

- [ ] **Step 1: Escrever o teste que falha** — `CHECK`s e `CASCADE`:

```ts
it('exatamente um alvo do núcleo e ao menos um alvo de OT', async () => {
  // risk_id + acao_id juntos → erro de CHECK; nenhum alvo do núcleo → erro; só alvo do núcleo sem ot_* → erro
  await expect(env.DB.prepare(`INSERT INTO ot_referencias (id, project_id, risk_id, acao_id, ot_site_id, criado_por) VALUES ('r1','p-ot','risk1','acao1','site1','u')`).run()).rejects.toThrow();
});
it('apagar o risco apaga a referência (CASCADE); desvio único por ação', async () => { /* … UNIQUE(ot_desvio_id) */ });
```
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar a migration** (confira os nomes e a convenção de FK composta das tabelas `ot_*` em `schema.sql` antes: `grep -n "REFERENCES ot_sites" schema.sql | head`; se o repositório usa FK composta `(id, project_id)`, siga; senão FKs simples + checagem de projeto no serviço):

```sql
-- 0115 — onda 3: referência núcleo → OT (satélite ot_*, fora da exportação). Aditiva. Verificar depois de aplicar:
--   SELECT name FROM sqlite_master WHERE name = 'ot_referencias' → 1 linha.
CREATE TABLE IF NOT EXISTS ot_referencias (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    risk_id TEXT REFERENCES risks(id) ON DELETE CASCADE,
    acao_id TEXT REFERENCES corrective_actions(id) ON DELETE CASCADE,
    incidente_id TEXT REFERENCES incidentes(id) ON DELETE CASCADE,
    ot_site_id TEXT REFERENCES ot_sites(id) ON DELETE CASCADE,
    ot_ativo_id TEXT REFERENCES ot_ativos(id) ON DELETE CASCADE,
    ot_desvio_id TEXT REFERENCES ot_desvios(id) ON DELETE CASCADE,
    criado_por TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((risk_id IS NOT NULL) + (acao_id IS NOT NULL) + (incidente_id IS NOT NULL) = 1),
    CHECK (ot_site_id IS NOT NULL OR ot_ativo_id IS NOT NULL),
    UNIQUE (ot_desvio_id)
);
CREATE INDEX IF NOT EXISTS idx_ot_ref_projeto ON ot_referencias(project_id);
CREATE INDEX IF NOT EXISTS idx_ot_ref_risk ON ot_referencias(risk_id);
CREATE INDEX IF NOT EXISTS idx_ot_ref_acao ON ot_referencias(acao_id);
CREATE INDEX IF NOT EXISTS idx_ot_ref_incidente ON ot_referencias(incidente_id);
```
  (`UNIQUE(ot_desvio_id)` aceita vários `NULL` em SQLite.) Mesma definição no `schema.sql`; `test/migrations-consistencia.test.ts` precisa passar. Serviço `src/services/ot-referencias.ts`:

```ts
export type AlvoNucleo = { tipo: 'risk' | 'acao' | 'incidente'; id: string };
export type AlvoOt = { ot_site_id?: string; ot_ativo_id?: string; ot_desvio_id?: string };
export async function criarReferencia(db: D1Database, projectId: string, nucleo: AlvoNucleo, ot: AlvoOt, criadoPor: string): Promise<{ ok: true; id: string } | { ok: false; status: 400 | 404 | 409; error: string }>;
export async function lerReferencias(db: D1Database, projectId: string, filtro: { nucleo?: AlvoNucleo; ot_site_id?: string; ot_ativo_id?: string }, sitesPermitidosJson: string): Promise<LinhaReferencia[]>;
export async function apagarReferencia(db: D1Database, projectId: string, id: string): Promise<boolean>;
```
  `criarReferencia` confere que o alvo do núcleo **e** o alvo de OT pertencem ao `projectId` (`SELECT 1 ... WHERE id = ? AND project_id = ?`; OT com `status = 'ativo'`) e que o site está em `sitesPermitidos` para quem pede. `lerReferencias` filtra `status='ativo'` do ativo/site e `site_id IN (SELECT value FROM json_each(?))` (P0-4).
- [ ] **Step 4: Rodar** `npx vitest run test/ot-referencias.test.ts test/migrations-consistencia.test.ts`.
- [ ] **Step 5: Commit** — `git commit -m "feat(ot): tabela ot_referencias (migration 0115) e serviço"`

### Task 3: Rotas `/ot/referencias` e testes de isolamento

**Files:**
- Modify: `src/routes/ot.ts` (as rotas ficaram nele; `src/routes/ot-referencias.ts` não foi criado), `src/modulos.ts` só se criar segmento novo (não deve: tudo sob `ot/`)
- Test: `test/ot-referencias.test.ts`, `test/contrato-isolamento-org.test.ts` (varredura automática por `app.routes`)

**Interfaces:**
- Consumes: `criarReferencia`/`lerReferencias`/`apagarReferencia` (Task 2), `contexto(c)` do `ot.ts` (`db, user, projectId, sites`).
- Produces: `GET /api/v1/projects/:projectId/ot/referencias?risk_id|acao_id|incidente_id|ot_site_id|ot_ativo_id=`, `POST /ot/referencias` (corpo estrito: um alvo do núcleo + `ot_site_id` e/ou `ot_ativo_id`), `DELETE /ot/referencias/:id`.

- [ ] **Step 1: Testes que falham** (exatos):
  1. `POST` pela pessoa com `ot` (consultor) → **201**; a mesma pessoa lê a referência; um **técnico** (`org_user`) com acesso só a outro site **não** a vê (lista sem ela).
  2. **Pessoa sem `ot`** (só iso): `POST/GET/DELETE` → o status que o `otApp` dá hoje a quem não tem o módulo (**403**); **agente** e **chave de API** → o status do guarda P0-2.
  3. Alvo do núcleo de **outro projeto** → 404/400 (mensagem em português); alvo de OT `status='removido'` → 404.
  4. A listagem de riscos/ações/incidentes pelas rotas do núcleo **não** contém campo algum da referência (`JSON.stringify` sem `ot_site_id`, `ot_ativo_id`, `ot_referencias`), para pessoa **com** `ot` também (o núcleo não faz JOIN).
  5. Exportação do projeto (pessoa com `ot` e chave de leitura) **não** contém `ot_referencias` nem o id do ativo referenciado.
  6. `contrato-isolamento-org`: as rotas novas aparecem na varredura e passam sem alterar o arquivo (se a varredura tiver lista de rotas explícita, acrescente-as).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** as três rotas dentro do `otApp` (herdam o guarda P0-1/P0-2), com `validateBody` + schema estrito em `src/schemas/ot.ts`, `trilha(c, 'ot.referencia.criada', projectId, 'Referência criada', { tipo: 'ot_referencia', id })` (só ids). Pode apagar quem pode editar o n.ot (`podeEditarOt`); ler: qualquer pessoa com `ot` no escopo de sites.
- [ ] **Step 4: Rodar** `npx vitest run test/ot-referencias.test.ts test/ot-*.test.ts test/contrato-isolamento-org.test.ts test/portabilidade*.test.ts test/modulos-produto.test.ts`.
- [ ] **Step 5: Mutação** por rota (tirar `await`/condição) e restaurar.
- [ ] **Step 6: Commit** — `git commit -m "feat(ot): rotas de referência núcleo→OT sob /ot, com isolamento"`

**Entrega PR2:** gate; PR (rascunho); **antes do merge:** backup, `db-migrate.yml` (manual), conferir a query do cabeçalho da `0115`.

---

## PR3 — Desvio vira ação corretiva

### Task 4: `POST /ot/desvios/:id/acao`

**Files:**
- Create: `src/services/ot-desvio-acao.ts`, `test/ot-desvio-acao.test.ts`
- Modify: `src/routes/ot.ts` (perto de `/desvios/:id/tratar`, linha ~1123), `src/schemas/ot.ts` (`otDesvioAcaoSchema`)

**Interfaces:**
- Consumes: `criarReferencia` (Task 2), `fecharDesvio` (`src/routes/ot.ts:1107`), `livreSemPii` (`src/schemas/ot.ts`), `modulosDoProjeto`.
- Produces: `POST /api/v1/projects/:projectId/ot/desvios/:id/acao` com corpo estrito `{ titulo: livreSemPii(200, 5), descricao?: livreSemPii(2000), responsavel: livre | assigned_to_parte_id, prazo?: AAAA-MM-DD }` → **201** `{ ok: true, acao_id, ja_existia: false }`; se o desvio já tem ação: **200** `{ ok: true, acao_id, ja_existia: true }` (idempotente).

- [ ] **Step 1: Testes que falham** (exatos): (a) projeto com `iso` e `ot`: consultor com `ot` cria → 201, existe uma linha em `corrective_actions` com o `title` enviado e **uma** em `ot_referencias` com `ot_desvio_id`; o desvio passou a `tratado` com a nota "Ação corretiva aberta"; (b) chamar de novo → 200 `ja_existia: true`, nenhuma ação duplicada; (c) projeto **sem `iso`** → 409 "habilite o n.iso" e nada é criado; (d) título com IP (`10.1.2.3`), e-mail, MAC → 400; título contendo o **nome exato** de um ativo, zona ou site do projeto → 400 (mensagem em português, sem revelar qual é o nome); (e) agente e chave de API → recusados (P0-2); pessoa sem `ot` → 403; técnico fora do site do desvio → 404; (f) o texto devolvido e gravado em `corrective_actions.title` **nunca** é preenchido automaticamente com dado do desvio (o servidor não copia nome de ativo/zona/site/protocolo/porta/fabricante/`chave_sensor`: teste que o título é exatamente o enviado); (g) desvio já `tratado`/`aceito` (não aberto) → o comportamento definido: se já tem ação → 200 existente; se não tem e não está aberto → 409 "Só desvio aberto vira ação".
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** o serviço com **um `db.batch`**: insere em `corrective_actions` (mesmas colunas do `POST /capa`: `INSERT INTO corrective_actions (id, project_id, title, description, severity, assigned_to, assigned_to_parte_id, due_date, status, created_at) VALUES (…, 'Open', …)`; o responsável é obrigatório como em `POST /capa`: reutilize `temResponsavel`/`MSG_RESPONSAVEL` de `src/routes/capa.ts`), insere a referência, atualiza o desvio para `tratado` com a nota, tudo na mesma operação (`situacao = 'aberto'` na cláusula `WHERE` do `UPDATE`, como `fecharDesvio`). Para o nome exato de ativo/zona/site: carregue `SELECT nome FROM ot_ativos WHERE project_id = ? AND status='ativo'` (+ zonas e sites) e recuse se o texto contiver algum, comparando sem caixa e sem acentos; **não** devolva o nome na mensagem. A verificação "projeto tem iso" usa `modulosDoProjeto`. Chame `avisar`/webhook `fechado` como `fecharDesvio` faz (reuse a função; extraia só o que for preciso, sem duplicar). `trilha(c, 'ot.desvio.acao', projectId, 'Ação corretiva aberta a partir do desvio', { tipo: 'ot_desvio', id })` (só ids; o `ot.%` já é filtrado do núcleo pelo Task 1).
- [ ] **Step 4: Rodar** `npx vitest run test/ot-desvio-acao.test.ts test/ot-desvio*.test.ts test/capa*.test.ts test/onda2-numeros.test.ts`.
- [ ] **Step 5: Mutação** (tirar o filtro do nome, a checagem de `iso`, o `await`): cada uma derruba um teste; restaurar.
- [ ] **Step 6: Commit** — `git commit -m "feat(ot): o desvio vira ação corretiva por decisão de uma pessoa"`

### Task 5: Quem criou a ação a partir do desvio não a conclui

**Files:**
- Modify: `src/routes/capa.ts:20-32` (`PUT /:id`), (e a rota de fechar pelo MCP/projeto se houver: `grep -n "Closed" src/routes/capa.ts src/mcp/*.ts | head`)
- Test: `test/ot-desvio-acao.test.ts`

**Interfaces:**
- Consumes: `ot_referencias` (`SELECT criado_por FROM ot_referencias WHERE acao_id = ?`).
- Produces: `PUT /api/v1/capa/:id` com `status: 'Closed'` devolve **403** `{ error: 'Quem criou a ação a partir do desvio não a conclui. Peça a outra pessoa.' }` quando `criado_por` do satélite é o usuário da sessão. **Só recusa; nunca revela** que a ação veio do n.ot a quem não é o criador (o criador tem `ot`).

- [ ] **Step 1: Testes que falham:** o criador tenta fechar → 403 (mensagem acima); **outra pessoa** (com ou sem `ot`) fecha → 200; abrir/editar outros campos pelo criador → 200 (só o `Closed` é barrado); uma ação **sem** referência fecha normalmente pelo seu criador (comportamento de hoje, não regride).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** em `PUT /:id`, antes do `UPDATE`: `if (body.status === 'Closed') { const ref = await c.env.DB.prepare('SELECT criado_por FROM ot_referencias WHERE acao_id = ?').bind(id).first<{ criado_por: string }>(); if (ref && ref.criado_por === c.get('user').id) return c.json({ error: '…' }, 403); }` (com `await`). Comentário: "leitura pontual de `ot_referencias` só para RECUSAR (segregação); o núcleo não lê mais nada dela". Cubra também qualquer outro caminho que conclua ação (`grep -rn "completed_at\|status.*Closed" src --include=*.ts`): o agente `niso_concluir_acao` passa pela mesma rota.
- [ ] **Step 4: Rodar** `npx vitest run test/ot-desvio-acao.test.ts test/capa*.test.ts test/agente*.test.ts`.
- [ ] **Step 5: Mutação** e commit — `git commit -m "feat(ot): quem criou a ação a partir do desvio não a conclui"`

### Task 6: Telas: botão no desvio e bloco "n.ot" nos detalhes

**Files:**
- Modify: `frontend/src/views/ot-desvios.js` (botão "Criar ação corretiva" ao lado de "Tratar"/"Aceitar"), os detalhes de risco, ação e incidente (`grep -rn "renderRisk\|renderCapa\|renderIncidente" frontend/src/views | head`: um bloco "Vínculo com o n.ot" carregado só se `S.user` tem o módulo `ot` e o projeto o tem)
- Test: `frontend/test/ot-*.test.js` e o teste de cada detalhe

**Interfaces:**
- Consumes: as rotas das Tasks 3 e 4. **A autorização é do servidor; a tela só espelha.**

- [ ] **Step 1: Testes que falham (jsdom):** o desvio aberto mostra "Criar ação corretiva"; o formulário pede título (ajuda: "Não use IP, e-mail nem o nome de ativos"), responsável e prazo; sucesso mostra "Ação criada" com link para a ação; 409 mostra a mensagem do servidor ("habilite o n.iso"); sem o módulo `ot` o bloco "n.ot" **não é renderizado** nos detalhes do núcleo e **nenhuma chamada** a `/ot/referencias` é feita (mock de `api` sem a rota: falha se chamada); com o módulo, o bloco lista as referências (escapeHTML) e permite criar/remover.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** seguindo o padrão do arquivo (`data-action`, sem inline). O bloco "n.ot" só dispara a chamada quando `(S.user.modulos ?? []).includes('ot')` e o projeto tem `ot` (use o mesmo helper que o menu usa para `n.ot`; `grep -n "SO_OT\|temModulo\|modulosDaPessoa" frontend/src/produto.js frontend/src/globals.js`).
- [ ] **Step 4: Rodar** os testes do frontend relacionados e `cd frontend && npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "feat(ot): botão Criar ação corretiva e bloco n.ot nos detalhes do núcleo"`

**Entrega PR3:** gate; PR (rascunho).

---

## PR4 — Fornecedor de OT (migration 0116)

### Task 7: `ot_fornecedores` e rotas

**Files:**
- Create: `migrations/0116_ot_fornecedores.sql`, `src/services/ot-fornecedores.ts`, `test/ot-fornecedores.test.ts`
- Modify: `schema.sql`, `src/routes/ot.ts` (rotas `GET/POST/DELETE /ot/fornecedores`), `migrations/README.md` (0116 PENDENTE)

**Interfaces:**
- Produces: tabela `ot_fornecedores (id, project_id, parte_id → partes ON DELETE CASCADE, papel CHECK IN ('integrador','fabricante','acesso_remoto'), ot_site_id NULL → ot_sites CASCADE, ot_fluxo_id NULL → ot_fluxos CASCADE, criado_por, created_at, UNIQUE(project_id, parte_id, papel, ot_site_id, ot_fluxo_id))`.

- [ ] **Step 1: Testes que falham:** (a) pessoa com `ot` liga uma `parte` do tipo organização (fornecedor) como `integrador` de um site → 201, lê → vê; (b) **a parte continua visível e avaliável** para quem não tem `ot` (`GET /api/v1/projects/p/partes` lista a parte; nenhum campo do papel de OT); (c) pessoa sem `ot`, agente e chave → recusados em `/ot/fornecedores`; (d) parte ou site de **outro projeto** → 404; (e) apagar a parte apaga o vínculo (CASCADE); (f) **exportação** sem `ot_fornecedores` nem o papel; (g) técnico só vê vínculos dos seus sites.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** migration (`CREATE TABLE IF NOT EXISTS`, aditiva, índices por projeto e parte) + `schema.sql` + serviço (`criarFornecedor`, `lerFornecedores(db, projectId, sitesPermitidosJson)`, `apagarFornecedor`; confere projeto das duas pontas, `SQL_EH_FORNECEDOR` de `src/services/terceiros.ts:85` para aceitar só fornecedor) + rotas sob `otApp`.
- [ ] **Step 4: Rodar** `npx vitest run test/ot-fornecedores.test.ts test/migrations-consistencia.test.ts test/ot-*.test.ts test/contrato-isolamento-org.test.ts test/terceiros*.test.ts`.
- [ ] **Step 5: Mutação** e commit — `git commit -m "feat(ot): fornecedor de OT (integrador, fabricante, acesso remoto) sobre o cadastro de terceiros (migration 0116)"`

### Task 8: Perguntas de OT na avaliação do fornecedor e tela

**Files:**
- Modify: `src/services/fornecedor-modelos.ts` (perguntas do projeto, `origem='projeto'`), a rota de avaliação (`src/routes/terceiros.ts:49`) só se precisar, `frontend/src/views/` (tela "Fornecedores do n.ot" dentro do n.ot)
- Test: `test/ot-fornecedores.test.ts`, `frontend/test/ot-fornecedores*.test.js`

**Interfaces:**
- Consumes: o mecanismo de perguntas do projeto (`src/services/fornecedor-modelos.ts:3-6`); decisão 7 da spec.

- [ ] **Step 1: Testes que falham:** ao vincular um fornecedor de OT, o servidor oferece (rota `POST /ot/fornecedores/:id/perguntas-padrao`, idempotente) um conjunto fixo de perguntas de OT como perguntas do projeto (acesso remoto por VPN com MFA, segregação de conta de integrador, gestão de patches do fabricante, plano de resposta a incidente do fornecedor) — **texto escrito por nós, curto, sem citar norma**; a avaliação continua sendo a de terceiros comum; a avaliação de terceiro continua da faixa `privacy`: num projeto **sem** `privacy` a criação das perguntas e a avaliação dão o 403 de hoje, e a tela do n.ot mostra "habilite o n.privacy para avaliar fornecedores" (mesmo princípio da decisão 1); a tela lista os fornecedores de OT (site/fluxo/papel) só com o módulo; sem `ot` nada é renderizado nem chamado.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** o conjunto fixo de perguntas em `src/data/` (constante, 4 perguntas) e a rota; a tela segue o padrão do n.ot.
- [ ] **Step 4: Rodar** os testes backend e frontend relacionados, `cd frontend && npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "feat(ot): perguntas de OT na avaliação do fornecedor e tela de fornecedores do n.ot"`

**Entrega PR4:** gate; PR (rascunho); `0116` pelo workflow manual antes do merge.

### Task 9: Documentação (um commit por PR, o último fecha)

**Files:**
- Modify: `AGENTS.md` (sem acentos), `CHANGELOG.md`, `migrations/README.md`, spec da onda 3 ("Rulings da execução"), `docs/openapi.json` e `mcp-server-niso/src/contrato-gerado.ts` (`npm run openapi`, commite o que mudar)

- [ ] **Step 1: AGENTS.md** (só o que existe, verificado por `grep`): `podeVerOt`; `audit-trail` e exportacao sem `ot.%` para quem nao tem o n.ot; `ot_referencias` (satelite, so rotas `/ot/referencias`, nenhuma leitura do nucleo); `POST /ot/desvios/:id/acao` (n.iso obrigatorio no projeto, texto validado, idempotente por `UNIQUE(ot_desvio_id)`); regra "quem criou a acao a partir do desvio nao a conclui"; `ot_fornecedores` e as perguntas de OT. Atualize o inventário de invariantes P0 citando os testes novos.
- [ ] **Step 2: CHANGELOG.md:** mudanças visíveis (quem não tem o `ot` deixa de ver ações `ot.%` no histórico e na exportação; botão "Criar ação corretiva" no desvio; bloco "n.ot" nos detalhes; fornecedores de OT).
- [ ] **Step 3: migrations/README.md:** `0115` e `0116` como **PENDENTE de aplicar**; quando o dono aplicar, um commit separado troca para "APLICADA" com a evidência medida (nunca antes).
- [ ] **Step 4: Spec onda 3:** rulings da execução (o que for decidido: nome exato de ativo na validação, mensagens, o que o `audit-trail` filtra e quais outros leitores de `audit_logs` foram tratados) e o que ficou aberto.
- [ ] **Step 5: Rodar** `npx vitest run test/migrations-consistencia.test.ts test/openapi.test.ts test/onda2-numeros.test.ts` e os testes de docs; `npx tsc --noEmit`; `git diff --stat -- test/onda2-numeros.test.ts` vazio.
- [ ] **Step 6: Commit** — `git commit -m "docs(onda3): AGENTS, CHANGELOG, migrations 0115/0116 pendentes e rulings"`

---

## Self-Review

- **Spec:** decisão 1 (n.iso obrigatório: Task 4, teste c); 2 (satélite: Tasks 2-3); 3 (texto: Task 4, testes d e f); 4 (segregação: Task 5); 5 (desvio `tratado`, sem sincronizar: Task 4; sem outra sincronização, por desenho); 6 (trilha/exportação: Task 1); 7 (perguntas do projeto + privacy: Task 8); 8 (parte visível, papel escondido: Task 7 teste b); 9 (incidente entra já: Tasks 2-3 aceitam `incidente_id`; Task 6 bloco no detalhe do incidente).
- **Placeholders:** URLs de exportação, o helper de "projeto tem ot" no frontend, a convenção de FK composta e as rotas de detalhe do núcleo vêm com o `grep` exato; os testes trazem valores esperados concretos.
- **Tipos:** `podeVerOt` (Task 1) é usado nas Tasks 3 e 7; `AlvoNucleo`/`AlvoOt`/`criarReferencia` (Task 2) nas Tasks 3 e 4; `otDesvioAcaoSchema` só na Task 4.
- **Riscos para a revisão:** (1) o filtro `ot.%` muda o histórico visível para quem já o via (CHANGELOG); (2) a leitura pontual de `ot_referencias` em `PUT /capa/:id` (única exceção à regra de "núcleo não lê o satélite": só recusa); (3) o D1 de produção pode não aplicar `PRAGMA foreign_keys` (o `CASCADE` depende: conferir antes de confiar); (4) `await` em todo `podeVerOt`.
