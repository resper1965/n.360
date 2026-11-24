// Tela de Partes e departamentos (fatia 1.4): lista, importa, concilia e escapa o que vem do banco.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/partes.js';

const PARTES = [
  { id: 'pt1', tipo: 'pessoa', nome: 'Ana Exemplo', email: 'ana@exemplo.com.br', status: 'ativa' },
  { id: 'pt2', tipo: 'organizacao', nome: '<img src=x onerror=alert(1)>', email: null, status: 'inativa' },
];

function montar() {
  document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div><h1 id="h"></h1><div id="a"></div><div id="c"></div>';
  return [document.getElementById('c'), document.getElementById('h'), document.getElementById('a')];
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((m, url) => {
    if (url.endsWith('/partes')) return Promise.resolve(PARTES);
    if (url.endsWith('/departamentos')) return Promise.resolve([{ id: 'd1', nome: 'TI', status: 'ativo' }]);
    return Promise.resolve({});
  });
  window.render = vi.fn();
  S.activeProject = { id: 'p1' };
  S.user = { role: 'consultor' };
});

describe('tela de Partes', () => {
  it('lista partes, sem departamentos, e escapa o nome', async () => {
    const [c, h, a] = montar();
    await window.renderPartes(c, h, a);
    expect(h.textContent).toBe('Pessoas e parceiros');
    expect(c.textContent).toContain('Ana Exemplo');
    expect(c.textContent).not.toContain('Departamentos'); // as áreas têm tela própria
    expect(apiMock.mock.calls.map(([, u]) => u)).not.toContain('/api/v1/projects/p1/departamentos');
    expect(c.querySelector('img')).toBeNull(); // nome de parte não vira HTML
    expect(a.querySelectorAll('[role="menuitem"], .btn-primary').length).toBe(4); // três no "Mais ações" e o primário
    const areas = [...a.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Áreas');
    expect(areas.getAttribute('data-action')).toBe('navigate');
    expect(JSON.parse(areas.getAttribute('data-args'))).toEqual(['areas']);
  });

  it('papel só de leitura não vê os botões de escrita', async () => {
    S.user = { role: 'org_user' };
    const [c, h, a] = montar();
    await window.renderPartes(c, h, a);
    expect(a.querySelectorAll('.btn-primary, [role="menuitem"]').length).toBe(0); // só o link Áreas, que é leitura
  });

  it('importar chama a rota do projeto e avisa o resumo', async () => {
    montar();
    apiMock.mockImplementation(() => Promise.resolve({ ok: true, criadas: 4, reaproveitadas: 1, vinculos: 5 }));
    await window.importarPartes('p1');
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/partes/importar');
    expect(document.querySelector('.toast').textContent).toContain('4 criadas');
  });

  it('conciliar mostra o que não casou e o que é ambíguo, sem interpretar HTML', async () => {
    montar();
    apiMock.mockImplementation(() => Promise.resolve({
      ok: true, casados: { risks: 2, itens: 1 },
      sem_correspondencia: [{ tabela: 'risks', coluna: 'owner', texto: '<b>TI</b>', n: 3 }],
      ambiguos: [{ tabela: 'risks', coluna: 'owner', texto: 'Duplicada', n: 1 }],
    }));
    await window.conciliarPartes('p1');
    const m = document.getElementById('modal-content').innerHTML;
    expect(m).toContain('<strong>3</strong>');
    expect(m).toContain('Sem correspondência (1)');
    expect(m).toContain('Ambíguos (1)');
    expect(m).not.toContain('<b>TI</b>');
  });

  it('criar parte manda tipo, nome e e-mail', async () => {
    const [c, h, a] = montar();
    window.openNovaParteModal('p1');
    document.getElementById('parte-tipo').value = 'organizacao';
    document.getElementById('parte-nome').value = '  Fornecedora Exemplo ';
    await window.criarParte('p1');
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/partes', { tipo: 'organizacao', nome: 'Fornecedora Exemplo', email: null });
  });
  it('D4: organização leva o CNPJ; pessoa não manda o campo; a edição mostra o CNPJ com máscara e limpa com null', async () => {
    const [c, h, a] = montar();
    window.openNovaParteModal('p1');
    document.getElementById('parte-tipo').value = 'organizacao';
    document.getElementById('parte-nome').value = 'Fornecedora Exemplo';
    document.getElementById('parte-cnpj').value = '11.222.333/0001-81';
    await window.criarParte('p1');
    expect(apiMock).toHaveBeenLastCalledWith('POST', '/api/v1/projects/p1/partes', { tipo: 'organizacao', nome: 'Fornecedora Exemplo', email: null, cnpj: '11.222.333/0001-81' });

    window.openNovaParteModal('p1');
    document.getElementById('parte-tipo').value = 'pessoa';
    document.getElementById('parte-nome').value = 'Ana';
    document.getElementById('parte-cnpj').value = '11.222.333/0001-81';
    await window.criarParte('p1');
    expect(apiMock).toHaveBeenLastCalledWith('POST', '/api/v1/projects/p1/partes', { tipo: 'pessoa', nome: 'Ana', email: null });

    apiMock.mockImplementation((m, url) => Promise.resolve(url.endsWith('/partes/pt9') ? { id: 'pt9', tipo: 'organizacao', nome: 'Org', email: null, status: 'ativa', cnpj: '11222333000181', vinculos: [] } : {}));
    await window.openParteModal('p1', 'pt9');
    expect(document.getElementById('parte-e-cnpj').value).toBe('11.222.333/0001-81');
    document.getElementById('parte-e-cnpj').value = '';
    await window.salvarParte('p1', 'pt9');
    expect(apiMock).toHaveBeenLastCalledWith('PUT', '/api/v1/projects/p1/partes/pt9', { nome: 'Org', email: null, status: 'ativa', cnpj: null });
  });
});

describe('mudar o tipo da parte', () => {
  const PARTE = { id: 'pt9', tipo: 'pessoa', nome: 'Escritório', email: null, status: 'ativa', vinculos: [] };
  it('quem edita escolhe o tipo; só a mudança vai no corpo; a recusa do servidor aparece', async () => {
    montar();
    apiMock.mockImplementation((m, url) => Promise.resolve(url.endsWith('/partes/pt9') && m === 'GET' ? PARTE : {}));
    await window.openParteModal('p1', 'pt9');
    const sel = document.getElementById('parte-e-tipo');
    expect(sel.value).toBe('pessoa');
    expect(sel.disabled).toBe(false);
    await window.salvarParte('p1', 'pt9');
    expect(apiMock).toHaveBeenLastCalledWith('PUT', '/api/v1/projects/p1/partes/pt9', { nome: 'Escritório', email: null, status: 'ativa' });
    await window.openParteModal('p1', 'pt9');
    document.getElementById('parte-e-tipo').value = 'organizacao';
    await window.salvarParte('p1', 'pt9');
    expect(apiMock).toHaveBeenLastCalledWith('PUT', '/api/v1/projects/p1/partes/pt9', { nome: 'Escritório', email: null, status: 'ativa', tipo: 'organizacao' });
    apiMock.mockImplementation((m) => (m === 'PUT' ? Promise.reject(new Error('A pessoa tem conta')) : Promise.resolve(PARTE)));
    await window.openParteModal('p1', 'pt9');
    document.getElementById('parte-e-tipo').value = 'organizacao';
    await window.salvarParte('p1', 'pt9');
    expect(document.querySelector('.toast').textContent).toContain('A pessoa tem conta');
  });

  it('quem só lê vê o tipo desabilitado', async () => {
    S.user = { role: 'org_user' };
    montar();
    apiMock.mockImplementation(() => Promise.resolve(PARTE));
    await window.openParteModal('p1', 'pt9');
    expect(document.getElementById('parte-e-tipo').disabled).toBe(true);
  });
});

describe('Partes no n.iso: tudo como antes', () => {
  it('header: só "+ Nova parte" é primário; os outros três ficam no menu "Mais"', async () => {
    const [c, h, a] = montar();
    await window.renderPartes(c, h, a);
    expect([...a.querySelectorAll('.btn-primary')].map((b) => b.textContent.trim())).toEqual(['+ Nova parte']);
    const mais = a.querySelector('.mais-acoes');
    expect(mais.querySelector('[aria-haspopup="menu"]').textContent.trim()).toBe('Mais ações');
    expect([...mais.querySelectorAll('[role="menuitem"]')].map((b) => b.getAttribute('data-action'))).toEqual(['importarPartes', 'conciliarPartes', 'abrirPadronizarNomes']);
  });

  it('nova parte pode nascer com o tipo já escolhido', () => {
    montar();
    window.openNovaParteModal('p1', 'organizacao');
    expect(document.getElementById('parte-tipo').value).toBe('organizacao');
  });
});

describe('Pessoas no n.privacy', () => {
  beforeEach(() => history.replaceState(null, '', '/privacy'));
  afterEach(() => history.replaceState(null, '', '/'));

  it('só pessoas, título Pessoas e nenhuma tabela de departamentos', async () => {
    const [c, h, a] = montar();
    await window.renderPartes(c, h, a);
    expect(h.textContent).toBe('Pessoas');
    expect(c.textContent).toContain('Ana Exemplo');
    expect(c.querySelectorAll('tbody tr').length).toBe(1); // a organização fica em Fornecedores
    expect(c.textContent).not.toContain('Departamento');
    expect(c.textContent).not.toContain('TI');
    expect(apiMock.mock.calls.map(([, u]) => u)).not.toContain('/api/v1/projects/p1/departamentos');
  });

  it('header: "+ Nova pessoa" primário; o menu "Mais" sem "+ Departamento"', async () => {
    const [c, h, a] = montar();
    await window.renderPartes(c, h, a);
    expect([...a.querySelectorAll('.btn-primary')].map((b) => b.textContent.trim())).toEqual(['+ Nova pessoa']);
    expect([...a.querySelectorAll('[role="menuitem"]')].map((b) => b.getAttribute('data-action'))).toEqual(['importarPartes', 'conciliarPartes', 'abrirPadronizarNomes']);
  });

  it('nova pessoa nasce pessoa, sem escolher tipo', async () => {
    montar();
    window.openNovaParteModal('p1');
    expect(document.querySelector('#modal-content select')).toBeNull();
    expect(document.querySelector('.modal-title').textContent).toBe('Nova pessoa');
    document.getElementById('parte-nome').value = 'Bruno Exemplo';
    await window.criarParte('p1');
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/partes', { tipo: 'pessoa', nome: 'Bruno Exemplo', email: null });
  });

  it('Fornecedores abre a nova parte como organização (sem select, tipo guardado)', async () => {
    montar();
    window.openNovaParteModal('p1', 'organizacao');
    document.getElementById('parte-nome').value = 'Fornecedora Exemplo';
    await window.criarParte('p1');
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/partes', { tipo: 'organizacao', nome: 'Fornecedora Exemplo', email: null });
  });

  it('vazio fala de encarregado e de quem trata dados, sem vocabulário ISO', async () => {
    apiMock.mockImplementation(() => Promise.resolve([]));
    const [c, h, a] = montar();
    await window.renderPartes(c, h, a);
    expect(c.textContent).toContain('Nenhuma pessoa cadastrada.');
    expect(c.textContent).not.toContain('partes interessadas');
  });
});
