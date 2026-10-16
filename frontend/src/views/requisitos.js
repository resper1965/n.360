import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, escapeHTML, formatarData, tituloDaTela } from '../ui.js';
import { produtoAtual } from '../produto.js';

// Catálogo de requisitos (fatia 2 do núcleo): fontes (ISO 27001, ISO 27701, LGPD, GDPR), cada requisito com as
// equivalências validadas pelo jurídico e, nas leis, a cobertura do projeto. Toda regra é do servidor
// (`lacunasDaFonte`, src/services/requisitos.ts); aqui só se mostra, filtra e chama. Todo texto é escapado.

const SITUACAO = { coberto: ['Coberto', 'success'], parcial: ['Parcial', 'warning'], lacuna: ['Lacuna', 'danger'] };
const TIPO_MAPA = { equivalente: 'Equivalente', parcial: 'Parcial', relacionado: 'Relacionado' };
const ORIGEM = { documento: 'Documento', evidencia: 'Evidência', controle: 'Controle' };
const FONTES_COM_COBERTURA = ['lgpd', 'gdpr'];
// Lacuna primeiro: é onde há o que fazer. A ordem do catálogo (a do servidor) desempata.
const PESO = { lacuna: 0, parcial: 1, coberto: 2 };
const FILTROS = ['lacuna', 'parcial', 'coberto', 'todas'];
// O que fazer, dito uma vez acima da lista (não em cada linha).
const COMO_AVANCAR = {
    lacuna: 'Para cobrir uma lacuna, ligue a ela um documento vigente: em Documentos, abra o documento e use Ligar requisito.',
    parcial: 'Estes requisitos são atendidos em parte. Um documento vigente ligado a cada um os cobre por inteiro.',
};

const ehAdmin = () => !!S.user && S.user.role === 'platform_admin';
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const lista = (r) => (Array.isArray(r) ? r : []);
const args = (...v) => escapeHTML(JSON.stringify(v));
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** O filtro em uso: o escolhido (guardado em `S`) ou, na primeira vez, as lacunas, que é onde o trabalho está. */
export function filtroEfetivo(escolhido, resumo) {
    if (FILTROS.includes(escolhido)) return escolhido;
    return resumo && resumo.lacunas > 0 ? 'lacuna' : 'todas';
}

/**
 * As linhas da tabela: `reqs` do catálogo cruzadas com a cobertura (`Map` por requisito_id), filtradas por situação e por
 * texto (referência, título e título da origem, sem caixa nem acento) e ordenadas lacuna, parcial, coberto.
 */
export function selecionarLinhas(reqs, cobertura, filtro, busca) {
    const q = semAcento(busca).trim();
    return reqs
        .map((r, i) => ({ r, cob: cobertura.get(r.id), i }))
        .filter(({ r, cob }) => (filtro === 'todas' || !FILTROS.includes(filtro) || (cob && cob.situacao === filtro))
            && (!q || semAcento([r.referencia, r.titulo, ...(cob ? cob.origens.map((o) => o.titulo) : [])].join(' ')).includes(q)))
        .sort((a, b) => (PESO[a.cob?.situacao] ?? 3) - (PESO[b.cob?.situacao] ?? 3) || a.i - b.i);
}

// A tela guarda o que carregou: filtrar e buscar redesenham só a lista, sem nova chamada e sem tirar o foco da busca.
let carga = null;

function cartao(valor, rotulo, dica, filtro, ativo, extra = '') {
    return `<button type="button" class="cob-cartao ${extra}" aria-pressed="${ativo}" data-action="filtrarRequisitos" data-args='${args(filtro)}'>
        <span class="cob-num">${escapeHTML(String(valor))}</span><span class="cob-rot">${rotulo}</span><span class="cob-dica">${dica}</span></button>`;
}

