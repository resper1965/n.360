// n.ot, aba Desvios (Task 5): lista, filtros, tratar, aceitar e o cartão "Pontos a esclarecer". api() REAL, fetch dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/ot.js';

const B = '/api/v1/projects/p9/ot';
const el = (id) => document.getElementById(id);
const pausa = () => new Promise((r) => setTimeout(r, 0));
const DESVIOS = { desvios: [
    { id: 'd1', site_id: 's1', site_nome: 'SE Norte', tipo: 'fluxo', situacao: 'aberto', protocolo: 'modbus', porta: 502, externo: true, origem: { ativo: 'CLP <b id="xss">1</b>', zona: 'Supervisão' },
        destino: { ativo: 'Host externo', zona: 'Externa' }, primeira_vez: '2026-11-01T10:00:00Z', ultima_vez: '2026-11-08T10:00:00Z', ocorrencias: 4, aceito_ate: null, nota: null, achado_id: 'a1' },
    { id: 'd2', site_id: 's1', site_nome: 'SE Norte', tipo: 'ativo', situacao: 'tratado', fabricante: 'Siemens', origem: { ativo: 'IED 7', zona: 'Supervisão' }, primeira_vez: '2026-11-02T10:00:00Z',
        ultima_vez: '2026-11-03T10:00:00Z', ocorrencias: 1, aceito_ate: null, nota: 'Cadastrado', achado_id: null }] };
let chamadas;
function servir(rotas) {
    chamadas = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
        const u = new URL(url, 'http://localhost');
        const k = `${opts.method || 'GET'} ${u.pathname}`;
        chamadas.push({ k, q: u.search, opts });
        if (!(k in rotas)) return resposta({ error: `API route not found: ${k}` }, 404);
        const r = rotas[k];
        return Array.isArray(r) ? resposta(r[1], r[0]) : resposta(r);
    }));
}
const BASE = { [`GET ${B}/sites`]: { sites: [{ id: 's1', nome: 'SE Norte' }] }, [`GET ${B}/desvios`]: DESVIOS };
async function abrir(aba, rotas = {}) {
    servir({ ...BASE, ...rotas });
    S.otAba = aba;
    await window.renderOt(el('c'), el('h'), el('a'));
}
beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok'; S.user = { id: 'u1', role: 'consultor' }; S.activeProject = { id: 'p9', modulos: ['ot'] };
    S.otProjeto = 'p9'; S.otSite = null; S.otZona = null; S.otLote = null; S.otLevantamento = null; S.otDesvioFiltro = null;
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('aba Desvios', () => {
    it('aparece com a contagem de abertos no rótulo', async () => {
        await abrir('desvios', { [`GET ${B}/desvios`]: { desvios: [DESVIOS.desvios[0]] } });
        await vi.waitFor(() => expect([...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toContain('Desvios · 1 aberto'));
    });

    it('lista escapada, situação em texto, filtros pedem ao servidor e o ativo mostra o fabricante', async () => {
        await abrir('desvios');
        expect(el('xss')).toBeNull();
        const t = el('ot-painel').textContent;
        expect(t).toContain('Aberto'); expect(t).toContain('Tratado'); expect(t).toContain('modbus:502 · externo'); expect(t).toContain('Siemens'); expect(t).toContain('Cadastrado');
        expect(chamadas.some((c) => c.k === `GET ${B}/desvios` && c.q === '?situacao=aberto')).toBe(true);
        el('des-f-tipo').value = 'ativo';
        window.otFiltrarDesvios('tipo');
        expect(S.otDesvioFiltro).toEqual({ situacao: 'aberto', site_id: '', tipo: 'ativo' });
    });

    it('uma ação principal por tela e ações por papel: consultor trata, só o Gestor aceita', async () => {
        await abrir('desvios');
        expect(document.querySelectorAll('#c .btn-primary')).toHaveLength(0);
        expect(el('c').querySelector('[data-action="otTratarDesvio"]')).not.toBeNull();
        expect(el('c').querySelector('[data-action="otAceitarDesvio"]')).toBeNull();
        expect(el('c').querySelectorAll('[data-action="otVerAchadoDesvio"]')).toHaveLength(1);
        S.user.role = 'org_admin';
        await abrir('desvios');
        expect(el('c').querySelector('[data-action="otAceitarDesvio"]')).not.toBeNull();
        expect(el('c').querySelectorAll('[data-action="otTratarDesvio"]')).toHaveLength(1); // o tratado não tem ação
    });

    it('Tratar exige nota e envia', async () => {
        await abrir('desvios', { [`POST ${B}/desvios/d1/tratar`]: { ok: true } });
        window.otTratarDesvio('d1');
        await window.otSalvarTratar('d1');
        expect(chamadas.some((c) => c.k.startsWith('POST'))).toBe(false);
        el('des-nota').value = ' Regra criada ';
        await window.otSalvarTratar('d1');
        expect(JSON.parse(chamadas.find((c) => c.k.startsWith('POST')).opts.body)).toEqual({ nota: 'Regra criada' });
    });

    it('Aceitar avisa da exceção 5.1.1, limita a data a 90 dias e exige justificativa e prazo', async () => {
        S.user.role = 'org_admin';
        await abrir('desvios', { [`POST ${B}/desvios/d1/aceitar`]: { ok: true } });
        window.otAceitarDesvio('d1');
        expect(el('modal-content').textContent).toContain('Não substitui a exceção formal 5.1.1');
        const max = new Date(Date.now() + 90 * 86400000);
        expect(el('des-ate').max).toBe(new Date(max.getTime() - max.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
        await window.otSalvarAceite('d1');
        el('des-just').value = 'Janela de manutenção';
        await window.otSalvarAceite('d1');
        expect(chamadas.some((c) => c.k.startsWith('POST'))).toBe(false);
        el('des-ate').value = el('des-ate').max;
        await window.otSalvarAceite('d1');
        expect(JSON.parse(chamadas.find((c) => c.k.startsWith('POST')).opts.body)).toEqual({ justificativa: 'Janela de manutenção', ate: el('des-ate').max });
    });

    it('Ver achado leva à aba Levantamento', async () => {
        await abrir('desvios');
        window.otVerAchadoDesvio();
        expect(S.otAba).toBe('levantamento');
    });
});

describe('cartão Pontos a esclarecer', () => {
    it('ganha a linha "N desvios abertos"', async () => {
        await abrir('levantamento', { [`GET ${B}/levantamentos`]: { levantamentos: [] }, [`GET ${B}/sites/s1/sensores`]: { sensores: [{ id: 'z1', nome: 'S', saude: 'em_dia', ultimo_envio: new Date().toISOString(), credenciais: [] }] },
            [`GET ${B}/sensores/pontos`]: { ativos: 1, fluxos: 2 } });
        await vi.waitFor(() => expect(el('ot-cartoes-coleta')).not.toBeNull());
        expect(el('ot-cartoes-coleta').textContent).toContain('2 desvios abertos');
    });
});
