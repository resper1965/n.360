import { api } from '../api.js';
import { showToast, openModal, forceCloseModal, confirmar, escapeHTML, formatarData, renderDataTable, renderMaisAcoes } from '../ui.js';
import { nivelDaNota, nivelDoEscore } from '../nivel-risco.js';
import { podeAceitar, linhaDeAceite, aceitarRisco } from '../aceite-risco.js';

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

let R = null; // { painel, ctx, riscos, motivos, partes, m }  (m = estado do modal aberto)
const el = (id) => document.getElementById(id);
const url = (c, sufixo = '') => `/api/v1/projects/${c.projectId}/ropa/${c.ropaId}${sufixo}`;
const lista = (r, chave) => (Array.isArray(r) ? r : (r && Array.isArray(r[chave]) ? r[chave] : []));
const args = (...v) => escapeHTML(JSON.stringify(v));
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');
async function opcional(fn, padrao) { try { return await fn(); } catch (e) { return padrao; } }
const idr = (n) => String(n ?? '').padStart(2, '0');
const selo = (nivel) => (nivel ? `<span class="badge ${SELO[nivel] || 'selo-neutral'}">${escapeHTML(NIVEL_ROTULO[nivel] || nivel)}</span>` : '<span class="t-dim">—</span>');
const dataBr = (d) => (d ? formatarData(String(d).slice(0, 10)) : '<span class="t-dim">—</span>');
const norm = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** O legado deixa Estratégia, Risco residual e Prazo vazios até "Tratar". O servidor grava Mitigar como padrão, então só conta como tratado o que tem sinal de tratamento. */
export const tratado = (r) => !!(r.treatment_due_date || r.residual_level || (r.residual_impact && r.residual_probability) || (r.treatment && r.treatment !== 'Mitigate'));

async function carregar() {
    const c = R.ctx;
    const [riscos, motivos, partes] = await Promise.all([api('GET', url(c, '/riscos')), opcional(() => api('GET', url(c, '/riscos/motivos')), []),
        R.partes ? Promise.resolve(R.partes) : opcional(() => api('GET', `/api/v1/projects/${c.projectId}/partes`), [])]);
    R.partes = lista(partes, 'partes');
    R.riscos = lista(riscos, 'riscos').slice().sort((a, b) => (a.idr ?? 1e9) - (b.idr ?? 1e9));
    R.motivos = lista(motivos, 'motivos').filter((m) => m && m.nome);
}

