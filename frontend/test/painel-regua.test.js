// Régua comum (onda 4): as cinco etapas por módulo, no topo do Painel e na linha "Ver situação" do Início. Só o que o servidor
// mandou: sem `ot` em programa.etapas, nada do n.ot é desenhado nem pedido (P0-1/P0-2).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));
vi.mock('../src/produto.js', async (original) => ({ ...(await original()), irPara: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { renderPainel } from '../src/views/painel.js';

const ETAPAS = (feitos = [2, 0, 0, 0, 0]) => [['comecar', 'Começar', 7], ['levantar', 'Levantar', 2], ['avaliar', 'Avaliar', 2], ['tratar', 'Tratar', 18], ['operar', 'Operar', 12]]
    .map(([id, rotulo, total], i) => ({ id, rotulo, feitos: feitos[i], total }));
const ISO = { etapa: 'comecar', feitos: 2, total: 41, proximo: { texto: 'Fase 2: Entrevistas <b>x</b>', tela: 'project-detail', fase: 2, passo: 'p2_1' }, etapas: ETAPAS() };
const BLOCO = (comecando) => ({ saude: { tom: 'plano', rotulo: 'Começando', frase: 'f', apoio: '' }, numeros: [['0 de 90', 'controles aplicáveis implementados']], comecando,
    fazer: [], cobertura: [], vencimentos: [], riscos: [], passos: [{ texto: 'Definir o escopo do SGSI', contexto: 'c', feito: false, acao: 'Definir o escopo', tela: 'context' }] });
const PAINEL = (comecando = true, etapas = { iso: ISO }) => ({ gerado_em: '2026-11-18T10:00:00Z', visao: 'equipe', modulos_pedidos: ['iso'], empresa: null, encarregados: [],
    programa: { estado: 'comecando', desde: null, rotulo: 'Começando', etapas }, saude: { tom: 'plano', rotulo: 'Começando', frase: 'f', apoio: '' }, modulos: { iso: BLOCO(comecando) } });
const el = (id) => document.getElementById(id);
const montar = () => { document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>'; };
/** Dublê que FALHA se a tela pedir qualquer coisa do n.ot. */
const servirSemOt = (rotas) => {
    const f = servir(rotas);
    const base = f.getMockImplementation();
    f.mockImplementation(async (u, o) => { if (String(u).includes('/ot')) throw new Error(`a tela pediu o n.ot: ${u}`); return base(u, o); });
    return f;
};

beforeEach(() => {
    S.token = 'tok'; S.user = { id: 'u1', role: 'consultor', modulos: ['iso', 'privacy'] };
    S.activeProject = { id: 'p9', client_name: 'Exemplo', modulos: ['iso', 'privacy', 'ot'] }; S.projects = [S.activeProject]; S.painel = {}; S.view = 'dashboard';
    window.render = vi.fn(); window.navigate = vi.fn(); window.ehEquipeNess = () => true;
    history.replaceState(null, '', '/iso');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); history.replaceState(null, '', '/'); delete window.ehEquipeNess; });

describe('régua no Painel do módulo', () => {
    it('as cinco etapas em ordem, a em curso marcada, o próximo passo escapado; nenhuma chamada ao n.ot', async () => {
        const f = servirSemOt({ 'GET /api/v1/projects/p9/painel': PAINEL() });
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'iso');
        const itens = [...el('c').querySelectorAll('.pn-regua li')];
        expect(itens.map((li) => li.querySelector('.pn-regua-nome').textContent)).toEqual(['Começar', 'Levantar', 'Avaliar', 'Tratar', 'Operar']);
        expect(itens[0].getAttribute('aria-current')).toBe('step');
        expect(itens[0].textContent).toContain('2 de 7');
        expect(el('c').querySelector('.pn-regua-prox').textContent).toContain('Fase 2: Entrevistas <b>x</b>');
        expect(el('c').querySelector('.pn-regua-prox b')).toBeNull();
        expect(el('c').textContent).not.toContain('n.ot');
        expect(f.mock.calls.every(([u]) => !String(u).includes('/ot'))).toBe(true);
    });
    it('"Primeiros passos" continuam no começo e saem quando o projeto deixa de começar; a régua fica nos dois', async () => {
        servirSemOt({ 'GET /api/v1/projects/p9/painel': PAINEL(true) });
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'iso');
        expect(el('c').textContent).toContain('Primeiros passos');
        expect(el('c').querySelector('.pn-regua')).not.toBeNull();
        S.painel = {};
        servirSemOt({ 'GET /api/v1/projects/p9/painel': PAINEL(false) });
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'iso');
        expect(el('c').textContent).not.toContain('Primeiros passos');
        expect(el('c').querySelector('.pn-regua')).not.toBeNull();
    });
    it('"Abrir" do próximo passo leva à Bancada na fase e no passo', async () => {
        servirSemOt({ 'GET /api/v1/projects/p9/painel': PAINEL() });
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'iso');
        const b = el('c').querySelector('.pn-regua-prox button');
        window.painelAbrirProximo(...JSON.parse(b.dataset.args));
        expect(window.navigate).toHaveBeenCalledWith('project-detail', { bancadaAlvo: { fase: 2, passo: 'p2_1' } });
    });
    it('tela fora da lista fechada não navega', () => {
        S.activeProject = null;
        window.painelAbrirProximo('p9', 'users', null, null, null);
        expect(window.navigate).not.toHaveBeenCalled();
        expect(S.activeProject).toBeNull();   // nem entra no projeto
    });
});

