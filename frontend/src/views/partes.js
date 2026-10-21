import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, escapeHTML, tituloDaTela } from '../ui.js';
import { produtoAtual } from '../produto.js';
import { montarLista, colunasDe } from '../lista.js';

// Partes e departamentos do projeto (fatia 1.4 do núcleo). O cadastro existe para o responsável de risco,
// controle, ativo e tratamento apontar para uma pessoa ou organização, e não para um texto digitado.
// Vínculos nascem da importação (governança e partes interessadas; fornecedor já é parte); criar vínculo à mão fica
// na API e no agente até uma tela pedir.

const PAPEIS = {
    encarregado: 'Encarregado', dono_processo: 'Dono de processo', dono_sistema: 'Dono de sistema', operador: 'Operador',
    cocontrolador: 'Cocontrolador', suboperador: 'Suboperador', terceiro: 'Terceiro', responsavel: 'Responsável',
    parte_interessada: 'Parte interessada',
};
const ALVOS = { projeto: 'projeto', item: 'ativo', departamento: 'departamento', tratamento: 'tratamento', parte: 'parte' };
const TIPOS = { pessoa: 'Pessoa', organizacao: 'Organização' };

/** Quem cria e edita o cadastro (partes, departamentos; o inventário de ativos usa a mesma lista). A entrevista do RoPA reusa. */
export const podeEditar = () =>!!S.user && ['platform_admin', 'consultant', 'consultor'].includes(S.user.role);
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const lista = (r) => (Array.isArray(r) ? r : []);

// No n.privacy a tela é Pessoas (Cadastros: Pessoas, Áreas, Sistemas, Fornecedores): só partes do tipo pessoa, sem a tabela de
// departamentos (Áreas, views/areas.js); as organizações ficam em Fornecedores. No n.iso, partes dos dois tipos; as áreas têm tela própria.
async function renderPartes(c, h, a) {
    const privacy = produtoAtual() === 'privacy';
    h.textContent = tituloDaTela('nav-partes', privacy ? 'Pessoas' : 'Partes');
    const proj = projetoAtivo();
    if (!proj) {
        a.innerHTML = '';
        c.innerHTML = window.renderSemProjeto();
        return;
    }
    const editar = podeEditar();
    // Uma ação primária; as secundárias no menu "Mais ações" (renderMaisAcoes), para o header não virar uma fila de 5 botões.
    const args = [proj.id];
    const linkAreas = privacy ? '' : `<button class="btn btn-secondary" data-action="navigate" data-args='["areas"]'>Áreas</button>`;
    a.innerHTML = linkAreas + (editar
        ? `${window.renderMaisAcoes([
            { rotulo: 'Importar do projeto', action: 'importarPartes', args },
            { rotulo: 'Conciliar responsáveis', action: 'conciliarPartes', args },
            { rotulo: 'Padronizar nomes', action: 'abrirPadronizarNomes', args },
        ])}
           <button class="btn btn-primary" data-action="openNovaParteModal" data-args='["${proj.id}"]'>${privacy ? '+ Nova pessoa' : '+ Nova parte'}</button>`
        : '');

    let partes = [];
    try {
        partes = lista(await api('GET', `/api/v1/projects/${proj.id}/partes`));
    } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar as partes.', e); return; }
    S.partes = partes;
    if (privacy) partes = partes.filter(p => p.tipo === 'pessoa');

    c.innerHTML = privacy ? '<div id="partes-lista"></div>' : `
        <h3 class="mb-3">Partes</h3>
        <div id="partes-lista"></div>`;
    montarLista(c.querySelector('#partes-lista'), {
        id: 'partes',
        linhas: partes,
        colunas: colunasDe(['Nome', 'Tipo', 'E-mail', 'Situação', 'Ações'], p => [
            `<strong>${escapeHTML(p.nome)}</strong>`,
            escapeHTML(TIPOS[p.tipo] || p.tipo),
            escapeHTML(p.email || '—'),
            window.renderStatusBadge(p.status === 'ativa' ? 'Ativa' : 'Inativa', p.status === 'ativa' ? 'success' : 'info'),
            `<button class="btn btn-ghost btn-sm" data-action="openParteModal" data-args='["${proj.id}","${escapeHTML(p.id)}"]'>${editar ? 'Abrir' : 'Detalhes'}</button>`,
        ]),
        busca: p => `${p.nome} ${p.email || ''}`,
        filtros: [
            ...(privacy ? [] : [{ chave: 'tipo', rotulo: 'Tipo', valor: p => p.tipo, opcoes: Object.entries(TIPOS).sort((x, y) => x[1].localeCompare(y[1], 'pt-BR')) }]),
            { chave: 'situacao', rotulo: 'Situação', valor: p => (p.status === 'ativa' ? 'ativa' : 'inativa'), opcoes: [['ativa', 'Ativa'], ['inativa', 'Inativa']] },
        ],
        vazio: { titulo: privacy
            ? 'Nenhuma pessoa cadastrada. Cadastre o encarregado e quem responde pelos tratamentos, ou traga quem já está no projeto.'
            : 'Nenhuma parte cadastrada. Use "Importar do projeto" para trazer governança e partes interessadas.' },
    });
}

