import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, escapeHTML, formatarData } from '../ui.js';
import { navigate } from '../router.js';
import { limparFichaDoEndereco, produtoAtual } from '../produto.js';

// Ficha do RIPD (spec 2026-10-26): uma página com abas, no molde da ficha do fornecedor, com a aba no endereço
// (`?tela=ripd-ficha&dpia=<id>&aba=<aba>`). Dados é o formulário do RIPD (tudo o que está no hash da aprovação); Teste de Impacto,
// Conformidade e Armazenamento são o questionário, gravado campo a campo em tabela própria, FORA do hash; Logs é a trilha do RIPD.
// Toda regra é do servidor; aqui só se mostra e se chama. Todo texto vindo do servidor é escapado.

const ABAS = [['dados', 'Dados'], ['teste_impacto', 'Teste de Impacto'], ['conformidade', 'Conformidade'], ['armazenamento', 'Armazenamento'], ['logs', 'Logs']];
const DE_PERGUNTAS = ['teste_impacto', 'conformidade', 'armazenamento'];
const ESCOLHAS = [['sim', 'Sim'], ['nao', 'Não'], ['nao_sei', 'Não sei agora']];
const STATUS = { Draft: 'Rascunho', 'Under Review': 'Em revisão', Approved: 'Aprovado' };
const RISCO_RESIDUAL = [['Low', 'Baixo'], ['Medium', 'Médio'], ['High', 'Alto']];
/** Campos de texto de Dados: o que entra no hash da aprovação (COLUNAS_DPIA no servidor), na ordem da tela. */
const CAMPOS = [
    ['system_name', 'Nome do sistema ou operação', 'linha'], ['data_flow_description', 'Descrição do fluxo de dados', 'area'],
    ['data_subjects_types', 'Tipos de titulares', 'linha'], ['personal_data_categories', 'Categorias de dados pessoais', 'linha'],
    ['data_category_risk', 'Risco por categoria de dado', 'area'], ['necessity_proportionality', 'Necessidade e proporcionalidade', 'area'],
    ['risks_identified', 'Riscos identificados à privacidade', 'area'], ['mitigation_measures', 'Medidas de mitigação e salvaguardas', 'area'],
    ['technical_measures', 'Medidas técnicas', 'area'], ['dpo_recommendations', 'Recomendações do encarregado (DPO)', 'area'],
    ['dpo_opinion', 'Parecer do encarregado (DPO)', 'area'],
];

const podeEditar = () => !!S.user && ['platform_admin', 'consultant', 'consultor', 'consultoria_admin'].includes(S.user.role);
const podeRevogar = () => !!S.user && (S.user.role === 'platform_admin' || S.user.role === 'org_admin');
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const lista = (r, chave) => (Array.isArray(r) ? r : (r && Array.isArray(r[chave]) ? r[chave] : []));
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const dpiaDoEndereco = () => new URLSearchParams(window.location.search).get('dpia') || (S.ripd && S.ripd.dpiaId);
const abaDoEndereco = () => {
    const id = new URLSearchParams(window.location.search).get('aba');
    return ABAS.some(([x]) => x === id) ? id : 'dados';
};
/** `replaceState`: abrir e trocar de aba não empilham histórico; recarregar volta ao mesmo RIPD e aba. */
function gravarNoEndereco(dpiaId, aba) {
    const u = new URL(window.location.href);
    u.searchParams.set('tela', 'ripd-ficha');
    u.searchParams.set('dpia', dpiaId);
    u.searchParams.set('aba', aba);
    window.history.replaceState(null, '', u);
}

window.abrirRipd = function (projectId, dpiaId, aba = 'dados') {
    if (typeof window.forceCloseModal === 'function') window.forceCloseModal();
    S.ripd = { projectId, dpiaId };
    gravarNoEndereco(dpiaId, aba);
    navigate('ripd-ficha');
};
window.ripdVoltar = function () {
    S.ripd = null;
    limparFichaDoEndereco();
    navigate('dpia');
};

