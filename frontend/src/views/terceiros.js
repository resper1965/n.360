import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, closeModal, escapeHTML } from '../ui.js';
import { filtrarDoPainel } from '../filtro-painel.js';

// Terceiros (fatia 6 do núcleo): organizações com tipo, o método que o tipo define, a avaliação com validade e o DPA ligado.
// Toda regra é do servidor; aqui só se mostra e se chama. Todo texto vindo do servidor é escapado.

const TIPOS = { grande_provedor: 'Grande provedor', medio: 'Médio', pequeno: 'Pequeno', critico: 'Crítico' };
const METODOS = { trust_center: 'Trust center', questionario: 'Questionário', auditoria: 'Auditoria' };
const RESULTADOS = { aprovado: 'Aprovado', com_ressalvas: 'Aprovado com ressalvas', reprovado: 'Reprovado' };
const SITUACOES = { pendente: ['Pendente', 'neutral'], vigente: ['Vigente', 'success'], vencida: ['Vencida', 'danger'], reprovada: ['Reprovada', 'danger'] };
const PAPEIS_DOC = { dpa: 'DPA', contrato: 'Contrato', outro: 'Outro' };

const podeEditar = () => !!S.user && ['platform_admin', 'consultant', 'consultor', 'consultoria_admin'].includes(S.user.role);
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const lista = (r) => (Array.isArray(r) ? r : []);
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const dataBr = (s) => (s ? `${String(s).slice(8, 10)}/${String(s).slice(5, 7)}/${String(s).slice(0, 4)}` : '—');
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');

/** Só link http(s) vira âncora; qualquer outra coisa (javascript:, data:) aparece como texto. */
const linkSeguro = (u) => (/^https?:\/\/\S+$/i.test(String(u || '')) ? `<a href="${escapeHTML(u)}" target="_blank" rel="noopener noreferrer">${escapeHTML(u)}</a>` : escapeHTML(u || ''));

async function renderTerceiros(c, h, a) {
    h.textContent = 'Terceiros';
    const proj = projetoAtivo();
    // Terceiro é parte do tipo organização: cadastrar daqui abre o formulário de Partes já como organização.
    const cadastrar = podeEditar() && proj ? `<button class="btn btn-primary" data-action="openNovaParteModal" data-args='${args(proj.id, 'organizacao')}'>Cadastrar terceiro</button>` : '';
    // Regulador e cliente (só parte interessada no n.iso) não entram na lista; quem quiser tratá-los como terceiro os adiciona aqui.
    const adicionar = podeEditar() && proj ? `<button class="btn" data-action="abrirAdicionarTerceiro" data-args='${args(proj.id)}'>Adicionar parte existente</button>` : '';
    // O questionário de homologação (F5) é do projeto: a equipe revisa e edita as perguntas antes de enviar.
    const perguntas = podeEditar() && proj ? `<button class="btn" data-action="abrirPerguntasHomologacao" data-args='${args(proj.id)}'>Perguntas do questionário</button>` : '';
    a.innerHTML = perguntas + adicionar + cadastrar;
    if (!proj) {
        c.innerHTML = window.renderSemProjeto();
        return;
    }
    let terceiros = [];
    try { terceiros = lista(await api('GET', `/api/v1/projects/${proj.id}/terceiros`)); } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar os terceiros.', e); return; }
    const vencidos = terceiros.filter((t) => t.situacao === 'vencida').length;
    const aviso = vencidos ? `<p style="color:var(--danger)">${escapeHTML(String(vencidos))} ${vencidos === 1 ? 'terceiro com avaliação vencida' : 'terceiros com avaliação vencida'}.</p>` : '';
    // Vindo do painel, a lista abre filtrada pela situação do item, com o chip para limpar.
    const { itens: doFiltro, chip, filtrado } = filtrarDoPainel('terceiros', null, terceiros);
    const linhas = doFiltro.map((t) => {
        const [rotulo, tom] = SITUACOES[t.situacao] || [t.situacao, 'neutral'];
        return [
            `<strong>${escapeHTML(t.nome)}</strong>`,
            escapeHTML(TIPOS[t.terceiro_tipo] || '—'),
            escapeHTML(METODOS[t.metodo] || '—'),
            window.renderStatusBadge(rotulo, tom),
            escapeHTML(t.ultima_avaliacao ? dataBr(t.ultima_avaliacao.valido_ate) : '—'),
            escapeHTML(String(t.tratamentos)),
            escapeHTML(String(t.documentos)),
            `<button class="btn btn-ghost btn-sm" data-action="abrirTerceiro" data-args='${args(proj.id, t.id)}'>Abrir</button>`,
        ];
    });
    c.innerHTML = aviso + chip + window.renderDataTable(
        ['Terceiro', 'Tipo', 'Método', 'Avaliação', 'Vale até', 'Tratamentos', 'Documentos', 'Ações'],
        linhas,
        {
            emptyState: 'Nenhuma organização cadastrada em Partes.',
            emptyHint: 'Cadastre os fornecedores e operadores que tratam dados para o cliente, ou traga os que já estão no projeto pela tela Partes.',
            emptyAction: `${cadastrar}<button class="btn" data-action="navigate" data-args='${args('partes')}'>Abrir Partes</button>`,
            ...(filtrado ? { emptyState: 'Nenhum terceiro nesta situação.', emptyHint: 'Limpe o filtro para ver todos.', emptyAction: '' } : {}),
        },
    );
}

