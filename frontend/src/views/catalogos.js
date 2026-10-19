import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, escapeHTML, openModal, forceCloseModal } from '../ui.js';

// Titulares e Dados de titular (n.privacy, Cadastros; spec 2026-10-19): duas telas do legado sobre os catálogos do projeto que a
// atividade de tratamento usa, cada uma com o tipo fixo. Mesmas rotas do "+" da atividade (`/projects/:id/catalogos/:tipo`); a
// duplicata é recusada no servidor (409 com o item `existente`). Editar é da equipe da ness e do administrador do cliente, como no
// servidor. Excluir inativa: o que já foi usado nas atividades continua gravado.
// A "Descrição do titular" do legado é a coluna `catalogo_itens.descricao` (migration 0081), só do titular.

const TELAS = {
    titulares: { titulo: 'Titulares', coluna: 'Titular', novo: 'Novo titular', alterar: 'Alterar Titular', vazio: 'Nenhum titular cadastrado.' },
    dados: { titulo: 'Dados de titular', coluna: 'Dado pessoal', novo: 'Novo dado pessoal', alterar: 'Alterar Dado Pessoal', vazio: 'Nenhum dado pessoal cadastrado.' },
};
const podeEditar = () => !!S.user && ['platform_admin', 'consultant', 'consultor', 'consultoria_admin', 'org_admin'].includes(S.user.role);
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);

let tipo = 'titulares';
let itens = [];
let sequencia = 0;

async function montar(qual, c, h, a) {
    tipo = qual;
    const t = TELAS[qual];
    h.textContent = t.titulo;
    const proj = projetoAtivo();
    if (!proj) { a.innerHTML = ''; c.innerHTML = window.renderSemProjeto(); return; }
    const dado = qual === 'dados';
    a.innerHTML = podeEditar() ? `<button class="btn btn-primary" data-action="catAbrir" data-args='[null]'>+ ${escapeHTML(t.novo)}</button>` : '';
    c.innerHTML = `<div class="d-flex flex-wrap items-center gap-3 mb-4">
            <input class="form-input" id="cat-busca" type="search" maxlength="120" placeholder="Buscar pelo nome" aria-label="Buscar pelo nome" data-action-input="catRecarregar">
            ${dado ? '<label class="opcao-check"><input type="checkbox" id="cat-sensiveis" data-action-change="catFiltrar"> Sensíveis</label>' : ''}
            <label class="opcao-check"><input type="checkbox" id="cat-inativos" data-action-change="catRecarregar"> Mostrar inativos</label>
        </div>
        <div id="cat-lista"></div>`;
    await carregar();
}

async function carregar() {
    const alvo = el('cat-lista');
    const proj = projetoAtivo();
    if (!alvo || !proj) return;
    const busca = el('cat-busca') ? el('cat-busca').value.trim() : '';
    const inativos = el('cat-inativos') && el('cat-inativos').checked;
    const q = busca || inativos ? `?${[busca ? `q=${encodeURIComponent(busca)}` : '', inativos ? 'inativos=1' : ''].filter(Boolean).join('&')}` : '';
    const minha = ++sequencia;
    let r;
    try {
        r = await api('GET', `/api/v1/projects/${proj.id}/catalogos/${tipo}${q}`);
    } catch (e) {
        if (minha === sequencia) alvo.innerHTML = window.renderErrorState('Não foi possível carregar o catálogo.', { acao: 'catRecarregar', erro: e });
        return;
    }
    if (minha !== sequencia) return;
    itens = Array.isArray(r) ? r : []; // o api() desembrulha `{ ok, itens }`
    desenhar(busca);
}

function desenhar(busca = '') {
    const alvo = el('cat-lista');
    if (!alvo) return;
    const t = TELAS[tipo];
    const dado = tipo === 'dados';
    const soSensiveis = dado && el('cat-sensiveis') && el('cat-sensiveis').checked;
    const lista = soSensiveis ? itens.filter((i) => i.sensivel) : itens;
    if (!lista.length) {
        alvo.innerHTML = window.renderEmptyState(busca || soSensiveis
            ? { titulo: 'Nada encontrado com esse filtro.', compacto: true }
            : { titulo: t.vazio, texto: 'Os itens também nascem pelo "+" dentro da atividade de tratamento.' });
        return;
    }
    const empresa = escapeHTML((projetoAtivo() || {}).client_name || '—');
    const ver = (i) => `<button class="btn btn-ghost btn-sm" data-action="catAbrir" data-args='${args(i.id)}' aria-label="${escapeHTML(`Ver ou editar: ${i.nome}`)}">Ver/Editar</button>`;
    const inativo = (i) => (i.status === 'inativo' ? ` ${window.renderStatusBadge('Inativo', 'neutral')}` : '');
    const descricaoDe = (i) => escapeHTML(i.descricao || '—');
    alvo.innerHTML = window.renderDataTable(dado ? [t.coluna, 'Ações'] : [t.coluna, 'Descrição', 'Empresa', 'Ações'], lista.map((i) => (dado
        ? [`${escapeHTML(i.nome)}${i.sensivel ? ` ${window.renderStatusBadge('Sensível', 'warning')}` : ''}${inativo(i)}`, ver(i)]
        : [`${escapeHTML(i.nome)}${inativo(i)}`, descricaoDe(i), empresa, ver(i)])));
}

