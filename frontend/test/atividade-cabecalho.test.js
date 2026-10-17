// O cabeçalho da ficha: empresa, responsável, áreas, status e descrição (autosave). Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { renderAtividade } from '../src/views/atividade.js';
import { limparAutosaves } from '../src/atividade/estado.js';
import { P, B, FICHA, prepararDom, abrir, el, chamadas, corpoDe, esperar } from './helpers-atividade.js';

initDelegation();
beforeEach(() => { prepararDom(); window.render = vi.fn(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); limparAutosaves(); });

const cab = () => el('c').querySelector('.at-cabecalho');
const PESSOAS = [{ id: 'pa1', nome: 'Pessoa exemplo A', tipo: 'pessoa', status: 'ativa' }, { id: 'pa2', nome: 'Pessoa exemplo B', tipo: 'pessoa', status: 'ativa' }];
const AREAS = [{ id: 'dp-1', nome: 'Recursos Humanos', status: 'ativa' }, { id: 'dp-2', nome: 'Financeiro', status: 'ativa' }];
const PUT_ESCOPO = { [`PUT ${B}/escopo`]: { ok: true, mudou_hash: false } };

describe('leitura', () => {
  it('empresa em texto, responsável e áreas com botão Editar, status como selo com texto', async () => {
    await abrir(renderAtividade);
    expect(cab().textContent).toContain('Empresa exemplo Ltda.');
    expect(cab().textContent).toContain('Responsável exemplo');
    expect(cab().textContent).toContain('Recursos Humanos');
    expect(el('at-editar-responsavel').textContent).toBe('Editar');
    expect(el('at-editar-areas').textContent).toBe('Editar');
    expect(el('at-status').textContent).toBe('Em Revisão');
    expect(el('at-desatualizada')).toBeNull();
  });

  it('aprovação desatualizada aparece escrita ao lado do status', async () => {
    await abrir(renderAtividade, {}, FICHA((f) => { f.situacao.aprovacao_desatualizada = true; return f; }));
    expect(el('at-desatualizada').textContent).toBe('Aprovação desatualizada');
  });

  it('sem responsável nem áreas: "Não informado", nunca vazio', async () => {
    await abrir(renderAtividade, {}, FICHA((f) => { f.registro.responsavel = null; f.registro.areas = []; return f; }));
    expect(cab().textContent.match(/Não informado/g)).toHaveLength(2);
  });

  it('descrição tem label e texto vindo do servidor escapado', async () => {
    await abrir(renderAtividade, {}, FICHA((f) => { f.registro.descricao_atividade = '<b>negrito</b>'; return f; }));
    const area = el('at-descricao');
    expect(area.labels[0].textContent).toBe('Descrição da atividade');
    expect(area.value).toBe('<b>negrito</b>');
    expect(cab().querySelector('b')).toBeNull();
  });
});

describe('descrição com autosave', () => {
  it('800 ms depois da última digitação, um PUT /escopo { descricao_atividade } e "Salvo às HH:MM" em role=status', async () => {
    const f = await abrir(renderAtividade, PUT_ESCOPO);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const area = el('at-descricao');
    area.value = 'Passo 1';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    area.value = 'Passo 1 e passo 2';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(799);
    expect(chamadas(f)).not.toContain(`PUT ${B}/escopo`);
    await vi.advanceTimersByTimeAsync(2);
    vi.useRealTimers();
    await esperar(() => expect(el('at-descricao-status').textContent).toMatch(/^Salvo às \d{2}:\d{2}$/));
    expect(chamadas(f).filter((c) => c === `PUT ${B}/escopo`)).toHaveLength(1);
    expect(corpoDe(f, `PUT ${B}/escopo`)).toEqual({ descricao_atividade: 'Passo 1 e passo 2' });
    expect(el('at-descricao-status').getAttribute('role')).toBe('status');
  });
});

