import { S } from '../state.js';
import { api, API_BASE } from '../api.js';
import { showToast, openModal, closeModal, forceCloseModal, escapeHTML, formatarData, traduzStatus } from '../ui.js';
import { navigate, render } from '../router.js';
import { vazioSemFases } from './monitor.js';
import { indexarCatalogo, resolverAlvo, vizinhos } from '../bancada/estado.js';
import { criarAutosave } from '../bancada/autosave.js';
import { htmlDaTrilha } from '../bancada/trilha.js';
import { htmlDoCartao, htmlDosCriterios } from '../bancada/cartao.js';
import { montarCopiloto } from '../bancada/copiloto.js';

let ind = null;       // índice do catálogo
let aut = null;       // autosave do passo aberto
let vistos = {};      // campo -> atualizado_em que a tela viu (a chave do aviso de edição concorrente)
let cols = null;      // { trilha, cartao, copiloto }

const equipe = () => typeof window.ehEquipeNess === 'function' && window.ehEquipeNess();
const podeAdmin = () => equipe() || (S.user && S.user.role === 'org_admin');
const idDoProjeto = () => (S.currentProject || S.activeProject || {}).id;
/** "14:02" a partir do carimbo do servidor (SQLite, UTC): `formatarData` converte para o fuso da pessoa; fica só a hora. */
const hora = (iso) => { const m = /(\d{2}:\d{2})\s*$/.exec(formatarData(iso, { hora: true })); return m ? m[1] : ''; };
const argsDe = (...a) => escapeHTML(JSON.stringify(a));

/** Projeto ativo, como o `renderProjectDetail` antigo resolvia: S.currentProject, S.activeProject ou o primeiro de /projects. */
async function projetoAtivo() {
    let p = S.currentProject || S.activeProject;
    if (p && p.id) return p;
    const lista = Array.isArray(S.projects) && S.projects.length ? S.projects : await api('GET', '/api/v1/projects').catch(() => []);
    p = Array.isArray(lista) && lista[0];
    if (p) { S.activeProject = p; S.currentProject = p; }
    return p || null;
}

function opcoesDeResponsavel(atual) {
    return window.renderGovernanceSelectOptions ? window.renderGovernanceSelectOptions(S.currentGovernance || [], atual || '') : '';
}

function desenharTudo() {
    const passo = ind.passo(S.bancadaPasso);
    const det = S.bancadaDetalhe;
    cols.trilha.innerHTML = htmlDaTrilha(ind, S.bancada, S.bancadaPasso, S.bancadaAbertura || {});
    cols.cartao.innerHTML = htmlDoCartao({
        ind, passo, detalhe: det, equipe: equipe(), podeAdmin: podeAdmin(), ultimo: vizinhos(ind, passo.id).proximo === null,
        opcoesResponsavel: opcoesDeResponsavel(det.responsavel), salvo: S.bancadaSalvo || '', projectId: idDoProjeto(),
    });
    montarCopiloto({
        el: cols.copiloto, projectId: idDoProjeto(), passo, podeUsar: podeAdmin(),
        valoresAtuais: () => Object.fromEntries(passo.campos.map((c) => [c.id, (document.getElementById(`campo-${c.id}`) || {}).value || ''])),
        aoAceitar: (campo, valor) => { const el = document.getElementById(`campo-${campo}`); if (el) { el.value = valor; window.bancadaDigitou(campo, valor); } },
        focarCampo: (campo) => { const el = document.getElementById(`campo-${campo}`); if (el) el.focus(); },
    });
}

function refletirStatus(e) {
    S.bancadaSalvo = e.situacao === 'salvo' ? `Salvo às ${hora(e.salvoEm)}`
        : e.situacao === 'salvando' ? 'Salvando...' : e.situacao === 'repetindo' ? 'Não foi possível salvar. Tentando de novo...' : e.situacao === 'erro' ? e.mensagem : '';
    const el = document.getElementById('bancada-salvo');
    if (el) el.textContent = S.bancadaSalvo;
    const tentar = document.getElementById('bancada-tentar');
    if (tentar) tentar.hidden = e.situacao !== 'erro';
    if (e.situacao === 'conflito') mostrarConflito(e.conflitos);
}

async function salvarCampos(mapa) {
    const r = await api('PUT', `/api/v1/projects/${idDoProjeto()}/passos/${S.bancadaPasso}/campos`, { campos: mapa, vistos: Object.fromEntries(Object.keys(mapa).map((k) => [k, vistos[k] ?? null])) });
    Object.assign(vistos, r.gravados);
    for (const k of Object.keys(mapa)) if (mapa[k] === '') vistos[k] = null;
    S.bancadaDetalhe.avaliacao = r.avaliacao;
    const lista = document.getElementById('bancada-criterios');
    if (lista) lista.innerHTML = htmlDosCriterios(r.avaliacao);
    return r;
}

