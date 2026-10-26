// Reabrir a LIA concluída pede confirmação (o legado pergunta "Confirma a reabertura do formulário?"). api() dublada.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, baixarArquivo: vi.fn(), API_BASE: 'http://localhost' }));

import '../src/ui.js';
import '../src/views/tratamento-ligacoes.js';

beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({ ok: true });
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
});

describe('reabrir a LIA', () => {
    it('cancelar não grava nada', async () => {
        const p = window.reabrirLiaTratamento('p1', 'r1');
        expect(document.body.textContent).toContain('Confirma a reabertura do formulário?');
        document.querySelector('[data-confirmar="nao"]').click();
        await p;
        expect(apiMock).not.toHaveBeenCalled();
    });

    it('confirmar volta a LIA para rascunho', async () => {
        const p = window.reabrirLiaTratamento('p1', 'r1');
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        expect(apiMock).toHaveBeenCalledWith('PUT', '/api/v1/projects/p1/ropa/r1/lia', { status: 'rascunho' });
    });
});
