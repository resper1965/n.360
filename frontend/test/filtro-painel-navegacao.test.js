// Filtro do painel e navegação (router REAL): vale só para a navegação que o trouxe; do n.360 ao módulo vai pelo sessionStorage,
// nunca pelo endereço, e o boot do módulo o devolve (pedidoDoHub). irPara dublado (o jsdom não navega).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/produto.js', async (original) => ({ ...(await original()), irPara: vi.fn() }));

import { navigate } from '../src/router.js';
import { S } from '../src/state.js';
import { irPara, pedidoDoHub } from '../src/produto.js';

const FILTRO = { tela: 'titular', aba: 'pedidos', filtro: 'atrasados' };
const ir = (caminho) => history.replaceState(null, '', caminho);

beforeEach(() => {
    document.body.innerHTML = '<div id="content"></div><h1 id="header-title"></h1><div id="header-actions"></div>';
    for (const nome of ['renderTitular', 'renderTerceiros', 'renderInicio', 'updateActiveProjectWidget', 'updateHeaderUser']) globalThis[nome] = vi.fn();
    irPara.mockClear();
    S.user = { role: 'consultor' };
    S.projects = [{ id: 'pp', modulos: ['privacy'] }];
    S.activeProject = S.projects[0];
    S.titularAba = 'pedidos';
    sessionStorage.clear();
});
afterEach(() => ir('/'));

describe('filtro do painel na navegação', () => {
    it('no módulo: a navegação que o traz o grava; a seguinte o apaga', () => {
        ir('/privacy');
        navigate('titular', { filtroPainel: FILTRO });
        expect(S.filtroPainel).toEqual(FILTRO);
        navigate('terceiros');
        expect(S.filtroPainel).toBe(null);
        navigate('titular');
        expect(S.filtroPainel).toBe(null);
    });

    it('do n.360 ao módulo: a chave vai no sessionStorage, não no endereço, e o boot do módulo a devolve uma vez', () => {
        ir('/');
        navigate('titular', { filtroPainel: FILTRO });
        const destino = irPara.mock.calls.at(-1)[0];
        expect(destino).toBe('/privacy?tela=titular');
        expect(destino).not.toContain('atrasados');
        ir(destino);
        expect(pedidoDoHub()).toEqual({ tela: 'titular', aba: null, filtro: FILTRO });
        expect(sessionStorage.getItem('n360_filtro')).toBe(null);
        expect(location.search).toBe('');
    });

    it('chave adulterada no storage é ignorada', () => {
        sessionStorage.setItem('n360_filtro', JSON.stringify({ tela: 'titular', aba: 'pedidos', filtro: '<img src=x>' }));
        ir('/privacy?tela=titular');
        expect(pedidoDoHub()).toEqual({ tela: 'titular', aba: null });
    });
});
