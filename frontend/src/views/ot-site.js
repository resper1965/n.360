import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, renderEmptyState, renderDataTable, falhaDeCarga, renderAbas, renderMaisAcoes } from '../ui.js';
import { podeEditarOt, podeCriarLote, ehGestor, lista, areaDaFase, TIPOS_SITE, CRITICIDADE } from '../ot-comum.js';
import { escreverEndereco } from '../ot-navegacao.js';
import { montarInventario, montarFluxos, formSite } from './ot.js';
import { montarLevantamento, esvaziarNotas } from './ot-levantamento.js';
import { montarRevisao } from './ot-revisao.js';
import { montarDesvios } from './ot-desvios.js';
import { cabecalhoDoSite } from './ot-base.js';
import { areaSondas, preencherCartoes } from './ot-sensores.js';

// n.ot, lista de sites e tela do site (spec 2026-11-11 fluidez §3). A tela do site tem duas áreas (Implantação, Operação), cada uma com suas sub-abas; o recorte
// por site é o `siteFixo` das telas reaproveitadas. Quem navega (window.otTela, endereço) é a casca; aqui só se desenha.

export const SUBS = { projeto: ['levantamento', 'aprovacao', 'base'], operacao: ['saude', 'desvios', 'inventario'] };
const MODOS = [['projeto', 'Implantação'], ['operacao', 'Operação']];
// Abas que o Painel já manda com o nome final e que aqui ainda têm o nome de hoje (sai no PR7, quando `revisar` vira aba).
export const ALIAS_ABA = { revisar: 'aprovacao' };
/** O modo de uma aba pedida dentro da sessão (botões, Painel); aba que não é de modo nenhum, null (a área decide). */
export const modoDaAba = (aba) => Object.keys(SUBS).find((m) => SUBS[m].includes(ALIAS_ABA[aba] ?? aba)) ?? null;
const ROTULO = { levantamento: 'Levantamento', aprovacao: 'Revisão e aprovação', base: 'Base', saude: 'Saúde da coleta', desvios: 'Desvios', inventario: 'Inventário' };

const args = (...xs) => escapeHTML(JSON.stringify(xs));
let sitesDaLista = [];

// ─── lista de sites ───────────────────────────────────────────────────────────
export async function montarSites(c, a, p) {
    try { sitesDaLista = lista(await api('GET', `/api/v1/projects/${p.id}/ot/sites`), 'sites'); } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar os sites do n.ot.', e); return; }
    const editar = podeEditarOt();
    if (!sitesDaLista.length) {
        c.innerHTML = renderEmptyState({ titulo: 'Nenhum site no inventário',
            texto: editar ? 'Cadastre o primeiro site (subestação, usina ou centro de operação); zonas e ativos ficam dentro dele.'
                : 'O inventário começa pelos sites. Quem administra o n.ot no projeto cadastra os sites ou concede o seu acesso a eles.',
            acao: editar ? '<button class="btn btn-primary" data-action="otNovoSite">Cadastrar o primeiro site</button>' : '' });
        return;
    }
    if (editar) a.innerHTML = '<button class="btn btn-primary" data-action="otNovoSite">+ Novo site</button>';
    c.innerHTML = renderDataTable(['Site', 'Tipo', 'Criticidade', 'Localização', 'Ações'], sitesDaLista.map((s) => [
        `<strong>${escapeHTML(s.nome)}</strong>`, escapeHTML(TIPOS_SITE[s.tipo] || s.tipo), escapeHTML(CRITICIDADE[s.criticidade] || '—'), escapeHTML(s.localizacao || '—'),
        `<div class="d-flex gap-2"><button class="btn btn-sm" data-action="otTela" data-args='${args('site', s.id, null)}' aria-label="${escapeHTML(`Abrir ${s.nome}`)}">Abrir</button>`
        + (editar ? `<button class="btn btn-sm" data-action="otEditarSiteDaLista" data-args='${args(s.id)}' aria-label="${escapeHTML(`Editar ${s.nome}`)}">Editar</button>`
            + renderMaisAcoes([{ rotulo: 'Remover', action: 'otRemover', args: ['sites', s.id], perigo: true }], { nome: s.nome }) : '') + '</div>',
    ]));
}
window.otEditarSiteDaLista = (id) => formSite(sitesDaLista.find((s) => s.id === id) || {});

// ─── tela do site ─────────────────────────────────────────────────────────────
/** Procura o desvio no projeto (sem filtro de situação) e devolve o site dele, ou null se não aparece para esta pessoa. */
export async function resolverDesvio(p, desvioId) {
    try {
        const d = lista(await api('GET', `/api/v1/projects/${p.id}/ot/desvios`), 'desvios').find((x) => x.id === desvioId);
        return d ? { site_id: d.site_id } : null;
    } catch { return null; }
}

