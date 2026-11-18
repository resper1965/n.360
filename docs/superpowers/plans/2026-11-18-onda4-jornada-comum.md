# Onda 4: jornada comum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** As mesmas cinco etapas (Começar, Levantar, Avaliar, Tratar, Operar) em todo módulo, com o n.iso reduzido a Painel + Jornada (Prontidão como aba), a trilha do n.privacy na tela e um caminho único da organização criada até o primeiro passo de cada módulo, sem regredir nenhuma proteção do n.ot.

**Architecture:** Derivação pura (decisão 9, opção F-A): catálogo estático `src/data/programa.ts` e funções puras em `src/services/programa.ts` que leem o que já existe (`carregarContexto` + `montarBancada` do n.iso, `visaoDoEncarregado` do n.privacy, `situacaoDoSite` por site permitido do n.ot). O resultado sai como campo novo `programa.etapas` no `GET /projects/:id/painel` (sem rota nova, sem tabela, sem migration); o n.ot só entra quando o painel já montou o bloco `ot` (P0-1/P0-2) e só com os sites de `sitesPermitidos` (P0-4). As telas que saem (`monitor`, `certification`) viram alias numa lista fechada do frontend (`ALIAS_DE_TELA` em `frontend/src/produto.js`), lida pelo `navigate` e pelo `pedidoDoHub`.

**Tech Stack:** Cloudflare Worker (Hono) + D1, vitest (`@cloudflare/vitest-pool-workers` no backend, jsdom no frontend), SPA vanilla JS (Vite).

**Spec:** `docs/superpowers/specs/2026-11-18-onda4-jornada-comum-design.md` (aprovada pelo dono com "Siga"; decisões 1 a 9 finais). Levantamento (arquivo:linha e comandos, sobre o HEAD `41ab4fc`): `/tmp/claude-0/-home-user/0c1d5499-e055-503d-a651-849433c76e01/scratchpad/onda4-levantamento.md`. Toda referência arquivo:linha deste plano foi reconferida no HEAD `c4c7039`.

## Global Constraints

- **Os três números do cliente não mudam:** `test/onda2-numeros.test.ts` **nunca é editado** e roda verde em todo task que toca `src/services/painel*.ts` (`git diff --stat c4c7039 -- test/onda2-numeros.test.ts` vazio em todo commit).
- **P0-1:** `ot` nunca é concedido nem pré-marcado automaticamente para uma pessoa; módulo no projeto **e** na pessoa.
- **P0-2:** agente MCP e chave de API nunca recebem nada do n.ot (`semOt` em `src/routes/painel.ts:27-28`).
- **P0-4:** todo dado de site passa por `sitesPermitidos` (`src/services/ot-inventario.ts:64`).
- **A régua comum não desenha nem conta uma etapa do n.ot para quem não o tem:** `programa.etapas` sem a chave `ot`, nenhum total que inclua sites, nenhum texto com "site" ou "desvio".
- **O frontend não pede nada do n.ot sem o módulo** (teste com dublê de API que falha se a URL tiver `/ot`).
- **Nenhuma rota de API some; nenhuma rota nova nesta onda.** O agente (MCP) não perde nada. `contrato-isolamento-org` e `contrato-tela-api` (varreduras automáticas) ficam verdes.
- **Links antigos viram alias, nunca 404 nem tela em branco:** `?tela=monitor` e `?tela=certification` (e-mail, aviso, link salvo) abrem a Jornada (a segunda na aba Prontidão).
- **O GET da Bancada grava** (`materializarLegado`, `gravarSituacoes`: `src/routes/passos.ts:36-37`): o programa usa só as funções puras de estado, nunca a rota nem essas duas funções.
- **"Primeiros passos" do painel continuam** saindo quando `comecando` fica falso (`frontend/src/views/painel.js:190`); a régua aparece nos dois estados.
- **Fronteira do n.iso numa constante só** (`FASES_DO_ISO`): Começar 0-6, Levantar 7-8, Avaliar 9-10, Tratar 11-28, Operar 29-40, com teste de que cada fase 0-40 cai em exatamente uma etapa.
- **Skill e gerado juntos:** `agent-skills/implantacao-privacy/SKILL.md` e `src/mcp/skills-gerado.ts` (`npm run skills:gerar`) no mesmo commit; `test/agente-skills.test.ts:18` cobra a igualdade.
- **Contrato:** `npm run openapi` depois de mudar a forma do `/painel`; commite o que mudar em `docs/openapi.json` e `mcp-server-niso/src/contrato-gerado.ts` (hoje o OpenAPI só descreve corpo de requisição, então a esperança é diff vazio: confira e registre).
- **Frontend:** `data-action` (delegação em `frontend/src/delegation.js`), nada de handler nem estilo inline novo (CSP; classes novas em `frontend/src/style.css`), `escapeHTML` em todo dado do servidor, textos em português.
- **AGENTS.md sem acentos** quando editado; CHANGELOG e telas com acentos.
- **Migrations: nenhuma nesta onda.**
- Comandos: backend `npx vitest run <arquivos>`; frontend `cd frontend && npx vitest run <arquivos>`; build `cd frontend && npm run build`; tipos `npx tsc --noEmit`; contrato `npm run openapi`; skills `npm run skills:gerar`; portão `bash scripts/ci/gate.sh` (só na máquina de quem mergeia).
- **Revisão em modelo forte (opus)** nos tasks marcados **[revisor opus]**: o filtro P0 do painel (Task 7), a skill (Task 12) e convites/módulos por pessoa (Tasks 14 e 15).
- **Fora deste plano:** reescrever a trilha de 132 passos, marca manual por etapa (F-B), plano diretor/iniciativas, autoatendimento e cobrança, unificar as guardas de arquivo, traduzir status no banco.
- Cinco PRs, o de menor risco primeiro: **PR1** = Tasks 1-3; **PR2** = Tasks 4-5; **PR3** = Tasks 6-9; **PR4** = Tasks 10-13; **PR5** = Tasks 14-17.

## Preflight (antes do Task 1 e ao retomar)

- [ ] `cd /home/user/n.360 && git status --short && git log --oneline -3`: árvore limpa; HEAD contém `c4c7039` (`git merge-base --is-ancestor c4c7039 HEAD`).
- [ ] **Retomar (o contêiner pode reiniciar e matar o agente):** o estado está no git. `git log --oneline c4c7039..HEAD` lista os tasks feitos pelo assunto do commit de cada um (os assuntos estão no último passo de cada task). Comece pelo primeiro task cujo commit não aparece. Se houver mudança não commitada, `git diff --stat` e decida: o diff é do task em curso (continue dele) ou lixo (descarte só os caminhos daquele task).
- [ ] **Higiene de commit (lição da onda 3):** `git add` só com os caminhos listados em **Files** do task; nunca `git add -A`/`git add .`; antes de commitar, `git diff --cached --stat` mostra só esses caminhos. Nunca inclua arquivo de outro agente.
- [ ] **Suíte do backend inteira não termina no contêiner da nuvem em 10 min (lição da onda 3):** rode só os arquivos listados no passo de verificação do task (já incluem os de isolamento afetados). A suíte inteira é do `gate.sh`, na entrega do PR.
- [ ] **Task que toca o frontend:** rode os arquivos de teste do frontend listados (inteiros, não só o caso novo) e `cd frontend && npm run build` (esperado: `✓ built in`).
- [ ] Ambiente: `node -v` (≥ 20), `ls node_modules/.bin/vitest frontend/node_modules/.bin/vitest` (se faltar: `npm ci` e `cd frontend && npm ci`).

## File Structure

- `frontend/src/produto.js`: `ALIAS_DE_TELA`, `aliasDaTela` (lista fechada de telas que saíram); `SO_ISO` e `TELAS_DOS_MODULOS` sem `monitor`/`certification`.
- `frontend/src/router.js`: `navigate` resolve o alias e põe `S.jornadaAba`; sem os ramos `monitor` e `certification` no `render`.
- `frontend/login.html`: sem `nav-monitor` e `nav-certification`.
- `frontend/src/bancada/grade.js` (novo): `htmlDaGrade(catalogo, fases)`, a grade etapa × fase que era do Monitor.
- `frontend/src/views/bancada.js`: o topo da Jornada ganha a grade.
- `frontend/src/views/monitor.js`: perde `renderMonitor`, `renderPortfolio`, `showGapAnalysis`, `exportarCsvNiso`, `monitorAbrirFase` (o arquivo fica: hospeda Métricas, Governança, Contexto, Partes, Análise crítica e Ativos).
- `frontend/src/views/jornada.js` (novo): `renderJornada`, as abas "Plano de trabalho" e "Prontidão para certificar".
- `src/data/programa.ts` (novo): `ETAPAS_COMUNS`, `EtapaComum`, `FASES_DO_ISO`, `etapaDaFase`; depois `CRITERIOS_PRIVACY`, `PASSOS_PRIVACY`.
- `src/services/programa.ts` (novo): `primeiroMarco`, `etapasDoIso`, `etapasDoOt`, `etapasDoPrivacy`, `etapasDoPrograma`.
- `src/services/painel.ts` / `src/services/painel-ot.ts`: `programa.etapas`, marco do n.ot.
- `frontend/src/views/painel.js`: régua (`regua`), trilha do n.privacy, `window.painelAbrirProximo`.
- `agent-skills/implantacao-privacy/SKILL.md` + `src/mcp/skills-gerado.ts`.
- `frontend/src/views/empresa.js`: passos 5 ("Pessoas e acessos") e 6 ("Primeiros passos") do assistente.
- `frontend/src/views/organizacoes.js`: "Criar o primeiro projeto" e `window.tipoOrgAtuacao`.
- Testes novos: `frontend/test/bancada-grade.test.js`, `frontend/test/jornada-abas.test.js`, `frontend/test/painel-regua.test.js`, `frontend/test/onboarding-encadeado.test.js`, `test/programa.test.ts`, `test/programa-rota.test.ts`, `test/passos-telas-alias.test.ts`, `test/onboarding-rotas.test.ts`.

---

## PR1 — Limpeza do n.iso: Monitor fora (sem migration)

### Task 1: Grade etapa × fase no topo da Jornada

**Files:**
- Create: `frontend/src/bancada/grade.js`, `frontend/test/bancada-grade.test.js`
- Modify: `frontend/src/views/bancada.js:1-10` (import), `frontend/src/views/bancada.js:138-154` (`desenharTopo`), `frontend/src/style.css` (fim do arquivo)

**Interfaces:**
- Consumes: `STATUS_DA_FASE`, `escapeHTML` (`frontend/src/ui.js:304`); `window.bancadaAbrirFase(n)` (`frontend/src/views/bancada.js:170`); `S.passosCatalogo` (`{ etapas: [{ id, nome, resumo, fases: number[] }], fases: [{ numero, titulo }] }`) e `S.bancada.fases` (`[{ numero, situacao, bloqueio }]`), formatos de `contracts/bancada/catalogo.json` e `contracts/bancada/bancada.json`.
- Produces: `export function htmlDaGrade(catalogo, fases): string` — um `<details class="bancada-grade">` com legenda e um `<button class="roadmap-node {situacao}" data-action="bancadaAbrirFase" data-args="[n]">` por fase.

- [ ] **Step 1: Escrever o teste que falha** — `frontend/test/bancada-grade.test.js`:

```js
// A grade etapa × fase saiu do Monitor (onda 4, PR1) e vive no topo da Jornada. Situação em texto (legenda, rótulo, dica), nunca só cor.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, baixarArquivo: vi.fn(), API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/project.js';
import '../src/views/monitor.js';
import '../src/views/bancada.js';
import { htmlDaGrade } from '../src/bancada/grade.js';
import catalogo from '../../contracts/bancada/catalogo.json';
import bancada from '../../contracts/bancada/bancada.json';
import passoJson from '../../contracts/bancada/passo.json';

const CAT = { etapas: [{ id: 1, nome: 'Mobilização e diagnóstico', resumo: 'Entrevistas e escopo', fases: [1, 2] }],
    fases: [{ numero: 1, titulo: 'Entrevistas' }, { numero: 2, titulo: 'Escopo <b>x</b>' }] };

describe('htmlDaGrade', () => {
    it('uma linha por etapa, um botão por fase, situação em texto e bloqueio com motivo e responsável', () => {
        document.body.innerHTML = htmlDaGrade(CAT, [{ numero: 1, situacao: 'completed' },
            { numero: 2, situacao: 'blocked', bloqueio: { motivo: 'Aguardando a diretoria', responsavel: 'Maria Souza' } }]);
        expect(document.querySelector('details.bancada-grade summary').textContent).toBe('Fases por etapa');
        expect(document.querySelector('.roadmap-j-name').textContent).toBe('Mobilização e diagnóstico');
        expect(document.querySelector('.roadmap-j-pct').textContent).toBe('1 de 2 fases');
        expect(document.querySelector('.roadmap-legenda').textContent).toContain('Bloqueada');
        const no = document.querySelector('.roadmap-node.blocked');
        expect(no.tagName).toBe('BUTTON');
        expect(no.getAttribute('aria-label')).toBe('Fase 2: Escopo <b>x</b> (Bloqueada: Aguardando a diretoria, responsável Maria Souza)');
        expect(no.dataset.action).toBe('bancadaAbrirFase');
        expect(no.dataset.args).toBe('[2]');
        expect(document.querySelector('.roadmap-node b')).toBeNull(); // título escapado
        expect(document.body.innerHTML).not.toMatch(/style=/);       // CSP: nada de estilo inline
    });
    it('fase sem estado no retrato conta como não iniciada', () => {
        document.body.innerHTML = htmlDaGrade(CAT, []);
        expect([...document.querySelectorAll('.roadmap-node.pending')].length).toBe(2);
        expect(document.querySelector('.roadmap-j-pct').textContent).toBe('0 de 2 fases');
    });
});

describe('a Jornada mostra a grade no topo', () => {
    beforeEach(() => {
        apiMock.mockReset();
        const PROJ = { id: 'p1', client_name: 'Cliente Ficticio', project_name: 'Adequação', modulos: ['iso'] };
        S.user = { id: 'u1', role: 'consultor' };
        S.activeProject = PROJ; S.currentProject = PROJ; S.projects = [PROJ];
        S.passosCatalogo = null; S.bancadaAlvo = null;
        window.ehEquipeNess = () => true;
        apiMock.mockImplementation(async (m, url) => {
            if (url === '/api/v1/projects/p1/bancada') return bancada;
            if (url === '/api/v1/passos/catalogo') return catalogo;
            if (url === '/api/v1/projects/p1/prontidao') return null;
            if (/\/passos\/p3_\d$/.test(url)) return passoJson;
            return [];
        });
    });
    it('o #bancada-topo traz a grade com as etapas do catálogo', async () => {
        document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
        await window.renderProjectDetail(document.getElementById('c'), document.getElementById('h'), document.getElementById('a'));
        const topo = document.getElementById('bancada-topo');
        expect(topo.querySelector('details.bancada-grade')).not.toBeNull();
        expect(topo.textContent).toContain(catalogo.etapas[0].nome);
    });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx vitest run test/bancada-grade.test.js` → FAIL (`Failed to resolve import "../src/bancada/grade.js"`).

- [ ] **Step 3: Implementar** — `frontend/src/bancada/grade.js`:

```js
import { escapeHTML, STATUS_DA_FASE } from '../ui.js';

/**
 * A grade etapa × fase (saiu do Monitor na onda 4): uma linha por etapa do catálogo, um botão por fase com a situação em texto
 * (legenda, rótulo e dica), nunca só em cor. Clicar abre a fase na trilha (`bancadaAbrirFase`). `fases` vem de GET /bancada.
 */
export function htmlDaGrade(catalogo, fases) {
    const porFase = new Map((fases || []).map((f) => [f.numero, f]));
    const tituloDe = (n) => ((catalogo.fases || []).find((x) => x.numero === n) || {}).titulo || `Fase ${n}`;
    const etapas = (catalogo.etapas || []).map((etapa) => {
        const feitas = etapa.fases.filter((n) => (porFase.get(n) || {}).situacao === 'completed').length;
        const nos = etapa.fases.map((n) => {
            const f = porFase.get(n) || { numero: n, situacao: 'pending', bloqueio: null };
            const base = STATUS_DA_FASE[f.situacao] || f.situacao;
            const situacao = f.situacao === 'blocked' && f.bloqueio ? `${base}: ${f.bloqueio.motivo}, responsável ${f.bloqueio.responsavel}` : base;
            return `<button type="button" class="roadmap-node ${escapeHTML(String(f.situacao))}" aria-label="${escapeHTML(`Fase ${n}: ${tituloDe(n)} (${situacao})`)}" data-action="bancadaAbrirFase" data-args='${escapeHTML(JSON.stringify([n]))}'>${n}<span class="tooltip"><strong>Fase ${n}:</strong> ${escapeHTML(tituloDe(n))}<br>Situação: ${escapeHTML(situacao)}</span></button>`;
        }).join('');
        return `<div class="roadmap-j-card"><div class="roadmap-j-header"><div><div class="roadmap-j-name">${escapeHTML(etapa.nome)}</div><div class="roadmap-j-desc">${escapeHTML(etapa.resumo)}</div></div>
            <div class="roadmap-j-pct">${feitas} de ${etapa.fases.length} fases</div></div><div class="roadmap-nodes-row">${nos}</div></div>`;
    }).join('');
    const legenda = `<p class="roadmap-legenda">${Object.entries(STATUS_DA_FASE).map(([k, v]) => `<span><span class="roadmap-node roadmap-amostra ${k}" aria-hidden="true"></span>${escapeHTML(v)}</span>`).join('')}</p>`;
    return `<details class="bancada-grade"><summary>Fases por etapa</summary><div class="roadmap-container">${legenda}<div class="roadmap-grid">${etapas}</div></div></details>`;
}
```

  Em `frontend/src/views/bancada.js`, junto dos outros imports de `../bancada/*` (linhas 6-10): `import { htmlDaGrade } from '../bancada/grade.js';`. Em `desenharTopo` (linha 138), a template string que vai para `document.getElementById('bancada-topo').innerHTML` termina em `]) : ''}\`;` (linha 154): troque o fim por `]) : ''}
        ${S.passosCatalogo ? htmlDaGrade(S.passosCatalogo, b.fases) : ''}\`;`. Em `frontend/src/style.css`, no fim:

```css
/* Jornada (onda 4): a grade etapa × fase que era do Monitor, recolhida no topo da Bancada */
.bancada-grade { margin: 8px 0 12px; }
.bancada-grade > summary { cursor: pointer; font-weight: 600; }
```

- [ ] **Step 4: Rodar e ver passar** — `cd frontend && npx vitest run test/bancada-grade.test.js test/jornada-prontidao.test.js test/bancada-monitor.test.js` → PASS; `cd frontend && npm run build` → `✓ built in`.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/bancada/grade.js frontend/src/views/bancada.js frontend/src/style.css frontend/test/bancada-grade.test.js
git commit -m "feat(iso): grade etapa x fase no topo da Jornada (sai do Monitor)"
```

### Task 2: Monitor fora do menu; `monitor` vira alias da Jornada

**Files:**
- Modify: `frontend/src/produto.js:24` (`SO_ISO`), `frontend/src/produto.js:133-136` (`TELAS_DOS_MODULOS`), `frontend/src/produto.js:197-223` (`pedidoDoHub`), `frontend/src/router.js:1-2,7-8,37,96`, `frontend/login.html:406-409`, `frontend/src/views/monitor.js:22-165,1795-1798,1810`, `frontend/src/views/dashboard.js:79`
- Modify (testes): `frontend/test/router.test.js:13-16,25-27`, `frontend/test/casca-menu.test.js:62`, `frontend/test/erro-de-carga.test.js:64`, `frontend/test/jornada-prontidao.test.js:1-3,51-60`, `frontend/test/produto.test.js` (bloco `pedidoDoHub`, linha 307), `frontend/test/casca-router.test.js` (bloco `n.360 é o hub`), `frontend/test/dashboard-view.test.js`
- Delete: `frontend/test/monitor-view.test.js` (a grade está coberta pelo Task 1; o vazio sem fases por `jornada-prontidao.test.js:84-95`; o resto é do Monitor que sai)

**Interfaces:**
- Consumes: nada de task anterior.
- Produces: `export const ALIAS_DE_TELA = { monitor: { tela: 'project-detail' } }` e `export const aliasDaTela = (tela) => ({ tela, jornadaAba? } | null)` em `frontend/src/produto.js` (o Task 4 acrescenta `certification`). `navigate(view)` com `view` em `ALIAS_DE_TELA` vai à tela de destino; no n.360, leva o nome antigo no `?tela=` (o módulo resolve de novo no boot).

- [ ] **Step 1: Escrever os testes que falham.**

  `frontend/test/router.test.js`: em `IDS_SIDEBAR` (linhas 13-16) tire `'nav-monitor'`; em `VIEWS` (linha 26) tire `'renderMonitor'`; acrescente dentro de `describe('navigate()')`:

```js
    describe('telas que saíram viram alias (onda 4)', () => {
        it('"monitor" (link antigo, e-mail, aviso) abre a Jornada e destaca nav-project', () => {
            navigate('monitor');
            expect(S.view).toBe('project-detail');
            expect(globalThis.renderProjectDetail).toHaveBeenCalled();
            expect(itemAtivo().id).toBe('nav-project');
        });
    });
