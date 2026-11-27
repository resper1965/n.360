import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, renderEmptyState, renderSemProjeto, renderDataTable, falhaDeCarga, renderMaisAcoes, renderStatusBadge,
    openModal, forceCloseModal, showToast, confirmar, pedirTexto, formatarData } from '../ui.js';
import { podeEditarOt, podeAprovarOt, podeRevelar, carregarPermissoes, pode, mensagemDeErro, comStepUp, lista, opcoes, nomeDe,
    nomesDeAtivos, TIPOS_SITE, CRITICIDADE, TIPOS_ZONA, CATEGORIAS, classePrimario } from '../ot-comum.js';
import { montarSaidas } from './ot-saidas.js';
import { esvaziarNotas } from './ot-levantamento.js';
import { montarSondas, montarAgente, montarIntegracao, montarImplantacao } from './ot-configuracao.js';
import { montarDesvios } from './ot-desvios.js';
import { montarAssessment } from './ot-assessment.js';
import { montarFornecedoresOt } from './ot-fornecedores.js';
import { montarSites, montarSite, resolverDesvio } from './ot-site.js';
import { itemVisivel, enderecoDoProduto, modulosVisiveis, atualizarItemOt } from '../produto.js';
import { lerEndereco, escreverEndereco } from '../ot-navegacao.js';
import { renderPainel } from './painel.js';

// n.ot (spec 2026-10-30-n-ot-modulo-n360-design): a casca /ot em abas. Catálogo RO-CB.BR.01 (N1), inventário, fluxos e acesso por
// site (N2), coleta (N3, ot-coleta.js) e saídas (N4, ot-saidas.js), sobre as rotas de src/routes/ot.ts e ot-saidas.ts. Todo texto é
// escapado; o que vem da API fica só na memória desta tela (D), que se refaz a cada desenho.

const el = (id) => document.getElementById(id);
const proj = () => S.activeProject;
const args = (...xs) => escapeHTML(JSON.stringify(xs));
const falhou = (e, padrao) => showToast(mensagemDeErro(e, padrao), 'error');
const TEMPO_IA = 90000;

/** O que a API devolveu no último desenho (sites, zonas, ativos, fluxos). */
const D = { sites: [], zonas: [], ativos: [], fluxos: [] };

const TITULOS = { painel: 'Painel', sites: 'Sites', site: 'Site', assessment: 'Assessment RO-CB.BR.01', relatorios: 'Relatórios', fornecedores: 'Fornecedores de OT', desvios: 'Desvios', implantacao: 'Implantação', acessos: 'Acessos de técnicos', sondas: 'Sondas', agente: 'Agente de coleta', integracao: 'Integração ness.OS' };
// O Painel do n.ot é o mesmo painel do n.iso e do n.privacy (views/painel.js), pelo `?modulo=ot`; o título fica o desta casca.
const MONTAR = { painel: (c, a) => renderPainel(c, null, a, 'ot'), sites: montarSites, assessment: montarAssessment, relatorios: montarSaidas, fornecedores: montarFornecedoresOt, desvios: (c, a, p) => montarDesvios(c, a, p, {}), implantacao: montarImplantacao,
    acessos: (c, a, p) => montarAcessos(c, a, p), sondas: montarSondas, agente: montarAgente, integracao: montarIntegracao };

