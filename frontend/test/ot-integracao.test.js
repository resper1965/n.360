// n.ot, E4 T5: cartão "Integração ness.OS" na aba Acessos, sobre as rotas de webhooks do n.360 (src/routes/integrations.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/ot.js';
import { desenhar } from './ot-abrir.js';
import { permissoesPeloPapel } from './ot-abrir.js';

// GET /ot/permissoes: a tela lê do servidor (spec 2026-11-26 §6); aqui, a resposta que o servidor daria ao papel do teste.
beforeEach(permissoesPeloPapel);

const B = '/api/v1/projects/p9/ot';
const W = '/api/v1/projects/p9/webhooks';
const el = (id) => document.getElementById(id);
const pausa = () => new Promise((r) => setTimeout(r, 0));
const LISTA = { ok: true, webhooks: [
    { id: 'w1', url: 'https://ness.os/hook?a=<b id="xss">x</b>', events: 'ot.desvio', status: 'Active', failure_count: 2, last_triggered_at: null },
    { id: 'w2', url: 'https://outro.example/h', events: 'finding.created, ot.desvio', status: 'Inactive', failure_count: 0, last_triggered_at: null },
    { id: 'w3', url: 'https://slack.example/x', events: 'finding.created', status: 'Active', failure_count: 0, last_triggered_at: null }] };

let chamadas;
function servir(rotas) {
    chamadas = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
        const k = `${opts.method || 'GET'} ${new URL(url, 'http://localhost').pathname}`;
        chamadas.push({ k, opts });
        if (!(k in rotas)) return resposta({ error: `API route not found: ${k}` }, 404);
        const r = rotas[k];
        return Array.isArray(r) ? resposta(r[1], r[0]) : resposta(r);
    }));
}
const BASE = { [`GET ${B}/sites`]: { sites: [] }, [`GET ${B}/acessos`]: { acessos: [] }, 'GET /api/v1/users': [] };
async function abrir(rotas) { servir({ ...BASE, ...rotas }); await desenhar('integracao'); }
const cartao = () => el('ot-integracao');
const gestor = () => { S.user = { id: 'u-g', role: 'org_admin' }; };

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

describe('cartão Integração ness.OS', () => {
  it('Enviar teste só aparece para webhook ativo (a API responde 409 para inativo); Remover fica nos dois', async () => {
    gestor();
    await abrir({ [`GET ${W}`]: LISTA });
    const linhas = [...cartao().querySelectorAll('tbody tr')];
    expect(linhas[0].textContent).toContain('Enviar teste');
    expect(linhas[1].textContent).not.toContain('Enviar teste');
    expect(linhas[1].textContent).toContain('Remover');
  });
  it('lista só os webhooks de ot.desvio, com URL escapada, situação e falhas; consultor sem botões', async () => {
    await abrir({ [`GET ${W}`]: LISTA });
    const t = cartao().textContent;
    expect(t).toContain('https://ness.os/hook?a=<b id="xss">x</b>');
    expect(el('xss')).toBeNull();
    expect(t).toContain('https://outro.example/h');
    expect(t).not.toContain('slack.example');
    expect(t).toContain('Ligue o webhook depois de aprovar a base do site: antes disso não há desvio.');
    expect(t).toContain('2');
    expect(cartao().querySelector('button')).toBeNull();
    expect(cartao().querySelector('.btn-primary')).toBeNull();
  });

  it('a falha da leitura deixa a tela sem o cartão, com o aviso', async () => {
    await abrir({});
    expect(cartao()).toBeNull();
    expect(el('c').textContent).toContain('Integração indisponível');
  });

  it('Gestor cadastra com o corpo certo e vê o segredo uma vez', async () => {
    gestor();
    await abrir({ [`GET ${W}`]: { ok: true, webhooks: [] }, [`POST ${W}`]: [201, { ok: true, id: 'w9', secret: 'SEGREDO_XYZ', gerado: true }] });
    expect(cartao().querySelector('[data-action="otCadastrarWebhook"]').className).not.toContain('btn-primary');
    window.otCadastrarWebhook();
    el('ot-wh-url').value = 'http://inseguro.example/h';
    await window.otSalvarWebhook();
    expect(chamadas.some((x) => x.k === `POST ${W}`)).toBe(false);
    el('ot-wh-url').value = 'https://ness.os/h';
    await window.otSalvarWebhook();
    expect(JSON.parse(chamadas.find((x) => x.k === `POST ${W}`).opts.body)).toEqual({ url: 'https://ness.os/h', events: 'ot.desvio' });
    expect(el('ot-wh-segredo').value).toBe('SEGREDO_XYZ');
    expect(el('modal-content').textContent).toContain('não aparece de novo');
    window.forceCloseModal();
    await pausa();
    expect(document.body.innerHTML).not.toContain('SEGREDO_XYZ');
  });

  it('enviar teste e remover (com confirmação)', async () => {
    gestor();
    await abrir({ [`GET ${W}`]: LISTA, 'POST /api/v1/webhooks/test/w1': { ok: true, status: 200 }, 'DELETE /api/v1/webhooks/w1': { ok: true } });
    await window.otTestarWebhook('w1');
    expect(chamadas.some((x) => x.k === 'POST /api/v1/webhooks/test/w1')).toBe(true);
    const p = window.otRemoverWebhook('w1');
    await pausa();
    document.querySelector('[data-confirmar="sim"]').click();
    await p;
    expect(chamadas.some((x) => x.k === 'DELETE /api/v1/webhooks/w1')).toBe(true);
    expect(window.render).toHaveBeenCalled();
  });
});
