// n.ot (spec 2026-10-30-n-ot-modulo-n360-design, N1): o terceiro módulo do n.360 em /ot. Casca, item do menu (projeto E pessoa
// com o módulo), a tela do catálogo RO-CB.BR.01 e a concessão sempre explícita (P0-1). api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import html from '../login.html?raw';
import { produtoAtual, aplicarCasca, enderecoDoProduto, atualizarItemOt, moduloPara, pedidoDoHub, TELAS_DOS_MODULOS, NAV_DO_HUB, produtoDaTela } from '../src/produto.js';
import '../src/views/ot.js';
import * as ui from '../src/ui.js';

const loc = (url) => { const u = new URL(url); return { hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, origin: u.origin }; };
const ir = (caminho) => history.replaceState(null, '', caminho);
const el = (id) => document.getElementById(id);
const visiveis = () => [...document.querySelectorAll('.sidebar-nav[id^="nav-"]')].filter((n) => n.dataset.foraDoProduto !== '1').map((n) => n.id);
const montarApp = () => { document.open(); document.write(html); document.close(); };

beforeEach(() => { try { sessionStorage.clear(); } catch (e) { /* jsdom */ } S.token = 'tok'; S.user = { role: 'platform_admin' }; S.activeProject = null; window.render = vi.fn(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); ir('/'); });

describe('casca do n.ot', () => {
    it('/ot é o n.ot; /otario não', () => {
        expect(produtoAtual(loc('https://n360.ness.com.br/ot'))).toBe('ot');
        expect(produtoAtual(loc('https://n360.ness.com.br/ot/x'))).toBe('ot');
        expect(produtoAtual(loc('https://n360.ness.com.br/otario'))).toBe('n360');
        expect(enderecoDoProduto('ot')).toBe('/ot');
    });
    it('no /ot o menu tem só os itens do n.ot; a marca é n.ot em minúsculas, com o ponto em accent', () => {
        montarApp();
        aplicarCasca('ot');
        expect(visiveis()).toEqual(['nav-ot-inicio', 'nav-ot-painel', 'nav-ot-sites', 'nav-ot-assessment', 'nav-ot-relatorios', 'nav-ot-fornecedores', 'nav-ot-acessos']);
        expect(document.title).toMatch(/^n\.ot \| ness\./);
        expect(el('sidebar-logo-mark').textContent).toBe('n.ot');
        expect(el('sidebar-logo-mark').innerHTML).toContain('var(--accent)');
    });
    it('o n.ot não tem item solto em menu nenhum (entra-se pelo "Abrir no n.ot" do Início), e a tela ot continua sendo dele', () => {
        montarApp();
        expect(el('nav-ot')).toBeNull();
        expect(NAV_DO_HUB).not.toContain('nav-ot');
        expect(produtoDaTela('ot')).toBe('ot');
    });
});

describe('itens do n.ot: só dentro do /ot, com projeto E pessoa com o módulo', () => {
    it('fora do /ot ficam escondidos mesmo com o módulo; no /ot, só com projeto e pessoa', () => {
        montarApp();
        S.activeProject = { id: 'b', modulos: ['iso', 'ot'] };
        S.user = { role: 'consultor', modulos: ['ot'] };
        atualizarItemOt();
        expect(el('nav-ot-inicio').hidden).toBe(true);
        expect(el('nav-ot-painel').hidden).toBe(true);
        ir('/ot');
        atualizarItemOt();
        expect(el('nav-ot-inicio').hidden).toBe(false);
        expect(el('nav-ot-painel').hidden).toBe(false);
        S.user = { role: 'consultor', modulos: ['iso'] };
        atualizarItemOt();
        expect(el('nav-ot-inicio').hidden).toBe(true);
        expect(el('nav-ot-painel').hidden).toBe(true);
        // projeto SEM o n.ot e pessoa COM o n.ot: continua escondido (modulosVisiveis cruza projeto e pessoa)
        S.activeProject = { id: 'c', modulos: ['iso', 'privacy'] };
        S.user = { role: 'consultor', modulos: ['ot'] };
        atualizarItemOt();
        expect(el('nav-ot-inicio').hidden).toBe(true);
        expect(el('nav-ot-painel').hidden).toBe(true);
        S.activeProject = null;
        S.user = { role: 'consultor', modulos: ['ot'] };
        atualizarItemOt();
        expect(el('nav-ot-inicio').hidden).toBe(true);
        expect(el('nav-ot-painel').hidden).toBe(true);
    });
    it('o hub leva a tela ot ao módulo dela; /ot?tela=ot abre a tela e ?tela=ot noutro módulo não', () => {
        expect(TELAS_DOS_MODULOS).toContain('ot');
        expect(moduloPara('ot', { id: 'b', modulos: ['iso', 'ot'] })).toBe('ot');
        ir('/ot?tela=ot');
        expect(pedidoDoHub()).toEqual({ tela: 'ot', aba: null });
        ir('/iso?tela=ot');
        expect(pedidoDoHub()).toBeNull();
    });
});

