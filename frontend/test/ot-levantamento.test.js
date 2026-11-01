// n.ot, L1 (descoberta operacional): a aba Levantamento sobre as rotas reais /roteiro e /levantamentos* de src/routes/ot.ts.
// api() REAL; só o fetch é dublado (mesmo arranque de ot-abas.test.js), com os corpos que os handlers devolvem.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/ot.js';

const B = '/api/v1/projects/p1/ot';
const el = (id) => document.getElementById(id);
const texto = () => el('c').textContent + el('a').textContent;

const LEV = { id: 'l1', site_id: 's1', tipo: 'entrevista', realizado_em: '2026-11-01', funcao: 'Operador', turno: 'B', notas: 'usa TeamViewer',
    roteiro: { 'rot-01': { resposta: 'sim', nota: 'via 4G' } }, situacao: 'aberto', achados: 1 };
const ROTEIRO = { perguntas: [
    { id: 'rot-01', ordem: 1, texto: 'Algum equipamento desta sala é acessado de fora da empresa?', item_norma: '4.1.3', entidade_esperada: 'fluxo', tipos_sessao: ['entrevista', 'visita'] },
    { id: 'rot-09', ordem: 9, texto: 'Pergunta só de documento', item_norma: '4.3.1', entidade_esperada: 'ativo', tipos_sessao: ['documento'] }] };
const ACH = (extra = {}) => ({ id: 'a1', levantamento_id: 'l1', entidade: 'ativo', origem: 'consultor', situacao: 'rascunho', lote_id: null,
    evidencia: 'notebook pessoal na IHM <b id="xss">x</b>', erros: [], dados: { nome: 'Notebook IHM', ip: '•••', mascarado: true }, ...extra });
const SITES = { [`GET ${B}/sites`]: { sites: [{ id: 's1', nome: 'SE Norte' }, { id: 's2', nome: 'SE Sul' }] } };

let chamadas;
function servirOt(rotas) {
    chamadas = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
        const u = new URL(url, 'http://localhost');
        const k = `${opts.method || 'GET'} ${u.pathname}`;
        chamadas.push({ k, url: u, opts });
        return k in rotas ? resposta(rotas[k]) : resposta({ error: `API route not found: ${k}` }, 404);
    }));
}
async function abrir(aba) {
    S.otAba = aba;
    await window.renderOt(el('c'), el('h'), el('a'));
}
const detalhe = async (achados = [ACH()], extra = {}) => {
    servirOt({ [`GET ${B}/levantamentos/l1`]: { levantamento: LEV, achados }, [`GET ${B}/roteiro`]: ROTEIRO, ...extra });
    window.otAbrirLevantamento('l1');
    await abrir('levantamento');
};
const corpo = (k) => JSON.parse(chamadas.find((x) => x.k === k).opts.body);

beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>'
        + '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok';
    S.user = { id: 'u-consultor', role: 'consultor' };
    S.activeProject = { id: 'p1', modulos: ['ot'] };
    S.otProjeto = 'p1'; S.otSite = null; S.otZona = null; S.otLote = null; S.otLevantamento = null;
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('aba Levantamento', () => {
    it('lista as sessões com tipo, função e turno, sem nome de pessoa', async () => {
        servirOt({ [`GET ${B}/levantamentos`]: { levantamentos: [LEV] }, ...SITES });
        await abrir('levantamento');
        expect(texto()).toContain('Entrevista');
        expect(texto()).toContain('Operador · turno B');
        expect(texto()).toContain('SE Norte');
    });

    it('detalhe mostra roteiro do tipo da sessão, achados escapados e confronto só quando a API manda', async () => {
        await detalhe();
        expect(texto()).toContain('acessado de fora da empresa');
        expect(texto()).not.toContain('Pergunta só de documento');
        expect(texto()).toContain('notebook pessoal na IHM');
        expect(el('xss')).toBeNull();
        expect(el('lev-notas').value).toBe('usa TeamViewer');
        expect(texto()).not.toMatch(/Novo no inventário|Confirma ativo/);
        await detalhe([ACH({ confronto: 'novo', alvo_id: null })]);
        expect(texto()).toContain('Novo no inventário');
    });

    it('responder o roteiro manda o objeto inteiro, mantendo a nota; notas vão por PUT', async () => {
        await detalhe([], { [`PUT ${B}/levantamentos/l1`]: { ok: true } });
        await window.otResponderRoteiro('rot-01', 'nao');
        expect(corpo(`PUT ${B}/levantamentos/l1`)).toEqual({ roteiro: { 'rot-01': { resposta: 'nao', nota: 'via 4G' } } });
        el('lev-notas').value = 'nova nota';
        chamadas.length = 0;
        await window.otSalvarNotas();
        expect(corpo(`PUT ${B}/levantamentos/l1`)).toEqual({ notas: 'nova nota' });
    });

    it('enviar ao lote manda só os achados marcados e abre a Coleta no lote criado', async () => {
        await detalhe([ACH(), ACH({ id: 'a2' }), ACH({ id: 'a3', situacao: 'enviado', lote_id: 'x' })],
            { [`POST ${B}/levantamentos/l1/enviar`]: { id: 'lote-9', itens: 1, com_erro: 0, status: 'em_revisao' } });
        expect(el('ach-sel-a3')).toBeNull();
        el('ach-sel-a1').checked = true;
        await window.otEnviarAchados();
        expect(corpo(`POST ${B}/levantamentos/l1/enviar`)).toEqual({ achados: ['a1'] });
        expect(S.otLote).toBe('lote-9');
        expect(S.otLevantamento).toBeNull();
        expect(S.otAba).toBe('coleta');
    });

    it('registrar achado manda os campos do ativo e a evidência; descartar marca a situação', async () => {
        await detalhe([ACH()], { [`GET ${B}/zonas`]: { zonas: [] }, [`POST ${B}/levantamentos/l1/achados`]: { id: 'a9', erros: [] },
            [`PUT ${B}/levantamentos/l1/achados/a1`]: { ok: true } });
        await window.otNovoAchado();
        el('ot-f-nome').value = 'Switch';
        el('ot-f-ip').value = '10.0.0.1';
        el('lev-evidencia').value = 'visto no rack';
        await window.otSalvarAchado();
        const b = corpo(`POST ${B}/levantamentos/l1/achados`);
        expect(b.evidencia).toBe('visto no rack');
        expect(b.dados).toMatchObject({ nome: 'Switch', ip: '10.0.0.1' });
        await window.otDescartarAchado('a1');
        expect(corpo(`PUT ${B}/levantamentos/l1/achados/a1`)).toEqual({ situacao: 'descartado' });
    });

    it('novo levantamento de documento manda título, não função e turno', async () => {
        servirOt({ [`GET ${B}/levantamentos`]: { levantamentos: [] }, ...SITES, [`POST ${B}/levantamentos`]: { id: 'l2' } });
        await abrir('levantamento');
        window.otNovoLevantamento();
        el('lev-f-tipo').value = 'documento';
        window.otTipoLevantamento('documento');
        expect(el('lev-f-pessoa').hidden).toBe(true);
        el('lev-f-funcao').value = 'Operador';
        el('lev-f-titulo').value = 'Inventário 2023';
        el('lev-f-data').value = '2026-11-01';
        await window.otCriarLevantamento();
        expect(corpo(`POST ${B}/levantamentos`)).toEqual({ site_id: 's1', tipo: 'documento', realizado_em: '2026-11-01', documento_titulo: 'Inventário 2023' });
        expect(S.otLevantamento).toBe('l2');
    });

    it('quem não edita o inventário não vê os botões de criar, registrar, responder ou enviar', async () => {
        S.user = { id: 'u', role: 'org_user' };
        servirOt({ [`GET ${B}/levantamentos`]: { levantamentos: [LEV] }, ...SITES });
        await abrir('levantamento');
        expect(document.querySelector('[data-action="otNovoLevantamento"]')).toBeNull();
        await detalhe();
        for (const acao of ['otNovoAchado', 'otEnviarAchados', 'otResponderRoteiro', 'otSalvarNotas', 'otDescartarAchado', 'otEncerrarLevantamento']) {
            expect(document.querySelector(`[data-action="${acao}"]`), acao).toBeNull();
        }
        expect(el('ach-sel-a1')).toBeNull();
    });

    it('trocar de projeto ou de aba volta à lista de sessões', async () => {
        S.otLevantamento = 'l1';
        window.otAba('coleta');
        expect(S.otLevantamento).toBeNull();
        S.otLevantamento = 'l1';
        S.activeProject = { id: 'p2', modulos: ['ot'] };
        servirOt({});
        await abrir('catalogo');
        expect(S.otLevantamento).toBeNull();
    });
});

describe('coleta ligada a um documento', () => {
    it('a planilha pode ser ligada a uma sessão documento do site escolhido', async () => {
        servirOt({ ...SITES, [`GET ${B}/lotes`]: { lotes: [] }, [`GET ${B}/levantamentos`]: { levantamentos: [LEV,
            { ...LEV, id: 'd1', tipo: 'documento', documento_titulo: 'Inventário 2023' }, { ...LEV, id: 'd2', site_id: 's2', tipo: 'documento', documento_titulo: 'Do outro site' }] },
        [`POST ${B}/lotes`]: { id: 'lote-1', itens: 1, com_erro: 0 } });
        await abrir('coleta');
        const ops = () => [...el('ot-lote-doc').options].map((o) => o.value);
        expect(ops()).toEqual(['', 'd1']);
        window.otLoteSite('s2');
        expect(ops()).toEqual(['', 'd2']);
        el('ot-lote-site').value = 's1';
        window.otLoteSite('s1');
        el('ot-lote-doc').value = 'd1';
        Object.defineProperty(el('ot-lote-arquivo'), 'files', { value: [new File(['nome\nx'], 'a.csv')] });
        await window.otEnviarPlanilha();
        const fd = chamadas.find((x) => x.k === `POST ${B}/lotes`).opts.body;
        expect(fd.get('levantamento_id')).toBe('d1');
    });
});
