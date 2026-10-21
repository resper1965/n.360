// Documentos (n.privacy, spec 2026-10-19 frente B): lista com busca e filtros, modal "Documento" e o arquivo. Dados fictícios.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock, baixarMock } = vi.hoisted(() => ({ apiMock: vi.fn(), baixarMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, baixarArquivo: baixarMock, cabecalhosAuth: () => ({ Authorization: 'Bearer t' }), API_BASE: 'http://localhost' }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/documentos-arquivo.js';

const DOCS = [
    { id: 'd1', nome: 'Contrato <b>Fornecedor</b>', tipo: 'contrato', status: 'publicado', vencimento: '2027-03-31', sem_vencimento: 0,
        responsavel_parte_id: 'pa1', responsavel_nome: 'Pessoa Exemplo', arquivo_nome: 'contrato.pdf' },
    { id: 'd2', nome: 'Política de Privacidade', tipo: 'politica', status: 'rascunho', vencimento: null, sem_vencimento: 1, arquivo_nome: null },
];
const PESSOAS = [{ id: 'pa1', nome: 'Pessoa Exemplo' }, { id: 'pa2', nome: 'Outra <i>Pessoa</i>' }];

function montar() {
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div><h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    return [document.getElementById('c'), document.getElementById('h'), document.getElementById('a')];
}
const el = (id) => document.getElementById(id);
/** Responde "sim" na confirmação da própria tela (o confirmar de ui.js). */
const comSim = async (p) => { await Promise.resolve(); document.querySelector('[data-confirmar="sim"]').click(); await p; };
const linhas = (c) => [...c.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()));

beforeEach(() => {
    apiMock.mockReset();
    baixarMock.mockReset().mockResolvedValue(undefined);
    apiMock.mockImplementation((m, url) => {
        if (m === 'GET' && url.endsWith('/documentos-arquivo')) return Promise.resolve(structuredClone(DOCS)); // a tela altera o item na remoção do arquivo
        if (m === 'GET' && url.includes('/partes')) return Promise.resolve(PESSOAS);
        if (m === 'POST') return Promise.resolve({ ok: true, id: 'novo' });
        return Promise.resolve({ ok: true });
    });
    window.render = vi.fn();
    window.forceCloseModal = vi.fn();
    S.activeProject = { id: 'p1' };
    S.user = { role: 'consultor' };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
});

