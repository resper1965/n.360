// Lista carregada inteira no navegador (decisão de 20/10/2026): busca sem acento, filtros, contagem, "Carregar mais" e exportar,
// iguais em toda tela dos dois módulos. A tabela é a renderDataTable; o vazio, a renderEmptyState; eventos por delegação.
// Busca e filtro redesenham só `#<id>-corpo`: os controles ficam, e o campo de busca não perde o foco.
import { baixarArquivo } from './api.js';
import { escapeHTML, renderDataTable, renderEmptyState, showToast } from './ui.js';
import { rotuloDe } from './rotulos.js';
import { filtrarDoPainel } from './filtro-painel.js';

const LISTAS = new Map();
/**
 * Colunas do componente a partir das células de cada linha (a ordem dos rótulos é a das células). `celulas(linha, ctx)`
 * roda uma vez por linha a cada desenho (cache pela linha e pelo `ctx` do desenho), não uma vez por coluna.
 */
export function colunasDe(rotulos, celulas) {
    const cache = new WeakMap();
    const deLinha = (l, ctx) => {
        let e = cache.get(l);
        if (!e || e.ctx !== ctx) { e = { ctx, celulas: celulas(l, ctx) }; cache.set(l, e); }
        return e.celulas;
    };
    return rotulos.map((label, i) => ({ label, render: (l, ctx) => deLinha(l, ctx)[i] }));
}
// `valor` pode devolver uma lista (a linha cai em mais de uma opção: várias áreas, várias pendências).
const valoresDe = (f, l) => [].concat(f.valor(l) ?? []).filter((v) => v !== null && v !== undefined && v !== '').map(String);
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function opcoesDe(f, linhas) {
    if (f.opcoes) return f.opcoes;
    const vistos = [...new Set(linhas.flatMap((l) => valoresDe(f, l)))];
    return vistos.map((v) => [v, rotuloDe('', v)]).sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'pt-BR'));
}

function visiveis(L) {
    let itens = L.linhas;
    let chip = '';
    if (L.extra) itens = itens.filter(L.extra);
    if (L.cfg.filtroPainel) ({ itens, chip } = filtrarDoPainel(L.cfg.filtroPainel.tela, L.cfg.filtroPainel.aba, itens));
    const q = semAcento(L.busca).trim();
    if (q && L.cfg.busca) itens = itens.filter((l) => semAcento(L.cfg.busca(l)).includes(q));
    let filtrando = !!(L.extra || chip || (q && L.cfg.busca));
    for (const f of L.cfg.filtros || []) {
        const v = L.filtros[f.chave];
        if (v) { itens = itens.filter((l) => valoresDe(f, l).includes(v)); filtrando = true; }
    }
    if (L.cfg.ordenar) itens = [...itens].sort(L.cfg.ordenar);
    return { itens, chip, filtrando };
}

function desenharCorpo(L) {
    // Pelo alvo, não pelo document: a tela pode montar a lista num nó ainda fora da página.
    const corpo = L.alvo.querySelector(`[id="${L.cfg.id}-corpo"]`);
    if (!corpo) return;
    const { itens, chip, filtrando } = visiveis(L);
    const total = L.linhas.length;
    const mostrar = itens.slice(0, L.mostrando);
    const resto = itens.length - mostrar.length;
    const contagem = L.alvo.querySelector(`[id="${L.cfg.id}-contagem"]`);
    if (contagem) contagem.textContent = itens.length !== total ? `${itens.length} de ${total}` : `${total}`;
    const exportar = L.alvo.querySelector('[data-action="listaExportar"]');
    if (exportar) exportar.hidden = !total;
    const vazio = L.cfg.vazio || { titulo: 'Nenhum registro encontrado.' };
    // O `ctx` chega como 2º argumento de cada `render`: com busca ou filtro ativo, a tela pode desenhar a lista plana.
    const ctx = { filtrando };
    let tabela;
    if (itens.length) tabela = renderDataTable(L.cfg.colunas.map((c) => (c.render ? { ...c, render: (l) => c.render(l, ctx) } : c)), mostrar);
    else if (total && L.extra && L.vazioExtra) tabela = renderEmptyState({ titulo: L.vazioExtra.titulo, texto: L.vazioExtra.dica });
    else if (total) tabela = renderEmptyState({ titulo: 'Nada encontrado com a busca ou o filtro.', texto: 'Limpe a busca ou escolha "Todos" no filtro.' });
    else tabela = renderEmptyState({ titulo: vazio.titulo, texto: vazio.dica, acao: vazio.acao, itens: vazio.itens });
    const botaoMais = resto > 0
        ? `<button type="button" class="btn btn-secondary btn-sm" data-action="listaMais" data-args='${escapeHTML(JSON.stringify([L.cfg.id]))}'>Carregar mais ${Math.min(resto, L.porPagina)} · ${resto} restantes</button>`
        : '';
    corpo.innerHTML = chip + tabela + botaoMais;
}

