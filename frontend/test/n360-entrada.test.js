// Entrada no n.360 (initApp): quem só tem um módulo vai direto a ele; quem tem os dois vê o início; sem módulo nenhum, a
// tela sem acesso. Domínio antigo redireciona antes de tudo. api() e router dublados; irPara dublado (jsdom não navega).
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));
vi.mock('../src/produto.js', async (original) => {
    const real = await original();
    return { ...real, irPara: vi.fn(), destinoLegado: vi.fn(async () => null) };
});

import { S } from '../src/state.js';
import { navigate } from '../src/router.js';
import { irPara, destinoLegado } from '../src/produto.js';

const montar = () => { document.body.innerHTML = '<div id="login-overlay"></div><h1 id="header-title"></h1><div id="content"></div>'; };

beforeAll(async () => {
    vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
    montar();
    await import('../src/globals.js');
});

let projetos;
let papel;
beforeEach(() => {
    vi.useFakeTimers();
    montar();
    navigate.mockClear();
    irPara.mockClear();
    destinoLegado.mockImplementation(async () => null);
    papel = { role: 'consultor' };
    S.token = 'tok';
    S.user = null;
    S.activeProject = null;
    S.projects = [];
    projetos = [];
    apiMock.mockReset();
    apiMock.mockImplementation(async (metodo, url) => {
        if (url === '/api/v1/auth/me') return { user: { id: 'u1', email: 'a@b.c', ...papel } };
        if (url === '/api/v1/legal/pending') return { pendentes: [], bloqueia: false, avisa: false };
        if (url === '/api/v1/projects') return projetos;
        return [];
    });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); history.replaceState(null, '', '/'); });

describe('initApp no n.360', () => {
    it('todos os projetos só com n.iso: vai direto a /iso', async () => {
        projetos = [{ id: 'p1', modulos: ['iso'] }, { id: 'p2' }];
        await window.initApp();
        expect(irPara).toHaveBeenCalledWith('/iso', true);
        expect(navigate).not.toHaveBeenCalled();
    });
    it('todos só com n.privacy: vai direto a /privacy', async () => {
        projetos = [{ id: 'p1', modulos: ['privacy'] }];
        await window.initApp();
        expect(irPara).toHaveBeenCalledWith('/privacy', true);
    });
    it('os dois módulos entre os projetos: abre o início', async () => {
        projetos = [{ id: 'p1', modulos: ['iso'] }, { id: 'p2', modulos: ['privacy'] }];
        await window.initApp();
        expect(irPara).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('inicio');
        expect(S.projects.map((p) => p.id)).toEqual(['p1', 'p2']);
    });
    it('cliente: a regra vale sobre o projeto dele', async () => {
        papel = { role: 'client', client_project_id: 'p2' };
        projetos = [{ id: 'p2', modulos: ['iso', 'privacy'] }];
        await window.initApp();
        expect(navigate).toHaveBeenCalledWith('inicio');
        projetos = [{ id: 'p2', modulos: ['privacy'] }];
        navigate.mockClear();
        await window.initApp();
        expect(irPara).toHaveBeenCalledWith('/privacy', true);
    });
    it('cliente sem projeto com módulo: sem acesso, com o texto do n.360', async () => {
        papel = { role: 'org_admin' };
        await window.initApp();
        expect(irPara).not.toHaveBeenCalled();
        expect(document.getElementById('content').textContent).toContain('nenhum módulo do n.360');
    });
    it('equipe da ness. sem projeto ainda: vai ao n.iso, onde está o comercial (não fica trancada fora)', async () => {
        papel = { role: 'platform_admin' };
        await window.initApp();
        expect(irPara).toHaveBeenCalledWith('/iso', true);
    });
    it('stakeholder continua indo aos pedidos dele', async () => {
        papel = { role: 'stakeholder' };
        await window.initApp();
        expect(navigate).toHaveBeenCalledWith('meus-pedidos');
        expect(irPara).not.toHaveBeenCalled();
    });
});

describe('initApp num módulo', () => {
    it('/iso com projeto: dashboard, como sempre', async () => {
        history.replaceState(null, '', '/iso');
        projetos = [{ id: 'p1', modulos: ['iso', 'privacy'] }, { id: 'p2', modulos: ['privacy'] }];
        await window.initApp();
        expect(navigate).toHaveBeenCalledWith('dashboard');
        expect(S.projects.map((p) => p.id)).toEqual(['p1']);
    });
    it('/iso de cliente sem projeto com n.iso: sem acesso', async () => {
        history.replaceState(null, '', '/iso');
        papel = { role: 'org_user' };
        projetos = [{ id: 'p2', modulos: ['privacy'] }];
        await window.initApp();
        expect(document.getElementById('content').textContent).toContain('Você não tem acesso ao n.iso');
    });
});

describe('domínio antigo', () => {
    it('redireciona antes de pedir qualquer coisa à API', async () => {
        destinoLegado.mockImplementation(async () => 'https://n360.ness.com.br/iso');
        await window.initApp();
        expect(irPara).toHaveBeenCalledWith('https://n360.ness.com.br/iso', true);
        expect(apiMock).not.toHaveBeenCalled();
    });
});
