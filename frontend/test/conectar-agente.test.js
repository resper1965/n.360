// Tela "Agentes" (antes "Conectar agente"; a rota interna segue conectar-agente) (src/views/conectar-agente.js). Três coisas importam:
// (1) a estrutura: endereço do servidor, três passos, UM cliente por vez em abas, e o alcance do agente;
// (2) o que ela afirma bate com o que foi verificado: "Verificado" só no cliente exercitado em produção,
//     e o texto diz que o LOGIN define quem é o agente e o cliente;
// (3) "Copiado" só depois que a área de transferência aceitou.
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/conectar-agente.js';

function monta(role = 'consultor', activeProject = null) {
  S.user = { role, email: 'x@ness.lat' };
  S.activeProject = activeProject;
  document.body.innerHTML = '<div id="content"></div><h1 id="hdr"></h1><div id="act"></div>';
  const c = document.getElementById('content');
  const h = document.getElementById('hdr');
  const a = document.getElementById('act');
  window.renderConectarAgente(c, h, a);
  return { c, h, a };
}

const abas = (c) => [...c.querySelectorAll('[aria-label="Cliente MCP"] [role="tab"]')];
const aba = (c, nome) => abas(c).find((t) => t.textContent.includes(nome));
const painel = (c) => c.querySelector('[role="tabpanel"]');

beforeEach(() => {
  window.showToast = vi.fn();
});

