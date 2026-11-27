// n.ot E2, tarefa 4: lote decidido item a item (recusar), prazo, link do gravado, desfecho do achado e o helper dataDoSqlite.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/ot.js';
import { dataDoSqlite } from '../src/ot-comum.js';
import { desenhar } from './ot-abrir.js';
import { permissoesPeloPapel } from './ot-abrir.js';

// GET /ot/permissoes: a tela lê do servidor (spec 2026-11-26 §6); aqui, a resposta que o servidor daria ao papel do teste.
beforeEach(permissoesPeloPapel);

const B = '/api/v1/projects/p1/ot';
const el = (id) => document.getElementById(id);
const pausa = () => new Promise((r) => setTimeout(r, 0));
const LOTE = { id: 'x1', site_id: 's1', fonte: 'planilha', status: 'em_revisao', criado_por: 'u-tec', motivo: null, created_at: '2026-11-11 01:00:00' };
const ITEM = (id, linha, extra = {}) => ({ id, linha, decisao: 'pendente', motivo: null, erros: [], possivel_duplicata: false, duplicata_de: null,
    dados: { nome: `Item ${linha}`, ip: '10.0.0.5', mascarado: false }, ...extra });
let chamadas;
let lote;
function servir(extra = {}) {
    chamadas = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
        const k = `${opts.method || 'GET'} ${new URL(url, 'http://localhost').pathname}`;
        chamadas.push({ k, opts });
        const rotas = { [`GET ${B}/sites`]: { sites: [{ id: 's1', nome: 'SE Norte' }] }, [`GET ${B}/lotes`]: { lotes: [] },
            [`GET ${B}/lotes/x1`]: () => lote, [`POST ${B}/lotes/x1/itens/i1/recusar`]: { ok: true }, ...extra };
        return k in rotas ? resposta(typeof rotas[k] === 'function' ? rotas[k]() : rotas[k]) : resposta({ error: `sem rota ${k}` }, 404);
    }));
}
const botoes = () => [...document.querySelectorAll('#a .btn-primary, #c .btn-primary')];

beforeEach(async () => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok';
    S.user = { id: 'u-consultor', role: 'consultor' };
    S.activeProject = { id: 'p1', modulos: ['ot'] };
    S.otLote = 'x1';
    lote = { lote: LOTE, itens: [ITEM('i1', 2), ITEM('i2', 3)] };
    window.render = vi.fn(() => desenhar('coleta'));
    const { initDelegation } = await import('../src/delegation.js');
    initDelegation();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); document.querySelectorAll('.confirmar').forEach((x) => x.remove()); });

describe('dataDoSqlite', () => {
    it('lê o created_at do SQLite como UTC, em qualquer fuso', () => {
        expect(dataDoSqlite('2026-11-11 01:00:00').toISOString()).toBe('2026-11-11T01:00:00.000Z');
    });
});

describe('dataDoSqlite sem data', () => {
    it('null e undefined viram null', () => { expect(dataDoSqlite(null)).toBeNull(); expect(dataDoSqlite(undefined)).toBeNull(); });
});

