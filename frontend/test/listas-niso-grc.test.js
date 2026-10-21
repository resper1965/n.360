// As listas do n.iso em grc.js (frente 3A, spec A2): CAPA, Riscos, Fornecedores, Treinamento e Auditorias passam pelo
// componente de lista (busca, filtros, contagem e exportar). Dados fictícios.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock, baixarArquivo } = vi.hoisted(() => ({ apiMock: vi.fn(), baixarArquivo: vi.fn(async () => {}) }));
vi.mock('../src/api.js', () => ({ api: apiMock, baixarArquivo, API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/globals.js';
import { initDelegation } from '../src/delegation.js';
import '../src/views/grc.js';

initDelegation();

const PROJ = { id: 'p1', client_name: 'Cliente Ficticio', modulos: ['iso'] };
const B = '/api/v1/projects/p1';
const DADOS = {
    [`${B}/capa`]: [
        { id: 'c1', title: 'Corrigir MFA', assigned_to: 'Ana Exemplo', status: 'Open', severity: 'High', audit_id: 'a1' },
        { id: 'c2', title: 'Aplicar patches', assigned_to: 'Bruno Exemplo', status: 'Closed', severity: 'Low', risk_id: 'r1' },
        { id: 'c3', title: 'Revisar backup', assigned_to: 'Carla Exemplo', status: 'Open', severity: 'Medium', incidente_id: 'i1' },
    ],
    [`${B}/risks`]: [
        { id: 'r1', asset: 'ERP', threat: 'Vazamento', probability: 5, impact: 5, risk_level: 'Critical', status: 'Open', treatment: 'Mitigate', owner: 'Ana' },
        { id: 'r2', asset: 'CRM', threat: 'Indisponibilidade', probability: 1, impact: 2, risk_level: 'Low', status: 'Open', treatment: 'Accept', owner: 'Bruno' },
        { id: 'r3', asset: 'ERP', threat: 'Fraude', probability: 1, impact: 2, risk_level: 'Low', status: 'Mitigated', treatment: 'Mitigate', owner: 'Carla' },
    ],
    [`${B}/vendors`]: { vendors: [
        { id: 'v1', parte_id: 'pa1', project_id: 'p1', name: 'Alfa Nuvem', trust_score: 80, diligence_level: 'High', dpa: 1 },
        { id: 'v2', parte_id: 'pa2', project_id: 'p1', name: 'Beta Legado', trust_score: 40, diligence_level: 'Low', dpa: 0, dpa_declarado: 1 },
        { id: null, parte_id: 'pa3', project_id: 'p1', name: 'Gama Sem Perfil', dpa: 0, dpa_declarado: 0 },
    ] },
    [`${B}/training`]: [
        { id: 't1', training_name: 'LGPD básica', employee_name: 'Ana Exemplo', status: 'Completed' },
        { id: 't2', training_name: 'Phishing', employee_name: 'Bruno Exemplo', status: 'Pending' },
    ],
    [`${B}/audits`]: [
        { id: 'a1', title: 'Interna 2026', audit_type: 'Internal', status: 'Planned' },
        { id: 'a2', title: 'Certificação', audit_type: 'External', status: 'Completed' },
    ],
};

beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>'
        + '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    apiMock.mockReset();
    apiMock.mockImplementation(async (metodo, caminho) => (metodo === 'GET' && caminho in DADOS ? DADOS[caminho] : {}));
    baixarArquivo.mockClear();
    S.user = { id: 'u1', role: 'consultor' };
    S.activeProject = PROJ;
    S.projects = [PROJ];
    S.filtroPainel = null;
    S.riskFilter = null;
    window.render = vi.fn();
});

const tela = (fn) => window[fn](...['c', 'h', 'a'].map((id) => document.getElementById(id)));
const linhas = () => [...document.querySelectorAll('#c tbody tr')].map((tr) => tr.textContent);
const contagem = (id) => document.getElementById(`${id}-contagem`).textContent;
const digitar = (sel, v) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
const escolher = (sel, v) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); };
const exportar = () => document.querySelector('#c [data-action="listaExportar"]');