async function renderOt(c, h, a) {
    a.innerHTML = '';
    if (!proj()) { h.textContent = 'n.ot'; c.innerHTML = renderSemProjeto(); return; }
    // Filtros, lote e subtela são do projeto: trocá-lo (seletor, aviso do sino) não pode levar o site do A para a consulta do B.
    let trocou = false;
    if (S.otProjeto !== proj().id) {
        trocou = !!S.otProjeto; // sem projeto anterior é o primeiro desenho da página: o endereço vale
        await esvaziarNotas(); // notas digitadas no projeto anterior vão para ele, antes de a tela mudar
        S.otProjeto = proj().id; S.otSite = null; S.otZona = null; S.otLote = null; S.otLevantamento = null; S.otDesvioFiltro = null; nomesDeAtivos.clear();
        S.otTela = null; S.otSub = null; S.otPermissoes = null;
    }
    await carregarPermissoes(proj().id);
    // Pedido de uma só vez (sino): vence o endereço velho e sobrevive à troca de projeto.
    // O site vai sem aba (a área decide, montarSite); o desvio segue o caminho do endereço /ot/desvios/<id>, logo abaixo.
    let desvioPedido = null;
    let inicial = false;
    if (S.otPedido) {
        const p = S.otPedido; S.otPedido = null;
        if (p.desvio) { desvioPedido = p.desvio; S.otTela = null; }
        else Object.assign(S, { otTela: p.tela, otSite: p.site ?? null, otSub: null });
    } else if (trocou) { S.otTela = 'painel'; S.otSub = null; inicial = true; } // o endereço ainda é o do projeto anterior
    let desvio = null;
    if (!S.otTela) { // primeira entrada: o endereço decide. Lê antes de escrever, porque a primeira escrita apaga /ot/desvios/<id>.
        const e = desvioPedido ? { tela: 'painel', site: null, aba: null, desvio: desvioPedido } : lerEndereco();
        inicial = !e.tela && !e.desvio; // sem ?ot=: a tela inicial é a que o servidor manda (GET /ot/permissoes)
        if (e.situacao) S.otDesvioFiltro = { situacao: e.situacao, site_id: '', tipo: '' }; // ?ot=desvios&situacao=aceito (item do Painel)
        Object.assign(S, { otTela: e.tela || 'painel', otSite: e.site, otSub: e.aba }); // a área do site confere a aba
        if (e.desvio && !pode('leitor')) { // o leitor não lê desvio (403): o endereço cai no Painel, abaixo
            let r = await resolverDesvio(proj(), e.desvio);
            // O link não traz o projeto: se não está no ativo, procura nos outros n.ot (um a um) e troca para o que o tem.
            for (const o of r ? [] : (S.projects || []).filter((x) => x.id !== proj().id && modulosVisiveis(x).includes('ot'))) {
                if (!(r = await resolverDesvio(o, e.desvio))) continue;
                // os mesmos passos de changeActiveProject (project.js), sem o navigate: a casca segue neste desenho
                S.activeProject = o; S.currentProject = o; S.otProjeto = o.id;
                try { localStorage.setItem('niso_activeProject', JSON.stringify(o)); } catch (err) { /* sem storage */ }
                window.updateActiveProjectWidget?.(); window.updateSidebarProjectSelector?.();
                break;
            }
            if (r) { Object.assign(S, { otTela: 'site', otSite: r.site_id, otSub: 'desvios' }); desvio = e.desvio; }
            else { showToast('Desvio não encontrado neste projeto', 'error'); Object.assign(S, { otTela: 'painel', otSite: null }); }
        }
    }
    await carregarPermissoes(proj().id); // o link de desvio pode ter trocado o projeto
    if (inicial && pode('editar')) S.otTela = S.otPermissoes.tela_inicial === 'implantacao' ? 'implantacao' : 'painel';
    atualizarItemOt();
    // Configuração é de quem edita (Sondas pede também `ver_sondas`); quem não pode cai no Painel (o servidor recusa de qualquer jeito)
    if (['acessos', 'agente', 'integracao', 'fornecedores', 'sondas'].includes(S.otTela) && !podeEditarOt()) S.otTela = 'painel';
    if (S.otTela === 'sondas' && !pode('ver_sondas')) S.otTela = 'painel';
    // o leitor lê só Painel, Assessment e Relatórios (spec 2026-11-26, decisão 4): Início, Sites e o resto caem no Painel
    if (pode('leitor') && !['painel', 'assessment', 'relatorios'].includes(S.otTela)) S.otTela = 'painel';
    const tela = S.otTela;
    escreverEndereco({ tela, site: S.otSite, aba: S.otSub });
    for (const t of Object.keys(TITULOS)) document.getElementById(`nav-ot-${t}`)?.classList.toggle('active', t === (tela === 'site' ? 'sites' : tela));
    h.textContent = TITULOS[tela];
    c.innerHTML = '<div class="loading"></div>';
    if (tela === 'site') {
        await montarSite(c, a, proj(), { site: S.otSite, sub: S.otSub, desvio });
        const nome = c.querySelector('h2')?.textContent;
        if (nome) h.textContent = nome;
    } else await MONTAR[tela](c, a, proj());
}

