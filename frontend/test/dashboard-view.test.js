// Unidade de `renderDashboard` e `renderComercial` (src/views/dashboard.js). A entrada do n.iso é o painel do projeto
// (views/painel.js, testado em painel-view.test.js); aqui ficam os desvios dela: o onboarding do cliente ainda sem projeto
// (três cartões de fase cujo CTA muda conforme `S.clientAssessmentId`/`S.clientProposalId`), o comercial, que entra na
// tela Comercial, e a própria tela Comercial (o funil que saiu da entrada). Os helpers de UI vêm de ui.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));

import '../src/ui.js';
import '../src/views/dashboard.js';
import { S } from '../src/state.js';

function montaDom() {
  document.body.innerHTML = '<div id="content"></div><h1 id="hdr"></h1><div id="act"></div>';
  return {
    c: document.getElementById('content'),
    h: document.getElementById('hdr'),
    a: document.getElementById('act'),
  };
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation(async (_m, url) => (String(url).includes('ponto-de-partida') ? { cadastro: {} } : []));
  S.user = null;
  S.activeProject = null;
  S.clientAssessmentId = null;
  S.clientProposalId = null;
  S.clientProposalStatus = null;
});

describe('renderDashboard — onboarding do cliente', () => {
  it('define título e ações e mostra "Aguardando Liberação" sem assessment', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'client', comercial_ativo: true }; // sem client_project_id → caminho onboarding
    await window.renderDashboard(c, h, a);
    expect(h.textContent).toBe('Bem-vindo');
    expect(a.innerHTML).not.toContain('Novo Lead'); // funil é do comercial
    expect(c.textContent).toContain('Bem-vindo ao n.iso');
    expect(c.textContent).toContain('Aguardando Liberação');
    // Não chamou API no caminho de onboarding.
    expect(apiMock).not.toHaveBeenCalled();
  });

  // O atalho mandava o id do assessment numa chave que o roteador não lia, e a rota pública exige
  // o token (e devolve 410 depois da venda). O questionário fica só no link público ?assessment=.
  it('assessment liberado: mostra "Em andamento", sem atalho para a tela self-service', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'org_admin', comercial_ativo: true };
    S.clientAssessmentId = 'as-1';
    await window.renderDashboard(c, h, a);
    expect(c.textContent).toContain('Em andamento');
    expect(c.innerHTML).not.toContain('self-service');
  });

  it('marca a fase de assessment como Concluído quando já existe proposta', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'org_user', comercial_ativo: true };
    S.clientAssessmentId = 'as-1';
    S.clientProposalId = 'pr-1';
    S.clientProposalStatus = 'Approved';
    await window.renderDashboard(c, h, a);
    expect(c.textContent).toContain('Concluído');
    // Proposta aprovada → badge "Assinado".
    expect(c.textContent).toContain('Assinado');
  });

  it('proposta em andamento: sem o link do gerador antigo (410), só o aviso de que o comercial envia', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'org_user', comercial_ativo: true };
    S.clientAssessmentId = 'as-1';
    S.clientProposalId = 'pr-1';
    S.clientProposalStatus = 'Draft';
    await window.renderDashboard(c, h, a);
    expect(c.innerHTML).not.toContain('generate-proposal');
    expect(c.textContent).not.toContain('Revisar e Assinar');
    expect(c.textContent).toContain('Proposta enviada pelo comercial');
  });

  // Área comercial desligada (COMERCIAL_ATIVO): nada de levantamento nem proposta; só o aviso de a quem pedir acesso.
  it('área comercial desligada: só o aviso de acesso, sem as fases da contratação', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'client', comercial_ativo: false };
    S.clientAssessmentId = 'as-1';
    await window.renderDashboard(c, h, a);
    expect(c.textContent).toContain('Você ainda não tem acesso a um projeto');
    expect(c.textContent).not.toMatch(/Levantamento|Proposta/);
    expect(apiMock).not.toHaveBeenCalled();
  });
});

describe('renderDashboard — texto da fase 3', () => {
  it('o texto da fase 3 não promete "41 fases" (o número é da trilha, não do cliente)', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'client', comercial_ativo: true };
    await window.renderDashboard(c, h, a);
    expect(c.textContent).not.toContain('41 fases');
    expect(c.textContent).toContain('jornada de adequação');
  });
});

describe('renderDashboard — quem entra onde', () => {
  it('equipe com projeto: o painel do n.iso, nada do funil', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'consultor' };
    window.renderPainel = vi.fn();
    await window.renderDashboard(c, h, a);
    expect(window.renderPainel).toHaveBeenCalledWith(c, h, a, 'iso');
    expect(apiMock).not.toHaveBeenCalled();
    delete window.renderPainel;
  });
  it('comercial: a tela Comercial', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'comercial', comercial_ativo: true };
    window.renderPainel = vi.fn();
    await window.renderDashboard(c, h, a);
    expect(window.renderPainel).not.toHaveBeenCalled();
    expect(h.textContent).toBe('Comercial');
    delete window.renderPainel;
  });
  it('comercial com a área desligada: aviso, sem pedir o funil', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'comercial', comercial_ativo: false };
    await window.renderDashboard(c, h, a);
    expect(c.textContent).toContain('A área comercial está desligada');
    expect(a.innerHTML).not.toContain('Novo Lead');
    expect(apiMock).not.toHaveBeenCalled();
  });
});

describe('renderComercial — o funil, fora da entrada', () => {
  it('comercial: leads, levantamentos e projetos, com "+ Novo Lead"', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'comercial', comercial_ativo: true };
    apiMock
      .mockResolvedValueOnce([{ id: 'l1' }, { id: 'l2' }])
      .mockResolvedValueOnce([{ id: 'a1', client_name: 'ACME', status: 'completed' }])
      .mockResolvedValueOnce([{ id: 'p1', project_name: 'Proj' }]);
    await window.renderComercial(c, h, a);
    expect(apiMock.mock.calls.map((ch) => ch[1])).toEqual(['/api/v1/leads', '/api/v1/assessments', '/api/v1/projects']);
    expect(a.innerHTML).toContain('Novo Lead');
    expect(c.textContent).toContain('Leads Ativos');
    expect(c.textContent).toContain('ACME');
    expect(c.textContent).toContain('Proj');
    expect(c.textContent).not.toContain('Taxa de Conformidade');
    expect(c.innerHTML).not.toMatch(/backdrop-filter|linear-gradient|border-radius:\s*[1-9]|#[0-9a-f]{3,6}\b/i);
  });
  it('consultor: sem leads (área do comercial), sem "+ Novo Lead"', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'consultor' };
    apiMock.mockResolvedValueOnce([{ id: 'a1', client_name: 'ACME', status: 'completed' }]).mockResolvedValueOnce([]);
    await window.renderComercial(c, h, a);
    expect(apiMock.mock.calls.map((ch) => ch[1])).not.toContain('/api/v1/leads');
    expect(c.textContent).not.toContain('Leads Ativos');
    expect(a.innerHTML).not.toContain('Novo Lead');
  });
  it('falha ao montar: estado de erro, não tela quebrada', async () => {
    const { c, h, a } = montaDom();
    S.user = { role: 'admin' };
    const orig = window.renderStatCards;
    window.renderStatCards = () => { throw new Error('boom'); };
    apiMock.mockResolvedValue([]);
    await window.renderComercial(c, h, a);
    expect(c.textContent).toContain('Não foi possível carregar a tela Comercial');
    window.renderStatCards = orig;
  });
});
