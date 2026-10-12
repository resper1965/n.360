// Casca (onda 1): a tela de entrada escondida sai da árvore de acessibilidade e do Tab; a barra lateral responde a Enter e
// Espaço. Mesmo preâmbulo de globals-shell.test.js: o módulo roda `initApp()` no import, então o overlay tem de existir antes.
import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../src/api.js', () => ({ api: vi.fn(async () => ([])), API_BASE: 'http://api.test' }));

import { S } from '../src/state.js';
import { initDelegation } from '../src/delegation.js';

beforeAll(async () => {
    vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
    document.body.innerHTML = '<div id="login-overlay" class="hidden"></div>';
    await import('../src/globals.js');
    initDelegation();
});

const montar = () => {
    document.body.innerHTML = `<div id="login-overlay"><h1>Entrada</h1></div>
        <nav class="sidebar" id="sidebar"><div class="sidebar-nav" id="nav-x" role="link" tabindex="0" data-action="__casca" data-args='["x"]'>X</div>
        <div role="button" tabindex="0" class="sidebar-label collapsed" data-action="__casca" data-args='["g"]'>G</div></nav>
        <main class="main"><h1 id="header-title">T</h1></main>`;
};

describe('tela de entrada', () => {
    it('escondida: inert e aria-hidden; o app volta a ser alcançável', () => {
        montar();
        window.mostrarEntrada(false);
        const o = document.getElementById('login-overlay');
        expect(o.classList.contains('hidden')).toBe(true);
        expect(o.hasAttribute('inert')).toBe(true);
        expect(o.getAttribute('aria-hidden')).toBe('true');
        expect(document.getElementById('sidebar').hasAttribute('inert')).toBe(false);
        expect(document.querySelector('main').hasAttribute('inert')).toBe(false);
    });
    it('à mostra: sem inert; o app por baixo fica inert (um h1 por tela)', () => {
        montar();
        window.mostrarEntrada(false);
        window.mostrarEntrada(true);
        const o = document.getElementById('login-overlay');
        expect(o.classList.contains('hidden')).toBe(false);
        expect(o.hasAttribute('inert')).toBe(false);
        expect(o.hasAttribute('aria-hidden')).toBe(false);
        expect(document.getElementById('sidebar').hasAttribute('inert')).toBe(true);
        expect(document.querySelector('main').hasAttribute('inert')).toBe(true);
    });
});

describe('teclado na barra lateral', () => {
    it('Enter e Espaço acionam o item e o rótulo; outra tecla não', () => {
        montar();
        const chamadas = [];
        window.__casca = (a) => chamadas.push(a);
        const tecla = (el, key) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        const item = document.getElementById('nav-x');
        const rotulo = document.querySelector('.sidebar-label');
        tecla(item, 'Enter');
        tecla(rotulo, ' ');
        tecla(item, 'a');
        expect(chamadas).toEqual(['x', 'g']);
        S.user = null;
    });
});
