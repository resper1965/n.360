import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, escapeHTML, formatarData } from '../ui.js';
import { textoRecomendacao } from '../recomendacao-ripd.js';

// Aba Teste de Impacto da ficha da atividade (spec 2026-10-16, seções 7 e 12). Contrato de aba da casca: montar(painel, ctx) com
// ctx = { projectId, ropaId, ficha, editavel, recarregarFicha }; devolve { esvaziar }. Cada resposta grava na hora (PUT /impacto).
// A recomendação de RIPD é a do SERVIDOR (textoRecomendacao): a tela não calcula outra. O que a atividade já sabe (`da_atividade`)
// vem como proposta e nunca é gravado sozinho.

const RESPOSTAS = [['sim', 'Sim'], ['nao', 'Não'], ['nao_sei', 'Não sei agora']];
const ROTULO = Object.fromEntries(RESPOSTAS);

let I = null; // { painel, ctx, imp, dpias }
const el = (id) => document.getElementById(id);
const url = (c, sufixo = '') => `/api/v1/projects/${c.projectId}/ropa/${c.ropaId}${sufixo}`;
const lista = (r, chave) => (Array.isArray(r) ? r : (r && Array.isArray(r[chave]) ? r[chave] : []));
const args = (...v) => escapeHTML(JSON.stringify(v));
async function opcional(fn, padrao) { try { return await fn(); } catch (e) { return padrao; } }

async function carregar() {
    const c = I.ctx;
    const [imp, lig] = await Promise.all([api('GET', url(c, '/impacto')), opcional(() => api('GET', url(c, '/ligacoes')), {})]);
    I.imp = imp;
    I.dpias = lista(lig, 'dpias');
}

function pergunta(q, pode) {
    const idq = `at-imp-${escapeHTML(q.id)}`;
    const proposta = !q.resposta && q.da_atividade;
    const diverge = q.resposta && q.da_atividade && q.resposta !== q.da_atividade;
    return `<fieldset class="at-pergunta" role="radiogroup" aria-labelledby="${idq}-t">
        <p class="at-pergunta-texto" id="${idq}-t">${escapeHTML(q.texto)}</p>
        ${proposta ? `<p class="at-nota">A atividade já indica: ${escapeHTML(ROTULO[q.da_atividade] || q.da_atividade)}. Confirme.
            ${pode ? `<button type="button" class="btn btn-sm" data-action="atImpResponder" data-args='${args(q.id, q.da_atividade)}' aria-label="${escapeHTML(`Confirmar ${ROTULO[q.da_atividade]} na pergunta: ${q.curto || q.id}`)}">Confirmar: ${escapeHTML(ROTULO[q.da_atividade])}</button>` : ''}</p>` : ''}
        ${diverge ? `<p class="at-nota">A atividade registra ${escapeHTML(ROTULO[q.da_atividade] || q.da_atividade)}. Confira a resposta.</p>` : ''}
        <div class="at-opcoes">${RESPOSTAS.map(([v, rot]) => `<label class="re-opcao" for="${idq}-${v}">
            <input type="radio" id="${idq}-${v}" name="${idq}" value="${v}" ${q.resposta === v ? 'checked' : ''} ${pode ? `data-action-change="atImpResponder" data-args='${args(q.id)}' data-arg-val` : 'disabled'}>
            <span class="re-opcao-texto">${rot}</span></label>`).join('')}</div></fieldset>`;
}

