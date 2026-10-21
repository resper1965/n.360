// A casca da ficha em abas: faixa de nove abas (WAI-ARIA, ativação automática), painel, cabeçalho e estados. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { renderAtividade } from '../src/views/atividade.js';
import { ABAS } from '../src/atividade/contrato.js';
import { limparAutosaves } from '../src/atividade/estado.js';
import { servir, resposta, B, FICHA, prepararDom, abrir, el, chamadas, esperar } from './helpers-atividade.js';

initDelegation();
beforeEach(() => { prepararDom(); window.render = vi.fn(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); limparAutosaves(); });

const abas = () => [...el('c').querySelectorAll('[role="tab"]')];
const ativa = () => abas().find((t) => t.getAttribute('aria-selected') === 'true');
const tecla = (alvo, key) => alvo.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

describe('faixa de abas', () => {
  it('tem as 9 abas, com os rótulos do legado e na ordem, numeradas de 1 a 8; Logs ROPA sem número', async () => {
    await abrir(renderAtividade);
    const nomes = abas().map((t) => t.querySelector('.at-aba-nome').textContent);
    expect(nomes.map((n) => n.replace(/^\d+\. /, ''))).toEqual(ABAS.map((a) => a.rotulo));
    expect(nomes).toEqual(['1. Escopo', '2. Tratamento de Dados', '3. Agentes de Tratamento', '4. Medidas de Segurança',
      '5. Base Jurídica', '6. Controle de GAPs', '7. Teste de Impacto', '8. Riscos', 'Logs ROPA']);
  });

  it('Logs ROPA é histórico: sem feito/pendente no rótulo nem no nome acessível', async () => {
    await abrir(renderAtividade);
    const logs = el('at-aba-logs');
    expect(logs.getAttribute('aria-label')).toBe('Logs ROPA, histórico');
    expect(logs.dataset.estado).toBe('historico');
    expect(logs.querySelector('.at-aba-estado').textContent).toBe('histórico');
  });

  it('aria-selected e tabindex 0 só na aba ativa', async () => {
    await abrir(renderAtividade);
    expect(abas().filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.id)).toEqual(['at-aba-escopo']);
    expect(abas().filter((t) => t.tabIndex === 0).map((t) => t.id)).toEqual(['at-aba-escopo']);
  });

  it('o estado vai escrito no rótulo e no aria-label, e em data-estado', async () => {
    await abrir(renderAtividade);
    const por = Object.fromEntries(abas().map((t) => [t.id, t]));
    expect(por['at-aba-medidas'].getAttribute('aria-label')).toBe('4. Medidas de Segurança, vazio');
    expect(por['at-aba-impacto'].getAttribute('aria-label')).toBe('7. Teste de Impacto, pendente');
    expect(por['at-aba-medidas'].dataset.estado).toBe('vazio');
    expect(por['at-aba-medidas'].querySelector('.at-aba-estado').textContent).toBe('vazio');
    expect(por['at-aba-escopo'].querySelector('.at-aba-estado').textContent).toBe('feito');
    expect(por['at-aba-impacto'].title).toBe('9 de 14 respondidas.');
  });

  it('seta direita e esquerda movem o foco E ativam; Home, End e a volta da última para a primeira', async () => {
    await abrir(renderAtividade);
    tecla(ativa(), 'ArrowRight');
    await esperar(() => expect(ativa().id).toBe('at-aba-tratamento'));
    expect(document.activeElement.id).toBe('at-aba-tratamento');
    tecla(ativa(), 'ArrowLeft');
    await esperar(() => expect(ativa().id).toBe('at-aba-escopo'));
    tecla(ativa(), 'End');
    await esperar(() => expect(ativa().id).toBe('at-aba-logs'));
    tecla(ativa(), 'ArrowRight');
    await esperar(() => expect(ativa().id).toBe('at-aba-escopo'));
    tecla(ativa(), 'ArrowLeft');
    await esperar(() => expect(ativa().id).toBe('at-aba-logs'));
    tecla(ativa(), 'Home');
    await esperar(() => expect(ativa().id).toBe('at-aba-escopo'));
    expect(document.activeElement.id).toBe('at-aba-escopo');
  });

  it('tecla que não é de navegação não faz nada', async () => {
    const f = await abrir(renderAtividade);
    const antes = f.mock.calls.length;
    tecla(ativa(), 'a');
    await Promise.resolve();
    expect(f.mock.calls.length).toBe(antes);
  });

  it('?aba=riscos abre a aba Riscos; trocar de aba atualiza o endereço sem empilhar histórico', async () => {
    window.history.replaceState(null, '', '/?tela=ropa-atividade&aba=riscos');
    await abrir(renderAtividade);
    expect(ativa().id).toBe('at-aba-riscos');
    expect(el('c').querySelector('h2').textContent).toBe('Riscos');
    const antes = window.history.length;
    el('at-aba-agentes').click();
    await esperar(() => expect(ativa().id).toBe('at-aba-agentes'));
    expect(new URLSearchParams(window.location.search).get('aba')).toBe('agentes');
    expect(new URLSearchParams(window.location.search).get('tela')).toBe('ropa-atividade');
    expect(window.history.length).toBe(antes);
  });

  it('?aba= inválida cai em Escopo', async () => {
    window.history.replaceState(null, '', '/?aba=xx');
    await abrir(renderAtividade);
    expect(ativa().id).toBe('at-aba-escopo');
  });
});

