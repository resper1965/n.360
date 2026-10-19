// Cadastros do legado no n.privacy (spec 2026-10-19): Empresas, Parceiros e o lugar de Documentos (a tela é da Frente B).
// api() REAL; só o fetch é dublado. Corpos como os handlers devolvem (src/routes/nucleo.ts: lista crua de partes; projects.ts: /empresa).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', async (orig) => ({ ...(await orig()), navigate: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import '../src/views/empresa.js';
import '../src/views/parceiros.js';
import { render } from '../src/router.js';
import rota from '../src/router.js?raw';
import main from '../src/main.js?raw';
import { SO_PRIVACY, TELAS_DOS_MODULOS } from '../src/produto.js';

initDelegation();

const P = '/api/v1/projects/p9';
const PARTES = [
    { id: 'o2', tipo: 'organizacao', nome: 'Fornecedor <b>Exemplo</b>', email: 'contato@fornecedor.example', status: 'ativa' },
    { id: 'o1', tipo: 'organizacao', nome: 'Agência Exemplo', email: null, status: 'ativa' },
    { id: 'o3', tipo: 'organizacao', nome: 'Antiga Exemplo', email: null, status: 'inativa' },
    { id: 'p1', tipo: 'pessoa', nome: 'Pessoa Exemplo', email: null, status: 'ativa' },
];
const el = (id) => document.getElementById(id);
const corpoDe = (f, chave) => {
    const c = f.mock.calls.findLast(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave);
    return c ? JSON.parse(c[1].body) : undefined;
};
const montar = () => { document.body.innerHTML = '<h1 id="header-title"></h1><div id="header-actions"></div><div id="content"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>'; };
const tela = () => [el('content'), el('header-title'), el('header-actions')];

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9', client_name: 'Empresa Exemplo' };
    window.updateActiveProjectWidget = vi.fn();
    window.updateHeaderUser = vi.fn();
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Empresas', () => {
    it('lista a empresa do projeto e "Ver/Editar" abre os Dados da empresa', async () => {
        montar();
        servir({ [`GET ${P}/empresa`]: { empresa: { razao_social: 'Empresa Exemplo <b>Ltda</b>', nome_fantasia: null, cnpj: '11222333000181', municipio: 'São Paulo', uf: 'SP' }, pode_editar: true } });
        window.abrirDadosEmpresa = vi.fn();
        await window.renderEmpresas(...tela());
        expect(el('header-title').textContent).toBe('Empresas');
        expect([...el('content').querySelectorAll('thead th')].map((t) => t.textContent.trim())).toEqual(['Empresa', 'CNPJ', 'Cidade', 'Ações']);
        const [linha] = [...el('content').querySelectorAll('tbody tr')].map((tr) => tr.textContent);
        expect(linha).toContain('Empresa Exemplo <b>Ltda</b>');
        expect(linha).toContain('11.222.333/0001-81');
        expect(linha).toContain('São Paulo/SP');
        el('content').querySelector('[data-action="abrirDadosEmpresa"]').click();
        expect(window.abrirDadosEmpresa).toHaveBeenCalledWith('p9');
    });
});

describe('Parceiros', () => {
    async function abrir(extra = {}) {
        montar();
        const f = servir({ [`GET ${P}/partes`]: PARTES, ...extra });
        await window.renderParceiros(...tela());
        return f;
    }

    it('só as organizações ativas, por nome, com busca e ordem invertível sem ir ao servidor', async () => {
        const f = await abrir();
        expect(el('header-title').textContent).toBe('Parceiros');
        const nomes = () => [...el('content').querySelectorAll('tbody tr')].map((tr) => tr.cells[0].textContent.trim());
        expect(nomes()).toEqual(['Agência Exemplo', 'Fornecedor <b>Exemplo</b>']);
        expect(el('content').querySelector('tbody b')).toBeNull();
        el('content').querySelector('[data-action="parceirosOrdem"]').click();
        expect(nomes()).toEqual(['Fornecedor <b>Exemplo</b>', 'Agência Exemplo']);
        el('pc-busca').value = 'agenc';
        el('pc-busca').dispatchEvent(new Event('input', { bubbles: true }));
        expect(nomes()).toEqual(['Agência Exemplo']);
        expect(f).toHaveBeenCalledTimes(1);
    });

    it('"Novo parceiro" cria a organização', async () => {
        const f = await abrir({ [`POST ${P}/partes`]: { ok: true, id: 'o9' } });
        expect(el('header-actions').textContent).toContain('Novo parceiro');
        window.parceiroAbrir(null);
        el('pc-nome').value = ' Parceiro Exemplo ';
        el('pc-email').value = '';
        await window.parceiroSalvar(null);
        expect(corpoDe(f, `POST ${P}/partes`)).toEqual({ tipo: 'organizacao', nome: 'Parceiro Exemplo', email: null });
    });

    it('editar manda nome e e-mail; Excluir inativa', async () => {
        const f = await abrir({ [`PUT ${P}/partes/o1`]: { ok: true } });
        window.parceiroAbrir('o1');
        el('pc-email').value = 'contato@agencia.example';
        await window.parceiroSalvar('o1');
        expect(corpoDe(f, `PUT ${P}/partes/o1`)).toEqual({ nome: 'Agência Exemplo', email: 'contato@agencia.example' });
        vi.spyOn(window, 'confirmar').mockResolvedValue(true);
        await window.parceiroExcluir('o1');
        expect(corpoDe(f, `PUT ${P}/partes/o1`)).toEqual({ status: 'inativa' });
    });

    it('"Avaliar como fornecedor" abre a ficha em Fornecedores, na Criticidade', async () => {
        await abrir();
        window.abrirTerceiro = vi.fn();
        const b = el('content').querySelector('[data-action="abrirTerceiro"]');
        expect(JSON.parse(b.getAttribute('data-args'))).toEqual(['p9', 'o1', 'criticidade']);
    });

    it('quem só lê não vê criar nem editar', async () => {
        S.user = { role: 'org_user' };
        await abrir();
        expect(el('header-actions').innerHTML).toBe('');
        expect(el('content').querySelector('[data-action="parceiroExcluir"]')).toBeNull();
    });
});

describe('Documentos (Frente B)', () => {
    it('com ela, o router a chama', () => {
        montar();
        window.renderDocumentosArquivo = vi.fn();
        S.view = 'documentos-arquivo';
        render();
        expect(window.renderDocumentosArquivo).toHaveBeenCalledWith(el('content'), el('header-title'), el('header-actions'));
        delete window.renderDocumentosArquivo;
    });
});

describe('ligação', () => {
    it('Empresas, Parceiros e Documentos no router, no menu do n.privacy e na lista do ?tela=', () => {
        expect(rota).toContain("S.view === 'parceiros') renderParceiros(");
        expect(rota).toContain("S.view === 'empresas') renderEmpresas(");
        expect(main).toContain("import './views/parceiros.js';");
        expect(SO_PRIVACY).toEqual(expect.arrayContaining(['nav-empresas', 'nav-parceiros', 'nav-documentos-arquivo']));
        expect(TELAS_DOS_MODULOS).toEqual(expect.arrayContaining(['empresas', 'parceiros', 'documentos-arquivo']));
    });
});