describe('régua no "Ver situação" do Início', () => {
    it('uma régua por módulo que veio; sem `ot` no programa, nada do n.ot (nem pedido)', async () => {
        history.replaceState(null, '', '/');
        const f = servirSemOt({ 'GET /api/v1/projects/p9/painel': { ...PAINEL(false), modulos: { iso: BLOCO(false) } } });
        document.body.innerHTML = '<table><tbody><tr><td><button id="b" aria-expanded="false"></button></td><td></td></tr></tbody></table>';
        await window.painelVerSituacao('p9', 'Exemplo', el('b'));
        const linha = document.getElementById('ini-sit-p9');
        expect(linha.querySelectorAll('.pn-regua').length).toBe(1);
        expect(linha.querySelector('.pn-regua').getAttribute('aria-label')).toBe('Jornada do n.iso');
        expect(linha.textContent).not.toContain('n.ot');
        expect(f.mock.calls.every(([u]) => !String(u).includes('/ot'))).toBe(true);
    });
});

describe('régua para o cliente (leitura apenas)', () => {
    it('o cliente vê a régua e o próximo passo, mas sem botão "Abrir"', async () => {
        S.user = { id: 'u2', role: 'client', client_project_id: 'p9', modulos: ['iso'] }; window.ehEquipeNess = () => false;
        servirSemOt({ 'GET /api/v1/projects/p9/painel': { ...PAINEL(false), visao: 'cliente', decisoes: [] } });
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'iso');
        expect(el('c').querySelector('.pn-regua li')).not.toBeNull();
        expect(el('c').querySelector('.pn-regua-prox').textContent).toContain('Fase 2');
        expect(el('c').querySelector('.pn-regua-prox button')).toBeNull();
    });
    it('tela fora da lista fechada não vira botão', async () => {
        const et = { iso: { ...ISO, proximo: { texto: 'x', tela: 'users' } } };
        servirSemOt({ 'GET /api/v1/projects/p9/painel': PAINEL(true, et) });
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'iso');
        expect(el('c').querySelector('.pn-regua-prox button')).toBeNull();
    });
    it('com etapas.ot a régua do n.ot é desenhada; sem a chave, nada do n.ot (elemento, aria-label ou texto)', async () => {
        const OT = { ...ISO, etapas: ETAPAS() };
        servirSemOt({ 'GET /api/v1/projects/p9/painel': { ...PAINEL(true, { iso: ISO, ot: OT }), modulos_pedidos: ['iso', 'ot'] } });
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'ot');
        const comOt = [...document.querySelectorAll('.pn-regua')].map((r) => r.getAttribute('aria-label'));
        expect(comOt).toContain('Jornada do n.ot');
        servirSemOt({ 'GET /api/v1/projects/p9/painel': PAINEL(true, { iso: ISO }) });
        S.painel = {};
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'iso');
        const html = el('c').outerHTML;
        expect([...el('c').querySelectorAll('.pn-regua')].map((r) => r.getAttribute('aria-label'))).toEqual(['Jornada do n.iso']);
        expect(html).not.toMatch(/n\.ot|site|desvio/i);
    });
    it('sem programa (ou sem etapas) não há régua e nada quebra', async () => {
        for (const programa of [undefined, { estado: 'comecando', desde: null, rotulo: 'Começando' }]) {
            const base = PAINEL();
            servirSemOt({ 'GET /api/v1/projects/p9/painel': { ...base, programa } });
            S.painel = {};
            montar();
            await renderPainel(el('c'), el('h'), el('a'), 'iso');
            expect(el('c').querySelector('.pn-regua')).toBeNull();
            expect(el('c').textContent).toContain('Primeiros passos');
        }
    });
    it('texto, fase e passo do servidor ficam escapados no data-args (aspas simples não fecham o atributo)', async () => {
        const et = { iso: { ...ISO, proximo: { texto: "a'b", tela: 'project-detail', fase: 2, passo: "p'\"x" } } };
        servirSemOt({ 'GET /api/v1/projects/p9/painel': PAINEL(true, et) });
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'iso');
        const b = el('c').querySelector('.pn-regua-prox button');
        expect(JSON.parse(b.dataset.args)[4]).toBe("p'\"x");
        expect(b.attributes.length).toBe(5);   // type, class, data-action, data-args, aria-label: nada extra
    });
});

