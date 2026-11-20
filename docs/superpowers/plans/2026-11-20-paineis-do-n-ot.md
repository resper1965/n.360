# Painéis do n.ot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao n.ot uma tela "Painel" (topo, régua comum, "O que fazer" e quadros Por site, Conformidade RO-CB, Desvios e exposição, Vencimentos de 90 dias, Fornecedores e riscos de OT), servida pelo `GET /projects/:id/painel?modulo=ot` que já existe, com a visão de cada papel decidida no servidor.

**Architecture:** Derivação pura, sem tabela e sem rota nova (PR 1 a 4). A tela é o mesmo `renderPainel` do n.iso e do n.privacy, com um ramo `ot` em `telaDoModulo`. No servidor, `blocoOt` passa a saber o papel (`gestor | equipe | tecnico | leitor`) e monta, **só quando o pedido é `?modulo=ot`** (flag `detalheOt` vinda da rota), os quadros em `src/services/painel-ot-quadros.ts`: um `db.batch` de consultas agrupadas por site mais o `db.batch` de `conformidadePorSite`, nunca uma consulta por site. `respostaDoOt` corta a resposta por papel; o Início do n.360 (sem `?modulo`) não muda.

**Tech Stack:** Cloudflare Worker (Hono) + D1, vitest (`@cloudflare/vitest-plugin` no backend, jsdom no frontend), SPA vanilla JS (Vite).

**Spec:** `docs/superpowers/specs/2026-11-19-paineis-do-n-ot-design.md`, aprovado pelo dono com as **recomendações** da tabela "Perguntas ao dono": (1) Gestor ARCiber vê como a equipe só em `?modulo=ot`; (2) o Painel substitui o Início do n.ot só depois do PR 5; (3) cliente leitor = frase, régua sem "Abrir" e resumo de Conformidade em números; (4) técnico = régua e Por site dos sites dele; (5) agregados de ativos sim; (6) plano por onda = opção A (etiqueta na ação), no PR 5; (7) desvios por mês de primeira detecção; (8) Acessos não entram no Painel. Toda referência arquivo:linha deste plano foi reconferida no worktree `/home/user/wt-plano`, `origin/main` `c2cb93d` (o spec foi escrito sobre `c0badf9`; as diferenças estão em "Reconferido contra o spec", no fim).

## Global Constraints

- **P0-1/P0-2:** o n.ot só existe para quem tem `ot` na pessoa **e** no projeto; agente MCP e chave de API nunca (`semOt` em `src/routes/painel.ts:28-29`; middleware `src/routes/ot.ts:37-43`). Quem não tem `ot` não aprende que o n.ot existe: **nenhuma chave, contagem, texto ou consulta a `ot_*`** (`test/programa-rota.test.ts:40-46,120-126`; `frontend/test/painel-regua.test.js:23-28,82-92`).
- **P0-4:** todo número do n.ot sai de `sitesPermitidos` (`src/services/ot-inventario.ts:64-70`). O técnico (`org_user`) só vê os sites dele e **nenhum total do projeto** que denuncie os outros.
- **P0-6:** nunca IP, MAC, nome de ativo ou de sonda em painel, nem mascarados (`src/services/painel-ot.ts:9-12`). Rótulo de vencimento é nome de site ou código de requisito.
- **O Início do n.360 continua sem contagem de ativos ou de achados**: os campos novos (`por_site`, `conformidade`, `desvios`, `vencimentos` do n.ot, `fornecedores`, `riscos` do n.ot) só saem com `?modulo=ot`.
- **`test/onda2-numeros.test.ts` NUNCA é editado** (`git diff --stat c2cb93d -- test/onda2-numeros.test.ts` vazio em todo commit) e roda verde em todo task que toca `src/services/painel*.ts`.
- **Mediana do painel < 300 ms** (`test/painel.test.ts:316-340`) segue verde em todo task de servidor.
- **Nenhuma rota some; nenhuma rota nova nos PRs 1 a 4.** Se algum task criar rota (não deve), ela é classificada em `src/modulos.ts` e coberta por `test/contrato-isolamento-org.test.ts` e `test/contrato-tela-api.test.ts`. O agente (MCP) não perde nada.
- **Nada de nome de cliente ou de pessoa real** em código, teste, CHANGELOG ou plano (use "SE Norte Exemplo", "Fornecedora Exemplo", `@cliente.teste`, `@ness.lat`).
- **AGENTS.md sem acentos**; CHANGELOG e telas com acentos.
- **TDD:** teste que falha primeiro, depois o mínimo de código.
- **Uma branch por PR:** `claude/paineis-ot-1` … `claude/paineis-ot-4`, cada uma a partir da `origin/main` com o PR anterior mergeado.
- **`git add` só dos caminhos listados em Files do task**; nunca `git add -A`/`git add .`; antes do commit, `git diff --cached --stat` mostra só esses caminhos.
- **Nunca rodar a suíte inteira do backend** no task: só os arquivos do passo de verificação e `npx tsc --noEmit`. A suíte inteira é do `scripts/ci/gate.sh`.
- **Cada correção ou regra de segurança tem mutação:** o passo "Mutação" quebra a regra de propósito, mostra o teste falhando e desfaz a quebra (Edit inverso; `git diff` volta a ser o de antes).
- **Antes de cada merge:** `bash scripts/ci/gate.sh` verde na máquina do dono e o status `gate/local` gravado por ele (`bash scripts/ci/ship.sh <PR>`, `AGENTS.md:1050-1054`).
- **[revisor opus]:** todo task que toca regra P0 é revisado em modelo forte (opus): Tasks 1, 2, 3, 6 e 8.
- **Frontend:** `data-action` (delegação), nada de handler nem estilo inline novo (CSP), `escapeHTML` em todo dado do servidor, vazio com texto e nunca zero falso (`frontend/src/views/painel.js:157-158`).
- **Migrations: nenhuma nos PRs 1 a 4.** O PR 4 exige `0115_ot_referencias` e `0116_ot_fornecedores` aplicadas em produção (o dono informou que estão; o Task 9 confere antes do merge).
- Comandos: backend `npx vitest run <arquivos>`; frontend `cd frontend && npx vitest run <arquivos>`; build `cd frontend && npm run build`; tipos `npx tsc --noEmit`; contrato `npm run openapi`; portão `bash scripts/ci/gate.sh` (só na máquina do dono).

## Preflight (antes de cada PR e ao retomar)

- [ ] `git fetch origin && git status --short && git log --oneline -1 origin/main`: árvore limpa; `git merge-base --is-ancestor c2cb93d origin/main` responde 0.
- [ ] Branch do PR: `git switch -c claude/paineis-ot-<N> origin/main` (N = 1, 2, 3 ou 4). O PR N começa só depois do PR N-1 mergeado (`git cat-file -e origin/main:<arquivo novo do PR anterior>` responde).
- [ ] **Retomar:** `git log --oneline origin/main..HEAD` lista os tasks feitos pelo assunto do commit (está no último passo de cada task). Comece pelo primeiro task cujo commit não aparece. Diff não commitado: `git diff --stat`; é do task em curso (continue) ou lixo (descarte só os caminhos daquele task).
- [ ] Ambiente: `ls node_modules/.bin/vitest frontend/node_modules/.bin/vitest` (se faltar: `npm ci` e `cd frontend && npm ci`).
- [ ] Task que toca o frontend: rode os arquivos de teste do frontend listados (inteiros) e `cd frontend && npm run build` (esperado: `✓ built in`).

## File Structure

- `frontend/src/ot-navegacao.js`: `TELAS_OT` ganha `painel` (endereço `/ot?ot=painel`).
- `frontend/src/views/ot.js`: `TITULOS.painel`, `MONTAR.painel` (chama `renderPainel(c, null, a, 'ot')`), item ativo do menu.
- `frontend/login.html`, `frontend/src/produto.js`: item `nav-ot-painel` (em `SO_OT` e em `atualizarItemOt`).
- `frontend/src/views/painel.js`: ramo `m === 'ot'` em `telaDoModulo` (`telaDoOt`) e os quadros do n.ot; `reguaDe` dá "Abrir" ao Gestor no n.ot.
- `frontend/src/views/painel-graficos.js`: `graficoCobertura` e `graficoPedidos` aceitam rótulos (padrão inalterado).
- `src/routes/painel.ts`: passa `detalheOt: pedido === 'ot'`.
- `src/services/painel.ts`: `QuemPede.detalheOt`, `blocoOt(…, detalhe)`, `respostaDoOt` no laço dos módulos; `mesesAtras` sai para `hoje.ts`.
- `src/services/painel-ot.ts`: papel, `veSondas` (`podeVerCompleto`), `porSite`, `respostaDoOt`, chamada a `quadrosOt`.
- `src/services/painel-ot-quadros.ts` (novo): `quadrosOt`, `vencimentosDe`.
- `src/services/ot-avaliacao.ts`: `situacaoNaOrganizacao` e `resumoDoAssessment` puros (a tela do assessment e o Painel contam com a mesma função).
- `src/services/programa.ts`: `TEXTO_OT` exportado. `src/services/hoje.ts`: `mesesAtras`.
- Testes novos: `frontend/test/painel-ot.test.js`, `test/painel-ot-papeis.test.ts`, `test/painel-ot-quadros.test.ts`, `test/painel-ot-fornecedores.test.ts`.

---

## PR1 — Tela Painel do n.ot (só front, sem migration)

### Task 1: Aba "Painel" no n.ot com topo, régua e "O que fazer" de hoje **[revisor opus]**

**Files:**
- Modify: `frontend/src/ot-navegacao.js:3`, `frontend/src/views/ot.js:17,32-33,71`, `frontend/login.html:299-303`, `frontend/src/produto.js:33,466`, `frontend/src/views/painel.js:10,202-206`
- Modify (testes que travam a lista do menu): `frontend/test/ot-navegacao.test.js:30`, `frontend/test/ot-modulo.test.js:34,47-69,134-136`, `frontend/test/produto.test.js:103,121`
- Create: `frontend/test/painel-ot.test.js`
- Modify (docs): `CHANGELOG.md` (seção "Não publicado")

**Interfaces:**
- Consumes: `renderPainel(c, h, a, entrada)` (`frontend/src/views/painel.js:483`); `GET /api/v1/projects/:id/painel?modulo=ot` como está hoje (equipe: `modulos.ot = { saude, numeros, comecando, fazer, cobertura: [], vencimentos: [], riscos: [], passos }`; cliente: `{ saude, numeros, comecando }`; `src/services/painel.ts:491-494`).
- Produces: subtela `painel` do n.ot (`/ot?ot=painel`, `window.otTela('painel')`); item de menu `#nav-ot-painel`; função interna `telaDoOt(d, b)` em `painel.js` (os PRs 2 a 4 a reescrevem inteira).

- [ ] **Step 1: Escrever o teste da tela que falha** — `frontend/test/painel-ot.test.js`:

```js
// Painel do n.ot (spec 2026-11-19-paineis-do-n-ot): a tela desenha só o que o `GET /painel?modulo=ot` mandou. api() REAL; só o
// fetch é dublado. Quadro sem dado não aparece; nada de zero que pareça "em dia".
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir, resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));
vi.mock('../src/produto.js', async (original) => ({ ...(await original()), irPara: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { renderPainel } from '../src/views/painel.js';

const ETAPAS = [['comecar', 'Começar'], ['levantar', 'Levantar'], ['avaliar', 'Avaliar'], ['tratar', 'Tratar'], ['operar', 'Operar']]
    .map(([id, rotulo]) => ({ id, rotulo, feitos: 0, total: 2 }));
const OT = { etapa: 'levantar', feitos: 0, total: 2, proximo: { texto: 'Revisar os achados do levantamento', tela: 'ot', aba: 'sites' }, etapas: ETAPAS };
const EM_DIA = { tom: 'ok', rotulo: 'Em dia', frase: 'Nada vencido nem vencendo nos próximos 7 dias.', apoio: '' };
const ATENCAO = { tom: 'semana', rotulo: 'Atenção', frase: '1 desvio aberto.', apoio: '' };
const FAZER = [{ grupo: 'semana', quando: 'Nesta semana', texto: '1 desvio aberto', contexto: 'O sensor viu o que não está na base aprovada', acao: 'Ver os desvios', tela: 'ot', aba: 'sites', modulo: 'ot' }];
const painelOt = (visao, bloco, saude = ATENCAO) => ({ gerado_em: '2026-11-20T10:00:00Z', visao, modulos_pedidos: ['ot'], empresa: null, encarregados: [],
    programa: { estado: 'implantacao', desde: null, rotulo: 'Em implantação', etapas: { ot: OT } }, saude, modulos: { ot: { saude, comecando: false, ...bloco } } });
const EQUIPE = { numeros: [['0 de 2', 'sites em operação'], ['1', 'desvios abertos']], fazer: FAZER, cobertura: [], vencimentos: [], riscos: [], passos: [] };
const el = (id) => document.getElementById(id);
const montar = () => { document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>'; };
const abrir = async (corpo) => { const f = servir({ 'GET /api/v1/projects/p9/painel': corpo }); montar(); await renderPainel(el('c'), el('h'), el('a'), 'ot'); return f; };

beforeEach(() => {
    S.token = 'tok'; S.user = { id: 'u1', role: 'consultor', modulos: ['ot'] };
    S.activeProject = { id: 'p9', client_name: 'Exemplo', modulos: ['ot'] }; S.projects = [S.activeProject]; S.painel = {}; S.view = 'ot';
    window.render = vi.fn(); window.navigate = vi.fn(); window.ehEquipeNess = () => true;
    history.replaceState(null, '', '/ot?ot=painel');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); history.replaceState(null, '', '/'); delete window.ehEquipeNess; });

describe('Painel do n.ot: equipe', () => {
    it('pede ?modulo=ot e desenha a régua do n.ot com "Abrir", "O que fazer agora" e os números', async () => {
        const f = await abrir(painelOt('equipe', EQUIPE));
        expect(f.mock.calls.map(([u]) => String(u))).toEqual([expect.stringContaining('/api/v1/projects/p9/painel?modulo=ot')]);
        expect(el('c').querySelector('.pn-regua').getAttribute('aria-label')).toBe('Jornada do n.ot');
        expect(el('c').querySelector('.pn-regua-prox button')).not.toBeNull();
        expect(el('pn-fazer').closest('section').textContent).toContain('1 desvio aberto');
        expect(el('pn-ot-num').closest('section').textContent).toContain('sites em operação');
    });
    it('quadro sem dado não aparece: nada de cobertura, mapa nem vencimentos vazios', async () => {
        await abrir(painelOt('equipe', EQUIPE));
        for (const id of ['pn-cob', 'pn-mapa-t', 'pn-venc']) expect(el(id), id).toBeNull();
    });
    it('projeto começando: "Primeiros passos" e nenhum número', async () => {
        await abrir(painelOt('equipe', { ...EQUIPE, comecando: true, fazer: [], passos: [{ texto: 'Cadastrar o primeiro site', contexto: 'O inventário do n.ot começa pelo site', feito: false, acao: 'Abrir o n.ot', tela: 'ot' }] }));
        expect(el('c').textContent).toContain('Primeiros passos');
        expect(el('pn-ot-num')).toBeNull();
    });
});

describe('Painel do n.ot: cliente', () => {
    it('lê a frase e a régua, sem "Abrir", sem "O que fazer" e sem números de desvio', async () => {
        await abrir(painelOt('cliente', { numeros: [['0 de 2', 'sites em operação'], ['1', 'desvios abertos']] }, EM_DIA));
        expect(el('c').querySelector('.pn-regua')).not.toBeNull();
        expect(el('c').querySelector('.pn-regua-prox button')).toBeNull();
        expect(el('pn-fazer')).toBeNull();
        expect(el('pn-ot-num')).toBeNull();
        expect(el('c').textContent).not.toMatch(/desvio/i);
    });
    it('403 do servidor: a tela "não habilitado", sem quebrar', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => resposta({ error: 'Forbidden' }, 403)));
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'ot');
        expect(el('c').textContent).toContain('O n.ot não está habilitado neste projeto');
    });
});
```

- [ ] **Step 2: Acrescentar o teste da subtela e do menu (falham)** — em `frontend/test/ot-navegacao.test.js:30` troque a lista por `['inicio', 'painel', 'sites', 'site', 'assessment', 'relatorios', 'fornecedores', 'acessos']` e acrescente, no mesmo `describe`:

```js
    it('?ot=painel abre o Painel do n.ot', () => {
        expect(lerEndereco({ pathname: '/ot', search: '?ot=painel' })).toMatchObject({ tela: 'painel', site: null });
    });
```

  Em `frontend/test/ot-modulo.test.js:34` a lista vira `['nav-ot-inicio', 'nav-ot-painel', 'nav-ot-sites', 'nav-ot-assessment', 'nav-ot-relatorios', 'nav-ot-fornecedores', 'nav-ot-acessos']`. No teste "fora do /ot ficam escondidos mesmo com o módulo" (linhas 47-69), logo depois de **cada** `expect(el('nav-ot-inicio').hidden).toBe(<v>)`, acrescente `expect(el('nav-ot-painel').hidden).toBe(<v>);` com o mesmo `<v>` (P0-1 do menu: projeto **e** pessoa). Na linha 135, `NAV` passa a ser `['inicio', 'painel', 'sites', 'assessment', 'relatorios', 'acessos']`, e no `describe('casca por subtela')` acrescente:

```js
    it('?ot=painel desenha o Painel do n.ot pelo /painel?modulo=ot e marca o item do menu', async () => {
        const SAUDE = { tom: 'plano', rotulo: 'Começando', frase: 'f', apoio: '' };
        const f = servir({ 'GET /api/v1/projects/p9/painel': { gerado_em: '2026-11-20T10:00:00Z', visao: 'equipe', modulos_pedidos: ['ot'], empresa: null, encarregados: [],
            programa: { estado: 'comecando', desde: null, rotulo: 'Começando', etapas: {} }, saude: SAUDE,
            modulos: { ot: { saude: SAUDE, numeros: [], comecando: true, fazer: [], passos: [] } } } });
        S.painel = {};
        document.body.innerHTML = `<h1 id="h"></h1><div id="a"></div><div id="c"></div>${NAV}`;
        await window.otTela('painel'); await window.renderOt(el('c'), el('h'), el('a'));
        expect(el('h').textContent).toBe('Painel');
        expect(el('nav-ot-painel').classList.contains('active')).toBe(true);
        expect(location.search).toBe('?ot=painel');
        expect(f.mock.calls.some(([u]) => String(u).includes('/painel?modulo=ot'))).toBe(true);
    });
```

  Em `frontend/test/produto.test.js:103` a lista `ids` ganha `'nav-ot-painel'` depois de `'nav-ot-inicio'`; depois da linha 121 acrescente `expect(el('nav-ot-painel').hidden).toBe(false);`.

- [ ] **Step 3: Rodar e ver falhar**
  Run: `cd frontend && npx vitest run test/painel-ot.test.js test/ot-navegacao.test.js test/ot-modulo.test.js test/produto.test.js`
  Expected: FAIL — `pn-ot-num` nulo / `pn-cob`… (o ramo `ot` ainda cai no desenho do n.iso), `TELAS_OT` sem `painel`, `#nav-ot-painel` nulo.

- [ ] **Step 4: Subtela, menu e casca**

  `frontend/src/ot-navegacao.js:3`:

```js
export const TELAS_OT = ['inicio', 'painel', 'sites', 'site', 'assessment', 'relatorios', 'fornecedores', 'acessos'];
```

  `frontend/src/views/ot.js`: depois da linha 17 (`import { lerEndereco, escreverEndereco } …`) acrescente `import { renderPainel } from './painel.js';`. Linhas 32-33:

