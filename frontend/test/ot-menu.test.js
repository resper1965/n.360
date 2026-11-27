// n.ot, menu em três grupos (spec 2026-11-26, PR5): Operação, Implantação e Configuração, cada item preso à permissão do servidor
// (GET /ot/permissoes). api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import html from '../login.html?raw';
import '../src/views/ot.js';

const B = '/api/v1/projects/p9/ot';
const el = (id) => document.getElementById(id);
const FECHADO = { editar: false, criar_lote: false, aprovar_lote: false, ver_sondas: false, gestor: false, leitor: false, tecnico: false, acao_corretiva: false, tela_inicial: 'painel' };
const EDITA = { ...FECHADO, editar: true, criar_lote: true, aprovar_lote: true, ver_sondas: true, acao_corretiva: true };
const SAUDE = { tom: 'plano', rotulo: 'Começando', frase: 'f', apoio: '' };
const PAINEL = { gerado_em: '2026-11-20T10:00:00Z', visao: 'equipe', modulos_pedidos: ['ot'], empresa: null, encarregados: [],
    programa: { estado: 'comecando', desde: null, rotulo: 'Começando', etapas: {} }, saude: SAUDE, modulos: { ot: { saude: SAUDE, numeros: [], comecando: true, fazer: [], passos: [] } } };
const SITES = { sites: [{ id: 's1', nome: 'SE Norte Exemplo', fase: 'em_levantamento' }, { id: 's2', nome: 'SE Sul Exemplo', fase: 'em_operacao' }] };

async function abrirOt(perm, caminho = '/ot', extra = {}) {
    history.replaceState(null, '', caminho);
    document.open(); document.write(html); document.close();
    document.body.insertAdjacentHTML('beforeend', '<h1 id="h"></h1><div id="a"></div><div id="c"></div>');
    S.activeProject = { id: 'p9', modulos: ['ot'] }; S.user = { id: 'u', role: 'consultor', modulos: ['ot'] };
    S.otProjeto = 'p9'; S.otTela = null; S.otSite = null; S.otModo = null; S.otSub = null; S.otPedido = null; S.otPermissoes = null; S.otDesvioFiltro = null; S.painel = {};
    const f = servir({ [`GET ${B}/permissoes`]: perm, 'GET /api/v1/projects/p9/painel': PAINEL, [`GET ${B}/sites`]: SITES, [`GET ${B}/desvios`]: { desvios: [] },
        [`GET ${B}/acessos`]: { acessos: [] }, 'GET /api/v1/users': [], ...extra });
    await window.renderOt(el('c'), el('h'), el('a'));
    return f;
}
const grupos = () => [...document.querySelectorAll('[id^="secao-ot-"]:not([hidden])')].map((n) => n.textContent.trim());
const itens = () => [...document.querySelectorAll('[id^="nav-ot-"]:not([hidden])')].map((n) => n.id);
beforeEach(() => { S.token = 'tok'; window.render = vi.fn(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); history.replaceState(null, '', '/'); });

