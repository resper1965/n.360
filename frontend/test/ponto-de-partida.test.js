// Painel "ponto de partida": api() REAL, só o fetch dublado (corpo do handler em src/routes/ponto-de-partida.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/ponto-de-partida.js';
import '../src/views/encarregado.js';
import '../src/views/dashboard.js';

const PONTO = (extra = {}) => ({
    cadastro: { tratamentos: 2, dpias: 1, documentos_vigentes: 1, evidencias_validas: 1, itens: 1, terceiros: 1, encarregado: true, incidentes: 1, treinamentos_concluidos: 1 },
    cobertura: [{ fonte: 'lgpd', total: 20, cobertos: 7, parciais: 2, lacunas: 11 }, { fonte: 'anpd', total: 5, cobertos: 1, parciais: 0, lacunas: 4 }],
    iso_ajudados: [{ requisito_id: 'iso27001:2022:A.5.9', referencia: 'A.5.9', titulo: 'Inventário <b>x</b>', por: ['art. 37'] }],
    ...extra,
});
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
const novo = () => { document.body.innerHTML = '<div id="c"></div><h1 id="h"></h1><div id="a"></div>'; return document.getElementById('c'); };

beforeEach(() => { S.token = 'tok'; S.user = { role: 'consultor' }; S.activeProject = { id: 'p9' }; window.render = vi.fn(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('renderPontoDePartida', () => {
    it('n.iso: lista o que a privacidade já adianta, com texto escapado', async () => {
        servir({ 'GET /api/v1/projects/p9/ponto-de-partida': PONTO() });
        const c = novo();
        await window.renderPontoDePartida(c, 'p9', 'iso');
        expect(c.textContent).toContain('A privacidade já adianta estes controles');
        expect(c.textContent).toContain('A.5.9');
        expect(c.innerHTML).not.toContain('<b>x</b>');
    });
    it('n.privacy: mostra a cobertura LGPD', async () => {
        servir({ 'GET /api/v1/projects/p9/ponto-de-partida': PONTO() });
        const c = novo();
        await window.renderPontoDePartida(c, 'p9', 'privacy');
        expect(c.textContent).toContain('Cobertura LGPD: 7 de 20');
    });
    it('n.360: mostra os dois blocos (cobertura LGPD e controles ISO adiantados)', async () => {
        servir({ 'GET /api/v1/projects/p9/ponto-de-partida': PONTO() });
        const c = novo();
        await window.renderPontoDePartida(c, 'p9', 'n360');
        expect(c.textContent).toContain('Cobertura LGPD: 7 de 20');
        expect(c.textContent).toContain('A privacidade já adianta estes controles');
        expect(c.innerHTML).not.toContain('<b>x</b>');
    });
    it('número vindo da API é escapado', async () => {
        servir({ 'GET /api/v1/projects/p9/ponto-de-partida': PONTO({ cobertura: [{ fonte: 'lgpd', total: '<i>9</i>', cobertos: 1, parciais: 0, lacunas: 0 }] }) });
        const c = novo();
        await window.renderPontoDePartida(c, 'p9', 'privacy');
        expect(c.innerHTML).not.toContain('<i>9</i>');
    });
});

describe('onde o painel aparece', () => {
    it('Encarregado (n.privacy) chama o ponto de partida e nada da faixa n.iso', async () => {
        const f = servir({ 'GET /api/v1/projects/p9/encarregado': { prioridades: [], encarregados: [], lgpd: { carregada: false } }, 'GET /api/v1/projects/p9/ponto-de-partida': PONTO() });
        const c = novo();
        await window.renderEncarregado(c, document.getElementById('h'), document.getElementById('a'));
        await vi.waitFor(() => expect(c.textContent).toContain('Cobertura LGPD'));
        const rotas = chamadas(f);
        expect(rotas).toContain('GET /api/v1/projects/p9/ponto-de-partida');
        expect(rotas.filter((r) => /controls|checklist|policies|gap-analysis/.test(r))).toEqual([]);
    });
    it('Dashboard (n.iso) chama o ponto de partida e nada da faixa n.privacy', async () => {
        const f = servir({
            'GET /api/v1/assessments': [], 'GET /api/v1/projects': [], 'GET /api/v1/controls': [], 'GET /api/v1/leads': [],
            'GET /api/v1/projects/p9/ponto-de-partida': PONTO(),
        });
        const c = novo();
        await window.renderDashboard(c, document.getElementById('h'), document.getElementById('a'));
        await vi.waitFor(() => expect(c.textContent).toContain('A privacidade já adianta estes controles'));
        const rotas = chamadas(f);
        expect(rotas).toContain('GET /api/v1/projects/p9/ponto-de-partida');
        expect(rotas.filter((r) => /encarregado|requisitos|titular|terceiros|incidentes/.test(r))).toEqual([]);
    });
});