/** `levarFoco`: quem navega pelo teclado ou pelo botão cai no título do passo novo (o leitor de tela o anuncia). */
async function abrirPasso(id, levarFoco = false) {
    if (aut) await aut.esvaziar();
    const det = await api('GET', `/api/v1/projects/${idDoProjeto()}/passos/${id}`);
    S.bancadaPasso = id;
    S.bancadaDetalhe = det;
    S.bancadaSalvo = '';
    vistos = Object.fromEntries(Object.entries(det.valores).map(([k, v]) => [k, v.atualizado_em]));
    aut = criarAutosave({ salvar: salvarCampos, aoMudar: refletirStatus });
    desenharTudo();
    if (levarFoco) { const t = document.getElementById('bancada-h3'); if (t) t.focus(); }
    const url = new URL(window.location.href);
    url.searchParams.set('fase', String(ind.passo(id).fase));
    url.searchParams.set('passo', id);
    history.replaceState(history.state, '', url);
}

async function recarregarEstado() {
    S.bancada = await api('GET', `/api/v1/projects/${idDoProjeto()}/bancada`);
}

export async function renderBancada(c, h, a) {
    const p = await projetoAtivo();
    if (!p) { navigate('projects'); return; }
    h.textContent = p.project_name || p.client_name;    // #header-title é o h1 da página (login.html)
    a.innerHTML = `<button type="button" class="btn" data-action="navigate" data-args='["projects"]'>Voltar</button>`;   // fica também quando a carga falha
    c.innerHTML = '<div class="loading"></div>';
    try {
        const [banc, gov, pront] = await Promise.all([
            api('GET', `/api/v1/projects/${p.id}/bancada`),
            api('GET', `/api/v1/projects/${p.id}/governance`).catch(() => []),
            api('GET', `/api/v1/projects/${p.id}/prontidao`).catch(() => null),   // o indicador único de progresso (controles), como o Painel e o Monitor
        ]);
        S.currentGovernance = gov || [];
        S.indicadorDeControles = pront && pront.indicador ? pront.indicador : null;
        if (!banc.tem_fases) { c.innerHTML = vazioSemFases(p.id); return; }
        if (!S.passosCatalogo || S.passosCatalogo.versao !== banc.catalogo_versao) S.passosCatalogo = await api('GET', '/api/v1/passos/catalogo');
        ind = indexarCatalogo(S.passosCatalogo);
        S.bancada = banc;
        const alvo = resolverAlvo(ind, banc, S.bancadaAlvo);
        S.bancadaAlvo = null;
        S.bancadaAbertura = {};
        c.innerHTML = '<div class="bancada-topo" id="bancada-topo"></div><div class="bancada"><div id="bancada-trilha"></div><div id="bancada-cartao"></div><aside class="bancada-copiloto" id="bancada-copiloto" aria-label="Assistente"></aside></div>';
        cols = { trilha: document.getElementById('bancada-trilha'), cartao: document.getElementById('bancada-cartao'), copiloto: document.getElementById('bancada-copiloto') };
        desenharTopo();
        await abrirPasso(alvo);
    } catch (e) {
        window.falhaDeCarga(c, null, 'Não foi possível carregar a jornada do projeto.', e);
    }
}

function desenharTopo() {
    const b = S.bancada;
    const cont = b.continuar && ind.passo(b.continuar.passo);
    const ic = S.indicadorDeControles;
    const fase = S.bancadaPasso && ind.passo(S.bancadaPasso) ? ind.passo(S.bancadaPasso).fase : null;
    const pid = idDoProjeto();
    document.getElementById('bancada-topo').innerHTML = `<p class="bancada-nota">${ic ? `${ic.implementados} de ${ic.aplicaveis} controles aplicáveis implementados · ` : ''}${b.totais.concluidos} de ${b.totais.passos} passos concluídos (andamento do plano de trabalho, não da conformidade)${b.totais.bloqueados ? ` · ${b.totais.bloqueados} ${b.totais.bloqueados === 1 ? 'bloqueado' : 'bloqueados'}` : ''}</p>
        ${cont ? `<button type="button" class="btn" data-action="bancadaContinuar">Continuar de onde parou → Fase ${cont.fase}, Passo ${ind.passosDaFase(cont.fase).findIndex((x) => x.id === cont.id) + 1}</button>` : '<span class="bancada-nota">Jornada concluída</span>'}
        ${window.renderMaisAcoes ? window.renderMaisAcoes([
            fase !== null && { rotulo: 'Interpretar a fase', action: 'interpretPhaseAnswers', args: [fase, pid] },
            fase !== null && { rotulo: 'Adequar controles', action: 'suggestControlAdequacao', args: [fase, pid] },
            { rotulo: 'Dados da empresa', action: 'abrirDadosEmpresa', args: [pid] },
            { rotulo: 'Notas do auditor', action: 'openAuditorNotesModal', args: [pid] },
            { rotulo: 'Dossiê da jornada', action: 'generateJourneyDossier', args: [pid] },
            { rotulo: 'Ver a prontidão para a certificação', action: 'navigate', args: ['certification'] },
        ]) : ''}`;
}

