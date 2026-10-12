// Tela Segurança do projeto: SSO, SCIM e política (src/routes/projects.ts). api() REAL; só o fetch é dublado,
// com o corpo de cada handler. client_secret é só de escrita; só a equipe da consultoria vê.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import html from '../login.html?raw';
import rota from '../src/router.js?raw';
import main from '../src/main.js?raw';

initDelegation();
beforeAll(async () => {
    vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
    document.body.innerHTML = '<div id="login-overlay" class="hidden"></div>';
    await import('../src/globals.js');
    await import('../src/views/seguranca-projeto.js');
});
const B = '/api/v1/projects/p9';
const el = (id) => document.getElementById(id);
const espera = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 10)); };
const clica = async (acao) => { document.querySelector(`[data-action="${acao}"]`).click(); await espera(); };
const SSO = { project_id: 'p9', issuer: 'https://idp.exemplo.test', client_id: 'cli-1', dominios: 'exemplo.test,filial.test', papel_padrao: 'org_admin', ativo: 1, atualizado_em: 'x', atualizado_por: 'a@b' };
const POL = { project_id: 'p9', mfa_obrigatorio: 1, sessao_ttl_seg: 3600, ip_allowlist: '10.0.0.1,10.1.0.0/16' };

function servidor(h) {
    const f = vi.fn(async (url, opts = {}) => {
        const k = `${opts.method || 'GET'} ${new URL(url, 'http://localhost').pathname}`;
        if (!(k in h)) return resposta({ error: `API route not found: ${k}` }, 404);
        const r = typeof h[k] === 'function' ? h[k](opts) : h[k];
        return Array.isArray(r) ? resposta(r[0], r[1]) : resposta(r);
    });
    vi.stubGlobal('fetch', f);
    return f;
}
const corpo = (f, k) => { const [m, p] = k.split(' '); const c = f.mock.calls.find(([u, o]) => (o?.method || 'GET') === m && new URL(u, 'http://localhost').pathname === p); return c && JSON.parse(c[1].body); };
const base = { [`GET ${B}/sso`]: { ok: true, sso: SSO }, [`GET ${B}/security-policy`]: { ok: true, politica: POL } };

