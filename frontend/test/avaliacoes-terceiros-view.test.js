// Fila de avaliações de fornecedores (n.privacy, spec 2026-10-20): GET /projects/:id/terceiros agrupado por urgência. api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/avaliacoes-terceiros.js';
import html from '../login.html?raw';
import rota from '../src/router.js?raw';
import main from '../src/main.js?raw';
import { SO_PRIVACY, TELAS_DOS_MODULOS } from '../src/produto.js';
import { emDiasSP } from '../src/hoje.js';

const emDias = (n) => emDiasSP(n);
const T = (id, situacao, dias, extra = {}) => ({ id, nome: `Fornecedor ${id}`, terceiro_tipo: 'medio', metodo: 'questionario', situacao, nivel: 'medio',
    ultima_avaliacao: dias === null ? null : { resultado: situacao === 'reprovada' ? 'reprovado' : 'aprovado', valido_ate: emDias(dias) }, ...extra });
const LISTA = [
    T('ok', 'vigente', 200), T('breve', 'vigente', 10), T('v1', 'vencida', -5), T('v2', 'vencida', -40, { nivel: 'alto', terceiro_tipo: 'critico', metodo: 'auditoria' }),
    T('novo', 'pendente', null, { nivel: null, terceiro_tipo: null, metodo: null }), T('rep', 'reprovada', 100, { nome: 'Fornecedor <b>rep</b>' }),
];
const el = (id) => document.getElementById(id);
const nomes = (grupo) => [...el(grupo).querySelectorAll('tbody tr')].map((tr) => tr.cells[0].textContent);

async function abrir(corpo = LISTA) {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    servir({ 'GET /api/v1/projects/p9/terceiros': corpo });
    await window.renderAvaliacoesTerceiros(el('c'), el('h'), el('a'));
}

beforeEach(() => { S.token = 'tok'; S.user = { role: 'consultor' }; S.activeProject = { id: 'p9' }; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('fila de avaliações', () => {
    it('grupos com contagem, na ordem da urgência, e só os que têm fornecedor', async () => {
        await abrir();
        expect([...el('c').querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Vencidas (2)', 'Vencem em 30 dias (1)', 'Sem avaliação (1)', 'Reprovadas (1)', 'Em dia (1)']);
        await abrir([T('ok', 'vigente', 200)]);
        expect([...el('c').querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Em dia (1)']);
    });

    it('dentro do grupo, crítico primeiro; colunas, dias e método', async () => {
        await abrir();
        expect(nomes('av-vencida')).toEqual(['Fornecedor v2', 'Fornecedor v1']);
        expect([...el('av-vencida').querySelectorAll('thead th')].map((th) => th.textContent.trim())).toEqual(['Fornecedor', 'Criticidade', 'Tipo', 'Método', 'Vale até', 'Dias', 'Ações']);
        const linha = el('av-vencida').querySelector('tbody tr').textContent;
        expect(linha).toContain('Alto');
        expect(linha).toContain('Crítico');
        expect(linha).toContain('Auditoria');
        expect(linha).toContain('-40');
        expect(el('av-pendente').querySelector('tbody tr').textContent).toContain('Não avaliada');
    });

    it('Abrir leva à ficha na aba Avaliações; nome escapado', async () => {
        await abrir();
        const b = el('av-reprovada').querySelector('[data-action="abrirTerceiro"]');
        expect(JSON.parse(b.getAttribute('data-args'))).toEqual(['p9', 'rep', 'avaliacoes']);
        expect(el('av-reprovada').textContent).toContain('Fornecedor <b>rep</b>');
        expect(el('c').querySelector('tbody b')).toBeNull();
    });

    it('sem fornecedor: vazio que explica o método por tipo', async () => {
        await abrir([]);
        const t = el('c').textContent;
        for (const x of ['trust center', 'questionário', 'auditoria']) expect(t.toLowerCase()).toContain(x);
    });

    it('menu: item e tela do n.privacy, com ramo no render', () => {
        expect(html).toContain('id="nav-avaliacoes-terceiros"');
        expect(SO_PRIVACY).toContain('nav-avaliacoes-terceiros');
        expect(TELAS_DOS_MODULOS).toContain('avaliacoes-terceiros');
        expect(rota).toContain("S.view === 'avaliacoes-terceiros'");
        expect(main).toContain('views/avaliacoes-terceiros.js');
    });
});
