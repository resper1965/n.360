import { api, baixarArquivo, API_BASE, cabecalhosAuth } from '../api.js';
import { rotuloDe } from '../rotulos.js';
import { showToast, openModal, forceCloseModal, confirmar, escapeHTML, renderEmptyState, formatarData } from '../ui.js';
import { hojeSP } from '../hoje.js';

// Aba Controle de GAPs da ficha da atividade (spec 2026-10-16, seção 7). Contrato de aba da casca: montar(painel, ctx) com
// ctx = { projectId, ropaId, ficha, editavel, recarregarFicha }; devolve { esvaziar }. O gap é uma ação corretiva da atividade
// (corrective_actions): a regra é do servidor (responsável obrigatório, Não Aplicável só sem gaps, anexo conferido pelo conteúdo).
// Padrão lista mais modal do legado: "+ Gaps" abre o modal em três sub-abas (Gap, Plano de Ação, Anexo).

export const STATUS = ['Open', 'In Progress', 'Closed'].map((v) => [v, rotuloDe('', v)]);
const ROTULO_STATUS = Object.fromEntries(STATUS);
/** Prazo antes de hoje (AAAA-MM-DD, dia de São Paulo) e gap não concluído. A lista de gaps do projeto usa a mesma. */
export const emAtraso = (g) => g.status !== 'Closed' && !!g.prazo && String(g.prazo).slice(0, 10) < hojeSP();
const MAX_ANEXO = 5 * 1024 * 1024;
const EXTENSOES = ['pdf', 'doc', 'docx'];
const SUBABAS = [['gap', 'Gap'], ['plano', 'Plano de Ação'], ['anexo', 'Anexo']];

let G = null; // { painel, ctx, dados, partes, m }  (m = estado do modal aberto)
const el = (id) => document.getElementById(id);
const url = (c, sufixo = '') => `/api/v1/projects/${c.projectId}/ropa/${c.ropaId}${sufixo}`;
const lista = (r, chave) => (Array.isArray(r) ? r : (r && Array.isArray(r[chave]) ? r[chave] : []));
const args = (...v) => escapeHTML(JSON.stringify(v));
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');
async function opcional(fn, padrao) { try { return await fn(); } catch (e) { return padrao; } }
const tamanho = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

async function carregar() {
    const c = G.ctx;
    const [dados, partes] = await Promise.all([
        api('GET', url(c, '/gaps')),
        G.partes ? Promise.resolve(G.partes) : opcional(() => api('GET', `/api/v1/projects/${c.projectId}/partes`), []),
    ]);
    G.dados = { gaps: lista(dados, 'gaps'), nao_aplicavel: !!(dados && dados.nao_aplicavel) };
    G.partes = lista(partes, 'partes').filter((p) => p.status !== 'inativa' && (!p.tipo || p.tipo === 'pessoa'));
}

