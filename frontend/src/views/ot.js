import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, renderEmptyState, renderSemProjeto, renderDataTable, falhaDeCarga, renderAbas, renderMaisAcoes, renderStatusBadge,
    openModal, forceCloseModal, showToast, confirmar, pedirTexto, formatarData } from '../ui.js';
import { podeEditarOt, podeAprovarOt, podeRevelar, mensagemDeErro, comStepUp, lista, opcoes, nomeDe, camposDoAtivo, lerCamposDoAtivo,
    nomesDeAtivos, TIPOS_SITE, CRITICIDADE, TIPOS_ZONA, CATEGORIAS } from '../ot-comum.js';
import { montarColeta } from './ot-coleta.js';
import { montarSaidas } from './ot-saidas.js';
import { montarLevantamento, esvaziarNotas } from './ot-levantamento.js';
import { cartaoAgente } from './ot-agente.js';
import { montarDesvios } from './ot-desvios.js';
import { areaSondas } from './ot-sensores.js';

// n.ot (spec 2026-10-30-n-ot-modulo-n360-design): a casca /ot em abas. Catálogo RO-CB.BR.01 (N1), inventário, fluxos e acesso por
// site (N2), coleta (N3, ot-coleta.js) e saídas (N4, ot-saidas.js), sobre as rotas de src/routes/ot.ts e ot-saidas.ts. Todo texto é
// escapado; o que vem da API fica só na memória desta tela (D), que se refaz a cada desenho.

const prazo = (m) => (Number.isInteger(m) && m > 0 ? `${m} meses` : 'Sem prazo');
const el = (id) => document.getElementById(id);
const proj = () => S.activeProject;
const args = (...xs) => escapeHTML(JSON.stringify(xs));
const falhou = (e, padrao) => showToast(mensagemDeErro(e, padrao), 'error');
const TEMPO_IA = 90000;

/** O que a API devolveu no último desenho (sites, zonas, ativos, fluxos). */
const D = { sites: [], zonas: [], ativos: [], fluxos: [] };

const ABAS = [['catalogo', 'Catálogo RO-CB.BR.01'], ['inventario', 'Inventário'], ['fluxos', 'Fluxos'], ['coleta', 'Coleta'], ['levantamento', 'Levantamento'], ['desvios', 'Desvios'], ['saidas', 'Saídas'],
    ['acessos', 'Acessos e agente']];
const abasDoPapel = () => ABAS.filter(([v]) => v !== 'acessos' || podeEditarOt());

async function renderOt(c, h, a) {
    h.innerHTML = 'n<span class="pn-ponto">.</span>ot';
    a.innerHTML = '';
    if (!proj()) { c.innerHTML = renderSemProjeto(); return; }
    // Filtros e lote são do projeto: trocá-lo (seletor, aviso do sino) não pode levar o site do A para a consulta do B.
    if (S.otProjeto !== proj().id) {
        await esvaziarNotas(); // notas digitadas no projeto anterior vão para ele, antes de a tela mudar
        S.otProjeto = proj().id; S.otSite = null; S.otZona = null; S.otLote = null; S.otLevantamento = null; S.otDesvioFiltro = null; nomesDeAtivos.clear();
    }
    // Contagens das abas e aba de entrada: o que espera a pessoa. Falha aqui só tira a contagem (cada aba carrega e mostra o próprio erro).
    // Correm junto com o painel; só a primeira entrada (sem aba escolhida) espera por elas, porque decidem a aba.
    const contagens = Promise.all([api('GET', `/api/v1/projects/${proj().id}/ot/lotes`).then((r) => lista(r, 'lotes')),
        api('GET', `/api/v1/projects/${proj().id}/ot/levantamentos`).then((r) => lista(r, 'levantamentos')),
        api('GET', `/api/v1/projects/${proj().id}/ot/desvios?situacao=aberto&contagem=1`).then((r) => r?.total ?? 0)].map((x) => x.catch(() => [])))
        .then(([lotes, levs, nDesv]) => {
            const emRevisao = lotes.filter((l) => l.status === 'em_revisao');
            const abertos = levs.filter((l) => l.situacao !== 'encerrado').length;
            // O consultoria_admin só aprova no projeto em que está designado, e a tela não sabe disso: ele entra pelo Inventário.
            const aprova = podeAprovarOt() && S.user?.role !== 'consultoria_admin';
            return { entrada: aprova && emRevisao.some((l) => l.criado_por !== S.user?.id) ? 'coleta' : 'inventario',
                conta: { coleta: emRevisao.length && ` · ${emRevisao.length} em revisão`, levantamento: abertos && ` · ${abertos} ${abertos === 1 ? 'aberto' : 'abertos'}`,
                    desvios: +nDesv && ` · ${nDesv} ${nDesv === 1 ? 'aberto' : 'abertos'}` } };
        });
    const abas = abasDoPapel();
    const aba = abas.some(([v]) => v === S.otAba) ? S.otAba : (await contagens).entrada;
    S.otAba = aba;
    c.innerHTML = renderAbas(abas.map(([v, r]) => [v, escapeHTML(r)]), aba, 'otAba') + '<div id="ot-painel"><div class="loading"></div></div>';
    const barra = c.querySelector('[role="tablist"]');
    const rotulos = contagens.then(({ conta }) => {
        if (!barra.isConnected) return; // outra tela já foi desenhada
        for (const t of barra.querySelectorAll('[role="tab"]')) {
            const v = JSON.parse(t.getAttribute('data-args'))[0];
            if (conta[v]) t.querySelector('span').textContent = abas.find(([x]) => x === v)[1] + conta[v];
        }
    });
    const painel = el('ot-painel');
    const montar = { catalogo: montarCatalogo, inventario: montarInventario, fluxos: montarFluxos, coleta: montarColeta, levantamento: montarLevantamento, desvios: montarDesvios, saidas: montarSaidas, acessos: montarAcessos }[aba];
    await Promise.all([montar(painel, a, proj()), rotulos]);
}