describe('progresso (onde estou)', () => {
  const progresso = () => el('c').querySelector('.at-progresso');

  it('conta as 6 partes feitas (não se aplica conta; Logs, Gaps e Riscos ficam fora) e aponta a primeira pendente ou vazia', async () => {
    await abrir(renderAtividade);
    expect(progresso().textContent.replace(/\s+/g, ' ').trim()).toContain('2 de 6 partes concluídas · Próximo: Tratamento de Dados');
    const ir = progresso().querySelector('[data-action="atIrParaPendencia"]');
    expect(ir.textContent).toBe('Ir para a próxima pendência');
    expect(ir.classList.contains('btn-primary')).toBe(false);
    expect(ir.dataset.aba).toBe('tratamento');
  });

  it('Logs, Gaps e Riscos pendentes não contam nem viram a próxima; "não se aplica" conta como concluída', async () => {
    await abrir(renderAtividade, {}, FICHA((f) => {
      Object.keys(f.abas).forEach((k) => { f.abas[k].estado = 'feito'; });
      f.abas.medidas.estado = 'na'; f.abas.impacto.estado = 'vazio';
      f.abas.gaps.estado = 'pendente'; f.abas.riscos.estado = 'vazio'; f.abas.logs.estado = 'pendente';
      return f;
    }));
    expect(progresso().textContent).toContain('5 de 6 partes concluídas');
    expect(progresso().textContent).toContain('Próximo: Teste de Impacto');
    expect(progresso().querySelector('[data-action="atIrParaPendencia"]').dataset.aba).toBe('impacto');
    expect(el('c').querySelector('#at-aba-riscos').dataset.estado).toBe('vazio');
  });

  it('as 6 feitas (Gaps e Riscos vazios): "Todas as 6 partes concluídas" e o próximo passo é a aprovação, sem botão', async () => {
    await abrir(renderAtividade, {}, FICHA((f) => {
      Object.keys(f.abas).forEach((k) => { f.abas[k].estado = 'feito'; });
      f.abas.gaps.estado = 'vazio'; f.abas.riscos.estado = 'vazio';
      return f;
    }));
    expect(progresso().textContent).toContain('Todas as 6 partes concluídas');
    expect(progresso().textContent).toContain('Próximo: enviar para aprovação no menu Ações');
    expect(progresso().querySelector('button')).toBeNull();
  });

  it('progresso e abas ficam juntos na faixa que gruda (.at-nav), antes do painel', async () => {
    await abrir(renderAtividade);
    const nav = el('c').querySelector('.at-nav');
    expect(nav.querySelector('.at-progresso')).not.toBeNull();
    expect(nav.querySelector('[role="tablist"]')).not.toBeNull();
    expect(nav.contains(el('at-painel'))).toBe(false);
  });
});

