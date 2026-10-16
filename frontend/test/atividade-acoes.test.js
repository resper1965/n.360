// O menu "Ações" da ficha: as sete ações do legado, habilitadas pelo servidor (com o motivo em texto quando não), conferência e situação.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { navigate } from '../src/router.js';
import { renderAtividade } from '../src/views/atividade.js';
import { limparAutosaves } from '../src/atividade/estado.js';
import { ACOES } from '../src/atividade/contrato.js';
import contratoConferencia from '../../contracts/ropa-abas/conferencia.json';
import situacao409 from '../../contracts/ropa-abas/situacao-409.json';
import { B, FICHA, prepararDom, abrir, el, chamadas, corpoDe, esperar, resposta } from './helpers-atividade.js';

initDelegation();
beforeEach(() => { prepararDom(); navigate.mockClear(); window.render = vi.fn(); window.abrirPedidoAprovacao = vi.fn(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); limparAutosaves(); });

const itens = () => [...document.querySelectorAll('.mais-acoes-lista [role="menuitem"]')];
const rotuloDe = (i) => i.firstChild.textContent;
const item = (rotulo) => itens().find((i) => rotuloDe(i) === rotulo);
const POST_SITUACAO = { [`POST ${B}/situacao`]: { ok: true } };
/** Ficha com as ações pedidas habilitadas. */
const fichaCom = (...ids) => FICHA((f) => { ids.forEach((id) => { f.acoes[id] = { habilitada: true, motivo: null }; }); return f; });
const abrirMenu = () => document.querySelector('.mais-acoes-botao').click();
const digitarEConfirmar = async (texto) => {
  await esperar(() => expect(document.querySelector('[data-confirmar="sim"]')).not.toBeNull());
  document.querySelector('.confirmar-acoes').parentElement.querySelector('input').value = texto;
  document.querySelector('[data-confirmar="sim"]').click();
};

describe('o menu', () => {
  it('é o "Ações" do componente, com as sete ações na ordem do legado, rótulo e apoio do contrato', async () => {
    await abrir(renderAtividade);
    const botao = document.querySelector('.mais-acoes-botao');
    expect(botao.textContent).toBe('Ações');
    expect(botao.classList.contains('btn-primary')).toBe(false);
    expect(itens().map(rotuloDe)).toEqual(ACOES.map(([, rotulo]) => rotulo));
    expect(itens().map(rotuloDe)).toEqual(['Conferir / Aprovar', 'Alterar para "Em revisão"', 'Imprimir atividade', 'Reabrir atividade', 'Reativar atividade', 'Cancelar atividade', 'Excluir atividade']);
    expect(item('Imprimir atividade').querySelector('.mais-acoes-sub').textContent).toBe('Gerar uma versão para impressão.');
  });

  it('Cancelar e Excluir são os últimos, depois do separador, em perigo', async () => {
    await abrir(renderAtividade);
    const lista = document.querySelector('.mais-acoes-lista');
    const sep = lista.querySelector('[role="separator"]');
    expect(sep.nextElementSibling).toBe(item('Cancelar atividade'));
    expect(item('Cancelar atividade').classList.contains('perigo')).toBe(true);
    expect(itens()[itens().length - 1]).toBe(item('Excluir atividade'));
  });

  it('ação desabilitada pelo servidor continua à vista, esmaecida, com o motivo em texto, em title e aria-disabled, e não faz nada', async () => {
    const f = await abrir(renderAtividade);
    const conferir = item('Conferir / Aprovar');
    expect(conferir.getAttribute('aria-disabled')).toBe('true');
    expect(conferir.title).toBe('Há 2 pendências: Tratamento de Dados, Teste de Impacto.');
    expect(conferir.querySelector('.mais-acoes-sub').textContent).toBe('Há 2 pendências: Tratamento de Dados, Teste de Impacto.');
    expect(item('Reabrir atividade').getAttribute('aria-disabled')).toBe('true');
    expect(item('Imprimir atividade').hasAttribute('aria-disabled')).toBe(false);
    abrirMenu();
    conferir.click();
    expect(chamadas(f)).not.toContain(`GET ${B}/conferencia`);
  });
});

describe('Conferir / Aprovar', () => {
  it('com bloqueio: lista cada um com "Ir para a aba", mostra os avisos e NÃO oferece o pedido', async () => {
    await abrir(renderAtividade, { [`GET ${B}/conferencia`]: contratoConferencia }, fichaCom('conferir_aprovar'));
    abrirMenu();
    item('Conferir / Aprovar').click();
    await esperar(() => expect(el('at-bloqueios')).not.toBeNull());
    expect(el('at-bloqueios').textContent).toContain('Tratamento de Dados: 2 etapas pendentes.');
    expect(el('at-avisos').textContent).toContain('Nenhuma medida de segurança registrada.');
    expect(document.querySelector('#modal-content .btn-primary')).toBeNull();
    document.querySelector('#at-bloqueios [data-action="atIrDaConferencia"]').click();
    await esperar(() => expect(document.querySelector('[role="tab"][aria-selected="true"]').id).toBe('at-aba-tratamento'));
    expect(document.getElementById('modal-overlay').classList.contains('open')).toBe(false);
  });

  it('sem bloqueio: o único primário é "Pedir aprovação", que fecha o modal e chama o fluxo existente', async () => {
    await abrir(renderAtividade, { [`GET ${B}/conferencia`]: { pronta: true, bloqueios: [], avisos: [] } }, fichaCom('conferir_aprovar'));
    abrirMenu();
    item('Conferir / Aprovar').click();
    await esperar(() => expect(document.querySelector('#modal-content .btn-primary')).not.toBeNull());
    expect(document.querySelectorAll('#modal-content .btn-primary')).toHaveLength(1);
    expect(document.querySelector('#modal-content .btn-primary').textContent).toBe('Pedir aprovação');
    document.querySelector('#modal-content .btn-primary').click();
    expect(window.abrirPedidoAprovacao).toHaveBeenCalledWith('p9', 'tratamento', 'r1');
    expect(document.getElementById('modal-overlay').classList.contains('open')).toBe(false);
  });
});

