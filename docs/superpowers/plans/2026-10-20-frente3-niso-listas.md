# Frente 3: n.iso descongelado — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** um vocabulário de status e de nomes de tela só nos dois módulos (3B), um componente de lista com busca, filtros, contagem, "Carregar mais" e exportar aplicado às listas dos dois módulos (3A), e os itens soltos do n.iso: CSV em pt-BR, prazo da CAPA, risco com residual e prazo, validade da evidência e nome do fornecedor (3C).

**Architecture:** rótulos só em `frontend/src/rotulos.js` (tela) e `src/services/exportacao.ts` (CSV), conferidos por teste. Um módulo novo `frontend/src/lista.js` sobre `renderDataTable`, `renderEmptyState`, `filtrarDoPainel` e `baixarArquivo`, com eventos por delegação. Servidor: rotas existentes ajustadas (esquemas, `montarCsv`, faixa `nucleo`). Sem migration.

**Tech Stack:** Cloudflare Workers + Hono + D1 (vitest com `@cloudflare/vitest-pool-workers`), frontend vanilla JS (vitest + jsdom).

**Spec:** `docs/superpowers/specs/2026-10-20-frente3-niso-listas-design.md`

## Global Constraints

- PT-BR em comentário, mensagem e tela. Commits em português com `--author="Ricardo Esper <44273656+resper1965@users.noreply.github.com>"`, sem `Co-Authored-By` nem rodapé de IA.
- Nenhum `style=` novo: `frontend/test/catracas-visuais.test.js` trava o teto por arquivo (arquivo novo tem teto 0). Use classes de `frontend/src/style.css` (as `co-*` já existem: `co-controles`, `co-campo`, `co-campo-rotulo`, `co-contagem`). Classe nova vai no fim de `style.css`, sobre tokens.
- Sem handler inline: eventos por `data-action*` (`frontend/src/delegation.js`: `data-action`, `data-action-input`, `data-action-change`, `data-args`, `data-arg-val`), funções em `window`.
- Uma ação primária por tela; exportar e "Carregar mais" são secundários (`btn btn-secondary btn-sm` ou o que a tela já usa).
- `test/any-catraca.test.ts`: `any` não sobe.
- Antes de cada commit: `npx tsc --noEmit` (se tocou `src/`), os testes do arquivo, e no frontend `cd frontend && npx vitest run && npm run build`.
- Três PRs empilhados: 3B na branch `claude/frente3-listas` (Tasks 1-2), 3A em `claude/frente3a-lista` criada a partir dela (Tasks 3-6), 3C em `claude/frente3c-itens` criada a partir da 3A (Tasks 7-9). A Task 10 fecha cada PR.

---

## Parte 3B: vocabulário único (branch `claude/frente3-listas`)

### Task 1: Rótulos de status numa tabela só, na tela e no CSV

**Files:**
- Modify: `frontend/src/rotulos.js` (`GERAL`: `closed` → 'Concluído'; `publicado` → 'Vigente' se existir, senão acrescentar)
- Modify: `frontend/src/atividade/aba-gaps.js` (`STATUS`: rótulos por `rotuloDe`), `frontend/src/views/gaps.js`, `frontend/src/views/mapa-de-risco.js`, `frontend/src/views/grc.js` (select de status da CAPA), `frontend/src/views/documentos-arquivo.js` (rótulo `publicado`)
- Modify: `src/services/exportacao.ts` (`STATUS`, `NIVEL`, `ESTRATEGIA` com os mesmos rótulos da tela)
- Test: `frontend/test/rotulos-csv.test.js`; ajustar os testes de tela que fixam "Fechado", "Pendente" ou "Publicado"

**Interfaces:**
- Consumes: `rotuloDe(dominio, valor)` de `frontend/src/rotulos.js`.
- Produces: `STATUS` de `aba-gaps.js` continua exportado como `[[valor, rotulo], ...]` (gaps.js o usa), agora com rótulos vindos de `rotuloDe`.

- [ ] **Step 1: Teste que falha**

```js
// frontend/test/rotulos-csv.test.js
import { describe, it, expect } from 'vitest';
import { rotuloDe } from '../src/rotulos.js';
import { STATUS, NIVEL, ESTRATEGIA } from '../../src/services/exportacao.ts';

describe('o CSV usa os mesmos rótulos da tela', () => {
    it.each([...Object.entries(STATUS), ...Object.entries(NIVEL), ...Object.entries(ESTRATEGIA)])('%s', (valor, rotulo) => {
        expect(rotulo).toBe(rotuloDe('', valor));
    });
    it('ação e risco: Aberto / Em andamento / Concluído / Mitigado / Aceito', () => {
        expect(['Open', 'In Progress', 'Closed', 'Mitigated', 'Accepted'].map((v) => rotuloDe('', v)))
            .toEqual(['Aberto', 'Em andamento', 'Concluído', 'Mitigado', 'Aceito']);
        expect(rotuloDe('', 'publicado')).toBe('Vigente');
    });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx vitest run test/rotulos-csv.test.js` (Closed → 'Fechado').

