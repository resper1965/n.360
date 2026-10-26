// Aba Medidas de Segurança: lista, estado vazio que explica, modal "+ Medidas de Segurança" e ligação ao controle do n.iso. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { renderAtividade } from '../src/views/atividade.js';
import { limparAutosaves } from '../src/atividade/estado.js';
import { B, FICHA, prepararDom, abrir, el, chamadas, corpoDe, esperar } from './helpers-atividade.js';

initDelegation();
beforeEach(() => { prepararDom(); window.render = vi.fn(); window.history.replaceState(null, '', '/?aba=medidas'); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); limparAutosaves(); });

const M = (extra = {}) => ({ id: 'm1', medida: 'Controle de acesso por perfil', status: 'ativa', descricao: 'Cada pessoa vê só o seu setor.', controle_id: null, controle: null, ...extra });
const base = (medidas, extra = {}) => ({ [`GET ${B}/medidas`]: medidas, [`GET ${B}/medidas/sugestoes`]: [], [`GET ${B}/medidas/controles`]: [], ...extra });
const abrirModal = async () => { document.getElementById('at-nova-medida').click(); await esperar(() => expect(el('at-m-adicionar')).not.toBeNull()); };
const comIso = FICHA((f) => { f.modulos.iso = true; return f; });
const semIso = FICHA((f) => { f.modulos.iso = false; return f; });

describe('lista', () => {
  it('mostra "Medida: X / Status: Y" com a lixeira (Excluir) e a descrição', async () => {
    await abrir(renderAtividade, base([M(), M({ id: 'm2', medida: 'Treinamento da equipe', status: 'planejada', descricao: null })]));
    const itens = [...document.querySelectorAll('#at-medidas .at-item')];
    expect(itens).toHaveLength(2);
    expect(itens[0].textContent).toContain('Medida: Controle de acesso por perfil');
    expect(itens[0].textContent).toContain('Status: Ativo');
    expect(itens[0].textContent).toContain('Cada pessoa vê só o seu setor.');
    expect(itens[1].textContent).toContain('Status: Planejada');
    expect(itens[0].querySelector('[data-excluir]').getAttribute('aria-label')).toBe('Excluir a medida Controle de acesso por perfil');
  });

  it('editar abre o modal preenchido e grava por PUT só o que mudou', async () => {
    const f = await abrir(renderAtividade, base([M()], { [`PUT ${B}/medidas/m1`]: { ok: true } }));
    document.querySelector('[data-editar="m1"]').click();
    await esperar(() => expect(el('at-m-salvar')).not.toBeNull());
    expect(el('at-m-medida').value).toBe('Controle de acesso por perfil');
    expect(el('at-m-status').value).toBe('ativa');
    el('at-m-status').value = 'planejada';
    el('at-m-status').dispatchEvent(new Event('change'));
    el('at-m-salvar').click();
    await esperar(() => expect(chamadas(f)).toContain(`PUT ${B}/medidas/m1`));
    expect(corpoDe(f, `PUT ${B}/medidas/m1`)).toEqual({ medida: 'Controle de acesso por perfil', status: 'planejada', descricao: 'Cada pessoa vê só o seu setor.' });
  });

  it('excluir pede confirmação e só então chama DELETE', async () => {
    const f = await abrir(renderAtividade, base([M()], { [`DELETE ${B}/medidas/m1`]: { ok: true } }));
    document.querySelector('[data-excluir="m1"]').click();
    await esperar(() => expect(document.querySelector('[data-confirmar="sim"]')).not.toBeNull());
    expect(chamadas(f)).not.toContain(`DELETE ${B}/medidas/m1`);
    document.querySelector('[data-confirmar="sim"]').click();
    await esperar(() => expect(chamadas(f)).toContain(`DELETE ${B}/medidas/m1`));
  });

  it('texto do servidor é escapado', async () => {
    await abrir(renderAtividade, base([M({ medida: '<img src=x onerror=alert(1)>' })]));
    expect(el('at-corpo').querySelector('img')).toBeNull();
  });

  it('controle que deixou de estar implementado: aviso em texto', async () => {
    await abrir(renderAtividade, base([M({ controle_id: 'c1', controle: { id: 'c1', titulo: 'Controle exemplo', implementado: false }, controle_deixou_de_estar_implementado: true })]));
    expect(el('at-medidas').textContent).toContain('O controle deixou de estar implementado');
  });
});

