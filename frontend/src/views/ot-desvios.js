import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, renderDataTable, renderStatusBadge, openModal, showToast, formatarData } from '../ui.js';
import { mensagemDeErro, podeEditarOt, lista, opcoes, semRepetir } from '../ot-comum.js';
import { hojeSP, emDiasSP } from '../hoje.js';

// n.ot, aba "Desvios" (spec n-ot-desvio §5) sobre /ot/desvios (src/routes/ot.ts). A API decide o que cada pessoa vê (IP só a quem vê
// o inventário completo); aqui só se escondem as ações que ela recusaria. Aceitar é do Gestor ARCiber (org_admin) e não substitui a exceção 5.1.1.

const el = (id) => document.getElementById(id);
const proj = () => S.activeProject;
const args = (...xs) => escapeHTML(JSON.stringify(xs));
const falhou = (e, padrao) => showToast(mensagemDeErro(e, padrao), 'error');
const SITUACAO = { aberto: ['warning', 'Aberto'], tratado: ['info', 'Tratado'], aceito: ['neutral', 'Aceito'], regularizado: ['success', 'Regularizado'] };
const TIPO = { fluxo: 'Fluxo', ativo: 'Ativo' };
const PRAZO_MAXIMO = 90; // dias, o mesmo teto do servidor
const podeAceitar = () => S.user?.role === 'org_admin';
let desvios = [];

const ponta = (p) => (p ? `${escapeHTML(p.ativo || '—')}${p.zona ? ` <span class="org-dica">(${escapeHTML(p.zona)})</span>` : ''}` : '—');

// `siteFixo`: tela do site (sem filtro de site). `destacar`: id do desvio a marcar e levar à vista (deep link).
export async function montarDesvios(c, a, p, { siteFixo, destacar } = {}) {
    const f = S.otDesvioFiltro || (S.otDesvioFiltro = { situacao: 'aberto', site_id: '', tipo: '' });
    if (siteFixo) f.site_id = siteFixo;
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    let sites;
    try {
        const [s, d] = await Promise.all([api('GET', `/api/v1/projects/${p.id}/ot/sites`), api('GET', `/api/v1/projects/${p.id}/ot/desvios${q ? `?${q}` : ''}`)]);
        sites = lista(s, 'sites'); desvios = lista(d, 'desvios');
    } catch (e) { c.innerHTML = `<p class="org-dica" role="alert">${escapeHTML(mensagemDeErro(e, 'Não foi possível carregar os desvios do n.ot.'))}</p>`; return; }
    // Sem sonda no site, o vazio vira o próximo passo; a falha da leitura (inclui 403) deixa o texto neutro.
    const semSonda = siteFixo && !desvios.length
        && await api('GET', `/api/v1/projects/${p.id}/ot/sites/${encodeURIComponent(siteFixo)}/sensores`).then((r) => !lista(r, 'sensores').length, () => false);
    const vazio = !siteFixo || desvios.length ? { emptyMessage: 'Nenhum desvio neste recorte.', emptyHint: 'Os desvios aparecem quando uma sonda vê tráfego fora do inventário aprovado.' }
        : semSonda ? { emptyMessage: 'Sem vigilância de rede neste site', emptyHint: 'Cadastre uma sonda para ver o tráfego fora do inventário aprovado.' }
            : { emptyMessage: 'Nenhum desvio aberto', emptyHint: 'Os desvios aparecem quando uma sonda vê tráfego fora do inventário aprovado.' };
    const filtro = (id, rotulo, campo, itens) => `<div class="form-group"><label class="form-label" for="${id}">${rotulo}</label>
        <select class="form-input" id="${id}" data-action-change="otFiltrarDesvios" data-args='${args(campo)}'>${opcoes([['', 'Todos'], ...itens], f[campo])}</select></div>`;
    const sit = Object.entries(SITUACAO).map(([v, [, r]]) => [v, r]);
    c.innerHTML = `<p class="org-header-intro">Tráfego que a sonda viu e que o inventário aprovado não prevê. Trate ou aceite cada desvio; o que ficar fora do inventário continua aparecendo.</p>
        <div class="d-flex gap-3">${filtro('des-f-situacao', 'Situação', 'situacao', sit)}${siteFixo ? '' : filtro('des-f-site', 'Site', 'site_id', sites.map((s) => [s.id, s.nome]))}${filtro('des-f-tipo', 'Tipo', 'tipo', Object.entries(TIPO))}</div>
        ${renderDataTable(['Tipo', 'Site', 'Origem', 'Destino', 'Protocolo', 'Visto', 'Ocorrências', 'Situação', 'Ações'], desvios.map(linha),
        vazio)}${semSonda && podeEditarOt() ? '<p><button class="btn" data-action="otTela" data-args=\'["acessos"]\'>Cadastrar sonda</button></p>' : ''}`;
    const alvo = destacar && c.querySelectorAll('tbody tr')[desvios.findIndex((d) => d.id === destacar)];
    if (alvo) { alvo.setAttribute('aria-current', 'true'); alvo.scrollIntoView?.({ block: 'center' }); }
}