let ultimo = null;
let sequencia = 0;
const voltar = '<button type="button" class="btn" data-action="ripdVoltar">Voltar aos RIPDs</button>';

// ─── Aba Dados ──────────────────────────────────────────────────────────────────────────────────────────────────

// No n.privacy quem assina pelo papel `ciso` é o encarregado (o cargo DPO dá a autoridade); no n.iso é o Líder SGSI.
const papelCiso = () => (produtoAtual() === 'privacy' ? 'Encarregado (DPO)' : 'Líder SGSI');

/** Uma assinatura, do encarregado ou da Direção, aprova o RIPD (decisão do dono de 20/10/2026). */
function assinaturas(dp, projectId, editar) {
    const linha = (conteudo) => `<div class="rf-assinatura">${conteudo}</div>`;
    const feitas = [[dp.dpo_signature, papelCiso()], [dp.ceo_signature, 'Direção Executiva']].filter(([nome]) => nome);
    if (feitas.length) return feitas.map(([nome, papel]) => linha(`<span class="t-sucesso">Aprovado por ${escapeHTML(nome)}</span> <span>(${escapeHTML(papel)})</span>`)).join('');
    const assinar = (papel, role) => linha(`<strong>${escapeHTML(papel)}</strong>${editar ? `<button type="button" class="btn btn-sm" data-action="approveDPIA" data-args='${args(projectId, dp.id, role)}'>Assinar</button>` : ''}`);
    return `<p class="at-nota">Uma assinatura, do ${escapeHTML(papelCiso())} ou da Direção Executiva, aprova o RIPD.</p>${assinar(papelCiso(), 'ciso')}${assinar('Direção Executiva', 'ceo')}`;
}

