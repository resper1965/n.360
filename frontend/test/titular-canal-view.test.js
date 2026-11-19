// Canal do titular (spec 2026-11-19, PR2): botão em Solicitações; formulário para quem grava, leitura para os demais. api() REAL; só o
// fetch é dublado, com os corpos de GET/PUT /projects/:id/titular-canal (src/routes/titular.ts, titularCanalApp) e GET /partes.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir, resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import { formatarData } from '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import '../src/views/titular.js';

initDelegation();
const B = '/api/v1/projects/p9';
const CANAL = { canal: { id: 'c1', project_id: 'p9', email: 'privacidade@exemplo.com.br', telefone: '11 4000-0000', formulario_url: null,
    divulgacao_url: 'https://exemplo.com.br/<b>privacidade</b>', responsavel_parte_id: 'pa1', responsavel_nome: 'Ana <i>Exemplo</i>',
    conferido_em: '2026-11-10', conferido_por: 'cons@ness.lat', atualizado_por: 'cons@ness.lat', updated_at: '2026-11-10 10:00:00' }, portal_ativo: true };
const PARTES = [{ id: 'pa1', nome: 'Ana <i>Exemplo</i>' }, { id: 'pa2', nome: 'Bruno Exemplo' }];
const el = (id) => document.getElementById(id);
const chave = (u, o) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`;
/** Dublê ESTRITO: chamada fora de `rotas` (inclusive qualquer /ot) lança, em vez de devolver 404. */
const servirEstrito = (rotas) => {
    const f = servir(rotas);
    const base = f.getMockImplementation();
    f.mockImplementation(async (u, o) => { if (!(chave(u, o) in rotas)) throw new Error(`chamada inesperada: ${chave(u, o)}`); return base(u, o); });
    return f;
};
const montarModal = () => { document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>'; };
const ultimoToast = (tipo) => [...document.querySelectorAll(`.toast-${tipo} .toast-text`)].pop()?.textContent;

beforeEach(() => { S.token = 'tok'; S.activeProject = { id: 'p9' }; S.painel = {}; window.render = vi.fn(); history.replaceState(null, '', '/privacy'); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); history.replaceState(null, '', '/'); });

describe('botão "Canal do titular" em Solicitações', () => {
    it('aparece para quem grava e para quem só lê; "Link do portal" segue só para quem grava', async () => {
        for (const [role, portal] of [['consultor', true], ['org_admin', true], ['org_user', false], ['client', false]]) {
            S.user = { role }; S.titularAba = 'pedidos';
            montarModal();
            servir({ [`GET ${B}/titular-pedidos`]: [], [`GET ${B}/incidentes`]: [], 'GET /api/v1/parametros-legais': [] });
            await window.renderTitular(el('c'), el('h'), el('a'));
            const b = el('a').querySelector('[data-action="abrirCanalTitular"]');
            expect(b, role).not.toBeNull();
            expect(b.textContent).toBe('Canal do titular');
            expect(JSON.parse(b.dataset.args)).toEqual(['p9']);
            expect(!!el('a').querySelector('[data-action="abrirPortalTitular"]'), role).toBe(portal);
        }
    });
});

describe('formulário (quem grava)', () => {
    it('abre com os valores escapados, o responsável marcado, a dica, o aviso do portal e rótulos em todo campo; sem estilo nem handler inline', async () => {
        S.user = { role: 'consultor' }; montarModal();
        servirEstrito({ [`GET ${B}/titular-canal`]: CANAL, [`GET ${B}/partes`]: PARTES });
        await window.abrirCanalTitular('p9');
        const m = el('modal-content');
        expect(el('tc-email').value).toBe('privacidade@exemplo.com.br');
        expect(el('tc-divulgacao_url').value).toBe('https://exemplo.com.br/<b>privacidade</b>');
        expect(el('tc-formulario_url').value).toBe('');
        expect(m.querySelector('b, i')).toBeNull();
        expect(el('tc-resp').value).toBe('pa1');
        expect(el('tc-email').getAttribute('aria-describedby')).toBe('tc-dica');
        expect(el('tc-dica').textContent).toContain('caixa institucional');
        expect(el('tc-portal').textContent).toContain('já conta como formulário');
        expect(el('tc-conferido').textContent).toContain(formatarData('2026-11-10'));
        for (const c of m.querySelectorAll('input, select')) expect(m.querySelector(`label[for="${c.id}"]`), c.id).not.toBeNull();
        expect(m.querySelector('[data-action="salvarCanalTitular"]').textContent).toBe('Salvar');
        expect(m.innerHTML).not.toMatch(/\sstyle=|\son[a-z]+=/i);
    });

    it('valor com aspas e tag não escapa do atributo (telefone) nem vira elemento', async () => {
        S.user = { role: 'consultor' }; montarModal();
        const T = '1" autofocus onfocus="x"><b>y</b>';
        servirEstrito({ [`GET ${B}/titular-canal`]: { ...CANAL, canal: { ...CANAL.canal, telefone: T } }, [`GET ${B}/partes`]: PARTES });
        await window.abrirCanalTitular('p9');
        expect(el('tc-telefone').value).toBe(T);
        expect(el('modal-content').querySelector('b')).toBeNull();
    });

    it('salvar manda os campos (vazio vira null) e "conferir" só marcado; invalida o painel guardado do projeto', async () => {
        S.user = { role: 'org_admin' }; montarModal();
        S.painel = { 'privacy|p9': {}, 'privacy|p8': {} };
        const f = servirEstrito({ [`GET ${B}/titular-canal`]: CANAL, [`GET ${B}/partes`]: PARTES, [`PUT ${B}/titular-canal`]: { ok: true } });
        await window.abrirCanalTitular('p9');
        el('tc-telefone').value = '   ';
        el('tc-formulario_url').value = 'https://exemplo.com.br/fale';
        el('tc-resp').value = 'pa2';
        el('tc-conferir').checked = true;
        await window.salvarCanalTitular('p9');
        const put = f.mock.calls.find(([u, o]) => chave(u, o) === `PUT ${B}/titular-canal`);
        expect(JSON.parse(put[1].body)).toEqual({ email: 'privacidade@exemplo.com.br', telefone: null, formulario_url: 'https://exemplo.com.br/fale',
            divulgacao_url: 'https://exemplo.com.br/<b>privacidade</b>', responsavel_parte_id: 'pa2', conferir: true });
        expect(Object.keys(S.painel)).toEqual(['privacy|p8']);
        expect(ultimoToast('success')).toBe('Canal do titular salvo.');
    });

    it('422 do servidor (link do portal): a mensagem do servidor aparece e o formulário fica aberto', async () => {
        S.user = { role: 'consultor' }; montarModal();
        const MSG = 'Este é o link do portal do n.360 (é a chave de acesso do formulário): não o grave aqui. O portal ativo já conta como formulário.';
        servirEstrito({ [`GET ${B}/titular-canal`]: CANAL, [`GET ${B}/partes`]: PARTES });
        await window.abrirCanalTitular('p9');
        vi.stubGlobal('fetch', vi.fn(async () => resposta({ error: MSG }, 422)));
        await window.salvarCanalTitular('p9');
        expect(ultimoToast('error')).toBe(MSG);
        expect(el('tc-email')).not.toBeNull();
    });

    it('dois cliques em Salvar mandam um PUT só (semRepetir)', async () => {
        S.user = { role: 'consultor' }; montarModal();
        const f = servirEstrito({ [`GET ${B}/titular-canal`]: CANAL, [`GET ${B}/partes`]: PARTES, [`PUT ${B}/titular-canal`]: { ok: true } });
        await window.abrirCanalTitular('p9');
        const base = f.getMockImplementation();
        let soltar;
        f.mockImplementation((u, o) => (chave(u, o) === `PUT ${B}/titular-canal` ? new Promise((r) => { soltar = () => r(resposta({ ok: true })); }) : base(u, o)));
        const a1 = window.salvarCanalTitular('p9');
        const a2 = window.salvarCanalTitular('p9');
        await new Promise((r) => setTimeout(r, 0));
        soltar();
        await Promise.all([a1, a2]);
        expect(f.mock.calls.filter(([u, o]) => chave(u, o) === `PUT ${B}/titular-canal`)).toHaveLength(1);
    });
});

describe('leitura (quem não grava)', () => {
    it('org_user vê os valores escapados, sem campos nem "Salvar", e não pede a lista de pessoas', async () => {
        S.user = { role: 'org_user' }; montarModal();
        const f = servirEstrito({ [`GET ${B}/titular-canal`]: CANAL });
        await window.abrirCanalTitular('p9');
        const m = el('modal-content');
        expect(m.querySelector('input, select, [data-action="salvarCanalTitular"]')).toBeNull();
        expect(m.querySelector('.tc-leitura').textContent).toContain('https://exemplo.com.br/<b>privacidade</b>');
        expect(m.textContent).toContain('Ana <i>Exemplo</i>');
        expect(m.querySelector('b, i')).toBeNull();
        expect(f.mock.calls.map(([u, o]) => chave(u, o))).toEqual([`GET ${B}/titular-canal`]);
    });

    it('sem canal registrado: "Não informado" nos quatro campos e no responsável', async () => {
        S.user = { role: 'client' }; montarModal();
        servirEstrito({ [`GET ${B}/titular-canal`]: { canal: null, portal_ativo: false } });
        await window.abrirCanalTitular('p9');
        expect([...el('modal-content').querySelectorAll('.tc-leitura .pn-falta')].map((x) => x.textContent)).toEqual(Array(5).fill('Não informado'));
        expect(el('tc-portal')).toBeNull();
    });
});
