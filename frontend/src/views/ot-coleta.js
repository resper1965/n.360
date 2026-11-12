import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, renderEmptyState, renderDataTable, falhaDeCarga, renderStatusBadge, openModal, forceCloseModal, showToast, confirmar, pedirTexto,
    formatarData } from '../ui.js';
import { podeCriarLote, podeAprovarOt, mensagemDeErro, lista, opcoes, nomeDe, camposDoAtivo, lerCamposDoAtivo, listaDeErros, nomeDoAtivo, rotaDoFluxo, dataDoSqlite, classePrimario } from '../ot-comum.js';
import { hojeSP, emDiasSP } from '../hoje.js';

// Coleta do n.ot (N3; spec §7, P0-3, P0-5): a entrada manual (e o que o Levantamento envia) cai em lotes que outra pessoa
// revisa antes do inventário. A duplicata aparece como a API devolve (`possivel_duplicata`); quem não vê completo não recebe o alvo.

const el = (id) => document.getElementById(id);
const args = (...xs) => escapeHTML(JSON.stringify(xs));
const falhou = (e, padrao) => showToast(mensagemDeErro(e, padrao), 'error');

const STATUS = { recebendo: ['neutral', 'Recebendo'], processando: ['neutral', 'Processando'], em_revisao: ['warning', 'Em revisão'], gravando: ['neutral', 'Gravando'],
    concluido: ['success', 'Concluído'], rejeitado: ['danger', 'Rejeitado'], erro: ['danger', 'Erro na leitura'], erro_ia: ['danger', 'Erro da IA'] };
const FONTE = { planilha: 'Planilha', manual: 'Entrada manual', ferramenta_ot: 'Ferramenta OT', ia: 'IA' };
const DECISAO = { pendente: 'Pendente', aceito: 'Aceito', descartado: 'Descartado', gravado: 'Gravado', recusado: 'Recusado' };
const selo = (mapa, v) => renderStatusBadge(...(mapa[v] || ['neutral', v || '—']));

let sites = [];
let manuais = [];
let itensDoLote = [];

const PRIVACIDADE = 'Todo lote espera a revisão de outra pessoa (o Gestor ARCiber ou o consultor) antes de chegar ao inventário, e lote não concluído expira em 7 dias. '
    + 'Para trazer planilha ou texto, use "Trazer dados" no Levantamento.';

let fixo = null; // site fixo da tela do site: recorta os lotes e tira o seletor de site

let semPri = false;
export async function montarColeta(c, a, p, { siteFixo, semPrimario } = {}) {
    fixo = siteFixo || null; semPri = !!semPrimario;
    let lotes;
    try {
        const [s, l] = await Promise.all([api('GET', `/api/v1/projects/${p.id}/ot/sites`), api('GET', `/api/v1/projects/${p.id}/ot/lotes`)]);
        sites = lista(s, 'sites'); lotes = lista(l, 'lotes');
        if (fixo) { sites = sites.filter((x) => x.id === fixo); lotes = lotes.filter((x) => x.site_id === fixo); }
    } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar os lotes de aprovação do n.ot.', e); return; }
    if (S.otLote) { await montarLote(c, a, S.otLote); return; }
    const criar = podeCriarLote() && sites.length;
    if (criar) a.innerHTML = '<button class="btn" data-action="otEntradaManual">Entrada manual</button>';
    c.innerHTML = `<p class="org-header-intro" id="ot-coleta-privacidade">${escapeHTML(PRIVACIDADE)}</p>
        ${!sites.length ? renderEmptyState({ titulo: 'Nenhum site disponível para o lote de aprovação', texto: 'O lote de aprovação é por site. Cadastre o site no Inventário ou peça a quem administra o n.ot o acesso ao seu site.' }) : ''}
        <h3 class="mb-3">Lotes</h3>
        ${renderDataTable(['Criado em', 'Site', 'Fonte', 'Situação', 'Itens', 'Com erro', 'Gravados', 'Ações'], lotes.map((l) => [
        escapeHTML(formatarData(l.created_at, { hora: true })), escapeHTML(nomeDe(sites, l.site_id)), escapeHTML(FONTE[l.fonte] || l.fonte), selo(STATUS, l.status),
        escapeHTML(String(l.itens ?? 0)), escapeHTML(String(l.com_erro ?? 0)), escapeHTML(String(l.gravados ?? 0)),
        `<button class="btn btn-sm" data-action="otAbrirLote" data-args='${args(l.id)}' aria-label="${escapeHTML(`Revisar lote de ${formatarData(l.created_at, { hora: true })}`)}">Revisar</button>`,
    ]), { emptyMessage: 'Nenhum lote de aprovação.', emptyHint: criar ? 'Traga dados pela aba Levantamento ou registre ativos pela entrada manual.' : 'Os lotes aparecem aqui quando alguém envia ativos de um site.' })}`;
}