- [ ] **Step 3: Implementar**
- `rotulos.js`: `'closed': 'Concluído'`; `'publicado': 'Vigente'`. Conferir que os demais valores dos mapas de `exportacao.ts` existem em `GERAL` com o mesmo texto; acertar os que divergirem do lado do servidor (a tela é a referência), exceto onde a tela estiver em desacordo com a decisão (ação e risco acima).
- `aba-gaps.js`: `export const STATUS = ['Open', 'In Progress', 'Closed'].map((v) => [v, rotuloDe('', v)]);`
- `mapa-de-risco.js`: apagar o mapa local Open → Pendente / Closed → Concluído; o rótulo do status do risco sai de `rotuloDe('', r.status)` e o filtro de status lista os valores reais (Open, Mitigated, Accepted, Closed), sem dobrar Mitigated/Accepted em Open.
- `grc.js`: as opções do select de status da CAPA saem de `['Open', 'In Progress', 'Closed'].map((v) => \`<option value="${v}" ...>${rotuloDe('', v)}</option>\`)`; o cartão "Concluídas" continua.
- `documentos-arquivo.js`: o rótulo de `publicado` passa a `rotuloDe('', 'publicado')` (Vigente).
- `exportacao.ts`: `STATUS = { Open: 'Aberto', 'In Progress': 'Em andamento', Closed: 'Concluído', Mitigated: 'Mitigado', Accepted: 'Aceito' }` (manter as chaves que já existem).

- [ ] **Step 4: Rodar** — `cd frontend && npx vitest run && npm run build`; na raiz `npx tsc --noEmit && npx vitest run test/exportacao*.test.ts`. Testes que fixavam "Fechado"/"Pendente"/"Publicado" fixavam a divergência: ajuste e nomeie no commit.

- [ ] **Step 5: Commit** — `fix: um rótulo por status nos dois módulos e no CSV (Aberto, Em andamento, Concluído)`

### Task 2: Nomes de tela iguais ao menu nos dois módulos

**Files:**
- Modify: `frontend/login.html` (`nav-audit-trail`, `nav-meus`, `nav-documentos`), `frontend/src/globals.js` (`NO_MENU_DE_CONTA`), `frontend/src/produto.js` (`ROTULOS_PRIVACY`)
- Modify: `frontend/src/views/documentos.js` (título por `tituloDaTela('nav-documentos', 'Políticas e normas')`), `frontend/src/views/meus-pedidos.js` (`tituloDaTela('nav-meus', 'Minhas aprovações')`), `frontend/src/views/admin.js` (título "Trilha de auditoria" pelo menu)
- Test: `frontend/test/casca-menu.test.js`, `frontend/test/uma-lingua.test.js` (e os testes de tela que fixam os títulos antigos)

