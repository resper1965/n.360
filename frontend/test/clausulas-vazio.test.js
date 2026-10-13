// Telas de cláusula da ISO/IEC 27001:2022 vazias: o estado vazio lista o que a cláusula pede (4.2, 9.1, 9.3), em
// texto, com a ação principal que a tela já oferece.
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
const itens = (c) => [...c.querySelectorAll('.empty-state .empty-list li')].map((li) => li.textContent);
const acao = (c) => c.querySelector('.empty-state .empty-action [data-action]')?.getAttribute('data-action');

beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue([]);
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p1', modulos: ['iso'] };
    history.replaceState(null, '', '/iso');
});

describe('estados vazios das cláusulas', () => {
    it('4.2: partes interessadas, requisitos delas e quais o SGSI atende', async () => {
        const [c, h, a] = tela();
        await window.renderStakeholders(c, h, a);
        expect(itens(c)).toEqual([
            'As partes interessadas relevantes para o SGSI',
            'Os requisitos relevantes dessas partes interessadas',
            'Quais desses requisitos serão tratados pelo SGSI',
        ]);
        expect(acao(c)).toBe('openStakeholderModal');
    });

    it('9.1: o que medir, métodos, quando e quem, análise e evidência', async () => {
        const [c, h, a] = tela();
        await window.renderMetrics(c, h, a);
        const t = itens(c);
        expect(t.length).toBe(5);
        expect(t[0]).toMatch(/^O que monitorar e medir/);
        expect(t.join(' ')).toMatch(/métodos/);
        expect(t.join(' ')).toMatch(/quem analisa e avalia/);
        expect(t[4]).toMatch(/evidência/);
        expect(acao(c)).toBe('openNewMetricModal');
    });

    it('9.3: as entradas a–g, e sem ação para quem só lê', async () => {
        const [c, h, a] = tela();
        await window.renderManagementReview(c, h, a);
        const t = itens(c);
        expect(t.length).toBe(7);
        expect(t[0]).toMatch(/ações de análises críticas anteriores/);
        expect(t[2]).toMatch(/necessidades e expectativas das partes interessadas/);
        expect(t[3]).toMatch(/não conformidades.*monitoramento.*auditoria.*objetivos/);
        expect(t[5]).toMatch(/avaliação de riscos.*plano de tratamento/);
        expect(t[6]).toMatch(/melhoria contínua/);
        expect(acao(c)).toBe('openNewMgmtReviewModal');
        S.user = { role: 'org_user' };
        await window.renderManagementReview(c, h, a);
        expect(itens(c).length).toBe(7);
        expect(acao(c)).toBeUndefined();
    });

    it('com registros, nada de lista', async () => {
        apiMock.mockResolvedValue([{ id: 's1', name: 'Regulador', type: 'external', review_date: '2026-10-01', attendees: '[]', metric_name: 'x', status: 'On Track' }]);
        for (const r of ['renderStakeholders', 'renderMetrics', 'renderManagementReview']) {
            const [c, h, a] = tela();
            await window[r](c, h, a);
            expect(c.querySelector('.empty-list')).toBeNull();
        }
    });
});
