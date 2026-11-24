// Tela "Fornecedores do n.ot". A propriedade que importa: sem o módulo ot (pessoa E projeto), nada é desenhado nem chamado;
// sem o privacy no projeto, o botão some, o aviso aparece e a rota de perguntas nunca é chamada. `api` dublado FALHA no caso proibido.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import '../src/ui.js';
import { montarFornecedoresOt } from '../src/views/ot-fornecedores.js';
import { S } from '../src/state.js';

const pausa = () => new Promise((r) => setTimeout(r, 0));
const FORN = { fornecedores: [{ id: 'f1', parte_id: 'pa1', parte_nome: 'Integra <b id="xss">Ltda</b>', papel: 'integrador', ot_site_id: 's1', ot_fluxo_id: null, site_efetivo_id: 's1' }] };
let chamadas, c, a;
function servir({ ot = true } = {}) {
    chamadas = []; apiMock.mockReset();
    apiMock.mockImplementation(async (m, url, corpo) => {
        chamadas.push([m, url, corpo]);
        if (/\/ot\//.test(url) && !ot) throw new Error(`chamou ${url} sem o módulo ot`);
        if (m === 'GET' && /\/ot\/fornecedores$/.test(url)) return FORN;
        if (/\/ot\/sites$/.test(url)) return { sites: [{ id: 's1', nome: 'SE Norte' }] };
        if (/\/ot\/fluxos$/.test(url)) return { fluxos: [] };
        if (/\/partes/.test(url)) return [{ id: 'pa1', nome: 'Integra' }];
        if (/perguntas-padrao$/.test(url)) return { ok: true, criadas: 4 };
        return { ok: true };
    });
}
const cenario = (pessoa, projeto, role = 'consultor') => {
    S.user = { id: 'u1', role, modulos: pessoa };
    S.activeProject = { id: 'p1', modulos: projeto };
    S.projects = [S.activeProject];
    document.body.innerHTML = '<div id="a"></div><div id="c"></div>';
    a = document.getElementById('a'); c = document.getElementById('c');
};
const botao = () => c.querySelector('[data-action="otFornPerguntas"]');
const chamouOt = () => chamadas.filter(([, u]) => /\/ot\//.test(u));
beforeEach(() => { vi.restoreAllMocks(); });

describe('sem o módulo ot: nada desenhado, nenhuma chamada', () => {
    it.each([['pessoa sem ot', ['iso', 'privacy'], ['iso', 'ot', 'privacy']], ['projeto sem ot', ['iso', 'ot'], ['iso']], ['módulos da pessoa desconhecidos', undefined, ['iso', 'ot']]])('%s', async (_n, pessoa, projeto) => {
        cenario(pessoa, projeto); servir({ ot: false });
        await montarFornecedoresOt(c, a, S.activeProject);
        expect(c.innerHTML).toBe('');
        expect(chamadas).toEqual([]);
    });
    it('os botões também não chamam', async () => {
        cenario(['iso'], ['iso', 'ot', 'privacy']); servir({ ot: false });
        await window.otFornPerguntas('f1'); await window.otFornVincular(); await window.otFornRemover('f1');
        expect(chamadas).toEqual([]);
    });
});

describe('com o módulo ot', () => {
    it('lista escapada; com privacy, o botão gera as perguntas uma vez só (duplo clique)', async () => {
        cenario(['iso', 'ot', 'privacy'], ['iso', 'ot', 'privacy']); servir();
        await montarFornecedoresOt(c, a, S.activeProject);
        expect(document.getElementById('xss')).toBeNull();
        expect(c.textContent).toContain('Integra <b id="xss">Ltda</b>');
        expect(c.textContent).toContain('Integrador');
        expect(c.textContent).toContain('SE Norte');
        expect(botao().textContent).toBe('Gerar perguntas de OT para o projeto');
        window.otFornPerguntas('f1'); window.otFornPerguntas('f1'); await pausa(); await pausa();
        expect(chamadas.filter(([m, u]) => m === 'POST' && /\/ot\/fornecedores\/f1\/perguntas-padrao$/.test(u))).toHaveLength(1);
    });
    it('com vários fornecedores há UM botão, do projeto, e ele usa o primeiro só como âncora de existência', async () => {
        cenario(['iso', 'ot', 'privacy'], ['iso', 'ot', 'privacy']); servir();
        const base = apiMock.getMockImplementation();
        apiMock.mockImplementation(async (m, url, corpo) => (m === 'GET' && /\/ot\/fornecedores$/.test(url)
            ? { fornecedores: [...FORN.fornecedores, { ...FORN.fornecedores[0], id: 'f2', parte_id: 'pa2', parte_nome: 'Outra' }] }
            : base(m, url, corpo)));
        await montarFornecedoresOt(c, a, S.activeProject);
        const botoes = c.querySelectorAll('[data-action="otFornPerguntas"]');
        expect(botoes).toHaveLength(1);
        expect(botoes[0].textContent).toBe('Gerar perguntas de OT para o projeto');
        expect(JSON.parse(botoes[0].dataset.args)).toEqual(['f1']);
        window.otFornPerguntas('f1'); await pausa(); await pausa();   // o arquivo não liga a delegação: chama a ação com os args do botão
        expect(chamadas.filter(([m, u]) => m === 'POST' && /\/ot\/fornecedores\/f1\/perguntas-padrao$/.test(u))).toHaveLength(1);
    });
    it('sem privacy no projeto: aviso, sem botão e a rota de perguntas não é chamada', async () => {
        cenario(['iso', 'ot', 'privacy'], ['iso', 'ot']); servir();
        await montarFornecedoresOt(c, a, S.activeProject);
        expect(botao()).toBeNull();
        expect(c.textContent).toContain('Habilite o n.privacy para avaliar fornecedores');
        await window.otFornPerguntas('f1');
        expect(chamadas.some(([, u]) => /perguntas-padrao/.test(u))).toBe(false);
    });
    it('sem privacy na pessoa: o mesmo', async () => {
        cenario(['iso', 'ot'], ['iso', 'ot', 'privacy']); servir();
        await montarFornecedoresOt(c, a, S.activeProject);
        expect(botao()).toBeNull();
        expect(c.textContent).toContain('Habilite o n.privacy');
    });
    it('quem não edita (org_user) só lê: sem formulário, sem remover, sem botão, sem /partes', async () => {
        cenario(['ot', 'privacy'], ['ot', 'privacy'], 'org_user'); servir();
        await montarFornecedoresOt(c, a, S.activeProject);
        expect(c.querySelector('[data-action="otFornVincular"]')).toBeNull();
        expect(c.querySelector('[data-action="otFornRemover"]')).toBeNull();
        expect(botao()).toBeNull();
        expect(chamadas.some(([, u]) => /\/partes/.test(u))).toBe(false);
    });
    it('vincular manda só o que foi escolhido; sem site nem fluxo não chama', async () => {
        cenario(['ot'], ['ot']); servir();
        await montarFornecedoresOt(c, a, S.activeProject);
        window.render = vi.fn();
        await window.otFornVincular();
        expect(chamadas.some(([m]) => m === 'POST')).toBe(false);
        document.getElementById('ot-forn-site').value = 's1';
        await window.otFornVincular();
        expect(chamadas.find(([m]) => m === 'POST')).toEqual(['POST', '/api/v1/projects/p1/ot/fornecedores', { parte_id: 'pa1', papel: 'integrador', ot_site_id: 's1' }]);
    });
});