- [ ] **Step 1: Teste que falha** — em `casca-menu.test.js`, trocar as expectativas: n.iso e n.privacy mostram "Trilha de auditoria", "Minhas aprovações" e "Políticas e normas" (o documento em arquivo do n.privacy segue "Documentos"). Em `uma-lingua.test.js`, acrescentar à lista de telas renderizadas as do n.privacy que já têm teste de tela (titular, gaps, lia, documentos-arquivo, terceiros), seguindo o mesmo formato das do n.iso que o arquivo já usa, e conferir que o título de cada uma é o rótulo do menu.
- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx vitest run test/casca-menu.test.js test/uma-lingua.test.js`.
- [ ] **Step 3: Implementar** — `login.html`: texto de `nav-audit-trail` "Trilha de auditoria", `nav-meus` "Minhas aprovações", `nav-documentos` "Políticas e normas"; `globals.js`: `['nav-meus', 'meus-pedidos', 'Minhas aprovações', ...]` e `['nav-audit-trail', 'audit-trail', 'Trilha de auditoria', ...]`; `produto.js`: em `ROTULOS_PRIVACY`, `nav-documentos` → "Políticas e normas" (e tirar entradas que só repetiam o rótulo antigo). Títulos por `tituloDaTela`. Em `admin.js`, o título vem de `tituloDaTela('nav-audit-trail', 'Trilha de auditoria')` (agora o texto do item é o mesmo nos dois menus).
- [ ] **Step 4: Rodar** — `cd frontend && npx vitest run && npm run build`. E2E que procurem o texto antigo (`grep -rn "Meus pedidos\|Trilha de logs\|'Políticas'" frontend/e2e`): atualizar o texto.
- [ ] **Step 5: Commit** — `fix: nomes de tela iguais ao menu (Trilha de auditoria, Minhas aprovações, Políticas e normas)`

---

## Parte 3A: componente de lista (branch `claude/frente3a-lista`, a partir de `claude/frente3-listas`)

### Task 3: `frontend/src/lista.js`

**Files:**
- Create: `frontend/src/lista.js`
- Modify: `frontend/src/style.css` (só se faltar classe; reaproveitar `co-*`)
- Test: `frontend/test/lista.test.js`

**Interfaces:**
- Produces: `montarLista(alvo: HTMLElement, cfg) => { atualizar(linhas) }`, com `cfg = { id, colunas, linhas, busca?, filtros?, exportar?, vazio?, filtroPainel?, ordenar?, porPagina? }` como na spec (A1). `filtros[i] = { chave, rotulo, valor: (linha) => string, opcoes?: [valor, rotulo][] }`. `exportar = { caminho, rotulo? }`. `vazio = { titulo, dica?, acao? }`. `filtroPainel = { tela, aba? }`.

- [ ] **Step 1: Teste que falha**

```js
// frontend/test/lista.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
const { baixarArquivo } = vi.hoisted(() => ({ baixarArquivo: vi.fn(async () => {}) }));
vi.mock('../src/api.js', () => ({ baixarArquivo, api: vi.fn() }));
import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { montarLista } from '../src/lista.js';

const linhas = Array.from({ length: 30 }, (_, i) => ({ id: `l${i}`, nome: i === 0 ? 'Ação' : `Item ${i}`, status: i % 2 ? 'Open' : 'Closed' }));
const colunas = [{ label: 'Nome', key: 'nome' }, { label: 'Status', render: (l) => l.status }];
const linhasDaTabela = () => [...document.querySelectorAll('#alvo tbody tr')];
const digitar = (sel, v) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
const escolher = (sel, v) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); };

beforeEach(() => {
    initDelegation();
    document.body.innerHTML = '<div id="alvo"></div>';
    S.filtroPainel = null;
    baixarArquivo.mockClear();
});

const montar = (extra = {}) => montarLista(document.getElementById('alvo'), {
    id: 'tl', colunas, linhas, busca: (l) => l.nome,
    filtros: [{ chave: 'status', rotulo: 'Status', valor: (l) => l.status }],
    vazio: { titulo: 'Nada aqui' }, ...extra,
});

describe('montarLista', () => {
    it('mostra 25, conta e carrega mais', () => {
        montar();
        expect(linhasDaTabela()).toHaveLength(25);
        expect(document.querySelector('#alvo .co-contagem').textContent).toContain('30');
        document.querySelector('#alvo [data-action="listaMais"]').click();
        expect(linhasDaTabela()).toHaveLength(30);
        expect(document.querySelector('#alvo [data-action="listaMais"]')).toBeNull();
    });

    it('busca sem acento e sem caixa; volta ao começo', () => {
        montar();
        digitar('#tl-busca', 'acao');
        expect(linhasDaTabela().map((tr) => tr.textContent)).toEqual([expect.stringContaining('Ação')]);
        expect(document.querySelector('#alvo .co-contagem').textContent).toContain('1 de 30');
    });

    it('filtro com opções tiradas dos dados, pelo rótulo', () => {
        montar();
        const opcoes = [...document.querySelectorAll('#tl-f-status option')].map((o) => o.textContent);
        expect(opcoes).toEqual(['Todos', 'Aberto', 'Concluído']);
        escolher('#tl-f-status', 'Closed');
        expect(linhasDaTabela()).toHaveLength(15);
    });

    it('vazio pela renderEmptyState', () => {
        montar({ linhas: [] });
        expect(document.querySelector('#alvo').textContent).toContain('Nada aqui');
    });

    it('exportar chama baixarArquivo e avisa o erro', async () => {
        window.showToast = vi.fn();
        baixarArquivo.mockRejectedValueOnce(new Error('Sem permissão'));
        montar({ exportar: { caminho: '/api/v1/projects/p1/export/risks' } });
        document.querySelector('#alvo [data-action="listaExportar"]').click();
        await new Promise((r) => setTimeout(r, 0));
        expect(baixarArquivo).toHaveBeenCalledWith('/api/v1/projects/p1/export/risks');
        expect(window.showToast).toHaveBeenCalledWith('Sem permissão', 'error');
    });

    it('atualizar troca as linhas mantendo busca e filtro', () => {
        const l = montar();
        digitar('#tl-busca', 'item 1');
        l.atualizar([{ id: 'n', nome: 'Item 100', status: 'Open' }]);
        expect(linhasDaTabela()).toHaveLength(1);
    });
});
```

Se `showToast` for importado de `ui.js` em vez de `window`, ajuste o teste para espiar o módulo (`vi.spyOn`) ou o `#toast` do DOM, mantendo a asserção: a mensagem do servidor aparece como erro.

- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx vitest run test/lista.test.js`.

- [ ] **Step 3: Implementar**

```js
// frontend/src/lista.js
// Lista carregada inteira no navegador (decisão de 20/10/2026): busca sem acento, filtros, contagem, "Carregar mais" e exportar,
// iguais em toda tela dos dois módulos. A tabela é a renderDataTable; o vazio, a renderEmptyState; eventos por delegação.
import { baixarArquivo } from './api.js';
import { escapeHTML, renderDataTable, renderEmptyState, showToast } from './ui.js';
import { rotuloDe } from './rotulos.js';
import { filtrarDoPainel } from './filtro-painel.js';

const LISTAS = new Map();
const chave = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function opcoesDe(f, linhas) {
    if (f.opcoes) return f.opcoes;
    const vistos = [...new Set(linhas.map(f.valor).filter((v) => v !== null && v !== undefined && v !== ''))];
    return vistos.sort().map((v) => [v, rotuloDe('', v)]);
}

function visiveis(L) {
    let itens = L.linhas;
    let chip = '';
    if (L.cfg.filtroPainel) ({ itens, chip } = filtrarDoPainel(L.cfg.filtroPainel.tela, L.cfg.filtroPainel.aba, itens));
    const q = chave(L.busca);
    if (q && L.cfg.busca) itens = itens.filter((l) => chave(L.cfg.busca(l)).includes(q));
    for (const f of L.cfg.filtros || []) {
        const v = L.filtros[f.chave];
        if (v) itens = itens.filter((l) => String(f.valor(l) ?? '') === v);
    }
    if (L.cfg.ordenar) itens = [...itens].sort(L.cfg.ordenar);
    return { itens, chip };
}

function desenharCorpo(L) {
    const { itens, chip } = visiveis(L);
    const corpo = document.getElementById(`${L.cfg.id}-corpo`);
    if (!corpo) return;
    const total = L.linhas.length;
    const filtrando = itens.length !== total;
    const mostrar = itens.slice(0, L.mostrando);
    const resto = itens.length - mostrar.length;
    const contagem = document.getElementById(`${L.cfg.id}-contagem`);
    if (contagem) contagem.textContent = filtrando ? `${itens.length} de ${total}` : `${total}`;
    const vazio = L.cfg.vazio || { titulo: 'Nenhum registro encontrado.' };
    corpo.innerHTML = chip + (itens.length
        ? renderDataTable(L.cfg.colunas, mostrar)
        : (total ? renderEmptyState({ titulo: 'Nada encontrado com a busca ou o filtro.' }) : renderDataTable(L.cfg.colunas, [], { emptyState: vazio.titulo, emptyHint: vazio.dica, emptyAction: vazio.acao })))
        + (resto > 0 ? `<button type="button" class="btn btn-secondary btn-sm" data-action="listaMais" data-args='${escapeHTML(JSON.stringify([L.cfg.id]))}'>Carregar mais ${Math.min(resto, L.porPagina)} · ${resto} restantes</button>` : '');
}

