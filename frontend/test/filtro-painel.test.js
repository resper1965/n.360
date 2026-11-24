// Filtro por situação com que o painel abre a lista de destino (filtro-painel.js): o botão de "O que fazer" leva a chave do item;
// a lista abre filtrada, com o chip "Filtro: <situação> — limpar". api() REAL; só o fetch é dublado. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));
vi.mock('../src/produto.js', async (original) => ({ ...(await original()), irPara: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { FILTROS, filtroValido, filtrarDoPainel } from '../src/filtro-painel.js';
import { emDiasSP } from '../src/hoje.js';
import '../src/views/painel.js';
import '../src/views/encarregado.js';
import '../src/views/titular.js';
import '../src/views/terceiros.js';
import '../src/views/compliance.js';
import '../src/views/grc.js';

initDelegation();

const B = '/api/v1/projects/p9';
const el = (id) => document.getElementById(id);
// Dia de São Paulo, como a tela (filtro-painel.js `hoje`).
const ontem = emDiasSP(-1);
const amanha = emDiasSP(1);
const daqui30 = emDiasSP(30);
const linhas = () => [...el('c').querySelectorAll('tbody tr')].map((tr) => tr.textContent);
const chip = () => el('c').querySelector('.filtro-painel');

function palco() {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
}

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9', modulos: ['iso', 'privacy'] };
    S.projects = [S.activeProject];
    S.filtroPainel = null;
    S.view = null;
    window.navigate = vi.fn();
    history.replaceState(null, '', '/privacy');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); S.filtroPainel = null; });

describe('o botão do painel leva o filtro', () => {
    it('chave conhecida vai como estado da navegação, nunca no endereço; desconhecida não filtra', () => {
        window.painelAbrir('titular', 'pedidos', 'atrasados');
        expect(S.titularAba).toBe('pedidos');
        expect(window.navigate).toHaveBeenLastCalledWith('titular', { filtroPainel: { tela: 'titular', aba: 'pedidos', filtro: 'atrasados' } });
        expect(location.href).not.toContain('atrasados');
        window.painelAbrir('terceiros', null, 'qualquer<coisa>');
        expect(window.navigate).toHaveBeenLastCalledWith('terceiros');
        window.painelAbrir('capa', null, null);
        expect(window.navigate).toHaveBeenLastCalledWith('capa');
    });

    it('o item do painel põe a chave no data-args do botão', async () => {
        palco();
        servir({ [`GET ${B}/painel`]: { visao: 'equipe', saude: { tom: 'atraso', rotulo: 'Atrasado', frase: 'x', apoio: '' }, programa: { estado: 'implantacao', rotulo: 'Em implantação' },
            empresa: null, decisoes: [], modulos: { privacy: { comecando: false, fazer: [{ grupo: 'atraso', quando: 'Vencido', texto: '1 pedido do titular atrasado', contexto: '', acao: 'Responder os pedidos', tela: 'titular', aba: 'pedidos', filtro: 'atrasados', modulo: 'privacy' }],
                cobertura: [], vencimentos: [], riscos: [], acoes_por_prazo: [], numeros: [] } } } });
        await window.renderPainel(el('c'), el('h'), el('a'), 'privacy');
        const b = el('c').querySelector('[data-action="painelAbrir"]');
        expect(JSON.parse(b.getAttribute('data-args'))).toEqual(['titular', 'pedidos', 'atrasados']);
    });

    it('ações vencidas das atividades, no painel do n.privacy: abrem a faixa "vencidas" das ações por prazo', () => {
        palco();
        S.view = 'encarregado';
        window.guardarFaixasPrazo([{ faixa: 'vencidas', rotulo: 'Vencidas', total: 1, itens: [{ title: 'Revisar retenção', atividade: 'Folha', due_date: ontem, ropa_id: 'r1' }] }]);
        window.painelAbrir('ropa', null, 'acoes_vencidas');
        expect(window.navigate).not.toHaveBeenCalled();
        expect(el('modal-content')?.textContent || document.body.textContent).toContain('Revisar retenção');
        // fora do painel do n.privacy (sem as faixas desta tela), cai na tela das atividades
        S.view = 'inicio';
        window.painelAbrir('ropa', null, 'acoes_vencidas');
        expect(window.navigate).toHaveBeenLastCalledWith('ropa');
    });
});

