// As outras listas do n.iso (frente 3A, spec A2): Ativos, Evidências, Políticas e normas e Partes passam pelo componente de
// lista (busca, filtros, contagem e exportar). Dados fictícios.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock, baixarArquivo } = vi.hoisted(() => ({ apiMock: vi.fn(), baixarArquivo: vi.fn(async () => {}) }));
vi.mock('../src/api.js', () => ({ api: apiMock, baixarArquivo, API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/globals.js';
import { initDelegation } from '../src/delegation.js';
import { emDiasSP } from '../src/hoje.js';
import '../src/views/monitor.js';
import '../src/views/compliance.js';
import '../src/views/documentos.js';
import '../src/views/partes.js';

initDelegation();

const PROJ = { id: 'p1', client_name: 'Cliente Ficticio', modulos: ['iso'] };
const B = '/api/v1/projects/p1';
const DADOS = {
    [`${B}/assets`]: [
        { id: 'a1', name: 'ERP Financeiro', owner: 'Ana Exemplo', category: 'Software', classification: 'Confidential', criticality: 'High' },
        { id: 'a2', name: 'Notebook', owner: 'Bruno Exemplo', category: 'Hardware', classification: 'Internal', criticality: 'Low' },
        { id: 'a3', name: 'Contratos', owner: 'Carla Exemplo', category: 'Informacao', classification: 'Confidential', criticality: 'Medium' },
    ],
    [`${B}/evidence`]: [
        { id: 'e1', file_name: 'backup.pdf', control_id: 'k1', valido_ate: emDiasSP(30), evaluation_status: 'conforming' },
        { id: 'e2', file_name: 'mfa.png', control_id: 'k2', valido_ate: emDiasSP(-1), evaluation_status: 'non_conforming' },
        { id: 'e3', file_name: 'ata.docx', control_id: null, evaluation_status: 'pending' },
    ],
    [`${B}/controls`]: [{ id: 'k1', title: 'Cópias de segurança' }, { id: 'k2', title: 'Autenticação segura' }],
    [`${B}/documentos`]: [
        { id: 'd2', tipo: 'norma', titulo: 'Norma de senhas', status: 'rascunho', pai_id: 'd1' },
        { id: 'd1', tipo: 'politica', titulo: 'Política de segurança', status: 'vigente', pai_id: null },
        { id: 'd3', tipo: 'politica', titulo: 'Política de privacidade', status: 'vigente', pai_id: null },
    ],
    [`${B}/partes`]: [
        { id: 'p1', tipo: 'pessoa', nome: 'Ana Exemplo', email: 'ana@exemplo.com', status: 'ativa' },
        { id: 'p2', tipo: 'organizacao', nome: 'Fornecedor Ficticio', email: null, status: 'inativa' },
    ],
    [`${B}/departamentos`]: [{ id: 'dp1', nome: 'Financeiro', status: 'ativo' }, { id: 'dp2', nome: 'Jurídico', status: 'ativo' }],
};

beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>'
        + '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    apiMock.mockReset();
    apiMock.mockImplementation(async (metodo, caminho) => (metodo === 'GET' && caminho in DADOS ? DADOS[caminho] : []));
    baixarArquivo.mockClear();
    S.user = { id: 'u1', role: 'consultor' };
    S.activeProject = PROJ;
    S.currentProject = null;
    S.projects = [PROJ];
    S.filtroPainel = null;
    history.replaceState(null, '', '/iso');
});

const tela = (fn) => window[fn](...['c', 'h', 'a'].map((id) => document.getElementById(id)));
const linhas = (sel = '#c') => [...document.querySelectorAll(`${sel} tbody tr`)].map((tr) => tr.textContent);
const contagem = (id) => document.getElementById(`${id}-contagem`).textContent;
const opcoes = (sel) => [...document.querySelectorAll(`${sel} option`)].map((o) => o.textContent);
const digitar = (sel, v) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
const escolher = (sel, v) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); };
const exportar = () => document.querySelector('#c [data-action="listaExportar"]');

describe('outras listas do n.iso', () => {
    it('Ativos: busca pelo responsável, filtros com rótulo, exportar pela lista (não no topo)', async () => {
        await tela('renderAssets');
        expect(contagem('ativos')).toBe('3');
        digitar('#ativos-busca', 'bruno');
        expect(linhas()).toEqual([expect.stringContaining('Notebook')]);
        digitar('#ativos-busca', '');
        expect(opcoes('#ativos-f-classificacao')).toEqual(['Todos', 'Confidencial', 'Interno']);
        expect(opcoes('#ativos-f-categoria')).toContain('Informação');
        expect(opcoes('#ativos-f-criticidade')).toEqual(['Todos', 'Alto', 'Baixo', 'Médio']);
        escolher('#ativos-f-criticidade', 'Medium');
        expect(linhas()).toEqual([expect.stringContaining('Contratos')]);
        expect(contagem('ativos')).toBe('1 de 3');
        exportar().click();
        expect(baixarArquivo).toHaveBeenCalledWith('/api/v1/projects/p1/export/assets');
        expect(document.getElementById('a').textContent).not.toMatch(/Exportar/);
    });

    it('Evidências: busca pelo controle, filtros de avaliação e validade, sem exportar', async () => {
        await tela('renderEvidence');
        expect(contagem('evidencias')).toBe('3');
        digitar('#evidencias-busca', 'autenticacao');
        expect(linhas()).toEqual([expect.stringContaining('mfa.png')]);
        digitar('#evidencias-busca', '');
        expect(opcoes('#evidencias-f-validade')).toEqual(['Todos', 'Em dia', 'Vencida', 'Sem validade']);
        escolher('#evidencias-f-validade', 'sem');
        expect(linhas()).toEqual([expect.stringContaining('ata.docx')]);
        escolher('#evidencias-f-validade', '');
        escolher('#evidencias-f-avaliacao', 'conforming');
        expect(linhas()).toEqual([expect.stringContaining('backup.pdf')]);
        expect(exportar()).toBeNull();
    });

    it('Políticas e normas: a árvore sem filtro, busca e filtros de tipo e situação', async () => {
        await tela('renderDocumentos');
        expect(linhas()).toEqual([
            expect.stringContaining('Política de segurança'), expect.stringContaining('Norma de senhas'), expect.stringContaining('Política de privacidade')]);
        expect([...document.querySelectorAll('#c [data-nivel]')].map((e) => e.dataset.nivel)).toEqual(['0', '1', '0']);
        digitar('#documentos-busca', 'senhas');
        expect(linhas()).toEqual([expect.stringContaining('Norma de senhas')]);
        digitar('#documentos-busca', '');
        expect(opcoes('#documentos-f-tipo')).toEqual(['Todos', 'Norma', 'Política']);
        escolher('#documentos-f-situacao', 'vigente');
        expect(contagem('documentos')).toBe('2 de 3');
        escolher('#documentos-f-tipo', 'norma');
        expect(document.getElementById('c').textContent).toContain('Nada encontrado com a busca ou o filtro.');
    });

    it('Partes: partes com busca pelo e-mail e filtros', async () => {
        await tela('renderPartes');
        expect(contagem('partes')).toBe('2');
        digitar('#partes-busca', 'ana@');
        expect(linhas('#partes-corpo')).toEqual([expect.stringContaining('Ana Exemplo')]);
        digitar('#partes-busca', '');
        expect(opcoes('#partes-f-tipo')).toEqual(['Todos', 'Organização', 'Pessoa']);
        escolher('#partes-f-situacao', 'inativa');
        expect(linhas('#partes-corpo')).toEqual([expect.stringContaining('Fornecedor Ficticio')]);
    });
});