window.otAbrirLote = (id) => { S.otLote = id; window.render(); };
window.otVoltarLotes = () => { S.otLote = null; window.render(); };

const aposCriar = (r) => {
    showToast(`Lote criado: ${r.itens} item(ns), ${r.com_erro} com erro.${r.possiveis_duplicatas === undefined ? '' : ` ${r.possiveis_duplicatas} possível(is) duplicata(s).`}`, 'success');
    S.otLote = r.id;
    window.render();
};

// Entrada manual: os itens ficam só na memória deste modal até o envio (e somem ao reabrir).
const zonasDe = async (siteId) => (siteId ? lista(await api('GET', `/api/v1/projects/${S.activeProject.id}/ot/zonas?site_id=${encodeURIComponent(siteId)}`).catch(() => null), 'zonas') : []);
const listaManuais = () => (manuais.length ? `<ul class="m-0">${manuais.map((m) => `<li>${escapeHTML(m.nome || '(sem nome)')}</li>`).join('')}</ul>`
    : renderEmptyState({ titulo: 'Nenhum item no lote ainda.', compacto: true }));
window.otEntradaManual = () => {
    manuais = [];
    const site = fixo || S.otSite || sites[0]?.id;
    openModal(`<div class="modal-header"><span class="modal-title">Entrada manual</span></div>
        <p class="org-dica mb-3">Os itens formam um lote que outra pessoa revisa antes de chegarem ao inventário.</p>
        ${fixo ? `<input type="hidden" id="ot-m-site" value="${escapeHTML(fixo)}">` : `<div class="form-group"><label class="form-label" for="ot-m-site">Site</label><select class="form-input" id="ot-m-site" data-action-change="otManualSite" data-arg-val>${opcoes(sites.map((s) => [s.id, s.nome]), site)}</select></div>`}
        <div id="ot-m-campos">${camposDoAtivo({})}</div>
        <div class="d-flex justify-end mb-4"><button class="btn" data-action="otManualAdicionar">Adicionar ao lote</button></div>
        <h4 class="mb-2">Itens do lote</h4><div id="ot-m-itens">${listaManuais()}</div>
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Cancelar</button><button class="btn btn-primary" data-action="otManualEnviar">Enviar lote</button></div>`, 'modal-large');
    window.otManualSite(site);
};
window.otManualSite = async (siteId) => {
    manuais = [];
    const zonas = await zonasDe(siteId);
    const box = el('ot-m-campos');
    if (box) box.innerHTML = camposDoAtivo({}, { zonas });
    const itens = el('ot-m-itens');
    if (itens) itens.innerHTML = listaManuais();
};
window.otManualAdicionar = () => {
    const { dados, erro } = lerCamposDoAtivo({ vazio: 'omitir' });
    if (erro) return showToast(erro, 'error');
    if (!dados.nome) return showToast('Informe o nome do ativo.', 'error');
    manuais.push(dados);
    el('ot-m-campos').querySelectorAll('input, select').forEach((x) => { if (x.type === 'checkbox') x.checked = false; else x.value = ''; });
    el('ot-m-itens').innerHTML = listaManuais();
};
window.otManualEnviar = async () => {
    if (!manuais.length) return showToast('Adicione ao menos um item ao lote.', 'error');
    try {
        const r = await api('POST', `/api/v1/projects/${S.activeProject.id}/ot/lotes/manual`, { site_id: el('ot-m-site').value, itens: manuais });
        manuais = [];
        forceCloseModal();
        aposCriar(r);
    } catch (e) { falhou(e, 'Não foi possível criar o lote.'); }
};