describe('responsável', () => {
  it('Editar abre o seletor de pessoas e Confirmar grava owner_parte_id', async () => {
    const f = await abrir(renderAtividade, { ...PUT_ESCOPO, [`GET ${P}/partes`]: PESSOAS });
    el('at-editar-responsavel').click();
    await esperar(() => expect(document.querySelectorAll('input[name="at-sel"]').length).toBeGreaterThan(0));
    expect(document.querySelector('.modal-title').textContent).toBe('Responsável pela atividade');
    document.querySelector('input[name="at-sel"][value="pa2"]').checked = true;
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1);
    el('at-sel-confirmar').click();
    await esperar(() => expect(corpoDe(f, `PUT ${B}/escopo`)).toEqual({ owner_parte_id: 'pa2' }));
    await esperar(() => expect(chamadas(f).filter((c) => c === `GET ${B}/ficha`).length).toBe(2));
  });

  it('"Sem responsável" limpa (null)', async () => {
    const f = await abrir(renderAtividade, { ...PUT_ESCOPO, [`GET ${P}/partes`]: PESSOAS });
    el('at-editar-responsavel').click();
    await esperar(() => expect(el('at-sel-confirmar')).not.toBeNull());
    document.querySelector('input[name="at-sel"][value=""]').checked = true;
    el('at-sel-confirmar').click();
    await esperar(() => expect(corpoDe(f, `PUT ${B}/escopo`)).toEqual({ owner_parte_id: null }));
  });

  it('cadastro vazio: explica o que fazer e cria a pessoa ali mesmo ("+" inline)', async () => {
    const lista = [];
    const f = await abrir(renderAtividade, { ...PUT_ESCOPO, [`GET ${P}/partes`]: lista, [`POST ${P}/partes`]: { ok: true, id: 'pa9' } });
    el('at-editar-responsavel').click();
    await esperar(() => expect(el('at-sel-vazio')).not.toBeNull());
    expect(el('at-sel-vazio').textContent).toContain('Nenhuma pessoa cadastrada');
    el('at-sel-novo').value = 'Pessoa exemplo C';
    lista.push({ id: 'pa9', nome: 'Pessoa exemplo C', tipo: 'pessoa', status: 'ativa' });
    el('at-sel-criar').click();
    await esperar(() => expect(document.querySelector('input[name="at-sel"][value="pa9"]')?.checked).toBe(true));
    expect(corpoDe(f, `POST ${P}/partes`)).toEqual({ tipo: 'pessoa', nome: 'Pessoa exemplo C' });
  });
});

describe('áreas', () => {
  it('Editar abre a lista marcada com as atuais e Confirmar grava areas_ids', async () => {
    const f = await abrir(renderAtividade, { ...PUT_ESCOPO, [`GET ${P}/departamentos`]: AREAS });
    el('at-editar-areas').click();
    await esperar(() => expect(document.querySelectorAll('input[name="at-sel"]').length).toBe(2));
    expect(document.querySelector('input[name="at-sel"][value="dp-1"]').checked).toBe(true);
    document.querySelector('input[name="at-sel"][value="dp-2"]').checked = true;
    el('at-sel-confirmar').click();
    await esperar(() => expect(corpoDe(f, `PUT ${B}/escopo`)).toEqual({ areas_ids: ['dp-1', 'dp-2'] }));
  });

  it('sem áreas cadastradas: o vazio explica o que é uma área', async () => {
    await abrir(renderAtividade, { [`GET ${P}/departamentos`]: [] });
    el('at-editar-areas').click();
    await esperar(() => expect(el('at-sel-vazio')).not.toBeNull());
    expect(el('at-sel-vazio').textContent).toContain('Uma área é um setor da empresa');
  });
});

describe('nome da atividade', () => {
  it('o botão tem nome acessível e pedirTexto grava { nome }', async () => {
    const f = await abrir(renderAtividade, PUT_ESCOPO);
    const botao = el('at-editar-nome');
    expect(botao.getAttribute('aria-label')).toBe('Editar o nome da atividade');
    botao.click();
    await esperar(() => expect(document.querySelector('[data-confirmar="sim"]')).not.toBeNull());
    document.querySelector('.confirmar-acoes').parentElement.querySelector('input').value = 'Desligamento de pessoa (exemplo)';
    document.querySelector('[data-confirmar="sim"]').click();
    await esperar(() => expect(corpoDe(f, `PUT ${B}/escopo`)).toEqual({ nome: 'Desligamento de pessoa (exemplo)' }));
  });
});

describe('atividade cancelada', () => {
  it('tudo desabilitado', async () => {
    await abrir(renderAtividade, {}, FICHA((f) => { f.situacao.codigo = 'cancelada'; f.situacao.rotulo = 'Cancelada'; return f; }));
    expect(el('at-status').textContent).toBe('Cancelada');
    for (const id of ['at-editar-nome', 'at-editar-responsavel', 'at-editar-areas', 'at-descricao']) expect(el(id).disabled).toBe(true);
  });
});
