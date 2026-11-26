// n.ot, PR3b (spec 2026-11-26, decisão 3): na tela, ativo e fluxo só entram, mudam ou saem por achado (e lote decidido por outra pessoa).
// api() REAL; só o fetch é dublado. A escrita direta em /ot/ativos ou /ot/fluxos faz o teste falhar (o Revelar passa).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/ot.js';
import { montarInventario, montarFluxos } from '../src/views/ot.js';
import { desenhar, permissoesPeloPapel } from './ot-abrir.js';

beforeEach(permissoesPeloPapel);

const B = '/api/v1/projects/p9/ot';
const el = (id) => document.getElementById(id);
const acoes = (raiz = document) => [...raiz.querySelectorAll('[data-action]')].map((b) => b.getAttribute('data-action'));
const pausa = () => new Promise((r) => setTimeout(r, 0));

const ativo = (id, nome, zona_id) => ({ id, project_id: 'p9', site_id: 's1', zona_id, nome, no_arciber: true, categoria_arciber: 'centro_operacao',
    tipo_dispositivo: 'RTU', fabricante: 'ACME', modelo: 'X1', funcao: 'Telecontrole', firmware_so_versao: '1.2', firmware_nao_aplicavel: false,
    ultima_verificacao_em: null, verificado_por: null, status: 'ativo', protocolos_portas: [{ protocolo: 'DNP3', porta: 20000 }],
    ip: '•••', mac: 'aa:bb:cc:••:••:••', mascarado: true });
const ROTAS = {
    [`GET ${B}/sites`]: { sites: [{ id: 's1', nome: 'SE Norte Exemplo', tipo: 'subestacao' }] },
    [`GET ${B}/zonas`]: { zonas: [{ id: 'z2', site_id: 's1', nome: 'Supervisão', nivel_purdue: 2, tipo: 'supervisao' }, { id: 'z3', site_id: 's1', nome: 'DMZ', nivel_purdue: 3, tipo: 'dmz_operativa' }] },
    [`GET ${B}/ativos`]: { ativos: [ativo('a1', 'RTU-01', 'z2')] },
    [`GET ${B}/fluxos`]: { fluxos: [{ id: 'f1', site_id: 's1', origem_ativo_id: 'a1', externo: true, via_vpn: false, violacoes: [] }] },
    // uma entrevista aberta no site: nunca recebe o achado do inventário em silêncio
    [`GET ${B}/levantamentos`]: { levantamentos: [{ id: 'l-ent', site_id: 's1', tipo: 'entrevista', situacao: 'aberto' }] },
    [`POST ${B}/levantamentos`]: { id: 'lv-novo' },
    [`POST ${B}/levantamentos/lv-novo/achados`]: { id: 'ach1', erros: [] },
    [`POST ${B}/levantamentos/l1/achados`]: { id: 'ach2', erros: [] },
    [`POST ${B}/ia/zona-sugerida`]: { rascunho: true, nivel_purdue: 3, zona_id: 'z3', zona_nome: 'DMZ', justificativa: 'Servidor de dados.' },
    [`POST ${B}/ia/completude`]: { rascunho: true, campos: { tipo_dispositivo: 'RTU', fabricante: 'ACME', protocolos_portas: [] }, faltando: [], completo: true },
};
let chamadas;
function servir() {
    chamadas = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
        const u = new URL(url, 'http://localhost');
        const k = `${opts.method || 'GET'} ${u.pathname}`;
        if (/^(POST|PUT|DELETE) .*\/ot\/(ativos|fluxos)(\/[^/]+)?$/.test(k)) throw new Error(`escrita direta: ${k}`);
        chamadas.push({ k, corpo: opts.body ? JSON.parse(opts.body) : undefined });
        return k in ROTAS ? resposta(ROTAS[k]) : resposta({ error: `sem rota ${k}` }, 404);
    }));
}
const corpoDe = (k) => chamadas.find((x) => x.k === k)?.corpo;
async function responder(p, texto) {
    await pausa();
    document.querySelector('.confirmar input').value = texto;
    document.querySelector('[data-confirmar="sim"]').click();
    await p;
}

