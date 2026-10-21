// Aceite de risco num modelo só (spec 2026-10-20-frente2-regras-unicas-design.md, B2). Quem aceitou e quando são carimbados pelo servidor
// na transição para Accepted (src/routes/risks.ts e src/services/riscos-atividade.ts); a tela só pede o aceite. api() e delegação REAIS.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import '../src/views/grc.js';
import { montar } from '../src/atividade/aba-riscos.js';
import grc from '../src/views/grc.js?raw';

initDelegation();

const tudo = () => new Promise((ok) => setTimeout(ok, 0));
async function esperar(cond) { for (let i = 0; i < 40 && !cond(); i++) await tudo(); }
const botao = (rotulo) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === rotulo);
const sim = () => document.querySelector('.confirmar [data-confirmar="sim"]');
const risco = (extra = {}) => ({ id: 'k1', idr: 1, asset: 'ERP (exemplo)', threat: 'Vazamento (exemplo)', impact: 3, probability: 3, risk_level: 'Medium',
    treatment: 'Accept', status: 'Open', accepted_by: null, accepted_at: null, aceite_manual: 0, ...extra });

function servidor(rotas) {
    const reqs = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
        const k = `${opts.method || 'GET'} ${new URL(url, 'http://localhost').pathname}`;
        reqs.push({ k, corpo: opts.body ? JSON.parse(opts.body) : undefined });
        return k in rotas ? resposta(rotas[k]) : resposta({ error: `API route not found: ${k}` }, 404);
    }));
    return reqs;
}

beforeEach(() => {
    document.body.innerHTML = '<div id="painel"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9' };
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('n.iso: aceite pelo botão', () => {
    it('o formulário não pede mais quem aceitou nem quando', () => {
        expect(grc).not.toContain('risk-accepted-by');
        expect(grc).not.toContain('risk-accepted-at');
    });

    it('risco com tratamento Aceitar ainda aberto: "Aceitar risco" confirma e manda só status Accepted', async () => {
        const reqs = servidor({ 'PUT /api/v1/risks/k1': { ok: true } });
        S.risks = [risco()];
        window.openRiskDetailsModal('k1');
        const b = botao('Aceitar risco');
        expect(b.classList.contains('btn-primary')).toBe(false);
        b.click();
        await esperar(() => sim());
        sim().click();
        await esperar(() => reqs.length);
        expect(reqs).toEqual([{ k: 'PUT /api/v1/risks/k1', corpo: { status: 'Accepted' } }]);
    });

    it('risco aceito mostra quem e quando; aceite legado diz que foi registrado à mão; sem botão', () => {
        S.risks = [risco({ status: 'Accepted', accepted_by: 'cons@ness.lat', accepted_at: '2026-10-20' })];
        window.openRiskDetailsModal('k1');
        expect(document.getElementById('modal-content').textContent).toContain('Aceito por cons@ness.lat em 20/10/2026');
        expect(botao('Aceitar risco')).toBeUndefined();
        S.risks = [risco({ status: 'Accepted', accepted_by: 'Diretoria', accepted_at: '2026-05-10', aceite_manual: 1 })];
        window.openRiskDetailsModal('k1');
        expect(document.getElementById('modal-content').textContent).toContain('Aceite registrado à mão: Diretoria em 10/05/2026');
    });

    it('quem não edita não vê o botão', () => {
        S.user = { role: 'client' };
        S.risks = [risco()];
        window.openRiskDetailsModal('k1');
        expect(botao('Aceitar risco')).toBeUndefined();
    });
});

describe('n.privacy: aceite pelo botão na aba Riscos', () => {
    const P = '/api/v1/projects/p9/ropa/r1';
    const abrir = (riscos, editavel = true) => montar(document.getElementById('painel'), { projectId: 'p9', ropaId: 'r1', ficha: {}, editavel, recarregarFicha: vi.fn(async () => {}) });

    it('estratégia Aceitar ainda aberta: o botão confirma e manda só status Accepted', async () => {
        const reqs = servidor({ [`GET ${P}/riscos`]: { riscos: [risco()] }, [`GET ${P}/riscos/motivos`]: { motivos: [] }, 'GET /api/v1/projects/p9/partes': [],
            [`PUT ${P}/riscos/k1`]: { ok: true } });
        await abrir();
        const b = botao('Aceitar risco');
        expect(b.classList.contains('btn-primary')).toBe(false);
        b.click();
        await esperar(() => sim());
        sim().click();
        await esperar(() => reqs.some((r) => r.k.startsWith('PUT')));
        expect(reqs.filter((r) => r.k.startsWith('PUT'))).toEqual([{ k: `PUT ${P}/riscos/k1`, corpo: { status: 'Accepted' } }]);
    });

    it('risco aceito mostra a linha de aceite e não tem botão; sem edição, sem botão', async () => {
        servidor({ [`GET ${P}/riscos`]: { riscos: [risco({ status: 'Accepted', accepted_by: 'Diretoria', accepted_at: '2026-05-10', aceite_manual: 1 }), risco({ id: 'k2', idr: 2 })] },
            [`GET ${P}/riscos/motivos`]: { motivos: [] }, 'GET /api/v1/projects/p9/partes': [] });
        await abrir();
        expect(document.getElementById('painel').textContent).toContain('Aceite registrado à mão: Diretoria em 10/05/2026');
        expect([...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Aceitar risco')).toHaveLength(1);
        document.getElementById('painel').innerHTML = '';
        await abrir(null, false);
        expect(botao('Aceitar risco')).toBeUndefined();
    });
});
