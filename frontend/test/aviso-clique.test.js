// Clique no aviso do sino (handleNotificationClick): o link `/projects/<id>/<tela>` vem de src/services/avisos-prazo.ts (TELA).
// Incidente é cadastro do núcleo, então navega local nos dois produtos (aba Incidentes da tela titular); tela que só o outro
// produto tem leva ao caminho dele no n.360 (/iso, /privacy).
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/api.js', () => ({ api: vi.fn(async () => ([])), API_BASE: 'http://api.test' }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));
vi.mock('../src/produto.js', async (original) => {
  const real = await original();
  return { ...real, destinoDoAviso: vi.fn(real.destinoDoAviso), irPara: vi.fn() };
});

import { S } from '../src/state.js';
import { navigate } from '../src/router.js';
import { destinoDoAviso, irPara } from '../src/produto.js';

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
  irPara.mockClear();
  sessionStorage.clear();
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

  it('no início do n.360, navega com o aviso em curso: o router leva ao módulo e guarda o aviso (aviso-hub.test)', async () => {
    let emCurso;
    navigate.mockImplementationOnce(() => { emCurso = S.avisoEmCurso; });
    await clicar('/projects/p1/capa');
    expect(destinoDoAviso.mock.results[0].value).toEqual({ navegar: 'capa' });
    expect(navigate).toHaveBeenCalledWith('capa', { currentProject: PROJ, activeProject: PROJ });
    expect(emCurso).toMatchObject({ link: '/projects/p1/capa' });
    expect(S.avisoEmCurso).toBeNull();
  });

  it('tela do próprio produto navega local', async () => {
    history.replaceState(null, '', '/privacy');
    await clicar('/projects/p1/terceiros');
    expect(navigate).toHaveBeenCalledWith('terceiros', { currentProject: PROJ, activeProject: PROJ });
  });

  // ot_acesso_sensivel (src/services/ot-stepup.ts): link /projects/<id>/ot; a mensagem diz se foi revelação ou exportação.
  describe('aviso do n.ot (revelação ou exportação)', () => {
    const OT = { id: 'p2', modulos: ['iso', 'ot'] };
    const EXPORTOU = 'gestor@x.com exportou o inventário (csv, site s1, 3 ativo(s)). Justificativa: Entrega ao ONS';
    const REVELOU = 'admin@ness.com.br revelou o IP/MAC do ativo a1. Justificativa: Auditoria de campo';
    const clicarOt = async (message, proj = OT) => {
      S.projects = [proj];
      S.notifications = [{ id: 'n1', link: `/projects/${proj.id}/ot`, message, read: 0 }];
      await window.handleNotificationClick('n1');
    };
    beforeEach(() => { S.otTela = 'inicio'; });

    it('no n.ot: abre a tela do n.ot no projeto do aviso, em Relatórios (exportação) ou Sites (revelação)', async () => {
      history.replaceState(null, '', '/ot');
      await clicarOt(EXPORTOU);
      expect(navigate).toHaveBeenCalledWith('ot', { currentProject: OT, activeProject: OT });
      expect(S.otTela).toBe('relatorios');
      await clicarOt(REVELOU);
      expect([S.otTela, S.otSite]).toEqual(['sites', null]);
    });

    it('no n.iso: vai à casca /ot com o projeto e o aviso guardados (o n.ot o reabre no boot)', async () => {
      history.replaceState(null, '', '/iso');
      await clicarOt(EXPORTOU);
      expect(navigate).not.toHaveBeenCalled();
      expect(irPara).toHaveBeenCalledWith('/ot?tela=ot');
      expect(JSON.parse(sessionStorage.getItem('n360_aviso'))).toMatchObject({ link: '/projects/p2/ot', message: EXPORTOU });
      expect(JSON.parse(localStorage.getItem('niso_activeProject'))).toMatchObject({ id: 'p2' });
    });

    it('no n.360: navega para a tela do n.ot (o router leva ao módulo)', async () => {
      await clicarOt(REVELOU);
      expect(navigate).toHaveBeenCalledWith('ot', { currentProject: OT, activeProject: OT });
    });

    it('quem não tem o n.ot no projeto cai na página do projeto, não numa casca sem acesso', async () => {
      history.replaceState(null, '', '/iso');
      await clicarOt(REVELOU, PROJ);
      expect(irPara).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith('project-detail', { currentProject: PROJ });
    });
  });
});
