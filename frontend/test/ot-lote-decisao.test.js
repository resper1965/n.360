// n.ot E2, tarefa 4: lote decidido item a item (recusar), prazo, link do gravado, desfecho do achado e o helper dataDoSqlite.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/ot.js';
import { dataDoSqlite } from '../src/ot-comum.js';
import { desenhar } from './ot-abrir.js';

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

describe('lote item a item', () => {
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
        window.otVerNoInventario('s1');
        expect(window.otTela).toHaveBeenCalledWith('site', 's1', 'projeto', { otSub: 'base' });
    });
});

describe('desfecho do achado no levantamento', () => {
    const LEV = { id: 'l1', site_id: 's1', tipo: 'entrevista', realizado_em: '2026-11-01', roteiro: {}, situacao: 'aberto', achados: 3 };
    const ACH = (id, extra) => ({ id, levantamento_id: 'l1', entidade: 'ativo', origem: 'consultor', situacao: 'enviado', desfecho: null, lote_id: 'x1',
        evidencia: 'e', erros: [], dados: { nome: `Ativo ${id}`, ip: '•••', mascarado: true }, ...extra });
    it('mostra No inventário (com link), Recusado: motivo e, sem desfecho, Enviado ao lote', async () => {
        servir({ [`GET ${B}/levantamentos/l1`]: { levantamento: LEV, achados: [ACH('a1', { desfecho: 'no_inventario' }),
            ACH('a2', { desfecho: 'recusado', motivo: 'duplicado <b>' }), ACH('a3')] }, [`GET ${B}/roteiro`]: { perguntas: [] }, [`GET ${B}/zonas`]: { zonas: [] } });
        S.otLevantamento = 'l1'; S.otLote = null;
        await desenhar('levantamento');
        const linha = (n) => [...document.querySelectorAll('#c tbody tr')].find((tr) => tr.textContent.includes(n));
        expect(linha('Ativo a1').textContent).toContain('No inventário');
        expect(linha('Ativo a1').querySelector('[data-action="otVerNoInventario"]')).toBeTruthy();
        expect(linha('Ativo a1').textContent).not.toContain('Enviado ao lote');
        expect(linha('Ativo a2').textContent).toContain('Recusado: duplicado <b>');
        expect(linha('Ativo a2').querySelector('b')).toBeNull();
        expect(linha('Ativo a3').textContent).toContain('Enviado ao lote');
    });
});
