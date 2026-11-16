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
    localStorage.removeItem('niso_activeProject');
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

describe('initApp no n.360: sempre o Início, sem escolher projeto nem redirecionar', () => {
    it.each([
        ['só com n.iso', [{ id: 'p1', modulos: ['iso'] }, { id: 'p2' }]],
        ['só com n.privacy', [{ id: 'p1', modulos: ['privacy'] }]],
        ['com os dois', [{ id: 'p1', modulos: ['iso'] }, { id: 'p2', modulos: ['privacy'] }]],
    ])('projetos %s: o Início, nada de ir ao módulo', async (_, lista) => {
        projetos = lista;
        await window.initApp();
        expect(navigate).toHaveBeenCalledWith('inicio');
        expect(irPara).not.toHaveBeenCalled();
    });
    it('a equipe entra sem projeto: o boot não aplica nem grava o lembrado', async () => {
        projetos = [{ id: 'p1', modulos: ['iso'] }, { id: 'p2', modulos: ['privacy'] }];
        await window.initApp();
        expect(S.activeProject).toBeNull();
        expect(localStorage.getItem('niso_activeProject')).toBeNull();
    });
    it('cliente: o Início também com um módulo só; o projeto dele segue lembrado para os módulos', async () => {
        papel = { role: 'client', client_project_id: 'p2' };
        projetos = [{ id: 'p2', modulos: ['privacy'] }];
        await window.initApp();
        expect(navigate).toHaveBeenCalledWith('inicio');
        expect(irPara).not.toHaveBeenCalled();
        expect(JSON.parse(localStorage.getItem('niso_activeProject')).id).toBe('p2');
    });
    it('cliente sem projeto nenhum: vai ao Início, sem redirecionar (o texto "a quem pedir acesso" é coberto em painel-view.test.js)', async () => {
        papel = { role: 'org_admin' };
        await window.initApp();
        expect(navigate).toHaveBeenCalledWith('inicio');
        expect(irPara).not.toHaveBeenCalled();
    });
    it('lista de projetos que falha não vira "zero projetos" (sem entrada guiada por engano)', async () => {
        S.totalProjetos = 0;
        apiMock.mockImplementation(async () => { throw new Error('503'); });
        await window.loadProjects();
        expect(S.totalProjetos).toBeUndefined();
        expect(S.projects).toEqual([]);
    });
    it('equipe da ness. sem projeto ainda: vai ao Início, sem redirecionar (o "Novo projeto" é coberto em painel-view.test.js)', async () => {
        papel = { role: 'platform_admin' };
        await window.initApp();
        expect(navigate).toHaveBeenCalledWith('inicio');
        expect(irPara).not.toHaveBeenCalled();
    });
    it('projeto lembrado no storage: o seletor nunca o vê como ativo no Início (nem o do cliente), mas ele segue oferecido', async () => {
        projetos = [{ id: 'p1', modulos: ['iso'] }, { id: 'p2', modulos: ['iso'] }];
        for (const eCliente of [false, true]) {
            papel = eCliente ? { role: 'org_admin', client_project_id: 'p2' } : { role: 'consultor' };
            S.activeProject = projetos[1]; // hidratado do storage pelo state
            localStorage.setItem('niso_activeProject', JSON.stringify(projetos[1]));
            const orig = window.updateSidebarProjectSelector;
            const vistos = [];
            window.updateSidebarProjectSelector = vi.fn(() => { vistos.push(S.activeProject); });
            try { await window.initApp(); } finally { window.updateSidebarProjectSelector = orig; }
            expect(vistos.length).toBeGreaterThan(0);
            expect(vistos.every((v) => v === null), `cliente=${eCliente}`).toBe(true);
            expect(JSON.parse(localStorage.getItem('niso_activeProject')).id).toBe('p2');
        }
    });
    it('num módulo o projeto lembrado continua sendo o ativo', async () => {
        projetos = [{ id: 'p1', modulos: ['iso'] }, { id: 'p2', modulos: ['iso'] }];
        history.replaceState(null, '', '/iso');
        S.activeProject = projetos[1];
        await window.initApp();
        expect(S.activeProject && S.activeProject.id).toBe('p2');
    });
    it('stakeholder continua indo aos pedidos dele', async () => {
        papel = { role: 'stakeholder' };
        await window.initApp();
        expect(navigate).toHaveBeenCalledWith('meus-pedidos');
        expect(irPara).not.toHaveBeenCalled();
    });
});

describe('initApp no n.360 com ?tela= (vindo do rodapé de um módulo)', () => {
    const comMenu = () => {
        document.body.insertAdjacentHTML('beforeend', ['projects', 'users', 'organizacoes', 'api-keys', 'conectar-agente']
            .map((t) => `<div class="sidebar-nav" id="nav-${t}"></div>`).join(''));
    };
    it('abre a tela pedida mesmo com um módulo só (não volta ao módulo) e limpa o endereço', async () => {
        comMenu();
        papel = { role: 'consultor' };
        projetos = [{ id: 'p1', modulos: ['iso'] }];
        history.replaceState(null, '', '/?tela=users');
        await window.initApp();
        expect(irPara).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('users');
        expect(location.search).toBe('');
    });
    it('platform_admin sem projeto ainda chega às organizações', async () => {
        comMenu();
        papel = { role: 'platform_admin' };
        history.replaceState(null, '', '/?tela=organizacoes');
        await window.initApp();
        expect(irPara).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('organizacoes');
    });
    it('tela fora da lista ou que o papel não vê: segue a entrada normal', async () => {
        comMenu();
        projetos = [{ id: 'p1', modulos: ['iso'] }];
        history.replaceState(null, '', '/?tela=soa');
        await window.initApp();
        expect(navigate).toHaveBeenCalledWith('inicio');
        expect(location.search).toBe('');
        navigate.mockClear();
        history.replaceState(null, '', '/?tela=api-keys'); // consultor não vê Chaves de API
        await window.initApp();
        expect(navigate).toHaveBeenCalledWith('inicio');
        expect(irPara).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalledWith('api-keys');
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