window.otAba = async (v) => { S.otAba = v; S.otLote = null; S.otLevantamento = null; await esvaziarNotas(); window.render(); };

// ─── catálogo (N1) ──────────────────────────────────────────────────────────
async function montarCatalogo(c, a, p) {
    let reqs;
    try {
        const r = await api('GET', `/api/v1/projects/${p.id}/ot/requisitos`);
        reqs = Array.isArray(r && r.requisitos) ? r.requisitos : [];
    } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar os requisitos da RO-CB.BR.01.', e); return; }
    if (!reqs.length) {
        c.innerHTML = renderEmptyState({ titulo: 'Catálogo da RO-CB.BR.01 ainda não carregado',
            texto: 'O catálogo é carregado pela migração do n.ot. Fale com o suporte da ness.' });
        return;
    }
    c.innerHTML = `<p class="org-header-intro">ONS RO-CB.BR.01 Rev.00: ${escapeHTML(String(reqs.length))} requisitos. Prazo em meses após o início da vigência (09/07/2021).</p>`
        + renderDataTable(['Código', 'Requisito', 'Prazo'], reqs.map((r) => [escapeHTML(r.codigo), escapeHTML(r.titulo), escapeHTML(prazo(r.prazo_meses))]));
}

// ─── inventário (N2) ────────────────────────────────────────────────────────
const doSite = () => (S.otSite ? `?site_id=${encodeURIComponent(S.otSite)}` : '');

async function carregarInventario(p, { fluxos = false } = {}) {
    const [s, z, at, fl] = await Promise.all([api('GET', `/api/v1/projects/${p.id}/ot/sites`), api('GET', `/api/v1/projects/${p.id}/ot/zonas${doSite()}`), api('GET', `/api/v1/projects/${p.id}/ot/ativos${doSite()}`),
        fluxos ? api('GET', `/api/v1/projects/${p.id}/ot/fluxos${doSite()}`) : null]);
    D.sites = lista(s, 'sites'); D.zonas = lista(z, 'zonas'); D.ativos = lista(at, 'ativos'); D.fluxos = lista(fl, 'fluxos');
    for (const x of D.ativos) nomesDeAtivos.set(x.id, x.nome);
    if (S.otSite && !D.sites.some((x) => x.id === S.otSite)) S.otSite = null;
}

const filtroSite = () => `<div class="form-group"><label class="form-label" for="ot-filtro-site">Site</label>
    <select class="form-input" id="ot-filtro-site" data-action-change="otFiltrarSite" data-arg-val><option value="">Todos os sites</option>${opcoes(D.sites.map((s) => [s.id, s.nome]), S.otSite)}</select></div>`;

window.otFiltrarSite = (v) => { S.otSite = v || null; S.otZona = null; window.render(); };
window.otFiltrarZona = (v) => { S.otZona = v || null; window.render(); };

const linhaMais = (itens, nome) => renderMaisAcoes(itens, { nome });