window.abrirTerceiro = async function (projectId, parteId) {
    let t;
    try { t = await api('GET', `/api/v1/projects/${projectId}/terceiros/${parteId}`); } catch (e) { falha(e, 'Não foi possível abrir o terceiro'); return; }
    const editar = podeEditar();
    let documentos = [];
    if (editar) { try { documentos = lista(await api('GET', `/api/v1/projects/${projectId}/documentos`)); } catch (e) { /* sem seletor de documento */ } }
    const [rotulo, tom] = SITUACOES[t.situacao] || [t.situacao, 'neutral'];
    const hist = lista(t.historico);
    const ligados = lista(t.documentos_ligados);
    // Homologação por questionário (F5): só para o tipo cujo método é questionário. Falha aqui não derruba a ficha.
    let homologacoes = [];
    if (t.metodo === 'questionario') { try { homologacoes = lista(await api('GET', `/api/v1/projects/${projectId}/homologacoes?parte_id=${encodeURIComponent(parteId)}`)); } catch (e) { /* seção vazia */ } }

    openModal(`
        <h3>${escapeHTML(t.nome)}</h3>
        <p>${window.renderStatusBadge(rotulo, tom)} ${t.ultima_avaliacao ? `válida até ${escapeHTML(dataBr(t.ultima_avaliacao.valido_ate))}` : 'nunca avaliado'}</p>
        <h4 style="margin:1.25rem 0 0.5rem">Tipo e método</h4>
        <div id="tc-tipo">
            ${editar ? `<div style="display:flex; gap:0.5rem; align-items:flex-end"><div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-tipo-sel">Tipo do terceiro</label>
                <select class="form-input" id="tc-tipo-sel"><option value="">— sem tipo —</option>${Object.entries(TIPOS).map(([v, r]) => `<option value="${v}" ${t.terceiro_tipo === v ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
                <button class="btn btn-sm" data-action="salvarTipoTerceiro" data-args='${args(projectId, parteId)}'>Salvar</button></div>`
                : `<p>${escapeHTML(TIPOS[t.terceiro_tipo] || 'Sem tipo')}</p>`}
            <p style="color:var(--text-dim)">${t.metodo ? `O tipo define o método de avaliação: <strong>${escapeHTML(METODOS[t.metodo])}</strong>.` : 'Defina o tipo para saber o método de avaliação.'}</p>
        </div>
        ${editar && t.terceiro_tipo ? `<h4 style="margin:1.25rem 0 0.5rem">Nova avaliação</h4><div id="tc-nova" style="display:flex; gap:0.5rem; align-items:flex-end; flex-wrap:wrap">
            <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-res">Resultado</label><select class="form-input" id="tc-res">${Object.entries(RESULTADOS).map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></div>
            <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-val">Vale até</label><input class="form-input" id="tc-val" type="date"></div>
            <div class="form-group" style="flex:2; margin:0"><label class="form-label" for="tc-url">Evidência (link)</label><input class="form-input" id="tc-url" maxlength="2000" placeholder="https://"></div>
            <div class="form-group" style="flex:2; margin:0"><label class="form-label" for="tc-obs">Observação</label><input class="form-input" id="tc-obs" maxlength="2000"></div>
            <button class="btn btn-primary btn-sm" data-action="registrarAvaliacaoTerceiro" data-args='${args(projectId, parteId)}'>Registrar</button></div>` : ''}
        <h4 style="margin:1.25rem 0 0.5rem">Histórico de avaliações</h4>
        <div id="tc-historico">${hist.length ? `<table class="data-table"><thead><tr><th>Em</th><th>Método</th><th>Resultado</th><th>Vale até</th><th>Evidência</th><th>Por</th></tr></thead><tbody>${hist.map((x) =>
            `<tr><td>${escapeHTML(String(x.created_at || '').slice(0, 10))}</td><td>${escapeHTML(METODOS[x.metodo] || x.metodo)}</td><td>${escapeHTML(RESULTADOS[x.resultado] || x.resultado)}</td><td>${escapeHTML(dataBr(x.valido_ate))}</td><td>${linkSeguro(x.evidencia_url)}</td><td>${escapeHTML(x.avaliado_por || '')}</td></tr>`).join('')}</tbody></table>`
            : '<p style="color:var(--text-dim)">Nenhuma avaliação registrada.</p>'}</div>
        ${t.metodo === 'questionario' ? secaoHomologacao(projectId, parteId, homologacoes, editar) : ''}
        <h4 style="margin:1.25rem 0 0.5rem">DPA e contratos</h4>
        <div id="tc-docs">${ligados.length ? `<table class="data-table"><tbody>${ligados.map((d) =>
            `<tr><td>${escapeHTML(d.titulo)}</td><td>${escapeHTML(PAPEIS_DOC[d.papel] || d.papel)}</td><td style="text-align:right">${editar
                ? `<button class="btn btn-ghost btn-sm" data-action="desligarDocumentoTerceiro" data-args='${args(projectId, parteId, d.id, d.papel)}'>Desligar</button>` : ''}</td></tr>`).join('')}</tbody></table>`
            : '<p style="color:var(--text-dim)">Nenhum documento ligado.</p>'}
            ${editar && documentos.length ? `<div style="display:flex; gap:0.5rem; align-items:flex-end; margin-top:0.75rem"><div class="form-group" style="flex:2; margin:0"><label class="form-label" for="tc-doc">Documento</label>
                <select class="form-input" id="tc-doc">${documentos.map((d) => `<option value="${escapeHTML(d.id)}">${escapeHTML(d.titulo)}</option>`).join('')}</select></div>
                <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-doc-papel">Papel</label><select class="form-input" id="tc-doc-papel">${Object.entries(PAPEIS_DOC).map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></div>
                <button class="btn btn-sm" data-action="ligarDocumentoTerceiro" data-args='${args(projectId, parteId)}'>Ligar</button></div>` : ''}</div>
        <h4 style="margin:1.25rem 0 0.5rem">Suboperadores</h4>
        <div id="tc-subs">${lista(t.suboperadores).length ? lista(t.suboperadores).map((s) => escapeHTML(s.nome)).join(', ') : '<span style="color:var(--text-dim)">Nenhum.</span>'}</div>
        <h4 style="margin:1.25rem 0 0.5rem">Tratamentos que usam este terceiro</h4>
        <div id="tc-trat">${lista(t.tratamentos_afetados).length ? lista(t.tratamentos_afetados).map((r) => escapeHTML(r.finalidade)).join('; ') : '<span style="color:var(--text-dim)">Nenhum.</span>'}</div>
    `, 'modal-large');
};

window.abrirAdicionarTerceiro = async function (projectId) {
    let cand;
    try { cand = lista(await api('GET', `/api/v1/projects/${projectId}/terceiros/candidatos`)); } catch (e) { falha(e, 'Não foi possível listar as partes'); return; }
    openModal(`
        <h3>Adicionar parte existente como terceiro</h3>
        ${cand.length ? `<div class="form-group"><label class="form-label" for="tc-cand">Parte</label>
            <select class="form-input" id="tc-cand">${cand.map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nome)}</option>`).join('')}</select></div>
            <div class="form-group"><label class="form-label" for="tc-cand-tipo">Tipo do terceiro</label>
            <select class="form-input" id="tc-cand-tipo">${Object.entries(TIPOS).map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></div>
            <button class="btn btn-primary" data-action="adicionarTerceiro" data-args='${args(projectId)}'>Adicionar</button>`
            : '<p style="color:var(--text-dim)">Nenhuma parte para adicionar: as organizações do projeto já são terceiros.</p>'}
    `);
};

window.adicionarTerceiro = async function (projectId) {
    try {
        await api('PUT', `/api/v1/projects/${projectId}/terceiros/${el('tc-cand').value}/tipo`, { terceiro_tipo: el('tc-cand-tipo').value });
        closeModal();
        showToast('Terceiro adicionado.', 'success');
        window.render();
    } catch (e) { falha(e, 'Não foi possível adicionar o terceiro'); }
};

async function acao(projectId, parteId, fazer, padrao, sucesso) {
    try {
        await fazer();
        if (sucesso) showToast(sucesso, 'success');
        await window.abrirTerceiro(projectId, parteId);
        window.render();
    } catch (e) { falha(e, padrao); }
}

window.salvarTipoTerceiro = (projectId, parteId) => acao(projectId, parteId,
    () => api('PUT', `/api/v1/projects/${projectId}/terceiros/${parteId}/tipo`, { terceiro_tipo: el('tc-tipo-sel').value || null }), 'Não foi possível salvar o tipo', 'Tipo salvo.');

window.registrarAvaliacaoTerceiro = function (projectId, parteId) {
    const validoAte = el('tc-val').value;
    if (!validoAte) { showToast('Informe até quando a avaliação vale', 'error'); return; }
    return acao(projectId, parteId, () => api('POST', `/api/v1/projects/${projectId}/terceiros/${parteId}/avaliacoes`, {
        resultado: el('tc-res').value, valido_ate: validoAte, evidencia_url: el('tc-url').value.trim() || null, observacao: el('tc-obs').value.trim() || null,
    }), 'Não foi possível registrar a avaliação', 'Avaliação registrada.');
};

window.ligarDocumentoTerceiro = (projectId, parteId) => acao(projectId, parteId,
    () => api('POST', `/api/v1/projects/${projectId}/terceiros/${parteId}/documentos`, { documento_id: el('tc-doc').value, papel: el('tc-doc-papel').value }), 'Não foi possível ligar o documento', 'Documento ligado.');

window.desligarDocumentoTerceiro = (projectId, parteId, documentoId, papel) => acao(projectId, parteId,
    () => api('DELETE', `/api/v1/projects/${projectId}/terceiros/${parteId}/documentos/${documentoId}?papel=${encodeURIComponent(papel)}`), 'Não foi possível desligar o documento', 'Documento desligado.');

// ─── Homologação por questionário (F5) ──────────────────────────────────────────────────────────────────────────
// O link para o fornecedor sai uma vez, na criação; concluir é ato humano e grava a avaliação acima (método questionário).

const STATUS_HOMOLOGACAO = { aberta: ['Aguardando resposta', 'neutral'], respondida: ['Respondida', 'warning'], concluida: ['Concluída', 'success'], cancelada: ['Cancelada', 'neutral'] };
const RESPOSTAS_HOMOLOGACAO = { sim: 'Sim', nao: 'Não', parcial: 'Parcial', na: 'Não se aplica' };

function secaoHomologacao(projectId, parteId, homologacoes, editar) {
    const linhas = homologacoes.map((h) => {
        const [rotulo, tom] = h.expirada ? ['Link vencido', 'danger'] : (STATUS_HOMOLOGACAO[h.status] || [h.status, 'neutral']);
        return `<tr><td>${escapeHTML(String(h.created_at || '').slice(0, 10))}</td><td>${window.renderStatusBadge(rotulo, tom)}</td>
            <td>${escapeHTML(`${h.percentual}% (${h.respondidas} de ${h.total})`)}</td><td>${escapeHTML(dataBr(String(h.expira_em || '').slice(0, 10)))}</td>
            <td>${escapeHTML(RESULTADOS[h.resultado] || '')}</td>
            <td style="text-align:right">${editar ? `<button class="btn btn-ghost btn-sm" data-action="revisarHomologacao" data-args='${args(projectId, parteId, h.id)}'>Revisar</button>` : ''}</td></tr>`;
    }).join('');
    return `<h4 style="margin:1.25rem 0 0.5rem">Homologação por questionário</h4>
        <div id="tc-homologacao">${homologacoes.length
            ? `<table class="data-table"><thead><tr><th>Criada em</th><th>Situação</th><th>Respondido</th><th>Link vale até</th><th>Resultado</th><th></th></tr></thead><tbody>${linhas}</tbody></table>`
            : '<p style="color:var(--text-dim)">Nenhum questionário enviado.</p>'}
        ${editar ? `<div style="display:flex; gap:0.5rem; align-items:flex-end; flex-wrap:wrap; margin-top:0.75rem">
            <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-hm-dias">Link vale (dias)</label><input class="form-input" id="tc-hm-dias" type="number" min="1" max="60" value="15"></div>
            <div class="form-group" style="flex:2; margin:0"><label class="form-label" for="tc-hm-email">E-mail do fornecedor (opcional)</label><input class="form-input" id="tc-hm-email" type="email" maxlength="254"></div>
            <button class="btn btn-sm" data-action="criarHomologacaoTerceiro" data-args='${args(projectId, parteId)}'>Homologar</button></div>
            <div id="tc-hm-link"></div>` : ''}</div>`;
}

window.criarHomologacaoTerceiro = async function (projectId, parteId) {
    const dias = Number(el('tc-hm-dias').value);
    if (!Number.isInteger(dias) || dias < 1 || dias > 60) { showToast('Informe a validade do link em dias, de 1 a 60', 'error'); return; }
    const email = el('tc-hm-email').value.trim();
    let r;
    try {
        r = await api('POST', `/api/v1/projects/${projectId}/homologacoes`, email ? { parte_id: parteId, dias, email } : { parte_id: parteId, dias });
    } catch (e) { falha(e, 'Não foi possível criar a homologação'); return; }
    await window.abrirTerceiro(projectId, parteId);
    const alvo = el('tc-hm-link');
    if (!alvo) return;
    alvo.innerHTML = `<div style="margin-top:1rem; padding:1rem; border:1px solid var(--border)">
        <label class="form-label" for="tc-hm-url">Link do questionário, válido até ${escapeHTML(dataBr(String(r.expira_em || '').slice(0, 10)))}</label>
        <div style="display:flex; gap:0.5rem"><input class="form-input" id="tc-hm-url" readonly value="${escapeHTML(r.url)}"><button class="btn btn-ghost" data-action="copiarLinkHomologacao">Copiar</button></div>
        <p style="color:var(--text-dim); margin:0.5rem 0 0">${r.email_enviado ? 'O link também foi enviado por e-mail. ' : ''}Copie agora: o link não aparece de novo. Envie-o só ao fornecedor.</p></div>`;
};

window.copiarLinkHomologacao = async function () {
    const campo = el('tc-hm-url');
    if (!campo) return;
    try {
        await navigator.clipboard.writeText(campo.value);
        showToast('Link copiado');
    } catch {
        campo.select();
        showToast('Selecione o link e copie com Ctrl+C');
    }
};

window.revisarHomologacao = async function (projectId, parteId, id) {
    let h;
    try { h = await api('GET', `/api/v1/projects/${projectId}/homologacoes/${id}`); } catch (e) { falha(e, 'Não foi possível abrir a homologação'); return; }
    const [rotulo, tom] = h.expirada ? ['Link vencido', 'danger'] : (STATUS_HOMOLOGACAO[h.status] || [h.status, 'neutral']);
    const linhas = lista(h.perguntas).map((p) => `<tr><td>${escapeHTML(p.tema)}</td><td>${escapeHTML(p.texto)}</td>
        <td>${escapeHTML(RESPOSTAS_HOMOLOGACAO[p.resposta] || 'Sem resposta')}</td><td>${escapeHTML(p.justificativa || '')}</td></tr>`).join('');
    openModal(`
        <h3>Homologação de ${escapeHTML(h.parte_nome)}</h3>
        <p>${window.renderStatusBadge(rotulo, tom)} ${escapeHTML(`${h.percentual}% respondido (${h.respondidas} de ${h.total})`)}${h.enviada_em ? ` · enviado em ${escapeHTML(String(h.enviada_em).slice(0, 10))}` : ''}</p>
        <table class="data-table" id="tc-hm-respostas"><thead><tr><th>Tema</th><th>Pergunta</th><th>Resposta</th><th>Justificativa</th></tr></thead><tbody>${linhas}</tbody></table>
        ${h.status === 'respondida' ? `<h4 style="margin:1.25rem 0 0.5rem">Concluir</h4>
            <p style="color:var(--text-dim)">Concluir grava a avaliação do terceiro (método questionário) com o resultado e a validade abaixo.</p>
            <div style="display:flex; gap:0.5rem; align-items:flex-end; flex-wrap:wrap">
            <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-hm-res">Resultado</label><select class="form-input" id="tc-hm-res">${Object.entries(RESULTADOS).map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></div>
            <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-hm-val">Vale até</label><input class="form-input" id="tc-hm-val" type="date"></div>
            <div class="form-group" style="flex:2; margin:0"><label class="form-label" for="tc-hm-obs">Observação</label><input class="form-input" id="tc-hm-obs" maxlength="1500"></div>
            <button class="btn btn-primary btn-sm" data-action="concluirHomologacao" data-args='${args(projectId, parteId, id)}'>Concluir</button></div>` : ''}
        ${['aberta', 'respondida'].includes(h.status) ? `<div style="margin-top:1rem"><button class="btn btn-ghost btn-sm" data-action="cancelarHomologacao" data-args='${args(projectId, parteId, id)}'>Cancelar homologação</button></div>` : ''}
        <div style="margin-top:1rem"><button class="btn btn-ghost btn-sm" data-action="abrirTerceiro" data-args='${args(projectId, parteId)}'>Voltar ao terceiro</button></div>
    `, 'modal-large');
};

window.concluirHomologacao = async function (projectId, parteId, id) {
    const validoAte = el('tc-hm-val').value;
    if (!validoAte) { showToast('Informe até quando a avaliação vale', 'error'); return; }
    try {
        await api('POST', `/api/v1/projects/${projectId}/homologacoes/${id}/concluir`, { resultado: el('tc-hm-res').value, valido_ate: validoAte, observacao: el('tc-hm-obs').value.trim() || null });
        showToast('Homologação concluída e avaliação registrada.', 'success');
        await window.abrirTerceiro(projectId, parteId);
        window.render();
    } catch (e) { falha(e, 'Não foi possível concluir a homologação'); }
};

window.cancelarHomologacao = async function (projectId, parteId, id) {
    if (!(await window.confirmar('O link deixa de valer na hora e as respostas ficam guardadas.', { titulo: 'Cancelar homologação', perigo: true, rotulo: 'Cancelar homologação' }))) return;
    try {
        await api('POST', `/api/v1/projects/${projectId}/homologacoes/${id}/cancelar`);
        showToast('Homologação cancelada.');
        await window.abrirTerceiro(projectId, parteId);
    } catch (e) { falha(e, 'Não foi possível cancelar a homologação'); }
};

window.abrirPerguntasHomologacao = async function (projectId) {
    let d;
    try { d = await api('GET', `/api/v1/projects/${projectId}/homologacoes/perguntas`); } catch (e) { falha(e, 'Não foi possível abrir as perguntas'); return; }
    const perguntas = lista(d && d.perguntas);
    const linha = (p) => `<tr data-pergunta="${escapeHTML(p.id)}">
        <td><input class="form-input" data-campo="tema" maxlength="80" value="${escapeHTML(p.tema)}" aria-label="Tema"></td>
        <td><input class="form-input" data-campo="texto" maxlength="500" value="${escapeHTML(p.texto)}" aria-label="Pergunta"></td>
        <td><input type="checkbox" data-campo="ativa" ${p.ativa ? 'checked' : ''} aria-label="Ativa"></td>
        <td>${p.origem === 'padrao' ? 'Padrão, a validar' : 'Do projeto'}</td>
        <td><button class="btn btn-ghost btn-sm" data-action="salvarPerguntaHomologacao" data-args='${args(projectId, p.id)}'>Salvar</button></td></tr>`;
    openModal(`
        <h3>Perguntas do questionário de homologação</h3>
        ${d && d.a_validar ? '<p style="color:var(--warning)">As perguntas marcadas como padrão são um modelo genérico: revise e ajuste antes de enviar ao fornecedor.</p>' : ''}
        <p style="color:var(--text-dim)">Um envio já feito guarda as perguntas da época; a mudança vale para os próximos. Pergunta não se apaga: desmarque "Ativa".</p>
        <table class="data-table" id="tc-hp-lista"><thead><tr><th>Tema</th><th>Pergunta</th><th>Ativa</th><th>Origem</th><th></th></tr></thead><tbody>${perguntas.map(linha).join('')}</tbody></table>
        <h4 style="margin:1.25rem 0 0.5rem">Nova pergunta</h4>
        <div style="display:flex; gap:0.5rem; align-items:flex-end; flex-wrap:wrap">
            <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-hp-tema">Tema</label><input class="form-input" id="tc-hp-tema" maxlength="80"></div>
            <div class="form-group" style="flex:3; margin:0"><label class="form-label" for="tc-hp-texto">Pergunta</label><input class="form-input" id="tc-hp-texto" maxlength="500"></div>
            <button class="btn btn-sm" data-action="criarPerguntaHomologacao" data-args='${args(projectId)}'>Adicionar</button></div>
    `, 'modal-large');
};

window.salvarPerguntaHomologacao = async function (projectId, perguntaId) {
    const tr = [...document.querySelectorAll('#tc-hp-lista tr[data-pergunta]')].find((x) => x.dataset.pergunta === perguntaId);
    if (!tr) return;
    const campo = (n) => tr.querySelector(`[data-campo="${n}"]`);
    try {
        await api('PUT', `/api/v1/projects/${projectId}/homologacoes/perguntas/${perguntaId}`, { tema: campo('tema').value.trim(), texto: campo('texto').value.trim(), ativa: campo('ativa').checked });
        showToast('Pergunta salva.', 'success');
        await window.abrirPerguntasHomologacao(projectId);
    } catch (e) { falha(e, 'Não foi possível salvar a pergunta'); }
};

window.criarPerguntaHomologacao = async function (projectId) {
    const tema = el('tc-hp-tema').value.trim();
    const texto = el('tc-hp-texto').value.trim();
    if (!tema || !texto) { showToast('Informe o tema e a pergunta', 'error'); return; }
    try {
        await api('POST', `/api/v1/projects/${projectId}/homologacoes/perguntas`, { tema, texto });
        showToast('Pergunta adicionada.', 'success');
        await window.abrirPerguntasHomologacao(projectId);
    } catch (e) { falha(e, 'Não foi possível adicionar a pergunta'); }
};

window.renderTerceiros = renderTerceiros;