// Mensagem do servidor quando existe (409 de duplicata, 400 de validação), senão a genérica.
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');

// No n.privacy o tipo vem de quem abre (Pessoas: pessoa; Fornecedores: organização), sem select.
window.openNovaParteModal = function (projectId, tipo = 'pessoa') {
    const privacy = produtoAtual() === 'privacy';
    const tipoEscolhido = TIPOS[tipo] ? tipo : 'pessoa';
    openModal(`
        <div class="modal-header"><span class="modal-title">${tipoEscolhido === 'organizacao' ? 'Novo terceiro (organização)' : privacy ? 'Nova pessoa' : 'Nova parte'}</span></div>
        ${privacy ? `<input type="hidden" id="parte-tipo" value="${tipoEscolhido}">` : `<div class="form-group"><label class="form-label" for="parte-tipo">Tipo</label>
            <select class="form-input" id="parte-tipo">${Object.entries(TIPOS).map(([v, r]) => `<option value="${v}" ${v === tipoEscolhido ? 'selected' : ''}>${r}</option>`).join('')}</select></div>`}
        <div class="form-group"><label class="form-label">Nome</label><input class="form-input" id="parte-nome" maxlength="200"></div>
        <div class="form-group"><label class="form-label">E-mail (opcional)</label><input class="form-input" id="parte-email" type="email" maxlength="320"></div>
        <button class="btn btn-primary" style="width:100%" data-action="criarParte" data-args='["${projectId}"]'>Cadastrar</button>
    `);
};

window.criarParte = async function (projectId) {
    const nome = document.getElementById('parte-nome').value.trim();
    if (!nome) return;
    const email = document.getElementById('parte-email').value.trim();
    try {
        await api('POST', `/api/v1/projects/${projectId}/partes`, { tipo: document.getElementById('parte-tipo').value, nome, email: email || null });
        window.forceCloseModal();
        window.render();
    } catch (e) { falha(e, 'Não foi possível cadastrar a parte'); }
};

