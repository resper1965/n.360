// Detalhe do controle (n.iso): bloco "Usado em N atividades do n.privacy" e confirmação ao sair de implementado. Dados fictícios.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/views/compliance.js';

const el = (id) => document.getElementById(id);
const esperar = async (fn) => { for (let i = 0; i < 50; i++) { try { fn(); return; } catch (e) { await new Promise((r) => setTimeout(r, 5)); } } fn(); };
const CTRL = { id: 'ctrl-a824', project_id: 'p1', title: 'A.8.24 — Criptografia', status: 'Implemented', maturity: 3, description: '' };
const A = (n) => ({ ropa_id: `r${n}`, atividade: `Atividade ${n}`, medida: `Medida ${n}` });
const responder = (atividades) => apiMock.mockImplementation(async (m, u) => (u.endsWith('/atividades') ? { atividades } : []));
const abrir = async (atividades, modulos = ['iso', 'privacy']) => {
    responder(atividades);
    S.currentProject = { id: 'p1', modulos };
    S.user = { role: 'consultor', modulos: ['iso', 'privacy'] };
    S.controls = [{ ...CTRL }];
    window.openControlDetail(CTRL.id);
    await esperar(() => expect(apiMock.mock.calls.some((c) => c[1].endsWith('/atividades'))).toBe(true));
    await new Promise((r) => setTimeout(r, 10));
};

beforeEach(() => {
    apiMock.mockReset();
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    window.confirmar = vi.fn();
});

describe('bloco "Usado em"', () => {
    it('com n.privacy, o nome vira botão que abre a atividade na aba Medidas', async () => {
        await abrir([A(1), A(2)]);
        expect(el('controle-atividades').textContent).toContain('Usado em 2 atividades do n.privacy');
        const b = el('controle-atividades').querySelector('button[data-action="abrirAtividade"]');
        expect(b.textContent).toBe('Atividade 1');
        expect(JSON.parse(b.getAttribute('data-args'))).toEqual(['p1', 'r1', 'medidas']);
        expect(el('controle-atividades').textContent).toContain('Medida 1');
    });
    it('singular e sem o n.privacy: só texto', async () => {
        await abrir([A(1)], ['iso']);
        expect(el('controle-atividades').textContent).toContain('Usado em 1 atividade do n.privacy');
        expect(el('controle-atividades').querySelector('button')).toBeNull();
    });
    it('lista vazia ou falha: o bloco não aparece', async () => {
        await abrir([]);
        expect(el('controle-atividades').textContent).toBe('');
        apiMock.mockReset(); apiMock.mockImplementation(async (m, u) => { if (u.endsWith('/atividades')) throw new Error('x'); return []; });
        window.openControlDetail(CTRL.id);
        await new Promise((r) => setTimeout(r, 20));
        expect(el('controle-atividades').textContent).toBe('');
    });
});

describe('confirmação ao sair de implementado', () => {
    it('pede confirmação citando 5 e "mais K"; cancelar volta o select e não chama PUT', async () => {
        await abrir([1, 2, 3, 4, 5, 6, 7].map(A));
        window.confirmar.mockResolvedValue(false);
        el('controle-status').value = 'Missing';
        await window.updateControlStatus(CTRL.id, 'Missing');
        expect(window.confirmar.mock.calls[0][0]).toContain('Este controle é usado em 7 atividades do n.privacy: Atividade 1, Atividade 2, Atividade 3, Atividade 4, Atividade 5 e mais 2.');
        expect(el('controle-status').value).toBe('Implemented');
        expect(apiMock.mock.calls.some((c) => c[0] === 'PUT')).toBe(false);
    });
    it('confirmada, grava; sem sair de implementado, não pergunta', async () => {
        await abrir([A(1)]);
        window.confirmar.mockResolvedValue(true);
        await window.updateControlStatus(CTRL.id, 'Partial');
        expect(apiMock.mock.calls.some((c) => c[0] === 'PUT')).toBe(true);
        window.confirmar.mockClear();
        await window.updateControlStatus(CTRL.id, 'Implemented');
        expect(window.confirmar).not.toHaveBeenCalled();
    });
    it('busca as atividades na hora da mudança: vale a lista atual, não a do detalhe aberto', async () => {
        await abrir([]);
        responder([A(1), A(2)]);
        window.confirmar.mockResolvedValue(false);
        await window.updateControlStatus(CTRL.id, 'Missing');
        expect(window.confirmar.mock.calls[0][0]).toContain('Este controle é usado em 2 atividades do n.privacy');
        expect(apiMock.mock.calls.some((c) => c[0] === 'PUT')).toBe(false);
    });
    it('sem conseguir conferir as atividades, pergunta antes de mudar (falha fechada)', async () => {
        await abrir([]);
        apiMock.mockImplementation(async (m, u) => { if (u.endsWith('/atividades')) throw new Error('x'); return []; });
        window.confirmar.mockResolvedValue(false);
        await window.updateControlStatus(CTRL.id, 'Missing');
        expect(window.confirmar.mock.calls[0][0]).toContain('Não foi possível conferir');
        expect(apiMock.mock.calls.some((c) => c[0] === 'PUT')).toBe(false);
    });
});

describe('excluir do escopo (N/A)', () => {
    const justificativa = 'Nao ha tratamento de dado pessoal neste escopo do SGSI, registrado.';
    const preparar = async (atividades) => {
        await abrir(atividades);
        document.body.insertAdjacentHTML('beforeend', `<textarea id="na-why">${justificativa}</textarea>`);
        apiMock.mockClear();
    };
    it('com atividade usando o controle, pergunta; cancelar não grava', async () => {
        await preparar([A(1), A(2)]);
        window.confirmar.mockResolvedValue(false);
        await window.confirmNA(CTRL.id);
        expect(window.confirmar.mock.calls[0][0]).toContain('Este controle é usado em 2 atividades do n.privacy: Atividade 1 e Atividade 2.');
        expect(window.confirmar.mock.calls[0][0]).toContain('Excluir do escopo?');
        expect(apiMock.mock.calls.some((c) => c[0] === 'PUT')).toBe(false);
    });
    it('confirmada, grava a exclusão', async () => {
        await preparar([A(1)]);
        window.confirmar.mockResolvedValue(true);
        await window.confirmNA(CTRL.id);
        expect(apiMock).toHaveBeenCalledWith('PUT', `/api/v1/controls/${CTRL.id}`, { status: 'Not Applicable', description: justificativa });
    });
    it('sem atividade ligada, não pergunta; sem conseguir conferir, pergunta (falha fechada)', async () => {
        await preparar([]);
        await window.confirmNA(CTRL.id);
        expect(window.confirmar).not.toHaveBeenCalled();
        expect(apiMock.mock.calls.some((c) => c[0] === 'PUT')).toBe(true);
        document.body.insertAdjacentHTML('beforeend', `<textarea id="na-why">${justificativa}</textarea>`);
        apiMock.mockReset(); apiMock.mockImplementation(async (m, u) => { if (u.endsWith('/atividades')) throw new Error('x'); return []; });
        window.confirmar.mockResolvedValue(false);
        await window.confirmNA(CTRL.id);
        expect(window.confirmar.mock.calls[0][0]).toContain('Não foi possível conferir');
        expect(apiMock.mock.calls.some((c) => c[0] === 'PUT')).toBe(false);
    });
});
