// Gestão de GAPs do projeto (n.privacy, spec 2026-10-19): GET /projects/:id/ropa/gaps. api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import '../src/views/gaps.js';
import html from '../login.html?raw';
import rota from '../src/router.js?raw';
import main from '../src/main.js?raw';
import { SO_PRIVACY, TELAS_DOS_MODULOS } from '../src/produto.js';

initDelegation();

const hoje = new Date();
const emDias = (n) => new Date(hoje.getTime() + n * 86_400_000).toISOString().slice(0, 10);
// Corpo como o handler devolve (src/routes/ropa.ts, `gaps`): { gaps: [...] }.
const G = (id, extra = {}) => ({ id, ropa_id: 'r1', atividade: 'Atividade Exemplo', area: null, titulo: `Gap ${id}`, recomendacao: null, plano: null, responsavel: null,
    prazo: null, faixa: 'sem_prazo', status: 'Open', anexos: 0, ...extra });
const GAPS = [
    G('a', { titulo: 'Sem <b>política</b>', area: 'Recursos Humanos', recomendacao: 'Criar política', plano: 'Redigir', responsavel: 'Responsável Exemplo', prazo: emDias(-3), faixa: 'vencidas', anexos: 2 }),
    G('b', { ropa_id: 'r2', atividade: 'Outra Atividade', area: 'Jurídico', prazo: emDias(5), faixa: 'ate_30', status: 'In Progress' }),
    G('c', { prazo: emDias(20), faixa: 'ate_30', responsavel: 'Responsável Exemplo' }),
    G('d', { status: 'Closed', faixa: null, prazo: emDias(-30) }),
];
// Corpo de GET /ropa/:rid/gaps (src/routes/ropa-abas.ts), o que o modal "Controle de GAPs" usa.
const DA_ATIVIDADE = { ok: true, nao_aplicavel: false, gaps: [{ id: 'a', gap: 'Sem política', recomendacao: 'Criar política', plano_acao: 'Redigir',
    responsavel: { id: 'pa1', nome: 'Responsável Exemplo' }, prazo: emDias(-3), status: 'Open', anexos: [] }] };
const el = (id) => document.getElementById(id);
const linhas = () => [...el('gp-lista').querySelectorAll('tbody tr')];
const filtrar = (id, v) => { el(id).value = v; el(id).dispatchEvent(new Event('change', { bubbles: true })); };