// 409: o servidor devolve o item com o mesmo nome (padronizado), para a pessoa saber qual é.
const falha = (e, padrao) => showToast(e && e.status === 409 && e.body && e.body.existente ? `Já existe: ${e.body.existente.nome}` : (e && e.message) || padrao, 'error');

/** Um modal para ver, criar (id null) e editar. Quem só lê vê os campos desligados, sem Salvar nem Excluir. */
window.catAbrir = function (id) {
    const i = id ? itens.find((x) => x.id === id) : null;
    if (id && !i) return;
    const t = TELAS[tipo];
    const dado = tipo === 'dados';
    const ed = podeEditar();
    const off = ed ? '' : 'disabled';
    openModal(`<div class="modal-header"><span class="modal-title">${escapeHTML(i ? (ed ? t.alterar : t.coluna) : t.novo)}</span></div>
        <div class="form-group"><label class="form-label" for="cat-nome">${escapeHTML(t.coluna)}</label>
            <input class="form-input" id="cat-nome" maxlength="200" value="${escapeHTML(i ? i.nome : '')}" ${off}></div>
        ${dado ? `<div class="form-group"><label class="form-label" for="cat-sensivel">É um Dado Sensível?</label>
            <select class="form-input" id="cat-sensivel" ${off}><option value="nao" ${i && i.sensivel ? '' : 'selected'}>Não</option><option value="sim" ${i && i.sensivel ? 'selected' : ''}>Sim</option></select></div>
            ${i ? '<p class="at-nota">Esse dado pessoal também será atualizado no registro vinculado aos titulares na base de Atividades.</p>' : ''}` : ''}
        ${dado ? '' : `<div class="form-group"><label class="form-label" for="cat-descricao">Descrição do titular</label>
            <textarea class="form-input" id="cat-descricao" rows="4" maxlength="2000" placeholder="Descreva quem é este titular" ${off}>${escapeHTML(i && i.descricao ? i.descricao : '')}</textarea></div>`}
        ${ed ? `<div class="acoes-rodape">${i ? (i.status === 'inativo'
            ? `<button type="button" class="btn btn-ghost" data-action="catReativar" data-args='${args(i.id)}'>Reativar</button>`
            : `<button type="button" class="btn btn-ghost t-perigo" data-action="catExcluir" data-args='${args(i.id)}'>Excluir</button>`) : ''}
            <button type="button" class="btn btn-primary" data-action="catSalvar" data-args='${args(i ? i.id : null)}'>Salvar</button></div>` : ''}`);
};

window.catSalvar = async function (id) {
    const nome = el('cat-nome').value.trim();
    if (!nome) { showToast('Informe o nome', 'error'); return; }
    const sens = el('cat-sensivel');
    const desc = el('cat-descricao');
    const corpo = sens ? { nome, sensivel: sens.value === 'sim' } : { nome, descricao: desc ? desc.value.trim() || null : null };
    const pid = projetoAtivo().id;
    try {
        if (id) await api('PUT', `/api/v1/projects/${pid}/catalogos/${tipo}/${id}`, corpo);
        else await api('POST', `/api/v1/projects/${pid}/catalogos/${tipo}`, corpo);
    } catch (e) { falha(e, 'Não foi possível salvar o item'); return; }
    forceCloseModal();
    showToast(id ? 'Item alterado.' : 'Item criado.', 'success');
    await carregar();
};

window.catExcluir = async function (id) {
    const i = itens.find((x) => x.id === id);
    if (!i || !(await window.confirmar(`Excluir "${i.nome}"? Ele sai da lista; o que já foi registrado nas atividades continua gravado.`, { titulo: 'Excluir', rotulo: 'Excluir', perigo: true }))) return;
    try { await api('PUT', `/api/v1/projects/${projetoAtivo().id}/catalogos/${tipo}/${id}`, { status: 'inativo' }); }
    catch (e) { falha(e, 'Não foi possível excluir o item'); return; }
    forceCloseModal();
    showToast('Item excluído.', 'success');
    await carregar();
};

window.catReativar = async function (id) {
    try { await api('PUT', `/api/v1/projects/${projetoAtivo().id}/catalogos/${tipo}/${id}`, { status: 'ativo' }); }
    catch (e) { falha(e, 'Não foi possível reativar o item'); return; }
    forceCloseModal();
    showToast('Item reativado.', 'success');
    await carregar();
};

window.catRecarregar = () => carregar();
window.catFiltrar = () => desenhar(el('cat-busca') ? el('cat-busca').value.trim() : '');
window.renderTitulares = (c, h, a) => montar('titulares', c, h, a);
window.renderDadosTitular = (c, h, a) => montar('dados', c, h, a);
