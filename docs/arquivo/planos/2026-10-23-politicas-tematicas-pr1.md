# Políticas temáticas — PR1 (modelo, cobertura e telas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A nota do controle deixa de virar política vigente, e a política passa a ser lida como documento temático com a cobertura de controles visível (lista, documento e controle).

**Architecture:** Sem migration. A cobertura é `documento_requisitos` × `compliance_controls.requisito_id` (todos os controles já têm `requisito_id`). Um serviço novo calcula a cobertura; uma rota `GET /projects/:id/documentos/cobertura` (faixa `nucleo`, segmento `documentos` já existente) a entrega; a tela Documentos e a de Controles a leem. Nesta fatia o documento abre no modal existente, agora com o texto inteiro renderizado; a página própria da política nasce no PR2, junto com o progresso das seções. O PR2 (catálogo e geração por seção) e o PR3 (organizar, retirada das rotas antigas, MCP) têm plano próprio, escrito depois do merge deste, porque usam as interfaces daqui.

**Tech Stack:** Cloudflare Workers + Hono + D1 (TypeScript), vitest com D1 real (`cloudflare:test`), frontend Vanilla JS + vitest/jsdom.

**Spec:** `docs/superpowers/specs/2026-10-23-politicas-tematicas-design.md`

## Global Constraints

- Português em código novo, mensagens e UI; sem itálico nem emoji; marca `ness.`, produtos `n.iso`/`n.privacy`.
- Sem migration; schema não muda.
- Nenhum dado real de cliente em teste, fixture ou doc.
- Texto vindo do servidor sempre escapado; markdown só por `markdownSeguro` (`frontend/src/ui.js:414`).
- Estilo inline só para valor calculado; `--radius: 0`; uma ação principal por tela.
- Commits em português com `--author="Ricardo Esper <44273656+resper1965@users.noreply.github.com>"`, sem rodapé de IA.
- Rodar antes de cada commit: `npx tsc --noEmit` e os testes do arquivo tocado.

## Arquivos

- Modify `src/services/documentos.ts` — `importarControle`: `description` só entra quando não há histórico.
- Create `src/services/cobertura-politicas.ts` — `coberturaDePoliticas(db, projectId)`.
- Modify `src/routes/documentos.ts` — `GET /documentos/cobertura` antes de `/documentos/:id`.
- Modify `frontend/src/views/documentos.js` — coluna Controles, indicador e controles sem cobertura; texto renderizado inteiro; requisitos sem trava de módulo.
- Modify `frontend/src/views/compliance.js` — "Coberto por" / "Sem política" na lista de controles.
- Modify `frontend/login.html`, `frontend/src/globals.js`, `frontend/test/casca-menu.test.js` — "Gestão de políticas" sai do menu; aviso de política leva a Documentos.
- Tests: `test/documentos-importar.test.ts`, `test/cobertura-politicas.test.ts` (novo), `frontend/test/documentos-view.test.js`, `frontend/test/controles-cobertura.test.js` (novo).
- Docs: `AGENTS.md` (parágrafo Documentos), `CHANGELOG.md`.

---

### Task 1: a nota do controle não vira versão

**Files:**
- Modify: `src/services/documentos.ts:148-153`
- Test: `test/documentos-importar.test.ts`

**Interfaces:**
- Produces: `importarControle` com regra nova: `description` entra como versão SÓ quando `historico` está vazio.

- [ ] **Step 1: Ler o teste existente** — abra `test/documentos-importar.test.ts` e veja como o arquivo semeia projeto, controles (`INSERT INTO compliance_controls ...` na linha 23) e `policy_versions`, e como chama `POST /api/v1/projects/:id/documentos/importar`. Reuse os mesmos helpers e o mesmo projeto.

- [ ] **Step 2: Escrever o teste que falha** — acrescente ao arquivo (ajuste ids/projeto ao padrão dele):

