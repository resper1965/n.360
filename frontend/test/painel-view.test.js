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
    numeros: [['1 de 3', 'atividades aprovadas'], ['2', 'pedidos atrasados'], ['0', 'terceiros vencidos']],
    comecando: false, fazer: ITENS,
    cobertura: [{ tema: 'Atividades (RoPA)', feito: 1, andamento: 1, falta: 1, conta: 'aprovadas / ... / ...' }, { tema: 'LIA exigidas', feito: 0, andamento: 0, falta: 0, conta: 'x' }],
    vencimentos: [{ tipo: 'Pedidos do titular', vencidos: 2, itens: [{ dias: 3, rotulo: 'PT-3' }, { dias: 40, rotulo: 'PT-<i>4</i>' }] }],
    riscos: [{ p: 4, i: 5, n: 2 }, { p: 1, i: 1, n: 1 }],
    passos: [{ texto: 'Indicar o encarregado', contexto: 'art. 41', feito: false, acao: 'Indicar', tela: 'encarregado' }],
    pedidos_semana: [0, 1, 0, 2, 0, 0, 1, 0, 3, 0, 1, 2],
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
        // cobertura, vencimentos, mapa e pedidos por semana
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
        S.painel['p9|privacy'].t -= 61_000;
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
    beforeEach(() => { history.replaceState(null, '', '/'); S.view = 'inicio'; });

    it('projeto: pede os dois módulos (sem ?modulo), linhas dos módulos com "Abrir" e a lista que junta os dois', async () => {
        const iso = BLOCO({ fazer: [{ grupo: 'atraso', quando: 'Venceu em 01/10', texto: '1 ação corretiva passou do prazo', contexto: '', acao: 'Ver as ações', tela: 'capa', modulo: 'iso' }],
            numeros: [['31 de 93', 'controles aplicáveis implementados'], ['1', 'ações vencidas'], ['23/10', 'próxima auditoria']] });
        const f = servir({ 'GET /api/v1/projects/p9/painel': PAINEL({ modulos: { privacy: BLOCO(), iso } }), 'GET /api/v1/projects/p9/ponto-de-partida': { cadastro: {}, cobertura: [], iso_ajudados: [] } });
        await abrir('n360');
        expect(el('h').textContent).toBe('Início');
        expect(chamadas(f)).toContain('GET /api/v1/projects/p9/painel');
        expect(chamadas(f).filter((x) => x.includes('/painel'))).toHaveLength(1);
        expect([...el('c').querySelectorAll('[data-action="abrirModulo"]')].map((b) => b.textContent)).toEqual(['Abrir o n.iso', 'Abrir o n.privacy']);
        expect(el('c').textContent).toContain('O que fazer agora, nos dois módulos');
        const nomes = [...el('c').querySelectorAll('[data-action="painelAbrir"]')].map((b) => b.getAttribute('aria-label'));
        expect(new Set(nomes).size).toBe(nomes.length);
        expect(nomes).toContain('Ver as ações: 1 ação corretiva passou do prazo (n.iso)');
        await vi.waitFor(() => expect(chamadas(f)).toContain('GET /api/v1/projects/p9/ponto-de-partida'));
        window.abrirModulo('iso');
        expect(irPara).toHaveBeenCalledWith('/iso');
        window.abrirModulo('https://evil.example');
        expect(irPara).toHaveBeenCalledTimes(1);
    });

    it('módulo fora do projeto: a linha diz que não está habilitado, sem número inventado', async () => {
        S.activeProject = { id: 'p9', modulos: ['iso'] }; S.projects = [S.activeProject];
        servir({ 'GET /api/v1/projects/p9/painel': PAINEL({ modulos: { iso: BLOCO() } }), 'GET /api/v1/projects/p9/ponto-de-partida': { cadastro: {} } });
        await abrir('n360');
        expect(el('c').textContent).toContain('Não habilitado neste projeto');
        expect([...el('c').querySelectorAll('[data-action="abrirModulo"]')].map((b) => b.textContent)).toEqual(['Abrir o n.iso']);
    });

    it('consultor com mais de um projeto: a carteira é o padrão; a escolha fica lembrada, e sem storage tudo funciona', async () => {
        S.projects = [S.activeProject, { id: 'p8', client_name: 'Outro', modulos: ['privacy'] }];
        const CARTEIRA = { projetos: [{ id: 'p8', nome: 'Clínica <b>Exemplo</b>', modulos: ['privacy'], tom: 'atraso', situacao: '1 prazo legal vencido', urgente: '1 pedido do titular atrasado', modulo_urgente: 'privacy', ultimo_movimento: null },
            { id: 'p9', nome: 'Exemplo', modulos: ['iso', 'privacy'], tom: 'ok', situacao: 'Em dia', urgente: 'Próximo: Pedido PT-9 em 03/11', modulo_urgente: 'iso', ultimo_movimento: null }] };
        const f = servir({ 'GET /api/v1/carteira': CARTEIRA, 'GET /api/v1/projects/p9/painel': PAINEL(), 'GET /api/v1/projects/p9/ponto-de-partida': { cadastro: {} } });
        await abrir('n360');
        expect(chamadas(f)).toEqual(['GET /api/v1/carteira']);
        expect(el('c').textContent).toContain('2 projetos. Um precisa de você hoje.');
        expect(el('c').querySelector('.pn-carteira b')).toBeNull();
        expect([...el('c').querySelectorAll('[data-action="painelAbrirProjeto"]')].map((b) => b.getAttribute('aria-label'))).toEqual(['Abrir Clínica <b>Exemplo</b>', 'Abrir Exemplo']);
        expect(el('a').querySelector('[aria-pressed="true"]').textContent).toBe('Carteira');
        window.painelVista('projeto');
        expect(localStorage.getItem('n360_vista')).toBe('projeto');
        await abrir('n360');
        expect(chamadas(f)).toContain('GET /api/v1/projects/p9/painel');
        // "Abrir" leva ao módulo da pendência, com o projeto ativo
        window.painelAbrirProjeto('p8', 'privacy');
        expect(S.activeProject.id).toBe('p8');
        expect(irPara).toHaveBeenCalledWith('/privacy');
        // storage indisponível: lê e grava em try/catch
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
        expect(() => window.painelVista('projeto')).not.toThrow();
        await abrir('n360');
        expect(el('c').querySelector('.pn-carteira')).toBeNull();
        window.painelVista('carteira');
        await abrir('n360');
        expect(el('c').querySelector('.pn-carteira')).not.toBeNull();
    });

    it('cliente com um projeto: sem alternância e sem carteira', async () => {
        S.user = { id: 'u2', role: 'org_user' };
        window.ehEquipeNess = () => false;
        S.projects = [S.activeProject, { id: 'p8', modulos: ['iso'] }];
        const f = servir({ 'GET /api/v1/projects/p9/painel': PAINEL({ visao: 'cliente', decisoes: [] }) });
        await abrir('n360');
        expect(chamadas(f)).toEqual(['GET /api/v1/projects/p9/painel']);
        expect(el('a').querySelector('.pn-alterna')).toBeNull();
        expect(el('c').textContent).toContain('Nada esperando a sua decisão agora.');
    });

    it('sem projeto: diz isso, sem chamar a API', async () => {
        S.activeProject = null; S.projects = [];
        const f = servir({});
        await abrir('n360');
        expect(el('c').textContent).toContain('Nenhum projeto ainda');
        expect(f).not.toHaveBeenCalled();
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
    it('pedidos por semana: número desta semana e média escritos; menos de dois pontos, nada', () => {
        document.body.innerHTML = graficoPedidos([2, 3, 1, 4, 3, 2, 5, 3, 4, 2, 6, 4]);
        expect(document.querySelector('.pn-spark-n').textContent).toContain('4');
        expect(document.body.textContent).toContain('média de 3,3 por semana');
        expect(graficoPedidos([1])).toBe('');
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
        S.user = { id: 'u2', role: 'org_admin' };
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
    it('Início do n.360: decisões antes das linhas, "Ler e aprovar" primário e "Abrir o n.x" secundário', async () => {
        history.replaceState(null, '', '/');
        servir({ 'GET /api/v1/projects/p9/painel': CLIENTE({ decisoes: DECISOES, modulos: { iso: ISO(), privacy: { saude: { tom: 'ok', rotulo: 'Em dia', frase: 'x' }, numeros: [['1', 'y']], comecando: false } } }) });
        await abrir('n360');
        const c = el('c');
        const decidir = c.querySelector('[data-action="abrirPedido"]');
        const abrirModulo = [...c.querySelectorAll('[data-action="abrirModulo"]')];
        expect(decidir.className).toContain('btn-primary');
        expect(abrirModulo).toHaveLength(2);
        for (const b of abrirModulo) expect(b.className).not.toContain('btn-primary');
        expect(decidir.compareDocumentPosition(abrirModulo[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    it('Início do cliente com projeto começando: sem números zerados nas linhas dos módulos', async () => {
        history.replaceState(null, '', '/');
        servir({ 'GET /api/v1/projects/p9/painel': CLIENTE({ modulos: { iso: ISO({ comecando: true, numeros: [['0 de 0', 'controles implementados']] }) } }) });
        await abrir('n360');
        expect(el('c').querySelector('.pn-fig')).toBeNull();
        expect(el('c').textContent).not.toContain('0 de 0');
    });
});