describe('situação', () => {
  it('Alterar para "Em revisão" e Reativar: POST direto e recarrega a ficha', async () => {
    const f = await abrir(renderAtividade, POST_SITUACAO, fichaCom('alterar_para_em_revisao', 'reativar'));
    abrirMenu();
    item('Alterar para "Em revisão"').click();
    await esperar(() => expect(corpoDe(f, `POST ${B}/situacao`)).toEqual({ acao: 'enviar_revisao' }));
    await esperar(() => expect(chamadas(f).filter((c) => c === `GET ${B}/ficha`).length).toBe(2));
    abrirMenu();
    item('Reativar atividade').click();
    await esperar(() => expect(corpoDe(f, `POST ${B}/situacao`)).toEqual({ acao: 'reativar' }));
  });

  it.each([['Reabrir atividade', 'reabrir', 'reabrir'], ['Cancelar atividade', 'cancelar', 'cancelar']])('%s pede o motivo (5+ caracteres) e o envia', async (rotulo, acao, id) => {
    const f = await abrir(renderAtividade, POST_SITUACAO, fichaCom(id));
    abrirMenu();
    item(rotulo).click();
    await digitarEConfirmar('abc');
    await esperar(() => expect(document.body.textContent).toContain('Informe o motivo com 5 caracteres ou mais.'));
    expect(chamadas(f)).not.toContain(`POST ${B}/situacao`);
    abrirMenu();
    item(rotulo).click();
    await digitarEConfirmar('Revisão pedida pela direção');
    await esperar(() => expect(corpoDe(f, `POST ${B}/situacao`)).toEqual({ acao, motivo: 'Revisão pedida pela direção' }));
  });

  it('quem desiste do motivo não envia nada', async () => {
    const f = await abrir(renderAtividade, POST_SITUACAO, fichaCom('cancelar'));
    abrirMenu();
    item('Cancelar atividade').click();
    await esperar(() => expect(document.querySelector('[data-confirmar="nao"]')).not.toBeNull());
    document.querySelector('[data-confirmar="nao"]').click();
    await Promise.resolve();
    expect(chamadas(f)).not.toContain(`POST ${B}/situacao`);
  });

  it('erro do servidor (409): o toast mostra a mensagem dele', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u, o = {}) => {
      const k = `${o.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`;
      if (k === `POST ${B}/situacao`) return resposta(situacao409, 409);
      if (k === `GET ${B}/ficha`) return resposta(fichaCom('alterar_para_em_revisao'));
      if (k === `GET ${'/api/v1/projects/p9'}/ropa`) return resposta({ ok: true, records: [] });
      return resposta({ error: 'nada' }, 404);
    }));
    await renderAtividade(el('c'), el('h'), el('a'));
    abrirMenu();
    item('Alterar para "Em revisão"').click();
    await esperar(() => expect(document.body.textContent).toContain('Atividade cancelada: reative para editar'));
  });
});

describe('Imprimir e Excluir', () => {
  it('Imprimir busca o relatório com a sessão e abre como blob', async () => {
    const f = await abrir(renderAtividade, { [`GET ${B}/relatorio`]: { html: 'x' } });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const abrirJanela = vi.spyOn(window, 'open').mockReturnValue({});
    abrirMenu();
    item('Imprimir atividade').click();
    await esperar(() => expect(abrirJanela).toHaveBeenCalledWith('blob:x', '_blank'));
    expect(chamadas(f)).toContain(`GET ${B}/relatorio`);
    expect(f.mock.calls.find(([u]) => u.endsWith('/relatorio'))[1].headers.Authorization).toBe('Bearer tok');
  });

  it('Excluir pede a palavra "excluir"; com outra palavra nada é apagado', async () => {
    const f = await abrir(renderAtividade, { 'DELETE /api/v1/ropa/r1': { ok: true } });
    abrirMenu();
    item('Excluir atividade').click();
    await digitarEConfirmar('talvez');
    await esperar(() => expect(document.body.textContent).toContain('Nada foi excluído'));
    expect(chamadas(f)).not.toContain('DELETE /api/v1/ropa/r1');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('Excluir com a palavra certa apaga (rota de sempre) e volta à lista', async () => {
    const f = await abrir(renderAtividade, { 'DELETE /api/v1/ropa/r1': { ok: true } });
    abrirMenu();
    item('Excluir atividade').click();
    await digitarEConfirmar('Excluir');
    await esperar(() => expect(chamadas(f)).toContain('DELETE /api/v1/ropa/r1'));
    await esperar(() => expect(navigate).toHaveBeenCalledWith('ropa'));
  });
});
