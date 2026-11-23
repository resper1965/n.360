// Painel do n.ot (spec 2026-11-19-paineis-do-n-ot): a tela desenha só o que o `GET /painel?modulo=ot` mandou. api() REAL; só o
// fetch é dublado. Quadro sem dado não aparece; nada de zero que pareça "em dia".
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir, resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));
vi.mock('../src/produto.js', async (original) => ({ ...(await original()), irPara: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { renderPainel } from '../src/views/painel.js';

const ETAPAS = [['comecar', 'Começar'], ['levantar', 'Levantar'], ['avaliar', 'Avaliar'], ['tratar', 'Tratar'], ['operar', 'Operar']]
    .map(([id, rotulo]) => ({ id, rotulo, feitos: 0, total: 2 }));
const OT = { etapa: 'levantar', feitos: 0, total: 2, proximo: { texto: 'Revisar os achados do levantamento', tela: 'ot', aba: 'sites' }, etapas: ETAPAS };
const EM_DIA = { tom: 'ok', rotulo: 'Em dia', frase: 'Nada vencido nem vencendo nos próximos 7 dias.', apoio: '' };
const ATENCAO = { tom: 'semana', rotulo: 'Atenção', frase: '1 desvio aberto.', apoio: '' };
const FAZER = [{ grupo: 'semana', quando: 'Nesta semana', texto: '1 desvio aberto', contexto: 'O sensor viu o que não está na base aprovada', acao: 'Ver os desvios', tela: 'ot', aba: 'sites', modulo: 'ot' }];
const painelOt = (visao, bloco, saude = ATENCAO) => ({ gerado_em: '2026-11-20T10:00:00Z', visao, modulos_pedidos: ['ot'], empresa: null, encarregados: [],
    programa: { estado: 'implantacao', desde: null, rotulo: 'Em implantação', etapas: { ot: OT } }, saude, modulos: { ot: { saude, comecando: false, ...bloco } } });
const EQUIPE = { numeros: [['0 de 2', 'sites em operação'], ['1', 'desvios abertos']], fazer: FAZER, cobertura: [], vencimentos: [], riscos: [], passos: [] };
const el = (id) => document.getElementById(id);
const montar = () => { document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>'; };
const abrir = async (corpo) => { const f = servir({ 'GET /api/v1/projects/p9/painel': corpo }); montar(); await renderPainel(el('c'), el('h'), el('a'), 'ot'); return f; };

beforeEach(() => {
    S.token = 'tok'; S.user = { id: 'u1', role: 'consultor', modulos: ['ot'] };
    S.activeProject = { id: 'p9', client_name: 'Exemplo', modulos: ['ot'] }; S.projects = [S.activeProject]; S.painel = {}; S.view = 'ot';
    window.render = vi.fn(); window.navigate = vi.fn(); window.ehEquipeNess = () => true;
    history.replaceState(null, '', '/ot?ot=painel');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); history.replaceState(null, '', '/'); delete window.ehEquipeNess; });

describe('Painel do n.ot: equipe', () => {
    it('pede ?modulo=ot e desenha a régua do n.ot com "Abrir", "O que fazer agora" e os números', async () => {
        const f = await abrir(painelOt('equipe', EQUIPE));
        expect(f.mock.calls.map(([u]) => String(u))).toEqual([expect.stringContaining('/api/v1/projects/p9/painel?modulo=ot')]);
        expect(el('c').querySelector('.pn-regua').getAttribute('aria-label')).toBe('Jornada do n.ot');
        expect(el('c').querySelector('.pn-regua-prox button')).not.toBeNull();
        expect(el('pn-fazer').closest('section').textContent).toContain('1 desvio aberto');
        expect(el('pn-ot-num').closest('section').textContent).toContain('sites em operação');
    });
    it('quadro sem dado não aparece: nada de cobertura, mapa nem vencimentos vazios', async () => {
        await abrir(painelOt('equipe', EQUIPE));
        for (const id of ['pn-cob', 'pn-mapa-t', 'pn-venc']) expect(el(id), id).toBeNull();
    });
    it('projeto começando: "Primeiros passos" e nenhum número', async () => {
        await abrir(painelOt('equipe', { ...EQUIPE, comecando: true, fazer: [], passos: [{ texto: 'Cadastrar o primeiro site', contexto: 'O inventário do n.ot começa pelo site', feito: false, acao: 'Abrir o n.ot', tela: 'ot' }] }));
        expect(el('c').textContent).toContain('Primeiros passos');
        expect(el('pn-ot-num')).toBeNull();
    });
});

describe('Painel do n.ot: cliente', () => {
    it('lê a frase e a régua, sem "Abrir", sem "O que fazer" e sem números de desvio', async () => {
        await abrir(painelOt('cliente', { numeros: [['0 de 2', 'sites em operação'], ['1', 'desvios abertos']] }, EM_DIA));
        expect(el('c').querySelector('.pn-regua')).not.toBeNull();
        expect(el('c').querySelector('.pn-regua-prox button')).toBeNull();
        expect(el('pn-fazer')).toBeNull();
        expect(el('pn-ot-num')).toBeNull();
        expect(el('c').textContent).not.toMatch(/desvio/i);
    });
    it('403 do servidor: a tela "não habilitado", sem quebrar', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => resposta({ error: 'Forbidden' }, 403)));
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'ot');
        expect(el('c').textContent).toContain('O n.ot não está habilitado neste projeto');
    });
});