async function montarInventario(c, a, p) {
    try { await carregarInventario(p); } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar o inventário do n.ot.', e); return; }
    const editar = podeEditarOt();
    if (!D.sites.length) {
        c.innerHTML = renderEmptyState({ titulo: 'Nenhum site no inventário',
            texto: editar ? 'Cadastre o primeiro site (subestação, usina ou centro de operação); zonas e ativos ficam dentro dele.'
                : 'O inventário começa pelos sites. Quem administra o n.ot no projeto cadastra os sites ou concede o seu acesso a eles.',
            acao: editar ? '<button class="btn btn-primary" data-action="otNovoSite">Cadastrar o primeiro site</button>' : '' });
        return;
    }
    if (editar) {
        a.innerHTML = `<button class="btn" data-action="otNovoSite">+ Novo site</button><button class="btn" data-action="otNovaZona">+ Nova zona</button>`
            + `<button class="btn" data-action="otRascunhoIa">Rascunho por IA</button><button class="btn btn-primary" data-action="otNovoAtivo">+ Novo ativo</button>`;
    }
    const zonaVale = (x) => !S.otZona || (S.otZona === 'sem' ? !x.zona_id : x.zona_id === S.otZona);
    const ativos = D.ativos.filter(zonaVale);
    const sites = S.otSite ? D.sites.filter((s) => s.id === S.otSite) : D.sites;
    const mais = (rota, x, extra = []) => linhaMais([...extra, { rotulo: 'Remover', action: 'otRemover', args: [rota, x.id], perigo: true }], x.nome);

    const tabelaSites = renderDataTable(['Site', 'Tipo', 'Criticidade', 'Localização', ...(editar ? ['Ações'] : [])], sites.map((s) => [
        `<strong>${escapeHTML(s.nome)}</strong>`, escapeHTML(TIPOS_SITE[s.tipo] || s.tipo), escapeHTML(CRITICIDADE[s.criticidade] || '—'), escapeHTML(s.localizacao || '—'),
        ...(editar ? [`<div class="d-flex gap-2"><button class="btn btn-sm" data-action="otEditarSite" data-args='${args(s.id)}' aria-label="${escapeHTML(`Editar ${s.nome}`)}">Editar</button>${mais('sites', s)}</div>`] : []),
    ]));
    const tabelaZonas = renderDataTable(['Zona', 'Site', 'Nível Purdue', 'Tipo', ...(editar ? ['Ações'] : [])], D.zonas.map((z) => [
        escapeHTML(z.nome), escapeHTML(nomeDe(D.sites, z.site_id)), escapeHTML(String(z.nivel_purdue)), escapeHTML(TIPOS_ZONA[z.tipo] || z.tipo),
        ...(editar ? [`<div class="d-flex gap-2"><button class="btn btn-sm" data-action="otEditarZona" data-args='${args(z.id)}' aria-label="${escapeHTML(`Editar ${z.nome}`)}">Editar</button>${mais('zonas', z)}</div>`] : []),
    ]), { emptyMessage: 'Nenhuma zona registrada.', emptyHint: 'A RO-CB.BR.01 (4.1.1) pede as zonas de supervisão, DMZ operativa e corporativa (níveis 2, 3 e 4) em cada site.' });
    const acoesAtivo = (x) => {
        if (!editar) return [];
        const extra = [{ rotulo: 'Sugerir zona (IA)', action: 'otSugerirZona', args: [x.id] }, podeRevelar(x) && { rotulo: 'Revelar IP/MAC', action: 'otRevelar', args: [x.id] }];
        return [`<div class="d-flex gap-2"><button class="btn btn-sm" data-action="otEditarAtivo" data-args='${args(x.id)}' aria-label="${escapeHTML(`Editar ${x.nome}`)}">Editar</button>${mais('ativos', x, extra)}</div>`];
    };
    const tabelaAtivos = renderDataTable(['Ativo', 'Site', 'Zona', 'Tipo', 'Fabricante e modelo', 'IP', 'MAC', 'ARCiber', ...(editar ? ['Ações'] : [])], ativos.map((x) => [
        `<strong>${escapeHTML(x.nome)}</strong>`, escapeHTML(nomeDe(D.sites, x.site_id)), escapeHTML(x.zona_id ? nomeDe(D.zonas, x.zona_id) : 'Sem zona'),
        escapeHTML(x.tipo_dispositivo || '—'), escapeHTML([x.fabricante, x.modelo].filter(Boolean).join(' ') || '—'),
        // Decisão do dono: IP ou MAC basta para o 4.3.1, mas o que falta fica à vista para a coleta em campo.
        x.ip == null ? renderStatusBadge('warning', 'Falta IP') : `<span class="f-mono">${escapeHTML(x.ip)}</span>`,
        x.mac == null ? renderStatusBadge('warning', 'Falta MAC') : `<span class="f-mono">${escapeHTML(x.mac)}</span>`,
        x.no_arciber ? renderStatusBadge('info', `Sim${x.categoria_arciber ? ` · ${CATEGORIAS[x.categoria_arciber] || x.categoria_arciber}` : ''}`) : 'Não',
        ...acoesAtivo(x),
    ]), { emptyMessage: 'Nenhum ativo neste recorte.', emptyHint: editar ? 'Cadastre o ativo aqui ou traga uma planilha pela aba Coleta.' : 'Os ativos entram pela aba Coleta, com a revisão de quem administra o n.ot.' });
    const mascarado = D.ativos.some((x) => x.mascarado);

    c.innerHTML = `<div class="d-flex gap-4 flex-wrap mb-4">${filtroSite()}
        <div class="form-group"><label class="form-label" for="ot-filtro-zona">Zona</label>
            <select class="form-input" id="ot-filtro-zona" data-action-change="otFiltrarZona" data-arg-val><option value="">Todas as zonas</option>
            ${opcoes([...D.zonas.map((z) => [z.id, z.nome]), ['sem', 'Sem zona']], S.otZona)}</select></div></div>
        <h3 class="mb-3">Sites</h3>${tabelaSites}
        <h3 class="mt-6 mb-3">Zonas</h3>${tabelaZonas}
        <h3 class="mt-6 mb-3">Ativos (${escapeHTML(String(ativos.length))})</h3>
        ${mascarado ? '<p class="org-dica mb-3">IP e MAC aparecem mascarados para o seu papel.</p>' : ''}${tabelaAtivos}`;
}