function desenhar() {
    const { gaps, nao_aplicavel: na } = G.dados;
    const ed = G.ctx.editavel;
    const corpo = gaps.length
        ? `<ul class="at-lista">${gaps.map((g) => `<li class="d-flex flex-col gap-1" data-gap="${escapeHTML(g.id)}">
            <span><strong>Gap:</strong> ${escapeHTML(g.gap)}</span>
            <span class="d-flex items-center flex-wrap gap-4"><span><span class="t-dim">Responsável:</span> ${escapeHTML(g.responsavel ? g.responsavel.nome : 'sem responsável')}</span>
                <span><span class="t-dim">Prazo:</span> ${g.prazo ? formatarData(g.prazo) : 'sem prazo'}</span>
                <span><span class="t-dim">Status:</span> ${emAtraso(g) ? window.renderStatusBadge('Em atraso', 'danger') : escapeHTML(ROTULO_STATUS[g.status] || g.status)}</span>
                ${lista(g.anexos).length ? `<span class="t-dim">${lista(g.anexos).length} anexo${lista(g.anexos).length > 1 ? 's' : ''}</span>` : ''}${ed ? `
                <button type="button" class="btn btn-sm" data-action="atGapAbrir" data-args='${args(g.id)}' aria-label="${escapeHTML(`Editar o gap: ${g.gap.slice(0, 80)}`)}">Editar</button>
                <button type="button" class="btn btn-sm btn-ghost t-perigo" data-action="atGapRemover" data-args='${args(g.id)}' aria-label="${escapeHTML(`Remover o gap: ${g.gap.slice(0, 80)}`)}">Remover</button>` : ''}</span></li>`).join('')}</ul>`
        : renderEmptyState({
            titulo: na ? 'Atividade marcada como sem gaps.' : 'Nenhum gap registrado.',
            texto: na ? 'Desmarque Não Aplicável para registrar um gap.' : 'Gap é uma lacuna entre o que a atividade faz e o que a lei ou a norma pede. Registre cada um com o responsável e o plano de ação.',
            acao: ed && !na ? '<button type="button" class="btn btn-sm" data-action="atGapAbrir" data-args=\'[null]\'>+ Gaps</button>' : '', compacto: true });
    G.painel.innerHTML = `<div class="at-impacto"><section aria-labelledby="at-gap-t" class="d-flex flex-col gap-2"><h3 class="at-sub" id="at-gap-t">Gaps da atividade</h3>${corpo}</section>
        <div class="at-acoes justify-between">
            ${ed ? `<label class="opcao-check"><input type="checkbox" id="at-gap-na" ${na ? 'checked' : ''} ${gaps.length ? 'disabled' : ''} data-action-change="atGapNa" data-arg-el aria-describedby="at-gap-na-d"> Não Aplicável</label>
            <span class="t-dim" id="at-gap-na-d">${gaps.length ? 'Há gaps registrados' : 'Marque se a atividade não tem gaps.'}</span>
            <button type="button" class="btn btn-sm" data-action="atGapAbrir" data-args='[null]' ${na ? 'disabled' : ''}>+ Gaps</button>`
        : `<span class="t-dim">${na ? 'Não Aplicável' : ''}</span>`}</div></div>`;
}

async function recarregar() {
    await carregar();
    desenhar();
    if (G.ctx.recarregarFicha) await G.ctx.recarregarFicha();
}

// ─── Não Aplicável e remover ───
window.atGapNa = async function (caixa) {
    const valor = caixa.checked;
    try { await api('PUT', url(G.ctx, '/gaps/nao-aplicavel'), { valor }); await recarregar(); }
    catch (e) { caixa.checked = !valor; falha(e, 'Não foi possível salvar'); }
};

window.atGapRemover = async function (id) {
    const g = G.dados.gaps.find((x) => x.id === id);
    if (!g) return;
    if (!(await confirmar(`Remover este gap${lista(g.anexos).length ? ' e os arquivos anexados' : ''}?`, { titulo: 'Remover gap', rotulo: 'Remover', perigo: true }))) return;
    try { await api('DELETE', url(G.ctx, `/gaps/${id}`)); showToast('Gap removido.', 'success'); await recarregar(); }
    catch (e) { falha(e, 'Não foi possível remover o gap'); }
};

// ─── Modal "Controle de GAPs" ───
const opcoes = (pares, atual) => pares.map(([v, r]) => `<option value="${escapeHTML(v)}" ${v === atual ? 'selected' : ''}>${escapeHTML(r)}</option>`).join('');
const obrigatorio = '<span class="t-aviso">(obrigatório)</span>';

function tabelaAnexos() {
    const { salvos, novos } = G.m;
    const linhas = [
        ...salvos.map((a) => `<tr data-anexo="${escapeHTML(a.id)}"><td>${escapeHTML(a.file_name)} <span class="t-dim">(${tamanho(a.file_size)})</span></td>
            <td class="acoes-linha"><button type="button" class="btn btn-sm" data-action="atGapBaixar" data-args='${args(a.id)}' aria-label="${escapeHTML(`Baixar ${a.file_name}`)}">Baixar</button>
            <button type="button" class="btn btn-sm btn-ghost t-perigo" data-action="atGapAnexoRemover" data-args='${args(a.id)}' aria-label="${escapeHTML(`Remover ${a.file_name}`)}">Remover</button></td></tr>`),
        ...novos.map((n, i) => `<tr data-novo="${i}"><td>${escapeHTML(n.file.name)} <span class="t-dim">(${tamanho(n.file.size)})</span> ${n.erro ? `<span class="t-perigo" role="alert">${escapeHTML(n.erro)}</span>` : '<span class="t-dim">Será enviado ao confirmar.</span>'}</td>
            <td><button type="button" class="btn btn-sm btn-ghost" data-action="atGapNovoRemover" data-args='${args(i)}' aria-label="${escapeHTML(`Tirar ${n.file.name} da lista`)}">Tirar</button></td></tr>`),
    ];
    return linhas.length
        ? `<table class="data-table"><thead><tr><th scope="col">Arquivo</th><th scope="col">Ações</th></tr></thead><tbody>${linhas.join('')}</tbody></table>`
        : '<p class="at-nota">Nenhum arquivo anexado. Anexe o plano, a evidência ou o parecer que sustenta o gap.</p>';
}

