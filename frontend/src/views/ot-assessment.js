import { S } from '../state.js';
import { api, API_BASE, cabecalhosAuth } from '../api.js';
import { escapeHTML, renderDataTable, renderStatusBadge, openModal, closeModal, showToast, confirmar, falhaDeCarga, renderEmptyState, formatarData } from '../ui.js';
import { mensagemDeErro, podeEditarOt, ehGestor, lista, opcoes, SITUACAO, AVALIACAO } from '../ot-comum.js';
import { moduloPara, enderecoDoProduto } from '../produto.js';

// n.ot, tela Assessment (RO-CB.BR.01) sobre /ot/assessment (src/routes/ot.ts). Item técnico: só leitura, calculado do inventário.
// Item de política: autoavaliação com evidências; o Gestor ARCiber (org_admin) confirma. Editar tira a confirmação (regra do servidor).

const el = (id) => document.getElementById(id);
const args = (...xs) => escapeHTML(JSON.stringify(xs));
const falhou = (e, padrao) => showToast(mensagemDeErro(e, padrao), 'error');
const RESPOSTA = { sim: 'Sim', nao: 'Não' };
const NAO_AVALIADO = ['neutral', 'Não avaliado'];
let dados = { itens: [], resumo: {}, restrito: false };
let responsaveis = [];
let filtro = null; // null | 'meus' (espera por mim) | 'revisar' (evidência vencida ou revisão passada); o Início passa por S.otAssFiltro
let raiz = null; // o contêiner que montarAssessment recebeu

const selo = (par) => renderStatusBadge(par[0], par[1]);
const situacaoDe = (i) => (i.tipo === 'politica' ? (i.avaliacao ? AVALIACAO[i.avaliacao.situacao] : null)
    : i.tipo === 'tecnico' ? SITUACAO[i.situacao_org] : null) || NAO_AVALIADO;
// Espera por mim: o Gestor confirma o que foi avaliado; quem edita preenche o que está em branco.
const esperaPorMim = (i) => i.tipo === 'politica' && (ehGestor() ? i.avaliacao && !i.avaliacao.confirmado : !i.avaliacao);
const achar = (codigo) => dados.itens.find((i) => i.codigo === codigo);

export async function montarAssessment(c, a, p) {
    raiz = c; filtro = S.otAssFiltro || null; S.otAssFiltro = null; dados = { itens: [], resumo: {}, restrito: false }; responsaveis = [];
    try {
        const [r, us] = await Promise.all([api('GET', `/api/v1/projects/${p.id}/ot/assessment`),
            api('GET', '/api/v1/users').then((x) => (Array.isArray(x) ? x : []), () => [])]);
        dados = { itens: lista(r, 'itens'), resumo: (r && r.resumo) || {}, restrito: !!r?.restrito };
        responsaveis = us.filter((u) => u.client_project_id === p.id);
    } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar o Assessment da RO-CB.BR.01.', e); return; }
    pintar(c);
}

function pintar(c = raiz) {
    const r = dados.resumo;
    const cont = (rot, n) => `<span class="org-dica">${rot}: <strong>${escapeHTML(String(n ?? 0))}</strong></span>`;
    const itens = filtro === 'meus' ? dados.itens.filter(esperaPorMim) : filtro === 'revisar' ? dados.itens.filter((i) => i.revisar) : dados.itens;
    const porCategoria = new Map();
    for (const i of itens) { const k = i.categoria || 'Sem categoria'; if (!porCategoria.has(k)) porCategoria.set(k, []); porCategoria.get(k).push(i); }
    const grupos = [...porCategoria].map(([cat, xs]) => `<h3>${escapeHTML(cat)}</h3>${renderDataTable(['Código', 'Requisito', 'Situação', 'Prazo ONS', 'Responsável', 'Próxima revisão', ''], xs.map(linha))}`).join('');
    c.innerHTML = `<p class="org-header-intro">Autoavaliação da RO-CB.BR.01 Rev.00. Itens técnicos vêm do inventário; os de política são avaliados por quem edita e confirmados pelo Gestor.</p>
        <div class="d-flex gap-3">${cont('Atende', r.atende)}${cont('Parcial', r.parcial)}${cont('Não atende', r.nao_atende)}${cont('Não se aplica', r.nao_se_aplica)}${cont('Não avaliado', r.nao_avaliado)}${cont('A confirmar', r.a_confirmar)}${cont('Revisar', r.revisar)}</div>
        <div class="form-group"><label><input type="checkbox" id="ass-meus" data-action-change="otAssFiltrar" data-arg-el${filtro === 'meus' ? ' checked' : ''}> Só o que espera por mim</label>
            <label><input type="checkbox" id="ass-revisar" data-action-change="otAssFiltrar" data-arg-el${filtro === 'revisar' ? ' checked' : ''}> Só o que precisa de revisão</label></div>
        ${itens.length ? grupos : renderEmptyState({ titulo: filtro ? 'Nada espera por você' : 'Catálogo da RO-CB.BR.01 ainda não carregado', texto: filtro ? 'Desmarque o filtro para ver todos os itens.' : 'O catálogo é carregado pela migração do n.ot. Fale com o suporte da ness.' })}
        <p class="org-dica">O Gestor e o suplente (4.2.1) vêm da governança do projeto${moduloPara('governance', S.activeProject) ? `: <a href="${enderecoDoProduto('n360')}?tela=governance">abrir governança</a>` : ''}.</p>`;
}