/** Despacho do menu e dos botões. `extra` (salto de dentro de uma tela: lote, levantamento) vale DEPOIS do zerar, para não ser apagado. */
// `aba` nula no site: a área decide (montarSite)
window.otTela = async (tela, site = null, aba = null, extra = {}) => {
    await esvaziarNotas();
    if (tela === 'desvios') S.otDesvioFiltro = null; // o filtro de site da aba do site não vira recorte escondido na lista de todos os sites
    Object.assign(S, { otTela: tela, otSite: site ?? (tela === 'site' ? S.otSite : null), otSub: aba, otZona: null, otLote: null, otLevantamento: null }, extra);
    if (S.otTela !== 'site' || S.otVisitaInventario?.site !== S.otSite) S.otVisitaInventario = null; // fora da tela do site, a visita do inventário não é reaproveitada
    window.render();
};
// Abre o lote de um site vindo de fora: etapa Revisar.
window.otIrParaLote = (site, lote) => window.otTela('site', site, 'revisar', { otLote: lote });

// ─── inventário (N2) ────────────────────────────────────────────────────────
const doSite = () => (S.otSite ? `?site_id=${encodeURIComponent(S.otSite)}` : '');

async function carregarInventario(p, { fluxos = false } = {}) {
    const [s, z, at, fl] = await Promise.all([api('GET', `/api/v1/projects/${p.id}/ot/sites`), api('GET', `/api/v1/projects/${p.id}/ot/zonas${doSite()}`), api('GET', `/api/v1/projects/${p.id}/ot/ativos${doSite()}`),
        fluxos ? api('GET', `/api/v1/projects/${p.id}/ot/fluxos${doSite()}`) : null]);
    D.sites = lista(s, 'sites'); D.zonas = lista(z, 'zonas'); D.ativos = lista(at, 'ativos'); D.fluxos = lista(fl, 'fluxos');
    for (const x of D.ativos) nomesDeAtivos.set(x.id, x.nome);
    if (S.otSite && !D.sites.some((x) => x.id === S.otSite)) S.otSite = null;
}

// Site fixo (tela do site): os formulários levam o site num campo escondido, sem o seletor.
let siteTravado = null;
const campoSite = (id, rotulo, atual, extra = '') => (siteTravado ? `<input type="hidden" id="${id}" value="${escapeHTML(siteTravado)}">`
    : `<div class="form-group"><label class="form-label" for="${id}">${rotulo}</label><select class="form-input" id="${id}"${extra}>${opcoes(D.sites.map((s) => [s.id, s.nome]), atual)}</select></div>`);

const filtroSite = () => `<div class="form-group"><label class="form-label" for="ot-filtro-site">Site</label>
    <select class="form-input" id="ot-filtro-site" data-action-change="otFiltrarSite" data-arg-val><option value="">Todos os sites</option>${opcoes(D.sites.map((s) => [s.id, s.nome]), S.otSite)}</select></div>`;

window.otFiltrarSite = (v) => { S.otSite = v || null; S.otZona = null; window.render(); };
window.otFiltrarZona = (v) => { S.otZona = v || null; window.render(); };

const linhaMais = (itens, nome) => renderMaisAcoes(itens, { nome });

/** Tabela de zonas do recorte carregado (D.zonas); com `editar`, Editar e Remover por linha. */
function tabelaDeZonas(editar) {
    const mais = (x) => linhaMais([{ rotulo: 'Remover', action: 'otRemover', args: ['zonas', x.id], perigo: true }], x.nome);
    return renderDataTable(['Zona', 'Site', 'Nível Purdue', 'Tipo', ...(editar ? ['Ações'] : [])], D.zonas.map((z) => [
        escapeHTML(z.nome), escapeHTML(nomeDe(D.sites, z.site_id)), escapeHTML(String(z.nivel_purdue)), escapeHTML(TIPOS_ZONA[z.tipo] || z.tipo),
        ...(editar ? [`<div class="d-flex gap-2"><button class="btn btn-sm" data-action="otEditarZona" data-args='${args(z.id)}' aria-label="${escapeHTML(`Editar ${z.nome}`)}">Editar</button>${mais(z)}</div>`] : []),
    ]), { emptyMessage: 'Nenhuma zona registrada.', emptyHint: 'A RO-CB.BR.01 (4.1.1) pede as zonas de supervisão, DMZ operativa e corporativa (níveis 2, 3 e 4) em cada site.' });
}

