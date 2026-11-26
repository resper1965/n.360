// n.ot, sonda com envio automático (Task 8): área "Sondas" na aba Acessos e agente e cartões do Levantamento. api() REAL, fetch dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/ot.js';
import { desenhar } from './ot-abrir.js';

const B = '/api/v1/projects/p9/ot';
const el = (id) => document.getElementById(id);
const pausa = () => new Promise((r) => setTimeout(r, 0));
const SEGREDO = 'ots_' + 'a'.repeat(64);
const hora = (h) => new Date(Date.now() - h * 3600000).toISOString();
const dias = (d) => new Date(Date.now() + d * 86400000).toISOString();
const SITES = { sites: [{ id: 's1', nome: 'SE Norte' }] };
const SONDAS = { sensores: [
    { id: 'z1', nome: 'Sonda <b id="xss">x</b>', faixa_origem: '203.0.113.0/24', situacao: 'ativa', saude: 'em_dia', ultimo_envio: hora(2), capture_loss: 7.5, vencendo: true, credenciais: [{ id: 'c1', expira_em: dias(10), situacao: 'ativa' }] },
    { id: 'z2', nome: 'Reserva', faixa_origem: '198.51.100.0/24', situacao: 'ativa', saude: 'parada', ultimo_envio: null, capture_loss: null, vencendo: false, credenciais: [] }] };

let chamadas;
function servirOt(rotas) {
    chamadas = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
        const u = new URL(url, 'http://localhost');
        const k = `${opts.method || 'GET'} ${u.pathname}`;
        chamadas.push({ k, opts });
        if (!(k in rotas)) return resposta({ error: `API route not found: ${k}` }, 404);
        const r = typeof rotas[k] === 'function' ? await rotas[k]() : rotas[k];
        return Array.isArray(r) ? resposta(r[1], r[0]) : resposta(r);
    }));
}
const BASE = { [`GET ${B}/sites`]: SITES, [`GET ${B}/acessos`]: { acessos: [] }, 'GET /api/v1/users': [], [`GET ${B}/agente`]: [403, { error: 'Forbidden' }] };
async function abrir(aba, rotas) {
    servirOt({ ...BASE, ...rotas });
    await desenhar(aba);
}
beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>'
        + '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok';
    S.user = { id: 'u1', role: 'consultor' };
    S.activeProject = { id: 'p9', modulos: ['ot'] };
    S.otProjeto = 'p9'; S.otSite = null; S.otZona = null; S.otLote = null; S.otLevantamento = null;
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('área Sondas', () => {
    it('lista nome (escapado), saúde em texto, último envio, aviso de perda acima de 5% e validade', async () => {
        await abrir('acessos', { [`GET ${B}/sites/s1/sensores`]: SONDAS });
        const area = el('ot-sondas');
        expect(area.textContent).toContain('Em dia');
        expect(area.textContent).toContain('Parada');
        expect(area.textContent).toContain('Perda alta');
        expect(area.textContent).toContain('7.5%');
        expect(area.textContent).toContain('vence em 10 dias');
        expect(area.textContent).toContain('Nunca');
        expect(el('xss')).toBeNull();
        expect(area.querySelectorAll('tbody tr')).toHaveLength(2);
    });

    it('quem vê mascarado (403) não vê a área', async () => {
        await abrir('acessos', { [`GET ${B}/sites/s1/sensores`]: [403, { error: 'Forbidden' }] });
        expect(el('ot-sondas')).toBeNull();
    });

    it('Nova sonda exige nome e faixa; depois mostra a credencial e o conf uma vez, e apaga ao fechar', async () => {
        await abrir('acessos', { [`GET ${B}/sites/s1/sensores`]: SONDAS,
            [`POST ${B}/sites/s1/sensores`]: [201, { sensor: { id: 'z9' }, credencial: SEGREDO, expira_em: dias(365), conf: `# /etc/n-ot-sonda.conf\ncredencial = ${SEGREDO}\n` }] });
        window.otNovaSonda('s1');
        expect(el('ot-so-nome').maxLength).toBe(80); // livreSemPii(80) no servidor
        await window.otSalvarSonda('s1');
        expect(chamadas.some((c) => c.k.startsWith('POST'))).toBe(false);
        el('ot-so-nome').value = 'Nova';
        await window.otSalvarSonda('s1');
        expect(chamadas.some((c) => c.k.startsWith('POST'))).toBe(false);
        el('ot-so-faixa').value = '203.0.113.0/24';
        await window.otSalvarSonda('s1');
        const post = chamadas.find((c) => c.k.startsWith('POST'));
        expect(JSON.parse(post.opts.body)).toEqual({ nome: 'Nova', faixa_origem: '203.0.113.0/24' });
        expect(el('modal-content').textContent).toContain('não será mostrada de novo');
        expect(el('ot-so-cred').value).toBe(SEGREDO);
        expect(el('ot-so-conf').value).toContain('/etc/n-ot-sonda.conf');
        expect(el('modal-content').textContent).toContain('dono n-ot-sonda');
        expect(el('modal-content').textContent).toContain('Copiar');
        el('modal-overlay').classList.add('open'); el('modal-overlay').classList.remove('open');
        await pausa();
        expect(el('modal-content').innerHTML).not.toContain(SEGREDO);
    });

    it('Gerar nova credencial e Revogar pedem confirmação', async () => {
        await abrir('acessos', { [`GET ${B}/sites/s1/sensores`]: SONDAS,
            [`POST ${B}/sensores/z1/credenciais`]: [201, { credencial: SEGREDO, expira_em: dias(365) }], [`DELETE ${B}/sensores/z1/credenciais/c1`]: { ok: true }, [`DELETE ${B}/sensores/z1`]: { ok: true } });
        for (const [fn, a, rota] of [['otNovaCredencialSonda', ['z1'], 'POST'], ['otRevogarCredencialSonda', ['z1', 'c1'], 'DELETE'], ['otRevogarSonda', ['z1', 'Sonda'], 'DELETE']]) {
            const p = window[fn](...a);
            await pausa();
            expect(chamadas.some((c) => c.k.startsWith(rota))).toBe(false); // ainda no diálogo
            document.querySelector('[data-confirmar="sim"]').click();
            await p;
            expect(chamadas.some((c) => c.k.startsWith(rota))).toBe(true);
            chamadas.length = 0;
        }
    });
});

