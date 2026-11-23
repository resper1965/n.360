// Painel do n.ot (spec 2026-11-19-paineis-do-n-ot): a tela desenha só o que o `GET /painel?modulo=ot` mandou. api() REAL; só o
// fetch é dublado. Quadro sem dado não aparece; nada de zero que pareça "em dia".
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir, resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));
vi.mock('../src/produto.js', async (original) => ({ ...(await original()), irPara: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { renderPainel } from '../src/views/painel.js';
import { graficoCobertura, graficoPedidos } from '../src/views/painel-graficos.js';

const ETAPAS = [['comecar', 'Começar'], ['levantar', 'Levantar'], ['avaliar', 'Avaliar'], ['tratar', 'Tratar'], ['operar', 'Operar']]
    .map(([id, rotulo]) => ({ id, rotulo, feitos: 0, total: 2 }));
const OT = { etapa: 'levantar', feitos: 0, total: 2, proximo: { texto: 'Revisar os achados do levantamento', tela: 'ot', aba: 'sites' }, etapas: ETAPAS };
const EM_DIA = { tom: 'ok', rotulo: 'Em dia', frase: 'Nada vencido nem vencendo nos próximos 7 dias.', apoio: '' };
const ATENCAO = { tom: 'semana', rotulo: 'Atenção', frase: '1 desvio aberto.', apoio: '' };
const FAZER = [{ grupo: 'semana', quando: 'Nesta semana', texto: '1 desvio aberto', contexto: 'O sensor viu o que não está na base aprovada', acao: 'Ver os desvios', tela: 'ot', aba: 'sites', modulo: 'ot' }];
const painelOt = (visao, bloco, saude = ATENCAO) => ({ gerado_em: '2026-11-20T10:00:00Z', visao, modulos_pedidos: ['ot'], empresa: null, encarregados: [],
    programa: { estado: 'implantacao', desde: null, rotulo: 'Em implantação', etapas: { ot: OT } }, saude, modulos: { ot: { saude, comecando: false, ...bloco } } });
const SITES = [{ id: 's1', nome: 'SE <b>Norte</b>', fase: 'em_operacao', proximo: 'Tratar os desvios abertos', desvios_abertos: 1, revalidar_em: '2027-01-10', obra_ate: null, sonda: 'parada' },
    { id: 's2', nome: 'SE Sul', fase: 'em_levantamento', proximo: 'Começar o levantamento do site', desvios_abertos: 0, revalidar_em: null, obra_ate: null, sonda: null }];
const EQUIPE = { numeros: [['0 de 2', 'sites em operação'], ['1', 'desvios abertos']], fazer: FAZER, passos: [], por_site: [] };
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
    it('403 do servidor com o n.ot fora do projeto: a tela "não habilitado", sem quebrar', async () => {
        S.activeProject = { id: 'p9', client_name: 'Exemplo', modulos: ['iso'] }; S.projects = [S.activeProject];
        vi.stubGlobal('fetch', vi.fn(async () => resposta({ error: 'Forbidden' }, 403)));
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'ot');
        expect(el('c').textContent).toContain('O n.ot não está habilitado neste projeto');
    });
    it('403 com o n.ot no projeto: falta a concessão do n.ot à pessoa, sem "contratar" nem "Habilitar no projeto"', async () => {
        S.user = { id: 'u2', role: 'consultoria_admin', modulos: [] };
        vi.stubGlobal('fetch', vi.fn(async () => resposta({ error: 'Forbidden' }, 403)));
        montar();
        await renderPainel(el('c'), el('h'), el('a'), 'ot');
        const t = el('c').textContent;
        expect(t).toContain('Você ainda não tem acesso ao n.ot neste projeto');
        expect(t).toContain('concede');
        expect(t).not.toMatch(/contratar|não está habilitado/);
        expect(el('c').querySelector('[data-action="abrirProdutosDoProjeto"]')).toBeNull();
    });
});

