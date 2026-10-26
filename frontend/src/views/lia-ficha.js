import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, formatarData } from '../ui.js';
import { navigate } from '../router.js';
import { limparFichaDoEndereco } from '../produto.js';
import { formularioLia, podeEditar } from './tratamento-ligacoes.js';

// Ficha da LIA (spec 2026-10-26): uma página com abas, no molde da ficha do RIPD, com a aba no endereço
// (`?tela=lia-ficha&ropa=<id>&aba=<aba>`). Finalidade, Necessidade e Proporcionalidade são o questionário do legado (23 perguntas, todas em texto livre como no legado),
// gravado campo a campo em tabela própria; Conclusão é o formulário da LIA (balanceamento, salvaguardas, conclusão e o resto, com as
// regras de concluir e reabrir no servidor); Logs é a trilha. Toda regra é do servidor; aqui só se mostra e se chama. Texto do servidor escapado.

const ABAS = [['finalidade', 'Finalidade'], ['necessidade', 'Necessidade'], ['proporcionalidade', 'Proporcionalidade'], ['conclusao', 'Conclusão'], ['logs', 'Logs']];
const DE_PERGUNTAS = ['finalidade', 'necessidade', 'proporcionalidade'];
const ESCOLHAS = [['sim', 'Sim'], ['nao', 'Não'], ['nao_sei', 'Não sei agora']];
const SITUACAO = { faltando: ['Faltando', 'danger'], rascunho: ['Rascunho', 'warning'], concluida: ['Concluída', 'success'] };

const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
// api() desembrulha `{ ok: true, <lista> }` para a lista pura; sem o desembrulho, a lista vem na chave.
const lista = (r, chave) => (Array.isArray(r) ? r : (r && Array.isArray(r[chave]) ? r[chave] : []));
const ropaDoEndereco = () => new URLSearchParams(window.location.search).get('ropa') || (S.lia && S.lia.ropaId);
const abaDoEndereco = () => {
    const id = new URLSearchParams(window.location.search).get('aba');
    return ABAS.some(([x]) => x === id) ? id : 'finalidade';
};
/** `replaceState`: abrir e trocar de aba não empilham histórico; recarregar volta à mesma LIA e aba. */
function gravarNoEndereco(ropaId, aba) {
    const u = new URL(window.location.href);
    u.searchParams.set('tela', 'lia-ficha');
    u.searchParams.set('ropa', ropaId);
    u.searchParams.set('aba', aba);
    window.history.replaceState(null, '', u);
}

window.abrirLia = function (projectId, ropaId, aba = 'finalidade') {
    if (typeof window.forceCloseModal === 'function') window.forceCloseModal();
    S.lia = { projectId, ropaId };
    gravarNoEndereco(ropaId, aba);
    navigate('lia-ficha');
};
window.liaVoltar = function () {
    S.lia = null;
    limparFichaDoEndereco();
    navigate('lia');
};

let ultimo = null;
let sequencia = 0;
const voltar = '<button type="button" class="btn" data-action="liaVoltar">Voltar às LIAs</button>';

// ─── Abas de perguntas (autosave por campo) ─────────────────────────────────────────────────────────────────────

function pergunta(q, editar, n) {
    const idq = `lf-p-${escapeHTML(q.id)}`;
    const dica = !q.resposta && q.da_atividade ? `<p class="at-nota">A atividade já indica: ${escapeHTML(q.da_atividade)}</p>` : '';
    const corpo = q.tipo === 'escolha'
        ? `<div class="at-opcoes" role="radiogroup" aria-labelledby="${idq}-t">${ESCOLHAS.map(([v, rot]) => `<label class="re-opcao" for="${idq}-${v}">
            <input type="radio" id="${idq}-${v}" name="${idq}" value="${v}" ${q.resposta === v ? 'checked' : ''} ${editar ? `data-action-change="liaResponder" data-args='${args(q.id)}' data-arg-val` : 'disabled'}>
            <span class="re-opcao-texto">${rot}</span></label>`).join('')}</div>`
        : `<textarea class="form-input" id="${idq}" aria-labelledby="${idq}-t" maxlength="2000" ${editar ? `data-action-change="liaResponder" data-args='${args(q.id)}' data-arg-val` : 'disabled'}>${escapeHTML(q.resposta || '')}</textarea>`;
    return `<div class="at-pergunta"><p class="at-pergunta-texto" id="${idq}-t">${n}. ${escapeHTML(q.texto)}</p>${dica}${corpo}
        <p class="at-nota" id="lf-st-${escapeHTML(q.id)}" role="status"></p></div>`;
}