describe('lote item a item', () => {
    it('409 na recusa mostra o erro e redesenha a tela', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => (opts.method === 'POST' ? resposta({ error: 'Item já decidido' }, 409)
            : resposta(String(url).endsWith('/lotes/x1') ? lote : String(url).endsWith('/sites') ? { sites: [] } : { lotes: [] }))));
        await desenhar('coleta');
        window.render.mockClear();
        const p = window.otRecusarItem('x1', 'i1');
        await pausa();
        document.querySelector('.confirmar input').value = 'motivo ok';
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        expect(document.querySelector('.toast')?.textContent).toContain('Item já decidido');
        expect(window.render).toHaveBeenCalled();
    });

    it('409 em aprovar e em rejeitar mostra o erro e redesenha', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => (opts.method === 'POST' ? resposta({ error: 'O lote não está em revisão' }, 409)
            : resposta(String(url).endsWith('/lotes/x1') ? lote : String(url).endsWith('/sites') ? { sites: [] } : { lotes: [] }))));
        await desenhar('coleta');
        for (const [acao, botao] of [['otAprovarLote', 'sim'], ['otRejeitarLote', 'sim']]) {
            document.querySelectorAll('.toast').forEach((t) => t.remove());
            window.render.mockClear();
            const p = window[acao]('x1');
            await pausa();
            const campo = document.querySelector('.confirmar input');
            if (campo) campo.value = 'motivo ok';
            document.querySelector(`[data-confirmar="${botao}"]`).click();
            await p;
            expect(document.querySelector('.toast')?.textContent, acao).toContain('O lote não está em revisão');
            expect(window.render, acao).toHaveBeenCalled();
        }
    });

    it('um recusado e um pendente: rótulo e confirmação normais', async () => {
        lote = { lote: LOTE, itens: [ITEM('i1', 2, { decisao: 'recusado', motivo: 'xx ok' }), ITEM('i2', 3)] };
        servir();
        await desenhar('coleta');
        expect(botoes().map((b) => b.textContent)).toEqual(['Aprovar os restantes (1)']);
        const p = window.otAprovarLote('x1');
        await pausa();
        expect(document.querySelector('.confirmar-texto').textContent).not.toContain('Todos os itens foram recusados');
        document.querySelector('[data-confirmar="nao"]').click();
        await p;
    });

    it('todos recusados: o principal vira "Concluir lote" e a confirmação diz que tudo foi recusado', async () => {
        lote = { lote: LOTE, itens: [ITEM('i1', 2, { decisao: 'recusado', motivo: 'xx ok' }), ITEM('i2', 3, { decisao: 'recusado', motivo: 'yy ok' })] };
        servir();
        await desenhar('coleta');
        expect(botoes().map((b) => b.textContent)).toEqual(['Concluir lote']);
        const p = window.otAprovarLote('x1');
        await pausa();
        expect(document.querySelector('.confirmar-texto').textContent).toContain('Todos os itens foram recusados');
        document.querySelector('[data-confirmar="nao"]').click();
        await p;
    });

    it('o decisor vê Recusar no item pendente; o autor não', async () => {
        servir();
        await desenhar('coleta');
        expect([...document.querySelectorAll('[data-action="otRecusarItem"]')]).toHaveLength(2);
        S.user = { id: 'u-tec', role: 'org_admin' };
        await desenhar('coleta');
        expect(document.querySelector('[data-action="otRecusarItem"]')).toBeNull();
    });

    it('recusar envia o motivo, redesenha e o item mostra Recusado com o motivo; o botão vira "Aprovar os restantes (1)"', async () => {
        servir();
        await desenhar('coleta');
        expect(botoes().map((b) => b.textContent)).toEqual(['Aprovar lote']);
        const p = window.otRecusarItem('x1', 'i1');
        await pausa();
        document.querySelector('.confirmar input').value = 'MAC não confere <i>';
        document.querySelector('[data-confirmar="sim"]').click();
        lote = { lote: LOTE, itens: [ITEM('i1', 2, { decisao: 'recusado', motivo: 'MAC não confere <i>' }), ITEM('i2', 3)] };
        await p;
        await pausa();
        expect(JSON.parse(chamadas.find((x) => x.k === `POST ${B}/lotes/x1/itens/i1/recusar`).opts.body)).toEqual({ motivo: 'MAC não confere <i>' });
        const linha = document.querySelector('#c tbody tr').textContent;
        expect(linha).toContain('Recusado');
        expect(linha).toContain('MAC não confere <i>');
        expect(document.querySelector('#c tbody tr i')).toBeNull();
        expect(botoes().map((b) => b.textContent)).toEqual(['Aprovar os restantes (1)']);
    });

    it('motivo curto não envia', async () => {
        servir();
        await desenhar('coleta');
        const p = window.otRecusarItem('x1', 'i1');
        await pausa();
        document.querySelector('.confirmar input').value = 'ab';
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        expect(chamadas.some((x) => x.k.endsWith('/recusar'))).toBe(false);
    });

    it('prazo: created_at do SQLite (UTC) + 7 dias, em São Paulo, com os dias que faltam', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-12T15:00:00Z'));
        servir();
        await desenhar('coleta');
        // 01:00Z de 11/11 é 22:00 de 10/11 em SP: o prazo é 17/11, faltam 5 dias.
        expect(el('c').textContent).toContain('Decidir até 17/11 (faltam 5 dias)');
    });

    it('lote concluído: item gravado tem "Ver no inventário", que abre a Base do site', async () => {
        lote = { lote: { ...LOTE, status: 'aprovado' }, itens: [ITEM('i1', 2, { decisao: 'gravado', registro_id: 'a9' })] };
        servir();
        window.otTela = vi.fn();
        await desenhar('coleta');
        expect(el('c').textContent).not.toContain('Decidir até');
        const link = document.querySelector('[data-action="otVerNoInventario"]');
        expect(link.textContent).toBe('Ver no inventário');
        expect(link.getAttribute('aria-label')).toContain('linha 2');
        window.otVerNoInventario('s1');
        expect(window.otTela).toHaveBeenCalledWith('site', 's1', 'base');
    });
});

