// Clique no aviso do sino (handleNotificationClick): o link `/projects/<id>/<tela>` vem de src/services/avisos-prazo.ts (TELA).
// Incidente é cadastro do núcleo, então navega local nos dois produtos (aba Incidentes da tela titular); tela que só o outro
// produto tem leva ao caminho dele no n.360 (/iso, /privacy).
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/api.js', () => ({ api: vi.fn(async () => ([])), API_BASE: 'http://api.test' }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));
vi.mock('../src/produto.js', async (original) => {
  const real = await original();
  return { ...real, destinoDoAviso: vi.fn(real.destinoDoAviso) };
});

import { S } from '../src/state.js';
import { navigate } from '../src/router.js';
import { destinoDoAviso } from '../src/produto.js';

beforeAll(async () => {
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
  document.body.innerHTML = '<div id="login-overlay" class="hidden"></div>';
  await import('../src/globals.js');
});

const PROJ = { id: 'p1', modulos: ['iso', 'privacy'] };
const clicar = async (link) => {
  S.notifications = [{ id: 'n1', link, read: 0 }];
  await window.handleNotificationClick('n1');
};

beforeEach(() => {
  navigate.mockClear();
  destinoDoAviso.mockClear();
  S.projects = [PROJ];
  S.titularAba = 'pedidos';
  document.body.innerHTML = '<div id="notif-dropdown"></div>';
});
afterEach(() => history.replaceState(null, '', '/'));

describe('handleNotificationClick', () => {
  it.each(['iso', 'privacy'])('incidente no %s: navega local para a aba Incidentes, no projeto do aviso', async (produto) => {
    history.replaceState(null, '', '/' + produto);
    await clicar('/projects/p1/incidentes');
    expect(navigate).toHaveBeenCalledWith('titular', { currentProject: PROJ, activeProject: PROJ });
    expect(S.titularAba).toBe('incidentes');
  });

  it('tela só do outro produto vai ao caminho dele, sem navegar local', async () => {
    history.replaceState(null, '', '/iso');
    vi.spyOn(console, 'error').mockImplementation(() => {}); // jsdom não implementa navegação de página
    await clicar('/projects/p1/terceiros');
    expect(navigate).not.toHaveBeenCalled();
    expect(destinoDoAviso.mock.results[0].value).toEqual({ href: '/privacy' });
  });

  it('no início do n.360, tela de módulo leva ao caminho do módulo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await clicar('/projects/p1/capa');
    expect(navigate).not.toHaveBeenCalled();
    expect(destinoDoAviso.mock.results[0].value).toEqual({ href: '/iso' });
  });

  it('tela do próprio produto navega local', async () => {
    history.replaceState(null, '', '/privacy');
    await clicar('/projects/p1/terceiros');
    expect(navigate).toHaveBeenCalledWith('terceiros', { currentProject: PROJ, activeProject: PROJ });
  });
});