```ts
describe('a nota do controle não vira versão', () => {
  it('com histórico, a description diferente NÃO entra: a vigente é a última de policy_versions', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, description) VALUES ('imp-nota', ?, 'ISO 27001', 'A.5.1 Políticas', 'In Progress', 'Nota de governança do controle')`).bind(P),
      env.DB.prepare(`INSERT INTO policy_versions (id, project_id, control_id, version, policy_text, created_by) VALUES ('pv-n1', ?, 'imp-nota', 1, '# Política completa v1', 'c@x'), ('pv-n2', ?, 'imp-nota', 2, '# Política completa v2', 'c@x')`).bind(P, P),
    ]);
    const r = await chamarImportar(); // o helper que o arquivo já usa para POST .../documentos/importar
    expect(r.status).toBe(200);
    const doc = await env.DB.prepare(`SELECT id FROM documentos WHERE origem_control_id = 'imp-nota'`).first<{ id: string }>();
    const vs = (await env.DB.prepare(`SELECT numero, estado, texto FROM documento_versoes WHERE documento_id = ? ORDER BY numero`).bind(doc!.id).all()).results;
    expect(vs.map((v: any) => v.texto)).toEqual(['# Política completa v1', '# Política completa v2']);
    expect(vs.at(-1)).toMatchObject({ estado: 'vigente', texto: '# Política completa v2' });
  });

  it('sem histórico, a description segue entrando (era a única forma de política antes de policy_versions)', async () => {
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, description, ciso_approved_by) VALUES ('imp-so-desc', ?, 'ISO 27001', 'A.5.2 Papéis', 'Implemented', '# Política aprovada antiga', 'ciso@x')`).bind(P).run();
    await chamarImportar();
    const v = await env.DB.prepare(`SELECT v.texto, v.estado FROM documento_versoes v JOIN documentos d ON d.id = v.documento_id WHERE d.origem_control_id = 'imp-so-desc'`).first();
    expect(v).toMatchObject({ texto: '# Política aprovada antiga', estado: 'vigente' });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run test/documentos-importar.test.ts`. Esperado: o primeiro teste falha (três versões, a vigente é a nota).

- [ ] **Step 4: Implementar** — em `src/services/documentos.ts`, `importarControle`, troque a linha 152 e ajuste o comentário de cima:

```ts
/**
 * Cria o documento de UM controle a partir do histórico (`policy_versions`). A última versão é a vigente. O texto atual do
 * controle (`description`) só entra quando NÃO há histórico: com histórico, `description` diferente é nota ou justificativa do
 * controle, não política (foi assim que uma nota de governança virou a política vigente). Devolve `null` sem texto nenhum.
 */
async function importarControle(
  db: D1Database, projectId: string, c: ControleDePolitica, historico: VersaoDeHistorico[], ator: string,
): Promise<{ id: string; versoes: number } | null> {
  const versoes = historico.length ? [...historico] : c.description?.trim() ? [{ texto: c.description, por: ator }] : [];
  if (!versoes.length) return null;
```

  Atualize também o comentário de `importarDocumentos` (linhas ~171-180): troque "se o texto atual do controle difere da última (ou não há versões), entra mais uma com ele" por "o texto atual do controle só entra quando não há versões".

- [ ] **Step 5: Rodar** — `npx vitest run test/documentos-importar.test.ts test/politica-espelho.test.ts test/politica-escritores.test.ts test/evidencia-documento-controle.test.ts`. Esperado: PASS. Se um teste antigo esperava a description como versão extra com histórico presente, ele descreve o defeito: ajuste a expectativa para a regra nova e diga no relatório qual foi.

- [ ] **Step 6: Commit**

```bash
git add src/services/documentos.ts test/documentos-importar.test.ts
git commit -m "Importação de políticas: nota do controle não vira versão quando há histórico" --author="Ricardo Esper <44273656+resper1965@users.noreply.github.com>"
```

---

### Task 2: serviço e rota de cobertura

**Files:**
- Create: `src/services/cobertura-politicas.ts`
- Modify: `src/routes/documentos.ts` (rota nova ANTES de `documentosApp.get('/documentos/:id', ...)`, linha 18)
- Test: `test/cobertura-politicas.test.ts`

**Interfaces:**
- Consumes: `sqlClasseControle` de `src/services/classe-controle.ts`.
- Produces:
  ```ts
  export type DocumentoQueCobre = { id: string; titulo: string; status: 'rascunho' | 'vigente' | 'obsoleto' };
  export type CoberturaPoliticas = {
    aplicaveis: number;                      // controles do projeto com classe != 'na'
    cobertos: number;                        // aplicáveis com ao menos um documento tipo 'politica' VIGENTE ligado ao requisito
    sem_cobertura: { id: string; title: string }[];          // aplicáveis não cobertos, ordem do título
    por_controle: Record<string, DocumentoQueCobre[]>;       // control id → documentos tipo 'politica' ligados (qualquer status, menos obsoleto)
    por_documento: Record<string, number>;                   // documento id → nº de controles APLICÁVEIS ligados
  };
  export async function coberturaDePoliticas(db: D1Database, projectId: string): Promise<CoberturaPoliticas>;
  ```
  Rota: `GET /api/v1/projects/:projectId/documentos/cobertura` → `CoberturaPoliticas` (JSON).

- [ ] **Step 1: Escrever o teste que falha** — `test/cobertura-politicas.test.ts`. Modelo de setup: `test/documentos.test.ts` (projeto, sessão, `applySchema`, `sessionFor`, `workerEnv` de `test/helpers/d1.ts`). Requisitos: insira dois na tabela global `requisitos` se o schema de teste não os semear (veja colunas em `schema.sql`, `CREATE TABLE IF NOT EXISTS requisitos`; `requisito_fontes` precisa da fonte `iso27001:2022`).

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';
import { coberturaDePoliticas } from '../src/services/cobertura-politicas';

const P = 'p-cob';
let s: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente Cob', 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT OR IGNORE INTO projeto_modulos (project_id, modulo) VALUES (?, 'iso')`).bind(P),
    env.DB.prepare(`INSERT OR IGNORE INTO requisito_fontes (id, nome, versao) VALUES ('iso27001:2022', 'ISO/IEC 27001', '2022')`),
    env.DB.prepare(`INSERT OR IGNORE INTO requisitos (id, fonte_id, referencia, titulo) VALUES ('rq-a515', 'iso27001:2022', 'A.5.15', 'Controle de acesso'), ('rq-a518', 'iso27001:2022', 'A.5.18', 'Direitos de acesso'), ('rq-a524', 'iso27001:2022', 'A.5.24', 'Incidentes')`),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, requisito_id) VALUES
      ('cc-15', ?, 'ISO 27001', 'A.5.15 Controle de acesso', 'Implemented', 'rq-a515'),
      ('cc-18', ?, 'ISO 27001', 'A.5.18 Direitos de acesso', 'In Progress', 'rq-a518'),
      ('cc-24', ?, 'ISO 27001', 'A.5.24 Incidentes', 'Missing', 'rq-a524'),
      ('cc-na', ?, 'ISO 27001', 'A.7.1 Perímetro', 'Not Applicable', NULL)`).bind(P, P, P, P),
    env.DB.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo, status) VALUES ('doc-iam', ?, 'politica', 'POL-IAM-001 Controle de acesso', 'vigente'), ('doc-inc', ?, 'politica', 'POL-IRP-001 Incidentes', 'rascunho'), ('doc-proc', ?, 'procedimento', 'PRO-ACC-001', 'vigente')`).bind(P, P, P),
    env.DB.prepare(`INSERT INTO documento_requisitos (documento_id, requisito_id, project_id) VALUES ('doc-iam', 'rq-a515', ?), ('doc-iam', 'rq-a518', ?), ('doc-inc', 'rq-a524', ?), ('doc-proc', 'rq-a524', ?)`).bind(P, P, P, P),
  ]);
  s = await sessionFor({ id: 'cob-c', email: 'c@ness.lat', role: 'platform_admin', org_id: 'org_ness' });
});

