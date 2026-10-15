// Jornada, Monitor e Prontidão contam a mesma história com o mesmo número (Onda 2 do diagnóstico de 15/10/2026): o indicador
// de progresso é "X de Y controles aplicáveis implementados", lido de GET /projects/:id/prontidao, e nenhuma tela soma no
// cliente nem mostra percentual concorrente. A Jornada é do cliente também: os controles de operador são só da equipe.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, baixarArquivo: vi.fn(), API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/project.js';
import '../src/views/monitor.js';
import { renderProntidao } from '../src/views/prontidao.js';

const PROJ = { id: 'p1', client_name: 'Cliente Ficticio', project_name: 'Adequação', modulos: ['iso'] };
const PRONTIDAO = {
    visao: 'equipe', veredito: { tom: 'semana', rotulo: 'Estágio 1 pendente', frase: 'Faltam 3 itens para o estágio 1.', apoio: '' },
    indicador: { implementados: 31, aplicaveis: 90, texto: '31 de 90 controles aplicáveis implementados' },
    criterios: [], faltam: [], do_cliente: [], certificacao: null,
    numeros: { controles: { implementados: 31, aplicaveis: 90 }, riscos: 12, evidencias: 40, fases: { concluidas: 1, total: 2 } },
};
const FASES = [{ phase_number: 0, title: 'Kickoff', status: 'completed' }, { phase_number: 1, title: 'Escopo', status: 'in_progress' }];
const tela = () => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    return ['c', 'h', 'a'].map((id) => document.getElementById(id));
};
const servir = (fases = FASES) => apiMock.mockImplementation(async (m, url) => {
    if (url === '/api/v1/projects') return [PROJ];
    if (url === '/api/v1/projects/p1/phases') return fases;
    if (url === '/api/v1/projects/p1/prontidao') return PRONTIDAO;
    if (url === '/api/v1/phases/config') return { checklists: {} };
    return [];
});

beforeEach(() => {
    apiMock.mockReset();
    S.user = { id: 'u1', role: 'consultor' };
    S.activeProject = PROJ; S.currentProject = PROJ; S.projects = [PROJ];
    S.checklistsConfig = null; S.phaseQuestions = {}; S.phaseChecks = {};
    S.jornadaStatusFilter = null; S.jornadaCategoryFilter = null; S.jornadaSearchQuery = '';
    window.ehEquipeNess = () => ['consultor', 'platform_admin'].includes(S.user && S.user.role);
    history.replaceState(null, '', '/iso');
});

describe('o mesmo número nas telas', () => {
    it('Jornada, Monitor e Prontidão mostram "31 de 90" para os mesmos dados, sem percentual', async () => {
        servir();
        for (const desenhar of [window.renderProjectDetail, window.renderMonitor, renderProntidao]) {
            const [c, h, a] = tela();
            await desenhar(c, h, a);
            expect(c.textContent, desenhar.name).toContain('31 de 90');
            expect(c.textContent, desenhar.name).toMatch(/controles aplicáveis implementados/i);
            expect(c.textContent, desenhar.name).not.toMatch(/\d+\s?%/);
        }
    });
});

describe('Jornada', () => {
    it('equipe: situação da fase em português, editável; atalho para a prontidão', async () => {
        servir();
        const [c, h, a] = tela();
        await window.renderProjectDetail(c, h, a);
        const sel = c.querySelector('select.phase-status-select');
        expect([...sel.options].map((o) => o.textContent)).toEqual(['Não iniciada', 'Em andamento', 'Concluída', 'Bloqueada', 'Dispensada']);
        expect(c.textContent).not.toMatch(/In Progress|Completed|Pending/);
        expect(c.querySelector('[data-action="navigate"][data-args=\'["certification"]\']')).not.toBeNull();
    });

    it('cliente: lê a situação da fase em texto, sem o seletor de operador', async () => {
        S.user = { id: 'u2', role: 'org_user' };
        servir();
        const [c, h, a] = tela();
        await window.renderProjectDetail(c, h, a);
        expect(c.querySelector('select.phase-status-select')).toBeNull();
        expect([...c.querySelectorAll('.phase-status-texto')].map((x) => x.textContent)).toEqual(['Concluída', 'Em andamento']);
    });

    it('sem fases: a equipe carrega as fases; o cliente vai à prontidão; nunca ao Monitor nem à lista de projetos', async () => {
        servir([]);
        let [c, h, a] = tela();
        await window.renderProjectDetail(c, h, a);
        let acoes = [...c.querySelectorAll('.empty-state button')].map((b) => b.dataset.action + ' ' + b.dataset.args);
        expect(acoes).toEqual(['carregarFases ["p1"]', 'navigate ["certification"]']);
        S.user = { id: 'u2', role: 'org_user' };
        [c, h, a] = tela();
        await window.renderProjectDetail(c, h, a);
        acoes = [...c.querySelectorAll('.empty-state button')].map((b) => b.dataset.action + ' ' + b.dataset.args);
        expect(acoes).toEqual(['navigate ["certification"]']);
    });

    it('carregarFases chama o POST da jornada e reabre a Jornada', async () => {
        const { navigate } = await import('../src/router.js');
        apiMock.mockResolvedValue({ ok: true });
        await window.carregarFases('p1');
        expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/phases');
        expect(navigate).toHaveBeenCalledWith('project-detail');
    });
});