```

  `frontend/test/produto.test.js`, dentro de `describe('pedidoDoHub ...')`:

```js
    it('tela que saiu (?tela=monitor) é aceita no módulo dela e mantém o nome antigo: o navigate resolve o alias', () => {
        ir('/iso?tela=monitor');
        expect(pedidoDoHub()).toEqual({ tela: 'monitor', aba: null });
        expect(location.search).toBe('');
        ir('/privacy?tela=monitor');
        expect(pedidoDoHub()).toBeNull();
    });
    it('alias é lista fechada: __proto__ e constructor não passam', async () => {
        const { aliasDaTela } = await import('../src/produto.js');
        expect(aliasDaTela('monitor')).toEqual({ tela: 'project-detail' });
        for (const t of ['__proto__', 'constructor', 'toString', '', undefined]) expect(aliasDaTela(t), String(t)).toBeNull();
    });
```

  `frontend/test/casca-router.test.js`, dentro de `describe('n.360 é o hub')`:

```js
    it('alias no n.360: "monitor" sai para o n.iso com o nome antigo no endereço', () => {
        ir('/');
        navigate('monitor');
        expect(irPara).toHaveBeenCalledWith('/iso?tela=monitor');
        expect(globalThis.renderProjectDetail).not.toHaveBeenCalled();
    });
```

  `frontend/test/dashboard-view.test.js`, dentro de `describe('renderDashboard — onboarding do cliente')`:

```js
  it('o texto da fase 3 não promete "41 fases" (o número é da trilha, não do cliente)', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'client', comercial_ativo: true };
    await window.renderDashboard(c, h, a);
    expect(c.textContent).not.toContain('41 fases');
    expect(c.textContent).toContain('jornada de adequação');
  });
```

  `frontend/test/casca-menu.test.js:62`: troque por `'group-impl: nav-project=Jornada, nav-certification=Prontidão, nav-soa=SoA, nav-governance=Papéis e comitê',`. `frontend/test/erro-de-carga.test.js:64`: tire `'renderMonitor', 'renderPortfolio',`. `frontend/test/jornada-prontidao.test.js`: no comentário das linhas 1-3 troque "Jornada, Monitor e Prontidão" por "Jornada e Prontidão"; no teste da linha 51 troque o título por `'Jornada e Prontidão mostram "31 de 90" para os mesmos dados, sem percentual'` e o vetor por `[window.renderProjectDetail, renderProntidao]`. Apague `frontend/test/monitor-view.test.js` (`git rm`).

- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx vitest run test/router.test.js test/produto.test.js test/casca-router.test.js test/casca-menu.test.js test/dashboard-view.test.js` → FAIL (`aliasDaTela` não existe; menu ainda tem Monitor; "41 fases" ainda no texto).

- [ ] **Step 3: Implementar.**

  `frontend/src/produto.js`: na linha 24 tire `'nav-monitor'` de `SO_ISO`; na linha 133 tire `'monitor', ` de `TELAS_DOS_MODULOS`. Logo depois de `TELAS_DOS_MODULOS` (linha 136):

```js
/**
 * Telas que saíram do menu e seguem valendo como endereço (link salvo, e-mail, aviso, `?tela=`): a tela que as substitui e, se
 * houver, a aba dela. Nunca 404 nem tela em branco (o `render` não desenha nada para tela sem ramo). Lista fechada;
 * `Object.hasOwn` barra `__proto__`/`constructor`.
 */
export const ALIAS_DE_TELA = { monitor: { tela: 'project-detail' } };
export const aliasDaTela = (tela) => (typeof tela === 'string' && Object.hasOwn(ALIAS_DE_TELA, tela) ? ALIAS_DE_TELA[tela] : null);
```

  Em `pedidoDoHub`, troque as duas últimas linhas (`const dono = moduloDaTela(tela);` e o `return`, linhas 221-222) por:

```js
    // Tela que saiu (alias) vale pelo destino; devolve o nome pedido: o navigate resolve o alias (e a aba, quando há).
    const real = aliasDaTela(tela)?.tela ?? tela;
    const dono = moduloDaTela(real);
    return TELAS_DOS_MODULOS.includes(real) && (dono === null || dono === produto || aba) ? { tela, aba, ...(filtro && filtro.tela === tela ? { filtro } : {}) } : null;
```

  `frontend/src/router.js`: na linha 2 acrescente `aliasDaTela` ao import de `./produto.js`. Na linha 8 troque `let targetView = view;` por:

```js
        // Tela que saiu do menu (Monitor, Prontidão): o endereço antigo vai à tela que a substitui (produto.js, ALIAS_DE_TELA).
        const alias = aliasDaTela(view);
        let targetView = alias ? alias.tela : view;
```

  Na linha 37 troque `if (modulo) { irPara(enderecoNoModulo(modulo, targetView, proj)); return; }` por `if (modulo) { irPara(enderecoNoModulo(modulo, alias ? view : targetView, proj)); return; }` (o módulo resolve o alias no boot, com a aba). Apague a linha 96 (`else if (S.view === 'monitor') renderMonitor(c, h, a);`).

  `frontend/login.html`: apague o bloco das linhas 406-409 (`<div class="sidebar-nav" ... id="nav-monitor" ...>` até o `</div>` que fecha o item).

  `frontend/src/views/monitor.js`: apague `renderMonitor` (linhas 22-110), `renderPortfolio` (112-139), `exportarCsvNiso` com o comentário (140-145, sem chamador fora do Monitor: Riscos já exporta pelo componente de lista, `frontend/src/views/grc.js:208`), `showGapAnalysis` (147-165) e as linhas `window.renderMonitor`, `window.renderPortfolio`, `window.exportarCsvNiso`, `window.showGapAnalysis` (1795-1798) e `window.monitorAbrirFase` (1810). `vazioSemFases` (linhas 9-20) **fica** (a Bancada importa, `bancada.js:5`). Depois: `grep -n "baixarArquivo\|projetosDoProduto\|openModal" frontend/src/views/monitor.js` e tire do import da linha 2/4 só o que ficou sem uso.

  `frontend/src/views/dashboard.js:79`: troque o parágrafo por `<p style="color:var(--text-dim); font-size:0.85rem; margin:0">Criação do projeto no n.iso com a jornada de adequação, as listas de verificação e os assistentes de IA.</p>` (o `style` já existia na linha; não acrescente outro).

- [ ] **Step 4: Rodar e ver passar** — `cd frontend && npx vitest run test/router.test.js test/produto.test.js test/casca-router.test.js test/casca-menu.test.js test/dashboard-view.test.js test/erro-de-carga.test.js test/jornada-prontidao.test.js test/bancada-grade.test.js test/globals-shell.test.js test/bancada-monitor.test.js test/ot-modulo.test.js` → PASS. `git grep -n "nav-monitor\|renderMonitor\|renderPortfolio\|showGapAnalysis\|monitorAbrirFase\|exportarCsvNiso" -- frontend/src frontend/test frontend/login.html` → vazio. `cd frontend && npm run build` → `✓ built in`. Backend: `npx vitest run test/contrato-tela-api.test.ts` → PASS.
- [ ] **Step 5: Mutação** — em `aliasDaTela`, troque `Object.hasOwn(ALIAS_DE_TELA, tela)` por `tela in ALIAS_DE_TELA`; `npx vitest run test/produto.test.js` (no `frontend/`) falha no caso `__proto__`; restaure.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/produto.js frontend/src/router.js frontend/login.html frontend/src/views/monitor.js frontend/src/views/dashboard.js \
  frontend/test/router.test.js frontend/test/casca-menu.test.js frontend/test/erro-de-carga.test.js frontend/test/jornada-prontidao.test.js \
  frontend/test/produto.test.js frontend/test/casca-router.test.js frontend/test/dashboard-view.test.js
git rm frontend/test/monitor-view.test.js
git commit -m "feat(iso): Monitor sai do menu; ?tela=monitor vira alias da Jornada"
```

### Task 3: Documentação do PR1

**Files:**
- Modify: `AGENTS.md:172,182-184`, `README.md:82`, `CHANGELOG.md:13` (nova seção logo abaixo de `## [Não publicado]`)

- [ ] **Step 1: AGENTS.md (sem acentos).** Linha 172: troque `(Painel, Prontidao, Monitor, Jornada, gap-analysis,` por `(Painel, Prontidao, Jornada, gap-analysis,`. Linhas 182-184: troque `Sem fases, Jornada e\n  Monitor oferecem "Carregar as fases"` por `Sem fases, a Jornada oferece "Carregar as fases"` e, no fim do item, acrescente: `O Monitor saiu (onda 4): a grade etapa x fase fica no topo da Jornada (\`frontend/src/bancada/grade.js\`, recolhida em "Fases por etapa"); \`?tela=monitor\` e alias da Jornada (\`ALIAS_DE_TELA\` em \`frontend/src/produto.js\`, lido por \`navigate\` e \`pedidoDoHub\`). Tela que sair do menu entra nessa lista, nunca vira 404.`
- [ ] **Step 2: README.md:82:** `Implementação (Jornada, Monitor, SoA, Governança)` → `Implementação (Jornada, Prontidão, SoA, Governança)`.
- [ ] **Step 3: CHANGELOG.md**, nova seção no topo de `## [Não publicado]`:

```markdown
### n.360, onda 4: jornada comum (spec 2026-11-18)
- **Monitor saiu do menu do n.iso.** A grade etapa × fase passou para o topo da Jornada ("Fases por etapa"); links antigos para o Monitor abrem a Jornada. "Exportar riscos" continua na tela Riscos.
```

- [ ] **Step 4: Rodar** `cd frontend && npx vitest run test/casca-menu.test.js` e `git diff --stat` (só os três arquivos).
- [ ] **Step 5: Commit** — `git add AGENTS.md README.md CHANGELOG.md && git commit -m "docs(onda4): Monitor sai; grade na Jornada e alias de tela"`

**Entrega PR1:** `bash scripts/ci/gate.sh` (na máquina de quem mergeia); PR (rascunho) "onda 4 PR1: limpeza do n.iso".

---

## PR2 — Prontidão como aba da Jornada (sem migration)

### Task 4: Abas "Plano de trabalho" e "Prontidão para certificar"; `certification` vira alias

**Files:**
- Create: `frontend/src/views/jornada.js`, `frontend/test/jornada-abas.test.js`, `test/passos-telas-alias.test.ts`
- Modify: `frontend/src/produto.js` (`ALIAS_DE_TELA` do Task 2; `SO_ISO` linha 24; `TELAS_DOS_MODULOS` linha 135), `frontend/src/router.js` (`navigate`, antes de `S.view = targetView;`; apagar `else if (S.view === 'certification') renderProntidao(c, h, a);`), `frontend/login.html:402-405`, `frontend/src/main.js:44`, `frontend/src/style.css` (`frontend/src/views/prontidao.js` não muda: sem o item no menu, `tituloDaTela('nav-certification', 'Prontidão')` cai no padrão "Prontidão", que `frontend/test/prontidao-view.test.js:48` cobra)
- Modify (testes): `frontend/test/router.test.js:14,196-199`, `frontend/test/casca-menu.test.js:62`, `frontend/test/globals-shell.test.js:235`, `frontend/test/produto.test.js`

**Interfaces:**
- Consumes: `ALIAS_DE_TELA`/`aliasDaTela` (Task 2); `renderBancada(c, h, a)` (`frontend/src/views/bancada.js:111`, exportada); `renderProntidao(c, h, a)` (`frontend/src/views/prontidao.js:99`, exportada).
- Produces: `S.jornadaAba: 'trabalho' | 'prontidao'`; `export async function renderJornada(c, h, a)`; `window.jornadaAba(aba)`; `window.renderProjectDetail = renderJornada`; `ALIAS_DE_TELA.certification = { tela: 'project-detail', jornadaAba: 'prontidao' }`; `navigate('project-detail', { jornadaAba })`. **`TELAS` do catálogo de passos (`src/data/passos/tipos.ts:15-19`), `TELA_DO_AVISO.certification` (`frontend/src/globals.js:1155`) e as chamadas internas `navigate('certification')` (`bancada.js:152,204`, `monitor.js:18`, `project.js:127`) não mudam:** o alias resolve; o teste novo `test/passos-telas-alias.test.ts` cobra que todo destino do catálogo tem ramo no `render` ou alias.

- [ ] **Step 1: Escrever os testes que falham.**

  `frontend/test/jornada-abas.test.js`:

```js
// Prontidão é aba da Jornada (onda 4, PR2). O endereço antigo (certification) abre a aba; o menu leva ao plano de trabalho.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, baixarArquivo: vi.fn(), API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/project.js';
import '../src/views/monitor.js';
import '../src/views/bancada.js';
import '../src/views/prontidao.js';
import '../src/views/jornada.js';
import { navigate } from '../src/router.js';
import catalogo from '../../contracts/bancada/catalogo.json';
import bancada from '../../contracts/bancada/bancada.json';
import passoJson from '../../contracts/bancada/passo.json';

const PROJ = { id: 'p1', client_name: 'Cliente Ficticio', project_name: 'Adequação', modulos: ['iso'] };
const PRONTIDAO = { visao: 'equipe', veredito: { tom: 'semana', rotulo: 'Estágio 1 pendente', frase: 'Faltam 3 itens.', apoio: '' },
    indicador: { implementados: 31, aplicaveis: 90, texto: '31 de 90 controles aplicáveis implementados' }, criterios: [], faltam: [], do_cliente: [], certificacao: null };
const montar = () => { document.body.innerHTML = '<h1 id="header-title"></h1><div id="header-actions"></div><div id="content"></div><div class="sidebar-nav" id="nav-project"></div>'; };

beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation(async (m, url) => {
        if (url === '/api/v1/projects/p1/bancada') return bancada;
        if (url === '/api/v1/passos/catalogo') return catalogo;
        if (url === '/api/v1/projects/p1/prontidao') return PRONTIDAO;
        if (/\/passos\/p3_\d$/.test(url)) return passoJson;
        return [];
    });
    S.user = { id: 'u1', role: 'consultor' };
    S.activeProject = PROJ; S.currentProject = PROJ; S.projects = [PROJ];
    S.passosCatalogo = null; S.bancadaAlvo = null; S.jornadaAba = undefined;
    window.ehEquipeNess = () => true;
    globalThis.updateActiveProjectWidget = vi.fn(); globalThis.updateHeaderUser = vi.fn();
    history.replaceState(null, '', '/iso');
});

const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('abas da Jornada', () => {
    it('o menu abre o plano de trabalho, com a aba selecionada', async () => {
        montar();
        navigate('project-detail');
        await esperar(); await esperar();
        expect(S.jornadaAba).toBe('trabalho');
        expect(document.querySelector('[role=tab][aria-selected=true]').textContent).toBe('Plano de trabalho');
        expect(document.getElementById('bancada-topo')).not.toBeNull();
    });
    it('o endereço antigo da Prontidão (certification) abre a aba Prontidão e destaca a Jornada', async () => {
        montar();
        navigate('certification');
        await esperar(); await esperar();
        expect(S.view).toBe('project-detail');
        expect(S.jornadaAba).toBe('prontidao');
        expect(document.querySelector('[role=tab][aria-selected=true]').textContent).toBe('Prontidão para certificar');
        expect(document.getElementById('content').textContent).toContain('31 de 90 controles aplicáveis implementados');
        expect(document.getElementById('nav-project').classList.contains('active')).toBe(true);
    });
    it('trocar de aba não navega: só redesenha, e a aba fica até a próxima navegação', async () => {
        montar();
        navigate('project-detail');
        await esperar(); await esperar();
        document.querySelector('[data-action="jornadaAba"][data-args=\'["prontidao"]\']').click();
        await esperar(); await esperar();
        expect(S.jornadaAba).toBe('prontidao');
        expect(document.getElementById('content').textContent).toContain('Estágio 1 pendente');
        navigate('project-detail');
        expect(S.jornadaAba).toBe('trabalho');
    });
    it('o cliente vê as duas abas (a Prontidão já era dele)', async () => {
        S.user = { id: 'u2', role: 'org_user' };
        montar();
        navigate('certification');
        await esperar(); await esperar();
        expect([...document.querySelectorAll('[role=tab]')].map((b) => b.textContent)).toEqual(['Plano de trabalho', 'Prontidão para certificar']);
    });
});
```

  (Se o `click()` não disparar a delegação no jsdom, importe `../src/delegation.js` no topo como outros testes que clicam; confira com `grep -ln "delegation.js" frontend/test | head -3`.)

  `test/passos-telas-alias.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TELAS } from '../src/data/passos/tipos';

// Onda 4: "Onde isto vive" de um passo aponta telas do router. Tela que saiu do menu (certification) continua válida como alias
// (frontend/src/produto.js, ALIAS_DE_TELA); este teste falha se um destino do catálogo não tiver ramo no render nem alias.
// Lado da tela pelo fonte `?raw`, como test/contrato-tela-api.test.ts:12-15 (o workerd não tem node:fs).
const router = Object.values(import.meta.glob('../frontend/src/router.js', { query: '?raw', import: 'default', eager: true }))[0] as string;
const produto = Object.values(import.meta.glob('../frontend/src/produto.js', { query: '?raw', import: 'default', eager: true }))[0] as string;
const alias = /export const ALIAS_DE_TELA = \{([^;]*)\};/.exec(produto)?.[1] ?? '';

describe('destinos do catálogo de passos', () => {
  it('o teste lê os dois fontes', () => {
    expect(router).toContain("S.view === 'project-detail'");
    expect(alias).toContain('certification:');
  });
  it.each(TELAS)('%s tem ramo no render ou alias', (t) => {
    expect(router.includes(`S.view === '${t}'`) || alias.includes(`${t}:`), t).toBe(true);
  });
});
```

  Testes que mudam: `frontend/test/router.test.js:14` tire `'nav-certification'`; o teste das linhas 196-199 vira:

```js
        it('"certification" (endereço antigo da Prontidão) abre a Jornada na aba Prontidão e destaca nav-project', () => {
            navigate('certification');
            expect(S.view).toBe('project-detail');
            expect(S.jornadaAba).toBe('prontidao');
            expect(itemAtivo().id).toBe('nav-project');
        });
```

  `frontend/test/casca-menu.test.js:62` → `'group-impl: nav-project=Jornada, nav-soa=SoA, nav-governance=Papéis e comitê',`. `frontend/test/globals-shell.test.js:235` → `['/projects/p9/certification', 'project-detail', 'renderProjectDetail'],` e, no corpo desse `it.each`, depois de `expect(S.view).toBe(view);` acrescente `if (link.endsWith('/certification')) expect(S.jornadaAba).toBe('prontidao');`. `frontend/test/produto.test.js`, no bloco `pedidoDoHub`:

```js
    it('?tela=certification (aviso, e-mail) é aceito no n.iso e mantém o nome: o navigate abre a aba', () => {
        ir('/iso?tela=certification');
        expect(pedidoDoHub()).toEqual({ tela: 'certification', aba: null });
    });
```

- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx vitest run test/jornada-abas.test.js test/router.test.js test/produto.test.js` → FAIL; `npx vitest run test/passos-telas-alias.test.ts` → FAIL (`certification` ainda tem ramo, mas `alias` não contém `certification`).

- [ ] **Step 3: Implementar.**

  `frontend/src/produto.js`: `ALIAS_DE_TELA` vira `{ monitor: { tela: 'project-detail' }, certification: { tela: 'project-detail', jornadaAba: 'prontidao' } }`; tire `'nav-certification'` de `SO_ISO` e `'certification', ` de `TELAS_DOS_MODULOS`.

  `frontend/src/router.js`, logo antes de `S.view = targetView;`:

```js
        // A Jornada tem duas abas (views/jornada.js): o endereço antigo da Prontidão abre a dela; qualquer outra ida, o plano de trabalho.
        if (targetView === 'project-detail') S.jornadaAba = (data && data.jornadaAba) || (alias && alias.jornadaAba) || 'trabalho';