describe('tela Assessment RO-CB.BR.01', () => {
    // Corpo de GET /api/v1/projects/:projectId/ot/assessment (src/routes/ot.ts).
    const req = (codigo, titulo, prazo) => ({ codigo, titulo, categoria: 'c', prazo, tipo: 'tecnico', situacao_org: 'nao_avaliado', por_site: [] });
    const abrir = async () => {
        document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
        S.otProjeto = S.activeProject?.id; S.otTela = 'assessment';
        await window.renderOt(el('c'), el('h'), el('a'));
    };
    it('lista código, título e prazo (dd/mm/aaaa ou sem prazo), tudo escapado, do projeto ativo', async () => {
        S.activeProject = { id: 'p9', modulos: ['ot'] };
        const f = servir({ 'GET /api/v1/projects/p9/ot/assessment': { resumo: {}, itens: [req('4.1.1', 'Zonas <b id="x">x</b>', '2023-01-09'), req('4.3.1', 'Inventário', '2023-10-09'), req('5.1.1', 'Exceções', null)] } });
        await abrir();
        expect(f.mock.calls.map((c) => new URL(c[0], 'http://x').pathname)).toContain('/api/v1/projects/p9/ot/assessment');
        expect([...el('c').querySelectorAll('th')].map((t) => t.textContent)).toEqual(['Código', 'Requisito', 'Situação', 'Prazo ONS', 'Responsável', 'Próxima revisão', '']);
        const linhas = [...el('c').querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()));
        expect(linhas.map((l) => [l[0], l[1], l[3]])).toEqual([['4.1.1', 'Zonas <b id="x">x</b>', '09/01/2023'], ['4.3.1', 'Inventário', '09/10/2023'], ['5.1.1', 'Exceções', 'Sem prazo']]);
        expect(el('x')).toBeNull();
        expect(el('c').textContent).toContain('RO-CB.BR.01 Rev.00');
    });
    it('catálogo vazio: estado vazio, não tabela', async () => {
        S.activeProject = { id: 'p9', modulos: ['ot'] };
        servir({ 'GET /api/v1/projects/p9/ot/assessment': { resumo: {}, itens: [] } });
        await abrir();
        expect(el('c').querySelector('.empty-state')).toBeTruthy();
        expect(el('c').querySelector('table')).toBeNull();
    });
    it('falha da carga: estado de erro, não o vazio', async () => {
        S.activeProject = { id: 'p9', modulos: ['ot'] };
        vi.spyOn(console, 'error').mockImplementation(() => {});
        servir({});
        await abrir();
        expect(el('c').querySelector('.error-state')).toBeTruthy();
        expect(el('c').querySelector('.empty-state')).toBeNull();
    });
    it('sem projeto ativo: pede o projeto, sem chamar a API', async () => {
        const f = servir({});
        await abrir();
        expect(f).not.toHaveBeenCalled();
        expect(el('c').textContent).toContain('Sem projeto ativo');
    });
});

describe('concessão do n.ot é sempre explícita (P0-1)', () => {
    it('Produtos do projeto: linha do n.ot e o aviso de que ninguém o recebe sozinho', async () => {
        document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
        servir({ 'GET /api/v1/projects/p9/modulos': { habilitados: ['iso'], contratados: ['iso', 'ot'] } });
        await window.abrirProdutosDoProjeto('p9');
        const acoes = [...document.querySelectorAll('[data-action="alternarProdutoDoProjeto"]')].map((b) => JSON.parse(b.getAttribute('data-args')).slice(1));
        expect(acoes).toEqual([['iso', false], ['ot', true]]);
        expect(el('produtos-aviso-ot').textContent).toContain('não é concedido automaticamente');
    });
});