describe('cobertura de políticas', () => {
  it('conta só política VIGENTE e só controle aplicável', async () => {
    const r = await coberturaDePoliticas(env.DB, P);
    expect(r.aplicaveis).toBe(3);
    expect(r.cobertos).toBe(2);                          // A.5.15 e A.5.18 pela POL-IAM vigente
    expect(r.sem_cobertura.map((x) => x.id)).toEqual(['cc-24']); // rascunho e procedimento não cobrem
    expect(r.por_documento).toMatchObject({ 'doc-iam': 2, 'doc-inc': 1 });
    expect(r.por_controle['cc-24']).toEqual([{ id: 'doc-inc', titulo: 'POL-IRP-001 Incidentes', status: 'rascunho' }]);
    expect(r.por_controle['cc-15'][0]).toMatchObject({ id: 'doc-iam', status: 'vigente' });
  });

  it('rota responde e não é engolida por /documentos/:id', async () => {
    const res = await app.fetch(new Request(`http://localhost/api/v1/projects/${P}/documentos/cobertura`, { headers: s }), workerEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ aplicaveis: 3, cobertos: 2 });
  });

  it('projeto sem controles: tudo zero', async () => {
    const r = await coberturaDePoliticas(env.DB, 'p-inexistente');
    expect(r).toEqual({ aplicaveis: 0, cobertos: 0, sem_cobertura: [], por_controle: {}, por_documento: {} });
  });
});
```

  Ajuste o objeto de `sessionFor` ao formato que `test/helpers/d1.ts` exporta (ele devolve os cabeçalhos da sessão).

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/cobertura-politicas.test.ts`. Esperado: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar o serviço** — `src/services/cobertura-politicas.ts`:

