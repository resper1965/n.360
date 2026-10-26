// Página da LIA em abas (spec 2026-10-26): Finalidade, Necessidade, Proporcionalidade, Conclusão e Logs, com a aba no endereço.
// As perguntas gravam por campo; a sugestão da atividade aparece sem ser gravada; reabrir a LIA concluída mantém a confirmação. Dados fictícios.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock, navegarMock } = vi.hoisted(() => ({ apiMock: vi.fn(), navegarMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, baixarArquivo: vi.fn(), API_BASE: 'http://localhost', cabecalhosAuth: () => ({}) }));
vi.mock('../src/router.js', () => ({ render: vi.fn(), navigate: navegarMock }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/lia-ficha.js';

const el = (id) => document.getElementById(id);
const ITEM = { ropa_id: 'r1', atividade: 'Atendimento ficticio', status: 'rascunho', conclusao: null };
const ABAS_Q = [
    { id: 'finalidade', rotulo: 'Finalidade', perguntas: [
        { id: 'finalidades', texto: 'Quais são as finalidades do tratamento?', tipo: 'texto', resposta: 'Atender pedidos', da_atividade: null },
        { id: 'beneficios_empresa', texto: 'Quais são os benefícios para a empresa?', tipo: 'texto', resposta: null, da_atividade: 'Base legal: Legítimo interesse' }] },
    { id: 'necessidade', rotulo: 'Necessidade', perguntas: [
        { id: 'realmente_necessario', texto: 'O tratamento é realmente necessário?', tipo: 'escolha', resposta: null, da_atividade: null }] },
    { id: 'proporcionalidade', rotulo: 'Proporcionalidade', perguntas: [
        { id: 'coleta_direta', texto: 'A coleta dos dados é direta?', tipo: 'escolha', resposta: 'sim', da_atividade: null }] },
];
const LOGS = [{ evento: 'Questionário respondido (Necessidade)', nome: 'Ana', data: '2026-10-26 10:00:00' }, { evento: 'Criada', nome: 'Ana', data: '2026-10-25 09:00:00' }];
const LIA = { id: 'l1', ropa_id: 'r1', finalidade_legitima: 'Prevenir fraude', necessidade: 'Dados mínimos', balanceamento: 'Titular espera', salvaguardas: null, conclusao: 'prevalece', status: 'concluida' };

const abrir = async (aba, { item = ITEM, lia = null } = {}) => {
    apiMock.mockImplementation(async (m, u) => {
        if (m === 'GET' && u.endsWith('/ropa/lias')) return { lias: [item] };
        if (m === 'GET' && u.endsWith('/lia/questionario')) return ABAS_Q; // api() entrega a lista pura de { ok: true, abas }
        if (m === 'GET' && u.endsWith('/lia/logs')) return LOGS;
        if (m === 'GET' && u.endsWith('/lia')) return { lia };
        return { ok: true };
    });
    window.history.replaceState(null, '', `/?tela=lia-ficha&ropa=r1&aba=${aba}`);
    await window.renderLiaFicha(el('c'), el('h'), el('a'));
};
const chamadas = (m) => apiMock.mock.calls.filter((c) => c[0] === m);

beforeEach(() => {
    apiMock.mockReset();
    navegarMock.mockReset();
    document.body.innerHTML = '<div id="h"></div><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p1', modulos: ['privacy'] };
    S.projects = [S.activeProject];
    S.lia = null;
    window.render = vi.fn();
});

describe('página da LIA', () => {
    it('tem as cinco abas, na ordem, e a aba do endereço fica selecionada; o título é a atividade', async () => {
        await abrir('necessidade');
        const abas = [...el('c').querySelectorAll('[role="tab"]')];
        expect(abas.map((b) => b.textContent)).toEqual(['Finalidade', 'Necessidade', 'Proporcionalidade', 'Conclusão', 'Logs']);
        expect(abas.map((b) => b.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false', 'false', 'false']);
        expect(el('h').textContent).toBe('Atendimento ficticio');
    });

    it('abrirLia grava tela, atividade e aba no endereço e navega; trocar de aba mantém a atividade', async () => {
        window.abrirLia('p1', 'r1');
        const q = new URLSearchParams(window.location.search);
        expect([q.get('tela'), q.get('ropa'), q.get('aba')]).toEqual(['lia-ficha', 'r1', 'finalidade']);
        expect(navegarMock).toHaveBeenCalledWith('lia-ficha');
        await abrir('finalidade');
        await window.liaIrParaAba(null, 'logs');
        expect(new URLSearchParams(window.location.search).get('aba')).toBe('logs');
        expect(new URLSearchParams(window.location.search).get('ropa')).toBe('r1');
    });

    it('Finalidade mostra a resposta gravada e a sugestão da atividade SEM gravar', async () => {
        await abrir('finalidade');
        expect(el('lf-p-finalidades').value).toBe('Atender pedidos');
        expect(el('lf-p-beneficios_empresa').value).toBe('');
        expect(el('c').textContent).toContain('A atividade já indica: Base legal: Legítimo interesse');
        expect(el('lf-p-finalidades').closest('.at-pergunta').textContent).not.toContain('A atividade já indica');
        expect(chamadas('PUT')).toHaveLength(0);
    });

    it('as escolhas são sim, não e não sei', async () => {
        await abrir('necessidade');
        expect([...el('c').querySelectorAll('input[name="lf-p-realmente_necessario"]')].map((i) => i.value)).toEqual(['sim', 'nao', 'nao_sei']);
        await abrir('proporcionalidade');
        expect(el('c').querySelector('input[value="sim"]').checked).toBe(true);
    });

    it('autosave: texto grava a pergunta, e vazio apaga, em PUT .../lia/questionario', async () => {
        await abrir('finalidade');
        window.liaResponder('finalidades', 'Atender e cobrar');
        await vi.waitFor(() => expect(chamadas('PUT')).toHaveLength(1));
        expect(chamadas('PUT')[0].slice(1)).toEqual(['/api/v1/projects/p1/ropa/r1/lia/questionario', { respostas: { finalidades: 'Atender e cobrar' } }]);
        await vi.waitFor(() => expect(el('lf-st-finalidades').textContent).toBe('Salvo.'));
        window.liaResponder('finalidades', '');
        await vi.waitFor(() => expect(chamadas('PUT')).toHaveLength(2));
        expect(chamadas('PUT')[1][2]).toEqual({ respostas: { finalidades: null } });
    });

    it('erro do servidor aparece no próprio campo, sem derrubar a tela', async () => {
        await abrir('finalidade');
        apiMock.mockRejectedValueOnce(new Error('Pergunta desconhecida: x'));
        await window.liaResponder('finalidades', 'x');
        expect(el('lf-st-finalidades').textContent).toContain('Pergunta desconhecida');
    });

    it('sem permissão de edição os campos ficam desabilitados', async () => {
        S.user = { role: 'client' };
        await abrir('proporcionalidade');
        expect(el('c').querySelector('input[type="radio"]').disabled).toBe(true);
    });
});

describe('abas Conclusão e Logs', () => {
    it('Conclusão é o formulário da LIA, travado quando concluída, e reabrir continua pedindo confirmação', async () => {
        await abrir('conclusao', { item: { ...ITEM, status: 'concluida' }, lia: LIA });
        expect(el('tl-lia-bal').value).toBe('Titular espera');
        expect(el('tl-lia-bal').disabled).toBe(true);
        const p = window.reabrirLiaTratamento('p1', 'r1');
        expect(document.body.textContent).toContain('Confirma a reabertura do formulário?');
        document.querySelector('[data-confirmar="nao"]').click();
        await p;
        expect(chamadas('PUT')).toHaveLength(0);
    });

    it('salvar a LIA de dentro da ficha redesenha a ficha', async () => {
        await abrir('conclusao', { lia: { ...LIA, status: 'rascunho' } });
        S.view = 'lia-ficha';
        await window.salvarLiaTratamento('p1', 'r1', false);
        expect(chamadas('PUT')[0].slice(1, 2)).toEqual(['/api/v1/projects/p1/ropa/r1/lia']);
        expect(window.render).toHaveBeenCalled();
    });

    it('Logs lista a linha do tempo, só evento, nome e data', async () => {
        await abrir('logs');
        const txt = el('c').textContent;
        expect(txt).toContain('Questionário respondido (Necessidade)');
        expect(el('c').querySelectorAll('.at-log').length).toBe(2);
    });
});
