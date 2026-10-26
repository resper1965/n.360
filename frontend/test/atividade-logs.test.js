// Aba Logs ROPA: cartões "Seção: evento / Nome / Data", mais recente primeiro, só leitura. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { renderAtividade } from '../src/views/atividade.js';
import { limparAutosaves } from '../src/atividade/estado.js';
import { B, prepararDom, abrir, el, esperar } from './helpers-atividade.js';

initDelegation();
beforeEach(() => { prepararDom(); window.render = vi.fn(); window.history.replaceState(null, '', '/?aba=logs'); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); limparAutosaves(); });

const L = (i, extra = {}) => ({ secao: 'Controle de GAPS', evento: 'Alteração', nome: `Pessoa exemplo ${i}`, data: '2026-10-16 14:30:00', ...extra });

describe('logs', () => {
  it('cartões com Seção: evento, Nome e Data (dd/mm/aaaa hh:mm), na ordem do servidor', async () => {
    await abrir(renderAtividade, { [`GET ${B}/logs`]: [L(1, { secao: 'Escopo', evento: 'Inclusão' }), L(2)] });
    const cartoes = [...el('at-logs').querySelectorAll('.at-log')];
    expect(cartoes).toHaveLength(2);
    expect(cartoes[0].querySelector('.at-log-linha').textContent).toBe('Escopo: Inclusão');
    expect(cartoes[0].textContent).toContain('Nome: Pessoa exemplo 1');
    expect(cartoes[0].textContent).toMatch(/Data: 16\/10\/2026 \d{2}:\d{2}/);
  });

  it('D3: mostra o antes e o depois em português, escapando o valor', async () => {
    await abrir(renderAtividade, { [`GET ${B}/logs`]: [
      L(1, { secao: 'Situação', evento: 'Reaberta', mudancas: [{ campo: 'situacao', antes: 'Approved', depois: 'Under Review' }] }),
      L(2, { secao: 'Agentes de Tratamento', mudancas: [{ campo: 'papel_controlador', antes: '(vazio)', depois: '1' }, { campo: 'areas_ids', antes: '(vazio)', depois: '<b>x</b>' }] }),
      L(3) ] });
    const c = [...el('at-logs').querySelectorAll('.at-log')];
    expect(c[0].textContent).toContain('Situação: Aprovada para Em revisão');
    expect(c[1].textContent).toContain('Controlador: (vazio) para Sim');
    expect(c[1].querySelector('b')).toBeNull();
    expect(c[2].textContent).not.toContain(' para ');
  });

  it('somente leitura: nenhum campo, nenhum filtro, "Carregar mais" escondido quando cabe tudo', async () => {
    await abrir(renderAtividade, { [`GET ${B}/logs`]: [L(1)] });
    expect(el('at-corpo').querySelectorAll('input, select, textarea')).toHaveLength(0);
    expect(el('at-logs-mais').hidden).toBe(true);
  });

  it('vazio: "Nenhum registro ainda."', async () => {
    await abrir(renderAtividade, { [`GET ${B}/logs`]: [] });
    expect(el('at-corpo').textContent).toContain('Nenhum registro ainda.');
  });

  it('com a página cheia, "Carregar mais" pede ?antes= a partir do último e acrescenta', async () => {
    const pagina = Array.from({ length: 50 }, (_, i) => L(i, { data: `2026-10-16 10:${String(59 - (i % 60)).padStart(2, '0')}:00` }));
    const f = await abrir(renderAtividade, { [`GET ${B}/logs`]: pagina });
    expect(el('at-logs-mais').hidden).toBe(false);
    el('at-logs-mais').click();
    await esperar(() => expect(f.mock.calls.some(([u]) => u.includes('antes='))).toBe(true));
    const url = new URL(f.mock.calls.find(([u]) => u.includes('antes='))[0]);
    expect(url.searchParams.get('antes')).toBe(pagina[49].data);
    expect(url.searchParams.get('limite')).toBe('50');
    await esperar(() => expect(el('at-logs').querySelectorAll('.at-log')).toHaveLength(100));
  });

  it('o texto do servidor é escapado', async () => {
    await abrir(renderAtividade, { [`GET ${B}/logs`]: [L(1, { nome: '<img src=x onerror=alert(1)>' })] });
    expect(el('at-logs').querySelector('img')).toBeNull();
  });
});
