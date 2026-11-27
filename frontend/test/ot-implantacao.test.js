// n.ot, tela Implantação (spec 2026-11-26 §3, PR6): lista de verificação do servidor, botão "Abrir" no lugar exato, sites em implantação
// e "criar site abre o site novo". api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir, resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));
vi.mock('../src/produto.js', async (orig) => ({ ...(await orig()), irPara: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { irPara, pedidoDoHub, telaPedida } from '../src/produto.js';
import '../src/views/ot.js';
import { montarImplantacao } from '../src/views/ot-configuracao.js';

const B = '/api/v1/projects/p9/ot';
const link = (tela, extra = {}) => ({ tela, ...extra });
const PASSOS = [
    { id: 'modulo', texto: 'Dar o n.ot às pessoas do cliente', estado: 'feito', detalhe: '2 pessoas com o n.ot', link: link('n360-usuarios') },
    { id: 'gestor', texto: 'Definir o Gestor ARCiber', estado: 'falta', detalhe: 'Sem Gestor ARCiber no comitê', link: link('n360-governanca') },
    { id: 'tecnicos', texto: 'Dar acesso aos técnicos', estado: 'falta', detalhe: '0 acessos concedidos', link: link('acessos') },
    { id: 'site', texto: 'Cadastrar o primeiro site', estado: 'feito', detalhe: '1 site', link: link('implantacao', { aba: 'novo-site' }) },
    { id: 'sonda', texto: 'Instalar a sonda e receber o primeiro envio', estado: 'falta', detalhe: '0 sondas; 0 instaladas; 0 com primeiro envio', link: link('sondas') },
    { id: 'agente', texto: 'Ligar o agente de coleta', estado: 'opcional', detalhe: 'Opcional', link: link('agente') },
    { id: 'fornecedores', texto: 'Ligar os fornecedores de OT', estado: 'falta', detalhe: '0 fornecedores', link: link('fornecedores') },
    { id: 'assessment', texto: 'Fazer a primeira avaliação do Assessment', estado: 'falta', detalhe: '0 itens avaliados', link: link('assessment') },
    { id: 'base', texto: 'Aprovar a primeira base', estado: 'falta', detalhe: '0 bases aprovadas', link: link('site', { site: 's1' }) },
];
const PAINEL = { modulos: { ot: { por_site: [{ id: 's1', nome: 'SE Norte Exemplo', area: 'implantacao', etapa: 2 }, { id: 's2', nome: 'SE Sul Exemplo', area: 'operacao' }] } } };
const PERM = { editar: true, ver_sondas: true };
const montar = async (rotas, perm = PERM) => {
    S.otPermissoes = perm; S.painel = {}; servir({ 'GET /api/v1/projects/p9/painel': PAINEL, ...rotas });
    const c = document.createElement('div'); document.body.append(c);
    await montarImplantacao(c, document.createElement('div'), { id: 'p9' });
    return c;
};
beforeEach(() => { S.token = 'tok'; S.user = { id: 'u' }; S.activeProject = { id: 'p9', modulos: ['iso', 'ot'] }; window.render = vi.fn(); window.otTela = vi.fn(); });
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('tela Implantação', () => {
    it('lista de verificação: nove passos com o estado em texto e um só botão primário, no primeiro que falta', async () => {
        const c = await montar({ [`GET ${B}/implantacao`]: { passos: PASSOS } });
        const ol = c.querySelector('ol[aria-label="Lista de verificação do projeto"]');
        const itens = [...ol.querySelectorAll('li')];
        expect(itens).toHaveLength(9);
        expect(itens.map((li) => li.querySelector('.org-dica').textContent)).toEqual(['Feito', 'Falta', 'Falta', 'Feito', 'Falta', 'Opcional', 'Falta', 'Falta', 'Falta']);
        expect(c.querySelectorAll('.btn-primary')).toHaveLength(1);
        expect(itens[1].querySelector('.btn-primary')).not.toBeNull();
        expect(itens[0].querySelector('button').dataset.action).toBe('otIrPasso');
        expect(JSON.parse(itens[8].querySelector('button').dataset.args)).toEqual([{ tela: 'site', site: 's1' }]);
    });
    it('sites em implantação: só os que não estão em Operação', async () => {
        const c = await montar({ [`GET ${B}/implantacao`]: { passos: PASSOS } });
        expect(c.textContent).toContain('Sites em implantação');
        expect(c.textContent).toContain('SE Norte Exemplo');
        expect(c.textContent).not.toContain('SE Sul Exemplo');
    });
    it('técnico (sem editar): não chama a lista, só os sites em implantação', async () => {
        const f = servir({ 'GET /api/v1/projects/p9/painel': PAINEL });
        S.otPermissoes = { editar: false }; S.painel = {};
        const c = document.createElement('div'); document.body.append(c);
        await montarImplantacao(c, document.createElement('div'), { id: 'p9' });
        expect(f.mock.calls.some(([u]) => String(u).includes('/ot/implantacao'))).toBe(false);
        expect(c.querySelector('ol')).toBeNull();
        expect(c.textContent).toContain('SE Norte Exemplo');
    });
    it('403 na lista: só os sites em implantação', async () => {
        S.painel = {}; S.otPermissoes = PERM;
        vi.stubGlobal('fetch', vi.fn(async (url) => (String(url).includes('/ot/implantacao') ? resposta({ error: 'Forbidden' }, 403) : resposta(PAINEL))));
        const c = document.createElement('div'); document.body.append(c);
        await montarImplantacao(c, document.createElement('div'), { id: 'p9' });
        expect(c.querySelector('ol')).toBeNull();
        expect(c.textContent).toContain('SE Norte Exemplo');
    });
    it('"Abrir" leva ao lugar exato', () => {
        window.otNovoSite = vi.fn();
        window.otIrPasso(link('n360-usuarios')); expect(irPara).toHaveBeenLastCalledWith('/?tela=users');
        window.otIrPasso(link('n360-governanca')); expect(irPara).toHaveBeenLastCalledWith('/iso?tela=governance'); // a governança é do módulo, não do n.360
        window.otIrPasso(link('implantacao', { aba: 'novo-site' })); expect(window.otNovoSite).toHaveBeenCalled();
        window.otIrPasso(link('site', { site: 's1' })); expect(window.otTela).toHaveBeenLastCalledWith('site', 's1', null);
        window.otIrPasso(link('sondas')); expect(window.otTela).toHaveBeenLastCalledWith('sondas');
    });
    it('a URL da governança abre a tela: o endereço vale para o módulo (pedidoDoHub) e não para o n.360 (telaPedida)', () => {
        history.replaceState(null, '', '/iso?tela=governance');
        expect(pedidoDoHub()).toMatchObject({ tela: 'governance' });
        history.replaceState(null, '', '/?tela=governance');
        expect(telaPedida(window.location, document)).toBeNull();
        history.replaceState(null, '', '/');
    });
    it('governança sem módulo que a tenha, e sondas fora do papel: texto no lugar do botão, nunca primário', async () => {
        S.activeProject = { id: 'p9', modulos: ['ot'] };
        const passos = PASSOS.map((x) => (x.id === 'tecnicos' ? { ...x, estado: 'feito' } : x));
        const c = await montar({ [`GET ${B}/implantacao`]: { passos } }, { editar: true, ver_sondas: false });
        const li = (id) => [...c.querySelectorAll('li')][PASSOS.findIndex((x) => x.id === id)];
        expect(li('gestor').querySelector('button')).toBeNull();
        expect(li('gestor').textContent).toContain('Abra a governança em um módulo do projeto');
        expect(li('sonda').querySelector('button')).toBeNull();
        expect(li('sonda').textContent).toContain('fora do seu papel');
        expect(li('fornecedores').querySelector('.btn-primary')).not.toBeNull(); // o primeiro passo com botão que falta
        expect(c.querySelectorAll('.btn-primary')).toHaveLength(1);
    });
    it('500 na lista: erro com "Tentar de novo", sem esconder a falha', async () => {
        S.painel = {}; S.otPermissoes = PERM;
        vi.stubGlobal('fetch', vi.fn(async (url) => (String(url).includes('/ot/implantacao') ? resposta({ error: 'x' }, 500) : resposta(PAINEL))));
        const c = document.createElement('div'); document.body.append(c);
        await montarImplantacao(c, document.createElement('div'), { id: 'p9' });
        expect(c.querySelector('.error-state')).not.toBeNull();
        expect(c.textContent).toContain('Tentar de novo');
        expect(c.querySelector('ol')).toBeNull();
    });
    it('salvar o site apaga o painel guardado do projeto (a lista de sites não fica atrás)', async () => {
        document.body.insertAdjacentHTML('beforeend', '<input id="ot-s-nome" value="SE Nova Exemplo"><select id="ot-s-tipo"><option value="outro">o</option></select><select id="ot-s-crit"><option value=""></option></select><input id="ot-s-local"><textarea id="ot-s-faixas"></textarea>');
        S.painel = { 'u|p9|ot': { t: Date.now(), dados: {} }, 'u|p9|n360': { t: Date.now(), dados: {} }, 'u|outro|ot': { t: Date.now(), dados: {} } };
        servir({ [`POST ${B}/sites`]: { ok: true, id: 's9' } });
        await window.otSalvarSite('');
        expect(Object.keys(S.painel)).toEqual(['u|outro|ot']);
    });
    it('criar site abre o site novo', async () => {
        document.body.insertAdjacentHTML('beforeend', '<input id="ot-s-nome" value="SE Nova Exemplo"><select id="ot-s-tipo"><option value="outro">o</option></select><select id="ot-s-crit"><option value=""></option></select><input id="ot-s-local"><textarea id="ot-s-faixas"></textarea>');
        servir({ [`POST ${B}/sites`]: { ok: true, id: 's9' } });
        await window.otSalvarSite('');
        expect(window.otTela).toHaveBeenCalledWith('site', 's9', null);
    });
});
