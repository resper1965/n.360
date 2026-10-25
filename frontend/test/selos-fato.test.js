// Selos que dizem o fato: onde não há decisão humana registrada por trás, a tela não afirma "Conforme"/"Não conforme".
// Diz o que existe (a data da análise crítica, quantos concluíram o treinamento, a versão publicada da política).
// api() REAL; só o fetch é dublado. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/monitor.js';
import '../src/views/grc.js';
import '../src/views/compliance.js';

const P = '/api/v1/projects/p1';
const tela = () => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    return ['c', 'h', 'a'].map((id) => document.getElementById(id));
};
const SEM_VEREDITO = /\bconforme\b|n[ãa]o conforme|CONFORME/i;

beforeEach(() => {
    S.token = 'tok';
    S.user = { id: 'u1', role: 'consultor' };
    S.activeProject = { id: 'p1', modulos: ['iso'] };
    S.currentProject = S.activeProject;
    S.projects = [S.activeProject];
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Análise crítica (Cl. 9.3)', () => {
    it('com análise concluída: a data da última, sem "Conforme"', async () => {
        servir({ [`GET ${P}/management-reviews`]: [
            { id: 'm1', review_date: '2026-03-10', status: 'Completed', attendees: '[]' },
            { id: 'm2', review_date: '2026-09-02', status: 'Completed', attendees: '[]' },
            { id: 'm3', review_date: '2026-12-01', status: 'Planned', attendees: '[]' },
        ] });
        const [c, h, a] = tela();
        await window.renderManagementReview(c, h, a);
        expect(c.textContent).toContain('Análise crítica registrada em 02/09/2026');
        expect(c.querySelector('.stat-strip').textContent).not.toMatch(SEM_VEREDITO);
    });
    it('só planejada: "Nenhuma análise crítica registrada"', async () => {
        servir({ [`GET ${P}/management-reviews`]: [{ id: 'm3', review_date: '2026-12-01', status: 'Planned', attendees: '[]' }] });
        const [c, h, a] = tela();
        await window.renderManagementReview(c, h, a);
        expect(c.textContent).toContain('Nenhuma análise crítica registrada');
        expect(c.querySelector('.stat-strip').textContent).not.toMatch(/Pendente|Conforme/);
    });
});

describe('Treinamento', () => {
    it('"X de Y concluíram", sem "Não conforme" mesmo com o resumo do servidor dizendo Non-Compliant', async () => {
        servir({
            [`GET ${P}/training`]: [
                { id: 't1', training_name: 'Fictício', employee_name: 'Pessoa A', status: 'Completed' },
                { id: 't2', training_name: 'Fictício', employee_name: 'Pessoa B', status: 'Completed' },
                { id: 't3', training_name: 'Fictício', employee_name: 'Pessoa C', status: 'Pending' },
            ],
            [`GET ${P}/training/summary`]: { coverage_percent: 66, compliance_status: 'Non-Compliant' },
        });
        const [c, h, a] = tela();
        await window.renderTraining(c, h, a);
        const strip = c.querySelector('.stat-strip').textContent;
        expect(strip).toContain('2 de 3');
        expect(strip).not.toMatch(SEM_VEREDITO);
    });
});

describe('Contexto (4.1 a 4.3)', () => {
    it('conta as categorias registradas, sem "100% CONFORME"', async () => {
        servir({ [`GET ${P}/context`]: { internal_strengths: 'Equipe\nProcesso', external_threats: 'Fraude', legal_requirements: 'LGPD' } });
        const [c, h, a] = tela();
        await window.renderContext(c, h, a);
        const strip = c.querySelector('.stat-strip').textContent;
        expect(strip).toContain('3 de 6');
        expect(strip).not.toMatch(/CONFORME|100%/i);
    });
});
