import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/ot.js';
import { montarRevisao } from '../src/views/ot-revisao.js';

const B = '/api/v1/projects/p9/ot';
const el = (id) => document.getElementById(id);
const ach = (id, extra = {}) => ({ id, entidade: 'ativo', situacao: 'rascunho', origem: 'consultor', evidencia: `ev-${id}`, dados: { nome: `Ativo ${id}` },
    levantamento_id: id < 'a3' ? 'v1' : 'v2', levantamento_tipo: 'visita', levantamento_realizado_em: '2026-11-10', desfecho: null, ...extra });
const FILA = [ach('a1'), ach('a2', { origem: 'ia', dados: { nome: 'IA <b id="xss">x</b>' } }), ach('a3', { desfecho: 'recusado', motivo: 'IP errado' }),
    ach('a4', { entidade: 'fluxo', dados: { origem_ativo_id: 'x' }, origem: 'consultor', evidencia: 'Sensor de rede (Zeek): foo' })];
let rotas; let chamadas;
beforeEach(() => {
    document.body.innerHTML = '<div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok'; S.user = { id: 'u1', email: 'g@x.com', role: 'org_admin' }; S.activeProject = { id: 'p9', modulos: ['ot'] };
    S.otLote = null; window.render = vi.fn(); window.otTela = vi.fn(); window.otIrParaLote = vi.fn();
    chamadas = [];
    rotas = { [`GET ${B}/achados`]: { achados: FILA }, [`GET ${B}/sites`]: { sites: [{ id: 's1', nome: 'SE' }] }, [`GET ${B}/lotes`]: { lotes: [] },
        [`GET ${B}/levantamentos`]: { levantamentos: [] }, [`POST ${B}/sites/s1/enviar`]: { id: 'l9', itens: 2 }, [`PUT ${B}/levantamentos/v1/achados/a1`]: { ok: true } };
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
        const u = new URL(url, 'http://localhost'); const k = `${opts.method || 'GET'} ${u.pathname}`;
        chamadas.push({ k, url: u, opts });
        return k in rotas ? resposta(rotas[k]) : resposta({ error: 'x' }, 404);
    }));
});
afterEach(() => vi.unstubAllGlobals());
const montar = () => montarRevisao(el('c'), el('a'), S.activeProject, { siteFixo: 's1' });
const marcar = (id) => { el(`rev-sel-${id}`).checked = true; window.otRevMarcar(); };

describe('montarRevisao', () => {
    it('lista os achados de dois levantamentos, escapados, e pede a fila do site em rascunho', async () => {
        await montar();
        const q = chamadas.find((x) => x.k === `GET ${B}/achados`).url.search;
        expect(q).toContain('site_id=s1'); expect(q).toContain('situacao=rascunho');
        expect(el('c').querySelectorAll('#ot-rev-fila tbody tr')).toHaveLength(4);
        expect(el('xss')).toBeNull();
        expect(el('c').textContent).toContain('IA <b id="xss">x</b>');
        expect(el('c').textContent).toContain('Sonda');
    });
    it('filtro por origem reduz a lista', async () => {
        await montar();
        window.otRevFiltro('origem', 'ia');
        expect(el('c').querySelectorAll('#ot-rev-fila tbody tr')).toHaveLength(1);
        window.otRevFiltro('origem', '');
        window.otRevFiltro('tipo', 'fluxo');
        expect(el('c').querySelectorAll('#ot-rev-fila tbody tr')).toHaveLength(1);
    });
    it('botão principal: desabilitado sem marcados; com 2 marcados faz POST com os 2 ids e abre o lote', async () => {
        await montar();
        const b = () => el('c').querySelector('.btn-primary');
        expect(b().disabled).toBe(true);
        expect(b().textContent).toBe('Enviar para aprovação (0)');
        marcar('a1'); marcar('a2');
        expect(b().disabled).toBe(false);
        expect(b().textContent).toBe('Enviar para aprovação (2)');
        await window.otRevEnviar();
        const post = chamadas.find((x) => x.k === `POST ${B}/sites/s1/enviar`);
        expect(JSON.parse(post.opts.body)).toEqual({ achados: ['a1', 'a2'] });
        expect(window.otIrParaLote).toHaveBeenCalledWith('s1', 'l9');
    });
    it('achado recusado mostra o selo e o motivo', async () => {
        await montar();
        expect(el('c').textContent).toContain('Recusado');
        expect(el('c').textContent).toContain('IP errado');
    });
    it('fila vazia: texto e botão Novo levantamento, sem primário', async () => {
        rotas[`GET ${B}/achados`] = { achados: [] };
        await montar();
        expect(el('c').textContent).toContain('Nenhum achado para revisar neste site.');
        const n = [...el('c').querySelectorAll('button.btn')].find((x) => x.textContent === 'Novo levantamento');
        expect(n).toBeTruthy(); expect(n.classList.contains('btn-primary')).toBe(false);
        expect(el('c').querySelectorAll('.btn-primary')).toHaveLength(0);
    });
    it('um só .btn-primary na tela, mesmo com o envio de planilha dos lotes', async () => {
        await montar();
        expect(el('c').querySelectorAll('.btn-primary')).toHaveLength(1);
    });
    it('link do levantamento abre a sub-aba Levantamento nele; descartar usa o PUT do levantamento', async () => {
        await montar();
        const l = el('c').querySelector('[data-action="otRevAbrirLevantamento"]');
        expect(JSON.parse(l.getAttribute('data-args'))).toEqual(['s1', 'v1']);
        await window.otRevAbrirLevantamento('s1', 'v1');
        expect(window.otTela).toHaveBeenCalledWith('site', 's1', 'projeto', { otSub: 'levantamento', otLevantamento: 'v1' });
        rotas[`PUT ${B}/levantamentos/v1/achados/a1`] = { ok: true };
        await window.otRevDescartar('v1', 'a1');
        const put = chamadas.find((x) => x.k === `PUT ${B}/levantamentos/v1/achados/a1`);
        expect(JSON.parse(put.opts.body)).toEqual({ situacao: 'descartado' });
    });
    it('editar altera a evidência pelo PUT', async () => {
        await montar();
        window.otRevEditar('v1', 'a1');
        el('rev-evidencia').value = 'nova evidência';
        await window.otRevSalvarEdicao('v1', 'a1');
        expect(JSON.parse(chamadas.find((x) => x.k === `PUT ${B}/levantamentos/v1/achados/a1`).opts.body)).toEqual({ evidencia: 'nova evidência' });
    });
});