function linha(d) {
    const nome = `${TIPO[d.tipo] || d.tipo} em ${d.site_nome}`;
    const ativo = d.tipo === 'ativo';
    const sub = [d.ip, d.fabricante, Array.isArray(d.protocolos_portas) ? d.protocolos_portas.map((x) => (x.porta == null ? x.protocolo : `${x.protocolo}:${x.porta}`)).join(', ') : null].filter(Boolean);
    const aberto = d.situacao === 'aberto';
    const acoes = [aberto && podeEditarOt() && `<button class="btn btn-sm" data-action="otTratarDesvio" data-args='${args(d.id)}' aria-label="${escapeHTML(`Tratar ${nome}`)}">Tratar</button>`,
        aberto && podeAceitar() && `<button class="btn btn-sm" data-action="otAceitarDesvio" data-args='${args(d.id)}' aria-label="${escapeHTML(`Aceitar temporariamente ${nome}`)}">Aceitar temporariamente</button>`,
        d.achado_id && `<button class="btn btn-sm" data-action="otVerAchadoDesvio" data-args='${args(d.achado_levantamento_id, d.site_id)}' aria-label="${escapeHTML(`Ver achado de ${nome}`)}">Ver achado</button>`].filter(Boolean);
    return [escapeHTML(TIPO[d.tipo] || d.tipo), escapeHTML(d.site_nome),
        ativo ? `${ponta(d.origem)}${sub.length ? `<div class="org-dica f-mono">${escapeHTML(sub.join(' · '))}</div>` : ''}` : ponta(d.origem),
        ativo ? '—' : ponta(d.destino),
        ativo ? '—' : escapeHTML(`${d.protocolo || '—'}${d.porta == null ? '' : `:${d.porta}`}${d.externo ? ' · externo' : ''}`),
        `${escapeHTML(formatarData(d.primeira_vez))} a ${escapeHTML(formatarData(d.ultima_vez))}`, escapeHTML(String(d.ocorrencias ?? 0)),
        renderStatusBadge(...(SITUACAO[d.situacao] || ['neutral', d.situacao]))
        + (d.aceito_ate ? `<div class="org-dica">até ${escapeHTML(formatarData(d.aceito_ate))}</div>` : '') + (d.nota ? `<div class="org-dica">${escapeHTML(d.nota)}</div>` : ''),
        acoes.length ? `<div class="d-flex gap-2">${acoes.join('')}</div>` : '—'];
}

window.otFiltrarDesvios = (campo) => {
    const id = { situacao: 'des-f-situacao', site_id: 'des-f-site', tipo: 'des-f-tipo' }[campo];
    S.otDesvioFiltro = { ...S.otDesvioFiltro, [campo]: el(id).value };
    window.render();
};

// Abre o levantamento em que está o achado rascunho do desvio (na tela do site, Modo projeto).
window.otVerAchadoDesvio = (levId, siteId) => {
    return window.otTela('site', siteId || S.otSite, 'projeto', { otSub: 'levantamento', otLevantamento: levId || null });
};

function modal(titulo, campos, acao, id, rotulo) {
    openModal(`<div class="modal-header"><span class="modal-title">${titulo}</span></div>${campos}
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Cancelar</button><button class="btn btn-primary" data-action="${acao}" data-args='${args(id)}'>${rotulo}</button></div>`);
}

window.otTratarDesvio = (id) => modal('Tratar desvio', `<div class="form-group"><label class="form-label" for="des-nota">Nota</label>
    <textarea class="form-input" id="des-nota" rows="3" maxlength="500" autofocus></textarea><p class="org-dica">O que foi feito. Não escreva IP, nomes ou dados pessoais.</p></div>`, 'otSalvarTratar', id, 'Tratar');

window.otAceitarDesvio = (id) => {
    modal('Aceitar temporariamente', `<p class="org-dica mb-3">Não substitui a exceção formal 5.1.1. O desvio volta a abrir se o prazo vencer.</p>
        <div class="form-group"><label class="form-label" for="des-just">Justificativa</label><textarea class="form-input" id="des-just" rows="3" maxlength="500" autofocus></textarea></div>
        <div class="form-group"><label class="form-label" for="des-ate">Aceito até</label><input class="form-input" type="date" id="des-ate" min="${hojeSP()}" max="${emDiasSP(PRAZO_MAXIMO)}">
        <p class="org-dica">No máximo ${PRAZO_MAXIMO} dias.</p></div>`, 'otSalvarAceite', id, 'Aceitar');
};

const enviar = (acao, id, corpo, ok, erro) => semRepetir(acao, async () => {
    // Um literal por ação: o contrato tela-API (varredura estática) precisa enxergar cada caminho.
    try {
        if (acao === 'otSalvarTratar') await api('POST', `/api/v1/projects/${proj().id}/ot/desvios/${encodeURIComponent(id)}/tratar`, corpo);
        else await api('POST', `/api/v1/projects/${proj().id}/ot/desvios/${encodeURIComponent(id)}/aceitar`, corpo);
    } catch (e) {
        if (e?.status === 409) { window.closeModal?.(); showToast('Este desvio já não está aberto.', 'error'); window.render(); return; }
        falhou(e, erro); return;
    }
    window.closeModal?.(); showToast(ok, 'success'); window.render();
});

window.otSalvarTratar = (id) => {
    const nota = el('des-nota').value.trim();
    if (!nota) { showToast('Escreva a nota do tratamento.', 'error'); return; }
    return enviar('otSalvarTratar', id, { nota }, 'Desvio tratado.', 'Não foi possível tratar o desvio.');
};

window.otSalvarAceite = (id) => {
    const justificativa = el('des-just').value.trim();
    const ate = el('des-ate').value;
    if (!justificativa) { showToast('Escreva a justificativa do aceite.', 'error'); return; }
    if (!ate) { showToast(`Informe até quando (no máximo ${PRAZO_MAXIMO} dias).`, 'error'); return; }
    return enviar('otSalvarAceite', id, { justificativa, ate }, 'Desvio aceito.', 'Não foi possível aceitar o desvio.');
};
