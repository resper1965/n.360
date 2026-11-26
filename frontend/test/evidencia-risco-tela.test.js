// Evidência do tratamento ligada ao risco (migration 0122): no detalhe do risco do n.iso, quem edita liga uma evidência do projeto e desliga
// a que está ligada; quem só lê vê a lista sem os botões. api() e delegação REAIS; o fetch é falso.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import '../src/views/grc.js';

initDelegation();

const tudo = () => new Promise((ok) => setTimeout(ok, 0));
async function esperar(cond) { for (let i = 0; i < 40 && !cond(); i++) await tudo(); }
const botao = (rotulo) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === rotulo);
const sim = () => document.querySelector('.confirmar [data-confirmar="sim"]');
const risco = (evidencias) => ({ id: 'k1', asset: 'ERP (exemplo)', threat: 'Falha (exemplo)', impact: 3, probability: 3, risk_level: 'Medium',
    residual_level: 'Low', treatment: 'Mitigate', status: 'Open', aceite: { situacao: 'aceito' }, evidencias_tratamento: evidencias });

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

describe('n.iso: evidência do tratamento no detalhe do risco', () => {
    it('liga uma evidência que ainda não está ligada', async () => {
        S.risks = [risco([{ evidence_id: 'ev-1', file_name: 'restauracao.pdf', ligado_por: 'cons@exemplo.com' }])];
        const reqs = servidor({
            'GET /api/v1/projects/p9/evidence': [{ id: 'ev-1', file_name: 'restauracao.pdf' }, { id: 'ev-2', file_name: 'teste-backup.pdf' }],
            'POST /api/v1/evidence/ev-2/riscos': { ok: true, risk_id: 'k1', ligado: true },
        });
        window.openRiskDetailsModal('k1');
        expect(document.body.textContent).toContain('restauracao.pdf');
        botao('Ligar evidência').click();
        await esperar(() => document.getElementById('risco-ev-sel'));
        // A já ligada não volta a ser oferecida.
        expect([...document.querySelectorAll('#risco-ev-sel option')].map((o) => o.value)).toEqual(['ev-2']);
        botao('Ligar').click();
        await esperar(() => reqs.some((r) => r.k === 'POST /api/v1/evidence/ev-2/riscos'));
        expect(reqs.find((r) => r.k === 'POST /api/v1/evidence/ev-2/riscos').corpo).toEqual({ risk_id: 'k1' });
    });

    it('desliga com confirmação', async () => {
        S.risks = [risco([{ evidence_id: 'ev-1', file_name: 'restauracao.pdf', ligado_por: 'cons@exemplo.com' }])];
        const reqs = servidor({ 'DELETE /api/v1/evidence/ev-1/riscos/k1': { ok: true, risk_id: 'k1' } });
        window.openRiskDetailsModal('k1');
        botao('Desligar').click();
        await esperar(() => sim());
        sim().click();
        await esperar(() => reqs.some((r) => r.k === 'DELETE /api/v1/evidence/ev-1/riscos/k1'));
        expect(reqs.some((r) => r.k === 'DELETE /api/v1/evidence/ev-1/riscos/k1')).toBe(true);
    });

    it('quem só lê vê a lista, sem ligar nem desligar', () => {
        S.user = { role: 'org_user' };
        S.risks = [risco([{ evidence_id: 'ev-1', file_name: 'restauracao.pdf', ligado_por: 'cons@exemplo.com' }])];
        servidor({});
        window.openRiskDetailsModal('k1');
        expect(document.body.textContent).toContain('restauracao.pdf');
        expect(botao('Ligar evidência')).toBeUndefined();
        expect(botao('Desligar')).toBeUndefined();
    });
});
