// Aceite do risco residual (migration 0120, src/services/aceite-risco.ts): o servidor manda em cada risco o bloco `aceite` (situação,
// quem e quando, alçada, hash e se a pessoa pode aceitar ou revogar); a tela mostra o que ele permite e pede a senha. api() e delegação REAIS.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import '../src/views/grc.js';
import '../src/views/meus-pedidos.js';
import { montar } from '../src/atividade/aba-riscos.js';
import { colunaDeAceite, SITUACOES_ACEITE } from '../src/aceite-risco.js';
import grc from '../src/views/grc.js?raw';

initDelegation();

const tudo = () => new Promise((ok) => setTimeout(ok, 0));
async function esperar(cond) { for (let i = 0; i < 40 && !cond(); i++) await tudo(); }
const botao = (rotulo) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === rotulo);
const sim = () => document.querySelector('.confirmar [data-confirmar="sim"]');
const SEM_RESIDUAL = 'Defina o risco residual (impacto e probabilidade residuais) antes do aceite.';
const ACEITE = { situacao: 'pendente', por: null, em: null, com_senha: false, alcada: 'ceo', pode_aceitar: true, pode_revogar: false, hash: 'a'.repeat(64) };
const risco = (extra = {}, aceite = {}) => ({ id: 'k1', idr: 1, asset: 'ERP (exemplo)', threat: 'Vazamento (exemplo)', impact: 3, probability: 3, risk_level: 'Medium',
    residual_level: 'Low', treatment: 'Mitigate', status: 'Open', accepted_by: null, accepted_at: null, aceite_manual: 0, aceite: { ...ACEITE, ...aceite }, ...extra });
const enviar = async (id, campos) => {
    for (const [k, v] of Object.entries(campos)) document.getElementById(k).value = v;
    document.getElementById(id).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
};

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