```js
const TITULOS = { inicio: 'n.ot · Início', painel: 'Painel', sites: 'Sites', site: 'Site', assessment: 'Assessment RO-CB.BR.01', relatorios: 'Relatórios', fornecedores: 'Fornecedores do n.ot', acessos: 'Acessos e sondas' };
// O Painel do n.ot é o mesmo painel do n.iso e do n.privacy (views/painel.js), pelo `?modulo=ot`; o título fica o desta casca.
const MONTAR = { inicio: montarInicio, painel: (c, a) => renderPainel(c, null, a, 'ot'), sites: montarSites, assessment: montarAssessment, relatorios: montarSaidas, fornecedores: montarFornecedoresOt, acessos: (c, a, p) => montarAcessos(c, a, p) };
```

  Linha 71: a lista do laço passa a ser `['inicio', 'painel', 'sites', 'assessment', 'relatorios', 'fornecedores', 'acessos']`.

  `frontend/login.html`: logo depois do bloco `nav-ot-inicio` (linhas 300-303), acrescente:

```html
            <div class="sidebar-nav" role="link" tabindex="0" id="nav-ot-painel" data-action="otTela" data-args='["painel"]' hidden>
                <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                <span class="sidebar-nav-text">Painel</span>
            </div>
```

  `frontend/src/produto.js:33`: `export const SO_OT = ['nav-ot', 'nav-ot-inicio', 'nav-ot-painel', 'nav-ot-sites', 'nav-ot-assessment', 'nav-ot-relatorios', 'nav-ot-fornecedores', 'nav-ot-acessos'];`. Linha 466: a lista do laço ganha `'nav-ot-painel'` depois de `'nav-ot-inicio'`.

- [ ] **Step 5: O ramo `ot` do painel** — `frontend/src/views/painel.js`. Linha 10: troque "Painel de entrada do n.360, do n.iso e do n.privacy" por "Painel de entrada do n.360, do n.iso, do n.privacy e do n.ot". Logo antes de `/** Entrada de um módulo (n.iso ou n.privacy). */` (linha 202) acrescente:

```js
/**
 * Painel do n.ot (spec 2026-11-19-paineis-do-n-ot). O servidor decide o que cada papel recebe (`?modulo=ot`); aqui só se desenha o que
 * veio. Quadro sem dado não aparece; nunca um zero que pareça "em dia".
 */
function telaDoOt(d, b) {
    const decidir = Array.isArray(d.decisoes) && d.decisoes.length ? [quadro('pn-dec', 'Esperando a sua decisão', listaDecisoes(d.decisoes, '', false))] : [];
    const fazer = Array.isArray(b.fazer) ? [b.comecando ? quadro('pn-passos-t', 'Primeiros passos', passos(b.passos)) : quadro('pn-fazer', 'O que fazer agora', listaFazer(b.fazer, false))] : [];
    const numeros = Array.isArray(b.fazer) && !b.comecando ? [quadro('pn-ot-num', 'O programa em números', figuras(b, false))] : [];
    const esquerda = [...decidir, ...fazer];
    return esquerda.length || numeros.length ? colunas(esquerda, numeros) : '';
}
```

  Em `telaDoModulo`, logo depois de `const topo = …;` (linha 205):

```js
    if (m === 'ot') return `${topo}${telaDoOt(d, b)}`;
```

- [ ] **Step 6: Rodar e ver passar**
  Run: `cd frontend && npx vitest run test/painel-ot.test.js test/ot-navegacao.test.js test/ot-modulo.test.js test/produto.test.js test/painel-regua.test.js test/painel-view.test.js`
  Expected: PASS (todos os arquivos).

- [ ] **Step 7: Mutação (P0-1 do menu)** — em `frontend/src/produto.js:466` tire `'nav-ot-painel'` da lista. Rode `cd frontend && npx vitest run test/ot-modulo.test.js test/produto.test.js`: FAIL em "fora do /ot ficam escondidos mesmo com o módulo…" (o item não aparece com projeto e pessoa com o `ot`) e em "atualizarItemOt: no n.ot mostra os itens do n.ot…". Desfaça a mutação (Edit inverso) e rode de novo: PASS.

- [ ] **Step 8: Build** — `cd frontend && npm run build` → `✓ built in`.

- [ ] **Step 9: CHANGELOG** — em `CHANGELOG.md`, logo abaixo de `## [Não publicado]`, acrescente:

```markdown
### n.ot: Painel (spec 2026-11-19, PR 1)
- **Novo item "Painel" no menu do n.ot**, ao lado do Início: o mesmo painel do n.iso e do n.privacy, com a frase de saúde, a régua das cinco etapas e o "O que fazer agora" do n.ot. Endereço `/ot?ot=painel`. O Início do n.ot continua como está.
- Quem não tem o n.ot no projeto e na conta não vê o item nem a tela.
```

- [ ] **Step 10: Commit**

```bash
git add frontend/src/ot-navegacao.js frontend/src/views/ot.js frontend/login.html frontend/src/produto.js frontend/src/views/painel.js \
  frontend/test/painel-ot.test.js frontend/test/ot-navegacao.test.js frontend/test/ot-modulo.test.js frontend/test/produto.test.js CHANGELOG.md
git diff --cached --stat
git commit -m "feat(ot): tela Painel do n.ot com topo, régua e O que fazer (PR1 dos painéis)"
```

- [ ] **Step 11: Entrega do PR1** — `git push -u origin claude/paineis-ot-1`; abra o PR com `gh pr create --title "n.ot: tela Painel (PR1 dos painéis)" --body "<resumo + testes rodados>"` terminando o corpo com as linhas de atribuição da sessão. O dono roda `bash scripts/ci/ship.sh <PR>` (gate + `gate/local`) antes do merge.

---

## PR2 — Visão do Gestor e quadro Por site (servidor + tela, sem migration)

### Task 2: Papel no `blocoOt`, sondas por `podeVerCompleto` e linhas por site **[revisor opus]**

**Files:**
- Modify: `src/services/painel-ot.ts` (arquivo inteiro abaixo), `src/services/programa.ts:47` (`TEXTO_OT` exportado)
- Modify (teste): `test/painel-ot.test.ts:66-68` (consultoria_admin não designado perde o item de sonda: decisão registrada) e acréscimo de casos

**Decisão registrada (spec, "Não conferido", divergência `podeEditarOt` × `podeVerCompleto`):** o número de sondas do painel (item "sondas paradas", coluna Sonda, credencial vencendo) passa a seguir `podeVerCompleto` (`src/services/ot-inventario.ts:45-51`), o mesmo critério da rota de sonda (`src/routes/ot.ts:889-892`, `SO_COMPLETO_SONDA`). Com `podeEditarOt` (`ot-inventario.ts:27`) o `platform_admin` e o `consultoria_admin` não designado viam "N sondas paradas" com um botão que leva a uma tela que lhes dá 403. Vale também no Início do n.360: o número muda só para esses dois papéis.

**Interfaces:**
- Consumes: `podeVerCompleto(db, u: AtorOt, projectId): Promise<boolean>` (`ot-inventario.ts:45`); `ehPapelCliente(user)` (`src/helpers.ts:206`); `situacaoSensor(referencia, credenciais, agora)` (`src/services/ot-sensor.ts:39`).
- Produces (em `src/services/painel-ot.ts`):
  - `type PapelPainelOt = 'gestor' | 'equipe' | 'tecnico' | 'leitor'`; `type EstadoSonda = 'em_dia' | 'atrasada' | 'parada'`.
  - `type LinhaSiteOt = { id: string; nome: string; fase: string; proximo: string; desvios_abertos: number; revalidar_em: string | null; obra_ate: string | null; sonda?: EstadoSonda | null }` (`sonda` só existe quando a pessoa abre a rota de sonda).
  - `blocoOt(...)` devolve também `papel: PapelPainelOt` e `porSite: LinhaSiteOt[]` (sem consulta nova).
  - `type BlocoOt = Awaited<ReturnType<typeof blocoOt>>`; `respostaDoOt(b: BlocoOt, saude: Saude)` (usada no Task 3).
- Em `src/services/programa.ts`: `export const TEXTO_OT: Record<ProximoPasso, string>`.

- [ ] **Step 1: Escrever os testes que falham** — em `test/painel-ot.test.ts`, troque o teste das linhas 66-68 por:

```ts
  it('consultoria_admin não designado nem admin direto: sem sonda (não abre a rota de sonda), sem lote nem desvio', async () => {
    expect(await textos(consultoriaAdmin)).toEqual([]);
  });

  it('platform_admin não vê sonda parada: o número segue podeVerCompleto, como a rota de sonda', async () => {
    const plat = { id: 'u-p', email: 'p@ness.lat', role: 'platform_admin' };
    const b = await blocoOt(env.DB, 'proj-a', plat, DIA, AGORA);
    expect(b.itens.map((i) => i.texto).join(' ')).not.toContain('sonda');
    expect(b.porSite.every((s) => !('sonda' in s))).toBe(true);
  });

  it('papel e linhas por site: Gestor e técnico; o técnico só o site dele e sem sonda', async () => {
    const g = await blocoOt(env.DB, 'proj-a', gestor, DIA, AGORA);
    expect(g.papel).toBe('gestor');
    expect(g.porSite.map((s) => s.nome)).toEqual(['SE Leste', 'SE Norte', 'SE Sul']);
    expect(g.porSite.find((s) => s.id === 's1')).toMatchObject({ fase: 'em_operacao', proximo: 'Tratar os desvios abertos', desvios_abertos: 1, sonda: 'parada' });
    const t = await blocoOt(env.DB, 'proj-a', tecnico, DIA, AGORA);
    expect(t.papel).toBe('tecnico');
    expect(t.porSite.map((s) => s.id)).toEqual(['s1']);
    expect('sonda' in t.porSite[0]).toBe(false);
    expect((await blocoOt(env.DB, 'proj-a', consultor, DIA, AGORA)).papel).toBe('equipe');
  });
```

- [ ] **Step 2: Rodar e ver falhar**
  Run: `npx vitest run test/painel-ot.test.ts`
  Expected: FAIL — `consultoriaAdmin` ainda recebe `['2 sondas paradas']`; `b.porSite` e `b.papel` indefinidos.

- [ ] **Step 3: `TEXTO_OT` exportado** — `src/services/programa.ts:47`: `const TEXTO_OT: Record<ProximoPasso, string> = {` vira `export const TEXTO_OT: Record<ProximoPasso, string> = {`.

- [ ] **Step 4: Reescrever `src/services/painel-ot.ts`** (conteúdo inteiro):

```ts
import { ehConsultor, ehPapelCliente } from '../helpers';
import { adminDireto } from './organizacao';
import { gestorArciberDireto, podeVerCompleto, sitesPermitidos, TETO_LEITURA_OT, type AtorOt } from './ot-inventario';
import { proximoPassoDe, sitesComZonas411, type Fase } from './ot-fase';
import { TEXTO_OT, type SiteNoPrograma } from './programa';
import { situacaoSensor, type Cred } from './ot-sensor';
import type { ItemFazer, Passo, Proximo, Saude } from './painel';

/**
 * Bloco do n.ot no painel de entrada (onda 0, spec 2026-11-14-onda0). Só contagem de pendência e nome de site: nunca IP, MAC,
 * nome de ativo ou de sonda, nem contagem de ativos ou achados (seria oráculo do inventário). Limitado aos sites da pessoa.
 * No `?modulo=ot` (Painel do n.ot, spec 2026-11-19) a resposta sai por papel em `respostaDoOt`.
 */
export type AtorPainelOt = AtorOt & { client_project_id?: string | null };
/** Quem lê o Painel do n.ot (spec 2026-11-19, decisões 1, 3 e 4): Gestor ARCiber e equipe, técnico por site, leitor. */
export type PapelPainelOt = 'gestor' | 'equipe' | 'tecnico' | 'leitor';
export type EstadoSonda = 'em_dia' | 'atrasada' | 'parada';
/** Uma linha do quadro "Por site": nome de site e contagens (P0-6). `sonda` só existe para quem abre a rota de sonda (`podeVerCompleto`). */
export type LinhaSiteOt = { id: string; nome: string; fase: string; proximo: string; desvios_abertos: number; revalidar_em: string | null; obra_ate: string | null; sonda?: EstadoSonda | null };

const DIA_MS = 86_400_000;
const plural = (q: number, um: string, varios: string) => `${q} ${q === 1 ? um : varios}`;
const exemplos = (nomes: string[]) => nomes.slice(0, 3).join(', ') + (nomes.length > 3 ? ` e mais ${nomes.length - 3}` : '');
const PIOR_SONDA: EstadoSonda[] = ['parada', 'atrasada', 'em_dia'];

export async function blocoOt(db: D1Database, projectId: string, ator: AtorPainelOt, dia: string, agora: Date) {
  const sites = await sitesPermitidos(db, ator, projectId);
  const em7 = new Date(Date.parse(dia) + 7 * DIA_MS).toISOString().slice(0, 10);
  // Mesmo critério da tela do módulo (ot-inicio.js, pendenciasDoPapel). Gestor: org_admin do projeto ou o admin direto designado Gestor ARCiber. Aprova: org_admin, consultor e admin direto; a tela tira o consultoria_admin
  // (o servidor, em podeAprovar, o aceita no projeto designado: divergência registrada, vale a tela). Agente e chave de API nunca.
  const pessoa = ator.agente !== true && !ator.id.startsWith('apikey:');
  const gestor = (ator.role === 'org_admin' && ator.client_project_id === projectId) || (pessoa && await gestorArciberDireto(db, ator, projectId));
  const aprova = pessoa && (ator.role === 'org_admin' || ehConsultor(ator) || await adminDireto(db, ator, projectId));
  // Sondas (item, coluna Sonda, credencial): só quem abre a rota de sonda (`podeVerCompleto`, como `/sites/:sid/sensores` em routes/ot.ts).
  // Com `podeEditarOt`, o platform_admin e o consultoria_admin não designado viam um número que não abrem (spec 2026-11-19).
  const veSondas = await podeVerCompleto(db, ator, projectId);
  const papel: PapelPainelOt = gestor ? 'gestor' : ator.role === 'org_user' ? 'tecnico' : ehPapelCliente(ator) ? 'leitor' : 'equipe';
  const NO_SITE = 'site_id IN (SELECT value FROM json_each(?2))';
  const [sts, cont, sondas, creds, rasc, lotesRev, zonas, conteudo, revalid, desv] = await db.batch([
    db.prepare(`SELECT id, nome, fase, substr(obra_ate, 1, 10) AS obra_ate, base_aprovada_em FROM ot_sites
      WHERE project_id = ?1 AND status = 'ativo' AND id IN (SELECT value FROM json_each(?2)) ORDER BY nome LIMIT ${TETO_LEITURA_OT}`).bind(projectId, sites),
    db.prepare(`SELECT
        (SELECT count(*) FROM ot_desvios WHERE project_id = ?1 AND ${NO_SITE} AND situacao = 'aberto') AS desvios,
        (SELECT count(*) FROM ot_desvios WHERE project_id = ?1 AND ${NO_SITE} AND situacao = 'aberto'
          AND site_id NOT IN (SELECT id FROM ot_sites WHERE project_id = ?1 AND obra_ate IS NOT NULL)) AS desvios_fora_de_obra,
        (SELECT count(*) FROM ot_lotes WHERE project_id = ?1 AND ${NO_SITE} AND status = 'em_revisao' AND criado_por IS NOT ?5) AS lotes,
        (SELECT count(*) FROM ot_desvios WHERE project_id = ?1 AND ${NO_SITE} AND situacao = 'aceito' AND substr(aceito_ate, 1, 10) <= ?3) AS aceites,
        (SELECT count(*) FROM ot_avaliacoes WHERE project_id = ?1 AND proxima_revisao IS NOT NULL AND proxima_revisao < ?4) AS revisoes`)
      .bind(projectId, sites, em7, dia, ator.id),
    db.prepare(`SELECT s.id, s.site_id, s.created_at,
        (SELECT created_at FROM ot_sensor_envios e WHERE e.sensor_id = s.id AND e.situacao = 'concluido' ORDER BY e.created_at DESC LIMIT 1) AS ultimo_envio
      FROM ot_sensores s WHERE s.project_id = ?1 AND s.situacao = 'ativa' AND s.${NO_SITE} LIMIT ${TETO_LEITURA_OT}`).bind(projectId, sites),
    db.prepare(`SELECT sensor_id, expira_em, situacao FROM ot_sensor_credenciais WHERE project_id = ?1 AND situacao = 'ativa' AND expira_em > ?2 LIMIT ${TETO_LEITURA_OT}`)
      .bind(projectId, agora.toISOString()),
    // Para a régua do programa (onda 4): o que `situacaoDoSite` leria site a site, em lote e sobre OS MESMOS sites (mesmo teto), no mesmo batch.
    db.prepare(`SELECT l.site_id, count(*) AS n FROM ot_achados a JOIN ot_levantamentos l ON l.id = a.levantamento_id AND l.project_id = a.project_id
      WHERE a.project_id = ?1 AND l.status = 'ativo' AND a.situacao = 'rascunho' AND a.chave_sensor IS NULL AND l.site_id IN (SELECT value FROM json_each(?2)) GROUP BY l.site_id`).bind(projectId, sites),
    db.prepare(`SELECT site_id, count(*) AS n FROM ot_lotes WHERE project_id = ?1 AND status = 'em_revisao' AND ${NO_SITE} GROUP BY site_id`).bind(projectId, sites),
    db.prepare(sitesComZonas411('site_id IN (SELECT value FROM json_each(?))')).bind(projectId, sites),
    db.prepare(`SELECT site_id FROM ot_levantamentos WHERE project_id = ?1 AND status = 'ativo' AND ${NO_SITE} UNION
      SELECT site_id FROM ot_ativos WHERE project_id = ?1 AND status = 'ativo' AND ${NO_SITE}`).bind(projectId, sites),
    db.prepare(`SELECT site_id, date(min(ultima_verificacao_em), '+24 months') AS em FROM ot_ativos
      WHERE project_id = ?1 AND status = 'ativo' AND no_arciber = 1 AND ${NO_SITE} GROUP BY site_id`).bind(projectId, sites),
    db.prepare(`SELECT site_id, count(*) AS n FROM ot_desvios WHERE project_id = ?1 AND situacao = 'aberto' AND ${NO_SITE} GROUP BY site_id`).bind(projectId, sites),
  ]);
  const lista = sts.results as { id: string; nome: string; fase: string; obra_ate: string | null; base_aprovada_em: string | null }[];
  const c = cont.results[0] as { desvios: number; desvios_fora_de_obra: number; lotes: number; aceites: number; revisoes: number };
  const cs = creds.results as (Cred & { sensor_id: string })[];
  const sondasLidas = sondas.results as { id: string; site_id: string; created_at: string; ultimo_envio: string | null }[];
  const estados = sondasLidas.map((s) => ({ site_id: s.site_id, estado: situacaoSensor(s.ultimo_envio ?? s.created_at, cs.filter((k) => k.sensor_id === s.id), agora) }));
  const paradas = estados.filter((s) => s.estado === 'parada');
  const nome = (id: string) => lista.find((s) => s.id === id)?.nome ?? '';
  const emAprovacao = lista.filter((s) => s.fase === 'base_em_aprovacao');
  const obras = lista.filter((s) => (s.fase === 'em_obra' || s.fase === 'base_em_aprovacao') && s.obra_ate && s.obra_ate <= em7);

  const item = (grupo: ItemFazer['grupo'], q: number, um: string, varios: string, contexto: string, acao: string, aba: string): ItemFazer[] =>
    q > 0 ? [{ grupo, quando: grupo === 'atraso' ? 'Agora' : 'Nesta semana', texto: plural(q, um, varios), contexto, acao, tela: 'ot', aba, modulo: 'ot' }] : [];
  const itens: ItemFazer[] = [
    ...(veSondas ? item('atraso', paradas.length, 'sonda parada', 'sondas paradas', exemplos([...new Set(paradas.map((s) => nome(s.site_id)))]), 'Ver as sondas', 'acessos') : []),
    ...(gestor ? item('atraso', c.revisoes, 'requisito com revisão vencida', 'requisitos com revisão vencida', 'Assessment da RO-CB.BR.01', 'Abrir o assessment', 'assessment') : []),
    // a tela tira os desvios de site com obra ativa (situacao.obra = obra_ate preenchida); o número do topo segue contando todos
    ...(aprova ? item('semana', c.desvios_fora_de_obra, 'desvio aberto', 'desvios abertos', 'O sensor viu o que não está na base aprovada', 'Ver os desvios', 'sites') : []),
    ...(aprova ? item('semana', c.lotes, 'lote aguardando revisão', 'lotes aguardando revisão', 'Coleta enviada, esperando quem aprova', 'Revisar os lotes', 'sites') : []),
    ...(gestor ? item('semana', emAprovacao.length, 'base aguardando aprovação', 'bases aguardando aprovação', exemplos(emAprovacao.map((s) => s.nome)), 'Abrir os sites', 'sites') : []),
    ...(gestor ? item('semana', obras.length, 'obra vence em até 7 dias', 'obras vencem em até 7 dias', exemplos(obras.map((s) => s.nome)), 'Abrir os sites', 'sites') : []),
    ...(gestor ? item('semana', c.aceites, 'aceite de desvio vence em até 7 dias', 'aceites de desvio vencem em até 7 dias', 'Depois do prazo, o desvio reabre', 'Ver os desvios', 'sites') : []),
  ];
  const por = <T extends { site_id: string }>(r: unknown) => new Map((r as T[]).map((x) => [x.site_id, x]));
  const [mRasc, mLotes, mRev, mDesv] = [rasc, lotesRev, revalid, desv].map((r) => por<{ site_id: string; n: number; em?: string | null }>(r.results));
  const [mZonas, mConteudo] = [zonas, conteudo].map((r) => new Set((r.results as { site_id: string }[]).map((x) => x.site_id)));
  // A régua do programa (P0-4): um item por site permitido, sem nome; a rota só o repassa a quem tem o bloco `ot`.
  const sitesPrograma: SiteNoPrograma[] = lista.map((s) => ({
    proximo_passo: proximoPassoDe({ fase: s.fase as Fase, revalidar_em: mRev.get(s.id)?.em ?? null, tem_conteudo: mConteudo.has(s.id), zonas_4_1_1: mZonas.has(s.id),
      rascunhos_bloqueiam: Number(mRasc.get(s.id)?.n ?? 0), lotes_em_revisao: Number(mLotes.get(s.id)?.n ?? 0) }),
    desvios_abertos: Number(mDesv.get(s.id)?.n ?? 0),
  }));
  // Quadro "Por site" (PR2): o mesmo lote, nenhuma consulta a mais. O texto do passo é o da régua (em operação com desvio = Tratar).
  const sondaDo = (id: string) => { const t = estados.filter((s) => s.site_id === id).map((s) => s.estado); return PIOR_SONDA.find((p) => t.includes(p)) ?? null; };
  const porSite: LinhaSiteOt[] = lista.map((s, i) => {
    const p = sitesPrograma[i];
    return { id: s.id, nome: s.nome, fase: s.fase,
      proximo: p.proximo_passo === 'em_operacao' && p.desvios_abertos > 0 ? 'Tratar os desvios abertos' : TEXTO_OT[p.proximo_passo],
      desvios_abertos: p.desvios_abertos, revalidar_em: mRev.get(s.id)?.em ?? null, obra_ate: s.obra_ate, ...(veSondas ? { sonda: sondaDo(s.id) } : {}) };
  });
  const comecando = lista.length === 0;
  return {
    comecando, papel, itens, sitesPrograma, porSite, proximo: null as Proximo,
    // Marco do programa (onda 4, decisão 8): a primeira base aprovada entre os sites DESTA pessoa (P0-4). O painel não o devolve.
    marco: lista.map((s) => s.base_aprovada_em).filter((d): d is string => !!d).sort()[0] ?? null,
    numeros: [[`${lista.filter((s) => s.fase === 'em_operacao').length} de ${lista.length}`, 'sites em operação'], [String(c.desvios), 'desvios abertos']] as [string, string][],
    cobertura: [] as never[], vencimentos: [] as never[], riscos: [] as never[],
    passos: [{ texto: 'Cadastrar o primeiro site', contexto: 'O inventário do n.ot começa pelo site', feito: !comecando, acao: 'Abrir o n.ot', tela: 'ot' }] as Passo[],
  };
}

export type BlocoOt = Awaited<ReturnType<typeof blocoOt>>;

/**
 * O bloco do n.ot no `?modulo=ot` (Painel do n.ot, spec 2026-11-19, decisões 1, 3 e 4), por papel. O Início do n.360 NÃO passa por
 * aqui: nenhum campo novo fora do `?modulo=ot` (oráculo do inventário). Gestor ARCiber e equipe: tudo; técnico: os sites dele e os
 * números deles (P0-4); leitor: a frase (nada de desvio, site ou sonda).
 */
export function respostaDoOt(b: BlocoOt, saude: Saude) {
  if (b.papel === 'leitor') return { saude, comecando: b.comecando };
  const base = { saude, numeros: b.numeros, comecando: b.comecando, por_site: b.porSite };
  if (b.papel === 'tecnico') return base;
  return { ...base, fazer: b.itens, passos: b.passos };
}
```