/**
 * Desenha em `alvo` os controles (busca, filtros, contagem, exportar) e a tabela de uma lista já carregada.
 * cfg = { id, colunas, linhas, busca?, buscaDica?, buscaMax?, filtros?, exportar?, vazio?, filtroPainel?, ordenar?, porPagina? } (spec A1).
 * As opções dos filtros saem de todas as linhas. O exportar some enquanto a lista não tem linha.
 * Devolve { atualizar(linhas), filtrarPor(pred, vazio?) }: `atualizar` troca as linhas mantendo busca e filtro; `filtrarPor`
 * soma um filtro da tela (a célula da matriz) sem mexer nas opções dos selects (null tira; `vazio` é o estado sem resultado dele).
 */
export function montarLista(alvo, cfg) {
    const porPagina = cfg.porPagina || 25;
    const L = { alvo, cfg, linhas: cfg.linhas || [], busca: '', filtros: {}, porPagina, mostrando: porPagina };
    LISTAS.set(cfg.id, L);
    const args = (...v) => escapeHTML(JSON.stringify(v));
    const campos = [
        cfg.busca ? `<label class="co-campo"><span class="co-campo-rotulo">Buscar</span>
            <input type="search" class="form-input" id="${escapeHTML(cfg.id)}-busca" maxlength="${Number(cfg.buscaMax) || 120}"${cfg.buscaDica ? ` placeholder="${escapeHTML(cfg.buscaDica)}"` : ''} data-action-input="listaBuscar" data-args='${args(cfg.id)}' data-arg-val></label>` : '',
        ...(cfg.filtros || []).map((f) => `<label class="co-campo"><span class="co-campo-rotulo">${escapeHTML(f.rotulo)}</span>
            <select class="form-select" id="${escapeHTML(cfg.id)}-f-${escapeHTML(f.chave)}" data-action-change="listaFiltrar" data-args='${args(cfg.id, f.chave)}' data-arg-val>
            <option value="">Todos</option>${opcoesDe(f, L.linhas).map(([v, r]) => `<option value="${escapeHTML(v)}">${escapeHTML(r)}</option>`).join('')}</select></label>`),
        `<span class="co-contagem" id="${escapeHTML(cfg.id)}-contagem" role="status"></span>`,
        cfg.exportar ? `<button type="button" class="btn btn-secondary btn-sm" data-action="listaExportar" data-args='${args(cfg.id)}'>${escapeHTML(cfg.exportar.rotulo || 'Exportar CSV')}</button>` : '',
    ].join('');
    alvo.innerHTML = `<div class="co-controles">${campos}</div><div id="${escapeHTML(cfg.id)}-corpo"></div>`;
    desenharCorpo(L);
    return {
        atualizar(novas) { L.linhas = novas || []; desenharCorpo(L); },
        filtrarPor(pred, vazio) { L.extra = pred || null; L.vazioExtra = vazio || null; L.mostrando = L.porPagina; desenharCorpo(L); },
    };
}

const doRecomeco = (id, mudar) => { const L = LISTAS.get(id); if (!L) return; mudar(L); L.mostrando = L.porPagina; desenharCorpo(L); };
window.listaBuscar = (id, valor) => doRecomeco(id, (L) => { L.busca = valor; });
window.listaFiltrar = (id, chaveFiltro, valor) => doRecomeco(id, (L) => { L.filtros[chaveFiltro] = valor; });
window.listaMais = (id) => { const L = LISTAS.get(id); if (!L) return; L.mostrando += L.porPagina; desenharCorpo(L); };
// Exporta a lista inteira do servidor (uma linha de trilha por exportação), não a filtrada.
window.listaExportar = (id) => {
    const L = LISTAS.get(id);
    if (!L?.cfg.exportar) return;
    return baixarArquivo(L.cfg.exportar.caminho).catch((e) => showToast(e.message || 'Não foi possível exportar.', 'error'));
};
