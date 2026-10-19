// Titulares e Dados de titular (n.privacy, Cadastros; spec 2026-10-19): duas telas sobre os catálogos do projeto, tipo fixo em cada.
// api() REAL; só o fetch é dublado. Corpos como o handler devolve (src/routes/ropa-abas.ts, catalogosApp): { ok, itens } e { ok, item }.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir, resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import '../src/views/catalogos.js';
import rota from '../src/router.js?raw';
import { SO_PRIVACY, TELAS_DOS_MODULOS } from '../src/produto.js';

initDelegation();

const B = '/api/v1/projects/p9/catalogos';
const TITULARES = [{ id: 't1', nome: 'Clientes <b>PF</b>', sensivel: false, descricao_padrao: null, status: 'ativo' }, { id: 't2', nome: 'Visitantes', sensivel: false, descricao_padrao: null, status: 'ativo' }];
const DADOS = [{ id: 'd1', nome: 'Nome completo', sensivel: false, descricao_padrao: null, status: 'ativo' }, { id: 'd2', nome: 'Dado de saúde', sensivel: true, descricao_padrao: null, status: 'ativo' }];
const rotas = (extra = {}) => ({ [`GET ${B}/titulares`]: { ok: true, itens: TITULARES }, [`GET ${B}/dados`]: { ok: true, itens: DADOS }, ...extra });
const el = (id) => document.getElementById(id);
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}${new URL(u, 'http://localhost').search}`);
const corpoDe = (f, chave) => {
    const c = f.mock.calls.findLast(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave);
    return c ? JSON.parse(c[1].body) : undefined;
};
const linhas = () => [...el('c').querySelectorAll('tbody tr')].map((tr) => tr.textContent);
const cabecalho = () => [...el('c').querySelectorAll('thead th')].map((t) => t.textContent.trim());

async function tela(qual, extra = {}) {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    const f = servir(rotas(extra));
    await window[qual === 'dados' ? 'renderDadosTitular' : 'renderTitulares'](el('c'), el('h'), el('a'));
    return f;
}

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9', client_name: 'Empresa Exemplo' };
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Titulares', () => {
    it('lista Titular e Empresa (o nome da empresa do projeto), escapada, sem abas', async () => {
        const f = await tela('titulares');
        expect(el('h').textContent).toBe('Titulares');
        expect(document.querySelector('[role="tab"]')).toBeNull();
        expect(cabecalho()).toEqual(['Titular', 'Empresa', 'Ações']);
        expect(linhas()[0]).toContain('Clientes <b>PF</b>');
        expect(linhas()[0]).toContain('Empresa Exemplo');
        expect(el('c').querySelector('tbody b')).toBeNull();
        expect(chamadas(f)).toEqual([`GET ${B}/titulares`]);
    });

    it('"Ver/Editar" abre o modal com o Titular e grava o nome', async () => {
        const f = await tela('titulares', { [`PUT ${B}/titulares/t1`]: { ok: true, item: {} } });
        el('c').querySelector('[data-action="catAbrir"]').click();
        expect(el('cat-nome').value).toBe('Clientes <b>PF</b>');
        expect(el('cat-sensivel')).toBeNull();
        el('cat-nome').value = 'Clientes pessoa física';
        await window.catSalvar('t1');
        expect(corpoDe(f, `PUT ${B}/titulares/t1`)).toEqual({ nome: 'Clientes pessoa física' });
    });

    it('"Novo titular" cria pelo mesmo modal', async () => {
        const f = await tela('titulares', { [`POST ${B}/titulares`]: { ok: true, item: { id: 't3' } } });
        expect(el('a').textContent).toContain('Novo titular');
        window.catAbrir(null);
        el('cat-nome').value = '  Fornecedores PF ';
        await window.catSalvar(null);
        expect(corpoDe(f, `POST ${B}/titulares`)).toEqual({ nome: 'Fornecedores PF' });
    });

    it('busca vai ao servidor como q', async () => {
        const f = await tela('titulares');
        el('cat-busca').value = 'clien';
        await window.catRecarregar();
        expect(chamadas(f)).toContain(`GET ${B}/titulares?q=clien`);
        expect(el('cat-busca').getAttribute('data-action-input')).toBe('catRecarregar');
    });

    it('quem só lê vê a lista e o modal sem gravar', async () => {
        S.user = { role: 'org_user' };
        await tela('titulares');
        expect(el('a').innerHTML).toBe('');
        window.catAbrir('t1');
        expect(el('cat-nome').disabled).toBe(true);
        expect(document.querySelector('[data-action="catSalvar"]')).toBeNull();
        expect(document.querySelector('[data-action="catExcluir"]')).toBeNull();
    });
});

describe('Dados de titular', () => {
    it('lista com o selo Sensível só no dado sensível; filtro "Sensíveis" sem ir ao servidor', async () => {
        const f = await tela('dados');
        expect(el('h').textContent).toBe('Dados de titular');
        const [comum, saude] = linhas();
        expect(comum).not.toContain('Sensível');
        expect(saude).toContain('Sensível');
        el('cat-sensiveis').checked = true;
        el('cat-sensiveis').dispatchEvent(new Event('change', { bubbles: true }));
        expect(linhas()).toHaveLength(1);
        expect(linhas()[0]).toContain('Dado de saúde');
        expect(f).toHaveBeenCalledTimes(1);
    });

    it('modal "Alterar Dado Pessoal": nome, "É um Dado Sensível?" e o aviso do vínculo com as Atividades', async () => {
        const f = await tela('dados', { [`PUT ${B}/dados/d1`]: { ok: true, item: {} } });
        window.catAbrir('d1');
        const modal = el('modal-content').textContent;
        expect(modal).toContain('Alterar Dado Pessoal');
        expect(modal).toContain('É um Dado Sensível?');
        expect(modal).toContain('Esse dado pessoal também será atualizado no registro vinculado aos titulares na base de Atividades.');
        expect(el('cat-nome').value).toBe('Nome completo');
        expect(el('cat-sensivel').value).toBe('nao');
        el('cat-sensivel').value = 'sim';
        await window.catSalvar('d1');
        expect(corpoDe(f, `PUT ${B}/dados/d1`)).toEqual({ nome: 'Nome completo', sensivel: true });
    });

    it('criar manda o nome e a marca de sensível', async () => {
        const f = await tela('dados', { [`POST ${B}/dados`]: { ok: true, item: { id: 'd3' } } });
        window.catAbrir(null);
        el('cat-nome').value = 'Biometria';
        el('cat-sensivel').value = 'sim';
        await window.catSalvar(null);
        expect(corpoDe(f, `POST ${B}/dados`)).toEqual({ nome: 'Biometria', sensivel: true });
    });

    it('Excluir inativa (o que já foi usado continua gravado), depois de confirmar', async () => {
        const f = await tela('dados', { [`PUT ${B}/dados/d2`]: { ok: true, item: {} } });
        vi.spyOn(window, 'confirmar').mockResolvedValue(true);
        window.catAbrir('d2');
        await window.catExcluir('d2');
        expect(corpoDe(f, `PUT ${B}/dados/d2`)).toEqual({ status: 'inativo' });
    });

    it('409 de nome repetido mostra o nome que já existe', async () => {
        await tela('dados');
        vi.stubGlobal('fetch', vi.fn(async (u, o = {}) => (o.method === 'POST'
            ? resposta({ error: 'Já existe um item com este nome', existente: { id: 'd1', nome: 'Nome completo' } }, 409)
            : resposta({ ok: true, itens: DADOS }))));
        window.catAbrir(null);
        el('cat-nome').value = 'nome completo';
        await window.catSalvar(null);
        expect(document.body.textContent).toContain('Já existe: Nome completo');
    });

    it('vazio: diz que os itens também nascem pelo "+" dentro da atividade', async () => {
        await tela('dados', { [`GET ${B}/dados`]: { ok: true, itens: [] } });
        expect(el('c').textContent).toContain('dentro da atividade');
    });
});

describe('ligação', () => {
    it('duas telas no router e no menu do n.privacy; a tela antiga de catálogos saiu', () => {
        expect(rota).toContain("S.view === 'titulares') renderTitulares(");
        expect(rota).toContain("S.view === 'dados-titular') renderDadosTitular(");
        expect(rota).not.toContain("'catalogos'");
        expect(SO_PRIVACY).toEqual(expect.arrayContaining(['nav-titulares', 'nav-dados-titular']));
        expect(TELAS_DOS_MODULOS).toEqual(expect.arrayContaining(['titulares', 'dados-titular']));
        expect(TELAS_DOS_MODULOS).not.toContain('catalogos');
    });
});
