// Formulários do n.iso (spec 3C, C2 e C3): o risco tem residual e prazo de tratamento; a CAPA exige responsável, como o gap.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));
vi.mock('../src/router.js', () => ({ render: vi.fn(), navigate: vi.fn() }));

import { S } from '../src/state.js';
import '../src/views/grc.js';

const val = (id) => document.getElementById(id);
const chamada = (metodo) => apiMock.mock.calls.find((c) => c[0] === metodo);

beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((m, url) => Promise.resolve(url.includes('/partes') ? [{ id: 'pt1', nome: 'Ana Exemplo' }] : (m === 'GET' ? [] : { ok: true })));
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.activeProject = { id: 'p1' };
    S.controls = [];
    window.render = vi.fn();
});

describe('risco do n.iso: residual e prazo', () => {
    it('novo: envia impacto e probabilidade residuais e o prazo; vazio vai como null', async () => {
        await window.openNewRiskModal('p1');
        expect([...val('risk-res-impact').options].map((o) => o.value)).toEqual(['', '1', '2', '3', '4', '5']);
        expect(val('risk-due').type).toBe('date');
        val('risk-asset').value = 'ERP';
        val('risk-threat').value = 'Vazamento';
        val('risk-res-impact').value = '2';
        val('risk-res-prob').value = '3';
        val('risk-due').value = '2026-11-30';
        await window.createRisk('p1');
        expect(chamada('POST')[2]).toMatchObject({ residual_impact: 2, residual_probability: 3, treatment_due_date: '2026-11-30' });

        apiMock.mockClear();
        await window.openNewRiskModal('p1');
        val('risk-asset').value = 'ERP';
        val('risk-threat').value = 'Outro';
        await window.createRisk('p1');
        expect(chamada('POST')[2]).toMatchObject({ residual_impact: null, residual_probability: null, treatment_due_date: null });
    });

    it('editar: abre com o gravado e limpa o prazo', async () => {
        S.risks = [{ id: 'r1', asset: 'ERP', threat: 'T', residual_impact: 4, residual_probability: 1, treatment_due_date: '2026-12-01' }];
        await window.openEditRiskModal('r1');
        expect(val('risk-e-res-impact').value).toBe('4');
        expect(val('risk-e-res-prob').value).toBe('1');
        expect(val('risk-e-due').value).toBe('2026-12-01');
        val('risk-e-due').value = '';
        val('risk-e-res-prob').value = '';
        await window.updateRisk('r1');
        expect(chamada('PUT')[2]).toMatchObject({ residual_impact: 4, residual_probability: null, treatment_due_date: null });
    });
});

describe('CAPA do n.iso: responsável obrigatório', () => {
    it('sem responsável não grava e avisa; com a parte ou o texto livre grava', async () => {
        await window.openNewCAPAModal('p1');
        val('capa-title').value = 'Corrigir';
        await window.createCAPA('p1');
        expect(chamada('POST')).toBeUndefined();
        expect(document.querySelector('.toast-error')?.textContent).toContain('responsável');
        val('capa-assigned').value = 'CISO';
        await window.createCAPA('p1');
        expect(chamada('POST')[2]).toMatchObject({ assigned_to: 'CISO', title: 'Corrigir' });
    });

    it('editar sem responsável também não grava', async () => {
        S.capa = [{ id: 'c1', title: 'T', status: 'Open' }];
        await window.openEditCAPAModal('c1');
        await window.updateCAPA('c1');
        expect(chamada('PUT')).toBeUndefined();
        val('capa-e-assigned-parte').value = 'pt1';
        await window.updateCAPA('c1');
        expect(chamada('PUT')[2]).toMatchObject({ assigned_to_parte_id: 'pt1' });
    });
});
