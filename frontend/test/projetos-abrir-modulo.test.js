// Lista de projetos fora do n.iso (Conta e acessos do n.360): cada projeto abre nos módulos que ele tem E a pessoa tem,
// com o projeto ativo levado junto (localStorage `niso_activeProject`, o mesmo que o state hidrata no outro caminho).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));
vi.mock('../src/produto.js', async (original) => ({ ...(await original()), irPara: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { irPara } from '../src/produto.js';
import { navigate } from '../src/router.js';
import '../src/views/project.js';
import '../src/views/painel.js';

const P = [{ id: 'p1', client_name: 'Alfa', modulos: ['iso', 'privacy'] }, { id: 'p2', client_name: 'Beta', modulos: ['privacy'] }];
const abrir = () => [...document.querySelectorAll('[data-action="abrirProjetoNoModulo"]')].map((b) => [JSON.parse(b.getAttribute('data-args')), b.textContent.trim()]);
async function lista(caminho, user) {
    history.replaceState(null, '', caminho);
    S.user = user;
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    await window.renderProjects(document.getElementById('c'), document.getElementById('h'), document.getElementById('a'));
}

beforeEach(() => {
    irPara.mockClear();
    apiMock.mockReset();
    apiMock.mockImplementation(async (m, url) => (url === '/api/v1/projects' ? P : []));
    S.projects = P;
    S.activeProject = null;
    try { localStorage.clear(); } catch (e) { /* jsdom */ }
});
afterEach(() => history.replaceState(null, '', '/'));

describe('lista de projetos no n.360', () => {
    it('platform_admin: "Abrir no" para cada módulo de cada projeto', async () => {
        await lista('/', { role: 'platform_admin' });
        // p2 tem um só destino: o nome do cliente é o link, sem botão repetido.
        expect(abrir()).toEqual([[['p1', 'iso'], 'Abrir no n.iso'], [['p1', 'privacy'], 'Abrir no n.privacy'], [['p2', 'privacy'], 'Beta']]);
        // Uma ação à vista por linha (o primeiro módulo); o outro destino fica no "Mais ações" da linha.
        const botoes = [...document.querySelectorAll('[data-action="abrirProjetoNoModulo"].btn-secondary')];
        expect(botoes.map((b) => b.textContent)).toEqual(['Abrir no n.iso']);
        expect(document.querySelector('[role="menuitem"][data-action="abrirProjetoNoModulo"]').textContent).toBe('Abrir no n.privacy');
        expect(document.querySelectorAll('tbody .btn-primary')).toHaveLength(0);
        expect(document.querySelector('[data-action="openProjectDetail"]')).toBeNull();
    });
    it('só os módulos que a pessoa também tem', async () => {
        await lista('/', { role: 'consultor', modulos: ['privacy'] });
        expect(abrir().map(([a]) => a)).toEqual([['p1', 'privacy'], ['p2', 'privacy']]);
    });
    it('no n.iso a Jornada segue onde estava e só o outro módulo vira link', async () => {
        await lista('/iso', { role: 'platform_admin' });
        // a lista do n.iso só tem os projetos com n.iso (p2 é só n.privacy)
        expect(abrir().map(([a]) => a)).toEqual([['p1', 'privacy']]);
        expect(document.querySelector('[data-action="openProjectDetail"]')).not.toBeNull();
    });
});

describe('escopo e módulos na lista', () => {
    it('coluna Escopo vem dos módulos: projeto só n.privacy diz LGPD, não ISO', async () => {
        await lista('/', { role: 'platform_admin' });
        const linhas = [...document.querySelectorAll('tbody tr')];
        expect(document.querySelector('thead').textContent).toContain('Escopo');
        expect(document.querySelector('thead').textContent).not.toContain('Fase');
        expect(linhas[0].textContent).toContain('ISO 27001:2022 · LGPD');
        expect(linhas[1].textContent).toContain('LGPD');
        expect(linhas[1].textContent).not.toContain('ISO 27001');
        expect(document.querySelector('.stat-strip')).toBeNull();
    });
    it('"Módulos do projeto" só para a equipe da ness.', async () => {
        window.ehEquipeNess = () => true;
        await lista('/', { role: 'platform_admin' });
        expect(document.querySelector('[data-action="abrirProdutosDoProjeto"]').textContent).toBe('Módulos do projeto');
        window.ehEquipeNess = () => false;
        await lista('/', { role: 'org_admin' });
        expect(document.querySelector('[data-action="abrirProdutosDoProjeto"]')).toBeNull();
        delete window.ehEquipeNess;
    });
});

describe('abrirProjetoNoModulo', () => {
    it('ativa o projeto, guarda para o outro caminho e vai ao módulo', () => {
        S.user = { role: 'platform_admin' };
        window.abrirProjetoNoModulo('p1', 'privacy');
        expect(S.activeProject.id).toBe('p1');
        expect(JSON.parse(localStorage.getItem('niso_activeProject')).id).toBe('p1');
        expect(irPara).toHaveBeenCalledWith('/privacy');
    });
    it('módulo que o projeto ou a pessoa não tem, ou projeto desconhecido: não sai do lugar', () => {
        S.user = { role: 'consultor', modulos: ['privacy'] };
        window.abrirProjetoNoModulo('p1', 'iso');
        window.abrirProjetoNoModulo('p2', 'iso');
        window.abrirProjetoNoModulo('p1', 'n360');
        window.abrirProjetoNoModulo('zz', 'privacy');
        expect(irPara).not.toHaveBeenCalled();
        expect(S.activeProject).toBeNull();
    });
});

describe('trocar o projeto ativo', () => {
    beforeEach(() => { globalThis.updateActiveProjectWidget = vi.fn(); });
    it('no n.360, na lista de projetos, fica nela (projeto só n.privacy não vai ao n.iso)', async () => {
        history.replaceState(null, '', '/');
        S.view = 'projects';
        navigate.mockClear();
        await window.changeActiveProject('p2');
        expect(S.activeProject.id).toBe('p2');
        expect(navigate).toHaveBeenCalledWith('projects');
    });
    it('no Início do n.360 (sem projeto ativo), escolher no seletor é entrar no projeto, no primeiro módulo dele', async () => {
        history.replaceState(null, '', '/');
        S.user = { role: 'consultor', modulos: ['iso', 'privacy'] };
        S.view = 'inicio';
        navigate.mockClear();
        await window.changeActiveProject('p2');
        expect(S.activeProject.id).toBe('p2');
        expect(JSON.parse(localStorage.getItem('niso_activeProject')).id).toBe('p2');
        expect(irPara).toHaveBeenCalledWith('/privacy');
        expect(navigate).not.toHaveBeenCalled();
    });
    it('no n.privacy, da lista, vai ao início do módulo; no n.iso, à certificação (como antes)', async () => {
        S.view = 'projects';
        history.replaceState(null, '', '/privacy');
        navigate.mockClear();
        await window.changeActiveProject('p2');
        expect(navigate).toHaveBeenCalledWith('encarregado');
        S.view = 'projects';
        history.replaceState(null, '', '/iso');
        navigate.mockClear();
        await window.changeActiveProject('p1');
        expect(navigate).toHaveBeenCalledWith('certification');
    });
});
