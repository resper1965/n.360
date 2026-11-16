// Painel do n.privacy e o modal de indicar o encarregado. api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/encarregado.js';

const el = (id) => document.getElementById(id);
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);

beforeEach(() => {
    S.token = 'tok'; S.user = { id: 'u1', role: 'consultor' }; S.activeProject = { id: 'p9' }; S.view = 'encarregado'; window.render = vi.fn();
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Painel do n.privacy (encarregado)', () => {
    it('a entrada é o painel (views/painel.js), uma chamada com ?modulo=privacy e nada da visão antiga', async () => {
        S.painel = {};
        const f = servir({ 'GET /api/v1/projects/p9/painel': { visao: 'equipe', modulos: { privacy: { saude: { tom: 'ok', rotulo: 'Em dia', frase: 'x' }, numeros: [], comecando: true, passos: [] } }, saude: { tom: 'ok', rotulo: 'Em dia', frase: 'x', apoio: '' } } });
        await window.renderEncarregado(el('c'), el('h'), el('a'));
        expect(el('h').textContent).toBe('Painel');
        expect(chamadas(f)).toEqual(['GET /api/v1/projects/p9/painel']);
        expect(el('c').querySelector('.stat-card')).toBeNull();
    });

    it('sem encarregado: botão de indicar lista as pessoas e envia o vínculo ao confirmar', async () => {
        document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
        const f = servir({
            'GET /api/v1/projects/p9/partes': [{ id: 'pe7', nome: 'Rita <b>Exemplo</b>', tipo: 'pessoa' }],
            'POST /api/v1/projects/p9/partes/pe7/vinculos': { id: 'v1' },
        });
        S.painel = { 'u1|p9|privacy': { t: Date.now(), dados: {} }, 'u1|p9|n360': { t: Date.now(), dados: {} }, 'u1|p8|privacy': { t: Date.now(), dados: {} } };
        await window.abrirIndicarEncarregado('p9');
        const sel = document.getElementById('encarregado-parte');
        expect(sel.options.length).toBe(1);
        expect(sel.querySelector('b')).toBeNull();
        sel.value = 'pe7';
        await window.indicarEncarregado('p9');
        const post = f.mock.calls.find(([u, o]) => o?.method === 'POST');
        expect(new URL(post[0], 'http://localhost').pathname).toBe('/api/v1/projects/p9/partes/pe7/vinculos');
        expect(JSON.parse(post[1].body)).toEqual({ papel: 'encarregado', alvo_tipo: 'projeto', alvo_id: 'p9' });
        // o painel guardado do projeto deixa de valer (o encarregado sai do "O que fazer"); o de outro projeto fica
        expect(Object.keys(S.painel)).toEqual(['u1|p8|privacy']);
    });
});