/** Todo item decidido foi recusado e nada resta pendente: aprovar não grava nada, só conclui o lote. */
const todosRecusados = (itens) => itens.some((i) => i.decisao === 'recusado') && !itens.some((i) => i.decisao === 'pendente');
const qtd = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const PRAZO_DIAS = 7;
// ─── revisão do lote ────────────────────────────────────────────────────────
async function montarLote(c, a, id) {
    let r;
    try { r = await api('GET', `/api/v1/projects/${S.activeProject.id}/ot/lotes/${encodeURIComponent(id)}`); } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar o lote.', e, { acao: 'otVoltarLotes' }); return; }
    const { lote } = r;
    const itens = lista(r, 'itens');
    itensDoLote = itens;
    const emRevisao = lote.status === 'em_revisao';
    const criou = lote.criado_por === S.user?.id;
    // A API aprova só quem vê completo (podeAprovar = podeVerCompleto): item mascarado diz que não é o caso (o consultoria_admin não designado).
    const aprova = podeAprovarOt() && !itens.some((i) => i.entidade !== 'fluxo' && i.dados?.mascarado === true);
    const decide = emRevisao && aprova && !criou;
    const recusados = itens.filter((i) => i.decisao === 'recusado').length;
    const restantes = itens.filter((i) => i.decisao === 'pendente').length;
    a.innerHTML = '<button class="btn" data-action="otVoltarLotes">Voltar aos lotes</button>'
        + (decide ? `<button class="btn" data-action="otRejeitarLote" data-args='${args(lote.id)}'>Rejeitar</button><button class="${classePrimario(semPri)}" data-action="otAprovarLote" data-args='${args(lote.id)}'>${todosRecusados(itens) ? 'Concluir lote' : recusados ? `Aprovar os restantes (${restantes})` : 'Aprovar lote'}</button>` : '');
    let prazo = '';
    const criado = emRevisao ? dataDoSqlite(lote.created_at) : null;
    if (criado) {
        const limite = emDiasSP(PRAZO_DIAS, criado);
        const dias = Math.round((Date.parse(`${limite}T00:00:00Z`) - Date.parse(`${hojeSP()}T00:00:00Z`)) / 86400000);
        const [, m, d] = limite.split('-');
        prazo = ` Decidir até ${d}/${m} (${dias < 0 ? 'prazo vencido' : `faltam ${qtd(dias, 'dia', 'dias')}`}).`;
    }
    const decisao = (i) => {
        const rot = escapeHTML(DECISAO[i.decisao] || i.decisao);
        if (i.decisao === 'recusado' && i.motivo) return `${rot}: ${escapeHTML(i.motivo)}`;
        if (i.decisao === 'gravado') return `${rot} <button class="btn btn-sm" data-action="otVerNoInventario" data-args='${args(lote.site_id)}' aria-label="${escapeHTML(`Ver no inventário a linha ${i.linha}`)}">Ver no inventário</button>`;
        if (i.decisao === 'pendente' && decide) return `${rot} <button class="btn btn-sm" data-action="otRecusarItem" data-args='${args(lote.id, i.id)}' aria-label="${escapeHTML(`Recusar a linha ${i.linha}`)}">Recusar</button>`;
        return rot;
    };
    const aviso = !emRevisao ? '' : criou ? 'Você criou este lote: a aprovação é de outra pessoa.'
        : !aprova ? 'A aprovação é do Gestor ARCiber ou do consultor do projeto.' : 'Aprovar grava no inventário os itens sem erro (a possível duplicata é mesclada no ativo existente) e registra você como quem verificou (4.3.1) só nos itens que trazem todos os campos do 4.3.1. Itens com erro são recusados.';
    c.innerHTML = `<h3 class="mb-2">Lote de ${escapeHTML((FONTE[lote.fonte] || lote.fonte).toLowerCase())} · ${escapeHTML(nomeDe(sites, lote.site_id))} ${selo(STATUS, lote.status)}</h3>
        <p class="org-dica mb-3">Criado em ${escapeHTML(formatarData(lote.created_at, { hora: true }))}.${lote.motivo ? ` Motivo: ${escapeHTML(lote.motivo)}` : ''}${escapeHTML(prazo)} ${escapeHTML(aviso)}</p>
        ${renderDataTable(['Linha', 'Nome', 'Tipo', 'Fabricante', 'IP', 'MAC', 'Erros', 'Duplicata', 'Decisão'], itens.map((i) => {
        const d = i.dados || {};
        if (i.entidade === 'fluxo') {
            return [escapeHTML(String(i.linha)), escapeHTML(`Fluxo: ${rotaDoFluxo(d, r.nomes_pontas)}`), '—', '—', '—', '—', listaDeErros(i.erros, 't-perigo'),
                i.possivel_duplicata ? renderStatusBadge('warning', 'Atualiza fluxo existente') : '—', decisao(i)];
        }
        return [escapeHTML(String(i.linha)), escapeHTML(d.nome || '—'), escapeHTML(d.tipo_dispositivo || '—'), escapeHTML(d.fabricante || '—'),
            `<span class="f-mono">${escapeHTML(d.ip ?? '—')}</span>`, `<span class="f-mono">${escapeHTML(d.mac ?? '—')}</span>`, listaDeErros(i.erros, 't-perigo'),
            i.possivel_duplicata ? renderStatusBadge('warning', `Possível duplicata de ${nomeDoAtivo(i.duplicata_de)}`) : '—', decisao(i)];
    }), { emptyMessage: 'Lote sem itens.' })}`;
}

