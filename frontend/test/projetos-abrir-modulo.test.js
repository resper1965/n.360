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
import '../src/views/project.js';

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
        expect(abrir()).toEqual([[['p1', 'iso'], 'Abrir no n.iso'], [['p1', 'privacy'], 'Abrir no n.privacy'], [['p2', 'privacy'], 'Abrir no n.privacy']]);
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
