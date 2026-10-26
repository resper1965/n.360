import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, forceCloseModal, escapeHTML } from '../ui.js';
import { podeEditar } from './partes.js';

// Parceiros (n.privacy, Cadastros; spec 2026-10-19): as organizações ativas do projeto (partes `tipo = 'organizacao'`), como no
// legado. Busca e ordem por nome na própria tela; "Avaliar como fornecedor" abre a ficha em Fornecedores (toda organização ativa
// já é fornecedor lá). Excluir inativa a parte: os vínculos e o histórico ficam.

const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const chave = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');

let estado = { projeto: null, parceiros: [], desc: false };

window.renderParceiros = async function (c, h, a) {
    h.textContent = 'Parceiros';
    const proj = projetoAtivo();
    if (!proj) { a.innerHTML = ''; c.innerHTML = window.renderSemProjeto(); return; }
    a.innerHTML = podeEditar() ? `<button class="btn btn-primary" data-action="parceiroAbrir" data-args='${args(null)}'>+ Novo parceiro</button>` : '';
    let partes;
    try { partes = await api('GET', `/api/v1/projects/${proj.id}/partes`); } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar os parceiros.', e); return; }
    estado = { projeto: proj.id, parceiros: (Array.isArray(partes) ? partes : []).filter((p) => p.tipo === 'organizacao' && p.status === 'ativa'), desc: false };
    c.innerHTML = `<div class="d-flex flex-wrap items-center gap-3 mb-4">
            <input class="form-input" id="pc-busca" type="search" maxlength="120" placeholder="Buscar pelo nome" aria-label="Buscar pelo nome" data-action-input="parceirosDesenhar">
            <button type="button" class="btn btn-sm" id="pc-ordem" data-action="parceirosOrdem" aria-label="Inverter a ordem por nome">Nome A-Z</button>
        </div><div id="pc-lista"></div>`;
    desenhar();
};

function desenhar() {
    const alvo = el('pc-lista');
    if (!alvo) return;
    const busca = chave(el('pc-busca') ? el('pc-busca').value.trim() : '');
    const ed = podeEditar();
    const empresa = escapeHTML((projetoAtivo() || {}).client_name || '—');
    const itens = estado.parceiros.filter((p) => !busca || chave(p.nome).includes(busca))
        .sort((x, y) => chave(x.nome).localeCompare(chave(y.nome)) * (estado.desc ? -1 : 1));
    alvo.innerHTML = window.renderDataTable(['Parceiro', 'E-mail', 'Empresa', 'Ações'], itens.map((p) => [
        `<strong>${escapeHTML(p.nome)}</strong>`,
        escapeHTML(p.email || '—'),
        empresa,
        `<div class="acoes-linha">${ed ? `<button class="btn btn-ghost btn-sm" data-action="parceiroAbrir" data-args='${args(p.id)}'>Editar</button>
            <button class="btn btn-ghost btn-sm t-perigo" data-action="parceiroExcluir" data-args='${args(p.id)}' aria-label="${escapeHTML(`Excluir ${p.nome}`)}">Excluir</button>` : ''}
            <button class="btn btn-ghost btn-sm" data-action="abrirTerceiro" data-args='${args(estado.projeto, p.id, 'criticidade')}'>Avaliar como fornecedor</button></div>`,
    ]), { emptyState: busca ? 'Nenhum parceiro com essa busca.' : 'Nenhum parceiro cadastrado.',
        emptyHint: busca ? '' : 'Parceiros são as empresas com que o projeto se relaciona; cada um pode ser avaliado como fornecedor.' });
}

window.parceirosDesenhar = desenhar;
window.parceirosOrdem = function () {
    estado.desc = !estado.desc;
    const b = el('pc-ordem');
    if (b) b.textContent = estado.desc ? 'Nome Z-A' : 'Nome A-Z';
    desenhar();
};

window.parceiroAbrir = function (id) {
    const p = id ? estado.parceiros.find((x) => x.id === id) : null;
    if (id && !p) return;
    openModal(`<div class="modal-header"><span class="modal-title">${p ? 'Editar parceiro' : 'Novo parceiro'}</span></div>
        <div class="form-group"><label class="form-label" for="pc-nome">Nome</label><input class="form-input" id="pc-nome" maxlength="200" value="${escapeHTML(p ? p.nome : '')}"></div>
        <div class="form-group"><label class="form-label" for="pc-email">E-mail (opcional)</label><input class="form-input" id="pc-email" type="email" maxlength="320" value="${escapeHTML(p && p.email ? p.email : '')}"></div>
        <div class="acoes-rodape">${p ? '' : '<button type="button" class="btn btn-ghost" data-action="limparModal">Limpar</button>'}<button class="btn btn-primary" data-action="parceiroSalvar" data-args='${args(p ? p.id : null)}'>${p ? 'Salvar' : 'Cadastrar'}</button></div>`);
};

window.parceiroSalvar = async function (id) {
    const nome = el('pc-nome').value.trim();
    if (!nome) { showToast('Informe o nome', 'error'); return; }
    const email = el('pc-email').value.trim() || null;
    try {
        if (id) await api('PUT', `/api/v1/projects/${estado.projeto}/partes/${id}`, { nome, email });
        else await api('POST', `/api/v1/projects/${estado.projeto}/partes`, { tipo: 'organizacao', nome, email });
    } catch (e) { falha(e, 'Não foi possível salvar o parceiro'); return; }
    forceCloseModal();
    showToast(id ? 'Parceiro alterado.' : 'Parceiro cadastrado.', 'success');
    if (typeof window.render === 'function') window.render();
};

window.parceiroExcluir = async function (id) {
    const p = estado.parceiros.find((x) => x.id === id);
    if (!p || !(await window.confirmar(`Excluir ${p.nome}? Ele sai da lista; os vínculos e o histórico ficam.`, { titulo: 'Excluir parceiro', rotulo: 'Excluir', perigo: true }))) return;
    try { await api('PUT', `/api/v1/projects/${estado.projeto}/partes/${id}`, { status: 'inativa' }); }
    catch (e) { falha(e, 'Não foi possível excluir o parceiro'); return; }
    showToast('Parceiro excluído.', 'success');
    if (typeof window.render === 'function') window.render();
};
