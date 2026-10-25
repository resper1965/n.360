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
    for (const linha of String(texto || '').split(/\r?\n/)) {
        const m = /^## (\d+)\. (.+)$/.exec(linha);
        if (m) out.push({ n: Number(m[1]), titulo: m[2], corpo: [] });
        else if (out.length) out[out.length - 1].corpo.push(linha);
    }
    return out.map((s) => {
        const corpo = s.corpo.join('\n').trim();
        const situacao = (corpo === '' || corpo === A_GERAR) ? 'a gerar' : corpo.includes('Seção incompleta') ? 'incompleta' : 'pronta';
        return { n: s.n, titulo: s.titulo, situacao };
    });
}

const podeEditar = () => !!S.user && ['platform_admin', 'consultant', 'consultor', 'consultoria_admin', 'org_admin'].includes(S.user.role); // mesma regra de documentos.js
const TOM = { pronta: 'success', 'a gerar': 'info', incompleta: 'warning' };

async function renderPolitica(c, h, a) {
    const { projectId, id } = S.politica || {};
    if (!projectId || !id) { a.innerHTML = ''; c.innerHTML = window.renderSemProjeto(); return; }
    let d;
    try { d = await api('GET', `/api/v1/projects/${projectId}/documentos/${id}`); } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar a política.', e); return; }
    let reqs = [];
    let reqsOk = true; // sem a leitura, ligar um requisito faria o PUT substituir os que existem
    try { reqs = lista(await api('GET', `/api/v1/projects/${projectId}/documentos/${id}/requisitos`)); } catch (e) { reqsOk = false; }
    const versoes = lista(d.versoes);
    const v = versoes.find((x) => x.estado === 'rascunho') || versoes.find((x) => x.estado === 'vigente') || versoes[versoes.length - 1];
    const secoes = secoesDe(v && v.texto);
    const pendentes = secoes.filter((s) => s.situacao !== 'pronta');
    S.polPendentes = pendentes.map((s) => s.n);

    h.textContent = d.titulo;
    const edita = podeEditar();
    const rascunho = !!versoes.find((x) => x.estado === 'rascunho');
    const editaReqs = edita && rascunho && reqsOk;
    let catalogo = [];
    if (editaReqs) { try { catalogo = lista(await api('GET', '/api/v1/requisitos?fonte=iso27001:2022')); } catch (e) { /* sem catálogo, sem seletor */ } }
    S.polReqs = reqs.map((r) => r.id);
    a.innerHTML = `${edita && pendentes.length ? `<button class="btn btn-primary" data-action="gerarSecoesPendentes" data-args='${args(projectId, id)}'>Gerar seções pendentes</button>` : ''}
        <button class="btn" data-action="openDocumentoModal" data-args='${args(projectId, id)}'>Abrir em Documentos</button>`;
    c.innerHTML = `<div class="d-grid grid-2-1 gap-5">
        <div id="pol-texto" class="doc-texto">${window.markdownSeguro(v ? v.texto : '')}</div>
        <aside>
            <p id="pol-secoes"><strong>${secoes.length - pendentes.length} de ${secoes.length} seções prontas</strong></p>
            <p id="pol-progresso" class="t-sm t-dim"></p>
            <ul class="t-sm">${secoes.map((s) => `<li>${s.n}. ${escapeHTML(s.titulo)} ${window.renderStatusBadge(s.situacao === 'a gerar' ? 'A gerar' : s.situacao === 'incompleta' ? 'Incompleta' : 'Pronta', TOM[s.situacao])}
                ${edita ? `<button class="btn btn-ghost btn-sm" data-action="gerarSecao" data-args='${args(projectId, id, s.n)}'>${s.situacao === 'pronta' ? 'Regerar' : 'Gerar'}</button>` : ''}</li>`).join('')}</ul>
            ${reqs.length || editaReqs ? `<h3>Controles cobertos</h3><div class="t-sm">${reqs.map((r) => `<span class="ctx-tag" title="${escapeHTML(r.titulo)}">${escapeHTML(r.fonte_id)} ${escapeHTML(r.referencia)}${editaReqs ? ` <button class="btn btn-ghost btn-sm" data-action="desligarRequisitoPolitica" data-args='${args(projectId, id, r.id)}' aria-label="Desligar ${escapeHTML(r.referencia)}">×</button>` : ''}</span>`).join(' ')}</div>` : ''}
            ${editaReqs && catalogo.length ? `<div class="form-group"><label class="form-label" for="pol-req-add">Ligar controle</label>
                <select class="form-input" id="pol-req-add"><option value="">— escolha —</option>${catalogo.filter((r) => !reqs.some((x) => x.id === r.id)).map((r) => `<option value="${escapeHTML(r.id)}">${escapeHTML(r.referencia)} ${escapeHTML(r.titulo)}</option>`).join('')}</select>
                <button class="btn btn-ghost btn-sm" data-action="ligarRequisitoPolitica" data-args='${args(projectId, id)}'>Ligar</button></div>` : ''}
        </aside></div>`;
}

const LIMITE = 'Limite de geração atingido; tente de novo em uma hora';

// Devolve 'ok', 'erro' ou 'limite' (429: o aviso único é do chamador).
async function gerar(projectId, id, n) {
    try { await api('POST', `/api/v1/projects/${projectId}/documentos/${id}/secoes/${n}/gerar`); return 'ok'; } catch (e) {
        if (e && e.status === 429) return 'limite';
        const motivo = e && e.status === 422 && e.body && e.body.motivo;
        showToast(`Seção ${n}: ${motivo || (e && e.message) || 'não foi possível gerar'}`, 'error');
        return 'erro';
    }
}

window.gerarSecao = async function (projectId, id, n) {
    const r = await gerar(projectId, id, n);
    if (r === 'ok') showToast('Seção gerada', 'success');
    else if (r === 'limite') showToast(LIMITE, 'error');
    window.render();
};

window.gerarSecoesPendentes = async function (projectId, id) {
    const fila = [...(S.polPendentes || [])];
    for (let i = 0; i < fila.length; i++) {
        const p = document.getElementById('pol-progresso');
        if (p) p.textContent = `Gerando ${i + 1} de ${fila.length}…`;
        const r = await gerar(projectId, id, fila[i]); // erro numa seção já foi avisado; segue para a próxima
        if (r === 'limite') { showToast(LIMITE, 'error'); break; }
    }
    window.render();
};

async function gravarReqs(projectId, id, requisitos, ok) {
    try {
        await api('PUT', `/api/v1/projects/${projectId}/documentos/${id}/requisitos`, { requisitos });
        showToast(ok, 'success');
        window.render();
    } catch (e) { showToast((e && e.message) || 'Não foi possível atualizar os controles', 'error'); }
}

window.ligarRequisitoPolitica = function (projectId, id) {
    const novo = document.getElementById('pol-req-add')?.value;
    if (!novo) { showToast('Escolha um controle', 'error'); return; }
    return gravarReqs(projectId, id, [...(S.polReqs || []), novo], 'Controle ligado.');
};

window.desligarRequisitoPolitica = (projectId, id, requisitoId) =>
    gravarReqs(projectId, id, (S.polReqs || []).filter((x) => x !== requisitoId), 'Controle desligado.');

window.abrirPolitica = function (projectId, id) {
    if (typeof window.forceCloseModal === 'function') window.forceCloseModal();
    S.politica = { projectId, id };
    navigate('politica');
};

window.renderPolitica = renderPolitica;
