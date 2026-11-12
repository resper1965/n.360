// n.ot (spec 2026-10-30-n-ot-modulo-n360-design, N1): o terceiro módulo do n.360 em /ot. Casca, item do menu (projeto E pessoa
// com o módulo), a tela do catálogo RO-CB.BR.01 e a concessão sempre explícita (P0-1). api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import html from '../login.html?raw';
import { produtoAtual, aplicarCasca, enderecoDoProduto, atualizarItemOt, moduloPara, pedidoDoHub, TELAS_DOS_MODULOS, NAV_DO_HUB } from '../src/produto.js';
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
        expect(visiveis()).toEqual(['nav-ot', 'nav-ot-inicio', 'nav-ot-sites', 'nav-ot-assessment', 'nav-ot-relatorios', 'nav-ot-acessos']);
        expect(document.title).toMatch(/^n\.ot \| ness\./);
        expect(el('sidebar-logo-mark').textContent).toBe('n.ot');
        expect(el('sidebar-logo-mark').innerHTML).toContain('var(--accent)');
    });
    it('o item do menu diz n.ot (ponto em accent) e é do hub, não dos outros módulos', () => {
        montarApp();
        expect(el('nav-ot').textContent.trim()).toBe('n.ot');
        expect(el('nav-ot').querySelector('.pn-ponto').textContent).toBe('.');
        expect(NAV_DO_HUB).toContain('nav-ot');
        for (const p of ['iso', 'privacy']) {
            aplicarCasca(p);
            expect(visiveis(), p).not.toContain('nav-ot');
        }
    });
});

describe('item n.ot: projeto E pessoa com o módulo', () => {
    it('some sem projeto, com projeto sem o ot e com pessoa sem o ot; aparece com os dois', () => {
        montarApp();
        atualizarItemOt();
        expect(el('nav-ot').hidden).toBe(true);
        S.activeProject = { id: 'a', modulos: ['iso', 'privacy'] };
        atualizarItemOt();
        expect(el('nav-ot').hidden).toBe(true);
        S.activeProject = { id: 'b', modulos: ['iso', 'ot'] };
        S.user = { role: 'consultor', modulos: ['iso', 'privacy'] };
        atualizarItemOt();
        expect(el('nav-ot').hidden).toBe(true);
        S.user = { role: 'consultor', modulos: ['ot'] };
        atualizarItemOt();
        expect(el('nav-ot').hidden).toBe(false);
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

describe('tela do catálogo RO-CB.BR.01', () => {
    // Corpo de GET /api/v1/projects/:projectId/ot/requisitos (src/routes/ot.ts).
    const req = (codigo, titulo, prazo_meses) => ({ id: `ons-${codigo}`, framework: 'ONS-RO-CB.BR.01', codigo, titulo, descricao: 'd', categoria: 'c', versao: 'Rev.00', prazo_meses });
    const abrir = async () => {
        document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
        S.otProjeto = S.activeProject?.id; S.otTela = 'assessment';
        await window.renderOt(el('c'), el('h'), el('a'));
    };
    it('lista código, título e prazo (18, 27 ou sem prazo), tudo escapado, do projeto ativo', async () => {
        S.activeProject = { id: 'p9', modulos: ['ot'] };
        const f = servir({ 'GET /api/v1/projects/p9/ot/requisitos': { requisitos: [req('4.1.1', 'Zonas <b id="x">x</b>', 18), req('4.3.1', 'Inventário', 27), req('5.1.1', 'Exceções', null)] } });
        await abrir();
        expect(f.mock.calls.map((c) => new URL(c[0], 'http://x').pathname)).toContain('/api/v1/projects/p9/ot/requisitos');
        expect([...el('c').querySelectorAll('th')].map((t) => t.textContent)).toEqual(['Código', 'Requisito', 'Prazo']);
        const linhas = [...el('c').querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()));
        expect(linhas).toEqual([['4.1.1', 'Zonas <b id="x">x</b>', '18 meses'], ['4.3.1', 'Inventário', '27 meses'], ['5.1.1', 'Exceções', 'Sem prazo']]);
        expect(el('x')).toBeNull();
        expect(el('c').textContent).toContain('RO-CB.BR.01 Rev.00');
    });
    it('catálogo vazio: estado vazio, não tabela', async () => {
        S.activeProject = { id: 'p9', modulos: ['ot'] };
        servir({ 'GET /api/v1/projects/p9/ot/requisitos': { requisitos: [] } });
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
    const NAV = ['inicio', 'sites', 'assessment', 'relatorios', 'acessos'].map((t) => `<div id="nav-ot-${t}"></div>`).join('');
    const abrir = () => { document.body.innerHTML = `<h1 id="h"></h1><div id="a"></div><div id="c"></div>${NAV}`; return window.renderOt(el('c'), el('h'), el('a')); };
    const SITES = { sites: [{ id: 's1', nome: 'SE Norte' }, { id: 's2', nome: 'SE Sul' }] };
    beforeEach(() => {
        S.activeProject = { id: 'p9', modulos: ['ot'] }; S.user = { id: 'u', role: 'consultor' };
        S.otProjeto = 'p9'; S.otTela = null; S.otSite = null; S.otModo = null; S.otSub = null; S.otLote = null; S.otLevantamento = null; S.otDesvioFiltro = null;
        window.render = vi.fn();
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
    it('trocar de projeto zera site, subtela e modo', async () => {
        servir({});
        S.otTela = 'site'; S.otSite = 's1'; S.otModo = 'operacao'; S.otSub = 'desvios';
        S.activeProject = { id: 'p8', modulos: ['ot'] };
        ir('/ot');
        await abrir();
        expect([S.otSite, S.otModo, S.otSub]).toEqual([null, 'projeto', null]);
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
    it('otTela("acessos") para client cai no Início', async () => {
        S.user = { id: 'u', role: 'client' };
        servir({});
        await window.otTela('acessos'); await abrir();
        expect(S.otTela).toBe('inicio');
    });
    it('?ot=assessment e ?ot=acessos (quem edita) desenham a própria tela', async () => {
        servir({ [`GET ${B}/requisitos`]: { requisitos: [] } });
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
