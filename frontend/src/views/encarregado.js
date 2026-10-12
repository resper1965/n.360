import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, openModal, showToast } from '../ui.js';

import './ponto-de-partida.js';
// Visão do encarregado (fatia 8 do núcleo): o que está atrasado ou faltando no projeto, numa tela. Só leitura: a regra e as contas são do
// servidor (`GET /projects/:id/encarregado`); aqui só se mostra e se leva à tela de cada coisa. Todo texto é escapado.

const NIVEL = { alta: ['Alta', 'danger'], media: ['Média', 'warning'] };
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const args = (...v) => escapeHTML(JSON.stringify(v));
const n = (v) => escapeHTML(String(v ?? 0));
/** Quem indica o encarregado (a mesma regra na governança do n.privacy). */
export const podeIndicar = () => !!S.user && ['platform_admin', 'consultant', 'consultor'].includes(S.user.role);
// Zero é neutro: o sistema não sabe que está "bom", só que nada foi contado. Cor só quando há alerta.
const cor = (q, ruim = 'var(--danger)') => (q > 0 ? ruim : 'var(--text)');

async function renderEncarregado(c, h, a) {
    h.textContent = 'Painel do encarregado';
    a.innerHTML = '';
    const proj = projetoAtivo();
    if (!proj) {
        c.innerHTML = window.renderSemProjeto();
        return;
    }
    let v;
    try { v = await api('GET', `/api/v1/projects/${proj.id}/encarregado`); } catch (e) {
        c.innerHTML = window.renderEmptyState({ titulo: 'Não foi possível montar a visão', texto: 'Tente de novo em instantes.' });
        return;
    }
    const pt = v.pedidos_titular || {}, inc = v.incidentes || {}, tr = v.tratamentos || {}, te = v.terceiros || {}, ev = v.evidencias || {}, lg = v.lgpd || {};
    const pendTrat = (tr.sem_base_legal || 0) + (tr.dpia_pendente || 0) + (tr.lia_pendente || 0);
    // Sem catálogo, não há tile LGPD: o banner do ponto de partida e a prioridade "Catálogo ... não carregado" já dizem isso.
    const cartoes = window.renderStatCards([
        { label: 'Pedidos do titular', value: pt.abertos || 0, color: cor(pt.atrasados), subtext: `${n(pt.atrasados)} atrasados, ${n(pt.vencem_em_7_dias)} em 7 dias` },
        { label: 'Incidentes abertos', value: inc.abertos || 0, color: cor(inc.comunicacoes_atrasadas), subtext: `${n(inc.comunicacoes_atrasadas)} comunicações atrasadas` },
        { label: 'Tratamentos com pendência', value: pendTrat, color: cor(pendTrat, 'var(--warning)'), subtext: `de ${n(tr.total)} tratamentos` },
        { label: 'Terceiros vencidos', value: te.vencidos || 0, color: cor(te.vencidos), subtext: `${n(te.pendentes)} nunca avaliados · ${n(te.reprovados)} reprovados` },
        { label: 'Evidências vencidas', value: ev.vencidas || 0, color: cor(ev.vencidas, 'var(--warning)'), subtext: `${n(ev.vencem_em_7_dias)} vencem em 7 dias` },
        ...(lg.carregada ? [{ label: 'LGPD coberta', value: `${lg.cobertos || 0}/${lg.total || 0}`, color: cor(lg.lacunas, 'var(--warning)'), subtext: `${n(lg.parciais)} parciais · ${n(lg.lacunas)} lacunas` }] : []),
    ]);
    const prioridades = Array.isArray(v.prioridades) ? v.prioridades : [];
    const tabela = window.renderDataTable(['Prioridade', 'O que fazer', 'Ações'], prioridades.map((p) => {
        const [rotulo, tom] = NIVEL[p.nivel] || [p.nivel, 'neutral'];
        return [window.renderStatusBadge(rotulo, tom), escapeHTML(p.texto), `<button class="btn btn-ghost btn-sm" data-action="navigate" data-args='${args(p.tela)}'>Abrir</button>`];
    }), { emptyState: 'Nenhuma pendência calculada a partir do que está cadastrado.' });
    const encs = Array.isArray(v.encarregados) ? v.encarregados : [];
    // Sem encarregado, a falta é a primeira coisa da tela (art. 41), com a ação ao lado; com encarregado, uma linha discreta.
    const linhaEnc = encs.length
        ? `<p style="margin:0 0 1rem">Encarregado: ${encs.map((e) => escapeHTML(e.nome)).join(', ')}${podeIndicar() ? ` <button class="btn btn-ghost btn-sm" data-action="abrirIndicarEncarregado" data-args='${args(proj.id)}'>Indicar outro</button>` : ''}</p>`
        : `<div class="card" id="alerta-encarregado" role="alert" style="border:1px solid var(--danger);display:flex;align-items:center;justify-content:space-between;gap:1rem;margin:0 0 1.5rem">
              <p style="margin:0;color:var(--text)">Nenhum encarregado indicado. A LGPD exige a indicação (art. 41).</p>
              ${podeIndicar() ? `<button class="btn btn-primary" data-action="abrirIndicarEncarregado" data-args='${args(proj.id)}'>Indicar encarregado</button>` : ''}
           </div>`;
    c.innerHTML = `<div id="ponto-de-partida"></div>${linhaEnc}<h3 style="margin:0 0 0.5rem">O que fazer</h3>${tabela}<div style="margin-top:1.5rem">${cartoes}</div>`;
    window.renderPontoDePartida(c.querySelector('#ponto-de-partida'), proj.id, 'privacy');
}

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
        window.forceCloseModal();
        window.render();
    } catch (e) { showToast((e && e.message) || 'Não foi possível indicar o encarregado', 'error'); }
};

window.renderEncarregado = renderEncarregado;
