// Do aviso de prazo à Bancada: o link com `passo=` abre o passo; sem ele, o aviso segue como era.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));

import { S } from '../src/state.js';

beforeAll(async () => {
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
  document.body.innerHTML = '<div id="login-overlay" class="hidden"></div>';
  await import('../src/globals.js');
});

beforeEach(() => {
  history.replaceState(null, '', '/iso');
  apiMock.mockReset();
  apiMock.mockImplementation(async () => []);
  globalThis.renderProjectDetail = vi.fn();
  S.user = { id: 'u1', role: 'consultor' };
  S.projects = [{ id: 'p1', client_name: 'Cliente Fictício', modulos: ['iso'] }];
  S.bancadaAlvo = null;
});

describe('abrirAviso e a Bancada', () => {
  it('link com passo= abre a tela da jornada naquele passo', async () => {
    await window.abrirAviso({ link: '/projects/p1?passo=p3_3', title: 'Passo vence hoje' });
    expect(S.view).toBe('project-detail');
    expect(S.bancadaAlvo).toEqual({ passo: 'p3_3' });
    expect(S.currentProject.id).toBe('p1');
  });
  it('o passo também vale quando o link tem subcaminho', async () => {
    await window.abrirAviso({ link: '/projects/p1/?passo=p4_1' });
    expect(S.view).toBe('project-detail');
    expect(S.bancadaAlvo).toEqual({ passo: 'p4_1' });
  });
  it('link sem passo segue para a jornada como antes, sem alvo', async () => {
    await window.abrirAviso({ link: '/projects/p1' });
    expect(S.view).toBe('project-detail');
    expect(S.bancadaAlvo).toBeNull();
  });
});
