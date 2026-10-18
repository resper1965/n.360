import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, forceCloseModal, escapeHTML, formatarData } from '../ui.js';
import { rotuloDe } from '../rotulos.js';

// Consentimentos (n.privacy, fatia 7): a PROVA de que o titular consentiu, ligada a um tratamento do RoPA. Revogar não apaga: grava a
// revogação e a prova do que existiu fica. Toda regra é do servidor (src/services/consentimentos.ts); aqui só se mostra e se chama.
// O que a tela mostra é o que a API devolve: nenhum dado pessoal além da referência pseudonimizada do titular. Texto sempre escapado.

const SITUACOES = { todos: 'Todos', vigente: 'Vigentes', revogado: 'Revogados' };
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const dia = (s) => formatarData(s);
const valorOuNulo = (id) => { const v = el(id).value.trim(); return v || null; };
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// "tit-" + 16 hex é o pseudônimo que a importação do histórico grava no lugar de e-mail, CPF e telefone.
export const ehPseudonimo = (ref) => /^tit-[0-9a-f]{16}$/.test(String(ref || ''));

// ─── Regras da lista (puras) ──────────────────────────────────────────────────────────────────────

export const situacaoDe = (x) => (x.vigente ? 'vigente' : 'revogado');

export function resumir(lista) {
    const vigentes = lista.filter((x) => x.vigente).length;
    return { total: lista.length, vigentes, revogados: lista.length - vigentes, sem_canal: lista.filter((x) => x.vigente && !x.canal).length };
}

export function filtrar(lista, { situacao = 'todos', busca = '', ropa = '' } = {}) {
    const q = semAcento(busca).trim();
    return lista.filter((x) => (situacao === 'todos' || situacaoDe(x) === situacao)
        && (!ropa || x.ropa_id === ropa)
        && (!q || [x.titular_ref, x.finalidade, x.tratamento, x.versao_aviso, x.canal].some((v) => semAcento(v).includes(q))));
}

// Vigente primeiro (é o que ainda vale e pode ser revogado), do mais recente ao mais antigo; revogado depois, pela revogação mais recente.
export function ordenar(lista) {
    const chave = (x) => String((x.vigente ? x.obtido_em : x.revogado_em) || '');
    return [...lista].sort((a, b) => (Number(b.vigente) - Number(a.vigente)) || chave(b).localeCompare(chave(a)));
}

// ─── Estado da tela ───────────────────────────────────────────────────────────────────────────────

// A lista fica em memória: filtrar e buscar redesenham só a tabela, sem nova ida à API (e sem tirar o foco da busca).
let dados = { projectId: null, lista: [], editar: false };
const filtros = (projectId) => {
    if (!S.consentimentosFiltro || S.consentimentosFiltro.projectId !== projectId) S.consentimentosFiltro = { projectId, situacao: 'todos', busca: '', ropa: '' };
    return S.consentimentosFiltro;
};

export async function carregarConsentimentos(projectId) {
    const r = await api('GET', `/api/v1/projects/${projectId}/consentimentos`);
    return Array.isArray(r) ? r : [];
}

// ─── Desenho ──────────────────────────────────────────────────────────────────────────────────────

function referencia(ref) {
    return ehPseudonimo(ref)
        ? `<code class="co-ref">${escapeHTML(ref)}</code><span class="co-sub">Pseudônimo do histórico importado</span>`
        : `<code class="co-ref">${escapeHTML(ref)}</code>`;
}

const selo = (x) => (x.vigente ? window.renderStatusBadge(rotuloDe('consentimento', 'vigente'), 'success') : window.renderStatusBadge(rotuloDe('consentimento', 'revogado'), 'neutral'));

