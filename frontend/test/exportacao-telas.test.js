// F4: baixar CSV e Word pelo caminho autenticado (api.js) e as faixas de prazo do painel do encarregado. Só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { baixarArquivo } from '../src/api.js';
import '../src/views/encarregado.js';
import { nivelDaNota } from '../src/views/mapa-de-risco.js';

const el = (id) => document.getElementById(id);
const ARQUIVO = (nome) => ({
    status: 200, ok: true,
    headers: { get: (h) => (h.toLowerCase() === 'content-disposition' ? `attachment; filename="${nome}"` : 'text/csv; charset=utf-8') },
    blob: async () => new Blob(['﻿"A"\r\n']),
});

/** fetch: rotas JSON por `GET caminho`; o resto devolve um arquivo. Guarda as URLs chamadas. */
function dublar(json = {}) {
    const f = vi.fn(async (url) => {
        const u = new URL(url, 'http://localhost');
        const k = `GET ${u.pathname}`;
        return k in json ? resposta(json[k]) : ARQUIVO('arquivo.csv');
    });
    vi.stubGlobal('fetch', f);
    return f;
}

let cliques;
beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9' };
    window.render = vi.fn();
    window.openLigacoesTratamento = vi.fn();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    cliques = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { cliques.push({ href: this.href, download: this.download }); });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('baixarArquivo', () => {
    it('manda o token no cabeçalho, nunca na URL, e usa o nome do servidor', async () => {
        const f = vi.fn(async () => ARQUIVO('RIPD-Antifraude.docx'));
        vi.stubGlobal('fetch', f);
        await baixarArquivo('/api/v1/projects/p9/dpia/d1/docx');
        expect(f.mock.calls[0][0]).not.toContain('tok');
        expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
        expect(cliques).toEqual([{ href: 'blob:x', download: 'RIPD-Antifraude.docx' }]);
    });
    it('erro do servidor vira exceção com a mensagem dele', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => resposta({ error: 'RIPD não encontrado' }, 404)));
        await expect(baixarArquivo('/api/v1/projects/p9/dpia/x/docx')).rejects.toThrow('RIPD não encontrado');
        expect(cliques).toEqual([]);
    });
});

const FAIXAS = [
    { faixa: 'vencidas', rotulo: 'Vencidas', total: 2, itens: [{ id: 'a1', ropa_id: 'r1', atividade: 'Folha <b>x</b>', title: 'Revisar contrato', due_date: '2026-10-01', responsavel: null }] },
    { faixa: 'ate_30', rotulo: 'Até 30 dias', total: 0, itens: [] },
    { faixa: 'de_31_a_90', rotulo: '31 a 90 dias', total: 0, itens: [] },
    { faixa: 'de_91_a_150', rotulo: '91 a 150 dias', total: 0, itens: [] },
    { faixa: 'mais_de_150', rotulo: 'Mais de 150 dias', total: 0, itens: [] },
    { faixa: 'sem_prazo', rotulo: 'Sem prazo', total: 1, itens: [] },
];
describe('painel do n.privacy: ações das atividades por faixa de prazo', () => {
    it('as seis faixas, com a contagem, num modal; a faixa abre a lista escapada e exporta só ela', async () => {
        document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
        window.guardarFaixasPrazo(FAIXAS);
        window.abrirPrazosDasAcoes('p9');
        const botoes = [...el('modal-content').querySelectorAll('[data-action="abrirFaixaPrazo"]')];
        expect(botoes.map((b) => b.getAttribute('aria-label'))).toEqual(['Vencidas: 2 ações', 'Até 30 dias: 0 ações', '31 a 90 dias: 0 ações', '91 a 150 dias: 0 ações', 'Mais de 150 dias: 0 ações', 'Sem prazo: 1 ações']);
        window.abrirFaixaPrazo('p9', 'vencidas');
        const m = el('modal-content');
        expect(m.textContent).toContain('Revisar contrato');
        expect(m.textContent).toContain('Folha <b>x</b>');
        expect(m.querySelector('b')).toBeNull();
        expect(m.textContent).toContain('Mostrando 1 de 2');
        expect(JSON.parse(m.querySelector('[data-action="openLigacoesTratamento"]').getAttribute('data-args'))).toEqual(['p9', 'r1']);

        const f = dublar();
        await window.exportarCsvAcoes('p9', 'vencidas');
        expect(f.mock.calls[0][0]).toMatch(/\/api\/v1\/projects\/p9\/export\/acoes-atividade\?faixa=vencidas$/);
        await window.exportarCsvAcoes('p9', null);
        expect(f.mock.calls[1][0]).toMatch(/\/export\/acoes-atividade$/);
    });

    it('Exportar do painel: cada lista pelo caminho autenticado', async () => {
        const f = dublar();
        for (const tipo of ['atividades', 'ripd', 'lia', 'riscos-atividade', 'acoes-atividade']) await window.painelBaixar('p9', tipo);
        expect(f.mock.calls.map(([u]) => new URL(u, 'http://localhost').pathname)).toEqual(['atividades', 'ripd', 'lia', 'riscos-atividade', 'acoes-atividade'].map((t) => `/api/v1/projects/p9/export/${t}`));
        expect(window.painelBaixar('p9', 'inventado')).toBeUndefined();
    });
});

describe('mapa de risco: exportar o que a tela mostra', () => {
    it('sem célula, todos; com célula, só ela', async () => {
        document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
        const riscos = [{ id: 'k', ropa_id: 'r1', threat: 'X', probability: 5, impact: 4, risk_level: nivelDaNota(5, 4), atividade: 'A' }];
        dublar({ 'GET /api/v1/projects/p9/ropa/riscos-mapa': { riscos } });
        await window.renderMapaDeRisco(el('c'), el('h'), el('a'));
        expect(el('a').querySelector('[data-action="exportarCsvRiscos"]')).not.toBeNull();
        const f = dublar();
        await window.exportarCsvRiscos();
        expect(f.mock.calls[0][0]).toMatch(/\/export\/riscos-atividade$/);
        window.mapaCelula(5, 4);
        await window.exportarCsvRiscos();
        expect(f.mock.calls[1][0]).toMatch(/\/export\/riscos-atividade\?probabilidade=5&impacto=4$/);
    });
});