// ── ações (data-action) ─────────────────────────────────────────────────────────────────────────────────
window.bancadaDigitou = (campo, valor) => { if (aut) aut.agendar(campo, valor); };
window.bancadaMarcou = (campo) => {
    const marcados = [...document.querySelectorAll(`input[name="${campo}"]:checked`)].map((el) => el.value);
    window.bancadaDigitou(campo, marcados.join('||'));
};
/** Sair do campo grava na hora o que estiver pendente (spec 7.1: `input` com 800 ms e `blur`). */
window.bancadaSaiuDoCampo = () => { if (aut && aut.temPendente()) aut.esvaziar().catch(() => {}); };
window.bancadaTentarAgora = () => { if (aut) aut.tentarAgora(); };
window.bancadaIrParaPasso = (id) => abrirPasso(id, true).catch((e) => showToast(e.message, 'error'));
/** Quem muda o que o passo mede por fora (as entrevistas) pede a releitura do passo e do resumo. */
window.bancadaRecarregarPasso = async () => { try { await recarregarEstado(); await abrirPasso(S.bancadaPasso); desenharTopo(); } catch (e) { showToast(e.message, 'error'); } };
window.bancadaContinuar = () => window.bancadaIrParaPasso(S.bancada.continuar.passo);
window.bancadaPular = async () => { const { proximo } = vizinhos(ind, S.bancadaPasso); if (proximo) await abrirPasso(proximo, true); };
window.bancadaAbrirEtapa = (n) => { S.bancadaAbertura = { etapa: n, fase: ind.etapa(n).fases[0] }; cols.trilha.innerHTML = htmlDaTrilha(ind, S.bancada, S.bancadaPasso, S.bancadaAbertura); };
window.bancadaAbrirFase = (n) => { S.bancadaAbertura = { etapa: ind.fase(n).etapa, fase: n }; cols.trilha.innerHTML = htmlDaTrilha(ind, S.bancada, S.bancadaPasso, S.bancadaAbertura); };
window.bancadaAbrirTela = (tela) => navigate(tela);

