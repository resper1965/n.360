// Matriz de riscos do n.iso: a cor e a contagem por nível seguem a faixa do servidor (`riskLevel`, src/services/riscos-atividade.ts),
// a mesma do mapa do n.privacy. Antes a matriz tinha cortes próprios e um quinto nível ("Muito Baixo") que o servidor não tem.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/grc.js';
import { nivelDaNota, nivelDoEscore } from '../src/nivel-risco.js';

// Cópia literal da faixa do servidor (`riskLevel`: até 5 Low, até 12 Medium, até 20 High, acima Critical).
const riskLevel = (s) => (s <= 5 ? 'Low' : s <= 12 ? 'Medium' : s <= 20 ? 'High' : 'Critical');
import grc from '../src/views/grc.js?raw';
import mapa from '../src/views/mapa-de-risco.js?raw';

const cor = (p, i) => document.querySelector(`[data-action="toggleRiskFilter"][data-args='[${p},${i}]']`).getAttribute('style');

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9' };
    S.projects = [S.activeProject];
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('nível de risco único', () => {
    it('é a faixa do servidor para toda nota de 1 a 25', () => {
        for (let s = 1; s <= 25; s++) expect(nivelDoEscore(s), String(s)).toBe(riskLevel(s));
        for (let p = 1; p <= 5; p++) for (let i = 1; i <= 5; i++) expect(nivelDaNota(p, i)).toBe(riskLevel(p * i));
    });

    it('as duas telas usam a mesma função, sem corte próprio', () => {
        expect(grc).toContain("from '../nivel-risco.js'");
        expect(mapa).toContain("from '../nivel-risco.js'");
        expect(grc).not.toMatch(/score >= (25|15|6|4)\b/);
        expect(grc).not.toContain('Very Low');
    });

    it('a matriz do n.iso pinta e conta pela faixa do servidor', async () => {
        document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
        // Corpo de GET /projects/:id/risks (src/routes/risks.ts): a lista crua.
        servir({ 'GET /api/v1/projects/p9/risks': [
            { id: 'r1', threat: 'A', probability: 1, impact: 2, risk_level: 'Low', status: 'Open' },
            { id: 'r2', threat: 'B', probability: 1, impact: 5, risk_level: 'Low', status: 'Open' },
            { id: 'r3', threat: 'C', probability: 5, impact: 5, risk_level: 'Critical', status: 'Open' },
        ] });
        await window.renderRisks(document.getElementById('c'), document.getElementById('h'), document.getElementById('a'));
        // Nota 2 e nota 5 são o mesmo nível (Baixo): mesma cor.
        expect(cor(1, 2)).toBe(cor(1, 5));
        expect(cor(1, 1)).toBe(cor(1, 5));
        expect(cor(3, 4)).toBe(cor(2, 3));
        const txt = document.getElementById('c').textContent.replace(/\s+/g, ' ');
        expect(txt).not.toContain('Muito Baixo');
        expect(txt).toMatch(/Baixo \(nota 1-5\) 2/);
        expect(txt).toMatch(/Crítico \(nota 21-25\) 1/);
    });
});