function linha(x, projectId, editar) {
    const nome = `${x.titular_ref}, ${x.tratamento}`;
    return [
        referencia(x.titular_ref),
        escapeHTML(x.finalidade),
        `<button type="button" class="btn btn-ghost btn-sm co-trat" data-action="abrirTratamentoDoConsentimento" data-args='${args(projectId, x.ropa_id)}' aria-label="Abrir o tratamento: ${escapeHTML(x.tratamento)}">${escapeHTML(x.tratamento)}</button>`,
        escapeHTML(dia(x.obtido_em)),
        `${escapeHTML(x.canal || 'Canal não informado')}<span class="co-sub">${escapeHTML(x.versao_aviso)}</span>`,
        `${selo(x)}${x.vigente ? '' : ` <span class="co-sub">em ${escapeHTML(dia(x.revogado_em))}</span>`}`,
        `<div class="acoes-linha"><button type="button" class="btn btn-sm" data-action="abrirConsentimento" data-args='${args(projectId, x.id)}' aria-label="Ver o consentimento de ${escapeHTML(nome)}">Ver</button>`
        + `${x.vigente && editar ? `<button type="button" class="btn btn-sm" data-action="revogarConsentimento" data-args='${args(projectId, x.id)}' aria-label="Revogar o consentimento de ${escapeHTML(nome)}">Revogar</button>` : ''}</div>`,
    ];
}

const COLUNAS = ['Titular', 'Finalidade', 'Tratamento', 'Obtido em', 'Canal e aviso', 'Situação', 'Ações'];

function tabela() {
    const f = filtros(dados.projectId);
    const l = ordenar(filtrar(dados.lista, f));
    const contagem = `<p class="co-contagem" id="co-contagem" role="status">${l.length === dados.lista.length ? `${l.length} ${l.length === 1 ? 'consentimento' : 'consentimentos'}` : `${l.length} de ${dados.lista.length} consentimentos`}</p>`;
    if (!l.length) {
        return `${contagem}${window.renderEmptyState({ titulo: 'Nenhum consentimento com estes filtros', texto: 'Mude a busca ou a situação para ver os outros registros.', acao: '<button type="button" class="btn" data-action="limparFiltrosConsentimentos">Limpar filtros</button>' })}`;
    }
    return contagem + window.renderDataTable(COLUNAS, l.map((x) => linha(x, dados.projectId, dados.editar)));
}

function resumo(r) {
    const item = (valor, rotulo, dica) => `<div class="co-resumo-item"><dt>${rotulo}</dt><dd>${valor}</dd>${dica ? `<span class="co-sub">${dica}</span>` : ''}</div>`;
    return `<dl class="co-resumo" aria-label="Resumo dos consentimentos">`
        + item(r.total, 'Registrados')
        + item(r.vigentes, 'Vigentes', 'ainda valem')
        + item(r.revogados, 'Revogados', 'a prova fica guardada')
        + item(r.sem_canal, 'Vigentes sem canal', r.sem_canal ? 'a prova é mais fraca sem o canal' : 'todos com o canal registrado')
        + '</dl>';
}

function controles(l) {
    const f = filtros(dados.projectId);
    const n = resumir(l);
    const contagem = { todos: n.total, vigente: n.vigentes, revogado: n.revogados };
    const trat = [...new Map(l.map((x) => [x.ropa_id, x.tratamento])).entries()];
    return `<div class="co-controles">
        <div class="pn-alterna" role="group" aria-label="Filtrar por situação">${Object.entries(SITUACOES).map(([v, r]) =>
            `<button type="button" class="btn btn-sm" data-action="filtrarConsentimentos" data-args='${args('situacao', v)}' aria-pressed="${f.situacao === v}">${r} (${contagem[v]})</button>`).join('')}</div>
        <label class="co-campo"><span class="co-campo-rotulo">Buscar</span><input class="form-input" id="co-busca" type="search" maxlength="100" autocomplete="off" placeholder="Referência, finalidade, tratamento ou aviso" value="${escapeHTML(f.busca)}" data-action-input="buscarConsentimentos" data-arg-val></label>
        ${trat.length > 1 ? `<label class="co-campo"><span class="co-campo-rotulo">Tratamento</span><select class="form-input" id="co-ropa" data-action-change="filtrarConsentimentosTratamento" data-arg-val>
            <option value="">Todos os tratamentos</option>${trat.map(([id, nome]) => `<option value="${escapeHTML(id)}" ${f.ropa === id ? 'selected' : ''}>${escapeHTML(nome)}</option>`).join('')}</select></label>` : ''}
    </div>`;
}

