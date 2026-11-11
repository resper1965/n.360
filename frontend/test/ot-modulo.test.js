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
        S.otAba = 'catalogo';
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