export function montarLista(alvo, cfg) {
    const L = { cfg, linhas: cfg.linhas || [], busca: '', filtros: {}, porPagina: cfg.porPagina || 25, mostrando: cfg.porPagina || 25 };
    LISTAS.set(cfg.id, L);
    const args = (...v) => escapeHTML(JSON.stringify(v));
    const campos = [
        cfg.busca ? `<label class="co-campo"><span class="co-campo-rotulo">Buscar</span>
            <input type="search" class="form-input" id="${cfg.id}-busca" data-action-input="listaBuscar" data-args='${args(cfg.id)}' data-arg-val></label>` : '',
        ...(cfg.filtros || []).map((f) => `<label class="co-campo"><span class="co-campo-rotulo">${escapeHTML(f.rotulo)}</span>
            <select class="form-select" id="${cfg.id}-f-${f.chave}" data-action-change="listaFiltrar" data-args='${args(cfg.id, f.chave)}' data-arg-val>
            <option value="">Todos</option>${opcoesDe(f, L.linhas).map(([v, r]) => `<option value="${escapeHTML(v)}">${escapeHTML(r)}</option>`).join('')}</select></label>`),
        `<span class="co-contagem" id="${cfg.id}-contagem" role="status"></span>`,
        cfg.exportar ? `<button type="button" class="btn btn-secondary btn-sm" data-action="listaExportar" data-args='${args(cfg.id)}'>${escapeHTML(cfg.exportar.rotulo || 'Exportar CSV')}</button>` : '',
    ].join('');
    alvo.innerHTML = `<div class="co-controles">${campos}</div><div id="${cfg.id}-corpo"></div>`;
    desenharCorpo(L);
    return {
        atualizar(novas) { L.linhas = novas || []; desenharCorpo(L); },
    };
}

window.listaBuscar = (id, valor) => { const L = LISTAS.get(id); if (!L) return; L.busca = valor; L.mostrando = L.porPagina; desenharCorpo(L); };
window.listaFiltrar = (id, chaveFiltro, valor) => { const L = LISTAS.get(id); if (!L) return; L.filtros[chaveFiltro] = valor; L.mostrando = L.porPagina; desenharCorpo(L); };
window.listaMais = (id) => { const L = LISTAS.get(id); if (!L) return; L.mostrando += L.porPagina; desenharCorpo(L); };
window.listaExportar = (id) => {
    const L = LISTAS.get(id);
    if (!L?.cfg.exportar) return;
    return baixarArquivo(L.cfg.exportar.caminho).catch((e) => showToast(e.message || 'Não foi possível exportar', 'error'));
};
```

Confira em `ui.js` os nomes exportados (`renderDataTable`, `renderEmptyState`, `showToast`, `escapeHTML`) e a assinatura de `renderEmptyState` antes de rodar; se `showToast` não for exportado, use `window.showToast`. Se a busca no `input` redesenhar o campo e perder o foco, o desenho só refaz `#<id>-corpo` (como acima), nunca os controles.

- [ ] **Step 4: Rodar** — `cd frontend && npx vitest run test/lista.test.js && npx vitest run && npm run build`.
- [ ] **Step 5: Commit** — `feat: componente de lista com busca, filtros, contagem, carregar mais e exportar`

### Task 4: As listas do n.iso em `grc.js` (CAPA, Riscos, Fornecedores, Treinamento, Auditorias)

**Files:**
- Modify: `frontend/src/views/grc.js` (`renderCAPA`, `renderRisks`, `renderVendors`, `renderTraining`, `renderAudits`)
- Test: os testes de tela que já existem (`grc-fornecedores-view`, `grc-nivel-risco`, `capa-aviso`, `risco-*`, `filtro-painel`, `dpa-fonte-unica`, `aceite-risco-telas`) ajustados, mais `frontend/test/listas-niso-grc.test.js` (um teste por tela: busca acha um item, um filtro reduz, exportar chama a rota certa quando existe)

**Interfaces:**
- Consumes: `montarLista` (Task 3).

- [ ] **Step 1:** escrever `listas-niso-grc.test.js` com o mock de `api` por `vi.hoisted` (padrão de `frontend/test/grc-fornecedores-view.test.js`), uma tela por `it`, conferindo: campo `#<id>-busca`, um select de filtro, a contagem e (Riscos, Fornecedores, Treinamento) o botão de exportar chamando `baixarArquivo('/api/v1/projects/p1/export/<tipo>')`.
- [ ] **Step 2:** rodar e ver falhar.
- [ ] **Step 3:** em cada tela, manter o cabeçalho e os cartões de resumo, e trocar a tabela por um `<div id="...">` montado com `montarLista`, com as buscas, filtros e exportar da tabela A2 da spec:
  - CAPA (`id: 'capa'`): busca título e responsável; filtros Status, Severidade, Origem (`audit_id` → "Auditoria", `risk_id` → "Risco", `incidente_id` → "Incidente", senão "Avulsa"); `filtroPainel: { tela: 'capa' }` (substitui o `filtrarDoPainel` manual); sem exportar.
  - Riscos (`id: 'riscos'`): a matriz fica; a lista de cartões (`.list-item`) vira tabela com Ameaça, Ativo, Nível (`rotuloDe`), Residual, Tratamento, Status e Responsável, e a ação de abrir o detalhe por linha (botão `btn-ghost btn-sm`, nunca primário). O clique na célula da matriz (`toggleRiskFilter`) passa a definir um filtro da lista (`L.filtros.celula = 'p-i'`), com um filtro `celula` de `valor: (r) => \`${r.probability}-${r.impact}\`` e opções fixas vazias (não aparece como select: use `filtros` só para Nível, Status e Tratamento e aplique a célula via `atualizar` com as linhas já filtradas, a forma mais simples sem mexer no componente). Exportar `/export/risks`.
  - Fornecedores (`id: 'fornecedores'`): busca nome; filtros Diligência, DPA (`v.dpa ? 'sim' : v.dpa_declarado ? 'declarado' : 'nao'`, opções fixas Sim / Declarado, sem documento / Não), Avaliação (`v.id ? 'com' : 'sem'`); exportar `/export/vendors`.
  - Treinamento (`id: 'treinamento'`): busca colaborador e treinamento; filtro Status; exportar `/export/training`.
  - Auditorias (`id: 'auditorias'`): busca título; filtros Tipo e Status; sem exportar.