- [ ] **Step 5: Rodar e ver passar**
  Run: `npx vitest run test/painel-ot.test.ts test/painel-ot-rota.test.ts test/programa-rota.test.ts test/programa.test.ts test/onda2-numeros.test.ts && npx tsc --noEmit`
  Expected: PASS; `tsc` sem erro.

- [ ] **Step 6: Mutação (sonda segue `podeVerCompleto`)** — troque `const veSondas = await podeVerCompleto(db, ator, projectId);` por `const veSondas = pessoa && ['org_admin', 'consultor', 'consultant', 'consultoria_admin', 'platform_admin'].includes(ator.role);`. Rode `npx vitest run test/painel-ot.test.ts`: FAIL em "consultoria_admin não designado…" e "platform_admin não vê sonda parada". Desfaça (Edit inverso) e rode de novo: PASS.

- [ ] **Step 7: Mutação (técnico sem sonda, P0-4/P0-6)** — troque `...(veSondas ? { sonda: sondaDo(s.id) } : {})` por `sonda: sondaDo(s.id)`. Rode `npx vitest run test/painel-ot.test.ts`: FAIL em "papel e linhas por site" (`'sonda' in t.porSite[0]`). Desfaça e rode: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/services/painel-ot.ts src/services/programa.ts test/painel-ot.test.ts
git diff --cached --stat
git commit -m "feat(ot): papel e linhas por site no bloco do n.ot; sondas por podeVerCompleto"
```

### Task 3: `?modulo=ot` responde por papel (Gestor com "O que fazer") **[revisor opus]**

**Files:**
- Modify: `src/routes/painel.ts:38`, `src/services/painel.ts:11,443,471,486-495`
- Modify (teste): `test/painel-ot-rota.test.ts:50-54` (decisão 1: o Gestor deixa de ser "só frase" no `?modulo=ot`; o caso passa a travar o Início do n.360)
- Create: `test/painel-ot-papeis.test.ts`

**Interfaces:**
- Consumes: `respostaDoOt(b: BlocoOt, saude: Saude)`, `BlocoOt.papel`, `BlocoOt.porSite` (Task 2).
- Produces: `QuemPede.detalheOt?: boolean` (`src/services/painel.ts:443`); `GET /api/v1/projects/:id/painel?modulo=ot` → `modulos.ot`:
  - `gestor`/`equipe`: `{ saude, numeros, comecando, por_site: LinhaSiteOt[], fazer: ItemFazer[], passos: Passo[] }`;
  - `tecnico`: `{ saude, numeros, comecando, por_site }`;
  - `leitor`: `{ saude, comecando }`.
  - Sem `?modulo` (Início do n.360): igual a hoje (`fazer` só para quem não é papel de cliente; sem `por_site`).

- [ ] **Step 1: Escrever o teste que falha** — `test/painel-ot-papeis.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, seedTwoProjects, habilitarOt, concederModulos, designarConsultor, sessionFor, workerEnv } from './helpers/d1';

