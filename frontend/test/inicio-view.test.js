// Início do n.360: um cartão por módulo habilitado no projeto ativo, "Abrir" vai ao caminho do módulo, e o painel de ponto
// de partida com os dois blocos. api() REAL, só o fetch dublado; irPara dublado (jsdom não navega).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));
vi.mock('../src/produto.js', async (original) => ({ ...(await original()), irPara: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { irPara } from '../src/produto.js';
import { renderInicio } from '../src/views/inicio.js';

const PONTO = {
    cadastro: { tratamentos: 2, documentos_vigentes: 1, evidencias_validas: 1, itens: 1, treinamentos_concluidos: 1 },
    cobertura: [{ fonte: 'lgpd', total: 20, cobertos: 7 }],
    iso_ajudados: [{ referencia: 'A.5.9', titulo: 'Inventário', por: ['art. 37'] }],
};
const el = (id) => document.getElementById(id);
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
const cartoes = () => [...document.querySelectorAll('[data-action="abrirModulo"]')].map((b) => JSON.parse(b.getAttribute('data-args'))[0]);
const abrir = async () => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    await renderInicio(el('c'), el('h'), el('a'));
};

beforeEach(() => { S.token = 'tok'; S.user = { role: 'consultor' }; S.projects = []; S.activeProject = null; S.currentProject = null; window.render = vi.fn(); irPara.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('renderInicio', () => {
    it('projeto com os dois módulos: dois cartões, título n.360, nome escapado e o painel com os dois blocos', async () => {
        S.activeProject = { id: 'p9', project_name: '<b>Acme</b>', modulos: ['iso', 'privacy'] };
        const f = servir({ 'GET /api/v1/projects/p9/ponto-de-partida': PONTO });
        await abrir();
        expect(el('h').textContent).toBe('n.360');
        expect(cartoes()).toEqual(['iso', 'privacy']);
        expect(el('c').textContent).toContain('n.iso');
        expect(el('c').textContent).toContain('n.privacy');
        expect(el('c').innerHTML).not.toContain('<b>Acme</b>');
        expect(el('c').textContent).toContain('<b>Acme</b>');
        await vi.waitFor(() => expect(el('c').textContent).toContain('Cobertura LGPD: 7 de 20'));
        expect(el('c').textContent).toContain('A privacidade já adianta estes controles');
        expect(chamadas(f)).toContain('GET /api/v1/projects/p9/ponto-de-partida');
    });
    it('só os módulos habilitados no projeto', async () => {
        S.activeProject = { id: 'p9', modulos: ['privacy'] };
        servir({ 'GET /api/v1/projects/p9/ponto-de-partida': PONTO });
        await abrir();
        expect(cartoes()).toEqual(['privacy']);
    });
    it('sem projeto ativo usa o primeiro da lista e o deixa ativo', async () => {
        S.projects = [{ id: 'p1', modulos: ['iso'] }, { id: 'p2', modulos: ['iso', 'privacy'] }];
        servir({ 'GET /api/v1/projects/p1/ponto-de-partida': PONTO });
        await abrir();
        expect(S.activeProject.id).toBe('p1');
        expect(cartoes()).toEqual(['iso']);
    });
    it('sem projeto: diz isso, sem cartão e sem chamar a API', async () => {
        const f = servir({});
        await abrir();
        expect(cartoes()).toEqual([]);
        expect(el('c').textContent).toContain('Nenhum projeto');
        expect(f).not.toHaveBeenCalled();
    });
});

describe('abrirModulo', () => {
    it('vai ao caminho do módulo; módulo desconhecido não faz nada', () => {
        window.abrirModulo('iso');
        expect(irPara).toHaveBeenCalledWith('/iso');
        window.abrirModulo('privacy');
        expect(irPara).toHaveBeenLastCalledWith('/privacy');
        irPara.mockClear();
        window.abrirModulo('https://evil.example');
        expect(irPara).not.toHaveBeenCalled();
    });
});