function desenhar() {
    const ed = R.ctx.editavel;
    const linhas = R.riscos.map((r) => {
        const t = tratado(r);
        const aceitar = podeAceitar(r) ? `<button type="button" class="btn btn-sm" data-action="atRiscoAceitar" data-args='${args(r.id)}' aria-label="${escapeHTML(`Aceitar o risco ${idr(r.idr)}: ${r.threat}`)}">Aceitar risco</button>` : '';
        const acoes = ed ? `<div class="acoes-linha"><button type="button" class="btn btn-sm" data-action="atRiscoTratar" data-args='${args(r.id)}' aria-label="${escapeHTML(`Tratar o risco ${idr(r.idr)}: ${r.threat}`)}">Tratar</button>${aceitar}${renderMaisAcoes([
            { rotulo: 'Editar', action: 'atRiscoEditar', args: [r.id] }, { rotulo: 'Excluir', action: 'atRiscoExcluir', args: [r.id], perigo: true }], { nome: `${idr(r.idr)} ${r.threat}` })}</div>` : '';
        const aceite = linhaDeAceite(r);
        const estrategia = t ? escapeHTML(ESTRATEGIA_ROTULO[r.treatment] || r.treatment || '—') : '<span class="t-dim">—</span>';
        return [escapeHTML(idr(r.idr)), escapeHTML(r.threat), selo(r.risk_level), aceite ? `${estrategia}<p class="at-nota">${aceite}</p>` : estrategia,
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
                <p class="at-nota" id="at-rk-motivo-d">Escolha um da lista — riscos comuns de privacidade e os já usados neste projeto — ou escreva um novo.</p></div>
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

// ─── Tratar Risco (spec 2026-10-19): o modal do legado em três abas, também aberto pela lista de Riscos do projeto ───
// Risco (só leitura), Tratamento (Estratégia, Descrição, Responsável, Status e Data prevista, todos obrigatórios) e Risco residual
// (calculado ao vivo e por "Recalcular"; o servidor recalcula e é a verdade). Status: Pendente é o risco aberto, Concluído o fechado
// (`Closed`); o status só vai no corpo quando muda, para não desfazer um aceite (`Accepted`) que a tela não mostra.
const SUBABAS_TR = [['risco', 'Risco'], ['tratamento', 'Tratamento'], ['residual', 'Risco residual']];
const STATUS_TR = [['Open', 'Pendente'], ['Closed', 'Concluído']];
let T = null; // { projectId, risco, aoGravar, sub }
const statusTr = (r) => (r.status === 'Closed' ? 'Closed' : 'Open');
const rotuloDe = (escala, n) => (escala.find(([v]) => v === Number(n)) || [0, '—'])[1];
const leitura = (rotulo, valor) => `<div class="form-group"><span class="form-label">${rotulo}</span><p class="at-nota">${valor}</p></div>`;
const opcoesTr = (pares, atual) => pares.map(([v, rot]) => `<option value="${escapeHTML(v)}" ${v === atual ? 'selected' : ''}>${escapeHTML(rot)}</option>`).join('');

/** `risco` no formato de GET /riscos (com `ropa_id`); `partes` do projeto (só pessoas entram); `aoGravar` depois do PUT. */
export function abrirTratarRisco({ projectId, risco: r, partes = [], aoGravar }) {
    T = { projectId, risco: r, aoGravar, sub: 'risco' };
    const pessoas = partes.filter((p) => p && p.status !== 'inativa' && (!p.tipo || p.tipo === 'pessoa'));
    const painel = (id, corpo) => `<div role="tabpanel" id="at-rk-p-${id}" aria-labelledby="at-rk-sub-${id}" ${id === T.sub ? '' : 'hidden'} class="d-flex flex-col gap-3">${corpo}</div>`;
    const semPessoa = pessoas.length ? '' : '<p class="at-nota" id="at-rk-resp-d">Nenhuma pessoa cadastrada ainda. Cadastre quem responde pelo risco em Pessoas.</p>';
    const nivel = r.risk_level || (r.probability && r.impact ? nivelDaNota(r.probability, r.impact) : null);
    openModal(`<h2 class="modal-title" id="at-rk-modal-t">Tratar Risco ${escapeHTML(idr(r.idr))}</h2>
        <div class="abas" role="tablist" aria-label="Seções do tratamento">${SUBABAS_TR.map(([id, rot]) =>
            `<button type="button" role="tab" class="aba" id="at-rk-sub-${id}" aria-controls="at-rk-p-${id}" aria-selected="${id === T.sub}" tabindex="${id === T.sub ? 0 : -1}"
                data-action="atRiscoSub" data-args='${args(id)}' data-action-keydown="atRiscoSubTecla" data-arg-event><span>${rot}</span></button>`).join('')}</div>
        <form id="at-rk-form" data-action-submit="atRiscoTratarGravar" data-prevent novalidate class="d-flex flex-col gap-3 mt-3" data-action-input="atRiscoTratarMudou" data-action-change="atRiscoTratarMudou">
            ${painel('risco', `${leitura('Motivo', escapeHTML(r.threat || '—'))}${leitura('Descrição', escapeHTML(r.vulnerability || '—'))}
                ${leitura('Probabilidade', escapeHTML(rotuloDe(PROBABILIDADE, r.probability)))}${leitura('Impacto', escapeHTML(rotuloDe(IMPACTO, r.impact)))}
                ${leitura('Risco', selo(nivel))}`)}
            ${painel('tratamento', `<div class="form-group"><label class="form-label" for="at-rk-estr">Estratégia ${obrigatorio}</label>
                    <select class="form-input" id="at-rk-estr" required aria-required="true"><option value="">Selecione uma opção</option>${opcoesTr(Object.entries(ESTRATEGIA_ROTULO), tratado(r) ? r.treatment : '')}</select></div>
                <div class="form-group"><label class="form-label" for="at-rk-plano">Descrição ${obrigatorio}</label>
                    <textarea class="form-input" id="at-rk-plano" rows="4" maxlength="5000" required aria-required="true">${escapeHTML(r.treatment_plan || '')}</textarea></div>
                <div class="form-group"><label class="form-label" for="at-rk-resp">Responsável ${obrigatorio}</label>
                    <select class="form-input" id="at-rk-resp" required aria-required="true" ${semPessoa ? 'aria-describedby="at-rk-resp-d"' : ''}><option value="">Selecione uma pessoa</option>${opcoesTr(pessoas.map((p) => [p.id, p.nome]), r.owner_parte_id || '')}</select>${semPessoa}</div>
                <div class="form-group"><label class="form-label" for="at-rk-status">Status ${obrigatorio}</label>
                    <select class="form-input" id="at-rk-status" required aria-required="true">${opcoesTr(STATUS_TR, statusTr(r))}</select></div>
                <div class="form-group"><label class="form-label" for="at-rk-prazo">Data prevista para conclusão ${obrigatorio}</label>
                    <input class="form-input" type="date" id="at-rk-prazo" required aria-required="true" value="${escapeHTML(r.treatment_due_date ? String(r.treatment_due_date).slice(0, 10) : '')}"></div>`)}
            ${painel('residual', `<div class="form-group"><label class="form-label" for="at-rk-rprob">Probabilidade</label><select class="form-input" id="at-rk-rprob">${opcoesNota(PROBABILIDADE, r.residual_probability, 'Não avaliada')}</select></div>
                <div class="form-group"><label class="form-label" for="at-rk-rimp">Impacto</label><select class="form-input" id="at-rk-rimp">${opcoesNota(IMPACTO, r.residual_impact, 'Não avaliado')}</select></div>
                <p class="form-label">Risco residual: <span id="at-rk-residual" role="status"></span></p>
                <div><button type="button" class="btn btn-sm" data-action="atRiscoRecalcular">Recalcular</button></div>`)}
            <p class="re-erro" id="at-rk-erro" role="alert"></p>
            <div class="acoes-rodape"><button type="submit" class="btn btn-primary" id="at-rk-gravar">Gravar</button></div></form>`, 'modal-large');
    window.atRiscoTratarMudou();
}

window.atRiscoTratar = function (id) {
    const r = R.riscos.find((x) => x.id === id);
    if (r) abrirTratarRisco({ projectId: R.ctx.projectId, risco: { ...r, ropa_id: R.ctx.ropaId }, partes: R.partes, aoGravar: recarregar });
};
// Delegação do clique com o evento antes (o par clique+teclado compartilha data-arg-event): o id é sempre o último argumento.
window.atRiscoSub = function (...a) {
    const id = a[a.length - 1];
    T.sub = id;
    for (const [s] of SUBABAS_TR) {
        const aba = el(`at-rk-sub-${s}`);
        aba.setAttribute('aria-selected', String(s === id));
        aba.tabIndex = s === id ? 0 : -1;
        el(`at-rk-p-${s}`).hidden = s !== id;
    }
};
window.atRiscoSubTecla = function (e, id) {
    const i = SUBABAS_TR.findIndex(([s]) => s === id);
    const n = SUBABAS_TR.length;
    const prox = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
    if (prox === undefined) return;
    e.preventDefault();
    window.atRiscoSub(SUBABAS_TR[prox][0]);
    el(`at-rk-sub-${SUBABAS_TR[prox][0]}`).focus();
};
window.atRiscoRecalcular = function () {
    const p = Number(el('at-rk-rprob').value);
    const i = Number(el('at-rk-rimp').value);
    el('at-rk-residual').innerHTML = p && i ? selo(nivelDoEscore(p * i)) : '<span class="t-dim">a calcular...</span>';
};
// Os obrigatórios ficam na aba Tratamento. O botão não fica desabilitado em silêncio (quem só preenchia o Risco residual clicava em
// Gravar e nada acontecia): ao gravar sem eles, a tela diz o que falta, abre a aba Tratamento e põe o foco no primeiro campo.
const OBRIGATORIOS_TR = [['at-rk-estr', 'Estratégia'], ['at-rk-plano', 'Descrição'], ['at-rk-resp', 'Responsável'], ['at-rk-status', 'Status'], ['at-rk-prazo', 'Data prevista para conclusão']];
window.atRiscoTratarMudou = function () {
    window.atRiscoRecalcular();
    if (el('at-rk-erro').dataset.faltam && !OBRIGATORIOS_TR.some(([id]) => !el(id).value.trim())) { el('at-rk-erro').textContent = ''; delete el('at-rk-erro').dataset.faltam; }
};
window.atRiscoTratarGravar = async function () {
    const botao = el('at-rk-gravar');
    if (!botao || botao.disabled || !T) return;
    const faltam = OBRIGATORIOS_TR.filter(([id]) => !el(id).value.trim());
    if (faltam.length) {
        el('at-rk-erro').textContent = `Para gravar, preencha na aba Tratamento: ${faltam.map(([, rot]) => rot).join(', ')}.`;
        el('at-rk-erro').dataset.faltam = '1';
        window.atRiscoSub('tratamento');
        el(faltam[0][0]).focus();
        return;
    }
    const p = Number(el('at-rk-rprob').value);
    const i = Number(el('at-rk-rimp').value);
    if (!!p !== !!i) { el('at-rk-erro').textContent = 'Informe a probabilidade e o impacto residuais, ou deixe as duas em branco.'; return; }
    const status = el('at-rk-status').value;
    const corpo = { treatment: el('at-rk-estr').value, treatment_plan: el('at-rk-plano').value.trim(), owner_parte_id: el('at-rk-resp').value,
        treatment_due_date: el('at-rk-prazo').value, residual_probability: p || null, residual_impact: i || null,
        ...(status !== statusTr(T.risco) ? { status } : {}) };
    botao.disabled = true;
    try { await api('PUT', `/api/v1/projects/${T.projectId}/ropa/${T.risco.ropa_id}/riscos/${T.risco.id}`, corpo); }
    catch (e) { el('at-rk-erro').textContent = (e && e.message) || 'Não foi possível gravar o tratamento.'; botao.disabled = false; return; }
    forceCloseModal();
    showToast('Tratamento registrado.', 'success');
    try { if (T.aoGravar) await T.aoGravar(); } catch (e) { falha(e, 'Não foi possível atualizar a lista'); }
};

window.atRiscoAceitar = async function (id) {
    try { if (!(await aceitarRisco(api, url(R.ctx, `/riscos/${id}`)))) return; showToast('Risco aceito.', 'success'); await recarregar(); }
    catch (e) { falha(e, 'Não foi possível aceitar o risco'); }
};

window.atRiscoExcluir = async function (id) {
    const r = R.riscos.find((x) => x.id === id);
    if (!r) return;
    if (!(await confirmar(`Excluir o risco ${idr(r.idr)} (${r.threat})? As ações ligadas a ele continuam, sem o vínculo.`, { titulo: 'Excluir risco', rotulo: 'Excluir', perigo: true }))) return;
    try { await api('DELETE', url(R.ctx, `/riscos/${id}`)); showToast('Risco excluído.', 'success'); await recarregar(); }
    catch (e) { falha(e, 'Não foi possível excluir o risco'); }
};

export async function montar(painel, ctx) {
    R = { painel, ctx, riscos: [], motivos: [], partes: null, m: null };
    painel.innerHTML = '<p class="at-nota" role="status">Carregando os riscos...</p>';
    try { await carregar(); desenhar(); }
    catch (e) { painel.innerHTML = `<p class="re-erro" role="alert">Não foi possível carregar os riscos. ${escapeHTML((e && e.message) || '')}</p>`; }
    return { esvaziar: () => Promise.resolve() };
}
