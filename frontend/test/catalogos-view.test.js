// Titulares e dados pessoais (n.privacy, Cadastros): os catálogos do projeto, fora da atividade. api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir, resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/catalogos.js';

const B = '/api/v1/projects/p9/catalogos';
const TITULARES = [{ id: 't1', nome: 'Clientes <b>PF</b>', sensivel: false, descricao_padrao: null, status: 'ativo' }, { id: 't2', nome: 'Ex-colaboradores', sensivel: false, descricao_padrao: null, status: 'inativo' }];
const DADOS = [{ id: 'd1', nome: 'Nome completo', sensivel: false, descricao_padrao: null, status: 'ativo' }, { id: 'd2', nome: 'Dado de saúde', sensivel: true, descricao_padrao: null, status: 'ativo' }];
const rotas = (extra = {}) => ({ [`GET ${B}/titulares`]: { ok: true, itens: TITULARES }, [`GET ${B}/dados`]: { ok: true, itens: DADOS }, ...extra });
const el = (id) => document.getElementById(id);
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}${new URL(u, 'http://localhost').search}`);
const corpoDe = (f, chave) => {
    const c = f.mock.calls.findLast(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave);
    return c ? JSON.parse(c[1].body) : undefined;
};
const linhas = () => [...el('c').querySelectorAll('tbody tr')].map((tr) => tr.textContent);

async function tela(extra = {}) {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    const f = servir(rotas(extra));
    await window.renderCatalogos(el('c'), el('h'), el('a'));
    return f;
}

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9' };
    S.catalogosAba = null;
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Titulares e dados pessoais', () => {
    it('duas abas, Titulares abre primeiro; a lista vem escapada, sem os inativos', async () => {
        const f = await tela();
        expect(el('h').textContent).toBe('Titulares e dados pessoais');
        expect([...document.querySelectorAll('[role="tab"]')].map((b) => [b.textContent.trim(), b.getAttribute('aria-selected')]))
            .toEqual([['Titulares', 'true'], ['Dados pessoais', 'false']]);
        expect(chamadas(f)).toContain(`GET ${B}/titulares`);
        expect(linhas()[0]).toContain('Clientes <b>PF</b>');
        expect(el('c').querySelector('tbody b')).toBeNull();
    });

    it('Dados pessoais mostra o selo Sensível só no dado sensível', async () => {
        await tela();
        await window.catIrParaAba({}, 'dados');
        const [comum, saude] = linhas();
        expect(comum).not.toContain('Sensível');
        expect(saude).toContain('Sensível');
    });

    it('busca e "Mostrar inativos" vão ao servidor como q e inativos', async () => {
        const f = await tela();
        el('cat-busca').value = 'clien';
        el('cat-inativos').checked = true;
        await window.catRecarregar();
        expect(chamadas(f)).toContain(`GET ${B}/titulares?q=clien&inativos=1`);
        expect(el('cat-busca').getAttribute('data-action-input')).toBe('catRecarregar');
        expect(el('cat-inativos').getAttribute('data-action-change')).toBe('catRecarregar');
    });

    it('criar manda o nome (e sensível, no dado) e recarrega', async () => {
        const f = await tela({ [`POST ${B}/dados`]: { ok: true, item: { id: 'd3' } } });
        await window.catIrParaAba({}, 'dados');
        el('cat-novo-nome').value = '  Biometria  ';
        el('cat-novo-sensivel').checked = true;
        await window.catCriar();
        expect(corpoDe(f, `POST ${B}/dados`)).toEqual({ nome: 'Biometria', sensivel: true });
    });

    it('titular não tem a marca de sensível', async () => {
        const f = await tela({ [`POST ${B}/titulares`]: { ok: true, item: { id: 't3' } } });
        expect(el('cat-novo-sensivel')).toBeNull();
        el('cat-novo-nome').value = 'Visitantes';
        await window.catCriar();
        expect(corpoDe(f, `POST ${B}/titulares`)).toEqual({ nome: 'Visitantes' });
    });

    it('409 de nome repetido mostra o nome que já existe', async () => {
        await tela();
        const f = vi.fn(async (u, o = {}) => (o.method === 'POST'
            ? resposta({ error: 'Já existe um item com este nome', existente: { id: 't1', nome: 'Clientes PF' } }, 409)
            : resposta({ ok: true, itens: TITULARES })));
        vi.stubGlobal('fetch', f);
        el('cat-novo-nome').value = 'clientes pf';
        await window.catCriar();
        expect(document.body.textContent).toContain('Já existe: Clientes PF');
    });

    it('renomear pede o nome e manda o PUT', async () => {
        const f = await tela({ [`PUT ${B}/titulares/t1`]: { ok: true, item: {} } });
        vi.spyOn(window, 'pedirTexto').mockResolvedValue('Clientes pessoa física');
        await window.catRenomear('t1');
        expect(corpoDe(f, `PUT ${B}/titulares/t1`)).toEqual({ nome: 'Clientes pessoa física' });
    });

    it('inativar e reativar mandam o status; marcar sensível manda sensivel', async () => {
        const f = await tela({ [`PUT ${B}/titulares/t1`]: { ok: true, item: {} }, [`PUT ${B}/dados/d1`]: { ok: true, item: {} } });
        await window.catStatus('t1', 'inativo');
        expect(corpoDe(f, `PUT ${B}/titulares/t1`)).toEqual({ status: 'inativo' });
        await window.catIrParaAba({}, 'dados');
        await window.catSensivel('d1', true);
        expect(corpoDe(f, `PUT ${B}/dados/d1`)).toEqual({ sensivel: true });
    });

    it('vazio: diz que os itens também nascem pelo "+" dentro da atividade', async () => {
        await tela({ [`GET ${B}/titulares`]: { ok: true, itens: [] } });
        expect(el('c').textContent).toContain('dentro da atividade');
    });

    it('quem só lê vê a lista sem criar nem editar', async () => {
        S.user = { role: 'org_user' };
        await tela();
        expect(el('cat-novo-nome')).toBeNull();
        expect(el('c').querySelector('tbody button')).toBeNull();
    });
});
