import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, renderEmptyState, renderSemProjeto, renderDataTable, falhaDeCarga } from '../ui.js';

// n.ot, N1 (spec 2026-10-30-n-ot-modulo-n360-design): o catálogo da rotina operacional RO-CB.BR.01 Rev.00 do ONS, só leitura,
// de `GET /projects/:id/ot/requisitos` (src/routes/ot.ts). O inventário e a cobertura chegam no N2. Todo texto é escapado.

const prazo = (m) => (Number.isInteger(m) && m > 0 ? `${m} meses` : 'Sem prazo');

async function renderOt(c, h, a) {
    h.innerHTML = 'n<span class="pn-ponto">.</span>ot';
    a.innerHTML = '';
    const proj = S.activeProject;
    if (!proj) { c.innerHTML = renderSemProjeto(); return; }
    c.innerHTML = '<div class="loading"></div>';
    let reqs;
    try {
        const r = await api('GET', `/api/v1/projects/${encodeURIComponent(proj.id)}/ot/requisitos`);
        reqs = Array.isArray(r && r.requisitos) ? r.requisitos : [];
    } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar os requisitos da RO-CB.BR.01.', e); return; }
    if (!reqs.length) {
        c.innerHTML = renderEmptyState({ titulo: 'Catálogo da RO-CB.BR.01 ainda não carregado',
            texto: 'O catálogo é carregado pela migração do n.ot. Fale com o suporte da ness.' });
        return;
    }
    c.innerHTML = `<p class="org-header-intro">ONS RO-CB.BR.01 Rev.00: ${escapeHTML(String(reqs.length))} requisitos. Prazo em meses após o início da vigência (09/07/2021).</p>`
        + renderDataTable(['Código', 'Requisito', 'Prazo'], reqs.map((r) => [escapeHTML(r.codigo), escapeHTML(r.titulo), escapeHTML(prazo(r.prazo_meses))]));
}

window.renderOt = renderOt;