function resumoHtml(resumo, filtro) {
    const pct = resumo.total ? Math.round((resumo.cobertos / resumo.total) * 100) : 0;
    return `<section class="cob-resumo" aria-labelledby="cob-resumo-t">
        <h2 id="cob-resumo-t" class="cob-titulo">${escapeHTML(String(resumo.cobertos))} de ${escapeHTML(String(resumo.total))} requisitos cobertos (${pct}%)</h2>
        <div class="cob-cartoes" role="group" aria-label="Mostrar requisitos por situação">
            ${cartao(resumo.lacunas, 'Lacunas', 'Nada atende', 'lacuna', filtro === 'lacuna', 'cob-lacuna')}
            ${cartao(resumo.parciais, 'Parciais', 'Atendem em parte', 'parcial', filtro === 'parcial', 'cob-parcial')}
            ${cartao(resumo.cobertos, 'Cobertos', 'Atendidos', 'coberto', filtro === 'coberto', 'cob-coberto')}
            ${cartao(resumo.total, 'Total', 'Todos os requisitos', 'todas', filtro === 'todas')}
        </div></section>`;
}

const COMO_CALCULA = `<details class="cob-como"><summary>Como a cobertura é calculada</summary>
    <p>Cada requisito da lei fica em uma de três situações, conforme o que o projeto já tem ligado a ele.</p>
    <ul>
        <li><strong>Coberto:</strong> há um documento vigente ligado ao requisito, ou um controle do projeto ligado por equivalência validada pelo jurídico, ou uma evidência conforme e dentro da validade.</li>
        <li><strong>Parcial:</strong> só há um controle ligado por equivalência parcial validada, ou uma evidência parcial.</li>
        <li><strong>Lacuna:</strong> nada disso existe ainda.</li>
    </ul>
    <p>Não contam: documento em rascunho, controle ausente ou não aplicável, e equivalência apenas relacionada ou ainda proposta.
    Para cobrir um requisito, ligue a ele um documento vigente (em Documentos, na ficha do documento).</p></details>`;

function origensHtml(cob) {
    if (!cob) return '<span class="cob-mudo">—</span>';
    if (!cob.origens.length) return '<span class="cob-mudo">Nada ligado ainda</span>';
    return `<ul class="cob-origens">${cob.origens.map((o) => `<li>${ORIGEM[o.tipo] || 'Controle'}: ${escapeHTML(o.titulo)}</li>`).join('')}</ul>`;
}

function tabelaHtml(linhas) {
    const corpo = linhas.map(({ r, cob }) => {
        const [rot, tom] = cob ? SITUACAO[cob.situacao] || [cob.situacao, 'info'] : [null, null];
        const passo = cob && cob.situacao !== 'coberto'
            ? `<button type="button" class="btn btn-sm" data-action="irParaDocumentos" aria-label="${escapeHTML(`Ir a Documentos para cobrir ${r.referencia}`)}">Ir a Documentos</button>` : '';
        return `<tr><th scope="row" class="cob-ref">${escapeHTML(r.referencia)}</th><td>${escapeHTML(r.titulo)}</td>
            <td>${rot ? window.renderStatusBadge(rot, tom) : '—'}</td><td>${origensHtml(cob)}</td>
            <td class="cob-acoes">${passo}<button type="button" class="btn btn-ghost btn-sm" data-action="abrirRequisito" data-args='${args(r.id)}' aria-label="${escapeHTML(`Abrir ${r.referencia}`)}">Abrir</button></td></tr>`;
    }).join('');
    return `<table class="cob-tabela"><caption class="sr-only">Requisitos da lei e a situação de cada um no projeto</caption>
        <thead><tr><th scope="col">Artigo</th><th scope="col">Requisito</th><th scope="col">Situação</th><th scope="col">O que atende</th><th scope="col">Ações</th></tr></thead>
        <tbody>${corpo}</tbody></table>`;
}

