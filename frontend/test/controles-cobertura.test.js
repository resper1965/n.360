// Cada controle mostra a política temática que o cobre (spec 2026-10-23).
import { describe, it, expect, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import '../src/views/compliance.js';
import { S } from '../src/state.js';

const cob = { aplicaveis: 3, cobertos: 1, sem_cobertura: [{ id: 'cc-24', title: 'A.5.24' }],
    por_controle: { 'cc-15': [{ id: 'doc-iam', titulo: 'POL-IAM-001', status: 'vigente' }], 'cc-30': [{ id: 'doc-x', titulo: '<b>Rascunho</b>', status: 'rascunho' }] },
    por_documento: { 'doc-iam': 1 } };

describe('cobertura nos controles', () => {
  it('mostra a política que cobre, o rascunho ou "Sem política"', async () => {
    apiMock.mockReset();
    apiMock.mockResolvedValue(cob);
    S.currentProject = { id: 'p1' };
    S.controls = ['cc-15', 'cc-24', 'cc-30'].map(id => ({ id, project_id: 'p1', title: `A.5.1 ${id}`, status: 'Missing' }));
    const c = document.createElement('div');
    window.renderControls(c, document.createElement('div'), document.createElement('div'));
    await new Promise(r => setTimeout(r, 0));
    expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/documentos/cobertura');
    expect(c.querySelector('[data-cobertura="cc-15"]').textContent).toContain('POL-IAM-001');
    expect(c.querySelector('[data-cobertura="cc-24"]').textContent).toContain('Sem política');
    expect(c.querySelector('[data-cobertura="cc-30"]').textContent).toContain('<b>Rascunho</b>');
    expect(c.querySelector('[data-cobertura="cc-30"] b')).toBeNull();
  });
});
