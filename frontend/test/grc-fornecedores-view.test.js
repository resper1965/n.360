// Fornecedores do n.iso: toda organização que é fornecedor aparece; o perfil de segurança é opcional.
// Sem perfil, a linha diz "Sem avaliação de segurança" e salvar cria o perfil pelo POST com o nome da parte.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, baixarArquivo: vi.fn(), API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/globals.js';
import '../src/views/grc.js';

const PROJ = { id: 'p1', client_name: 'Cliente Ficticio', modulos: ['iso'] };
const VENDORS = [
    { id: 'v1', parte_id: 'pa1', project_id: 'p1', name: 'Alfa Nuvem', trust_score: 80, diligence_level: 'Medium', dpa_signed: 1, has_iso27001: 1 },
    { id: null, parte_id: 'pa2', project_id: 'p1', name: 'Beta Exemplo', trust_score: null, diligence_level: null, dpa_signed: null },
];

beforeEach(async () => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>'
        + '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    apiMock.mockReset();
    apiMock.mockImplementation(async (metodo, caminho) => (metodo === 'GET' && caminho === '/api/v1/projects/p1/vendors' ? { vendors: VENDORS } : { ok: true }));
    S.user = { id: 'u1', role: 'consultor' };
    S.activeProject = PROJ;
    S.projects = [PROJ];
    window.render = vi.fn();
    await window.renderVendors(...['c', 'h', 'a'].map((id) => document.getElementById(id)));
});

const linha = (nome) => [...document.querySelectorAll('#c tr')].find((tr) => tr.textContent.includes(nome));
const modal = () => document.getElementById('modal-content');

describe('lista de fornecedores do n.iso', () => {
    it('fornecedor sem perfil mostra "Sem avaliação de segurança" no lugar do índice', () => {
        expect(linha('Beta Exemplo').textContent).toContain('Sem avaliação de segurança');
        expect(linha('Beta Exemplo').textContent).not.toContain('/100');
        expect(linha('Alfa Nuvem').textContent).toContain('80/100');
    });

    it('editar fornecedor sem perfil abre o formulário e salva pelo POST com o nome da parte; sem botão de remover', async () => {
        window.openEditVendorModal('pa2');
        expect(modal().textContent).not.toContain('Remover avaliação de segurança');
        document.getElementById('vnd-e-name').value = 'Outro nome';
        document.getElementById('vnd-iso27001').checked = true;
        await window.updateVendor('pa2');
        expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/vendors', expect.objectContaining({ name: 'Beta Exemplo', has_iso27001: 1 }));
    });

    it('editar fornecedor com perfil salva pelo PUT e oferece "Remover avaliação de segurança", avisando que o fornecedor fica', async () => {
        window.openEditVendorModal('pa1');
        const remover = [...modal().querySelectorAll('button')].find((b) => b.textContent === 'Remover avaliação de segurança');
        expect(remover).toBeTruthy();
        expect(JSON.parse(remover.dataset.args)).toEqual(['v1']);
        await window.updateVendor('pa1');
        expect(apiMock).toHaveBeenCalledWith('PUT', '/api/v1/vendors/v1', expect.objectContaining({ name: 'Alfa Nuvem' }));

        const confirmar = vi.spyOn(window, 'confirmar').mockResolvedValue(true);
        await window.deleteVendor('v1');
        expect(confirmar.mock.calls[0][0]).toMatch(/fornecedor continua cadastrado/);
        expect(apiMock).toHaveBeenCalledWith('DELETE', '/api/v1/vendors/v1');
    });

    it('erro do servidor ao cadastrar, salvar ou remover aparece num aviso; nome vazio também (antes falhava em silêncio)', async () => {
        const toasts = () => [...document.querySelectorAll('.toast-error')].map((t) => t.textContent);
        window.openNewVendorModal('p1');
        document.getElementById('vnd-name').value = '';
        await window.createVendor('p1');
        expect(toasts().join(' ')).toContain('Informe o nome do fornecedor');
        apiMock.mockRejectedValue(new Error('Fornecedor já cadastrado neste projeto'));
        window.openNewVendorModal('p1');
        document.getElementById('vnd-name').value = 'Alfa Nuvem';
        await window.createVendor('p1');
        expect(toasts().join(' ')).toContain('Fornecedor já cadastrado neste projeto');
        window.openEditVendorModal('pa1');
        await window.updateVendor('pa1');
        vi.spyOn(window, 'confirmar').mockResolvedValue(true);
        await window.deleteVendor('v1');
        expect(toasts().length).toBeGreaterThanOrEqual(4);
    });
});