function corpoModal(g) {
    const m = G.m;
    const pessoas = G.partes;
    const semPessoa = !pessoas.length;
    return `<h2 class="modal-title" id="at-gap-modal-t">Controle de GAPs</h2>
        <div class="abas" role="tablist" aria-label="Seções do gap">${SUBABAS.map(([id, rotulo]) =>
            `<button type="button" role="tab" class="aba" id="at-gap-sub-${id}" aria-controls="at-gap-p-${id}" aria-selected="${id === m.sub}" tabindex="${id === m.sub ? 0 : -1}"
                data-action="atGapSub" data-args='${args(id)}' data-action-keydown="atGapSubTecla" data-arg-event><span>${rotulo}</span></button>`).join('')}</div>
        <form id="at-gap-form" data-action-submit="atGapConfirmar" data-prevent novalidate class="d-flex flex-col gap-3 mt-3" data-action-input="atGapValida" data-action-change="atGapValida">
            <div role="tabpanel" id="at-gap-p-gap" aria-labelledby="at-gap-sub-gap" ${m.sub === 'gap' ? '' : 'hidden'} class="d-flex flex-col gap-3">
                <div class="form-group"><label class="form-label" for="at-gap-gap">GAP ${obrigatorio}</label><textarea class="form-input" id="at-gap-gap" rows="4" maxlength="4000" required aria-required="true">${escapeHTML(g.gap || '')}</textarea></div>
                <div class="form-group"><label class="form-label" for="at-gap-rec">Recomendação</label><textarea class="form-input" id="at-gap-rec" rows="4" maxlength="4000">${escapeHTML(g.recomendacao || '')}</textarea></div></div>
            <div role="tabpanel" id="at-gap-p-plano" aria-labelledby="at-gap-sub-plano" ${m.sub === 'plano' ? '' : 'hidden'} class="d-flex flex-col gap-3">
                <div class="form-group"><label class="form-label" for="at-gap-plano">Plano de Ação</label><textarea class="form-input" id="at-gap-plano" rows="4" maxlength="4000">${escapeHTML(g.plano_acao || '')}</textarea></div>
                <div class="form-group"><label class="form-label" for="at-gap-resp">Responsável ${obrigatorio}</label>
                    <select class="form-input" id="at-gap-resp" required aria-required="true" ${semPessoa ? 'aria-describedby="at-gap-resp-d"' : ''}><option value="">Selecione uma pessoa</option>${pessoas.map((p) =>
                        `<option value="${escapeHTML(p.id)}" ${g.responsavel && g.responsavel.id === p.id ? 'selected' : ''}>${escapeHTML(p.nome)}</option>`).join('')}</select>
                    ${semPessoa ? '<p class="at-nota" id="at-gap-resp-d">Nenhuma pessoa cadastrada ainda. Cadastre quem responde pelo gap em Pessoas.</p>' : ''}</div>
                <div class="form-group"><label class="form-label" for="at-gap-prazo">Prazo</label><input class="form-input" type="date" id="at-gap-prazo" value="${escapeHTML(g.prazo ? String(g.prazo).slice(0, 10) : '')}"></div>
                <div class="form-group"><label class="form-label" for="at-gap-status">Status ${obrigatorio}</label><select class="form-input" id="at-gap-status" required aria-required="true">${opcoes(STATUS, g.status || 'Open')}</select></div></div>
            <div role="tabpanel" id="at-gap-p-anexo" aria-labelledby="at-gap-sub-anexo" ${m.sub === 'anexo' ? '' : 'hidden'} class="d-flex flex-col gap-3">
                <div id="at-gap-anexos">${tabelaAnexos()}</div>
                <div class="form-group"><label class="form-label" for="at-gap-arquivo">Adicionar arquivo</label>
                    <input class="form-input" type="file" id="at-gap-arquivo" accept=".pdf,.doc,.docx" aria-describedby="at-gap-arquivo-d" data-action-change="atGapEscolheu" data-arg-el>
                    <p class="at-nota" id="at-gap-arquivo-d">PDF ou DOC (máx. 5MB)</p></div>
                <p class="re-erro" id="at-gap-anexo-erro" role="alert"></p></div>
            <p class="re-erro" id="at-gap-erro" role="alert"></p>
            <div class="acoes-rodape"><button type="button" class="btn" data-action="atGapLimpar">Limpar</button>
                <button type="submit" class="btn btn-primary" id="at-gap-confirmar" disabled>Confirmar</button></div></form>`;
}