describe('listas do n.iso (grc.js)', () => {
    it('CAPA: busca pelo responsável, filtro de origem, sem exportar', async () => {
        await tela('renderCAPA');
        expect(contagem('capa')).toBe('3');
        digitar('#capa-busca', 'bruno');
        expect(linhas()).toEqual([expect.stringContaining('Aplicar patches')]);
        digitar('#capa-busca', '');
        expect([...document.querySelectorAll('#capa-f-origem option')].map((o) => o.textContent))
            .toEqual(['Todos', 'Auditoria', 'Risco', 'Incidente', 'Avulsa']);
        escolher('#capa-f-origem', 'incidente');
        expect(linhas()).toEqual([expect.stringContaining('Revisar backup')]);
        expect(contagem('capa')).toBe('1 de 3');
        expect(document.getElementById('capa-f-status')).not.toBeNull();
        expect(document.getElementById('capa-f-severidade')).not.toBeNull();
        expect(exportar()).toBeNull();
    });

    it('Riscos: tabela com busca, filtro de nível, a célula da matriz filtra e exportar vai a /export/risks', async () => {
        await tela('renderRisks');
        expect(document.querySelector('#c .list-item')).toBeNull();
        expect(linhas()).toHaveLength(3);
        digitar('#riscos-busca', 'erp');
        expect(linhas()).toHaveLength(2);
        escolher('#riscos-f-nivel', 'Low');
        expect(linhas()).toEqual([expect.stringContaining('Fraude')]);
        escolher('#riscos-f-nivel', '');
        // Clicar na célula (probabilidade 1, impacto 2) filtra a lista e mantém a busca.
        document.querySelector(`[data-action="toggleRiskFilter"][data-args='[1,2]']`).click();
        expect(linhas()).toEqual([expect.stringContaining('Fraude')]);
        expect(document.getElementById('riscos-busca').value).toBe('erp');
        expect(document.querySelector('[data-action="toggleRiskFilter"][data-args=\'[1,2]\']').classList.contains('selected')).toBe(true);
        document.querySelector(`[data-action="toggleRiskFilter"][data-args='[1,2]']`).click();
        expect(linhas()).toHaveLength(2);
        // Abrir o detalhe por linha, botão fantasma (nunca primário).
        const abrir = document.querySelector('#c tbody [data-action="openRiskDetailsModal"]');
        expect(abrir.classList.contains('btn-ghost')).toBe(true);
        expect(document.querySelector('#c [data-action="exportCSV"]')).toBeNull();
        exportar().click();
        expect(baixarArquivo).toHaveBeenCalledWith('/api/v1/projects/p1/export/risks');
    });

    it('Fornecedores: busca pelo nome, filtros de DPA e de avaliação, exportar vai a /export/vendors', async () => {
        await tela('renderVendors');
        digitar('#fornecedores-busca', 'alfa');
        expect(linhas()).toEqual([expect.stringContaining('Alfa Nuvem')]);
        digitar('#fornecedores-busca', '');
        expect([...document.querySelectorAll('#fornecedores-f-dpa option')].map((o) => o.textContent))
            .toEqual(['Todos', 'Sim', 'Declarado, sem documento', 'Não']);
        escolher('#fornecedores-f-dpa', 'declarado');
        expect(linhas()).toEqual([expect.stringContaining('Beta Legado')]);
        escolher('#fornecedores-f-dpa', '');
        escolher('#fornecedores-f-avaliacao', 'sem');
        expect(linhas()).toEqual([expect.stringContaining('Sem avaliação de segurança')]);
        expect(document.getElementById('fornecedores-f-diligencia')).not.toBeNull();
        exportar().click();
        expect(baixarArquivo).toHaveBeenCalledWith('/api/v1/projects/p1/export/vendors');
    });

    it('Treinamento: busca pelo colaborador, filtro de status, exportar vai a /export/training', async () => {
        await tela('renderTraining');
        digitar('#treinamento-busca', 'bruno');
        expect(linhas()).toEqual([expect.stringContaining('Phishing')]);
        digitar('#treinamento-busca', '');
        escolher('#treinamento-f-status', 'Completed');
        expect(linhas()).toEqual([expect.stringContaining('LGPD básica')]);
        exportar().click();
        expect(baixarArquivo).toHaveBeenCalledWith('/api/v1/projects/p1/export/training');
    });

    it('Auditorias: busca pelo título, filtros de tipo e status, sem exportar', async () => {
        await tela('renderAudits');
        digitar('#auditorias-busca', 'certificacao');
        expect(linhas()).toEqual([expect.stringContaining('Certificação')]);
        digitar('#auditorias-busca', '');
        expect([...document.querySelectorAll('#auditorias-f-tipo option')].map((o) => o.textContent)).toEqual(['Todos', 'Externa', 'Interna']);
        escolher('#auditorias-f-tipo', 'Internal');
        expect(linhas()).toEqual([expect.stringContaining('Interna 2026')]);
        expect(document.getElementById('auditorias-f-status')).not.toBeNull();
        expect(exportar()).toBeNull();
    });
});