// Base = inventário + fluxos. Os dois escrevem nas ações do cabeçalho; fica o botão de cada um, só o último sem destaque.
async function montarBase(c, a, p, o) {
    c.innerHTML = '<div id="ot-base-inv"></div><h3 class="mt-6 mb-3">Fluxos</h3><div id="ot-base-fluxos"></div>';
    const af = document.createElement('div');
    await montarInventario(c.querySelector('#ot-base-inv'), a, p, o);
    await montarFluxos(c.querySelector('#ot-base-fluxos'), af, p, o);
    a.insertAdjacentHTML('beforeend', af.innerHTML);
}

export async function montarSite(c, a, p, { site, modo, sub, desvio } = {}) {
    let sites;
    let sit = null; // sem a situação o cartão avisa e a tela segue
    try {
        const [rs, rt] = await Promise.allSettled([api('GET', `/api/v1/projects/${p.id}/ot/sites`), api('GET', `/api/v1/projects/${p.id}/ot/sites/${encodeURIComponent(site)}/situacao`)]);
        if (rs.status === 'rejected') throw rs.reason;
        sites = lista(rs.value, 'sites');
        if (rt.status === 'fulfilled') sit = rt.value;
    } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar o site.', e); return; }
    const s = sites.find((x) => x.id === site);
    if (!s) { c.innerHTML = renderEmptyState({ titulo: 'Site não encontrado', texto: 'Este site não existe neste projeto ou o seu acesso a ele não foi concedido.' }); return; }
    // sem modo pedido (endereço, Abrir), a área decide; a aba que não é dessa área abre a primeira dela (spec 2026-11-26 §7)
    modo = SUBS[modo] ? modo : (sit?.area ?? areaDaFase(sit?.fase)) === 'operacao' ? 'operacao' : 'projeto';
    const pedida = ALIAS_ABA[sub] ?? sub;
    sub = SUBS[modo].includes(pedida) ? pedida : SUBS[modo][0];
    S.otSite = site; S.otSub = sub; S.otModo = modo;
    escreverEndereco({ tela: 'site', site, aba: sub }); // recarregar mantém a aba efetiva
    if (sub === 'desvios') {
        const f = S.otDesvioFiltro;
        if (desvio) S.otDesvioFiltro = { situacao: '', site_id: site, tipo: '' }; // o desvio do link pode estar em qualquer situação
        else if (!f || f.site_id !== site) S.otDesvioFiltro = { situacao: 'aberto', site_id: site, tipo: '' };
    }
    const detalhe = !!(S.otLote || S.otLevantamento);
    a.innerHTML = '';
    c.innerHTML = `<h2 class="mb-3">${escapeHTML(s.nome)}</h2>${cabecalhoDoSite(sit, site, { gestor: ehGestor(), editar: podeEditarOt(), criar: podeCriarLote(), semPrimario: detalhe })}${renderAbas(MODOS, modo, 'otSiteModo')}${renderAbas(SUBS[modo].map((v) => [v, ROTULO[v]]), sub, 'otSiteSub')}${modo === 'operacao' && sit && !sit.base_aprovada_em ? '<p class="org-dica mb-3">Este site ainda não tem base aprovada: desvios não são calculados.</p>' : ''}<div id="ot-site-painel"><div class="loading"></div></div>`;
    const painel = c.querySelector('#ot-site-painel');
    const o = { siteFixo: site, semPrimario: !detalhe }; // um só primário: o do cartão, ou o da tela de dentro quando há lote ou levantamento aberto
    if (sub === 'levantamento') await montarLevantamento(painel, a, p, o);
    else if (sub === 'aprovacao') await montarRevisao(painel, a, p, o);
    else if (sub === 'base') await montarBase(painel, a, p, o);
    else if (sub === 'inventario') await montarInventario(painel, a, p, o);
    else if (sub === 'desvios') await montarDesvios(painel, a, p, { ...o, destacar: desvio });
    else {
        painel.innerHTML = `<div id="ot-cartoes-slot"></div>${await areaSondas(p, [s])}`;
        await preencherCartoes(p, [s], { soSaude: true });
    }
}

window.otSiteModo = async (modo) => { await esvaziarNotas(); window.otTela('site', S.otSite, SUBS[modo][0]); };
window.otSiteSub = async (sub) => { S.otSub = sub; S.otLote = null; S.otLevantamento = null; await esvaziarNotas(); window.render(); };
