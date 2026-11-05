import { api } from '../api.js';
import { showToast, openModal, forceCloseModal, confirmar, escapeHTML, renderEmptyState } from '../ui.js';
import { criarAutosave } from '../bancada/autosave.js';
import { formularioLia } from '../views/tratamento-ligacoes.js';

// Aba Base Jurídica da ficha da atividade (spec 2026-10-16, seção 7). Contrato de aba da casca: montar(painel, ctx) com
// ctx = { projectId, ropaId, ficha, editavel, recarregarFicha }. Devolve { esvaziar } para a casca gravar o que está pendente
// antes de trocar de aba. Toda regra é do servidor (PUT /base-juridica substitui cada lista que vier); aqui só se mostra e se chama.
// Todo texto vindo do servidor é escapado. O catálogo de incisos vem de GET /api/v1/requisitos?fonte=lgpd.

// As seis bases do GDPR, as mesmas de src/data/ropa-abas/gdpr.ts (frontend/test/atividade-base.test.js confere a igualdade).
export const BASES_GDPR = [
    ['consentimento', 'Consentimento', 'A obtenção do consentimento do titular para que seus dados pessoais sejam processados. Deve haver uma ação deliberada por parte do titular dos dados para aderir ou dar seu consentimento.'],
    ['contrato', 'Contrato', 'A firmação de um contrato com um indivíduo para o fornecimento de bens ou serviços solicitados por eles. Nesse caso, os dados são processados para cumprir o contrato.'],
    ['interesses_legitimos', 'Interesses legítimos', 'Uma razão genuína e legítima obtida por sua organização para processar os dados cujo objetivo não prejudica os direitos do titular dos dados.'],
    ['interesses_vitais', 'Interesses vitais', 'A necessidade do processamento dos dados para proteger a vida de alguém ou em uma situação de emergência.'],
    ['obrigacao_legal', 'Obrigação legal', 'A necessidade de processamento dos dados para estar em conformidade com a lei.'],
    ['tarefa_publica', 'Tarefa pública', 'A necessidade de executar tarefas de interesse público, geralmente como um órgão governamental, partido político, etc.'],
];

const TIPOS = {
    lgpd: { titulo: 'Base Legal (Dados Pessoais)', pai: 'lgpd:art7', modal: 'Base Legal', explica: 'A base legal é a hipótese do art. 7º da LGPD que autoriza tratar os dados pessoais desta atividade.' },
    art11: { titulo: 'Base Legal (Dados Sensíveis)', pai: 'lgpd:art11', modal: 'Base Legal', explica: 'Dados sensíveis têm hipóteses próprias, no art. 11 da LGPD. Se a atividade não trata dado sensível, marque Não Aplicável.' },
};
const MIN_FINALIDADE = 3;

let E = null; // { painel, ctx, dados, catalogo, lia, autosave }
const el = (id) => document.getElementById(id);
const url = (c, sufixo = '') => `/api/v1/projects/${c.projectId}/ropa/${c.ropaId}${sufixo}`;
const lista = (r, chave) => (Array.isArray(r) ? r : (r && Array.isArray(r[chave]) ? r[chave] : []));
const args = (...v) => escapeHTML(JSON.stringify(v));
const horaBr = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');

async function opcional(fn, padrao) { try { return await fn(); } catch (e) { return padrao; } }

async function carregar() {
    const c = E.ctx;
    const [dados, catalogo] = await Promise.all([
        api('GET', url(c, '/base-juridica')),
        E.catalogo ? Promise.resolve(E.catalogo) : opcional(() => api('GET', '/api/v1/requisitos?fonte=lgpd'), []),
    ]);
    E.dados = dados;
    E.catalogo = lista(catalogo, 'requisitos');
    E.lia = dados.lia_exigida ? ((await opcional(() => api('GET', url(c, '/lia')), { lia: null })).lia ?? null) : null;
}

