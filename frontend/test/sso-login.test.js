// Login por SSO na tela de entrada: descoberta por e-mail, botao explicito e
// retorno do callback (#sso_token / #sso_erro).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));

import { S } from '../src/state.js';

function montaLogin() {
  document.body.innerHTML = `
    <div id="login-overlay">
      <div class="login-box" id="standard-login-box">
        <input id="login-email" class="form-input" value="ana@acme.com.br">
        <input type="password" id="login-password" class="form-input" value="">
        <button id="login-submit">Entrar</button>
        <p id="login-error" style="display:none"></p>
      </div>
    </div>
    <div id="live-region" role="status" aria-live="polite"></div>`;
}

let assign;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
  montaLogin();
  await import('../src/globals.js');
  montaLogin();
  apiMock.mockReset();
  S.token = null; S.user = null;
  localStorage.clear();
  history.replaceState(null, '', '/');
  window.initApp = vi.fn();
  assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign, hash: '', pathname: '/', search: '' });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('descoberta de SSO ao entrar sem senha', () => {
  it('e-mail com SSO redireciona ao provedor e nao chama o login por senha', async () => {
    apiMock.mockResolvedValue({ sso: true, autorizacao: 'https://idp.exemplo.test/auth?x=1' });
    await window.doLogin();
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/public/sso/iniciar', { email: 'ana@acme.com.br' });
    expect(apiMock).not.toHaveBeenCalledWith('POST', '/api/v1/auth/login', expect.anything());
    expect(assign).toHaveBeenCalledWith('https://idp.exemplo.test/auth?x=1');
  });

  it('e-mail sem SSO pede a senha e nao redireciona', async () => {
    apiMock.mockResolvedValue({ sso: false });
    await window.doLogin();
    expect(assign).not.toHaveBeenCalled();
    const err = document.getElementById('login-error');
    expect(err.style.display).toBe('block');
    expect(err.textContent).toMatch(/senha/i);
  });

  it('com senha preenchida segue o login por senha, sem consultar SSO', async () => {
    document.getElementById('login-password').value = 'abc';
    apiMock.mockResolvedValue({ token: 't', user: { id: 'u' } });
    await window.doLogin();
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock.mock.calls[0][1]).toBe('/api/v1/auth/login');
  });

  it('botao explicito consulta o SSO mesmo com senha digitada', async () => {
    document.getElementById('login-password').value = 'abc';
    apiMock.mockResolvedValue({ sso: true, autorizacao: 'https://idp.exemplo.test/a' });
    await window.entrarComSso();
    expect(assign).toHaveBeenCalledWith('https://idp.exemplo.test/a');
  });

  it('botao explicito sem SSO para o dominio avisa que nao ha SSO', async () => {
    apiMock.mockResolvedValue({ sso: false });
    await window.entrarComSso();
    expect(document.getElementById('login-error').textContent).toMatch(/SSO/);
  });
});

describe('retorno do callback', () => {
  it('#sso_token vira sessao e some da URL', () => {
    location.hash = '#sso_token=tok123';
    window.consumirRetornoSso();
    expect(S.token).toBe('tok123');
    expect(localStorage.getItem('niso_token')).toBe('tok123');
  });

  it('#sso_erro mostra mensagem fixa, nunca o texto da URL', () => {
    location.hash = '#sso_erro=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E';
    window.consumirRetornoSso();
    const err = document.getElementById('login-error');
    expect(err.style.display).toBe('block');
    expect(err.innerHTML).not.toContain('<img');
    expect(err.textContent).toMatch(/SSO/);
  });

  it('sem hash de SSO nao mexe em nada', () => {
    location.hash = '';
    window.consumirRetornoSso();
    expect(S.token).toBeNull();
    expect(document.getElementById('login-error').style.display).toBe('none');
  });
});
