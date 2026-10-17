import { api } from '../api.js';
import { showToast, openModal, forceCloseModal, confirmar, escapeHTML, formatarData, renderDataTable, renderMaisAcoes } from '../ui.js';
import { nivelDaNota, nivelDoEscore } from '../nivel-risco.js';

// Aba Riscos da ficha da atividade (spec 2026-10-16, seção 7). Contrato de aba da casca: montar(painel, ctx) com
// ctx = { projectId, ropaId, ficha, editavel, recarregarFicha }; devolve { esvaziar }. O risco é o MESMO cadastro do n.iso
// (`risks`, com `ropa_id`): o motivo grava em `threat`, a descrição em `vulnerability`, e o IDR é do servidor (sequencial por atividade).
// O nível é calculado aqui só para mostrar ao vivo (mesma conta de `riskLevel`); o servidor recalcula e é a verdade.

// Escalas do legado (captura 38) e rótulos de nível e estratégia: os de src/data/ropa-abas/escalas.ts (o teste confere a igualdade).
export const PROBABILIDADE = [[1, 'Ocorrência muito improvável'], [2, 'Ocorrência improvável'], [3, 'Ocorrência possível'], [4, 'Ocorrência provável'], [5, 'Ocorrência muito provável']];
export const IMPACTO = [[1, 'Impacto desprezível para titulares'], [2, 'Impacto com efeitos leves para titulares'], [3, 'Impacto com efeitos moderados para titulares'],
    [4, 'Impacto com efeitos relevantes para titulares'], [5, 'Impacto com efeitos graves para titulares']];
export const NIVEL_ROTULO = { Low: 'Baixo', Medium: 'Médio', High: 'Alto', Critical: 'Crítico' };
export const ESTRATEGIA_ROTULO = { Accept: 'Aceitar', Mitigate: 'Mitigar', Avoid: 'Evitar', Transfer: 'Transferir' };
const SELO = { Low: 'selo-success', Medium: 'selo-warning', High: 'selo-danger', Critical: 'selo-danger' };

let R = null; // { painel, ctx, riscos, motivos, m }  (m = estado do modal aberto)
const el = (id) => document.getElementById(id);
const url = (c, sufixo = '') => `/api/v1/projects/${c.projectId}/ropa/${c.ropaId}${sufixo}`;
const lista = (r, chave) => (Array.isArray(r) ? r : (r && Array.isArray(r[chave]) ? r[chave] : []));
const args = (...v) => escapeHTML(JSON.stringify(v));
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');
async function opcional(fn, padrao) { try { return await fn(); } catch (e) { return padrao; } }
const idr = (n) => String(n ?? '').padStart(2, '0');
const selo = (nivel) => (nivel ? `<span class="badge ${SELO[nivel] || 'selo-neutral'}">${escapeHTML(NIVEL_ROTULO[nivel] || nivel)}</span>` : '<span class="t-dim">—</span>');
const dataBr = (d) => (d ? escapeHTML(formatarData(String(d).slice(0, 10))) : '<span class="t-dim">—</span>');
const norm = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** O legado deixa Estratégia, Risco residual e Prazo vazios até "Tratar". O servidor grava Mitigar como padrão, então só conta como tratado o que tem sinal de tratamento. */
const tratado = (r) => !!(r.treatment_due_date || r.residual_level || (r.residual_impact && r.residual_probability) || (r.treatment && r.treatment !== 'Mitigate'));

async function carregar() {
    const c = R.ctx;
    const [riscos, motivos] = await Promise.all([api('GET', url(c, '/riscos')), opcional(() => api('GET', url(c, '/riscos/motivos')), [])]);
    R.riscos = lista(riscos, 'riscos').slice().sort((a, b) => (a.idr ?? 1e9) - (b.idr ?? 1e9));
    R.motivos = lista(motivos, 'motivos').filter((m) => m && m.nome);
}