/** O que a aprovação vai fazer, contado dos itens pendentes que a tela já tem. Sem a duplicata (quem não vê completo), só sem erro e com erro. */
function resumoDaAprovacao(itens) {
    const pend = itens.filter((i) => i.decisao === 'pendente');
    const comErro = pend.filter((i) => i.erros?.length).length;
    const ok = pend.filter((i) => !i.erros?.length);
    const total = qtd(pend.length, 'item', 'itens');
    if (!pend.every((i) => 'possivel_duplicata' in i)) return `${total}: ${ok.length} sem erro, ${comErro} com erro.`;
    const mescla = ok.filter((i) => i.possivel_duplicata).length;
    return `${total}: ${qtd(ok.length - mescla, 'entra como novo', 'entram como novos')}, ${qtd(mescla, 'mescla em ativo existente', 'mesclam em ativos existentes')}, `
        + `${qtd(comErro, 'recusado por erro', 'recusados por erro')}.`;
}
window.otAprovarLote = async (id) => {
    const nenhum = todosRecusados(itensDoLote);
    if (!await confirmar(nenhum ? 'Todos os itens foram recusados: nada vai para o inventário e o lote fica concluído.' : `${resumoDaAprovacao(itensDoLote)} Você fica registrado como quem verificou.`,
        nenhum ? { titulo: 'Concluir lote', rotulo: 'Concluir' } : { titulo: 'Aprovar lote', rotulo: 'Aprovar' })) return;
    try {
        const r = await api('POST', `/api/v1/projects/${S.activeProject.id}/ot/lotes/${encodeURIComponent(id)}/aprovar`);
        showToast(`Lote aprovado: ${r.criados} criado(s), ${r.atualizados} atualizado(s), ${r.recusados} recusado(s).`
            + (r.fluxos_pendentes_resolvidos > 0 ? ` ${r.fluxos_pendentes_resolvidos} fluxo(s) do sensor de rede viraram achados no levantamento de origem.` : ''), 'success');
        window.render();
    } catch (e) { falhou(e, 'Não foi possível aprovar o lote.'); window.render(); }
};
window.otRejeitarLote = async (id) => {
    const motivo = await pedirTexto('Por que rejeitar o lote? O motivo vai para a trilha de auditoria.', { titulo: 'Rejeitar lote', rotulo: 'Rejeitar' });
    if (motivo === null) return;
    if (motivo.length < 3) { showToast('Escreva o motivo da rejeição.', 'error'); return; }
    try {
        await api('POST', `/api/v1/projects/${S.activeProject.id}/ot/lotes/${encodeURIComponent(id)}/rejeitar`, { motivo });
        showToast('Lote rejeitado.', 'success'); window.render();
    } catch (e) { falhou(e, 'Não foi possível rejeitar o lote.'); window.render(); }
};
window.otRecusarItem = async (id, item) => {
    const motivo = await pedirTexto('Por que recusar este item? O motivo fica no item e na trilha de auditoria.', { titulo: 'Recusar item', rotulo: 'Recusar' });
    if (motivo === null) return;
    if (motivo.length < 3 || motivo.length > 500) { showToast('O motivo precisa ter de 3 a 500 caracteres.', 'error'); return; }
    try {
        await api('POST', `/api/v1/projects/${S.activeProject.id}/ot/lotes/${encodeURIComponent(id)}/itens/${encodeURIComponent(item)}/recusar`, { motivo });
        showToast('Item recusado.', 'success'); window.render();
    } catch (e) { falhou(e, 'Não foi possível recusar o item.'); window.render(); }
};
window.otVerNoInventario = (site) => window.otTela('site', site, 'projeto', { otSub: 'base' });
