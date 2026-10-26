// RIPD (decisão do dono de 20/10/2026): uma assinatura, do encarregado ou da Direção, aprova; editar o conteúdo de um RIPD
// aprovado derruba a aprovação (PUT /api/v1/dpia/:id, src/routes/platform.ts), então a tela pergunta antes. Agora na página do RIPD
// (spec 2026-10-26), aba Dados. Dados fictícios.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost', cabecalhosAuth: () => ({}) }));
vi.mock('../src/router.js', () => ({ render: vi.fn(), navigate: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/privacy.js';
import '../src/views/ripd-ficha.js';

const el = (id) => document.getElementById(id);
let lista;
const abrir = async () => {
    apiMock.mockImplementation(async (m, u) => (m === 'GET' && u.endsWith('/dpia') ? lista : { ok: true }));
    window.history.replaceState(null, '', '/?tela=ripd-ficha&dpia=d1&aba=dados');
    await window.renderRipdFicha(el('c'), el('h'), el('a'));
};
beforeEach(() => {
    apiMock.mockReset();
    document.body.innerHTML = '<div id="h"></div><div id="a"></div><div id="c"></div>';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p1', modulos: ['privacy'] };
    S.projects = [S.activeProject];
    S.ripd = null;
    window.render = vi.fn();
    window.traduzStatus = (s) => s;
});

describe('assinaturas do RIPD', () => {
    it('com uma assinatura mostra "Aprovado por" e não pede a outra', async () => {
        lista = [{ id: 'd1', system_name: 'Folha', status: 'Approved', dpo_signature: 'Ana' }];
        await abrir();
        const txt = el('c').textContent;
        expect(txt).toContain('Aprovado por Ana');
        expect(txt).not.toContain('Aguardando assinatura');
        expect(el('c').querySelector('[data-action="approveDPIA"]')).toBeNull();
    });

    it('sem assinatura explica que uma basta e oferece as duas', async () => {
        lista = [{ id: 'd1', system_name: 'Folha', status: 'Draft' }];
        await abrir();
        expect(el('c').textContent).toContain('Uma assinatura');
        expect(el('c').querySelectorAll('[data-action="approveDPIA"]').length).toBe(2);
    });
});

describe('editar RIPD aprovado', () => {
    const dp = { id: 'd1', system_name: 'Folha', risks_identified: 'R1', status: 'Approved', dpo_signature: 'Ana' };
    const puts = () => apiMock.mock.calls.filter((c) => c[0] === 'PUT');

    it('mudar o conteúdo pergunta antes; cancelar não grava, confirmar grava só o campo que mudou', async () => {
        lista = [dp];
        await abrir();
        expect(el('rf-aviso-hash').textContent).toContain('derruba a aprovação');
        el('rf-risks_identified').value = 'R2';
        window.confirmar = vi.fn().mockResolvedValue(false);
        await window.ripdSalvarDados('d1');
        expect(window.confirmar).toHaveBeenCalledWith(expect.stringContaining('volta a rascunho'), expect.objectContaining({ titulo: 'Editar RIPD aprovado' }));
        expect(puts()).toHaveLength(0);
        window.confirmar = vi.fn().mockResolvedValue(true);
        await window.ripdSalvarDados('d1');
        expect(puts()).toHaveLength(1);
        expect(puts()[0][2]).toEqual({ risks_identified: 'R2' });
    });

    it('sem mudança nada é gravado e a tela não pergunta', async () => {
        lista = [dp];
        await abrir();
        window.confirmar = vi.fn().mockResolvedValue(false);
        await window.ripdSalvarDados('d1');
        expect(window.confirmar).not.toHaveBeenCalled();
        expect(puts()).toHaveLength(0);
    });

    it('RIPD em rascunho grava sem perguntar', async () => {
        lista = [{ id: 'd1', system_name: 'Folha', status: 'Draft' }];
        await abrir();
        el('rf-technical_measures').value = 'Criptografia';
        window.confirmar = vi.fn();
        await window.ripdSalvarDados('d1');
        expect(window.confirmar).not.toHaveBeenCalled();
        expect(puts()[0][2]).toEqual({ technical_measures: 'Criptografia' });
    });
});
