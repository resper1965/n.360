import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, escapeHTML, renderEmptyState, renderStatusBadge } from '../ui.js';
import { montarLista, colunasDe } from '../lista.js';
import { navigate } from '../router.js';

// Organizar políticas (PR3 das políticas temáticas): leva as políticas por controle (uma por controle, vindas da importação)
// para as temáticas, e liga o controle sem política a uma. Cada ato é de uma pessoa da equipe; a regra é do servidor.

const lista = (r) => (Array.isArray(r) ? r : []);
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const projetoId = () => (S.activeProject || (S.projects || [])[0] || {}).id;
const equipe = () => typeof window.ehEquipeNess === 'function' && window.ehEquipeNess();
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');
const STATUS = { rascunho: ['Rascunho', 'info'], vigente: ['Vigente', 'success'] };
const PREFIXO = 'iso27001:2022:';
/** Tema do catálogo que cobre o controle (pelo código A.x.y do requisito) e ainda não tem política. */
const temaSugerido = (temas, requisitoId) => {
    const cod = String(requisitoId || '').startsWith(PREFIXO) ? requisitoId.slice(PREFIXO.length) : null;
    const t = cod && temas.find((x) => !x.documento_id && lista(x.controles).includes(cod));
    return t ? t.codigo : null;
};
const opcoesTematicas = () => lista(S.organizar && S.organizar.tematicas).map((t) => `<option value="${escapeHTML(t.id)}">${escapeHTML(t.titulo)}</option>`).join('');

async function renderOrganizarPoliticas(c, h, a) {
    h.textContent = 'Organizar políticas';
    a.innerHTML = '';
    if (!equipe()) { c.innerHTML = renderEmptyState({ titulo: 'Só a equipe da consultoria organiza políticas.' }); return; }
    const pid = projetoId();
    if (!pid) { c.innerHTML = window.renderSemProjeto(); return; }
    let org;
    try { org = await api('GET', `/api/v1/projects/${pid}/politicas/organizar`); } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar as políticas.', e); return; }
    let cob = null;
    try { const r = await api('GET', `/api/v1/projects/${pid}/documentos/cobertura`); if (r && r.aplicaveis) cob = r; } catch (e) { /* sem o indicador, a tela segue */ }
    let temas = [];
    try { temas = lista((await api('GET', `/api/v1/projects/${pid}/politicas/temas`) || {}).temas); } catch (e) { /* sem sugestão, o modal abre sem seleção */ }
    S.organizar = org;
    const porControle = lista(org.por_controle);
    const semCob = lista(org.sem_cobertura);
    const temTematicas = lista(org.tematicas).length > 0;

    const celulas = (d) => {
        const [rotulo, tom] = STATUS[d.status] || [d.status, 'info'];
        return [
            escapeHTML(d.titulo), escapeHTML(d.controle || '—'), renderStatusBadge(rotulo, tom),
            `<button class="btn btn-ghost btn-sm" data-action="abrirPolitica" data-args='${args(pid, d.id)}'>Abrir</button>
             ${temTematicas ? `<button class="btn btn-ghost btn-sm" data-action="abrirIncorporar" data-args='${args(pid, d.id)}'>Incorporar a…</button>` : '<span class="t-sm t-dim">Incorporar indisponível: não há política temática.</span>'}
             <button class="btn btn-ghost btn-sm" data-action="abrirPromover" data-args='${args(pid, d.id)}'>Promover a temática</button>`,
        ];
    };
    c.innerHTML = `${cob ? `<p id="org-cobertura" class="mt-0 mb-4"><strong>${cob.cobertos} de ${cob.aplicaveis}</strong> controles aplicáveis cobertos por política vigente</p>` : ''}
        <h3>Políticas por controle</h3>
        ${!temTematicas && porControle.length ? '<p class="t-sm t-dim">Crie uma política temática (Nova política) para poder incorporar as políticas por controle a ela.</p>' : ''}
        <div id="org-por-controle"></div>
        <h3>Controles sem política</h3>
        ${semCob.length ? `<ul class="t-sm">${semCob.map((k) => `<li>${escapeHTML(k.title)}
            ${!k.requisito_id ? '<span class="t-sm t-dim">Controle fora do catálogo de requisitos.</span>'
            : temTematicas ? `<button class="btn btn-ghost btn-sm" data-action="abrirLigarControle" data-args='${args(pid, k.id)}'>Ligar a uma política</button>`
            : '<span class="t-sm t-dim">Ligar indisponível: não há política temática.</span>'}
            <button class="btn btn-ghost btn-sm" data-action="openNovaPoliticaModal" data-args='${args(pid, temaSugerido(temas, k.requisito_id))}'>Criar política do tema sugerido</button></li>`).join('')}</ul>`
        : renderEmptyState({ titulo: 'Todos os controles aplicáveis têm política vigente.', compacto: true })}`;
    montarLista(c.querySelector('#org-por-controle'), {
        id: 'organizar-politicas',
        linhas: porControle,
        colunas: colunasDe(['Política', 'Controle', 'Situação', 'Ações'], celulas),
        busca: (d) => `${d.titulo} ${d.controle || ''}`,
        vazio: { titulo: 'Não há políticas por controle a organizar.' },
    });
}