describe('Painel do n.ot: Gestor ARCiber e Por site (PR2)', () => {
    it('Gestor (visão de cliente com "fazer") ganha "Abrir" na régua, "O que fazer" e Por site com Sonda', async () => {
        await abrir(painelOt('cliente', { numeros: [['1 de 2', 'sites em operação']], fazer: FAZER, passos: [], por_site: SITES }));
        expect(el('c').querySelector('.pn-regua-prox button')).not.toBeNull();
        expect(el('pn-fazer')).not.toBeNull();
        const t = el('pn-ot-sites').closest('section');
        expect([...t.querySelectorAll('th')].map((th) => th.textContent.trim())).toContain('Sonda');
        expect(t.textContent).toContain('SE <b>Norte</b>');
        expect(t.querySelector('b')).toBeNull();
        expect(t.textContent).toContain('Parada');
        expect(t.textContent).toContain('10/01/2027');
        const b = t.querySelector('button[data-action="otTela"]');
        expect(JSON.parse(b.dataset.args)).toEqual(['site', 's1', null]);
        expect(b.getAttribute('aria-label')).toBe('Abrir SE <b>Norte</b>');
    });
    it('técnico (Por site sem "sonda", sem "fazer"): sem "Abrir" na régua, sem coluna Sonda, sem "O que fazer"', async () => {
        const semSonda = SITES.slice(0, 1).map(({ sonda, ...s }) => s);
        await abrir(painelOt('cliente', { numeros: [['1 de 1', 'sites em operação']], por_site: semSonda }, EM_DIA));
        expect(el('c').querySelector('.pn-regua-prox button')).toBeNull();
        expect(el('pn-fazer')).toBeNull();
        const t = el('pn-ot-sites').closest('section');
        expect([...t.querySelectorAll('th')].map((th) => th.textContent.trim())).not.toContain('Sonda');
        expect(el('pn-ot-num')).not.toBeNull();
    });
    it('Por site vazio diz o que fazer, sem tabela zerada', async () => {
        await abrir(painelOt('equipe', { ...EQUIPE, por_site: [] }));
        expect(el('pn-ot-sites').closest('section').textContent).toContain('O inventário do n.ot começa pelo site');
        expect(el('pn-ot-sites').closest('section').querySelector('table')).toBeNull();
    });
});

const CONF = { resumo: { atende: 1, parcial: 1, nao_atende: 2, nao_se_aplica: 0, nao_avaliado: 21, revisar: 0, a_confirmar: 2 },
    categorias: [{ tema: 'Governança de segurança da informação', feito: 1, andamento: 0, falta: 2, conta: 'c' }],
    ativos: { arciber: 4, completos: 3, por_nivel: [{ nivel: 2, ativos: 3 }, { nivel: 3, ativos: 1 }] } };
const DESV = { por_site: [{ tema: 'SE Norte', feito: 1, andamento: 0, falta: 1, conta: 'x' }], por_mes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3],
    meses: ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'], fluxos_externos: { externos: 2, sem_vpn: 1 } };
const VENC = [{ tipo: 'Obra', vencidos: 0, itens: [{ dias: 12, rotulo: 'SE Sul' }] }, { tipo: 'Ação de desvio', vencidos: 1, itens: [] }];

