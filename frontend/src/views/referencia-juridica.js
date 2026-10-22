import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, escapeHTML, formatarData, tituloDaTela } from '../ui.js';

// Referência jurídica (n.privacy, spec 2026-10-20, frente 2): consulta só de leitura da LGPD, das resoluções da ANPD e das seis
// bases do GDPR, com a busca e o selo "Validado juridicamente". Só o platform_admin valida os mapeamentos com a ISO, e o servidor
// grava QUEM está logado: esta tela nunca envia o nome de quem valida. Todo texto do servidor é escapado.

const ABAS = [['lgpd', 'LGPD'], ['anpd', 'ANPD'], ['gdpr', 'GDPR']];
const ehAdmin = () => !!S.user && S.user.role === 'platform_admin';
const lista = (r) => (Array.isArray(r) ? r : []);
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const BASES_LGPD = ['lgpd:art7', 'lgpd:art11'];

// A tela guarda o que carregou: buscar e trocar de aba redesenham só o painel, sem nova chamada e sem tirar o foco da busca.
let carga = null;
let validando = null; // null | { propostos, validados }: a confirmação em duas etapas (o app não usa confirm())

/** Linhas que casam com a busca (referência e título, sem caixa nem acento); o pai fica se algum filho casa. */
export function filtrarLinhas(reqs, busca) {
    const q = semAcento(busca).trim();
    if (!q) return reqs;
    const casa = (r) => semAcento(`${r.referencia} ${r.titulo}`).includes(q);
    const paisComFilho = new Set(reqs.filter((r) => r.pai_id && casa(r)).map((r) => r.pai_id));
    return reqs.filter((r) => casa(r) || paisComFilho.has(r.id));
}

function linhaHtml(r) {
    const selo = r.validado_por
        ? `${window.renderStatusBadge('Validado juridicamente', 'success')}
           <span class="rj-quem">Validado por ${escapeHTML(r.validado_por)} em ${formatarData(r.validado_em, { vazio: '' })}</span>`
        : '<span class="rj-quem">Sem validação jurídica</span>';
    return `<tr class="${r.pai_id ? 'rj-filho' : 'rj-pai'}"><th scope="row" class="rj-ref">${escapeHTML(r.referencia)}</th><td>${escapeHTML(r.titulo)}</td><td>${selo}</td></tr>`;
}

function tabelaHtml(reqs, legenda) {
    return `<table class="rj-tabela"><caption class="sr-only">${escapeHTML(legenda)}</caption>
        <thead><tr><th scope="col">Referência</th><th scope="col">Título</th><th scope="col">Mapeamento com a ISO</th></tr></thead>
        <tbody>${reqs.map(linhaHtml).join('')}</tbody></table>`;
}

function basesGdprHtml(bases, busca) {
    const q = semAcento(busca).trim();
    const vistas = bases.filter((b) => !q || semAcento(`${b.rotulo} ${b.texto}`).includes(q));
    if (!vistas.length) return window.renderEmptyState({ titulo: 'Nenhuma base encontrada', texto: 'Mude a busca para ver outras.' });
    return `<p class="rj-aviso">As seis bases legais do tratamento no GDPR (art. 6).</p>
        <ul class="rj-bases">${vistas.map((b) => `<li class="rj-base"><h3 class="rj-base-t">${escapeHTML(b.rotulo)}</h3><p>${escapeHTML(b.texto)}</p></li>`).join('')}</ul>`;
}

function painelHtml() {
    const { aba, busca } = carga;
    if (aba === 'gdpr') return basesGdprHtml(carga.gdpr, busca);
    const reqs = carga[aba];
    if (!reqs.length) return window.renderEmptyState({ titulo: 'Catálogo ainda não carregado', texto: 'O catálogo é carregado pelo administrador da plataforma, em Cobertura da LGPD.' });
    const vistos = filtrarLinhas(reqs, busca);
    if (!vistos.length) return window.renderEmptyState({ titulo: 'Nenhum resultado', texto: 'Mude a busca para ver outros artigos.' });
    const contagem = `<p class="cob-contagem" role="status">${vistos.length} ${vistos.length === 1 ? 'item' : 'itens'}${busca.trim() ? ` de ${reqs.length}` : ''}</p>`;
    if (aba !== 'lgpd') return contagem + tabelaHtml(vistos, 'Resoluções da ANPD');
    // Os artigos 7 e 11 (bases legais) vão juntos, em destaque, antes dos demais.
    const ehBase = (r) => BASES_LGPD.includes(r.id) || BASES_LGPD.includes(r.pai_id);
    const bases = vistos.filter(ehBase), demais = vistos.filter((r) => !ehBase(r));
    return contagem + (bases.length ? `<section class="rj-bases-legais" aria-labelledby="rj-bases-t"><h2 id="rj-bases-t" class="cob-titulo">Bases legais</h2>
        <p class="rj-aviso">Art. 7 (dados pessoais) e art. 11 (dados sensíveis): o tratamento precisa de uma delas.</p>${tabelaHtml(bases, 'Bases legais da LGPD')}</section>` : '')
        + (demais.length ? `<h2 class="cob-titulo">Demais artigos</h2>${tabelaHtml(demais, 'Artigos da LGPD')}` : '');
}