function desenhar() {
    const ed = R.ctx.editavel;
    const linhas = R.riscos.map((r) => {
        const t = tratado(r);
        const acoes = ed ? `<div class="acoes-linha"><button type="button" class="btn btn-sm" data-action="atRiscoTratar" data-args='${args(r.id)}' aria-label="${escapeHTML(`Tratar o risco ${idr(r.idr)}: ${r.threat}`)}">Tratar</button>${renderMaisAcoes([
            { rotulo: 'Editar', action: 'atRiscoEditar', args: [r.id] }, { rotulo: 'Excluir', action: 'atRiscoExcluir', args: [r.id], perigo: true }], { nome: `${idr(r.idr)} ${r.threat}` })}</div>` : '';
        return [escapeHTML(idr(r.idr)), escapeHTML(r.threat), selo(r.risk_level), t ? escapeHTML(ESTRATEGIA_ROTULO[r.treatment] || r.treatment || '—') : '<span class="t-dim">—</span>',
            t ? selo(r.residual_level) : '<span class="t-dim">—</span>', t ? dataBr(r.treatment_due_date) : '<span class="t-dim">—</span>', acoes];
    });
    const novo = ed ? '<button type="button" class="btn btn-sm" data-action="atRiscoNovo">+ Registrar Risco</button>' : '';
    R.painel.innerHTML = `<div class="at-impacto"><section aria-labelledby="at-rk-t" class="d-flex flex-col gap-2"><h3 class="at-sub" id="at-rk-t">Riscos da atividade</h3>
        ${renderDataTable(['IDR', 'Motivo', 'Risco', 'Estratégia', 'Risco residual', 'Prazo', 'Ações'], linhas, {
            emptyState: 'Nenhum risco registrado.',
            emptyHint: 'Risco é a chance de algo dar errado com os dados desta atividade e o efeito disso para o titular. Registre o motivo, a probabilidade e o impacto; o nível é calculado.',
            emptyAction: novo })}
        ${R.riscos.length ? `<div class="at-acoes">${novo}</div>` : ''}</section></div>`;
}

async function recarregar() {
    await carregar();
    desenhar();
    if (R.ctx.recarregarFicha) await R.ctx.recarregarFicha();
}

// ─── Análise de Riscos (novo e editar) ───
const opcoesNota = (escala, atual, vazio) => `<option value="">${vazio}</option>${escala.map(([n, r]) => `<option value="${n}" ${Number(atual) === n ? 'selected' : ''}>${escapeHTML(r)}</option>`).join('')}`;
const obrigatorio = '<span class="t-aviso">(obrigatório)</span>';
const padraoDe = (motivo) => { const m = R.motivos.find((x) => norm(x.nome) === norm(motivo)); return m && m.descricao_padrao ? m.descricao_padrao : ''; };

function modalAnalise(r) {
    R.m = { editId: r ? r.id : null, ultimoPadrao: r ? padraoDe(r.threat) : '' };
    openModal(`<h2 class="modal-title" id="at-rk-modal-t">Análise de Riscos</h2>
        <form id="at-rk-form" data-action-submit="atRiscoGravar" data-prevent novalidate class="d-flex flex-col gap-3" data-action-input="atRiscoMudou" data-action-change="atRiscoMudou">
            <div class="form-group"><label class="form-label" for="at-rk-motivo">Motivo ${obrigatorio}</label>
                <input class="form-input" id="at-rk-motivo" list="at-rk-motivos" maxlength="500" required aria-required="true" autocomplete="off" value="${escapeHTML(r ? r.threat : '')}" aria-describedby="at-rk-motivo-d">
                <datalist id="at-rk-motivos">${R.motivos.map((m) => `<option value="${escapeHTML(m.nome)}"></option>`).join('')}</datalist>
                <p class="at-nota" id="at-rk-motivo-d">${R.motivos.length ? 'Escolha um motivo já usado neste projeto ou escreva um novo.' : 'Este projeto ainda não tem motivos de risco. Escreva o primeiro; ele fica disponível para os próximos riscos.'}</p></div>
            <div class="form-group"><label class="form-label" for="at-rk-desc">Descrição</label>
                <textarea class="form-input" id="at-rk-desc" rows="5" maxlength="5000">${escapeHTML(r ? r.vulnerability || '' : '')}</textarea></div>
            <div class="form-group"><label class="form-label" for="at-rk-prob">Probabilidade ${obrigatorio}</label><select class="form-input" id="at-rk-prob" required aria-required="true">${opcoesNota(PROBABILIDADE, r && r.probability, 'Selecione uma opção')}</select></div>
            <div class="form-group"><label class="form-label" for="at-rk-imp">Impacto ${obrigatorio}</label><select class="form-input" id="at-rk-imp" required aria-required="true">${opcoesNota(IMPACTO, r && r.impact, 'Selecione uma opção')}</select></div>
            <p class="form-label">Risco: <span id="at-rk-nivel" role="status"></span></p>
            <p class="re-erro" id="at-rk-erro" role="alert"></p>
            <div class="acoes-rodape"><button type="button" class="btn" id="at-rk-restaurar" data-action="atRiscoRestaurar" disabled>Restaurar</button>
                <button type="submit" class="btn btn-primary" id="at-rk-gravar" disabled>${r ? 'Alterar' : 'Adicionar'}</button></div></form>`);
    window.atRiscoMudou();
}