window.bancadaTeclaTrilha = (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const botoes = [...document.querySelectorAll('.bancada-trilha .bancada-passo')];
    if (!botoes.length) return;
    const i = botoes.indexOf(document.activeElement);
    const alvo = e.key === 'Home' ? 0 : e.key === 'End' ? botoes.length - 1 : Math.max(0, Math.min(botoes.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    e.preventDefault();
    botoes[alvo].focus();
};

function destacarFaltas(criterios) {
    const faltam = criterios.filter((x) => !x.ok);
    document.getElementById('bancada-faltas').textContent = `Faltam: ${faltam.map((x) => x.rotulo).join('; ')}`;
    const passo = ind.passo(S.bancadaPasso);
    const vazio = passo.campos.find((c) => c.obrigatorio && !S.bancadaDetalhe.valores[c.id] && !(document.getElementById(`campo-${c.id}`) || {}).value);
    const alvo = faltam.some((x) => x.tipo === 'campos_preenchidos') && vazio ? document.getElementById(`campo-${vazio.id}`) : document.getElementById('bancada-prova');
    if (alvo) { alvo.setAttribute('aria-invalid', 'true'); alvo.focus(); }
}

/** O botão primário (spec 7.1): salva; se o "concluído quando" passa, conclui e vai ao próximo; senão fica e mostra o que falta. */
window.bancadaSalvarEIr = async () => {
    try {
        await aut.esvaziar();
        if (S.bancadaDetalhe.passo.estado !== 'concluido') {
            if (!S.bancadaDetalhe.avaliacao.ok) { destacarFaltas(S.bancadaDetalhe.avaliacao.criterios); return; }
            try { await api('POST', `/api/v1/projects/${idDoProjeto()}/passos/${S.bancadaPasso}/concluir`, {}); }
            catch (e) { if (e.status === 409 && e.body && e.body.faltam) { destacarFaltas(e.body.faltam); return; } throw e; }
        }
        await recarregarEstado();
        const { proximo } = vizinhos(ind, S.bancadaPasso);
        if (proximo) await abrirPasso(proximo, true); else navigate('certification');
        desenharTopo();
    } catch (e) { showToast(e.message, 'error'); }
};

window.bancadaBloquear = () => openModal(`<div class="modal-header"><span class="modal-title">Bloquear este passo</span></div>
    <p class="bancada-nota">Diga o que impede o avanço e quem resolve. O motivo aparece no passo e no Monitor.</p>
    <label for="bloq-motivo" class="rotulo-campo">Motivo (obrigatório)</label><textarea id="bloq-motivo" class="form-input" rows="3"></textarea>
    <label for="bloq-resp" class="rotulo-campo">Responsável (obrigatório)</label><select id="bloq-resp" class="form-select">${opcoesDeResponsavel('')}</select>
    <p class="bancada-nota" id="bloq-erro" role="alert"></p>
    <div class="acoes-rodape"><button type="button" class="btn" data-action="forceCloseModal">Cancelar</button><button type="button" class="btn btn-primary" data-action="bancadaConfirmarBloqueio">Bloquear</button></div>`);
/** Responsável e prazo (saem do "Editar" antigo): um PATCH por mudança. */
window.bancadaMeta = async (campo, valor) => {
    try {
        const r = await api('PATCH', `/api/v1/projects/${idDoProjeto()}/passos/${S.bancadaPasso}`, { [campo]: valor || null });
        S.bancadaDetalhe.avaliacao = r.avaliacao;
        const lista = document.getElementById('bancada-criterios');
        if (lista) lista.innerHTML = htmlDosCriterios(r.avaliacao);
    } catch (e) { showToast(e.message, 'error'); }
};
const mudarEstado = (acao, corpo = {}) => async () => {
    try {
        await aut.esvaziar();
        // Caminhos literais (o teste de contrato tela↔API só enxerga /api/v1 escrito por extenso).
        if (acao === 'reabrir') await api('POST', `/api/v1/projects/${idDoProjeto()}/passos/${S.bancadaPasso}/reabrir`, corpo);
        else await api('POST', `/api/v1/projects/${idDoProjeto()}/passos/${S.bancadaPasso}/desbloquear`, corpo);
        await recarregarEstado();
        await abrirPasso(S.bancadaPasso);
        desenharTopo();
    } catch (e) { showToast(e.message, 'error'); }
};
window.bancadaDesbloquear = mudarEstado('desbloquear');
window.bancadaReabrir = mudarEstado('reabrir');
window.bancadaLiberarFase = async (n) => {
    try { await api('DELETE', `/api/v1/projects/${idDoProjeto()}/bancada/fases/${n}/situacao-antiga`); await recarregarEstado(); desenharTudo(); desenharTopo(); }
    catch (e) { showToast(e.message, 'error'); }
};
window.bancadaCopiarAnotacao = () => {
    const alvo = ind.passo(S.bancadaPasso).campos.find((c) => c.tipo === 'texto_longo' && !c.semIA);
    const el = alvo && document.getElementById(`campo-${alvo.id}`);
    if (!el) return;
    el.value = `${el.value}${el.value ? '\n\n' : ''}${S.bancadaDetalhe.anotacao_anterior}`;
    window.bancadaDigitou(alvo.id, el.value);
};
window.bancadaDescartarAnotacao = async () => {
    try { await api('DELETE', `/api/v1/projects/${idDoProjeto()}/passos/${S.bancadaPasso}/anotacao-anterior`); await abrirPasso(S.bancadaPasso); }
    catch (e) { showToast(e.message, 'error'); }
};

window.bancadaConfirmarBloqueio = async () => {
    const motivo = (document.getElementById('bloq-motivo').value || '').trim();
    const responsavel = (document.getElementById('bloq-resp').value || '').trim();
    if (motivo.length < 5 || !responsavel) { document.getElementById('bloq-erro').textContent = 'Informe o motivo (ao menos 5 letras) e escolha o responsável.'; return; }
    try {
        await api('POST', `/api/v1/projects/${idDoProjeto()}/passos/${S.bancadaPasso}/bloquear`, { motivo, responsavel });
        forceCloseModal();
        await recarregarEstado();
        await abrirPasso(S.bancadaPasso);
        desenharTopo();
    } catch (e) { document.getElementById('bloq-erro').textContent = e.message; }
};

window.bancadaConcluirComExcecao = () => openModal(`<div class="modal-header"><span class="modal-title">Concluir com exceção</span></div>
    <p class="bancada-nota">O passo ainda não cumpre o "Concluído quando". A exceção fica registrada com o seu nome e o motivo.</p>
    <label for="exc-motivo" class="rotulo-campo">Motivo (ao menos 10 letras)</label><textarea id="exc-motivo" class="form-input" rows="3"></textarea>
    <p class="bancada-nota" id="exc-erro" role="alert"></p>
    <div class="acoes-rodape"><button type="button" class="btn" data-action="forceCloseModal">Cancelar</button><button type="button" class="btn" data-action="bancadaConfirmarExcecao">Concluir com exceção</button></div>`);
window.bancadaConfirmarExcecao = async () => {
    const motivo = (document.getElementById('exc-motivo').value || '').trim();
    if (motivo.length < 10) { document.getElementById('exc-erro').textContent = 'Explique o motivo com ao menos 10 letras.'; return; }
    try {
        await aut.esvaziar();
        await api('POST', `/api/v1/projects/${idDoProjeto()}/passos/${S.bancadaPasso}/concluir`, { excecao: { motivo } });
        forceCloseModal();
        await recarregarEstado();
        await abrirPasso(S.bancadaPasso);
        desenharTopo();
    } catch (e) { document.getElementById('exc-erro').textContent = e.message; }
};

function mostrarConflito(conflitos) {
    const c = conflitos[0];
    if (!c) return;
    S.bancadaConflito = c;
    openModal(`<div class="modal-header"><span class="modal-title">Outra pessoa alterou este campo</span></div>
        <p>${escapeHTML(c.por || 'Alguém')} alterou este campo às ${escapeHTML(hora(c.atualizado_em))}.</p>
        <p class="bancada-nota">Texto dele:</p><p>${escapeHTML(c.valor_atual)}</p>
        <div class="acoes-rodape"><button type="button" class="btn" data-action="bancadaResolverConflito" data-args='${argsDe(c.campo, 'dele')}'>Usar o dele</button>
        <button type="button" class="btn btn-primary" data-action="bancadaResolverConflito" data-args='${argsDe(c.campo, 'meu')}'>Manter o meu</button></div>`);
}
window.bancadaResolverConflito = async (campo, quem) => {
    const c = S.bancadaConflito;
    forceCloseModal();
    if (quem === 'dele') { const el = document.getElementById(`campo-${campo}`); if (el) el.value = c.valor_atual; vistos[campo] = c.atualizado_em; aut.descartar(campo); return; }
    vistos[campo] = c.atualizado_em;         // vale o meu: o servidor aceita porque agora "vi" a versão dele
    await aut.tentarAgora();
};

// ── prova do passo: envio de arquivo, documento gerado e registro ─────────────────────────────────────────
/** Depois de ligar a prova, a tela segue no mesmo passo (e não volta ao "continuar", que é o que `render()` faria). */
async function aposProva() {
    if (ind && S.bancadaPasso && cols && document.getElementById('bancada-cartao')) { await recarregarEstado(); await abrirPasso(S.bancadaPasso); desenharTopo(); } else render();
}

async function wsUploadEvidence(docType) {
    const passo = ind && ind.passo(docType);
    openModal(`<h3 class="mb-4">Enviar arquivo${passo ? `: ${escapeHTML(passo.titulo)}` : ''}</h3>
        <div class="form-group"><label class="form-label" for="doc-file">Arquivo</label><input type="file" id="doc-file" class="form-input" accept=".pdf,.docx,.xlsx,.txt,.csv,.md,.png,.jpg,.jpeg"></div>
        <p id="doc-msg" class="bancada-nota" role="status"></p>
        <div class="acoes-rodape">
            <button type="button" class="btn" data-action="closeModal">Cancelar</button>
            <button type="button" class="btn btn-primary" data-action="doDocUpload" data-args='${argsDe(docType)}'>Enviar e extrair</button>
        </div>`);
}

async function doDocUpload(docType) {
    const msg = document.getElementById('doc-msg');
    const file = document.getElementById('doc-file')?.files?.[0];
    if (!file) { msg.textContent = 'Selecione um arquivo.'; return; }
    msg.textContent = 'Enviando...';
    try {
        const fd = new FormData();
        fd.append('file', file);
        // O servidor liga a evidência ao passo; quem conclui o passo é a pessoa, pelo botão principal.
        fd.append('item_id', docType);
        const res = await fetch(`${API_BASE}/api/v1/projects/${idDoProjeto()}/documents/upload`, {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + S.token }, body: fd,
        });
        const data = await res.json();
        if (data.ok) {
            showToast('Arquivo enviado');
            closeModal();
            await aposProva();
        } else {
            msg.textContent = data.error || 'Não foi possível enviar o arquivo.';
        }
    } catch (e) {
        msg.textContent = 'Não foi possível enviar o arquivo: ' + e.message;
    }
}

/** A proposta aparece dentro do cartão, para leitura e edição; nada vira prova sem a pessoa aceitar. */
function mostrarProposta(texto, rotulo) {
    const el = document.getElementById('bancada-rascunho');
    if (!el) return;
    el.innerHTML = `<div class="bancada-proposta"><p class="rotulo">${escapeHTML(rotulo)}</p>
        <label for="bancada-rascunho-texto" class="rotulo-campo">Texto para conferir e ajustar</label>
        <textarea id="bancada-rascunho-texto" class="form-input" rows="10">${escapeHTML(texto || '')}</textarea>
        <p><button type="button" class="btn" data-action="bancadaAceitarProposta">Aceitar e anexar como prova</button>
        <button type="button" class="bancada-link" data-action="bancadaDescartarProposta">Descartar</button></p></div>`;
    const t = document.getElementById('bancada-rascunho-texto');
    if (t) t.focus();
}
window.bancadaDescartarProposta = () => { const el = document.getElementById('bancada-rascunho'); if (el) el.innerHTML = ''; };

function valoresDaTela() {
    const passo = ind.passo(S.bancadaPasso);
    return Object.fromEntries(passo.campos.map((c) => [c.id, c.tipo === 'multipla'
        ? [...document.querySelectorAll(`input[name="${c.id}"]:checked`)].map((el) => el.value).join('||')
        : (document.getElementById(`campo-${c.id}`) || {}).value || '']));
}

window.bancadaGerarDocumento = async () => {
    try {
        await aut.esvaziar();
        const r = await api('POST', `/api/v1/projects/${idDoProjeto()}/generate-document`, { itemId: S.bancadaPasso, fields: valoresDaTela() });
        mostrarProposta(r.content, 'Proposta do assistente');
    } catch (e) { showToast('Não foi possível gerar o documento: ' + e.message, 'error'); }
};

/** Passo sem documento a gerar: monta o registro com título, data e um bloco por campo (como o assistente antigo fazia). */
window.bancadaRegistrarProva = () => {
    const passo = ind.passo(S.bancadaPasso);
    const v = valoresDaTela();
    let texto = `# ${passo.titulo}\n\n**Referência:** ${passo.clausula}\n**Data de registro:** ${formatarData(new Date())}\n\n---\n\n`;
    for (const c of passo.campos) if (v[c.id]) texto += `## ${c.rotulo}\n${v[c.id].split('||').join('; ')}\n\n`;
    mostrarProposta(texto, 'Registro montado a partir dos campos');
};

window.bancadaAceitarProposta = async () => {
    const content = (document.getElementById('bancada-rascunho-texto') || {}).value || '';
    try {
        await api('POST', `/api/v1/projects/${idDoProjeto()}/approve-document`, { itemId: S.bancadaPasso, content });
        showToast('Prova anexada ao passo');
        await aposProva();
    } catch (e) { showToast('Não foi possível anexar: ' + e.message, 'error'); }
};
window.bancadaEnviarProva = () => wsUploadEvidence(S.bancadaPasso);

// ── ações que moraram na tela antiga e a Bancada chama ────────────────────────────────────────────────────
// Interpretação coesa das respostas da fase: o agente devolve prontidão, pontos que citam a pergunta e próximos passos,
// com a cobertura determinística das perguntas sem resposta.
window.interpretPhaseAnswers = async function (phaseNumber, projectId) {
    if (!S.phaseQuestions) S.phaseQuestions = await api('GET', '/api/v1/phase-questions').catch(() => ({}));
    const questions = (S.phaseQuestions && S.phaseQuestions[phaseNumber]) || [];
    const textoDaPergunta = (k) => (questions.find((q) => q.key === k) || {}).question || k;
    openModal(`<div class="modal-header"><span class="modal-title">Interpretando a fase…</span></div>
        <div class="py-6 px-0 t-center t-dim">Analisando as respostas com o agente de conformidade…</div>`);
    try {
        const r = await api('GET', `/api/v1/projects/${projectId}/phase-answers/${phaseNumber}/interpret`);
        const rotulos = { em_dia: 'Em dia', atencao: 'Atenção', critico: 'Crítico' };
        const it = r.interpretacao;
        const cab = r.clausula ? `${escapeHTML(r.titulo)} — cláusula ${escapeHTML(r.clausula)}` : escapeHTML(r.titulo || ('Fase ' + phaseNumber));
        const cov = r.cobertura || { total: 0, respondidas: 0, sem_resposta: [] };
        const completo = cov.total > 0 && cov.respondidas === cov.total;
        let corpo = '';
        if (it) {
            corpo += `<p><strong>Prontidão da fase: ${escapeHTML(rotulos[it.prontidao] || rotulos.atencao)}</strong></p>`;
            if (it.resumo) corpo += `<p>${escapeHTML(it.resumo)}</p>`;
            if (it.pontos && it.pontos.length) {
                corpo += '<h4>Pontos de atenção</h4>';
                corpo += it.pontos.map((pt) => `<div class="bancada-aviso"><span class="bancada-nota">${escapeHTML(pt.severidade)} · ${escapeHTML(textoDaPergunta(pt.pergunta_key))}</span><p>${escapeHTML(pt.observacao)}</p></div>`).join('');
            }
            if (it.proximos_passos && it.proximos_passos.length) {
                corpo += `<h4>Próximos passos</h4><ol>${it.proximos_passos.map((s) => `<li>${escapeHTML(s)}</li>`).join('')}</ol>`;
            }
        } else {
            const motivo = r.motivo ? ` (${escapeHTML(r.motivo)})` : '';
            corpo += `<p class="bancada-nota">${completo ? 'As respostas desta fase estão completas, mas a interpretação por IA não pôde ser gerada agora.' : 'A interpretação assistida por IA está indisponível no momento.'}${motivo}</p>`;
        }
        corpo += `<p class="bancada-nota"><strong>Cobertura:</strong> ${cov.respondidas}/${cov.total} perguntas respondidas</p>`;
        if (cov.sem_resposta && cov.sem_resposta.length) corpo += `<ul>${cov.sem_resposta.map((q) => `<li>Sem resposta: ${escapeHTML(q.pergunta)}</li>`).join('')}</ul>`;
        openModal(`<div class="modal-header"><span class="modal-title">Interpretação — ${cab}</span></div>
            <div class="bancada-rolagem">${corpo}<p class="bancada-nota">${escapeHTML(r.rotulo || '')}</p></div>`);
    } catch (e) {
        forceCloseModal();
        showToast('Falha ao interpretar: ' + e.message, 'error');
    }
};

// Dossiê da jornada: consolida as respostas por fase num documento imprimível (Salvar como PDF).
window.generateJourneyDossier = async function (projectId) {
    openModal(`<div class="modal-header"><span class="modal-title">Gerando dossiê…</span></div>
        <div class="py-6 px-0 t-center t-dim">Consolidando as respostas da jornada…</div>`);
    try {
        const d = await api('GET', `/api/v1/projects/${projectId}/journey-dossier`);
        const pj = d.projeto || {};
        const secoes = d.secoes || [];
        const secoesHtml = secoes.length ? secoes.map((s) => `<section>
                <h3>Fase ${s.phase} — ${escapeHTML(s.titulo)}${s.clausula ? ` · cláusula ${escapeHTML(s.clausula)}` : ''}</h3>
                <p class="bancada-nota">Situação: ${escapeHTML(traduzStatus(s.status))} · ${s.cobertura.respondidas}/${s.cobertura.total} respondidas</p>
                <dl>${s.respostas.map((r) => `<dt>${escapeHTML(r.pergunta)}</dt><dd>${r.resposta ? escapeHTML(r.resposta) : '— sem resposta —'}</dd>`).join('')}</dl>
            </section>`).join('') : window.renderEmptyState({ titulo: 'Nenhuma resposta registrada na jornada ainda.', compacto: true });
        const doc = `<div id="dossie-print">
            <h2>Dossiê da Jornada — ${escapeHTML(pj.client_name || '')}</h2>
            <p class="bancada-nota">Normas: ${escapeHTML(pj.standards || '')} · Papel: ${escapeHTML(traduzStatus(pj.org_role || ''))} · Situação: ${escapeHTML(traduzStatus(pj.status || ''))}<br>
                ${pj.scope ? 'Escopo: ' + escapeHTML(pj.scope) + '<br>' : ''}
                Gerado em ${formatarData(d.generated_at, { hora: true })} · ${d.resumo.fases_iniciadas} fase(s) iniciada(s) · ${d.resumo.respondidas} resposta(s)</p>
            ${secoesHtml}
            <p class="bancada-nota">${escapeHTML(d.rotulo || '')}</p>
        </div>`;
        openModal(`<div class="modal-header"><span class="modal-title">Dossiê da Jornada</span>
                <button type="button" class="btn btn-primary" data-action="printDossie">Imprimir / PDF</button></div>
            <div class="bancada-rolagem">${doc}</div>`);
    } catch (e) {
        forceCloseModal();
        showToast('Falha ao gerar dossiê: ' + e.message, 'error');
    }
};

// Imprime só o dossiê, numa janela isolada (não depende de CSS @media print da app).
window.printDossie = function () {
    const el = document.getElementById('dossie-print');
    if (!el) return;
    const w = window.open('', '_blank');
    if (!w) { showToast('Permita pop-ups para imprimir o dossiê', 'error'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Dossiê da Jornada</title>
        <style>body{font-family:'Segoe UI',Arial,sans-serif;color:#111;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.4}
        h2{color:#00ade8}h3{margin:0 0 .25rem}dt{font-weight:600;margin-top:.5rem}dd{margin:0 0 .25rem}section{margin-bottom:1.25rem}
        :root{--text:#111;--text-dim:#666;--accent:#00ade8;--border:#ddd}</style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
};

// Adequação de controles: a IA sugere; a pessoa aprova cada item. Nada muda no controle até "Aplicar" (só status seguros).
window.suggestControlAdequacao = async function (phaseNumber, projectId) {
    openModal(`<div class="modal-header"><span class="modal-title">Sugerindo adequações…</span></div>
        <div class="py-6 px-0 t-center t-dim">Analisando as respostas e os controles do projeto…</div>`);
    try {
        const r = await api('GET', `/api/v1/projects/${projectId}/control-adequacao/${phaseNumber}/suggestions`);
        const sugs = r.sugestoes || [];
        S._adequacaoSugestoes = {}; // guarda para o Aplicar por índice
        const cab = r.clausula ? `${escapeHTML(r.titulo)} — cláusula ${escapeHTML(r.clausula)}` : escapeHTML(r.titulo || ('Fase ' + phaseNumber));
        let corpo;
        if (!sugs.length) {
            corpo = '<p class="bancada-nota">Sem sugestões de adequação para esta fase no momento (sem IA configurada, sem respostas, ou nada que as respostas sustentem com base objetiva).</p>';
        } else {
            corpo = sugs.map((s, i) => {
                S._adequacaoSugestoes[i] = { control_id: s.control_id, status: s.sugestao_status, maturity: s.sugestao_maturidade, justificativa: s.justificativa, pergunta_key: s.pergunta_key, phase_number: phaseNumber };
                const alvo = [s.sugestao_status ? `status: <strong>${escapeHTML(s.sugestao_status)}</strong>` : '', (s.sugestao_maturidade != null) ? `maturidade: <strong>${s.sugestao_maturidade}</strong>` : ''].filter(Boolean).join(' · ');
                return `<div id="adeq-item-${i}" class="bancada-aviso">
                    <strong>${escapeHTML(s.control_id)} — ${escapeHTML(s.control_title || '')}</strong>
                    <p class="bancada-nota">atual: status ${escapeHTML(String(s.status_atual ?? '—'))} · maturidade ${escapeHTML(String(s.maturidade_atual ?? 0))} → ${alvo}</p>
                    <p>${escapeHTML(s.justificativa)}</p>
                    <button type="button" class="btn" data-action="applyControlAdequacao" data-args='${argsDe(String(i), projectId)}'>Aplicar ao controle</button>
                </div>`;
            }).join('');
        }
        openModal(`<div class="modal-header"><span class="modal-title">Adequação de controles — ${cab}</span></div>
            <div class="bancada-rolagem">${corpo}<p class="bancada-nota">${escapeHTML(r.rotulo || '')}</p></div>`);
    } catch (e) {
        forceCloseModal();
        showToast('Falha ao sugerir adequação: ' + e.message, 'error');
    }
};

window.applyControlAdequacao = async function (idx, projectId) {
    const s = S._adequacaoSugestoes && S._adequacaoSugestoes[idx];
    if (!s) return;
    try {
        await api('POST', `/api/v1/projects/${projectId}/control-adequacao/apply`, s);
        const card = document.getElementById(`adeq-item-${idx}`);
        if (card) { card.classList.add('aplicado'); const b = card.querySelector('button'); if (b) b.outerHTML = '<span class="bancada-nota">Aplicado</span>'; }
        showToast('Adequação aplicada ao controle ' + s.control_id);
    } catch (e) {
        showToast('Falha ao aplicar: ' + e.message, 'error');
    }
};

// Documentos internos gerados: leitura e edição do texto de uma evidência em Markdown.
window.openInternalDocumentEditor = async function (evidenceId) {
    openModal(`<div class="modal-header"><span class="modal-title">Editor de documento interno</span></div>
        <div id="doc-editor-body" class="py-6 px-0"><div class="loading"></div></div>`, 'modal-large');
    try {
        const data = await api('GET', `/api/v1/evidence/${evidenceId}/content`);
        document.getElementById('doc-editor-body').innerHTML = `
            <label for="internal-doc-nome" class="rotulo-campo">Nome do arquivo</label>
            <input type="text" id="internal-doc-nome" class="form-input" value="${escapeHTML(data.file_name)}" readonly disabled>
            <label for="internal-doc-text" class="rotulo-campo">Conteúdo do documento (Markdown)</label>
            <textarea id="internal-doc-text" class="form-input" rows="20">${escapeHTML(data.content || '')}</textarea>
            <div class="acoes-rodape"><button type="button" class="btn" data-action="forceCloseModal">Cancelar</button>
            <button type="button" class="btn btn-primary" data-action="saveInternalDocument" data-args='${argsDe(evidenceId)}' data-arg-el>Salvar alterações</button></div>`;
    } catch (e) {
        document.getElementById('doc-editor-body').innerHTML = `<p class="bancada-nota" role="alert">Não foi possível carregar o documento: ${escapeHTML(e.message)}. Este arquivo pode ser um anexo externo (PDF, imagem etc.).</p>`;
    }
};

window.saveInternalDocument = async function (evidenceId, btnEl) {
    const content = document.getElementById('internal-doc-text').value;
    const antes = btnEl.textContent;
    btnEl.disabled = true;
    btnEl.textContent = 'Salvando...';
    try {
        await api('PUT', `/api/v1/evidence/${evidenceId}/content`, { content });
        showToast('Documento atualizado');
        forceCloseModal();
        await aposProva();
    } catch (e) {
        showToast('Não foi possível salvar o documento: ' + e.message, 'error');
    } finally {
        btnEl.disabled = false;
        btnEl.textContent = antes;
    }
};

// Documento gerado por IA para passo sem assistente: só devolve o rascunho; a prova nasce quando a pessoa aceita.
window.generateDocumentNatively = async function (projectId, itemId, btnEl) {
    const antes = btnEl.textContent;
    btnEl.disabled = true;
    btnEl.textContent = 'Gerando...';
    try {
        const res = await api('POST', `/api/v1/projects/${projectId}/checklist/${itemId}/generate`);
        mostrarProposta(res.content, 'Proposta do assistente');
    } catch (e) {
        showToast('Não foi possível gerar o documento: ' + e.message, 'error');
    } finally {
        btnEl.disabled = false;
        btnEl.textContent = antes;
    }
};

async function wsViewExtraction(docId) {
    try {
        const docs = await api('GET', `/api/v1/projects/${idDoProjeto()}/documents`);
        const doc = (docs || []).find((d) => d.id === docId);
        if (!doc) return;
        openModal(`<div class="modal-header"><span class="modal-title">Texto extraído: ${escapeHTML(doc.filename)}</span></div>
            <p class="bancada-nota">Situação: ${escapeHTML(traduzStatus(doc.status))} · Tipo: ${escapeHTML(doc.document_type || '')}</p>
            <label for="doc-ext-edit" class="rotulo-campo">Texto extraído (confira e corrija)</label>
            <textarea class="form-input" id="doc-ext-edit" rows="12">${escapeHTML(doc.extracted_summary || '')}</textarea>
            <div class="acoes-rodape"><button type="button" class="btn" data-action="forceCloseModal">Fechar</button>
            <button type="button" class="btn btn-primary" data-action="wsConfirmExtraction" data-args='${argsDe(docId)}'>Confirmar e indexar</button></div>`);
    } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

async function wsConfirmExtraction(docId) {
    const summary = document.getElementById('doc-ext-edit')?.value;
    if (!summary) return;
    await api('PUT', `/api/v1/projects/${idDoProjeto()}/documents/${docId}`, { extracted_summary: summary, status: 'confirmed' });
    forceCloseModal();
    await aposProva();
}

async function downloadAuditPack(projectId) {
    try {
        const headers = {};
        if (S.token) headers['Authorization'] = `Bearer ${S.token}`;
        const r = await fetch(API_BASE + `/api/v1/projects/${projectId}/audit-pack`, { headers });
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-pack-${projectId}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) { showToast('Erro ao baixar o pacote de auditoria: ' + e.message, 'error'); }
}

window.wsUploadEvidence = wsUploadEvidence;
window.doDocUpload = doDocUpload;
window.wsViewExtraction = wsViewExtraction;
window.wsConfirmExtraction = wsConfirmExtraction;
window.downloadAuditPack = downloadAuditPack;
// O router chama o global `renderProjectDetail` (o nome da tela `project-detail` não mudou); a função por trás agora é a Bancada.
window.renderProjectDetail = renderBancada;
