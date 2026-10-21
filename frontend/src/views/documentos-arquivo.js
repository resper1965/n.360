import { S } from '../state.js';
import { api, baixarArquivo, cabecalhosAuth, API_BASE } from '../api.js';
import { showToast, openModal, escapeHTML, formatarData, confirmar } from '../ui.js';
import { rotuloDe } from '../rotulos.js';

// Documentos (n.privacy; spec 2026-10-19, frente B): os documentos do legado, um arquivo (PDF/DOC/DOCX até 10 MB) com tipo,
// situação, vencimento e responsável, em `/projects/:id/documentos-arquivo`. Não são os documentos versionados (políticas).
// A lista é carregada uma vez e os filtros a refazem na tela. Texto do servidor sempre escapado.

export const TIPOS = [['politica', 'Política'], ['norma', 'Norma'], ['procedimento', 'Procedimento'], ['termo', 'Termo'], ['contrato', 'Contrato'],
    ['aditivo', 'Aditivo'], ['relatorio', 'Relatório'], ['outro', 'Outro']];
export const SITUACOES = ['rascunho', 'publicado', 'obsoleto'].map((v) => [v, rotuloDe('', v)]);
const ROTULO_TIPO = Object.fromEntries(TIPOS);
const ROTULO_SITUACAO = Object.fromEntries(SITUACOES);
const COR_SITUACAO = { rascunho: 'info', publicado: 'success', obsoleto: 'neutral' };
const EXTENSOES = ['pdf', 'doc', 'docx'];
const MAX_ARQUIVO = 10 * 1024 * 1024;

const podeEditar = () => !!S.user && ['platform_admin', 'consultant', 'consultor', 'consultoria_admin', 'org_admin'].includes(S.user.role);
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const opcoes = (pares, atual) => pares.map(([v, r]) => `<option value="${escapeHTML(v)}"${v === atual ? ' selected' : ''}>${escapeHTML(r)}</option>`).join('');
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let lista = null; // { projeto, docs }

async function renderDocumentosArquivo(c, h, a) {
    h.textContent = 'Documentos';
    lista = null;
    const proj = projetoAtivo();
    if (!proj) { a.innerHTML = ''; c.innerHTML = window.renderSemProjeto(); return; }
    a.innerHTML = podeEditar() ? `<button class="btn btn-primary" data-action="daAbrir" data-args='${args(null)}'>+ Novo documento</button>` : '';
    let docs;
    try {
        const r = await api('GET', `/api/v1/projects/${proj.id}/documentos-arquivo`);
        docs = Array.isArray(r) ? r : [];
    } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar os documentos.', e); return; }
    lista = { projeto: proj.id, docs };
    c.innerHTML = `<div class="co-controles">
            <label class="co-campo"><span class="co-campo-rotulo">Buscar</span>
                <input class="form-input" id="da-busca" type="search" maxlength="120" placeholder="Nome do documento" data-action-input="daFiltrar"></label>
            <label class="co-campo"><span class="co-campo-rotulo">Tipo</span>
                <select class="form-select" id="da-filtro-tipo" data-action-change="daFiltrar"><option value="">Todos</option>${opcoes(TIPOS)}</select></label>
            <label class="co-campo"><span class="co-campo-rotulo">Status</span>
                <select class="form-select" id="da-filtro-status" data-action-change="daFiltrar"><option value="">Todos</option>${opcoes(SITUACOES)}</select></label>
        </div><div id="da-lista"></div>`;
    desenhar();
}

const vencimentoDe = (d) => (d.sem_vencimento ? 'Sem vencimento' : formatarData(d.vencimento));

function desenhar() {
    const alvo = el('da-lista');
    if (!lista || !alvo) return;
    const busca = semAcento(el('da-busca').value.trim());
    const tipo = el('da-filtro-tipo').value;
    const status = el('da-filtro-status').value;
    const itens = lista.docs.filter((d) => (!busca || semAcento(d.nome).includes(busca)) && (!tipo || d.tipo === tipo) && (!status || d.status === status));
    const editar = podeEditar();
    alvo.innerHTML = window.renderDataTable(['Nome', 'Tipo', 'Vencimento', 'Status', 'Ações'], itens.map((d) => [
        `<strong>${escapeHTML(d.nome)}</strong>`,
        escapeHTML(ROTULO_TIPO[d.tipo] || d.tipo),
        escapeHTML(vencimentoDe(d)),
        window.renderStatusBadge(ROTULO_SITUACAO[d.status] || d.status, COR_SITUACAO[d.status] || 'info'),
        [editar ? `<button class="btn btn-ghost btn-sm" data-action="daAbrir" data-args='${args(d.id)}' aria-label="Editar: ${escapeHTML(d.nome)}">Editar</button>` : '',
            d.arquivo_nome ? `<button class="btn btn-ghost btn-sm" data-action="daBaixar" data-args='${args(d.id)}' aria-label="Baixar o arquivo de ${escapeHTML(d.nome)}">Baixar</button>` : ''].join(''),
    ]), lista.docs.length
        ? { emptyState: 'Nenhum documento com estes filtros.', emptyHint: 'Limpe a busca e os filtros para ver todos.' }
        : { emptyState: 'Nenhum documento cadastrado.', emptyHint: 'Cadastre contratos, termos, políticas e relatórios com o arquivo e o vencimento.' });
}
window.daFiltrar = desenhar;