function validacaoHtml() {
    if (!ehAdmin()) return '';
    if (!validando) return '<button type="button" class="btn" data-action="pedirValidacaoJuridica">Validar mapeamentos propostos</button>';
    const { propostos, validados } = validando;
    if (!propostos) return `<p class="rj-aviso" role="status">Nenhum mapeamento proposto. ${validados} já validados.</p>
        <button type="button" class="btn btn-ghost" data-action="cancelarValidacaoJuridica">Fechar</button>`;
    return `<div class="rj-confirma" role="group" aria-label="Confirmar a validação jurídica">
        <p><strong>${propostos}</strong> mapeamentos propostos e <strong>${validados}</strong> já validados. Validar registra seu e-mail e a data de hoje como quem validou.</p>
        <button type="button" class="btn btn-primary" data-action="confirmarValidacaoJuridica">Validar ${propostos} mapeamentos</button>
        <button type="button" class="btn btn-ghost" data-action="cancelarValidacaoJuridica">Cancelar</button></div>`;
}

function abasHtml() {
    return `<div class="abas" role="tablist" aria-label="Fonte jurídica">${ABAS.map(([id, rot]) =>
        `<button type="button" role="tab" id="rj-aba-${id}" class="aba" aria-selected="${id === carga.aba}" aria-controls="rj-painel" data-action="abaReferenciaJuridica" data-args='${escapeHTML(JSON.stringify([id]))}'>${rot}</button>`).join('')}</div>`;
}

function redesenhar() {
    if (!carga) return;
    const p = document.getElementById('rj-painel');
    if (p) p.innerHTML = painelHtml();
    const v = document.getElementById('rj-validacao');
    if (v) v.innerHTML = validacaoHtml();
    document.querySelectorAll('[id^="rj-aba-"]').forEach((b) => b.setAttribute('aria-selected', String(b.id === `rj-aba-${carga.aba}`)));
}

async function renderReferenciaJuridica(c, h, a) {
    h.textContent = tituloDaTela('nav-referencia-juridica', 'Referência jurídica');
    a.innerHTML = '';
    carga = null; validando = null;
    let lgpd, anpd, gdpr;
    try {
        [lgpd, anpd, gdpr] = await Promise.all([
            api('GET', '/api/v1/requisitos?fonte=lgpd'), api('GET', '/api/v1/requisitos?fonte=anpd'), api('GET', '/api/v1/requisitos/gdpr-bases'),
        ]);
    } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar a referência jurídica.', e); return; }
    carga = { aba: S.refJuridicaAba || 'lgpd', busca: S.refJuridicaBusca || '', lgpd: lista(lgpd), anpd: lista(anpd), gdpr: lista(gdpr) };
    c.innerHTML = `<p class="rj-aviso">Consulta para o dia a dia do encarregado. Os títulos são resumos próprios; a norma oficial é a fonte.</p>
        <div id="rj-validacao" class="rj-validacao">${validacaoHtml()}</div>
        ${abasHtml()}
        <div class="form-group cob-busca"><label class="form-label" for="rj-busca">Buscar</label>
            <input type="search" class="form-input" id="rj-busca" placeholder="Artigo ou assunto, por exemplo consentimento" value="${escapeHTML(carga.busca)}" data-action-input="buscarReferenciaJuridica" data-arg-val></div>
        <div id="rj-painel" role="tabpanel" tabindex="0">${painelHtml()}</div>`;
    redesenhar();
}

window.abaReferenciaJuridica = function (aba) {
    if (!carga || !ABAS.some(([id]) => id === aba)) return;
    S.refJuridicaAba = aba;
    carga.aba = aba;
    redesenhar();
};

window.buscarReferenciaJuridica = function (valor) {
    S.refJuridicaBusca = String(valor || '');
    if (!carga) return;
    carga.busca = S.refJuridicaBusca;
    redesenhar();
};

window.pedirValidacaoJuridica = async function () {
    if (!ehAdmin()) return;
    try { validando = await api('GET', '/api/v1/requisitos/mapeamentos/resumo'); } catch (e) { showToast((e && e.message) || 'Não foi possível contar os mapeamentos', 'error'); return; }
    redesenhar();
};

window.cancelarValidacaoJuridica = function () { validando = null; redesenhar(); };

// Sem nome no corpo: quem valida é o e-mail da sessão, gravado pelo servidor.
window.confirmarValidacaoJuridica = async function () {
    if (!ehAdmin()) return;
    try {
        const r = await api('POST', '/api/v1/requisitos/mapeamentos/validar', {});
        showToast(`${r.validados} mapeamentos validados.`, 'success');
    } catch (e) { showToast((e && e.message) || 'Não foi possível validar os mapeamentos', 'error'); return; }
    validando = null;
    window.render();
};

window.renderReferenciaJuridica = renderReferenciaJuridica;