```

  e apague `else if (S.view === 'certification') renderProntidao(c, h, a);`.

  `frontend/src/views/jornada.js`:

```js
import { S } from '../state.js';
import { escapeHTML } from '../ui.js';
import { renderBancada } from './bancada.js';
import { renderProntidao } from './prontidao.js';

// Jornada (onda 4): o plano de trabalho (a Bancada) e a prontidão para certificar na mesma tela, em duas abas. A rota
// GET /projects/:id/prontidao fica (lida pela aba, pela Bancada, pela onda 2 e pelos testes). `S.jornadaAba` é posto pelo navigate.
const ABAS = [['trabalho', 'Plano de trabalho'], ['prontidao', 'Prontidão para certificar']];

export async function renderJornada(c, h, a) {
    const aba = S.jornadaAba === 'prontidao' ? 'prontidao' : 'trabalho';
    c.innerHTML = `<div class="jornada-abas" role="tablist" aria-label="Jornada">${ABAS.map(([id, rotulo]) =>
        `<button type="button" role="tab" id="jornada-aba-${id}" aria-selected="${id === aba}" aria-controls="jornada-painel" class="btn btn-sm${id === aba ? ' btn-primary' : ''}" data-action="jornadaAba" data-args='${escapeHTML(JSON.stringify([id]))}'>${rotulo}</button>`).join('')}</div>
        <div id="jornada-painel" role="tabpanel" aria-labelledby="jornada-aba-${aba}"></div>`;
    const painel = c.querySelector('#jornada-painel');
    if (aba === 'prontidao') await renderProntidao(painel, h, a); else await renderBancada(painel, h, a);
}

/** Trocar de aba só redesenha (não é navegação: o filtro do painel e o projeto ficam). */
window.jornadaAba = (aba) => { S.jornadaAba = aba === 'prontidao' ? 'prontidao' : 'trabalho'; if (typeof window.render === 'function') window.render(); };
// Substitui o `window.renderProjectDetail = renderBancada` de bancada.js (que fica para os testes que montam só a Bancada).
window.renderProjectDetail = renderJornada;
```

  `frontend/src/main.js`: logo depois da linha 44 (`import './views/prontidao.js';`), `import './views/jornada.js';`. `frontend/login.html`: apague o item `nav-certification` (linhas 402-405). `frontend/src/style.css`, no fim:

```css
/* Jornada (onda 4): abas Plano de trabalho / Prontidão para certificar */
.jornada-abas { display: flex; gap: 8px; margin: 0 0 12px; }
```

- [ ] **Step 4: Rodar e ver passar** — `cd frontend && npx vitest run test/jornada-abas.test.js test/router.test.js test/produto.test.js test/casca-menu.test.js test/casca-router.test.js test/globals-shell.test.js test/jornada-prontidao.test.js test/bancada-grade.test.js test/bancada-monitor.test.js test/projetos-abrir-modulo.test.js test/prontidao-view.test.js test/erro-de-carga.test.js` → PASS; `cd frontend && npm run build` → `✓ built in`; backend `npx vitest run test/passos-telas-alias.test.ts test/contrato-tela-api.test.ts test/passos-tipos.test.ts test/passos-catalogo.test.ts` → PASS. `grep -n "nav-certification" frontend/login.html frontend/src/produto.js` → vazio.
- [ ] **Step 5: Mutação** — tire `certification` de `ALIAS_DE_TELA`: `test/passos-telas-alias.test.ts` (caso `certification`) e `frontend/test/jornada-abas.test.js` falham; restaure.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/jornada.js frontend/src/produto.js frontend/src/router.js frontend/login.html frontend/src/main.js \
  frontend/src/style.css frontend/test/jornada-abas.test.js frontend/test/router.test.js frontend/test/casca-menu.test.js frontend/test/globals-shell.test.js \
  frontend/test/produto.test.js test/passos-telas-alias.test.ts
git commit -m "feat(iso): Prontidão vira aba da Jornada; certification vira alias"
```

### Task 5: Documentação do PR2

**Files:**
- Modify: `AGENTS.md:182` (item da Prontidão), `AGENTS.md:723-725` (Bancada), `README.md:82`, `CHANGELOG.md` (seção da onda 4)

- [ ] **Step 1: AGENTS.md (sem acentos).** Linha 182: `Tela: \`frontend/src/views/prontidao.js\` (a view \`certification\`, item "Prontidao" no grupo Implementacao).` → `Tela: aba "Prontidao para certificar" da Jornada (\`frontend/src/views/jornada.js\` desenha as abas; \`frontend/src/views/prontidao.js\` desenha a aba). \`certification\` e alias (\`ALIAS_DE_TELA\`, com \`jornadaAba: 'prontidao'\`): avisos (\`TELA_DO_AVISO\`), e-mails, \`TELAS\` do catalogo de passos e \`navigate('certification')\` seguem validos; \`test/passos-telas-alias.test.ts\` cobra que todo destino do catalogo tem ramo ou alias.` Linhas 723-725: depois de `e a unica\n  tela de jornada`, acrescente `(aba "Plano de trabalho" da Jornada; a outra aba e a Prontidao)`.
- [ ] **Step 2: README.md:82:** `Implementação (Jornada, Prontidão, SoA, Governança)` → `Implementação (Jornada, com a aba Prontidão; SoA; Governança)`.
- [ ] **Step 3: CHANGELOG.md**, na seção da onda 4: `- **Prontidão virou aba da Jornada** ("Prontidão para certificar"). O item Prontidão saiu do menu; avisos, e-mails e links antigos abrem a aba.`
- [ ] **Step 4: Rodar** `cd frontend && npx vitest run test/casca-menu.test.js` → PASS.
- [ ] **Step 5: Commit** — `git add AGENTS.md README.md CHANGELOG.md && git commit -m "docs(onda4): Prontidão como aba da Jornada"`

**Entrega PR2:** `bash scripts/ci/gate.sh`; PR (rascunho) "onda 4 PR2: Prontidão como aba da Jornada".

---

## PR3 — Modelo comum: `programa.etapas` no `/painel` (sem migration)

### Task 6: Catálogo das etapas e funções puras do n.iso e do n.ot

**Files:**
- Create: `src/data/programa.ts`, `src/services/programa.ts`, `test/programa.test.ts`

**Interfaces:**
- Consumes: `montarBancada(cat: Catalogo, ctx: ContextoProjeto)` (`src/services/passos/estado.ts:49`, pura); `obterCatalogo(): Catalogo` (`src/data/passos/catalogo.ts:23`); `ContextoProjeto` (`src/services/passos/contexto.ts:34-42`); `ProximoPasso` (`src/services/ot-fase.ts:6`); `ENTIDADES` (`src/data/passos/tipos.ts:9-12`).
- Produces:
  - `src/data/programa.ts`: `ETAPAS_COMUNS` (5 `{ id, rotulo }`), `type EtapaComum = 'comecar' | 'levantar' | 'avaliar' | 'tratar' | 'operar'`, `FASES_DO_ISO: Record<EtapaComum, readonly [number, number]>`, `etapaDaFase(fase: number): EtapaComum | null`.
  - `src/services/programa.ts`: `type ResumoDaEtapa = { id: EtapaComum; rotulo: string; feitos: number; total: number }`; `type ProximoDoPrograma = { texto: string; tela: string; aba?: string; fase?: number; passo?: string }`; `type PassoDaTrilha = { id: string; ordem: number; rotulo: string; etapa: EtapaComum; feito: boolean; tela: string; acao: string }`; `type ProgramaDoModulo = { etapa: EtapaComum; feitos: number; total: number; proximo: ProximoDoPrograma | null; etapas: ResumoDaEtapa[]; passos?: PassoDaTrilha[] }`; `primeiroMarco(...marcos: (string | null | undefined)[]): string | null`; `etapasDoIso(cat: Catalogo, ctx: ContextoProjeto): ProgramaDoModulo`; `ETAPA_DO_PASSO_OT: Record<ProximoPasso, EtapaComum>`; `type SiteNoPrograma = { proximo_passo: ProximoPasso; desvios_abertos: number }`; `etapasDoOt(sites: SiteNoPrograma[]): ProgramaDoModulo`.

- [ ] **Step 1: Escrever o teste que falha** — `test/programa.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ETAPAS_COMUNS, FASES_DO_ISO, etapaDaFase } from '../src/data/programa';
import { etapasDoIso, etapasDoOt, primeiroMarco, ETAPA_DO_PASSO_OT } from '../src/services/programa';
import { obterCatalogo } from '../src/data/passos/catalogo';
import { ENTIDADES } from '../src/data/passos/tipos';
import type { ContextoProjeto, LinhaFase } from '../src/services/passos/contexto';

const ctx = (fases: [number, LinhaFase][] = [], checados: { fase: number; id: string }[] = []): ContextoProjeto => ({
  progresso: new Map(checados.map(({ fase, id }) => [id, { phase_number: fase, item_id: id, is_checked: 1, checked_at: '2026-11-01 10:00:00', evidence_id: null, notes: null,
    assigned_to: null, due_date: null, bloqueio_motivo: null, bloqueio_responsavel: null, bloqueado_em: null, excecao_motivo: null, excecao_por: null, excecao_em: null }])),
  respostas: new Map(), evidencias: new Set(), trilhas: new Set(), pedidos: new Map(), fases: new Map(fases),
  entidades: Object.fromEntries(ENTIDADES.map((e) => [e, 0])) as ContextoProjeto['entidades'],
});
const todasAsFases = (status = 'pending', legado: string | null = null): [number, LinhaFase][] => Array.from({ length: 41 }, (_, n) => [n, { status, legado_status: legado }]);

describe('fronteira do n.iso (decisão 6)', () => {
  it('cada fase de 0 a 40 cai em exatamente uma etapa, e nada fora disso', () => {
    for (let f = 0; f <= 40; f++) {
      const em = ETAPAS_COMUNS.filter(({ id }) => f >= FASES_DO_ISO[id][0] && f <= FASES_DO_ISO[id][1]);
      expect(em.length, `fase ${f}`).toBe(1);
      expect(etapaDaFase(f), `fase ${f}`).toBe(em[0].id);
    }
    for (const f of [-1, 41, 99]) expect(etapaDaFase(f)).toBeNull();
  });
  it('os valores da spec: Começar 0-6, Levantar 7-8, Avaliar 9-10, Tratar 11-28, Operar 29-40', () => {
    expect(FASES_DO_ISO).toEqual({ comecar: [0, 6], levantar: [7, 8], avaliar: [9, 10], tratar: [11, 28], operar: [29, 40] });
    expect(ETAPAS_COMUNS.map((e) => e.rotulo)).toEqual(['Começar', 'Levantar', 'Avaliar', 'Tratar', 'Operar']);
  });
  it('toda fase do catálogo de passos tem etapa', () => {
    expect(obterCatalogo().fases.filter((f) => etapaDaFase(f.numero) === null)).toEqual([]);
  });
});

describe('etapasDoIso (puro)', () => {
  it('sem fases carregadas: Começar, 0 de 41, e o próximo é carregar as fases', () => {
    const p = etapasDoIso(obterCatalogo(), ctx());
    expect(p).toMatchObject({ etapa: 'comecar', feitos: 0, total: 41, proximo: { texto: 'Carregar as fases da jornada', tela: 'project-detail' } });
    expect(p.etapas.map((e) => [e.id, e.total])).toEqual([['comecar', 7], ['levantar', 2], ['avaliar', 2], ['tratar', 18], ['operar', 12]]);
  });
  it('fase concluída pelo select antigo (legado_status) conta como feita sem materializar (o GET da Bancada é quem grava)', () => {
    const fases = todasAsFases();
    fases[0] = [0, { status: 'completed', legado_status: 'completed' }];
    fases[1] = [1, { status: 'skipped', legado_status: 'skipped' }];
    const p = etapasDoIso(obterCatalogo(), ctx(fases));
    expect(p.etapas[0]).toMatchObject({ id: 'comecar', feitos: 2, total: 7 });
    expect(p.etapa).toBe('comecar');
    expect(p.proximo).toMatchObject({ tela: 'project-detail' });
    expect(p.proximo?.texto).toMatch(/^Fase \d+: /);
  });
  it('Começar inteiro feito (passos marcados nas fases 0-6): a etapa em curso é Levantar', () => {
    const cat = obterCatalogo();
    const checados = cat.passos.filter((x) => x.fase <= 6).map((x) => ({ fase: x.fase, id: x.id }));
    const p = etapasDoIso(cat, ctx(todasAsFases(), checados));
    expect(p.etapas[0]).toMatchObject({ feitos: 7, total: 7 });
    expect(p.etapa).toBe('levantar');
    expect(p.feitos).toBe(7);
  });
});

describe('etapasDoOt (puro)', () => {
  it('todo próximo passo do site tem etapa', () => {
    expect(Object.keys(ETAPA_DO_PASSO_OT).sort()).toEqual(['aguardar_base', 'aguardar_lote', 'comecar', 'em_operacao', 'pedir_base', 'revalidar', 'revisar']);
  });
  it('sem site: Começar, 0 de 0, cadastrar o primeiro site; nenhum nome de site em lugar nenhum', () => {
    const p = etapasDoOt([]);
    expect(p).toMatchObject({ etapa: 'comecar', feitos: 0, total: 0, proximo: { texto: 'Cadastrar o primeiro site', tela: 'ot', aba: 'sites' } });
  });
  it('a etapa do módulo é a do site mais atrasado; em operação com desvio aberto é Tratar', () => {
    const p = etapasDoOt([{ proximo_passo: 'em_operacao', desvios_abertos: 1 }, { proximo_passo: 'pedir_base', desvios_abertos: 0 }]);
    expect(p.etapa).toBe('avaliar');
    expect(p.total).toBe(2);
    expect(p.feitos).toBe(0); // em operação sem desvio = feito; com desvio ainda é Tratar
    expect(p.proximo).toEqual({ texto: 'Pedir a aprovação da base', tela: 'ot', aba: 'sites' });
    expect(etapasDoOt([{ proximo_passo: 'em_operacao', desvios_abertos: 2 }])).toMatchObject({ etapa: 'tratar', proximo: { texto: 'Tratar os desvios abertos' } });
    expect(etapasDoOt([{ proximo_passo: 'revalidar', desvios_abertos: 0 }])).toMatchObject({ etapa: 'operar', feitos: 1, total: 1 });
  });
});

describe('primeiroMarco', () => {
  it('a menor data, ignorando vazios', () => {
    expect(primeiroMarco(null, '2026-05-04 10:00:00', '2026-03-10T10:00:00Z')).toBe('2026-03-10T10:00:00Z');
    expect(primeiroMarco(null, undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/programa.test.ts` → FAIL (módulos não existem).
- [ ] **Step 3: Implementar.** `src/data/programa.ts`:

```ts
// Onda 4 (spec 2026-11-18, decisões 5, 6 e 9): as cinco etapas comuns a todo módulo e a fronteira do n.iso por fase do catálogo.
// Catálogo estático, rótulos em português; nada aqui lê banco.

export const ETAPAS_COMUNS = [
  { id: 'comecar', rotulo: 'Começar' },
  { id: 'levantar', rotulo: 'Levantar' },
  { id: 'avaliar', rotulo: 'Avaliar' },
  { id: 'tratar', rotulo: 'Tratar' },
  { id: 'operar', rotulo: 'Operar' },
] as const;
export type EtapaComum = (typeof ETAPAS_COMUNS)[number]['id'];

/** Decisão 6: as fases do catálogo de passos (0 a 40) por etapa, intervalos fechados. Mudar aqui muda a régua do n.iso inteira. */
export const FASES_DO_ISO: Readonly<Record<EtapaComum, readonly [number, number]>> = {
  comecar: [0, 6], levantar: [7, 8], avaliar: [9, 10], tratar: [11, 28], operar: [29, 40],
};

export function etapaDaFase(fase: number): EtapaComum | null {
  for (const { id } of ETAPAS_COMUNS) {
    const [de, ate] = FASES_DO_ISO[id];
    if (fase >= de && fase <= ate) return id;
  }
  return null;
}
```

  `src/services/programa.ts`:

```ts
import { ETAPAS_COMUNS, etapaDaFase, type EtapaComum } from '../data/programa';
import type { Catalogo } from '../data/passos/tipos';
import type { ContextoProjeto } from './passos/contexto';
import { montarBancada } from './passos/estado';
import type { ProximoPasso } from './ot-fase';

// Onda 4: a régua comum de cada módulo, derivada do que já existe. SÓ LÊ (as funções daqui são puras; a que lê o banco é
// `etapasDoPrograma`, que usa só leituras). Nenhum número da onda 2 sai daqui.

export type ResumoDaEtapa = { id: EtapaComum; rotulo: string; feitos: number; total: number };
export type ProximoDoPrograma = { texto: string; tela: string; aba?: string; fase?: number; passo?: string };
export type PassoDaTrilha = { id: string; ordem: number; rotulo: string; etapa: EtapaComum; feito: boolean; tela: string; acao: string };
export type ProgramaDoModulo = { etapa: EtapaComum; feitos: number; total: number; proximo: ProximoDoPrograma | null; etapas: ResumoDaEtapa[]; passos?: PassoDaTrilha[] };

const ORDEM: readonly EtapaComum[] = ETAPAS_COMUNS.map((e) => e.id);
const indice = (e: EtapaComum) => ORDEM.indexOf(e);
const soma = (xs: number[]) => xs.reduce((t, n) => t + n, 0);

/** O primeiro marco entre fontes (SQL do painel, base aprovada do n.ot): a menor data; vazios não contam. */
export const primeiroMarco = (...marcos: (string | null | undefined)[]): string | null => marcos.filter((m): m is string => !!m).sort()[0] ?? null;

/** n.iso: as fases do catálogo agrupadas por `FASES_DO_ISO`. A etapa em curso é a primeira com fase por fazer. */
export function etapasDoIso(cat: Catalogo, ctx: ContextoProjeto): ProgramaDoModulo {
  const b = montarBancada(cat, ctx);
  const situacao = new Map(b.fases.map((f) => [f.numero, f.situacao]));
  // Fase que o select antigo deu por concluída ou dispensada e ainda não foi materializada (quem grava é o GET da Bancada): feita.
  const feita = (n: number) => situacao.get(n) === 'completed' || ['completed', 'skipped'].includes(ctx.fases.get(n)?.legado_status ?? '');
  const etapas = ETAPAS_COMUNS.map(({ id, rotulo }) => {
    const fs = cat.fases.filter((f) => etapaDaFase(f.numero) === id);
    return { id, rotulo, feitos: fs.filter((f) => feita(f.numero)).length, total: fs.length };
  });
  const titulo = (n: number) => cat.fases.find((f) => f.numero === n)?.titulo ?? `Fase ${n}`;
  const proximo: ProximoDoPrograma | null = !b.tem_fases ? { texto: 'Carregar as fases da jornada', tela: 'project-detail' }
    : b.continuar ? { texto: `Fase ${b.continuar.fase}: ${titulo(b.continuar.fase)}`, tela: 'project-detail', fase: b.continuar.fase, passo: b.continuar.passo } : null;
  return { etapa: etapas.find((e) => e.feitos < e.total)?.id ?? 'operar', feitos: soma(etapas.map((e) => e.feitos)), total: soma(etapas.map((e) => e.total)), proximo, etapas };
}

/** n.ot: o próximo passo do site (`situacaoDoSite`) na etapa comum. Em operação com desvio aberto, o site está em Tratar. */
export const ETAPA_DO_PASSO_OT: Record<ProximoPasso, EtapaComum> = {
  comecar: 'comecar', revisar: 'levantar', aguardar_lote: 'levantar', pedir_base: 'avaliar', aguardar_base: 'avaliar', em_operacao: 'operar', revalidar: 'operar',
};
const TEXTO_OT: Record<ProximoPasso, string> = {
  comecar: 'Começar o levantamento do site', revisar: 'Revisar os achados do levantamento', aguardar_lote: 'Revisar o lote de aprovação',
  pedir_base: 'Pedir a aprovação da base', aguardar_base: 'Aprovar a base do site', em_operacao: 'Acompanhar a operação', revalidar: 'Revalidar os ativos',
};
export type SiteNoPrograma = { proximo_passo: ProximoPasso; desvios_abertos: number };

/** Unidade do n.ot é o site: a etapa do módulo é a do site mais atrasado; feito = site em operação sem desvio aberto. Nunca leva nome de site. */
export function etapasDoOt(sites: SiteNoPrograma[]): ProgramaDoModulo {
  const etapaDe = (s: SiteNoPrograma): EtapaComum => {
    const e = ETAPA_DO_PASSO_OT[s.proximo_passo] ?? 'comecar';
    return e === 'operar' && s.desvios_abertos > 0 ? 'tratar' : e;
  };
  const doSite = sites.map(etapaDe);
  const etapas = ETAPAS_COMUNS.map(({ id, rotulo }) => ({ id, rotulo, total: sites.length,
    feitos: doSite.filter((e) => indice(e) > indice(id) || (id === 'operar' && e === 'operar')).length }));
  if (!sites.length) return { etapa: 'comecar', feitos: 0, total: 0, proximo: { texto: 'Cadastrar o primeiro site', tela: 'ot', aba: 'sites' }, etapas };
  const i = doSite.reduce((m, e, k) => (indice(e) < indice(doSite[m]) ? k : m), 0);
  const texto = doSite[i] === 'tratar' ? 'Tratar os desvios abertos' : TEXTO_OT[sites[i].proximo_passo];
  return { etapa: doSite[i], feitos: doSite.filter((e) => e === 'operar').length, total: sites.length, proximo: { texto, tela: 'ot', aba: 'sites' }, etapas };
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run test/programa.test.ts test/passos-estado.test.ts test/passos-montagem.test.ts` → PASS; `npx tsc --noEmit` → sem erro.
- [ ] **Step 5: Commit** — `git add src/data/programa.ts src/services/programa.ts test/programa.test.ts && git commit -m "feat(programa): cinco etapas comuns e régua pura do n.iso e do n.ot"`