- [ ] **Step 4:** `cd frontend && npx vitest run && npm run build` (o `style=` de `grc.js` não pode subir).
- [ ] **Step 5: Commit** — `feat: listas do n.iso com busca, filtros e exportar (CAPA, riscos, fornecedores, treinamento, auditorias)`

### Task 5: As outras listas do n.iso (Ativos, Evidências, Políticas e normas, Partes)

**Files:**
- Modify: `frontend/src/views/monitor.js` (`renderAssets`), `frontend/src/views/compliance.js` (`renderEvidence`), `frontend/src/views/documentos.js` (`renderDocumentos`), `frontend/src/views/partes.js` (`renderPartes`)
- Test: `frontend/test/listas-niso-outras.test.js` e os testes de tela existentes ajustados (`monitor-view`, `documentos-view`, `partes-view`, `evidencia-controle`, `ativo-padrao`)

- [ ] **Step 1:** teste por tela (mesmo formato da Task 4).
- [ ] **Step 2:** rodar e ver falhar.
- [ ] **Step 3:**
  - Ativos (`id: 'ativos'`): busca nome e responsável; filtros Categoria, Classificação, Criticidade; exportar `/export/assets` (o botão "Exportar CSV" de cima sai, o da lista fica).
  - Evidências (`id: 'evidencias'`): busca arquivo e controle; filtros Avaliação e Validade (`valido_ate` vazio → 'sem'; antes de `hojeSP()` → 'vencida'; senão 'em_dia'; opções fixas Em dia / Vencida / Sem validade); `filtroPainel: { tela: 'evidence' }`.
  - Políticas e normas (`id: 'documentos'`): sem busca nem filtro ativo, a árvore de hoje (`arvore(docs)`); com busca ou filtro, lista plana. Implementação: passar `linhas` em ordem de árvore com o recuo na coluna do título, e `ordenar` ausente; a busca filtra sobre essas linhas (a lista fica plana porque as filhas sem a mãe aparecem com o mesmo recuo: aceitável e simples). Filtros Tipo e Situação.
  - Partes (`id: 'partes'` e `id: 'departamentos'`): busca nome e e-mail; filtros Tipo e Situação; departamentos com busca por nome.
- [ ] **Step 4:** `cd frontend && npx vitest run && npm run build` (teto de `style=` desses arquivos já está cheio: só pode descer).
- [ ] **Step 5: Commit** — `feat: listas do n.iso com busca e filtros (ativos, evidências, políticas e normas, partes)`

### Task 6: Listas do n.privacy no componente

**Files:**
- Modify: `frontend/src/views/gaps.js`, `lia.js`, `privacy.js` (RIPD e RoPA), `documentos-arquivo.js`, `titular.js`, `consentimentos.js`, `mapa-de-risco.js` (vista Lista), `terceiros.js` (lista; `.tc-filtros` sai), `areas.js`, `sistemas.js`
- Test: os testes de tela de cada um ajustados aos ids novos; nenhum teste deixa de conferir o que já conferia (busca, filtros, exportar, "Em atraso", filtro do Painel)

