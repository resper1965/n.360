// Aba Agentes de Tratamento: papéis, transferência internacional e operadores/destinatários. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import '../src/views/tratamento-ligacoes.js';
import { renderAtividade } from '../src/views/atividade.js';
import { limparAutosaves } from '../src/atividade/estado.js';
import { P, B, REGISTRO, FICHA, prepararDom, abrir, el, chamadas, corpoDe, esperar } from './helpers-atividade.js';

initDelegation();
beforeEach(() => { prepararDom(); window.render = vi.fn(); window.history.replaceState(null, '', '/?aba=agentes'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); limparAutosaves(); });

const LIG = (extra = {}) => ({ transferencias: [], partes: [], ...extra });
const PUT_AGENTES = { [`PUT ${B}/agentes`]: { ok: true, mudou_hash: false } };
const base = (extra = {}, registro = REGISTRO()) => ({ [`GET ${B}/ligacoes`]: LIG(), [`GET ${P}/partes`]: [], [`GET ${P}/ropa`]: { ok: true, records: [registro] }, ...PUT_AGENTES, ...extra });

describe('papéis', () => {
  it('Controlador e Operador são duas caixas de marcar num grupo com nome; cada clique grava na hora', async () => {
    const f = await abrir(renderAtividade, base());
    const grupo = el('c').querySelector('[role="group"]');
    expect(grupo.getAttribute('aria-labelledby')).toBe('at-papeis-t');
    expect(el('at-papeis-t').textContent).toBe('Responsabilidade pelo tratamento');
    expect(el('at-controlador').checked).toBe(true);
    expect(el('at-operador').checked).toBe(false);
    expect(el('at-operador').labels[0].textContent).toBe('Operador dos Dados');
    el('at-operador').click();
    await esperar(() => expect(corpoDe(f, `PUT ${B}/agentes`)).toEqual({ papel_operador: true }));
    el('at-controlador').click();
    await esperar(() => expect(corpoDe(f, `PUT ${B}/agentes`)).toEqual({ papel_controlador: false }));
    await esperar(() => expect(el('at-salvo').textContent).toMatch(/^Salvo às/));
  });
});

describe('transferência internacional', () => {
  it('"Não": sem bloco de transferências; "Sim" mostra salvaguarda e lista e grava', async () => {
    const f = await abrir(renderAtividade, base());
    expect(el('at-transf')).toBeNull();
    document.querySelector('input[name="at-intl"][value="1"]').click();
    await esperar(() => expect(corpoDe(f, `PUT ${B}/agentes`)).toEqual({ international_transfers: true }));
    await esperar(() => expect(el('at-transf')).not.toBeNull());
    expect(el('at-transf').textContent).toContain('Nenhuma transferência registrada');
    expect(el('tl-pais')).not.toBeNull();
    expect(el('c').querySelector('[data-action="adicionarTransferenciaTratamento"]').textContent).toBe('Adicionar transferência');
  });

  it('com "Sim": lista as transferências existentes e "Remover" pede confirmação antes de chamar a rota de sempre', async () => {
    const f = await abrir(renderAtividade, base({
      [`GET ${B}/ligacoes`]: LIG({ transferencias: [{ id: 't1', pais: 'País exemplo', destinatario: 'Empresa exemplo', mecanismo: 'Cláusulas padrão' }] }),
      [`DELETE ${B}/transferencias/t1`]: { ok: true },
    }, REGISTRO({ international_transfers: 1, transfer_safeguards: 'Cláusulas contratuais padrão.' })));
    expect(el('at-transf-lista').textContent).toContain('País exemplo, Empresa exemplo, Cláusulas padrão');
    expect(el('at-salvaguarda').value).toBe('Cláusulas contratuais padrão.');
    el('c').querySelector('[data-action="atRemoverTransferencia"]').click();
    await esperar(() => expect(document.querySelector('[data-confirmar="sim"]')).not.toBeNull());
    expect(chamadas(f)).not.toContain(`DELETE ${B}/transferencias/t1`);
    document.querySelector('[data-confirmar="sim"]').click();
    await esperar(() => expect(chamadas(f)).toContain(`DELETE ${B}/transferencias/t1`));
  });

  it('salvaguarda grava sozinha (autosave) em /agentes', async () => {
    const f = await abrir(renderAtividade, base({}, REGISTRO({ international_transfers: 1 })));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    el('at-salvaguarda').value = 'Cláusulas padrão';
    el('at-salvaguarda').dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(801);
    vi.useRealTimers();
    await esperar(() => expect(corpoDe(f, `PUT ${B}/agentes`)).toEqual({ transfer_safeguards: 'Cláusulas padrão' }));
  });

  it('"Não" com transferências gravadas: não apaga, diz quantas há', async () => {
    await abrir(renderAtividade, base({ [`GET ${B}/ligacoes`]: LIG({ transferencias: [{ id: 't1', pais: 'País exemplo' }, { id: 't2', pais: 'Outro país' }] }) }));
    expect(el('at-transf-gravadas').textContent).toContain('Há 2 transferências registradas');
    expect(el('at-transf')).toBeNull();
  });
});

describe('operadores e destinatários', () => {
  it('lista as partes ligadas com o papel e remove pela função de sempre', async () => {
    await abrir(renderAtividade, base({ [`GET ${B}/ligacoes`]: LIG({ partes: [{ nome: 'Empresa exemplo', papel: 'operador', parte_id: 'pa1', vinculo_id: 'v1' }] }) }));
    expect(el('at-partes-lista').textContent).toContain('Empresa exemplo, Operador');
    const botao = el('at-partes-lista').querySelector('button');
    expect(JSON.parse(botao.dataset.args)).toEqual(['p9', 'r1', 'pa1', 'v1']);
    expect(botao.dataset.action).toBe('removerParteTratamento');
  });

  it('sem partes cadastradas: o vazio explica; com partes: seletor e "Ligar parte"', async () => {
    await abrir(renderAtividade, base());
    expect(el('c').textContent).toContain('Nenhuma parte cadastrada ainda');
    await abrir(renderAtividade, base({ [`GET ${P}/partes`]: [{ id: 'pa1', nome: 'Empresa exemplo', status: 'ativa' }] }));
    expect(el('tl-parte').options[0].textContent).toBe('Empresa exemplo');
    expect(el('c').querySelector('[data-action="adicionarParteTratamento"]').textContent).toBe('Ligar parte');
  });

  it('"Outros destinatários" grava pelo registro (PUT /api/v1/ropa/:id, que também confere o pedido aberto)', async () => {
    const f = await abrir(renderAtividade, base({ 'PUT /api/v1/ropa/r1': { ok: true } }));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    el('at-destinatarios').value = 'Empresa exemplo C';
    el('at-destinatarios').dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(801);
    vi.useRealTimers();
    await esperar(() => expect(corpoDe(f, 'PUT /api/v1/ropa/r1')).toEqual({ recipients: 'Empresa exemplo C' }));
  });
});

describe('leitura', () => {
  it('atividade cancelada: tudo desabilitado e sem botões de escrita', async () => {
    await abrir(renderAtividade, base({ [`GET ${B}/ligacoes`]: LIG({ partes: [{ nome: 'Empresa exemplo', papel: 'operador', parte_id: 'pa1', vinculo_id: 'v1' }] }) }),
      FICHA((x) => { x.situacao.codigo = 'cancelada'; return x; }));
    expect(el('at-controlador').disabled).toBe(true);
    expect(document.querySelector('input[name="at-intl"]').disabled).toBe(true);
    expect(el('at-partes-lista').querySelector('button')).toBeNull();
  });
});