function abaPerguntas(aba, abas, editar) {
    const a = abas.find((x) => x.id === aba);
    if (!a) return window.renderEmptyState({ titulo: 'Não foi possível carregar as perguntas', compacto: true });
    return `<div class="at-aba-corpo"><p class="at-nota">As respostas desta aba são o questionário: não mudam a conclusão da LIA nem a regra de concluí-la. Cada resposta é gravada ao sair do campo.</p>
        ${a.perguntas.map((q, i) => pergunta(q, editar, i + 1)).join('')}</div>`;
}

window.liaResponder = async function (id, valor) {
    const ropaId = ropaDoEndereco();
    const projectId = ultimo && ultimo.projectId;
    const nota = el(`lf-st-${id}`);
    if (!ropaId || !projectId) return;
    try {
        await api('PUT', `/api/v1/projects/${projectId}/ropa/${ropaId}/lia/questionario`, { respostas: { [id]: valor === '' ? null : valor } });
        if (nota) nota.textContent = 'Salvo.';
    } catch (e) { if (nota) nota.textContent = `Não foi possível salvar: ${(e && e.message) || 'tente de novo'}`; }
};

// ─── Aba Conclusão e Logs ───────────────────────────────────────────────────────────────────────────────────────

function abaConclusao(lia, projectId, ropaId, editar) {
    const nota = '<p class="at-nota">Balanceamento, salvaguardas e conclusão do teste de legítimo interesse. Concluir exige finalidade, necessidade, balanceamento e conclusão; as respostas das outras abas não são exigidas.</p>';
    return `<div class="at-aba-corpo">${nota}${editar ? formularioLia(lia, projectId, ropaId, false) : `<p class="at-nota">${escapeHTML((lia && lia.balanceamento) || 'LIA ainda não preenchida.')}</p>`}</div>`;
}

function abaLogs(logs) {
    if (!logs.length) return window.renderEmptyState({ titulo: 'Nenhum registro ainda.', texto: 'Criação, alterações, respostas e conclusão desta LIA passam a aparecer aqui.', compacto: true });
    return `<ul class="at-lista-itens">${logs.map((l) => `<li class="at-log"><p class="at-log-linha">${escapeHTML(l.evento)}</p>
        <p class="at-nota">Nome: ${escapeHTML(l.nome || '')}</p><p class="at-nota">Data: ${formatarData(l.data, { hora: true })}</p></li>`).join('')}</ul>`;
}

// ─── Página ─────────────────────────────────────────────────────────────────────────────────────────────────────

