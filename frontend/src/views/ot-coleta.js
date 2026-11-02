import { S } from '../state.js';
import { api, API_BASE, cabecalhosAuth, sessaoTerminada } from '../api.js';
import { escapeHTML, renderEmptyState, renderDataTable, falhaDeCarga, renderStatusBadge, openModal, forceCloseModal, showToast, confirmar, pedirTexto,
    formatarData } from '../ui.js';
import { podeCriarLote, podeAprovarOt, mensagemDeErro, lista, opcoes, nomeDe, camposDoAtivo, lerCamposDoAtivo, listaDeErros, nomeDoAtivo } from '../ot-comum.js';

// Coleta do n.ot (N3; spec §7, P0-3, P0-5): planilha (multipart `file` + `site_id`) e entrada manual caem em lotes que outra pessoa
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
let documentos = [];
let itensDoLote = [];

const PRIVACIDADE = 'A planilha é lida em memória e descartada: o arquivo original não é guardado. Só as linhas reconhecidas entram no lote, que espera a revisão '
    + 'de outra pessoa (o Gestor ARCiber ou o consultor) antes de chegar ao inventário. Lote não concluído expira em 7 dias.';

export async function montarColeta(c, a, p) {
    let lotes;
    try {
        const [s, l] = await Promise.all([api('GET', `/api/v1/projects/${p.id}/ot/sites`), api('GET', `/api/v1/projects/${p.id}/ot/lotes`)]);
        sites = lista(s, 'sites'); lotes = lista(l, 'lotes');
    } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar a coleta do n.ot.', e); return; }
    if (S.otLote) { await montarLote(c, a, S.otLote); return; }
    const criar = podeCriarLote() && sites.length;
    // Secundário: sem a lista de sessões, a planilha só não se liga a um documento.
    if (criar) documentos = lista(await api('GET', `/api/v1/projects/${p.id}/ot/levantamentos`).catch(() => null), 'levantamentos').filter((l) => l.tipo === 'documento');
    const siteLote = S.otSite || sites[0]?.id;
    if (criar) a.innerHTML = '<button class="btn" data-action="otEntradaManual">Entrada manual</button>';
    const envio = criar ? `<div class="bloco mb-4"><h3 class="mb-3">Enviar planilha</h3>
        <div class="d-flex gap-4 flex-wrap items-center">
            <div class="form-group"><label class="form-label" for="ot-lote-site">Site</label><select class="form-input" id="ot-lote-site" data-action-change="otLoteSite" data-arg-val>${opcoes(sites.map((s) => [s.id, s.nome]), siteLote)}</select></div>
            <div class="form-group"><label class="form-label" for="ot-lote-doc">Ligar a um documento (opcional)</label><select class="form-input" id="ot-lote-doc">${opcoesDoc(siteLote)}</select></div>
            <div class="form-group"><label class="form-label" for="ot-lote-arquivo">Planilha (CSV ou XLSX, até 5 MB)</label><input class="form-input" type="file" id="ot-lote-arquivo" accept=".csv,.xlsx"></div>
            <button class="btn btn-primary" data-action="otEnviarPlanilha">Enviar planilha</button></div>
        <p class="org-dica">Colunas reconhecidas pelo cabeçalho: nome, ip, mac, fabricante, modelo, tipo, funcao, protocolos, firmware, arciber, categoria, zona. As demais são ignoradas.</p></div>` : '';
    c.innerHTML = `<p class="org-header-intro" id="ot-coleta-privacidade">${escapeHTML(PRIVACIDADE)}</p>
        ${!sites.length ? renderEmptyState({ titulo: 'Nenhum site disponível para coleta', texto: 'A coleta é por site. Cadastre o site no Inventário ou peça a quem administra o n.ot o acesso ao seu site.' }) : envio}
        <h3 class="mb-3">Lotes</h3>
        ${renderDataTable(['Criado em', 'Site', 'Fonte', 'Situação', 'Itens', 'Com erro', 'Gravados', 'Ações'], lotes.map((l) => [
        escapeHTML(formatarData(l.created_at, { hora: true })), escapeHTML(nomeDe(sites, l.site_id)), escapeHTML(FONTE[l.fonte] || l.fonte), selo(STATUS, l.status),
        escapeHTML(String(l.itens ?? 0)), escapeHTML(String(l.com_erro ?? 0)), escapeHTML(String(l.gravados ?? 0)),
        `<button class="btn btn-sm" data-action="otAbrirLote" data-args='${args(l.id)}' aria-label="${escapeHTML(`Revisar lote de ${formatarData(l.created_at, { hora: true })}`)}">Revisar</button>`,
    ]), { emptyMessage: 'Nenhum lote de coleta.', emptyHint: criar ? 'Envie uma planilha ou registre ativos pela entrada manual.' : 'Os lotes aparecem aqui quando alguém envia a coleta de um site.' })}`;
}

