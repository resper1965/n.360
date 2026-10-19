import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, escapeHTML } from '../ui.js';

// Titulares e dados pessoais (n.privacy, Cadastros; spec 2026-10-19): os catálogos do projeto que a atividade de tratamento usa,
// vistos fora dela. Mesmas rotas do "+" da atividade (`/projects/:id/catalogos/:tipo`); a duplicata é recusada no servidor (409
// com o item `existente`). Editar é da equipe da ness e do administrador do cliente, como no servidor.

const ABAS = [['titulares', 'Titulares', 'titular'], ['dados', 'Dados pessoais', 'dado']];
const podeEditar = () => !!S.user && ['platform_admin', 'consultant', 'consultor', 'consultoria_admin', 'org_admin'].includes(S.user.role);
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const abaAtual = () => (ABAS.some(([x]) => x === S.catalogosAba) ? S.catalogosAba : 'titulares');

let ultimo = null;
let sequencia = 0;

async function renderCatalogos(c, h, a) {
    ultimo = { c, h, a };
    h.textContent = 'Titulares e dados pessoais';
    a.innerHTML = '';
    const proj = projetoAtivo();
    if (!proj) { c.innerHTML = window.renderSemProjeto(); return; }
    const aba = abaAtual();
    const dado = aba === 'dados';
    const editar = podeEditar();
    c.innerHTML = `<div class="at-abas" role="tablist" aria-label="Catálogos">${ABAS.map(([id, r]) =>
            `<button type="button" role="tab" class="at-aba" id="cat-aba-${id}" aria-controls="cat-painel" aria-selected="${id === aba}" tabindex="${id === aba ? 0 : -1}"
                data-action="catIrParaAba" data-action-keydown="catTeclaAba" data-arg-event data-args='${args(id)}'>${escapeHTML(r)}</button>`).join('')}</div>
        <div role="tabpanel" id="cat-painel" aria-labelledby="cat-aba-${aba}" tabindex="0">
            <div class="d-flex flex-wrap items-center gap-3 mt-4 mb-4">
                <input class="form-input" id="cat-busca" type="search" maxlength="120" placeholder="Buscar pelo nome" aria-label="Buscar pelo nome" data-action-input="catRecarregar">
                <label class="opcao-check"><input type="checkbox" id="cat-inativos" data-action-change="catRecarregar"> Mostrar inativos</label>
            </div>
            ${editar ? `<div class="d-flex flex-wrap items-center gap-2 mb-4">
                <label class="sr-only" for="cat-novo-nome">Nome ${dado ? 'do dado pessoal' : 'do titular'}</label>
                <input class="form-input" id="cat-novo-nome" maxlength="200" placeholder="${dado ? 'Novo dado pessoal' : 'Novo titular'}">
                ${dado ? '<label class="opcao-check"><input type="checkbox" id="cat-novo-sensivel"> Sensível</label>' : ''}
                <button class="btn btn-primary btn-sm" data-action="catCriar">Criar</button></div>` : ''}
            <div id="cat-lista"></div>
        </div>`;
    await carregar();
}