- [ ] **Step 1:** para cada tela, trocar no teste existente os seletores do filtro e da busca pelos do componente (`#<id>-busca`, `#<id>-f-<chave>`) e acrescentar a contagem.
- [ ] **Step 2:** rodar e ver falhar.
- [ ] **Step 3:** trocar o `co-controles` montado à mão e o `desenhar()` local de cada tela por `montarLista`, com os mesmos campos e filtros de hoje (os filtros derivados, como "Em atraso" de gaps e Situação da LIA, viram `filtros` com `valor` derivado e `opcoes` fixas). O botão de exportar que ficava fora (gaps, RIPD, mapa de risco) passa a `exportar` do componente; o do RoPA continua em "Mais ações". `catalogos.js` (busca no servidor) não muda.
- [ ] **Step 4:** `cd frontend && npx vitest run && npm run build`.
- [ ] **Step 5: Commit** — `refactor: listas do n.privacy pelo componente de lista`

---

## Parte 3C: itens soltos (branch `claude/frente3c-itens`, a partir de `claude/frente3a-lista`)

### Task 7: CSV do n.iso em pt-BR e download com aviso de erro

**Files:**
- Modify: `src/routes/integrations.ts` (`/export/risks`, `/export/vendors`, `/export/training`, `/export/audit-log`, `/export/assets`)
- Modify: `frontend/src/views/monitor.js` (sai `exportCSV`), `frontend/src/views/grc.js` e onde mais `exportCSV` for usado (`grep -rn "exportCSV" frontend/src`)
- Test: `test/export-niso-ptbr.test.ts`; ajustar `test/export-risks-faixa.test.ts`, `test/fornecedor-criterio.test.ts`, `test/dpa-fonte-unica.test.ts` e quem mais ler esses CSVs (`grep -rln "export/\(risks\|vendors\|training\|audit-log\|assets\)" test frontend/test`)

**Interfaces:**
- Consumes: `montarCsv(cabecalho: string[], linhas: unknown[][])`, `STATUS`, `NIVEL`, `ESTRATEGIA`, `traduz(mapa, v)` de `src/services/exportacao.ts`.

- [ ] **Step 1: Teste que falha** — para cada rota: resposta começa com `﻿`, separador `;`, linha `\r\n`, cabeçalho em português (riscos: `Ativo;Ameaça;Vulnerabilidade;Impacto;Probabilidade;Nível;Tratamento;Responsável;Status`, com aspas conforme `celulaCsv`), e um valor traduzido (risco `High` → `Alto`, status `Open` → `Aberto`). `Content-Type` contém `charset=utf-8`.
- [ ] **Step 2:** rodar e ver falhar.
- [ ] **Step 3:** em cada rota, montar as linhas como arrays e responder com `montarCsv(cabecalho, linhas)`, mantendo `csvComTrilha` (passe o texto já montado; ajuste `csvComTrilha` para `text/csv; charset=utf-8` se ele define o tipo). Cabeçalhos em português; valores de status, nível e tratamento por `traduz`. Filtros de faixa existentes continuam. Na tela, toda chamada de exportação usa `baixarArquivo(\`/api/v1/projects/${id}/export/${tipo}\`).catch((e) => showToast(e.message, 'error'))`; apagar `exportCSV` e `window.exportCSV`.
- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run test/export*.test.ts test/integrations*.test.ts test/fornecedor-criterio.test.ts test/dpa-fonte-unica.test.ts test/contrato-tela-api.test.ts && cd frontend && npx vitest run && npm run build`.
- [ ] **Step 5: Commit** — `fix: CSV do n.iso em pt-BR (BOM, ponto e vírgula, rótulos) e download com aviso de erro`

### Task 8: Prazo da CAPA, risco com residual e prazo, nome do fornecedor

**Files:**
- Modify: `src/schemas/resources.ts` (`createCapaSchema`, `capaUpdateSchema`, `createRiskSchema`, `riskUpdateSchema`), `src/routes/risks.ts`, `src/routes/vendors.ts`
- Modify: `frontend/src/views/grc.js` (formulários de CAPA e de risco)
- Test: `test/capa-prazo-risco-tratamento.test.ts`, `frontend/test/formularios-niso.test.js`

- [ ] **Step 1: Testes que falham**
  - CAPA: `POST .../capa` com `due_date: '31/12/2026'` → 400; com `'2026-12-31'` → 201; `PUT /capa/:id` com data inválida → 400.
  - Risco: `POST .../risks` com `treatment_due_date: '2026-11-30'` grava a coluna; `PUT /risks/:id` com `treatment_due_date: null` limpa; data inválida → 400; `residual_impact`/`residual_probability` no POST gravam e calculam `residual_level`.
  - Fornecedor: `PUT /vendors/:id` com `name: '  acme   ltda '` grava o mesmo que `normalizarNome('  acme   ltda ')` em `partes.nome`.
  - Tela: o formulário de risco tem os campos de residual e prazo e os envia; o de CAPA exige responsável (o botão de gravar fica desabilitado ou a gravação recusa com mensagem, como o gap).
- [ ] **Step 2:** rodar e ver falhar.
- [ ] **Step 3:**
  - `resources.ts`: um `dataIso` local igual ao de `src/schemas/ropa-abas.ts` (importe se ele for exportado); `due_date: dataIso.nullish()` na criação e `dataIso.nullish()` na edição parcial (ausente mantém, `null` limpa); `treatment_due_date: dataIso.nullish()` nos dois esquemas de risco; `residual_impact`/`residual_probability` em `createRiskSchema` (`score1to5.optional().nullable()`).
  - `risks.ts`: POST grava `treatment_due_date`, `residual_impact`, `residual_probability` e `residual_level` (`residualLevel`); PUT trata `treatment_due_date` como `anulavel`.
  - `vendors.ts`: `const nome = normalizarNome(String(body.name));`.
  - `grc.js`: campos "Impacto residual", "Probabilidade residual" (selects 1–5, vazio permitido) e "Prazo de tratamento" (`type="date"`) nos dois formulários de risco; responsável obrigatório no formulário de CAPA.
- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run test/capa-prazo-risco-tratamento.test.ts test/risco-*.test.ts test/frente1-defeitos.test.ts test/aceite-risco-unico.test.ts test/fornecedor*.test.ts test/openapi.test.ts test/any-catraca.test.ts && cd frontend && npx vitest run && npm run build`. O `openapi.json` muda com os esquemas: `npm run openapi` e inclua o arquivo.
- [ ] **Step 5: Commit** — `fix: prazo da CAPA como data, risco do n.iso com residual e prazo, nome do fornecedor normalizado`

