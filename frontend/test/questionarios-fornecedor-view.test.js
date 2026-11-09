// Modelos de avaliação de fornecedor (Conta e acessos) e Questionários do projeto (n.privacy), migration 0106 (fatia 1 da spec
// 2026-11-09-ciclo-avaliacao-fornecedor-design): abas por tipo, edição só para quem pode, chamadas certas e texto escapado.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, baixarArquivo: vi.fn(), API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/globals.js';
import '../src/views/modelos-fornecedor.js';
import '../src/views/questionarios-fornecedor.js';
import { SECOES_PRIVACY, TELAS_DA_CONTA, SO_PRIVACY } from '../src/produto.js';

const pergunta = (id, extra = {}) => ({ id, tema: 'Segurança', texto: `Há <b>política</b> ${id}?`, ordem: 10, ativa: 1, origem: 'padrao', ...extra });
const MODELOS = {
    pode_editar: true,
    modelos: [
        { tipo: 'critico', prazo_meses: 12, origem: 'padrao', a_validar: true, perguntas: [pergunta('c1')] },
        { tipo: 'medio', prazo_meses: 24, origem: 'consultoria', a_validar: false, perguntas: [pergunta('m1', { origem: 'consultoria' })] },
        { tipo: 'pequeno', prazo_meses: 36, origem: 'padrao', a_validar: true, perguntas: [pergunta('p1')] },
        { tipo: 'grande_provedor', prazo_meses: 12, origem: 'padrao', a_validar: true, perguntas: [pergunta('g1', { texto: 'Conferir o trust center' })] },
    ],
};
const QUESTIONARIO = {
    prazo_meses: 24, a_validar: false,
    perguntas: [
        { ...pergunta('m1'), fonte: 'modelo', usada: true, tipo: 'medio' },
        { ...pergunta('m2'), fonte: 'modelo', usada: false, tipo: 'medio' },
        { id: 'q9', tema: 'Local', texto: 'Própria <i>deste</i> projeto', ordem: 10, ativa: 1, fonte: 'projeto', usada: true, tipo: null, origem: 'projeto' },
    ],
};
const el = (id) => document.getElementById(id);
const tela = () => ['content', 'h', 'a'].map((id) => el(id));

beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="content"></div>';
    apiMock.mockReset();
    apiMock.mockImplementation(async (metodo, caminho) => {
        if (metodo === 'GET' && caminho === '/api/v1/fornecedor-modelos') return MODELOS;
        if (metodo === 'GET' && caminho.startsWith('/api/v1/projects/p1/homologacoes/perguntas?tipo=')) return QUESTIONARIO;
        return { ok: true };
    });
    S.user = { id: 'u1', role: 'consultoria_admin' };
    S.activeProject = { id: 'p1', client_name: 'Cliente' };
    S.projects = [S.activeProject];
});