describe('painel e hierarquia', () => {
  it('o painel é tabpanel e aponta para a aba ativa', async () => {
    await abrir(renderAtividade);
    const painel = el('at-painel');
    expect(painel.getAttribute('role')).toBe('tabpanel');
    expect(painel.getAttribute('aria-labelledby')).toBe(ativa().id);
    expect(ativa().getAttribute('aria-controls')).toBe('at-painel');
  });

  it('um só h1 (o nome da atividade), um h2 (a aba) e nenhum botão primário na casca', async () => {
    await abrir(renderAtividade);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(el('h').textContent).toBe('Desligamento de colaborador (exemplo)');
    expect(el('c').querySelectorAll('h2')).toHaveLength(1);
    expect(el('c').querySelector('h2').textContent).toBe('Escopo');
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(0);
  });

  it('nome da atividade escapado', async () => {
    await abrir(renderAtividade, {}, FICHA((f) => { f.registro.nome = '<img src=x onerror=alert(1)>'; return f; }));
    expect(el('c').querySelector('img')).toBeNull();
    expect(el('h').textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('estados', () => {
  it('atividade inexistente: estado vazio com "Voltar aos tratamentos"', async () => {
    servir({});
    await renderAtividade(el('c'), el('h'), el('a'));
    expect(el('c').textContent).toContain('Atividade não encontrada');
    expect(el('c').textContent).toContain('Voltar aos tratamentos');
  });

  it('sem atividade escolhida: estado vazio', async () => {
    S.atividade = null;
    servir({});
    await renderAtividade(el('c'), el('h'), el('a'));
    expect(el('c').textContent).toContain('Nenhuma atividade aberta');
  });

  it('erro de carga: mensagem de falha, nunca o estado vazio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta({ error: 'Falha interna' }, 500)));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await renderAtividade(el('c'), el('h'), el('a'));
    expect(el('c').textContent).toContain('Não foi possível carregar a atividade.');
    expect(el('c').textContent).not.toContain('Atividade não encontrada');
  });

  it('trocar de aba grava antes o que estava pendente (esvaziar) e só então remonta', async () => {
    const f = await abrir(renderAtividade, { [`PUT ${B}/escopo`]: { ok: true, mudou_hash: false } });
    const volume = el('at-volume');
    volume.value = '500 por mês';
    volume.dispatchEvent(new Event('input', { bubbles: true }));
    el('at-aba-agentes').click();
    await esperar(() => expect(ativa().id).toBe('at-aba-agentes'));
    const c = chamadas(f);
    expect(c).toContain(`PUT ${B}/escopo`);
    expect(c.indexOf(`PUT ${B}/escopo`)).toBeLessThan(c.lastIndexOf(`GET ${B}/ficha`));
  });

  it('atividade cancelada: faixa em role=status e as abas montam em leitura', async () => {
    await abrir(renderAtividade, {}, FICHA((f) => { f.situacao = { codigo: 'cancelada', rotulo: 'Cancelada', aprovacao_desatualizada: false, em_nova_revisao: false }; return f; }));
    const faixa = el('c').querySelector('.at-faixa-cancelada');
    expect(faixa.getAttribute('role')).toBe('status');
    expect(faixa.textContent).toBe('Atividade cancelada. Reative para editar.');
    expect(el('at-finalidade').disabled).toBe(true);
    expect(el('at-volume').disabled).toBe(true);
  });

  it('aba do pacote D que ainda não foi integrada mostra o aviso, não quebra', async () => {
    window.history.replaceState(null, '', '/?aba=impacto');
    await abrir(renderAtividade);
    expect(ativa().id).toBe('at-aba-impacto');
    expect(el('at-corpo').textContent.length).toBeGreaterThan(0);
  });
});

describe('abrir a atividade numa aba (listas do n.privacy)', () => {
  it('abrirAtividade(projeto, atividade, aba) grava a aba no endereço; sem aba, ou aba desconhecida, limpa', () => {
    history.replaceState(null, '', '/privacy?aba=logs');
    window.abrirAtividade('p1', 'r1', 'gaps');
    expect(new URLSearchParams(window.location.search).get('aba')).toBe('gaps');
    expect(S.atividade).toEqual({ projectId: 'p1', ropaId: 'r1' });
    window.abrirAtividade('p1', 'r1', 'inexistente');
    expect(new URLSearchParams(window.location.search).has('aba')).toBe(false);
    history.replaceState(null, '', '/privacy?aba=logs');
    window.abrirAtividade('p1', 'r1');
    expect(new URLSearchParams(window.location.search).has('aba')).toBe(false);
  });
});