### Task 7: `programa.etapas` no `GET /painel` e marco do n.ot (P0) **[revisor opus]**

**Files:**
- Modify: `src/services/programa.ts` (acrescenta `etapasDoPrograma`), `src/services/painel.ts:444-471,500-501` (`painelDoProjeto`), `src/services/painel-ot.ts:28-29,40,64-71` (`blocoOt`)
- Create: `test/programa-rota.test.ts`

**Interfaces:**
- Consumes: `etapasDoIso`, `etapasDoOt`, `primeiroMarco`, `ProgramaDoModulo` (Task 6); `carregarContexto(db, projectId): Promise<ContextoProjeto>` (`src/services/passos/contexto.ts:44`, só SELECT); `situacaoDoSite(db, projectId, siteId, quemId?): Promise<SituacaoSite | null>` (`src/services/ot-fase.ts:33`, só SELECT); `sitesPermitidos(db, u: AtorOt, projectId): Promise<string>` (`src/services/ot-inventario.ts:64`); `AtorPainelOt` (`src/services/painel-ot.ts:12`); `estadoDoPrograma(marco, temCadastro)` (`src/services/painel.ts:90`, assinatura **não muda**).
- Produces:
  - `type LidosDoPainel = { otAtor?: AtorPainelOt | null }`; `etapasDoPrograma(db: D1Database, projectId: string, modulos: readonly Modulo[], lidos?: LidosDoPainel): Promise<Partial<Record<Modulo, ProgramaDoModulo>>>`.
  - `GET /api/v1/projects/:id/painel` → `programa: { estado, desde, rotulo, etapas: Partial<Record<'iso'|'privacy'|'ot', ProgramaDoModulo>> }`. Chaves de `etapas` = módulos do pedido (`?modulo=` ou projeto ∩ pessoa), `ot` só quando o bloco `ot` foi montado.
  - `blocoOt(...)` devolve também `marco: string | null` (a primeira `base_aprovada_em` dos sites permitidos); o painel não o copia para a resposta.

- [ ] **Step 1: Escrever o teste que falha** — `test/programa-rota.test.ts` (arranjo de `test/painel-ot-rota.test.ts:1-40`):

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { sha256Hex } from '../src/helpers';
import app from '../src/index';
import { applySchema, seedTwoProjects, habilitarOt, concederModulos, designarConsultor, sessionFor, workerEnv } from './helpers/d1';

// Onda 4: programa.etapas no painel. P0-1/P0-2/P0-4: sem `ot` (pessoa ou projeto), agente e chave de API não veem nem CONTAM o n.ot.
type H = Record<string, string>;
const AGENTE = { userId: 'cons:cons-ag4@ness.lat', email: 'cons-ag4@ness.lat', projectId: 'proj-a', concessaoId: 'c-ag4' };
const chamar = (h: H, caminho: string, extra: Record<string, unknown> = {}) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), { ...(workerEnv() as any), ...extra });
const painel = async (h: H, q = '', extra: Record<string, unknown> = {}) => { const r = await chamar(h, `/api/v1/projects/proj-a/painel${q}`, extra); expect(r.status).toBe(200); return (await r.json()) as any; };
let semOt: H, cons: H, tecnico: H;

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-s', 's@cliente.teste', 'x', 'Sem OT', 'org_admin', 'proj-a'), ('u-t', 't@cliente.teste', 'x', 'Tecnico', 'org_user', 'proj-a')`),
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase) VALUES ('s1', 'proj-a', 'SE Norte Exemplo', 'em_operacao')`),
    env.DB.prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez) VALUES
      ('d1', 'proj-a', 's1', 'fluxo', 'k1', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z')`),
    // fase 0 concluída pelo select antigo, ainda não materializada: o painel conta, mas não pode gravar
    env.DB.prepare(`INSERT INTO project_phases (id, project_id, phase_number, title, status, legado_status) VALUES ('ph0', 'proj-a', 0, 'Mobilização', 'completed', 'completed')`),
  ]);
  await env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('key-p4', 'proj-a', ?, 'programa', 'write', 'Active')`).bind(await sha256Hex('chave-programa-ot')).run();
  await designarConsultor(AGENTE.email, 'proj-a');
  await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-ag4', ?, 'proj-a', datetime('now', '+30 days'))`).bind(AGENTE.userId).run();
  await concederModulos([AGENTE.userId], ['iso', 'ot']);
  await concederModulos(['u-s'], ['iso']);
  await concederModulos(['u-t'], ['iso', 'ot']);
  await designarConsultor('c4@ness.lat', 'proj-a');
  const c = await env.DB.prepare(`SELECT id FROM users WHERE email = 'c4@ness.lat'`).first<{ id: string }>();
  await concederModulos([c!.id], ['iso', 'ot']);
  semOt = await sessionFor({ id: 'u-s', email: 's@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  tecnico = await sessionFor({ id: 'u-t', email: 't@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  cons = await sessionFor({ id: c!.id, email: 'c4@ness.lat', role: 'consultor' });
});

const semRastroDoOt = (d: any) => {
  expect(Object.keys(d.programa.etapas)).toEqual(['iso']);
  const p = JSON.stringify(d.programa);
  for (const x of ['"ot"', 'site', 'Site', 'desvio', 'SE Norte']) expect(p, x).not.toContain(x);
  expect(d.programa.etapas.iso.total).toBe(41);
  expect(d.programa.etapas.iso.etapas.map((e: any) => e.total)).toEqual([7, 2, 2, 18, 12]);
};

describe('programa.etapas por perfil', () => {
  it('consultor com o ot: iso e ot; o site em operação com desvio aberto está em Tratar; nenhum nome de site', async () => {
    const d = await painel(cons);
    expect(Object.keys(d.programa.etapas).sort()).toEqual(['iso', 'ot']);
    expect(d.programa.etapas.ot).toMatchObject({ etapa: 'tratar', feitos: 0, total: 1, proximo: { texto: 'Tratar os desvios abertos', tela: 'ot', aba: 'sites' } });
    expect(JSON.stringify(d.programa)).not.toContain('SE Norte');
  });
  it('?modulo=iso: só a régua do iso, mesmo para quem tem o ot', async () => {
    expect(Object.keys((await painel(cons, '?modulo=iso')).programa.etapas)).toEqual(['iso']);
  });
  it('pessoa sem o ot: nenhuma chave, contagem ou texto do n.ot', async () => semRastroDoOt(await painel(semOt)));
  it('agente MCP: nenhuma chave, contagem ou texto do n.ot (P0-2)', async () => semRastroDoOt(await painel({}, '', { AGENTE })));
  it('chave de API: nenhuma chave, contagem ou texto do n.ot (P0-2)', async () => semRastroDoOt(await painel({ 'X-API-Key': 'chave-programa-ot' })));
  it('técnico com o ot e sem acesso ao site: o ot vem com 0 sites (P0-4), não com o site do projeto', async () => {
    const d = await painel(tecnico);
    expect(d.programa.etapas.ot).toMatchObject({ total: 0, etapa: 'comecar', proximo: { texto: 'Cadastrar o primeiro site' } });
  });
});

