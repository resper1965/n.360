import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, renderEmptyState, renderDataTable, renderStatusBadge, falhaDeCarga, renderAbas, renderMaisAcoes, formatarData } from '../ui.js';
import { podeEditarOt, podeCriarLote, ehGestor, pode, lista, areaDaFase, dataDoSqlite, TIPOS_SITE, CRITICIDADE } from '../ot-comum.js';
import { emDiasSP, diaSP } from '../hoje.js';
import { escreverEndereco } from '../ot-navegacao.js';
import { montarInventario, montarFluxos, montarCadastro, formSite } from './ot.js';
import { montarLevantamento, esvaziarNotas } from './ot-levantamento.js';
import { montarRevisao } from './ot-revisao.js';
import { montarColeta } from './ot-coleta.js';
import { montarDesvios } from './ot-desvios.js';
import { cabecalhoDoSite } from './ot-base.js';
import { areaSondas, preencherCartoes } from './ot-sensores.js';

// n.ot, lista de sites e tela do site (spec 2026-11-11 fluidez §3). A tela do site tem duas áreas (Implantação, Operação), cada uma com suas sub-abas; o recorte
// por site é o `siteFixo` das telas reaproveitadas. Quem navega (window.otTela, endereço) é a casca; aqui só se desenha.

// Implantação e Obra: assistente de 4 etapas, uma por vez (a etapa vem do servidor). Operação: cinco abas, Desvios primeiro (spec 2026-11-26 §5).
export const ABAS_IMPLANTACAO = ['cadastrar', 'levantar', 'revisar', 'base'];
export const ABAS_OPERACAO = ['desvios', 'saude', 'inventario', 'mudancas', 'revalidacao'];
// Salto de dentro de uma tela (levantamento, lote, "Ver no inventário") que pede uma aba da implantação num site em Operação: cai na aba que a contém.
const NA_OPERACAO = { levantar: 'mudancas', revisar: 'mudancas', base: 'inventario' };
const ROTULO = { cadastrar: '1. Cadastrar', levantar: '2. Levantar', revisar: '3. Revisar', base: '4. Aprovar a base', desvios: 'Desvios', saude: 'Saúde da coleta', inventario: 'Inventário', mudancas: 'Mudanças', revalidacao: 'Revalidação' };

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
    o = { ...o, somenteLeitura: true }; // ativo e fluxo só entram por achado e lote
    c.innerHTML = '<div id="ot-base-inv"></div><h3 class="mt-6 mb-3">Fluxos</h3><div id="ot-base-fluxos"></div>';
    const af = document.createElement('div');
    await montarInventario(c.querySelector('#ot-base-inv'), a, p, o);
    await montarFluxos(c.querySelector('#ot-base-fluxos'), af, p, o);
    a.insertAdjacentHTML('beforeend', af.innerHTML);
}

/** As 4 abas do assistente: a etapa atual e as anteriores abrem; as seguintes ficam "ainda não" (aria-disabled). */
function abasDoAssistente(etapa, ativa) {
    return `<div class="abas mb-4" role="tablist">${ABAS_IMPLANTACAO.map((v, i) => (i + 1 > etapa
        ? `<button type="button" role="tab" class="aba" aria-selected="false" aria-disabled="true" tabindex="-1" aria-label="${ROTULO[v]} (ainda não)" title="Ainda não: termine a etapa ${etapa} antes"><span>${ROTULO[v]} (ainda não)</span></button>`
        : `<button type="button" role="tab" class="aba" aria-selected="${v === ativa}" tabindex="${v === ativa ? 0 : -1}" data-action="otSiteAba" data-args='${args(v)}'><span>${ROTULO[v]}</span></button>`)).join('')}</div>`;
}

const dataBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const ANDAMENTO = { recebendo: ['neutral', 'Recebendo'], processando: ['neutral', 'Processando'], gravando: ['neutral', 'Gravando'], erro: ['danger', 'Erro na leitura'], erro_ia: ['danger', 'Erro da IA'] };
const EM_ANDAMENTO = Object.keys(ANDAMENTO);
const SELO_LOTE = { em_revisao: ['warning', 'Em revisão'], concluido: ['success', 'Concluído'], rejeitado: ['danger', 'Recusado'] };