// Painel do n.ot por papel (spec 2026-11-19-paineis-do-n-ot, PR2): Gestor ARCiber com "O que fazer" só no ?modulo=ot (decisão 1);
// técnico só os sites dele (decisão 4, P0-4); leitor só a frase (decisão 3); sonda só para quem abre a rota de sonda. D1 real.
type H = Record<string, string>;
const chamar = (h: H, caminho: string) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv() as any);
const pedir = async (h: H, q: string) => { const r = await chamar(h, `/api/v1/projects/proj-a/painel${q}`); expect(r.status).toBe(200); return (await r.json()) as any; };
const ot = (h: H) => pedir(h, '?modulo=ot');
const n360 = (h: H) => pedir(h, '');
let gestor: H, tecnico: H, leitor: H, cons: H, plat: H;

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-g', 'g@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'), ('u-t', 't@cliente.teste', 'x', 'Tecnico', 'org_user', 'proj-a'),
      ('u-l', 'l@cliente.teste', 'x', 'Leitor', 'client', 'proj-a'), ('u-p', 'p@ness.lat', 'x', 'Plataforma', 'platform_admin', NULL)`),
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase) VALUES ('s1', 'proj-a', 'SE Norte Exemplo', 'em_operacao'), ('s2', 'proj-a', 'SE Sul Exemplo', 'em_levantamento')`),
    env.DB.prepare(`INSERT INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES ('u-t', 's1', 'proj-a', 'x')`),
    env.DB.prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez) VALUES
      ('d1', 'proj-a', 's1', 'fluxo', 'chave-sensor-1', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z'),
      ('d2', 'proj-a', 's2', 'fluxo', 'chave-sensor-2', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z')`),
    env.DB.prepare(`INSERT INTO ot_sensores (id, project_id, site_id, nome, faixa_origem, criado_por, created_at) VALUES ('sn1', 'proj-a', 's1', 'Sonda Norte', '10.0.0.0/8', 'u-g', '2026-11-01 00:00:00')`),
    env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, nome, ip_cifrado) VALUES ('at1', 'proj-a', 's1', 'Ativo Secreto XYZ', 'ot1:segredo')`),
  ]);
  await concederModulos(['u-g', 'u-t', 'u-l', 'u-p'], ['iso', 'ot']);
  await designarConsultor('c@ness.lat', 'proj-a');
  const c = await env.DB.prepare(`SELECT id FROM users WHERE email = 'c@ness.lat'`).first<{ id: string }>();
  await concederModulos([c!.id], ['iso', 'ot']);
  gestor = await sessionFor({ id: 'u-g', email: 'g@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  tecnico = await sessionFor({ id: 'u-t', email: 't@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  leitor = await sessionFor({ id: 'u-l', email: 'l@cliente.teste', role: 'client', client_project_id: 'proj-a' });
  plat = await sessionFor({ id: 'u-p', email: 'p@ness.lat', role: 'platform_admin' });
  cons = await sessionFor({ id: c!.id, email: 'c@ness.lat', role: 'consultor' });
});

describe('?modulo=ot por papel', () => {
  it('Gestor ARCiber: "O que fazer" e Por site no ?modulo=ot; no Início do n.360 continua sem os dois (decisão 1)', async () => {
    const d = await ot(gestor);
    expect(d.visao).toBe('cliente');
    expect(d.modulos.ot.fazer.map((i: any) => i.texto)).toEqual(expect.arrayContaining(['1 sonda parada', '2 desvios abertos']));
    expect(d.modulos.ot.por_site.map((s: any) => s.nome)).toEqual(['SE Norte Exemplo', 'SE Sul Exemplo']);
    expect(d.modulos.ot.por_site[0]).toMatchObject({ id: 's1', fase: 'em_operacao', proximo: 'Tratar os desvios abertos', desvios_abertos: 1, sonda: 'parada' });
    const g = await n360(gestor);
    expect(g.modulos.ot.fazer).toBeUndefined();
    expect(g.modulos.ot.por_site).toBeUndefined();
  });
  it('consultor: o bloco da equipe; no Início do n.360 nenhum campo novo (oráculo do inventário)', async () => {
    const d = await ot(cons);
    expect(Object.keys(d.modulos.ot).sort()).toEqual(['comecando', 'fazer', 'numeros', 'passos', 'por_site', 'saude']);
    const g = await n360(cons);
    expect(g.modulos.ot.por_site).toBeUndefined();
  });
  it('técnico: só os sites dele, sem "O que fazer" nem total do projeto (P0-4)', async () => {
    const d = await ot(tecnico);
    expect(Object.keys(d.modulos.ot).sort()).toEqual(['comecando', 'numeros', 'por_site', 'saude']);
    expect(d.modulos.ot.por_site.map((s: any) => s.id)).toEqual(['s1']);
    expect(d.modulos.ot.numeros).toEqual([['1 de 1', 'sites em operação'], ['1', 'desvios abertos']]);
    expect(d.programa.etapas.ot.total).toBe(1);
    expect('sonda' in d.modulos.ot.por_site[0]).toBe(false);
    expect(JSON.stringify(d)).not.toContain('SE Sul');
  });
  it('leitor (client): só a frase; nada de desvio, site, sonda ou "O que fazer" (decisão 3)', async () => {
    const d = await ot(leitor);
    expect(Object.keys(d.modulos.ot).sort()).toEqual(['comecando', 'saude']);
    expect(JSON.stringify(d.modulos.ot)).not.toMatch(/desvio|SE Norte|sonda/i);
  });
  it('platform_admin não abre a rota de sonda: nem item, nem coluna', async () => {
    const d = await ot(plat);
    expect(d.modulos.ot.fazer.map((i: any) => i.texto).join(' ')).not.toContain('sonda');
    expect(d.modulos.ot.por_site.every((s: any) => !('sonda' in s))).toBe(true);
  });
  it('nenhuma resposta leva IP, MAC, nome de ativo, nome de sonda, faixa ou chave do sensor (P0-6)', async () => {
    for (const h of [gestor, tecnico, leitor, cons, plat]) {
      const corpo = JSON.stringify(await ot(h));
      expect(corpo).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
      expect(corpo).not.toMatch(/([0-9a-f]{2}:){5}[0-9a-f]{2}/i);
      for (const x of ['Sonda Norte', 'Ativo Secreto XYZ', 'ot1:', 'chave-sensor']) expect(corpo, x).not.toContain(x);
    }
  });
});
```

  Em `test/painel-ot-rota.test.ts`, troque o caso das linhas 50-54 por:

```ts
  it('cliente recebe só a frase e os números no Início do n.360 (sem ?modulo); o Painel do n.ot é testado em painel-ot-papeis', async () => {
    const d = await (await chamar(gestor, '/api/v1/projects/proj-a/painel')).json() as any;
    expect(d.modulos.ot.numeros).toEqual([['1 de 1', 'sites em operação'], ['1', 'desvios abertos']]);
    expect(d.modulos.ot.fazer).toBeUndefined();
  });
```

- [ ] **Step 2: Rodar e ver falhar**
  Run: `npx vitest run test/painel-ot-papeis.test.ts`
  Expected: FAIL — Gestor sem `fazer` no `?modulo=ot`; `por_site` indefinido.

- [ ] **Step 3: Implementar.** `src/routes/painel.ts:38`, no objeto passado a `painelDoProjeto`, acrescente `detalheOt: pedido === 'ot'` (depois de `org_id: user?.org_id`).

  `src/services/painel.ts:11`: `import { blocoOt, respostaDoOt } from './painel-ot';`. Linha 443:

```ts
/** Quem pede: a visão de cliente sai para papel de cliente; o agente MCP (que entra como `client`) lê como a consultoria que o concedeu.
 *  `detalheOt`: o pedido é `?modulo=ot` (Painel do n.ot): só ele recebe a resposta do n.ot por papel e os quadros. */
export type QuemPede = { id?: string; email?: string; cliente: boolean; agente?: boolean; role?: string; client_project_id?: string | null; org_id?: string | null; detalheOt?: boolean };
```

  (apague o comentário antigo da linha 442, que a nova linha substitui). No laço (linhas 486-495), logo depois de `const saude = saudeDoProjeto(…);`:

```ts
    // ?modulo=ot (spec 2026-11-19): a resposta do n.ot por papel; o Gestor ARCiber recebe "O que fazer" mesmo na visão de cliente (decisão 1).
    if (m === 'ot' && ot && quem.detalheOt) { modulosResp.ot = respostaDoOt(ot, saude); continue; }
```

- [ ] **Step 4: Rodar e ver passar**
  Run: `npx vitest run test/painel-ot-papeis.test.ts test/painel-ot-rota.test.ts test/painel-ot.test.ts test/programa-rota.test.ts test/onda2-numeros.test.ts test/painel.test.ts && npx tsc --noEmit`
  Expected: PASS; mediana de `test/painel.test.ts` < 300 ms.

- [ ] **Step 5: Mutação (oráculo: nada novo no Início do n.360)** — troque `quem.detalheOt` por `true` na linha nova do laço. Rode `npx vitest run test/painel-ot-papeis.test.ts`: FAIL em "Gestor ARCiber…" (`g.modulos.ot.fazer` definido no n.360) e "consultor…". Desfaça e rode: PASS.

- [ ] **Step 6: Mutação (P0-4, técnico)** — em `respostaDoOt` troque `if (b.papel === 'tecnico') return base;` por `if (b.papel === 'tecnico') return { ...base, fazer: b.itens };`. Rode `npx vitest run test/painel-ot-papeis.test.ts`: FAIL em "técnico: só os sites dele…". Desfaça e rode: PASS.

- [ ] **Step 7: Mutação (decisão 3, leitor)** — apague a linha `if (b.papel === 'leitor') return { saude, comecando: b.comecando };`. Rode o mesmo arquivo: FAIL em "leitor (client)…". Desfaça e rode: PASS.

- [ ] **Step 8: Contrato** — `npm run openapi && git diff --stat docs/openapi.json mcp-server-niso/src/contrato-gerado.ts`. Esperado: vazio (o OpenAPI só descreve corpo de requisição; nenhuma rota nova). Se vier diff, pare e reporte.

- [ ] **Step 9: Commit**

```bash
git add src/routes/painel.ts src/services/painel.ts test/painel-ot-papeis.test.ts test/painel-ot-rota.test.ts
git diff --cached --stat
git commit -m "feat(ot): ?modulo=ot responde por papel; Gestor ARCiber com O que fazer só no Painel do n.ot"
```

### Task 4: Tela — "Abrir" do Gestor na régua e quadro Por site

**Files:**
- Modify: `frontend/src/views/painel.js:3` (import), `:149` (`reguaDe`), `telaDoOt` (Task 1)
- Test: `frontend/test/painel-ot.test.js`
- Modify (docs): `CHANGELOG.md`, `AGENTS.md:98`

**Interfaces:**
- Consumes: `modulos.ot.por_site: LinhaSiteOt[]`, `modulos.ot.fazer` (Task 3); `FASE` (`frontend/src/ot-comum.js:140`); `renderDataTable(colunas, linhas)` (`frontend/src/ui.js:446`, células em HTML já escapado); `window.otTela(tela, site, modo)` (`frontend/src/views/ot.js:84`).
- Produces: `quadroPorSite(linhas)` e a regra "régua do n.ot com Abrir para quem recebeu `fazer`" em `painel.js`.

- [ ] **Step 1: Escrever os testes que falham** — em `frontend/test/painel-ot.test.js`, troque a constante `EQUIPE` do Task 1 por estas duas (números e Por site andam juntos a partir do PR2):

```js
const SITES = [{ id: 's1', nome: 'SE <b>Norte</b>', fase: 'em_operacao', proximo: 'Tratar os desvios abertos', desvios_abertos: 1, revalidar_em: '2027-01-10', obra_ate: null, sonda: 'parada' },
    { id: 's2', nome: 'SE Sul', fase: 'em_levantamento', proximo: 'Começar o levantamento do site', desvios_abertos: 0, revalidar_em: null, obra_ate: null, sonda: null }];
const EQUIPE = { numeros: [['0 de 2', 'sites em operação'], ['1', 'desvios abertos']], fazer: FAZER, passos: [], por_site: [] };
```

  e acrescente no fim do arquivo:

```js
describe('Painel do n.ot: Gestor ARCiber e Por site (PR2)', () => {
    it('Gestor (visão de cliente com "fazer") ganha "Abrir" na régua, "O que fazer" e Por site com Sonda', async () => {
        await abrir(painelOt('cliente', { numeros: [['1 de 2', 'sites em operação']], fazer: FAZER, passos: [], por_site: SITES }));
        expect(el('c').querySelector('.pn-regua-prox button')).not.toBeNull();
        expect(el('pn-fazer')).not.toBeNull();
        const t = el('pn-ot-sites').closest('section');
        expect([...t.querySelectorAll('th')].map((th) => th.textContent.trim())).toContain('Sonda');
        expect(t.textContent).toContain('SE <b>Norte</b>');
        expect(t.querySelector('b')).toBeNull();
        expect(t.textContent).toContain('Parada');
        expect(t.textContent).toContain('10/01/2027');
        const b = t.querySelector('button[data-action="otTela"]');
        expect(JSON.parse(b.dataset.args)).toEqual(['site', 's1', null]);
        expect(b.getAttribute('aria-label')).toBe('Abrir SE <b>Norte</b>');
    });
    it('técnico (Por site sem "sonda", sem "fazer"): sem "Abrir" na régua, sem coluna Sonda, sem "O que fazer"', async () => {
        const semSonda = SITES.slice(0, 1).map(({ sonda, ...s }) => s);
        await abrir(painelOt('cliente', { numeros: [['1 de 1', 'sites em operação']], por_site: semSonda }, EM_DIA));
        expect(el('c').querySelector('.pn-regua-prox button')).toBeNull();
        expect(el('pn-fazer')).toBeNull();
        const t = el('pn-ot-sites').closest('section');
        expect([...t.querySelectorAll('th')].map((th) => th.textContent.trim())).not.toContain('Sonda');
        expect(el('pn-ot-num')).not.toBeNull();
    });
    it('Por site vazio diz o que fazer, sem tabela zerada', async () => {
        await abrir(painelOt('equipe', { ...EQUIPE, por_site: [] }));
        expect(el('pn-ot-sites').closest('section').textContent).toContain('O inventário do n.ot começa pelo site');
        expect(el('pn-ot-sites').closest('section').querySelector('table')).toBeNull();
    });
});
```

- [ ] **Step 2: Rodar e ver falhar**
  Run: `cd frontend && npx vitest run test/painel-ot.test.js`
  Expected: FAIL — `#pn-ot-sites` nulo; régua do Gestor sem botão.

- [ ] **Step 3: Implementar** — `frontend/src/views/painel.js`, linha 3: acrescente `renderDataTable` ao import de `../ui.js`; depois da linha 8 acrescente `import { FASE } from '../ot-comum.js';`. Linha 149:

```js
// A régua só se lê na visão de cliente; no n.ot, o Gestor ARCiber (o único cliente que recebe "fazer", decisão 1) também abre.
const reguaDe = (m, d, projectId) => regua(m, d.programa && d.programa.etapas && d.programa.etapas[m], projectId,
    d.visao !== 'cliente' || (m === 'ot' && Array.isArray(d.modulos && d.modulos.ot && d.modulos.ot.fazer)));
```

  Troque a `telaDoOt` do Task 1 inteira por:

```js
const SONDA = { em_dia: 'Em dia', atrasada: 'Atrasada', parada: 'Parada' };
const dataBr = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—');

/** Uma linha por site permitido (P0-4): fase, próximo passo, desvios, sonda (só quando o servidor mandou: quem abre a sonda), revalidar e obra. */
function quadroPorSite(linhas) {
    if (!linhas.length) return quadro('pn-ot-sites', 'Por site', '<p class="pn-vazio-tx">Nenhum site neste painel. O inventário do n.ot começa pelo site, na aba Sites.</p>');
    const comSonda = linhas.some((l) => 'sonda' in l);
    const cab = ['Site', 'Fase', 'Próximo passo', 'Desvios abertos', ...(comSonda ? ['Sonda'] : []), 'Revalidar até', 'Obra até', 'Abrir'];
    const corpo = linhas.map((l) => [e(l.nome), e(FASE[l.fase] || l.fase), e(l.proximo), e(l.desvios_abertos), ...(comSonda ? [e(SONDA[l.sonda] || '—')] : []),
        e(dataBr(l.revalidar_em)), e(dataBr(l.obra_ate)),
        `<button type="button" class="btn btn-sm" data-action="otTela" data-args='${args('site', l.id, null)}' aria-label="${e(`Abrir ${l.nome}`)}">Abrir</button>`]);
    return quadro('pn-ot-sites', 'Por site', renderDataTable(cab, corpo));
}

/**
 * Painel do n.ot (spec 2026-11-19-paineis-do-n-ot). O servidor decide o que cada papel recebe (`?modulo=ot`); aqui só se desenha o que
 * veio. Quadro sem dado não aparece; nunca um zero que pareça "em dia".
 */
function telaDoOt(d, b) {
    const decidir = Array.isArray(d.decisoes) && d.decisoes.length ? [quadro('pn-dec', 'Esperando a sua decisão', listaDecisoes(d.decisoes, '', false))] : [];
    const fazer = Array.isArray(b.fazer) ? [b.comecando ? quadro('pn-passos-t', 'Primeiros passos', passos(b.passos)) : quadro('pn-fazer', 'O que fazer agora', listaFazer(b.fazer, false))] : [];
    const sites = Array.isArray(b.por_site) ? [quadroPorSite(b.por_site)] : [];
    const numeros = Array.isArray(b.por_site) && !b.comecando ? [quadro('pn-ot-num', 'O programa em números', figuras(b, false))] : [];
    const esquerda = [...decidir, ...fazer, ...sites];
    return esquerda.length || numeros.length ? colunas(esquerda, numeros) : '';
}
```

  (Os testes do PR1 que usam `EQUIPE` passam a ter `por_site: []`; o quadro de números segue saindo para a equipe.)

- [ ] **Step 4: Rodar e ver passar**
  Run: `cd frontend && npx vitest run test/painel-ot.test.js test/painel-regua.test.js test/painel-view.test.js test/ot-modulo.test.js && npm run build`
  Expected: PASS; `✓ built in`.

- [ ] **Step 5: Mutação (decisão 3: leitor e técnico não navegam pela régua)** — em `reguaDe` troque a condição por `true`. Rode `cd frontend && npx vitest run test/painel-ot.test.js test/painel-regua.test.js`: FAIL em "técnico…", "Painel do n.ot: cliente" e "o cliente vê a régua… sem botão". Desfaça e rode: PASS.

- [ ] **Step 6: Docs** — `CHANGELOG.md`, dentro da seção "n.ot: Painel" do Task 1, acrescente:

```markdown
- **Gestor ARCiber no Painel do n.ot:** vê "O que fazer agora" (bases e obras a aprovar, aceites e revisões vencendo, desvios e lotes) e pode abrir o próximo passo da régua, como a equipe. No Início do n.360 a visão dele não muda.
- **Quadro "Por site":** uma linha por site com fase, próximo passo, desvios abertos, revalidação dos ativos, obra e (para quem abre as sondas) a situação da sonda. O técnico vê só os sites dele; o leitor do cliente vê só a frase e a régua.
- **Muda para quem já usa:** o item "sondas paradas" do "O que fazer" (no Painel e no Início) passa a aparecer só para quem abre a tela de sondas (Gestor ARCiber, consultor designado e administrador da consultoria designado no projeto). O administrador da plataforma e o administrador da consultoria não designado deixam de ver o número.
```

  `AGENTS.md:98`: depois de "o painel e a carteira trazem o n.ot so a quem tem o modulo e nao e papel de cliente na carteira (`src/services/painel-ot.ts`: contagem e nome de site, nunca IP, MAC nem nome de ativo; chave de API e agente nunca recebem)." acrescente (sem acentos):

```
No `?modulo=ot` o painel e o Painel do n.ot (`/ot?ot=painel`): `respostaDoOt` corta por papel (Gestor ARCiber e equipe: `fazer`, `passos`, `por_site`; tecnico: `por_site` e numeros so dos sites dele; leitor: so a frase). O Inicio do n.360 nao recebe nada disso. Sonda no painel (item, coluna, credencial) segue `podeVerCompleto`, o mesmo criterio da rota de sonda.
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/painel.js frontend/test/painel-ot.test.js CHANGELOG.md AGENTS.md
git diff --cached --stat
git commit -m "feat(ot): Painel do n.ot com Abrir do Gestor e quadro Por site (PR2 dos painéis)"
```

- [ ] **Step 8: Entrega do PR2** — `git push -u origin claude/paineis-ot-2`; `gh pr create --title "n.ot: Painel por papel e Por site (PR2 dos painéis)" --body "<resumo, decisão podeVerCompleto, testes rodados>"` com as linhas de atribuição da sessão. O dono roda `bash scripts/ci/ship.sh <PR>` antes do merge.

---

## PR3 — Conformidade, Desvios e Vencimentos (servidor + tela, sem migration)

### Task 5: Resumo do assessment e situação na organização como funções puras

**Files:**
- Modify: `src/services/ot-avaliacao.ts:25-27,76-78,96-105`
- Test: `test/ot-avaliacao.test.ts` (acréscimo)

**Interfaces:**
- Produces (em `src/services/ot-avaliacao.ts`):
  - `situacaoNaOrganizacao(porSite: { fase: string; situacao: string }[]): 'nao_atende' | 'sem_evidencia' | 'evidencia_no_inventario' | 'nao_avaliado'`;
  - `type ItemDoResumo = { tipo: 'tecnico'; situacao_org: string } | { tipo: 'excecao' } | { tipo: 'politica'; avaliacao: { situacao: DadosAvaliacao['situacao']; confirmado: boolean } | null; revisar: boolean }`;
  - `resumoDoAssessment(itens: ItemDoResumo[]): { atende: number; parcial: number; nao_atende: number; nao_se_aplica: number; nao_avaliado: number; revisar: number; a_confirmar: number }`.
  - `montarAssessment` passa a usar as duas; a resposta de `GET /ot/assessment` não muda.

- [ ] **Step 1: Escrever o teste que falha** — em `test/ot-avaliacao.test.ts`, depois da linha 3, acrescente `import { resumoDoAssessment, situacaoNaOrganizacao } from '../src/services/ot-avaliacao';` e, no fim do arquivo:

```ts
describe('resumo do assessment (puro): a tela e o Painel do n.ot contam igual', () => {
  it('técnico só conta "não atende" ou "não avaliado"; política conta a situação, o a confirmar e o a revisar', () => {
    expect(resumoDoAssessment([
      { tipo: 'tecnico', situacao_org: 'evidencia_no_inventario' }, { tipo: 'tecnico', situacao_org: 'nao_atende' }, { tipo: 'excecao' },
      { tipo: 'politica', avaliacao: { situacao: 'atende', confirmado: true }, revisar: false },
      { tipo: 'politica', avaliacao: { situacao: 'parcial', confirmado: false }, revisar: true },
      { tipo: 'politica', avaliacao: null, revisar: false },
    ])).toEqual({ atende: 1, parcial: 1, nao_atende: 1, nao_se_aplica: 0, nao_avaliado: 3, revisar: 1, a_confirmar: 1 });
  });
  it('organização: pior caso entre os sites que contam; levantamento não conta; nenhum site que conte = não avaliado', () => {
    expect(situacaoNaOrganizacao([{ fase: 'em_levantamento', situacao: 'nao_atende' }, { fase: 'em_operacao', situacao: 'evidencia_no_inventario' }])).toBe('evidencia_no_inventario');
    expect(situacaoNaOrganizacao([{ fase: 'em_obra', situacao: 'sem_evidencia' }, { fase: 'base_em_aprovacao', situacao: 'nao_atende' }])).toBe('nao_atende');
    expect(situacaoNaOrganizacao([{ fase: 'em_levantamento', situacao: 'nao_atende' }])).toBe('nao_avaliado');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**
  Run: `npx vitest run test/ot-avaliacao.test.ts`
  Expected: FAIL — `resumoDoAssessment is not a function`.

- [ ] **Step 3: Implementar** — em `src/services/ot-avaliacao.ts`, logo depois da linha 27 (`const CONTAM = …;`):

```ts
/** Situação de um item técnico na organização: o pior caso entre os sites que contam (operação, obra, base em aprovação). */
export function situacaoNaOrganizacao(porSite: { fase: string; situacao: string }[]): (typeof PIOR)[number] | 'nao_avaliado' {
  const contam = porSite.filter((s) => CONTAM.includes(s.fase));
  return contam.length ? PIOR.find((p) => contam.some((s) => s.situacao === p))! : 'nao_avaliado';
}

export type ItemDoResumo = { tipo: 'tecnico'; situacao_org: string } | { tipo: 'excecao' }
  | { tipo: 'politica'; avaliacao: { situacao: DadosAvaliacao['situacao']; confirmado: boolean } | null; revisar: boolean };

/** Os sete contadores do assessment, puros: `GET /ot/assessment` e o Painel do n.ot (painel-ot-quadros.ts) contam com esta função. */
export function resumoDoAssessment(itens: ItemDoResumo[]) {
  const resumo = { atende: 0, parcial: 0, nao_atende: 0, nao_se_aplica: 0, nao_avaliado: 0, revisar: 0, a_confirmar: 0 };
  for (const i of itens) {
    if (i.tipo === 'tecnico') resumo[i.situacao_org === 'nao_atende' ? 'nao_atende' : 'nao_avaliado']++; // o inventário nunca afirma "atende"
    else if (i.tipo === 'excecao') resumo.nao_avaliado++;
    else {
      resumo[i.avaliacao?.situacao ?? 'nao_avaliado']++;
      if (i.revisar) resumo.revisar++;
      if (i.avaliacao && !i.avaliacao.confirmado) resumo.a_confirmar++;
    }
  }
  return resumo;
}
```

  Em `montarAssessment`, troque as linhas 77-78 (`const contam = …; const situacao_org = …;`) por `const situacao_org = situacaoNaOrganizacao(por_site);` e o bloco das linhas 96-105 (de `const resumo = { atende: 0, …` até o `}` do `for`) por `const resumo = resumoDoAssessment(itens);`.

- [ ] **Step 4: Rodar e ver passar**
  Run: `npx vitest run test/ot-avaliacao.test.ts && npx tsc --noEmit`
  Expected: PASS (os testes antigos do assessment, `describe('ot-avaliacao: assessment')`, provam que a resposta não mudou).

- [ ] **Step 5: Commit**

```bash
git add src/services/ot-avaliacao.ts test/ot-avaliacao.test.ts
git diff --cached --stat
git commit -m "refactor(ot): resumo do assessment e situação na organização como funções puras"
```

### Task 6: Quadros Conformidade, Desvios e Vencimentos no servidor **[revisor opus]**

**Files:**
- Create: `src/services/painel-ot-quadros.ts`
- Modify: `src/services/hoje.ts` (acrescenta `mesesAtras`), `src/services/painel.ts:8,40-44,471` (`mesesAtras` importado de `hoje.ts`; `blocoOt(…, !!quem.detalheOt)`), `src/services/painel-ot.ts` (assinatura, `quadros`, `proximo`, `respostaDoOt`)
- Create: `test/painel-ot-quadros.test.ts`

**Interfaces:**
- Consumes: `conformidadePorSite(db, projectId, siteIds): Promise<Record<string, Record<string, ItemTecnico>>>` e `ITENS_TECNICOS` (`src/services/ot-conformidade.ts:21,75`); `resumoDoAssessment`, `situacaoNaOrganizacao`, `ItemDoResumo` (Task 5); `SQL_COMPLETO_4_3_1` (`src/services/ot-indicadores.ts:11`); `TETO_LEITURA_OT`; tipos `LinhaVencimento`, `Proximo`, `Tema` (`src/services/painel.ts:32-35`).
- Produces:
  - `mesesAtras(dia: string, n: number): string` em `src/services/hoje.ts` (AAAA-MM).
  - `vencimentosDe(tipos: string[], itens: { tipo: string; rotulo: string; data: string }[], dia: string): { linhas: LinhaVencimento[]; proximo: Proximo }`.
  - `quadrosOt(db, projectId, dia, x: EntradaQuadros)` → `{ proximo: Proximo; conformidade: { resumo, categorias: Tema[], ativos: { arciber: number; completos: number; por_nivel: { nivel: number; ativos: number }[] } }; desvios: { por_site: Tema[]; por_mes: number[]; meses: string[]; fluxos_externos: { externos: number; sem_vpn: number } }; vencimentos: LinhaVencimento[] }`.
  - `blocoOt(db, projectId, ator, dia, agora, detalhe = false)` devolve `quadros` (null fora do `?modulo=ot` e para o técnico) e `proximo` dos vencimentos.
  - `?modulo=ot`: equipe e Gestor recebem `conformidade`, `desvios`, `vencimentos`; leitor recebe `conformidade: { resumo }`; técnico nada disso.

- [ ] **Step 1: Escrever o teste que falha** — `test/painel-ot-quadros.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { blocoOt } from '../src/services/painel-ot';
import { diaMaisSP, hojeEmSaoPaulo } from '../src/services/hoje';
import { applySchema, seedTwoProjects, habilitarOt, concederModulos, designarConsultor, sessionFor, workerEnv } from './helpers/d1';

// Quadros do Painel do n.ot (spec 2026-11-19, PR3): cada número bate com a tela de origem nos mesmos dados; só no ?modulo=ot; dois
// db.batch a mais e nenhuma consulta por site. D1 real.
type H = Record<string, string>;
const HOJE = hojeEmSaoPaulo();
const chamar = (h: H, caminho: string, extra: Record<string, unknown> = {}) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), { ...(workerEnv() as any), ...extra });
const json = async (h: H, caminho: string, extra: Record<string, unknown> = {}) => { const r = await chamar(h, caminho, extra); expect(r.status).toBe(200); return (await r.json()) as any; };
const ot = (h: H, extra: Record<string, unknown> = {}) => json(h, '/api/v1/projects/proj-a/painel?modulo=ot', extra);
let gestor: H, tecnico: H, leitor: H, cons: H, plat: H;
let consId = '';

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  const credencialVence = new Date(Date.now() + 20 * 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-g', 'g@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'), ('u-t', 't@cliente.teste', 'x', 'Tecnico', 'org_user', 'proj-a'),
      ('u-l', 'l@cliente.teste', 'x', 'Leitor', 'client', 'proj-a'), ('u-p', 'p@ness.lat', 'x', 'Plataforma', 'platform_admin', NULL)`),
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase, obra_ate) VALUES ('s1', 'proj-a', 'SE Norte Exemplo', 'em_operacao', NULL),
      ('s2', 'proj-a', 'SE Sul Exemplo', 'base_em_aprovacao', ?)`).bind(diaMaisSP(30)),
    env.DB.prepare(`INSERT INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES ('u-t', 's1', 'proj-a', 'x')`),
    env.DB.prepare(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES ('z1', 'proj-a', 's1', 'Supervisao', 2), ('z2', 'proj-a', 's1', 'DMZ', 3),
      ('z3', 'proj-a', 's1', 'Corporativa', 4), ('z4', 'proj-a', 's2', 'Supervisao Sul', 2)`),
    env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, zona_id, nome, no_arciber, categoria_arciber, tipo_dispositivo, fabricante, funcao, ip_cifrado,
        protocolos_portas, firmware_nao_aplicavel, ultima_verificacao_em, verificado_por)
      VALUES ('at1', 'proj-a', 's1', 'z1', 'Ativo Secreto XYZ', 1, 'centro_operacao', 'IED', 'Fabricante Exemplo', 'Protecao', 'ot1:segredo', '[{"protocolo":"modbus"}]', 1,
        datetime('now', '-700 days'), 'u-g')`),
    env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, zona_id, nome) VALUES ('at2', 'proj-a', 's1', 'z2', 'Ativo Comum ABC')`),
    env.DB.prepare(`INSERT INTO ot_fluxos (id, project_id, site_id, origem_zona_id, externo, via_vpn) VALUES ('f1', 'proj-a', 's2', 'z4', 1, 0)`),
    env.DB.prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez, situacao, aceito_ate) VALUES
      ('d1', 'proj-a', 's1', 'fluxo', 'chave-sensor-1', '{}', ?1, ?1, 'aberto', NULL),
      ('d2', 'proj-a', 's1', 'fluxo', 'chave-sensor-2', '{}', '2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z', 'regularizado', NULL),
      ('d3', 'proj-a', 's2', 'fluxo', 'chave-sensor-3', '{}', ?1, ?1, 'aceito', ?2),
      ('d4', 'proj-a', 's2', 'fluxo', 'chave-sensor-4', '{}', ?1, ?1, 'tratado', NULL)`).bind(`${HOJE}T00:00:00Z`, `${diaMaisSP(20)}T12:00:00Z`),
    env.DB.prepare(`INSERT INTO corrective_actions (id, project_id, title, due_date, status) VALUES ('ca1', 'proj-a', 'Fechar o acesso remoto', ?, 'Open')`).bind(diaMaisSP(40)),
    env.DB.prepare(`INSERT INTO ot_referencias (id, project_id, acao_id, ot_site_id, ot_desvio_id, criado_por) VALUES ('r1', 'proj-a', 'ca1', 's2', 'd4', 'u-g')`),
    env.DB.prepare(`INSERT INTO ot_avaliacoes (id, project_id, requisito_id, situacao, justificativa, proxima_revisao, atualizado_por) VALUES
      ('a1', 'proj-a', 'ons-ro-cb-br-01-rev00-4.2.2', 'atende', NULL, ?, 'u-g'),
      ('a2', 'proj-a', 'ons-ro-cb-br-01-rev00-4.1.4', 'parcial', 'em curso', NULL, 'u-g')`).bind(diaMaisSP(10)),
    env.DB.prepare(`INSERT INTO ot_sensores (id, project_id, site_id, nome, faixa_origem, criado_por) VALUES ('sn1', 'proj-a', 's1', 'Sonda Norte', '10.0.0.0/8', 'u-g')`),
    env.DB.prepare(`INSERT INTO ot_sensor_credenciais (id, sensor_id, project_id, chave_hash, expira_em) VALUES ('kc1', 'sn1', 'proj-a', 'hash', ?)`).bind(credencialVence),
  ]);
  await concederModulos(['u-g', 'u-t', 'u-l', 'u-p'], ['iso', 'ot']);
  await designarConsultor('c@ness.lat', 'proj-a');
  consId = (await env.DB.prepare(`SELECT id FROM users WHERE email = 'c@ness.lat'`).first<{ id: string }>())!.id;
  await concederModulos([consId], ['iso', 'ot']);
  gestor = await sessionFor({ id: 'u-g', email: 'g@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  tecnico = await sessionFor({ id: 'u-t', email: 't@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  leitor = await sessionFor({ id: 'u-l', email: 'l@cliente.teste', role: 'client', client_project_id: 'proj-a' });
  plat = await sessionFor({ id: 'u-p', email: 'p@ness.lat', role: 'platform_admin' });
  cons = await sessionFor({ id: consId, email: 'c@ness.lat', role: 'consultor' });
});