function linha(i) {
    const av = i.avaliacao;
    const selos = [i.tipo === 'politica' && av && !av.confirmado && '<span class="badge badge-warning">A confirmar</span>', i.revisar && '<span class="badge badge-warning">Revisar</span>'].filter(Boolean).join(' ');
    return [escapeHTML(i.codigo), escapeHTML(i.titulo), `${selo(situacaoDe(i))} ${selos}`, escapeHTML(i.prazo ? formatarData(i.prazo) : 'Sem prazo'),
        escapeHTML(av?.responsavel_nome || '—'), escapeHTML(av?.proxima_revisao ? formatarData(av.proxima_revisao) : '—'),
        `<button class="btn btn-sm" data-action="otAssAbrir" data-args='${args(i.codigo)}' aria-label="${escapeHTML(`Abrir ${i.codigo}`)}">Abrir</button>`];
}

window.otAssFiltrar = (caixa) => { filtro = caixa.checked ? (caixa.id === 'ass-revisar' ? 'revisar' : 'meus') : null; pintar(); };

window.otAssAbrir = (codigo) => {
    const i = achar(codigo);
    if (!i) return;
    // restrito: o servidor só viu os sites desta pessoa, então o pior caso é o dos sites dela, não o da organização
    const rotulo = i.tipo === 'tecnico' ? `${dados.restrito ? 'Situação nos seus sites' : 'Situação na organização'}: ` : '';
    const cab = `<div class="modal-header"><span class="modal-title">${escapeHTML(i.codigo)} · ${escapeHTML(i.titulo)}</span></div><p>${rotulo}${selo(situacaoDe(i))}</p>`;
    openModal(cab + (i.tipo === 'tecnico' ? corpoTecnico(i) : i.tipo === 'excecao' ? `<p class="org-dica">${escapeHTML(i.evidencia || 'Não avaliado neste ciclo')}</p>` : corpoPolitica(i)));
};

function corpoTecnico(i) {
    const sites = lista(i, 'por_site');
    return `<p class="org-dica">Calculado pelo inventário; não editável.</p>${renderDataTable(['Site', 'Fase', 'Evidência', ''], sites.map((s) => [escapeHTML(s.site_nome), escapeHTML(s.fase || '—'),
        escapeHTML(s.evidencia || '—'), `<button class="btn btn-sm" data-action="otAssIrSite" data-args='${args(s.site_id)}' aria-label="${escapeHTML(`Abrir o site ${s.site_nome}`)}">Abrir site</button>`]),
    { emptyMessage: 'Nenhum site no inventário.' })}`;
}
window.otAssIrSite = (id) => { closeModal(); window.otTela('site', id, 'projeto', { otSub: 'base' }); };

function corpoPolitica(i) {
    const av = i.avaliacao || {};
    const editar = podeEditarOt();
    const evs = lista(i, 'evidencias');
    const sub = lista(i, 'subsidio');
    const resp = responsaveis.map((u) => [u.id, u.name || u.email]);
    if (av.responsavel_id && !resp.some(([v]) => v === av.responsavel_id)) resp.push([av.responsavel_id, av.responsavel_nome || av.responsavel_id]);
    const form = editar ? `<div class="form-group"><label class="form-label" for="ass-sit">Situação</label><select class="form-input" id="ass-sit">${opcoes(Object.entries(AVALIACAO).map(([v, [, r]]) => [v, r]), av.situacao)}</select></div>
        <div class="form-group"><label class="form-label" for="ass-just">Justificativa</label><textarea class="form-input" id="ass-just" maxlength="2000" aria-describedby="ass-just-dica">${escapeHTML(av.justificativa || '')}</textarea>
            <p class="org-dica" id="ass-just-dica">Não cite IP, MAC nem nome de ativo: este texto vai para o relatório.</p></div>
        <div class="form-group"><label class="form-label" for="ass-resp">Responsável</label><select class="form-input" id="ass-resp">${opcoes([['', 'Sem responsável'], ...resp], av.responsavel_id)}</select></div>
        <div class="form-group"><label class="form-label" for="ass-rev">Próxima revisão</label><input class="form-input" type="date" id="ass-rev" value="${escapeHTML(av.proxima_revisao || '')}"></div>
        <p class="org-dica">Editar tira a confirmação do Gestor.</p>
        <button class="btn btn-primary" data-action="otAssGravar" data-args='${args(i.codigo)}'>Gravar</button>`
        : `<p>${escapeHTML(av.justificativa || 'Sem justificativa.')}</p>`;
    const evidencias = `<h4>Evidências</h4>${renderDataTable(['Arquivo', 'Validade', ''], evs.map((e) => [escapeHTML(e.file_name), escapeHTML(e.valido_ate ? formatarData(e.valido_ate) : '—') + (e.vencida ? ' (vencida)' : ''),
        editar ? `<button class="btn btn-sm" data-action="otAssRemoverEv" data-args='${args(i.codigo, e.id)}' aria-label="${escapeHTML(`Remover ${e.file_name}`)}">Remover</button>` : '']), { emptyMessage: 'Nenhuma evidência ligada.' })}
        ${editar ? `<div class="form-group"><label class="form-label" for="ass-arq">Arquivo</label><input class="form-input" type="file" id="ass-arq"></div><button class="btn" data-action="otAssAnexar" data-args='${args(i.codigo)}'>Anexar arquivo</button>` : ''}`;
    const subsidio = `<h4>Subsídio do levantamento</h4>${sub.length ? `<ul>${sub.map((s) => `<li>${escapeHTML(s.site_nome)}: ${escapeHTML(s.pergunta)}: <strong>${escapeHTML(RESPOSTA[s.resposta] || String(s.resposta))}</strong> (${escapeHTML(formatarData(s.realizado_em))}) <button class="btn btn-sm" data-action="otAssIrLevantamento" data-args='${args(s.site_id, s.levantamento_id)}'>Ver levantamento</button></li>`).join('')}</ul>` : '<p class="org-dica">Sem respostas do roteiro para este item.</p>'}`;
    const confirmacao = av.situacao && av.confirmado ? `<p class="org-dica">Confirmado por ${escapeHTML(av.confirmado_por_nome || '—')} em ${escapeHTML(formatarData(av.confirmado_em))}.</p>` : '';
    const confirmar_ = ehGestor() && av.situacao && !av.confirmado ? `<button class="btn" data-action="otAssConfirmar" data-args='${args(i.codigo)}'>Confirmar</button>` : '';
    return `${form}${confirmacao}${confirmar_}${evidencias}${subsidio}`;
}
window.otAssIrLevantamento = (site, lev) => { closeModal(); window.otTela('site', site, 'projeto', { otSub: 'levantamento', otLevantamento: lev }); };