window.atGapAbrir = function (id) {
    const g = id ? G.dados.gaps.find((x) => x.id === id) : null;
    if (id && !g) return;
    G.m = { editId: id || null, sub: 'gap', salvos: g ? lista(g.anexos).slice() : [], novos: [] };
    openModal(corpoModal(g || {}), 'modal-large');
    window.atGapValida();
};

// Chamada pela delegação do clique com o evento antes (o par clique+teclado compartilha data-arg-event): o id é sempre o último argumento.
window.atGapSub = function (...a) {
    const id = a[a.length - 1];
    G.m.sub = id;
    for (const [s] of SUBABAS) {
        const aba = el(`at-gap-sub-${s}`);
        aba.setAttribute('aria-selected', String(s === id));
        aba.tabIndex = s === id ? 0 : -1;
        el(`at-gap-p-${s}`).hidden = s !== id;
    }
};
window.atGapSubTecla = function (e, id) {
    const i = SUBABAS.findIndex(([s]) => s === id);
    const n = SUBABAS.length;
    const prox = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
    if (prox === undefined) return;
    e.preventDefault();
    window.atGapSub(SUBABAS[prox][0]);
    el(`at-gap-sub-${SUBABAS[prox][0]}`).focus();
};

/** Confirmar só habilita com o mínimo do legado: GAP e Responsável (Status já nasce Pendente). */
window.atGapValida = function () {
    const b = el('at-gap-confirmar');
    if (!b) return;
    b.disabled = !(el('at-gap-gap').value.trim() && el('at-gap-resp').value && el('at-gap-status').value);
};

window.atGapLimpar = async function () {
    const campos = ['at-gap-gap', 'at-gap-rec', 'at-gap-plano', 'at-gap-resp', 'at-gap-prazo'].map(el);
    const temTexto = campos.some((c) => c.value.trim()) || G.m.novos.length;
    if (temTexto && !(await confirmar('Esvaziar o que foi digitado neste gap?', { titulo: 'Limpar', rotulo: 'Limpar', perigo: true }))) return;
    campos.forEach((c) => { c.value = ''; });
    el('at-gap-status').value = 'Open';
    G.m.novos = [];
    el('at-gap-anexos').innerHTML = tabelaAnexos();
    el('at-gap-anexo-erro').textContent = '';
    window.atGapValida();
    el('at-gap-gap').focus();
};

// ─── Anexos: confere tamanho e tipo antes de enviar ───
window.atGapEscolheu = function (input) {
    const erro = el('at-gap-anexo-erro');
    erro.textContent = '';
    for (const f of [...input.files]) {
        const ext = f.name.toLowerCase().split('.').pop();
        if (!EXTENSOES.includes(ext)) { erro.textContent = `Envie um arquivo PDF ou DOC (máx. 5MB): ${f.name}.`; continue; }
        if (f.size > MAX_ANEXO) { erro.textContent = `O arquivo passa de 5 MB (${f.name}).`; continue; }
        G.m.novos.push({ file: f, erro: null });
    }
    input.value = '';
    el('at-gap-anexos').innerHTML = tabelaAnexos();
};
window.atGapNovoRemover = function (i) { G.m.novos.splice(i, 1); el('at-gap-anexos').innerHTML = tabelaAnexos(); };

