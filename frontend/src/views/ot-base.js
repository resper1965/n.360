import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, confirmar, pedirTexto, showToast, formatarData } from '../ui.js';
import { podeEditarOt, ehGestor, mensagemDeErro, dataDoSqlite } from '../ot-comum.js';

// n.ot, cabeçalho do site (spec 2026-11-12 E3): régua Levantar → Revisar e aprovar → Base aprovada e o cartão "Próximo passo", que
// leva o único .btn-primary da tela. Lê GET .../sites/:id/situacao; pedir, aprovar e devolver a base são POSTs do Gestor/equipe.

const ETAPAS = ['Levantar', 'Revisar e aprovar', 'Base aprovada'];
const ETAPA_DO_PASSO = { comecar: 0, revisar: 1, aguardar_lote: 1, pedir_base: 1, aguardar_base: 1, em_operacao: 2 };
const args = (...xs) => escapeHTML(JSON.stringify(xs));
const botao = (rotulo, acao, ...a) => `<button class="btn btn-primary" data-action="${acao}" data-args='${args(...a)}'>${escapeHTML(rotulo)}</button>`;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Texto e ação do cartão para cada `proximo_passo`. Pura. `site` é o id; `gestor` é quem aprova a base. */
export function proximoPasso(sit, site, { gestor, editar }) {
    switch (sit.proximo_passo) {
        case 'comecar': return { texto: 'Comece o levantamento', acao: editar ? botao('Novo levantamento', 'otNovoLevantamentoDoSite', site) : '' };
        case 'revisar': {
            const n = sit.rascunhos || 0;
            return n ? { texto: `Revise ${plural(n, 'achado', 'achados')}`, acao: botao('Abrir Revisão e aprovação', 'otSiteSub', 'aprovacao') }
                : { texto: 'Defina as zonas dos níveis 2, 3 e 4', acao: botao('Abrir Base', 'otSiteSub', 'base') };
        }
        case 'aguardar_lote': return { texto: 'Aguardando o Gestor decidir o lote', acao: sit.lote_em_revisao_id ? botao('Abrir o lote', 'otIrParaLote', site, sit.lote_em_revisao_id) : '' };
        case 'pedir_base': return { texto: 'Tudo aprovado: peça a aprovação da base', acao: editar ? botao('Pedir aprovação da base', 'otPedirBase', site) : '' };
        case 'aguardar_base': return gestor
            ? { texto: 'Aguardando o Gestor aprovar a base', acao: `${botao('Aprovar a base', 'otAprovarBase', site)}<button class="btn" data-action="otDevolverBase" data-args='${args(site)}'>Devolver</button>` }
            : { texto: 'Aguardando o Gestor aprovar a base', acao: '' };
        case 'em_operacao': return { texto: 'Em operação', acao: botao('Abrir Modo operação', 'otSiteModo', 'operacao') };
        default: return { texto: 'Situação do site indisponível', acao: '' };
    }
}

/** Régua + cartão. `sit` é o corpo de /situacao, ou null quando a leitura falhou. */
export function cabecalhoDoSite(sit, site, papeis = { gestor: ehGestor(), editar: podeEditarOt() }) {
    if (!sit) return '<section class="card mb-4"><p class="org-dica" role="alert">Não foi possível carregar a situação do site.</p></section>';
    const atual = ETAPA_DO_PASSO[sit.proximo_passo] ?? 0;
    const desde = sit.base_aprovada_em ? formatarData(dataDoSqlite(sit.base_aprovada_em)) : '';
    const { texto, acao } = proximoPasso(sit, site, papeis);
    return `<section class="card mb-4"><ol class="ot-regua" aria-label="Etapas do site">${ETAPAS.map((e, i) =>
        `<li${i === atual ? ' aria-current="step"' : ''}>${i === atual ? '<strong>' : ''}${i + 1}. ${e}${i === atual ? '</strong>' : ''}</li>`).join('')}</ol>
        ${sit.proximo_passo === 'em_operacao' && desde ? `<p class="org-dica mb-3">Em operação desde ${escapeHTML(desde)}</p>` : ''}
        <h3 class="mb-2">Próximo passo</h3><div class="d-flex gap-4 items-center flex-wrap"><span>${escapeHTML(texto)}</span>${acao}</div></section>`;
}

let ocupado = false;
async function enviar(fn, ok, erro) {
    if (ocupado) return;
    ocupado = true;
    try { await fn(); showToast(ok, 'success'); } catch (e) { showToast(mensagemDeErro(e, erro), 'error'); } finally { ocupado = false; }
    window.render();
}
const proj = () => S.activeProject;

window.otNovoLevantamentoDoSite = async () => {
    if (S.otSub !== 'levantamento') { S.otSub = 'levantamento'; await window.render(); }
    window.otNovoLevantamento();
};
window.otPedirBase = async (site) => {
    if (!(await confirmar('Pedir ao Gestor a aprovação da base deste site?', { rotulo: 'Pedir aprovação' }))) return;
    await enviar(() => api('POST', `/api/v1/projects/${proj().id}/ot/sites/${encodeURIComponent(site)}/base/pedir`, {}), 'Aprovação da base pedida.', 'Não foi possível pedir a aprovação da base.');
};
window.otAprovarBase = async (site) => {
    if (!(await confirmar('Confirmo que este inventário representa o site.', { titulo: 'Aprovar a base', rotulo: 'Aprovar a base' }))) return;
    await enviar(() => api('POST', `/api/v1/projects/${proj().id}/ot/sites/${encodeURIComponent(site)}/base/aprovar`, { declaracao: true }), 'Base aprovada.', 'Não foi possível aprovar a base.');
};
window.otDevolverBase = async (site) => {
    const motivo = await pedirTexto('Diga o que precisa ser corrigido (3 a 500 caracteres; sem IP ou MAC).', { titulo: 'Devolver a base', rotulo: 'Devolver' });
    if (motivo === null) return;
    await enviar(() => api('POST', `/api/v1/projects/${proj().id}/ot/sites/${encodeURIComponent(site)}/base/devolver`, { motivo }), 'Base devolvida.', 'Não foi possível devolver a base.');
};
