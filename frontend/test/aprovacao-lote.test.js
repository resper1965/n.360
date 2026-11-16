// Aprovação em lote em "Meus pedidos": a caixa só libera depois de abrir o pedido; o envio leva a senha uma vez e o hash visto.
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/api.js';
import '../src/views/meus-pedidos.js';
import '../src/views/aprovacao-lote.js';
import { initDelegation } from '../src/delegation.js';

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const el = (id) => document.getElementById(id);
const pedido = (id, extra = {}) => ({
  id, tipo: 'documento', titulo: `Documento <b>${id}</b>`, papel_exigido: 'ciente', status: 'aberto', meu_status: 'pendente',
  hash: id.padEnd(64, 'a'), criado_por: 'cons@ness.lat', criado_em: '2026-10-04T10:00:00Z', conteudo: { titulo: 'x', texto: 'y' }, ...extra,
});
let fetchMock;

beforeEach(() => {
  document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
  initDelegation();
  window.showToast = vi.fn();
  window.render = vi.fn();
  window.invalidarInicio = vi.fn();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

const lista = async (pedidos) => {
  fetchMock.mockResolvedValueOnce(json({ pedidos }));
  await window.renderMeusPedidos(el('c'), el('h'), el('a'));
};
const abrir = async (p) => {
  fetchMock.mockResolvedValueOnce(json({ pedido: p, destinatario: { status: 'pendente' } }));
  await window.abrirPedido(p.id);
};
const caixa = (id) => el('c').querySelector(`input[data-pl="${id}"]`);

describe('seleção', () => {
  it('só pedido que aguarda a pessoa tem caixa, e ela vem desabilitada até o pedido ser aberto', async () => {
    await lista([pedido('p1'), pedido('p2'), pedido('p3', { meu_status: 'ciente' })]);
    expect(caixa('p1').disabled).toBe(true);
    expect(caixa('p3')).toBeNull();
    expect(el('a').querySelector('[data-action="abrirLoteAprovacao"]')).toBeNull(); // nada visto: sem botão
    await abrir(pedido('p1'));
    expect(caixa('p1').disabled).toBe(false);
    expect(caixa('p2').disabled).toBe(true);
    expect(el('a').querySelector('[data-action="abrirLoteAprovacao"]').textContent).toContain('Aprovar selecionados');
  });

  it('o botão mostra quantas estão marcadas', async () => {
    await lista([pedido('p1'), pedido('p2')]);
    await abrir(pedido('p1'));
    await abrir(pedido('p2'));
    caixa('p1').checked = true;
    caixa('p2').checked = true;
    caixa('p2').dispatchEvent(new Event('change', { bubbles: true }));
    expect(el('a').querySelector('[data-action="abrirLoteAprovacao"]').textContent).toContain('(2)');
  });
});

describe('enviar', () => {
  it('manda a senha uma vez, com o hash que a pessoa viu de cada pedido, e mostra o resultado por item', async () => {
    await lista([pedido('p1'), pedido('p2')]);
    await abrir(pedido('p1'));
    await abrir(pedido('p2'));
    caixa('p1').checked = true;
    caixa('p2').checked = true;
    await window.abrirLoteAprovacao();
    expect(el('modal-content').textContent).toContain('Você vai dar ciência de 2');
    el('lote-senha').value = 'minha-senha';
    fetchMock.mockResolvedValueOnce(json({ ok: true, aprovados: 1, resultados: [
      { tipo: 'pedido', id: 'p1', resultado: 'aprovado' },
      { tipo: 'pedido', id: 'p2', resultado: 'ignorado', motivo: 'O conteúdo mudou desde que você abriu; recarregue e revise de novo' },
    ] }));
    await window.enviarLoteAprovacao();
    const [url, init] = fetchMock.mock.calls.at(-1);
    expect(new URL(url, 'http://x').pathname).toBe('/api/v1/pedidos/lote');
    expect(JSON.parse(init.body)).toEqual({
      senha: 'minha-senha',
      itens: [{ tipo: 'pedido', id: 'p1', hash_visto: 'p1'.padEnd(64, 'a') }, { tipo: 'pedido', id: 'p2', hash_visto: 'p2'.padEnd(64, 'a') }],
    });
    expect(el('modal-content').textContent).toContain('1 de 2 decisões registradas');
    expect(el('modal-content').textContent).toContain('O conteúdo mudou');
    expect(el('lote-senha')).toBeNull(); // a senha não fica no DOM depois de enviada
    expect(window.invalidarInicio).toHaveBeenCalledTimes(1); // o Início não mostra mais o que foi decidido
  });

  it('senha errada: mostra o erro e mantém o modal para tentar de novo', async () => {
    await lista([pedido('p1')]);
    await abrir(pedido('p1'));
    caixa('p1').checked = true;
    await window.abrirLoteAprovacao();
    el('lote-senha').value = 'errada';
    fetchMock.mockResolvedValueOnce(json({ error: 'Senha incorreta' }, 401));
    await window.enviarLoteAprovacao();
    expect(el('lote-erro').textContent).toContain('Senha incorreta');
    expect(el('lote-senha')).not.toBeNull();
  });

  it('sem senha ou sem seleção não chama o servidor', async () => {
    await lista([pedido('p1')]);
    await window.abrirLoteAprovacao();
    expect(el('lote-senha')).toBeNull(); // nada marcado: o modal nem abre
    await abrir(pedido('p1'));
    caixa('p1').checked = true;
    await window.abrirLoteAprovacao();
    el('lote-senha').value = '';
    const antes = fetchMock.mock.calls.length;
    await window.enviarLoteAprovacao();
    expect(fetchMock.mock.calls.length).toBe(antes);
    expect(el('lote-erro').textContent).toContain('Informe a sua senha');
  });
});

describe('o que será assinado (onda 1 do diagnóstico)', () => {
  const aprov = (id, extra = {}) => pedido(id, { tipo: 'tratamento', papel_exigido: 'ciso', project_id: 'pj1', ...extra });
  const marcarTodos = async (ps) => {
    await lista(ps);
    for (const p of ps) { await abrir(p); caixa(p.id).checked = true; }
    caixa(ps[0].id).dispatchEvent(new Event('change', { bubbles: true }));
  };
  beforeEach(() => { S.projects = [{ id: 'pj1', client_name: 'Exemplo <i>Log</i>' }]; });

  it('a caixa desabilitada diz o motivo em texto visível, que some ao abrir o pedido', async () => {
    await lista([pedido('p1')]);
    const motivo = el('c').querySelector('#' + caixa('p1').getAttribute('aria-describedby'));
    expect(motivo.textContent).toBe('Abra o pedido para marcar');
    await abrir(pedido('p1'));
    expect(el('c').textContent).not.toContain('Abra o pedido para marcar');
  });

  it('lote misto: lista cada item (tipo, título, projeto) separado em Aprovar e Dar ciência; botão e resumo dizem os dois', async () => {
    await marcarTodos([aprov('a1'), aprov('a2', { papel_exigido: 'ceo', tipo: 'dpia' }), pedido('c1', { project_id: 'pj1' })]);
    expect(el('a').querySelector('[data-action="abrirLoteAprovacao"]').textContent).toBe('Aprovar e dar ciência (3)');
    await window.abrirLoteAprovacao();
    const m = el('modal-content');
    expect(m.querySelector('[data-action="enviarLoteAprovacao"]').textContent).toBe('Aprovar 2 e dar ciência de 1');
    expect(m.textContent).toContain('Você vai aprovar 2 e dar ciência de 1');
    const aprovar = m.querySelector('#lote-aprovar');
    const ciencia = m.querySelector('#lote-ciencia');
    expect([...aprovar.querySelectorAll('li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      'Atividade de tratamento: Documento <b>a1</b> Exemplo <i>Log</i> · como Líder SGSI / DPO',
      'RIPD (DPIA): Documento <b>a2</b> Exemplo <i>Log</i> · como Direção Executiva',
    ]);
    expect(ciencia.querySelectorAll('li')).toHaveLength(1);
    expect(ciencia.textContent).toContain('Documento: Documento <b>c1</b>');
    expect(m.querySelector('li b, li i')).toBeNull();
    // o que cada decisão significa, em texto
    expect(m.textContent).toContain('Aprovar registra');
    expect(m.textContent).toContain('Dar ciência registra');
  });

  it('só ciência: título e botão não falam em aprovar', async () => {
    await marcarTodos([pedido('c1'), pedido('c2')]);
    await window.abrirLoteAprovacao();
    const m = el('modal-content');
    expect(m.querySelector('h3').textContent).toBe('Dar ciência dos selecionados');
    expect(m.querySelector('[data-action="enviarLoteAprovacao"]').textContent).toBe('Dar ciência de 2');
    expect(m.querySelector('#lote-aprovar')).toBeNull();
  });

  it('resultado: o que foi decidido e o que ficou de fora, com o botão para abrir o que ficou', async () => {
    await marcarTodos([aprov('a1'), pedido('c1')]);
    await window.abrirLoteAprovacao();
    el('lote-senha').value = 'x';
    fetchMock.mockResolvedValueOnce(json({ ok: true, aprovados: 1, resultados: [
      { tipo: 'pedido', id: 'a1', resultado: 'ignorado', motivo: 'O conteúdo mudou' },
      { tipo: 'pedido', id: 'c1', resultado: 'aprovado' },
    ] }));
    await window.enviarLoteAprovacao();
    const m = el('modal-content');
    expect(m.querySelector('#lote-feitos').textContent).toContain('Ciência registrada');
    expect(m.querySelector('#lote-feitos').textContent).toContain('Documento <b>c1</b>');
    const fora = m.querySelector('#lote-fora');
    expect(fora.textContent).toContain('O conteúdo mudou');
    const reabrir = fora.querySelector('[data-action="abrirPedido"]');
    expect(reabrir.textContent).toBe('Abrir o pedido');
    expect(JSON.parse(reabrir.getAttribute('data-args'))).toEqual(['a1']);
  });
});
