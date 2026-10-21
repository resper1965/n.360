import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, escapeHTML, tituloDaTela } from '../ui.js';
import { podeEditar } from './partes.js';
import { montarLista, colunasDe } from '../lista.js';

// Áreas (n.privacy, Cadastros): os departamentos do projeto (`/projects/:id/departamentos`), que a atividade do RoPA usa no
// Escopo e no Compartilhamento Interno. O servidor aceita nome, descrição e situação (ativo|inativo); nome repetido volta 409.
// Empresa = o nome da empresa do projeto (todas as áreas são dela).

const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const args = (...v) => escapeHTML(JSON.stringify(v));
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');

async function renderAreas(c, h, a) {
    h.textContent = tituloDaTela('nav-areas', 'Áreas');
    const proj = projetoAtivo();
    if (!proj) { a.innerHTML = ''; c.innerHTML = window.renderSemProjeto(); return; }
    const editar = podeEditar();
    a.innerHTML = editar ? `<button class="btn btn-primary" data-action="openNovaAreaModal" data-args='${args(proj.id)}'>+ Nova área</button>` : '';
    let areas;
    try {
        const r = await api('GET', `/api/v1/projects/${proj.id}/departamentos`);
        areas = Array.isArray(r) ? r : [];
    } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar as áreas.', e); return; }
    S.areas = areas;
    const empresa = escapeHTML(proj.client_name || proj.project_name || '—');
    montarLista(c, {
        id: 'areas',
        linhas: areas,
        colunas: colunasDe(editar ? ['Área', 'Empresa', 'Ações'] : ['Área', 'Empresa'], (d) => {
            const ativa = d.status === 'ativo';
            const linha = [
                `<strong>${escapeHTML(d.nome)}</strong>${ativa ? '' : ` ${window.renderStatusBadge('Inativa', 'info')}`}`
                    + (d.descricao ? `<div class="co-campo-rotulo">${escapeHTML(d.descricao)}</div>` : ''),
                empresa,
            ];
            if (editar) linha.push(`<button class="btn btn-ghost btn-sm" data-action="openAreaModal" data-args='${args(proj.id, d.id)}'>Editar</button>
                <button class="btn btn-ghost btn-sm" data-action="mudarSituacaoArea" data-args='${args(proj.id, d.id, ativa ? 'inativo' : 'ativo')}'>${ativa ? 'Inativar' : 'Reativar'}</button>`);
            return linha;
        }),
        vazio: { titulo: 'Nenhuma área cadastrada.',
            dica: 'As áreas da empresa entram na atividade de tratamento do RoPA, no Escopo e no Compartilhamento Interno.' },
    });
}

window.openNovaAreaModal = function (projectId) {
    openModal(`
        <div class="modal-header"><span class="modal-title">Nova área</span></div>
        <div class="form-group"><label class="form-label" for="area-nome">Área</label><input class="form-input" id="area-nome" maxlength="200"></div>
        <div class="form-group"><label class="form-label" for="area-descricao">Descrição da área</label><textarea class="form-input" id="area-descricao" rows="3" maxlength="2000"></textarea></div>
        <button class="btn btn-primary w-full" data-action="criarArea" data-args='${args(projectId)}'>Cadastrar</button>
    `);
};

window.criarArea = async function (projectId) {
    const nome = document.getElementById('area-nome').value.trim();
    const descricao = document.getElementById('area-descricao').value.trim();
    if (!nome) return;
    try {
        await api('POST', `/api/v1/projects/${projectId}/departamentos`, descricao ? { nome, descricao } : { nome });
        window.forceCloseModal();
        window.render();
    } catch (e) { falha(e, 'Não foi possível cadastrar a área'); }
};

window.openAreaModal = function (projectId, id) {
    const d = (S.areas || []).find((x) => x.id === id);
    if (!d) return;
    openModal(`
        <div class="modal-header"><span class="modal-title">Editar área</span></div>
        <div class="form-group"><label class="form-label" for="area-e-nome">Área</label><input class="form-input" id="area-e-nome" maxlength="200" value="${escapeHTML(d.nome)}"></div>
        <div class="form-group"><label class="form-label" for="area-e-descricao">Descrição da área</label><textarea class="form-input" id="area-e-descricao" rows="3" maxlength="2000">${escapeHTML(d.descricao || '')}</textarea></div>
        <button class="btn btn-primary w-full" data-action="salvarArea" data-args='${args(projectId, id)}'>Salvar</button>
    `);
};

window.salvarArea = async function (projectId, id) {
    const nome = document.getElementById('area-e-nome').value.trim();
    const descricao = document.getElementById('area-e-descricao').value.trim();
    if (!nome) return;
    try {
        // Descrição vazia limpa (o servidor grava nulo).
        await api('PUT', `/api/v1/projects/${projectId}/departamentos/${id}`, { nome, descricao: descricao || null });
        window.forceCloseModal();
        window.render();
    } catch (e) { falha(e, 'Não foi possível salvar a área'); }
};

window.mudarSituacaoArea = async function (projectId, id, status) {
    try {
        await api('PUT', `/api/v1/projects/${projectId}/departamentos/${id}`, { status });
        showToast(status === 'inativo' ? 'Área inativada.' : 'Área reativada.', 'success');
        window.render();
    } catch (e) { falha(e, 'Não foi possível mudar a situação da área'); }
};

window.renderAreas = renderAreas;
