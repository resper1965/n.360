import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, renderDataTable, renderStatusBadge, falhaDeCarga, showToast, formatarData, confirmar } from '../ui.js';
import { podeEditarOt, mensagemDeErro, lista, rotaDoFluxo, classePrimario } from '../ot-comum.js';
import { montarColeta } from './ot-coleta.js';

// n.ot, "Revisão e aprovação" do site (spec 2026-11-11 fluidez E2): fila de achados em rascunho de todos os levantamentos do site,
// envio de vários de uma vez ao Lote de aprovação e, logo abaixo, a lista de lotes (montarColeta). Tudo da API passa por escapeHTML.

const args = (...xs) => escapeHTML(JSON.stringify(xs));
const el = (id) => document.getElementById(id);
const ORIGEM = { consultor: 'Consultor', ia: 'IA', agente: 'Agente', sonda: 'Sonda' };
const TIPO_LEV = { entrevista: 'Entrevista', visita: 'Visita de campo', documento: 'Documento' };
// A sonda grava origem 'consultor'; a fonte fica na evidência (EVIDENCIA_SENSOR, src/services/ot-rede.ts).
const origemDe = (x) => (String(x.evidencia || '').startsWith('Sensor de rede (Zeek): ') ? 'sonda' : x.origem);

let ctx = null; // { c, a, p, site }
let fila = [];
let nomes = {}; // `nomes_pontas` da fila: id → nome das pontas dos fluxos
let filtro = { origem: '', tipo: '' };
let sel = new Set();

const nomeDe = (x) => (x.entidade === 'fluxo' ? rotaDoFluxo(x.dados, nomes) : x.dados?.nome || 'achado sem nome');
const visiveis = () => fila.filter((x) => (!filtro.origem || origemDe(x) === filtro.origem) && (!filtro.tipo || x.entidade === filtro.tipo));
const falhou = (e, padrao) => showToast(mensagemDeErro(e, padrao), 'error');
const opt = (pares, atual) => pares.map(([v, r]) => `<option value="${v}"${v === atual ? ' selected' : ''}>${escapeHTML(r)}</option>`).join('');

function desenharFila() {
    const editar = podeEditarOt();
    const xs = visiveis();
    const alvo = el('ot-rev-fila');
    if (!fila.length) {
        alvo.innerHTML = `<p class="mb-3">Nenhum achado para revisar neste site.</p>${editar ? `<button class="btn" data-action="otRevNovoLevantamento" data-args='${args(ctx.site)}'>Novo levantamento</button>` : ''}`;
        return;
    }
    const n = sel.size;
    const linhas = xs.map((x) => {
        const nome = nomeDe(x);
        const recusado = x.desfecho === 'recusado';
        return [...(editar ? [`<input type="checkbox" id="rev-sel-${escapeHTML(x.id)}" data-action-change="otRevMarcar" data-args='${args(x.id)}' data-arg-el${sel.has(x.id) ? ' checked' : ''} aria-label="${escapeHTML(`Enviar ${nome} para aprovação`)}">`] : []),
            escapeHTML(nome) + (recusado ? ` ${renderStatusBadge('danger', 'Recusado')}<div class="org-dica">${escapeHTML(x.motivo || '')}</div>` : ''),
            x.entidade === 'fluxo' ? 'Fluxo' : 'Ativo', escapeHTML(ORIGEM[origemDe(x)] || x.origem || '—'),
            `<button class="btn btn-sm" data-action="otRevAbrirLevantamento" data-args='${args(ctx.site, x.levantamento_id)}'>${escapeHTML(`${TIPO_LEV[x.levantamento_tipo] || x.levantamento_tipo || 'Levantamento'} · ${formatarData(x.levantamento_realizado_em)}`)}</button>`,
            ...(editar ? [`<button class="btn btn-sm" data-action="otRevDescartar" data-args='${args(x.levantamento_id, x.id)}' aria-label="${escapeHTML(`Descartar ${nome}`)}">Descartar</button>`] : [])];
    });
    alvo.innerHTML = `<div class="d-flex gap-4 flex-wrap items-center mb-3">
        <label class="form-label" for="rev-f-origem">Origem</label><select class="form-input" id="rev-f-origem" data-action-change="otRevFiltro" data-args='${args('origem')}' data-arg-val><option value="">Todas</option>${opt(Object.entries(ORIGEM), filtro.origem)}</select>
        <label class="form-label" for="rev-f-tipo">Tipo</label><select class="form-input" id="rev-f-tipo" data-action-change="otRevFiltro" data-args='${args('tipo')}' data-arg-val><option value="">Todos</option>${opt([['ativo', 'Ativo'], ['fluxo', 'Fluxo']], filtro.tipo)}</select>
        ${editar ? `<button class="${classePrimario(semPri)}" data-action="otRevEnviar"${n ? '' : ' disabled'}>Enviar para aprovação (${n})</button>` : ''}</div>
        ${renderDataTable([...(editar ? ['Marcar'] : []), 'Achado', 'Tipo', 'Origem', 'Levantamento', ...(editar ? ['Ações'] : [])], linhas, { emptyMessage: 'Nenhum achado com esses filtros.' })}`;
}