window.atRiscoNovo = () => modalAnalise(null);
window.atRiscoEditar = (id) => { const r = R.riscos.find((x) => x.id === id); if (r) modalAnalise(r); };

/** Nível calculado ao vivo, Restaurar e Adicionar/Alterar só com o mínimo (Motivo, Probabilidade e Impacto). Escolher um motivo já usado preenche a descrição. */
window.atRiscoMudou = function () {
    const motivo = el('at-rk-motivo').value.trim();
    const desc = el('at-rk-desc');
    const padrao = padraoDe(motivo);
    if (padrao && (!desc.value.trim() || desc.value === R.m.ultimoPadrao) && desc.value !== padrao) desc.value = padrao;
    R.m.ultimoPadrao = padrao;
    el('at-rk-restaurar').disabled = !padrao;
    const p = Number(el('at-rk-prob').value);
    const i = Number(el('at-rk-imp').value);
    el('at-rk-nivel').innerHTML = p && i ? selo(nivelDaNota(p, i)) : '<span class="t-dim">a calcular...</span>';
    el('at-rk-gravar').disabled = !(motivo && p && i);
};
window.atRiscoRestaurar = function () {
    const padrao = padraoDe(el('at-rk-motivo').value);
    if (!padrao) return;
    el('at-rk-desc').value = padrao;
    el('at-rk-desc').focus();
};

window.atRiscoGravar = async function () {
    const botao = el('at-rk-gravar');
    if (!botao || botao.disabled) return;
    const corpo = { threat: el('at-rk-motivo').value.trim(), vulnerability: el('at-rk-desc').value.trim() || null,
        probability: Number(el('at-rk-prob').value), impact: Number(el('at-rk-imp').value) };
    botao.disabled = true;
    try {
        if (R.m.editId) await api('PUT', url(R.ctx, `/riscos/${R.m.editId}`), corpo);
        else await api('POST', url(R.ctx, '/riscos'), corpo);
    } catch (e) { el('at-rk-erro').textContent = (e && e.message) || 'Não foi possível salvar o risco.'; window.atRiscoMudou(); return; }
    forceCloseModal();
    showToast(R.m.editId ? 'Risco alterado.' : 'Risco registrado.', 'success');
    try { await recarregar(); } catch (e) { falha(e, 'Não foi possível atualizar a lista'); }
};

