// Lista de Gaps do projeto (n.privacy, spec 2026-10-19): GET /projects/:id/ropa/gaps. api() REAL; só o fetch é dublado.
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
const G = (id, extra = {}) => ({ id, ropa_id: 'r1', atividade: 'Atividade Exemplo', titulo: `Gap ${id}`, recomendacao: null, plano: null, responsavel: null,
    prazo: null, faixa: 'sem_prazo', status: 'Open', anexos: 0, ...extra });
const GAPS = [
    G('a', { titulo: 'Sem <b>política</b>', recomendacao: 'Criar política', plano: 'Redigir', responsavel: 'Responsável Exemplo', prazo: emDias(-3), faixa: 'vencidas', anexos: 2 }),
    G('b', { ropa_id: 'r2', atividade: 'Outra Atividade', prazo: emDias(5), faixa: 'ate_30', status: 'In Progress' }),
    G('c', { prazo: emDias(20), faixa: 'ate_30', responsavel: 'Responsável Exemplo' }),
    G('d', { status: 'Closed', faixa: null, prazo: emDias(-30) }),
];
const el = (id) => document.getElementById(id);
const linhas = () => [...el('gp-lista').querySelectorAll('tbody tr')];
const filtrar = (id, v) => { el(id).value = v; el(id).dispatchEvent(new Event('change', { bubbles: true })); };

async function abrir(gaps = GAPS) {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    const f = servir({ 'GET /api/v1/projects/p9/ropa/gaps': { gaps } });
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

describe('Gaps', () => {
    it('colunas da lista e texto escapado', async () => {
        const f = await abrir();
        expect(el('h').textContent).toBe('Gaps');
        expect([...el('c').querySelectorAll('thead th')].map((t) => t.textContent.trim()))
            .toEqual(['Atividade', 'Gap', 'Recomendação', 'Plano', 'Responsável', 'Prazo', 'Status', 'Anexos', 'Ações']);
        expect(linhas()).toHaveLength(4);
        const a = linhas()[0].textContent;
        expect(a).toContain('Criar política');
        expect(a).toContain('Responsável Exemplo');
        expect(a).toContain('Pendente');
        expect(el('c').innerHTML).not.toContain('<b>política</b>');
        expect(f.mock.calls.map(([u]) => new URL(u, 'http://localhost').pathname)).toEqual(['/api/v1/projects/p9/ropa/gaps']);
    });

    it('filtra por status, responsável e faixa de prazo, sem ir ao servidor', async () => {
        const f = await abrir();
        filtrar('gp-filtro-status', 'In Progress');
        expect(linhas().map((l) => l.textContent)).toEqual([expect.stringContaining('Outra Atividade')]);
        filtrar('gp-filtro-status', '');
        filtrar('gp-filtro-responsavel', 'Responsável Exemplo');
        expect(linhas()).toHaveLength(2);
        filtrar('gp-filtro-responsavel', '');
        filtrar('gp-filtro-prazo', 'vencido');
        // o concluído com prazo passado não é vencido
        expect(linhas().map((l) => l.textContent)).toEqual([expect.stringContaining('Criar política')]);
        filtrar('gp-filtro-prazo', '7');
        expect(linhas().map((l) => l.textContent)).toEqual([expect.stringContaining('Outra Atividade')]);
        filtrar('gp-filtro-prazo', '30');
        expect(linhas()).toHaveLength(2);
        filtrar('gp-filtro-prazo', 'sem_prazo');
        expect(linhas()).toHaveLength(0);
        expect(el('gp-lista').textContent).toContain('Nenhum gap com estes filtros');
        expect(f).toHaveBeenCalledTimes(1);
    });

    it('"Abrir" leva à atividade na aba Gaps', async () => {
        await abrir();
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