function vazio(editar) {
    const acao = [
        editar ? '<button type="button" class="btn" data-action="abrirNovoConsentimento" data-args=\'' + args(dados.projectId) + '\'>Registrar consentimento</button>' : '',
        '<button type="button" class="btn btn-ghost" data-action="navigate" data-args=\'["ropa"]\'>Ver os tratamentos</button>',
        editar ? '<button type="button" class="btn btn-ghost" data-action="navigate" data-args=\'["importacao"]\'>Importar o histórico</button>' : '',
    ].join('');
    return window.renderEmptyState({
        titulo: 'Nenhum consentimento registrado',
        texto: 'O consentimento é a prova de que o titular concordou com um tratamento: quem (por uma referência, nunca o CPF), para qual finalidade, em que data e com qual versão do aviso. '
            + `Ele nasce ligado a um tratamento do RoPA. ${editar ? 'Registre o primeiro, ou traga o que já existe importando o histórico.' : 'Quem registra é a equipe da consultoria.'}`,
        acao,
    });
}

/** O corpo da aba: resumo, filtros e tabela (ou o estado vazio). `lista` já veio da API. */
export function telaConsentimentos(projectId, lista, editar) {
    dados = { projectId, lista, editar };
    if (!lista.length) return vazio(editar);
    return `${resumo(resumir(lista))}`
        + '<p class="co-nota">A referência do titular é um pseudônimo escolhido pela equipe, sem CPF nem contato. Revogar não apaga: o registro continua como prova do que existiu.</p>'
        + `${controles(lista)}<div id="co-lista">${tabela()}</div>`;
}

const redesenharLista = () => { const n = el('co-lista'); if (n) n.innerHTML = tabela(); };
const redesenharControles = () => {
    const botoes = document.querySelectorAll('[data-action="filtrarConsentimentos"]');
    const f = filtros(dados.projectId);
    botoes.forEach((b) => b.setAttribute('aria-pressed', String(JSON.parse(b.getAttribute('data-args'))[1] === f.situacao)));
};

window.filtrarConsentimentos = function (campo, valor) {
    filtros(dados.projectId)[campo] = valor;
    redesenharControles();
    redesenharLista();
};
window.filtrarConsentimentosTratamento = (v) => window.filtrarConsentimentos('ropa', v);
window.buscarConsentimentos = (v) => window.filtrarConsentimentos('busca', v);
window.limparFiltrosConsentimentos = function () {
    Object.assign(filtros(dados.projectId), { situacao: 'todos', busca: '', ropa: '' });
    const b = el('co-busca'); if (b) b.value = '';
    const r = el('co-ropa'); if (r) r.value = '';
    redesenharControles();
    redesenharLista();
    if (b) b.focus();
};

// O tratamento abre na ficha em abas (a atividade), onde o resto do n.privacy o abre. Janela única: uma que esteja aberta fecha antes.
window.abrirTratamentoDoConsentimento = function (projectId, ropaId) {
    forceCloseModal();
    if (typeof window.abrirAtividade === 'function') return window.abrirAtividade(projectId, ropaId);
    return window.navigate && window.navigate('ropa');
};

// ─── Detalhe ──────────────────────────────────────────────────────────────────────────────────────

export function historico(x) {
    const e = [{ quando: x.obtido_em, texto: `Consentimento obtido${x.canal ? ` por ${x.canal}` : ''}, aviso: ${x.versao_aviso}.` }];
    if (x.created_at) e.push({ quando: x.created_at, texto: x.criado_por ? `Registrado no sistema por ${x.criado_por}.` : 'Registrado no sistema.' });
    if (x.revogado_em) e.push({ quando: x.revogado_em, texto: x.revogado_por ? `Revogado por ${x.revogado_por}.` : 'Revogação trazida do histórico importado: nenhuma pessoa do sistema a registrou.' });
    return e.sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
}

window.abrirConsentimento = function (projectId, id) {
    const x = dados.lista.find((c) => c.id === id);
    if (!x) { showToast('Não foi possível abrir o consentimento. Atualize a lista.', 'error'); return; }
    const par = (r, v) => `<div class="co-par"><dt>${r}</dt><dd>${v}</dd></div>`;
    openModal(`<h3>Consentimento</h3>
        <p>${selo(x)}</p>
        <dl class="co-pares">
            ${par('Titular', referencia(x.titular_ref))}
            ${par('Finalidade', escapeHTML(x.finalidade))}
            ${par('Tratamento', `<button type="button" class="btn btn-ghost btn-sm co-trat" data-action="abrirTratamentoDoConsentimento" data-args='${args(projectId, x.ropa_id)}'>${escapeHTML(x.tratamento)}</button>`)}
            ${par('Obtido em', escapeHTML(dia(x.obtido_em)))}
            ${par('Canal', escapeHTML(x.canal || 'Não informado'))}
            ${par('Versão do aviso', escapeHTML(x.versao_aviso))}
        </dl>
        <h4 class="co-h4">Histórico</h4>
        <ol class="co-historico">${historico(x).map((h) => `<li><strong>${escapeHTML(dia(h.quando))}</strong> ${escapeHTML(h.texto)}</li>`).join('')}</ol>
        ${x.vigente && dados.editar ? `<div class="acoes-linha"><button type="button" class="btn" data-action="revogarConsentimento" data-args='${args(projectId, x.id)}'>Revogar consentimento</button></div>` : ''}`);
};

