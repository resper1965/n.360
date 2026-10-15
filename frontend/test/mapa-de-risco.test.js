// Mapa de risco do n.privacy (F2): matriz 5x5 sobre GET /projects/:id/ropa/riscos-mapa. api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { nivelDaNota } from '../src/views/mapa-de-risco.js';
import html from '../login.html?raw';
import rota from '../src/router.js?raw';
import main from '../src/main.js?raw';
import { SECOES_PRIVACY, SO_PRIVACY } from '../src/produto.js';

initDelegation();

// Corpo como o handler devolve (src/routes/ropa.ts, `riscos-mapa`): { riscos: [...] }.
const R = (id, p, i, extra = {}) => ({ id, ropa_id: 'r1', threat: `Ameaça ${id}`, probability: p, impact: i, risk_level: nivelDaNota(p, i), residual_level: null, atividade: 'Folha de pagamento', ...extra });
const RISCOS = [
    R('a', 5, 5, { threat: 'Vazamento <b>grave</b>', atividade: 'Folha <i>x</i>' }),
    R('b', 5, 5, { residual_level: 'Medium' }),
    R('c', 1, 2),
    R('iso', 3, 3, { ropa_id: null }),
];
const el = (id) => document.getElementById(id);
const celula = (p, i) => document.querySelector(`[data-action="mapaCelula"][data-args='[${p},${i}]']`);

async function abrir(riscos = RISCOS) {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    const f = servir({ 'GET /api/v1/projects/p9/ropa/riscos-mapa': { riscos } });
    await window.renderMapaDeRisco(el('c'), el('h'), el('a'));
    return f;
}

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9' };
    window.openLigacoesTratamento = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('mapa de risco', () => {
    it('a faixa de nível é a do servidor (riskLevel)', () => {
        expect([nivelDaNota(1, 5), nivelDaNota(2, 3), nivelDaNota(3, 4), nivelDaNota(4, 4), nivelDaNota(4, 5), nivelDaNota(5, 5)])
            .toEqual(['Low', 'Medium', 'Medium', 'High', 'High', 'Critical']);
    });

    it('soma os riscos por célula e diz o nível por texto, não só por cor', async () => {
        await abrir();
        expect(document.querySelectorAll('[data-action="mapaCelula"]').length).toBe(25);
        expect(celula(5, 5).getAttribute('aria-label')).toBe('Probabilidade 5, impacto 5: nível Crítico, 2 riscos');
        expect(celula(5, 5).textContent.replace(/\s+/g, ' ').trim()).toBe('2 Crítico');
        expect(celula(1, 2).getAttribute('aria-label')).toBe('Probabilidade 1, impacto 2: nível Baixo, 1 risco');
        expect(celula(4, 4).textContent).toContain('Alto');
    });

    it('risco sem atividade (só do n.iso) não aparece no mapa', async () => {
        await abrir();
        expect(celula(3, 3).getAttribute('aria-label')).toContain('0 riscos');
        expect(el('c').textContent).toContain('3 riscos de atividades de tratamento');
    });

    it('clicar na célula lista os riscos dela e abre a atividade; clicar de novo fecha', async () => {
        await abrir();
        celula(5, 5).click();
        expect(celula(5, 5).getAttribute('aria-pressed')).toBe('true');
        const lista = el('mapa-lista');
        expect(lista.textContent).toContain('Probabilidade 5, impacto 5: 2 riscos');
        expect(lista.textContent).toContain('Médio');
        const abrirAtv = lista.querySelector('[data-action="openLigacoesTratamento"]');
        expect(JSON.parse(abrirAtv.getAttribute('data-args'))).toEqual(['p9', 'r1']);
        abrirAtv.click();
        expect(window.openLigacoesTratamento).toHaveBeenCalledWith('p9', 'r1');
        celula(5, 5).click();
        expect(el('mapa-lista').textContent).toContain('Escolha uma célula');
    });

    it('escapa o texto vindo do servidor', async () => {
        await abrir();
        celula(5, 5).click();
        expect(el('mapa-lista').innerHTML).not.toContain('<b>grave</b>');
        expect(el('mapa-lista').innerHTML).toContain('&lt;b&gt;grave&lt;/b&gt;');
        expect(el('mapa-lista').querySelector('i')).toBeNull();
    });

    it('nenhum link leva ao n.iso (matriz, CAPA); sem riscos, o vazio leva aos tratamentos', async () => {
        await abrir();
        celula(5, 5).click();
        const html = el('c').innerHTML + el('a').innerHTML;
        expect(html).not.toMatch(/"(risks|capa)"|\/iso/);
        await abrir([]);
        expect(el('c').textContent).toContain('Nenhum risco nas atividades de tratamento');
        expect(el('c').querySelector('[data-action="navigate"]').getAttribute('data-args')).toBe('["ropa"]');
    });

    it('a tela está ligada: item no menu do n.privacy (Avaliar), rota no router e módulo no main', () => {
        expect(html).toContain(`id="nav-mapa-de-risco" data-action="navigate" data-args='["mapa-de-risco"]'`);
        expect(rota).toContain("S.view === 'mapa-de-risco') renderMapaDeRisco(");
        expect(main).toContain("import './views/mapa-de-risco.js';");
        expect(SECOES_PRIVACY.find(([t]) => t === 'Avaliar')[1]).toContain('nav-mapa-de-risco');
        expect(SO_PRIVACY).toContain('nav-mapa-de-risco');
    });

    it('um literal de rota por chamada', async () => {
        const f = await abrir();
        expect(f.mock.calls.map(([u]) => new URL(u, 'http://localhost').pathname)).toEqual(['/api/v1/projects/p9/ropa/riscos-mapa']);
    });
});