function linhaInciso(tipo, x, editavel) {
    const nome = `${x.referencia}: ${x.titulo}`;
    const final = x.finalidade_pendente || !x.finalidade
        ? '<span class="t-aviso">Falta a finalidade</span>'
        : `<span class="t-2">Finalidade: ${escapeHTML(x.finalidade)}</span>`;
    return `<li class="d-flex flex-col gap-1" data-requisito="${escapeHTML(x.requisito_id)}">
        <span class="d-flex items-center flex-wrap gap-2"><strong>${escapeHTML(x.referencia)}</strong> <span>${escapeHTML(x.titulo)}</span>${x.principal ? ' <span class="badge">Principal</span>' : ''}</span>
        <span class="d-flex items-center flex-wrap gap-2">${final}${editavel ? `
            <button type="button" class="btn btn-sm" data-action="atBaseFinalidade" data-args='${args(tipo, x.requisito_id)}' aria-label="${escapeHTML(`${x.finalidade_pendente || !x.finalidade ? 'Preencher' : 'Editar'} a finalidade de ${nome}`)}">${x.finalidade_pendente || !x.finalidade ? 'Preencher' : 'Editar finalidade'}</button>
            <button type="button" class="btn btn-sm btn-ghost t-perigo" data-action="atBaseRemover" data-args='${args(tipo, x.requisito_id)}' aria-label="${escapeHTML(`Remover ${nome}`)}">Remover</button>` : ''}</span></li>`;
}

function blocoIncisos(tipo, itens, editavel, bloqueado) {
    const t = TIPOS[tipo];
    const corpo = itens.length
        ? `<ul class="at-lista">${itens.map((x) => linhaInciso(tipo, x, editavel)).join('')}</ul>`
        : renderEmptyState({ titulo: 'Nenhum inciso registrado.', texto: bloqueado ? 'Marcado como Não Aplicável.' : t.explica, compacto: true });
    return corpo + (editavel ? `<div class="at-acoes mt-3"><button type="button" class="btn btn-sm" data-action="atBaseAdicionar" data-args='${args(tipo)}' ${bloqueado ? 'disabled' : ''}>+ Adicionar Inciso</button></div>` : '');
}

