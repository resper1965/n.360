// n.360 fatia 3: módulos por pessoa nas telas. Usuários (lista e modal com caixas até o teto), os módulos da pessoa
// cruzados com os do projeto (S.user.modulos) e o aviso do cartão "Produtos do projeto".
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { apiMock, renderMock } = vi.hoisted(() => ({ apiMock: vi.fn(), renderMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));
vi.mock('../src/router.js', () => ({ render: renderMock, navigate: vi.fn() }));

import '../src/ui.js';
import '../src/views/admin.js';
import { S } from '../src/state.js';
import { modulosVisiveis, temProduto, projetosDoProduto } from '../src/produto.js';

const $ = (id) => document.getElementById(id);
const dom = () => {
  document.body.innerHTML =
    '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div><div id="c"></div><h1 id="h"></h1><div id="a"></div>';
  return [$('c'), $('h'), $('a')];
};
const caixa = (v) => document.querySelector(`.user-m-modulo[value="${v}"]`);

beforeEach(() => {
  apiMock.mockReset();
  renderMock.mockReset();
  window.loadProjects = vi.fn(async () => {});
  S.user = { role: 'platform_admin', email: 'root@exemplo.test' };
  S.projects = [{ id: 'p1', client_name: 'Cliente Um' }];
  S.activeProject = null;
});

const USERS = [
  { id: 'u1', name: 'Ana <b id="nm">x</b>', email: 'ana@exemplo.test', role: 'platform_admin', modulos: ['iso', 'privacy'], teto_modulos: ['iso', 'privacy'] },
  { id: 'u2', name: 'Caio', email: 'caio@exemplo.test', role: 'org_admin', client_project_id: 'p1', modulos: ['iso'], teto_modulos: ['iso'] },
  { id: 'u3', name: 'Bia', email: 'bia@exemplo.test', role: 'consultor', modulos: [], teto_modulos: ['iso', 'privacy'] },
  { id: 'u4', name: 'Duda', email: 'duda@exemplo.test', role: 'comercial' },
];

describe('lista de usuários', () => {
  it('mostra os módulos de cada conta (Nenhum quando vazio, traço quando a resposta é antiga)', async () => {
    apiMock.mockResolvedValue(USERS);
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    const linhas = [...c.querySelectorAll('tbody tr')];
    expect(c.querySelector('thead').textContent).toContain('Módulos');
    expect(linhas[0].textContent).toContain('n.iso · n.privacy');
    expect(linhas[1].textContent).toContain('n.iso');
    expect(linhas[1].textContent).not.toContain('n.privacy');
    expect(linhas[2].textContent).toContain('Nenhum');
    expect(linhas[3].querySelectorAll('td')[4].textContent).toBe('—');
    expect($('nm')).toBeNull();
  });
});

describe('modal de usuário: módulos', () => {
  it('edição: caixas até o teto; fora do teto desabilitada; marcadas as da conta', async () => {
    apiMock.mockResolvedValue(USERS);
    dom();
    await window.openUserModal('u2');
    expect(caixa('iso').checked).toBe(true);
    expect(caixa('iso').disabled).toBe(false);
    expect(caixa('privacy').checked).toBe(false);
    expect(caixa('privacy').disabled).toBe(true);
  });

  it('edição: PUT da conta e depois PUT /modulos só quando mudou', async () => {
    apiMock.mockResolvedValue(USERS);
    dom();
    await window.openUserModal('u3');
    apiMock.mockReset();
    apiMock.mockResolvedValue({});
    $('user-m-role').value = 'consultor';
    caixa('privacy').checked = true;
    await window.saveUser('u3');
    expect(apiMock.mock.calls.map((x) => x.slice(0, 2))).toEqual([['PUT', '/api/v1/users/u3'], ['PUT', '/api/v1/users/u3/modulos']]);
    expect(apiMock.mock.calls[1][2]).toEqual({ modulos: ['privacy'] });
  });

  it('edição sem mudar as caixas: não chama /modulos', async () => {
    apiMock.mockResolvedValue(USERS);
    dom();
    await window.openUserModal('u2');
    apiMock.mockReset();
    apiMock.mockResolvedValue({});
    $('user-m-role').value = 'org_admin';
    await window.saveUser('u2');
    expect(apiMock.mock.calls.map((x) => x[1])).toEqual(['/api/v1/users/u2']);
  });

  it('edição: desmarcar tudo envia lista vazia', async () => {
    apiMock.mockResolvedValue(USERS);
    dom();
    await window.openUserModal('u2');
    apiMock.mockReset();
    apiMock.mockResolvedValue({});
    $('user-m-role').value = 'org_admin';
    caixa('iso').checked = false;
    await window.saveUser('u2');
    expect(apiMock.mock.calls[1][2]).toEqual({ modulos: [] });
  });

  it('criação: POST leva modulos quando marcou; sem marcar, não leva (padrão do servidor)', async () => {
    apiMock.mockResolvedValue(USERS);
    dom();
    await window.openUserModal('');
    expect(caixa('iso').disabled).toBe(false);
    expect(caixa('privacy').disabled).toBe(false);
    $('user-m-name').value = 'Eva'; $('user-m-email').value = 'eva@exemplo.test'; $('user-m-password').value = 'senha-forte'; $('user-m-role').value = 'org_user';
    apiMock.mockReset();
    apiMock.mockResolvedValue({});
    await window.saveUser('');
    expect(apiMock.mock.calls[0][2]).not.toHaveProperty('modulos');
    caixa('privacy').checked = true;
    await window.saveUser('');
    expect(apiMock.mock.calls[1][2].modulos).toEqual(['privacy']);
  });

  it('criação por quem só enxerga teto de iso: privacy desabilitado', async () => {
    S.user = { role: 'org_admin', client_project_id: 'p1' };
    apiMock.mockResolvedValue([USERS[1]]);
    dom();
    await window.openUserModal('');
    expect(caixa('iso').disabled).toBe(false);
    expect(caixa('privacy').disabled).toBe(true);
  });
});

describe('módulos da pessoa cruzados com os do projeto', () => {
  const P = { id: 'p1', modulos: ['iso', 'privacy'] };
  const SO_ISO = { id: 'p2', modulos: ['iso'] };

  it('interseção com S.user.modulos', () => {
    S.user = { role: 'consultor', modulos: ['privacy'] };
    expect(modulosVisiveis(P)).toEqual(['privacy']);
    expect(temProduto(P, 'iso')).toBe(false);
    expect(temProduto(P, 'privacy')).toBe(true);
    expect(projetosDoProduto([P, SO_ISO], 'privacy')).toEqual([P]);
    expect(projetosDoProduto([P, SO_ISO], 'iso')).toEqual([]);
  });

  it('platform_admin vê tudo do projeto, mesmo sem o campo', () => {
    S.user = { role: 'platform_admin' };
    expect(modulosVisiveis(P)).toEqual(['iso', 'privacy']);
  });

  it('campo ausente: comportamento anterior (só o do projeto)', () => {
    S.user = { role: 'consultor' };
    expect(modulosVisiveis(P)).toEqual(['iso', 'privacy']);
    expect(projetosDoProduto([P, SO_ISO], 'iso')).toEqual([P, SO_ISO]);
  });

  it('pessoa sem módulo nenhum: nenhum módulo; o n.360 segue listando os projetos', () => {
    S.user = { role: 'org_user', modulos: [] };
    expect(modulosVisiveis(P)).toEqual([]);
    expect(projetosDoProduto([P], 'n360')).toEqual([P]);
  });
});

describe('cartão Produtos do projeto', () => {
  it('avisa quem recebe o módulo ao habilitar', async () => {
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    apiMock.mockResolvedValue({ habilitados: ['iso'], contratados: ['iso', 'privacy'] });
    await window.abrirProdutosDoProjeto('p1');
    expect($('produtos-aviso-pessoas').textContent).toBe('Os usuários do cliente deste projeto recebem o módulo; a equipe da consultoria precisa recebê-lo na tela Usuários.');
  });
});