describe('menu do n.ot em três grupos (PR5)', () => {
    it('três grupos, na ordem, com os itens certos para quem edita', async () => {
        await abrirOt(EDITA);
        expect(grupos()).toEqual(['Operação', 'Implantação', 'Configuração']);
        expect(itens()).toEqual(['nav-ot-painel', 'nav-ot-sites', 'nav-ot-desvios', 'nav-ot-assessment', 'nav-ot-relatorios',
            'nav-ot-implantacao', 'nav-ot-acessos', 'nav-ot-sondas', 'nav-ot-agente', 'nav-ot-integracao', 'nav-ot-fornecedores']);
    });
    it('cada grupo é um role=group rotulado pelo cabeçalho; o item de Implantação não repete o nome do grupo', async () => {
        await abrirOt(EDITA);
        for (const g of ['operacao', 'implantacao', 'configuracao']) {
            const grupo = el(`grupo-ot-${g}`);
            expect(grupo.getAttribute('role')).toBe('group');
            expect(grupo.hidden).toBe(false);
            expect(el(grupo.getAttribute('aria-labelledby'))).toBe(el(`secao-ot-${g}`));
            expect(grupo.contains(el(`secao-ot-${g}`))).toBe(true);
        }
        expect(el('nav-ot-implantacao').textContent.trim()).toBe('Sites em implantação');
        await abrirOt({ ...FECHADO, leitor: true });
        expect(el('grupo-ot-configuracao').hidden).toBe(true);
    });
    it('?ot=desvios&situacao=aceito abre Desvios já filtrado nos aceitos', async () => {
        const f = await abrirOt(EDITA, '/ot?ot=desvios&situacao=aceito');
        expect(f.mock.calls.map(([u]) => String(u)).some((u) => u.includes('/ot/desvios?situacao=aceito'))).toBe(true);
        expect(location.search).toBe('?ot=desvios');
    });
    it('quem edita sem ver_sondas não vê Sondas', async () => {
        await abrirOt({ ...EDITA, ver_sondas: false });
        expect(itens()).not.toContain('nav-ot-sondas');
        expect(itens()).toContain('nav-ot-acessos');
    });
    it('leitor: só Painel, Assessment e Relatórios; nenhum grupo Implantação ou Configuração', async () => {
        await abrirOt({ ...FECHADO, leitor: true });
        expect(grupos()).toEqual(['Operação']);
        expect(itens()).toEqual(['nav-ot-painel', 'nav-ot-assessment', 'nav-ot-relatorios']);
    });
    it('técnico: Operação (Painel, Sites, Desvios, Assessment, Relatórios) e Implantação, sem Configuração', async () => {
        await abrirOt({ ...FECHADO, tecnico: true, criar_lote: true });
        expect(grupos()).toEqual(['Operação', 'Implantação']);
        expect(itens()).toEqual(['nav-ot-painel', 'nav-ot-sites', 'nav-ot-desvios', 'nav-ot-assessment', 'nav-ot-relatorios', 'nav-ot-implantacao']);
    });
    it('sem ?ot=: a tela_inicial do servidor decide (implantação para quem edita; painel para os outros)', async () => {
        await abrirOt({ ...EDITA, tela_inicial: 'implantacao' });
        expect(el('h').textContent).toBe('Implantação');
        expect(el('nav-ot-implantacao').classList.contains('active')).toBe(true);
        expect(location.search).toBe('?ot=implantacao');
        expect(el('c').textContent).toContain('SE Norte Exemplo');
        expect(el('c').textContent).not.toContain('SE Sul Exemplo'); // em operação: fica em Sites
        await abrirOt({ ...EDITA, tela_inicial: 'painel' });
        expect(el('h').textContent).toBe('Painel');
        expect(location.search).toBe('?ot=painel'); // o Painel volta a escrever o próprio endereço
        await abrirOt({ ...FECHADO, tecnico: true, tela_inicial: 'implantacao' }); // o servidor só manda implantacao a quem edita; a tela confere
        expect(el('h').textContent).toBe('Painel');
    });
    it('?ot=painel explícito vence a tela_inicial', async () => {
        await abrirOt({ ...EDITA, tela_inicial: 'implantacao' }, '/ot?ot=painel');
        expect(el('h').textContent).toBe('Painel');
    });
    it('?ot=acessos abre Acessos de técnicos; Sondas sem ver_sondas e Configuração sem editar caem no Painel', async () => {
        await abrirOt(EDITA, '/ot?ot=acessos');
        expect(el('h').textContent).toBe('Acessos de técnicos');
        expect(el('c').textContent).not.toContain('Agente de coleta'); // o cartão do agente é a tela dele
        await abrirOt({ ...EDITA, ver_sondas: false }, '/ot?ot=sondas');
        expect(el('h').textContent).toBe('Painel');
        for (const t of ['acessos', 'agente', 'integracao', 'fornecedores', 'sondas']) {
            await abrirOt({ ...FECHADO, tecnico: true, ver_sondas: true }, `/ot?ot=${t}`);
            expect(el('h').textContent, t).toBe('Painel');
        }
    });
    it('?ot=desvios abre Desvios de todos os sites, sem site_id; o filtro de site da aba do site não vaza pelo menu', async () => {
        const f = await abrirOt(EDITA, '/ot?ot=desvios');
        expect(el('h').textContent).toBe('Desvios');
        const desvios = () => f.mock.calls.map(([u]) => new URL(String(u), 'http://x').pathname + new URL(String(u), 'http://x').search).filter((u) => u.includes('/ot/desvios'));
        expect(desvios()).toEqual([`${B}/desvios?situacao=aberto`]);
        S.otDesvioFiltro = { situacao: 'aberto', site_id: 's1', tipo: '' }; // a aba Desvios do site s1 deixou isto
        await window.otTela('desvios'); await window.renderOt(el('c'), el('h'), el('a'));
        expect(desvios().at(-1)).toBe(`${B}/desvios?situacao=aberto`);
    });
    it('o leitor não abre Desvios nem Implantação pelo endereço', async () => {
        for (const t of ['desvios', 'implantacao', 'sites']) {
            const f = await abrirOt({ ...FECHADO, leitor: true }, `/ot?ot=${t}`);
            expect(el('h').textContent, t).toBe('Painel');
            expect(f.mock.calls.map(([u]) => String(u)).filter((u) => /\/ot\/(sites|desvios)/.test(u)), t).toEqual([]);
        }
    });
    it('Agente e Integração sem cartão: a tela diz que não há, em vez de ficar em branco', async () => {
        await abrirOt(EDITA, '/ot?ot=agente');
        expect(el('c').textContent).toContain('Agente de coleta indisponível');
        await abrirOt(EDITA, '/ot?ot=integracao');
        expect(el('c').textContent).toContain('Integração indisponível');
    });
});