const CAMPOS = ['ass-sit', 'ass-just', 'ass-resp', 'ass-rev'];
async function recarregar(codigo) {
    const rascunho = codigo ? CAMPOS.map((id) => [id, el(id)?.value]) : [];
    const r = await api('GET', `/api/v1/projects/${S.activeProject.id}/ot/assessment`);
    dados = { itens: lista(r, 'itens'), resumo: (r && r.resumo) || {}, restrito: !!r?.restrito };
    pintar();
    if (codigo) { window.otAssAbrir(codigo); for (const [id, v] of rascunho) if (v !== undefined && el(id)) el(id).value = v; }
}

window.otAssGravar = async (codigo) => {
    try {
        await api('PUT', `/api/v1/projects/${S.activeProject.id}/ot/assessment/${encodeURIComponent(codigo)}`,
            { situacao: el('ass-sit').value, justificativa: el('ass-just').value.trim(), responsavel_id: el('ass-resp').value || null, proxima_revisao: el('ass-rev').value || null });
        showToast('Avaliação gravada.', 'success');
        closeModal(); await recarregar();
    } catch (e) { falhou(e, 'Não foi possível gravar a avaliação.'); }
};

window.otAssConfirmar = async (codigo) => {
    if (!(await confirmar(`Confirmar a avaliação do item ${codigo}?`, { rotulo: 'Confirmar' }))) return;
    try {
        await api('POST', `/api/v1/projects/${S.activeProject.id}/ot/assessment/${encodeURIComponent(codigo)}/confirmar`, { updated_at: achar(codigo)?.avaliacao?.updated_at });
        showToast('Avaliação confirmada.', 'success');
        closeModal(); await recarregar();
    } catch (e) { falhou(e, 'Não foi possível confirmar a avaliação.'); }
};

window.otAssAnexar = async (codigo) => {
    const f = el('ass-arq')?.files?.[0];
    if (!f) { showToast('Escolha um arquivo para anexar.', 'error'); return; }
    try {
        const fd = new FormData();
        fd.append('file', f);
        const r = await fetch(`${API_BASE}/api/v1/projects/${S.activeProject.id}/evidence/upload`, { method: 'POST', headers: cabecalhosAuth(), body: fd });
        const corpo = await r.json().catch(() => ({}));
        if (!r.ok || !corpo.id) throw new Error(corpo.error || 'upload');
        await api('POST', `/api/v1/projects/${S.activeProject.id}/ot/assessment/${encodeURIComponent(codigo)}/evidencias`, { evidencia_id: corpo.id });
        showToast('Evidência anexada.', 'success');
        await recarregar(codigo);
    } catch (e) { falhou(e, 'Não foi possível anexar o arquivo.'); }
};

// Só desliga a evidência do item; o arquivo continua no projeto.
window.otAssRemoverEv = async (codigo, evId) => {
    try {
        await api('DELETE', `/api/v1/projects/${S.activeProject.id}/ot/assessment/${encodeURIComponent(codigo)}/evidencias/${encodeURIComponent(evId)}`);
        showToast('Evidência desligada do item.', 'success');
        await recarregar(codigo);
    } catch (e) { falhou(e, 'Não foi possível remover a evidência.'); }
};