async function renderLiaFicha(c, h, a) {
    ultimo = { c, h, a };
    a.innerHTML = voltar;
    const ropaId = ropaDoEndereco();
    const projectId = (S.lia && S.lia.ropaId === ropaId && S.lia.projectId) || (projetoAtivo() || {}).id;
    if (!ropaId || !projectId) {
        h.textContent = 'LIA';
        c.innerHTML = window.renderEmptyState({ titulo: 'Nenhuma LIA aberta', texto: 'Abra uma LIA pela lista.', acao: voltar });
        return;
    }
    const minha = ++sequencia;
    const aba = abaDoEndereco();
    const editar = podeEditar();
    let item;
    try { item = lista(await api('GET', `/api/v1/projects/${projectId}/ropa/lias`), 'lias').find((x) => x.ropa_id === ropaId); }
    catch (e) { if (minha === sequencia) window.falhaDeCarga(c, a, 'Não foi possível abrir a LIA.', e); return; }
    if (minha !== sequencia) return;
    if (!item) {
        h.textContent = 'LIA';
        c.innerHTML = window.renderEmptyState({ titulo: 'LIA não encontrada', texto: 'A atividade pode ter sido excluída ou não pede mais a LIA.', acao: voltar });
        return;
    }
    // O que só a aba aberta usa. Falha aqui não derruba a ficha: a aba diz que não carregou.
    let abas = null;
    let logs = [];
    let lia = null;
    if (DE_PERGUNTAS.includes(aba)) { try { abas = lista(await api('GET', `/api/v1/projects/${projectId}/ropa/${ropaId}/lia/questionario`), 'abas'); } catch (e) { abas = []; } }
    if (aba === 'logs') { try { logs = lista(await api('GET', `/api/v1/projects/${projectId}/ropa/${ropaId}/lia/logs`), 'logs'); } catch (e) { logs = []; } }
    if (aba === 'conclusao') { try { lia = (await api('GET', `/api/v1/projects/${projectId}/ropa/${ropaId}/lia`)).lia || null; } catch (e) { lia = null; } }
    if (minha !== sequencia) return;

    ultimo = { c, h, a, projectId };
    h.textContent = item.atividade || 'LIA';
    const [rotulo, tom] = SITUACAO[item.status] || [item.status, 'info'];
    const corpo = aba === 'conclusao' ? abaConclusao(lia, projectId, ropaId, editar) : aba === 'logs' ? abaLogs(logs) : abaPerguntas(aba, abas || [], editar);
    c.innerHTML = `<div class="tc"><p class="tc-resumo">${window.renderStatusBadge(rotulo, tom)} Atividade: ${escapeHTML(item.atividade || '')}
            <button type="button" class="btn btn-sm" data-action="abrirAtividade" data-args='${args(projectId, ropaId, 'base_juridica')}'>Abrir a atividade</button>
            ${item.status === 'concluida' && editar ? `<button type="button" class="btn btn-sm" data-action="reabrirLiaTratamento" data-args='${args(projectId, ropaId)}'>Reabrir</button>` : ''}
            ${item.status !== 'faltando' ? `<button type="button" class="btn btn-sm" data-action="baixarWordLia" data-args='${args(projectId, ropaId)}'>Imprimir LIA</button>` : ''}</p>
        <div class="at-abas" role="tablist" aria-label="Abas da LIA">${ABAS.map(([id, r]) =>
            `<button type="button" role="tab" class="at-aba" id="lf-aba-${id}" aria-controls="lf-painel" aria-selected="${id === aba}" tabindex="${id === aba ? 0 : -1}"
                data-action="liaIrParaAba" data-action-keydown="liaTeclaAba" data-arg-event data-args='${args(id)}'>${escapeHTML(r)}</button>`).join('')}</div>
        <div role="tabpanel" class="tc-painel" id="lf-painel" aria-labelledby="lf-aba-${aba}" tabindex="0">${corpo}</div></div>`;
}
window.renderLiaFicha = renderLiaFicha;

async function irParaAba(id) {
    const ropaId = ropaDoEndereco();
    if (!ropaId) return;
    gravarNoEndereco(ropaId, id);
    if (ultimo) await renderLiaFicha(ultimo.c, ultimo.h, ultimo.a);
    const botao = el(`lf-aba-${id}`);
    if (botao) botao.focus();
}
// Clique e teclado passam pela delegação com o evento primeiro (`data-arg-event`) e a aba depois.
window.liaIrParaAba = (_e, id) => irParaAba(id);
window.liaTeclaAba = function (e, atual) {
    const i = ABAS.findIndex(([x]) => x === atual);
    const n = ABAS.length;
    const proxima = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
    if (proxima === undefined) return;
    e.preventDefault();
    return irParaAba(ABAS[proxima][0]);
};