### Task 9: Validade da evidência pelo n.iso

**Files:**
- Modify: `src/modulos.ts` (`SUBROTAS_NUCLEO` ganha `/^evidence\/[^/]+\/validade$/`)
- Modify: `frontend/src/views/compliance.js` (coluna "Validade" e ação "Definir validade" na lista de Evidências, para quem edita evidência, com ou sem n.privacy)
- Test: `test/modulos-produto.test.ts` (faixa nova), `test/evidencia-validade-niso.test.ts` (projeto só do n.iso define a validade: 200; a rota de requisitos da evidência continua 403 sem o n.privacy), `frontend/test/evidencia-validade-niso.test.js`

- [ ] **Step 1:** testes que falham (o projeto só do n.iso recebe 403 hoje).
- [ ] **Step 2:** rodar e ver falhar.
- [ ] **Step 3:** acrescentar a regex a `SUBROTAS_NUCLEO`; na tela, a coluna "Validade" (`formatarData(valido_ate)`, "Sem validade" quando vazio, vencida com `renderStatusBadge('Vencida', 'danger')`) e, no menu da linha, "Definir validade" abrindo o mesmo modal que hoje só aparece com o n.privacy (o pedaço de requisitos do modal continua só com o n.privacy).
- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run test/modulos-produto.test.ts test/evidencia-validade-niso.test.ts test/requisitos*.test.ts && cd frontend && npx vitest run && npm run build`.
- [ ] **Step 5: Commit** — `feat: validade da evidência definida pelo n.iso (rota na faixa núcleo)`

---

### Task 10: Fechamento de cada parte (documentação, suíte inteira, revisão, PR)

Ao fim de cada parte (3B depois da Task 2, 3A depois da Task 6, 3C depois da Task 9):

- [ ] `CHANGELOG.md`: uma seção "Alterado (Frente 3X ...)" com o que a pessoa nota (rótulos e nomes; listas com busca e filtros; CSV do n.iso com formato novo).
- [ ] `AGENTS.md`: só o que mudou de fato (`frontend/src/lista.js` e onde está; vocabulário único em `rotulos.js` conferido contra `exportacao.ts`; validade da evidência na faixa núcleo; CSV do n.iso por `montarCsv`).
- [ ] `npx tsc --noEmit && cd frontend && npx vitest run && npm run build && cd .. && npx vitest run` (suíte inteira); corrigir o que cair.
- [ ] Revisão independente do diff da parte; corrigir o que for real.
- [ ] Push e PR em rascunho, empilhado sobre o anterior (3B sobre `claude/frente2b-decisoes`, 3A sobre `claude/frente3-listas`, 3C sobre `claude/frente3a-lista`), no template do repositório; acompanhar o PR.