// sites
window.otNovoSite = () => formSite({});
window.otEditarSite = (id) => formSite(D.sites.find((s) => s.id === id) || {});
function formSite(s) {
    openModal(`<div class="modal-header"><span class="modal-title">${s.id ? 'Editar site' : 'Novo site'}</span></div>
        <div class="form-group"><label class="form-label" for="ot-s-nome">Nome</label><input class="form-input" id="ot-s-nome" maxlength="200" value="${escapeHTML(s.nome || '')}"></div>
        <div class="form-group"><label class="form-label" for="ot-s-tipo">Tipo</label><select class="form-input" id="ot-s-tipo">${opcoes(Object.entries(TIPOS_SITE), s.tipo || 'outro')}</select></div>
        <div class="form-group"><label class="form-label" for="ot-s-crit">Criticidade</label><select class="form-input" id="ot-s-crit"><option value="">—</option>${opcoes(Object.entries(CRITICIDADE), s.criticidade)}</select></div>
        <div class="form-group"><label class="form-label" for="ot-s-local">Localização</label><input class="form-input" id="ot-s-local" maxlength="500" value="${escapeHTML(s.localizacao || '')}"></div>
        <div class="form-group"><label class="form-label" for="ot-s-faixas">Faixas internas com IP público (opcional)</label>
        <textarea class="form-input f-mono" id="ot-s-faixas" rows="3" aria-describedby="ot-s-faixas-dica">${escapeHTML((s.faixas_internas || []).join('\n'))}</textarea>
        <p class="org-dica" id="ot-s-faixas-dica">Uma faixa por linha, em CIDR (como 200.10.0.0/24). O sensor de rede trata esses endereços como da rede interna.</p></div>
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Cancelar</button><button class="btn btn-primary" data-action="otSalvarSite" data-args='${args(s.id || '')}'>Salvar</button></div>`);
}
window.otSalvarSite = async (id) => {
    const nome = el('ot-s-nome').value.trim();
    if (!nome) return showToast('Informe o nome do site.', 'error');
    const corpo = { nome, tipo: el('ot-s-tipo').value, criticidade: el('ot-s-crit').value || null, localizacao: el('ot-s-local').value.trim() || null,
        faixas_internas: el('ot-s-faixas').value.split('\n').map((f) => f.trim()).filter(Boolean) };
    try {
        await api(id ? 'PUT' : 'POST', id ? `/api/v1/projects/${proj().id}/ot/sites/${encodeURIComponent(id)}` : `/api/v1/projects/${proj().id}/ot/sites`, corpo);
        forceCloseModal(); showToast('Site salvo.', 'success'); window.render();
    } catch (e) { falhou(e, 'Não foi possível salvar o site.'); }
};

// zonas
window.otNovaZona = () => formZona({ site_id: S.otSite });
window.otEditarZona = (id) => formZona(D.zonas.find((z) => z.id === id) || {});
function formZona(z) {
    openModal(`<div class="modal-header"><span class="modal-title">${z.id ? 'Editar zona' : 'Nova zona'}</span></div>
        ${z.id ? '' : `<div class="form-group"><label class="form-label" for="ot-z-site">Site</label><select class="form-input" id="ot-z-site">${opcoes(D.sites.map((s) => [s.id, s.nome]), z.site_id)}</select></div>`}
        <div class="form-group"><label class="form-label" for="ot-z-nome">Nome</label><input class="form-input" id="ot-z-nome" maxlength="200" value="${escapeHTML(z.nome || '')}"></div>
        <div class="form-group"><label class="form-label" for="ot-z-nivel">Nível Purdue</label><select class="form-input" id="ot-z-nivel">${opcoes([0, 1, 2, 3, 4, 5].map((n) => [n, `Nível ${n}`]), z.nivel_purdue ?? 2)}</select></div>
        <div class="form-group"><label class="form-label" for="ot-z-tipo">Tipo</label><select class="form-input" id="ot-z-tipo">${opcoes(Object.entries(TIPOS_ZONA), z.tipo || 'outra')}</select></div>
        <div class="form-group"><label class="form-label" for="ot-z-desc">Descrição</label><textarea class="form-input" id="ot-z-desc" maxlength="2000" rows="3">${escapeHTML(z.descricao || '')}</textarea></div>
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Cancelar</button><button class="btn btn-primary" data-action="otSalvarZona" data-args='${args(z.id || '')}'>Salvar</button></div>`);
}
window.otSalvarZona = async (id) => {
    const nome = el('ot-z-nome').value.trim();
    if (!nome) return showToast('Informe o nome da zona.', 'error');
    const corpo = { nome, nivel_purdue: Number(el('ot-z-nivel').value), tipo: el('ot-z-tipo').value, descricao: el('ot-z-desc').value.trim() || null };
    if (!id) corpo.site_id = el('ot-z-site').value;
    try {
        await api(id ? 'PUT' : 'POST', id ? `/api/v1/projects/${proj().id}/ot/zonas/${encodeURIComponent(id)}` : `/api/v1/projects/${proj().id}/ot/zonas`, corpo);
        forceCloseModal(); showToast('Zona salva.', 'success'); window.render();
    } catch (e) { falhou(e, 'Não foi possível salvar a zona.'); }
};