function desenhar(foco) {
    const { imp, ctx, dpias } = I;
    const finalizado = !!imp.finalizado_em;
    const pode = ctx.editavel && !finalizado;
    const perguntas = lista(imp, 'perguntas');
    const grupo = (g, titulo) => {
        const qs = perguntas.filter((q) => q.grupo === g);
        return qs.length ? `<fieldset class="at-grupo"><legend class="at-grupo-titulo">${titulo}</legend>${qs.map((q) => pergunta(q, pode)).join('')}</fieldset>` : '';
    };
    const alto = perguntas.find((q) => q.id === 'alto_risco');
    const aberto = dpias[0];
    const respondidas = perguntas.filter((q) => q.resposta).length;
    I.painel.innerHTML = `<div class="at-impacto">
        <div class="at-acoes">
            <button type="button" role="switch" id="at-imp-final" class="btn btn-sm" aria-checked="${finalizado}" ${ctx.editavel ? 'data-action="atImpFinalizar"' : 'disabled'}>Teste de impacto finalizado? ${finalizado ? 'Sim' : 'Não'}</button>
            <span class="t-dim">${finalizado ? `Finalizado em ${escapeHTML(formatarData(imp.finalizado_em))}.` : `${respondidas} de ${perguntas.length} respondidas.`}</span>
            ${finalizado && ctx.editavel ? '<button type="button" class="btn btn-sm" data-action="atImpFinalizar">Reabrir o teste</button>' : ''}</div>
        <p class="re-erro" id="at-imp-erro" role="alert"></p>
        ${alto ? `<fieldset class="at-grupo"><legend class="at-grupo-titulo">A atividade pode gerar alto risco ao titular de dados?</legend>
            <label class="re-opcao" for="at-imp-alto"><input type="checkbox" id="at-imp-alto" ${alto.resposta === 'sim' ? 'checked' : ''} ${pode ? 'data-action-change="atImpAlto" data-arg-el' : 'disabled'}>
                <span class="re-opcao-texto">Sim, há alto risco para o titular.</span></label>
            ${!alto.resposta && alto.da_atividade ? `<p class="at-nota">A atividade já indica: ${escapeHTML(ROTULO[alto.da_atividade])}. Confirme marcando ou desmarcando.</p>` : ''}</fieldset>` : ''}
        ${grupo('geral', 'Critério Geral')}${grupo('especifico', 'Critério Específico')}
        <section class="d-flex flex-col gap-2" aria-labelledby="at-imp-rec-t"><h3 class="at-sub" id="at-imp-rec-t">Recomendação de RIPD</h3>
            <p class="at-recomendacao" id="at-recomendacao" role="status">${escapeHTML(textoRecomendacao(imp))}</p>
            <p class="at-nota">Com ao menos um critério geral e um específico marcados "Sim", o sistema recomenda o RIPD. A decisão de exigir o RIPD continua de uma pessoa.</p>
            <div class="at-acoes">${aberto
                ? `<button type="button" class="btn btn-sm" data-action="atAbrirRipd" data-args='${args(ctx.projectId, aberto.id)}'>Abrir o RIPD</button>`
                : (ctx.editavel ? '<button type="button" class="btn btn-sm" data-action="atImpCriarRipd">Criar o RIPD a partir da atividade</button>' : '')}</div></section>
    </div>`;
    if (foco && el(foco)) el(foco).focus();
}

/** Grava o que veio, relê do servidor (a recomendação é dele) e devolve o foco ao controle de onde a pessoa veio. */
async function gravar(corpo, foco) {
    const erro = el('at-imp-erro');
    if (erro) erro.textContent = '';
    try {
        await api('PUT', url(I.ctx, '/impacto'), corpo);
    } catch (e) {
        const n = el('at-imp-erro');
        if (n) n.textContent = (e && e.message) || 'Não foi possível gravar o teste de impacto.';
        return false;
    }
    try { await carregar(); } catch (e) { showToast((e && e.message) || 'Não foi possível atualizar o teste', 'error'); return false; }
    desenhar(foco);
    if (I.ctx.recarregarFicha) await I.ctx.recarregarFicha();
    return true;
}

// Rádio: a delegação manda (id, valor); o botão "Confirmar" da proposta manda (id, valor) de dois args.
window.atImpResponder = (id, valor) => (I ? gravar({ respostas: { [id]: valor } }, `at-imp-${id}-${valor}`) : undefined);
window.atImpAlto = (caixa) => gravar({ respostas: { alto_risco: caixa.checked ? 'sim' : 'nao' } }, 'at-imp-alto');
window.atImpFinalizar = () => gravar({ respostas: {}, finalizar: !I.imp.finalizado_em }, 'at-imp-final');

// O RIPD nasce da atividade (herda o que já foi informado); 409 = já existia, e a aba passa a mostrar "Abrir o RIPD".
window.atImpCriarRipd = async function () {
    try {
        try { await api('POST', url(I.ctx, '/dpia')); } catch (e) { if (e.status !== 409) throw e; }
        showToast('RIPD criado como rascunho, já com o que a atividade informa.', 'success');
        await carregar();
        desenhar('at-recomendacao');
        if (I.ctx.recarregarFicha) await I.ctx.recarregarFicha();
    } catch (e) { showToast((e && e.message) || 'Não foi possível criar o RIPD', 'error'); }
};

/** O RIPD abre no detalhe dele (onde fica o pedido de aprovação do RIPD), com a lista carregada. */
window.atAbrirRipd = async function (projectId, id) {
    try { S.dpia = lista(await api('GET', `/api/v1/projects/${projectId}/dpia`)); }
    catch (e) { showToast(`Não foi possível abrir o RIPD: ${e.message}`, 'error'); return; }
    window.openDPIADetailsModal(id);
};

export async function montar(painel, ctx) {
    I = { painel, ctx, imp: null, dpias: [] };
    painel.innerHTML = '<p class="at-nota" role="status">Carregando o teste de impacto...</p>';
    try { await carregar(); desenhar(); }
    catch (e) { painel.innerHTML = `<p class="re-erro" role="alert">Não foi possível carregar o teste de impacto. ${escapeHTML((e && e.message) || '')}</p>`; }
    return { esvaziar: () => Promise.resolve() };
}