describe('as listas de destino abrem filtradas, com o chip', () => {
    it('pedidos do titular atrasados: só eles, chip acessível; limpar volta à lista inteira', async () => {
        palco();
        S.view = 'titular';
        S.titularAba = 'pedidos';
        S.filtroPainel = filtroValido('titular', 'pedidos', 'atrasados');
        servir({ [`GET ${B}/titular-pedidos`]: [
            { id: 'a', protocolo: 'PT-1', tipo: 'acesso', recebido_em: ontem, prazo_em: amanha, status: 'recebido', situacao_prazo: 'no_prazo' },
            { id: 'b', protocolo: 'PT-2', tipo: 'acesso', recebido_em: ontem, prazo_em: ontem, status: 'recebido', situacao_prazo: 'atrasado' },
        ], [`GET ${B}/incidentes`]: [], 'GET /api/v1/parametros-legais': [] });
        await window.renderTitular(el('c'), el('h'), el('a'));
        expect(linhas()).toHaveLength(1);
        expect(linhas()[0]).toContain('PT-2');
        expect(el('pt-contagem').textContent).toBe('1 de 2');
        expect(chip().getAttribute('role')).toBe('status');
        expect(chip().textContent.replace(/\s+/g, ' ')).toContain('Filtro: atrasados — limpar');
        const limpar = chip().querySelector('[data-action="limparFiltroPainel"]');
        expect(limpar.getAttribute('aria-label')).toBe('Limpar o filtro: atrasados');
        limpar.click();
        expect(S.filtroPainel).toBe(null);
        expect(window.navigate).toHaveBeenCalledWith('titular');
        await window.renderTitular(el('c'), el('h'), el('a'));
        expect(linhas()).toHaveLength(2);
        expect(chip()).toBe(null);
    });

    it('o filtro de uma aba não vale na outra', async () => {
        palco();
        S.titularAba = 'incidentes';
        S.filtroPainel = filtroValido('titular', 'pedidos', 'atrasados');
        servir({ [`GET ${B}/titular-pedidos`]: [], [`GET ${B}/incidentes`]: [
            { id: 'i1', protocolo: 'IN-1', titulo: 'Exemplo', ciencia_em: ontem, risco_titular: 'relevante', status: 'avaliado', situacao_anpd: 'no_prazo', situacao_titular: 'no_prazo' },
        ], 'GET /api/v1/parametros-legais': [] });
        await window.renderTitular(el('c'), el('h'), el('a'));
        expect(linhas()).toHaveLength(1);
        expect(chip()).toBe(null);
    });

    it('incidentes com comunicação atrasada', async () => {
        palco();
        S.titularAba = 'incidentes';
        S.filtroPainel = filtroValido('titular', 'incidentes', 'comunicacao_atrasada');
        servir({ [`GET ${B}/titular-pedidos`]: [], [`GET ${B}/incidentes`]: [
            { id: 'i1', protocolo: 'IN-1', titulo: 'Em dia', ciencia_em: ontem, risco_titular: 'relevante', status: 'avaliado', situacao_anpd: 'no_prazo', situacao_titular: 'no_prazo' },
            { id: 'i2', protocolo: 'IN-2', titulo: 'Atrasado', ciencia_em: ontem, risco_titular: 'relevante', status: 'avaliado', situacao_anpd: 'atrasado', situacao_titular: 'no_prazo' },
        ], 'GET /api/v1/parametros-legais': [] });
        await window.renderTitular(el('c'), el('h'), el('a'));
        expect(linhas().map((t) => t.includes('IN-2'))).toEqual([true]);
        expect(el('in-contagem').textContent).toBe('1 de 2');
        expect(chip().textContent).toContain('comunicação atrasada');
    });

    it('fornecedores com avaliação vencida; sem nenhum, a lista vazia diz que é o filtro', async () => {
        palco();
        S.filtroPainel = filtroValido('terceiros', null, 'vencidos');
        servir({ [`GET ${B}/terceiros`]: [
            { id: 't1', nome: 'Fornecedor Vigente', terceiro_tipo: 'medio', metodo: 'questionario', situacao: 'vigente', ultima_avaliacao: { valido_ate: daqui30 }, tratamentos: 1, documentos: 0 },
            { id: 't2', nome: 'Fornecedor Vencido', terceiro_tipo: 'medio', metodo: 'questionario', situacao: 'vencida', ultima_avaliacao: { valido_ate: ontem }, tratamentos: 1, documentos: 0 },
        ] });
        await window.renderTerceiros(el('c'), el('h'), el('a'));
        expect(linhas().map((t) => t.includes('Fornecedor Vencido'))).toEqual([true]);
        S.filtroPainel = filtroValido('terceiros', null, 'pendentes');
        await window.renderTerceiros(el('c'), el('h'), el('a'));
        expect(el('c').textContent).toContain('Nada encontrado com a busca ou o filtro.');
        expect(chip().textContent).toContain('nunca avaliados');
        // a reavaliação (o tipo mudou) também é "a avaliar": a prioridade do encarregado leva a ela
        servir({ [`GET ${B}/terceiros`]: [
            { id: 't3', nome: 'Fornecedor Reavaliar', terceiro_tipo: 'critico', metodo: 'auditoria', situacao: 'reavaliar', ultima_avaliacao: { valido_ate: daqui30, tipo_avaliado: 'medio' }, tratamentos: 1, documentos: 0 },
        ] });
        await window.renderTerceiros(el('c'), el('h'), el('a'));
        expect(linhas().map((t) => t.includes('Fornecedor Reavaliar'))).toEqual([true]);
    });

    it('evidências vencidas e ações corretivas vencidas', async () => {
        palco();
        S.filtroPainel = filtroValido('evidence', null, 'vencidas');
        servir({ [`GET ${B}/evidence`]: [
            { id: 'e1', file_name: 'em-dia.pdf', valido_ate: daqui30, evaluation_status: 'conforming' },
            { id: 'e2', file_name: 'vencida.pdf', valido_ate: ontem, evaluation_status: 'conforming' },
        ], [`GET ${B}/controls`]: [], [`GET ${B}/capa`]: [
            { id: 'c1', title: 'Ação no prazo', due_date: daqui30, status: 'Open' },
            { id: 'c2', title: 'Ação vencida', due_date: ontem, status: 'Open' },
            { id: 'c3', title: 'Ação fechada', due_date: ontem, status: 'Closed' },
        ] });
        await window.renderEvidence(el('c'), el('h'), el('a'));
        expect(linhas().map((t) => t.includes('vencida.pdf'))).toEqual([true]);
        expect(chip().textContent).toContain('vencidas');
        S.filtroPainel = filtroValido('capa', null, 'vencidas');
        await window.renderCAPA(el('c'), el('h'), el('a'));
        expect(linhas().map((t) => t.includes('Ação vencida'))).toEqual([true]);
    });

    it('filtro de outra tela não filtra esta; chave fora da lista não existe', () => {
        S.filtroPainel = filtroValido('capa', null, 'vencidas');
        expect(filtrarDoPainel('evidence', null, [1, 2])).toEqual({ itens: [1, 2], chip: '', filtrado: false });
        expect(filtroValido('titular', 'pedidos', '__proto__')).toBe(null);
        expect(filtroValido('ropa', null, 'atrasados')).toBe(null);
        expect(Object.keys(FILTROS).every((k) => /^[a-z]+:[a-z]*:[a-z_0-9]+$/.test(k))).toBe(true);
    });
});

