// Ativo do n.iso: nasce Confidencial (o mesmo padrão do servidor, src/services/itens.ts) e a edição não tem o
// select de status, que o servidor ignorava; tirar do inventário é o Excluir (exclusão lógica).
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));

import '../src/ui.js';
import '../src/views/monitor.js';
import { S } from '../src/state.js';

beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>'
        + '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    apiMock.mockReset();
    apiMock.mockResolvedValue({ ok: true });
    window.render = vi.fn();
    S.assets = [{ id: 'a1', name: 'Banco Exemplo', category: 'Software', classification: 'Internal', owner: 'TI', location: 'Nuvem', status: 'Active' }];
});

describe('formulário de ativo do n.iso', () => {
    it('novo ativo vem com Confidencial selecionado', () => {
        window.openNewAssetModal('p1');
        expect(document.getElementById('ast-classification').value).toBe('Confidential');
    });

    it('edição não tem campo de status e não o envia no PUT', async () => {
        window.openEditAssetModal('a1');
        expect(document.getElementById('ast-e-status')).toBeNull();
        expect(document.getElementById('modal-content').textContent).not.toMatch(/Status/);
        await window.updateAsset('a1');
        const [metodo, caminho, corpo] = apiMock.mock.calls[0];
        expect([metodo, caminho]).toEqual(['PUT', '/api/v1/assets/a1']);
        expect(corpo).toEqual({ name: 'Banco Exemplo', category: 'Software', classification: 'Internal', owner: 'TI', location: 'Nuvem' });
    });

    it('ativo sem classificação aparece como Confidencial na lista', async () => {
        apiMock.mockResolvedValue({ assets: [{ id: 'a2', name: 'Sem Classe', status: 'Active' }] });
        S.user = { id: 'u1', role: 'consultor' };
        S.activeProject = { id: 'p1' };
        await window.renderAssets(...['c', 'h', 'a'].map((id) => document.getElementById(id)));
        const linha = [...document.querySelectorAll('#c tr')].find((tr) => tr.textContent.includes('Sem Classe'));
        expect(linha.textContent).toMatch(/Confidential|Confidencial/);
        expect(linha.textContent).not.toMatch(/Internal|Interno/);
    });
});