describe('o painel só lê (o GET da Bancada grava; o programa não)', () => {
  it('fase concluída pelo select antigo conta na régua e continua sem materializar depois do GET /painel', async () => {
    const d = await painel(cons, '?modulo=iso');
    expect(d.programa.etapas.iso.etapas[0]).toMatchObject({ id: 'comecar', feitos: 1, total: 7 });
    const fase = await env.DB.prepare(`SELECT status, legado_status FROM project_phases WHERE id = 'ph0'`).first();
    expect(fase).toEqual({ status: 'completed', legado_status: 'completed' });
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM checklist_progress WHERE project_id = 'proj-a'`).first<{ n: number }>())!.n).toBe(0);
  });
});

describe('marco do n.ot (decisão 8): só para quem tem o ot', () => {
  it('a primeira base aprovada põe o programa em operação para quem tem o ot; quem não tem continua sem marco', async () => {
    await env.DB.prepare(`UPDATE ot_sites SET base_aprovada_em = '2026-05-04 10:00:00' WHERE id = 's1'`).run();
    try {
      expect((await painel(cons)).programa).toMatchObject({ estado: 'operacao', desde: '2026-05' });
      expect((await painel(semOt)).programa.estado).not.toBe('operacao');
      expect((await painel({}, '', { AGENTE })).programa.estado).not.toBe('operacao');
      expect((await painel({ 'X-API-Key': 'chave-programa-ot' })).programa.estado).not.toBe('operacao');
      expect((await painel(tecnico)).programa.estado).not.toBe('operacao'); // o site aprovado não é dele (P0-4)
    } finally {
      await env.DB.prepare(`UPDATE ot_sites SET base_aprovada_em = NULL WHERE id = 's1'`).run();
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/programa-rota.test.ts` → FAIL (`programa.etapas` undefined).
- [ ] **Step 3: Implementar.**

  `src/services/painel-ot.ts`: na consulta `sts` (linha 28) troque `SELECT id, nome, fase, substr(obra_ate, 1, 10) AS obra_ate FROM ot_sites` por `SELECT id, nome, fase, substr(obra_ate, 1, 10) AS obra_ate, base_aprovada_em FROM ot_sites`; na linha 40 o tipo vira `{ id: string; nome: string; fase: string; obra_ate: string | null; base_aprovada_em: string | null }[]`; no `return` (linha 65) acrescente, depois de `comecando, itens, proximo: null as Proximo,`:

```ts
    // Marco do programa (onda 4, decisão 8): a primeira base aprovada entre os sites DESTA pessoa (P0-4). O painel não o devolve.
    marco: lista.map((s) => s.base_aprovada_em).filter((d): d is string => !!d).sort()[0] ?? null,
```

  `src/services/programa.ts`, acrescente os imports e a função:

```ts
import { obterCatalogo } from '../data/passos/catalogo';
import { carregarContexto } from './passos/contexto';
import { situacaoDoSite } from './ot-fase';
import { sitesPermitidos } from './ot-inventario';
import type { AtorPainelOt } from './painel-ot';
import type { Modulo } from '../modulos';

export type LidosDoPainel = { otAtor?: AtorPainelOt | null };

/**
 * `programa.etapas` do GET /painel (onda 4, decisão 7). SÓ LÊ: `carregarContexto` + `montarBancada`, nunca a rota da Bancada, cujo
 * GET grava (`materializarLegado`, `gravarSituacoes`). O n.ot entra só com `otAtor`, que o painel passa apenas quando montou o bloco
 * `ot` (módulo no projeto E na pessoa; nunca agente nem chave: P0-1/P0-2); os sites vêm de `sitesPermitidos` (P0-4).
 */
export async function etapasDoPrograma(db: D1Database, projectId: string, modulos: readonly Modulo[], lidos: LidosDoPainel = {}): Promise<Partial<Record<Modulo, ProgramaDoModulo>>> {
  const r: Partial<Record<Modulo, ProgramaDoModulo>> = {};
  if (modulos.includes('iso')) r.iso = etapasDoIso(obterCatalogo(), await carregarContexto(db, projectId));
  const a = lidos.otAtor;
  if (modulos.includes('ot') && a && a.agente !== true && !a.id.startsWith('apikey:')) {
    const sites = JSON.parse(await sitesPermitidos(db, a, projectId)) as string[];
    // shortcut: uma situacaoDoSite por site (6 consultas cada); trocar por consulta agregada se um projeto passar de ~50 sites
    const [situacoes, desvios] = await Promise.all([
      Promise.all(sites.map((id) => situacaoDoSite(db, projectId, id))),
      db.prepare(`SELECT site_id, count(*) AS n FROM ot_desvios WHERE project_id = ? AND situacao = 'aberto' AND site_id IN (SELECT value FROM json_each(?)) GROUP BY site_id`)
        .bind(projectId, JSON.stringify(sites)).all<{ site_id: string; n: number }>(),
    ]);
    const porSite = new Map(desvios.results.map((d) => [d.site_id, Number(d.n)]));
    r.ot = etapasDoOt(situacoes.flatMap((s, i) => (s ? [{ proximo_passo: s.proximo_passo, desvios_abertos: porSite.get(sites[i]) ?? 0 }] : [])));
  }
  return r;
}
```

  `src/services/painel.ts`: acrescente `import { etapasDoPrograma, primeiroMarco } from './programa';`. Troque as linhas 468-471 (o `const ot = ...` até o `const programa = ...`) por:

```ts
  // Um ator só para o bloco e para a régua do n.ot; a rota já tirou o `ot` de agente e chave (P0-2) e de quem não o tem (P0-1).
  const atorOt = quem.id ? { id: quem.id, email: quem.email ?? '', role: quem.role ?? '', org_id: quem.org_id, client_project_id: quem.client_project_id, agente: quem.agente } : null;
  const ot = modulos.includes('ot') && atorOt ? await blocoOt(db, projectId, atorOt, dia, new Date()) : null;
  const c = cadastro.results[0] as { tratamentos: number; controles: number };
  const marcoBase = (marco.results[0] as { d: string | null } | undefined)?.d ?? null;
  // Decisão 8: a primeira base aprovada do n.ot é marco só para quem tem o ot (o bloco só existe para essa pessoa).
  const estado = estadoDoPrograma(primeiroMarco(marcoBase, ot?.marco ?? null), c.tratamentos > 0 || c.controles > 0 || (!!ot && !ot.comecando));
  // A régua comum: só os módulos do pedido; o n.ot só quando o bloco foi montado (mesma porta, P0-1/P0-2/P0-4).
  const programa = { ...estado, etapas: await etapasDoPrograma(db, projectId, modulos, { otAtor: ot ? atorOt : null }) };
```

  (`programa` continua sendo devolvido na linha 501 sem mudança.) Rode `grep -rn "estadoDoPrograma(" src` e confirme que só a carteira e este ponto chamam: a carteira (`situacaoNaCarteira`) **não** muda.

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run test/programa-rota.test.ts test/programa.test.ts test/painel.test.ts test/painel-ot.test.ts test/painel-ot-rota.test.ts test/painel-iso-ligacoes.test.ts test/marco-programa.test.ts test/onda2-numeros.test.ts test/contrato-isolamento-org.test.ts test/contrato-regra-unica.test.ts test/organizacao-direta.test.ts test/ot-tecnico.test.ts` → PASS (o teste de desempenho de `test/painel.test.ts:315` continua abaixo de 300 ms; se não, **não** suba o limite: pare e registre a mediana medida no relatório). Se `test/painel-ot.test.ts` comparar o bloco inteiro com `toEqual`, acrescente `marco: null` ao esperado. `npx tsc --noEmit` → sem erro. `git diff --stat c4c7039 -- test/onda2-numeros.test.ts` → vazio.
- [ ] **Step 5: Mutações** (uma por vez; cada uma derruba o teste indicado; restaure depois):
  1. Em `etapasDoPrograma`, troque `if (modulos.includes('ot') && a && ...` por `if (a && ...` e em `painelDoProjeto` passe `{ otAtor: atorOt }` → `pessoa sem o ot`, `agente`, `chave de API` falham.
  2. Em `painelDoProjeto`, troque `ot?.marco ?? null` por `(await db.prepare("SELECT min(base_aprovada_em) AS d FROM ot_sites WHERE project_id = ?").bind(projectId).first<{ d: string | null }>())?.d ?? null` → `marco do n.ot` falha (quem não tem o ot passa a ver "em operação").
  3. Em `etapasDoPrograma`, troque `JSON.parse(await sitesPermitidos(db, a, projectId))` por `(await db.prepare("SELECT id FROM ot_sites WHERE project_id = ? AND status = 'ativo'").bind(projectId).all<{ id: string }>()).results.map((x) => x.id)` → `técnico ... 0 sites` falha.
  4. Em `etapasDoPrograma`, acrescente `await materializarLegado(db, projectId);` (import de `./passos/legado`) antes do `carregarContexto` → `o painel só lê` falha.
- [ ] **Step 6: Commit** — `git add src/services/programa.ts src/services/painel.ts src/services/painel-ot.ts test/programa-rota.test.ts && git commit -m "feat(programa): programa.etapas no painel e marco do n.ot só para quem tem o módulo"`

### Task 8: Régua no Início ("Ver situação") e no topo do Painel

**Files:**
- Modify: `frontend/src/views/painel.js:30-32` (`TELAS_DO_PAINEL`, sem mudança de conteúdo; só conferir), `frontend/src/views/painel.js:123` (nova função `regua` antes de `passos`), `frontend/src/views/painel.js:175-178` (`telaDoModulo`, `topo`), `frontend/src/views/painel.js:235-243` (`linhaSituacao`), `frontend/src/views/painel.js:376` (nova `window.painelAbrirProximo` depois de `painelAbrirItem`), `frontend/src/style.css`
- Create: `frontend/test/painel-regua.test.js`

**Interfaces:**
- Consumes: `programa.etapas[m]: ProgramaDoModulo` (Task 7); `entrarNoProjeto(projectId)` (`painel.js:351`), `window.painelAbrir(tela, aba, filtro)` (`painel.js:487`), `TELAS_DO_PAINEL` (`painel.js:31-32`).
- Produces: `function regua(m, p, projectId): string` (HTML `<div class="pn-regua-bloco"><ol class="pn-regua">…</ol>…</div>`; vazio sem `p`); `window.painelAbrirProximo(projectId, tela, aba, fase, passo)` — entra no projeto (quando `projectId`), abre a Bancada na fase/passo (`navigate('project-detail', { bancadaAlvo })`) ou a tela pela `painelAbrir`; tela fora de `TELAS_DO_PAINEL` não faz nada. **Usada também pelo Task 16.**

- [ ] **Step 1: Escrever o teste que falha** — `frontend/test/painel-regua.test.js`:

```js
// Régua comum (onda 4): as cinco etapas por módulo, no topo do Painel e na linha "Ver situação" do Início. Só o que o servidor
// mandou: sem `ot` em programa.etapas, nada do n.ot é desenhado nem pedido (P0-1/P0-2).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));
vi.mock('../src/produto.js', async (original) => ({ ...(await original()), irPara: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { renderPainel } from '../src/views/painel.js';

const ETAPAS = (feitos = [2, 0, 0, 0, 0]) => [['comecar', 'Começar', 7], ['levantar', 'Levantar', 2], ['avaliar', 'Avaliar', 2], ['tratar', 'Tratar', 18], ['operar', 'Operar', 12]]
    .map(([id, rotulo, total], i) => ({ id, rotulo, feitos: feitos[i], total }));
const ISO = { etapa: 'comecar', feitos: 2, total: 41, proximo: { texto: 'Fase 2: Entrevistas <b>x</b>', tela: 'project-detail', fase: 2, passo: 'p2_1' }, etapas: ETAPAS() };
const BLOCO = (comecando) => ({ saude: { tom: 'plano', rotulo: 'Começando', frase: 'f', apoio: '' }, numeros: [['0 de 90', 'controles aplicáveis implementados']], comecando,
    fazer: [], cobertura: [], vencimentos: [], riscos: [], passos: [{ texto: 'Definir o escopo do SGSI', contexto: 'c', feito: false, acao: 'Definir o escopo', tela: 'context' }] });
const PAINEL = (comecando = true, etapas = { iso: ISO }) => ({ gerado_em: '2026-11-18T10:00:00Z', visao: 'equipe', modulos_pedidos: ['iso'], empresa: null, encarregados: [],
    programa: { estado: 'comecando', desde: null, rotulo: 'Começando', etapas }, saude: { tom: 'plano', rotulo: 'Começando', frase: 'f', apoio: '' }, modulos: { iso: BLOCO(comecando) } });
const el = (id) => document.getElementById(id);
const montar = () => { document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>'; };
/** Dublê que FALHA se a tela pedir qualquer coisa do n.ot. */
const servirSemOt = (rotas) => {
    const f = servir(rotas);
    const base = f.getMockImplementation();
    f.mockImplementation(async (u, o) => { if (String(u).includes('/ot')) throw new Error(`a tela pediu o n.ot: ${u}`); return base(u, o); });
    return f;
};

beforeEach(() => {
    S.token = 'tok'; S.user = { id: 'u1', role: 'consultor', modulos: ['iso', 'privacy'] };
    S.activeProject = { id: 'p9', client_name: 'Exemplo', modulos: ['iso', 'privacy', 'ot'] }; S.projects = [S.activeProject]; S.painel = {}; S.view = 'dashboard';
    window.render = vi.fn(); window.navigate = vi.fn(); window.ehEquipeNess = () => true;
    history.replaceState(null, '', '/iso');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); history.replaceState(null, '', '/'); delete window.ehEquipeNess; });

describe('régua no Painel do módulo', () => {
    it('as cinco etapas em ordem, a em curso marcada, o próximo passo escapado; nenhuma chamada ao n.ot', async () => {
        const f = servirSemOt({ 'GET /api/v1/projects/p9/painel': PAINEL() });
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'iso');
        const itens = [...el('c').querySelectorAll('.pn-regua li')];
        expect(itens.map((li) => li.querySelector('.pn-regua-nome').textContent)).toEqual(['Começar', 'Levantar', 'Avaliar', 'Tratar', 'Operar']);
        expect(itens[0].getAttribute('aria-current')).toBe('step');
        expect(itens[0].textContent).toContain('2 de 7');
        expect(el('c').querySelector('.pn-regua-prox').textContent).toContain('Fase 2: Entrevistas <b>x</b>');
        expect(el('c').querySelector('.pn-regua-prox b')).toBeNull();
        expect(el('c').textContent).not.toContain('n.ot');
        expect(f.mock.calls.every(([u]) => !String(u).includes('/ot'))).toBe(true);
    });
    it('"Primeiros passos" continuam no começo e saem quando o projeto deixa de começar; a régua fica nos dois', async () => {
        servirSemOt({ 'GET /api/v1/projects/p9/painel': PAINEL(true) });
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'iso');
        expect(el('c').textContent).toContain('Primeiros passos');
        expect(el('c').querySelector('.pn-regua')).not.toBeNull();
        S.painel = {};
        servirSemOt({ 'GET /api/v1/projects/p9/painel': PAINEL(false) });
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'iso');
        expect(el('c').textContent).not.toContain('Primeiros passos');
        expect(el('c').querySelector('.pn-regua')).not.toBeNull();
    });
    it('"Abrir" do próximo passo leva à Bancada na fase e no passo', async () => {
        servirSemOt({ 'GET /api/v1/projects/p9/painel': PAINEL() });
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'iso');
        const b = el('c').querySelector('.pn-regua-prox button');
        window.painelAbrirProximo(...JSON.parse(b.dataset.args));
        expect(window.navigate).toHaveBeenCalledWith('project-detail', { bancadaAlvo: { fase: 2, passo: 'p2_1' } });
    });
    it('tela fora da lista fechada não navega', () => {
        window.painelAbrirProximo('p9', 'users', null, null, null);
        expect(window.navigate).not.toHaveBeenCalled();
    });
});

describe('régua no "Ver situação" do Início', () => {
    it('uma régua por módulo que veio; sem `ot` no programa, nada do n.ot (nem pedido)', async () => {
        history.replaceState(null, '', '/');
        const f = servirSemOt({ 'GET /api/v1/projects/p9/painel': { ...PAINEL(false), modulos: { iso: BLOCO(false) } } });
        document.body.innerHTML = '<table><tbody><tr><td><button id="b" aria-expanded="false"></button></td><td></td></tr></tbody></table>';
        await window.painelVerSituacao('p9', 'Exemplo', el('b'));
        const linha = document.getElementById('ini-sit-p9');
        expect(linha.querySelectorAll('.pn-regua').length).toBe(1);
        expect(linha.querySelector('.pn-regua').getAttribute('aria-label')).toBe('Jornada do n.iso');
        expect(linha.textContent).not.toContain('n.ot');
        expect(f.mock.calls.every(([u]) => !String(u).includes('/ot'))).toBe(true);
    });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx vitest run test/painel-regua.test.js` → FAIL (`.pn-regua` não existe).
- [ ] **Step 3: Implementar** em `frontend/src/views/painel.js`. Antes de `function passos(lista)` (linha 123):

```js
/**
 * A régua comum (onda 4): as cinco etapas do módulo, a em curso marcada, e o próximo passo. Só o que o servidor mandou em
 * `programa.etapas` (o n.ot só vem a quem tem o módulo: P0-1/P0-2); sem a chave, nada.
 */
function regua(m, p, projectId) {
    if (!p || !Array.isArray(p.etapas)) return '';
    const itens = p.etapas.map((et) => {
        const situacao = et.total > 0 && et.feitos >= et.total ? 'feita' : et.id === p.etapa ? 'atual' : 'futura';
        return `<li class="pn-regua-etapa pn-regua-${situacao}"${et.id === p.etapa ? ' aria-current="step"' : ''}><span class="pn-regua-nome">${e(et.rotulo)}</span><span class="pn-meta">${e(`${et.feitos} de ${et.total}`)}</span></li>`;
    }).join('');
    const x = p.proximo;
    const prox = x ? `<p class="pn-regua-prox"><span class="pn-meta">Próximo:</span> ${e(x.texto)} <button type="button" class="btn btn-sm" data-action="painelAbrirProximo" data-args='${args(projectId, x.tela, x.aba || null, x.fase ?? null, x.passo || null)}' aria-label="${e(`Abrir: ${x.texto} (${NOME[m]})`)}">Abrir</button></p>` : '';
    return `<div class="pn-regua-bloco"><ol class="pn-regua" aria-label="${e(`Jornada do ${NOME[m]}`)}">${itens}</ol>${prox}</div>`;
}
```

  Em `telaDoModulo` (linha 177): `const topo = \`${identidade(d, proj)}${saude(d.saude, d.gerado_em)}\`;` → `const topo = \`${identidade(d, proj)}${saude(d.saude, d.gerado_em)}${regua(m, d.programa && d.programa.etapas && d.programa.etapas[m], proj.id)}\`;`. Em `linhaSituacao` (linha 243), o `return` passa a terminar com a régua: `return \`<div class="pn-m">…${botao}</div>${regua(m, d.programa && d.programa.etapas && d.programa.etapas[m], projectId)}\`;`. Depois de `window.painelAbrirItem` (linha 376):

```js
/** "Abrir" do próximo passo da régua: entra no projeto (no Início não há ativo) e vai à Bancada na fase/passo ou à tela da lista fechada. */
window.painelAbrirProximo = function (projectId, tela, aba, fase, passo) {
    if (!TELAS_DO_PAINEL.has(tela)) return;
    if (projectId && !entrarNoProjeto(projectId)) return;
    if (tela === 'project-detail' && (fase !== null || passo)) { window.navigate('project-detail', { bancadaAlvo: { fase, passo } }); return; }
    window.painelAbrir(tela, aba, null);
};
```

  `frontend/src/style.css`, no fim:

```css
/* Régua comum (onda 4): Começar, Levantar, Avaliar, Tratar, Operar */
.pn-regua { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; margin: 8px 0 4px; padding: 0; list-style: none; }
.pn-regua-etapa { display: flex; flex-direction: column; padding: 6px 8px; border-top: 3px solid var(--border); }
.pn-regua-feita { border-top-color: var(--success); }
.pn-regua-atual { border-top-color: var(--accent); }
.pn-regua-nome { font-weight: 600; }
.pn-regua-prox { margin: 4px 0 8px; }
```

- [ ] **Step 4: Rodar e ver passar** — `cd frontend && npx vitest run test/painel-regua.test.js test/painel-view.test.js test/dashboard-view.test.js test/ot-modulo.test.js` → PASS; `cd frontend && npm run build` → `✓ built in`.
- [ ] **Step 5: Mutação** — em `regua`, troque `aria-label="${e(\`Jornada do ${NOME[m]}\`)}"` por `aria-label="Jornada"` → o caso do Início falha; tire o `if (!TELAS_DO_PAINEL.has(tela)) return;` → "tela fora da lista fechada" falha; restaure.
- [ ] **Step 6: Commit** — `git add frontend/src/views/painel.js frontend/src/style.css frontend/test/painel-regua.test.js && git commit -m "feat(programa): régua das cinco etapas no Painel e no Ver situação do Início"`

### Task 9: Documentação e contrato do PR3

**Files:**
- Modify: `AGENTS.md` (item **Regras unicas**, linha 178-181, e o item da entrada do n.360, linha 600-606), `CHANGELOG.md`, e, se mudarem, `docs/openapi.json`, `mcp-server-niso/src/contrato-gerado.ts`

- [ ] **Step 1: Contrato.** `npm run openapi` e `git status --short docs/openapi.json mcp-server-niso/src/contrato-gerado.ts`. Esperado: nada (o OpenAPI descreve só corpo de requisição; o `/painel` é GET sem corpo). Se aparecer diff, commite-o neste task. `npx vitest run test/openapi.test.ts test/contrato-mcp.test.ts` → PASS.
- [ ] **Step 2: AGENTS.md (sem acentos).** No item **Regras unicas** (linha 178-181), depois de `o marco "Em operacao desde" e \`SQL_MARCO_DO_PROGRAMA\` (...)`, acrescente: `mais, so para quem tem o \`ot\` (o bloco \`ot\` do painel existe so para essa pessoa), a primeira \`ot_sites.base_aprovada_em\` dos sites dela (\`blocoOt\`, \`marco\`; \`primeiroMarco\` em \`src/services/programa.ts\`)`. Depois do item da entrada do n.360 (linha 606), acrescente um item novo:

```
- **Jornada comum (onda 4, spec `docs/superpowers/specs/2026-11-18-onda4-jornada-comum-design.md`):** cinco etapas fixas em todo modulo
  (Comecar, Levantar, Avaliar, Tratar, Operar; `ETAPAS_COMUNS` em `src/data/programa.ts`). `GET /projects/:id/painel` devolve
  `programa.etapas` (um `ProgramaDoModulo` por modulo do pedido: `etapa`, `feitos`, `total`, `proximo`, `etapas`), calculado por
  `etapasDoPrograma` (`src/services/programa.ts`), que SO LE: n.iso por fase (`FASES_DO_ISO`: 0-6, 7-8, 9-10, 11-28, 29-40;
  `carregarContexto` + `montarBancada`, nunca a rota da Bancada, que grava); n.ot por site (`situacaoDoSite` dos `sitesPermitidos`;
  em operacao com desvio aberto = Tratar), so quando o painel montou o bloco `ot` (P0-1/P0-2; `test/programa-rota.test.ts`). Sem o
  `ot`, nenhuma chave, contagem ou texto do n.ot. A regua aparece no topo do Painel do n.iso e do n.privacy e na linha "Ver situacao"
  do Inicio (`regua` em `views/painel.js`; o n.ot nao tem Painel). O estado do programa e por espectador (quem tem o `ot` pode ver
  "Em operacao" onde quem nao tem ve "Comecando"): nao vaza nada.
```

- [ ] **Step 3: CHANGELOG.md**, na seção da onda 4: `- **Régua comum:** o Painel do n.iso e a linha "Ver situação" do Início mostram as cinco etapas (Começar, Levantar, Avaliar, Tratar, Operar) e o próximo passo de cada módulo. Quem tem o n.ot passa a ver o programa "Em operação" desde a primeira base de site aprovada; quem não tem o módulo não vê nada do n.ot.`
- [ ] **Step 4: Rodar** `npx vitest run test/openapi.test.ts test/onda2-numeros.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add AGENTS.md CHANGELOG.md` (e os gerados, se mudaram) `&& git commit -m "docs(onda4): régua comum, programa.etapas e marco do n.ot"`

**Entrega PR3:** `bash scripts/ci/gate.sh`; PR (rascunho) "onda 4 PR3: modelo comum (programa.etapas)"; revisão em modelo forte do Task 7.

---

## PR4 — Trilha do n.privacy na tela (sem migration)

### Task 10: Catálogo das 7 etapas do n.privacy e derivação

**Files:**
- Modify: `src/data/programa.ts` (acrescenta `CRITERIOS_PRIVACY`, `PASSOS_PRIVACY`), `src/services/programa.ts` (`etapasDoPrivacy`; `etapasDoPrograma` ganha `visaoPrivacy`), `src/services/painel.ts:268-288` (`blocoPrivacy` devolve `visao`), `src/services/painel.ts` (chamada de `etapasDoPrograma` do Task 7)
- Modify (teste): `test/programa.test.ts`, `test/programa-rota.test.ts`

**Interfaces:**
- Consumes: `visaoDoEncarregado(db, projectId, { cliente })` (`src/services/encarregado.ts:42`; campos usados: `encarregados`, `tratamentos.{total,sem_base_legal,sem_responsavel,lia_pendente,dpia_pendente}`, `terceiros.{total,sem_tipo,pendentes,vencidos,reprovados}`, `prazos_legais.nao_definidos`, `pedidos_titular.atrasados`, `incidentes.comunicacoes_atrasadas`, `lgpd.{carregada,lacunas}`). As chaves de prazo da etapa 5 são as de `CHAVES` (`src/services/parametros-legais.ts:9-13`: `titular.resposta`, `incidente.comunicacao_anpd`, `incidente.comunicacao_titular`), lidas como `prazos_legais.nao_definidos` vazio.
- Produces: `CRITERIOS_PRIVACY` (lista fechada); `type PassoPrivacy = { id: string; ordem: number; rotulo: string; etapa: EtapaComum; criterio: CriterioPrivacy; tela: string; acao: string }`; `PASSOS_PRIVACY: readonly PassoPrivacy[]` (7, `rotulo` igual ao da tabela da skill); `type VisaoDoEncarregado = Awaited<ReturnType<typeof visaoDoEncarregado>>`; `criterioPrivacy(c: string, v: VisaoDoEncarregado): boolean` (falha fechada); `etapasDoPrivacy(v: VisaoDoEncarregado): ProgramaDoModulo` (com `passos`); `LidosDoPainel` ganha `visaoPrivacy?: VisaoDoEncarregado`.

- [ ] **Step 1: Escrever os testes que falham.** Em `test/programa.test.ts`:

```ts
import { PASSOS_PRIVACY, CRITERIOS_PRIVACY } from '../src/data/programa';
import { etapasDoPrivacy, criterioPrivacy, type VisaoDoEncarregado } from '../src/services/programa';

const visao = (x: Record<string, unknown> = {}): VisaoDoEncarregado => ({
  encarregados: [], tratamentos: { total: 0, sem_base_legal: 0, sem_responsavel: 0, lia_pendente: 0, dpia_pendente: 0, com_terceiro_vencido: 0 },
  terceiros: { total: 0, sem_tipo: 0, pendentes: 0, vencidos: 0, reprovados: 0, com_pendencia: 0 }, prazos_legais: { nao_definidos: ['titular.resposta'] },
  pedidos_titular: { atrasados: 0 }, incidentes: { comunicacoes_atrasadas: 0 }, lgpd: { carregada: false }, ...x,
}) as unknown as VisaoDoEncarregado;

describe('trilha do n.privacy (7 etapas da skill, derivadas)', () => {
  it('7 passos, ordens 0 a 6, critério da lista fechada, etapa comum e tela conhecida', () => {
    expect(PASSOS_PRIVACY.map((p) => p.ordem).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const p of PASSOS_PRIVACY) expect(CRITERIOS_PRIVACY, p.id).toContain(p.criterio);
    expect(PASSOS_PRIVACY.map((p) => [p.rotulo, p.etapa])).toEqual([['Partida', 'comecar'], ['Encarregado', 'comecar'], ['Inventário', 'levantar'],
      ['Bases e riscos', 'avaliar'], ['Terceiros', 'tratar'], ['Documentos e cobertura', 'tratar'], ['Titular e incidentes', 'operar']]);
  });
  it('projeto vazio: nada feito, Começar, próximo é a Partida', () => {
    const p = etapasDoPrivacy(visao());
    expect(p).toMatchObject({ etapa: 'comecar', feitos: 0, total: 7, proximo: { texto: 'Partida', tela: 'importacao' } });
    expect(p.passos!.every((x) => !x.feito)).toBe(true);
  });
  it('encarregado e inventário completo: Começar e Levantar feitos; a etapa em curso é Avaliar', () => {
    const p = etapasDoPrivacy(visao({ encarregados: [{ id: 'e', nome: 'E', email: null }],
      tratamentos: { total: 3, sem_base_legal: 0, sem_responsavel: 0, lia_pendente: 1, dpia_pendente: 0, com_terceiro_vencido: 0 } }));
    expect(p.etapas.slice(0, 3).map((e) => [e.id, e.feitos, e.total])).toEqual([['comecar', 2, 2], ['levantar', 1, 1], ['avaliar', 0, 1]]);
    expect(p.etapa).toBe('avaliar');
  });
  it('etapa 5 exige os três prazos cadastrados e nada atrasado', () => {
    expect(criterioPrivacy('prazos_e_atrasos', visao({ prazos_legais: { nao_definidos: [] } }))).toBe(true);
    expect(criterioPrivacy('prazos_e_atrasos', visao({ prazos_legais: { nao_definidos: [] }, pedidos_titular: { atrasados: 1 } }))).toBe(false);
    expect(criterioPrivacy('prazos_e_atrasos', visao())).toBe(false);
  });
  it('cobertura só com o catálogo LGPD carregado e sem lacuna', () => {
    expect(criterioPrivacy('cobertura_lgpd', visao({ lgpd: { carregada: true, lacunas: 0, total: 10 } }))).toBe(true);
    expect(criterioPrivacy('cobertura_lgpd', visao({ lgpd: { carregada: false } }))).toBe(false);
  });
  it('critério desconhecido falha fechado', () => {
    expect(criterioPrivacy('qualquer_coisa', visao({ encarregados: [{}], tratamentos: { total: 9 } }))).toBe(false);
  });
});
```

  Em `test/programa-rota.test.ts`, acrescente `habilitarPrivacy` ao import de `./helpers/d1` e, no fim do arquivo (a pessoa `u-s` não tem o privacy; habilite e conceda no próprio teste):

```ts
describe('programa.etapas.privacy', () => {
  it('quem tem o n.privacy recebe a trilha de 7 passos; quem não tem, nenhuma chave privacy', async () => {
    await habilitarPrivacy('proj-a');
    await concederModulos(['u-t'], ['iso', 'ot', 'privacy']);
    const d = await painel(tecnico, '?modulo=privacy');
    expect(Object.keys(d.programa.etapas)).toEqual(['privacy']);
    expect(d.programa.etapas.privacy.passos.map((p: any) => p.rotulo)).toEqual(['Partida', 'Encarregado', 'Inventário', 'Bases e riscos', 'Terceiros', 'Documentos e cobertura', 'Titular e incidentes']);
    expect((await painel(semOt)).programa.etapas.privacy).toBeUndefined();
  });
});
```

  (Rode-o por último no arquivo: ele muda o projeto. Se a ordem incomodar, ponha-o num `describe` no fim e confira que os anteriores não dependem de o privacy estar desligado.)

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/programa.test.ts test/programa-rota.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** `src/data/programa.ts`, no fim:

```ts
/** Lista FECHADA do que decide se um passo da trilha do n.privacy está feito: cada chave tem a sua regra em `criterioPrivacy`. */
export const CRITERIOS_PRIVACY = ['algum_cadastro', 'encarregado', 'inventario_completo', 'bases_e_riscos', 'terceiros_em_dia', 'prazos_e_atrasos', 'cobertura_lgpd'] as const;
export type CriterioPrivacy = (typeof CRITERIOS_PRIVACY)[number];
export type PassoPrivacy = { id: string; ordem: number; rotulo: string; etapa: EtapaComum; criterio: CriterioPrivacy; tela: string; acao: string };

/**
 * As 7 etapas da skill `implantacao-privacy` (decisão 2: só derivadas, sem marca manual). `rotulo` é o mesmo da tabela da skill
 * (`test/agente-skills.test.ts` cobra). Ordem na trilha = ordem das etapas comuns; `ordem` é o número da skill.
 */
export const PASSOS_PRIVACY: readonly PassoPrivacy[] = [
  { id: 'partida', ordem: 0, rotulo: 'Partida', etapa: 'comecar', criterio: 'algum_cadastro', tela: 'importacao', acao: 'Trazer o que já existe' },
  { id: 'encarregado', ordem: 1, rotulo: 'Encarregado', etapa: 'comecar', criterio: 'encarregado', tela: 'encarregado', acao: 'Indicar o encarregado' },
  { id: 'inventario', ordem: 2, rotulo: 'Inventário', etapa: 'levantar', criterio: 'inventario_completo', tela: 'ropa', acao: 'Abrir os tratamentos' },
  { id: 'bases_e_riscos', ordem: 3, rotulo: 'Bases e riscos', etapa: 'avaliar', criterio: 'bases_e_riscos', tela: 'ropa', acao: 'Fazer LIA e RIPD' },
  { id: 'terceiros', ordem: 4, rotulo: 'Terceiros', etapa: 'tratar', criterio: 'terceiros_em_dia', tela: 'terceiros', acao: 'Avaliar os fornecedores' },
  { id: 'documentos', ordem: 6, rotulo: 'Documentos e cobertura', etapa: 'tratar', criterio: 'cobertura_lgpd', tela: 'requisitos', acao: 'Ver as lacunas' },
  { id: 'titular', ordem: 5, rotulo: 'Titular e incidentes', etapa: 'operar', criterio: 'prazos_e_atrasos', tela: 'titular', acao: 'Ver os pedidos' },
];
```

  `src/services/programa.ts`:

```ts
import { PASSOS_PRIVACY } from '../data/programa';
import type { visaoDoEncarregado } from './encarregado';

export type VisaoDoEncarregado = Awaited<ReturnType<typeof visaoDoEncarregado>>;

/** Regra de cada critério do n.privacy sobre a visão do encarregado. Chave fora da lista: falso (falha fechada). */
export function criterioPrivacy(c: string, v: VisaoDoEncarregado): boolean {
  const t = v.tratamentos, te = v.terceiros;
  switch (c) {
    case 'algum_cadastro': return v.encarregados.length + t.total + te.total > 0;
    case 'encarregado': return v.encarregados.length > 0;
    case 'inventario_completo': return t.total > 0 && t.sem_base_legal === 0 && t.sem_responsavel === 0;
    case 'bases_e_riscos': return t.total > 0 && t.lia_pendente === 0 && t.dpia_pendente === 0;
    case 'terceiros_em_dia': return te.total > 0 && te.sem_tipo + te.pendentes + te.vencidos + te.reprovados === 0;
    // Etapa 5: os prazos de `parametros_legais` (global) que pedido e incidente usam (CHAVES) cadastrados, e nada atrasado.
    case 'prazos_e_atrasos': return v.prazos_legais.nao_definidos.length === 0 && v.pedidos_titular.atrasados === 0 && v.incidentes.comunicacoes_atrasadas === 0;
    case 'cobertura_lgpd': return v.lgpd.carregada === true && v.lgpd.lacunas === 0;
    default: return false;
  }
}

/** n.privacy: a trilha de 7 passos na ordem das etapas comuns; a etapa em curso é a do primeiro passo por fazer. */
export function etapasDoPrivacy(v: VisaoDoEncarregado): ProgramaDoModulo {
  const passos: PassoDaTrilha[] = [...PASSOS_PRIVACY].sort((a, b) => indice(a.etapa) - indice(b.etapa))
    .map((p) => ({ id: p.id, ordem: p.ordem, rotulo: p.rotulo, etapa: p.etapa, feito: criterioPrivacy(p.criterio, v), tela: p.tela, acao: p.acao }));
  const etapas = ETAPAS_COMUNS.map(({ id, rotulo }) => {
    const da = passos.filter((p) => p.etapa === id);
    return { id, rotulo, feitos: da.filter((p) => p.feito).length, total: da.length };
  });
  const prox = passos.find((p) => !p.feito);
  return { etapa: prox?.etapa ?? 'operar', feitos: passos.filter((p) => p.feito).length, total: passos.length,
    proximo: prox ? { texto: prox.rotulo, tela: prox.tela } : null, etapas, passos };
}
```

  Em `etapasDoPrograma`: `LidosDoPainel` vira `{ otAtor?: AtorPainelOt | null; visaoPrivacy?: VisaoDoEncarregado }` e, depois da linha do iso, `if (modulos.includes('privacy') && lidos.visaoPrivacy) r.privacy = etapasDoPrivacy(lidos.visaoPrivacy);`. Em `src/services/painel.ts`, no `return` de `blocoPrivacy` (linha 269) acrescente `visao,` (o objeto `modulosResp` escolhe campos um a um, então a visão não vai para a resposta: confira em `painelDoProjeto`, linhas 486-488), e a chamada do Task 7 passa `{ otAtor: ot ? atorOt : null, visaoPrivacy: privacy?.visao }`.

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run test/programa.test.ts test/programa-rota.test.ts test/painel.test.ts test/encarregado*.test.ts test/onda2-numeros.test.ts test/contrato-isolamento-org.test.ts` → PASS; `npx tsc --noEmit`; `git diff --stat c4c7039 -- test/onda2-numeros.test.ts` → vazio. Confirme que a resposta do painel não ganhou `visao` em `modulos.privacy`: `npx vitest run test/painel.test.ts` com um `expect(corpo.modulos.privacy.visao).toBeUndefined()` acrescentado ao teste "n.privacy: empresa, estado do programa..." (`test/painel.test.ts:143`).
- [ ] **Step 5: Mutação** — `default: return false;` → `default: return true;`: "critério desconhecido falha fechado" cai; restaure.
- [ ] **Step 6: Commit** — `git add src/data/programa.ts src/services/programa.ts src/services/painel.ts test/programa.test.ts test/programa-rota.test.ts test/painel.test.ts && git commit -m "feat(privacy): trilha de 7 etapas derivada no programa.etapas"`

### Task 11: Trilha na tela do n.privacy

**Files:**
- Modify: `frontend/src/views/painel.js` (`telaDoModulo`, linhas 191-199; nova função `trilha`), `frontend/test/painel-regua.test.js`

**Interfaces:**
- Consumes: `programa.etapas.privacy.passos: PassoDaTrilha[]` (Task 10); `window.painelAbrirProximo` (Task 8); `estado(tom, texto)`, `quadro(id, titulo, corpo)` (`painel.js:24-25`).
- Produces: quadro "Trilha de implantação" (`#pn-trilha-t`) no lado esquerdo do Painel do n.privacy **quando o projeto não está começando** (no começo, os "Primeiros passos" seguem como estão).

- [ ] **Step 1: Teste que falha** — em `frontend/test/painel-regua.test.js`:

```js
describe('trilha do n.privacy', () => {
    const PASSOS = [['partida', 'Partida', true, 'importacao'], ['encarregado', 'Encarregado', true, 'encarregado'], ['inventario', 'Inventário', false, 'ropa']]
        .map(([id, rotulo, feito, tela], i) => ({ id, ordem: i, rotulo, etapa: i < 2 ? 'comecar' : 'levantar', feito, tela, acao: `Abrir ${rotulo} <i>x</i>` }));
    const PRIV = { etapa: 'levantar', feitos: 2, total: 7, proximo: { texto: 'Inventário', tela: 'ropa' }, etapas: ETAPAS([2, 0, 0, 0, 0]), passos: PASSOS };
    const comPrivacy = (comecando) => ({ ...PAINEL(comecando, { privacy: PRIV }), modulos_pedidos: ['privacy'], modulos: { privacy: { ...BLOCO(comecando), passos: [] } } });
    it('fora do começo: a trilha com Feito e o botão do passo por fazer, escapado', async () => {
        history.replaceState(null, '', '/privacy'); S.view = 'encarregado';
        servirSemOt({ 'GET /api/v1/projects/p9/painel': comPrivacy(false) });
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'privacy');
        const t = el('c').querySelector('#pn-trilha-t').closest('section');
        expect([...t.querySelectorAll('li')].map((li) => li.querySelector('.pn-tx').textContent)).toEqual(['Partida', 'Encarregado', 'Inventário']);
        expect(t.querySelectorAll('.pn-estado').length).toBe(2);
        const b = t.querySelector('button[data-action="painelAbrirProximo"]');
        expect(JSON.parse(b.dataset.args)).toEqual(['p9', 'ropa', null, null, null]);
        expect(t.querySelector('i')).toBeNull();
    });
    it('no começo, os "Primeiros passos" ficam e a trilha não aparece', async () => {
        history.replaceState(null, '', '/privacy'); S.view = 'encarregado';
        servirSemOt({ 'GET /api/v1/projects/p9/painel': comPrivacy(true) });
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'privacy');
        expect(el('c').querySelector('#pn-trilha-t')).toBeNull();
        expect(el('c').textContent).toContain('Primeiros passos');
    });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx vitest run test/painel-regua.test.js` → FAIL.
- [ ] **Step 3: Implementar** em `frontend/src/views/painel.js`, depois de `regua`:

```js
const ROTULO_ETAPA_COMUM = { comecar: 'Começar', levantar: 'Levantar', avaliar: 'Avaliar', tratar: 'Tratar', operar: 'Operar' };
/** A trilha de implantação do n.privacy (onda 4): os 7 passos da skill, derivados pelo servidor; "Feito" ou o botão do passo. */
function trilha(lista, projectId) {
    const ps = Array.isArray(lista) ? lista : [];
    return `<ol class="pn-passos">${ps.map((p) => `<li><div><div class="pn-tx">${e(p.rotulo)}</div><div class="pn-meta">${e(ROTULO_ETAPA_COMUM[p.etapa] || '')}</div></div>
        ${p.feito ? estado('ok', 'Feito') : `<button type="button" class="btn btn-sm" data-action="painelAbrirProximo" data-args='${args(projectId, p.tela, null, null, null)}' aria-label="${e(`${p.acao}: ${p.rotulo}`)}">${e(p.acao)}</button>`}</li>`).join('')}</ol>`;
}
```

  Em `telaDoModulo`, na linha que monta `esquerda` (linha 196), acrescente a trilha para o n.privacy:

```js
    const pv = m === 'privacy' && d.programa && d.programa.etapas && d.programa.etapas.privacy;
    const esquerda = [...decidir, quadro('pn-fazer', 'O que fazer agora', listaFazer(b.fazer, false)),
        ...(pv && Array.isArray(pv.passos) ? [quadro('pn-trilha-t', 'Trilha de implantação', trilha(pv.passos, proj.id))] : []),
        quadro('pn-venc', 'Próximos vencimentos, 90 dias', graficoVencimentos(b.vencimentos), porPrazo)];
```

- [ ] **Step 4: Rodar e ver passar** — `cd frontend && npx vitest run test/painel-regua.test.js test/painel-view.test.js test/encarregado*.test.js` → PASS; `cd frontend && npm run build` → `✓ built in`.
- [ ] **Step 5: Commit** — `git add frontend/src/views/painel.js frontend/test/painel-regua.test.js && git commit -m "feat(privacy): trilha de implantação no Painel do n.privacy"`

### Task 12: Skill `implantacao-privacy` aponta a trilha da tela; gerado junto **[revisor opus]**

**Files:**
- Modify: `agent-skills/implantacao-privacy/SKILL.md` (seção "Ordem de trabalho", linhas 28-36, e "Critério de pronto", 42-47), `src/mcp/skills-gerado.ts` (gerado), `test/agente-skills.test.ts`

**Interfaces:**
- Consumes: `PASSOS_PRIVACY` (Task 10); `SKILLS` de `src/mcp/skills-gerado.ts`; `npm run skills:gerar` (`scripts/gerar-skills.mjs`).
- Produces: a skill cita `programa.etapas.privacy` (`GET /api/v1/projects/{p}/painel?modulo=privacy`) como o lugar onde a trilha está; os rótulos da tabela batem com `PASSOS_PRIVACY` (teste).

- [ ] **Step 1: Teste que falha** — em `test/agente-skills.test.ts`, um `describe` novo:

```ts
import { PASSOS_PRIVACY } from '../src/data/programa';
describe('implantacao-privacy e a trilha da tela (onda 4)', () => {
  const skill = SKILLS['implantacao-privacy'].arquivos['SKILL.md'];
  it('cada passo da trilha tem a linha da skill com o mesmo número e rótulo', () => {
    for (const p of PASSOS_PRIVACY) expect(skill, p.id).toContain(`| ${p.ordem}. ${p.rotulo} |`);
  });
  it('a skill manda ler a trilha no painel, não recalcular por conta própria', () => {
    expect(skill).toContain('programa.etapas.privacy');
    expect(skill).toContain('/painel?modulo=privacy');
  });
});
```

  (O teste da linha 18 já cobra que `skills-gerado.ts` está em dia com a pasta.)

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/agente-skills.test.ts` → FAIL só em "a skill manda ler a trilha no painel" (`programa.etapas.privacy` ausente). O caso dos rótulos já passa: a tabela de `SKILL.md:18-26` tem `| 0. Partida |` … `| 6. Documentos e cobertura |`, iguais a `PASSOS_PRIVACY` (conferido no HEAD `c4c7039`).
- [ ] **Step 3: Implementar.** Em `agent-skills/implantacao-privacy/SKILL.md`, logo antes de `## Ordem de trabalho` (linha 28), acrescente:

```markdown
## Onde o projeto está

A trilha destas 7 etapas aparece no Painel do n.privacy e sai, já calculada, em `programa.etapas.privacy` de
`GET /api/v1/projects/{p}/painel?modulo=privacy` (`passos`: cada etapa com `feito` e a tela; `proximo`: a primeira por fazer). Leia
de lá antes de começar e depois de cada rodada; não recalcule por conta própria. "Feito" ali é derivado do cadastro (sem marca
manual): uma etapa só fica feita quando o registro existe.
```

  e, em "Critério de pronto" (linha 47), no item **Programa pronto para operar**, acrescente ao fim: `; na trilha da tela, as 7 etapas feitas`. Confira que a tabela das linhas 18-26 tem exatamente `| 0. Partida |`, `| 1. Encarregado |`, `| 2. Inventário |`, `| 3. Bases e riscos |`, `| 4. Terceiros |`, `| 5. Titular e incidentes |`, `| 6. Documentos e cobertura |` (ajuste a skill, não o catálogo, se um rótulo divergir: o catálogo segue a skill). Depois: `npm run skills:gerar`.
- [ ] **Step 4: Rodar e ver passar** — `npx vitest run test/agente-skills.test.ts test/agente-cadastro.test.ts test/contrato-mcp.test.ts` → PASS; `git diff --stat` mostra só `agent-skills/implantacao-privacy/SKILL.md`, `src/mcp/skills-gerado.ts` e `test/agente-skills.test.ts`.
- [ ] **Step 5: Mutação** — mude `| 3. Bases e riscos |` para `| 3. Bases legais e riscos |` na skill e rode `npm run skills:gerar`: o teste "mesmo número e rótulo" cai; edite a skill **sem** regenerar: o teste da linha 18 cai. Restaure as duas (e regenere).
- [ ] **Step 6: Commit** — `git add agent-skills/implantacao-privacy/SKILL.md src/mcp/skills-gerado.ts test/agente-skills.test.ts && git commit -m "feat(agente): implantacao-privacy lê a trilha do painel; gerado regenerado junto"`

### Task 13: Documentação do PR4

**Files:**
- Modify: `AGENTS.md` (item "Jornada comum" do Task 9; item das skills, linha 718-722), `CHANGELOG.md`

- [ ] **Step 1: AGENTS.md (sem acentos).** No item "Jornada comum", depois de `n.ot por site (...)`, acrescente: `; n.privacy pelas 7 etapas da skill \`implantacao-privacy\` (\`PASSOS_PRIVACY\` em \`src/data/programa.ts\`, criterio de chave fechada \`CRITERIOS_PRIVACY\` avaliado por \`criterioPrivacy\` sobre \`visaoDoEncarregado\`, falha fechada; a etapa 5 exige as tres chaves de \`CHAVES\` de \`parametros_legais\` cadastradas e nada atrasado; sem marca manual nem migration). O Painel do n.privacy mostra a "Trilha de implantacao" quando o projeto sai do comeco; a skill le \`programa.etapas.privacy\` e o rotulo de cada etapa e o da tabela da skill (\`test/agente-skills.test.ts\`).` No item das skills (linha 720), depois de `\`npm run skills:gerar\` escreve \`src/mcp/skills-gerado.ts\``, nada muda (a regra já está); confira.
- [ ] **Step 2: CHANGELOG.md**, seção da onda 4: `- **Trilha de implantação do n.privacy na tela:** as 7 etapas (Partida, Encarregado, Inventário, Bases e riscos, Terceiros, Titular e incidentes, Documentos e cobertura), derivadas do cadastro, no Painel do n.privacy e na régua; o agente lê a mesma trilha.`
- [ ] **Step 3: Rodar** `npx vitest run test/agente-skills.test.ts` → PASS.
- [ ] **Step 4: Commit** — `git add AGENTS.md CHANGELOG.md && git commit -m "docs(onda4): trilha do n.privacy na tela e na skill"`

**Entrega PR4:** `bash scripts/ci/gate.sh`; PR (rascunho) "onda 4 PR4: trilha do n.privacy"; revisão em modelo forte do Task 12.

---

## PR5 — Onboarding encadeado (sem migration, sem rota nova)

### Task 14: Contrato das rotas que o assistente usa (P0-1 e travas da onda 1) **[revisor opus]**

**Files:**
- Create: `test/onboarding-rotas.test.ts`

**Interfaces:**
- Consumes (rotas atuais, sem mudança): `POST /api/v1/platform/orgs` (`src/routes/organizacoes.ts:53`), `POST /api/v1/projects` (`src/routes/projects.ts:327`), `POST /api/v1/users` com `modulos` opcional (`src/routes/users.ts:196`, `createUserSchema` em `src/schemas/users.ts:16-25`; recusa conta de cliente em organização direta para quem não é `platform_admin`, linhas 233-235), `POST /api/v1/projects/:id/governance` (`src/routes/governance.ts:166`, `PODE_DESIGNAR_CONSULTOR` na linha 89), gatilho `usuario_modulos_padrao` (`schema.sql:1906-1916`, nunca dá `ot`).
- Produces: nada de código; trava o contrato que os Tasks 15 e 16 usam.

- [ ] **Step 1: Escrever o teste** (arranjo de `test/organizacao-direta.test.ts:1-30`):

```ts
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

// Onda 4, PR5: o assistente encadeado só usa rotas que já existem. Este arquivo trava o que ele precisa delas:
// P0-1 (ot nunca por padrão; só marcado), a organização direta sem conta de cliente (onda 1, decisão 8) e a designação do consultor.
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, h: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv() as any);
const modulosDe = async (email: string) => (await env.DB.prepare(`SELECT m.modulo FROM usuario_modulos m JOIN users u ON u.id = m.user_id WHERE u.email = ? ORDER BY m.modulo`).bind(email).all<{ modulo: string }>()).results.map((r) => r.modulo);
const S: Record<string, Record<string, string>> = {};
const P: Record<string, string> = {};

async function orgComAdmin(tipo: 'consultoria' | 'direta', slug: string) {
  const r = await chamar('POST', '/api/v1/platform/orgs', S.pa, { nome: `Org ${slug}`, slug, adminEmail: `admin@${slug}.lat`, adminNome: 'Admin', tipo,
    modulos: ['iso', 'privacy', 'ot'], maxProjetos: 5, maxUsuarios: 20, termoVersao: 'v1', ...(tipo === 'consultoria' ? { prefixoProposta: slug.slice(0, 3).toUpperCase() } : {}) });
  expect(r.status).toBe(201);
  const admin = await env.DB.prepare(`SELECT id, org_id FROM users WHERE email = ?`).bind(`admin@${slug}.lat`).first<{ id: string; org_id: string }>();
  S[slug] = await sessionFor({ id: admin!.id, email: `admin@${slug}.lat`, role: 'consultoria_admin', org_id: admin!.org_id });
  const pj = await chamar('POST', '/api/v1/projects', S[slug], { client_name: `Cliente ${slug}`, modulos: ['iso', 'ot'] });
  expect(pj.status).toBe(201);
  P[slug] = ((await pj.json()) as { id: string }).id;
}

afterEach(() => vi.restoreAllMocks());
beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id, ativo) VALUES ('u-pa4', 'pa4@ness.lat', 'x', 'PA', 'platform_admin', 'org_ness', 1)`).run();
  S.pa = await sessionFor({ id: 'u-pa4', email: 'pa4@ness.lat', role: 'platform_admin' });
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}'));
  await orgComAdmin('consultoria', 'cons-on4');
  await orgComAdmin('direta', 'dir-on4');
});

describe('Pessoas e acessos: o que as rotas garantem', () => {
  it('P0-1: convite sem `modulos` nunca dá o ot (gatilho), mesmo com o ot contratado e no projeto', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}'));
    const r = await chamar('POST', '/api/v1/users', S['cons-on4'], { name: 'Equipe Um', email: 'eq1@cons-on4.lat', role: 'consultor' });
    expect(r.status).toBe(201);
    expect(await modulosDe('eq1@cons-on4.lat')).not.toContain('ot');
  });
  it('o ot só entra marcado, com trilha `usuario.modulos`', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}'));
    expect((await chamar('POST', '/api/v1/users', S['cons-on4'], { name: 'Equipe Dois', email: 'eq2@cons-on4.lat', role: 'consultor', modulos: ['iso', 'ot'] })).status).toBe(201);
    expect(await modulosDe('eq2@cons-on4.lat')).toEqual(['iso', 'ot']);
    expect(await env.DB.prepare(`SELECT 1 AS x FROM audit_logs WHERE action = 'usuario.modulos' AND details LIKE '%eq2@cons-on4.lat%'`).first()).not.toBeNull();
  });
  it('consultoria: conta de cliente presa ao projeto novo, com os módulos marcados', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}'));
    const r = await chamar('POST', '/api/v1/users', S['cons-on4'], { name: 'Gestora', email: 'gestora@cliente.lat', role: 'org_admin', client_project_id: P['cons-on4'], modulos: ['iso'] });
    expect(r.status).toBe(201);
    expect(await modulosDe('gestora@cliente.lat')).toEqual(['iso']);
  });
  it('direta: conta de cliente é recusada (onda 1, decisão 8); equipe passa', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}'));
    const r = await chamar('POST', '/api/v1/users', S['dir-on4'], { name: 'Cliente', email: 'cli@dir-on4.lat', role: 'org_user', client_project_id: P['dir-on4'], modulos: ['iso'] });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toMatch(/direta/);
    expect((await chamar('POST', '/api/v1/users', S['dir-on4'], { name: 'Equipe', email: 'eq@dir-on4.lat', role: 'consultor', modulos: ['iso'] })).status).toBe(201);
  });
  it('o admin designa o consultor convidado no projeto (governança)', async () => {
    const r = await chamar('POST', `/api/v1/projects/${P['cons-on4']}/governance`, S['cons-on4'], { name: 'Equipe Um', email: 'eq1@cons-on4.lat', role_category: 'consultor', job_title: 'Consultor' });
    expect(r.status).toBeLessThan(300);
    expect(await env.DB.prepare(`SELECT 1 AS x FROM project_governance WHERE project_id = ? AND email = 'eq1@cons-on4.lat' AND role_category = 'consultor'`).bind(P['cons-on4']).first()).not.toBeNull();
  });
});
```

  (Os campos exigidos por `criarOrgSchema` e `projetoCriarSchema` podem pedir mais do que isto; ajuste o corpo pelo erro 400 do primeiro run — o modelo é `novaOrg` em `test/organizacao-direta.test.ts:16-19`. A mensagem de `usuario.modulos` está em `trocarModulosComTrilha`, `src/routes/users.ts:144-152`: se o `details` não trouxer o e-mail, troque o `LIKE` pelo `entity_id` da conta.)

- [ ] **Step 2: Rodar** — `npx vitest run test/onboarding-rotas.test.ts` → PASS (contrato atual; se um caso falhar, a rota mudou: pare e reporte, não ajuste a rota).
- [ ] **Step 3: Mutação** — em `schema.sql:1915`, troque `j.value IN ('iso', 'privacy')` por `j.value IN ('iso', 'privacy', 'ot')`: o caso P0-1 cai. Em `src/routes/users.ts:233`, troque `admin.role !== 'platform_admin' && ehCliente` por `false && ehCliente`: o caso direta cai. Restaure as duas (`git diff --stat schema.sql src/routes/users.ts` vazio).
- [ ] **Step 4: Commit** — `git add test/onboarding-rotas.test.ts && git commit -m "test(onboarding): trava P0-1, organização direta e designação nas rotas do assistente"`

### Task 15: Passo "Pessoas e acessos" no assistente **[revisor opus]**

**Files:**
- Modify: `frontend/src/views/empresa.js:4` (import), `frontend/src/views/empresa.js:190` (`PASSOS`), `199-250` (`passoHtml`), `260-282` (`guardarPasso`), `294-303` (`novoProjetoIr`), `334-341` (fim de `criarNovoProjeto`), `frontend/src/views/organizacoes.js:500` (`window.tipoOrgAtuacao`), `frontend/src/style.css`
- Modify (teste): `frontend/test/novo-projeto.test.js:131-154` ("fluxo completo")
- Create: `frontend/test/onboarding-encadeado.test.js`

**Interfaces:**
- Consumes: `POST /api/v1/projects` → `{ id, modulos }`; `POST /api/v1/users` `{ name, email, role, client_project_id, modulos }`; `POST /api/v1/projects/:id/governance` `{ name, email, role_category: 'consultor', job_title: 'Consultor' }` (Task 14); `orgDireta()` (`frontend/src/produto.js:8`).
- Produces: `W.passo` 5 ("Pessoas e acessos"), `W.projeto = { id, modulos }`, `W.acessos: { nome, email, papel, modulos, feito? }[]`; `window.novoProjetoMaisPessoa()`, `window.novoProjetoConvidar()`; `window.tipoOrgAtuacao(): 'consultoria' | 'direta' | null`. **`ot` nunca nasce marcado** para uma pessoa (P0-1). A escolha de módulos **do projeto** (passo 2) não muda: P0-1 é sobre a pessoa (`AGENTS.md:84-86`: habilitar o `ot` no projeto não o dá a ninguém).

- [ ] **Step 1: Escrever os testes que falham.** `frontend/test/onboarding-encadeado.test.js`:

```js
// Onboarding encadeado (onda 4, PR5): projeto criado → "Pessoas e acessos" (convites e módulos por pessoa; ot nunca marcado, P0-1;
// organização direta sem conta de cliente) → "Primeiros passos" (Task 16).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/project.js';
import '../src/views/empresa.js';