/** Mudanças: os lotes do site criados depois da base aprovada (sem coluna nova), numa só consulta; a recusa some em 7 dias (retenção). */
async function montarMudancas(c, a, p, { site, sit }) {
    let lotes;
    try { lotes = lista(await api('GET', `/api/v1/projects/${p.id}/ot/lotes`), 'lotes'); } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar as mudanças do site.', e); return; }
    const base = sit.base_aprovada_em ? dataDoSqlite(sit.base_aprovada_em).getTime() : Infinity;
    const hoje7 = emDiasSP(-7);
    const doSite = lotes.filter((l) => l.site_id === site && dataDoSqlite(l.created_at).getTime() >= base);
    const bloco = (titulo, status, vazio) => {
        const ls = doSite.filter((l) => (Array.isArray(status) ? status.includes(l.status) : l.status === status)
            && (status !== 'rejeitado' || diaSP(dataDoSqlite(l.created_at).toISOString()) >= hoje7));
        return `<h3 class="mt-6 mb-3">${titulo}</h3>${renderDataTable(['Criado em', 'Itens', 'Situação', 'Ações'], ls.map((l) => [
            escapeHTML(formatarData(l.created_at, { hora: true })), escapeHTML(String(l.itens ?? 0)), renderStatusBadge(...(SELO_LOTE[l.status] ?? ANDAMENTO[l.status] ?? ['neutral', l.status])),
            `<button class="btn btn-sm" data-action="otAbrirLote" data-args='${args(l.id)}' aria-label="${escapeHTML(`Abrir mudança de ${formatarData(l.created_at, { hora: true })}`)}">Abrir</button>`,
        ]), { emptyMessage: vazio })}`;
    };
    c.innerHTML = `<p class="org-header-intro">Em operação, o inventário só muda por uma mudança: um levantamento de visita enviado para aprovação de outra pessoa.</p>
        ${podeCriarLote() ? `<p><button class="btn" data-action="otRegistrarMudanca" data-args='${args(site)}'>Registrar mudança</button></p>` : ''}
        ${bloco('Abertas', 'em_revisao', 'Nenhuma mudança esperando decisão.')}${bloco('Em andamento ou com erro', EM_ANDAMENTO, 'Nenhum lote em andamento ou com erro.')}${bloco('Concluídas', 'concluido', 'Nenhuma mudança concluída desde a base.')}
        ${bloco('Recusadas nos últimos 7 dias', 'rejeitado', 'Nenhuma mudança recusada nos últimos 7 dias.')}
        <p class="org-dica mt-3">A recusa fica registrada na trilha; o lote recusado sai desta lista em 7 dias.</p>
        <h3 class="mt-6 mb-3">Achados em rascunho do site</h3><div id="ot-mud-achados"></div><h3 class="mt-6 mb-3">Levantamentos do site</h3><div id="ot-mud-levs"></div>`;
    const solta = () => document.createElement('div'); // os botões de cabeçalho dessas telas não entram: mudar é só por "Registrar mudança"
    await montarRevisao(c.querySelector('#ot-mud-achados'), solta(), p, { siteFixo: site, semPrimario: true, semLotes: true });
    await montarLevantamento(c.querySelector('#ot-mud-levs'), solta(), p, { siteFixo: site, semPrimario: true });
}

/** Revalidação: a data para todos; a lista de ativos só para quem vê o inventário completo (o técnico e o platform_admin não a pedem). */
async function montarRevalidacao(c, a, p, { site, sit }) {
    // o prazo é o do servidor (ot-fase.ts: menor verificação + 24 meses); a lista usa o mesmo dia (UTC do registro), sem recalcular fuso
    const prazo = sit.revalidar_em ? `Revalidar até ${dataBR(sit.revalidar_em)}` : 'Sem prazo de revalidação: nenhum ativo do ARCiber foi verificado ainda';
    let lista24 = '';
    if (pode('aprovar_lote')) {
        let ativos;
        try { ativos = lista(await api('GET', `/api/v1/projects/${p.id}/ot/ativos?site_id=${encodeURIComponent(site)}`), 'ativos'); } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar os ativos a revalidar.', e); return; }
        const limite = emDiasSP(60);
        const vence = (x) => {
            if (!x.ultima_verificacao_em) return '';
            const d = new Date(`${String(x.ultima_verificacao_em).slice(0, 10)}T00:00:00Z`);
            d.setUTCMonth(d.getUTCMonth() + 24);
            return d.toISOString().slice(0, 10);
        };
        const lin = ativos.filter((x) => x.no_arciber && (!x.ultima_verificacao_em || vence(x) <= limite)).sort((x, y) => (vence(x) || '9').localeCompare(vence(y) || '9'));
        lista24 = `<h3 class="mt-6 mb-3">Ativos do ARCiber a revalidar (vencidos ou a vencer em 60 dias)</h3>${renderDataTable(['Ativo', 'Última verificação', 'Vence em'], lin.map((x) => [
            `<strong>${escapeHTML(x.nome)}</strong>`, escapeHTML(x.ultima_verificacao_em ? dataBR(String(x.ultima_verificacao_em).slice(0, 10)) : 'Nunca verificado'), escapeHTML(vence(x) ? dataBR(vence(x)) : 'Sem verificação: sem prazo'),
        ]), { emptyMessage: 'Nenhum ativo do ARCiber vence nos próximos 60 dias.' })}`;
    }
    c.innerHTML = `<p><strong>${escapeHTML(prazo)}</strong></p>${podeCriarLote() ? `<p><button class="btn" data-action="otNovoLevantamentoDoSite" data-args='${args(site)}'>Nova visita de revalidação</button></p>` : ''}${lista24}`;
}