function desenhar() {
    const { dados, ctx } = E;
    const ed = ctx.editavel;
    const art11 = dados.art11 || { nao_aplicavel: false, incisos: [] };
    const gdpr = lista(dados.gdpr);
    const texto = dados.legal_basis_texto && !lista(dados.lgpd).length
        ? `<p class="at-nota">Texto anterior: ${escapeHTML(dados.legal_basis_texto)}. Escolha o inciso para substituí-lo.</p>` : '';
    E.painel.innerHTML = `<div class="at-impacto">
        <section aria-labelledby="at-base-previsao-t" class="d-flex flex-col gap-2">
            <h3 class="at-sub" id="at-base-previsao-t">Previsão Legal</h3>
            <div class="form-group"><label class="form-label" for="at-base-previsao">Lei ou norma que ampara o tratamento <span class="t-dim">(opcional)</span></label>
                <input class="form-input" id="at-base-previsao" maxlength="500" value="${escapeHTML(dados.previsao_legal || '')}" ${ed ? 'data-action-input="atBasePrevisao" data-arg-val' : 'disabled'}></div>
            <p class="at-nota" id="at-base-salvo" role="status"></p>
        </section>
        <section aria-labelledby="at-base-lgpd-t" class="d-flex flex-col gap-2"><h3 class="at-sub" id="at-base-lgpd-t">${TIPOS.lgpd.titulo}</h3>${texto}${blocoIncisos('lgpd', lista(dados.lgpd), ed, false)}</section>
        <section aria-labelledby="at-base-art11-t" class="d-flex flex-col gap-2"><h3 class="at-sub" id="at-base-art11-t">${TIPOS.art11.titulo}</h3>
            <label class="opcao-check"><input type="checkbox" id="at-base-art11-na" ${art11.nao_aplicavel ? 'checked' : ''} ${ed ? 'data-action-change="atBaseArt11Na" data-arg-el' : 'disabled'}> Não Aplicável</label>
            ${blocoIncisos('art11', lista(art11.incisos), ed, !!art11.nao_aplicavel)}</section>
        <section aria-labelledby="at-base-gdpr-t" class="d-flex flex-col gap-2"><h3 class="at-sub" id="at-base-gdpr-t">Base Legal GDPR</h3>
            ${dados.base_gdpr_texto_anterior ? `<p class="at-nota">Texto anterior: ${escapeHTML(dados.base_gdpr_texto_anterior)}</p>` : ''}
            ${gdpr.length ? `<ul class="at-lista">${gdpr.map((g) => `<li class="d-flex flex-col gap-1" data-gdpr="${escapeHTML(g.base)}"><strong>${escapeHTML(g.rotulo)}</strong>
                <span class="d-flex items-center flex-wrap gap-2"><span class="t-2">Finalidade: ${escapeHTML(g.finalidade)}</span>${ed ? `
                <button type="button" class="btn btn-sm" data-action="atBaseFinalidade" data-args='${args('gdpr', g.base)}' aria-label="${escapeHTML(`Editar a finalidade de ${g.rotulo}`)}">Editar finalidade</button>
                <button type="button" class="btn btn-sm btn-ghost t-perigo" data-action="atBaseRemover" data-args='${args('gdpr', g.base)}' aria-label="${escapeHTML(`Remover ${g.rotulo}`)}">Remover</button>` : ''}</span></li>`).join('')}</ul>`
        : renderEmptyState({ titulo: 'Nenhuma base do GDPR registrada.', texto: 'Só se aplica quando a atividade trata dados de pessoas na União Europeia.', compacto: true })}
            ${ed ? '<div class="at-acoes mt-3"><button type="button" class="btn btn-sm" data-action="atBaseAdicionar" data-args=\'["gdpr"]\'>+ Base Legal</button></div>' : ''}</section>
        ${dados.lia_exigida ? `<section aria-labelledby="at-base-lia-t" class="d-flex flex-col gap-2"><h3 class="at-sub" id="at-base-lia-t">LIA (teste de legítimo interesse)</h3>
            <p class="at-nota">A base é legítimo interesse: a LIA é exigida.</p><div class="at-acoes"><button type="button" class="btn btn-sm" data-action="abrirLia" data-args='${args(ctx.projectId, ctx.ropaId)}'>${E.lia ? 'Abrir a LIA com as 12 perguntas' : 'Responder às 12 perguntas da LIA'}</button></div>${ed ? formularioLia(E.lia, ctx.projectId, ctx.ropaId, false) : `<p class="at-nota">${escapeHTML((E.lia && E.lia.finalidade_legitima) || 'LIA ainda não preenchida.')}</p>`}</section>` : ''}
    </div>`;
}

async function recarregar() {
    await carregar();
    desenhar();
    if (E.ctx.recarregarFicha) await E.ctx.recarregarFicha();
}

// Só vai o que muda: as outras listas ficam como estão no servidor (o corpo estrito aceita cada chave sozinha).
async function gravar(troca, ok) {
    await api('PUT', url(E.ctx, '/base-juridica'), troca);
    if (ok) showToast(ok, 'success');
    await recarregar();
}

// ─── Previsão legal: autosave ───
function criarAutosaveDaPrevisao(ctx) {
    const aoMudar = (s) => {
        const n = el('at-base-salvo');
        if (!n) return;
        n.textContent = s.situacao === 'salvando' ? 'Salvando...' : s.situacao === 'salvo' ? `Salvo às ${horaBr(s.salvoEm)}` : s.situacao === 'repetindo' ? 'Tentando salvar de novo...' : s.mensagem || 'Não foi possível salvar.';
    };
    return criarAutosave({
        salvar: async (lote) => { await api('PUT', url(ctx, '/base-juridica'), { previsao_legal: lote.previsao_legal || null }); return { salvo_em: new Date().toISOString() }; },
        aoMudar,
    });
}
window.atBasePrevisao = (valor) => { if (E) E.autosave.agendar('previsao_legal', valor); };