describe('cada número bate com a tela de origem', () => {
  it('Conformidade: o resumo é o do GET /ot/assessment da mesma pessoa', async () => {
    for (const h of [cons, gestor]) {
      const a = await json(h, '/api/v1/projects/proj-a/ot/assessment');
      expect((await ot(h)).modulos.ot.conformidade.resumo).toEqual(a.resumo);
    }
  });
  it('ativos do ARCiber, por nível Purdue e fluxos externos: os mesmos do GET /ot/indicadores', async () => {
    const i = await json(cons, '/api/v1/projects/proj-a/ot/indicadores');
    const q = (await ot(cons)).modulos.ot;
    expect({ total: q.conformidade.ativos.arciber, completos: q.conformidade.ativos.completos }).toEqual(i.completude.arciber);
    expect(Object.fromEntries(q.conformidade.ativos.por_nivel.map((n: any) => [n.nivel, n.ativos]))).toEqual(i.por_nivel);
    expect(q.desvios.fluxos_externos).toEqual({ externos: i.fluxos_externos.externos, sem_vpn: i.fluxos_externos.sem_vpn });
  });
  it('Conformidade por categoria: "atende" conta como concluído; o inventário nunca', async () => {
    const cats = (await ot(cons)).modulos.ot.conformidade.categorias;
    const arq = cats.find((c: any) => c.tema === 'Arquitetura tecnológica para o ambiente');
    expect(arq.feito).toBe(0); // 4.1.1 a 4.1.3 são técnicos e 4.1.4 é parcial
    expect(arq.andamento).toBeGreaterThanOrEqual(1);
    const gov = cats.find((c: any) => c.tema === 'Governança de segurança da informação');
    expect(gov.feito).toBe(1); // 4.2.2 atende
  });
  it('Desvios: estado de hoje por site e detectados por mês (12 meses)', async () => {
    const d = (await ot(cons)).modulos.ot.desvios;
    expect(d.por_site.map((t: any) => [t.tema, t.feito, t.andamento, t.falta])).toEqual([['SE Norte Exemplo', 1, 0, 1], ['SE Sul Exemplo', 0, 2, 0]]);
    expect(d.meses).toHaveLength(12);
    expect(d.meses[11]).toBe(HOJE.slice(0, 7));
    expect(d.por_mes[11]).toBe(3);
    expect(d.por_mes.reduce((t: number, n: number) => t + n, 0)).toBe(3); // d2 é de 2020, fora da janela
  });
});

describe('Vencimentos de 90 dias por papel', () => {
  const tipos = (v: any[]) => v.map((l) => l.tipo);
  const rotulos = (v: any[], tipo: string) => v.find((l) => l.tipo === tipo).itens.map((i: any) => i.rotulo);
  it('consultor: obra, revalidação, revisão, credencial e ação; sem aceite (é do Gestor); rótulo é site ou código', async () => {
    const v = (await ot(cons)).modulos.ot.vencimentos;
    expect(tipos(v)).toEqual(['Obra', 'Revalidação dos ativos', 'Revisão do assessment', 'Credencial de sonda', 'Ação de desvio']);
    expect(rotulos(v, 'Obra')).toEqual(['SE Sul Exemplo']);
    expect(rotulos(v, 'Revalidação dos ativos')).toEqual(['SE Norte Exemplo']);
    expect(rotulos(v, 'Revisão do assessment')).toEqual(['Item 4.2.2']);
    expect(rotulos(v, 'Credencial de sonda')).toEqual(['SE Norte Exemplo']);
    expect(rotulos(v, 'Ação de desvio')).toEqual(['SE Sul Exemplo']);
  });
  it('Gestor: também o aceite de desvio', async () => {
    const v = (await ot(gestor)).modulos.ot.vencimentos;
    expect(tipos(v)).toContain('Aceite de desvio');
    expect(rotulos(v, 'Aceite de desvio')).toEqual(['SE Sul Exemplo']);
  });
  it('platform_admin (não abre a sonda) não recebe credencial de sonda', async () => {
    expect((await ot(plat)).modulos.ot.vencimentos.map((l: any) => l.tipo)).not.toContain('Credencial de sonda');
  });
  it('o próximo prazo do bloco (frase "Em dia") é o primeiro vencimento do n.ot', async () => {
    const b = await blocoOt(env.DB, 'proj-a', { id: consId, email: 'c@ness.lat', role: 'consultor' }, HOJE, new Date(), true);
    expect(b.proximo).toMatchObject({ rotulo: 'Item 4.2.2', dias: 10, tipo: 'Revisão do assessment' });
  });
});

describe('quem vê o quê (P0)', () => {
  it('leitor: só o resumo da Conformidade em números (decisão 3)', async () => {
    const o = (await ot(leitor)).modulos.ot;
    expect(Object.keys(o).sort()).toEqual(['comecando', 'conformidade', 'saude']);
    expect(Object.keys(o.conformidade)).toEqual(['resumo']);
  });
  it('técnico: nada da organização (sem conformidade, desvios nem vencimentos)', async () => {
    const o = (await ot(tecnico)).modulos.ot;
    for (const k of ['conformidade', 'desvios', 'vencimentos']) expect(o[k], k).toBeUndefined();
  });
  it('Início do n.360: nenhum quadro novo nem contagem de ativos', async () => {
    for (const h of [cons, gestor]) {
      const d = await json(h, '/api/v1/projects/proj-a/painel');
      expect(d.modulos.ot.conformidade).toBeUndefined();
      expect(d.modulos.ot.desvios).toBeUndefined();
      expect(JSON.stringify(d)).not.toMatch(/arciber|por_nivel|fluxos_externos/);
    }
  });
  it('nenhuma resposta leva IP, MAC, nome de ativo, nome de sonda, faixa ou chave do sensor (P0-6)', async () => {
    for (const h of [cons, gestor, leitor, tecnico]) {
      const corpo = JSON.stringify(await ot(h));
      expect(corpo).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
      expect(corpo).not.toMatch(/([0-9a-f]{2}:){5}[0-9a-f]{2}/i);
      for (const x of ['Sonda Norte', 'Ativo Secreto XYZ', 'Ativo Comum ABC', 'ot1:', 'chave-sensor', 'Fechar o acesso']) expect(corpo, x).not.toContain(x);
    }
  });
});