beforeEach(async () => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok';
    S.user = { id: 'u-consultor', role: 'consultor' };
    S.activeProject = { id: 'p9', modulos: ['ot'] };
    Object.assign(S, { otSite: null, otZona: null, otLote: null, otLevantamento: null });
    window.render = vi.fn();
    servir();
    await desenhar('inventario');
});
afterEach(() => { vi.unstubAllGlobals(); document.querySelectorAll('.confirmar').forEach((x) => x.remove()); });

describe('inventário: os botões viram achado', () => {
    it('não há escrita direta: Registrar ativo, Propor alteração, Propor remoção e Registrar fluxo', async () => {
        const todas = () => [...acoes(el('a')), ...acoes(el('c'))];
        for (const a of ['otNovoAtivo', 'otSalvarAtivo', 'otNovoFluxo', 'otSalvarFluxo', 'otAplicarZona', 'otEditarAtivo']) {
            expect(todas()).not.toContain(a);
            expect(window[a], a).toBeUndefined();
        }
        expect(todas()).toEqual(expect.arrayContaining(['otRegistrarAtivo', 'otProporAlteracao', 'otProporRemocao']));
        expect(el('a').textContent).toContain('Registrar ativo');
        el('a').innerHTML = '';
        await desenhar('fluxos');
        expect(todas()).toEqual(expect.arrayContaining(['otRegistrarFluxo', 'otProporRemocao']));
    });

    it('somenteLeitura: nenhum botão de achado, nem de site e zona', async () => {
        for (const montar of [montarInventario, montarFluxos]) {
            el('a').innerHTML = '';
            await montar(el('c'), el('a'), S.activeProject, { siteFixo: 's1', somenteLeitura: true });
            expect([...acoes(el('a')), ...acoes(el('c'))].filter((x) => /^ot(Registrar|Propor|Rascunho|Nova|Editar|Remover)/.test(x))).toEqual([]);
        }
    });
});