// ativos
const zonasDoSite = (siteId) => D.zonas.filter((z) => z.site_id === siteId);
window.otNovoAtivo = (rascunho = {}) => formAtivo({ site_id: S.otSite || D.sites[0]?.id, ...rascunho });
window.otEditarAtivo = (id) => formAtivo(D.ativos.find((x) => x.id === id) || {});
function formAtivo(d) {
    const edicao = !!d.id;
    openModal(`<div class="modal-header"><span class="modal-title">${edicao ? 'Editar ativo' : 'Novo ativo'}</span></div>
        ${edicao ? '' : `<div class="form-group"><label class="form-label" for="ot-f-site">Site</label>
            <select class="form-input" id="ot-f-site" data-action-change="otZonasDoFormulario" data-arg-val>${opcoes(D.sites.map((s) => [s.id, s.nome]), d.site_id)}</select></div>`}
        ${camposDoAtivo(d, { zonas: zonasDoSite(d.site_id), edicao })}
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Cancelar</button><button class="btn btn-primary" data-action="otSalvarAtivo" data-args='${args(d.id || '')}'>Salvar</button></div>`, 'modal-large');
}
window.otZonasDoFormulario = (siteId) => {
    const s = el('ot-f-zona');
    if (s) s.innerHTML = `<option value="">Sem zona</option>${opcoes(zonasDoSite(siteId).map((z) => [z.id, `${z.nome} (nível ${z.nivel_purdue})`]), '')}`;
};
window.otSalvarAtivo = async (id) => {
    const { dados, erro } = lerCamposDoAtivo();
    if (erro) return showToast(erro, 'error');
    if (!id && !dados.nome) return showToast('Informe o nome do ativo.', 'error');
    const corpo = id ? dados : { site_id: el('ot-f-site').value, ...dados };
    try {
        await api(id ? 'PUT' : 'POST', id ? `/api/v1/projects/${proj().id}/ot/ativos/${encodeURIComponent(id)}` : `/api/v1/projects/${proj().id}/ot/ativos`, corpo);
        forceCloseModal(); showToast('Ativo salvo.', 'success'); window.render();
    } catch (e) { falhou(e, 'Não foi possível salvar o ativo.'); }
};

const NOMES = { sites: 'o site', zonas: 'a zona', ativos: 'o ativo', fluxos: 'o fluxo' };
window.otRemover = async (rota, id) => {
    if (!NOMES[rota]) return;
    const ok = await confirmar(`Remover ${NOMES[rota]} do inventário? A exclusão é lógica: o registro sai das listas e a remoção fica na trilha de auditoria.`,
        { titulo: 'Remover do inventário', rotulo: 'Remover', perigo: true });
    if (!ok) return;
    try {
        const i = encodeURIComponent(id);
        const pid = proj().id;
        if (rota === 'sites') await api('DELETE', `/api/v1/projects/${pid}/ot/sites/${i}`);
        else if (rota === 'zonas') await api('DELETE', `/api/v1/projects/${pid}/ot/zonas/${i}`);
        else if (rota === 'ativos') await api('DELETE', `/api/v1/projects/${pid}/ot/ativos/${i}`);
        else await api('DELETE', `/api/v1/projects/${pid}/ot/fluxos/${i}`);
        showToast('Removido do inventário.', 'success'); window.render();
    } catch (e) { falhou(e, 'Não foi possível remover.'); }
};

// Revelar (platform_admin, spec §5): motivo obrigatório para a trilha, TOTP dos últimos 10 min (comStepUp, P1-1); o valor aparece só neste modal e some em 30 s. Fica numa
// variável local da chamada, nunca em S, storage, endereço ou na tabela.
const TEMPO_REVELADO = 30000;
let tempoRevelado = null; // um só: o tempo de um "Revelar" antigo não fecha o modal do seguinte
window.otRevelar = async (id) => {
    const motivo = await pedirTexto('Por que revelar o IP e o MAC deste ativo? O motivo vai para a trilha de auditoria (mínimo de 10 caracteres).',
        { titulo: 'Revelar IP/MAC', rotulo: 'Revelar' });
    if (motivo === null) return;
    if (motivo.length < 10) { showToast('Escreva o motivo com ao menos 10 caracteres.', 'error'); return; }
    let r;
    try { r = await comStepUp(() => api('POST', `/api/v1/projects/${proj().id}/ot/ativos/${encodeURIComponent(id)}/revelar`, { justificativa: motivo })); } catch (e) { falhou(e, 'Não foi possível revelar.'); return; }
    if (!r) return;
    openModal(`<div class="modal-header"><span class="modal-title">IP e MAC de ${escapeHTML(r.nome || 'ativo')}</span></div>
        <div id="ot-revelado"><div class="rotulo-campo">IP</div><p class="valor-campo f-mono">${escapeHTML(r.ip ?? '—')}</p>
        <div class="rotulo-campo mt-3">MAC</div><p class="valor-campo f-mono">${escapeHTML(r.mac ?? '—')}</p></div>
        <p class="org-dica mt-3">O acesso foi registrado na trilha. Este valor some da tela em 30 segundos e não é guardado.</p>
        <div class="acoes-rodape"><button class="btn" data-action="forceCloseModal">Fechar</button></div>`);
    r = null;
    clearTimeout(tempoRevelado);
    tempoRevelado = setTimeout(() => {
        const box = el('ot-revelado');
        if (!box) return;
        el('modal-content').innerHTML = '';
        forceCloseModal();
    }, TEMPO_REVELADO);
};

