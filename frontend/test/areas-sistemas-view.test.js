// Áreas e Ativos (n.privacy, Cadastros): departamentos e ativos do projeto, em listas leves.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/areas.js';
import '../src/views/sistemas.js';

const DEPTOS = [
    { id: 'd1', nome: 'Recursos <b>Humanos</b>', status: 'ativo', descricao: 'Folha e <i>admissão</i>' },
    { id: 'd2', nome: 'Jurídico', status: 'inativo' },
];
const ATIVOS = [
    { id: 'a1', name: 'ERP <img src=x onerror=alert(1)>', description: 'Sistema de gestão', category: 'Software', owner: 'Gerente de TI', location: 'Nuvem', status: 'Active' },
];

function montar() {
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div><h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    return [document.getElementById('c'), document.getElementById('h'), document.getElementById('a')];
}
const el = (id) => document.getElementById(id);

beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((m, url) => {
        if (m === 'GET' && url.endsWith('/departamentos')) return Promise.resolve(DEPTOS);
        if (m === 'GET' && url.endsWith('/assets')) return Promise.resolve(ATIVOS);
        return Promise.resolve({ ok: true });
    });
    window.render = vi.fn();
    S.activeProject = { id: 'p1', client_name: 'Empresa Exemplo <s>Ltda</s>' };
    S.user = { role: 'consultor' };
});

describe('Ativos: excluir e limpar', () => {
    it('Excluir pede confirmação e manda DELETE (exclusão lógica do servidor); cancelar não manda nada', async () => {
        const [c, h, a] = montar();
        await window.renderSistemas(c, h, a);
        const botao = c.querySelector('[data-action="excluirSistema"]');
        expect(botao).not.toBeNull();
        const p1 = window.excluirSistema('p1', 'a1', 'ERP');
        document.querySelector('[data-confirmar="nao"]').click();
        await p1;
        expect(apiMock).not.toHaveBeenCalledWith('DELETE', expect.anything());
        const p2 = window.excluirSistema('p1', 'a1', 'ERP');
        document.querySelector('[data-confirmar="sim"]').click();
        await p2;
        expect(apiMock).toHaveBeenCalledWith('DELETE', '/api/v1/projects/p1/assets/a1');
        expect(window.render).toHaveBeenCalled();
    });

    it('quem só lê não vê Excluir', async () => {
        S.user = { role: 'org_user' };
        const [c, h, a] = montar();
        await window.renderSistemas(c, h, a);
        expect(c.querySelector('[data-action="excluirSistema"]')).toBeNull();
    });

    it('o modal de novo ativo tem Limpar, que volta os campos ao que o modal desenhou; a edição não tem', async () => {
        const [c, h, a] = montar();
        await window.renderSistemas(c, h, a);
        window.openNovoSistemaModal('p1');
        el('sis-nome').value = 'Qualquer';
        el('sis-tipo').value = 'Hardware';
        expect(document.querySelector('#modal-content [data-action="limparModal"]')).not.toBeNull();
        window.limparModal();
        expect(el('sis-nome').value).toBe('');
        expect(el('sis-tipo').value).toBe('Software');
        window.openNovoSistemaModal('p1', 'a1');
        expect(document.querySelector('#modal-content [data-action="limparModal"]')).toBeNull();
    });
});

describe('Áreas', () => {
    it('lista Área (com a descrição) e Empresa, marca a inativa e escapa o texto', async () => {
        const [c, h, a] = montar();
        await window.renderAreas(c, h, a);
        expect(h.textContent).toBe('Áreas');
        expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/departamentos');
        const linhas = [...c.querySelectorAll('tbody tr')].map((tr) => tr.textContent);
        expect([...c.querySelectorAll('thead th')].map((th) => th.textContent.trim())).toEqual(['Área', 'Empresa', 'Ações']);
        expect(linhas[0]).toContain('Recursos <b>Humanos</b>');
        expect(linhas[0]).toContain('Folha e <i>admissão</i>');
        expect(linhas[0]).toContain('Empresa Exemplo <s>Ltda</s>');
        const selos = [...c.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('.badge')?.textContent ?? null);
        expect(selos).toEqual([null, 'Inativa']);
        expect(c.querySelector('tbody b, tbody i, tbody s')).toBeNull();
        expect(a.querySelector('.btn-primary').textContent.trim()).toBe('+ Nova área');
        expect(document.getElementById('areas-contagem').textContent).toBe('2');
    });

    it('busca no nome e na descrição, sem acento', async () => {
        const [c, h, a] = montar();
        await window.renderAreas(c, h, a);
        const busca = (v) => window.listaBuscar('areas', v);
        busca('ADMISSAO');
        expect([...c.querySelectorAll('tbody tr')]).toHaveLength(1);
        busca('juri');
        expect(c.querySelector('tbody tr').textContent).toContain('Jurídico');
        busca('zzz');
        expect(c.textContent).toContain('Nada encontrado com a busca ou o filtro.');
    });

    it('vazio explica que a área é usada na atividade do RoPA', async () => {
        apiMock.mockImplementation(() => Promise.resolve([]));
        const [c, h, a] = montar();
        await window.renderAreas(c, h, a);
        expect(c.textContent).toContain('Escopo');
        expect(c.textContent).toContain('Compartilhamento Interno');
    });

    it('criar, editar (nome e descrição) e inativar mandam o corpo que o servidor aceita', async () => {
        const [c, h, a] = montar();
        await window.renderAreas(c, h, a);
        window.openNovaAreaModal('p1');
        el('area-nome').value = '  Marketing ';
        await window.criarArea('p1');
        expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/departamentos', { nome: 'Marketing' });
        window.openNovaAreaModal('p1');
        el('area-nome').value = 'Vendas';
        el('area-descricao').value = ' Time comercial ';
        await window.criarArea('p1');
        expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/departamentos', { nome: 'Vendas', descricao: 'Time comercial' });

        window.openAreaModal('p1', 'd1');
        expect(el('area-e-nome').value).toBe('Recursos <b>Humanos</b>');
        expect(el('area-e-descricao').value).toBe('Folha e <i>admissão</i>');
        el('area-e-nome').value = 'Pessoas e Cultura';
        el('area-e-descricao').value = '';
        await window.salvarArea('p1', 'd1');
        expect(apiMock).toHaveBeenCalledWith('PUT', '/api/v1/projects/p1/departamentos/d1', { nome: 'Pessoas e Cultura', descricao: null });

        await window.mudarSituacaoArea('p1', 'd1', 'inativo');
        expect(apiMock).toHaveBeenCalledWith('PUT', '/api/v1/projects/p1/departamentos/d1', { status: 'inativo' });
    });

    it('papel só de leitura não vê os botões de escrita', async () => {
        S.user = { role: 'org_user' };
        const [c, h, a] = montar();
        await window.renderAreas(c, h, a);
        expect(a.innerHTML).toBe('');
        expect(c.querySelector('button')).toBeNull();
    });
});

