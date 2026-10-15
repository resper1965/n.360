import { S } from '../state.js';
import { api, baixarArquivo } from '../api.js';
import { escapeHTML, openModal, showToast } from '../ui.js';

import './painel.js';
// O Painel do n.privacy é o painel de entrada (views/painel.js, estudo de 14/10/2026); aqui ficam o que ele abre: indicar o
// encarregado e as ações das atividades por faixa de prazo (F4), que o painel recebe em `acoes_por_prazo`. Todo texto é escapado.

const args = (...v) => escapeHTML(JSON.stringify(v));
const n = (v) => escapeHTML(String(v ?? 0));
/** Quem indica o encarregado (a mesma regra na governança do n.privacy). */
export const podeIndicar = () => !!S.user && ['platform_admin', 'consultant', 'consultor'].includes(S.user.role);
window.podeIndicarEncarregado = podeIndicar;
// Faixas de prazo das ações das atividades (F4): o servidor conta e manda até 50 itens por faixa; a tela guarda para abrir a lista.
let faixasPrazo = [];
/** O painel entrega as faixas que recebeu; o botão "Ações por prazo" dos vencimentos as abre. */
window.guardarFaixasPrazo = function (lista) { faixasPrazo = Array.isArray(lista) ? lista : []; };

/** Seis faixas clicáveis, num modal; cada uma abre a lista da faixa. */
window.abrirPrazosDasAcoes = function (projectId) {
    const total = faixasPrazo.reduce((t, f) => t + (f.total || 0), 0);
    const botoes = faixasPrazo.map((f) => `<li><span>${escapeHTML(f.rotulo)}</span><span class="pn-num">${n(f.total)}</span>
        <button type="button" class="btn btn-sm" data-action="abrirFaixaPrazo" data-args='${args(projectId, f.faixa)}' aria-label="${escapeHTML(`${f.rotulo}: ${f.total || 0} ações`)}">Ver</button></li>`).join('');
    openModal(`<div class="modal-header"><span class="modal-title">Ações das atividades por prazo</span><button class="btn-ghost" data-action="forceCloseModal" aria-label="Fechar">&times;</button></div>
        <ul class="pn-export" id="enc-prazos">${botoes}</ul>
        ${total ? `<button type="button" class="btn" data-action="exportarCsvAcoes" data-args='${args(projectId, null)}'>Exportar todas (CSV)</button>` : '<p class="pn-meta">Nenhuma ação aberta nas atividades.</p>'}`);
};

/** A entrada do n.privacy. */
function renderEncarregado(c, h, a) { return window.renderPainel(c, h, a, 'privacy'); }

window.abrirFaixaPrazo = function (projectId, faixa) {
    const f = faixasPrazo.find((x) => x.faixa === faixa);
    if (!f) return false;
    const itens = Array.isArray(f.itens) ? f.itens : [];
    const tabela = window.renderDataTable(['Ação', 'Atividade', 'Prazo', 'Responsável', ''], itens.map((i) => [
        escapeHTML(i.title), escapeHTML(i.atividade || '—'), escapeHTML(i.due_date ? String(i.due_date).slice(0, 10).split('-').reverse().join('/') : 'Sem prazo'),
        escapeHTML(i.responsavel || '—'),
        `<button class="btn btn-ghost btn-sm" data-action="openLigacoesTratamento" data-args='${args(projectId, i.ropa_id)}'>Abrir a atividade</button>`,
    ]), { emptyState: 'Nenhuma ação aberta nesta faixa.' });
    openModal(`
        <div class="modal-header"><span class="modal-title">Ações: ${escapeHTML(f.rotulo)} (${n(f.total)})</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
        ${f.total > itens.length ? `<p style="color:var(--text-dim)">Mostrando ${n(itens.length)} de ${n(f.total)}. O CSV traz todas.</p>` : ''}
        ${tabela}
        ${f.total ? `<button class="btn" style="margin-top:1rem" data-action="exportarCsvAcoes" data-args='${args(projectId, faixa)}'>Exportar esta faixa (CSV)</button>` : ''}
    `);
    return true;
};

window.exportarCsvAcoes = function (projectId, faixa) {
    const q = faixa ? `?faixa=${encodeURIComponent(faixa)}` : '';
    return baixarArquivo(`/api/v1/projects/${projectId}/export/acoes-atividade${q}`)
        .catch((e) => showToast(e.message || 'Não foi possível baixar o arquivo', 'error'));
};

window.abrirIndicarEncarregado = async function (projectId) {
    let partes;
    try { partes = await api('GET', `/api/v1/projects/${projectId}/partes?tipo=pessoa&status=ativa`); } catch (e) { return showToast('Não foi possível listar as pessoas', 'error'); }
    const opcoes = (Array.isArray(partes) ? partes : []).map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nome)}</option>`).join('');
    openModal(`
        <div class="modal-header"><span class="modal-title">Indicar encarregado</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
        ${opcoes
            ? `<div class="form-group"><label class="form-label">Pessoa</label><select class="form-input" id="encarregado-parte">${opcoes}</select></div>
               <button class="btn btn-primary" style="width:100%" data-action="indicarEncarregado" data-args='${args(projectId)}'>Indicar</button>`
            : '<p>Nenhuma pessoa cadastrada. Cadastre em Partes ou na governança (cargo DPO).</p>'}
    `);
};

window.indicarEncarregado = async function (projectId) {
    const id = document.getElementById('encarregado-parte')?.value;
    if (!id) return;
    try {
        await api('POST', `/api/v1/projects/${projectId}/partes/${encodeURIComponent(id)}/vinculos`, { papel: 'encarregado', alvo_tipo: 'projeto', alvo_id: projectId });
        // O painel guardado deste projeto já não vale: o encarregado aparece na identidade e sai do "O que fazer".
        if (S.painel) for (const k of Object.keys(S.painel)) if (k.startsWith(`${projectId}|`)) delete S.painel[k];
        window.forceCloseModal();
        window.render();
    } catch (e) { showToast((e && e.message) || 'Não foi possível indicar o encarregado', 'error'); }
};

window.renderEncarregado = renderEncarregado;