// IA (P0-7): rascunho; quem grava é a pessoa, pelas rotas do inventário.
window.otSugerirZona = async (id) => {
    let s;
    try { s = await api('POST', `/api/v1/projects/${proj().id}/ot/ia/zona-sugerida`, { ativo_id: id }, { timeoutMs: TEMPO_IA }); } catch (e) { falhou(e, 'Não foi possível pedir a sugestão de zona.'); return; }
    openModal(`<div class="modal-header"><span class="modal-title">Rascunho da IA: zona do ativo</span></div>
        <p class="org-dica mb-3">Sugestão da IA, ainda não gravada. Confira antes de aplicar.</p>
        <div class="rotulo-campo">Nível Purdue sugerido</div><p class="valor-campo">${escapeHTML(String(s.nivel_purdue))}</p>
        <div class="rotulo-campo mt-3">Zona sugerida</div><p class="valor-campo">${escapeHTML(s.zona_nome || 'Nenhuma zona do site serve')}</p>
        <div class="rotulo-campo mt-3">Justificativa</div><p class="pre">${escapeHTML(s.justificativa || '')}</p>
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Descartar</button>
        ${s.zona_id ? `<button class="btn btn-primary" data-action="otAplicarZona" data-args='${args(id, s.zona_id)}'>Aplicar a zona ao ativo</button>` : ''}</div>`);
};
window.otAplicarZona = async (id, zonaId) => {
    try {
        await api('PUT', `/api/v1/projects/${proj().id}/ot/ativos/${encodeURIComponent(id)}`, { zona_id: zonaId });
        forceCloseModal(); showToast('Zona aplicada ao ativo.', 'success'); window.render();
    } catch (e) { falhou(e, 'Não foi possível aplicar a zona.'); }
};

let rascunhoIa = null;
window.otRascunhoIa = () => {
    rascunhoIa = null;
    openModal(`<div class="modal-header"><span class="modal-title">Rascunho de ativo por IA</span></div>
        <p class="org-dica mb-3">Descreva o ativo como está no campo. A IA extrai os campos do 4.3.1 e diz o que falta; IP, MAC e nome de host são trocados por marcadores antes da chamada. Nada é gravado: você confere no formulário e salva.</p>
        <div class="form-group"><label class="form-label" for="ot-ia-desc">Descrição do ativo</label><textarea class="form-input" id="ot-ia-desc" rows="5" maxlength="4000"></textarea></div>
        <div id="ot-ia-resultado"></div>
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Cancelar</button><button class="btn btn-primary" id="ot-ia-checar" data-action="otChecarCompletude">Checar completude</button></div>`);
};
window.otChecarCompletude = async () => {
    const descricao = el('ot-ia-desc').value.trim();
    if (descricao.length < 10) return showToast('Descreva o ativo com ao menos 10 caracteres.', 'error');
    let r;
    try { r = await api('POST', `/api/v1/projects/${proj().id}/ot/ia/completude`, { descricao }, { timeoutMs: TEMPO_IA }); } catch (e) { falhou(e, 'Não foi possível checar a completude.'); return; }
    rascunhoIa = r.campos || {};
    const campos = [['Tipo de dispositivo', rascunhoIa.tipo_dispositivo], ['Fabricante', rascunhoIa.fabricante], ['Modelo', rascunhoIa.modelo], ['Função', rascunhoIa.funcao],
        ['IP', rascunhoIa.ip], ['MAC', rascunhoIa.mac], ['Protocolos', (rascunhoIa.protocolos_portas || []).map((p) => (p.porta == null ? p.protocolo : `${p.protocolo}:${p.porta}`)).join(', ')],
        ['Firmware/SO', rascunhoIa.firmware_so_versao]];
    el('ot-ia-resultado').innerHTML = `<h4 class="mb-2">Rascunho da IA</h4>
        ${renderDataTable(['Campo', 'Extraído'], campos.map(([k, v]) => [escapeHTML(k), escapeHTML(v || '—')]), { dense: true })}
        <p class="mt-3">${r.completo ? 'Os campos do 4.3.1 aparecem na descrição. Confira no formulário antes de salvar.'
            : `Falta para o 4.3.1: ${escapeHTML((r.faltando || []).join(', '))}.`}</p>
        ${r.texto_apoio ? `<p class="org-dica">${escapeHTML(r.texto_apoio)}</p>` : ''}`;
    const botao = el('ot-ia-checar');
    if (botao) { botao.textContent = 'Levar ao formulário do ativo'; botao.setAttribute('data-action', 'otUsarRascunho'); }
};
window.otUsarRascunho = () => {
    const r = rascunhoIa || {};
    rascunhoIa = null;
    const sem = (v) => v ?? undefined;
    window.otNovoAtivo({ tipo_dispositivo: sem(r.tipo_dispositivo), fabricante: sem(r.fabricante), modelo: sem(r.modelo), funcao: sem(r.funcao), ip: sem(r.ip),
        mac: sem(r.mac), firmware_so_versao: sem(r.firmware_so_versao), protocolos_portas: (r.protocolos_portas || []).map((p) => (p.porta == null ? { protocolo: p.protocolo } : p)) });
};

// ─── fluxos (N2): 4.1.2/4.1.3, fluxo externo só por VPN ──────────────────────
const ponta = (ativoId, zonaId) => (ativoId ? `Ativo ${nomeDe(D.ativos, ativoId)}` : zonaId ? `Zona ${nomeDe(D.zonas, zonaId)}` : 'Fora do ARCiber');