```ts
import { sqlClasseControle } from './classe-controle';

export type DocumentoQueCobre = { id: string; titulo: string; status: 'rascunho' | 'vigente' | 'obsoleto' };
export type CoberturaPoliticas = {
  aplicaveis: number;
  cobertos: number;
  sem_cobertura: { id: string; title: string }[];
  por_controle: Record<string, DocumentoQueCobre[]>;
  por_documento: Record<string, number>;
};

/**
 * Cobertura dos controles por política temática (spec 2026-10-23): o controle aponta para o requisito (`requisito_id`) e a
 * política declara os requisitos que cobre (`documento_requisitos`). Coberto = ao menos uma política VIGENTE ligada.
 * Rascunho aparece em `por_controle` (a tela mostra "em rascunho"), mas não conta; obsoleto não aparece.
 */
export async function coberturaDePoliticas(db: D1Database, projectId: string): Promise<CoberturaPoliticas> {
  const [controles, ligacoes] = await Promise.all([
    db.prepare(`SELECT id, title, requisito_id FROM compliance_controls WHERE project_id = ? AND ${sqlClasseControle('status')} != 'na' ORDER BY title`)
      .bind(projectId).all<{ id: string; title: string; requisito_id: string | null }>(),
    db.prepare(
      `SELECT dr.requisito_id, d.id, d.titulo, d.status FROM documento_requisitos dr
       JOIN documentos d ON d.id = dr.documento_id AND d.project_id = dr.project_id
       WHERE dr.project_id = ? AND d.tipo = 'politica' AND d.status != 'obsoleto' ORDER BY d.titulo`
    ).bind(projectId).all<{ requisito_id: string; id: string; titulo: string; status: DocumentoQueCobre['status'] }>(),
  ]);

  const porRequisito = new Map<string, DocumentoQueCobre[]>();
  for (const l of ligacoes.results) porRequisito.set(l.requisito_id, [...(porRequisito.get(l.requisito_id) ?? []), { id: l.id, titulo: l.titulo, status: l.status }]);

  const r: CoberturaPoliticas = { aplicaveis: 0, cobertos: 0, sem_cobertura: [], por_controle: {}, por_documento: {} };
  for (const c of controles.results) {
    r.aplicaveis++;
    const docs = (c.requisito_id && porRequisito.get(c.requisito_id)) || [];
    if (docs.length) r.por_controle[c.id] = docs;
    for (const d of docs) r.por_documento[d.id] = (r.por_documento[d.id] ?? 0) + 1;
    if (docs.some((d) => d.status === 'vigente')) r.cobertos++;
    else r.sem_cobertura.push({ id: c.id, title: c.title });
  }
  return r;
}
```