// ─── Não Aplicável do art. 11 ───
window.atBaseArt11Na = async function (caixa) {
    const marcar = caixa.checked;
    const incisos = lista(E.dados.art11 && E.dados.art11.incisos);
    try {
        if (marcar && incisos.length && !(await confirmar(`Os ${incisos.length} incisos do art. 11 já registrados serão removidos. Continuar?`, { titulo: 'Marcar como Não Aplicável', rotulo: 'Remover e marcar', perigo: true }))) {
            caixa.checked = false;
            return;
        }
        await gravar({ art11: { nao_aplicavel: marcar, incisos: marcar ? [] : incisos.map((x) => ({ requisito_id: x.requisito_id, finalidade: x.finalidade || '' })) } });
    } catch (e) { caixa.checked = !marcar; falha(e, 'Não foi possível salvar'); }
};

// ─── Remover ───
function pendentes(tipo, exceto) {
    const itens = tipo === 'art11' ? lista(E.dados.art11 && E.dados.art11.incisos) : lista(E.dados[tipo]);
    return itens.filter((x) => (x.finalidade_pendente || !x.finalidade) && x.requisito_id !== exceto);
}
function itensDe(tipo) { return tipo === 'art11' ? lista(E.dados.art11 && E.dados.art11.incisos) : lista(E.dados[tipo]); }
const paraEnvio = (xs) => xs.map((x) => (x.base ? { base: x.base, finalidade: x.finalidade } : { requisito_id: x.requisito_id, finalidade: x.finalidade || '' }));
function troca(tipo, itens) {
    return tipo === 'art11' ? { art11: { nao_aplicavel: false, incisos: paraEnvio(itens) } } : { [tipo]: paraEnvio(itens) };
}

window.atBaseRemover = async function (tipo, id) {
    const itens = itensDe(tipo);
    const alvo = itens.find((x) => (x.base || x.requisito_id) === id);
    if (!alvo) return;
    const nome = alvo.referencia ? `${alvo.referencia}: ${alvo.titulo}` : alvo.rotulo;
    if (!(await confirmar(`Remover ${nome} desta atividade?`, { titulo: 'Remover', rotulo: 'Remover', perigo: true }))) return;
    const resto = itens.filter((x) => (x.base || x.requisito_id) !== id);
    const semFinalidade = resto.filter((x) => !x.finalidade);
    try {
        // O servidor recusa lista com finalidade vazia: as pendentes não vão, e a pessoa as preenche depois (a F3 as marcou).
        if (semFinalidade.length) throw new Error('Preencha a finalidade dos outros incisos antes de remover este.');
        await gravar(troca(tipo, resto), 'Inciso removido.');
    } catch (e) { falha(e, 'Não foi possível remover'); }
};

// ─── Modal de escolha (inciso do art. 7º ou 11, e as bases do GDPR) ───
function opcoesDoTipo(tipo) {
    if (tipo === 'gdpr') return BASES_GDPR.map(([id, rotulo, texto]) => ({ id, rotulo, texto }));
    const pai = TIPOS[tipo].pai;
    return E.catalogo.filter((x) => x.pai_id === pai).map((x) => ({ id: x.id, rotulo: `${x.referencia}`, texto: x.titulo }));
}
const idDe = (x) => x.base || x.requisito_id;