export async function montarSite(c, a, p, { site, sub, desvio } = {}) {
    let sites;
    let sit = null;
    let erroSit = null;
    try {
        const [rs, rt] = await Promise.allSettled([api('GET', `/api/v1/projects/${p.id}/ot/sites`), api('GET', `/api/v1/projects/${p.id}/ot/sites/${encodeURIComponent(site)}/situacao`)]);
        if (rs.status === 'rejected') throw rs.reason;
        sites = lista(rs.value, 'sites');
        if (rt.status === 'fulfilled') sit = rt.value; else erroSit = rt.reason;
    } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar o site.', e); return; }
    const s = sites.find((x) => x.id === site);
    if (!s) { c.innerHTML = renderEmptyState({ titulo: 'Site não encontrado', texto: 'Este site não existe neste projeto ou o seu acesso a ele não foi concedido.' }); return; }
    if (!sit) { falhaDeCarga(c, a, 'Não foi possível carregar a situação do site.', erroSit); return; } // sem a situação não há área nem etapa: falha fechada
    // Implantação e Obra: o assistente; a aba pedida vale até a etapa atual, senão abre a etapa atual (spec 2026-11-26 §7).
    // Operação: cinco abas; aba fora delas abre Desvios.
    const area = sit.area ?? areaDaFase(sit.fase);
    const assistente = area !== 'operacao';
    const comEtapa = sit.etapa >= 1 && sit.etapa <= 4;
    const etapa = assistente && comEtapa ? sit.etapa : 4;
    // lote ou levantamento pedido vale na aba que o contém, se a etapa permite; senão aviso e o pedido é descartado
    const exigida = S.otLote ? 'revisar' : S.otLevantamento ? 'levantar' : null;
    let aviso = '';
    if (exigida && assistente && ABAS_IMPLANTACAO.indexOf(exigida) >= etapa) {
        aviso = '<p class="org-dica mb-3" role="status">Este item é de uma etapa que ainda não chegou: abrimos a etapa atual.</p>';
        S.otLote = null; S.otLevantamento = null;
    }
    const pedida = (!aviso && exigida) || sub;
    sub = assistente
        ? (ABAS_IMPLANTACAO.includes(pedida) && ABAS_IMPLANTACAO.indexOf(pedida) < etapa ? pedida : ABAS_IMPLANTACAO[comEtapa ? etapa - 1 : 0])
        : (ABAS_OPERACAO.includes(pedida) ? pedida : NA_OPERACAO[pedida] ?? 'desvios');
    const listaLevantamentos = !assistente && pedida === 'levantar'; // "Nova visita de revalidação": a lista de levantamentos abre dentro de Mudanças
    S.otSite = site; S.otSub = sub;
    escreverEndereco({ tela: 'site', site, aba: sub }); // recarregar mantém a aba efetiva
    if (sub === 'desvios') {
        const f = S.otDesvioFiltro;
        if (desvio) S.otDesvioFiltro = { situacao: '', site_id: site, tipo: '' }; // o desvio do link pode estar em qualquer situação
        else if (!f || f.site_id !== site) S.otDesvioFiltro = { situacao: 'aberto', site_id: site, tipo: '' };
    }
    const detalhe = !!(S.otLote || S.otLevantamento);
    a.innerHTML = '';
    c.innerHTML = `<h2 class="mb-3">${escapeHTML(s.nome)}</h2>${cabecalhoDoSite(sit, site, { gestor: ehGestor(), editar: podeEditarOt(), criar: podeCriarLote(), semPrimario: detalhe })}${assistente ? abasDoAssistente(etapa, sub) : renderAbas(ABAS_OPERACAO.map((v) => [v, ROTULO[v]]), sub, 'otSiteAba')}${aviso}${!assistente && !sit.base_aprovada_em ? '<p class="org-dica mb-3">Este site ainda não tem base aprovada: desvios não são calculados.</p>' : ''}<div id="ot-site-painel"><div class="loading"></div></div>`;
    const painel = c.querySelector('#ot-site-painel');
    const o = { siteFixo: site, semPrimario: !detalhe }; // um só primário: o do cartão, ou o da tela de dentro quando há lote ou levantamento aberto
    if (sub === 'cadastrar') await montarCadastro(painel, a, p, o);
    else if (sub === 'levantar') await montarLevantamento(painel, a, p, o);
    else if (sub === 'revisar') await montarRevisao(painel, a, p, o);
    else if (sub === 'base') await montarBase(painel, a, p, o);
    else if (sub === 'inventario') await montarBase(painel, a, p, o); // em Operação o inventário e os fluxos só se leem; mudar é por Mudança
    else if (sub === 'mudancas') {
        if (S.otLote) await montarColeta(painel, a, p, o);
        else if (S.otLevantamento || listaLevantamentos) await montarLevantamento(painel, a, p, o);
        else await montarMudancas(painel, a, p, { site, sit });
    } else if (sub === 'revalidacao') await montarRevalidacao(painel, a, p, { site, sit });
    else if (sub === 'desvios') await montarDesvios(painel, a, p, { ...o, destacar: desvio });
    else {
        painel.innerHTML = `<div id="ot-cartoes-slot"></div>${await areaSondas(p, [s])}`;
        await preencherCartoes(p, [s], { soSaude: true });
    }
}

window.otSiteAba = async (aba) => { S.otSub = aba; S.otLote = null; S.otLevantamento = null; await esvaziarNotas(); window.render(); };
