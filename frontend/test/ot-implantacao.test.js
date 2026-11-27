// n.ot, tela Implantação (spec 2026-11-26 §3, PR6): lista de verificação do servidor, botão "Abrir" no lugar exato, sites em implantação
// e "criar site abre o site novo". api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));
vi.mock('../src/produto.js', async (orig) => ({ ...(await orig()), irPara: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { irPara } from '../src/produto.js';
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
const montar = async (rotas) => {
    S.painel = {}; servir({ 'GET /api/v1/projects/p9/painel': PAINEL, ...rotas });
    const c = document.createElement('div'); document.body.append(c);
    await montarImplantacao(c, document.createElement('div'), { id: 'p9' });
    return c;
};
beforeEach(() => { S.token = 'tok'; S.user = { id: 'u' }; S.activeProject = { id: 'p9' }; window.render = vi.fn(); window.otTela = vi.fn(); });
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
    it('técnico (403 na lista): só os sites em implantação', async () => {
        const c = await montar({});
        expect(c.querySelector('ol')).toBeNull();
        expect(c.textContent).toContain('SE Norte Exemplo');
    });
    it('"Abrir" leva ao lugar exato', () => {
        window.otNovoSite = vi.fn();
        window.otIrPasso(link('n360-usuarios')); expect(irPara).toHaveBeenLastCalledWith('/?tela=users');
        window.otIrPasso(link('n360-governanca')); expect(irPara).toHaveBeenLastCalledWith('/?tela=governance');
        window.otIrPasso(link('implantacao', { aba: 'novo-site' })); expect(window.otNovoSite).toHaveBeenCalled();
        window.otIrPasso(link('site', { site: 's1' })); expect(window.otTela).toHaveBeenLastCalledWith('site', 's1', null);
        window.otIrPasso(link('sondas')); expect(window.otTela).toHaveBeenLastCalledWith('sondas');
    });
    it('criar site abre o site novo', async () => {
        document.body.insertAdjacentHTML('beforeend', '<input id="ot-s-nome" value="SE Nova Exemplo"><select id="ot-s-tipo"><option value="outro">o</option></select><select id="ot-s-crit"><option value=""></option></select><input id="ot-s-local"><textarea id="ot-s-faixas"></textarea>');
        servir({ [`POST ${B}/sites`]: { ok: true, id: 's9' } });
        await window.otSalvarSite('');
        expect(window.otTela).toHaveBeenCalledWith('site', 's9', null);
    });
});