window.atBaseAdicionar = function (tipo) {
    const usados = new Set(itensDe(tipo).map(idDe));
    const opcoes = opcoesDoTipo(tipo);
    const falta = pendentes(tipo, null);
    const titulo = tipo === 'gdpr' ? 'Base Legal GDPR' : TIPOS[tipo].modal;
    const rotuloLista = tipo === 'gdpr' ? 'Base Legal GDPR' : TIPOS[tipo].titulo;
    const lisa = opcoes.length ? `<fieldset class="at-grupo"><legend class="at-grupo-titulo">${escapeHTML(rotuloLista)}</legend>${opcoes.map((o) => {
        const usado = usados.has(o.id);
        const id = `at-base-op-${o.id.replace(/[^a-z0-9]/gi, '-')}`;
        return `<label class="re-opcao" for="${id}"><input type="checkbox" id="${id}" value="${escapeHTML(o.id)}" data-nome="${escapeHTML(`${o.rotulo}${tipo === 'gdpr' ? '' : `: ${o.texto}`}`)}"
            ${usado ? 'checked disabled aria-disabled="true"' : 'data-action-change="atBaseMarcou"'}>
            <span class="re-opcao-texto${usado ? ' t-faint' : ''}"><strong>${escapeHTML(o.rotulo)}</strong>${tipo === 'gdpr' ? '' : ` ${escapeHTML(o.texto)}`}${tipo === 'gdpr' ? `<br>${escapeHTML(o.texto)}` : ''}${usado ? ' (já usado)' : ''}</span></label>`;
    }).join('')}</fieldset>`
        : renderEmptyState({ titulo: 'O catálogo de incisos não foi carregado.', texto: 'Feche e tente de novo; se continuar, avise o suporte da ness.', compacto: true });
    openModal(`<h2 class="modal-title" id="at-base-modal-t">${escapeHTML(titulo)}</h2>
        <form id="at-base-form" data-action-submit="atBaseGravar" data-args='${args(tipo)}' data-prevent novalidate class="d-flex flex-col gap-3">
            ${falta.length ? `<p class="at-nota t-aviso" role="status">Antes de adicionar, preencha a finalidade de: ${escapeHTML(falta.map((x) => x.referencia || x.rotulo).join(', '))}.</p>` : ''}
            ${lisa}
            <div id="at-base-finalidades" class="d-flex flex-col gap-3" data-action-input="atBaseValida"></div>
            <p class="re-erro" id="at-base-erro" role="alert"></p>
            <div class="acoes-rodape"><button type="button" class="btn" data-action="forceCloseModal">Fechar</button>
                <button type="submit" class="btn btn-primary" id="at-base-gravar" data-pendentes="${falta.length}" disabled>${tipo === 'gdpr' ? 'Confirmar' : 'Gravar'}</button></div></form>`);
};

/** A finalidade da atividade (aba Escopo) é a sugestão inicial de cada base: a pessoa ajusta, nada é gravado sem o Gravar. */
const finalidadeDaAtividade = () => String((E && E.ctx.ficha && E.ctx.ficha.registro && E.ctx.ficha.registro.finalidade) || '').trim();

/** Uma "Finalidade" obrigatória por inciso marcado; o que já foi digitado fica, e o campo novo já vem com a finalidade da atividade. */
window.atBaseMarcou = function () {
    const area = el('at-base-finalidades');
    const antes = Object.fromEntries([...area.querySelectorAll('textarea')].map((t) => [t.dataset.para, t.value]));
    const marcados = [...document.querySelectorAll('#at-base-form input[type="checkbox"]:checked:not(:disabled)')];
    area.innerHTML = marcados.map((i, n) => {
        const id = `at-base-fin-${n}`;
        return `<div class="form-group"><label class="form-label" for="${id}">Finalidade: ${escapeHTML(i.dataset.nome)} <span class="t-aviso">(obrigatório)</span></label>
            <textarea class="form-input" id="${id}" rows="2" maxlength="2000" data-para="${escapeHTML(i.value)}" required aria-required="true">${escapeHTML(i.value in antes ? antes[i.value] : finalidadeDaAtividade())}</textarea></div>`;
    }).join('');
    window.atBaseValida();
};