- [ ] **Step 4: Implementar a rota** — em `src/routes/documentos.ts`, importe `coberturaDePoliticas` e registre ANTES da linha `documentosApp.get('/documentos/:id', ...)`:

```ts
// Antes de '/documentos/:id': senão "cobertura" vira id.
documentosApp.get('/documentos/cobertura', async (c) => c.json(await coberturaDePoliticas(c.env.DB, c.req.param('projectId')!)));
```

- [ ] **Step 5: Rodar** — `npx vitest run test/cobertura-politicas.test.ts test/documentos.test.ts test/modulos-produto.test.ts`, depois `npx tsc --noEmit`. Esperado: PASS e tsc limpo. (`documentos` já é faixa `nucleo` em `src/modulos.ts:22`; o agente MCP pode ler — é GET.) Rode também `npm run openapi` se `test/openapi*.test.ts` reclamar de rota nova, e commite o arquivo regenerado.

- [ ] **Step 6: Commit**

```bash
git add src/services/cobertura-politicas.ts src/routes/documentos.ts test/cobertura-politicas.test.ts
git commit -m "Cobertura dos controles por política temática (documento vigente ligado ao requisito)" --author="Ricardo Esper <44273656+resper1965@users.noreply.github.com>"
```

---

### Task 3: tela de Documentos mostra a política inteira e a cobertura

**Files:**
- Modify: `frontend/src/views/documentos.js`
- Test: `frontend/test/documentos-view.test.js`

**Interfaces:**
- Consumes: `GET /api/v1/projects/:id/documentos/cobertura` → `CoberturaPoliticas` (Task 2); `window.markdownSeguro(texto)` (`frontend/src/ui.js:414`).
- Produces: `S.coberturaPoliticas` (cache da última leitura) para a Task 4.

- [ ] **Step 1: Ler o teste existente** — `frontend/test/documentos-view.test.js`: veja como ele mocka `api` (respostas por URL) e monta `renderDocumentos(c, h, a)`. Os testes novos seguem o mesmo molde; a URL nova `/documentos/cobertura` precisa de resposta no mock dos testes antigos (devolva `{ aplicaveis: 0, cobertos: 0, sem_cobertura: [], por_controle: {}, por_documento: {} }`).

- [ ] **Step 2: Escrever os testes que falham**

```js
it('mostra o indicador de cobertura e os controles sem política', async () => {
    mockarApi({ cobertura: { aplicaveis: 3, cobertos: 2, sem_cobertura: [{ id: 'cc-24', title: 'A.5.24 Incidentes' }], por_controle: {}, por_documento: { 'doc-iam': 2 } },
        documentos: [{ id: 'doc-iam', tipo: 'politica', titulo: 'POL-IAM-001', status: 'vigente', versao_vigente: 1 }] });
    await renderDocumentos(c, h, a);
    expect(c.querySelector('#docs-cobertura').textContent).toContain('2 de 3 controles aplicáveis cobertos por política vigente');
    expect(c.querySelector('#docs-sem-cobertura').textContent).toContain('A.5.24 Incidentes');
    expect(c.textContent).toContain('2'); // coluna Controles da POL-IAM
});

it('abre o documento com o texto inteiro renderizado, sem caixa de rolagem', async () => {
    const longo = '# Política\n\n' + Array.from({ length: 80 }, (_, i) => `## ${i}. Seção\n\nTexto da seção ${i}.`).join('\n\n');
    mockarApi({ documento: { id: 'd1', tipo: 'politica', titulo: 'POL', status: 'vigente', versoes: [{ numero: 1, estado: 'vigente', texto: longo }] } });
    await window.openDocumentoModal('p1', 'd1');
    const corpo = document.querySelector('#doc-texto-vigente');
    expect(corpo.querySelector('h2')).not.toBeNull();            // markdown renderizado
    expect(corpo.textContent).toContain('Texto da seção 79');     // até o fim
    expect(corpo.getAttribute('style') || '').not.toMatch(/max-height/);
});