describe('n.iso: aceite do risco residual', () => {
    it('o formulário não pede mais quem aceitou nem quando', () => {
        expect(grc).not.toContain('risk-accepted-by');
        expect(grc).not.toContain('risk-accepted-at');
    });

    it('com a alçada: "Aceitar risco residual" pede a senha e manda o hash visto, a senha e a justificativa', async () => {
        const reqs = servidor({ 'POST /api/v1/risks/k1/aceite': { ok: true }, 'GET /api/v1/projects/p9/risks': { ok: true, risks: [] } });
        S.risks = [risco()];
        window.openRiskDetailsModal('k1');
        const b = botao('Aceitar risco residual');
        expect(b.classList.contains('btn-primary')).toBe(false);
        b.click();
        expect(document.getElementById('modal-content').textContent).toContain('Direção (CEO)');
        // Tudo o que entra no hash aparece antes da senha: notas inerentes e residuais e o plano.
        const estado = document.getElementById('ar-estado').textContent;
        for (const t of ['impacto 3, probabilidade 3', 'Plano de tratamento']) expect(estado).toContain(t);
        await enviar('ar-form', { 'ar-senha': '', 'ar-just': '' });
        expect(document.getElementById('ar-erro').textContent).toBe('Informe a sua senha');
        await enviar('ar-form', { 'ar-senha': 'segredo', 'ar-just': 'Residual baixo' });
        await esperar(() => reqs.some((r) => r.k.startsWith('POST')));
        expect(reqs.filter((r) => r.k.startsWith('POST'))).toEqual([{ k: 'POST /api/v1/risks/k1/aceite', corpo: { senha: 'segredo', hash_visto: 'a'.repeat(64), justificativa: 'Residual baixo' } }]);
    });

    it('sem a alçada (pode_aceitar falso) não há botão de aceite, nem para quem edita', () => {
        S.risks = [risco({}, { pode_aceitar: false })];
        window.openRiskDetailsModal('k1');
        expect(botao('Aceitar risco residual')).toBeUndefined();
    });

    it('sem residual: no lugar do botão, o que falta para o aceite', () => {
        S.risks = [risco({ residual_level: null }, { pode_aceitar: false, alcada: null, motivo_nao_aceita: 'Avalie o risco residual (impacto e probabilidade residuais) antes do aceite.' })];
        window.openRiskDetailsModal('k1');
        expect(botao('Aceitar risco residual')).toBeUndefined();
        expect(document.getElementById('modal-content').textContent).toContain(SEM_RESIDUAL);
    });

    it('risco aceito mostra quem e quando; quem aceitou revoga com motivo', async () => {
        const reqs = servidor({ 'POST /api/v1/risks/k1/aceite/revogar': { ok: true }, 'GET /api/v1/projects/p9/risks': { ok: true, risks: [] } });
        S.risks = [risco({ status: 'Accepted' }, { situacao: 'aceito', por: 'Carla Ceo', em: '2026-11-20T13:05:00Z', com_senha: true, pode_aceitar: false, pode_revogar: true })];
        window.openRiskDetailsModal('k1');
        expect(document.getElementById('modal-content').textContent).toContain('Aceito por Carla Ceo em 20/11/2026');
        expect(botao('Aceitar risco residual')).toBeUndefined();
        botao('Revogar aceite').click();
        await enviar('rv-form', { 'rv-motivo': '', 'rv-senha': '' });
        expect(document.getElementById('rv-erro').textContent).toBe('Informe o motivo da revogação');
        await enviar('rv-form', { 'rv-motivo': 'Falha no backup', 'rv-senha': '' });
        expect(document.getElementById('rv-erro').textContent).toBe('Informe a sua senha');
        await enviar('rv-form', { 'rv-motivo': 'Falha no backup', 'rv-senha': 'segredo' });
        await esperar(() => reqs.some((r) => r.k.startsWith('POST')));
        expect(reqs.filter((r) => r.k.startsWith('POST'))).toEqual([{ k: 'POST /api/v1/risks/k1/aceite/revogar', corpo: { motivo: 'Falha no backup', senha: 'segredo' } }]);
    });

    it('aceite antigo diz que foi registrado à mão; revogado mostra quem revogou', () => {
        S.risks = [risco({ status: 'Accepted', aceite_manual: 1 }, { situacao: 'aceito', por: 'Diretoria', em: '2026-05-10', legado: true, pode_aceitar: false })];
        window.openRiskDetailsModal('k1');
        expect(document.getElementById('modal-content').textContent).toContain('Aceite registrado à mão: Diretoria em 10/05/2026');
        S.risks = [risco({}, { situacao: 'revogado', revogado: { por: 'ceo@cliente.com', em: '2026-11-21T10:00:00Z', motivo: 'Falha no backup' } })];
        window.openRiskDetailsModal('k1');
        const t = document.getElementById('modal-content').textContent;
        expect(t).toContain('Aceite revogado por ceo@cliente.com');
        expect(t).toContain('Motivo: Falha no backup');
    });

    it('aceite vigente com o tratamento em outro status: a tela mostra o aceite pela situação, não pelo status', () => {
        S.risks = [risco({ status: 'Mitigated' }, { situacao: 'aceito', por: 'Carla Ceo', em: '2026-11-20T13:05:00Z', com_senha: true, pode_aceitar: false })];
        window.openRiskDetailsModal('k1');
        expect(document.getElementById('modal-content').textContent).toContain('Aceito por Carla Ceo em 20/11/2026');
        expect(botao('Pedir aceite')).toBeUndefined();
    });

    it('encerrado sem residual: "Não se aplica", fora do filtro "Aceite pendente", sem pedir aceite', () => {
        const r = risco({ status: 'Closed', residual_level: null }, { situacao: 'nao_se_aplica', pode_aceitar: false, alcada: null });
        expect(colunaDeAceite(r)).toContain('Não se aplica');
        expect(colunaDeAceite(r)).not.toContain('pendente');
        expect(SITUACOES_ACEITE).toContainEqual(['nao_se_aplica', 'Não se aplica']);
        S.risks = [r];
        window.openRiskDetailsModal('k1');
        expect(document.getElementById('modal-content').textContent).toContain('Não se aplica');
        expect(botao('Pedir aceite')).toBeUndefined();
    });

    it('o consultor pede o aceite com o papel da alçada, sem escolha', async () => {
        servidor({ 'GET /api/v1/projects/p9/governance': [{ email: 'ceo@cliente.com', name: 'Carla Ceo', job_title: 'CEO', role_category: 'cliente' }] });
        S.risks = [risco({}, { pode_aceitar: false })];
        window.openRiskDetailsModal('k1');
        botao('Pedir aceite').click();
        await esperar(() => document.getElementById('pn-papel'));
        expect([...document.getElementById('pn-papel').options].map((o) => o.value)).toEqual(['ceo']);
        expect(document.getElementById('modal-content').textContent).toContain('Pedir aceite do risco residual');
    });
});