window.atBaseValida = function () {
    const botao = el('at-base-gravar');
    if (!botao) return;
    const campos = [...document.querySelectorAll('#at-base-finalidades textarea')];
    const unico = el('at-base-fin-unica');
    const ok = Number(botao.dataset.pendentes || 0) === 0
        && (unico ? unico.value.trim().length >= MIN_FINALIDADE : campos.length > 0 && campos.every((t) => t.value.trim().length >= MIN_FINALIDADE));
    botao.disabled = !ok;
};

window.atBaseGravar = async function (tipo) {
    const unico = el('at-base-fin-unica');
    const erro = el('at-base-erro');
    try {
        if (unico) { // editar a finalidade de um inciso já registrado
            const id = unico.dataset.para;
            const itens = itensDe(tipo).map((x) => (idDe(x) === id ? { ...x, finalidade: unico.value.trim() } : x));
            await gravar(troca(tipo, itens), 'Finalidade salva.');
        } else {
            const novos = [...document.querySelectorAll('#at-base-finalidades textarea')].map((t) => (tipo === 'gdpr'
                ? { base: t.dataset.para, finalidade: t.value.trim() } : { requisito_id: t.dataset.para, finalidade: t.value.trim() }));
            await gravar(troca(tipo, [...itensDe(tipo), ...novos]), tipo === 'gdpr' ? 'Base registrada.' : 'Inciso registrado.');
        }
        forceCloseModal();
    } catch (err) { if (erro) erro.textContent = (err && err.message) || 'Não foi possível salvar.'; }
};

// Finalidade de um inciso já registrado (inclusive o "Preencher" das linhas que a F3 deixou sem finalidade).
window.atBaseFinalidade = function (tipo, id) {
    const x = itensDe(tipo).find((i) => idDe(i) === id);
    if (!x) return;
    const nome = x.referencia ? `${x.referencia}: ${x.titulo}` : x.rotulo;
    const falta = pendentes(tipo, id);
    openModal(`<h2 class="modal-title" id="at-base-modal-t">Finalidade</h2>
        <form id="at-base-form" data-action-submit="atBaseGravar" data-args='${args(tipo)}' data-prevent novalidate class="d-flex flex-col gap-3">
            <p class="at-nota">${escapeHTML(nome)}</p>
            ${falta.length ? `<p class="at-nota t-aviso" role="status">Antes, preencha a finalidade de: ${escapeHTML(falta.map((p) => p.referencia || p.rotulo).join(', '))}.</p>` : ''}
            <div class="form-group"><label class="form-label" for="at-base-fin-unica">Finalidade <span class="t-aviso">(obrigatório)</span></label>
                <textarea class="form-input" id="at-base-fin-unica" rows="3" maxlength="2000" data-para="${escapeHTML(id)}" data-action-input="atBaseValida" required aria-required="true" autofocus>${escapeHTML(x.finalidade || finalidadeDaAtividade())}</textarea></div>
            <p class="re-erro" id="at-base-erro" role="alert"></p>
            <div class="acoes-rodape"><button type="button" class="btn" data-action="forceCloseModal">Fechar</button>
                <button type="submit" class="btn btn-primary" id="at-base-gravar" data-pendentes="0">Gravar</button></div></form>`);
    window.atBaseValida();
};

export async function montar(painel, ctx) {
    E = { painel, ctx, dados: null, catalogo: null, lia: null, autosave: criarAutosaveDaPrevisao(ctx) };
    painel.innerHTML = '<p class="at-nota" role="status">Carregando a base jurídica...</p>';
    try {
        await carregar();
        desenhar();
    } catch (e) {
        painel.innerHTML = `<p class="re-erro" role="alert">Não foi possível carregar a base jurídica. ${escapeHTML((e && e.message) || '')}</p>`;
    }
    // Guiado: a pergunta do art. 11 vai à seção dele (primeiro campo: Não Aplicável).
    const focar = (campo) => {
        const alvo = campo === 'art11' && painel.querySelector('#at-base-art11-na');
        if (alvo) alvo.focus();
        return !!alvo;
    };
    return { esvaziar: () => (E && E.autosave ? E.autosave.esvaziar() : Promise.resolve()), focar };
}