describe('Conectar agente — estrutura', () => {
  it('título, três passos, e o endereço do servidor UMA vez só (dentro do comando)', () => {
    const { c, h } = monta();
    expect(h.textContent).toBe('Agentes');
    expect(c.textContent.split('https://niso.ness.com.br/mcp').length - 1).toBe(1);
    expect(painel(c).textContent).toContain('https://niso.ness.com.br/mcp');
    const passos = [...c.querySelectorAll('ol.ca-passos > li')];
    expect(passos).toHaveLength(3);
    expect(passos[2].textContent).toContain('niso_contexto');
  });

  it('duas colunas: o que se faz à esquerda, o que o agente faz à direita', () => {
    const { c } = monta();
    const main = c.querySelector('.ca > .ca-main');
    const lado = c.querySelector('.ca > aside.ca-lado');
    expect(main.querySelector('[role="tablist"]')).toBeTruthy();
    expect(main.querySelector('ol.ca-passos')).toBeTruthy();
    expect(lado.querySelector('.ca-alcance')).toBeTruthy();
    expect(lado.querySelector('[aria-label="Cliente MCP"]')).toBeNull();
    expect(lado.querySelector('[aria-label="Papel do agente"]')).toBeTruthy();
  });

  it('um cliente por vez, em abas acessíveis: o Claude Code vem selecionado', () => {
    const { c } = monta();
    expect(c.querySelector('[role="tablist"]')).toBeTruthy();
    expect(abas(c).map((t) => t.textContent.replace(/\s+/g, ' ').trim().split(' ')[0])).toEqual(['Claude', 'Cursor', 'Codex', 'Antigravity', 'ChatGPT', 'Claude']);
    const sel = abas(c).filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(sel).toHaveLength(1);
    expect(sel[0].textContent).toContain('Claude Code');
    // tabindex móvel: só a aba selecionada entra na ordem de tabulação
    expect(abas(c).map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1', '-1']);
    expect(painel(c).getAttribute('aria-labelledby')).toBe(sel[0].id);
    expect(abas(c).every((t) => t.getAttribute('aria-controls') === painel(c).id)).toBe(true);
  });

  it('o painel mostra só o trecho do cliente selecionado', () => {
    const { c } = monta();
    expect(painel(c).textContent).toContain('claude mcp add --transport http --scope user n360');
    expect(painel(c).textContent).not.toContain('codex mcp add');
    window.__selecionarCliente('codex');
    expect(aba(c, 'Codex').getAttribute('aria-selected')).toBe('true');
    expect(aba(c, 'Claude Code').getAttribute('aria-selected')).toBe('false');
    expect(painel(c).textContent).toContain('codex mcp add n360 --url https://niso.ness.com.br/mcp');
    expect(painel(c).textContent).toContain('codex mcp login n360');
    expect(painel(c).textContent).not.toContain('claude mcp add');
  });

  it('as setas, Home e End movem a seleção (e dão a volta)', () => {
    const { c } = monta();
    const tecla = (key) => window.__abaTecla(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    tecla('ArrowRight');
    expect(aba(c, 'Cursor').getAttribute('aria-selected')).toBe('true');
    tecla('End');
    expect(aba(c, 'navegador e desktop').getAttribute('aria-selected')).toBe('true');
    tecla('ArrowRight'); // dá a volta
    expect(aba(c, 'Claude Code').getAttribute('aria-selected')).toBe('true');
    tecla('ArrowLeft'); // dá a volta para trás
    expect(aba(c, 'navegador e desktop').getAttribute('aria-selected')).toBe('true');
    tecla('Home');
    expect(aba(c, 'Claude Code').getAttribute('aria-selected')).toBe('true');
  });
});

describe('Conectar agente — instruções que o consultor precisa', () => {
  it('Claude Code: escopo user, instalação do CLI, estado esperado e diagnóstico', () => {
    const { c } = monta();
    const t = painel(c).textContent;
    expect(t).toContain('--scope user');
    expect(t).toContain('irm https://claude.ai/install.ps1 | iex');
    expect(t).toContain('Needs authentication');
    expect(t).toContain('/mcp');
    expect(t).toContain('claude mcp list');
    expect(t).toContain('claude mcp remove n360 -s user');
  });

  it('o passo 2 diz que o login é do consultor, não do agente da sessão', () => {
    const { c } = monta();
    const p2 = c.querySelectorAll('ol.ca-passos > li')[1].textContent;
    expect(p2).toContain('/mcp');
    expect(p2).toMatch(/agente da sessão não o faz/);
  });

  it('os outros clientes não ganham instruções do Claude Code', () => {
    const { c } = monta();
    for (const id of ['cursor', 'codex', 'antigravity', 'chatgpt', 'claude-web']) {
      window.__selecionarCliente(id);
      expect(painel(c).textContent, id).not.toContain('claude mcp');
      expect(painel(c).textContent, id).not.toContain('Needs authentication');
    }
  });
});

describe('Conectar agente — o que a tela afirma', () => {
  it('só o Claude Code é "Verificado"; os outros cinco são "A confirmar"', () => {
    // Em 30/09/2026 só o Claude Code foi exercitado contra a produção.
    const { c } = monta();
    expect(aba(c, 'Claude Code').textContent).toContain('Verificado');
    for (const nome of ['Cursor', 'Codex', 'Antigravity', 'ChatGPT', 'navegador e desktop']) {
      expect(aba(c, nome).textContent, nome).toContain('A confirmar');
      expect(aba(c, nome).textContent, nome).not.toContain('Verificado');
    }
  });

  it('o painel de um cliente "A confirmar" diz que o login ainda não foi visto funcionando', () => {
    const { c } = monta();
    window.__selecionarCliente('cursor');
    expect(painel(c).textContent).toMatch(/ainda não foi confirmado/i);
    window.__selecionarCliente('claude');
    expect(painel(c).textContent).toMatch(/exercitado em produção/i);
  });

  it('cada cliente "A confirmar" diz onde entrar e como conferir a conexão', () => {
    const { c } = monta();
    const esperado = {
      cursor: /Settings > MCP[\s\S]*ferramentas/i,
      codex: /codex mcp list/,
      antigravity: /Authenticate[\s\S]*Sign out/,
    };
    for (const [id, re] of Object.entries(esperado)) {
      window.__selecionarCliente(id);
      expect(painel(c).textContent, id).toMatch(re);
    }
  });

  it('o Antigravity cita o caminho das versões anteriores à 2.0', () => {
    const { c } = monta();
    window.__selecionarCliente('antigravity');
    expect(painel(c).textContent).toContain('~/.gemini/antigravity/mcp_config.json');
  });

  it('diz que o LOGIN define quem é o agente e em qual cliente ele atua', () => {
    const { c } = monta();
    expect(c.textContent).toMatch(/o login define/i);
    expect(c.textContent).toContain('em nome de você');
  });

  it('o alcance tem quatro blocos, e o "sim" é o destacado', () => {
    const { c } = monta();
    const blocos = [...c.querySelectorAll('.ca-alcance > .ca-alc')];
    expect(blocos).toHaveLength(4);
    // as duas plataformas, e o que é da tela e não do agente
    for (const t of ['n.iso', 'n.privacy', 'ropa', 'dpia', 'requisitos', 'pedidos do titular', 'incidentes', 'terceiros', 'atos do cliente', 'o agente decide como o consultor']) expect(c.querySelector('.ca-alcance').textContent.toLowerCase(), t).toContain(t);
    const t = c.querySelector('.ca-alcance').textContent.toLowerCase();
    for (const pede of ['apagar', 'gerar políticas em lote', 'decidir como consultor']) expect(t, pede).toContain(pede);
    for (const nao of ['usuários', 'sso', 'chaves de api', 'webhooks', 'achado de auditoria']) expect(t, nao).toContain(nao);
    const destacado = c.querySelectorAll('.ca-alc-sim');
    expect(destacado).toHaveLength(1);
    expect(destacado[0].textContent).toContain('sim');
  });

  it('sem handler inline nem script inline (o CSP atual os barra)', () => {
    const { c } = monta();
    expect(c.innerHTML).not.toMatch(/\son[a-z]+=/i);
    expect(c.querySelector('script')).toBeNull();
  });
});

describe('Agentes: os dois módulos e os dois clientes novos', () => {
  it('fala do n.360 e dos dois módulos, sem "em breve"', () => {
    const { c } = monta();
    expect(c.textContent).toContain('n.360');
    expect(c.textContent).toContain('n.privacy');
    expect(c.textContent).not.toMatch(/em breve/i);
  });

  it('dois papéis em abas: Consultor vem selecionado; Auditor mostra o alcance de quem só lê e audita', () => {
    const { c } = monta();
    const papeis = [...c.querySelectorAll('[aria-label="Papel do agente"] [role="tab"]')];
    expect(papeis.map((t) => t.textContent)).toEqual(['Consultor', 'Auditor']);
    expect(papeis[0].getAttribute('aria-selected')).toBe('true');
    expect(c.querySelector('.ca-lado h2').textContent).toBe('O que o agente Consultor faz');
    window.__selecionarPapel('auditor');
    expect(c.querySelector('.ca-lado h2').textContent).toBe('O que o agente Auditor faz');
    const painelPapel = c.querySelector('.ca-alcance');
    expect(painelPapel.getAttribute('role')).toBe('tabpanel');
    expect(painelPapel.getAttribute('aria-labelledby')).toBe('papel-auditor');
    const t = painelPapel.textContent.toLowerCase();
    for (const x of ['só este cliente', 'n.iso', 'n.privacy', 'ropa', 'dpia', 'pedidos do titular', 'incidentes', 'terceiros', 'achado de auditoria', 'nota de auditor', 'não grava', 'não apaga', 'não gera política', '9.2', 'consultor e auditor ativos no mesmo cliente']) expect(t, x).toContain(x);
    // trocar de papel não muda o cliente selecionado
    expect(aba(c, 'Claude Code').getAttribute('aria-selected')).toBe('true');
  });

  it('ChatGPT: onde, endereço copiável, login OAuth e como conferir; selo A confirmar', () => {
    const { c } = monta();
    window.__selecionarCliente('chatgpt');
    const t = painel(c).textContent;
    expect(t).toContain('Configurações > Conectores > Avançado > Modo desenvolvedor');
    expect(t).toContain('https://niso.ness.com.br/mcp');
    expect(t).toMatch(/OAuth/);
    expect(t).toMatch(/lista as ferramentas/);
    expect(t).toMatch(/ainda não foi confirmado/i);
    expect(c.textContent.split('https://niso.ness.com.br/mcp').length - 1).toBe(1);
  });

  it('Claude no navegador e no desktop: conector personalizado com o endereço', () => {
    const { c } = monta();
    window.__selecionarCliente('claude-web');
    const t = painel(c).textContent;
    expect(t).toContain('Configurações > Conectores > adicionar conector personalizado');
    expect(t).toContain('https://niso.ness.com.br/mcp');
    expect(t).toMatch(/ainda não foi confirmado/i);
  });
});

describe('Agentes: quem conecta e quem só vê', () => {
  const NOTA = 'Esta conta não conecta agente; use uma conta de consultor';
  it.each(['consultor', 'consultant', 'consultoria_admin'])('%s conecta: sem nota e com botão Copiar', (role) => {
    const { c } = monta(role);
    expect(c.textContent).not.toContain(NOTA);
    expect(c.querySelector('[data-action="__copiarTrecho"]')).toBeTruthy();
  });

  it.each(['platform_admin', 'comercial'])('%s vê o painel com a nota e sem botão de conexão', (role) => {
    const { c } = monta(role);
    expect(c.textContent).toContain(NOTA);
    expect(c.querySelector('[data-action="__copiarTrecho"]')).toBeNull();
    expect(painel(c).textContent).toContain('claude mcp add');
  });

  it('a nota segue depois de trocar de aba', () => {
    const { c } = monta('comercial');
    window.__selecionarCliente('cursor');
    expect(c.textContent).toContain(NOTA);
    expect(c.querySelector('[data-action="__copiarTrecho"]')).toBeNull();
  });
});

describe('Agentes: quem está conectado', () => {
  it.each(['consultor', 'comercial'])('%s não vê o bloco', (role) => {
    const { c } = monta(role, { id: 'p1' });
    expect(c.querySelector('.ca-conectados')).toBeNull();
    expect(c.querySelector('#gov-agentes')).toBeNull();
  });

  it.each(['platform_admin', 'consultoria_admin'])('%s sem projeto ativo: estado vazio com o botão de escolher', (role) => {
    const { c } = monta(role, null);
    const b = c.querySelector('.ca-conectados');
    expect(b.querySelector('.empty-state')).toBeTruthy();
    expect(b.textContent).toContain('Sem projeto ativo');
    expect(b.querySelector('[data-action="openActiveProjectModal"]')).toBeTruthy();
  });

  it.each(['platform_admin', 'consultoria_admin'])('%s com projeto: carrega o cartão da Governança e liga a atualização', (role) => {
    window.carregarAgentesDoProjeto = vi.fn();
    window.agentesAoVivo = vi.fn();
    const { c } = monta(role, { id: 'p1' });
    expect(c.querySelector('.ca-conectados #gov-agentes')).toBeTruthy();
    expect(window.carregarAgentesDoProjeto).toHaveBeenCalledWith('p1');
    expect(window.agentesAoVivo).toHaveBeenCalledWith('p1');
    // trocar de aba não refaz a consulta nem apaga o cartão
    window.__selecionarCliente('codex');
    expect(window.carregarAgentesDoProjeto).toHaveBeenCalledTimes(1);
    expect(c.querySelector('#gov-agentes')).toBeTruthy();
    delete window.carregarAgentesDoProjeto; delete window.agentesAoVivo;
  });
});

describe('Conectar agente — copiar', () => {
  it('"Copiado" só depois que a área de transferência aceitou', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    monta();
    await window.__copiarTrecho('claude');
    expect(writeText).toHaveBeenCalledWith('claude mcp add --transport http --scope user n360 https://niso.ness.com.br/mcp');
    expect(window.showToast).toHaveBeenCalledWith('Copiado');
  });

  it('copia o trecho do cliente que está na aba, não o de outro', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    monta();
    window.__selecionarCliente('codex');
    await window.__copiarTrecho('codex');
    expect(writeText.mock.calls[0][0]).toContain('codex mcp login n360');
  });

  it('se a área de transferência recusar, diz que falhou em vez de mentir', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('negado')) }, configurable: true });
    monta();
    await window.__copiarTrecho('claude');
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast.mock.calls[0][0]).toContain('Não foi possível copiar');
    expect(window.showToast.mock.calls[0][1]).toBe('error');
  });
});