const $ = (id) => document.getElementById(id);
const digitar = (id, v) => { $(id).value = v; };
async function criarAte5(modulosDoProjeto = ['iso', 'ot']) {
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    window.abrirNovoProjeto();
    digitar('emp-razao_social', 'Fictícia Ltda');
    window.novoProjetoIr(2); window.novoProjetoIr(3); window.novoProjetoIr(4);
    apiMock.mockImplementation(async (m, url) => (m === 'POST' && url === '/api/v1/projects' ? { id: 'novo', modulos: modulosDoProjeto } : m === 'GET' ? { programa: { etapas: {} } } : { id: 'x' }));
    await window.criarNovoProjeto();
}

beforeEach(() => {
    apiMock.mockReset();
    S.user = { role: 'consultoria_admin', org_tipo: 'consultoria', modulos: ['iso', 'privacy', 'ot'] };
    window.render = vi.fn(); window.loadProjects = vi.fn(); window.openProjectDetail = vi.fn();
    delete window.tipoOrgAtuacao;
});
afterEach(() => { document.body.innerHTML = ''; });

describe('Pessoas e acessos', () => {
    it('depois de criar, o assistente segue para "Pessoas e acessos" (não abre o projeto ainda)', async () => {
        await criarAte5();
        expect($('np-titulo').textContent).toBe('Novo projeto — Pessoas e acessos');
        expect(window.openProjectDetail).not.toHaveBeenCalled();
    });
    it('P0-1: a caixa do n.ot nunca nasce marcada; as outras do projeto, sim', async () => {
        await criarAte5(['iso', 'privacy', 'ot']);
        const caixas = Object.fromEntries([...document.querySelectorAll('input[name="np-p0-modulo"]')].map((x) => [x.value, x.checked]));
        expect(caixas).toEqual({ iso: true, privacy: true, ot: false });
        window.novoProjetoMaisPessoa();
        expect(document.querySelector('input[name="np-p1-modulo"][value="ot"]').checked).toBe(false);
    });
    it('convidar sem mexer nas caixas manda os módulos marcados, sem o ot; consultor também é designado no projeto', async () => {
        await criarAte5(['iso', 'ot']);
        digitar('np-p0-nome', 'Pessoa Fictícia'); digitar('np-p0-email', 'pessoa@exemplo.lat');
        apiMock.mockClear();
        apiMock.mockImplementation(async (m) => (m === 'GET' ? { programa: { etapas: {} } } : { id: 'x' }));
        await window.novoProjetoConvidar();
        const posts = apiMock.mock.calls.filter(([m]) => m === 'POST');
        expect(posts[0]).toEqual(['POST', '/api/v1/users', { name: 'Pessoa Fictícia', email: 'pessoa@exemplo.lat', role: 'consultor', client_project_id: null, modulos: ['iso'] }]);
        expect(posts[1]).toEqual(['POST', '/api/v1/projects/novo/governance', { name: 'Pessoa Fictícia', email: 'pessoa@exemplo.lat', role_category: 'consultor', job_title: 'Consultor' }]);
    });
    it('consultoria: oferece equipe e cliente; o cliente vai preso ao projeto novo e sem designação', async () => {
        await criarAte5(['iso']);
        expect([...$('np-p0-papel').options].map((o) => o.value)).toEqual(['consultor', 'org_admin', 'org_user']);
        digitar('np-p0-nome', 'Gestora'); digitar('np-p0-email', 'g@cliente.lat'); $('np-p0-papel').value = 'org_admin';
        apiMock.mockClear();
        apiMock.mockImplementation(async (m) => (m === 'GET' ? { programa: { etapas: {} } } : { id: 'x' }));
        await window.novoProjetoConvidar();
        const posts = apiMock.mock.calls.filter(([m]) => m === 'POST');
        expect(posts).toEqual([['POST', '/api/v1/users', { name: 'Gestora', email: 'g@cliente.lat', role: 'org_admin', client_project_id: 'novo', modulos: ['iso'] }]]);
    });
    it('organização direta: só equipe (sem conta de cliente, onda 1); o platform_admin atuando nela também', async () => {
        S.user = { role: 'consultoria_admin', org_tipo: 'direta', modulos: ['iso', 'privacy', 'ot'] };
        await criarAte5(['iso']);
        expect([...$('np-p0-papel').options].map((o) => o.value)).toEqual(['consultor']);
        S.user = { role: 'platform_admin' };
        window.tipoOrgAtuacao = () => 'direta';
        await criarAte5(['iso']);
        expect([...$('np-p0-papel').options].map((o) => o.value)).toEqual(['consultor']);
    });
    it('erro de um convite fica na linha e o passo não avança; sem nenhum módulo marcado, não convida', async () => {
        await criarAte5(['iso']);
        digitar('np-p0-nome', 'A'); digitar('np-p0-email', 'a@exemplo.lat');
        document.querySelector('input[name="np-p0-modulo"][value="iso"]').checked = false;
        apiMock.mockClear();
        await window.novoProjetoConvidar();
        expect(apiMock.mock.calls.filter(([m]) => m === 'POST')).toEqual([]);
        expect($('np-p0-erro').textContent).toMatch(/módulo/);
        document.querySelector('input[name="np-p0-modulo"][value="iso"]').checked = true;
        apiMock.mockImplementation(async (m) => { if (m === 'POST') { const e = new Error('Email já cadastrado'); e.status = 400; throw e; } return {}; });
        await window.novoProjetoConvidar();
        expect($('np-p0-erro').textContent).toBe('Email já cadastrado');
        expect($('np-titulo').textContent).toBe('Novo projeto — Pessoas e acessos');
    });
    it('Pular segue sem convidar; voltar a um passo antes da criação não é possível', async () => {
        await criarAte5(['iso']);
        window.novoProjetoIr(4);
        expect($('np-titulo').textContent).toBe('Novo projeto — Pessoas e acessos');
        apiMock.mockClear();
        window.novoProjetoIr(6);
        expect(apiMock.mock.calls.filter(([m]) => m === 'POST')).toEqual([]);
        expect($('np-titulo').textContent).toBe('Novo projeto — Primeiros passos');
    });
});
```

  `frontend/test/novo-projeto.test.js`, "fluxo completo" (linhas 131-154): troque a última linha `expect(window.openProjectDetail).toHaveBeenCalledWith('novo');` por `expect($('np-titulo').textContent).toBe('Novo projeto — Pessoas e acessos');`.

- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx vitest run test/onboarding-encadeado.test.js test/novo-projeto.test.js` → FAIL.
- [ ] **Step 3: Implementar** em `frontend/src/views/empresa.js`.

  Import (linha 4): `import { modulosDaPessoa, orgDireta } from '../produto.js';`. `PASSOS` (linha 190): `const PASSOS = ['Empresa', 'Programa', 'Pessoas-chave', 'Resumo', 'Pessoas e acessos', 'Primeiros passos'];`. Depois de `let W = null;`:

```js
const NOME_MODULO = { iso: 'n.iso', privacy: 'n.privacy', ot: 'n.ot' };
/** A organização em que o projeto nasceu é direta? A do platform_admin é a do seletor (X-Org-Id); a dos outros, a da sessão. */
const orgDoProjetoDireta = () => {
    const t = S.user && S.user.role === 'platform_admin' && typeof window.tipoOrgAtuacao === 'function' ? window.tipoOrgAtuacao() : null;
    return t ? t === 'direta' : orgDireta();
};
/** Papéis do passo: a direta só tem equipe (onda 1, decisão 8; o servidor recusa o resto); a consultoria convida também o cliente. */
const papeisDoPasso = () => (orgDoProjetoDireta() ? [['consultor', 'Pessoa da equipe']]
    : [['consultor', 'Consultor'], ['org_admin', 'Gestor do cliente'], ['org_user', 'Colaborador do cliente']]);
/** P0-1: o n.ot nunca nasce marcado para uma pessoa; só vale marcado à mão. */
const novaPessoa = () => ({ nome: '', email: '', papel: 'consultor', modulos: W.projeto.modulos.filter((m) => m !== 'ot') });

function linhaPessoa(p, i) {
    return `<fieldset class="np-pessoa"><legend class="form-label">Pessoa ${i + 1}</legend>
        <div class="form-group"><label class="form-label" for="np-p${i}-nome">Nome</label><input class="form-input" id="np-p${i}-nome" maxlength="200" value="${escapeHTML(p.nome)}"></div>
        <div class="form-group"><label class="form-label" for="np-p${i}-email">E-mail</label><input class="form-input" id="np-p${i}-email" type="email" maxlength="320" value="${escapeHTML(p.email)}"></div>
        <div class="form-group"><label class="form-label" for="np-p${i}-papel">Papel</label><select class="form-input" id="np-p${i}-papel">${papeisDoPasso().map(([v, r]) => `<option value="${v}" ${p.papel === v ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <fieldset class="np-modulos"><legend class="form-label">Módulos</legend>${W.projeto.modulos.map((m) => `<label><input type="checkbox" name="np-p${i}-modulo" value="${m}" ${p.modulos.includes(m) ? 'checked' : ''}> ${NOME_MODULO[m] || escapeHTML(m)}</label>`).join('')}</fieldset>
        <p class="np-erro-pessoa" id="np-p${i}-erro" role="alert">${p.feito ? 'Convite enviado.' : ''}</p></fieldset>`;
}

function pessoasHtml() {
    return `<p class="np-dica">Convide quem vai trabalhar no projeto. Cada pessoa recebe um e-mail para criar a senha. O n.ot só vale marcado aqui.</p>
        ${W.acessos.map(linhaPessoa).join('')}
        <button type="button" class="btn btn-ghost btn-sm" data-action="novoProjetoMaisPessoa">Adicionar pessoa</button>`;
}

/** Lê as linhas do passo 5 para `W.acessos` (sem validar: validar é do convidar). */
function lerAcessos() {
    W.acessos = W.acessos.map((p, i) => (p.feito ? p : {
        nome: ($(`np-p${i}-nome`) || {}).value?.trim() ?? p.nome,
        email: ($(`np-p${i}-email`) || {}).value?.trim() ?? p.email,
        papel: ($(`np-p${i}-papel`) || {}).value || p.papel,
        modulos: [...document.querySelectorAll(`input[name="np-p${i}-modulo"]:checked`)].map((x) => x.value),
    }));
}
const $ = (id) => document.getElementById(id);
```

  (Se `$` já existir no arquivo, não redeclare: `grep -n "const \$ =" frontend/src/views/empresa.js`.)

  Em `passoHtml`, logo depois da linha `const erro = ...` (linha 204), acrescente:

```js
    // Depois de criado o projeto (passos 5 e 6) não há "Voltar": o projeto já existe.
    if (W.passo === 5) return `${cab}<div id="np-passo">${pessoasHtml()}</div>${erro}<div class="np-rodape"><button class="btn btn-ghost" data-action="novoProjetoIr" data-args='[6]'>Pular</button><button class="btn btn-primary" data-action="novoProjetoConvidar">Convidar e seguir</button></div>`;
    if (W.passo === 6) return `${cab}<div id="np-passo">${primeirosHtml()}</div>${erro}<div class="np-rodape"><span></span><button class="btn btn-primary" data-action="novoProjetoFechar">Fechar</button></div>`;
```

  Até o Task 16, `primeirosHtml` é: `function primeirosHtml() { return '<p>O projeto foi criado.</p>'; }` e `window.novoProjetoFechar = () => { W = null; window.forceCloseModal(); if (typeof window.render === 'function') window.render(); };` (o Task 16 os substitui).

  Em `guardarPasso`, no começo: `if (W.passo === 5) { lerAcessos(); return ''; }`. Em `novoProjetoIr` (linha 294), depois de `if (!W) return;`: `if (W.passo >= 5 && passo < 5) return; // o projeto já existe`. Em `mostrarPasso`, o foco do passo 5/6 vai ao título: troque `W.passo === 4 ?` por `W.passo >= 4 ?`.

  Fim de `criarNovoProjeto` (linhas 334-341): troque de `W = null;` até o fim da função por:

```js
    window.forceCloseModal();
    showToast('Projeto criado.', 'success');
    if (typeof window.loadProjects === 'function') await window.loadProjects();
    W.projeto = { id: r.id, modulos: Array.isArray(r.modulos) ? r.modulos : [] };
    W.acessos = [novaPessoa()];
    W.primeiros = null;
    W.passo = 5;
    mostrarPasso();
};

window.novoProjetoMaisPessoa = function () {
    if (!W || W.passo !== 5) return;
    lerAcessos();
    W.acessos.push(novaPessoa());
    mostrarPasso();
};

/** Convida cada linha preenchida (POST /users; consultor também designado no projeto). Erro fica na linha; só segue sem erro. */
window.novoProjetoConvidar = async function () {
    if (!W || W.passo !== 5) return;
    lerAcessos();
    const pid = W.projeto.id;
    let falhou = false;
    for (const [i, p] of W.acessos.entries()) {
        if (p.feito || (!p.nome && !p.email)) continue;
        const erro = (t) => { const el = $(`np-p${i}-erro`); if (el) el.textContent = t; falhou = true; };
        if (!p.nome || !p.email) { erro('Informe nome e e-mail.'); continue; }
        if (!p.modulos.length) { erro('Escolha ao menos um módulo.'); continue; }
        const cliente = p.papel !== 'consultor';
        try {
            await api('POST', '/api/v1/users', { name: p.nome, email: p.email, role: p.papel, client_project_id: cliente ? pid : null, modulos: p.modulos });
            if (!cliente) await api('POST', `/api/v1/projects/${pid}/governance`, { name: p.nome, email: p.email, role_category: 'consultor', job_title: 'Consultor' });
            p.feito = true;
            const el = $(`np-p${i}-erro`); if (el) el.textContent = 'Convite enviado.';
        } catch (err) { erro((err && err.message) || 'Não foi possível convidar.'); }
    }
    if (falhou) return;
    window.novoProjetoIr(6);
};
```

  Atenção: a primeira linha de `criarNovoProjeto` depois do `catch` hoje é `W = null;` e `window.forceCloseModal();`: o `W` **não** é zerado agora (fica para os passos 5 e 6), e o `forceCloseModal` antes de reabrir é só para o `openModal` do `mostrarPasso` substituir o conteúdo; se o `openModal` já substitui sem fechar, tire o `forceCloseModal` (confira em `frontend/src/ui.js:22`).

  `frontend/src/views/organizacoes.js`, ao lado da linha 500:

```js
/** O tipo da organização em que o platform_admin atua (seletor do cabeçalho), para o assistente; null fora dela. */
window.tipoOrgAtuacao = () => (S.orgAtuacao ? (orgs.find((o) => o.id === S.orgAtuacao) || {}).tipo || null : null);
```

  `frontend/src/style.css`, no fim:

```css
/* Assistente "Novo projeto": Pessoas e acessos (onda 4) */
.np-pessoa { border: 1px solid var(--border); padding: 8px 12px; margin: 0 0 12px; }
.np-modulos { display: flex; gap: 16px; border: 0; padding: 0; margin: 0 0 8px; }
.np-erro-pessoa { min-height: 1.2em; margin: 0; font-size: 0.85rem; color: var(--danger-ink); }
.np-dica { color: var(--text-dim); font-size: 0.85rem; margin-top: 0; }
.np-rodape { display: flex; justify-content: space-between; gap: 8px; margin-top: 0.5rem; }
```

- [ ] **Step 4: Rodar e ver passar** — `cd frontend && npx vitest run test/onboarding-encadeado.test.js test/novo-projeto.test.js test/produto.test.js test/organizacoes*.test.js test/admin-usuarios-apikeys.test.js` → PASS; `cd frontend && npm run build` → `✓ built in`; backend `npx vitest run test/contrato-tela-api.test.ts test/onboarding-rotas.test.ts` → PASS (as chamadas novas casam rotas existentes).
- [ ] **Step 5: Mutações** — (1) em `novaPessoa`, tire o `.filter((m) => m !== 'ot')`: "P0-1: a caixa do n.ot nunca nasce marcada" e "convidar sem mexer" caem. (2) Em `papeisDoPasso`, troque `orgDoProjetoDireta()` por `false`: o caso direta cai. Restaure.
- [ ] **Step 6: Commit** — `git add frontend/src/views/empresa.js frontend/src/views/organizacoes.js frontend/src/style.css frontend/test/onboarding-encadeado.test.js frontend/test/novo-projeto.test.js && git commit -m "feat(onboarding): passo Pessoas e acessos no assistente (ot nunca marcado; direta sem cliente)"`

### Task 16: "Primeiros passos" ao fim do assistente; organização criada leva ao assistente

**Files:**
- Modify: `frontend/src/views/empresa.js` (`primeirosHtml`, `window.novoProjetoFechar`, nova `carregarPrimeirosPassos`, nova `window.novoProjetoComecar`; `novoProjetoIr` chama a carga ao entrar no 6), `frontend/src/views/organizacoes.js:306-311` (modal "Organização criada") e nova `window.__orgPrimeiroProjeto`
- Modify (teste): `frontend/test/onboarding-encadeado.test.js`

**Interfaces:**
- Consumes: `GET /api/v1/projects/:id/painel` → `programa.etapas[m].proximo` (Tasks 7 e 10; o `ot` só vem a quem tem o módulo); `window.painelAbrirProximo(projectId, tela, aba, fase, passo)` (Task 8); `window.painelAbrirProjeto(projectId, modulo)` (`frontend/src/views/painel.js:361`); `window.__orgEscolher(id)` (`organizacoes.js:89`); `window.abrirNovoProjeto()` (`empresa.js:284`).
- Produces: passo 6 lista, por módulo que o servidor mandou (ordem iso, privacy, ot), o próximo passo com "Começar"; `window.__orgPrimeiroProjeto(orgId)`.

- [ ] **Step 1: Testes que falham** — em `frontend/test/onboarding-encadeado.test.js`:

```js
describe('Primeiros passos', () => {
    const ETAPAS = (m, texto, extra = {}) => ({ [m]: { etapa: 'comecar', feitos: 0, total: 1, etapas: [], proximo: { texto, ...extra } } });
    it('um "Começar" por módulo que o servidor mandou, com o próximo passo; sem o ot no programa, nada do n.ot', async () => {
        await criarAte5(['iso', 'privacy', 'ot']);
        apiMock.mockImplementation(async (m, url) => (url === '/api/v1/projects/novo/painel'
            ? { programa: { etapas: { ...ETAPAS('iso', 'Carregar as fases da jornada', { tela: 'project-detail' }), ...ETAPAS('privacy', 'Partida', { tela: 'importacao' }) } } } : {}));
        window.novoProjetoIr(6);
        await new Promise((r) => setTimeout(r, 0));
        const linhas = [...document.querySelectorAll('.np-primeiros li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim());
        expect(linhas).toEqual(['n.iso Carregar as fases da jornada Começar', 'n.privacy Partida Começar']);
        expect(document.getElementById('np-passo').textContent).not.toContain('n.ot');
        expect(apiMock.mock.calls.map(([, u]) => u).every((u) => !String(u).includes('/ot'))).toBe(true);
    });
    it('com o ot (pessoa com o módulo), o n.ot também tem o primeiro passo; Começar entra no projeto e vai ao passo', async () => {
        await criarAte5(['iso', 'ot']);
        apiMock.mockImplementation(async (m, url) => (url === '/api/v1/projects/novo/painel'
            ? { programa: { etapas: { ...ETAPAS('ot', 'Cadastrar o primeiro site', { tela: 'ot', aba: 'sites' }) } } } : {}));
        window.novoProjetoIr(6);
        await new Promise((r) => setTimeout(r, 0));
        window.painelAbrirProximo = vi.fn();
        expect(document.querySelector('[data-action="novoProjetoComecar"]').dataset.args).toBe('["novo","ot"]');
        window.novoProjetoComecar('novo', 'ot');
        expect(window.painelAbrirProximo).toHaveBeenCalledWith('novo', 'ot', 'sites', null, null);
    });
    it('painel indisponível: oferece abrir o projeto em cada módulo do projeto', async () => {
        await criarAte5(['iso']);
        apiMock.mockImplementation(async () => { throw new Error('falhou'); });
        window.novoProjetoIr(6);
        await new Promise((r) => setTimeout(r, 0));
        expect(document.querySelector('[data-action="painelAbrirProjeto"]').dataset.args).toBe('["novo","iso"]');
    });
});

describe('organização criada leva ao assistente', () => {
    it('"Criar o primeiro projeto" escolhe a organização (X-Org-Id) e abre o assistente', async () => {
        await import('../src/views/organizacoes.js');
        S.user = { role: 'platform_admin' };
        window.__orgEscolher = vi.fn();
        window.abrirNovoProjeto = vi.fn();
        window.__orgPrimeiroProjeto('org_nova');
        expect(window.__orgEscolher).toHaveBeenCalledWith('org_nova');
        expect(window.abrirNovoProjeto).toHaveBeenCalled();
    });
    it('quem não é platform_admin não usa o atalho', async () => {
        await import('../src/views/organizacoes.js');
        S.user = { role: 'consultoria_admin' };
        window.abrirNovoProjeto = vi.fn();
        window.__orgPrimeiroProjeto('org_nova');
        expect(window.abrirNovoProjeto).not.toHaveBeenCalled();
    });
});
```

  (No teste de organização, se `__orgPrimeiroProjeto` chamar o `__orgEscolher` interno em vez do `window.`, troque o dublê por um espião em `S.orgAtuacao`: o esperado é `S.orgAtuacao === 'org_nova'` depois.)

- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx vitest run test/onboarding-encadeado.test.js` → FAIL.
- [ ] **Step 3: Implementar** em `frontend/src/views/empresa.js` (substitui os provisórios do Task 15):

```js
/** O primeiro passo de cada módulo vem do servidor (`programa.etapas`, GET /painel): o n.ot só vem a quem tem o módulo (P0-1/P0-2). */
async function carregarPrimeirosPassos() {
    const pid = W.projeto.id;
    try {
        const d = await api('GET', `/api/v1/projects/${pid}/painel`);
        const et = (d && d.programa && d.programa.etapas) || {};
        W.primeiros = ['iso', 'privacy', 'ot'].filter((m) => et[m] && et[m].proximo).map((m) => ({ m, ...et[m].proximo }));
    } catch (err) { W.primeiros = 'erro'; }
    if (W && W.passo === 6) mostrarPasso();
}

function primeirosHtml() {
    const pid = W.projeto.id;
    if (W.primeiros === null) return '<div class="loading"></div>';
    if (W.primeiros === 'erro' || !W.primeiros.length) {
        return `<p>O projeto foi criado. Abra-o no módulo para começar.</p>${W.projeto.modulos.map((m) =>
            `<button type="button" class="btn btn-sm" data-action="painelAbrirProjeto" data-args='${escapeHTML(JSON.stringify([pid, m]))}'>Abrir no ${NOME_MODULO[m] || escapeHTML(m)}</button>`).join(' ')}`;
    }
    return `<ol class="np-primeiros">${W.primeiros.map((x) => `<li><strong>${NOME_MODULO[x.m]}</strong> <span>${escapeHTML(x.texto)}</span>
        <button type="button" class="btn btn-sm btn-primary" data-action="novoProjetoComecar" data-args='${escapeHTML(JSON.stringify([pid, x.m]))}'>Começar</button></li>`).join('')}</ol>`;
}

window.novoProjetoComecar = function (projectId, m) {
    const x = (W && Array.isArray(W.primeiros) ? W.primeiros : []).find((p) => p.m === m);
    W = null;
    window.forceCloseModal();
    if (x && typeof window.painelAbrirProximo === 'function') return window.painelAbrirProximo(projectId, x.tela, x.aba || null, x.fase ?? null, x.passo || null);
    if (typeof window.painelAbrirProjeto === 'function') window.painelAbrirProjeto(projectId, m);
};
window.novoProjetoFechar = () => { W = null; window.forceCloseModal(); if (typeof window.render === 'function') window.render(); };
```

  Em `novoProjetoIr`, depois de `W.passo = passo; mostrarPasso();`, acrescente `if (passo === 6 && W.primeiros === null) carregarPrimeirosPassos();`.

  `frontend/src/views/organizacoes.js`: no modal de resultado (linhas 306-311), troque o rodapé por:

```js
        <div class="org-form-rodape"><button type="button" class="btn btn-secondary" data-action="forceCloseModal">Fechar</button>
            <button type="button" class="btn btn-primary" data-action="__orgPrimeiroProjeto" data-args='${escapeHTML(JSON.stringify([r.id]))}'>Criar o primeiro projeto</button></div>
```

  e, depois de `window.__orgCriar`:

```js
/** Encadeia a organização criada ao assistente: atua nela (o projeto nasce lá, X-Org-Id) e abre "Novo projeto". Só o platform_admin. */
window.__orgPrimeiroProjeto = (id) => {
    if (!ehPlatformAdmin()) return;
    window.forceCloseModal();
    window.__orgEscolher(id);
    if (typeof window.abrirNovoProjeto === 'function') window.abrirNovoProjeto();
};
```

  `frontend/src/style.css`: `.np-primeiros { margin: 0; padding: 0; list-style: none; } .np-primeiros li { display: flex; gap: 12px; align-items: center; padding: 8px 0; border-top: 1px solid var(--border); }`.

- [ ] **Step 4: Rodar e ver passar** — `cd frontend && npx vitest run test/onboarding-encadeado.test.js test/novo-projeto.test.js test/painel-regua.test.js test/organizacoes*.test.js` → PASS; `cd frontend && npm run build` → `✓ built in`; `npx vitest run test/contrato-tela-api.test.ts` → PASS.
- [ ] **Step 5: Mutação** — em `carregarPrimeirosPassos`, troque a lista fixa `['iso', 'privacy', 'ot'].filter((m) => et[m] ...)` por `W.projeto.modulos.map((m) => ({ m, ...(et[m]?.proximo || { texto: 'Abrir o módulo', tela: m === 'ot' ? 'ot' : 'project-detail' }) }))`: o primeiro teste (nada do n.ot sem o ot no programa) cai. Restaure.
- [ ] **Step 6: Commit** — `git add frontend/src/views/empresa.js frontend/src/views/organizacoes.js frontend/src/style.css frontend/test/onboarding-encadeado.test.js && git commit -m "feat(onboarding): primeiros passos por módulo e organização criada abre o assistente"`

### Task 17: Documentação do PR5 e fecho da onda

**Files:**
- Modify: `AGENTS.md` (item da entrada do n.360, linha 600-606; item "Jornada comum"), `CHANGELOG.md`, `docs/superpowers/specs/2026-11-18-onda4-jornada-comum-design.md` (seção nova "Rulings da execução")

- [ ] **Step 1: AGENTS.md (sem acentos).** No item "Jornada comum", acrescente: `**Onboarding encadeado (PR5):** organizacao criada (\`platform_admin\`) -> "Criar o primeiro projeto" (\`__orgPrimeiroProjeto\`, atua na organizacao) -> assistente (\`views/empresa.js\`): Empresa, Programa, Pessoas-chave, Resumo, cria o projeto, **Pessoas e acessos** (convites por \`POST /users\` com \`modulos\`; consultor designado por \`POST /projects/:id/governance\`; a caixa do \`ot\` nunca nasce marcada, P0-1; organizacao direta so oferece equipe, onda 1) e **Primeiros passos** (o \`proximo\` de cada modulo em \`programa.etapas\`, o \`ot\` so para quem o tem). Nenhuma rota nova: \`test/onboarding-rotas.test.ts\` trava o contrato. Sem autoatendimento.`
- [ ] **Step 2: CHANGELOG.md**, seção da onda 4: `- **Onboarding encadeado:** ao criar uma organização, "Criar o primeiro projeto" abre o assistente nela; depois de criar o projeto, o assistente convida as pessoas e escolhe os módulos de cada uma (o n.ot nunca vem marcado; organização direta convida só a equipe) e termina no primeiro passo de cada módulo.`
- [ ] **Step 3: Spec da onda 4, "Rulings da execução":** registre o que foi decidido na execução (conferido no código): `certification` continua em \`TELAS\` do catálogo como alias (sem mudar o catálogo); "Exportar riscos" já estava em Riscos (\`grc.js:208\`); a grade da Jornada usa as 6 etapas do catálogo de passos e a régua usa as 5 comuns; o n.ot não tem Painel, a régua dele aparece no "Ver situação" do Início e no assistente; as chaves de \`parametros_legais\` da etapa 5 são as 3 de \`CHAVES\`; "canal do titular" não tem campo (a etapa 1 é só o encarregado); o OpenAPI não descreve resposta, então o \`npm run openapi\` não mudou nada (ou o que mudou); a escolha de módulos do **projeto** no assistente seguiu como era (P0-1 é sobre a pessoa); e a mediana do teste de desempenho do painel depois do PR3.
- [ ] **Step 4: Rodar** `npx vitest run test/onda2-numeros.test.ts test/programa.test.ts test/programa-rota.test.ts test/onboarding-rotas.test.ts test/agente-skills.test.ts test/contrato-isolamento-org.test.ts test/contrato-tela-api.test.ts test/openapi.test.ts`; `npx tsc --noEmit`; `cd frontend && npx vitest run test/onboarding-encadeado.test.js test/painel-regua.test.js test/jornada-abas.test.js test/bancada-grade.test.js && npm run build`; `git diff --stat c4c7039 -- test/onda2-numeros.test.ts` vazio.
- [ ] **Step 5: Commit** — `git add AGENTS.md CHANGELOG.md docs/superpowers/specs/2026-11-18-onda4-jornada-comum-design.md && git commit -m "docs(onda4): onboarding encadeado e rulings da execução"`

**Entrega PR5:** `bash scripts/ci/gate.sh`; PR (rascunho) "onda 4 PR5: onboarding encadeado"; revisão em modelo forte dos Tasks 14 e 15. E2E existentes que abrem `?tela=project-detail` (`frontend/e2e/phase-questionnaire.spec.js:37`) e o Painel (`frontend/e2e/n360.spec.js:98,146`) rodam no portão e precisam ficar verdes.

---

## Self-Review

- **Spec, decisões:** 1 (Monitor sai; Prontidão vira aba; Painel fica): Tasks 2 e 4 (Painel intocado). 2 (trilha do n.privacy só derivada, sem migration): Task 10 (`criterioPrivacy`, nada gravado) e 11. 3 (assistente + "Pessoas e acessos" + primeiro passo de cada módulo): Tasks 15 e 16 (+ Task 14 trava as rotas). 4 (plano diretor adiado): nenhum task, por desenho. 5 (cinco etapas com nomes fixos): Task 6 (`ETAPAS_COMUNS`, teste dos rótulos). 6 (fronteira do n.iso): Task 6 (`FASES_DO_ISO`, teste 0-40 exatamente uma vez e os valores da spec). 7 (régua no Início e no Painel, campo `programa.etapas` no `/painel`, sem rota nova): Tasks 7 e 8. 8 (marco do n.ot só com `ot`): Task 7 (`blocoOt.marco`, `primeiroMarco`, teste com cinco perfis). 9 (derivação pura, sem tabela): Tasks 6, 7 e 10 (nenhuma migration; teste de que o `/painel` não grava).
- **Spec, "não regridem":** onda 2 (`test/onda2-numeros.test.ts` em todo task do backend e o `git diff --stat` vazio); P0-1/P0-2 (Task 7: pessoa sem `ot`, agente, chave; Task 15: caixa do `ot` desmarcada; Task 14: gatilho); P0-4 (Task 7: técnico); nenhuma rota some e nenhuma nova (Tasks 2 e 4 só frontend; `contrato-tela-api` nos Tasks 2, 4, 15, 16); links antigos (Task 2 `monitor`, Task 4 `certification`, em `navigate`, `pedidoDoHub` e no hub); faixas e contratos (nenhum segmento novo; `contrato-isolamento-org` nos Tasks 7 e 10).
- **Spec, entrega:** PR1 = 1-3 (inclui o texto "41 fases" e a remoção de `renderPortfolio`/`showGapAnalysis`; "Exportar riscos" já estava em Riscos), PR2 = 4-5, PR3 = 6-9, PR4 = 10-13, PR5 = 14-17.
- **Spec, testes:** menu e roteador (Tasks 2, 4), alias (2, 4), aba Prontidão (4), régua sem `ot` com dublê que falha (8, 16), assistente encadeado (15, 16); backend por perfil (7, 10), nenhum campo a mais (7), contratos (7, 9, 10), onda 2 intocada (todos).
- **Placeholders:** os pontos que dependem de um primeiro run (corpo exato de `criarOrgSchema`/`projetoCriarSchema` no Task 14, `toEqual` do `test/painel-ot.test.ts` no Task 7, delegação de clique no jsdom nos Tasks 4 e 16) vêm com o arquivo de referência e a regra de ajuste; nenhum passo de código sem código.
- **Tipos:** `ProgramaDoModulo`/`ResumoDaEtapa`/`ProximoDoPrograma`/`PassoDaTrilha` (Task 6) são usados nos Tasks 7, 8, 10, 11 e 16 com os mesmos nomes de campo (`etapa`, `feitos`, `total`, `proximo.{texto,tela,aba,fase,passo}`, `etapas[].{id,rotulo,feitos,total}`, `passos[].{rotulo,etapa,feito,tela,acao}`); `LidosDoPainel` nasce no Task 7 (`otAtor`) e ganha `visaoPrivacy` no Task 10; `window.painelAbrirProximo(projectId, tela, aba, fase, passo)` nasce no Task 8 e é usado nos Tasks 11 e 16; `ALIAS_DE_TELA`/`aliasDaTela` nascem no Task 2 e ganham `certification` no Task 4; `S.jornadaAba` é escrito pelo `navigate` (Task 4) e lido por `renderJornada`.
- **Riscos para a revisão:** (1) o teste de desempenho do painel (`test/painel.test.ts:315`, mediana < 300 ms) passa a pagar `carregarContexto` (~21 consultas em batch) quando há `iso`: medir, não afrouxar; (2) `situacaoDoSite` por site (6 consultas cada) no programa do n.ot, marcado como `shortcut`; (3) o estado do programa continua por espectador e por pedido (`?modulo=iso` não conta o marco do n.ot, o Início conta para quem tem o módulo); (4) a grade da Jornada (6 etapas do catálogo) e a régua (5 etapas comuns) convivem na mesma tela com agrupamentos diferentes; (5) o platform_admin que cria projeto numa organização sem o `ot` contratado e deixa o `ot` marcado no passo 2 recebe o 409 de hoje ("Produto não contratado"), comportamento anterior à onda.
