// Chat de compliance (src/views/ai.js). Cobre: estado sem projeto, estado
// vazio, escape de conteúdo vindo da API, chamadas com os argumentos certos e o ciclo do chat
// (mensagem do usuário, "Pensando...", resposta ou erro).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { apiMock, renderMock } = vi.hoisted(() => ({ apiMock: vi.fn(), renderMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));
vi.mock('../src/router.js', () => ({ render: renderMock, navigate: vi.fn() }));

import '../src/ui.js';
import '../src/views/ai.js';
import { S } from '../src/state.js';

const $ = (id) => document.getElementById(id);
const dom = () => {
  document.body.innerHTML =
    '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div><div id="c"></div><h1 id="h"></h1><div id="a"></div>';
  return [$('c'), $('h'), $('a')];
};

beforeEach(() => {
  apiMock.mockReset();
  renderMock.mockReset();
  S.projects = [];
  S.activeProject = null;
});

describe('renderAIChat', () => {
  it('sem projeto: estado vazio', async () => {
    const [c, h, a] = dom();
    await window.renderAIChat(c, h, a);
    expect(c.textContent).toMatch(/Sem projeto ativo/);
    expect(apiMock).not.toHaveBeenCalled();
  });

  // Não há histórico no servidor (ai_chat_history saiu na 0109) e GET/DELETE /chat/history nunca
  // existiram (404 engolido pelo catch; "Limpar" dava erro).
  it('abre sem chamar a API e sem "Limpar Histórico"', async () => {
    S.activeProject = { id: 'p1' };
    const [c, h, a] = dom();
    await window.renderAIChat(c, h, a);
    expect(apiMock).not.toHaveBeenCalled();
    expect(c.textContent).toMatch(/Faça uma pergunta/);
    expect(a.innerHTML).toBe('');
    expect(window.clearChatHistory).toBeUndefined();
    expect(h.textContent).toBe('Assistente');
    // aviso fixo: sugestão, não parecer; a conversa não fica salva
    expect(c.textContent).toContain('A resposta é sugestão, não parecer jurídico. A conversa não fica salva.');
  });

  it('no n.privacy a cópia é de LGPD, sem ISO', async () => {
    history.replaceState(null, '', '/privacy');
    try {
      S.activeProject = { id: 'p1' };
      const [c, h, a] = dom();
      await window.renderAIChat(c, h, a);
      expect(c.textContent).toContain('Pergunte sobre LGPD, bases legais, prazos do titular ou comunicação de incidente.');
      expect(c.innerHTML).not.toMatch(/ISO|audit/);
    } finally { history.replaceState(null, '', '/'); }
  });

  async function comChat() {
    S.activeProject = { id: 'p1' };
    const [c, h, a] = dom();
    await window.renderAIChat(c, h, a);
    apiMock.mockReset();
  }

  it('mensagem vazia não é enviada', async () => {
    await comChat();
    $('chat-input').value = '   ';
    await window.sendChatMessage('p1');
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('envio: mostra a mensagem escapada, limpa o campo e troca "Pensando..." pela resposta', async () => {
    await comChat();
    apiMock.mockResolvedValue({ reply: 'Resposta A.5.1' });
    $('chat-input').value = ' o que é <b id="m">A.5</b>? ';
    const p = window.sendChatMessage('p1');
    expect($('chat-loading').textContent).toBe('Pensando...');
    expect($('chat-input').value).toBe('');
    await p;
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/chat', { message: 'o que é <b id="m">A.5</b>?' });
    expect($('m')).toBeNull();
    expect($('chat-loading')).toBeNull();
    expect($('chat-messages').lastElementChild.textContent).toBe('Resposta A.5.1');
  });

  it('no /iso o envio leva modulo: iso', async () => {
    await comChat();
    window.history.pushState({}, '', '/iso/chat');
    apiMock.mockResolvedValue({ reply: 'ok' });
    $('chat-input').value = 'oi';
    await window.sendChatMessage('p1');
    window.history.pushState({}, '', '/');
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/chat', { message: 'oi', modulo: 'iso' });
  });

  it('no n.privacy o envio leva modulo: privacy', async () => {
    await comChat();
    window.history.pushState({}, '', '/privacy/chat');
    apiMock.mockResolvedValue({ reply: 'ok' });
    $('chat-input').value = 'oi';
    await window.sendChatMessage('p1');
    window.history.pushState({}, '', '/');
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/chat', { message: 'oi', modulo: 'privacy' });
  });

  it('resposta sem reply: "Sem resposta."', async () => {
    await comChat();
    apiMock.mockResolvedValue({});
    $('chat-input').value = 'oi';
    await window.sendChatMessage('p1');
    expect($('chat-messages').lastElementChild.textContent).toBe('Sem resposta.');
  });

  it('erro: mostra "Erro: ..." no lugar do carregando', async () => {
    await comChat();
    apiMock.mockRejectedValue(new Error('timeout'));
    $('chat-input').value = 'oi';
    await window.sendChatMessage('p1');
    expect($('chat-loading').textContent).toBe('Erro: timeout');
  });
});

describe('perguntas sugeridas com a conversa vazia', () => {
  const sugestoes = (c) => [...c.querySelectorAll('[data-action="perguntarSugestao"]')];
  const textos = (c) => sugestoes(c).map((b) => b.textContent);
  const PRIVACY = ['Qual base legal cabe para este tratamento?', 'Quando a DPIA (RIPD) é exigida?',
    'Quais são os prazos para responder ao titular?', 'O que a comunicação de incidente à ANPD precisa conter?'];
  const ISO = ['Por onde começar a implantação da ISO 27001?', 'Quais controles do Anexo A costumam ser excluídos?',
    'Como preparar a auditoria interna?', 'O que a análise crítica pela direção (9.3) precisa cobrir?'];
  const em = async (caminho, proj) => {
    history.replaceState(null, '', caminho);
    S.user = { role: 'consultor' };
    S.activeProject = proj;
    const [c, h, a] = dom();
    await window.renderAIChat(c, h, a);
    return c;
  };
  afterEach(() => history.replaceState(null, '', '/'));

  it('n.privacy e n.iso: quatro de cada módulo, e o aviso continua', async () => {
    expect(textos(await em('/privacy', { id: 'p1', modulos: ['privacy'] }))).toEqual(PRIVACY);
    const c = await em('/iso', { id: 'p1', modulos: ['iso', 'privacy'] });
    expect(textos(c)).toEqual(ISO);
    expect(c.textContent).toContain('A resposta é sugestão, não parecer jurídico.');
  });

  it('n.360: as da ISO, salvo projeto só com n.privacy', async () => {
    expect(textos(await em('/', { id: 'p1', modulos: ['iso', 'privacy'] }))).toEqual(ISO);
    expect(textos(await em('/', { id: 'p1', modulos: ['privacy'] }))).toEqual(PRIVACY);
  });

  it('clicar envia a pergunta pelo mesmo caminho e as sugestões saem', async () => {
    const c = await em('/iso', { id: 'p1', modulos: ['iso'] });
    apiMock.mockResolvedValue({ reply: 'ok' });
    const b = sugestoes(c)[2];
    await window.perguntarSugestao(...JSON.parse(b.getAttribute('data-args')));
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/chat', { message: 'Como preparar a auditoria interna?', modulo: 'iso' });
    expect(sugestoes(c)).toEqual([]);
    expect($('chat-messages').textContent).toContain('Como preparar a auditoria interna?');
  });
});