async function carregar() {
    const alvo = el('cat-lista');
    const proj = projetoAtivo();
    if (!alvo || !proj) return;
    const aba = abaAtual();
    const q = new URLSearchParams();
    const busca = el('cat-busca') ? el('cat-busca').value.trim() : '';
    if (busca) q.set('q', busca);
    if (el('cat-inativos') && el('cat-inativos').checked) q.set('inativos', '1');
    const minha = ++sequencia;
    let itens;
    try {
        const r = await api('GET', `/api/v1/projects/${proj.id}/catalogos/${aba}${q.toString() ? `?${q}` : ''}`);
        itens = Array.isArray(r) ? r : []; // o api() desembrulha `{ ok, itens }`
    } catch (e) {
        if (minha === sequencia) alvo.innerHTML = window.renderErrorState('Não foi possível carregar o catálogo.', { acao: 'catRecarregar', erro: e });
        return;
    }
    if (minha !== sequencia) return;
    const dado = aba === 'dados';
    const editar = podeEditar();
    if (!itens.length) {
        alvo.innerHTML = window.renderEmptyState(busca
            ? { titulo: 'Nada encontrado com essa busca.', compacto: true }
            : { titulo: dado ? 'Nenhum dado pessoal cadastrado.' : 'Nenhum titular cadastrado.',
                texto: 'Os itens também nascem pelo "+" dentro da atividade de tratamento.' });
        return;
    }
    const linhas = itens.map((i) => {
        const ativo = i.status === 'ativo';
        const acoes = editar ? [
            `<button class="btn btn-ghost btn-sm" data-action="catRenomear" data-args='${args(i.id)}'>Renomear</button>`,
            dado ? `<button class="btn btn-ghost btn-sm" data-action="catSensivel" data-args='${args(i.id, !i.sensivel)}'>${i.sensivel ? 'Desmarcar sensível' : 'Marcar sensível'}</button>` : '',
            `<button class="btn btn-ghost btn-sm" data-action="catStatus" data-args='${args(i.id, ativo ? 'inativo' : 'ativo')}'>${ativo ? 'Inativar' : 'Reativar'}</button>`,
        ].join('') : '';
        return [
            `${escapeHTML(i.nome)}${dado && i.sensivel ? ` ${window.renderStatusBadge('Sensível', 'warning')}` : ''}`,
            ativo ? 'Ativo' : 'Inativo',
            acoes,
        ];
    });
    alvo.innerHTML = window.renderDataTable(['Nome', 'Situação', 'Ações'], linhas);
}

const repintar = () => (ultimo ? renderCatalogos(ultimo.c, ultimo.h, ultimo.a) : undefined);
// 409: o servidor devolve o item com o mesmo nome (padronizado), para a pessoa saber qual é.
const falha = (e, padrao) => showToast(e && e.status === 409 && e.body && e.body.existente ? `Já existe: ${e.body.existente.nome}` : (e && e.message) || padrao, 'error');

async function mudar(id, corpo, sucesso) {
    try {
        await api('PUT', `/api/v1/projects/${projetoAtivo().id}/catalogos/${abaAtual()}/${id}`, corpo);
        showToast(sucesso, 'success');
        await carregar();
    } catch (e) { falha(e, 'Não foi possível alterar o item'); }
}

async function irParaAba(id) {
    S.catalogosAba = id;
    await repintar();
    const b = el(`cat-aba-${id}`);
    if (b) b.focus();
}
window.catIrParaAba = (_e, id) => irParaAba(id);
window.catTeclaAba = function (e, atual) {
    const i = ABAS.findIndex(([x]) => x === atual);
    const prox = { ArrowRight: (i + 1) % ABAS.length, ArrowLeft: (i + ABAS.length - 1) % ABAS.length, Home: 0, End: ABAS.length - 1 }[e.key];
    if (prox === undefined) return;
    e.preventDefault();
    return irParaAba(ABAS[prox][0]);
};
window.catRecarregar = () => carregar();

window.catCriar = async function () {
    const nome = el('cat-novo-nome').value.trim();
    if (!nome) { showToast('Informe o nome', 'error'); return; }
    const sens = el('cat-novo-sensivel');
    try {
        await api('POST', `/api/v1/projects/${projetoAtivo().id}/catalogos/${abaAtual()}`, sens ? { nome, sensivel: sens.checked } : { nome });
        showToast('Item criado.', 'success');
        el('cat-novo-nome').value = '';
        if (sens) sens.checked = false;
        await carregar();
    } catch (e) { falha(e, 'Não foi possível criar o item'); }
};

window.catRenomear = async function (id) {
    const novo = await window.pedirTexto('Novo nome do item', { titulo: 'Renomear', rotulo: 'Renomear' });
    if (!novo || !String(novo).trim()) return;
    return mudar(id, { nome: String(novo).trim() }, 'Nome alterado.');
};
window.catSensivel = (id, sensivel) => mudar(id, { sensivel: !!sensivel }, sensivel ? 'Marcado como sensível.' : 'Desmarcado como sensível.');
window.catStatus = (id, status) => mudar(id, { status }, status === 'inativo' ? 'Item inativado.' : 'Item reativado.');

window.renderCatalogos = renderCatalogos;
