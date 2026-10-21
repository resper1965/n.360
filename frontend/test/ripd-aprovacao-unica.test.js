// RIPD (decisão do dono de 20/10/2026): uma assinatura, do encarregado ou da Direção, aprova; editar o conteúdo de um RIPD
// aprovado derruba a aprovação (PUT /api/v1/dpia/:id, src/routes/platform.ts), então a tela pergunta antes. Dados fictícios.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost', cabecalhosAuth: () => ({}) }));
vi.mock('../src/router.js', () => ({ render: vi.fn(), navigate: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/privacy.js';

const el = (id) => document.getElementById(id);
beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({ ok: true });
    document.body.innerHTML = '<div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p1', modulos: ['privacy'] };
    S.projects = [S.activeProject];
    window.render = vi.fn();
    window.traduzStatus = (s) => s;
});

describe('assinaturas do RIPD', () => {
    it('com uma assinatura mostra "Aprovado por" e não pede a outra', () => {
        S.dpia = [{ id: 'd1', system_name: 'Folha', status: 'Approved', dpo_signature: 'Ana' }];
        window.openDPIADetailsModal('d1');
        const txt = el('modal-content').textContent;
        expect(txt).toContain('Aprovado por Ana');
        expect(txt).not.toContain('Aguardando assinatura');
        expect(el('modal-content').querySelector('[data-action="approveDPIA"]')).toBeNull();
    });

    it('sem assinatura explica que uma basta e oferece as duas', () => {
        S.dpia = [{ id: 'd1', system_name: 'Folha', status: 'Draft' }];
        window.openDPIADetailsModal('d1');
        expect(el('modal-content').textContent).toContain('Uma assinatura');
        expect(el('modal-content').querySelectorAll('[data-action="approveDPIA"]').length).toBe(2);
    });
});

describe('editar RIPD aprovado', () => {
    const dp = { id: 'd1', system_name: 'Folha', risks_identified: 'R1', status: 'Approved', dpo_signature: 'Ana' };
    const puts = () => apiMock.mock.calls.filter((c) => c[0] === 'PUT');

    it('mudar o conteúdo pergunta antes; cancelar não grava, confirmar grava', async () => {
        S.dpia = [dp];
        window.openEditDPIAModal('d1');
        el('dpia-e-risks').value = 'R2';
        window.confirmar = vi.fn().mockResolvedValue(false);
        await window.updateDPIA('d1');
        expect(window.confirmar).toHaveBeenCalledWith(expect.stringContaining('volta a rascunho'), expect.objectContaining({ titulo: 'Editar RIPD aprovado' }));
        expect(puts()).toHaveLength(0);
        window.confirmar = vi.fn().mockResolvedValue(true);
        await window.updateDPIA('d1');
        expect(puts()).toHaveLength(1);
        expect(puts()[0][2].risks_identified).toBe('R2');
    });

    it('sem mudança de conteúdo grava sem perguntar', async () => {
        S.dpia = [dp];
        window.openEditDPIAModal('d1');
        window.confirmar = vi.fn().mockResolvedValue(false);
        await window.updateDPIA('d1');
        expect(window.confirmar).not.toHaveBeenCalled();
        expect(puts()).toHaveLength(1);
    });
});
