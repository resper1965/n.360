// A grade etapa × fase saiu do Monitor (onda 4, PR1) e vive no topo da Jornada. Situação em texto (legenda, rótulo, dica), nunca só cor.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, baixarArquivo: vi.fn(), API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/project.js';
import '../src/views/monitor.js';
import '../src/views/bancada.js';
import { htmlDaGrade } from '../src/bancada/grade.js';
import catalogo from '../../contracts/bancada/catalogo.json';
import bancada from '../../contracts/bancada/bancada.json';
import passoJson from '../../contracts/bancada/passo.json';

const CAT = { etapas: [{ id: 1, nome: 'Mobilização e diagnóstico', resumo: 'Entrevistas e escopo', fases: [1, 2] }],
    fases: [{ numero: 1, titulo: 'Entrevistas' }, { numero: 2, titulo: 'Escopo <b>x</b>' }] };

describe('htmlDaGrade', () => {
    it('uma linha por etapa, um botão por fase, situação em texto e bloqueio com motivo e responsável', () => {
        document.body.innerHTML = htmlDaGrade(CAT, [{ numero: 1, situacao: 'completed' },
            { numero: 2, situacao: 'blocked', bloqueio: { motivo: 'Aguardando a diretoria', responsavel: 'Maria Souza' } }]);
        expect(document.querySelector('details.bancada-grade summary').textContent).toBe('Fases por etapa');
        expect(document.querySelector('.roadmap-j-name').textContent).toBe('Mobilização e diagnóstico');
        expect(document.querySelector('.roadmap-j-pct').textContent).toBe('1 de 2 fases');
        expect(document.querySelector('.roadmap-legenda').textContent).toContain('Bloqueada');
        const no = document.querySelector('.roadmap-node.blocked');
        expect(no.tagName).toBe('BUTTON');
        expect(no.getAttribute('aria-label')).toBe('Fase 2: Escopo <b>x</b> (Bloqueada: Aguardando a diretoria, responsável Maria Souza)');
        expect(no.dataset.action).toBe('bancadaAbrirFase');
        expect(no.dataset.args).toBe('[2]');
        expect(document.querySelector('.roadmap-node b')).toBeNull(); // título escapado
        expect(document.body.innerHTML).not.toMatch(/style=/);       // CSP: nada de estilo inline
    });
    it('fase sem estado no retrato conta como não iniciada', () => {
        document.body.innerHTML = htmlDaGrade(CAT, []);
        expect([...document.querySelectorAll('.roadmap-node.pending')].length).toBe(2);
        expect(document.querySelector('.roadmap-j-pct').textContent).toBe('0 de 2 fases');
    });
});

describe('a Jornada mostra a grade no topo', () => {
    beforeEach(() => {
        apiMock.mockReset();
        const PROJ = { id: 'p1', client_name: 'Cliente Ficticio', project_name: 'Adequação', modulos: ['iso'] };
        S.user = { id: 'u1', role: 'consultor' };
        S.activeProject = PROJ; S.currentProject = PROJ; S.projects = [PROJ];
        S.passosCatalogo = null; S.bancadaAlvo = null;
        window.ehEquipeNess = () => true;
        apiMock.mockImplementation(async (m, url) => {
            if (url === '/api/v1/projects/p1/bancada') return bancada;
            if (url === '/api/v1/passos/catalogo') return catalogo;
            if (url === '/api/v1/projects/p1/prontidao') return null;
            if (/\/passos\/p3_\d$/.test(url)) return passoJson;
            return [];
        });
    });
    it('o #bancada-topo traz a grade com as etapas do catálogo', async () => {
        document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
        await window.renderProjectDetail(document.getElementById('c'), document.getElementById('h'), document.getElementById('a'));
        const topo = document.getElementById('bancada-topo');
        expect(topo.querySelector('details.bancada-grade')).not.toBeNull();
        expect(topo.textContent).toContain(catalogo.etapas[0].nome);
    });
});