window.atGapBaixar = (anexoId) => baixarArquivo(url(G.ctx, `/gaps/${G.m.editId}/anexos/${anexoId}`)).catch((e) => falha(e, 'Não foi possível baixar o arquivo'));
window.atGapAnexoRemover = async function (anexoId) {
    const a = G.m.salvos.find((x) => x.id === anexoId);
    if (!a || !(await confirmar(`Remover o arquivo ${a.file_name}?`, { titulo: 'Remover arquivo', rotulo: 'Remover', perigo: true }))) return;
    try {
        await api('DELETE', url(G.ctx, `/gaps/${G.m.editId}/anexos/${anexoId}`));
        G.m.salvos = G.m.salvos.filter((x) => x.id !== anexoId);
        el('at-gap-anexos').innerHTML = tabelaAnexos();
        await recarregar();
    } catch (e) { el('at-gap-anexo-erro').textContent = (e && e.message) || 'Não foi possível remover o arquivo.'; }
};

async function enviarAnexo(gapId, arquivo) {
    const fd = new FormData();
    fd.append('file', arquivo);
    const r = await fetch(`${API_BASE}${url(G.ctx, `/gaps/${gapId}/anexos`)}`, { method: 'POST', headers: cabecalhosAuth(), body: fd });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corpo.error || 'Não foi possível enviar o arquivo.');
    return corpo;
}

// ─── Confirmar: grava o gap e só depois envia os arquivos escolhidos, mostrando o resultado de cada um ───
window.atGapConfirmar = async function () {
    const botao = el('at-gap-confirmar');
    if (!botao || botao.disabled) return;
    const erro = el('at-gap-erro');
    erro.textContent = '';
    botao.disabled = true;
    const vazio = (v) => (v.trim() ? v.trim() : null);
    const corpo = { gap: el('at-gap-gap').value.trim(), recomendacao: vazio(el('at-gap-rec').value), plano_acao: vazio(el('at-gap-plano').value),
        responsavel_parte_id: el('at-gap-resp').value, prazo: el('at-gap-prazo').value || null, status: el('at-gap-status').value };
    let id = G.m.editId;
    try {
        if (id) await api('PUT', url(G.ctx, `/gaps/${id}`), corpo);
        else { const r = await api('POST', url(G.ctx, '/gaps'), corpo); id = r && r.id; G.m.editId = id; }
    } catch (e) { erro.textContent = (e && e.message) || 'Não foi possível salvar o gap.'; window.atGapValida(); return; }
    const falhas = [];
    for (const n of G.m.novos) {
        try { await enviarAnexo(id, n.file); n.ok = true; }
        catch (e) { n.erro = (e && e.message) || 'Não foi possível enviar o arquivo.'; falhas.push(n); }
    }
    G.m.novos = falhas;
    try { await recarregar(); } catch (e) { falha(e, 'Não foi possível atualizar a lista'); }
    if (falhas.length) {
        // O gap já está gravado: o modal fica aberto na aba Anexo, com o motivo de cada arquivo que não subiu.
        const g = G.dados.gaps.find((x) => x.id === id);
        G.m.salvos = g ? lista(g.anexos).slice() : G.m.salvos;
        window.atGapSub('anexo');
        el('at-gap-anexos').innerHTML = tabelaAnexos();
        erro.textContent = `O gap foi salvo, mas ${falhas.length === 1 ? 'um arquivo não foi enviado' : `${falhas.length} arquivos não foram enviados`}. Confira na aba Anexo.`;
        window.atGapValida();
        return;
    }
    showToast('Gap salvo.', 'success');
    forceCloseModal();
};

/**
 * O mesmo modal fora da ficha (Gestão de GAPs do projeto, spec 2026-10-19): carrega os gaps da atividade e abre o do id; ao gravar,
 * `aoMudar` (a lista do projeto se refaz). O painel é um nó solto: a ficha não está na tela.
 */
export async function abrirGapDaAtividade(projectId, ropaId, gapId, aoMudar) {
    G = { painel: document.createElement('div'), ctx: { projectId, ropaId, editavel: true, recarregarFicha: aoMudar }, dados: null, partes: null, m: null };
    await carregar();
    window.atGapAbrir(gapId);
}

export async function montar(painel, ctx) {
    G = { painel, ctx, dados: null, partes: null, m: null };
    painel.innerHTML = '<p class="at-nota" role="status">Carregando os gaps...</p>';
    try { await carregar(); desenhar(); }
    catch (e) { painel.innerHTML = `<p class="re-erro" role="alert">Não foi possível carregar os gaps. ${escapeHTML((e && e.message) || '')}</p>`; }
    return { esvaziar: () => Promise.resolve() };
}
