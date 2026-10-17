// Ponte do Tratamento de Dados (PR1): seis etapas em acordeão sobre o ciclo da F3. Descartável: sai na PR2. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { renderAtividade } from '../src/views/atividade.js';
import { limparAutosaves } from '../src/atividade/estado.js';
import fonte from '../src/atividade/aba-tratamento-ponte.js?raw';
import { B, P, prepararDom, abrir, el, corpoDe, esperar } from './helpers-atividade.js';

initDelegation();
beforeEach(() => { prepararDom(); window.render = vi.fn(); window.history.replaceState(null, '', '/?aba=tratamento'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); limparAutosaves(); });

const CICLO = { etapas: [
  { etapa: 'coleta', rotulo: 'Coleta', situacao: 'registrada', item_id: 'i1', item_nome: 'Sistema exemplo', descricao: 'Coleta no balcão.' },
  { etapa: 'uso', rotulo: 'Uso', situacao: null, item_id: null, item_nome: null, descricao: null },
  { etapa: 'compartilhamento_interno', rotulo: 'Compartilhamento interno', situacao: 'nao_aplicavel', item_id: null, item_nome: null, descricao: null },
] };
const ATIVOS = { ok: true, assets: [{ id: 'i1', nome: 'Sistema exemplo' }, { id: 'i2', nome: 'Arquivo exemplo' }] };
const PUT_CICLO = { [`PUT ${B}/ciclo`]: { ok: true } };
const base = (extra = {}) => ({ [`GET ${B}/ciclo`]: structuredClone(CICLO), [`GET ${P}/assets`]: ATIVOS, ...PUT_CICLO, ...extra });
const botoes = () => [...document.querySelectorAll('.at-etapa-botao')];

describe('acordeão', () => {
  it('seis etapas em botão com aria-expanded, o rótulo do legado e o estado em texto', async () => {
    await abrir(renderAtividade, base());
    expect(botoes()).toHaveLength(6);
    expect(botoes().map((b) => b.querySelector('span').textContent)).toEqual(['Coleta', 'Uso ou Processamento', 'Compartilhamento Interno', 'Compartilhamento Externo', 'Armazenamento', 'Eliminação']);
    expect(botoes().map((b) => b.querySelector('.at-etapa-situacao').textContent)).toEqual(['Concluído', 'Pendente', 'Não Aplicável', 'Pendente', 'Pendente', 'Pendente']);
    expect(botoes().every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
    expect(el('at-et-coleta').hidden).toBe(true);
    botoes()[0].click();
    expect(botoes()[0].getAttribute('aria-expanded')).toBe('true');
    expect(el('at-et-coleta').hidden).toBe(false);
    botoes()[0].click();
    expect(el('at-et-coleta').hidden).toBe(true);
  });

  it('cada etapa é um h3 com botão; a aba tem um h2', async () => {
    await abrir(renderAtividade, base());
    expect(document.querySelectorAll('#at-corpo h3 > button')).toHaveLength(6);
    expect(el('c').querySelectorAll('h2')).toHaveLength(1);
  });
});

describe('dentro da etapa', () => {
  it('"Não Aplicável" grava situacao nao_aplicavel e desabilita descrição e ativo', async () => {
    const f = await abrir(renderAtividade, base());
    const bloco = document.querySelector('[data-etapa="uso"]');
    bloco.querySelector('.at-na').click();
    await esperar(() => expect(corpoDe(f, `PUT ${B}/ciclo`)).toEqual({ etapas: [{ etapa: 'uso', situacao: 'nao_aplicavel' }] }));
    await esperar(() => expect(bloco.querySelector('.at-etapa-situacao').textContent).toBe('Não Aplicável'));
    expect(el('at-desc-uso').disabled).toBe(true);
  });

  it('descrição grava pelo /ciclo, mostra o teto de 1.000 caracteres em texto e respeita o maxlength', async () => {
    const f = await abrir(renderAtividade, base());
    expect(el('at-desc-uso').maxLength).toBe(1000);
    expect(el('at-desc-uso-ajuda').textContent).toContain('Até 1.000 caracteres');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    el('at-desc-uso').value = 'Uso no sistema de folha.';
    el('at-desc-uso').dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(801);
    vi.useRealTimers();
    await esperar(() => expect(corpoDe(f, `PUT ${B}/ciclo`)).toEqual({ etapas: [{ etapa: 'uso', situacao: 'registrada', descricao: 'Uso no sistema de folha.' }] }));
    expect(document.querySelector('[data-etapa="uso"] .at-etapa-situacao').textContent).toBe('Concluído');
  });

  it('um ativo por etapa, do inventário', async () => {
    const f = await abrir(renderAtividade, base());
    expect([...el('at-ativo-uso').options].map((o) => o.textContent)).toEqual(['Nenhum', 'Sistema exemplo', 'Arquivo exemplo']);
    expect(el('at-ativo-coleta').value).toBe('i1');
    el('at-ativo-uso').value = 'i2';
    el('at-ativo-uso').dispatchEvent(new Event('change', { bubbles: true }));
    await esperar(() => expect(corpoDe(f, `PUT ${B}/ciclo`)).toEqual({ etapas: [{ etapa: 'uso', situacao: 'registrada', item_id: 'i2' }] }));
  });

  it('inventário vazio: o texto explica o que é um ativo', async () => {
    await abrir(renderAtividade, base({ [`GET ${P}/assets`]: { ok: true, assets: [] } }));
    expect(el('at-et-uso').textContent).toContain('Um ativo é um sistema, arquivo ou documento que guarda dados');
  });

  it('a Coleta mostra titulares e dados só em leitura e manda editar na entrevista', async () => {
    await abrir(renderAtividade, base());
    window.abrirRopaEntrevista = vi.fn();
    const leitura = el('at-coleta-leitura');
    expect(leitura.textContent).toContain('Titulares: Titular exemplo A');
    expect(leitura.textContent).toContain('Dados pessoais: Dado exemplo 1');
    expect(leitura.textContent).toContain('Edite em Continuar a entrevista');
    expect(leitura.querySelectorAll('input, textarea')).toHaveLength(0);
    leitura.querySelector('button').click();
    expect(window.abrirRopaEntrevista).toHaveBeenCalledWith('p9', 'r1');
  });
});

describe('ponte descartável', () => {
  it('o arquivo começa com o comentário que o marca para sair na PR2', () => {
    expect(fonte.split('\n')[0]).toBe('// PONTE: sai na PR2 (aba-tratamento.js)');
  });

  it('na PR2 a ponte some: se aba-tratamento.js existir, a ponte não pode existir (tarefa Z2)', () => {
    const arquivos = Object.keys(import.meta.glob('../src/atividade/aba-tratamento*.js'));
    const aba = arquivos.some((a) => a.endsWith('/aba-tratamento.js'));
    const ponte = arquivos.some((a) => a.endsWith('/aba-tratamento-ponte.js'));
    expect(aba && ponte).toBe(false);
  });
});
