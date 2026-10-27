import { S } from '../state.js';
import { api, baixarArquivo, cabecalhosAuth, API_BASE } from '../api.js';
import { showToast, openModal, escapeHTML, formatarData, confirmar, tituloDaTela } from '../ui.js';
import { rotuloDe } from '../rotulos.js';
import { montarLista, colunasDe } from '../lista.js';

// Documentos (n.privacy; spec 2026-10-19, frente B): os documentos do legado, um arquivo (PDF/DOC/DOCX até 10 MB) com tipo,
// situação, vencimento e responsável, em `/projects/:id/documentos-arquivo`. Não são os documentos versionados (políticas).
// A lista é carregada uma vez; busca, filtros e contagem são do componente de lista. Texto do servidor sempre escapado.

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

let lista = null; // { projeto, docs }
const arr = (r) => (Array.isArray(r) ? r : []);

async function renderDocumentosArquivo(c, h, a) {
    h.textContent = tituloDaTela('nav-documentos-arquivo', 'Documentos');
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
    const editar = podeEditar();
    c.innerHTML = '<div id="da-lista"></div>';
    montarLista(el('da-lista'), {
        id: 'da',
        linhas: docs,
        colunas: colunasDe(['Nome', 'Tipo', 'Responsável', 'Vencimento', 'Status', 'Ações'], (d) => [
            `<strong>${escapeHTML(d.nome)}</strong>`,
            escapeHTML(ROTULO_TIPO[d.tipo] || d.tipo),
            escapeHTML(d.responsavel_nome || '—'),
            vencimentoDe(d),
            window.renderStatusBadge(ROTULO_SITUACAO[d.status] || d.status, COR_SITUACAO[d.status] || 'info'),
            [editar ? `<button class="btn btn-ghost btn-sm" data-action="daAbrir" data-args='${args(d.id)}' aria-label="Editar: ${escapeHTML(d.nome)}">Editar</button>` : '',
                d.arquivo_nome ? `<button class="btn btn-ghost btn-sm" data-action="daBaixar" data-args='${args(d.id)}' aria-label="Baixar o arquivo de ${escapeHTML(d.nome)}">Baixar</button>` : ''].join(''),
        ]),
        busca: (d) => d.nome,
        buscaDica: 'Nome do documento',
        filtros: [{ chave: 'tipo', rotulo: 'Tipo', valor: (d) => d.tipo, opcoes: TIPOS }, { chave: 'status', rotulo: 'Status', valor: (d) => d.status, opcoes: SITUACOES }],
        vazio: { titulo: 'Nenhum documento cadastrado.', dica: 'Cadastre contratos, termos, políticas e relatórios com o arquivo e o vencimento.' },
    });
}

const vencimentoDe = (d) => (d.sem_vencimento ? 'Sem vencimento' : formatarData(d.vencimento));

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
    modal = { id: d ? d.id : null, doc: d, requisitos: [], catalogo: [], requisitosOk: true };
    if (d) await carregarRequisitos();
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
        ${d ? `<div class="form-group"><span class="form-label">Requisitos que cobre</span>
            <div id="da-requisitos">${blocoRequisitos()}</div>
            <div class="co-campo-rotulo">Cobre o requisito só com o documento publicado e com arquivo anexado.</div></div>` : ''}
        <div class="d-flex gap-2">
            <button class="btn btn-primary" data-action="daSalvar">Salvar</button>
            ${d ? `<button class="btn btn-ghost" data-action="daExcluir">Excluir</button>` : ''}
        </div>
    `);
};

// Requisitos que o arquivo cobre (0086). Sem a leitura (`requisitosOk`) não há como ligar: o PUT substitui o conjunto inteiro.
async function carregarRequisitos() {
    try { modal.requisitos = arr(await api('GET', `/api/v1/projects/${lista.projeto}/documentos-arquivo/${modal.id}/requisitos`)); } catch (e) { modal.requisitosOk = false; return; }
    if (podeEditar()) { try { modal.catalogo = arr(await api('GET', '/api/v1/requisitos')); } catch (e) { /* sem catálogo, sem seletor */ } }
}

function blocoRequisitos() {
    if (!modal.requisitosOk) return '<span class="co-campo-rotulo">Não foi possível carregar os requisitos.</span>';
    const editar = podeEditar();
    const tags = modal.requisitos.map((r) => `<span class="ctx-tag" title="${escapeHTML(r.titulo)}">${escapeHTML(r.fonte_id)} ${escapeHTML(r.referencia)}${editar
        ? ` <button class="btn btn-ghost btn-sm" data-action="daDesligarRequisito" data-args='${args(r.id)}' aria-label="Desligar ${escapeHTML(r.referencia)}">×</button>` : ''}</span>`).join(' ');
    const livres = modal.catalogo.filter((r) => !modal.requisitos.some((x) => x.id === r.id));
    return `${tags || '<span class="co-campo-rotulo">Nenhum requisito ligado.</span>'}
        ${editar && livres.length ? `<div class="d-flex gap-2 items-center mt-2"><label class="sr-only" for="da-req-add">Ligar requisito</label>
            <select class="form-select" id="da-req-add"><option value="">Ligar requisito…</option>${livres.map((r) => `<option value="${escapeHTML(r.id)}">${escapeHTML(r.fonte_id)} ${escapeHTML(r.referencia)} — ${escapeHTML(r.titulo)}</option>`).join('')}</select>
            <button class="btn btn-sm" data-action="daLigarRequisito">Ligar</button></div>` : ''}`;
}

async function gravarRequisitos(ids) {
    try {
        await api('PUT', `/api/v1/projects/${lista.projeto}/documentos-arquivo/${modal.id}/requisitos`, { requisitos: ids });
        modal.requisitos = arr(await api('GET', `/api/v1/projects/${lista.projeto}/documentos-arquivo/${modal.id}/requisitos`));
        el('da-requisitos').innerHTML = blocoRequisitos();
    } catch (e) { falha(e, 'Não foi possível atualizar os requisitos'); }
}

window.daLigarRequisito = function () {
    const novo = el('da-req-add') && el('da-req-add').value;
    if (!modal || !modal.id || !modal.requisitosOk || !novo) return undefined;
    return gravarRequisitos([...modal.requisitos.map((r) => r.id), novo]);
};

window.daDesligarRequisito = (requisitoId) => (modal && modal.id && modal.requisitosOk ? gravarRequisitos(modal.requisitos.map((r) => r.id).filter((x) => x !== requisitoId)) : undefined);

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