describe('Registrar ativo: o levantamento aberto na tela ou um de visita novo', () => {
    async function registrar() {
        await window.otRegistrarAtivo();
        el('lev-evidencia').value = 'Visto no painel da sala de controle';
        el('ot-f-nome').value = 'RTU-09';
        await window.otSalvarAchado();
    }
    it('sem levantamento na tela, cria um de visita (mesmo havendo uma entrevista aberta) e registra nele', async () => {
        await registrar();
        expect(corpoDe(`POST ${B}/levantamentos`)).toEqual({ site_id: 's1', tipo: 'visita', realizado_em: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
        expect(corpoDe(`POST ${B}/levantamentos/lv-novo/achados`)).toMatchObject({ entidade: 'ativo', dados: { nome: 'RTU-09' }, evidencia: 'Visto no painel da sala de controle' });
        expect(chamadas.some((x) => x.k.includes('/l-ent'))).toBe(false);
        expect(document.body.textContent).toContain('Achado registrado: envie para revisão em Revisar');
    });
    it('com o levantamento aberto na tela, o achado vai a ele', async () => {
        S.otLevantamento = 'l1';
        await registrar();
        expect(corpoDe(`POST ${B}/levantamentos/l1/achados`)).toMatchObject({ dados: { nome: 'RTU-09' } });
        expect(chamadas.some((x) => x.k === `POST ${B}/levantamentos`)).toBe(false);
    });
});

describe('Propor alteração e remoção', () => {
    it('alteração leva alvo_id e só o campo mudado; IP e MAC mascarados nunca vão', async () => {
        await window.otProporAlteracao('a1');
        expect(el('ot-f-ip').value).toBe('');
        expect(el('ot-f-mac').value).toBe('');
        el('lev-evidencia').value = 'Placa trocada na visita';
        el('ot-f-modelo').value = 'X2';
        await window.otSalvarAchado();
        expect(corpoDe(`POST ${B}/levantamentos/lv-novo/achados`).dados).toEqual({ modelo: 'X2', alvo_id: 'a1' });
        expect(JSON.stringify(chamadas)).not.toContain('•');
    });
    it('nada mudou: não grava', async () => {
        await window.otProporAlteracao('a1');
        el('lev-evidencia').value = 'Conferido';
        await window.otSalvarAchado();
        expect(chamadas.some((x) => x.k.endsWith('/achados'))).toBe(false);
    });
    it('remoção pede a evidência e manda { alvo_id, remover: true }', async () => {
        await responder(window.otProporRemocao('ativos', 'a1'), 'Equipamento retirado do painel');
        expect(corpoDe(`POST ${B}/levantamentos/lv-novo/achados`)).toEqual({ entidade: 'ativo', dados: { alvo_id: 'a1', remover: true }, evidencia: 'Equipamento retirado do painel' });
    });
    it('remoção de fluxo (até o externo de ponta única) vai pelo alvo_id', async () => {
        await desenhar('fluxos');
        await responder(window.otProporRemocao('fluxos', 'f1'), 'Link desativado');
        expect(corpoDe(`POST ${B}/levantamentos/lv-novo/achados`)).toEqual({ entidade: 'fluxo', dados: { alvo_id: 'f1', remover: true }, evidencia: 'Link desativado' });
    });
    it('cancelar a remoção não cria levantamento', async () => {
        const p = window.otProporRemocao('ativos', 'a1');
        await pausa();
        document.querySelector('[data-confirmar="nao"]')?.click();
        await p;
        expect(chamadas.some((x) => x.k.startsWith('POST'))).toBe(false);
    });
});

describe('IA vira achado', () => {
    it('"Propor esta zona": achado com alvo_id e zona_id', async () => {
        await window.otSugerirZona('a1');
        expect(acoes(el('modal-content'))).toContain('otProporZona');
        await window.otProporZona('a1', 'z3');
        await window.otSalvarAchado();
        expect(corpoDe(`POST ${B}/levantamentos/lv-novo/achados`).dados).toEqual({ zona_id: 'z3', alvo_id: 'a1' });
    });
    it('"Rascunho por IA" leva ao formulário do achado', async () => {
        window.otRascunhoIa();
        el('ot-ia-desc').value = 'RTU ACME falando DNP3 no painel';
        await window.otChecarCompletude();
        await window.otUsarRascunho();
        expect(el('ot-f-tipo').value).toBe('RTU');
        el('lev-evidencia').value = 'Descrição de campo';
        el('ot-f-nome').value = 'RTU-10';
        await window.otSalvarAchado();
        expect(corpoDe(`POST ${B}/levantamentos/lv-novo/achados`).dados).toMatchObject({ nome: 'RTU-10', tipo_dispositivo: 'RTU', fabricante: 'ACME' });
    });
});

describe('Registrar fluxo e mudança', () => {
    it('fluxo vira achado de fluxo, com os ativos do site como ponta', async () => {
        await desenhar('fluxos');
        await window.otRegistrarFluxo();
        el('lev-evidencia').value = 'Visto no firewall';
        el('lev-fx-origem').value = 'a:a1';
        el('lev-fx-destino').value = 'z:z3';
        el('lev-fx-protocolo').value = 'DNP3';
        await window.otSalvarAchado();
        expect(corpoDe(`POST ${B}/levantamentos/lv-novo/achados`)).toMatchObject({ entidade: 'fluxo', dados: { origem_ativo_id: 'a1', destino_zona_id: 'z3', protocolo: 'DNP3' } });
    });
    it('otRegistrarMudanca abre sempre um levantamento de visita novo', async () => {
        const tela = vi.spyOn(window, 'otTela').mockResolvedValue();
        await window.otRegistrarMudanca('s1');
        expect(corpoDe(`POST ${B}/levantamentos`)).toMatchObject({ site_id: 's1', tipo: 'visita' });
        expect(tela).toHaveBeenCalledWith('site', 's1', 'levantamento', { otLevantamento: 'lv-novo' });
        tela.mockRestore();
    });
});