async function montarFluxos(c, a, p) {
    try { await carregarInventario(p, { fluxos: true }); } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar os fluxos do n.ot.', e); return; }
    const editar = podeEditarOt();
    if (editar && D.sites.length) a.innerHTML = '<button class="btn btn-primary" data-action="otNovoFluxo">+ Novo fluxo</button>';
    if (!D.sites.length) { c.innerHTML = renderEmptyState({ titulo: 'Nenhum site no inventário', texto: 'Os fluxos ligam ativos e zonas de um site. Comece pela aba Inventário.' }); return; }
    const violados = D.fluxos.filter((f) => (f.violacoes || []).length);
    c.innerHTML = `<div class="d-flex gap-4 flex-wrap mb-4">${filtroSite()}</div>
        <p class="org-header-intro">${violados.length ? `<span class="t-perigo">${escapeHTML(String(violados.length))} fluxo(s) externo(s) sem VPN.</span> ` : ''}A RO-CB.BR.01 (4.1.2 e 4.1.3) pede que o acesso externo ao ARCiber passe por VPN; o inventário registra o fluxo como ele é e marca a violação.</p>
        ${renderDataTable(['Origem', 'Destino', 'Protocolo e porta', 'Direção', 'Externo', 'VPN', 'Situação', ...(editar ? ['Ações'] : [])], D.fluxos.map((f) => [
        escapeHTML(ponta(f.origem_ativo_id, f.origem_zona_id)), escapeHTML(ponta(f.destino_ativo_id, f.destino_zona_id)),
        escapeHTML([f.protocolo, f.porta].filter((x) => x !== null && x !== undefined && x !== '').join(':') || '—'),
        escapeHTML(f.direcao === 'bidirecional' ? 'Bidirecional' : 'Unidirecional'), f.externo ? 'Sim' : 'Não', f.via_vpn ? 'Sim' : 'Não',
        (f.violacoes || []).length ? renderStatusBadge('danger', `Fluxo externo sem VPN: viola ${f.violacoes.join(' e ')}`) : '—',
        ...(editar ? [linhaMais([{ rotulo: 'Remover', action: 'otRemover', args: ['fluxos', f.id], perigo: true }], `fluxo ${ponta(f.origem_ativo_id, f.origem_zona_id)}`)] : []),
    ]), { emptyMessage: 'Nenhum fluxo registrado.', emptyHint: 'Registre as comunicações entre zonas e ativos, e as que saem do ARCiber, dizendo se passam por VPN.' })}`;
}

const pontasOpcoes = () => `<option value="">Fora do ARCiber (externo)</option>`
    + opcoes([...D.zonas.map((z) => [`zona:${z.id}`, `Zona ${z.nome}`]), ...D.ativos.map((x) => [`ativo:${x.id}`, `Ativo ${x.nome}`])], '');
window.otNovoFluxo = () => {
    openModal(`<div class="modal-header"><span class="modal-title">Novo fluxo</span></div>
        <div class="form-group"><label class="form-label" for="ot-fl-site">Site</label><select class="form-input" id="ot-fl-site">${opcoes(D.sites.map((s) => [s.id, s.nome]), S.otSite)}</select></div>
        <div class="form-group"><label class="form-label" for="ot-fl-origem">Origem</label><select class="form-input" id="ot-fl-origem">${pontasOpcoes()}</select></div>
        <div class="form-group"><label class="form-label" for="ot-fl-destino">Destino</label><select class="form-input" id="ot-fl-destino">${pontasOpcoes()}</select></div>
        <div class="form-group"><label class="form-label" for="ot-fl-protocolo">Protocolo</label><input class="form-input" id="ot-fl-protocolo" maxlength="50"></div>
        <div class="form-group"><label class="form-label" for="ot-fl-porta">Porta</label><input class="form-input" id="ot-fl-porta" inputmode="numeric" maxlength="5"></div>
        <div class="form-group"><label class="form-label" for="ot-fl-direcao">Direção</label><select class="form-input" id="ot-fl-direcao">${opcoes([['unidirecional', 'Unidirecional'], ['bidirecional', 'Bidirecional']], 'unidirecional')}</select></div>
        <div class="form-group"><label class="form-label" for="ot-fl-finalidade">Finalidade</label><input class="form-input" id="ot-fl-finalidade" maxlength="500"></div>
        <label class="opcao-check mb-3" for="ot-fl-externo"><input type="checkbox" id="ot-fl-externo"> Fluxo externo (sai do ARCiber ou chega de fora)</label>
        <label class="opcao-check mb-3" for="ot-fl-vpn"><input type="checkbox" id="ot-fl-vpn"> Passa por VPN</label>
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Cancelar</button><button class="btn btn-primary" data-action="otSalvarFluxo">Salvar</button></div>`);
};
window.otSalvarFluxo = async () => {
    const corpo = { site_id: el('ot-fl-site').value };
    for (const lado of ['origem', 'destino']) {
        const [tipo, id] = el(`ot-fl-${lado}`).value.split(':');
        if (id) corpo[`${lado}_${tipo}_id`] = id;
    }
    const porta = el('ot-fl-porta').value.trim();
    if (porta && (!/^\d+$/.test(porta) || Number(porta) > 65535)) return showToast('Porta: um número de 0 a 65535.', 'error');
    Object.assign(corpo, { protocolo: el('ot-fl-protocolo').value.trim() || null, porta: porta ? Number(porta) : null, direcao: el('ot-fl-direcao').value,
        finalidade: el('ot-fl-finalidade').value.trim() || null, externo: el('ot-fl-externo').checked, via_vpn: el('ot-fl-vpn').checked });
    if (corpo.protocolo === null) delete corpo.protocolo;
    if (corpo.porta === null) delete corpo.porta;
    try {
        const r = await api('POST', `/api/v1/projects/${proj().id}/ot/fluxos`, corpo);
        forceCloseModal();
        const v = r && Array.isArray(r.violacoes) ? r.violacoes : [];
        showToast(v.length ? `Fluxo registrado com violação de ${v.join(' e ')}: externo sem VPN.` : 'Fluxo registrado.', v.length ? 'warning' : 'success');
        window.render();
    } catch (e) { falhou(e, 'Não foi possível registrar o fluxo.'); }
};