async function abrir(gaps = GAPS, extra = {}) {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    const f = servir({ 'GET /api/v1/projects/p9/ropa/gaps': { gaps }, ...extra });
    await window.renderGaps(el('c'), el('h'), el('a'));
    return f;
}

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9' };
    window.abrirAtividade = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Gestão de GAPs', () => {
    it('colunas do legado, "Em atraso" derivado e texto escapado', async () => {
        const f = await abrir();
        expect(el('h').textContent).toBe('Gaps');
        expect([...el('c').querySelectorAll('thead th')].map((t) => t.textContent.trim()))
            .toEqual(['Gap', 'Atividade', 'Área', 'Responsável', 'Prazo', 'Status']);
        expect(linhas()).toHaveLength(4);
        const [a, b, , d] = linhas().map((l) => l.textContent);
        expect(a).toContain('Recursos Humanos');
        expect(a).toContain('Responsável Exemplo');
        expect(a).toContain('Em atraso');
        expect(b).toContain('Em andamento');
        // concluído com prazo passado não está em atraso
        expect(d).toContain('Concluído');
        expect(el('c').querySelector('tbody b')).toBeNull();
        expect(a).toContain('Sem <b>política</b>');
        expect(f.mock.calls.map(([u]) => new URL(u, 'http://localhost').pathname)).toEqual(['/api/v1/projects/p9/ropa/gaps']);
    });

    it('busca e filtro de Status (com "Em atraso"), sem ir ao servidor', async () => {
        const f = await abrir();
        expect(el('gp-contagem').textContent).toBe('4');
        expect(el('gp-busca').getAttribute('placeholder')).toBe('Gap, atividade, área ou responsável');
        expect(el('gp-busca').getAttribute('maxlength')).toBe('120');
        expect([...el('gp-f-status').options].map((o) => o.textContent)).toEqual(['Todos', 'Aberto', 'Em andamento', 'Concluído', 'Em atraso']);
        filtrar('gp-f-status', 'In Progress');
        expect(linhas().map((l) => l.textContent)).toEqual([expect.stringContaining('Outra Atividade')]);
        expect(el('gp-contagem').textContent).toBe('1 de 4');
        filtrar('gp-f-status', 'atraso');
        expect(linhas().map((l) => l.textContent)).toEqual([expect.stringContaining('Recursos Humanos')]);
        // O status é o que a coluna mostra: o aberto com prazo vencido está em "Em atraso", não em "Aberto".
        filtrar('gp-f-status', 'Open');
        expect(linhas().map((l) => l.textContent)).toEqual([expect.stringContaining('Gap c')]);
        filtrar('gp-f-status', '');
        el('gp-busca').value = 'juridico';
        el('gp-busca').dispatchEvent(new Event('input', { bubbles: true }));
        expect(linhas().map((l) => l.textContent)).toEqual([expect.stringContaining('Outra Atividade')]);
        el('gp-busca').value = 'nada assim';
        el('gp-busca').dispatchEvent(new Event('input', { bubbles: true }));
        expect(el('gp-lista').textContent).toContain('Nada encontrado com a busca ou o filtro');
        expect(f).toHaveBeenCalledTimes(1);
    });

    it('"Exportar" (na lista) baixa o CSV das ações das atividades', async () => {
        const f = await abrir(GAPS, { 'GET /api/v1/projects/p9/export/acoes-atividade': 'csv' });
        expect(el('a').querySelector('button')).toBeNull();
        const b = el('c').querySelector('[data-action="listaExportar"]');
        expect(b.textContent.trim()).toBe('Exportar');
        expect(JSON.parse(b.getAttribute('data-args'))).toEqual(['gp']);
        await window.listaExportar('gp');
        expect(f.mock.calls.map(([u]) => new URL(u, 'http://localhost').pathname)).toContain('/api/v1/projects/p9/export/acoes-atividade');
    });

    it('o Gap abre o modal "Controle de GAPs" da atividade, com as abas Gap, Plano de Ação e Anexo', async () => {
        const f = await abrir(GAPS, { 'GET /api/v1/projects/p9/ropa/r1/gaps': DA_ATIVIDADE, 'GET /api/v1/projects/p9/partes': [{ id: 'pa1', tipo: 'pessoa', nome: 'Responsável Exemplo', status: 'ativa' }] });
        const b = linhas()[0].querySelector('[data-action="gpAbrir"]');
        expect(JSON.parse(b.getAttribute('data-args'))).toEqual(['r1', 'a']);
        await window.gpAbrir('r1', 'a');
        expect(el('modal-content').textContent).toContain('Controle de GAPs');
        expect([...document.querySelectorAll('#modal-content [role="tab"]')].map((t) => t.textContent.trim())).toEqual(['Gap', 'Plano de Ação', 'Anexo']);
        expect(el('at-gap-gap').value).toBe('Sem política');
        expect(el('at-gap-resp').value).toBe('pa1');
        expect(f.mock.calls.map(([u]) => new URL(u, 'http://localhost').pathname)).toContain('/api/v1/projects/p9/ropa/r1/gaps');
    });

    it('a Atividade leva à ficha na aba Gaps; quem só lê não abre o modal', async () => {
        S.user = { role: 'org_user' };
        await abrir();
        expect(el('gp-lista').querySelector('[data-action="gpAbrir"]')).toBeNull();
        const b = linhas()[1].querySelector('[data-action="abrirAtividade"]');
        expect(JSON.parse(b.getAttribute('data-args'))).toEqual(['p9', 'r2', 'gaps']);
        b.click();
        expect(window.abrirAtividade).toHaveBeenCalledWith('p9', 'r2', 'gaps');
    });

    it('vazio: diz que os gaps nascem na aba Gaps de cada atividade', async () => {
        await abrir([]);
        expect(el('c').textContent).toContain('Nenhum gap registrado');
        expect(el('c').textContent).toContain('Controle de GAPs de cada atividade');
        expect(el('c').querySelector('[data-action="navigate"]').getAttribute('data-args')).toBe('["ropa"]');
    });

    it('a tela está ligada: item só do n.privacy, rota no router, módulo no main', () => {
        expect(html).toContain(`id="nav-gaps" data-action="navigate" data-args='["gaps"]'`);
        expect(rota).toContain("S.view === 'gaps') renderGaps(");
        expect(main).toContain("import './views/gaps.js';");
        expect(SO_PRIVACY).toContain('nav-gaps');
        expect(TELAS_DOS_MODULOS).toContain('gaps');
    });
});
