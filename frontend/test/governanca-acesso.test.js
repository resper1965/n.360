// Convite e revogação de stakeholder pela linha da matriz de Governança: quem vê os botões, e que
// eles chamam as rotas certas por data-action (sem handler inline, o CSP não deixaria).
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/api.js', () => ({ api: vi.fn(async () => ({})), API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));

import { S } from '../src/state.js';
import { api } from '../src/api.js';
import '../src/ui.js';
import '../src/views/monitor.js';

const MEMBROS = [
  { id: 'g1', name: 'Ana', email: 'ana@c.com', role_category: 'executivo', job_title: 'CEO', is_primary: 0 },
  { id: 'g2', name: 'Beto', email: null, role_category: 'tech', job_title: 'CTO', is_primary: 0 },
  { id: 'g3', name: 'Cons', email: 'cons@n.com', role_category: 'consultor', job_title: 'Consultor', is_primary: 0 },
  { id: 'g4', name: 'Lia', email: 'lia@c.com', role_category: 'operacoes', job_title: 'CISO', is_primary: 1 },
];
const botoes = (acao) => [...document.querySelectorAll(`[data-action="${acao}"]`)].map((b) => JSON.parse(b.getAttribute('data-args')));
const montar = (papel) => {
  S.user = { role: papel, email: 'x@n.com' };
  document.body.innerHTML = window.renderProjectGovernance(MEMBROS, 'p1');
};

beforeEach(() => { vi.clearAllMocks(); });

describe('botões de acesso na matriz', () => {
  for (const papel of ['platform_admin', 'consultoria_admin', 'consultor', 'org_admin']) {
    it(`${papel}: um par por linha com e-mail, fora a equipe da consultoria`, () => {
      montar(papel);
      expect(botoes('convidarStakeholder')).toEqual([['p1', 'g4'], ['p1', 'g1']]);
      expect(botoes('revogarStakeholder')).toEqual([['p1', 'g4'], ['p1', 'g1']]);
    });
  }
  for (const papel of ['client', 'org_user', 'stakeholder', 'comercial']) {
    it(`${papel}: não vê`, () => {
      montar(papel);
      expect(botoes('convidarStakeholder')).toEqual([]);
      expect(botoes('revogarStakeholder')).toEqual([]);
    });
  }
  it('sem handler inline', () => {
    montar('org_admin');
    expect(document.body.innerHTML).not.toMatch(/\sonclick\s*=/i);
    expect(document.body.textContent).toContain('Convidar para o n.360');
    expect(document.body.textContent).toContain('Revogar acesso');
  });
});

describe('ações', () => {
  it('convidar chama a rota do membro', async () => {
    await window.convidarStakeholder('p1', 'g1');
    expect(api).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/governance/g1/convidar');
  });
  it('revogar pede confirmação e só então chama a rota', async () => {
    window.confirmar = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await window.revogarStakeholder('p1', 'g1');
    expect(api).not.toHaveBeenCalled();
    await window.revogarStakeholder('p1', 'g1');
    expect(api).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/governance/g1/revogar-acesso');
  });
});

describe('aviso quando o e-mail do convite não saiu', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="toast-container"></div>'; });
  const toast = () => document.body.textContent;
  it('emailEnviado:false avisa com clareza e diz como proceder', async () => {
    api.mockResolvedValueOnce({ ok: true, emailEnviado: false });
    await window.convidarStakeholder('p1', 'g1');
    expect(toast()).toContain('NÃO foi enviado');
    expect(toast()).not.toContain('Convite enviado por e-mail');
  });
  it('emailEnviado:true confirma o envio', async () => {
    api.mockResolvedValueOnce({ ok: true, emailEnviado: true });
    await window.convidarStakeholder('p1', 'g1');
    expect(toast()).toContain('Convite enviado por e-mail');
  });
});

describe('governança no n.privacy', () => {
  it('fala de privacidade e do encarregado, não de SGSI; sem âncora, oferece indicar o encarregado', () => {
    history.replaceState(null, '', '/privacy');
    try {
      S.user = { role: 'consultor', email: 'x@n.com' };
      document.body.innerHTML = window.renderProjectGovernance(MEMBROS.filter((m) => !m.is_primary), 'p1');
      const t = document.body.textContent;
      expect(t).toContain('Quem responde pela privacidade deste cliente, por área.');
      expect(t).toContain('Encarregado (DPO) não designado');
      expect(t).not.toContain('Quem responde pelo SGSI');
      expect(t).not.toContain('Líder do SGSI não designado');
      expect(JSON.parse(document.querySelector('[data-action="abrirIndicarEncarregado"]').getAttribute('data-args'))).toEqual(['p1']);
    } finally { history.replaceState(null, '', '/'); }
  });
  it('quem não pode indicar (cliente) não vê o botão "Indicar encarregado"; o aviso fica', () => {
    history.replaceState(null, '', '/privacy');
    try {
      for (const papel of ['org_admin', 'org_user', 'client']) {
        S.user = { role: papel, email: 'x@n.com' };
        document.body.innerHTML = window.renderProjectGovernance(MEMBROS.filter((m) => !m.is_primary), 'p1');
        expect(document.body.textContent, papel).toContain('Encarregado (DPO) não designado');
        expect(document.querySelector('[data-action="abrirIndicarEncarregado"]'), papel).toBeNull();
      }
    } finally { history.replaceState(null, '', '/'); }
  });
  it('fora do n.privacy o texto do SGSI continua', () => {
    S.user = { role: 'consultor', email: 'x@n.com' };
    document.body.innerHTML = window.renderProjectGovernance(MEMBROS.filter((m) => !m.is_primary), 'p1');
    expect(document.body.textContent).toContain('Líder do SGSI não designado');
  });
});
