# Integração n.iso × n.privacy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer com que quem já usa um produto encontre o outro "meio implantado": um cadastro só para os conceitos
duplicados, catálogo LGPD/ANPD com mapeamento proposto para a ISO, e um painel de ponto de partida nos dois produtos.

**Architecture:** O núcleo (faixa `nucleo` de `src/modulos.ts`) absorve fornecedor/terceiro, DPO/encarregado e
incidente; cada produto mostra sua visão. Catálogo e mapeamento são dados versionados em `src/data/`, semeados por
`semearCatalogo`. O painel é uma rota do núcleo que só lê.

**Tech Stack:** Cloudflare Workers + Hono + D1 (SQLite), vitest com `cloudflare:test` (D1 real), frontend Vanilla JS
(Vite) com testes jsdom (`frontend/test`, `servir-api.js` dubla só o fetch).

**Spec:** `docs/superpowers/specs/2026-10-10-integracao-produtos-design.md`

## Global Constraints

- Worktree `C:\Users\resper\worktrees\integracao`, branch `feat/integracao-produtos`, empilhada sobre `feat/nprivacy-casca` (#332, ainda não mergeado). Não mexer na `main`.
- Código em inglês ou no padrão do arquivo (o repositório usa nomes em português nos módulos novos); comentários, mensagens e UI em português (PT-BR, sem i18n).
- Commits: `git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com" commit`, conventional commits em português, **sem** trailer `Co-Authored-By`, sem "Generated with", sem emoji.
- Schema muda em dois lugares: `schema.sql` (índice DEPOIS da tabela) e a migration numerada. Próximas: 0061, 0062, 0063.
- Toda rota nova de projeto entra em `FAIXA_DO_SEGMENTO` (`test/modulos-produto.test.ts` reprova a que não estiver).
- Testes de backend usam o D1 real (`applySchema`, `sessionFor`, `workerEnv`, `habilitarPrivacy` de `test/helpers/d1.ts`). Nada de mock do D1.
- Frontend: sem `onclick=` inline, sem `<script>` inline; ações por `data-action`/`data-args`; todo texto vindo da API passa por `escapeHTML`.
- Não aumentar a contagem de `any` (`test/any-catraca.test.ts`).
- Marca: `n.iso`, `n.privacy`, `ness.` sempre minúsculo. Sem emoji e sem ícone na UI.
- Sem nome de cliente real em teste, fixture ou doc.
- Rodar backend: `npx vitest run <arquivo> --exclude "nISO/**"`; frontend: `cd frontend && npx vitest run <arquivo>`.

## Review Focus

1. Ressemear o catálogo depois que o jurídico validou um mapeamento NÃO pode voltar o mapeamento para `proposto` (teste na Task 4).
2. Migration 0061 com fornecedor cujo nome já existe como parte (caixa/espaço diferentes) reaproveita a parte, não duplica (teste na Task 6).
3. Apagar fornecedor no n.iso não apaga a parte nem as avaliações/DPA do n.privacy (teste na Task 6).
4. Projeto só n.iso: nenhuma tela chama rota da faixa `privacy` (testes jsdom da Task 1 e da Task 10).
5. `pedido_id` de outro projeto em `POST /data-subject/erase` é recusado (teste na Task 9).

---

### Task 1: Correções de UI entre produtos

**Files:**
- Modify: `frontend/src/views/privacy.js` (linhas 17 e 48), `frontend/src/views/documentos.js` (150–153, 223–234), `frontend/src/views/compliance.js` (`renderEvidence` ~1472, `openEvidenceUploadModal` ~1561), `frontend/src/globals.js` (`handleNotificationClick` ~1017), `frontend/src/views/requisitos.js` (55, 69), `frontend/src/produto.js`
- Test: `frontend/test/produto-integracao.test.js` (novo), ajustes em `frontend/test/documentos-view.test.js`, `frontend/test/requisitos-view.test.js`

**Interfaces:**
- Consumes: `temProduto(p, produto)`, `produtoAtual()`, `SO_ISO`, `SO_PRIVACY`, `enderecoDoProduto(produto)` de `frontend/src/produto.js`.
- Produces: `window.temProduto = temProduto` e `export function produtoDaTela(tela)` em `produto.js` (`'iso' | 'privacy' | null`, pela presença de `'nav-' + tela` em `SO_ISO`/`SO_PRIVACY`); `window.abrirRequisitosEvidencia(projectId, evidenceId)`, `window.salvarRequisitosEvidencia(projectId, evidenceId)`, `window.salvarValidadeEvidencia(projectId, evidenceId)` em `compliance.js`.

- [ ] **Step 1: Testes que falham** (`frontend/test/produto-integracao.test.js`), no estilo de `documentos-view.test.js` (mock do router, `servir`, `S`):
  - `produtoDaTela('capa') === 'iso'`, `produtoDaTela('terceiros') === 'privacy'`, `produtoDaTela('documentos') === null`.
  - RoPA (`window.renderROPA`) com `S.activeProject = { id: 'p9', modulos: ['iso'] }`, `S.user = { role: 'consultor' }` e `GET /api/v1/projects/p9/ropa` devolvendo um registro: não existe `[data-action="openImportarRopaModal"]` nem `[data-action="openLigacoesTratamento"]`; com `modulos: ['iso','privacy']` os dois existem.
  - Documento com projeto `modulos: ['iso']`: `#doc-requisitos` não existe e nenhuma chamada a `/documentos/p1/requisitos` nem a `/api/v1/requisitos` foi feita (`chamadas(f)`); com `['iso','privacy']` a seção existe (os testes atuais de `documentos-view.test.js` passam a pôr `S.activeProject = { id: 'p9', modulos: ['iso','privacy'] }` no `beforeEach`).
  - Upload de evidência com `modulos: ['privacy']`: `#ev-control-id` não existe; com `['iso']` existe.
  - `window.abrirRequisitosEvidencia('p9','e1')` com `GET .../evidence/e1/requisitos` → `{ valido_ate: '2027-01-31', requisitos: [{ id: 'lgpd:art46', fonte_id:'lgpd', referencia:'art. 46', titulo:'Segurança' }] }` e catálogo `GET /api/v1/requisitos`: mostra `lgpd art. 46`, `#ev-valido-ate` com `2027-01-31`; escolher `lgpd:art37` em `#ev-req-add` e chamar `salvarRequisitosEvidencia` envia `PUT .../evidence/e1/requisitos` com `{ requisitos: ['lgpd:art46','lgpd:art37'] }`; `salvarValidadeEvidencia` com campo vazio envia `{ valido_ate: null }`.
  - Aviso: com `window.location` em `nprivacy.ness.com.br` (use `produtoAtual` com objeto de location injetável: `produtoDaTela` + nova função pura `destinoDoAviso(tela, loc)` que devolve `{ navegar: tela }` ou `{ href: 'https://niso.ness.com.br/' }`), `destinoDoAviso('capa', {hostname:'nprivacy.ness.com.br'})` devolve o href do n.iso; `destinoDoAviso('documentos', …)` navega.
  - `requisitos.js`: origem `{ tipo: 'evidencia', titulo: 'x.pdf' }` aparece como `Evidência: x.pdf`; o texto "Evidência ainda não entra na conta" não aparece.

- [ ] **Step 2: Rodar e ver falhar**: `cd frontend && npx vitest run test/produto-integracao.test.js test/documentos-view.test.js test/requisitos-view.test.js` → FAIL.

- [ ] **Step 3: Implementar**
  - `produto.js`:
    ```js
    export function produtoDaTela(tela) {
        if (SO_ISO.includes(`nav-${tela}`)) return 'iso';
        if (SO_PRIVACY.includes(`nav-${tela}`)) return 'privacy';
        return null;
    }
    /** Para onde um aviso leva: a tela, ou o outro domínio quando a tela é só do outro produto. */
    export function destinoDoAviso(tela, loc = window.location) {
        const dono = produtoDaTela(tela);
        return dono && dono !== produtoAtual(loc) ? { href: enderecoDoProduto(dono, loc) } : { navegar: tela };
    }
    window.temProduto = temProduto;
    ```
  - `privacy.js`: `import { temProduto } from '../produto.js';` e `const comPrivacy = temProduto(proj, 'privacy');` — o botão "Importar planilha" só com `canCrud && comPrivacy`; "Ligações" só com `comPrivacy`.
  - `documentos.js`: `const comPrivacy = temProduto(S.activeProject, 'privacy')` (o modal recebe `projectId`; o projeto ativo é o mesmo). Sem `comPrivacy`, não faz os dois GETs das linhas 150–152 e não monta a seção das linhas 223–234.
  - `compliance.js`: no modal de upload, o bloco do `#ev-control-id` só quando `temProduto(proj, 'iso')`. Em `renderEvidence`, quando `temProduto(proj,'privacy')`, cada linha ganha `<button class="btn btn-ghost btn-sm" data-action="abrirRequisitosEvidencia" data-args='["<proj>","<ev>"]'>Requisitos e validade</button>`. A janela segue o modelo da seção de requisitos de `documentos.js` (tags com ×, select `#ev-req-add`, botão "Ligar") e tem `<input type="date" id="ev-valido-ate">` + botão "Salvar validade". Estado em `S.evRequisitos`.
  - `globals.js` `handleNotificationClick`: onde hoje usa `TELA_DO_AVISO[...]` para navegar, passa por `destinoDoAviso`; se vier `href`, `window.location.href = href`.
  - `requisitos.js` linha 55: rótulo por tipo `{ documento: 'Documento', evidencia: 'Evidência', controle: 'Controle' }`; remove o texto da linha 69.

- [ ] **Step 4: Rodar e ver passar** (mesmo comando) e a suíte do frontend inteira: `cd frontend && npx vitest run` → tudo PASS.

- [ ] **Step 5: Commit** `fix(produtos): telas compartilhadas não chamam rota do produto que o projeto não tem`

---

### Task 2: Catálogo LGPD

**Files:**
- Create: `src/data/lgpd.ts`
- Modify: `src/services/requisitos.ts` (`FONTES`, `semearCatalogo`)
- Test: `test/catalogo-lgpd.test.ts` (novo)

**Interfaces:**
- Produces: `export interface RequisitoLegal { id: string; referencia: string; titulo: string; pai_id: string | null }`, `export const LGPD_VERSAO: string` (ex.: `'Lei 13.709/2018, texto compilado do Planalto, consultado em 2026-10-10'`), `export const LGPD: readonly RequisitoLegal[]`. `semearCatalogo` passa a inserir `LGPD` com `fonte_id='lgpd'`.

- [ ] **Step 1: Teste que falha**
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import { semearCatalogo } from '../src/services/requisitos';
import { LGPD } from '../src/data/lgpd';

describe('catálogo LGPD', () => {
  beforeAll(async () => { await applySchema(); await semearCatalogo(env.DB); });

  it('ids no padrão do código: lgpd:artN e filho lgpd:artN:inciso, referência legível', () => {
    for (const r of LGPD) {
      expect(r.id).toMatch(/^lgpd:art\d+(-[a-z])?(:[a-z0-9]+)?$/);
      expect(r.referencia).toMatch(/^art\. \d+/);
      if (r.pai_id) expect(LGPD.some((p) => p.id === r.pai_id)).toBe(true);
    }
    expect(new Set(LGPD.map((r) => r.id)).size).toBe(LGPD.length);
  });

  it('traz as bases legais (art. 7 I–X, art. 11) como filhos, que a tela de ligações do RoPA usa', () => {
    const filhos = (pai: string) => LGPD.filter((r) => r.pai_id === pai).map((r) => r.id);
    expect(filhos('lgpd:art7')).toEqual(['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'].map((x) => `lgpd:art7:${x}`));
    expect(filhos('lgpd:art11').length).toBeGreaterThanOrEqual(2);
    expect(LGPD.some((r) => r.id === 'lgpd:art7:ix' && r.referencia === 'art. 7, IX')).toBe(true);
  });

  it('cobre os deveres centrais: registro, RIPD, encarregado, segurança, incidente, direitos do titular', () => {
    for (const id of ['lgpd:art18', 'lgpd:art37', 'lgpd:art38', 'lgpd:art41', 'lgpd:art46', 'lgpd:art48']) expect(LGPD.some((r) => r.id === id), id).toBe(true);
  });

  it('semear grava na fonte lgpd e é idempotente', async () => {
    const conta = async () => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM requisitos WHERE fonte_id = 'lgpd'`).first<{ n: number }>())!.n;
    expect(await conta()).toBe(LGPD.length);
    await semearCatalogo(env.DB);
    expect(await conta()).toBe(LGPD.length);
    const pai = await env.DB.prepare(`SELECT pai_id FROM requisitos WHERE id = 'lgpd:art7:ix'`).first<{ pai_id: string }>();
    expect(pai!.pai_id).toBe('lgpd:art7');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**: `npx vitest run test/catalogo-lgpd.test.ts --exclude "nISO/**"` → FAIL (módulo não existe).

- [ ] **Step 3: Gerar `src/data/lgpd.ts`** a partir do texto oficial:
  - Baixar `https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm` (`curl -sL -A "Mozilla/5.0"`, decodificar como cp1252, descartar `<strike>` — texto revogado).
  - Entram os artigos que impõem dever ou condição ao controlador/operador/encarregado: arts. 6–12, 14–23, 33–51 (inclui os com sufixo, se houver nesse intervalo). Não entram: 1–5 (objeto/definições), 24–32 (setor público, exceto o art. 23 que entra), 52–65 (sanções, ANPD, disposições finais).
  - Filhos: incisos do art. 7 (I–X), do art. 11 (I e as alíneas do II como `lgpd:art11:ii-a` … referência `art. 11, II, a`), do art. 18 (I–IX) e do art. 33 (I–IX).
  - `titulo`: frase curta em palavras próprias que diz o dever (ex.: `art. 37` → "Manter registro das operações de tratamento"; `art. 48` → "Comunicar incidente à ANPD e ao titular"). Máx. 120 caracteres.
  - Cabeçalho do arquivo: comentário com a URL, a data da consulta e a regra de seleção acima.
  - Em `requisitos.ts`, a entrada `lgpd` de `FONTES` ganha `versao: LGPD_VERSAO`; `semearCatalogo` acrescenta `stmtRequisitos(db, LGPD.map((r) => ({ ...r, fonte_id: 'lgpd', papel: null })))` ao batch. Como `stmtRequisitos` não grava `pai_id`, estenda o SELECT dele com `json_extract(j.value, '$.pai_id')` e a coluna `pai_id` (os ISO mandam `pai_id: null`). Pais antes dos filhos no array (a FK `pai_id` é checada por linha).

- [ ] **Step 4: Rodar e ver passar**; rodar também `test/requisitos-rotas.test.ts test/lia-dpia.test.ts test/encarregado.test.ts` (inserem `lgpd:*` na mão: se colidirem com o semeado, trocar por `INSERT OR IGNORE` no teste).

- [ ] **Step 5: Commit** `feat(requisitos): catálogo da LGPD gerado do texto compilado oficial`

---

### Task 3: Catálogo ANPD

**Files:**
- Create: `src/data/anpd.ts`
- Modify: `src/services/requisitos.ts` (`FONTES` ganha `{ id: 'anpd', nome: 'Resoluções da ANPD', versao: ANPD_VERSAO, vigente_desde: null }`; `semearCatalogo`)
- Test: `test/catalogo-anpd.test.ts` (novo)

**Interfaces:**
- Produces: `export const ANPD_VERSAO: string`, `export const ANPD: readonly RequisitoLegal[]` (reusa a interface exportada por `src/data/lgpd.ts`).

- [ ] **Step 1: Teste que falha** (mesma estrutura da Task 2):
  - Todo id casa `/^anpd:res\d+-\d{4}(:art\d+(-[a-z])?)?$/`; cada resolução é um pai sem `pai_id`, cada artigo tem `pai_id` da resolução; ids únicos.
  - Existem os pais `anpd:res2-2022`, `anpd:res15-2024`, `anpd:res18-2024`, `anpd:res19-2024`.
  - Referência do filho no formato `Res. CD/ANPD 15/2024, art. 6`.
  - `semearCatalogo` grava `fonte_id='anpd'`, idempotente, e `GET /api/v1/requisitos/fontes` lista `anpd`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Gerar `src/data/anpd.ts`**: baixar o texto de cada resolução no portal oficial (gov.br/anpd ou in.gov.br; registrar a URL usada no comentário do arquivo). Entram os artigos que impõem dever ao agente de tratamento ou ao encarregado (ex.: na 15/2024, prazo e conteúdo da comunicação, registro do incidente; na 18/2024, indicação, publicidade e atividades do encarregado; na 19/2024, cláusulas-padrão e transparência da transferência; na 2/2022, o que muda para o agente de pequeno porte). Títulos em palavras próprias, máx. 120 caracteres. Se um portal não responder, parar e relatar (não inventar artigo).
- [ ] **Step 4: Rodar e ver passar**; `test/requisitos-rotas.test.ts` continua verde.
- [ ] **Step 5: Commit** `feat(requisitos): resoluções da ANPD como fonte do catálogo`

---

### Task 4: Mapeamento proposto LGPD/ANPD ↔ ISO

**Files:**
- Create: `src/data/mapeamento-privacidade-iso.ts`
- Modify: `src/services/requisitos.ts` (`semearCatalogo`)
- Test: `test/mapeamento-privacidade-iso.test.ts` (novo)

**Interfaces:**
- Produces: `export interface Mapeamento { de: string; para: string; tipo: 'equivalente' | 'parcial' | 'relacionado' }`, `export const MAPEAMENTOS: readonly Mapeamento[]` (`de` = requisito ISO `iso27001:2022:*` ou `iso27701:2025:*`; `para` = `lgpd:*` ou `anpd:*`). `semearCatalogo` devolve também `mapeamentos: number`.

- [ ] **Step 1: Teste que falha**
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import { semearCatalogo, lacunasDaFonte } from '../src/services/requisitos';
import { MAPEAMENTOS } from '../src/data/mapeamento-privacidade-iso';

describe('mapeamento proposto', () => {
  beforeAll(async () => { await applySchema(); await semearCatalogo(env.DB); });

  it('todo par aponta para requisito que existe no catálogo, sem par repetido', async () => {
    const ids = new Set((await env.DB.prepare('SELECT id FROM requisitos').all<{ id: string }>()).results.map((r) => r.id));
    for (const m of MAPEAMENTOS) { expect(ids.has(m.de), m.de).toBe(true); expect(ids.has(m.para), m.para).toBe(true); }
    expect(new Set(MAPEAMENTOS.map((m) => `${m.de}|${m.para}`)).size).toBe(MAPEAMENTOS.length);
  });

  it('entra como proposto e não conta na cobertura', async () => {
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM requisito_mapeamentos WHERE estado = 'proposto'`).first<{ n: number }>();
    expect(n!.n).toBe(MAPEAMENTOS.length);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('mp', 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness')`),
    ]);
    const m = MAPEAMENTOS.find((x) => x.tipo === 'equivalente') ?? MAPEAMENTOS[0];
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, title, status, standard, requisito_id) VALUES ('c1', 'mp', ?, 'Implemented', 'ISO 27001:2022', ?)`).bind(`${m.de.split(':').pop()} — x`, m.de).run();
    const fonte = m.para.split(':')[0];
    const item = (await lacunasDaFonte(env.DB, 'mp', fonte)).find((l) => l.requisito_id === m.para)!;
    expect(item.situacao).toBe('lacuna');
  });

  it('ressemear não rebaixa mapeamento já validado', async () => {
    const m = MAPEAMENTOS[0];
    await env.DB.prepare(`UPDATE requisito_mapeamentos SET estado = 'validado_juridico', validado_por = 'Jurídico', validado_em = '2026-10-10' WHERE de_id = ? AND para_id = ?`).bind(m.de, m.para).run();
    await semearCatalogo(env.DB);
    const r = await env.DB.prepare('SELECT estado FROM requisito_mapeamentos WHERE de_id = ? AND para_id = ?').bind(m.de, m.para).first<{ estado: string }>();
    expect(r!.estado).toBe('validado_juridico');
  });

  it('cobre os pontos de contato óbvios', () => {
    const tem = (para: string) => MAPEAMENTOS.some((m) => m.para === para);
    for (const p of ['lgpd:art37', 'lgpd:art38', 'lgpd:art46', 'lgpd:art48', 'lgpd:art41', 'lgpd:art18']) expect(tem(p), p).toBe(true);
  });
});
```
(Ajustar as colunas do INSERT de `compliance_controls` ao DDL real se algum NOT NULL faltar.)

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Gerar `src/data/mapeamento-privacidade-iso.ts`**: para cada requisito LGPD/ANPD da Task 2/3 que tem contrapartida, os controles de `src/data/iso27701-2025.ts` (pelos títulos próprios) e de `src/data/iso27001-2022.ts` (ex.: A.5.34 privacidade/PII, A.5.24–A.5.28 incidente, A.5.19–A.5.23 fornecedor, A.5.9 inventário, A.5.12 classificação, A.6.3 treinamento, A.8.10 exclusão, A.8.11 mascaramento, A.8.24 criptografia, A.5.31 requisitos legais). `equivalente` só quando o controle cumpre o dever inteiro; o normal é `parcial`; `relacionado` quando só ajuda. Comentário no topo: "Proposta gerada; só conta depois de validada por pessoa na tela de requisitos." Em `semearCatalogo`, acrescentar ao batch:
```ts
db.prepare(
  `INSERT OR IGNORE INTO requisito_mapeamentos (de_id, para_id, tipo, estado)
   SELECT json_extract(j.value, '$.de'), json_extract(j.value, '$.para'), json_extract(j.value, '$.tipo'), 'proposto'
     FROM json_each(?1) j`
).bind(JSON.stringify(MAPEAMENTOS)),
```
  (o batch já roda depois de fontes e requisitos; ordem importa pela FK).
- [ ] **Step 4: Rodar e ver passar**; `test/requisitos-rotas.test.ts test/encarregado.test.ts` verdes.
- [ ] **Step 5: Commit** `feat(requisitos): mapeamento proposto entre LGPD/ANPD e controles ISO`

---

### Task 5: Validação dos mapeamentos na tela de requisitos

**Files:**
- Modify: `frontend/src/views/requisitos.js` (modal "Abrir" ~90–107, botão do admin ~28/82–88, filtro)
- Test: `frontend/test/requisitos-view.test.js`

**Interfaces:**
- Consumes: `GET /api/v1/requisitos/:id` (já devolve o requisito com seus mapeamentos; conferir o formato em `src/routes/requisitos.ts:89` e `lerRequisito`), `PUT /api/v1/requisitos/mapeamentos` (corpo `mapeamentoSchema`), `DELETE /api/v1/requisitos/mapeamentos?de=&para=`.
- Produces: `window.validarMapeamento(de, para, tipo, requisitoId)`, `window.recusarMapeamento(de, para, requisitoId)`.

- [ ] **Step 1: Testes que falham**:
  - `S.user = { role: 'platform_admin', name: 'Ana Jurídico' }`, abrir requisito com um mapeamento `proposto`: aparecem os botões `[data-action="validarMapeamento"]` e `[data-action="recusarMapeamento"]`; para `org_user` não aparecem.
  - `validarMapeamento` envia `PUT /api/v1/requisitos/mapeamentos` com `{ de_id, para_id, tipo, estado: 'validado_juridico', validado_por: 'Ana Jurídico', validado_em: <hoje AAAA-MM-DD> }` e reabre o requisito.
  - `recusarMapeamento` envia `DELETE /api/v1/requisitos/mapeamentos?de=…&para=…` só depois de confirmação na própria janela (botão "Confirmar recusa"; o app não usa `confirm()`).
  - Mapeamento `validado_juridico` mostra "Validado por X em DD/MM/AAAA" e nenhum botão.
  - O botão do admin diz "Carregar catálogo" (era "Carregar catálogo ISO").
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** no padrão de `acao()`/`showToast` do arquivo; data de hoje com `new Date().toISOString().slice(0,10)`; nome do validador `S.user.name || S.user.email`.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** `feat(requisitos): validação jurídica dos mapeamentos na tela`

---

### Task 6: Fornecedor = terceiro

**Files:**
- Create: `migrations/0061_fornecedor_e_terceiro.sql`
- Modify: `schema.sql` (tabela `vendors` + índice + 2 gatilhos depois de `parte_vinculos` e `partes`), `src/routes/vendors.ts`, `src/services/terceiros.ts` (`definirTipo`), `src/services/partes.ts` (`importarPartes` sem `vendors`)
- Test: `test/fornecedor-terceiro.test.ts` (novo); ajustar `test/nucleo-partes.test.ts` se ele contar vínculos vindos de `vendors`

**Interfaces:**
- Produces: coluna `vendors.parte_id TEXT REFERENCES partes(id) ON DELETE CASCADE` com índice único `idx_vendors_parte`; gatilhos `vendor_perfil_do_terceiro` e `vendor_nome_da_parte`. Respostas das rotas de vendors inalteradas, mais o campo `parte_id`.

- [ ] **Step 1: Teste que falha** (`test/fornecedor-terceiro.test.ts`), com projeto `P` habilitado nos dois produtos (`habilitarPrivacy(P)`), consultor logado:
  - **Migration com dado legado**: num banco com o schema ANTERIOR (aplicar `schema.sql`, depois `DROP TRIGGER` dos dois gatilhos novos e recriar `vendors` sem `parte_id` — ou, mais simples, seguir o molde do teste da 0060 em `test/modulos-produto.test.ts`, que aplica o arquivo da migration com `execSql`), inserir: vendor "Acme Nuvem" + parte organização " acme  nuvem " no mesmo projeto; vendor "Beta Ltda" sem parte. Aplicar `migrations/0061_fornecedor_e_terceiro.sql`. Esperado: Acme ligado à parte existente (sem parte nova); Beta com parte nova `tipo='organizacao'`; os dois com vínculo `terceiro` no projeto; nenhum vendor com `parte_id` nulo.
  - **POST /vendors** `{ name: 'Gama', has_iso27001: 1 }` → 201; existe parte "Gama" organização com vínculo `terceiro`; `GET /terceiros` lista Gama; `GET /vendors` devolve `parte_id`.
  - **POST /vendors** com nome de parte já existente reaproveita a parte (contagem de partes não muda).
  - **PUT /vendors/:id** `{ name: 'Gama Nova' }` → `partes.nome = 'Gama Nova'`.
  - **PUT /terceiros/:parteId/tipo** `{ terceiro_tipo: 'medio' }` numa parte organização SEM vendor → `GET /vendors` passa a listar essa parte (perfil criado pelo gatilho com `trust_score` 0).
  - **DELETE /vendors/:id** → perfil some, vínculo `terceiro` do projeto some, a parte e uma `avaliacoes_terceiro` dela continuam.
  - Projeto só n.iso (sem `habilitarPrivacy`): POST /vendors funciona (faixa `nucleo`).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Migration 0061**:
```sql
-- 0061: fornecedor (n.iso) e terceiro (n.privacy) viram UMA parte. `vendors` passa a ser o perfil de segurança
-- (due diligence ISO) da parte organização; a avaliação de validade do n.privacy continua em avaliacoes_terceiro.
ALTER TABLE vendors ADD COLUMN parte_id TEXT REFERENCES partes(id) ON DELETE CASCADE;

-- parte que falta (por nome normalizado, organização, mesmo projeto)
INSERT INTO partes (id, project_id, tipo, nome)
SELECT lower(hex(randomblob(16))), v.project_id, 'organizacao', trim(v.name)
  FROM vendors v
 WHERE v.project_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM partes p WHERE p.project_id = v.project_id AND p.tipo = 'organizacao'
                     AND lower(trim(p.nome)) = lower(trim(v.name)))
 GROUP BY v.project_id, lower(trim(v.name));

UPDATE vendors SET parte_id = (
  SELECT p.id FROM partes p WHERE p.project_id = vendors.project_id AND p.tipo = 'organizacao'
     AND lower(trim(p.nome)) = lower(trim(vendors.name)) ORDER BY p.created_at, p.rowid LIMIT 1)
 WHERE parte_id IS NULL;

INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id)
SELECT lower(hex(randomblob(16))), v.project_id, v.parte_id, 'terceiro', 'projeto', v.project_id
  FROM vendors v WHERE v.parte_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_parte ON vendors(parte_id);

CREATE TRIGGER IF NOT EXISTS vendor_perfil_do_terceiro
AFTER INSERT ON parte_vinculos
WHEN NEW.papel = 'terceiro' AND NEW.alvo_tipo = 'projeto'
BEGIN
  INSERT OR IGNORE INTO vendors (id, project_id, name, parte_id)
  SELECT lower(hex(randomblob(8))), NEW.project_id, p.nome, p.id FROM partes p WHERE p.id = NEW.parte_id AND p.tipo = 'organizacao';
END;

CREATE TRIGGER IF NOT EXISTS vendor_nome_da_parte
AFTER UPDATE OF nome ON partes
BEGIN
  UPDATE vendors SET name = NEW.nome WHERE parte_id = NEW.id;
END;
```
  Normalização: o `norm` de `partes.ts` também colapsa espaços internos; aceitar `lower(trim())` como ceiling e marcar `-- ponytail: espaços internos repetidos não são colapsados; nomes assim viram parte nova`. Duplicar o mesmo DDL no `schema.sql` (coluna dentro do CREATE TABLE de `vendors`; índice e gatilhos depois de `partes` e `parte_vinculos`).
  - `vendors.ts` POST: achar parte (`lower(trim(nome))`, organização, projeto) ou criar; INSERT do vínculo `terceiro` (o gatilho cria o perfil); então `UPDATE vendors SET <campos>, trust_score, diligence_level WHERE parte_id = ?` e devolver o id do perfil. Tudo num `db.batch`.
  - PUT: depois do UPDATE, `UPDATE partes SET nome = ?, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT parte_id FROM vendors WHERE id = ?)` quando o nome mudou.
  - DELETE: batch `DELETE FROM parte_vinculos WHERE parte_id = ? AND papel = 'terceiro' AND alvo_tipo = 'projeto' AND alvo_id = ?` + `DELETE FROM vendors WHERE id = ?`; `logAudit('vendor.deleted', …)` (hoje não há log).
  - GET: `SELECT v.*, p.nome AS name FROM vendors v JOIN partes p ON p.id = v.parte_id WHERE v.project_id = ? AND p.status = 'ativa' ORDER BY v.created_at DESC`.
  - `terceiros.ts` `definirTipo`: quando `tipo` não é nulo, também `INSERT OR IGNORE INTO parte_vinculos (… 'terceiro', 'projeto', projectId)`.
  - `partes.ts` `importarPartes`: remover a leitura de `vendors` e o laço correspondente; comentário de uma linha dizendo que a 0061 e o gatilho fazem a ponte.
- [ ] **Step 4: Rodar e ver passar**; rodar `test/terceiros.test.ts test/nucleo-partes.test.ts test/fornecedor-trilha.test.ts test/trilha-exclusao.test.ts test/portabilidade.test.ts test/idor-tenant.test.ts test/schema-contract.test.ts`.
- [ ] **Step 5: Commit** `feat(nucleo): fornecedor do n.iso e terceiro do n.privacy são a mesma parte (migration 0061)`

---

### Task 7: DPO = encarregado

**Files:**
- Create: `migrations/0062_dpo_encarregado.sql`, `src/services/encarregado-pessoa.ts`
- Modify: `src/routes/governance.ts` (POST ~142–189), `src/services/partes.ts` (`importarPartes`), `src/services/encarregado.ts` (`visaoDoEncarregado`), `frontend/src/views/encarregado.js`
- Test: `test/dpo-encarregado.test.ts` (novo), `frontend/test/encarregado-view.test.js`

**Interfaces:**
- Produces:
  - `export const EH_DPO = /\b(dpo|encarregad[oa])\b/i;` e `export const ehDpo = (g: { job_title?: string | null; role_category?: string | null }) => g.role_category === 'dpo' || EH_DPO.test(g.job_title ?? '');`
  - `export async function garantirEncarregado(db: D1Database, projectId: string, pessoa: { nome: string; email: string | null }): Promise<string>` (devolve o `parte_id`; acha por e-mail minúsculo, senão por nome normalizado; cria parte pessoa se não houver; `INSERT OR IGNORE` do vínculo `encarregado` no projeto).
  - `visaoDoEncarregado(...)` passa a devolver `encarregados: { id: string; nome: string; email: string | null }[]`.

- [ ] **Step 1: Testes que falham** (`test/dpo-encarregado.test.ts`):
  - `ehDpo({ job_title: 'DPO' })`, `ehDpo({ job_title: 'Encarregada de Dados' })`, `ehDpo({ role_category: 'dpo', job_title: 'x' })` → true; `ehDpo({ job_title: 'CISO' })` → false; `ehDpo({ job_title: 'Diretor de Operações' })` → false.
  - `POST /api/v1/projects/P/governance` `{ name: 'Rita Exemplo', email: 'Rita@Cliente.com', role_category: 'executivo', job_title: 'DPO' }` → existe parte pessoa com e-mail `rita@cliente.com` e vínculo `encarregado` no projeto; repetir o POST não duplica.
  - Membro "CISO" não ganha vínculo.
  - Migration 0062 aplicada com um membro DPO pré-existente cria a parte/vínculo; aplicada duas vezes não duplica (`INSERT OR IGNORE` + `NOT EXISTS`).
  - `GET /api/v1/projects/P/encarregado` (projeto com privacy) devolve `encarregados: [{ nome: 'Rita Exemplo', … }]`; num projeto sem encarregado, `prioridades` contém item alto com texto `Nenhum encarregado indicado`.
  - jsdom (`encarregado-view.test.js`): a tela mostra "Encarregado: Rita Exemplo"; sem encarregado mostra o botão `[data-action="abrirIndicarEncarregado"]` (para consultor), que lista partes `pessoa` e, ao confirmar, envia `POST /api/v1/projects/p9/partes/<id>/vinculos` com `{ papel: 'encarregado', alvo_tipo: 'projeto', alvo_id: 'p9' }` (conferir o schema de vínculo em `src/routes/nucleo.ts:175-190` e usar exatamente os campos dele).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar**
  - Migration 0062 (mesmo SQL na doc do `migrations/README.md`):
```sql
-- 0062: o DPO cadastrado na governança do n.iso vira o encarregado do n.privacy (vínculo 'encarregado').
INSERT INTO partes (id, project_id, tipo, nome, email)
SELECT lower(hex(randomblob(16))), g.project_id, 'pessoa', trim(g.name), lower(trim(g.email))
  FROM project_governance g
 WHERE g.project_id IS NOT NULL
   AND (g.role_category = 'dpo' OR lower(g.job_title) LIKE '%dpo%' OR lower(g.job_title) LIKE '%encarregad%')
   AND NOT EXISTS (SELECT 1 FROM partes p WHERE p.project_id = g.project_id AND p.tipo = 'pessoa'
                     AND ((g.email IS NOT NULL AND lower(trim(p.email)) = lower(trim(g.email))) OR lower(trim(p.nome)) = lower(trim(g.name))));

INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id)
SELECT lower(hex(randomblob(16))), g.project_id, p.id, 'encarregado', 'projeto', g.project_id
  FROM project_governance g
  JOIN partes p ON p.project_id = g.project_id AND p.tipo = 'pessoa'
   AND ((g.email IS NOT NULL AND lower(trim(p.email)) = lower(trim(g.email))) OR lower(trim(p.nome)) = lower(trim(g.name)))
 WHERE g.role_category = 'dpo' OR lower(g.job_title) LIKE '%dpo%' OR lower(g.job_title) LIKE '%encarregad%';
```
    (`LIKE '%dpo%'` é mais largo que o regex do código; `-- ponytail: casa 'dpo' dentro de outra palavra; não há cargo assim hoje`.)
  - Governance POST: depois de gravar o membro, `if (ehDpo(body)) await garantirEncarregado(db, projectId, { nome: body.name, email: body.email ?? null })`.
  - `importarPartes`: `ehDpo(g) ? 'encarregado' : 'responsavel'` (e o SELECT passa a trazer `job_title`).
  - `visaoDoEncarregado`: consulta `SELECT p.id, p.nome, p.email FROM parte_vinculos v JOIN partes p ON p.id = v.parte_id WHERE v.project_id = ? AND v.papel = 'encarregado' AND v.alvo_tipo = 'projeto' AND p.status = 'ativa'`; prioridade `p('alta', encarregados.length ? 0 : 1, () => 'Nenhum encarregado indicado (LGPD, art. 41)', 'encarregado')` no padrão das outras.
  - `encarregado.js`: linha "Encarregado: <nomes>" no topo; botão e janela de indicar.
- [ ] **Step 4: Rodar e ver passar**; `test/encarregado.test.ts test/nucleo-partes.test.ts test/assinatura-governanca.test.ts test/governanca-lider-unico.test.ts`.
- [ ] **Step 5: Commit** `feat(nucleo): DPO da governança é o encarregado do n.privacy (migration 0062)`

---

### Task 8: Incidente no núcleo, com CAPA

**Files:**
- Create: `migrations/0063_capa_do_incidente.sql`
- Modify: `src/modulos.ts` (`incidentes: 'nucleo'`, mover para o bloco do núcleo e ajustar o comentário do topo), `schema.sql` (`corrective_actions.incidente_id`), `src/helpers.ts` (`TABELA_DA_REF` + tipo `RefDeProjeto` ganham `incidente_id: 'incidentes'`), `src/routes/capa.ts` (as duas listas de `refForaDoProjeto` e `setParcial` incluem `incidente_id`), `src/schemas/resources.ts` (`incidente_id` opcional em `capaUpdateSchema`), `frontend/login.html` (item `nav-incidentes`), `frontend/src/produto.js` (`SO_ISO` + `'nav-incidentes'`), `frontend/src/views/titular.js`, `frontend/src/globals.js` (ação `abrirIncidentesIso`)
- Test: `test/incidente-nucleo.test.ts` (novo), `test/modulos-produto.test.ts` (atualizar a expectativa de `incidentes`), `frontend/test/titular-view.test.js` (ou o arquivo que já testa `titular.js`; conferir com `ls frontend/test | grep -i titular`)

**Interfaces:**
- Produces: `corrective_actions.incidente_id TEXT REFERENCES incidentes(id) ON DELETE SET NULL`; `window.abrirIncidentesIso()` (põe `S.titularAba = 'incidentes'` e `navigate('titular')`); `window.abrirCapaDoIncidente(projectId, incidenteId)`.

- [ ] **Step 1: Testes que falham**:
  - Projeto só n.iso (sem `habilitarPrivacy`): `POST /api/v1/projects/P/incidentes` → 201; `PUT …/:id/risco`, `POST …/:id/comunicacoes`, `POST …/:id/encerrar` funcionam; `GET /titular-pedidos` continua 403.
  - `POST /api/v1/projects/P/capa` `{ title: 'Tratar incidente', incidente_id: <id> }` → 201 e a linha guarda `incidente_id`; `incidente_id` de outro projeto → 400 `incidente_id inexistente ou de outro projeto`.
  - Apagar o incidente (`DELETE FROM incidentes` no teste) deixa a CAPA com `incidente_id` nulo.
  - jsdom: com `produtoAtual` = iso (`location` padrão do jsdom é localhost; usar `sessionStorage.setItem('niso_produto','iso')`), `renderTitular` com `S.titularAba='incidentes'` mostra título "Incidentes", só a aba de incidentes, e na janela do incidente o botão `[data-action="abrirCapaDoIncidente"]` quando o projeto tem `iso`; `abrirCapaDoIncidente` envia `POST /api/v1/projects/p9/capa` com `{ title: 'Incidente <protocolo>: <titulo>', description: <descricao>, incidente_id }`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar**
  - `migrations/0063_capa_do_incidente.sql`:
```sql
-- 0063: CAPA pode nascer de um incidente (n.iso, A.5.26/A.5.27). O incidente passa a ser do núcleo.
ALTER TABLE corrective_actions ADD COLUMN incidente_id TEXT REFERENCES incidentes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_capa_incidente ON corrective_actions(incidente_id);
```
  - `login.html`: novo `<div class="sidebar-nav" id="nav-incidentes" data-action="abrirIncidentesIso">Incidentes</div>` logo depois de `nav-capa`, no mesmo grupo e com a mesma marcação dos vizinhos.
  - `titular.js`: `const soIncidentes = produtoAtual() === 'iso';` → título `Incidentes`, `ABAS` reduzido a `{ incidentes: … }` e aba forçada; na janela do incidente, botão "Abrir CAPA" quando `temProduto(proj, 'iso')`.
- [ ] **Step 4: Rodar e ver passar**; `test/modulos-produto.test.ts test/titular.test.ts` (ou equivalente) e a suíte do frontend.
- [ ] **Step 5: Commit** `feat(incidentes): incidente vira cadastro do núcleo, com CAPA no n.iso (migration 0063)`

---

### Task 9: Titular numa trilha só

**Files:**
- Modify: `src/schemas/domain.ts` (`identificadorSchema` ganha `pedido_id` opcional), `src/routes/data-subject.ts` (POST `/erase`), `frontend/src/views/titular.js` (janela do pedido)
- Test: `test/data-subject.test.ts` (ou o arquivo que testa `/data-subject`; conferir com `git grep -l "data-subject/erase" -- test`), `frontend/test/titular-view.test.js`

**Interfaces:**
- Consumes: `GET /api/v1/projects/:p/data-subject?identificador=`, `POST /api/v1/projects/:p/data-subject/erase` `{ identificador, justificativa, pedido_id? }`.
- Produces: `window.localizarDadosDoTitular(projectId, pedidoId)`, `window.eliminarDadosDoTitular(projectId, pedidoId)`.

- [ ] **Step 1: Testes que falham**:
  - `erase` com `pedido_id` do projeto: 200 e o `audit_logs.details` da `lgpd.titular.eliminacao` contém o protocolo do pedido.
  - `pedido_id` de outro projeto → 400 `pedido_id inexistente ou de outro projeto`; pedido inexistente idem.
  - jsdom: pedido com `titular_contato: 'ana@exemplo.com'` mostra "Localizar dados", que chama `GET …/data-subject?identificador=ana%40exemplo.com` e lista `total_registros`; pedido `tipo='anonimizacao_bloqueio_eliminacao'` mostra também "Eliminar dados", com justificativa pré-preenchida `Pedido <protocolo>` e confirmação na própria janela antes do POST com `pedido_id`; para `org_user` (sem permissão em data-subject) os botões não aparecem (papéis aceitos pela rota: `platform_admin`, `consultor`, `org_admin`).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar**: no `/erase`, se `pedido_id`, `SELECT protocolo FROM titular_pedidos WHERE id = ? AND project_id = ?` (400 se não achar) e acrescentar ` (pedido ${protocolo})` aos detalhes do log. Sem tabela nova.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** `feat(titular): busca e eliminação de dados a partir do pedido do titular`

---

### Task 10: Painel "ponto de partida"

**Files:**
- Create: `src/services/ponto-de-partida.ts`, `src/routes/ponto-de-partida.ts`, `frontend/src/views/ponto-de-partida.js`
- Modify: `src/index.ts` (montar em `/api/v1/projects/:projectId/ponto-de-partida`), `src/modulos.ts` (`'ponto-de-partida': 'nucleo'`), `frontend/src/views/dashboard.js` (cartão no topo, n.iso), `frontend/src/views/encarregado.js` (cartão no topo, n.privacy), `frontend/src/main.js` (import da view nova), `src/openapi.ts` se ele listar as rotas (conferir `test/contrato-tela-api.test.ts`)
- Test: `test/ponto-de-partida.test.ts` (novo), `frontend/test/ponto-de-partida.test.js` (novo)

**Interfaces:**
- Produces:
```ts
export interface PontoDePartida {
  cadastro: { tratamentos: number; dpias: number; documentos_vigentes: number; evidencias_validas: number; itens: number;
              terceiros: number; encarregado: boolean; incidentes: number; treinamentos_concluidos: number };
  cobertura: { fonte: 'lgpd' | 'anpd'; total: number; cobertos: number; parciais: number; lacunas: number }[];
  iso_ajudados: { requisito_id: string; referencia: string; titulo: string; por: string[] }[]; // por = referências LGPD/ANPD cobertas
}
export async function pontoDePartida(db: D1Database, projectId: string): Promise<PontoDePartida>;
```
  `window.renderPontoDePartida(container, projectId, produto)`.

- [ ] **Step 1: Testes que falham**:
  - Projeto com: 2 `ropa_records`, 1 DPIA, 1 documento vigente + 1 rascunho, 1 evidência `conforming` sem validade + 1 vencida, 1 parte organização com vínculo `terceiro`, encarregado indicado, 1 incidente, 2 treinamentos (1 `Completed`). `cadastro` bate exatamente (`documentos_vigentes: 1`, `evidencias_validas: 1`, `treinamentos_concluidos: 1`, `encarregado: true`).
  - Catálogo semeado; documento vigente ligado a `lgpd:art37`; mapeamento `iso27001:2022:A.5.9 → lgpd:art37` validado: `iso_ajudados` contém `iso27001:2022:A.5.9` com `por: ['art. 37']`. Com o mesmo mapeamento ainda `proposto`, não contém.
  - `cobertura` traz `lgpd` e `anpd` com `total` igual ao número de requisitos da fonte.
  - Funciona em projeto só n.iso e só n.privacy (faixa `nucleo`); usuário de outro projeto recebe 403/404 como as demais rotas de projeto.
  - jsdom: `renderPontoDePartida(c, 'p9', 'iso')` mostra a lista "A privacidade já adianta estes controles" com `A.5.9`; com `'privacy'` mostra "Cobertura LGPD: X de Y"; números vindos da API escapados.
  - jsdom: Dashboard (n.iso) e Encarregado (n.privacy) chamam `GET /api/v1/projects/p9/ponto-de-partida` e nenhum dos dois chama rota da faixa do outro produto.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar**:
  - Contagens num `db.batch` de `SELECT COUNT(*)`; `evidencias_validas` = `evaluation_status = 'conforming' AND (valido_ate IS NULL OR valido_ate >= date('now'))`; `terceiros` = partes organização ativas com vínculo `terceiro` no projeto; treinamentos concluídos = `status = 'Completed'`.
  - `cobertura`: para cada fonte, `lacunasDaFonte` e o resumo (mesma conta de `GET /requisitos/lacunas`, reaproveitar a função de resumo se existir em `src/routes/requisitos.ts:179-186`; senão extrair para `requisitos.ts` e usar nos dois lugares).
  - `iso_ajudados`: requisitos LGPD/ANPD com `situacao === 'coberto'` por documento ou evidência (não por controle, para não contar a ISO como ajudando a si mesma) → `SELECT m.de_id, r.referencia, r.titulo FROM requisito_mapeamentos m JOIN requisitos r ON r.id = m.de_id WHERE m.para_id IN (…) AND m.estado = 'validado_juridico' AND m.tipo IN ('equivalente','parcial')`, agrupando `por`.
  - Rota GET só lê; nada de cache.
- [ ] **Step 4: Rodar e ver passar**; `test/modulos-produto.test.ts test/contrato-tela-api.test.ts`.
- [ ] **Step 5: Commit** `feat(produtos): painel de ponto de partida com o que o outro produto já entregou`

---

### Task 11: Documentação, suíte completa e PR

**Files:**
- Modify: `AGENTS.md` (bloco "n.iso e n.privacy são PRODUTOS separados": fornecedor=terceiro, DPO=encarregado, incidente no núcleo, catálogo LGPD/ANPD com mapeamento proposto, painel; contagens de migrations e testes com o comando ao lado), `README.md` (contagens), `CHANGELOG.md` (`## [Não publicado]` → `### Adicionado`), `migrations/README.md` (seções 0061, 0062, 0063 com a conferência pós-aplicação)

- [ ] **Step 1: Medir** e colar os números: `ls migrations/*.sql | tail -1`, `ls migrations/*.sql | wc -l`, `ls test/*.test.ts | wc -l`, `ls frontend/test/*.test.js | wc -l`, `git grep -ahoE ': any\b|as any\b|<any>' -- 'src/*.ts' ':!*.test.ts' | wc -l`.
- [ ] **Step 2: Atualizar os docs** com esses números. `migrations/README.md`, conferência de cada uma:
  - 0061: `SELECT COUNT(*) FROM vendors WHERE parte_id IS NULL` = 0; `SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'vendor_%'` = 2 linhas.
  - 0062: `SELECT COUNT(*) FROM parte_vinculos WHERE papel='encarregado'` ≥ número de membros DPO.
  - 0063: `PRAGMA table_info(corrective_actions)` mostra `incidente_id`.
  - Ordem de produção: depois da 0060 (#332).
- [ ] **Step 3: Verificação completa**: `npx tsc --noEmit`, `npx vitest run --exclude "nISO/**"`, `cd frontend && npx vitest run && npm run build`. Falhas conhecidas desta máquina (`migration-0021`, `reconcile-prod`, `public-otp`) são conferidas isoladas; qualquer outra falha bloqueia.
- [ ] **Step 4: Conferir atribuição** em todas as mensagens: `git log feat/nprivacy-casca..HEAD --format=%B | grep -iE "co-authored|generated with|claude"` → vazio.
- [ ] **Step 5: Commit e PR**: `docs: integração entre n.iso e n.privacy (0061–0063)`; `git push -u origin feat/integracao-produtos`; `gh pr create --base feat/nprivacy-casca` com título `feat(produtos): n.iso e n.privacy com cadastro único e ponto de partida` e corpo em português (o que muda por produto, as três migrations e a ordem de rollout, o que fica com o dono: validar mapeamentos, carregar catálogo em produção). Sem rodapé de ferramenta. Quando o #332 for mergeado, trocar a base para `main`.
