// Deep link da Bancada: `?fase=&passo=` lido no boot (sem tirar do endereço) e levado do n.360 ao módulo.
import { describe, it, expect, beforeEach } from 'vitest';
import { S } from '../src/state.js';
import { alvoDaBancada, enderecoNoModulo, pedidoDoHub } from '../src/produto.js';

const loc = (path) => { const u = new URL(path, 'https://n360.ness.com.br'); return { pathname: u.pathname, search: u.search, hash: u.hash }; };

beforeEach(() => { S.bancadaAlvo = null; S.avisoEmCurso = null; S.filtroPainel = null; S.projects = []; });

describe('alvoDaBancada', () => {
  it('lê fase e passo do endereço', () => {
    expect(alvoDaBancada(loc('/iso?tela=project-detail&fase=3&passo=p3_3'))).toEqual({ fase: '3', passo: 'p3_3' });
    expect(alvoDaBancada(loc('/iso?fase=3'))).toEqual({ fase: '3', passo: null });
  });
  it('sem eles, null; não toca em ?tela=', () => {
    expect(alvoDaBancada(loc('/iso?tela=project-detail'))).toBeNull();
    const l = loc('/iso?tela=project-detail&fase=3&passo=p3_3');
    alvoDaBancada(l);
    expect(l.search).toContain('tela=project-detail');
    expect(l.search).toContain('passo=p3_3');
  });
  it('o pedido do hub deixa fase e passo no endereço para a Bancada ler', () => {
    history.replaceState(null, '', '/iso?tela=project-detail&fase=3&passo=p3_3');
    const pedido = pedidoDoHub();
    expect(pedido.tela).toBe('project-detail');
    expect(window.location.search).toContain('passo=p3_3');
    expect(window.location.search).not.toContain('tela=');
    expect(alvoDaBancada()).toEqual({ fase: '3', passo: 'p3_3' });
  });
});

describe('enderecoNoModulo com alvo da Bancada', () => {
  it('a tela da jornada leva o passo; as outras e a ausência de alvo não mudam o endereço', () => {
    S.bancadaAlvo = { passo: 'p3_3' };
    expect(enderecoNoModulo('iso', 'project-detail', { id: 'p1' })).toMatch(/\?tela=project-detail&passo=p3_3$/);
    S.bancadaAlvo = { fase: 3 };
    expect(enderecoNoModulo('iso', 'project-detail', { id: 'p1' })).toMatch(/\?tela=project-detail&fase=3$/);
    S.bancadaAlvo = { fase: 3 };
    expect(enderecoNoModulo('iso', 'monitor', { id: 'p1' })).toMatch(/\?tela=monitor&fase=3$/); // o alias leva o alvo como a tela que o substitui
    S.bancadaAlvo = { passo: 'p3_3' };
    expect(enderecoNoModulo('iso', 'dashboard', { id: 'p1' })).toMatch(/\?tela=dashboard$/);
    S.bancadaAlvo = null;
    expect(enderecoNoModulo('iso', 'project-detail', { id: 'p1' })).toMatch(/\?tela=project-detail$/);
  });
});