it('mostra os requisitos (controles cobertos) também em projeto só com n.iso', async () => {
    mockarApi({ produtos: ['iso'], requisitos: [{ id: 'rq-a515', fonte_id: 'iso27001:2022', referencia: 'A.5.15', titulo: 'Controle de acesso' }] });
    await window.openDocumentoModal('p1', 'd1');
    expect(document.querySelector('#doc-requisitos').textContent).toContain('A.5.15');
});
```

  `mockarApi` é o nome ilustrativo do helper de mock do arquivo; use o que ele já tem.

- [ ] **Step 3: Rodar e ver falhar** — `cd frontend && npx vitest run test/documentos-view.test.js`. Esperado: FAIL.

- [ ] **Step 4: Implementar**
  1. Em `renderDocumentos`, depois de carregar `docs`, leia a cobertura (falha não derruba a tela):
     ```js
     let cob = { aplicaveis: 0, cobertos: 0, sem_cobertura: [], por_controle: {}, por_documento: {} };
     try { cob = await api('GET', `/api/v1/projects/${proj.id}/documentos/cobertura`); } catch (e) { /* sem cobertura, a lista segue */ }
     S.coberturaPoliticas = cob;
     ```
  2. Coluna nova "Controles" depois de "Tipo": `d.tipo === 'politica' ? String(cob.por_documento[d.id] || 0) : '—'` (acrescente o rótulo em `colunasDe([...])` na mesma posição).
  3. Acima da lista, só quando `cob.aplicaveis > 0`:
     ```js
     const indicador = cob.aplicaveis ? `
         <p id="docs-cobertura" class="mt-0 mb-2"><strong>${cob.cobertos} de ${cob.aplicaveis}</strong> controles aplicáveis cobertos por política vigente</p>
         ${cob.sem_cobertura.length ? `<details id="docs-sem-cobertura" class="mb-4"><summary>${cob.sem_cobertura.length} sem política vigente</summary>
             <ul class="t-sm">${cob.sem_cobertura.map((x) => `<li>${escapeHTML(x.title)}</li>`).join('')}</ul></details>` : ''}` : '';
     c.innerHTML = indicador + aviso + '<div id="documentos-lista"></div>';
     ```
  4. Em `openDocumentoModal`:
     - Rascunho (linha ~200 do arquivo, o `div` com `max-height:200px; ... white-space:pre-wrap`): troque por `<div id="doc-texto-rascunho" class="doc-texto">${window.markdownSeguro(rascunho.texto || '')}</div>`.
     - Texto vigente e versões (o `div` com `white-space:pre-wrap` na linha ~260): o da versão vigente vira `<div id="doc-texto-vigente" class="doc-texto">${window.markdownSeguro(vigente.texto || '')}</div>`; o das substituídas segue igual, mas também por `markdownSeguro`.
     - Requisitos: remova a trava `comPrivacy` (a rota é `nucleo` desde `src/modulos.ts:62`): sempre chame `GET .../documentos/${id}/requisitos` e, para quem edita, `GET /api/v1/requisitos`. Apague o comentário "Requisitos são da faixa n.privacy". Renomeie o rótulo da seção para "Controles e requisitos cobertos".
     - Abra o modal com `openModal(html, { grande: true })` se `openModal` aceitar opção de tamanho (veja a assinatura em `frontend/src/ui.js`); senão, mantenha.
  5. Em `frontend/src/style.css`, no fim (bloco de componentes), acrescente:
     ```css
     .doc-texto { font-size: var(--fs-sm); line-height: 1.6; }
     .doc-texto h1, .doc-texto h2, .doc-texto h3 { font-family: 'Montserrat', sans-serif; font-weight: 600; margin: 1rem 0 0.5rem; }
     .doc-texto table { border-collapse: collapse; width: 100%; }
     .doc-texto th, .doc-texto td { border: 1px solid var(--border); padding: 0.25rem 0.5rem; }
     ```
     (Use os tokens que existem em `:root`; se `--border` não existir, use o token de borda que o arquivo usa.)

- [ ] **Step 5: Rodar** — `cd frontend && npx vitest run test/documentos-view.test.js test/catracas-visuais.test.js test/politica-rascunho.test.js` e `npm run build`. Esperado: PASS. Se a catraca de `style=` cair, baixe o teto como o teste pede.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/documentos.js frontend/src/style.css frontend/test/documentos-view.test.js
git commit -m "Documentos: cobertura de controles e texto da política inteiro, renderizado" --author="Ricardo Esper <44273656+resper1965@users.noreply.github.com>"
```