describe('desfecho do achado no levantamento', () => {
    const LEV = { id: 'l1', site_id: 's1', tipo: 'entrevista', realizado_em: '2026-11-01', roteiro: {}, situacao: 'aberto', achados: 3 };
    const ACH = (id, extra) => ({ id, levantamento_id: 'l1', entidade: 'ativo', origem: 'consultor', situacao: 'enviado', desfecho: null, lote_id: 'x1',
        evidencia: 'e', erros: [], dados: { nome: `Ativo ${id}`, ip: '•••', mascarado: true }, ...extra });
    it('mostra No inventário (com link), Recusado: motivo e, sem desfecho, Enviado para aprovação', async () => {
        servir({ [`GET ${B}/levantamentos/l1`]: { levantamento: LEV, achados: [ACH('a1', { desfecho: 'no_inventario' }),
            ACH('a2', { desfecho: 'recusado', motivo: 'duplicado <b>' }), ACH('a3')] }, [`GET ${B}/roteiro`]: { perguntas: [] }, [`GET ${B}/zonas`]: { zonas: [] } });
        S.otLevantamento = 'l1'; S.otLote = null;
        await desenhar('levantamento');
        const linha = (n) => [...document.querySelectorAll('#c tbody tr')].find((tr) => tr.textContent.includes(n));
        expect(linha('Ativo a1').textContent).toContain('No inventário');
        expect(linha('Ativo a1').querySelector('[data-action="otVerNoInventario"]')).toBeTruthy();
        expect(linha('Ativo a1').textContent).not.toContain('Enviado para aprovação');
        expect(linha('Ativo a2').textContent).toContain('Recusado: duplicado <b>');
        expect(linha('Ativo a2').querySelector('b')).toBeNull();
        expect(linha('Ativo a3').textContent).toContain('Enviado para aprovação');
    });
});

describe('item que altera ou remove (alvo_id): o nome é o do alvo, de nomes_alvos', () => {
    it('"Remover: X" e "Alterar: X", sem IP do alvo', async () => {
        lote = { lote: LOTE, itens: [ITEM('i1', 2, { dados: { alvo_id: 'a1', remover: 1 } }), ITEM('i2', 3, { dados: { alvo_id: 'a1', nome: 'X' } }),
            ITEM('i3', 4, { entidade: 'fluxo', dados: { alvo_id: 'f1', remover: 1 } })], nomes_alvos: { a1: 'Switch velho', f1: 'RTU-01 → Fora da empresa' } };
        servir();
        await desenhar('coleta');
        const linhas = [...el('c').querySelectorAll('tbody tr')].map((l) => l.textContent);
        expect(linhas[0]).toContain('Remover: Switch velho');
        expect(linhas[1]).toContain('Alterar: Switch velho');
        expect(linhas[2]).toContain('Remover: RTU-01 → Fora da empresa');
    });
});
