// Padronizar nomes (spec 2026-10-14): lista antes → depois, marca o que aplicar e manda só o que foi marcado.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/partes.js';
import '../src/views/padronizar-nomes.js';

const PROPOSTAS = {
  propostas: [
    { tabela: 'departamentos', id: 'd1', antes: 'ti', depois: 'TI', conflito: false },
    { tabela: 'partes', id: 'p1', antes: '<b>maria</b> da silva', depois: 'Maria da Silva', conflito: false },
    { tabela: 'departamentos', id: 'd3', antes: 'rh', depois: 'RH', conflito: true },
  ],
  duplicatas: [{ tabela: 'departamentos', nomes: ['RH', 'rh'] }],
};
const el = (id) => document.getElementById(id);

beforeEach(() => {
  apiMock.mockReset();
  document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div><h1 id="h"></h1><div id="a"></div><div id="c"></div>';
  window.render = vi.fn();
  S.activeProject = { id: 'p9' };
  S.user = { role: 'consultor' };
});

describe('Padronizar nomes', () => {
  it('o menu de Partes oferece a ação só a quem edita', async () => {
    apiMock.mockResolvedValue([]);
    await window.renderPartes(el('c'), el('h'), el('a'));
    expect(JSON.parse(el('a').querySelector('[data-action="abrirPadronizarNomes"]').getAttribute('data-args'))).toEqual(['p9']);
    S.user = { role: 'org_user' };
    await window.renderPartes(el('c'), el('h'), el('a'));
    expect(el('a').querySelector('[data-action="abrirPadronizarNomes"]')).toBeNull();
  });

  it('mostra antes e depois escapados; conflito vem desabilitado e as duplicatas aparecem', async () => {
    apiMock.mockResolvedValue(PROPOSTAS);
    await window.abrirPadronizarNomes('p9');
    const m = el('modal-content');
    expect(m.textContent).toContain('Maria da Silva');
    expect(m.textContent).toContain('<b>maria</b> da silva');
    expect(m.querySelector('b')).toBeNull();
    expect(m.querySelector('input[data-pn="d3"]').disabled).toBe(true);
    expect(m.querySelector('input[data-pn="d1"]').disabled).toBe(false);
    expect(m.textContent).toContain('RH, rh');
  });

  it('aplicar manda só as marcadas, com o nome que a pessoa viu', async () => {
    apiMock.mockResolvedValueOnce(PROPOSTAS).mockResolvedValueOnce({ ok: true, aplicados: 1, ignorados: [] }).mockResolvedValue(PROPOSTAS);
    await window.abrirPadronizarNomes('p9');
    el('modal-content').querySelector('input[data-pn="p1"]').checked = false;
    await window.aplicarPadronizarNomes('p9');
    const [metodo, url, corpo] = apiMock.mock.calls[1];
    expect([metodo, url]).toEqual(['POST', '/api/v1/projects/p9/padronizar-nomes']);
    expect(corpo).toEqual({ itens: [{ tabela: 'departamentos', id: 'd1', antes: 'ti' }] });
  });

  it('D5: duplicata de parte tem "Mesclar"; a prévia escapa o nome e confirmar manda manter, remover e confirmar:true', async () => {
    const DUP = { propostas: [], duplicatas: [
      { tabela: 'partes', nomes: ['Nuvem <b>X</b>', 'nuvem x'], registros: [{ id: 'a1', nome: 'Nuvem <b>X</b>' }, { id: 'a2', nome: 'nuvem x' }] },
      { tabela: 'departamentos', nomes: ['RH', 'rh'] },
    ] };
    apiMock.mockResolvedValueOnce(DUP);
    await window.abrirPadronizarNomes('p9');
    const m = el('modal-content');
    expect(m.querySelectorAll('[data-action="previaMesclar"]')).toHaveLength(1); // departamento segue à mão
    expect(m.querySelector('b')).toBeNull();
    m.querySelector('#pn-manter-0').value = 'a2';
    apiMock.mockResolvedValueOnce({ ok: true, previa: true, manter: { id: 'a2', nome: 'nuvem x' }, remover: { id: 'a1', nome: 'Nuvem <b>X</b>' },
      efeitos: [{ rotulo: 'Papéis (vínculos)', n: 2 }], avisos: ['Aviso <i>x</i>'], tratamentos: 1 });
    await window.previaMesclar('p9', 0);
    expect(apiMock).toHaveBeenLastCalledWith('POST', '/api/v1/projects/p9/mesclar', { tabela: 'partes', manter: 'a2', remover: 'a1' });
    const p = el('modal-content');
    expect(p.textContent).toContain('Papéis (vínculos): 2');
    expect(p.textContent).toContain('Nuvem <b>X</b>');
    expect(p.querySelector('b, i')).toBeNull();
    apiMock.mockResolvedValueOnce({ ok: true });
    await window.confirmarMesclar('p9', 'partes', 'a2', 'a1');
    expect(apiMock).toHaveBeenLastCalledWith('POST', '/api/v1/projects/p9/mesclar', { tabela: 'partes', manter: 'a2', remover: 'a1', confirmar: true });
  });

  it('sem nada a padronizar, diz isso', async () => {
    apiMock.mockResolvedValue({ propostas: [], duplicatas: [] });
    await window.abrirPadronizarNomes('p9');
    expect(el('modal-content').textContent).toContain('Todos os nomes já estão no padrão');
    expect(el('modal-content').querySelector('[data-action="aplicarPadronizarNomes"]')).toBeNull();
  });
});