describe('cartões do Levantamento', () => {
    const LEVS = { levantamentos: [{ id: 'lv1', site_id: 's1', tipo: 'documento', realizado_em: '2026-11-04', situacao: 'encerrado', criado_por: 'sensor:z1', achados: 3, roteiro: {} }] };
    const PONTOS = { [`GET ${B}/sensores/pontos`]: { ativos: 1, fluxos: 2 } };
    const cartoes = async () => { await vi.waitFor(() => expect(el('ot-cartoes-coleta')).not.toBeNull()); return el('ot-cartoes-coleta').textContent; };

    it('desenha a lista antes dos cartões; mostra N de M, último resumo e a contagem do servidor em uma só chamada', async () => {
        await abrir('levantamento', { [`GET ${B}/levantamentos`]: LEVS, [`GET ${B}/sites/s1/sensores`]: SONDAS, ...PONTOS });
        expect(el('c').textContent).toContain('Entrevistas, visitas');
        const t = await cartoes();
        expect(t).toContain('Saúde da coleta');
        expect(t).toContain('1 de 2');
        expect(t).toContain('Último resumo há 2 h');
        expect(t).toContain('Achados da sonda para revisar');
        expect(t).toContain('1 ativo');
        expect(t).toContain('2 fluxos');
        expect(t).toContain('Sonda de rede');
        expect(chamadas.filter((c) => c.k.includes('/levantamentos/lv1'))).toHaveLength(0); // sem leitura por sessão
    });

    it('sem sonda, ou sem ver o completo, não mostra os cartões', async () => {
        await abrir('levantamento', { [`GET ${B}/levantamentos`]: LEVS, [`GET ${B}/sites/s1/sensores`]: { sensores: [] } });
        await pausa();
        expect(el('ot-cartoes-coleta')).toBeNull();
        await abrir('levantamento', { [`GET ${B}/levantamentos`]: LEVS, [`GET ${B}/sites/s1/sensores`]: [403, { error: 'Forbidden' }] });
        await pausa();
        expect(el('ot-cartoes-coleta')).toBeNull();
    });
});

describe('falha que não é 403', () => {
    it('a área avisa e mantém os sites que carregaram', async () => {
        await abrir('acessos', { [`GET ${B}/sites`]: { sites: [{ id: 's1', nome: 'SE Norte' }, { id: 's2', nome: 'SE Sul' }] },
            [`GET ${B}/sites/s1/sensores`]: SONDAS, [`GET ${B}/sites/s2/sensores`]: [500, { error: 'boom' }] });
        const area = el('ot-sondas');
        expect(area.textContent).toContain('Não foi possível carregar as sondas de alguns sites');
        expect(area.textContent).toContain('Em dia');
    });
});
