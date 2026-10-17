import { S } from '../state.js';
import { api, API_BASE, cabecalhosAuth } from '../api.js';
import { ACOES } from './contrato.js';
import { url, lista } from './estado.js';
import { showToast, openModal, escapeHTML, pedirTexto, forceCloseModal } from '../ui.js';

// O menu "Ações" da atividade (spec seção 6). Quem decide o que está habilitado, e por quê, é o servidor (`ficha.acoes`); a tela só
// mostra, esmaecido e com o motivo em texto, o que não se pode fazer agora. Aprovar continua sendo o pedido de aprovação de sempre.

const ACAO_DO_MENU = {
    conferir_aprovar: 'atConferir', alterar_para_em_revisao: 'atEnviarRevisao', imprimir: 'atImprimir',
    reabrir: 'atReabrir', reativar: 'atReativar', cancelar: 'atCancelar', excluir: 'atExcluir',
};
const PERIGO = new Set(['cancelar', 'excluir']);

function ids() { const p = S.atividade || {}; return { pid: p.projectId, rid: p.ropaId }; }
const repintar = () => (typeof window.atRepintar === 'function' ? window.atRepintar() : undefined);
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');

/** Os itens de `renderMaisAcoes`, na ordem do legado; "Cancelar" e "Excluir" por último (o componente os põe depois do separador). */
export function itensDoMenu(ficha) {
    const { pid, rid } = ids();
    return ACOES.map(([id, rotulo, sub]) => {
        const a = (ficha.acoes && ficha.acoes[id]) || { habilitada: false, motivo: null };
        return { rotulo, sub, action: ACAO_DO_MENU[id], args: [pid, rid], perigo: PERIGO.has(id), desabilitado: !a.habilitada, motivo: a.motivo || '' };
    });
}

async function situacao(corpo, sucesso) {
    const { pid, rid } = ids();
    try { await api('POST', url(pid, rid, '/situacao'), corpo); } catch (e) { falha(e, 'Não foi possível mudar a situação.'); return; }
    showToast(sucesso, 'success');
    await repintar();
}

window.atEnviarRevisao = () => situacao({ acao: 'enviar_revisao' }, 'Atividade em revisão.');
window.atReativar = () => situacao({ acao: 'reativar' }, 'Atividade reativada.');

/** Reabrir e cancelar pedem o motivo (5 caracteres ou mais), que fica na trilha. */
async function comMotivo(acao, pergunta, rotulo, sucesso) {
    const motivo = await pedirTexto(pergunta, { titulo: rotulo, rotulo });
    if (motivo === null) return;
    if (motivo.length < 5) { showToast('Informe o motivo com 5 caracteres ou mais.', 'error'); return; }
    await situacao({ acao, motivo }, sucesso);
}
window.atReabrir = () => comMotivo('reabrir', 'Por que a atividade volta para a análise?', 'Reabrir atividade', 'Atividade reaberta.');
window.atCancelar = () => comMotivo('cancelar', 'Por que a atividade será cancelada? Ela fica somente para leitura até ser reativada.', 'Cancelar atividade', 'Atividade cancelada.');

// O relatório é HTML autenticado: busca com o cabeçalho da sessão e abre como blob (o token nunca vai na URL).
window.atImprimir = async function () {
    const { pid, rid } = ids();
    let r;
    try { r = await fetch(API_BASE + url(pid, rid, '/relatorio'), { headers: cabecalhosAuth(), signal: AbortSignal.timeout(30000) }); }
    catch (e) { showToast('Não foi possível gerar a versão para impressão.', 'error'); return; }
    if (!r.ok) { showToast(`Não foi possível gerar a versão para impressão (erro ${r.status}).`, 'error'); return; }
    const u = URL.createObjectURL(new Blob([await r.text()], { type: 'text/html;charset=utf-8' }));
    if (!window.open(u, '_blank')) showToast('O navegador bloqueou a nova janela. Permita pop-ups para este endereço.', 'error');
    setTimeout(() => URL.revokeObjectURL(u), 60000);
};

window.atExcluir = async function () {
    const { rid } = ids();
    const nome = (S.atividadeFicha && S.atividadeFicha.registro && S.atividadeFicha.registro.nome) || 'esta atividade';
    const digitado = await pedirTexto(`Excluir "${nome}" remove o cadastro definitivamente. Para confirmar, digite: excluir`, { titulo: 'Excluir atividade', rotulo: 'Excluir atividade', perigo: true });
    if (digitado === null) return;
    if (digitado.toLowerCase() !== 'excluir') { showToast('Nada foi excluído: a palavra digitada não confere.', 'error'); return; }
    try { await api('DELETE', `/api/v1/ropa/${rid}`); } catch (e) { falha(e, 'Não foi possível excluir a atividade.'); return; }
    showToast('Atividade excluída.', 'success');
    if (typeof window.atVoltar === 'function') window.atVoltar();
};

// ─── Conferir / Aprovar ───
const itemConferencia = (x, bloqueio) => `<li>${escapeHTML(x.texto)}${bloqueio && x.aba
    ? ` <button type="button" class="btn btn-sm" data-action="atIrDaConferencia" data-args='${escapeHTML(JSON.stringify([x.aba]))}'>Ir para a aba</button>` : ''}</li>`;

window.atConferir = async function () {
    const { pid, rid } = ids();
    let conf;
    try { conf = await api('GET', url(pid, rid, '/conferencia')); } catch (e) { falha(e, 'Não foi possível conferir a atividade.'); return; }
    const bloqueios = lista(conf.bloqueios);
    const avisos = lista(conf.avisos);
    openModal(`<h2 class="modal-title">Conferir antes de pedir a aprovação</h2>
        ${bloqueios.length ? `<h3 class="at-sub">Resolva antes de pedir</h3><ul class="at-lista" id="at-bloqueios">${bloqueios.map((x) => itemConferencia(x, true)).join('')}</ul>` : '<p class="at-nota">Nada impede o pedido de aprovação.</p>'}
        ${avisos.length ? `<h3 class="at-sub">Vale revisar</h3><ul class="at-lista" id="at-avisos">${avisos.map((x) => itemConferencia(x, false)).join('')}</ul>` : ''}
        <div class="at-acoes">${bloqueios.length ? ''
            : `<button type="button" class="btn btn-primary" data-action="atPedirAprovacao" data-args='${escapeHTML(JSON.stringify([pid, rid]))}'>Pedir aprovação</button>`}<button type="button" class="btn" data-action="forceCloseModal">Fechar</button></div>`);
};

window.atIrDaConferencia = async function (aba) { forceCloseModal(); if (typeof window.atIrParaAba === 'function') await window.atIrParaAba.call({ dataset: { aba } }); };
// O fluxo de sempre (conteúdo congelado, hash, senha, autoridade): o pedido não é reimplementado aqui.
window.atPedirAprovacao = function (pid, rid) { forceCloseModal(); window.abrirPedidoAprovacao(pid, 'tratamento', rid); };
