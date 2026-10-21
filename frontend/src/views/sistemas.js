import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, escapeHTML, tituloDaTela } from '../ui.js';
import { podeEditar } from './partes.js';
import { montarLista, colunasDe } from '../lista.js';

// Ativos (n.privacy, Cadastros; a tela "Sistemas" com o nome do legado, spec 2026-10-19): os ativos do projeto
// (`/projects/:id/assets`), os mesmos do inventário do n.iso, numa lista leve como a do legado: Ativo, Descrição e Empresa. O modal
// traz Ativo e Descrição do ativo primeiro; tipo, responsável e local de armazenamento ficam abaixo. Classificação, criticidade e
// notas de confidencialidade, integridade e disponibilidade ficam no inventário do n.iso, que é quem as avalia.

const TIPOS = { Software: 'Software', Informacao: 'Informação', Hardware: 'Hardware' };
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const args = (...v) => escapeHTML(JSON.stringify(v));
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');

async function renderSistemas(c, h, a) {
    h.textContent = tituloDaTela('nav-sistemas', 'Ativos');
    const proj = projetoAtivo();
    if (!proj) { a.innerHTML = ''; c.innerHTML = window.renderSemProjeto(); return; }
    const editar = podeEditar();
    a.innerHTML = editar ? `<button class="btn btn-primary" data-action="openNovoSistemaModal" data-args='${args(proj.id)}'>+ Novo ativo</button>` : '';
    let sistemas;
    try {
        const r = await api('GET', `/api/v1/projects/${proj.id}/assets`);
        sistemas = Array.isArray(r) ? r : (r && Array.isArray(r.assets) ? r.assets : []);
    } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar os ativos.', e); return; }
    S.sistemas = sistemas;
    const empresa = escapeHTML(proj.client_name || '—');
    montarLista(c, {
        id: 'sistemas',
        linhas: sistemas,
        colunas: colunasDe(['Ativo', 'Descrição', 'Empresa', 'Ações'], (s) => [
            `<strong>${escapeHTML(s.name)}</strong>`,
            escapeHTML(s.description || '—'),
            empresa,
            `<button class="btn btn-ghost btn-sm" data-action="openNovoSistemaModal" data-args='${args(proj.id, s.id)}'>${editar ? 'Ver/Editar' : 'Ver'}</button>`,
        ]),
        vazio: { titulo: 'Nenhum ativo cadastrado.',
            dica: 'Sistemas, bases e arquivos onde os dados ficam: cada etapa da atividade de tratamento do RoPA aponta para eles.' },
    });
}

/** Um modal para criar (sem id), ver e editar (com id). Quem só lê vê os campos desligados, sem gravar. */
window.openNovoSistemaModal = function (projectId, id = '') {
    const s = id ? (S.sistemas || []).find((x) => x.id === id) : null;
    if (id && !s) return;
    const v = s || { name: '', description: '', category: 'Software', owner: '', location: '' };
    const off = podeEditar() ? '' : 'disabled';
    // Tipo gravado fora da lista (ex.: "Pessoas", do inventário do n.iso) continua escolhido.
    const tipos = TIPOS[v.category] || !v.category ? TIPOS : { ...TIPOS, [v.category]: v.category };
    openModal(`
        <div class="modal-header"><span class="modal-title">${s ? 'Ativo' : 'Novo ativo'}</span></div>
        <div class="form-group"><label class="form-label" for="sis-nome">Ativo</label><input class="form-input" id="sis-nome" maxlength="500" value="${escapeHTML(v.name || '')}" ${off}></div>
        <div class="form-group"><label class="form-label" for="sis-descricao">Descrição do ativo</label><textarea class="form-input" id="sis-descricao" rows="3" maxlength="5000" ${off}>${escapeHTML(v.description || '')}</textarea></div>
        <div class="form-group"><label class="form-label" for="sis-tipo">Tipo</label>
            <select class="form-input" id="sis-tipo" ${off}>${Object.entries(tipos).map(([k, r]) => `<option value="${escapeHTML(k)}" ${k === v.category ? 'selected' : ''}>${escapeHTML(r)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label" for="sis-responsavel">Responsável</label><input class="form-input" id="sis-responsavel" maxlength="500" value="${escapeHTML(v.owner || '')}" ${off}></div>
        <div class="form-group"><label class="form-label" for="sis-local">Local de armazenamento</label><input class="form-input" id="sis-local" maxlength="500" placeholder="Ex.: nuvem, servidor interno, arquivo físico" value="${escapeHTML(v.location || '')}" ${off}></div>
        ${off ? '' : `<button class="btn btn-primary w-full" data-action="salvarSistema" data-args='${args(projectId, id)}'>${s ? 'Salvar' : 'Cadastrar'}</button>`}
    `);
};

window.salvarSistema = async function (projectId, id) {
    const valor = (campo) => document.getElementById(campo).value.trim();
    const corpo = { name: valor('sis-nome'), description: valor('sis-descricao'), category: valor('sis-tipo'), owner: valor('sis-responsavel'), location: valor('sis-local') };
    if (!corpo.name) { showToast('Informe o nome', 'error'); return; }
    try {
        if (id) await api('PUT', `/api/v1/projects/${projectId}/assets/${id}`, corpo);
        else await api('POST', `/api/v1/projects/${projectId}/assets`, corpo);
        window.forceCloseModal();
        window.render();
    } catch (e) { falha(e, 'Não foi possível salvar o ativo'); }
};

window.renderSistemas = renderSistemas;