/** Etapa 1 do assistente (Cadastrar): os dados do site e as zonas. Ativos e fluxos não se gravam aqui (só por achado e lote). */
export async function montarCadastro(c, a, p, { siteFixo, somenteLeitura } = {}) {
    siteTravado = siteFixo || null;
    try { await carregarInventario(p); } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar o cadastro do site.', e); return; }
    const editar = podeEditarOt() && !somenteLeitura; // zona só muda na Implantação e na Obra (o servidor dá 409 fora delas)
    const s = D.sites.find((x) => x.id === siteFixo);
    if (!s) { c.innerHTML = renderEmptyState({ titulo: 'Site não encontrado', texto: 'Este site não existe neste projeto ou o seu acesso a ele não foi concedido.' }); return; }
    if (editar) a.innerHTML = '<button class="btn" data-action="otNovaZona">+ Nova zona</button>';
    c.innerHTML = `<h3 class="mb-3">Dados do site</h3>${renderDataTable(['Tipo', 'Criticidade', 'Localização', ...(editar ? ['Ações'] : [])], [[
        escapeHTML(TIPOS_SITE[s.tipo] || s.tipo), escapeHTML(CRITICIDADE[s.criticidade] || '—'), escapeHTML(s.localizacao || '—'),
        ...(editar ? [`<button class="btn btn-sm" data-action="otEditarSite" data-args='${args(s.id)}' aria-label="${escapeHTML(`Editar ${s.nome}`)}">Editar</button>`] : []),
    ]])}<h3 class="mt-6 mb-3">Zonas</h3>${tabelaDeZonas(editar)}`;
}