describe('Ativos (a tela Sistemas)', () => {
    it('lista Ativo, Descrição e Empresa, escapando o nome', async () => {
        S.activeProject = { id: 'p1', client_name: 'Empresa Exemplo' };
        const [c, h, a] = montar();
        await window.renderSistemas(c, h, a);
        expect(h.textContent).toBe('Ativos');
        expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/assets');
        expect([...c.querySelectorAll('thead th')].map((t) => t.textContent.trim())).toEqual(['Ativo', 'Descrição', 'Empresa', 'Ações']);
        const linha = c.querySelector('tbody tr').textContent;
        expect(linha).toContain('ERP <img src=x onerror=alert(1)>');
        expect(linha).toContain('Sistema de gestão');
        expect(linha).toContain('Empresa Exemplo');
        expect(c.querySelector('tbody img')).toBeNull();
        expect(a.querySelector('.btn-primary').textContent.trim()).toBe('+ Novo ativo');
        expect(document.getElementById('sistemas-contagem').textContent).toBe('1');
    });

    it('busca no nome e na descrição do ativo', async () => {
        const [c, h, a] = montar();
        await window.renderSistemas(c, h, a);
        const busca = (v) => window.listaBuscar('sistemas', v);
        busca('GESTAO');
        expect(c.querySelectorAll('tbody tr')).toHaveLength(1);
        busca('zzz');
        expect(c.textContent).toContain('Nada encontrado com a busca ou o filtro.');
    });

    it('aceita a resposta embrulhada { ok, assets }', async () => {
        apiMock.mockImplementation(() => Promise.resolve({ ok: true, assets: ATIVOS }));
        const [c, h, a] = montar();
        await window.renderSistemas(c, h, a);
        expect(c.querySelectorAll('tbody tr').length).toBe(1);
    });

    it('vazio explica que o ativo é usado nas etapas da atividade do RoPA', async () => {
        apiMock.mockImplementation(() => Promise.resolve([]));
        const [c, h, a] = montar();
        await window.renderSistemas(c, h, a);
        expect(c.textContent).toContain('Nenhum ativo cadastrado.');
        expect(c.textContent).toContain('etapa');
    });

    it('modal com Ativo e Descrição do ativo primeiro; os campos leves de antes ficam abaixo', async () => {
        const [c, h, a] = montar();
        await window.renderSistemas(c, h, a);
        window.openNovoSistemaModal('p1');
        const rotulos = [...document.querySelectorAll('#modal-content .form-label')].map((l) => l.textContent.trim());
        expect(rotulos).toEqual(['Ativo', 'Descrição do ativo', 'Tipo', 'Responsável', 'Local de armazenamento']);
        el('sis-nome').value = '  CRM ';
        el('sis-descricao').value = ' Relacionamento com clientes ';
        el('sis-tipo').value = 'Software';
        el('sis-responsavel').value = 'Comercial';
        el('sis-local').value = '';
        await window.salvarSistema('p1', '');
        expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/assets', { name: 'CRM', description: 'Relacionamento com clientes', category: 'Software', owner: 'Comercial', location: '' });

        window.openNovoSistemaModal('p1', 'a1');
        expect(el('sis-nome').value).toBe('ERP <img src=x onerror=alert(1)>');
        expect(el('sis-descricao').value).toBe('Sistema de gestão');
        el('sis-nome').value = 'ERP';
        await window.salvarSistema('p1', 'a1');
        expect(apiMock).toHaveBeenCalledWith('PUT', '/api/v1/projects/p1/assets/a1', { name: 'ERP', description: 'Sistema de gestão', category: 'Software', owner: 'Gerente de TI', location: 'Nuvem' });
    });

    it('sem nome não envia', async () => {
        const [c, h, a] = montar();
        await window.renderSistemas(c, h, a);
        window.openNovoSistemaModal('p1');
        el('sis-nome').value = '   ';
        await window.salvarSistema('p1', '');
        expect(apiMock.mock.calls.filter(([m]) => m === 'POST')).toEqual([]);
    });
});