const opcoesDoc = (siteId) => `<option value="">Nenhum</option>${opcoes(documentos.filter((d) => d.site_id === siteId).map((d) => [d.id, d.documento_titulo || d.realizado_em]))}`;
window.otLoteSite = (siteId) => { const x = el('ot-lote-doc'); if (x) x.innerHTML = opcoesDoc(siteId); };

window.otAbrirLote = (id) => { S.otLote = id; window.render(); };
window.otVoltarLotes = () => { S.otLote = null; window.render(); };

const aposCriar = (r) => {
    const ign = Array.isArray(r.colunas_ignoradas) && r.colunas_ignoradas.length ? ` Colunas ignoradas: ${r.colunas_ignoradas.join(', ')}.` : '';
    showToast(`Lote criado: ${r.itens} item(ns), ${r.com_erro} com erro.${r.possiveis_duplicatas === undefined ? '' : ` ${r.possiveis_duplicatas} possível(is) duplicata(s).`}${ign}`, 'success');
    S.otLote = r.id;
    window.render();
};

window.otEnviarPlanilha = async () => {
    const arquivo = el('ot-lote-arquivo')?.files?.[0];
    if (!arquivo) return showToast('Escolha a planilha (CSV ou XLSX).', 'error');
    const fd = new FormData();
    fd.append('file', arquivo);
    fd.append('site_id', el('ot-lote-site').value);
    if (el('ot-lote-doc')?.value) fd.append('levantamento_id', el('ot-lote-doc').value);
    let r, corpo;
    try {
        r = await fetch(`${API_BASE}/api/v1/projects/${S.activeProject.id}/ot/lotes`, { method: 'POST', headers: cabecalhosAuth(), body: fd, signal: AbortSignal.timeout(120000) });
        corpo = await r.json().catch(() => ({}));
    } catch (e) { return showToast('Não foi possível enviar a planilha. Verifique a conexão e tente de novo.', 'error'); }
    if (r.status === 401) return falhou(sessaoTerminada(corpo, '401 no envio da planilha do n.ot'), 'Sua sessão terminou.');
    if (!r.ok) return falhou(Object.assign(new Error(corpo.error || ''), { status: r.status }), 'Não foi possível ler a planilha.');
    aposCriar(corpo);
};

// Entrada manual: os itens ficam só na memória deste modal até o envio (e somem ao reabrir).
const zonasDe = async (siteId) => (siteId ? lista(await api('GET', `/api/v1/projects/${S.activeProject.id}/ot/zonas?site_id=${encodeURIComponent(siteId)}`).catch(() => null), 'zonas') : []);
const listaManuais = () => (manuais.length ? `<ul class="m-0">${manuais.map((m) => `<li>${escapeHTML(m.nome || '(sem nome)')}</li>`).join('')}</ul>`
    : renderEmptyState({ titulo: 'Nenhum item no lote ainda.', compacto: true }));