// ─── Tratar: estratégia, risco residual e prazo ───
window.atRiscoTratar = function (id) {
    const r = R.riscos.find((x) => x.id === id);
    if (!r) return;
    R.m = { editId: id };
    openModal(`<h2 class="modal-title" id="at-rk-modal-t">Tratar o risco ${escapeHTML(idr(r.idr))}</h2>
        <form id="at-rk-form" data-action-submit="atRiscoTratarGravar" data-prevent novalidate class="d-flex flex-col gap-3" data-action-change="atRiscoTratarMudou">
            <p class="at-nota">${escapeHTML(r.threat)}. Risco inerente: ${selo(r.risk_level)}</p>
            <div class="form-group"><label class="form-label" for="at-rk-estr">Estratégia ${obrigatorio}</label><select class="form-input" id="at-rk-estr" required aria-required="true"><option value="">Selecione uma opção</option>${Object.entries(ESTRATEGIA_ROTULO).map(([v, rot]) =>
                `<option value="${v}" ${tratado(r) && r.treatment === v ? 'selected' : ''}>${rot}</option>`).join('')}</select></div>
            <div class="form-group"><label class="form-label" for="at-rk-rprob">Probabilidade residual</label><select class="form-input" id="at-rk-rprob">${opcoesNota(PROBABILIDADE, r.residual_probability, 'Não avaliada')}</select></div>
            <div class="form-group"><label class="form-label" for="at-rk-rimp">Impacto residual</label><select class="form-input" id="at-rk-rimp">${opcoesNota(IMPACTO, r.residual_impact, 'Não avaliado')}</select></div>
            <p class="form-label">Risco residual: <span id="at-rk-residual" role="status"></span></p>
            <div class="form-group"><label class="form-label" for="at-rk-prazo">Prazo</label><input class="form-input" type="date" id="at-rk-prazo" value="${escapeHTML(r.treatment_due_date ? String(r.treatment_due_date).slice(0, 10) : '')}"></div>
            <p class="re-erro" id="at-rk-erro" role="alert"></p>
            <div class="acoes-rodape"><button type="submit" class="btn btn-primary" id="at-rk-gravar" disabled>Gravar</button></div></form>`);
    window.atRiscoTratarMudou();
};
window.atRiscoTratarMudou = function () {
    const p = Number(el('at-rk-rprob').value);
    const i = Number(el('at-rk-rimp').value);
    el('at-rk-residual').innerHTML = p && i ? selo(nivelDoEscore(p * i)) : '<span class="t-dim">a calcular...</span>';
    el('at-rk-gravar').disabled = !el('at-rk-estr').value;
};
window.atRiscoTratarGravar = async function () {
    const botao = el('at-rk-gravar');
    if (!botao || botao.disabled) return;
    const p = Number(el('at-rk-rprob').value);
    const i = Number(el('at-rk-rimp').value);
    if (!!p !== !!i) { el('at-rk-erro').textContent = 'Informe a probabilidade e o impacto residuais, ou deixe as duas em branco.'; return; }
    const corpo = { treatment: el('at-rk-estr').value, residual_probability: p || null, residual_impact: i || null, treatment_due_date: el('at-rk-prazo').value || null };
    botao.disabled = true;
    try { await api('PUT', url(R.ctx, `/riscos/${R.m.editId}`), corpo); }
    catch (e) { el('at-rk-erro').textContent = (e && e.message) || 'Não foi possível gravar o tratamento.'; botao.disabled = false; return; }
    forceCloseModal();
    showToast('Tratamento registrado.', 'success');
    try { await recarregar(); } catch (e) { falha(e, 'Não foi possível atualizar a lista'); }
};

window.atRiscoExcluir = async function (id) {
    const r = R.riscos.find((x) => x.id === id);
    if (!r) return;
    if (!(await confirmar(`Excluir o risco ${idr(r.idr)} (${r.threat})? As ações ligadas a ele continuam, sem o vínculo.`, { titulo: 'Excluir risco', rotulo: 'Excluir', perigo: true }))) return;
    try { await api('DELETE', url(R.ctx, `/riscos/${id}`)); showToast('Risco excluído.', 'success'); await recarregar(); }
    catch (e) { falha(e, 'Não foi possível excluir o risco'); }
};

export async function montar(painel, ctx) {
    R = { painel, ctx, riscos: [], motivos: [], m: null };
    painel.innerHTML = '<p class="at-nota" role="status">Carregando os riscos...</p>';
    try { await carregar(); desenhar(); }
    catch (e) { painel.innerHTML = `<p class="re-erro" role="alert">Não foi possível carregar os riscos. ${escapeHTML((e && e.message) || '')}</p>`; }
    return { esvaziar: () => Promise.resolve() };
}
