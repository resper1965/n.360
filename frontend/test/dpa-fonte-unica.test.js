// DPA pela fonte única (20/10/2026): no n.iso o DPA é o documento ligado ao fornecedor (`dpa`, `dpa_documentos` do servidor);
// o legado do perfil aparece como "Declarado, sem documento", só leitura. O formulário não tem mais "DPA assinado" nem link.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, baixarArquivo: vi.fn(), API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/globals.js';
import '../src/views/grc.js';

const PROJ = { id: 'p1', client_name: 'Cliente Ficticio', modulos: ['iso'] };
const VENDORS = [
    { id: 'v1', parte_id: 'pa1', project_id: 'p1', name: 'Alfa Nuvem', trust_score: 30, diligence_level: 'High', has_iso27001: 1,
        dpa: 1, dpa_declarado: 0, dpa_url_antigo: null, dpa_documentos: [{ id: 'd1', titulo: 'DPA <b>Alfa</b>' }] },
    { id: 'v2', parte_id: 'pa2', project_id: 'p1', name: 'Beta Legado', trust_score: 20, diligence_level: 'High', has_iso27001: 1,
        dpa: 0, dpa_declarado: 1, dpa_url_antigo: 'https://dpa.exemplo.com', dpa_documentos: [] },
    { id: 'v3', parte_id: 'pa3', project_id: 'p1', name: 'Gama Nada', trust_score: 0, diligence_level: 'High', dpa: 0, dpa_declarado: 0, dpa_url_antigo: null, dpa_documentos: [] },
];

beforeEach(async () => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>'
        + '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    apiMock.mockReset();
    apiMock.mockImplementation(async (metodo, caminho) => {
        if (metodo === 'GET' && caminho === '/api/v1/projects/p1/vendors') return { vendors: VENDORS };
        if (metodo === 'GET' && caminho === '/api/v1/projects/p1/documentos') return [{ id: 'd1', titulo: 'DPA Alfa' }, { id: 'd2', titulo: 'DPA Beta' }];
        return { ok: true };
    });
    S.user = { id: 'u1', role: 'consultor' };
    S.activeProject = PROJ;
    S.projects = [PROJ];
    window.render = vi.fn();
    await window.renderVendors(...['c', 'h', 'a'].map((id) => document.getElementById(id)));
});

const linha = (nome) => [...document.querySelectorAll('#c tr')].find((tr) => tr.textContent.includes(nome));
const modal = () => document.getElementById('modal-content');

describe('DPA do fornecedor no n.iso', () => {
    it('a coluna DPA diz Sim, Declarado, sem documento ou Não; o cartão conta só o documento ligado', () => {
        expect(linha('Alfa Nuvem').textContent).toContain('Sim');
        expect(linha('Beta Legado').textContent).toContain('Declarado, sem documento');
        expect(linha('Gama Nada').textContent).toContain('Não');
        const cartao = [...document.querySelectorAll('#c *')].find((e) => e.children.length === 0 && e.textContent.trim() === 'DPAs Assinados');
        expect(cartao.parentElement.textContent).toContain('1');
    });

    it('o formulário não tem "DPA assinado" nem link; salvar não manda dpa_signed nem dpa_url; o índice estimado conta o DPA ligado', async () => {
        window.openEditVendorModal('pa1');
        expect(document.getElementById('vnd-dpa')).toBeNull();
        expect(document.getElementById('vnd-dpa-url')).toBeNull();
        expect(document.getElementById('vnd-score-preview').textContent).toBe('30 / 100');
        await window.updateVendor('pa1');
        const corpo = apiMock.mock.calls.find(([m, c]) => m === 'PUT' && c === '/api/v1/vendors/v1')[2];
        expect(corpo).not.toHaveProperty('dpa_signed');
        expect(corpo).not.toHaveProperty('dpa_url');

        window.openEditVendorModal('pa2');
        expect(document.getElementById('vnd-score-preview').textContent).toBe('20 / 100');
        window.openNewVendorModal('p1');
        expect(document.getElementById('vnd-dpa')).toBeNull();
    });

    it('a ficha lista os documentos DPA e liga outro pelo POST com papel dpa', async () => {
        await window.openVendorDetailsModal('pa1');
        expect(modal().textContent).toContain('DPA <b>Alfa</b>');
        expect(modal().querySelector('b')).toBeNull();
        // o já ligado não volta na lista de escolha
        expect([...document.querySelectorAll('#vnd-dpa-doc option')].map((o) => o.value)).toEqual(['d2']);
        const botao = [...modal().querySelectorAll('button')].find((b) => b.textContent === 'Ligar documento');
        expect(JSON.parse(botao.dataset.args)).toEqual(['p1', 'pa1']);
        await window.ligarDpaFornecedor('p1', 'pa1');
        expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/terceiros/pa1/documentos', { documento_id: 'd2', papel: 'dpa' });
    });

    it('legado: mostra o link antigo só leitura, sem campo editável', async () => {
        await window.openVendorDetailsModal('pa2');
        expect(modal().textContent).toContain('DPA declarado, sem documento (link antigo)');
        expect(modal().textContent).toContain('https://dpa.exemplo.com');
        expect(modal().querySelector('input')).toBeNull();
        expect(modal().textContent).toContain('Nenhum documento ligado');
    });
});
