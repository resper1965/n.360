// n.ot, L5 (plano 2026-11-04): o cartão "Agente de coleta" na aba Acesso por site, sobre as rotas /ot/agente* de src/routes/ot.ts.
// api() REAL; só o fetch é dublado (mesmo arranque de ot-abas.test.js), com os corpos que os handlers devolvem.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/ot.js';

const B = '/api/v1/projects/p9/ot';
const el = (id) => document.getElementById(id);
const pausa = () => new Promise((r) => setTimeout(r, 0));
const ENDPOINT = 'https://app.example/ot-coleta/mcp';
const CHAVE = 'n360_ot_SEGREDO_123';
const AGENTE = (extra = {}) => ({ ligado: false, pode_ligar: false, pode_emitir: true, endpoint: ENDPOINT, ...extra });
const CHAVES = { chaves: [
    { id: 'k1', nome: 'Notebook <b id="xss">x</b>', status: 'Active', expira_em: '2026-11-11T10:00:00.000Z', ultimo_uso: null },
    { id: 'k2', nome: 'Antiga', status: 'Revoked', expira_em: '2026-11-05T10:00:00.000Z', ultimo_uso: '2026-11-02T10:00:00.000Z' }] };

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
const BASE = { [`GET ${B}/sites`]: { sites: [] }, [`GET ${B}/acessos`]: { acessos: [] }, 'GET /api/v1/users': [] };
async function abrir(rotas) {
    servirOt({ ...BASE, ...rotas });
    S.otAba = 'acessos';
    await window.renderOt(el('c'), el('h'), el('a'));
}
const cartao = () => el('ot-agente');

beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>'
        + '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok';
    S.user = { id: 'u-consultor', role: 'consultor' };
    S.activeProject = { id: 'p9', modulos: ['ot'] };
    S.otProjeto = 'p9'; S.otSite = null; S.otZona = null; S.otLote = null; S.otLevantamento = null;
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('cartão Agente de coleta', () => {
    it('não aparece para o técnico nem para quem não liga nem emite', async () => {
        S.user = { id: 'u-tec', role: 'org_user' };
        await abrir({ [`GET ${B}/agente`]: AGENTE({ pode_emitir: false }) });
        expect(cartao()).toBeNull();
        S.user = { id: 'u-consultor', role: 'consultor' };
        await abrir({ [`GET ${B}/agente`]: AGENTE({ pode_emitir: false }) });
        expect(cartao()).toBeNull();
        expect(chamadas.some((x) => x.k === `GET ${B}/agente/chaves`)).toBe(false);
        // Falha ao ler o agente: a aba de acessos segue, sem o cartão.
        await abrir({});
        expect(cartao()).toBeNull();
        expect(el('c').textContent).toContain('Nenhum acesso concedido.');
    });

    it('diz o que o agente faz, com o aviso do modelo em negrito, e lista as chaves escapadas', async () => {
        await abrir({ [`GET ${B}/agente`]: AGENTE({ ligado: true }), [`GET ${B}/agente/chaves`]: CHAVES });
        expect(cartao().textContent).toContain('Um agente externo (Claude Code, Cursor) lê os arquivos na sua máquina e grava achados em rascunho aqui. Ele não lê o inventário e não envia ao lote.');
        expect(cartao().querySelector('strong').textContent).toBe('Os arquivos passam pelo modelo do agente antes de chegar ao n.ot, sem a máscara do n.ot.');
        expect(el('xss')).toBeNull();
        expect(cartao().textContent).toContain('Notebook <b id="xss">x</b>');
        expect(cartao().textContent).toContain('Ativa');
        expect(cartao().textContent).toContain('Revogada');
        expect(cartao().textContent).toContain('Nunca');
        // Revogar só na chave ativa.
        expect(cartao().querySelectorAll('[data-action="otRevogarChaveAgente"]')).toHaveLength(1);
    });

    it('interruptor: só o gestor clica; ligar pede confirmação com a frase do modelo', async () => {
        await abrir({ [`GET ${B}/agente`]: AGENTE({ ligado: true }), [`GET ${B}/agente/chaves`]: CHAVES });
        expect(cartao().querySelector('[data-action="otAlternarAgente"]')).toBeNull();
        expect(cartao().textContent).toContain('Ligado');

        S.user = { id: 'u-gestor', role: 'org_admin' };
        await abrir({ [`GET ${B}/agente`]: AGENTE({ pode_ligar: true }), [`GET ${B}/agente/chaves`]: { chaves: [] }, [`PUT ${B}/agente`]: { ligado: true } });
        const sw = cartao().querySelector('[role="switch"]');
        expect(sw.getAttribute('data-action')).toBe('otAlternarAgente');
        expect(sw.getAttribute('aria-checked')).toBe('false');
        const p = window.otAlternarAgente();
        await pausa();
        expect(document.querySelector('.confirmar').textContent).toContain('Os arquivos passam pelo modelo do agente antes de chegar ao n.ot, sem a máscara do n.ot.');
        window.otAlternarAgente(); // clique duplo durante a confirmação: nada
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        expect(chamadas.filter((x) => x.k === `PUT ${B}/agente`).map((x) => JSON.parse(x.opts.body))).toEqual([{ ligado: true }]);
        expect(window.render).toHaveBeenCalled();
    });

    it('desligar não pede confirmação', async () => {
        S.user = { id: 'u-gestor', role: 'org_admin' };
        await abrir({ [`GET ${B}/agente`]: AGENTE({ pode_ligar: true, ligado: true }), [`GET ${B}/agente/chaves`]: { chaves: [] }, [`PUT ${B}/agente`]: { ligado: false } });
        await window.otAlternarAgente();
        expect(document.querySelector('.confirmar')).toBeNull();
        expect(JSON.parse(chamadas.find((x) => x.k === `PUT ${B}/agente`).opts.body)).toEqual({ ligado: false });
    });

    it('emitir: mostra a chave uma vez, com endpoint e comando MCP, e não a guarda depois de fechar', async () => {
        let solta;
        await abrir({ [`GET ${B}/agente`]: AGENTE({ ligado: true }), [`GET ${B}/agente/chaves`]: { chaves: [] },
            [`POST ${B}/agente/chaves`]: () => new Promise((r) => { solta = () => r([201, { id: 'k9', chave: CHAVE, expira_em: '2026-11-11T10:00:00.000Z' }]); }) });
        window.otEmitirChaveAgente();
        expect(el('ot-ag-dias').value).toBe('7');
        expect(el('ot-ag-dias').getAttribute('max')).toBe('30');
        el('ot-ag-nome').value = 'Notebook da Ana';
        const p = window.otSalvarChaveAgente();
        window.otSalvarChaveAgente(); // clique duplo
        await pausa();
        solta();
        await p;
        expect(chamadas.filter((x) => x.k === `POST ${B}/agente/chaves`).map((x) => JSON.parse(x.opts.body))).toEqual([{ nome: 'Notebook da Ana', dias: 7 }]);
        const m = el('modal-content');
        expect(m.textContent).toContain('Guarde agora: ela não aparece de novo');
        expect(el('ot-ag-chave').value).toBe(CHAVE);
        expect(m.textContent).toContain(ENDPOINT);
        expect(m.textContent).toContain(`claude mcp add --transport http n-ot-coleta ${ENDPOINT} --header "Authorization: Bearer ${CHAVE}"`);
        expect(m.querySelector('[data-action="otCopiarChaveAgente"]')).not.toBeNull();
        window.forceCloseModal();
        await pausa();
        expect(document.body.innerHTML).not.toContain(CHAVE);
        expect(JSON.stringify(S)).not.toContain(CHAVE);
    });

    it('emitir: valida nome e validade antes de chamar a API', async () => {
        await abrir({ [`GET ${B}/agente`]: AGENTE({ ligado: true }), [`GET ${B}/agente/chaves`]: { chaves: [] } });
        window.otEmitirChaveAgente();
        await window.otSalvarChaveAgente();
        el('ot-ag-nome').value = 'x'; el('ot-ag-dias').value = '31';
        await window.otSalvarChaveAgente();
        expect(chamadas.some((x) => x.k === `POST ${B}/agente/chaves`)).toBe(false);
    });

    it('com o agente desligado, não oferece emitir', async () => {
        await abrir({ [`GET ${B}/agente`]: AGENTE(), [`GET ${B}/agente/chaves`]: { chaves: [] } });
        expect(cartao().querySelector('[data-action="otEmitirChaveAgente"]')).toBeNull();
        expect(cartao().textContent).toContain('Desligado');
    });

    it('revogar pede confirmação e chama o DELETE', async () => {
        await abrir({ [`GET ${B}/agente`]: AGENTE({ ligado: true }), [`GET ${B}/agente/chaves`]: CHAVES, [`DELETE ${B}/agente/chaves/k1`]: { ok: true } });
        const p = window.otRevogarChaveAgente('k1');
        await pausa();
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        expect(chamadas.some((x) => x.k === `DELETE ${B}/agente/chaves/k1`)).toBe(true);
    });
});