// ─── Registrar e revogar ──────────────────────────────────────────────────────────────────────────

async function acao(fazer, padrao, sucesso) {
    try {
        await fazer();
        if (sucesso) showToast(sucesso, 'success');
        window.render();
    } catch (e) { showToast((e && e.message) || padrao, 'error'); }
}

window.abrirNovoConsentimento = async function (projectId) {
    let tratamentos = [];
    try { const r = await api('GET', `/api/v1/projects/${projectId}/ropa`); tratamentos = Array.isArray(r) ? r : (r && Array.isArray(r.records) ? r.records : []); } catch (e) { /* sem seletor */ }
    if (!tratamentos.length) { showToast('Consentimento é ligado a um tratamento. Cadastre o tratamento no RoPA primeiro.', 'error'); return; }
    openModal(`<h3>Registrar consentimento</h3>
        <div class="form-group"><label class="form-label" for="co-ropa-novo">Tratamento</label><select class="form-input" id="co-ropa-novo">${tratamentos.map((t) => `<option value="${escapeHTML(t.id)}">${escapeHTML(t.processing_purpose)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label" for="co-ref">Referência do titular (pseudonimizada, sem CPF)</label><input class="form-input" id="co-ref" maxlength="500"></div>
        <div class="form-group"><label class="form-label" for="co-fin">Finalidade</label><input class="form-input" id="co-fin" maxlength="500"></div>
        <div class="form-group"><label class="form-label" for="co-aviso">Versão do aviso</label><input class="form-input" id="co-aviso" maxlength="500" placeholder="Ex.: Política de Privacidade v3"></div>
        <div class="form-group"><label class="form-label" for="co-data">Obtido em</label><input class="form-input" id="co-data" type="date"></div>
        <div class="form-group"><label class="form-label" for="co-canal">Canal (opcional)</label><input class="form-input" id="co-canal" maxlength="100"></div>
        <button class="btn btn-primary" data-action="salvarNovoConsentimento" data-args='${args(projectId)}'>Registrar</button>`);
};

window.salvarNovoConsentimento = function (projectId) {
    const campos = { titular_ref: valorOuNulo('co-ref'), finalidade: valorOuNulo('co-fin'), versao_aviso: valorOuNulo('co-aviso'), obtido_em: el('co-data').value };
    if (Object.values(campos).some((v) => !v)) { showToast('Preencha referência, finalidade, versão do aviso e data', 'error'); return; }
    return acao(async () => {
        await api('POST', `/api/v1/projects/${projectId}/consentimentos`, { ropa_id: el('co-ropa-novo').value, canal: valorOuNulo('co-canal'), ...campos });
        forceCloseModal();
    }, 'Não foi possível registrar o consentimento', 'Consentimento registrado.');
};

// Revogar é ato de uma pessoa (o agente MCP não revoga) e não se desfaz: pergunta na própria tela, dizendo que o registro fica.
window.revogarConsentimento = async function (projectId, id) {
    const x = dados.lista.find((c) => c.id === id);
    const quem = x ? ` de ${x.titular_ref}, no tratamento "${x.tratamento}"` : '';
    const sim = await window.confirmar(`O consentimento${quem} deixa de valer a partir de agora. O registro não é apagado: a data da revogação e quem a fez ficam guardadas como prova. Não há como desfazer.`,
        { titulo: 'Revogar consentimento', perigo: true, rotulo: 'Revogar' });
    if (!sim) return;
    return acao(async () => {
        await api('POST', `/api/v1/projects/${projectId}/consentimentos/${id}/revogar`);
        forceCloseModal();
    }, 'Não foi possível revogar o consentimento', 'Consentimento revogado.');
};
