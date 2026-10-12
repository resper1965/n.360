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

beforeEach(() => {
    apiMock.mockReset();
    S.currentProject = null; S.activeProject = null;
    history.replaceState(null, '', '/iso');
});

describe('renderMonitor', () => {
    it('usa /projects do módulo, como o Dashboard, e não /portfolio', async () => {
        apiMock.mockImplementation(async (m, url) => {
            if (url === '/api/v1/projects') return [{ id: 'p1', project_name: 'Adequação', modulos: ['iso'] }];
            if (url === '/api/v1/projects/p1/phases') return [{ phase_number: 1, status: 'completed' }, { phase_number: 2, status: 'pending' }];
            return [];
        });
        const [c, h, a] = tela();
        await window.renderMonitor(c, h, a);
        expect(apiMock.mock.calls.map(([, u]) => u)).not.toContain('/api/v1/portfolio');
        expect(c.textContent).not.toContain('Nenhum projeto');
        expect(c.textContent).toContain('1 / 2');
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
    });
});