describe('casca por subtela', () => {
    const B = '/api/v1/projects/p9/ot';
    const NAV = ['inicio', 'painel', 'sites', 'assessment', 'relatorios', 'acessos'].map((t) => `<div id="nav-ot-${t}"></div>`).join('');
    const abrir = () => { document.body.innerHTML = `<h1 id="h"></h1><div id="a"></div><div id="c"></div>${NAV}`; return window.renderOt(el('c'), el('h'), el('a')); };
    const SITES = { sites: [{ id: 's1', nome: 'SE Norte' }, { id: 's2', nome: 'SE Sul' }] };
    beforeEach(() => {
        S.activeProject = { id: 'p9', modulos: ['ot'] }; S.user = { id: 'u', role: 'consultor' };
        S.otProjeto = 'p9'; S.otTela = null; S.otSite = null; S.otModo = null; S.otSub = null; S.otLote = null; S.otLevantamento = null; S.otDesvioFiltro = null;
        window.render = vi.fn();
    });

    it('?ot=painel desenha o Painel do n.ot pelo /painel?modulo=ot e marca o item do menu', async () => {
        const SAUDE = { tom: 'plano', rotulo: 'Começando', frase: 'f', apoio: '' };
        const f = servir({ 'GET /api/v1/projects/p9/painel': { gerado_em: '2026-11-20T10:00:00Z', visao: 'equipe', modulos_pedidos: ['ot'], empresa: null, encarregados: [],
            programa: { estado: 'comecando', desde: null, rotulo: 'Começando', etapas: {} }, saude: SAUDE,
            modulos: { ot: { saude: SAUDE, numeros: [], comecando: true, fazer: [], passos: [] } } } });
        S.painel = {};
        document.body.innerHTML = `<h1 id="h"></h1><div id="a"></div><div id="c"></div>${NAV}`;
        await window.otTela('painel'); await window.renderOt(el('c'), el('h'), el('a'));
        expect(el('h').textContent).toBe('Painel');
        expect(el('nav-ot-painel').classList.contains('active')).toBe(true);
        expect(location.search).toBe('?ot=painel');
        expect(f.mock.calls.some(([u]) => String(u).includes('/painel?modulo=ot'))).toBe(true);
    });
    it('link direto /ot?ot=painel sem projeto (S.projects vazio): "sem projeto" e nenhuma chamada ao /painel', async () => {
        const f = servir({});
        S.activeProject = null; S.projects = []; S.otProjeto = null; S.painel = {}; ir('/ot?ot=painel');
        await abrir();
        expect(f.mock.calls.filter(([u]) => String(u).includes('/painel'))).toEqual([]);
        expect(el('c').querySelector('.pn')).toBeNull();
    });
    it('a resposta do Painel que chega depois de trocar para Sites não é desenhada por cima', async () => {
        const SAUDE = { tom: 'plano', rotulo: 'Começando', frase: 'f', apoio: '' };
        const PAINEL = { gerado_em: '2026-11-20T10:00:00Z', visao: 'equipe', modulos_pedidos: ['ot'], empresa: null, encarregados: [],
            programa: { estado: 'comecando', desde: null, rotulo: 'Começando', etapas: {} }, saude: SAUDE,
            modulos: { ot: { saude: SAUDE, numeros: [], comecando: true, fazer: [], passos: [] } } };
        let soltar;
        const segura = new Promise((r) => { soltar = r; });
        const f = servir({ [`GET ${B}/sites`]: SITES, 'GET /api/v1/projects/p9/painel': PAINEL });
        const real = f.getMockImplementation();
        f.mockImplementation(async (url, o) => { if (String(url).includes('/painel')) await segura; return real(url, o); });
        S.painel = {}; S.view = 'ot';
        document.body.innerHTML = `<h1 id="h"></h1><div id="a"></div><div id="c"></div>${NAV}`;
        S.otTela = 'painel';
        const painel = window.renderOt(el('c'), el('h'), el('a'));
        await window.otTela('sites'); await window.renderOt(el('c'), el('h'), el('a'));
        soltar(); await painel;
        expect(el('h').textContent).toBe('Sites');
        expect(el('c').querySelector('.pn')).toBeNull();
    });
    it('sem parâmetro desenha o Início; ?ot=relatorios desenha Relatórios; o endereço acompanha', async () => {
        servir({ [`GET ${B}/sites`]: SITES });
        await abrir();
        expect(el('h').textContent).toBe('n.ot · Início');
        expect(S.otTela).toBe('inicio');
        S.otTela = null; ir('/ot?ot=relatorios');
        await abrir();
        expect(el('h').textContent).toBe('Relatórios');
        expect(location.search).toBe('?ot=relatorios');
    });
    it('a subtela escolhida marca o item do menu; o site marca Sites', async () => {
        servir({ [`GET ${B}/sites`]: SITES });
        document.body.innerHTML = `<h1 id="h"></h1><div id="a"></div><div id="c"></div>${NAV}`;
        await window.otTela('assessment'); await window.renderOt(el('c'), el('h'), el('a'));
        expect(el('nav-ot-assessment').classList.contains('active')).toBe(true);
        await window.otTela('site', 's1'); await window.renderOt(el('c'), el('h'), el('a'));
        expect(el('nav-ot-sites').classList.contains('active')).toBe(true);
        expect(el('nav-ot-assessment').classList.contains('active')).toBe(false);
        expect(el('h').textContent).toBe('SE Norte');
    });
    it('otTela("acessos") sem poder editar cai no Início', async () => {
        S.user = { id: 'u', role: 'org_user' };
        servir({ [`GET ${B}/sites`]: SITES });
        await window.otTela('acessos'); await abrir();
        expect(S.otTela).toBe('inicio');
        expect(el('h').textContent).toBe('n.ot · Início');
    });
    it('trocar de projeto zera site, subtela e aba', async () => {
        servir({});
        S.otTela = 'site'; S.otSite = 's1'; S.otModo = 'operacao'; S.otSub = 'desvios';
        S.activeProject = { id: 'p8', modulos: ['ot'] };
        ir('/ot');
        await abrir();
        expect([S.otSite, S.otModo, S.otSub]).toEqual([null, null, null]);
        expect(S.otTela).toBe('inicio');
    });
    it('trocar de projeto não lê o endereço velho: abre o Início e limpa ?ot=', async () => {
        servir({});
        S.otTela = 'site'; S.otSite = 's1'; S.otModo = 'operacao';
        ir('/ot?ot=site&site=s1&modo=operacao');
        S.activeProject = { id: 'p8', modulos: ['ot'] };
        await abrir();
        expect([S.otTela, S.otSite]).toEqual(['inicio', null]);
        expect(location.search).not.toContain('ot=');
    });
    it('pedido do sino de outro projeto leva a Relatórios, mesmo com endereço velho; no mesmo projeto também', async () => {
        servir({});
        ir('/ot?ot=site&site=s1');
        S.activeProject = { id: 'p8', modulos: ['ot'] };
        S.otPedido = { tela: 'relatorios' };
        await abrir();
        expect(el('h').textContent).toBe('Relatórios');
        expect(S.otPedido).toBeNull();
        S.otPedido = { tela: 'sites' };
        await abrir();
        expect(el('h').textContent).toBe('Sites');
    });
    it('pedido do sino com site abre o site; com desvio, o site do desvio em Desvios (spec 2026-11-26 §7)', async () => {
        servir({ [`GET ${B}/sites`]: SITES, [`GET ${B}/desvios`]: { desvios: [{ id: 'd9', site_id: 's2', tipo: 'ativo_novo', situacao: 'aberto' }] } });
        ir('/ot?ot=relatorios');
        S.otPedido = { tela: 'site', site: 's2' };
        await abrir();
        expect([S.otTela, S.otSite, S.otPedido]).toEqual(['site', 's2', null]);
        S.otPedido = { desvio: 'd9' };
        await abrir();
        expect([S.otTela, S.otSite, S.otModo, S.otSub]).toEqual(['site', 's2', 'operacao', 'desvios']);
    });
    it('otTela("acessos") para client cai no Início', async () => {
        S.user = { id: 'u', role: 'client' };
        servir({});
        await window.otTela('acessos'); await abrir();
        expect(S.otTela).toBe('inicio');
    });
    it('?ot=assessment e ?ot=acessos (quem edita) desenham a própria tela', async () => {
        servir({ [`GET ${B}/assessment`]: { resumo: {}, itens: [] } });
        ir('/ot?ot=assessment');
        await abrir();
        expect(el('h').textContent).toBe('Assessment RO-CB.BR.01');
        S.otTela = null; ir('/ot?ot=acessos');
        await abrir();
        expect(el('h').textContent).toBe('Acessos e sondas');
    });
    it('trocar de site pela otTela limpa lote e levantamento do site anterior', async () => {
        S.otTela = 'site'; S.otSite = 's1'; S.otLote = 'x'; S.otLevantamento = 'l1';
        await window.otTela('site', 's2');
        expect([S.otSite, S.otLote, S.otLevantamento]).toEqual(['s2', null, null]);
    });
    it('trocar de site pela otTela limpa o filtro de zona do site anterior', async () => {
        S.otTela = 'site'; S.otSite = 's1'; S.otZona = 'z1';
        await window.otTela('site', 's2');
        expect(S.otZona).toBeNull();
    });
    it('otIrParaLote abre o site na sub-aba Lote de aprovação com o lote, depois do zerar', async () => {
        S.otLote = 'velho';
        await window.otIrParaLote('s2', 'x9');
        expect([S.otTela, S.otSite, S.otModo, S.otSub, S.otLote]).toEqual(['site', 's2', 'projeto', 'aprovacao', 'x9']);
        expect(window.render).toHaveBeenCalled();
    });
    it('deep link /ot/desvios/<id>: abre o site do desvio em Operação, sub Desvios', async () => {
        servir({ [`GET ${B}/sites`]: SITES, [`GET ${B}/desvios`]: { desvios: [{ id: 'd9', site_id: 's2', tipo: 'ativo_novo', situacao: 'aberto' }] } });
        ir('/ot/desvios/d9');
        await abrir();
        expect([S.otTela, S.otSite, S.otModo, S.otSub]).toEqual(['site', 's2', 'operacao', 'desvios']);
        expect(el('c').querySelector('[aria-current="true"]')).toBeTruthy();
    });
    it('deep link de desvio que não existe: aviso e Início', async () => {
        const toast = vi.spyOn(ui, 'showToast').mockImplementation(() => {});
        servir({ [`GET ${B}/sites`]: SITES, [`GET ${B}/desvios`]: { desvios: [] } });
        ir('/ot/desvios/zz');
        await abrir();
        expect(toast).toHaveBeenCalledWith('Desvio não encontrado neste projeto', 'error');
        expect(S.otTela).toBe('inicio');
    });
    describe('deep link de desvio de outro projeto', () => {
        const B2 = '/api/v1/projects/p2/ot';
        beforeEach(() => {
            S.projects = [{ id: 'p9', modulos: ['ot'] }, { id: 'p1', modulos: ['iso'] }, { id: 'p2', modulos: ['ot'] }];
            S.user = { id: 'u', role: 'platform_admin' };
        });
        it('o desvio está em p2: troca o projeto ativo e abre Desvios', async () => {
            servir({ [`GET ${B}/desvios`]: { desvios: [] }, [`GET ${B2}/desvios`]: { desvios: [{ id: 'd1', site_id: 's2', situacao: 'aberto' }] },
                [`GET ${B2}/sites`]: SITES });
            ir('/ot/desvios/d1');
            await abrir();
            expect(S.activeProject.id).toBe('p2');
            expect(S.currentProject.id).toBe('p2');
            expect(JSON.parse(localStorage.getItem('niso_activeProject')).id).toBe('p2');
            expect([S.otTela, S.otSite, S.otModo, S.otSub]).toEqual(['site', 's2', 'operacao', 'desvios']);
        });
        it('nenhum projeto tem o desvio: aviso e Início, projeto ativo intacto', async () => {
            const toast = vi.spyOn(ui, 'showToast').mockImplementation(() => {});
            servir({ [`GET ${B}/desvios`]: { desvios: [] }, [`GET ${B2}/desvios`]: { desvios: [] }, [`GET ${B}/sites`]: SITES });
            ir('/ot/desvios/d1');
            await abrir();
            expect(toast).toHaveBeenCalledWith('Desvio não encontrado neste projeto', 'error');
            expect(S.otTela).toBe('inicio');
            expect(S.activeProject.id).toBe('p9');
        });
    });
});