describe('Modelos de avaliação de fornecedor (Conta e acessos)', () => {
    it('abas por tipo, aviso de modelo a validar, texto escapado; o grande provedor é roteiro', async () => {
        await window.renderModelosFornecedor(...tela());
        expect(el('h').textContent).toBe('Modelos de avaliação de fornecedor');
        expect([...document.querySelectorAll('[role="tab"]')].map((b) => b.textContent)).toEqual(['Crítico', 'Médio', 'Pequeno', 'Grande provedor']);
        expect(el('content').textContent).toContain('conteúdo padrão');
        expect(el('content').querySelector('b')).toBeNull();
        window.modelosFornecedorAba('grande_provedor');
        expect(el('content').textContent).toContain('Não vai ao fornecedor');
    });

    it('o admin salva o prazo, edita e cria pergunta pelas rotas da organização', async () => {
        await window.renderModelosFornecedor(...tela());
        window.modelosFornecedorAba('critico');
        el('mf-prazo').value = '18';
        await window.salvarPrazoModelo('critico');
        expect(apiMock).toHaveBeenCalledWith('PUT', '/api/v1/fornecedor-modelos/critico', { prazo_meses: 18 });
        el('mf-ativa-c1').checked = false;
        await window.salvarPerguntaModelo('critico', 'c1');
        expect(apiMock).toHaveBeenCalledWith('PUT', '/api/v1/fornecedor-modelos/critico/perguntas/c1', { tema: 'Segurança', texto: 'Há <b>política</b> c1?', ativa: false });
        el('mf-novo-tema').value = 'Auditoria'; el('mf-novo-texto').value = 'Há relatório?';
        await window.criarPerguntaModelo('critico');
        expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/fornecedor-modelos/critico/perguntas', { tema: 'Auditoria', texto: 'Há relatório?' });
    });

    it('sem pode_editar (consultor) não há campo nem botão', async () => {
        apiMock.mockImplementation(async () => ({ ...MODELOS, pode_editar: false }));
        await window.renderModelosFornecedor(...tela());
        expect(el('mf-prazo')).toBeNull();
        expect(el('content').querySelector('[data-action="salvarPerguntaModelo"]')).toBeNull();
        expect(el('content').textContent).toContain('Validade máxima da avaliação: 12 meses');
    });
});

describe('Questionários do projeto (n.privacy)', () => {
    it('mostra o modelo (só leitura, com "usar") e as próprias; liga e desliga pelo ajuste; cria própria com o tipo', async () => {
        await window.renderQuestionariosFornecedor(...tela());
        expect(el('h').textContent).toBe('Questionários');
        expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/homologacoes/perguntas?tipo=medio');
        expect(el('content').querySelector('b, i')).toBeNull();
        expect(el('qf-usar-m2').checked).toBe(false);
        el('qf-usar-m2').checked = true;
        await window.usarPerguntaModelo('m2');
        expect(apiMock).toHaveBeenCalledWith('PUT', '/api/v1/projects/p1/homologacoes/perguntas/modelo/m2', { ativa: true });
        el('qf-novo-tema').value = 'Local'; el('qf-novo-texto').value = 'Só deste tipo?'; el('qf-novo-tipo').value = 'medio';
        await window.criarPerguntaProjeto();
        expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/homologacoes/perguntas', { tema: 'Local', texto: 'Só deste tipo?', tipo: 'medio' });
        el('qf-novo-tema').value = 'Local'; el('qf-novo-texto').value = 'Para todos?'; el('qf-novo-tipo').value = '';
        await window.criarPerguntaProjeto();
        expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/homologacoes/perguntas', { tema: 'Local', texto: 'Para todos?', tipo: null });
        await window.questionariosAba('critico');
        expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/homologacoes/perguntas?tipo=critico');
    });

    it('ajuste recusado volta a caixa ao estado anterior', async () => {
        await window.renderQuestionariosFornecedor(...tela());
        apiMock.mockRejectedValueOnce(new Error('Somente a consultoria'));
        el('qf-usar-m1').checked = false;
        await window.usarPerguntaModelo('m1');
        expect(el('qf-usar-m1').checked).toBe(true);
    });

    it('o administrador do cliente só vê', async () => {
        S.user = { id: 'u2', role: 'org_admin' };
        await window.renderQuestionariosFornecedor(...tela());
        expect(el('qf-usar-m1')).toBeNull();
        expect(el('qf-novo-tema')).toBeNull();
        expect(el('content').textContent).toContain('Própria <i>deste</i> projeto');
    });

    it('no menu: Questionários em Fornecedores do n.privacy e o modelo em Conta e acessos', () => {
        expect(SECOES_PRIVACY.find(([t]) => t === 'Fornecedores')[1]).toContain('nav-questionarios-fornecedor');
        expect(SO_PRIVACY).toContain('nav-questionarios-fornecedor');
        expect(TELAS_DA_CONTA['modelos-fornecedor']).toBe('nav-modelos-fornecedor');
    });
});