function listaHtml() {
    const { reqs, cobertura, resumo, filtro } = carga;
    const linhas = selecionarLinhas(reqs, cobertura, filtro, S.reqBusca);
    if (!linhas.length) {
        const botao = (rotulo) => `<button type="button" class="btn" data-action="limparFiltrosRequisitos">${rotulo}</button>`;
        if (!S.reqBusca && filtro === 'lacuna') return window.renderEmptyState({ titulo: 'Nenhuma lacuna', texto: 'Todos os requisitos desta lei têm algo que os atende.', acao: botao('Ver todos') });
        return window.renderEmptyState({ titulo: 'Nenhum requisito com este filtro', texto: 'Mude a situação ou a busca para ver outros.', acao: botao('Limpar filtros') });
    }
    const filtrada = filtro !== 'todas' || !!S.reqBusca;
    return `<p class="cob-contagem" role="status">${linhas.length} ${linhas.length === 1 ? 'requisito' : 'requisitos'}${filtrada ? ` de ${resumo.total}` : ''}</p>${COMO_AVANCAR[filtro] ? `<p class="cob-guia">${COMO_AVANCAR[filtro]}</p>` : ''}${tabelaHtml(linhas)}`;
}

function redesenhar() {
    const l = document.getElementById('req-lista');
    if (!l || !carga) return;
    l.innerHTML = listaHtml();
    document.querySelectorAll('.cob-cartao').forEach((b) => b.setAttribute('aria-pressed', String(JSON.parse(b.dataset.args)[0] === carga.filtro)));
}

async function renderRequisitos(c, h, a) {
    h.textContent = tituloDaTela('nav-requisitos', 'Requisitos');
    const proj = projetoAtivo();
    carga = null;
    let fontes = [];
    try { fontes = lista(await api('GET', '/api/v1/requisitos/fontes')); } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar o catálogo de requisitos.', e); return; }
    const escolhida = fontes.find((f) => f.id === S.fonteRequisitos && f.requisitos > 0)
        || fontes.find((f) => f.requisitos > 0) || fontes[0];
    const fonteId = escolhida ? escolhida.id : null;
    S.fonteRequisitos = fonteId;

    a.innerHTML = ehAdmin() ? '<button class="btn" data-action="semearRequisitos">Carregar catálogo</button>' : '';
    // Sem nenhuma fonte com requisito, o seletor só listaria zeros: não aparece.
    const algumaCarregada = fontes.some((f) => f.requisitos > 0);
    const seletor = algumaCarregada ? `<div class="form-group cob-fonte"><label class="form-label" for="req-fonte">Fonte</label>
        <select class="form-input" id="req-fonte" data-action-change="escolherFonteRequisitos" data-arg-val>${fontes.map((f) =>
        `<option value="${escapeHTML(f.id)}" ${f.id === fonteId ? 'selected' : ''}>${escapeHTML(f.nome)} (${escapeHTML(String(f.requisitos))})</option>`).join('')}</select></div>` : '';

    if (!escolhida || !escolhida.requisitos) {
        // Só o administrador carrega o catálogo: para ele, a ação primária; para os demais, a quem pedir (não um beco sem saída).
        const privacy = produtoAtual() === 'privacy';
        const situacao = escolhida && algumaCarregada ? escolhida.nome + ' ainda não tem requisitos carregados.' : 'Nenhuma fonte de requisitos foi carregada.';
        if (ehAdmin()) a.innerHTML = '';
        c.innerHTML = seletor + window.renderEmptyState({
            titulo: 'Catálogo ainda não carregado',
            texto: ehAdmin() ? situacao : `${situacao} O catálogo é carregado pelo administrador da plataforma. Peça a ele para habilitar os requisitos ${privacy ? 'da LGPD e da ANPD' : 'das normas do projeto'}.`,
            acao: ehAdmin() ? `<button class="btn btn-primary" data-action="semearRequisitos">${privacy ? 'Carregar catálogo LGPD/ANPD' : 'Carregar catálogo'}</button>` : '',
        });
        return;
    }

    let reqs = [];
    try { reqs = lista(await api('GET', `/api/v1/requisitos?fonte=${encodeURIComponent(fonteId)}`)); } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar os requisitos.', e); return; }
    if (!FONTES_COM_COBERTURA.includes(fonteId) || !proj) {
        // n.iso e demais normas: catálogo puro. Lei sem projeto ativo: o mesmo catálogo, com o aviso do que falta.
        const aviso = FONTES_COM_COBERTURA.includes(fonteId) ? '<p class="cob-mudo">Selecione um projeto para ver quanto desta lei ele já atende.</p>' : '';
        c.innerHTML = seletor + aviso + window.renderDataTable(['Referência', 'Título', 'Papel', 'Ações'], reqs.map((r) => [
            escapeHTML(r.referencia), escapeHTML(r.titulo), r.papel ? escapeHTML(r.papel) : '—',
            `<button class="btn btn-ghost btn-sm" data-action="abrirRequisito" data-args='${args(r.id)}'>Abrir</button>`,
        ]), { emptyState: 'Nenhum requisito nesta fonte.' });
        return;
    }
    let r;
    try { r = await api('GET', `/api/v1/projects/${proj.id}/requisitos/lacunas?fonte=${encodeURIComponent(fonteId)}`); } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar a cobertura do projeto.', e); return; }
    const cobertura = new Map(lista(r.itens).map((i) => [i.requisito_id, i]));
    const resumo = r.resumo || { total: reqs.length, cobertos: 0, parciais: 0, lacunas: 0 };
    carga = { reqs, cobertura, resumo, filtro: filtroEfetivo(S.reqFiltro, resumo) };
    c.innerHTML = seletor + resumoHtml(resumo, carga.filtro) + COMO_CALCULA
        + `<div class="form-group cob-busca"><label class="form-label" for="req-busca">Buscar requisito</label>
        <input type="search" class="form-input" id="req-busca" placeholder="Artigo, assunto ou documento" value="${escapeHTML(S.reqBusca || '')}" data-action-input="buscarRequisitos" data-arg-val></div>`
        + `<div id="req-lista">${listaHtml()}</div>`;
}