describe('estado vazio', () => {
  it('explica o que é uma medida de segurança e oferece "Adicionar a primeira medida"', async () => {
    await abrir(renderAtividade, base([]));
    const vazio = el('at-corpo').querySelector('.empty-state');
    expect(vazio.textContent).toContain('controle técnico ou organizacional que protege os dados desta atividade');
    expect(vazio.querySelector('button').textContent).toBe('Adicionar a primeira medida');
  });

  it('sem permissão de escrever: o vazio explica, sem botão', async () => {
    await abrir(renderAtividade, base([]), FICHA((f) => { f.situacao.codigo = 'cancelada'; return f; }));
    expect(el('at-corpo').querySelector('.empty-state button')).toBeNull();
  });
});

describe('modal', () => {
  it('"Adicionar" nasce desabilitado e só habilita com Medida e Status; grava e recarrega a lista', async () => {
    const lista = [];
    const f = await abrir(renderAtividade, base(lista, { [`POST ${B}/medidas`]: { ok: true, id: 'm9' } }), semIso);
    await abrirModal();
    expect(document.querySelector('.modal-title').textContent).toBe('Medidas de Segurança');
    const adicionar = el('at-m-adicionar');
    expect(adicionar.disabled).toBe(true);
    expect(document.querySelectorAll('#modal-content .btn-primary')).toHaveLength(1);
    el('at-m-medida').value = 'Backup diário';
    el('at-m-medida').dispatchEvent(new Event('input', { bubbles: true }));
    expect(adicionar.disabled).toBe(true);
    el('at-m-status').value = 'em_implantacao';
    el('at-m-status').dispatchEvent(new Event('change', { bubbles: true }));
    expect(adicionar.disabled).toBe(false);
    el('at-m-descricao').value = 'Cópia noturna.';
    lista.push(M({ id: 'm9', medida: 'Backup diário', status: 'em_implantacao' }));
    adicionar.click();
    await esperar(() => expect(corpoDe(f, `POST ${B}/medidas`)).toEqual({ medida: 'Backup diário', status: 'em_implantacao', descricao: 'Cópia noturna.' }));
    await esperar(() => expect(el('at-medidas').textContent).toContain('Backup diário'));
  });

  it('o campo Medida é texto livre com sugestões só do que o projeto já usou (vazio no projeto novo)', async () => {
    await abrir(renderAtividade, base([]), semIso);
    await abrirModal();
    expect(el('at-m-medida').getAttribute('list')).toBe('at-m-sugestoes');
    expect(el('at-m-sugestoes').options).toHaveLength(0);
  });

  it('as sugestões são os nomes que o projeto já usou', async () => {
    await abrir(renderAtividade, base([], { [`GET ${B}/medidas/sugestoes`]: ['Backup diário', 'Criptografia de disco'] }), semIso);
    await abrirModal();
    expect([...el('at-m-sugestoes').options].map((o) => o.value)).toEqual(['Backup diário', 'Criptografia de disco']);
  });

  it('sem n.iso no projeto: não oferece "Ligar a um controle implementado"', async () => {
    const f = await abrir(renderAtividade, base([]), semIso);
    await abrirModal();
    expect(el('at-m-controle')).toBeNull();
    expect(chamadas(f)).not.toContain(`GET ${B}/medidas/controles`);
  });

  it('com n.iso: escolher o controle PREENCHE Medida e Status ativa e os trava', async () => {
    const f = await abrir(renderAtividade, base([], { [`GET ${B}/medidas/controles`]: [{ id: 'c1', titulo: 'Gestão de acessos (exemplo)' }], [`POST ${B}/medidas`]: { ok: true, id: 'm9' } }), comIso);
    await abrirModal();
    expect(el('at-m-controle').labels[0].textContent).toBe('Ligar a um controle implementado');
    el('at-m-controle').value = 'c1';
    el('at-m-controle').dispatchEvent(new Event('change', { bubbles: true }));
    expect(el('at-m-medida').value).toBe('Gestão de acessos (exemplo)');
    expect(el('at-m-status').value).toBe('ativa');
    expect(el('at-m-medida').disabled).toBe(true);
    expect(el('at-m-status').disabled).toBe(true);
    expect(el('at-m-adicionar').disabled).toBe(false);
    el('at-m-adicionar').click();
    await esperar(() => expect(corpoDe(f, `POST ${B}/medidas`)).toEqual({ medida: 'Gestão de acessos (exemplo)', status: 'ativa', controle_id: 'c1' }));
  });

  it('com n.iso mas nenhum controle implementado: o texto diz isso', async () => {
    await abrir(renderAtividade, base([]), comIso);
    await abrirModal();
    expect(el('at-m-controle-ajuda').textContent).toContain('Nenhum controle está implementado');
  });
});
