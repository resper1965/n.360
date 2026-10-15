// Convite: criar a senha pelo link do e-mail (#convite=<token>). O token sai do endereço na hora, vai só no corpo do POST, e o
// formulário valida e mostra o erro no campo. Nada inline (CSP script-src 'self').
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import html from '../login.html?raw';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));

import { S } from '../src/state.js';

const TOKEN = 'ab'.repeat(32);
const caixa = html.match(/<div class="login-box" id="criar-senha-box"[\s\S]*?<!-- Segundo fator/)[0].replace('<!-- Segundo fator', '');

function monta() {
    document.body.innerHTML = `
    <div id="login-overlay">
      <div class="login-box" id="standard-login-box">
        <input id="login-email" class="form-input" value="">
        <input type="password" id="login-password" class="form-input" value="">
        <p id="login-error" style="display:none"></p>
      </div>
      ${caixa}
    </div>
    <div id="live-region" role="status" aria-live="polite"></div>`;
}

let replaceState;
beforeEach(async () => {
    vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
    monta();
    await import('../src/globals.js');
    monta();
    apiMock.mockReset();
    S.token = null; S.user = null;
    replaceState = vi.spyOn(history, 'replaceState');
    vi.stubGlobal('location', { ...window.location, hash: `#convite=${TOKEN}`, pathname: '/', search: '' });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const el = (id) => document.getElementById(id);
const preenche = (a, b) => { el('convite-senha').value = a; el('convite-confirma').value = b; };

describe('criar senha pelo convite', () => {
    it('o link mostra o formulário e tira o token do endereço', () => {
        expect(window.consumirConvite()).toBe(true);
        expect(el('criar-senha-box').style.display).toBe('flex');
        expect(el('standard-login-box').style.display).toBe('none');
        expect(replaceState).toHaveBeenCalledWith(null, '', '/');
    });

    it('sem #convite (ou com token fora do formato) não faz nada', () => {
        vi.stubGlobal('location', { ...window.location, hash: '#convite=xyz', pathname: '/', search: '' });
        expect(window.consumirConvite()).toBe(false);
        expect(el('criar-senha-box').style.display).toBe('none');
    });

    it('senha curta e confirmação diferente: erro no campo, sem chamar a API', async () => {
        window.consumirConvite();
        preenche('curta', 'curta');
        await window.doCriarSenha();
        expect(el('convite-senha-erro').textContent).toMatch(/8 caracteres/);
        expect(el('convite-senha').getAttribute('aria-invalid')).toBe('true');
        preenche('senha-bem-longa', 'outra-senha-longa');
        await window.doCriarSenha();
        expect(el('convite-senha').hasAttribute('aria-invalid')).toBe(false);
        expect(el('convite-confirma-erro').textContent).toMatch(/não coincidem/);
        expect(apiMock).not.toHaveBeenCalled();
    });

    it('envia o token no corpo e entra pelo login normal com o e-mail devolvido', async () => {
        window.consumirConvite();
        preenche('senha-bem-longa', 'senha-bem-longa');
        apiMock.mockImplementation(async (_m, url) => (url === '/api/v1/auth/criar-senha' ? { ok: true, email: 'nova@cliente.test' } : { token: 't', user: { id: 'u' } }));
        window.initApp = vi.fn();
        await window.doCriarSenha();
        expect(apiMock).toHaveBeenNthCalledWith(1, 'POST', '/api/v1/auth/criar-senha', { token: TOKEN, newPassword: 'senha-bem-longa' });
        expect(apiMock).toHaveBeenNthCalledWith(2, 'POST', '/api/v1/auth/login', { email: 'nova@cliente.test', password: 'senha-bem-longa' });
        expect(el('criar-senha-box').style.display).toBe('none');
        expect(el('convite-senha').value).toBe('');
    });

    it('link que não vale: a mensagem do servidor aparece e o formulário fica', async () => {
        window.consumirConvite();
        preenche('senha-bem-longa', 'senha-bem-longa');
        apiMock.mockRejectedValue(new Error('Este link não vale mais. Peça um convite novo a quem convidou ou use "Esqueci a senha".'));
        await window.doCriarSenha();
        expect(el('convite-erro').style.display).toBe('block');
        expect(el('convite-erro').textContent).toMatch(/não vale mais/);
        expect(el('criar-senha-box').style.display).toBe('flex');
    });

    it('nada inline na caixa: sem script, sem handler on*, ação por data-action', () => {
        expect(caixa).not.toMatch(/<script/i);
        expect(caixa).not.toMatch(/\son[a-z]+=/i);
        expect(caixa).toContain('data-action-submit="doCriarSenha"');
        expect(caixa).toContain('autocomplete="new-password"');
    });
});
