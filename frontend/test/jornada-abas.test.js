// Prontidão é aba da Jornada (onda 4, PR2). O endereço antigo (certification) abre a aba; o menu leva ao plano de trabalho.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, baixarArquivo: vi.fn(), API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/project.js';
import '../src/views/monitor.js';
import '../src/views/bancada.js';
import '../src/views/prontidao.js';
import '../src/views/jornada.js';
import { navigate } from '../src/router.js';
import { initDelegation } from '../src/delegation.js';
import catalogo from '../../contracts/bancada/catalogo.json';
import bancada from '../../contracts/bancada/bancada.json';
import passoJson from '../../contracts/bancada/passo.json';

const PROJ = { id: 'p1', client_name: 'Cliente Ficticio', project_name: 'Adequação', modulos: ['iso'] };
const PRONTIDAO = { visao: 'equipe', veredito: { tom: 'semana', rotulo: 'Estágio 1 pendente', frase: 'Faltam 3 itens.', apoio: '' },
    indicador: { implementados: 31, aplicaveis: 90, texto: '31 de 90 controles aplicáveis implementados' }, criterios: [], faltam: [], do_cliente: [], certificacao: null };
const montar = () => { document.body.innerHTML = '<h1 id="header-title"></h1><div id="header-actions"></div><div id="content"></div><div class="sidebar-nav" id="nav-project"></div>'; };

beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation(async (m, url) => {
        if (url === '/api/v1/projects/p1/bancada') return bancada;
        if (url === '/api/v1/passos/catalogo') return catalogo;
        if (url === '/api/v1/projects/p1/prontidao') return PRONTIDAO;
        if (/\/passos\/p3_\d$/.test(url)) return passoJson;
        return [];
    });
    S.user = { id: 'u1', role: 'consultor' };
    S.activeProject = PROJ; S.currentProject = PROJ; S.projects = [PROJ];
    S.passosCatalogo = null; S.bancadaAlvo = null; S.jornadaAba = undefined;
    window.ehEquipeNess = () => true;
    globalThis.updateActiveProjectWidget = vi.fn(); globalThis.updateHeaderUser = vi.fn();
    history.replaceState(null, '', '/iso');
});

initDelegation();
const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('abas da Jornada', () => {
    it('o menu abre o plano de trabalho, com a aba selecionada', async () => {
        montar();
        navigate('project-detail');
        await esperar(); await esperar();
        expect(S.jornadaAba).toBe('trabalho');
        expect(document.querySelector('[role=tab][aria-selected=true]').textContent).toBe('Plano de trabalho');
        expect(document.getElementById('bancada-topo')).not.toBeNull();
    });
    it('o endereço antigo da Prontidão (certification) abre a aba Prontidão e destaca a Jornada', async () => {
        montar();
        navigate('certification');
        await esperar(); await esperar();
        expect(S.view).toBe('project-detail');
        expect(S.jornadaAba).toBe('prontidao');
        expect(document.querySelector('[role=tab][aria-selected=true]').textContent).toBe('Prontidão para certificar');
        expect(document.getElementById('content').textContent).toContain('31 de 90 controles aplicáveis implementados');
        expect(document.getElementById('nav-project').classList.contains('active')).toBe(true);
    });
    it('trocar de aba não navega: só redesenha, e a aba fica até a próxima navegação', async () => {
        montar();
        navigate('project-detail');
        await esperar(); await esperar();
        document.querySelector('[data-action="jornadaAba"][data-args=\'["prontidao"]\']').click();
        await esperar(); await esperar();
        expect(S.jornadaAba).toBe('prontidao');
        expect(document.getElementById('content').textContent).toContain('Estágio 1 pendente');
        navigate('project-detail');
        expect(S.jornadaAba).toBe('trabalho');
    });
    it('o cliente vê as duas abas (a Prontidão já era dele)', async () => {
        S.user = { id: 'u2', role: 'org_user' };
        montar();
        navigate('certification');
        await esperar(); await esperar();
        expect([...document.querySelectorAll('[role=tab]')].map((b) => b.textContent)).toEqual(['Plano de trabalho', 'Prontidão para certificar']);
    });
    it('teclado: seta move entre as abas (tablist)', async () => {
        montar();
        navigate('project-detail');
        await esperar(); await esperar();
        document.getElementById('jornada-aba-trabalho').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await esperar(); await esperar();
        expect(S.jornadaAba).toBe('prontidao');
        expect(document.getElementById('jornada-aba-prontidao').getAttribute('aria-selected')).toBe('true');
    });
});
