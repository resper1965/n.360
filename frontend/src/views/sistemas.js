import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, escapeHTML, tituloDaTela } from '../ui.js';
import { podeEditar } from './partes.js';

// Sistemas (n.privacy, Cadastros): os ativos do projeto (`/projects/:id/assets`), os mesmos do inventário do n.iso, numa lista
// leve: nome, tipo (a `category` do ativo), responsável e local de armazenamento. Classificação, criticidade e notas de
// confidencialidade, integridade e disponibilidade ficam no inventário do n.iso, que é quem as avalia.

const TIPOS = { Software: 'Software', Informacao: 'Informação', Hardware: 'Hardware' };
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const args = (...v) => escapeHTML(JSON.stringify(v));
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');
const rotuloDoTipo = (t) => TIPOS[t] || t || '—';

async function renderSistemas(c, h, a) {
    h.textContent = tituloDaTela('nav-sistemas', 'Sistemas');
    const proj = projetoAtivo();
    if (!proj) { a.innerHTML = ''; c.innerHTML = window.renderSemProjeto(); return; }
    const editar = podeEditar();
    a.innerHTML = editar ? `<button class="btn btn-primary" data-action="openNovoSistemaModal" data-args='${args(proj.id)}'>+ Novo sistema</button>` : '';
    let sistemas;
    try {
        const r = await api('GET', `/api/v1/projects/${proj.id}/assets`);
        sistemas = Array.isArray(r) ? r : (r && Array.isArray(r.assets) ? r.assets : []);
    } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar os sistemas.', e); return; }
    S.sistemas = sistemas;
    c.innerHTML = window.renderDataTable(
        ['Sistema/ativo', 'Tipo', 'Responsável', 'Local de armazenamento', 'Situação', 'Ações'],
        sistemas.map((s) => [
            `<strong>${escapeHTML(s.name)}</strong>`,
            escapeHTML(rotuloDoTipo(s.category)),
            escapeHTML(s.owner || '—'),
            escapeHTML(s.location || '—'),
            // A lista do servidor já deixa de fora os removidos.
            window.renderStatusBadge(s.status === 'Removido' ? 'Removido' : 'Em uso', s.status === 'Removido' ? 'info' : 'success'),
            editar ? `<button class="btn btn-ghost btn-sm" data-action="openNovoSistemaModal" data-args='${args(proj.id, s.id)}'>Editar</button>` : '',
        ]),
        { emptyState: 'Nenhum sistema cadastrado.',
            emptyHint: 'Sistemas, bases e arquivos onde os dados ficam: cada etapa da atividade de tratamento do RoPA aponta para eles.' },
    );
}

/** Um modal para criar (sem id) e editar (com id): os mesmos quatro campos. */
window.openNovoSistemaModal = function (projectId, id = '') {
    const s = id ? (S.sistemas || []).find((x) => x.id === id) : null;
    if (id && !s) return;
    const v = s || { name: '', category: 'Software', owner: '', location: '' };
    // Tipo gravado fora da lista (ex.: "Pessoas", do inventário do n.iso) continua escolhido.
    const tipos = TIPOS[v.category] || !v.category ? TIPOS : { ...TIPOS, [v.category]: v.category };
    openModal(`
        <div class="modal-header"><span class="modal-title">${s ? 'Editar sistema' : 'Novo sistema'}</span></div>
        <div class="form-group"><label class="form-label" for="sis-nome">Nome</label><input class="form-input" id="sis-nome" maxlength="500" value="${escapeHTML(v.name || '')}"></div>
        <div class="form-group"><label class="form-label" for="sis-tipo">Tipo</label>
            <select class="form-input" id="sis-tipo">${Object.entries(tipos).map(([k, r]) => `<option value="${escapeHTML(k)}" ${k === v.category ? 'selected' : ''}>${escapeHTML(r)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label" for="sis-responsavel">Responsável</label><input class="form-input" id="sis-responsavel" maxlength="500" value="${escapeHTML(v.owner || '')}"></div>
        <div class="form-group"><label class="form-label" for="sis-local">Local de armazenamento</label><input class="form-input" id="sis-local" maxlength="500" placeholder="Ex.: nuvem, servidor interno, arquivo físico" value="${escapeHTML(v.location || '')}"></div>
        <button class="btn btn-primary w-full" data-action="salvarSistema" data-args='${args(projectId, id)}'>${s ? 'Salvar' : 'Cadastrar'}</button>
    `);
};

window.salvarSistema = async function (projectId, id) {
    const valor = (campo) => document.getElementById(campo).value.trim();
    const corpo = { name: valor('sis-nome'), category: valor('sis-tipo'), owner: valor('sis-responsavel'), location: valor('sis-local') };
    if (!corpo.name) { showToast('Informe o nome', 'error'); return; }
    try {
        if (id) await api('PUT', `/api/v1/projects/${projectId}/assets/${id}`, corpo);
        else await api('POST', `/api/v1/projects/${projectId}/assets`, corpo);
        window.forceCloseModal();
        window.render();
    } catch (e) { falha(e, 'Não foi possível salvar o sistema'); }
};

window.renderSistemas = renderSistemas;