describe('Documentos', () => {
    it('lista Nome, Tipo, Vencimento e Status, escapando o nome', async () => {
        const [c, h, a] = montar();
        await window.renderDocumentosArquivo(c, h, a);
        expect(h.textContent).toBe('Documentos');
        expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/documentos-arquivo');
        expect([...c.querySelectorAll('thead th')].map((th) => th.textContent.trim())).toEqual(['Nome', 'Tipo', 'Responsável', 'Vencimento', 'Status', 'Ações']);
        const l = linhas(c);
        expect(l[0].slice(0, 5)).toEqual(['Contrato <b>Fornecedor</b>', 'Contrato', 'Pessoa Exemplo', '31/03/2027', 'Vigente']);
        expect(l[1].slice(0, 5)).toEqual(['Política de Privacidade', 'Política', '—', 'Sem vencimento', 'Rascunho']);
        expect(c.querySelector('tbody b')).toBeNull();
        expect(a.querySelector('.btn-primary').textContent.trim()).toBe('+ Novo documento');
    });

    it('busca (sem acento) e filtros de Tipo e Status refazem a lista na tela', async () => {
        const [c, h, a] = montar();
        await window.renderDocumentosArquivo(c, h, a);
        expect(el('da-contagem').textContent).toBe('2');
        expect(el('da-busca').getAttribute('data-action-input')).toBe('listaBuscar');
        expect(el('da-busca').getAttribute('placeholder')).toBe('Nome do documento');
        expect(el('da-busca').getAttribute('maxlength')).toBe('120');
        window.listaBuscar('da', 'politica');
        expect(linhas(c).map((x) => x[0])).toEqual(['Política de Privacidade']);
        expect(el('da-contagem').textContent).toBe('1 de 2');
        window.listaBuscar('da', '');
        expect([...el('da-f-tipo').options].map((o) => o.value)).toEqual(['', 'politica', 'norma', 'procedimento', 'termo', 'contrato', 'aditivo', 'relatorio', 'outro']);
        window.listaFiltrar('da', 'tipo', 'contrato');
        expect(linhas(c).map((x) => x[0])).toEqual(['Contrato <b>Fornecedor</b>']);
        window.listaFiltrar('da', 'tipo', '');
        expect([...el('da-f-status').options].map((o) => o.value)).toEqual(['', 'rascunho', 'publicado', 'obsoleto']);
        window.listaFiltrar('da', 'status', 'obsoleto');
        expect(c.textContent).toContain('Nada encontrado com a busca ou o filtro.');
        expect(apiMock.mock.calls.filter(([m]) => m === 'GET')).toHaveLength(1);
    });

    it('novo documento: exige Nome, Tipo e Status e manda o corpo que o servidor aceita', async () => {
        const [c, h, a] = montar();
        await window.renderDocumentosArquivo(c, h, a);
        await window.daAbrir(null);
        expect(document.querySelector('.modal-title').textContent).toBe('Documento');
        expect([...el('da-responsavel').options].map((o) => o.textContent)).toEqual(['Sem responsável', 'Pessoa Exemplo', 'Outra <i>Pessoa</i>']);
        await window.daSalvar();
        expect(el('da-erro').textContent).toContain('Nome, Tipo e Status');
        el('da-nome').value = ' Termo de uso ';
        el('da-tipo').value = 'termo';
        el('da-vencimento').value = '2027-01-31';
        el('da-responsavel').value = 'pa2';
        await window.daSalvar();
        expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/documentos-arquivo',
            { nome: 'Termo de uso', tipo: 'termo', status: 'rascunho', sem_vencimento: false, vencimento: '2027-01-31', responsavel_parte_id: 'pa2' });
        expect(window.forceCloseModal).toHaveBeenCalled();
    });

    it('editar: "Sem vencimento" limpa e trava a data; o PUT leva vencimento nulo', async () => {
        const [c, h, a] = montar();
        await window.renderDocumentosArquivo(c, h, a);
        await window.daAbrir('d1');
        expect(el('da-nome').value).toBe('Contrato <b>Fornecedor</b>');
        expect(el('da-vencimento').value).toBe('2027-03-31');
        expect(el('da-responsavel').value).toBe('pa1');
        el('da-sem-vencimento').checked = true;
        window.daSemVencimento();
        expect(el('da-vencimento').disabled).toBe(true);
        expect(el('da-vencimento').value).toBe('');
        await window.daSalvar();
        expect(apiMock).toHaveBeenCalledWith('PUT', '/api/v1/projects/p1/documentos-arquivo/d1',
            { nome: 'Contrato <b>Fornecedor</b>', tipo: 'contrato', status: 'publicado', sem_vencimento: true, vencimento: null, responsavel_parte_id: 'pa1' });
    });

    it('arquivo: mostra o atual com Ver, Baixar e Remover; envia o novo por multipart depois de salvar; recusa tipo errado', async () => {
        const [c, h, a] = montar();
        await window.renderDocumentosArquivo(c, h, a);
        await window.daAbrir('d1');
        expect(el('da-arquivo-atual').textContent).toContain('contrato.pdf');
        expect([...el('da-arquivo-atual').querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Ver', 'Baixar', 'Remover']);

        await window.daBaixar('d1');
        expect(baixarMock).toHaveBeenCalledWith('/api/v1/projects/p1/documentos-arquivo/d1/arquivo');

        const input = el('da-arquivo');
        Object.defineProperty(input, 'files', { value: [new File(['x'], 'planilha.xlsx')], configurable: true });
        await window.daSalvar();
        expect(el('da-erro').textContent).toContain('PDF, DOC ou DOCX');
        expect(apiMock.mock.calls.some(([m]) => m === 'PUT')).toBe(false);

        Object.defineProperty(input, 'files', { value: [new File(['%PDF'], 'novo.pdf')], configurable: true });
        await window.daSalvar();
        expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost/api/v1/projects/p1/documentos-arquivo/d1/arquivo',
            expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer t' } }));
        expect(globalThis.fetch.mock.calls[0][1].body).toBeInstanceOf(FormData);

        await window.daAbrir('d1');
        await comSim(window.daRemoverArquivo());
        expect(apiMock).toHaveBeenCalledWith('DELETE', '/api/v1/projects/p1/documentos-arquivo/d1/arquivo');
        expect(el('da-arquivo-atual').textContent).toContain('Nenhum arquivo enviado.');
    });

    it('excluir pede confirmação e apaga', async () => {
        const [c, h, a] = montar();
        await window.renderDocumentosArquivo(c, h, a);
        await window.daAbrir('d2');
        await comSim(window.daExcluir());
        expect(apiMock).toHaveBeenCalledWith('DELETE', '/api/v1/projects/p1/documentos-arquivo/d2');
    });

    it('papel só de leitura não vê criar nem editar, mas baixa o arquivo', async () => {
        S.user = { role: 'org_user' };
        const [c, h, a] = montar();
        await window.renderDocumentosArquivo(c, h, a);
        expect(a.innerHTML).toBe('');
        expect([...c.querySelectorAll('tbody button')].map((b) => b.textContent)).toEqual(['Baixar']);
    });
});