describe('n.privacy: aceite na aba Riscos', () => {
    const P = '/api/v1/projects/p9/ropa/r1';
    const abrir = (editavel = true) => montar(document.getElementById('painel'), { projectId: 'p9', ropaId: 'r1', ficha: {}, editavel, recarregarFicha: vi.fn(async () => {}) });

    it('com a alçada: "Aceitar risco residual" manda a senha para a sub-rota da atividade, mesmo sem editar a atividade', async () => {
        const reqs = servidor({ [`GET ${P}/riscos`]: { riscos: [risco()] }, [`GET ${P}/riscos/motivos`]: { motivos: [] }, 'GET /api/v1/projects/p9/partes': [],
            [`POST ${P}/riscos/k1/aceite`]: { ok: true } });
        await abrir(false);
        const b = botao('Aceitar risco residual');
        expect(b.classList.contains('btn-primary')).toBe(false);
        b.click();
        await enviar('ar-form', { 'ar-senha': 'segredo', 'ar-just': '' });
        await esperar(() => reqs.some((r) => r.k.startsWith('POST')));
        expect(reqs.filter((r) => r.k.startsWith('POST'))).toEqual([{ k: `POST ${P}/riscos/k1/aceite`, corpo: { senha: 'segredo', hash_visto: 'a'.repeat(64), justificativa: null } }]);
    });

    it('sem residual: a linha diz o que falta no lugar do botão; aceito, não diz', async () => {
        const motivo = 'Avalie o risco residual (impacto e probabilidade residuais) antes do aceite.';
        servidor({ [`GET ${P}/riscos`]: { riscos: [risco({ residual_level: null }, { pode_aceitar: false, alcada: null, motivo_nao_aceita: motivo }),
            risco({ id: 'k2', idr: 2, status: 'Accepted' }, { situacao: 'aceito', por: 'Diretoria', em: '2026-05-10', pode_aceitar: false, motivo_nao_aceita: motivo })] },
            [`GET ${P}/riscos/motivos`]: { motivos: [] }, 'GET /api/v1/projects/p9/partes': [] });
        await abrir();
        expect(botao('Aceitar risco residual')).toBeUndefined();
        expect(document.getElementById('painel').textContent.split(SEM_RESIDUAL).length - 1).toBe(1);
    });

    it('encerrado sem residual: a linha diz que o aceite não se aplica', async () => {
        servidor({ [`GET ${P}/riscos`]: { riscos: [risco({ status: 'Closed', residual_level: null }, { situacao: 'nao_se_aplica', pode_aceitar: false, alcada: null })] },
            [`GET ${P}/riscos/motivos`]: { motivos: [] }, 'GET /api/v1/projects/p9/partes': [] });
        await abrir();
        expect(document.getElementById('painel').textContent).toContain('Aceite: não se aplica (risco encerrado sem residual)');
    });

    it('risco aceito mostra a linha de aceite e não tem botão; sem alçada, sem botão', async () => {
        servidor({ [`GET ${P}/riscos`]: { riscos: [risco({ status: 'Accepted', aceite_manual: 1 }, { situacao: 'aceito', por: 'Diretoria', em: '2026-05-10', pode_aceitar: false }), risco({ id: 'k2', idr: 2 }, { pode_aceitar: false })] },
            [`GET ${P}/riscos/motivos`]: { motivos: [] }, 'GET /api/v1/projects/p9/partes': [] });
        await abrir();
        expect(document.getElementById('painel').textContent).toContain('Aceite registrado à mão: Diretoria em 10/05/2026');
        expect(botao('Aceitar risco residual')).toBeUndefined();
    });
});
