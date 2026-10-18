// Modal "Dados de titular" (Coleta) e o modal do titular em cada etapa (dados da Coleta, "Dados não usados"). Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import contrato from '../../contracts/ropa-abas/etapas.json';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { renderAtividade } from '../src/views/atividade.js';
import { limparAutosaves } from '../src/atividade/estado.js';
import { B, P, prepararDom, abrir, el, corpoDe, esperar, chamadas } from './helpers-atividade.js';

initDelegation();
const raiz = () => document.getElementById('modal-content');
const q = (sel) => raiz().querySelector(sel);
const qa = (sel) => [...raiz().querySelectorAll(sel)];
beforeEach(() => { prepararDom(); window.render = vi.fn(); window.history.replaceState(null, '', '/?aba=tratamento'); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); limparAutosaves(); });

const ETAPAS = () => structuredClone(contrato);
const TITULARES = [{ id: 't1', nome: 'Titular exemplo A' }, { id: 't2', nome: 'Titular exemplo B' }];
const DADOS = [
  { id: 'd1', nome: 'Dado exemplo 1', sensivel: false },
  { id: 'd2', nome: 'Dado exemplo 2', sensivel: false },
  { id: 'd3', nome: 'Saúde exemplo', sensivel: true },
];
const catalogo = () => ({
  [`GET ${P}/catalogos/titulares`]: { ok: true, itens: TITULARES },
  [`GET ${P}/catalogos/dados`]: { ok: true, itens: DADOS },
  [`PUT ${B}/etapas/coleta/titulares`]: { ok: true },
  [`PUT ${B}/etapas/uso/titulares/t1`]: { ok: true },
});
const abrirColeta = async (extra = {}) => {
  const f = await abrir(renderAtividade, { [`GET ${B}/etapas`]: ETAPAS(), ...catalogo(), ...extra });
  q2('#at-etapas [data-acao="add-titular"]').click();
  await esperar(() => expect(q('.modal-title').textContent).toBe('Dados de titular'));
  return f;
};
const q2 = (sel) => document.querySelector(sel);
const dadoItem = (id) => q(`input[data-es-item][value="${id}"]`);

describe('Dados de titular na Coleta', () => {
  it('tem o tipo de titular (select com "+"), a busca, Selecionar todos, a visualização e o rodapé "+ Criar Dado Pessoal"', async () => {
    await abrirColeta();
    expect(q('select#mt-tipo')).not.toBeNull();
    expect(q('button[aria-label="Criar tipo de titular"]')).not.toBeNull();
    expect(q('label[for="mt-tipo"]').textContent).toBe('Tipo de titular');
    expect(raiz().textContent).toContain('Buscar dados de titular');
    expect(q('[data-es-todos]')).not.toBeNull();
    expect(qa('[role="group"] button[aria-pressed]')).toHaveLength(3);
    expect(q('[data-es-criar]').textContent).toBe('+ Criar Dado Pessoal');
    expect(q('[data-es-fechar]').textContent).toBe('Fechar');
  });

  it('o dado sensível tem o selo em texto', async () => {
    await abrirColeta();
    expect(dadoItem('d3').closest('li').textContent).toContain('Dado sensível');
  });

  it('"Gravar" fica desabilitado até haver tipo de titular e marca', async () => {
    await abrirColeta();
    expect(q('[data-es-gravar]').disabled).toBe(true);
    dadoItem('d1').click();
    expect(q('[data-es-gravar]').disabled).toBe(true);
    const select = q('select#mt-tipo');
    select.value = 't1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    dadoItem('d2').click();
    expect(q('[data-es-gravar]').disabled).toBe(false);
  });

  it('gravar troca só o titular escolhido e manda a lista inteira', async () => {
    const f = await abrirColeta();
    const select = q('select#mt-tipo');
    select.value = 't2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    dadoItem('d2').click();
    q('[data-es-gravar]').click();
    await esperar(() => expect(corpoDe(f, `PUT ${B}/etapas/coleta/titulares`)).toBeDefined());
    expect(corpoDe(f, `PUT ${B}/etapas/coleta/titulares`)).toEqual({
      titulares: [
        { titular_id: 't1', dados_ids: ['d1'] },
        { titular_id: 't2', dados_ids: ['d2'] },
      ],
    });
  });
});

describe('Titular em uma etapa que não é a Coleta', () => {
  const abrirUso = async () => {
    const f = await abrir(renderAtividade, { [`GET ${B}/etapas`]: ETAPAS(), ...catalogo() });
    const botao = [...document.querySelectorAll('[data-etapa="uso"] .et-titular-botao')][0];
    botao.click();
    await esperar(() => expect(q('.modal-title')).not.toBeNull());
    return f;
  };

  it('abre com o nome do titular e só os dados que a Coleta definiu para ele', async () => {
    await abrirUso();
    expect(q('.modal-title').textContent).toBe('Titular exemplo A');
    const valores = qa('input[data-es-item]').map((i) => i.value);
    expect(valores).toEqual(['d1']);
  });

  it('"Dados não usados nesse tratamento": marcar desmarca e desabilita os outros', async () => {
    await abrirUso();
    dadoItem('d1').click();
    const naoUsa = q('input[data-es-nao-usa]');
    naoUsa.click();
    expect(dadoItem('d1').checked).toBe(false);
    expect(dadoItem('d1').disabled).toBe(true);
    expect(q('[data-es-gravar]').disabled).toBe(false);
  });

  it('gravar envia nao_usa, ou os dados marcados, para o titular da etapa', async () => {
    const f = await abrirUso();
    q('input[data-es-nao-usa]').click();
    q('[data-es-gravar]').click();
    await esperar(() => expect(corpoDe(f, `PUT ${B}/etapas/uso/titulares/t1`)).toBeDefined());
    expect(corpoDe(f, `PUT ${B}/etapas/uso/titulares/t1`)).toEqual({ dados_ids: [], nao_usa: true });
  });

  it('com dados marcados (sem "não usados"), manda só os ids escolhidos', async () => {
    const f = await abrirUso();
    dadoItem('d1').click();
    q('[data-es-gravar]').click();
    await esperar(() => expect(chamadas(f).some((c) => c === `PUT ${B}/etapas/uso/titulares/t1`)).toBe(true));
    expect(corpoDe(f, `PUT ${B}/etapas/uso/titulares/t1`)).toEqual({ dados_ids: ['d1'] });
  });
});