window.otEntradaManual = () => {
    manuais = [];
    const site = S.otSite || sites[0]?.id;
    openModal(`<div class="modal-header"><span class="modal-title">Entrada manual</span></div>
        <p class="org-dica mb-3">Os itens formam um lote que outra pessoa revisa antes de chegarem ao inventário.</p>
        <div class="form-group"><label class="form-label" for="ot-m-site">Site</label><select class="form-input" id="ot-m-site" data-action-change="otManualSite" data-arg-val>${opcoes(sites.map((s) => [s.id, s.nome]), site)}</select></div>
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
    const aprova = podeAprovarOt() && !itens.some((i) => i.dados?.mascarado === true);
    const decide = emRevisao && aprova && !criou;
    a.innerHTML = '<button class="btn" data-action="otVoltarLotes">Voltar aos lotes</button>'
        + (decide ? `<button class="btn" data-action="otRejeitarLote" data-args='${args(lote.id)}'>Rejeitar</button><button class="btn btn-primary" data-action="otAprovarLote" data-args='${args(lote.id)}'>Aprovar lote</button>` : '');
    const aviso = !emRevisao ? '' : criou ? 'Você criou este lote: a aprovação é de outra pessoa.'
        : !aprova ? 'A aprovação é do Gestor ARCiber ou do consultor do projeto.' : 'Aprovar grava no inventário os itens sem erro (a possível duplicata é mesclada no ativo existente) e registra você como quem verificou (4.3.1) só nos itens que trazem todos os campos do 4.3.1. Itens com erro são recusados.';
    c.innerHTML = `<h3 class="mb-2">Lote de ${escapeHTML((FONTE[lote.fonte] || lote.fonte).toLowerCase())} · ${escapeHTML(nomeDe(sites, lote.site_id))} ${selo(STATUS, lote.status)}</h3>
        <p class="org-dica mb-3">Criado em ${escapeHTML(formatarData(lote.created_at, { hora: true }))}.${lote.motivo ? ` Motivo: ${escapeHTML(lote.motivo)}` : ''} ${escapeHTML(aviso)}</p>
        ${renderDataTable(['Linha', 'Nome', 'Tipo', 'Fabricante', 'IP', 'MAC', 'Erros', 'Duplicata', 'Decisão'], itens.map((i) => {
        const d = i.dados || {};
        return [escapeHTML(String(i.linha)), escapeHTML(d.nome || '—'), escapeHTML(d.tipo_dispositivo || '—'), escapeHTML(d.fabricante || '—'),
            `<span class="f-mono">${escapeHTML(d.ip ?? '—')}</span>`, `<span class="f-mono">${escapeHTML(d.mac ?? '—')}</span>`, listaDeErros(i.erros, 't-perigo'),
            i.possivel_duplicata ? renderStatusBadge('warning', `Possível duplicata de ${nomeDoAtivo(i.duplicata_de)}`) : '—', escapeHTML(DECISAO[i.decisao] || i.decisao)];
    }), { emptyMessage: 'Lote sem itens.' })}`;
}

const qtd = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
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
    if (!await confirmar(`${resumoDaAprovacao(itensDoLote)} Você fica registrado como quem verificou.`, { titulo: 'Aprovar lote', rotulo: 'Aprovar' })) return;
    try {
        const r = await api('POST', `/api/v1/projects/${S.activeProject.id}/ot/lotes/${encodeURIComponent(id)}/aprovar`);
        showToast(`Lote aprovado: ${r.criados} criado(s), ${r.atualizados} atualizado(s), ${r.recusados} recusado(s).`, 'success');
        window.render();
    } catch (e) { falhou(e, 'Não foi possível aprovar o lote.'); }
};
window.otRejeitarLote = async (id) => {
    const motivo = await pedirTexto('Por que rejeitar o lote? O motivo vai para a trilha de auditoria.', { titulo: 'Rejeitar lote', rotulo: 'Rejeitar' });
    if (motivo === null) return;
    if (motivo.length < 3) { showToast('Escreva o motivo da rejeição.', 'error'); return; }
    try {
        await api('POST', `/api/v1/projects/${S.activeProject.id}/ot/lotes/${encodeURIComponent(id)}/rejeitar`, { motivo });
        showToast('Lote rejeitado.', 'success'); window.render();
    } catch (e) { falhou(e, 'Não foi possível rejeitar o lote.'); }
};
