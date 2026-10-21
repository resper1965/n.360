// Encarregado indicado no n.privacy que ainda não está no comitê: a linha, o botão que abre o formulário e o corte de papel.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/api.js', () => ({ api: vi.fn(async () => []), API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/monitor.js';

const FORA = [{ parte_id: 'pa1', nome: 'Rita Exemplo', email: 'rita@c.com' }];
const montar = (papel, fora) => {
  S.user = { role: papel, email: 'x@n.com' };
  document.body.innerHTML = window.renderProjectGovernance([], 'p1', fora);
};

beforeEach(() => { document.body.innerHTML = ''; });

describe('encarregados fora do comitê', () => {
  it('mostra a linha com o nome e o botão', () => {
    montar('consultor', FORA);
    expect(document.body.textContent).toContain('Encarregado indicado no n.privacy: Rita Exemplo (rita@c.com)');
    const b = document.querySelector('[data-action="adicionarEncarregadoAoComite"]');
    expect(JSON.parse(b.getAttribute('data-args'))).toEqual(['p1', 'Rita Exemplo', 'rita@c.com']);
  });
  it('sem itens, ou sem permissão de editar, nada aparece', () => {
    montar('consultor', []);
    expect(document.body.textContent).not.toContain('Encarregado indicado no n.privacy');
    montar('client', FORA);
    expect(document.querySelector('[data-action="adicionarEncarregadoAoComite"]')).toBeNull();
  });
  it('o botão abre o formulário com nome, e-mail e cargo DPO', async () => {
    S.user = { role: 'consultor', email: 'x@n.com' };
    const { api } = await import('../src/api.js');
    api.mockResolvedValue([]);
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    await window.adicionarEncarregadoAoComite('p1', 'Rita Exemplo', 'rita@c.com');
    expect(document.getElementById('gov-name').value).toBe('Rita Exemplo');
    expect(document.getElementById('gov-email').value).toBe('rita@c.com');
    expect(document.getElementById('gov-title').value).toBe('DPO');
  });
  it('id de uma edição anterior não vaza: salvar posta sem id', async () => {
    S.user = { role: 'consultor', email: 'x@n.com' };
    const { api } = await import('../src/api.js');
    api.mockResolvedValue([]);
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    window.editingMemberId = 'g-velho';
    await window.adicionarEncarregadoAoComite('p1', 'Rita Exemplo', 'rita@c.com');
    api.mockClear();
    await window.saveGovernanceMember({ preventDefault() {} }, 'p1');
    const post = api.mock.calls.find((c) => c[0] === 'POST');
    expect(post[2].id).toBeUndefined();
    expect(post[2].name).toBe('Rita Exemplo');
  });
  it('abrir o modal zera o id de edição; editar depois de aberto ainda o define', async () => {
    S.user = { role: 'consultor', email: 'x@n.com' };
    const { api } = await import('../src/api.js');
    api.mockResolvedValue([]);
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    window.editingMemberId = 'g-velho';
    await window.openGovernanceModal('p1');
    expect(window.editingMemberId).toBeNull();
    S.currentGovernance = [{ id: 'g1', name: 'Ana', email: 'a@c.com', role_category: 'executivo', job_title: 'CEO', is_primary: 0 }];
    window.editGovernanceMember('g1');
    expect(window.editingMemberId).toBe('g1');
    expect(document.getElementById('gov-name').value).toBe('Ana');
  });
});