async function abrir(h = base) {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    const f = servidor(h);
    await window.renderSegurancaProjeto(el('c'), el('h'), el('a'));
    await espera();
    return f;
}
beforeEach(() => { S.token = 'tok'; S.user = { role: 'consultor' }; S.activeProject = { id: 'p9' }; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('visibilidade', () => {
    it('papel de cliente não vê nada e nada é pedido à API', async () => {
        S.user = { role: 'org_admin' };
        const f = await abrir();
        expect(f).not.toHaveBeenCalled();
        expect(el('c').textContent).toContain('equipe da consultoria');
        expect(el('c').querySelector('input')).toBeNull();
    });
});

describe('SSO', () => {
    it('mostra os campos preenchidos, sem devolver o segredo', async () => {
        await abrir();
        expect(el('sso-issuer').value).toBe('https://idp.exemplo.test');
        expect(el('sso-client-id').value).toBe('cli-1');
        expect(el('sso-dominios').value).toBe('exemplo.test,filial.test');
        expect(el('sso-papel').value).toBe('org_admin');
        expect(el('sso-ativo').checked).toBe(true);
        expect(el('sso-secret').value).toBe('');
        expect(el('sso-secret').type).toBe('password');
        expect(el('sso-secret-estado').textContent).toContain('definido');
    });

    it('sem configuração: segredo não definido, papel padrão org_user, inativo', async () => {
        await abrir({ ...base, [`GET ${B}/sso`]: { ok: true, sso: null } });
        expect(el('sso-secret-estado').textContent).toContain('não definido');
        expect(el('sso-papel').value).toBe('org_user');
        expect(el('sso-ativo').checked).toBe(false);
    });

    it('salvar envia o corpo da rota; o segredo digitado não fica na tela', async () => {
        const f = await abrir({ ...base, [`PUT ${B}/sso`]: { ok: true } });
        el('sso-secret').value = 'segredo-novo';
        el('sso-ativo').checked = false;
        await clica('salvarSsoProjeto');
        expect(corpo(f, `PUT ${B}/sso`)).toEqual({ issuer: 'https://idp.exemplo.test', client_id: 'cli-1', client_secret: 'segredo-novo', dominios: 'exemplo.test,filial.test', papel_padrao: 'org_admin', ativo: false });
        expect(el('sso-secret').value).toBe('');
        expect(document.body.innerHTML).not.toContain('segredo-novo');
    });

    it('sem segredo digitado não chama a API (a rota exige o segredo a cada gravação)', async () => {
        const f = await abrir({ ...base, [`PUT ${B}/sso`]: { ok: true } });
        await clica('salvarSsoProjeto');
        expect(corpo(f, `PUT ${B}/sso`)).toBeUndefined();
        expect(el('sso-erro').textContent).toContain('client_secret');
    });

    it('erro do servidor aparece na tela, escapado', async () => {
        await abrir({ ...base, [`PUT ${B}/sso`]: [{ error: '<img src=x>' }, 400] });
        el('sso-secret').value = 's';
        await clica('salvarSsoProjeto');
        expect(el('sso-erro').textContent).toContain('<img src=x>');
        expect(document.querySelector('#sso-erro img')).toBeNull();
    });

    it('papel de staff não é oferecido', async () => {
        await abrir();
        expect([...el('sso-papel').options].map((o) => o.value)).toEqual(['org_admin', 'org_user', 'client']);
    });
});

describe('SCIM', () => {
    it('gera o token, mostra uma vez com aviso e a URL base do servidor', async () => {
        const f = await abrir({ ...base, [`POST ${B}/scim-token`]: [{ ok: true, token: 'scim_abc', base_url: 'https://app.exemplo.test/scim/v2', aviso: 'Guarde agora' }, 201] });
        await clica('gerarTokenScim');
        expect(f.mock.calls.some(([u, o]) => o?.method === 'POST' && u.endsWith('/scim-token'))).toBe(true);
        expect(el('scim-token').value).toBe('scim_abc');
        expect(el('scim-url').value).toBe('https://app.exemplo.test/scim/v2');
        expect(el('scim-novo').textContent).toContain('não aparece de novo');
        expect(document.querySelector('[data-action="copiarScim"]')).not.toBeNull();
    });

    it('antes de gerar não há token na tela', async () => {
        await abrir();
        expect(el('scim-token')).toBeNull();
    });
});

describe('política de segurança', () => {
    it('mostra a política atual', async () => {
        await abrir();
        expect(el('pol-mfa').checked).toBe(true);
        expect(el('pol-ttl').value).toBe('3600');
        expect(el('pol-ips').value).toBe('10.0.0.1, 10.1.0.0/16');
    });

    it('salvar envia mfa, ttl e IPs separados por vírgula', async () => {
        const f = await abrir({ ...base, [`PUT ${B}/security-policy`]: { ok: true } });
        el('pol-mfa').checked = false;
        el('pol-ttl').value = '';
        el('pol-ips').value = '10.0.0.1\n10.2.0.0/16, ';
        await clica('salvarPoliticaProjeto');
        expect(corpo(f, `PUT ${B}/security-policy`)).toEqual({ mfa_obrigatorio: false, sessao_ttl_seg: null, ip_allowlist: '10.0.0.1,10.2.0.0/16' });
    });

    it('erro de allowlist inválida aparece', async () => {
        await abrir({ ...base, [`PUT ${B}/security-policy`]: [{ error: 'Entradas inválidas na allowlist' }, 400] });
        await clica('salvarPoliticaProjeto');
        expect(el('pol-erro').textContent).toContain('Entradas inválidas');
    });
});

describe('projeto fixado no render', () => {
    it('trocar o projeto ativo depois de renderizar não desvia a gravação', async () => {
        const f = await abrir({ ...base, [`PUT ${B}/sso`]: { ok: true }, [`PUT ${B}/security-policy`]: { ok: true }, [`POST ${B}/scim-token`]: [{ ok: true, token: 't', base_url: 'u' }, 201] });
        S.activeProject = { id: 'outro' };
        el('sso-secret').value = 's';
        await clica('salvarSsoProjeto');
        await clica('salvarPoliticaProjeto');
        await clica('gerarTokenScim');
        const puts = f.mock.calls.filter(([, o]) => o?.method && o.method !== 'GET').map(([u, o]) => `${o.method} ${u}`);
        expect(puts).toHaveLength(3);
        expect(puts.every((x) => x.includes('/projects/p9/'))).toBe(true);
    });

    it('render antigo que termina por último não pinta nem redireciona a gravação', async () => {
        document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
        let solta;
        const trava = new Promise((r) => { solta = r; });
        const rest = (iss) => ({ ok: true, sso: { ...SSO, issuer: iss } });
        const f = vi.fn(async (url, opts = {}) => {
            const u = new URL(url, 'http://localhost').pathname;
            const m = opts.method || 'GET';
            if (u.startsWith('/api/v1/projects/p1/')) { await trava; return u.endsWith('/sso') ? resposta(rest('https://p1.exemplo.test')) : resposta({ ok: true, politica: POL }); }
            if (m === 'PUT' && u === '/api/v1/projects/p2/sso') return resposta({ ok: true });
            if (u === '/api/v1/projects/p2/sso') return resposta(rest('https://p2.exemplo.test'));
            if (u === '/api/v1/projects/p2/security-policy') return resposta({ ok: true, politica: POL });
            return resposta({ error: u }, 404);
        });
        vi.stubGlobal('fetch', f);
        S.activeProject = { id: 'p1', name: 'Um' };
        const a = window.renderSegurancaProjeto(el('c'), el('h'), el('a'));
        S.activeProject = { id: 'p2', name: 'Dois' };
        await window.renderSegurancaProjeto(el('c'), el('h'), el('a'));
        solta(); await a; await espera();
        expect(el('sso-issuer').value).toBe('https://p2.exemplo.test');
        expect(el('h').textContent).toContain('Dois');
        el('sso-secret').value = 's';
        await clica('salvarSsoProjeto');
        const puts = f.mock.calls.filter(([, o]) => o?.method === 'PUT').map(([u]) => new URL(u, 'http://localhost').pathname);
        expect(puts).toEqual(['/api/v1/projects/p2/sso']);
    });

    it('sem projeto ativo: não cai no primeiro da lista e não chama a API', async () => {
        S.activeProject = null; S.projects = [{ id: 'p1' }];
        const f = await abrir();
        expect(f).not.toHaveBeenCalled();
        expect(el('c').textContent).toContain('Sem projeto ativo');
    });

    it('o título mostra o cliente editado', async () => {
        S.activeProject = { id: 'p9', name: 'Cliente Exemplo' };
        await abrir();
        expect(el('h').textContent).toContain('Cliente Exemplo');
    });
});

describe('menu e rota', () => {
    it('item no menu, rota no roteador e import no main', () => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const nav = doc.getElementById('nav-seguranca-projeto');
        expect(nav.getAttribute('data-args')).toBe('["seguranca-projeto"]');
        expect(nav.style.display).toBe('none');
        expect(rota).toContain("S.view === 'seguranca-projeto'");
        expect(main).toContain('./views/seguranca-projeto.js');
    });
});