describe('Painel do n.ot: quadros (PR3)', () => {
    it('equipe: Conformidade (números, barras e ativos do ARCiber), Desvios e exposição e Vencimentos', async () => {
        await abrir(painelOt('equipe', { ...EQUIPE, conformidade: CONF, desvios: DESV, vencimentos: VENC }));
        const conf = el('pn-ot-conf').closest('section');
        expect(conf.textContent).toContain('Não atende');
        expect(conf.textContent).toContain('3 de 4 ativos do ARCiber');
        expect(conf.textContent).toContain('Nível Purdue 2');
        expect(conf.querySelector('.pn-cob')).not.toBeNull();
        const desv = el('pn-ot-desv').closest('section');
        expect(desv.textContent).toContain('1 de 2 fluxos externos sem VPN');
        expect(desv.textContent).toContain('Regularizado');
        expect(desv.querySelector('.pn-spark')).not.toBeNull();
        expect(desv.querySelector('svg[aria-label^="Desvios detectados por mês"]')).not.toBeNull();
        expect(el('pn-venc').closest('section').textContent).toContain('SE Sul');
        for (const s of [conf, desv, el('pn-venc').closest('section')]) expect(s.querySelectorAll('details.pn-equiv').length, s.id).toBeGreaterThan(0);
    });
    it('dado do servidor vai escapado nos quadros', async () => {
        const x = '<img src=x onerror=alert(1)>';
        await abrir(painelOt('equipe', { ...EQUIPE, conformidade: { ...CONF, categorias: [{ ...CONF.categorias[0], tema: x }] },
            desvios: { ...DESV, por_site: [{ ...DESV.por_site[0], tema: x }] }, vencimentos: [{ tipo: x, vencidos: 0, itens: [{ dias: 3, rotulo: x }] }] }));
        expect(el('c').querySelector('img')).toBeNull();
        expect(el('pn-ot-desv').closest('section').textContent).toContain(x);
    });
    it('leitor: só o resumo da Conformidade em números; nada de desvio, vencimento ou barra', async () => {
        await abrir(painelOt('cliente', { conformidade: { resumo: CONF.resumo } }, EM_DIA));
        const conf = el('pn-ot-conf').closest('section');
        expect(conf.textContent).toContain('Atende');
        expect(conf.querySelector('.pn-cob')).toBeNull();
        for (const id of ['pn-ot-desv', 'pn-venc', 'pn-ot-sites']) expect(el(id), id).toBeNull();
        expect(el('c').textContent).not.toMatch(/desvio/i);
    });
    it('quadro sem dado não aparece: sem `conformidade`, `desvios` e `vencimentos`, nenhum dos três', async () => {
        await abrir(painelOt('cliente', {}, EM_DIA));
        for (const id of ['pn-ot-conf', 'pn-ot-desv', 'pn-venc']) expect(el(id), id).toBeNull();
    });
    it('vazios com texto, nunca zero falso', async () => {
        const vazio = { resumo: { atende: 0, parcial: 0, nao_atende: 0, nao_se_aplica: 0, nao_avaliado: 0, revisar: 0, a_confirmar: 0 }, categorias: [], ativos: { arciber: 0, completos: 0, por_nivel: [] } };
        await abrir(painelOt('equipe', { ...EQUIPE, conformidade: vazio, desvios: { por_site: [], por_mes: Array(12).fill(0), meses: DESV.meses, fluxos_externos: { externos: 0, sem_vpn: 0 } },
            vencimentos: [{ tipo: 'Obra', vencidos: 0, itens: [] }] }));
        expect(el('pn-ot-conf').closest('section').textContent).toContain('Catálogo da RO-CB.BR.01 ainda não carregado');
        expect(el('pn-ot-conf').closest('section').querySelector('.pn-num')).toBeNull();
        expect(el('pn-ot-desv').closest('section').textContent).toContain('Nenhum desvio');
        expect(el('pn-ot-desv').closest('section').querySelector('.pn-spark')).toBeNull();
        expect(el('pn-venc').closest('section').textContent).toContain('Nenhum prazo nos próximos 90 dias');
    });
});

describe('gráficos com rótulos próprios (o padrão não muda)', () => {
    it('sem rótulos, o padrão de sempre: Concluído/Em andamento/Falta e Pedidos recebidos', () => {
        document.body.innerHTML = graficoCobertura([{ tema: 'T', feito: 1, andamento: 2, falta: 3, conta: 'x' }]);
        expect(document.querySelector('.pn-cob-leg').textContent).toBe('ConcluídoEm andamentoFalta');
        expect(document.querySelector('svg').getAttribute('aria-label')).toBe('T: 1 concluídos, 2 em andamento, 3 faltam, de 6');
        expect([...document.querySelectorAll('th')].map((t) => t.textContent)).toEqual(['Tema', 'Concluído', 'Em andamento', 'Falta', 'Como se conta']);
        document.body.innerHTML = graficoPedidos([1, 2], ['2026-10', '2026-11']);
        expect(document.querySelector('svg').getAttribute('aria-label')).toMatch(/^Pedidos recebidos por mês/);
        expect([...document.querySelectorAll('th')].map((t) => t.textContent)).toEqual(['Mês', 'Pedidos']);
    });
    it('graficoCobertura com três rótulos na legenda, no aria-label e na tabela', () => {
        document.body.innerHTML = graficoCobertura([{ tema: 'SE <b>A</b>', feito: 1, andamento: 2, falta: 3, conta: 'x' }], ['Regularizado', 'Tratado ou aceito', 'Aberto']);
        expect(document.querySelector('.pn-cob-leg').textContent).toContain('Tratado ou aceito');
        expect(document.querySelector('svg').getAttribute('aria-label')).toBe('SE <b>A</b>: Regularizado 1, Tratado ou aceito 2, Aberto 3, de 6');
        expect([...document.querySelectorAll('th')].map((t) => t.textContent)).toEqual(['Tema', 'Regularizado', 'Tratado ou aceito', 'Aberto', 'Como se conta']);
    });
    it('graficoPedidos com a série e a coluna próprias', () => {
        document.body.innerHTML = graficoPedidos([1, 2], ['2026-10', '2026-11'], 'Desvios detectados', 'Desvios');
        expect(document.querySelector('svg').getAttribute('aria-label')).toMatch(/^Desvios detectados por mês/);
        expect([...document.querySelectorAll('th')].map((t) => t.textContent)).toEqual(['Mês', 'Desvios']);
    });
});