describe('fornecedores do n.iso', () => {
    it('vendors::vencidos fica só com a avaliação vencida', () => {
        expect(filtroValido('vendors', null, 'vencidos')).toEqual({ tela: 'vendors', aba: null, filtro: 'vencidos' });
        const [rotulo, quem] = FILTROS['vendors::vencidos'];
        expect(rotulo).toBe('avaliação vencida');
        expect([{ situacao: 'vencida' }, { situacao: 'vigente' }, { situacao: 'pendente' }].filter(quem)).toEqual([{ situacao: 'vencida' }]);
    });
});

describe('prazo às 22h de Brasília (01h UTC do dia seguinte) conta no dia de Brasília', () => {
    it('vencem em até 7 dias: o 7º dia às 22h entra; data pura do 7º dia também', () => {
        const [, f] = FILTROS['titular:pedidos:vencem_7_dias'];
        expect(f({ status: 'recebido', prazo_em: `${emDiasSP(8)}T01:00:00.000Z` })).toBe(true);
        expect(f({ status: 'recebido', prazo_em: emDiasSP(7) })).toBe(true);
        expect(f({ status: 'recebido', prazo_em: `${emDiasSP(9)}T01:00:00.000Z` })).toBe(false);
    });
    it('prazo do pedido gravado à meia-noite UTC (contado do recebimento sem hora) é o dia dele, não 21h da véspera', () => {
        const [, f] = FILTROS['titular:pedidos:vencem_7_dias'];
        expect(f({ status: 'recebido', recebido_em: emDiasSP(-8), prazo_em: `${emDiasSP(0)}T00:00:00.000Z` })).toBe(true);
        expect(f({ status: 'recebido', recebido_em: emDiasSP(-1), prazo_em: `${emDiasSP(8)}T00:00:00.000Z` })).toBe(false);
    });
});