function modalDestino(titulo, rotuloBotao, acao, pid, id) {
    openModal(`<div class="modal-header"><span class="modal-title">${escapeHTML(titulo)}</span></div>
        <div class="form-group"><label class="form-label" for="org-destino">Política temática</label><select class="form-input" id="org-destino">${opcoesTematicas()}</select></div>
        <button class="btn btn-primary" data-action="${acao}" data-args='${args(pid, id)}'>${escapeHTML(rotuloBotao)}</button>`);
}

async function depois(fn, padrao, ok) {
    try { await fn(); window.forceCloseModal?.(); showToast(ok, 'success'); window.render(); } catch (e) { falha(e, padrao); }
}

window.abrirIncorporar = (pid, id) => modalDestino('Incorporar a uma política temática', 'Incorporar', 'incorporarPolitica', pid, id);
window.incorporarPolitica = (pid, origem) => depois(
    () => api('POST', `/api/v1/projects/${pid}/politicas/organizar/incorporar`, { origem, destino: el('org-destino').value }),
    'Não foi possível incorporar', 'Política incorporada. A versão antiga fica no histórico.');

window.abrirLigarControle = (pid, id) => modalDestino('Ligar o controle a uma política', 'Ligar', 'ligarControle', pid, id);
window.ligarControle = async function (pid, controleId) {
    const destino = el('org-destino').value;
    await depois(async () => {
        const k = lista(S.organizar && S.organizar.sem_cobertura).find((x) => x.id === controleId);
        if (!k || !k.requisito_id) throw new Error('Este controle não está ligado a um requisito do catálogo');
        const atuais = lista(await api('GET', `/api/v1/projects/${pid}/documentos/${destino}/requisitos`)).map((r) => r.id);
        await api('PUT', `/api/v1/projects/${pid}/documentos/${destino}/requisitos`, { requisitos: [...new Set([...atuais, k.requisito_id])] });
    }, 'Não foi possível ligar o controle', 'Controle ligado à política.');
};

window.abrirPromover = async function (pid, id) {
    const d = lista(S.organizar && S.organizar.por_controle).find((x) => x.id === id);
    if (!d) return;
    let reqs = [];
    try { reqs = lista(await api('GET', '/api/v1/requisitos?fonte=iso27001:2022')); } catch (e) { falha(e, 'Não foi possível carregar o catálogo de requisitos'); return; }
    openModal(`<div class="modal-header"><span class="modal-title">Promover a política temática</span></div>
        <div class="form-group"><label class="form-label" for="org-titulo">Título</label><input class="form-input" id="org-titulo" maxlength="300" value="${escapeHTML(d.titulo)}"></div>
        <div class="form-group"><label class="form-label" for="org-reqs">Requisitos</label><select class="form-input" id="org-reqs" multiple size="8">${reqs.map((r) => `<option value="${escapeHTML(r.id)}" ${r.id === d.requisito_id ? 'selected' : ''}>${escapeHTML(r.referencia)} ${escapeHTML(r.titulo)}</option>`).join('')}</select></div>
        <button class="btn btn-primary" data-action="promoverPolitica" data-args='${args(pid, id)}'>Promover</button>`);
};
window.promoverPolitica = function (pid, id) {
    const titulo = el('org-titulo').value.trim();
    const requisitos = [...el('org-reqs').selectedOptions].map((o) => o.value);
    if (!titulo || !requisitos.length) { showToast('Informe o título e ao menos um requisito', 'error'); return; }
    return depois(() => api('POST', `/api/v1/projects/${pid}/documentos/${id}/promover`, { titulo, requisitos }),
        'Não foi possível promover', 'Política promovida a temática.');
};

window.abrirOrganizarPoliticas = () => navigate('organizar-politicas');
window.renderOrganizarPoliticas = renderOrganizarPoliticas;