// Custo: dois db.batch a mais no ?modulo=ot (o das consultas agrupadas e o de conformidadePorSite) e nenhuma consulta por site.
const contando = () => {
  const sqls: string[] = []; const lotes: number[] = [];
  const DB = new Proxy(env.DB, { get: (t, k) => (k === 'prepare' ? (q: string) => { sqls.push(q); return t.prepare(q); }
    : k === 'batch' ? (xs: D1PreparedStatement[]) => { lotes.push(xs.length); return t.batch(xs); } : (t as any)[k]?.bind?.(t) ?? (t as any)[k]) });
  return { sqls, lotes, DB };
};
describe('custo dos quadros', () => {
  it('o Início do n.360 não consulta os quadros (nem paga o custo)', async () => {
    const c = contando();
    await json(cons, '/api/v1/projects/proj-a/painel', { DB: c.DB });
    expect(c.sqls.filter((q) => /ot_requisito_evidencias|ot_referencias/.test(q))).toEqual([]);
  });
  it('detalhe soma exatamente dois db.batch ao bloco', async () => {
    const ator = { id: consId, email: 'c@ness.lat', role: 'consultor' };
    const sem = contando(); await blocoOt(sem.DB as any, 'proj-a', ator, HOJE, new Date(), false);
    const com = contando(); await blocoOt(com.DB as any, 'proj-a', ator, HOJE, new Date(), true);
    expect(com.lotes.length - sem.lotes.length).toBe(2);
  });
  it('150 sites: 200 e o número de consultas não cresce com os sites', async () => {
    const um = contando();
    await ot(cons, { DB: um.DB });
    await env.DB.batch(Array.from({ length: 150 }, (_, i) => env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase) VALUES (?, 'proj-a', ?, 'em_levantamento')`).bind(`mass-${i}`, `Massa ${i}`)));
    try {
      const muitos = contando();
      const d = await ot(cons, { DB: muitos.DB });
      expect(muitos.sqls.length).toBe(um.sqls.length);
      expect(d.modulos.ot.por_site).toHaveLength(152);
    } finally { await env.DB.prepare(`DELETE FROM ot_sites WHERE id LIKE 'mass-%'`).run(); }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**
  Run: `npx vitest run test/painel-ot-quadros.test.ts`
  Expected: FAIL — `modulos.ot.conformidade` indefinido; `blocoOt` ignora o 6º argumento.

- [ ] **Step 3: `mesesAtras` em `hoje.ts`** — acrescente ao fim de `src/services/hoje.ts`:

```ts
/** AAAA-MM do mês de `dia` (AAAA-MM-DD) recuado `n` meses (n >= 0). Conta pelo calendário, sem o dia: 31/03 menos 1 mês é fevereiro. */
export const mesesAtras = (dia: string, n: number) => {
  const t = Number(dia.slice(0, 4)) * 12 + Number(dia.slice(5, 7)) - 1 - n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
```

  Em `src/services/painel.ts`: a linha 8 vira `import { hojeEmSaoPaulo, mesesAtras } from './hoje';` e saem as linhas 40-44 (o comentário `/** AAAA-MM do mês … */` e a `const mesesAtras` local).

- [ ] **Step 4: Criar `src/services/painel-ot-quadros.ts`**:

```ts
// Quadros do Painel do n.ot (spec 2026-11-19-paineis-do-n-ot, PR3): Conformidade RO-CB, Desvios e exposição, Vencimentos de 90 dias.
// Só no `?modulo=ot` (o Início do n.360 não paga nem recebe). Orçamento de D1: UM db.batch de consultas agrupadas + o de
// `conformidadePorSite`; nenhuma consulta por site. Tudo sobre `sites` (= sitesPermitidos, P0-4). Nunca IP, MAC, nome de ativo ou de
// sonda (P0-6): rótulo de vencimento é nome de site ou código de requisito; o título da ação (texto livre) não sai.
import { conformidadePorSite, ITENS_TECNICOS } from './ot-conformidade';
import { resumoDoAssessment, situacaoNaOrganizacao, type ItemDoResumo } from './ot-avaliacao';
import { SQL_COMPLETO_4_3_1 } from './ot-indicadores';
import { TETO_LEITURA_OT } from './ot-inventario';
import { mesesAtras } from './hoje';
import type { LinhaVencimento, Proximo, Tema } from './painel';

const DIA_MS = 86_400_000;
const NO_SITE = 'site_id IN (SELECT value FROM json_each(?2))';
const EXCECAO = '5.1.1';
const TETO_VENCIMENTOS = 200;
const CONTA_RO_CB = 'Concluído: atende. Em andamento: parcial, ou o inventário registra o que o item pede (o inventário nunca afirma "atende"). Falta: não atende, sem evidência ou não avaliado. "Não se aplica" fica fora.';
const somarDias = (dia: string, n: number) => new Date(Date.parse(dia) + n * DIA_MS).toISOString().slice(0, 10);

type Datada = { tipo: string; rotulo: string; data: string };

/** Vencimentos de 90 dias a partir de itens datados (pura): a forma de `lerVencimentos` do painel (vencidos por tipo, itens no período, teto). */
export function vencimentosDe(tipos: string[], itens: Datada[], dia: string): { linhas: LinhaVencimento[]; proximo: Proximo } {
  const ate = somarDias(dia, 90);
  const dias = (d: string) => Math.round((Date.parse(d) - Date.parse(dia)) / DIA_MS);
  const no = itens.filter((i) => i.data >= dia && i.data <= ate)
    .sort((a, b) => a.data.localeCompare(b.data) || a.tipo.localeCompare(b.tipo) || a.rotulo.localeCompare(b.rotulo)).slice(0, TETO_VENCIMENTOS);
  const linhas = tipos.map((tipo) => ({ tipo, vencidos: itens.filter((i) => i.tipo === tipo && i.data < dia).length,
    itens: no.filter((i) => i.tipo === tipo).map((i) => ({ dias: dias(i.data), rotulo: i.rotulo })) }));
  const p = no[0];
  return { linhas, proximo: p ? { dias: dias(p.data), rotulo: p.rotulo, tipo: p.tipo } : null };
}

export type EntradaQuadros = {
  /** JSON de `sitesPermitidos` (P0-4). */
  sites: string;
  /** Os sites que o `blocoOt` já leu, sobre o mesmo JSON. */
  lista: { id: string; nome: string; fase: string; obra_ate: string | null }[];
  revalidar: Map<string, string | null>;
  /** A credencial válida que vence por último, por sonda dos sites permitidos. */
  credenciais: { site_id: string; expira_em: string }[];
  gestor: boolean; veSondas: boolean;
};

type LinhaPolitica = { codigo: string; categoria: string; situacao: 'atende' | 'parcial' | 'nao_atende' | 'nao_se_aplica' | null; confirmado_em: string | null;
  proxima_revisao: string | null; evidencia_vencida: number };

export async function quadrosOt(db: D1Database, projectId: string, dia: string, x: EntradaQuadros) {
  const [politica, desvSit, desvMes, ativos, niveis, aceites, acoes] = await db.batch([
    // Um por requisito do catálogo (25 linhas): a mesma leitura que montarAssessment faz para os itens de política.
    db.prepare(`SELECT r.codigo, coalesce(r.categoria, 'Outros') AS categoria, a.situacao, a.confirmado_em, a.proxima_revisao,
        EXISTS (SELECT 1 FROM ot_requisito_evidencias l JOIN evidence e ON e.id = l.evidencia_id AND e.project_id = l.project_id
          WHERE l.project_id = ?1 AND l.requisito_id = r.id AND e.valido_ate IS NOT NULL AND e.valido_ate < ?2) AS evidencia_vencida
      FROM ot_requisitos r LEFT JOIN ot_avaliacoes a ON a.requisito_id = r.id AND a.project_id = ?1
      WHERE r.framework = 'ONS-RO-CB.BR.01' LIMIT ${TETO_LEITURA_OT}`).bind(projectId, dia),
    db.prepare(`SELECT site_id, situacao, count(*) AS n FROM ot_desvios WHERE project_id = ?1 AND ${NO_SITE} GROUP BY site_id, situacao`).bind(projectId, x.sites),
    db.prepare(`SELECT substr(primeira_vez, 1, 7) AS mes, count(*) AS n FROM ot_desvios WHERE project_id = ?1 AND ${NO_SITE} AND substr(primeira_vez, 1, 10) >= ?3
      GROUP BY mes`).bind(projectId, x.sites, `${mesesAtras(dia, 11)}-01`),
    db.prepare(`SELECT count(*) AS arciber, coalesce(sum(${SQL_COMPLETO_4_3_1}), 0) AS completos FROM ot_ativos a
      WHERE a.project_id = ?1 AND a.status = 'ativo' AND a.no_arciber = 1 AND a.${NO_SITE}`).bind(projectId, x.sites),
    db.prepare(`SELECT z.nivel_purdue AS nivel, count(a.id) AS ativos FROM ot_zonas z
      LEFT JOIN ot_ativos a ON a.zona_id = z.id AND a.project_id = z.project_id AND a.status = 'ativo'
      WHERE z.project_id = ?1 AND z.status = 'ativo' AND z.${NO_SITE} GROUP BY z.nivel_purdue ORDER BY z.nivel_purdue`).bind(projectId, x.sites),
    db.prepare(`SELECT site_id, substr(aceito_ate, 1, 10) AS data FROM ot_desvios
      WHERE project_id = ?1 AND ${NO_SITE} AND situacao = 'aceito' AND aceito_ate IS NOT NULL LIMIT ${TETO_LEITURA_OT}`).bind(projectId, x.sites),
    // A ação de um desvio é uma corrective_actions comum ligada por ot_referencias (0115, já usada por ot-desvio-acao.ts).
    db.prepare(`SELECT r.ot_site_id AS site_id, substr(c.due_date, 1, 10) AS data FROM ot_referencias r
        JOIN corrective_actions c ON c.id = r.acao_id AND c.project_id = r.project_id
      WHERE r.project_id = ?1 AND r.ot_desvio_id IS NOT NULL AND r.ot_site_id IN (SELECT value FROM json_each(?2))
        AND COALESCE(c.status, 'Open') <> 'Closed' AND c.due_date IS NOT NULL LIMIT ${TETO_LEITURA_OT}`).bind(projectId, x.sites),
  ]);
  const tecnicos = await conformidadePorSite(db, projectId, x.lista.map((s) => s.id));

  // Conformidade: o mesmo resumo de GET /ot/assessment (resumoDoAssessment) e as barras por categoria da norma.
  const linhas = (politica.results as LinhaPolitica[]).sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
  const itens = linhas.map((r): ItemDoResumo & { categoria: string } => {
    if ((ITENS_TECNICOS as readonly string[]).includes(r.codigo)) {
      return { tipo: 'tecnico', categoria: r.categoria,
        situacao_org: situacaoNaOrganizacao(x.lista.map((s) => ({ fase: s.fase, situacao: tecnicos[s.id]?.[r.codigo]?.situacao ?? 'sem_evidencia' }))) };
    }
    if (r.codigo === EXCECAO) return { tipo: 'excecao', categoria: r.categoria };
    return { tipo: 'politica', categoria: r.categoria, avaliacao: r.situacao ? { situacao: r.situacao, confirmado: !!r.confirmado_em } : null,
      revisar: !!r.evidencia_vencida || (!!r.proxima_revisao && r.proxima_revisao < dia) };
  });
  const parte = (i: ItemDoResumo): 'feito' | 'andamento' | 'falta' | null => i.tipo === 'politica'
    ? (i.avaliacao?.situacao === 'atende' ? 'feito' : i.avaliacao?.situacao === 'parcial' ? 'andamento' : i.avaliacao?.situacao === 'nao_se_aplica' ? null : 'falta')
    : i.tipo === 'tecnico' && i.situacao_org === 'evidencia_no_inventario' ? 'andamento' : 'falta';
  const categorias: Tema[] = [...new Set(itens.map((i) => i.categoria))].map((tema) => {
    const t: Tema = { tema, feito: 0, andamento: 0, falta: 0, conta: CONTA_RO_CB };
    for (const i of itens.filter((k) => k.categoria === tema)) { const p = parte(i); if (p) t[p]++; }
    return t;
  });
  const a = ativos.results[0] as { arciber: number; completos: number };

  // Desvios e exposição: estado de hoje por site, detectados por mês (decisão 7: mês da primeira detecção) e o 4.1.3 somado por site.
  const sit = desvSit.results as { site_id: string; situacao: string; n: number }[];
  const conta = (id: string, ...ss: string[]) => sit.filter((d) => d.site_id === id && ss.includes(d.situacao)).reduce((t, d) => t + Number(d.n), 0);
  const porSiteDesv: Tema[] = x.lista.filter((s) => sit.some((d) => d.site_id === s.id))
    .map((s) => ({ tema: s.nome, feito: conta(s.id, 'regularizado'), andamento: conta(s.id, 'tratado', 'aceito'), falta: conta(s.id, 'aberto'), conta: 'Regularizado / tratado ou aceito / aberto' }));
  const meses = Array.from({ length: 12 }, (_, i) => mesesAtras(dia, 11 - i));
  const porMes = new Map((desvMes.results as { mes: string; n: number }[]).map((r) => [r.mes, Number(r.n)]));
  const fluxos = Object.values(tecnicos).reduce((t, s) => {
    const n = (s['4.1.3']?.numeros ?? {}) as { externos?: number; sem_vpn?: number };
    return { externos: t.externos + Number(n.externos ?? 0), sem_vpn: t.sem_vpn + Number(n.sem_vpn ?? 0) };
  }, { externos: 0, sem_vpn: 0 });

  // Vencimentos de 90 dias: aceite só do Gestor (como o item de 7 dias), credencial só de quem abre a sonda (podeVerCompleto).
  const site = new Map(x.lista.map((s) => [s.id, s.nome]));
  const datadas: Datada[] = [
    ...x.lista.filter((s) => (s.fase === 'em_obra' || s.fase === 'base_em_aprovacao') && s.obra_ate).map((s) => ({ tipo: 'Obra', rotulo: s.nome, data: s.obra_ate! })),
    ...(x.gestor ? (aceites.results as { site_id: string; data: string }[]).map((r) => ({ tipo: 'Aceite de desvio', rotulo: site.get(r.site_id) ?? '', data: r.data })) : []),
    ...[...x.revalidar].filter(([, em]) => !!em).map(([id, em]) => ({ tipo: 'Revalidação dos ativos', rotulo: site.get(id) ?? '', data: em! })),
    ...linhas.filter((r) => r.proxima_revisao).map((r) => ({ tipo: 'Revisão do assessment', rotulo: `Item ${r.codigo}`, data: r.proxima_revisao!.slice(0, 10) })),
    ...(x.veSondas ? x.credenciais.map((k) => ({ tipo: 'Credencial de sonda', rotulo: site.get(k.site_id) ?? '', data: k.expira_em.slice(0, 10) })) : []),
    ...(acoes.results as { site_id: string; data: string }[]).map((r) => ({ tipo: 'Ação de desvio', rotulo: site.get(r.site_id) ?? '', data: r.data })),
  ];
  const tipos = ['Obra', ...(x.gestor ? ['Aceite de desvio'] : []), 'Revalidação dos ativos', 'Revisão do assessment', ...(x.veSondas ? ['Credencial de sonda'] : []), 'Ação de desvio'];
  const v = vencimentosDe(tipos, datadas, dia);

  return {
    proximo: v.proximo,
    conformidade: { resumo: resumoDoAssessment(itens), categorias,
      ativos: { arciber: Number(a.arciber), completos: Number(a.completos), por_nivel: niveis.results as { nivel: number; ativos: number }[] } },
    desvios: { por_site: porSiteDesv, por_mes: meses.map((m) => porMes.get(m) ?? 0), meses, fluxos_externos: fluxos },
    vencimentos: v.linhas,
  };
}
```

- [ ] **Step 5: Ligar no `blocoOt` e na resposta** — `src/services/painel-ot.ts`:
  - acrescente `import { quadrosOt } from './painel-ot-quadros';`;
  - a assinatura vira `export async function blocoOt(db: D1Database, projectId: string, ator: AtorPainelOt, dia: string, agora: Date, detalhe = false) {`;
  - logo depois do `const porSite: LinhaSiteOt[] = …;`:

```ts
  // A credencial válida que vence por último, por sonda dos sites permitidos (a de `vencendo` em ot-sensor.ts).
  const credenciais = sondasLidas.flatMap((s) => { const v = cs.filter((k) => k.sensor_id === s.id).map((k) => k.expira_em).sort(); return v.length ? [{ site_id: s.site_id, expira_em: v[v.length - 1] }] : []; });
  // Quadros (PR3): só no ?modulo=ot e não para o técnico (são da organização); um db.batch + o de conformidadePorSite, nunca por site.
  const quadros = detalhe && papel !== 'tecnico'
    ? await quadrosOt(db, projectId, dia, { sites, lista, revalidar: new Map(lista.map((s) => [s.id, mRev.get(s.id)?.em ?? null])), credenciais, gestor, veSondas })
    : null;
```

  - no `return`, troque `proximo: null as Proximo,` por `proximo: (quadros?.proximo ?? null) as Proximo, quadros,`;
  - `respostaDoOt` inteira:

```ts
export function respostaDoOt(b: BlocoOt, saude: Saude) {
  const q = b.quadros;
  // Leitor (decisão 3): a frase e o resumo da RO-CB em números; nada de desvio, site, sonda ou item por item.
  if (b.papel === 'leitor') return { saude, comecando: b.comecando, ...(q ? { conformidade: { resumo: q.conformidade.resumo } } : {}) };
  const base = { saude, numeros: b.numeros, comecando: b.comecando, por_site: b.porSite };
  if (b.papel === 'tecnico') return base;
  return { ...base, fazer: b.itens, passos: b.passos, ...(q ? { conformidade: q.conformidade, desvios: q.desvios, vencimentos: q.vencimentos } : {}) };
}
```

  `src/services/painel.ts:471`: `const ot = modulos.includes('ot') && atorOt ? await blocoOt(db, projectId, atorOt, dia, new Date(), !!quem.detalheOt) : null;`.

- [ ] **Step 6: Rodar e ver passar**
  Run: `npx vitest run test/painel-ot-quadros.test.ts test/painel-ot-papeis.test.ts test/painel-ot.test.ts test/painel-ot-rota.test.ts test/programa-rota.test.ts test/ot-avaliacao.test.ts test/onda2-numeros.test.ts test/painel.test.ts && npx tsc --noEmit`
  Expected: PASS; mediana de `test/painel.test.ts` < 300 ms.

- [ ] **Step 7: Mutação (oráculo e custo do Início do n.360)** — em `src/services/painel.ts:471` troque `!!quem.detalheOt` por `true`. Rode `npx vitest run test/painel-ot-quadros.test.ts`: FAIL em "o Início do n.360 não consulta os quadros". Desfaça e rode: PASS.

- [ ] **Step 8: Mutação (P0-4, técnico)** — troque `detalhe && papel !== 'tecnico'` por `detalhe` e, em `respostaDoOt`, `if (b.papel === 'tecnico') return base;` por `if (b.papel === 'tecnico') return { ...base, conformidade: q?.conformidade };`. Rode `npx vitest run test/painel-ot-quadros.test.ts`: FAIL em "técnico: nada da organização". Desfaça e rode: PASS.

- [ ] **Step 9: Mutação (aceite só do Gestor; credencial só de quem abre a sonda)** — em `painel-ot-quadros.ts` troque `x.gestor ?` por `true ?` nas duas linhas do aceite (`datadas` e `tipos`). Rode `npx vitest run test/painel-ot-quadros.test.ts`: FAIL em "consultor: obra, revalidação…". Desfaça. Troque `x.veSondas ?` por `true ?` nas duas linhas da credencial e rode o mesmo arquivo: FAIL em "platform_admin (não abre a sonda)…". Desfaça e rode: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/services/painel-ot-quadros.ts src/services/painel-ot.ts src/services/painel.ts src/services/hoje.ts test/painel-ot-quadros.test.ts
git diff --cached --stat
git commit -m "feat(ot): quadros Conformidade, Desvios e Vencimentos no ?modulo=ot (dois batches, sem consulta por site)"
```

### Task 7: Tela — quadros Conformidade, Desvios e exposição, Vencimentos

**Files:**
- Modify: `frontend/src/views/painel-graficos.js:18-41,104-120` (rótulos opcionais; padrão igual), `frontend/src/views/painel.js` (`telaDoOt` e quadros novos)
- Test: `frontend/test/painel-ot.test.js`
- Modify (docs): `CHANGELOG.md`, `AGENTS.md:98`

**Interfaces:**
- Consumes: `modulos.ot.conformidade`, `.desvios`, `.vencimentos` (Task 6).
- Produces: `graficoCobertura(temas, partes = null)` (`partes`: três rótulos no lugar de Concluído/Em andamento/Falta); `graficoPedidos(valores, meses = [], serie = 'Pedidos recebidos', coluna = 'Pedidos')`; em `painel.js`, `quadroConformidade(c)`, `quadroDesvios(x)`, `quadroVencimentosOt(linhas)`.

- [ ] **Step 1: Escrever os testes que falham** — acrescente a `frontend/test/painel-ot.test.js` (e ao import `import { graficoCobertura, graficoPedidos } from '../src/views/painel-graficos.js';`):

```js
const CONF = { resumo: { atende: 1, parcial: 1, nao_atende: 2, nao_se_aplica: 0, nao_avaliado: 21, revisar: 0, a_confirmar: 2 },
    categorias: [{ tema: 'Governança de segurança da informação', feito: 1, andamento: 0, falta: 2, conta: 'c' }],
    ativos: { arciber: 4, completos: 3, por_nivel: [{ nivel: 2, ativos: 3 }, { nivel: 3, ativos: 1 }] } };
const DESV = { por_site: [{ tema: 'SE Norte', feito: 1, andamento: 0, falta: 1, conta: 'x' }], por_mes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3],
    meses: ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'], fluxos_externos: { externos: 2, sem_vpn: 1 } };
const VENC = [{ tipo: 'Obra', vencidos: 0, itens: [{ dias: 12, rotulo: 'SE Sul' }] }, { tipo: 'Ação de desvio', vencidos: 1, itens: [] }];

describe('Painel do n.ot: quadros (PR3)', () => {
    it('equipe: Conformidade (números, barras e ativos do ARCiber), Desvios e exposição e Vencimentos', async () => {
        await abrir(painelOt('equipe', { ...EQUIPE, conformidade: CONF, desvios: DESV, vencimentos: VENC }));
        const conf = el('pn-ot-conf').closest('section');
        expect(conf.textContent).toContain('Não atende');
        expect(conf.textContent).toContain('3 de 4 ativos do ARCiber');
        expect(conf.textContent).toContain('Nível Purdue 2');
        expect(conf.querySelector('.pn-cob')).not.toBeNull();
        const desv = el('pn-ot-desv').closest('section');
        expect(desv.textContent).toContain('1 de 2 fluxos externos sem VPN');
        expect(desv.textContent).toContain('Regularizado');
        expect(desv.querySelector('.pn-spark')).not.toBeNull();
        expect(desv.querySelector('svg[aria-label^="Desvios detectados por mês"]')).not.toBeNull();
        expect(el('pn-venc').closest('section').textContent).toContain('SE Sul');
    });
    it('leitor: só o resumo da Conformidade em números; nada de desvio, vencimento ou barra', async () => {
        await abrir(painelOt('cliente', { conformidade: { resumo: CONF.resumo } }, EM_DIA));
        const conf = el('pn-ot-conf').closest('section');
        expect(conf.textContent).toContain('Atende');
        expect(conf.querySelector('.pn-cob')).toBeNull();
        for (const id of ['pn-ot-desv', 'pn-venc', 'pn-ot-sites']) expect(el(id), id).toBeNull();
        expect(el('c').textContent).not.toMatch(/desvio/i);
    });
    it('vazios com texto, nunca zero falso', async () => {
        const vazio = { resumo: { atende: 0, parcial: 0, nao_atende: 0, nao_se_aplica: 0, nao_avaliado: 0, revisar: 0, a_confirmar: 0 }, categorias: [], ativos: { arciber: 0, completos: 0, por_nivel: [] } };
        await abrir(painelOt('equipe', { ...EQUIPE, conformidade: vazio, desvios: { por_site: [], por_mes: Array(12).fill(0), meses: DESV.meses, fluxos_externos: { externos: 0, sem_vpn: 0 } },
            vencimentos: [{ tipo: 'Obra', vencidos: 0, itens: [] }] }));
        expect(el('pn-ot-conf').closest('section').textContent).toContain('Catálogo da RO-CB.BR.01 ainda não carregado');
        expect(el('pn-ot-desv').closest('section').textContent).toContain('Nenhum desvio');
        expect(el('pn-venc').closest('section').textContent).toContain('Nenhum prazo nos próximos 90 dias');
    });
});

describe('gráficos com rótulos próprios (o padrão não muda)', () => {
    it('graficoCobertura com três rótulos na legenda, no aria-label e na tabela', () => {
        document.body.innerHTML = graficoCobertura([{ tema: 'SE <b>A</b>', feito: 1, andamento: 2, falta: 3, conta: 'x' }], ['Regularizado', 'Tratado ou aceito', 'Aberto']);
        expect(document.querySelector('.pn-cob-leg').textContent).toContain('Tratado ou aceito');
        expect(document.querySelector('svg').getAttribute('aria-label')).toBe('SE <b>A</b>: Regularizado 1, Tratado ou aceito 2, Aberto 3, de 6');
        expect([...document.querySelectorAll('th')].map((t) => t.textContent)).toEqual(['Tema', 'Regularizado', 'Tratado ou aceito', 'Aberto', 'Como se conta']);
    });
    it('graficoPedidos com a série e a coluna próprias', () => {
        document.body.innerHTML = graficoPedidos([1, 2], ['2026-10', '2026-11'], 'Desvios detectados', 'Desvios');
        expect(document.querySelector('svg').getAttribute('aria-label')).toMatch(/^Desvios detectados por mês/);
        expect([...document.querySelectorAll('th')].map((t) => t.textContent)).toEqual(['Mês', 'Desvios']);
    });
});
```

- [ ] **Step 2: Rodar e ver falhar**
  Run: `cd frontend && npx vitest run test/painel-ot.test.js`
  Expected: FAIL — `#pn-ot-conf` nulo; legenda própria ignorada.

- [ ] **Step 3: Rótulos nos gráficos** — `frontend/src/views/painel-graficos.js`. `graficoCobertura` (linhas 17-41) inteira:

```js
/**
 * Cobertura por tema: uma barra 100% por tema, na mesma escala, com o absoluto escrito ao lado ("29 de 38"). `partes` troca os três
 * rótulos (Concluído, Em andamento, Falta) quando a contagem é outra (ex.: desvios regularizados, tratados, abertos).
 */
export function graficoCobertura(temas, partes = null) {
    const lista = Array.isArray(temas) ? temas : [];
    const [rf, ra, rx] = partes || ['Concluído', 'Em andamento', 'Falta'];
    const leg = `<div class="pn-cob-leg" aria-hidden="true"><span><i class="pn-sw pn-f"></i>${e(rf)}</span><span><i class="pn-sw pn-a"></i>${e(ra)}</span><span><i class="pn-sw pn-x"></i>${e(rx)}</span></div>`;
    const linhas = lista.map((t) => {
        const f = Number(t.feito) || 0, a = Number(t.andamento) || 0, x = Number(t.falta) || 0, tot = f + a + x;
        const resumo = !tot ? `${t.tema}: nenhum registro`
            : partes ? `${t.tema}: ${rf} ${f}, ${ra} ${a}, ${rx} ${x}, de ${tot}` : `${t.tema}: ${f} concluídos, ${a} em andamento, ${x} faltam, de ${tot}`;
        // Vão de 0,6 unidade entre as partes (cerca de 2px a 300px de largura).
        let pos = 0;
        const fatias = [[f, 'pn-f'], [a, 'pn-a'], [x, 'pn-x']].filter(([v]) => v > 0);
        const vao = 0.6;
        const util = 100 - vao * (fatias.length - 1);
        const rects = fatias.map(([v, cls]) => {
            const w = (v / tot) * util;
            const r = `<rect class="${cls}" x="${pos.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="10"></rect>`;
            pos += w + vao;
            return r;
        }).join('');
        return `<div class="pn-cob-t">${e(t.tema)}</div>
            <svg class="pn-cob-b" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" tabindex="0" aria-label="${e(resumo)}" data-dica="${e(resumo)}">
                <rect class="pn-trilho" x="0" y="0" width="100" height="10"></rect>${rects}</svg>
            <div class="pn-cob-v">${tot ? `${f} de ${tot}` : 'nenhum'}</div>`;
    }).join('');
    return `${leg}<div class="pn-cob">${linhas}</div>${tabelaEquivalente(['Tema', rf, ra, rx, 'Como se conta'], lista.map((t) => [t.tema, t.feito, t.andamento, t.falta, t.conta]))}`;
}
```

  `graficoPedidos` (linha 104): a assinatura vira `export function graficoPedidos(valores, meses = [], serie = 'Pedidos recebidos', coluna = 'Pedidos') {`; na linha 113 `const resumo = \`Pedidos recebidos por mês…` vira `` const resumo = `${serie} por mês nos últimos 12 meses: de ${Math.min(...v)} a ${Math.max(...v)}; ${ult} neste mês; média de ${mediaTxt}`; ``; na linha 119 `tabelaEquivalente(['Mês', 'Pedidos'], …)` vira `tabelaEquivalente(['Mês', coluna], …)`. O comentário da linha 103 vira "Uma série por mês, 12 meses, com a média (pedidos do titular no n.privacy; desvios detectados no n.ot)."

- [ ] **Step 4: Quadros no painel** — `frontend/src/views/painel.js`, logo antes de `telaDoOt`:

```js
const RESUMO_ROCB = [['atende', 'Atende'], ['parcial', 'Parcial'], ['nao_atende', 'Não atende'], ['nao_se_aplica', 'Não se aplica'], ['nao_avaliado', 'Não avaliado']];

/** Conformidade RO-CB.BR.01: os sete contadores do assessment; para a equipe, as barras por categoria e os ativos do ARCiber (decisão 5). */
function quadroConformidade(c) {
    const r = c.resumo || {};
    const total = RESUMO_ROCB.reduce((t, [k]) => t + (Number(r[k]) || 0), 0);
    if (!total) return quadro('pn-ot-conf', 'Conformidade RO-CB.BR.01', '<p class="pn-vazio-tx">Catálogo da RO-CB.BR.01 ainda não carregado.</p>');
    const numeros = `<dl class="pn-fig">${RESUMO_ROCB.map(([k, rot]) => `<div><dt>${e(rot)}</dt><dd class="pn-num">${e(r[k] ?? 0)}</dd></div>`).join('')}</dl>
        <p class="pn-meta">${e(`${r.a_confirmar ?? 0} a confirmar pelo Gestor ARCiber; ${r.revisar ?? 0} a revisar. Item técnico vem do inventário, que nunca afirma "atende".`)}</p>`;
    const barras = Array.isArray(c.categorias) && c.categorias.length ? graficoCobertura(c.categorias) : '';
    const a = c.ativos;
    const ativos = a ? `<p class="pn-tx">${e(a.arciber ? `${a.completos} de ${a.arciber} ativos do ARCiber com os 6 campos do 4.3.1` : 'Nenhum ativo do ARCiber no inventário.')}</p>
        ${Array.isArray(a.por_nivel) && a.por_nivel.length ? `<dl class="pn-fig">${a.por_nivel.map((n) => `<div><dt>${e(`Nível Purdue ${n.nivel}`)}</dt><dd class="pn-num">${e(n.ativos)}</dd></div>`).join('')}</dl>` : ''}` : '';
    return quadro('pn-ot-conf', 'Conformidade RO-CB.BR.01', `${numeros}${barras}${ativos}`);
}

/** Desvios e exposição: estado de hoje por site, detectados por mês (primeira detecção) e fluxos externos sem VPN (4.1.3). */
function quadroDesvios(x) {
    const sites = Array.isArray(x.por_site) ? x.por_site : [];
    const meses = Array.isArray(x.por_mes) ? x.por_mes : [];
    const detectados = meses.reduce((t, n) => t + (Number(n) || 0), 0);
    const f = x.fluxos_externos || { externos: 0, sem_vpn: 0 };
    const fluxos = `<p class="pn-tx">${e(f.externos ? `${f.sem_vpn} de ${f.externos} fluxos externos sem VPN (4.1.3)` : 'Nenhum fluxo externo registrado no inventário.')}</p>`;
    if (!sites.length && !detectados) return quadro('pn-ot-desv', 'Desvios e exposição', `<p class="pn-vazio-tx">Nenhum desvio. Desvio aparece quando a sonda vê o que a base aprovada não tem.</p>${fluxos}`);
    return quadro('pn-ot-desv', 'Desvios e exposição', `${graficoCobertura(sites, ['Regularizado', 'Tratado ou aceito', 'Aberto'])}
        ${detectados ? graficoPedidos(meses, x.meses, 'Desvios detectados', 'Desvios') : ''}${fluxos}`);
}

/** Vencimentos de 90 dias do n.ot: o rótulo é site ou requisito (o servidor nunca manda ativo nem sonda). */
function quadroVencimentosOt(linhas) {
    const algum = linhas.some((l) => Number(l.vencidos) > 0 || (Array.isArray(l.itens) && l.itens.length));
    return quadro('pn-venc', 'Próximos vencimentos, 90 dias', algum ? graficoVencimentos(linhas) : '<p class="pn-vazio-tx">Nenhum prazo nos próximos 90 dias.</p>');
}
```

  E `telaDoOt` inteira:

```js
function telaDoOt(d, b) {
    const decidir = Array.isArray(d.decisoes) && d.decisoes.length ? [quadro('pn-dec', 'Esperando a sua decisão', listaDecisoes(d.decisoes, '', false))] : [];
    const fazer = Array.isArray(b.fazer) ? [b.comecando ? quadro('pn-passos-t', 'Primeiros passos', passos(b.passos)) : quadro('pn-fazer', 'O que fazer agora', listaFazer(b.fazer, false))] : [];
    const sites = Array.isArray(b.por_site) ? [quadroPorSite(b.por_site)] : [];
    const numeros = Array.isArray(b.por_site) && !b.comecando ? [quadro('pn-ot-num', 'O programa em números', figuras(b, false))] : [];
    const venc = Array.isArray(b.vencimentos) ? [quadroVencimentosOt(b.vencimentos)] : [];
    const conf = b.conformidade ? [quadroConformidade(b.conformidade)] : [];
    const desv = b.desvios ? [quadroDesvios(b.desvios)] : [];
    const esquerda = [...decidir, ...fazer, ...sites, ...venc];
    const direita = [...numeros, ...conf, ...desv];
    return esquerda.length || direita.length ? colunas(esquerda, direita) : '';
}
```

- [ ] **Step 5: Rodar e ver passar**
  Run: `cd frontend && npx vitest run test/painel-ot.test.js test/painel-view.test.js test/painel-regua.test.js && npm run build`
  Expected: PASS (inclusive os testes antigos de `graficoCobertura`/`graficoPedidos` em `painel-view.test.js:503-530`, que travam o padrão); `✓ built in`.

- [ ] **Step 6: Docs** — `CHANGELOG.md`, na seção "n.ot: Painel":

```markdown
- **Quadros do Painel do n.ot:** "Conformidade RO-CB.BR.01" (os mesmos números do assessment, barras por categoria da norma e quantos ativos do ARCiber têm os 6 campos do 4.3.1, por nível Purdue), "Desvios e exposição" (estado de hoje por site, desvios detectados por mês nos últimos 12 meses e fluxos externos sem VPN) e "Próximos vencimentos, 90 dias" (obras, revalidação dos ativos, revisões do assessment, ações dos desvios; aceites de desvio para o Gestor ARCiber; credenciais de sonda para quem abre as sondas). O leitor do cliente vê só o resumo da conformidade em números; o técnico não vê esses quadros. Nada disso aparece no Início do n.360.
```

  `AGENTS.md:98`, no fim do texto acrescentado no Task 4 (sem acentos):

```
Quadros do `?modulo=ot` em `src/services/painel-ot-quadros.ts` (`quadrosOt`): um db.batch de consultas agrupadas por site mais o de `conformidadePorSite`, nunca consulta por site; o resumo da RO-CB usa `resumoDoAssessment` (o mesmo de `GET /ot/assessment`); rotulo de vencimento e nome de site ou codigo de requisito.
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/painel-graficos.js frontend/src/views/painel.js frontend/test/painel-ot.test.js CHANGELOG.md AGENTS.md
git diff --cached --stat
git commit -m "feat(ot): quadros Conformidade, Desvios e Vencimentos no Painel do n.ot (PR3 dos painéis)"
```

- [ ] **Step 8: Entrega do PR3** — `git push -u origin claude/paineis-ot-3`; `gh pr create --title "n.ot: quadros Conformidade, Desvios e Vencimentos (PR3 dos painéis)" --body "<resumo, orçamento de D1 (2 batches), testes rodados>"` com as linhas de atribuição. O dono roda `bash scripts/ci/ship.sh <PR>` antes do merge.

---

## PR4 — Fornecedores e riscos de OT (sem migration; exige 0115/0116 aplicadas)

### Task 8: Fornecedores por papel e mapa de risco do n.ot no servidor **[revisor opus]**

**Files:**
- Modify: `src/services/painel-ot-quadros.ts` (duas consultas no mesmo batch; `fornecedores`, `riscos`), `src/services/painel-ot.ts` (`respostaDoOt`)
- Create: `test/painel-ot-fornecedores.test.ts`

**Decisão registrada (spec, "Não conferido", origem da situação da avaliação do fornecedor):** a situação é a de `situacaoDe(ultima, dia, terceiro_tipo)` (`src/services/terceiros.ts:43-48`) sobre a avaliação **mais recente** de `avaliacoes_terceiro` por `created_at, rowid` — a mesma de `listarTerceiros` (`terceiros.ts:135-160`) e da carteira (`src/services/painel.ts:587`). O painel conta por papel: vigente; pendente (`pendente` ou `reavaliar`); vencida ou reprovada. Só contagem: nenhum nome de fornecedor sai no painel. O escopo é o de `lerFornecedores` (`src/services/ot-fornecedores.ts:52-69`: parte ativa e fornecedora, site permitido, fluxo visível por `FLUXO_VISIVEL`). O mapa de risco usa o escopo de `lerReferencias` (`src/services/ot-referencias.ts:46-66`: site, ativo ou desvio em site permitido; site ou ativo removido esconde).

**Interfaces:**
- Consumes: `situacaoDe`, `SQL_EH_FORNECEDOR`, tipos `Situacao`, `TipoTerceiro`, `Avaliacao` (`src/services/terceiros.ts:11-14,31-48,85`); `FLUXO_VISIVEL` (`src/services/ot-inventario.ts:73`, quatro `?` posicionais); `PapelOt` (`src/services/ot-fornecedores.ts:5`).
- Produces: `quadrosOt(...)` devolve também `fornecedores: { papel: 'integrador' | 'fabricante' | 'acesso_remoto'; total: number; vigentes: number; pendentes: number; vencidos: number; sem_vpn: number }[]` (só papéis com fornecedor) e `riscos: { p: number; i: number; n: number }[]`; `?modulo=ot` equipe e Gestor recebem `fornecedores` e `riscos`; leitor e técnico não.

- [ ] **Step 1: Escrever o teste que falha** — `test/painel-ot-fornecedores.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { diaMaisSP, hojeEmSaoPaulo } from '../src/services/hoje';
import { quadrosOt } from '../src/services/painel-ot-quadros';
import { applySchema, seedTwoProjects, habilitarOt, concederModulos, designarConsultor, sessionFor, workerEnv } from './helpers/d1';

// Fornecedores e riscos de OT no Painel (spec 2026-11-19, PR4). Situação da avaliação = a de terceiros.ts (situacaoDe); escopo de
// lerFornecedores e de lerReferencias (P0-4). Só contagem: nenhum nome de fornecedor sai.
type H = Record<string, string>;
const chamar = (h: H, caminho: string) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv() as any);
const json = async (h: H, caminho: string) => { const r = await chamar(h, caminho); expect(r.status).toBe(200); return (await r.json()) as any; };
const ot = (h: H) => json(h, '/api/v1/projects/proj-a/painel?modulo=ot');
let gestor: H, tecnico: H, leitor: H, cons: H;

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-g', 'g@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'), ('u-t', 't@cliente.teste', 'x', 'Tecnico', 'org_user', 'proj-a'),
      ('u-l', 'l@cliente.teste', 'x', 'Leitor', 'client', 'proj-a')`),
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase, status) VALUES ('s1', 'proj-a', 'SE Norte Exemplo', 'em_operacao', 'ativo'),
      ('s2', 'proj-a', 'SE Sul Exemplo', 'em_operacao', 'ativo'), ('s3', 'proj-a', 'SE Removida Exemplo', 'em_operacao', 'removido')`),
    env.DB.prepare(`INSERT INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES ('u-t', 's1', 'proj-a', 'x')`),
    env.DB.prepare(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES ('z1', 'proj-a', 's1', 'Supervisao', 2)`),
    env.DB.prepare(`INSERT INTO ot_fluxos (id, project_id, site_id, origem_zona_id, externo, via_vpn) VALUES ('f1', 'proj-a', 's1', 'z1', 1, 0)`),
    env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, nome) VALUES ('at2', 'proj-a', 's2', 'Ativo Sul ABC')`),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('fv', 'proj-a', 'organizacao', 'Fornecedora Vigente Exemplo'),
      ('fp', 'proj-a', 'organizacao', 'Fornecedora Pendente Exemplo'), ('fr', 'proj-a', 'organizacao', 'Fornecedora Reprovada Exemplo')`),
    env.DB.prepare(`INSERT INTO avaliacoes_terceiro (id, project_id, parte_id, metodo, resultado, valido_ate, created_at) VALUES
      ('av-antiga', 'proj-a', 'fv', 'questionario', 'reprovado', ?1, '2026-01-01 00:00:00'),
      ('av-nova', 'proj-a', 'fv', 'questionario', 'aprovado', ?1, '2026-06-01 00:00:00'),
      ('av-r', 'proj-a', 'fr', 'questionario', 'reprovado', ?1, '2026-06-01 00:00:00')`).bind(diaMaisSP(200)),
    env.DB.prepare(`INSERT INTO ot_fornecedores (id, project_id, parte_id, papel, ot_site_id, ot_fluxo_id, criado_por) VALUES
      ('o1', 'proj-a', 'fv', 'integrador', 's1', NULL, 'u-g'), ('o2', 'proj-a', 'fp', 'acesso_remoto', NULL, 'f1', 'u-g'),
      ('o3', 'proj-a', 'fr', 'fabricante', 's2', NULL, 'u-g'), ('o4', 'proj-a', 'fr', 'integrador', 's3', NULL, 'u-g')`),
    env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, probability, impact) VALUES ('rk1', 'proj-a', 'a', 't', 4, 5), ('rk2', 'proj-a', 'a', 't', 2, 2),
      ('rk3', 'proj-a', 'a', 't', 1, 1), ('rk4', 'proj-a', 'a', 't', 5, 5)`),
    env.DB.prepare(`INSERT INTO ot_referencias (id, project_id, risk_id, ot_site_id, ot_ativo_id, criado_por) VALUES
      ('rf1', 'proj-a', 'rk1', 's1', NULL, 'u-g'), ('rf2', 'proj-a', 'rk2', NULL, 'at2', 'u-g'), ('rf4', 'proj-a', 'rk4', 's3', NULL, 'u-g')`),
  ]);
  await concederModulos(['u-g', 'u-t', 'u-l'], ['iso', 'ot']);
  await designarConsultor('c@ness.lat', 'proj-a');
  const c = await env.DB.prepare(`SELECT id FROM users WHERE email = 'c@ness.lat'`).first<{ id: string }>();
  await concederModulos([c!.id], ['iso', 'ot']);
  gestor = await sessionFor({ id: 'u-g', email: 'g@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  tecnico = await sessionFor({ id: 'u-t', email: 't@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  leitor = await sessionFor({ id: 'u-l', email: 'l@cliente.teste', role: 'client', client_project_id: 'proj-a' });
  cons = await sessionFor({ id: c!.id, email: 'c@ness.lat', role: 'consultor' });
});

describe('Fornecedores de OT no Painel', () => {
  it('por papel, com a situação da avaliação mais recente; site removido não conta', async () => {
    expect((await ot(cons)).modulos.ot.fornecedores).toEqual([
      { papel: 'integrador', total: 1, vigentes: 1, pendentes: 0, vencidos: 0, sem_vpn: 0 },
      { papel: 'fabricante', total: 1, vigentes: 0, pendentes: 0, vencidos: 1, sem_vpn: 0 },
      { papel: 'acesso_remoto', total: 1, vigentes: 0, pendentes: 1, vencidos: 0, sem_vpn: 1 },
    ]);
  });
  it('os mesmos vínculos que GET /ot/fornecedores devolve à mesma pessoa', async () => {
    const lista = (await json(cons, '/api/v1/projects/proj-a/ot/fornecedores')).fornecedores as { parte_id: string; papel: string }[];
    const doPainel = (await ot(cons)).modulos.ot.fornecedores.reduce((t: number, p: any) => t + p.total, 0);
    expect(new Set(lista.map((f) => `${f.papel}|${f.parte_id}`)).size).toBe(doPainel);
  });
  it('nenhum nome de fornecedor sai no painel', async () => {
    expect(JSON.stringify(await ot(gestor))).not.toContain('Fornecedora');
  });
});

describe('Riscos de OT no Painel', () => {
  it('só riscos ligados a site, ativo ou desvio em site permitido; risco do núcleo sem ligação e site removido ficam fora', async () => {
    const r = (await ot(cons)).modulos.ot.riscos as { p: number; i: number; n: number }[];
    expect(r.reduce((t, c) => t + c.n, 0)).toBe(2);
    expect(r).toEqual(expect.arrayContaining([{ p: 4, i: 5, n: 1 }, { p: 2, i: 2, n: 1 }]));
  });
});

describe('quem vê (P0)', () => {
  it('P0-4 na própria consulta: com só o s2 permitido, só o vínculo e o risco do s2 (o técnico não chega aqui, mas a consulta não confia nisso)', async () => {
    const q = await quadrosOt(env.DB, 'proj-a', hojeEmSaoPaulo(), { sites: JSON.stringify(['s2']), lista: [{ id: 's2', nome: 'SE Sul Exemplo', fase: 'em_operacao', obra_ate: null }],
      revalidar: new Map(), credenciais: [], gestor: false, veSondas: false });
    expect(q.fornecedores.map((p) => p.papel)).toEqual(['fabricante']);
    expect(q.riscos.reduce((t, c) => t + c.n, 0)).toBe(1); // rk2, pelo ativo do s2
  });
  it('leitor e técnico não recebem fornecedores nem riscos; o Início do n.360 também não', async () => {
    for (const h of [leitor, tecnico]) {
      const o = (await ot(h)).modulos.ot;
      expect(o.fornecedores).toBeUndefined();
      expect(o.riscos).toBeUndefined();
    }
    const d = await json(cons, '/api/v1/projects/proj-a/painel');
    expect(d.modulos.ot.fornecedores).toBeUndefined();
    expect(d.modulos.ot.riscos).toEqual([]); // o bloco genérico de sempre, vazio (src/services/painel-ot.ts)
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**
  Run: `npx vitest run test/painel-ot-fornecedores.test.ts`
  Expected: FAIL — `modulos.ot.fornecedores` indefinido.

- [ ] **Step 3: Implementar** — `src/services/painel-ot-quadros.ts`:
  - imports novos:

```ts
import { SQL_EH_FORNECEDOR, situacaoDe, type Avaliacao, type Situacao, type TipoTerceiro } from './terceiros';
import { FLUXO_VISIVEL } from './ot-inventario';
import type { PapelOt } from './ot-fornecedores';
```

    (junte `FLUXO_VISIVEL` ao import existente de `./ot-inventario`);
  - no `db.batch`, a desestruturação vira `const [politica, desvSit, desvMes, ativos, niveis, aceites, acoes, fornecedores, riscos] = await db.batch([` e, depois da consulta das ações, acrescente as duas consultas (todas com `?` posicionais, como `lerFornecedores` e `lerReferencias`):

```ts
    // Fornecedores de OT: o escopo de lerFornecedores (ot-fornecedores.ts) e a avaliação mais recente (a de listarTerceiros). Só contagem sai.
    db.prepare(`SELECT o.parte_id, o.papel, p.terceiro_tipo, av.resultado, av.valido_ate, av.tipo_avaliado,
        coalesce(fx.externo = 1 AND fx.via_vpn = 0, 0) AS sem_vpn
      FROM ot_fornecedores o
      JOIN partes p ON p.id = o.parte_id AND p.project_id = o.project_id AND ${SQL_EH_FORNECEDOR}
      LEFT JOIN ot_sites s ON s.id = o.ot_site_id AND s.status = 'ativo'
      LEFT JOIN ot_fluxos fx ON fx.id = o.ot_fluxo_id
      LEFT JOIN avaliacoes_terceiro av ON av.rowid = (SELECT a2.rowid FROM avaliacoes_terceiro a2 WHERE a2.parte_id = o.parte_id AND a2.project_id = o.project_id
        ORDER BY a2.created_at DESC, a2.rowid DESC LIMIT 1)
      WHERE o.project_id = ?
        AND (o.ot_site_id IS NULL OR s.id IS NOT NULL)
        AND (o.ot_fluxo_id IS NULL OR EXISTS (SELECT 1 FROM ot_fluxos f WHERE f.id = o.ot_fluxo_id AND ${FLUXO_VISIVEL}))
        AND COALESCE(s.id, fx.site_id) IN (SELECT value FROM json_each(?))
      LIMIT ${TETO_LEITURA_OT}`).bind(projectId, projectId, x.sites, x.sites, x.sites, x.sites),
    // Riscos do núcleo ligados ao n.ot: o escopo de lerReferencias (ot-referencias.ts); site ou ativo removido esconde.
    db.prepare(`SELECT k.probability AS p, k.impact AS i, count(*) AS n FROM risks k
      WHERE k.project_id = ? AND k.id IN (SELECT r.risk_id FROM ot_referencias r
          LEFT JOIN ot_sites s ON s.id = r.ot_site_id
          LEFT JOIN ot_ativos a ON a.id = r.ot_ativo_id
          LEFT JOIN ot_sites sa ON sa.id = a.site_id
          LEFT JOIN ot_desvios d ON d.id = r.ot_desvio_id
        WHERE r.project_id = ? AND r.risk_id IS NOT NULL
          AND (r.ot_site_id IS NULL OR s.status = 'ativo') AND (r.ot_ativo_id IS NULL OR (a.status = 'ativo' AND sa.status = 'ativo'))
          AND COALESCE(s.id, a.site_id, d.site_id) IN (SELECT value FROM json_each(?)))
      GROUP BY k.probability, k.impact`).bind(projectId, projectId, x.sites),
```

  - antes do `return`:

```ts
  type LinhaFornecedor = { parte_id: string; papel: PapelOt; terceiro_tipo: TipoTerceiro | null; resultado: Avaliacao['resultado'] | null;
    valido_ate: string | null; tipo_avaliado: string | null; sem_vpn: number };
  const forn = fornecedores.results as LinhaFornecedor[];
  const porPapel = (['integrador', 'fabricante', 'acesso_remoto'] as const).map((papel) => {
    const doPapel = forn.filter((f) => f.papel === papel);
    const situacao = new Map<string, Situacao>();
    for (const f of doPapel) situacao.set(f.parte_id, situacaoDe(f.resultado ? { resultado: f.resultado, valido_ate: f.valido_ate ?? '', tipo_avaliado: f.tipo_avaliado } : null, dia, f.terceiro_tipo));
    const s = [...situacao.values()];
    return { papel, total: situacao.size, vigentes: s.filter((k) => k === 'vigente').length, pendentes: s.filter((k) => k === 'pendente' || k === 'reavaliar').length,
      vencidos: s.filter((k) => k === 'vencida' || k === 'reprovada').length, sem_vpn: new Set(doPapel.filter((f) => f.sem_vpn).map((f) => f.parte_id)).size };
  }).filter((p) => p.total > 0);
```

  - no `return` acrescente `fornecedores: porPapel, riscos: riscos.results as { p: number; i: number; n: number }[],`.

  `src/services/painel-ot.ts`, em `respostaDoOt`, o último `return` vira:

```ts
  return { ...base, fazer: b.itens, passos: b.passos,
    ...(q ? { conformidade: q.conformidade, desvios: q.desvios, vencimentos: q.vencimentos, fornecedores: q.fornecedores, riscos: q.riscos } : {}) };
```

- [ ] **Step 4: Rodar e ver passar**
  Run: `npx vitest run test/painel-ot-fornecedores.test.ts test/painel-ot-quadros.test.ts test/painel-ot-papeis.test.ts test/painel-ot-rota.test.ts test/programa-rota.test.ts test/ot-fornecedores.test.ts test/onda2-numeros.test.ts test/painel.test.ts && npx tsc --noEmit`
  Expected: PASS (o de custo de `painel-ot-quadros` continua: duas consultas a mais no mesmo batch, nenhum batch novo, nada por site).

- [ ] **Step 5: Mutação (P0-4 do fornecedor: site permitido)** — na consulta dos fornecedores, troque `AND COALESCE(s.id, fx.site_id) IN (SELECT value FROM json_each(?))` por `AND ? IS NOT NULL` (mantém o número de binds). Rode `npx vitest run test/painel-ot-fornecedores.test.ts`: FAIL em "P0-4 na própria consulta" (o `o1`, do s1, entra). Desfaça e rode: PASS.

- [ ] **Step 6: Mutação (P0-4 e escopo do risco)** — na consulta dos riscos, troque `AND COALESCE(s.id, a.site_id, d.site_id) IN (SELECT value FROM json_each(?))` por `AND ? IS NOT NULL`. Rode o mesmo arquivo: FAIL em "P0-4 na própria consulta" (o `rk1`, do s1, entra). Desfaça. Depois troque `AND k.id IN (SELECT r.risk_id` por `AND (1 = 1 OR k.id IN (SELECT r.risk_id` e feche o parêntese depois do `IN (…)` correspondente: FAIL em "Riscos de OT…" (conta os 4). Desfaça e rode: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/painel-ot-quadros.ts src/services/painel-ot.ts test/painel-ot-fornecedores.test.ts
git diff --cached --stat
git commit -m "feat(ot): fornecedores por papel e mapa de risco do n.ot no ?modulo=ot"
```

### Task 9: Tela — Fornecedores de OT e Riscos de OT; conferência das migrations antes do merge

**Files:**
- Modify: `frontend/src/views/painel.js` (`telaDoOt`, quadros novos)
- Test: `frontend/test/painel-ot.test.js`
- Modify (docs): `CHANGELOG.md`, `AGENTS.md:98`

**Interfaces:**
- Consumes: `modulos.ot.fornecedores`, `modulos.ot.riscos` (Task 8); `graficoMapa(celulas)` (`frontend/src/views/painel-graficos.js:48`).
- Produces: `quadroFornecedores(lista)` e `quadroRiscosOt(celulas)` em `painel.js`.

- [ ] **Step 1: Escrever os testes que falham** — acrescente a `frontend/test/painel-ot.test.js`:

```js
describe('Painel do n.ot: fornecedores e riscos (PR4)', () => {
    const FORN = [{ papel: 'acesso_remoto', total: 2, vigentes: 0, pendentes: 1, vencidos: 1, sem_vpn: 1 }];
    it('equipe: tabela por papel e mapa de risco', async () => {
        await abrir(painelOt('equipe', { ...EQUIPE, fornecedores: FORN, riscos: [{ p: 4, i: 5, n: 2 }] }));
        const f = el('pn-ot-forn').closest('section');
        expect(f.textContent).toContain('Acesso remoto');
        expect([...f.querySelectorAll('th')].map((t) => t.textContent.trim())).toContain('Em fluxo externo sem VPN');
        expect(el('pn-ot-mapa').closest('section').querySelector('.pn-mapa')).not.toBeNull();
        expect(el('pn-ot-mapa').closest('section').textContent).toContain('2 riscos');
    });
    it('vazios com texto', async () => {
        await abrir(painelOt('equipe', { ...EQUIPE, fornecedores: [], riscos: [] }));
        expect(el('pn-ot-forn').closest('section').textContent).toContain('Nenhum fornecedor de OT');
        expect(el('pn-ot-mapa').closest('section').textContent).toContain('Nenhum risco ligado ao n.ot');
    });
    it('sem as chaves (leitor, técnico), os quadros não existem', async () => {
        await abrir(painelOt('cliente', { conformidade: { resumo: { atende: 1, parcial: 0, nao_atende: 0, nao_se_aplica: 0, nao_avaliado: 0, revisar: 0, a_confirmar: 0 } } }, EM_DIA));
        expect(el('pn-ot-forn')).toBeNull();
        expect(el('pn-ot-mapa')).toBeNull();
    });
});
```

- [ ] **Step 2: Rodar e ver falhar**
  Run: `cd frontend && npx vitest run test/painel-ot.test.js`
  Expected: FAIL — `#pn-ot-forn` nulo.

- [ ] **Step 3: Implementar** — `frontend/src/views/painel.js`, antes de `telaDoOt`:

```js
const PAPEL_FORNECEDOR = { integrador: 'Integrador', fabricante: 'Fabricante', acesso_remoto: 'Acesso remoto' };

/** Fornecedores de OT por papel (só contagem; a lista com nomes fica em "Fornecedores do n.ot"). */
function quadroFornecedores(lista) {
    if (!lista.length) return quadro('pn-ot-forn', 'Fornecedores de OT', '<p class="pn-vazio-tx">Nenhum fornecedor de OT. Ligue um fornecedor a um site ou fluxo em Fornecedores do n.ot.</p>');
    const linhas = lista.map((p) => [e(PAPEL_FORNECEDOR[p.papel] || p.papel), e(p.total), e(p.vigentes), e(p.pendentes), e(p.vencidos), e(p.papel === 'acesso_remoto' ? p.sem_vpn : '—')]);
    return quadro('pn-ot-forn', 'Fornecedores de OT', renderDataTable(['Papel', 'Fornecedores', 'Avaliação vigente', 'Pendente', 'Vencida ou reprovada', 'Em fluxo externo sem VPN'], linhas));
}

/** Mapa de risco dos riscos do núcleo ligados a site, ativo ou desvio do n.ot. */
function quadroRiscosOt(celulas) {
    const n = celulas.reduce((t, c) => t + (Number(c.n) || 0), 0);
    return quadro('pn-ot-mapa', 'Riscos de OT', n ? graficoMapa(celulas) : '<p class="pn-vazio-tx">Nenhum risco ligado ao n.ot. Um risco entra aqui quando é ligado a um site, ativo ou desvio.</p>',
        n ? `<span class="pn-meta">${n} ${n === 1 ? 'risco' : 'riscos'}</span>` : '');
}
```

  Em `telaDoOt`, acrescente antes de `const esquerda`:

```js
    const forn = Array.isArray(b.fornecedores) ? [quadroFornecedores(b.fornecedores)] : [];
    const mapa = Array.isArray(b.riscos) ? [quadroRiscosOt(b.riscos)] : [];
```

  e a linha `const direita = [...numeros, ...conf, ...desv];` vira `const direita = [...numeros, ...conf, ...desv, ...forn, ...mapa];`.

- [ ] **Step 4: Rodar e ver passar**
  Run: `cd frontend && npx vitest run test/painel-ot.test.js test/painel-regua.test.js test/painel-view.test.js && npm run build`
  Expected: PASS; `✓ built in`.

- [ ] **Step 5: Docs** — `CHANGELOG.md`, na seção "n.ot: Painel":

```markdown
- **Fornecedores e riscos de OT no Painel do n.ot:** quantos fornecedores de OT há por papel (integrador, fabricante, acesso remoto), com a avaliação vigente, pendente ou vencida/reprovada, e quantos de acesso remoto estão em fluxo externo sem VPN; e o mapa de risco dos riscos ligados a site, ativo ou desvio. Só para o Gestor ARCiber e a equipe.
```

  `AGENTS.md:98`, no fim do texto do Task 7 (sem acentos):

```
Fornecedores (contagem por papel, situacao por `situacaoDe` de terceiros.ts) e riscos (mapa) do `?modulo=ot` leem `ot_fornecedores` e `ot_referencias` (0115/0116): o painel inteiro cai se essas tabelas faltarem.
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/painel.js frontend/test/painel-ot.test.js CHANGELOG.md AGENTS.md
git diff --cached --stat
git commit -m "feat(ot): quadros Fornecedores e Riscos de OT no Painel do n.ot (PR4 dos painéis)"
```

- [ ] **Step 7: Conferência das migrations em produção (antes do merge, pelo dono)** — regra número um do `AGENTS.md` ("Aplicado só depois de PRAGMA"). O dono roda:

```bash
npx wrangler d1 execute niso-db --remote --command "SELECT name FROM sqlite_master WHERE name IN ('ot_referencias','ot_fornecedores')"
```

  Esperado: 2 linhas. Com menos, **não mergeie**: uma consulta a tabela ausente derruba o `GET /painel?modulo=ot` inteiro (500).

- [ ] **Step 8: Entrega do PR4** — `git push -u origin claude/paineis-ot-4`; `gh pr create --title "n.ot: fornecedores e riscos no Painel (PR4 dos painéis)" --body "<resumo, conferência 0115/0116, testes rodados>"` com as linhas de atribuição. O dono roda `bash scripts/ci/ship.sh <PR>` antes do merge.

---

## PR5 — Plano por onda e alias do Início (esboço; a detalhar quando o dono pedir)

Sem código aqui. O que o PR 5 terá de decidir e cobrir, para o plano detalhado:

- **Migration aditiva** `0119_acao_onda.sql`: coluna `onda INTEGER CHECK (onda IS NULL OR onda IN (1, 2, 3))` em `corrective_actions` (decisão 6, opção A); `severity` segue como prioridade. Backup e `wrangler d1 migrations apply` antes do merge; `publicar.sh` recusa migration pendente.
- **Corpo da ação:** o campo `onda` entra no schema de criação/edição de ação (núcleo, não n.ot); `npm run openapi` regenera `docs/openapi.json` e `mcp-server-niso/src/contrato-gerado.ts`; a ferramenta de ação do agente o aceita. A regra de título de `ot-desvio-acao.ts:6` não muda.
- **Quadro "Plano de tratamento por onda"** no `quadrosOt`: por onda, ações abertas, concluídas e vencidas, só as ligadas ao n.ot por `ot_referencias` (mesmo batch; nada por site); equipe e Gestor.
- **Início do n.ot vira alias do Painel** (decisão 2), só depois de comparar "Espera por você" (`frontend/src/views/ot-inicio.js:17-67`, que inclui itens do técnico: rascunhos e lote recusado) com o "O que fazer" do servidor; o que faltar entra em `blocoOt` antes do alias. Some o fan-out de 3 chamadas por site (`ot-inicio.js:86-89`); `?ot=inicio` e links antigos abrem o Painel.
- Testes: P0-1/P0-2 da ação com `onda` (quem não tem `ot` não vê ação ligada ao n.ot de forma nova), 150 sites, `onda2-numeros` intocado.

---

## Self-Review

**1. Cobertura do spec**

| Requisito do spec | Onde |
|---|---|
| Tela "Painel" no n.ot pelo mesmo `telaDoModulo`, menu, endereço, P0 tela | Task 1 |
| Topo (frase, régua, próximo passo), "O que fazer", vazio "Cadastrar o primeiro site" | Tasks 1 e 4 |
| Decisão 1: Gestor com `fazer` só no `?modulo=ot`; n.360 igual | Task 3 (teste e mutação) |
| Quadro Por site (fase, passo, desvios, sonda só `podeVerCompleto`, revalidar, obra) | Tasks 2 e 4 |
| Decisão 3: leitor = frase, régua sem Abrir, resumo da Conformidade em números | Tasks 3, 4, 6, 7 |
| Decisão 4: técnico = régua e Por site dos sites dele, nenhum total do projeto | Tasks 2, 3, 6 |
| Conformidade RO-CB (barras por categoria, "inventário nunca afirma atende", resumo = `/ot/assessment`) | Tasks 5, 6, 7 |
| Decisão 5: agregados de ativos (4.3.1 do ARCiber, por nível Purdue) = `/ot/indicadores`, só no Painel | Tasks 6, 7 |
| Desvios e exposição (estado por site, por mês de primeira detecção, fluxos externos sem VPN) | Tasks 6, 7 |
| Vencimentos 90 dias (obra, aceite só Gestor, revalidação, revisão, credencial só `podeVerCompleto`, ação do desvio); rótulo site/código | Tasks 6, 7 |
| Fornecedores e riscos de OT; 0115/0116 em produção | Tasks 8, 9 |
| Orçamento: dois `db.batch` a mais, nada por site, teste de 150 sites | Task 6 (custo) e Task 8 (reexecução) |
| Sem cache no servidor; 60 s de `S.painel` | inalterado (nenhum task mexe) |
| Sem rota nova; OpenAPI e MCP sem diff | Task 3, Step 8 |
| Decisão 8: Acessos fora do Painel | nenhum quadro de acessos; só a credencial nos vencimentos |
| Decisões 2 e 6 (alias do Início, plano por onda) | PR5, esboço |

Fora do plano por decisão do dono (frase dele para a decisão 4: "régua e Por site dos sites dele"): os itens do técnico (rascunhos, lote recusado) no "O que fazer" do servidor. Ficam no Início do n.ot ("Espera por você") e entram na comparação do PR 5.

**2. Placeholders:** nenhum "TBD"/"TODO"; todo passo de código traz o código. Os corpos de PR (`gh pr create --body "<…>"`) são texto que o executor escreve com o que rodou, não código.

**3. Consistência de nomes:** `PapelPainelOt`, `EstadoSonda`, `LinhaSiteOt`, `BlocoOt`, `respostaDoOt(b, saude)` (Task 2) são os usados nos Tasks 3, 6 e 8; `blocoOt(..., detalhe = false)` (Task 6) é o chamado em `painel.ts:471` e no teste de custo; `quadrosOt(db, projectId, dia, EntradaQuadros)` e o retorno `{ proximo, conformidade, desvios, vencimentos, fornecedores, riscos }` batem com `respostaDoOt`; no front, os ids `pn-ot-num`, `pn-ot-sites`, `pn-ot-conf`, `pn-ot-desv`, `pn-venc`, `pn-ot-forn`, `pn-ot-mapa` são os dos testes. `PapelOt` (de `ot-fornecedores.ts`, o papel do fornecedor) e `PapelPainelOt` (o papel de quem lê) são nomes distintos de propósito.

## Reconferido contra o spec (base `c2cb93d`)

- `src/services/programa.ts` encolheu (119 linhas): `ETAPA_DO_PASSO_OT` em 44-46, `TEXTO_OT` em 47-50, `etapasDoOt` em 57-70 (o spec citava 139-165).
- `src/services/ot-inventario.ts`: `podeEditarOt` 27, `podeVerCompleto` 45-51, `sitesPermitidos` 64-70, `FLUXO_VISIVEL` 73-77 (iguais ao spec).
- `src/routes/painel.ts`: `semOt` 28-29, chamada 38; `src/services/painel.ts`: `QuemPede` 443, `painelDoProjeto` 445-517, laço dos módulos 486-495 (o spec citava 477 e 491-492: o miolo andou duas linhas); carteira 566-644.
- `frontend/src/views/painel.js`: `regua` 129-139, `reguaDe` 149, `telaDoModulo` 203-237, `renderPainel` 483, `painelAbrir` 528-542 (o spec citava 202-235).
- `frontend/src/views/ot.js`: `TITULOS`/`MONTAR` 32-33, laço do menu 71, `window.otTela` 84; `frontend/login.html:300-303`; `frontend/src/produto.js:33,466`; `frontend/src/ot-navegacao.js:3` (iguais).
- `src/services/ot-avaliacao.ts`: `PIOR`/`CONTAM` 26-27, resumo 96-105 (a regra é a do spec; vira função pura no Task 5).
- O mapa de risco e as ações dos desvios leem `ot_referencias` (0115), que a `main` já usa em `src/services/ot-desvio-acao.ts:24-35`; por isso as ações dos desvios ficam no PR 3 e só fornecedores e riscos no PR 4.
- Testes que travam o comportamento antigo e mudam por decisão aprovada (não são regressão): `test/painel-ot-rota.test.ts:50-54` (decisão 1) e `test/painel-ot.test.ts:66-68` (decisão sobre sondas). As listas fechadas do menu em `frontend/test/ot-modulo.test.js:34`, `frontend/test/produto.test.js:103` e `frontend/test/ot-navegacao.test.js:30` ganham `painel`.

**Resolvido no plano (era "Não conferido" no spec):** origem da situação do fornecedor (`situacaoDe` sobre a avaliação mais recente, `terceiros.ts:43-48`, como `listarTerceiros` e a carteira); divergência `podeEditarOt` × `podeVerCompleto` nas sondas (vale `podeVerCompleto`, com teste e mutação, Task 2).

**Continua não conferido:** estado de 0115/0116 em produção (o dono informou que estão aplicadas; o Task 9, Step 7, confere antes do merge); se algum `client` tem `ot` em produção; uso real de cada tela; tempo real das consultas novas no D1 de produção (o teste de 150 sites mede contagem de consultas, não tempo); os testes deste plano não foram rodados ao escrevê-lo.
