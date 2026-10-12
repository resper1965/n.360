// Aviso do sino clicado no n.360 (o hub não desenha tela de módulo): o router leva ao módulo certo com `?tela=` e guarda o
// aviso; o boot do módulo (pedidoDoHub) o reabre lá, com a aba, o modal ou o projeto do aviso. Router REAL; irPara dublado
// (o jsdom não navega).
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));
vi.mock('../src/produto.js', async (original) => ({ ...(await original()), irPara: vi.fn() }));

import { S } from '../src/state.js';
import { irPara, pedidoDoHub } from '../src/produto.js';

const VIEWS = ['renderUsers', 'renderTitular', 'renderCAPA', 'renderDocumentos', 'renderEncarregado', 'renderInicio', 'renderProjectDetail', 'updateActiveProjectWidget', 'updateHeaderUser'];
const ISO = { id: 'pi', modulos: ['iso'] };
const PRIV = { id: 'pp', modulos: ['privacy'] };

beforeAll(async () => {
    vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
    document.body.innerHTML = '<div id="login-overlay" class="hidden"></div>';
    await import('../src/globals.js');
});

const clicar = async (aviso) => {
    S.notifications = [{ id: 'n1', read: 0, ...aviso }];
    await window.handleNotificationClick('n1');
};
// O que o módulo faz no boot: lê o pedido do endereço para onde o hub mandou e reabre o aviso.
const chegarNoModulo = async () => {
    history.replaceState(null, '', irPara.mock.calls.at(-1)[0]);
    const pedido = pedidoDoHub();
    expect(pedido).toHaveProperty('aviso');
    await window.abrirAviso(pedido.aviso);
};

beforeEach(() => {
    history.replaceState(null, '', '/');
    for (const nome of VIEWS) globalThis[nome] = vi.fn();
    irPara.mockClear();
    apiMock.mockReset();
    apiMock.mockImplementation(async () => []);
    sessionStorage.clear();
    S.user = { role: 'consultor' };
    S.projects = [ISO, PRIV];
    S.activeProject = null;
    S.titularAba = 'pedidos';
    S.view = 'inicio';
    document.body.innerHTML = '<div id="notif-dropdown"></div><div id="content"></div><h1 id="header-title"></h1><div id="header-actions"></div>';
});
afterEach(() => history.replaceState(null, '', '/'));

describe('aviso clicado no n.360', () => {
    it('incidente de projeto só n.iso: abre o n.iso na aba Incidentes, no projeto do aviso', async () => {
        await clicar({ link: '/projects/pi/incidentes' });
        expect(irPara).toHaveBeenCalledWith('/iso?tela=titular&aba=incidentes');
        expect(globalThis.renderTitular).not.toHaveBeenCalled();
        S.titularAba = 'pedidos'; // a página nova começa do zero
        await chegarNoModulo();
        expect(S.view).toBe('titular');
        expect(S.titularAba).toBe('incidentes');
        expect(S.activeProject).toBe(ISO);
        expect(globalThis.renderTitular).toHaveBeenCalled();
    });

    it('CAPA: abre a tela de CAPA no n.iso', async () => {
        await clicar({ link: '/projects/pi/capa' });
        expect(irPara).toHaveBeenCalledWith('/iso?tela=capa');
        await chegarNoModulo();
        expect(S.view).toBe('capa');
        expect(globalThis.renderCAPA).toHaveBeenCalled();
    });

    it('achado (open_finding): no hub não busca nem abre modal; no n.iso abre o modal da CAPA', async () => {
        vi.useFakeTimers();
        try {
            S.activeProject = ISO;
            window.openEditCAPAModal = vi.fn();
            apiMock.mockImplementation(async (m, url) => (url === '/api/v1/projects/pi/capa' ? [{ id: 'c9', title: 'X' }] : []));
            await clicar({ action_type: 'open_finding', target_id: 'c9' });
            expect(irPara).toHaveBeenCalledWith('/iso?tela=capa');
            expect(apiMock.mock.calls.some((c) => c[1] === '/api/v1/projects/pi/capa')).toBe(false);
            await chegarNoModulo();
            vi.advanceTimersByTime(200);
            expect(S.view).toBe('capa');
            expect(window.openEditCAPAModal).toHaveBeenCalledWith('c9', 'pi', { id: 'c9', title: 'X' });
        } finally { vi.useRealTimers(); }
    });

    it('documento de projeto só n.privacy: abre no n.privacy, um módulo que o projeto tem', async () => {
        await clicar({ link: '/projects/pp/documentos' });
        expect(irPara).toHaveBeenCalledWith('/privacy?tela=documentos');
        await chegarNoModulo();
        expect(S.view).toBe('documentos');
        expect(S.activeProject).toBe(PRIV);
    });

    it('evidência de projeto só n.iso: abre no n.iso', async () => {
        await clicar({ link: '/projects/pi/evidence' });
        expect(irPara).toHaveBeenCalledWith('/iso?tela=evidence');
    });

    it('aviso do projeto sem tela (lista do projeto) de projeto só n.privacy vai ao encarregado, não ao n.iso', async () => {
        await clicar({ link: '/projects/pp' });
        expect(irPara).toHaveBeenCalledWith('/privacy?tela=encarregado');
    });

    it('aviso que leva a tela do hub fica no hub e não guarda nada', async () => {
        await clicar({ link: '/users' });
        expect(irPara).not.toHaveBeenCalled();
        expect(S.view).toBe('users');
        expect(sessionStorage.getItem('n360_aviso')).toBeNull();
    });
});