// ─── Modal "Documento" ───
let modal = null; // { id, doc }

window.daAbrir = async function (id) {
    if (!lista) return;
    const d = id ? lista.docs.find((x) => x.id === id) : null;
    if (id && !d) return;
    let pessoas = [];
    try {
        const r = await api('GET', `/api/v1/projects/${lista.projeto}/partes?tipo=pessoa&status=ativa`);
        pessoas = Array.isArray(r) ? r : [];
    } catch (e) { /* sem a lista de pessoas o documento ainda se grava sem responsável */ }
    modal = { id: d ? d.id : null, doc: d };
    const resp = d ? d.responsavel_parte_id : '';
    // O responsável atual entra na lista mesmo se a pessoa foi inativada.
    if (resp && !pessoas.some((p) => p.id === resp)) pessoas.unshift({ id: resp, nome: d.responsavel_nome || 'Responsável atual' });
    openModal(`
        <div class="modal-header"><span class="modal-title">Documento</span></div>
        <div class="form-group"><label class="form-label" for="da-nome">Nome *</label>
            <input class="form-input" id="da-nome" maxlength="300" value="${escapeHTML(d ? d.nome : '')}"></div>
        <div class="form-group"><label class="form-label" for="da-tipo">Tipo *</label>
            <select class="form-select" id="da-tipo"><option value="">Selecione</option>${opcoes(TIPOS, d ? d.tipo : '')}</select></div>
        <div class="form-group"><label class="form-label" for="da-status">Status *</label>
            <select class="form-select" id="da-status">${opcoes(SITUACOES, d ? d.status : 'rascunho')}</select></div>
        <div class="form-group"><label class="form-label" for="da-vencimento">Vencimento</label>
            <input class="form-input" id="da-vencimento" type="date" value="${escapeHTML(d && d.vencimento ? String(d.vencimento).slice(0, 10) : '')}"${d && d.sem_vencimento ? ' disabled' : ''}>
            <label class="opcao-check mt-2"><input type="checkbox" id="da-sem-vencimento" data-action-change="daSemVencimento"${d && d.sem_vencimento ? ' checked' : ''}> Sem vencimento</label></div>
        <div class="form-group"><label class="form-label" for="da-responsavel">Responsável</label>
            <select class="form-select" id="da-responsavel"><option value="">Sem responsável</option>${opcoes(pessoas.map((p) => [p.id, p.nome]), resp)}</select></div>
        <div class="form-group"><span class="form-label">Arquivo</span>
            <div id="da-arquivo-atual">${arquivoAtual()}</div>
            <label class="sr-only" for="da-arquivo">Enviar arquivo</label>
            <input class="form-input mt-2" id="da-arquivo" type="file" accept=".pdf,.doc,.docx">
            <div class="co-campo-rotulo">PDF, DOC ou DOCX, até 10 MB.${d && d.arquivo_nome ? ' Enviar outro substitui o atual.' : ''}</div>
            <div class="re-erro" id="da-erro" role="alert"></div></div>
        <div class="d-flex gap-2">
            <button class="btn btn-primary" data-action="daSalvar">Salvar</button>
            ${d ? `<button class="btn btn-ghost" data-action="daExcluir">Excluir</button>` : ''}
        </div>
    `);
};

function arquivoAtual() {
    const d = modal && modal.doc;
    if (!d || !d.arquivo_nome) return '<span class="co-campo-rotulo">Nenhum arquivo enviado.</span>';
    return `<div class="d-flex flex-wrap items-center gap-2"><span>${escapeHTML(d.arquivo_nome)}</span>
        <button class="btn btn-ghost btn-sm" data-action="daVer" data-args='${args(d.id)}'>Ver</button>
        <button class="btn btn-ghost btn-sm" data-action="daBaixar" data-args='${args(d.id)}'>Baixar</button>
        <button class="btn btn-ghost btn-sm" data-action="daRemoverArquivo">Remover</button></div>`;
}

window.daSemVencimento = function () {
    const sem = el('da-sem-vencimento').checked;
    const data = el('da-vencimento');
    data.disabled = sem;
    if (sem) data.value = '';
};