---

### Task 4: controle mostra a política que o cobre; "Gestão de políticas" sai do menu

**Files:**
- Modify: `frontend/src/views/compliance.js:31-62` (`renderControls`)
- Modify: `frontend/login.html:434` (item `nav-policies`), `frontend/src/globals.js:1147` (`TELA_DO_AVISO.policies`)
- Test: `frontend/test/controles-cobertura.test.js` (novo), `frontend/test/casca-menu.test.js`

**Interfaces:**
- Consumes: `GET .../documentos/cobertura` (Task 2); `S.coberturaPoliticas` (Task 3) se já carregado do mesmo projeto.

- [ ] **Step 1: Escrever o teste que falha** — `frontend/test/controles-cobertura.test.js`, no molde dos testes que montam `renderControls` (procure `renderControls` em `frontend/test/` e copie o setup de `S` e do mock de `api`):

```js
it('cada controle mostra a política que o cobre ou "Sem política"', async () => {
    S.currentProject = { id: 'p1' };
    S.controls = [{ id: 'cc-15', project_id: 'p1', title: 'A.5.15 Controle de acesso', status: 'Implemented' },
                  { id: 'cc-24', project_id: 'p1', title: 'A.5.24 Incidentes', status: 'Missing' }];
    mockarApi({ '/documentos/cobertura': { aplicaveis: 2, cobertos: 1, sem_cobertura: [{ id: 'cc-24', title: 'A.5.24 Incidentes' }],
        por_controle: { 'cc-15': [{ id: 'doc-iam', titulo: 'POL-IAM-001', status: 'vigente' }] }, por_documento: { 'doc-iam': 1 } } });
    await renderControls(c, h, a);
    await new Promise((r) => setTimeout(r, 0));
    expect(c.querySelector('[data-cobertura="cc-15"]').textContent).toContain('POL-IAM-001');
    expect(c.querySelector('[data-cobertura="cc-24"]').textContent).toContain('Sem política');
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx vitest run test/controles-cobertura.test.js`.

- [ ] **Step 3: Implementar** — em `renderControls`, dentro do `phase-item`, logo abaixo do `phase-title`, acrescente `<div class="t-xs t-dim" data-cobertura="${escapeHTML(ctrl.id)}"></div>`; depois do `c.innerHTML = ...`, preencha sem bloquear a lista:

```js
        if (S.currentProject) preencherCobertura(c, S.currentProject.id);
    }

    // Política temática que cobre cada controle (spec 2026-10-23). Falha de leitura deixa a célula vazia.
    async function preencherCobertura(c, projectId) {
        let cob;
        try { cob = await api('GET', `/api/v1/projects/${projectId}/documentos/cobertura`); } catch (e) { return; }
        S.coberturaPoliticas = cob;
        c.querySelectorAll('[data-cobertura]').forEach((el) => {
            const docs = cob.por_controle[el.dataset.cobertura] || [];
            const vigente = docs.find((d) => d.status === 'vigente');
            el.textContent = vigente ? `Coberto por ${vigente.titulo}` : docs.length ? `Política em rascunho: ${docs[0].titulo}` : 'Sem política';
        });
    }
```

  Se `renderControls` estiver dentro de uma IIFE/escopo, declare `preencherCobertura` no mesmo escopo. `api` já é importado no arquivo.