window.openParteModal = async function (projectId, id) {
    let p;
    try { p = await api('GET', `/api/v1/projects/${projectId}/partes/${id}`); } catch (e) { return falha(e, 'Não foi possível abrir a parte'); }
    const editar = podeEditar();
    const vinculos = lista(p.vinculos).map(v =>
        `<li>${escapeHTML(PAPEIS[v.papel] || v.papel)} — ${escapeHTML(ALVOS[v.alvo_tipo] || v.alvo_tipo)}</li>`).join('');
    openModal(`
        <div class="modal-header"><span class="modal-title">${escapeHTML(p.nome)}</span></div>
        <div class="form-group"><label class="form-label">Nome</label><input class="form-input" id="parte-e-nome" maxlength="200" value="${escapeHTML(p.nome)}" ${editar ? '' : 'disabled'}></div>
        <div class="form-group"><label class="form-label">E-mail</label><input class="form-input" id="parte-e-email" type="email" maxlength="320" value="${escapeHTML(p.email || '')}" ${editar ? '' : 'disabled'}></div>
        <div class="form-group"><label class="form-label">Situação</label>
            <select class="form-input" id="parte-e-status" ${editar ? '' : 'disabled'}>
                <option value="ativa" ${p.status === 'ativa' ? 'selected' : ''}>Ativa</option>
                <option value="inativa" ${p.status === 'inativa' ? 'selected' : ''}>Inativa</option>
            </select></div>
        <div class="form-group"><label class="form-label">Papéis</label>
            ${vinculos ? `<ul style="margin:0;padding-left:1.2rem">${vinculos}</ul>` : window.renderEmptyState({ titulo: 'Nenhum papel registrado.', compacto: true })}</div>
        ${editar ? `<button class="btn btn-primary" style="width:100%" data-action="salvarParte" data-args='["${projectId}","${escapeHTML(p.id)}"]'>Salvar</button>` : ''}
    `);
};

window.salvarParte = async function (projectId, id) {
    const nome = document.getElementById('parte-e-nome').value.trim();
    if (!nome) return;
    const email = document.getElementById('parte-e-email').value.trim();
    try {
        await api('PUT', `/api/v1/projects/${projectId}/partes/${id}`, { nome, email: email || null, status: document.getElementById('parte-e-status').value });
        window.forceCloseModal();
        window.render();
    } catch (e) { falha(e, 'Não foi possível salvar a parte'); }
};

window.importarPartes = async function (projectId) {
    try {
        const r = await api('POST', `/api/v1/projects/${projectId}/partes/importar`);
        showToast(`Importação: ${r.criadas} criadas, ${r.reaproveitadas} já existiam, ${r.vinculos} papéis novos.`, 'success');
        window.render();
    } catch (e) { falha(e, 'Não foi possível importar'); }
};

window.conciliarPartes = async function (projectId) {
    let r;
    try { r = await api('POST', `/api/v1/projects/${projectId}/partes/conciliar`); } catch (e) { return falha(e, 'Não foi possível conciliar'); }
    const ligados = Object.values(r.casados || {}).reduce((s, n) => s + n, 0);
    const sem = lista(r.sem_correspondencia);
    const amb = lista(r.ambiguos);
    const bloco = (titulo, dica, xs) => xs.length ? `
        <h4 style="margin:1rem 0 0.25rem">${titulo} (${xs.length})</h4>
        <p style="color:var(--text-dim);margin:0 0 0.5rem">${dica}</p>
        ${window.renderDataTable(['Onde', 'Texto', 'Linhas'], xs.map(x => [escapeHTML(x.tabela), escapeHTML(x.texto), String(x.n)]))}` : '';
    openModal(`
        <div class="modal-header"><span class="modal-title">Conciliação de responsáveis</span></div>
        <p><strong>${ligados}</strong> responsáveis ligados a uma parte. O texto original não foi alterado.</p>
        ${bloco('Sem correspondência', 'Nenhuma parte tem exatamente este nome. Cadastre a parte (ou corrija o nome) e concilie de novo.', sem)}
        ${bloco('Ambíguos', 'Mais de uma parte tem este nome. Deixe só uma ativa com o nome ou renomeie e concilie de novo.', amb)}
        ${!sem.length && !amb.length ? '<p>Nada pendente.</p>' : ''}
        <button class="btn" style="margin-top:1rem" data-action="forceCloseModal">Fechar</button>
    `);
    window.render();
};

window.renderPartes = renderPartes;
