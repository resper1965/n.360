// Monitor de Adequação: a lista de projetos sai da MESMA fonte do Dashboard (/projects, filtrada pelo
// módulo). Lia /portfolio e, quando ele vinha vazio, dizia "nenhum projeto ativo" enquanto o Dashboard
// mostrava um projeto em curso.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));

import '../src/ui.js';
import '../src/views/monitor.js';
import { S } from '../src/state.js';

const tela = () => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    return [document.getElementById('c'), document.getElementById('h'), document.getElementById('a')];
};

// Catálogo e estado no formato do contrato (contracts/bancada), só com as fases que o teste usa.
const CATALOGO = { versao: 'v1', etapas: [{ id: 1, nome: 'Mobilização e diagnóstico', resumo: 'Entrevistas e escopo', fases: [1, 2] }],
    fases: [{ numero: 1, etapa: 1, titulo: 'Entrevistas' }, { numero: 2, etapa: 1, titulo: 'Escopo' }], passos: [] };
const bancada = (fases) => ({ tem_fases: true, catalogo_versao: 'v1', fases });
const PRONTIDAO = { indicador: { implementados: 31, aplicaveis: 90, texto: '31 de 90 controles aplicáveis implementados' },
    numeros: { controles: { implementados: 31, aplicaveis: 90 }, riscos: 12, evidencias: 40, fases: { concluidas: 11, total: 41 } } };

beforeEach(() => {
    apiMock.mockReset();
    S.user = { id: 'u1', role: 'consultor' };
    window.ehEquipeNess = () => ['consultor', 'platform_admin'].includes(S.user && S.user.role);
    S.currentProject = null; S.activeProject = null;
    history.replaceState(null, '', '/iso');
});

describe('renderMonitor', () => {
    it('usa /projects do módulo, como o Dashboard, e não /portfolio', async () => {
        apiMock.mockImplementation(async (m, url) => {
            if (url === '/api/v1/projects') return [{ id: 'p1', project_name: 'Adequação', modulos: ['iso'] }];
            if (url === '/api/v1/projects/p1/bancada') return bancada([{ numero: 1, situacao: 'completed' }, { numero: 2, situacao: 'pending' }]);
            if (url === '/api/v1/passos/catalogo') return CATALOGO;
            if (url === '/api/v1/projects/p1/prontidao') return PRONTIDAO;
            return [];
        });
        const [c, h, a] = tela();
        await window.renderMonitor(c, h, a);
        expect(apiMock.mock.calls.map(([, u]) => u)).not.toContain('/api/v1/portfolio');
        expect(c.textContent).not.toContain('Nenhum projeto');
        expect(c.textContent).toContain('1 de 2');
    });

    it('os números vêm da prontidão (os mesmos do Painel): nada de campo que /projects não devolve nem percentual concorrente', async () => {
        apiMock.mockImplementation(async (m, url) => {
            // risk_count e evidence_count no projeto eram lidos e /projects não os devolve: o Monitor mostrava 0.
            if (url === '/api/v1/projects') return [{ id: 'p1', project_name: 'Adequação', modulos: ['iso'], risk_count: 999, evidence_count: 999 }];
            if (url === '/api/v1/projects/p1/bancada') return bancada([{ numero: 1, situacao: 'completed' }, { numero: 2, situacao: 'blocked', bloqueio: { motivo: 'Aguardando a diretoria', responsavel: 'Maria Souza' } }]);
            if (url === '/api/v1/passos/catalogo') return CATALOGO;
            if (url === '/api/v1/projects/p1/prontidao') return PRONTIDAO;
            return [];
        });
        const [c, h, a] = tela();
        await window.renderMonitor(c, h, a);
        const cartoes = Object.fromEntries([...c.querySelectorAll('.monitor-card')].map((k) => [k.querySelector('.monitor-card-title').textContent, k.querySelector('.monitor-card-value').textContent]));
        expect(cartoes).toEqual({ 'Controles aplicáveis implementados': '31 de 90', 'Fases da jornada concluídas': '11 de 41', 'Riscos avaliados': '12', 'Evidências enviadas': '40' });
        expect(c.textContent).not.toContain('999');
        expect(c.textContent).not.toMatch(/Score|\d+%/);
        // A situação das fases vai em texto (legenda e rótulo), não só em cor.
        expect(c.querySelector('.roadmap-legenda').textContent).toContain('Bloqueada');
        expect(c.querySelector('.roadmap-nodes-row .roadmap-node.blocked').getAttribute('aria-label')).toBe('Fase 2: Escopo (Bloqueada: Aguardando a diretoria, responsável Maria Souza)');
        // O nó é botão de verdade, e o Monitor não guarda mais lista própria de etapas.
        expect(c.querySelector('.roadmap-nodes-row .roadmap-node').tagName).toBe('BUTTON');
        expect(c.textContent).toContain('Mobilização e diagnóstico');
    });

    it('cliente não vê as ações de operador; vê a prontidão', async () => {
        S.user = { id: 'u2', role: 'org_user' };
        apiMock.mockImplementation(async (m, url) => {
            if (url === '/api/v1/projects') return [{ id: 'p1', project_name: 'Adequação', modulos: ['iso'] }];
            if (url === '/api/v1/projects/p1/bancada') return bancada([{ numero: 1, situacao: 'completed' }]);
            if (url === '/api/v1/passos/catalogo') return CATALOGO;
            if (url === '/api/v1/projects/p1/prontidao') return PRONTIDAO;
            return [];
        });
        const [c, h, a] = tela();
        await window.renderMonitor(c, h, a);
        expect(a.textContent).toContain('Ver a prontidão');
        expect(a.textContent).not.toMatch(/Abrir a jornada|Exportar|Gerenciar/);
    });

    it('sem projeto no módulo: vazio que diz o critério e oferece a lista de projetos', async () => {
        apiMock.mockResolvedValue([{ id: 'p9', project_name: 'Só privacidade', modulos: ['privacy'] }]);
        const [c, h, a] = tela();
        await window.renderMonitor(c, h, a);
        const vazio = c.querySelector('.empty-state');
        expect(vazio.querySelector('h3').textContent).toBe('Nenhum projeto do n.iso para monitorar');
        expect(vazio.querySelector('.empty-hint').textContent).toMatch(/fases da jornada/);
        expect(vazio.querySelector('[data-action="navigate"]').dataset.args).toBe('["projects"]');
    });
    it('projeto com 0 fases: vazio explicado, sem "0 / 0"', async () => {
        apiMock.mockImplementation(async (m, url) => {
            if (url === '/api/v1/projects') return [{ id: 'p1', project_name: 'Adequação', modulos: ['iso'] }];
            return [];
        });
        const [c, h, a] = tela();
        await window.renderMonitor(c, h, a);
        expect(c.querySelector('.empty-state h3').textContent).toBe('Fases da jornada ainda não carregadas');
        expect(c.textContent).not.toContain('0 / 0');
        // O vazio leva ao primeiro passo real (carregar as fases; a prontidão), nunca à Jornada vazia.
        const acoes = [...c.querySelectorAll('.empty-state button')].map((b) => [b.dataset.action, b.dataset.args]);
        expect(acoes).toEqual([['carregarFases', '["p1"]'], ['navigate', '["certification"]']]);
    });

    it('clicar no nó da fase abre a Bancada naquela fase', () => {
        const navigate = vi.fn();
        window.navigate = navigate;
        window.monitorAbrirFase('p1', 2);
        expect(navigate).toHaveBeenCalledWith('project-detail', { currentProject: { id: 'p1' }, bancadaAlvo: { fase: 2 } });
    });
});