- [ ] **Step 4: Menu** — em `frontend/login.html` remova o `div` `id="nav-policies"` (linha 434). Em `frontend/src/produto.js:19` tire `'nav-policies'` de `SO_ISO`. Em `frontend/src/globals.js:1147` troque `policies: 'policies-dashboard'` por `policies: 'documentos'`. Mantenha `'policies-dashboard'` em `DO_ISO_SEM_ITEM` (a tela continua existindo até o PR3). Atualize `frontend/test/casca-menu.test.js:63` removendo `nav-policies=Gestão de políticas` da lista esperada do grupo.

- [ ] **Step 5: Rodar** — `cd frontend && npx vitest run test/controles-cobertura.test.js test/casca-menu.test.js test/casca-globals.test.js test/politicas-link.test.js && npm run build`. Esperado: PASS. Se `politicas-link.test.js` esperava `policies-dashboard`, atualize para `documentos`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/compliance.js frontend/login.html frontend/src/produto.js frontend/src/globals.js frontend/test/controles-cobertura.test.js frontend/test/casca-menu.test.js
git commit -m "Controles mostram a política temática que os cobre; Gestão de políticas sai do menu" --author="Ricardo Esper <44273656+resper1965@users.noreply.github.com>"
```

---

### Task 5: documentação e verificação

**Files:**
- Modify: `AGENTS.md` (parágrafo "Documentos (politicas)"), `CHANGELOG.md` (`## [Não publicado]`)

- [ ] **Step 1: AGENTS.md** — no parágrafo "Documentos (politicas)", acrescente depois da frase sobre `POST .../documentos/importar`: "Com histórico em `policy_versions`, o `description` do controle NÃO entra como versão (é nota do controle); só entra quando não há histórico. **Política temática (spec `docs/superpowers/specs/2026-10-23-politicas-tematicas-design.md`):** a cobertura é `documento_requisitos` × `compliance_controls.requisito_id`; `GET /projects/:id/documentos/cobertura` (`src/services/cobertura-politicas.ts`) conta controle aplicável coberto por política VIGENTE; a tela Documentos mostra o indicador e a coluna Controles, e a de Controles mostra 'Coberto por'. 'Gestão de políticas' saiu do menu (a tela por controle sai no PR3)."

- [ ] **Step 2: CHANGELOG** — sob `## [Não publicado]`:

```md
### Políticas temáticas, PR1 (23/10/2026; sem migration)
- **Nota do controle não vira política:** na importação para Documentos, o texto do controle só entra como versão quando não há histórico de política; com histórico, ele é nota do controle.
- **Cobertura:** `GET /projects/:id/documentos/cobertura` conta os controles aplicáveis cobertos por política vigente (documento ligado ao requisito do controle). Documentos mostra o indicador, os controles sem política e a coluna Controles; Controles mostra "Coberto por".
- **Texto inteiro:** o documento abre com o texto renderizado em markdown, sem caixa de rolagem; os requisitos cobertos aparecem também em projeto só com n.iso.
- **Menu:** "Gestão de políticas" saiu; o aviso de política leva a Documentos.
```

- [ ] **Step 3: Verificação completa** — `npx tsc --noEmit`, `npx vitest run test/documentos*.test.ts test/cobertura-politicas.test.ts test/politica-*.test.ts test/modulos-produto.test.ts test/agente-*.test.ts`, `cd frontend && npx vitest run && npm run build`. Esperado: tudo verde.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md CHANGELOG.md
git commit -m "Documentação das políticas temáticas (PR1)" --author="Ricardo Esper <44273656+resper1965@users.noreply.github.com>"
```