window.filtrarRequisitos = function (filtro) {
    if (!carga || !FILTROS.includes(filtro)) return;
    S.reqFiltro = filtro;
    carga.filtro = filtro;
    redesenhar();
};

window.buscarRequisitos = function (valor) {
    S.reqBusca = String(valor || '');
    redesenhar();
};

window.limparFiltrosRequisitos = function () {
    S.reqBusca = '';
    S.reqFiltro = 'todas';
    if (carga) carga.filtro = 'todas';
    const b = document.getElementById('req-busca');
    if (b) b.value = '';
    redesenhar();
};

window.irParaDocumentos = function () { window.navigate('documentos'); };

window.escolherFonteRequisitos = function (valor) {
    S.fonteRequisitos = valor;
    S.reqBusca = '';
    S.reqFiltro = undefined;
    window.render();
};

window.semearRequisitos = async function () {
    try {
        const r = await api('POST', '/api/v1/requisitos/semear');
        showToast(`Catálogo: ${r.requisitos} requisitos criados, ${r.controles_ligados} controles ligados.`, 'success');
        window.render();
    } catch (e) { showToast((e && e.message) || 'Não foi possível carregar o catálogo', 'error'); }
};

// Data de hoje no Brasil (AAAA-MM-DD), não em UTC: à noite o UTC já é o dia seguinte.
const hojeBr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const dataBr = (d) => formatarData(d, { vazio: '' });
// Recusa em duas etapas dentro da própria janela (o app não usa confirm()): guarda qual mapeamento espera confirmação.
let recusando = null;