// ─── acesso por site (técnicos, ot_site_acessos) ─────────────────────────────
let tecnicos = [];
async function montarAcessos(c, a, p) {
    let acessos;
    try {
        const [s, ac] = await Promise.all([api('GET', `/api/v1/projects/${p.id}/ot/sites`), api('GET', `/api/v1/projects/${p.id}/ot/acessos`)]);
        D.sites = lista(s, 'sites'); acessos = lista(ac, 'acessos');
    } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar os acessos por site.', e); return; }
    // Secundários: sem a lista de contas, a tabela mostra o id e o formulário avisa; sem o agente, a aba segue sem o cartão.
    const [contas, agente] = await Promise.all([api('GET', '/api/v1/users').then((r) => (Array.isArray(r) ? r : []), () => []), cartaoAgente(p)]);
    const sondas = await areaSondas(p, D.sites);
    tecnicos = contas.filter((u) => u.role === 'org_user' && u.client_project_id === p.id);
    const email = (id) => (contas.find((u) => u.id === id) || {}).email || id;
    if (D.sites.length) a.innerHTML = '<button class="btn btn-primary" data-action="otNovoAcesso">+ Conceder acesso</button>';
    c.innerHTML = `<p class="org-header-intro">O técnico (usuário do cliente) só vê e só coleta nos sites concedidos aqui; sem acesso, não vê nenhum. Os demais papéis do projeto veem todos os sites.</p>
        ${renderDataTable(['Site', 'Técnico', 'Concedido por', 'Desde', 'Ações'], acessos.map((x) => [
        escapeHTML(nomeDe(D.sites, x.site_id)), escapeHTML(email(x.user_id)), escapeHTML(x.concedido_por || '—'), escapeHTML(formatarData(x.created_at)),
        linhaMais([{ rotulo: 'Revogar acesso', action: 'otRevogarAcesso', args: [x.site_id, x.user_id], perigo: true }], email(x.user_id)),
    ]), { emptyMessage: 'Nenhum acesso concedido.', emptyHint: D.sites.length ? 'Conceda ao técnico os sites em que ele coleta.' : 'Cadastre um site na aba Inventário antes de conceder acesso.' })}${agente}${sondas}`;
}
window.otNovoAcesso = () => {
    openModal(`<div class="modal-header"><span class="modal-title">Conceder acesso a um site</span></div>
        <div class="form-group"><label class="form-label" for="ot-ac-site">Site</label><select class="form-input" id="ot-ac-site">${opcoes(D.sites.map((s) => [s.id, s.nome]), '')}</select></div>
        ${tecnicos.length ? `<div class="form-group"><label class="form-label" for="ot-ac-user">Técnico</label><select class="form-input" id="ot-ac-user">${opcoes(tecnicos.map((u) => [u.id, u.email]), '')}</select></div>`
        : renderEmptyState({ titulo: 'Nenhum técnico neste projeto.', texto: 'Crie a conta de usuário do cliente na tela Usuários e dê a ela o módulo n.ot.', compacto: true })}
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Cancelar</button>${tecnicos.length ? '<button class="btn btn-primary" data-action="otSalvarAcesso">Conceder</button>' : ''}</div>`);
};
window.otSalvarAcesso = async () => {
    try {
        await api('POST', `/api/v1/projects/${proj().id}/ot/acessos`, { user_id: el('ot-ac-user').value, site_id: el('ot-ac-site').value });
        forceCloseModal(); showToast('Acesso concedido.', 'success'); window.render();
    } catch (e) { falhou(e, 'Não foi possível conceder o acesso.'); }
};
window.otRevogarAcesso = async (siteId, userId) => {
    if (!await confirmar('Revogar o acesso deste técnico ao site? Ele deixa de ver e de coletar nesse site.', { titulo: 'Revogar acesso', rotulo: 'Revogar', perigo: true })) return;
    try {
        await api('DELETE', `/api/v1/projects/${proj().id}/ot/acessos/${encodeURIComponent(siteId)}/${encodeURIComponent(userId)}`);
        showToast('Acesso revogado.', 'success'); window.render();
    } catch (e) { falhou(e, 'Não foi possível revogar o acesso.'); }
};

window.renderOt = renderOt;