/** O arquivo escolhido, conferido antes de enviar (o servidor confere de novo, pelo conteúdo); null sem arquivo, false se recusado. */
function arquivoEscolhido() {
    const f = el('da-arquivo') && el('da-arquivo').files[0];
    if (!f) return null;
    if (!EXTENSOES.includes(f.name.toLowerCase().split('.').pop())) { el('da-erro').textContent = 'Envie um arquivo PDF, DOC ou DOCX.'; return false; }
    if (f.size > MAX_ARQUIVO) { el('da-erro').textContent = 'O arquivo passa de 10 MB.'; return false; }
    return f;
}

async function enviarArquivo(projeto, id, f) {
    const fd = new FormData();
    fd.append('file', f);
    const r = await fetch(`${API_BASE}/api/v1/projects/${projeto}/documentos-arquivo/${id}/arquivo`, { method: 'POST', headers: cabecalhosAuth(), body: fd });
    if (!r.ok) {
        const corpo = await r.json().catch(() => ({}));
        throw new Error(corpo.error || 'Não foi possível enviar o arquivo.');
    }
}

window.daSalvar = async function () {
    if (!lista || !modal) return;
    el('da-erro').textContent = '';
    const nome = el('da-nome').value.trim();
    const tipo = el('da-tipo').value;
    const status = el('da-status').value;
    if (!nome || !tipo || !status) { el('da-erro').textContent = 'Preencha Nome, Tipo e Status.'; return; }
    const arquivo = arquivoEscolhido();
    if (arquivo === false) return;
    const sem = el('da-sem-vencimento').checked;
    const corpo = { nome, tipo, status, sem_vencimento: sem, vencimento: sem ? null : el('da-vencimento').value || null,
        responsavel_parte_id: el('da-responsavel').value || null };
    let id = modal.id;
    try {
        if (id) await api('PUT', `/api/v1/projects/${lista.projeto}/documentos-arquivo/${id}`, corpo);
        else id = (await api('POST', `/api/v1/projects/${lista.projeto}/documentos-arquivo`, corpo)).id;
    } catch (e) { el('da-erro').textContent = (e && e.message) || 'Não foi possível salvar o documento.'; return; }
    if (arquivo) {
        try { await enviarArquivo(lista.projeto, id, arquivo); } catch (e) {
            // O documento ficou gravado: reabre na edição para tentar o arquivo de novo.
            showToast(`Documento salvo, mas o arquivo não foi enviado: ${e.message}`, 'error');
            window.forceCloseModal();
            window.render();
            return;
        }
    }
    showToast('Documento salvo.', 'success');
    window.forceCloseModal();
    window.render();
};

window.daExcluir = async function () {
    if (!lista || !modal || !modal.id) return;
    if (!(await confirmar(`Excluir o documento ${modal.doc.nome}? O arquivo também é apagado.`, { titulo: 'Excluir documento', rotulo: 'Excluir', perigo: true }))) return;
    try {
        await api('DELETE', `/api/v1/projects/${lista.projeto}/documentos-arquivo/${modal.id}`);
        showToast('Documento excluído.', 'success');
        window.forceCloseModal();
        window.render();
    } catch (e) { falha(e, 'Não foi possível excluir o documento'); }
};

window.daRemoverArquivo = async function () {
    if (!lista || !modal || !modal.doc) return;
    if (!(await confirmar(`Remover o arquivo ${modal.doc.arquivo_nome}?`, { titulo: 'Remover arquivo', rotulo: 'Remover', perigo: true }))) return;
    try {
        await api('DELETE', `/api/v1/projects/${lista.projeto}/documentos-arquivo/${modal.id}/arquivo`);
        modal.doc.arquivo_nome = null;
        el('da-arquivo-atual').innerHTML = arquivoAtual();
        showToast('Arquivo removido.', 'success');
    } catch (e) { falha(e, 'Não foi possível remover o arquivo'); }
};

window.daBaixar = (id) => (lista ? baixarArquivo(`/api/v1/projects/${lista.projeto}/documentos-arquivo/${id}/arquivo`).catch((e) => falha(e, 'Não foi possível baixar o arquivo')) : undefined);

/** Ver: abre o arquivo numa aba nova (o token vai no cabeçalho, nunca na URL; a aba recebe só o blob). */
window.daVer = async function (id) {
    if (!lista) return;
    const aba = window.open('', '_blank');
    try {
        const r = await fetch(`${API_BASE}/api/v1/projects/${lista.projeto}/documentos-arquivo/${id}/arquivo`, { headers: cabecalhosAuth() });
        if (!r.ok) throw new Error('Não foi possível abrir o arquivo.');
        const url = URL.createObjectURL(await r.blob());
        if (aba) aba.location.href = url; else window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
        if (aba) aba.close();
        falha(e, 'Não foi possível abrir o arquivo');
    }
};

window.renderDocumentosArquivo = renderDocumentosArquivo;