window.abrirRequisito = async function (id, mantemRecusa) {
    if (!mantemRecusa) recusando = null;
    let r;
    try { r = await api('GET', `/api/v1/requisitos/${encodeURIComponent(id)}`); } catch (e) { showToast((e && e.message) || 'Não foi possível abrir o requisito', 'error'); return; }
    const mapas = lista(r.mapeamentos).map((m) => {
        const outro = m.de_id === r.id ? m.para_id : m.de_id;
        let quem;
        if (m.estado === 'validado_juridico') {
            quem = `Validado por ${escapeHTML(m.validado_por || '')} em ${escapeHTML(dataBr(m.validado_em))}`;
        } else {
            quem = window.renderStatusBadge('Proposto', 'warning');
            if (ehAdmin()) {
                const chave = `${m.de_id}|${m.para_id}`;
                quem += recusando === chave
                    ? ` <button class="btn btn-danger btn-sm" data-action="recusarMapeamentoConfirmado" data-args='${args(m.de_id, m.para_id, r.id)}'>Confirmar recusa</button>
                        <button class="btn btn-ghost btn-sm" data-action="cancelarRecusaMapeamento" data-args='${args(r.id)}'>Cancelar</button>`
                    : ` <button class="btn btn-sm" data-action="validarMapeamento" data-args='${args(m.de_id, m.para_id, m.tipo, r.id, m.nota || null)}'>Validar</button>
                        <button class="btn btn-ghost btn-sm" data-action="recusarMapeamento" data-args='${args(m.de_id, m.para_id, r.id)}'>Recusar</button>`;
            }
        }
        return `<tr><td>${escapeHTML(outro)}</td><td>${escapeHTML(TIPO_MAPA[m.tipo] || m.tipo)}</td><td>${quem}</td><td>${escapeHTML(m.nota || '')}</td></tr>`;
    }).join('');
    openModal(`
        <h3>${escapeHTML(r.referencia)} — ${escapeHTML(r.titulo)}</h3>
        <p class="cob-mudo">${escapeHTML(r.fonte_id)}${r.papel ? ' · ' + escapeHTML(r.papel) : ''}</p>
        <h4 class="cob-subtitulo">Equivalências</h4>
        ${mapas ? `<table class="data-table"><thead><tr><th>Requisito</th><th>Tipo</th><th>Validação</th><th>Nota</th></tr></thead><tbody>${mapas}</tbody></table>`
            : window.renderEmptyState({ titulo: 'Nenhuma equivalência registrada.', compacto: true })}
    `, 'modal-large');
};

window.validarMapeamento = async function (de, para, tipo, requisitoId, nota) {
    try {
        await api('PUT', '/api/v1/requisitos/mapeamentos', {
            de_id: de, para_id: para, tipo, estado: 'validado_juridico',
            validado_por: (S.user && (S.user.name || S.user.email)) || '', validado_em: hojeBr(), nota: nota || null,
        });
        showToast('Mapeamento validado.', 'success');
    } catch (e) { showToast((e && e.message) || 'Não foi possível validar o mapeamento', 'error'); return; }
    return window.abrirRequisito(requisitoId);
};

window.recusarMapeamento = function (de, para, requisitoId) {
    recusando = `${de}|${para}`;
    return window.abrirRequisito(requisitoId, true);
};

window.cancelarRecusaMapeamento = function (requisitoId) {
    recusando = null;
    return window.abrirRequisito(requisitoId);
};

window.recusarMapeamentoConfirmado = async function (de, para, requisitoId) {
    recusando = null;
    try {
        await api('DELETE', `/api/v1/requisitos/mapeamentos?de=${encodeURIComponent(de)}&para=${encodeURIComponent(para)}`);
        showToast('Mapeamento recusado.', 'success');
    } catch (e) { showToast((e && e.message) || 'Não foi possível recusar o mapeamento', 'error'); return; }
    return window.abrirRequisito(requisitoId);
};

window.renderRequisitos = renderRequisitos;