export async function montarInventario(c, a, p, { siteFixo, semPrimario, somenteLeitura, zonasSomenteLeitura } = {}) {
    siteTravado = siteFixo || null;
    try { await carregarInventario(p); } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar o inventário do n.ot.', e); return; }
    const editar = podeEditarOt() && !somenteLeitura;
    if (!D.sites.length) {
        c.innerHTML = renderEmptyState({ titulo: 'Nenhum site no inventário',
            texto: editar ? 'Cadastre o primeiro site (subestação, usina ou centro de operação); zonas e ativos ficam dentro dele.'
                : 'O inventário começa pelos sites. Quem administra o n.ot no projeto cadastra os sites ou concede o seu acesso a eles.',
            acao: editar ? '<button class="btn btn-primary" data-action="otNovoSite">Cadastrar o primeiro site</button>' : '' });
        return;
    }
    if (editar) {
        a.innerHTML = `${siteFixo ? '' : '<button class="btn" data-action="otNovoSite">+ Novo site</button>'}${zonasSomenteLeitura ? '' : '<button class="btn" data-action="otNovaZona">+ Nova zona</button>'}`
            + `<button class="btn" data-action="otRascunhoIa">Rascunho por IA</button><button class="${classePrimario(semPrimario)}" data-action="otRegistrarAtivo">Registrar ativo</button>`;
    }
    const zonaVale = (x) => !S.otZona || (S.otZona === 'sem' ? !x.zona_id : x.zona_id === S.otZona);
    const ativos = D.ativos.filter(zonaVale);
    const sites = S.otSite ? D.sites.filter((s) => s.id === S.otSite) : D.sites;
    const mais = (rota, x, extra = []) => linhaMais([...extra, { rotulo: 'Remover', action: 'otRemover', args: [rota, x.id], perigo: true }], x.nome);

    const tabelaSites = renderDataTable(['Site', 'Tipo', 'Criticidade', 'Localização', ...(editar ? ['Ações'] : [])], sites.map((s) => [
        `<strong>${escapeHTML(s.nome)}</strong>`, escapeHTML(TIPOS_SITE[s.tipo] || s.tipo), escapeHTML(CRITICIDADE[s.criticidade] || '—'), escapeHTML(s.localizacao || '—'),
        ...(editar ? [`<div class="d-flex gap-2"><button class="btn btn-sm" data-action="otEditarSite" data-args='${args(s.id)}' aria-label="${escapeHTML(`Editar ${s.nome}`)}">Editar</button>${mais('sites', s)}</div>`] : []),
    ]));
    const tabelaZonas = tabelaDeZonas(editar && !zonasSomenteLeitura);
    const acoesAtivo = (x) => {
        if (!editar) return [];
        const extra = [{ rotulo: 'Sugerir zona (IA)', action: 'otSugerirZona', args: [x.id] }, podeRevelar(x) && { rotulo: 'Revelar IP/MAC', action: 'otRevelar', args: [x.id] },
            { rotulo: 'Propor remoção', action: 'otProporRemocao', args: ['ativos', x.id], perigo: true }];
        return [`<div class="d-flex gap-2"><button class="btn btn-sm" data-action="otProporAlteracao" data-args='${args(x.id)}' aria-label="${escapeHTML(`Propor alteração de ${x.nome}`)}">Propor alteração</button>${linhaMais(extra, x.nome)}</div>`];
    };
    const tabelaAtivos = renderDataTable(['Ativo', 'Site', 'Zona', 'Tipo', 'Fabricante e modelo', 'IP', 'MAC', 'ARCiber', ...(editar ? ['Ações'] : [])], ativos.map((x) => [
        `<strong>${escapeHTML(x.nome)}</strong>${!x.ultima_verificacao_em || !x.verificado_por ? ` <span title="Entrou sem lote de aprovação">${renderStatusBadge('warning', 'não verificado (4.3.1)')}</span>` : ''}`, escapeHTML(nomeDe(D.sites, x.site_id)), escapeHTML(x.zona_id ? nomeDe(D.zonas, x.zona_id) : 'Sem zona'),
        escapeHTML(x.tipo_dispositivo || '—'), escapeHTML([x.fabricante, x.modelo].filter(Boolean).join(' ') || '—'),
        // Decisão do dono: IP ou MAC basta para o 4.3.1, mas o que falta fica à vista para a coleta em campo.
        x.ip == null ? renderStatusBadge('warning', 'Falta IP') : `<span class="f-mono">${escapeHTML(x.ip)}</span>`,
        x.mac == null ? renderStatusBadge('warning', 'Falta MAC') : `<span class="f-mono">${escapeHTML(x.mac)}</span>`,
        x.no_arciber ? renderStatusBadge('info', `Sim${x.categoria_arciber ? ` · ${CATEGORIAS[x.categoria_arciber] || x.categoria_arciber}` : ''}`) : 'Não',
        ...acoesAtivo(x),
    ]), { emptyMessage: 'Nenhum ativo neste recorte.', emptyHint: editar ? 'Registre o ativo aqui (vira achado para aprovação) ou traga uma planilha pelo Levantamento.' : 'Os ativos entram pelo Lote de aprovação do site, com a revisão de quem administra o n.ot.' });
    const mascarado = D.ativos.some((x) => x.mascarado);

    c.innerHTML = `<div class="d-flex gap-4 flex-wrap mb-4">${siteFixo ? '' : filtroSite()}
        <div class="form-group"><label class="form-label" for="ot-filtro-zona">Zona</label>
            <select class="form-input" id="ot-filtro-zona" data-action-change="otFiltrarZona" data-arg-val><option value="">Todas as zonas</option>
            ${opcoes([...D.zonas.map((z) => [z.id, z.nome]), ['sem', 'Sem zona']], S.otZona)}</select></div></div>
        ${siteFixo ? '' : `<h3 class="mb-3">Sites</h3>${tabelaSites}`}
        <h3 class="${siteFixo ? '' : 'mt-6 '}mb-3">Zonas</h3>${tabelaZonas}
        <h3 class="mt-6 mb-3">Ativos (${escapeHTML(String(ativos.length))})</h3>
        ${mascarado ? '<p class="org-dica mb-3">IP e MAC aparecem mascarados para o seu papel.</p>' : ''}${tabelaAtivos}`;
}

