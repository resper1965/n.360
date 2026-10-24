import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, escapeHTML } from '../ui.js';
import { navigate } from '../router.js';

// Página da política: o texto inteiro à esquerda e, ao lado, as seções (progresso, gerar por seção ou todas as
// pendentes) e os requisitos cobertos. A regra é do servidor; a leitura das seções aqui é só para mostrar.

const lista = (r) => (Array.isArray(r) ? r : []);
const args = (...v) => escapeHTML(JSON.stringify(v));
const A_GERAR = '> Seção a gerar.';

/** Divide o texto em seções pelo cabeçalho `## N. Título`; a situação sai do marcador do corpo. */
function secoesDe(texto) {
    const out = [];
    for (const linha of String(texto || '').split('\n')) {
        const m = /^## (\d+)\. (.+)$/.exec(linha);
        if (m) out.push({ n: Number(m[1]), titulo: m[2], corpo: [] });
        else if (out.length) out[out.length - 1].corpo.push(linha);
    }
    return out.map((s) => {
        const corpo = s.corpo.join('\n').trim();
        const situacao = corpo === A_GERAR ? 'a gerar' : corpo.includes('Seção incompleta') ? 'incompleta' : 'pronta';
        return { n: s.n, titulo: s.titulo, situacao };
    });
}

const TOM = { pronta: 'success', 'a gerar': 'info', incompleta: 'warning' };

async function renderPolitica(c, h, a) {
    const { projectId, id } = S.politica || {};
    if (!projectId || !id) { a.innerHTML = ''; c.innerHTML = window.renderSemProjeto(); return; }
    let d;
    try { d = await api('GET', `/api/v1/projects/${projectId}/documentos/${id}`); } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar a política.', e); return; }
    let reqs = [];
    try { reqs = lista(await api('GET', `/api/v1/projects/${projectId}/documentos/${id}/requisitos`)); } catch (e) { /* a página abre sem os controles cobertos */ }
    const versoes = lista(d.versoes);
    const v = versoes.find((x) => x.estado === 'rascunho') || versoes.find((x) => x.estado === 'vigente') || versoes[versoes.length - 1];
    const secoes = secoesDe(v && v.texto);
    const pendentes = secoes.filter((s) => s.situacao !== 'pronta');
    S.polPendentes = pendentes.map((s) => s.n);

    h.textContent = d.titulo;
    a.innerHTML = `${pendentes.length ? `<button class="btn btn-primary" data-action="gerarSecoesPendentes" data-args='${args(projectId, id)}'>Gerar seções pendentes</button>` : ''}
        <button class="btn" data-action="openDocumentoModal" data-args='${args(projectId, id)}'>Abrir em Documentos</button>`;
    c.innerHTML = `<div class="d-grid grid-2-1 gap-5">
        <div id="pol-texto" class="doc-texto">${window.markdownSeguro(v ? v.texto : '')}</div>
        <aside>
            <p id="pol-secoes"><strong>${secoes.length - pendentes.length} de ${secoes.length} seções prontas</strong></p>
            <p id="pol-progresso" class="t-sm t-dim"></p>
            <ul class="t-sm">${secoes.map((s) => `<li>${s.n}. ${escapeHTML(s.titulo)} ${window.renderStatusBadge(s.situacao === 'a gerar' ? 'A gerar' : s.situacao === 'incompleta' ? 'Incompleta' : 'Pronta', TOM[s.situacao])}
                <button class="btn btn-ghost btn-sm" data-action="gerarSecao" data-args='${args(projectId, id, s.n)}'>${s.situacao === 'pronta' ? 'Regerar' : 'Gerar'}</button></li>`).join('')}</ul>
            ${reqs.length ? `<h3>Controles cobertos</h3><ul class="t-sm">${reqs.map((r) => `<li>${escapeHTML(r.fonte_id)} ${escapeHTML(r.referencia)}</li>`).join('')}</ul>` : ''}
        </aside></div>`;
}

async function gerar(projectId, id, n) {
    try { await api('POST', `/api/v1/projects/${projectId}/documentos/${id}/secoes/${n}/gerar`); return true; } catch (e) {
        showToast(`Seção ${n}: ${(e && e.message) || 'não foi possível gerar'}`, 'error');
        return false;
    }
}

window.gerarSecao = async function (projectId, id, n) {
    if (await gerar(projectId, id, n)) showToast('Seção gerada', 'success');
    window.render();
};

window.gerarSecoesPendentes = async function (projectId, id) {
    const fila = [...(S.polPendentes || [])];
    for (let i = 0; i < fila.length; i++) {
        const p = document.getElementById('pol-progresso');
        if (p) p.textContent = `Gerando ${i + 1} de ${fila.length}…`;
        await gerar(projectId, id, fila[i]); // erro numa seção já foi avisado; segue para a próxima
    }
    window.render();
};

window.abrirPolitica = function (projectId, id) {
    if (typeof window.forceCloseModal === 'function') window.forceCloseModal();
    S.politica = { projectId, id };
    navigate('politica');
};

window.renderPolitica = renderPolitica;
