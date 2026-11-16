// Painel de entrada (estudo de 14/10/2026, direção A). api() REAL; só o fetch é dublado, com o corpo de
// GET /projects/:id/painel (src/services/painel.ts, painelDoProjeto) e de GET /api/v1/carteira (carteira).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir, resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));
vi.mock('../src/produto.js', async (original) => ({ ...(await original()), irPara: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { irPara } from '../src/produto.js';
import { renderPainel } from '../src/views/painel.js';
import '../src/views/encarregado.js';
import { graficoCobertura, graficoMapa, graficoVencimentos, graficoPedidos, nivelDoRisco } from '../src/views/painel-graficos.js';

const ITENS = [
    { grupo: 'atraso', quando: 'Venceu em 12/10', texto: '2 pedidos do titular atrasados', contexto: 'PT-1 (acesso), PT-<b>2</b>', acao: 'Responder os pedidos', tela: 'titular', aba: 'pedidos', modulo: 'privacy' },
    { grupo: 'semana', quando: 'Exigido', texto: 'Nenhum encarregado indicado (LGPD, art. 41)', contexto: 'A LGPD exige', acao: 'Indicar o encarregado', tela: 'encarregado', modulo: 'privacy' },
    { grupo: 'plano', quando: 'Planejar', texto: '1 evidência vencida', contexto: '', acao: 'Renovar as evidências', tela: 'evidence', modulo: 'privacy' },
];
const BLOCO = (extra = {}) => ({
    saude: { tom: 'atraso', rotulo: 'Atrasado' , frase: '2 pedidos do titular atrasados.', apoio: '' },
    numeros: [['1 de 3', 'atividades aprovadas'], ['2', 'pedidos atrasados'], ['0', 'fornecedores vencidos']],
    comecando: false, fazer: ITENS,
    cobertura: [{ tema: 'Atividades (RoPA)', feito: 1, andamento: 1, falta: 1, conta: 'aprovadas / ... / ...' }, { tema: 'LIA exigidas', feito: 0, andamento: 0, falta: 0, conta: 'x' }],
    vencimentos: [{ tipo: 'Pedidos do titular', vencidos: 2, itens: [{ dias: 3, rotulo: 'PT-3' }, { dias: 40, rotulo: 'PT-<i>4</i>' }] }],
    riscos: [{ p: 4, i: 5, n: 2 }, { p: 1, i: 1, n: 1 }],
    passos: [{ texto: 'Indicar o encarregado', contexto: 'art. 41', feito: false, acao: 'Indicar', tela: 'encarregado' }],
    pedidos_mes: [0, 1, 0, 2, 0, 0, 1, 0, 3, 0, 1, 2],
    acoes_por_prazo: [{ faixa: 'vencidas', rotulo: 'Vencidas', total: 1, itens: [{ id: 'a1', ropa_id: 'r1', atividade: 'Folha', title: 'Revisar', due_date: '2026-10-01', responsavel: null }] }],
    ...extra,
});
const PAINEL = (extra = {}) => ({
    gerado_em: '2026-10-15T14:32:00Z', visao: 'equipe', modulos_pedidos: ['privacy'],
    empresa: { razao_social: 'Exemplo <b>Logística</b> S.A.', nome_fantasia: 'Exemplo Log', cnpj: '12345678000190', setor: 'Transporte', cnae_codigo: '4930-2/02', porte: 'Médio porte', funcionarios: 420, municipio: 'Campinas', uf: 'SP' },
    encarregados: [{ nome: 'Marina Exemplo' }],
    programa: { estado: 'operacao', desde: '2026-03', rotulo: 'Em operação desde março de 2026' },
    saude: { tom: 'atraso', rotulo: 'Atrasado', frase: '2 pedidos do titular <script>atrasados</script>.', apoio: '1 assunto com prazo vencido.' },
    modulos: { privacy: BLOCO() },
    selos: { pedidos_titular: { exigem_atencao: 2, atrasados: 2 }, terceiros: {}, incidentes: {} },
    ...extra,
});
const el = (id) => document.getElementById(id);
const chamadas = (f) => f.mock.calls.map(([u, o]) => { const x = new URL(u, 'http://localhost'); return `${o?.method || 'GET'} ${x.pathname}${x.search}`; });
const montar = () => { document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>'; };
const abrir = async (entrada = 'privacy') => { montar(); await renderPainel(el('c'), el('h'), el('a'), entrada); };

beforeEach(() => {
    S.token = 'tok'; S.user = { id: 'u1', role: 'consultor', modulos: ['iso', 'privacy'] };
    S.activeProject = { id: 'p9', client_name: 'Exemplo', modulos: ['iso', 'privacy'] }; S.projects = [S.activeProject]; S.painel = {}; S.view = 'encarregado';
    window.render = vi.fn(); window.navigate = vi.fn(); window.ehEquipeNess = () => true; irPara.mockClear();
    history.replaceState(null, '', '/privacy');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); history.replaceState(null, '', '/'); delete window.ehEquipeNess; });

describe('entrada do n.privacy', () => {
    it('uma chamada só, com ?modulo=privacy; identidade, frase e estado escritos; texto do servidor escapado', async () => {
        const f = servir({ 'GET /api/v1/projects/p9/painel': PAINEL() });
        await abrir();
        expect(chamadas(f)).toEqual(['GET /api/v1/projects/p9/painel?modulo=privacy']);
        expect(el('h').textContent).toBe('Painel');
        const c = el('c');
        expect(c.querySelector('#pn-empresa').textContent).toContain('Exemplo <b>Logística</b> S.A.');
        expect(c.textContent).toContain('12.345.678/0001-90');
        expect(c.textContent).toContain('Marina Exemplo');
        expect(c.textContent).toContain('Em operação desde março de 2026');
        expect(c.querySelector('.pn-frase').textContent).toBe('2 pedidos do titular <script>atrasados</script>.');
        expect(c.querySelector('script, .pn-ident b, .pn-grupo b, .pn-lt i')).toBeNull();
        expect(c.querySelector('main, section[aria-labelledby]')).not.toBeNull();
    });

    it('"O que fazer": grupos de prazo e um botão por item com nome acessível único', async () => {
        servir({ 'GET /api/v1/projects/p9/painel': PAINEL() });
        await abrir();
        const botoes = [...el('c').querySelectorAll('#pn-fazer ~ * [data-action="painelAbrir"], .pn-grupo [data-action="painelAbrir"]')];
        expect(botoes).toHaveLength(3);
        const nomes = botoes.map((b) => b.getAttribute('aria-label'));
        expect(new Set(nomes).size).toBe(nomes.length);
        expect(nomes[0]).toBe('Responder os pedidos: 2 pedidos do titular atrasados');
        expect([...el('c').querySelectorAll('.pn-gt .pn-estado')].map((x) => x.textContent)).toEqual(['Atrasado', 'Nesta semana', 'Para planejar']);
    });

    it('nada de estado só por cor: todo marcador de estado tem texto; todo gráfico tem "Ver como tabela"; sem style= inline', async () => {
        servir({ 'GET /api/v1/projects/p9/painel': PAINEL() });
        await abrir();
        const c = el('c');
        for (const s of c.querySelectorAll('.pn-estado')) expect(s.textContent.trim().length).toBeGreaterThan(0);
        // cobertura, vencimentos, mapa e pedidos por mês
        expect(c.querySelectorAll('details.pn-equiv')).toHaveLength(4);
        for (const g of c.querySelectorAll('svg[role="img"], .pn-mapa-c')) expect(g.getAttribute('aria-label')).toBeTruthy();
        expect(c.innerHTML).not.toMatch(/\sstyle="/);
    });

    it('esqueleto no primeiro quadro, antes da resposta', async () => {
        let soltar;
        vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { soltar = () => r(resposta(PAINEL())); })));
        montar();
        const p = renderPainel(el('c'), el('h'), el('a'), 'privacy');
        expect(el('c').querySelector('.pn-esq')).not.toBeNull();
        expect(el('c').querySelector('[aria-busy="true"]')).not.toBeNull();
        soltar();
        await p;
        expect(el('c').querySelector('.pn-esq')).toBeNull();
    });

    it('cache de 60 s: voltar ao painel não chama de novo; vencido, mostra o antigo esmaecido e troca sem esqueleto', async () => {
        const f = servir({ 'GET /api/v1/projects/p9/painel': PAINEL() });
        await abrir();
        await abrir();
        expect(f).toHaveBeenCalledTimes(1);
        S.painel['u1|p9|privacy'].t -= 61_000;
        let soltar;
        vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { soltar = () => r(resposta(PAINEL({ saude: { tom: 'ok', rotulo: 'Em dia', frase: 'Nada vencido.', apoio: '' } }))); })));
        montar();
        const p = renderPainel(el('c'), el('h'), el('a'), 'privacy');
        expect(el('c').querySelector('.pn-esq')).toBeNull();
        expect(el('c').querySelector('.pn-recarregando .pn-frase').textContent).toContain('pedidos do titular');
        soltar();
        await p;
        expect(el('c').querySelector('.pn-frase').textContent).toBe('Nada vencido.');
        expect(el('c').querySelector('.pn-recarregando')).toBeNull();
    });

    it('projeto começando: primeiros passos no lugar da lista, nada zerado', async () => {
        servir({ 'GET /api/v1/projects/p9/painel': PAINEL({ saude: { tom: 'plano', rotulo: 'Começando', frase: 'O programa ainda não começou.', apoio: '' }, modulos: { privacy: BLOCO({ comecando: true }) } }) });
        await abrir();
        expect(el('c').textContent).toContain('Primeiros passos');
        expect(el('c').querySelector('.pn-saude .pn-estado').textContent).toBe('Começando');
        expect(el('c').querySelector('.pn-cob')).toBeNull();
    });

    it('cliente: "Esperando a sua decisão" e a linha do módulo; nada de cobertura, mapa nem lista da consultoria', async () => {
        S.user = { id: 'u2', role: 'org_user' };
        window.ehEquipeNess = () => false;
        servir({ 'GET /api/v1/projects/p9/painel': PAINEL({ visao: 'cliente', saude: { tom: 'vez', rotulo: 'Sua vez', frase: 'Um pedido espera a sua decisão.', apoio: '' },
            modulos: { privacy: { saude: { tom: 'vez', rotulo: 'Sua vez', frase: 'x' }, numeros: [['1 de 3', 'atividades aprovadas']], comecando: false } },
            decisoes: [{ id: 'pd1', titulo: 'Aprovar "Folha"', tipo: 'tratamento', papel: 'ciso', desde: '2026-10-10', acao: 'Ler e aprovar' }] }) });
        await abrir();
        const c = el('c');
        expect(c.textContent).toContain('Esperando a sua decisão');
        expect(c.querySelector('[data-action="abrirPedido"]').getAttribute('aria-label')).toBe('Ler e aprovar: Aprovar "Folha"');
        expect(c.querySelector('.pn-cob, .pn-mapa, .pn-lt')).toBeNull();
        expect(el('a').textContent).not.toContain('Exportar');
    });

    it('403 (módulo fora do projeto): diz quem habilita e volta ao n.360', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => resposta({ error: 'Produto n.privacy não habilitado neste projeto' }, 403)));
        await abrir();
        expect(el('c').textContent).toContain('O n.privacy não está habilitado neste projeto');
        expect(el('c').querySelector('a[href="/"]').textContent).toBe('Voltar ao início do n.360');
    });

    it('falha do servidor: mensagem, não tela quebrada', async () => {
        servir({});
        await abrir();
        expect(el('c').textContent).toContain('Não foi possível montar o painel');
    });

    it('botões: só telas da lista; aba do titular; "Indicar o encarregado" abre o modal ali mesmo', async () => {
        window.painelAbrir('javascript:alert(1)', null);
        expect(window.navigate).not.toHaveBeenCalled();
        window.painelAbrir('titular', 'incidentes');
        expect(S.titularAba).toBe('incidentes');
        expect(window.navigate).toHaveBeenCalledWith('titular');
        const abrirModal = vi.spyOn(window, 'abrirIndicarEncarregado').mockResolvedValue();
        window.painelAbrir('encarregado', null);
        expect(abrirModal).toHaveBeenCalledWith('p9');
    });

    it('Exportar no cabeçalho: as listas CSV da exportação, pelo caminho autenticado', async () => {
        servir({ 'GET /api/v1/projects/p9/painel': PAINEL() });
        await abrir();
        el('a').querySelector('[data-action="painelExportar"]').click();
        window.painelExportar('p9');
        expect([...el('modal-content').querySelectorAll('[data-action="painelBaixar"]')].map((b) => JSON.parse(b.getAttribute('data-args'))[1]))
            .toEqual(['atividades', 'ripd', 'lia', 'riscos-atividade', 'acoes-atividade']);
    });

    it('ações por faixa de prazo (F4): o modal de encarregado.js com as faixas que vieram no painel', async () => {
        servir({ 'GET /api/v1/projects/p9/painel': PAINEL() });
        await abrir();
        expect(el('c').querySelector('[data-action="abrirPrazosDasAcoes"]')).not.toBeNull();
        window.abrirPrazosDasAcoes('p9');
        expect(el('modal-content').textContent).toContain('Vencidas');
        window.abrirFaixaPrazo('p9', 'vencidas');
        expect(el('modal-content').textContent).toContain('Revisar');
    });
});