let semPri = false;
export async function montarRevisao(c, a, p, o = {}) {
    semPri = !!o.semPrimario;
    filtro = { origem: '', tipo: '' }; sel = new Set(); // entrada pela casca recomeça; descartar/editar recarregam por `carregar`
    return carregar(c, a, p, o);
}
async function carregar(c, a, p, { siteFixo, semPrimario } = {}) {
    ctx = { c, a, p, site: siteFixo };
    if (S.otLote) { await montarColeta(c, a, p, { siteFixo, semPrimario }); return; } // lote aberto: só o detalhe do lote
    try {
        const r = await api('GET', `/api/v1/projects/${p.id}/ot/achados?site_id=${encodeURIComponent(siteFixo)}&situacao=rascunho`);
        fila = lista(r, 'achados'); nomes = r.nomes_pontas || {};
    } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar a fila de revisão do site.', e); return; }
    sel = new Set([...sel].filter((id) => fila.some((x) => x.id === id)));
    c.innerHTML = '<h3 class="mb-3">Fila de revisão</h3><div id="ot-rev-fila"></div><h3 class="mt-6 mb-3">Lotes de aprovação</h3><div id="ot-rev-lotes"></div>';
    desenharFila();
    const lotes = el('ot-rev-lotes');
    await montarColeta(lotes, a, p, { siteFixo, semPrimario });
}

const redesenhar = () => carregar(ctx.c, ctx.a, ctx.p, { siteFixo: ctx.site, semPrimario: semPri });
window.otRevFiltro = (campo, v) => { filtro = { ...filtro, [campo]: v }; desenharFila(); };
window.otRevMarcar = (id, caixa) => { sel[caixa.checked ? 'add' : 'delete'](id); desenharFila(); };
window.otRevNovoLevantamento = (site) => window.otTela('site', site, 'projeto', { otSub: 'levantamento' });
window.otRevAbrirLevantamento = (site, id) => window.otTela('site', site, 'projeto', { otSub: 'levantamento', otLevantamento: id });
const url = (lev, id) => `/api/v1/projects/${ctx.p.id}/ot/levantamentos/${encodeURIComponent(lev)}/achados/${encodeURIComponent(id)}`;
window.otRevDescartar = async (lev, id) => {
    try { await api('PUT', url(lev, id), { situacao: 'descartado' }); showToast('Achado descartado.', 'success'); await redesenhar(); } catch (e) { falhou(e, 'Não foi possível descartar o achado.'); }
};
window.otRevEnviar = async () => {
    const ids = [...sel];
    if (!ids.length) return;
    const ocultos = ids.filter((id) => !visiveis().some((x) => x.id === id)).length;
    const texto = `Enviar ${ids.length} ${ids.length === 1 ? 'achado' : 'achados'} para aprovação?${ocultos ? ` ${ocultos} ${ocultos === 1 ? 'deles não aparece' : 'deles não aparecem'} no filtro atual.` : ''} No Lote de aprovação, outra pessoa aprova antes do inventário.`;
    if (!await confirmar(texto, { titulo: 'Enviar para aprovação', rotulo: 'Enviar para aprovação' })) return;
    try {
        const r = await api('POST', `/api/v1/projects/${ctx.p.id}/ot/sites/${encodeURIComponent(ctx.site)}/enviar`, { achados: ids });
        sel = new Set();
        showToast(`Lote de aprovação criado com ${r.itens} item(ns).`, 'success');
        window.otIrParaLote(ctx.site, r.id);
    } catch (e) { falhou(e, 'Não foi possível enviar os achados para aprovação.'); }
};