// sites
window.otNovoSite = () => formSite({});
window.otEditarSite = (id) => formSite(D.sites.find((s) => s.id === id) || {});
export function formSite(s) {
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
        const r = await api(id ? 'PUT' : 'POST', id ? `/api/v1/projects/${proj().id}/ot/sites/${encodeURIComponent(id)}` : `/api/v1/projects/${proj().id}/ot/sites`, corpo);
        forceCloseModal(); showToast('Site salvo.', 'success');
        for (const k of Object.keys(S.painel || {})) if (k.split('|')[1] === proj().id) delete S.painel[k]; // "Sites em implantação" não fica atrás da lista de verificação
        if (!id && r && r.id) window.otTela('site', r.id, null); // criar o site abre o site novo (spec 2026-11-26 §3)
        else window.render();
    } catch (e) { falhou(e, 'Não foi possível salvar o site.'); }
};

// zonas
window.otNovaZona = () => formZona({ site_id: S.otSite });
window.otEditarZona = (id) => formZona(D.zonas.find((z) => z.id === id) || {});
function formZona(z) {
    openModal(`<div class="modal-header"><span class="modal-title">${z.id ? 'Editar zona' : 'Nova zona'}</span></div>
        ${z.id ? '' : campoSite('ot-z-site', 'Site', z.site_id)}
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

// ativos e fluxos: só por achado e lote decidido por outra pessoa (spec 2026-11-26, decisão 3). Achado do inventário vai a um levantamento de visita novo.
const siteAtual = () => siteTravado || S.otSite || D.sites[0]?.id;
const registrar = (site, achado) => window.otRegistrarAchado(site, achado, { levantamento: S.otLevantamento });
window.otRegistrarAtivo = () => registrar(siteAtual(), { entidade: 'ativo' });
window.otProporAlteracao = (id) => { const x = D.ativos.find((a) => a.id === id); if (x) return registrar(x.site_id, { entidade: 'ativo', dados: x, alvo_id: id, original: x }); };
window.otProporRemocao = (rota, id) => {
    const x = (rota === 'fluxos' ? D.fluxos : D.ativos).find((a) => a.id === id);
    if (x) return registrar(x.site_id, { entidade: rota === 'fluxos' ? 'fluxo' : 'ativo', alvo_id: id, remover: true });
};
window.otProporAlteracaoFluxo = (id) => {
    const f = D.fluxos.find((x) => x.id === id);
    if (f) return registrar(f.site_id, { entidade: 'fluxo', dados: f, alvo_id: id, original: f, ativos: D.ativos.filter((x) => x.site_id === f.site_id).map(({ id: i, nome }) => ({ id: i, nome })) });
};
window.otRegistrarFluxo = () => {
    const site = siteAtual();
    return registrar(site, { entidade: 'fluxo', ativos: D.ativos.filter((x) => x.site_id === site).map(({ id, nome }) => ({ id, nome })) });
};

const NOMES = { sites: 'o site', zonas: 'a zona' };
window.otRemover = async (rota, id) => {
    if (!NOMES[rota]) return;
    const ok = await confirmar(`Remover ${NOMES[rota]} do inventário? A exclusão é lógica: o registro sai das listas e a remoção fica na trilha de auditoria.`,
        { titulo: 'Remover do inventário', rotulo: 'Remover', perigo: true });
    if (!ok) return;
    try {
        const i = encodeURIComponent(id);
        const pid = proj().id;
        if (rota === 'sites') await api('DELETE', `/api/v1/projects/${pid}/ot/sites/${i}`);
        else await api('DELETE', `/api/v1/projects/${pid}/ot/zonas/${i}`);
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

// IA (P0-7): rascunho; quem decide é a pessoa, que o leva a um achado (e o lote, a outra pessoa).
window.otSugerirZona = async (id) => {
    let s;
    try { s = await api('POST', `/api/v1/projects/${proj().id}/ot/ia/zona-sugerida`, { ativo_id: id }, { timeoutMs: TEMPO_IA }); } catch (e) { falhou(e, 'Não foi possível pedir a sugestão de zona.'); return; }
    openModal(`<div class="modal-header"><span class="modal-title">Rascunho da IA: zona do ativo</span></div>
        <p class="org-dica mb-3">Sugestão da IA, ainda não gravada. Confira antes de propor: a zona muda só quando outra pessoa aprovar o lote.</p>
        <div class="rotulo-campo">Nível Purdue sugerido</div><p class="valor-campo">${escapeHTML(String(s.nivel_purdue))}</p>
        <div class="rotulo-campo mt-3">Zona sugerida</div><p class="valor-campo">${escapeHTML(s.zona_nome || 'Nenhuma zona do site serve')}</p>
        <div class="rotulo-campo mt-3">Justificativa</div><p class="pre">${escapeHTML(s.justificativa || '')}</p>
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Descartar</button>
        ${s.zona_id ? `<button class="btn btn-primary" data-action="otProporZona" data-args='${args(id, s.zona_id)}'>Propor esta zona</button>` : ''}</div>`);
};
window.otProporZona = (id, zonaId) => {
    const x = D.ativos.find((a) => a.id === id);
    if (x) return registrar(x.site_id, { entidade: 'ativo', dados: { ...x, zona_id: zonaId }, alvo_id: id, original: x, evidencia: 'Zona sugerida pela IA e conferida por quem registra o achado.' });
};

let rascunhoIa = null;
window.otRascunhoIa = () => {
    rascunhoIa = null;
    openModal(`<div class="modal-header"><span class="modal-title">Rascunho de ativo por IA</span></div>
        <p class="org-dica mb-3">Descreva o ativo como está no campo. A IA extrai os campos do 4.3.1 e diz o que falta; IP, MAC e nome de host são trocados por marcadores antes da chamada. Nada é gravado: você confere no formulário do achado e o registra.</p>
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
    if (botao) { botao.textContent = 'Levar ao formulário do achado'; botao.setAttribute('data-action', 'otUsarRascunho'); }
};
window.otUsarRascunho = () => {
    const r = rascunhoIa || {};
    rascunhoIa = null;
    const sem = (v) => v ?? undefined;
    return registrar(siteAtual(), { entidade: 'ativo', dados: { tipo_dispositivo: sem(r.tipo_dispositivo), fabricante: sem(r.fabricante), modelo: sem(r.modelo), funcao: sem(r.funcao), ip: sem(r.ip),
        mac: sem(r.mac), firmware_so_versao: sem(r.firmware_so_versao), protocolos_portas: (r.protocolos_portas || []).map((p) => (p.porta == null ? { protocolo: p.protocolo } : p)) } });
};

// ─── fluxos (N2): 4.1.2/4.1.3, fluxo externo só por VPN ──────────────────────
const ponta = (ativoId, zonaId) => (ativoId ? `Ativo ${nomeDe(D.ativos, ativoId)}` : zonaId ? `Zona ${nomeDe(D.zonas, zonaId)}` : 'Fora do ARCiber');

export async function montarFluxos(c, a, p, { siteFixo, semPrimario, somenteLeitura } = {}) {
    siteTravado = siteFixo || null;
    try { await carregarInventario(p, { fluxos: true }); } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar os fluxos do n.ot.', e); return; }
    const editar = podeEditarOt() && !somenteLeitura;
    if (editar && D.sites.length) a.innerHTML = `<button class="${classePrimario(semPrimario)}" data-action="otRegistrarFluxo">Registrar fluxo</button>`;
    if (!D.sites.length) { c.innerHTML = renderEmptyState({ titulo: 'Nenhum site no inventário', texto: 'Os fluxos ligam ativos e zonas de um site.' })
        + (editar ? '<p><button class="btn" data-action="otTela" data-args=\'["sites"]\'>Cadastrar site</button></p>' : ''); return; }
    const violados = D.fluxos.filter((f) => (f.violacoes || []).length);
    c.innerHTML = `${siteFixo ? '' : `<div class="d-flex gap-4 flex-wrap mb-4">${filtroSite()}</div>`}
        <p class="org-header-intro">${violados.length ? `<span class="t-perigo">${escapeHTML(String(violados.length))} fluxo(s) externo(s) sem VPN.</span> ` : ''}A RO-CB.BR.01 (4.1.2 e 4.1.3) pede que o acesso externo ao ARCiber passe por VPN; o inventário registra o fluxo como ele é e marca a violação.</p>
        ${renderDataTable(['Origem', 'Destino', 'Protocolo e porta', 'Direção', 'Externo', 'VPN', 'Situação', ...(editar ? ['Ações'] : [])], D.fluxos.map((f) => [
        escapeHTML(ponta(f.origem_ativo_id, f.origem_zona_id)), escapeHTML(ponta(f.destino_ativo_id, f.destino_zona_id)),
        escapeHTML([f.protocolo, f.porta].filter((x) => x !== null && x !== undefined && x !== '').join(':') || '—'),
        escapeHTML(f.direcao === 'bidirecional' ? 'Bidirecional' : 'Unidirecional'), f.externo ? 'Sim' : 'Não', f.via_vpn ? 'Sim' : 'Não',
        (f.violacoes || []).length ? renderStatusBadge('danger', `Fluxo externo sem VPN: viola ${f.violacoes.join(' e ')}`) : '—',
        ...(editar ? [`<div class="d-flex gap-2"><button class="btn btn-sm" data-action="otProporAlteracaoFluxo" data-args='${args(f.id)}' aria-label="${escapeHTML(`Propor alteração do fluxo ${ponta(f.origem_ativo_id, f.origem_zona_id)}`)}">Propor alteração</button>${linhaMais([{ rotulo: 'Propor remoção', action: 'otProporRemocao', args: ['fluxos', f.id], perigo: true }], `fluxo ${ponta(f.origem_ativo_id, f.origem_zona_id)}`)}</div>`] : []),
    ]), { emptyMessage: 'Nenhum fluxo registrado.', emptyHint: 'Registre as comunicações entre zonas e ativos, e as que saem do ARCiber, dizendo se passam por VPN.' })}`;
}

// ─── acesso por site (técnicos, ot_site_acessos) ─────────────────────────────
let tecnicos = [];
export async function montarAcessos(c, a, p) {
    let acessos;
    try {
        const [s, ac] = await Promise.all([api('GET', `/api/v1/projects/${p.id}/ot/sites`), api('GET', `/api/v1/projects/${p.id}/ot/acessos`)]);
        D.sites = lista(s, 'sites'); acessos = lista(ac, 'acessos');
    } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar os acessos por site.', e); return; }
    // Secundário: sem a lista de contas, a tabela mostra o id e o formulário avisa.
    const contas = await api('GET', '/api/v1/users').then((r) => (Array.isArray(r) ? r : []), () => []);
    tecnicos = contas.filter((u) => u.role === 'org_user' && u.client_project_id === p.id);
    const email = (id) => (contas.find((u) => u.id === id) || {}).email || id;
    if (D.sites.length) a.innerHTML = '<button class="btn btn-primary" data-action="otNovoAcesso">+ Conceder acesso</button>';
    c.innerHTML = `<p class="org-header-intro">O técnico (usuário do cliente) só vê e só coleta nos sites concedidos aqui; sem acesso, não vê nenhum. Os demais papéis do projeto veem todos os sites.</p>
        ${renderDataTable(['Site', 'Técnico', 'Concedido por', 'Desde', 'Ações'], acessos.map((x) => [
        escapeHTML(nomeDe(D.sites, x.site_id)), escapeHTML(email(x.user_id)), escapeHTML(x.concedido_por || '—'), escapeHTML(formatarData(x.created_at)),
        linhaMais([{ rotulo: 'Revogar acesso', action: 'otRevogarAcesso', args: [x.site_id, x.user_id], perigo: true }], email(x.user_id)),
    ]), { emptyMessage: 'Nenhum acesso concedido.', emptyHint: D.sites.length ? 'Conceda ao técnico os sites em que ele coleta.' : 'Cadastre um site em Sites antes de conceder acesso.' })}`;
}
window.otNovoAcesso = () => {
    openModal(`<div class="modal-header"><span class="modal-title">Conceder acesso a um site</span></div>
        <div class="form-group"><label class="form-label" for="ot-ac-site">Site</label><select class="form-input" id="ot-ac-site">${opcoes(D.sites.map((s) => [s.id, s.nome]), '')}</select></div>
        ${tecnicos.length ? `<div class="form-group"><label class="form-label" for="ot-ac-user">Técnico</label><select class="form-input" id="ot-ac-user">${opcoes(tecnicos.map((u) => [u.id, u.email]), '')}</select></div>`
        : renderEmptyState({ titulo: 'Nenhum técnico neste projeto.', texto: 'Crie a conta de usuário do cliente na tela Usuários e dê a ela o módulo n.ot.', compacto: true })}${itemVisivel(document, 'nav-users') ? `<p><a class="btn" href="${enderecoDoProduto('n360')}?tela=users">Abrir Usuários (n.360)</a></p>` : ''}
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