describe('início do n.360', () => {
    // Corpo de GET /api/v1/carteira (src/routes/painel.ts:51-60; linhas de `carteira`, src/services/painel.ts:551-640).
    const CARTEIRA = { gerado_em: '2026-11-16T12:00:00Z', projetos: [
        { id: 'p8', nome: 'Clínica <b>Exemplo</b>', modulos: ['privacy'], tom: 'atraso', situacao: '1 prazo legal vencido', urgente: '1 pedido do titular atrasado', modulo_urgente: 'privacy', ultimo_movimento: null },
        { id: 'p9', nome: 'Exemplo', modulos: ['iso', 'privacy', 'ot'], tom: 'ok', situacao: 'Em dia', urgente: 'Próximo: Pedido PT-9 em 03/11', modulo_urgente: 'iso', ultimo_movimento: null },
    ] };
    const OT = { saude: { tom: 'semana', rotulo: 'Atenção', frase: '2 desvios abertos.', apoio: '' }, numeros: [['2', 'desvios abertos']], comecando: false,
        fazer: [{ grupo: 'semana', quando: 'Nesta semana', texto: '2 desvios abertos', contexto: '', acao: 'Ver os desvios', tela: 'ot', aba: 'sites', modulo: 'ot' }] };
    const ISO_ATRASO = BLOCO({ fazer: [{ grupo: 'atraso', quando: 'Venceu em 01/10', texto: '1 ação corretiva passou do prazo', contexto: '', acao: 'Ver as ações', tela: 'capa', filtro: 'vencidas', modulo: 'iso' }] });
    beforeEach(() => {
        history.replaceState(null, '', '/');
        S.view = 'inicio';
        S.user = { id: 'u1', role: 'consultor', modulos: ['iso', 'privacy', 'ot'] };
        S.projects = [{ id: 'p8', client_name: 'Clínica', modulos: ['privacy'] }, { id: 'p9', client_name: 'Exemplo', modulos: ['iso', 'privacy', 'ot'] }];
        // O projeto lembrado da última visita: o state o hidrata de niso_activeProject (state.js:33).
        S.activeProject = S.projects[1];
        localStorage.setItem('niso_activeProject', JSON.stringify(S.projects[1]));
    });
    afterEach(() => { localStorage.removeItem('niso_activeProject'); });

    it('entrar no Início não pede o painel de projeto nenhum, solta o projeto ativo e não grava o lembrado', async () => {
        const f = servir({ 'GET /api/v1/carteira': CARTEIRA });
        const grava = vi.spyOn(Storage.prototype, 'setItem');
        await abrir('n360');
        expect(el('h').textContent).toBe('Início');
        expect(chamadas(f)).toContain('GET /api/v1/carteira');
        expect(chamadas(f).filter((x) => x.includes('/painel'))).toEqual([]);
        expect(S.activeProject).toBeNull();
        expect(grava.mock.calls.filter(([k]) => k === 'niso_activeProject')).toEqual([]);
        expect(JSON.parse(localStorage.getItem('niso_activeProject')).id).toBe('p9');
        expect(el('c').textContent).toContain('2 projetos. Um precisa de você hoje.');
        expect(el('c').querySelector('.pn-alterna')).toBeNull();
        expect(el('a').innerHTML).toBe('');
    });

    it('cada linha: empresa escapada, módulos, situação e o mais urgente; "Abrir no" só dos módulos da linha; um primário', async () => {
        servir({ 'GET /api/v1/carteira': CARTEIRA });
        await abrir('n360');
        const c = el('c');
        expect(c.querySelector('tbody b')).toBeNull();
        const linhas = [...c.querySelectorAll('tbody tr')];
        expect(linhas[0].textContent).toContain('Clínica <b>Exemplo</b>');
        expect(linhas[0].textContent).toContain('1 prazo legal vencido');
        expect(linhas[0].textContent).toContain('1 pedido do titular atrasado');
        const entrar = (tr) => [...tr.querySelectorAll('[data-action="painelAbrirProjeto"]')].map((b) => b.textContent);
        expect(entrar(linhas[0])).toEqual(['Abrir no n.privacy']);
        expect(entrar(linhas[1])).toEqual(['Abrir no n.iso', 'Abrir no n.privacy', 'Abrir no n.ot']);
        // A ação primária: o módulo da pendência mais urgente do primeiro projeto da lista.
        expect([...c.querySelectorAll('.btn-primary')].map((b) => b.getAttribute('aria-label'))).toEqual(['Abrir Clínica <b>Exemplo</b> no n.privacy']);
        for (const s of c.querySelectorAll('.pn-estado')) expect(s.textContent.trim().length).toBeGreaterThan(0);
    });

    it('n.ot (P0-1): sem ele na linha da carteira, nem botão nem situação, mesmo com o projeto e a pessoa tendo o módulo', async () => {
        const semOt = { ...CARTEIRA, projetos: [{ ...CARTEIRA.projetos[1], modulos: ['iso', 'privacy'] }] };
        servir({ 'GET /api/v1/carteira': semOt, 'GET /api/v1/projects/p9/painel': PAINEL({ modulos: { iso: BLOCO(), privacy: BLOCO() } }) });
        await abrir('n360');
        expect(el('c').textContent).not.toContain('n.ot');
        await window.painelVerSituacao('p9', 'Exemplo', el('c').querySelector('[data-action="painelVerSituacao"]'));
        expect([...el('c').querySelectorAll('.pn-sit .pn-m h3')].map((x) => x.textContent)).toEqual(['n.iso', 'n.privacy']);
        expect(el('c').textContent).not.toContain('n.ot');
    });

    it('"Ver situação" abre no lugar: pede o painel só ao abrir, sem ?modulo, não muda o projeto ativo e usa o cache de 60 s', async () => {
        const f = servir({ 'GET /api/v1/carteira': CARTEIRA, 'GET /api/v1/projects/p9/painel': PAINEL({ modulos: { iso: ISO_ATRASO, privacy: BLOCO(), ot: OT } }) });
        await abrir('n360');
        const ver = [...el('c').querySelectorAll('[data-action="painelVerSituacao"]')][1];
        expect(ver.getAttribute('aria-expanded')).toBe('false');
        expect(ver.getAttribute('aria-label')).toBe('Ver situação de Exemplo');
        await window.painelVerSituacao('p9', 'Exemplo', ver);
        expect(ver.getAttribute('aria-expanded')).toBe('true');
        expect(ver.getAttribute('aria-controls')).toBe('ini-sit-p9');
        const sit = el('ini-sit-p9');
        expect(sit).toBe(ver.closest('tr').nextElementSibling);
        expect([...sit.querySelectorAll('.pn-m h3')].map((x) => x.textContent)).toEqual(['n.iso', 'n.privacy', 'n.ot']);
        expect(sit.textContent).toContain('2 desvios abertos.');
        expect(sit.textContent).toContain('Mais urgente: 1 ação corretiva passou do prazo');
        expect(sit.querySelector('.btn-primary')).toBeNull();
        expect(chamadas(f)).toContain('GET /api/v1/projects/p9/painel');
        expect(S.activeProject).toBeNull();
        await window.painelVerSituacao('p9', 'Exemplo', ver);
        expect(ver.getAttribute('aria-expanded')).toBe('false');
        expect(el('ini-sit-p9')).toBeNull();
        await window.painelVerSituacao('p9', 'Exemplo', ver);
        expect(el('ini-sit-p9')).not.toBeNull();
        expect(chamadas(f).filter((x) => x.includes('/painel'))).toEqual(['GET /api/v1/projects/p9/painel']);
    });

    it('"Ver situação" com falha: diz isso na linha, sem segundo botão primário', async () => {
        servir({ 'GET /api/v1/carteira': CARTEIRA });
        await abrir('n360');
        await window.painelVerSituacao('p8', 'Clínica', el('c').querySelector('[data-action="painelVerSituacao"]'));
        expect(el('ini-sit-p8').textContent).toContain('Não foi possível ver a situação deste projeto');
        expect(el('c').querySelectorAll('.btn-primary')).toHaveLength(1);
    });

    it('a situação aberta leva o nome da empresa (escapado) no aria-label da região', async () => {
        servir({ 'GET /api/v1/carteira': CARTEIRA, 'GET /api/v1/projects/p8/painel': PAINEL({ modulos: { privacy: BLOCO() } }), 'GET /api/v1/projects/p9/painel': PAINEL({ modulos: { iso: ISO_ATRASO } }) });
        await abrir('n360');
        const [v8, v9] = [...el('c').querySelectorAll('[data-action="painelVerSituacao"]')];
        await window.painelVerSituacao('p8', 'Clínica <b>Exemplo</b>', v8);
        await window.painelVerSituacao('p9', 'Exemplo', v9);
        expect([...el('c').querySelectorAll('.pn-sit .pn-modulos')].map((x) => x.getAttribute('aria-label'))).toEqual(['Situação por módulo de Clínica <b>Exemplo</b>', 'Situação por módulo de Exemplo']);
        expect(el('c').querySelector('.pn-sit b')).toBeNull();
    });
    it('empresas com o mesmo nome: os nomes acessíveis dos botões se distinguem por (1), (2); nome único fica como está', async () => {
        const dup = { ...CARTEIRA, projetos: [{ ...CARTEIRA.projetos[1], id: 'a1', nome: 'Acme' }, { ...CARTEIRA.projetos[1], id: 'a2', nome: 'Acme' }, { ...CARTEIRA.projetos[0], id: 'b1', nome: 'Beta' }] };
        servir({ 'GET /api/v1/carteira': dup });
        await abrir('n360');
        const nomes = (acao) => [...el('c').querySelectorAll(`[data-action="${acao}"]`)].map((b) => b.getAttribute('aria-label'));
        expect(nomes('painelVerSituacao')).toEqual(['Ver situação de Acme (1)', 'Ver situação de Acme (2)', 'Ver situação de Beta']);
        const abrirNo = nomes('painelAbrirProjeto');
        expect(new Set(abrirNo).size).toBe(abrirNo.length);
        expect(abrirNo).toContain('Abrir Acme (2) no n.iso');
        expect(abrirNo).toContain('Abrir Beta no n.privacy');
    });

    it('lista pelo componente: busca sem acento e "N de M"', async () => {
        servir({ 'GET /api/v1/carteira': CARTEIRA });
        await abrir('n360');
        window.listaBuscar('ini-projetos', 'clinica');
        expect(el('ini-projetos-contagem').textContent).toBe('1 de 2');
        expect(el('c').querySelectorAll('tbody tr')).toHaveLength(1);
    });

    it('carteira vazia com projetos: a tela sem acesso do n.360, com o título do menu', async () => {
        servir({ 'GET /api/v1/carteira': { gerado_em: 'x', projetos: [] } });
        await abrir('n360');
        expect(el('c').textContent).toContain('nenhum módulo do n.360');
        expect(el('h').textContent).toBe('Início');
    });

    it('entrar é um clique: "Abrir no n.x" e o item mais urgente tornam o projeto ativo; "Indicar o encarregado" vai ao n.privacy', () => {
        window.painelAbrirProjeto('p9', 'ot');
        expect(S.activeProject.id).toBe('p9');
        expect(JSON.parse(localStorage.getItem('niso_activeProject')).id).toBe('p9');
        expect(irPara).toHaveBeenLastCalledWith('/ot');
        S.activeProject = null;
        window.painelAbrirItem('p8', 'titular', 'pedidos', 'atrasados');
        expect(S.activeProject.id).toBe('p8');
        expect(window.navigate).toHaveBeenLastCalledWith('titular', { filtroPainel: { tela: 'titular', aba: 'pedidos', filtro: 'atrasados' } });
        window.painelAbrirItem('p8', 'encarregado', null, null);
        expect(window.navigate).toHaveBeenLastCalledWith('encarregado');
        window.navigate.mockClear();
        S.activeProject = null;
        window.painelAbrirItem('zz', 'titular', 'pedidos', null);
        window.painelAbrirItem('p8', 'javascript:alert(1)', null, null);
        expect(window.navigate).not.toHaveBeenCalled();
        expect(S.activeProject).toBeNull();
    });

    it('painelAbrir e abrirModulo: só destinos da lista fechada', () => {
        window.painelAbrir('ot', 'sites', null);
        expect(irPara).toHaveBeenLastCalledWith('/ot?ot=sites');
        window.painelAbrir('ot', '<script>', null);
        expect(irPara).toHaveBeenLastCalledWith('/ot');
        window.abrirModulo('iso');
        expect(irPara).toHaveBeenLastCalledWith('/iso');
        irPara.mockClear();
        window.abrirModulo('https://evil.example');
        expect(irPara).not.toHaveBeenCalled();
    });

    it('"Abrir" com módulo que a pessoa não tem (ot) cai no primeiro módulo visível do projeto', () => {
        S.user = { id: 'u3', role: 'consultor', modulos: ['iso', 'privacy'] };
        S.projects = [{ id: 'p7', client_name: 'Com OT', modulos: ['ot', 'iso', 'privacy'] }];
        window.painelAbrirProjeto('p7', 'ot');
        expect(S.activeProject.id).toBe('p7');
        expect(irPara).toHaveBeenLastCalledWith('/iso');
        expect(irPara).not.toHaveBeenCalledWith('/ot');
    });

    describe('sem projeto (S.projects vazio)', () => {
        beforeEach(() => { S.activeProject = null; S.projects = []; });
        afterEach(() => { delete S.totalProjetos; delete window.loadProjects; });
        it('quem cria projeto: "Nenhum projeto ainda" com "Novo projeto" (o assistente), sem chamar a API', async () => {
            S.totalProjetos = 0;
            S.user = { id: 'u1', role: 'consultoria_admin' };
            const f = servir({});
            await abrir('n360');
            expect(el('c').querySelector('h3').textContent).toBe('Nenhum projeto ainda');
            const novo = el('c').querySelector('.empty-action [data-action="abrirNovoProjeto"]');
            expect([novo.textContent, novo.className.includes('btn-primary')]).toEqual(['Novo projeto', true]);
            expect(el('h').textContent).toBe('Início');
            expect(f).not.toHaveBeenCalled();
        });
        it('quem não cria: a tela sem acesso de sempre (o consultor sabe quem cria; o cliente, a quem pedir)', async () => {
            S.totalProjetos = 0;
            S.user = { id: 'u1', role: 'consultor' };
            await abrir('n360');
            expect(el('c').querySelector('button, a')).toBeNull();
            expect(el('c').textContent).toMatch(/administra a consultoria/);
            S.user = { id: 'u2', role: 'org_user' };
            window.ehEquipeNess = () => false;
            await abrir('n360');
            expect(el('c').querySelector('h3').textContent).toBe('Você ainda não tem acesso a um projeto');
        });
        it('lista de projetos que falhou não vira "nenhum projeto": erro com "Tentar de novo" que pede a lista outra vez', async () => {
            S.user = { id: 'u1', role: 'consultoria_admin' };
            await abrir('n360');
            expect(el('c').textContent).toContain('Não foi possível carregar os projetos');
            expect(el('c').querySelector('[data-action="recarregarInicio"]')).not.toBeNull();
            window.loadProjects = vi.fn(async () => {});
            await window.recarregarInicio();
            expect(window.loadProjects).toHaveBeenCalled();
            expect(window.render).toHaveBeenCalled();
        });
    });

    it('"Minhas aprovações" no topo quando há pedido esperando a pessoa; some sem pedido; falha dos pedidos não derruba a lista', async () => {
        // Corpo de GET /api/v1/pedidos (src/routes/pedidos.ts:182-191).
        const PEDIDOS = { pedidos: [
            { id: 'pd1', project_id: 'p8', titulo: 'Aprovar <b>política</b>', papel_exigido: 'ciso', status: 'aberto', meu_status: 'pendente', criado_em: '2026-11-10 10:00:00' },
            { id: 'pd2', project_id: 'p9', titulo: 'Já decidido', papel_exigido: 'ciso', status: 'aberto', meu_status: 'aprovado', criado_em: '2026-11-09 10:00:00' },
        ] };
        const f = servir({ 'GET /api/v1/carteira': CARTEIRA, 'GET /api/v1/pedidos': PEDIDOS });
        await abrir('n360');
        expect(chamadas(f)).toEqual(expect.arrayContaining(['GET /api/v1/carteira', 'GET /api/v1/pedidos']));
        const q = el('pn-aprov').closest('section');
        expect(q.compareDocumentPosition(el('ini-lista')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect([...q.querySelectorAll('[data-action="abrirPedido"]')].map((b) => b.getAttribute('aria-label'))).toEqual(['Abrir o pedido: Aprovar <b>política</b>']);
        expect(q.querySelector('b')).toBeNull();
        expect(q.textContent).toContain('Clínica');
        expect(q.querySelector('[data-action="navigate"]').textContent).toBe('Ver todas (1)');
        expect(el('c').querySelectorAll('.btn-primary')).toHaveLength(1);
        S.painel = {};
        servir({ 'GET /api/v1/carteira': CARTEIRA, 'GET /api/v1/pedidos': { pedidos: [PEDIDOS.pedidos[1]] } });
        await abrir('n360');
        expect(el('pn-aprov')).toBeNull();
        S.painel = {};
        servir({ 'GET /api/v1/carteira': CARTEIRA });
        await abrir('n360');
        expect(el('pn-aprov')).toBeNull();
        expect(el('c').querySelector('[data-action="painelVerSituacao"]')).not.toBeNull();
    });

    // Corpo de GET /api/v1/pedidos (src/routes/pedidos.ts:182-191).
    const PENDENTE = (i) => ({ id: `pd${i}`, project_id: 'p8', titulo: `Pedido ${i}`, papel_exigido: 'ciso', status: 'aberto', meu_status: 'pendente', criado_em: '2026-11-10 10:00:00' });

    it('"Minhas aprovações": no máximo 3 itens, e "Ver todas" conta todas (5 pendentes: mostra 3 e "Ver todas (5)")', async () => {
        servir({ 'GET /api/v1/carteira': CARTEIRA, 'GET /api/v1/pedidos': { pedidos: [1, 2, 3, 4, 5].map(PENDENTE) } });
        await abrir('n360');
        const q = el('pn-aprov').closest('section');
        expect(q.querySelectorAll('[data-action="abrirPedido"]')).toHaveLength(3);
        expect(q.querySelector('[data-action="navigate"]').textContent).toBe('Ver todas (5)');
    });

    it('"Minhas aprovações": 403 explícito em /pedidos tira só o quadro; a lista de projetos segue', async () => {
        const f = vi.fn(async (url) => {
            const k = new URL(url, 'http://localhost').pathname;
            if (k === '/api/v1/carteira') return resposta(CARTEIRA);
            if (k === '/api/v1/pedidos') return resposta({ error: 'Sem permissão' }, 403);
            return resposta({ error: 'API route not found' }, 404);
        });
        vi.stubGlobal('fetch', f);
        await abrir('n360');
        expect(el('pn-aprov')).toBeNull();
        expect(el('c').textContent).not.toContain('Não foi possível');
        expect(el('c').querySelectorAll('[data-action="painelVerSituacao"]')).toHaveLength(2);
    });

    it('invalidarInicio apaga o cache da carteira da pessoa: voltar ao Início pede a carteira e os pedidos de novo', async () => {
        const f = servir({ 'GET /api/v1/carteira': CARTEIRA, 'GET /api/v1/pedidos': { pedidos: [PENDENTE(1)] } });
        await abrir('n360');
        await abrir('n360'); // dentro dos 60 s: do cache
        expect(chamadas(f).filter((x) => x === 'GET /api/v1/pedidos')).toHaveLength(1);
        S.painel['outra|carteira'] = { t: Date.now(), dados: { projetos: [], pedidos: [] } };
        window.invalidarInicio();
        expect(S.painel['u1|carteira']).toBeUndefined();
        expect(S.painel['outra|carteira']).toBeDefined(); // só a da pessoa atual
        await abrir('n360');
        expect(chamadas(f).filter((x) => x === 'GET /api/v1/pedidos')).toHaveLength(2);
    });
});

describe('gráficos', () => {
    it('cobertura: barra 100% com o absoluto escrito e a tabela equivalente com "como se conta"', () => {
        document.body.innerHTML = graficoCobertura([{ tema: 'T<b>1</b>', feito: 29, andamento: 6, falta: 3, conta: 'a / b / c' }, { tema: 'Vazio', feito: 0, andamento: 0, falta: 0, conta: '' }]);
        expect(document.querySelector('.pn-cob-v').textContent).toBe('29 de 38');
        expect(document.querySelector('svg').getAttribute('aria-label')).toBe('T<b>1</b>: 29 concluídos, 6 em andamento, 3 faltam, de 38');
        expect(document.querySelectorAll('.pn-cob-v')[1].textContent).toBe('nenhum');
        expect(document.querySelector('table').textContent).toContain('a / b / c');
        expect(document.querySelector('b')).toBeNull();
    });
    it('mapa: nível pela mesma faixa do servidor; cada célula com nome; legenda com contagens', () => {
        expect([nivelDoRisco(1, 5), nivelDoRisco(3, 4), nivelDoRisco(4, 5), nivelDoRisco(5, 5)]).toEqual(['baixo', 'medio', 'alto', 'critico']);
        document.body.innerHTML = graficoMapa([{ p: 4, i: 5, n: 2 }, { p: 9, i: 9, n: 5 }]);
        expect(document.querySelector('[aria-label="Probabilidade 4, impacto 5, nível Alto: 2 riscos"]').textContent).toBe('2');
        expect(document.querySelector('.pn-mapa-leg').textContent).toContain('Alto 2');
        expect(document.querySelectorAll('.pn-mapa-c')).toHaveLength(25);
    });
    it('vencimentos: o vencido vira número; o ponto em até 7 dias é marcado; a tabela lista cada item', () => {
        document.body.innerHTML = graficoVencimentos([{ tipo: 'Pedidos', vencidos: 2, itens: [{ dias: 3, rotulo: 'PT-3' }, { dias: 40, rotulo: 'PT-4' }, { dias: 120, rotulo: 'fora' }] }]);
        expect(document.querySelector('.pn-lt-v').textContent).toContain('2');
        expect(document.querySelectorAll('.pn-lt-p')).toHaveLength(2);
        expect(document.querySelectorAll('.pn-lt-w')).toHaveLength(1);
        expect(document.querySelector('table').textContent).toContain('em 3 dias');
    });
    it('pedidos por mês: número deste mês e média escritos; menos de dois pontos, nada', () => {
        document.body.innerHTML = graficoPedidos([2, 3, 1, 4, 3, 2, 5, 3, 4, 2, 6, 4]);
        expect(document.querySelector('.pn-spark-n').textContent).toContain('4');
        expect(document.body.textContent).toContain('média de 3,3 por mês');
        expect(graficoPedidos([1])).toBe('');
        const meses = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
        document.body.innerHTML = graficoPedidos([2, 3, 1, 4, 3, 2, 5, 3, 4, 2, 6, 4], meses);
        expect(document.querySelector('table').textContent).toContain('nov/25');
        expect(document.querySelector('table').textContent).toContain('Este mês');
    });
});

describe('o cliente age: a entrada do cliente', () => {
    const DECISOES = [
        { id: 'pd1', titulo: 'Aprovar "Folha"', tipo: 'tratamento', papel: 'ciso', desde: '2026-10-10', acao: 'Ler e aprovar' },
        { id: 'pd2', titulo: 'Política de acesso', tipo: 'documento', papel: 'ciente', desde: '2026-10-11', acao: 'Ler e dar ciência' },
    ];
    const ISO = (extra = {}) => ({ saude: { tom: 'ok', rotulo: 'Em dia', frase: 'Nada vencido.' }, numeros: [['3 de 90', 'controles implementados'], ['2', 'ações vencidas'], ['nenhuma', 'próxima auditoria']], comecando: false,
        jornada: { atual: { numero: 3, titulo: 'Entrevistas <b>por</b> Trilha', status: 'in_progress' }, concluidas: 2, total: 41 }, ...extra });
    const CLIENTE = (extra = {}) => PAINEL({ visao: 'cliente', modulos_pedidos: ['iso'], saude: { tom: 'ok', rotulo: 'Em dia', frase: 'Nada vencido.', apoio: '' }, modulos: { iso: ISO() }, decisoes: [], ...extra });
    beforeEach(() => {
        S.user = { id: 'u2', role: 'org_admin', client_project_id: 'p9' };
        window.ehEquipeNess = () => false;
        S.view = 'dashboard';
        history.replaceState(null, '', '/iso');
    });

    it('n.iso: a decisão é o primário; nada de "Abrir o n.iso" nem números da consultoria; o próximo marco da jornada com "Ver a jornada"', async () => {
        servir({ 'GET /api/v1/projects/p9/painel': CLIENTE({ decisoes: DECISOES }) });
        await abrir('iso');
        const c = el('c');
        const decidir = [...c.querySelectorAll('[data-action="abrirPedido"]')];
        expect(decidir.map((b) => b.textContent)).toEqual(['Ler e aprovar', 'Ler e dar ciência']);
        expect(decidir[0].className).toContain('btn-primary');
        expect(decidir[1].className).not.toContain('btn-primary');
        expect(c.querySelector('[data-action="abrirModulo"]')).toBeNull();
        expect(c.textContent).not.toContain('ações vencidas');
        expect(c.textContent).not.toContain('controles implementados');
        const j = c.querySelector('#pn-jornada').closest('section');
        expect(j.textContent).toContain('Fase 3 de 41: Entrevistas <b>por</b> Trilha');
        expect(j.querySelector('b')).toBeNull();
        expect(j.textContent).toContain('2 de 41 fases concluídas');
        expect(JSON.parse(j.querySelector('[data-action="painelAbrir"]').getAttribute('data-args'))).toEqual(['project-detail', null]);
    });
    it('n.iso sem decisão: diz que nada espera e o que a consultoria está fazendo', async () => {
        servir({ 'GET /api/v1/projects/p9/painel': CLIENTE() });
        await abrir('iso');
        const c = el('c');
        expect(c.textContent).toContain('Nada esperando a sua decisão agora.');
        expect(c.textContent).toContain('A consultoria está conduzindo a fase 3: Entrevistas <b>por</b> Trilha.');
    });
    it('n.iso sem jornada aberta: diz isso, sem número', async () => {
        servir({ 'GET /api/v1/projects/p9/painel': CLIENTE({ modulos: { iso: ISO({ jornada: null }) } }) });
        await abrir('iso');
        expect(el('c').textContent).toContain('A jornada deste projeto ainda não foi aberta pela consultoria.');
    });
    it('Início do cliente: o projeto dele aberto, "Esperando a sua decisão" em cima, botões dos módulos que vieram; nunca a carteira', async () => {
        history.replaceState(null, '', '/');
        S.view = 'inicio';
        S.projects = [S.activeProject, { id: 'p8', modulos: ['iso'] }];
        const f = servir({ 'GET /api/v1/projects/p9/painel': CLIENTE({ decisoes: DECISOES, modulos: { iso: ISO(), privacy: { saude: { tom: 'ok', rotulo: 'Em dia', frase: 'x' }, numeros: [['1', 'y']], comecando: false } } }) });
        await abrir('n360');
        const c = el('c');
        expect(chamadas(f)).toEqual(['GET /api/v1/projects/p9/painel']);
        expect(c.querySelector('[data-action="painelVerSituacao"]')).toBeNull();
        expect(c.querySelector('#pn-proj').textContent).toBe('Exemplo Log');
        const entrar = [...c.querySelectorAll('[data-action="painelAbrirProjeto"]')];
        expect(entrar.map((b) => JSON.parse(b.getAttribute('data-args')))).toEqual([['p9', 'iso'], ['p9', 'privacy']]);
        const decidir = c.querySelector('[data-action="abrirPedido"]');
        expect(decidir.className).toContain('btn-primary');
        expect(c.querySelectorAll('.btn-primary')).toHaveLength(1);
        expect(decidir.compareDocumentPosition(entrar[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect([...c.querySelectorAll('.pn-quadro .pn-m h3')].map((x) => x.textContent)).toEqual(['n.iso', 'n.privacy']);
        expect(S.activeProject).toBeNull();
    });
    it('Início do cliente sem decisão: o primeiro "Abrir no" é o primário; projeto começando sem números zerados', async () => {
        history.replaceState(null, '', '/');
        S.view = 'inicio';
        servir({ 'GET /api/v1/projects/p9/painel': CLIENTE({ modulos: { iso: ISO({ comecando: true, numeros: [['0 de 0', 'controles implementados']] }) } }) });
        await abrir('n360');
        expect([...el('c').querySelectorAll('.btn-primary')].map((b) => b.textContent)).toEqual(['Abrir no n.iso']);
        expect(el('c').querySelector('.pn-fig')).toBeNull();
        expect(el('c').textContent).not.toContain('0 de 0');
        expect(el('c').textContent).toContain('Nada esperando a sua decisão agora.');
    });
    it('Início do cliente: n.ot só quando o servidor mandou o bloco (P0-1)', async () => {
        history.replaceState(null, '', '/');
        S.view = 'inicio';
        const ot = { saude: { tom: 'ok', rotulo: 'Em dia', frase: 'Sites em operação.' }, numeros: [['1', 'site']], comecando: false };
        servir({ 'GET /api/v1/projects/p9/painel': CLIENTE({ modulos: { iso: ISO(), ot } }) });
        await abrir('n360');
        expect([...el('c').querySelectorAll('[data-action="painelAbrirProjeto"]')].map((b) => b.textContent)).toEqual(['Abrir no n.iso', 'Abrir no n.ot']);
        S.painel = {};
        servir({ 'GET /api/v1/projects/p9/painel': CLIENTE() });
        await abrir('n360');
        expect(el('c').textContent).not.toContain('n.ot');
    });
    it('Início do cliente com activeProject solto (login deixa o projeto dele): os botões funcionam pelo client_project_id, não pelo ativo', async () => {
        history.replaceState(null, '', '/');
        S.view = 'inicio';
        servir({ 'GET /api/v1/projects/p9/painel': CLIENTE({ modulos: { iso: ISO({ fazer: [ITENS[2]] }) } }) });
        await abrir('n360');
        expect(S.activeProject).toBeNull();
        window.painelAbrirItem('p9', 'evidence', null, null);
        expect(S.activeProject.id).toBe('p9');
        expect(window.navigate).toHaveBeenCalledWith('evidence');
        S.activeProject = null;
        window.painelAbrirProjeto('p9', 'iso');
        expect(S.activeProject.id).toBe('p9');
        expect(irPara).toHaveBeenCalled();
    });
    it('cache por pessoa: a situação da equipe em p9 não serve o cliente de p9 (troca de usuário sem recarregar)', async () => {
        history.replaceState(null, '', '/');
        S.view = 'inicio';
        S.user = { id: 'u1', role: 'consultor', modulos: ['iso', 'privacy'] };
        window.ehEquipeNess = () => true;
        const f = servir({ 'GET /api/v1/carteira': { projetos: [{ id: 'p9', nome: 'Exemplo', modulos: ['iso'], tom: 'ok', situacao: 'Em dia', urgente: '' }] },
            'GET /api/v1/projects/p9/painel': PAINEL({ visao: 'equipe', modulos: { iso: ISO({ saude: { tom: 'ok', rotulo: 'Em dia', frase: 'SEGREDO-EQUIPE' } }) } }) });
        await abrir('n360');
        await window.painelVerSituacao('p9', 'Exemplo', el('c').querySelector('[data-action="painelVerSituacao"]'));
        expect(el('c').textContent).toContain('SEGREDO-EQUIPE');
        // sai e entra o cliente de p9, sem recarregar a página
        S.user = { id: 'u2', role: 'org_user', client_project_id: 'p9' };
        window.ehEquipeNess = () => false;
        const g = servir({ 'GET /api/v1/projects/p9/painel': CLIENTE() });
        await abrir('n360');
        expect(chamadas(g)).toEqual(['GET /api/v1/projects/p9/painel']);
        expect(el('c').textContent).not.toContain('SEGREDO-EQUIPE');
        expect(f).toBeDefined();
    });
    it('cliente com client_project_id fora de S.projects: vazio, sem chamada de rede', async () => {
        history.replaceState(null, '', '/');
        S.view = 'inicio';
        S.projects = [{ id: 'p8', modulos: ['iso'] }];
        const f = servir({});
        await abrir('n360');
        expect(f).not.toHaveBeenCalled();
        expect(el('c').querySelector('[data-action="painelAbrirProjeto"]')).toBeNull();
    });
    it('projeto lembrado de OUTRA conta no navegador é ignorado: o Início do cliente usa o dele', async () => {
        history.replaceState(null, '', '/');
        S.view = 'inicio';
        S.projects = [S.activeProject, { id: 'p8', client_name: 'Outra', modulos: ['iso'] }];
        localStorage.setItem('niso_activeProject', JSON.stringify(S.projects[1]));
        S.activeProject = S.projects[1];
        const f = servir({ 'GET /api/v1/projects/p9/painel': CLIENTE() });
        await abrir('n360');
        localStorage.removeItem('niso_activeProject');
        expect(chamadas(f)).toEqual(['GET /api/v1/projects/p9/painel']);
        expect(el('c').querySelector('#pn-proj').textContent).toBe('Exemplo Log');
        expect(S.activeProject).toBeNull();
    });
});