describe('trilha do n.privacy', () => {
    const PASSOS = [['partida', 'Partida', true, 'importacao'], ['encarregado', 'Encarregado', true, 'encarregado'], ['inventario', 'Inventário', false, 'ropa']]
        .map(([id, rotulo, feito, tela], i) => ({ id, ordem: i, rotulo, etapa: i < 2 ? 'comecar' : 'levantar', feito, tela, acao: `Abrir ${rotulo} <i>x</i>` }));
    const PRIV = { etapa: 'levantar', feitos: 2, total: 7, proximo: { texto: 'Inventário', tela: 'ropa' }, etapas: ETAPAS([2, 0, 0, 0, 0]), passos: PASSOS };
    const comPrivacy = (comecando) => ({ ...PAINEL(comecando, { privacy: PRIV }), modulos_pedidos: ['privacy'], modulos: { privacy: { ...BLOCO(comecando), passos: [] } } });
    it('fora do começo: a trilha com Feito e o botão do passo por fazer, escapado', async () => {
        history.replaceState(null, '', '/privacy'); S.view = 'encarregado';
        servirSemOt({ 'GET /api/v1/projects/p9/painel': comPrivacy(false) });
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'privacy');
        const t = el('c').querySelector('#pn-trilha-t').closest('section');
        expect([...t.querySelectorAll('li')].map((li) => li.querySelector('.pn-tx').textContent)).toEqual(['Partida', 'Encarregado', 'Inventário']);
        expect(t.querySelectorAll('.pn-estado').length).toBe(2);
        const b = t.querySelector('button[data-action="painelAbrirProximo"]');
        expect(JSON.parse(b.dataset.args)).toEqual(['p9', 'ropa', null, null, null]);
        expect(t.querySelector('i')).toBeNull();
    });
    it('no começo, os "Primeiros passos" ficam e a trilha não aparece', async () => {
        history.replaceState(null, '', '/privacy'); S.view = 'encarregado';
        servirSemOt({ 'GET /api/v1/projects/p9/painel': comPrivacy(true) });
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'privacy');
        expect(el('c').querySelector('#pn-trilha-t')).toBeNull();
        expect(el('c').textContent).toContain('Primeiros passos');
    });
});

describe('trilha do n.privacy: só o que o servidor mandou', () => {
    const P = [{ id: 'partida', ordem: 0, rotulo: 'Partida', etapa: 'comecar', feito: false, tela: 'importacao', acao: 'Trazer' },
        { id: 'x', ordem: 1, rotulo: 'Fora', etapa: 'levantar', feito: false, tela: 'users', acao: 'Ir' }];
    const base = (etapas, visao = 'equipe') => ({ ...PAINEL(false, etapas), visao, modulos_pedidos: ['privacy'], modulos: { privacy: { ...BLOCO(false), passos: [] } } });
    const rodar = async (payload) => {
        history.replaceState(null, '', '/privacy'); S.view = 'encarregado'; S.painel = {};
        servirSemOt({ 'GET /api/v1/projects/p9/painel': payload });
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'privacy');
    };
    it('sem etapas.privacy não há trilha', async () => {
        await rodar(base({ iso: ISO }));
        expect(el('c').querySelector('#pn-trilha-t')).toBeNull();
    });
    it('tela fora da lista fechada não vira botão', async () => {
        await rodar(base({ privacy: { ...ISO, passos: P } }));
        const bs = [...el('c').querySelectorAll('#pn-trilha-t')[0].closest('section').querySelectorAll('button')];
        expect(bs.length).toBe(1);
        expect(JSON.parse(bs[0].dataset.args)[1]).toBe('importacao');
    });
    it('o cliente não recebe a trilha nem botão de abrir', async () => {
        await rodar({ ...base({ privacy: { ...ISO, passos: P } }, 'cliente'), decisoes: [] });
        expect(el('c').querySelector('#pn-trilha-t')).toBeNull();
        expect(el('c').querySelector('button[data-action="painelAbrirProximo"]')).toBeNull();
    });
});