function abaDados(projectId, dp, editar) {
    const trava = editar ? '' : 'disabled';
    const campo = ([nome, rotulo, tipo]) => `<div class="form-group"><label class="form-label" for="rf-${nome}">${rotulo}</label>
        ${tipo === 'area' ? `<textarea class="form-input" id="rf-${nome}" ${trava}>${escapeHTML(dp[nome] || '')}</textarea>` : `<input class="form-input" id="rf-${nome}" value="${escapeHTML(dp[nome] || '')}" ${trava}>`}</div>`;
    const assinado = !!(dp.dpo_signature || dp.ceo_signature || dp.status === 'Approved');
    return `<div class="at-aba-corpo">
        ${assinado ? '<p class="at-nota" id="rf-aviso-hash" role="note">Este RIPD está aprovado. Mudar qualquer campo desta aba derruba a aprovação e ele volta a rascunho. As respostas das outras abas não afetam a aprovação.</p>' : ''}
        ${CAMPOS.slice(0, 10).map(campo).join('')}
        <div class="form-group"><label class="form-label" for="rf-residual_risk_level">Risco residual</label>
            <select class="form-input" id="rf-residual_risk_level" ${trava}>${dp.residual_risk_level ? '' : '<option value="">Não avaliado</option>'}${RISCO_RESIDUAL.map(([v, r]) => `<option value="${v}" ${dp.residual_risk_level === v ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        ${campo(CAMPOS[10])}
        <div class="form-group"><label class="form-label" for="rf-status">Situação</label>
            <select class="form-input" id="rf-status" ${dp.status === 'Approved' || !editar ? 'disabled' : ''}>${['Draft', 'Under Review', 'Approved'].filter((s) => s !== 'Approved' || dp.status === 'Approved').map((s) => `<option value="${s}" ${dp.status === s || (!dp.status && s === 'Draft') ? 'selected' : ''}>${STATUS[s]}</option>`).join('')}</select></div>
        <p class="re-erro" id="rf-erro" role="alert"></p>
        ${editar ? `<div class="at-acoes"><button type="button" class="btn btn-primary" data-action="ripdSalvarDados" data-args='${args(dp.id)}'>Salvar</button>
            <button type="button" class="btn t-perigo" data-action="deleteDPIA" data-args='${args(dp.id)}'>Excluir</button></div>` : ''}
        <h3 class="at-sub">Assinaturas do RIPD</h3>
        <div class="at-aba-corpo">${assinaturas(dp, projectId, editar)}
            ${podeRevogar() && assinado ? `<div class="at-acoes"><button type="button" class="btn btn-sm" data-action="revogarDPIA" data-args='${args(projectId, dp.id)}'>Revogar aprovação do RIPD</button></div>` : ''}
            ${window.podePedirAprovacao && window.podePedirAprovacao(S.user) ? `<div class="at-acoes"><button type="button" class="btn btn-sm" data-action="abrirPedidoAprovacao" data-args='${args(projectId, 'dpia', dp.id)}'>Pedir aprovação</button></div>` : ''}</div>
        <div class="at-acoes"><button type="button" class="btn" data-action="openDPIAReport" data-args='${args(projectId, dp.id)}'>Exportar RIPD (PDF)</button>
            <button type="button" class="btn" data-action="baixarWordRipd" data-args='${args(projectId, dp.id)}'>Baixar Word</button></div></div>`;
}

/** Só os campos que mudaram vão ao servidor: campo vazio que já era vazio nunca conta como mudança do conteúdo assinado. */
window.ripdSalvarDados = async function (id) {
    const dp = (ultimo && ultimo.dp) || {};
    const projectId = (ultimo && ultimo.projectId) || (projetoAtivo() || {}).id;
    const corpo = {};
    for (const [nome] of CAMPOS) {
        const v = el(`rf-${nome}`);
        if (v && (v.value || '') !== (dp[nome] || '')) corpo[nome] = v.value;
    }
    const risco = el('rf-residual_risk_level');
    if (risco && risco.value && risco.value !== (dp.residual_risk_level || '')) corpo.residual_risk_level = risco.value;
    const st = el('rf-status');
    if (st && !st.disabled && st.value !== (dp.status || 'Draft')) corpo.status = st.value;
    const erro = el('rf-erro');
    if (erro) erro.textContent = '';
    if (!Object.keys(corpo).length) { showToast('Nada mudou.'); return; }
    // Mudar o conteúdo de um RIPD aprovado derruba a aprovação no servidor (PUT /dpia/:id): a tela pergunta antes.
    const mudouConteudo = Object.keys(corpo).some((k) => k !== 'status');
    if ((dp.status === 'Approved' || dp.dpo_signature || dp.ceo_signature) && mudouConteudo
        && !(await window.confirmar('A aprovação do RIPD cai e ele volta a rascunho.', { titulo: 'Editar RIPD aprovado', rotulo: 'Editar' }))) return;
    try { await api('PUT', `/api/v1/dpia/${id}`, corpo); }
    catch (e) { if (el('rf-erro')) el('rf-erro').textContent = (e && e.message) || 'Não foi possível salvar o RIPD.'; return; }
    showToast('RIPD salvo.', 'success');
    await repintar();
};

// ─── Abas de perguntas (autosave por campo) ─────────────────────────────────────────────────────────────────────

/** As três páginas da Conformidade no legado: o servidor manda uma lista só; aqui ela ganha os títulos de grupo (1 a 6, 7 a 16, 17 a 29). */
const GRUPOS_CONFORMIDADE = [[1, 'Perguntas 1 a 6'], [7, '7 a 16'], [17, '17 a 29']];

/** Só leitura e nunca gravado: as bases legais vêm da atividade, como no legado ("Base Legal (Dados Pessoais)" e "(Dados sensíveis)"). */
function blocoBaseLegal(b) {
    const linha = (rotulo, itens) => `<p class="at-nota"><strong>${rotulo}</strong>: ${itens && itens.length ? itens.map(escapeHTML).join('; ') : 'não informada na atividade'}</p>`;
    return `<div class="at-aba-corpo" id="rf-base-legal">${linha('Base Legal (Dados Pessoais)', b && b.dados_pessoais)}${linha('Base Legal (Dados sensíveis)', b && b.dados_sensiveis)}</div>`;
}

function pergunta(q, editar, numero) {
    const idq = `rf-p-${escapeHTML(q.id)}`;
    const dica = !q.resposta && q.da_atividade ? `<p class="at-nota">A atividade já indica: ${escapeHTML(q.da_atividade)}</p>` : '';
    const corpo = q.tipo === 'escolha'
        ? `<div class="at-opcoes" role="radiogroup" aria-labelledby="${idq}-t">${ESCOLHAS.map(([v, rot]) => `<label class="re-opcao" for="${idq}-${v}">
            <input type="radio" id="${idq}-${v}" name="${idq}" value="${v}" ${q.resposta === v ? 'checked' : ''} ${editar ? `data-action-change="ripdResponder" data-args='${args(q.id)}' data-arg-val` : 'disabled'}>
            <span class="re-opcao-texto">${rot}</span></label>`).join('')}</div>`
        : `<textarea class="form-input" id="${idq}" aria-labelledby="${idq}-t" maxlength="2000" ${editar ? `data-action-change="ripdResponder" data-args='${args(q.id)}' data-arg-val` : 'disabled'}>${escapeHTML(q.resposta || '')}</textarea>`;
    return `<div class="at-pergunta"><p class="at-pergunta-texto" id="${idq}-t">${numero}. ${escapeHTML(q.texto)}</p>${dica}${corpo}${q.base_legal !== undefined ? blocoBaseLegal(q.base_legal) : ''}
        <p class="at-nota" id="rf-st-${escapeHTML(q.id)}" role="status"></p></div>`;
}

function abaPerguntas(aba, abas, editar) {
    const a = abas.find((x) => x.id === aba);
    if (!a) return window.renderEmptyState({ titulo: 'Não foi possível carregar as perguntas', compacto: true });
    return `<div class="at-aba-corpo"><p class="at-nota">As respostas desta aba não entram na aprovação do RIPD: responder não derruba assinatura nem pedido. Cada resposta é gravada ao sair do campo.</p>
        ${a.perguntas.map((q, i) => {
            const grupo = aba === 'conformidade' ? GRUPOS_CONFORMIDADE.find(([n]) => n === i + 1) : null;
            return `${grupo ? `<h3 class="at-sub">${grupo[1]}</h3>` : ''}${pergunta(q, editar, i + 1)}`;
        }).join('')}</div>`;
}

window.ripdResponder = async function (id, valor) {
    const dpiaId = dpiaDoEndereco();
    const projectId = ultimo && ultimo.projectId;
    const nota = el(`rf-st-${id}`);
    if (!dpiaId || !projectId) return;
    try {
        await api('PUT', `/api/v1/projects/${projectId}/dpia/${dpiaId}/questionario`, { respostas: { [id]: valor === '' ? null : valor } });
        if (nota) nota.textContent = 'Salvo.';
    } catch (e) { if (nota) nota.textContent = `Não foi possível salvar: ${(e && e.message) || 'tente de novo'}`; }
};

// ─── Aba Logs ───────────────────────────────────────────────────────────────────────────────────────────────────

function abaLogs(logs) {
    if (!logs.length) return window.renderEmptyState({ titulo: 'Nenhum registro ainda.', texto: 'Criação, alterações, respostas, assinaturas e reaberturas deste RIPD passam a aparecer aqui.', compacto: true });
    return `<ul class="at-lista-itens">${logs.map((l) => `<li class="at-log"><p class="at-log-linha">${escapeHTML(l.evento)}</p>
        <p class="at-nota">Nome: ${escapeHTML(l.nome || '')}</p><p class="at-nota">Data: ${formatarData(l.data, { hora: true })}</p></li>`).join('')}</ul>`;
}

// ─── Página ─────────────────────────────────────────────────────────────────────────────────────────────────────

async function renderRipdFicha(c, h, a) {
    ultimo = { c, h, a };
    a.innerHTML = voltar;
    const dpiaId = dpiaDoEndereco();
    const projectId = (S.ripd && S.ripd.dpiaId === dpiaId && S.ripd.projectId) || (projetoAtivo() || {}).id;
    if (!dpiaId || !projectId) {
        h.textContent = 'RIPD';
        c.innerHTML = window.renderEmptyState({ titulo: 'Nenhum RIPD aberto', texto: 'Abra um RIPD pela lista.', acao: voltar });
        return;
    }
    const minha = ++sequencia;
    const aba = abaDoEndereco();
    const editar = podeEditar();
    let dp;
    try { dp = lista(await api('GET', `/api/v1/projects/${projectId}/dpia`), 'assessments').find((x) => x.id === dpiaId); }
    catch (e) { if (minha === sequencia) window.falhaDeCarga(c, a, 'Não foi possível abrir o RIPD.', e); return; }
    if (minha !== sequencia) return;
    if (!dp) {
        h.textContent = 'RIPD';
        c.innerHTML = window.renderEmptyState({ titulo: 'RIPD não encontrado', texto: 'Ele pode ter sido excluído.', acao: voltar });
        return;
    }
    // O que só a aba aberta usa. Falha aqui não derruba a ficha: a aba diz que não carregou.
    let abas = null;
    let logs = [];
    if (DE_PERGUNTAS.includes(aba)) { try { abas = lista(await api('GET', `/api/v1/projects/${projectId}/dpia/${dpiaId}/questionario`), 'abas'); } catch (e) { abas = []; } }
    if (aba === 'logs') { try { logs = lista(await api('GET', `/api/v1/projects/${projectId}/dpia/${dpiaId}/logs`), 'logs'); } catch (e) { logs = []; } }
    if (minha !== sequencia) return;

    ultimo = { c, h, a, dp, projectId };
    S.dpia = [dp, ...(S.dpia || []).filter((x) => x.id !== dp.id)];
    // O título é o sistema; sem ele, a finalidade da atividade (RIPD que nasceu da atividade sem sistema ligado).
    h.textContent = dp.system_name || dp.atividade || dp.processing_name || 'RIPD';
    const corpo = aba === 'dados' ? abaDados(projectId, dp, editar) : aba === 'logs' ? abaLogs(logs) : abaPerguntas(aba, abas || [], editar);
    c.innerHTML = `<div class="tc"><p class="tc-resumo">${window.renderStatusBadge(STATUS[dp.status] || dp.status || 'Rascunho', dp.status === 'Approved' ? 'success' : dp.status === 'Under Review' ? 'warning' : 'info')}
            ${dp.atividade ? `Atividade: ${escapeHTML(dp.atividade)}` : ''}${dp.origem_mudou ? ' · O RoPA mudou depois deste RIPD: revise.' : ''}</p>
        <div class="at-abas" role="tablist" aria-label="Abas do RIPD">${ABAS.map(([id, r]) =>
            `<button type="button" role="tab" class="at-aba" id="rf-aba-${id}" aria-controls="rf-painel" aria-selected="${id === aba}" tabindex="${id === aba ? 0 : -1}"
                data-action="ripdIrParaAba" data-action-keydown="ripdTeclaAba" data-arg-event data-args='${args(id)}'>${escapeHTML(r)}</button>`).join('')}</div>
        <div role="tabpanel" class="tc-painel" id="rf-painel" aria-labelledby="rf-aba-${aba}" tabindex="0">${corpo}</div></div>`;
}
window.renderRipdFicha = renderRipdFicha;

const repintar = () => (ultimo ? renderRipdFicha(ultimo.c, ultimo.h, ultimo.a) : undefined);

async function irParaAba(id) {
    const dpiaId = dpiaDoEndereco();
    if (!dpiaId) return;
    gravarNoEndereco(dpiaId, id);
    await repintar();
    const botao = el(`rf-aba-${id}`);
    if (botao) botao.focus();
}
// Clique e teclado passam pela delegação com o evento primeiro (`data-arg-event`) e a aba depois.
window.ripdIrParaAba = (_e, id) => irParaAba(id);
window.ripdTeclaAba = function (e, atual) {
    const i = ABAS.findIndex(([x]) => x === atual);
    const n = ABAS.length;
    const proxima = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
    if (proxima === undefined) return;
    e.preventDefault();
    return irParaAba(ABAS[proxima][0]);
};
