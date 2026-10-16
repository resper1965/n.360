// Aba Escopo: três campos com ajuda em texto, autosave de 800 ms, sem botão Salvar. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { renderAtividade } from '../src/views/atividade.js';
import { limparAutosaves } from '../src/atividade/estado.js';
import situacao409 from '../../contracts/ropa-abas/situacao-409.json';
import { B, FICHA, prepararDom, abrir, el, chamadas, corpoDe, esperar, resposta, P } from './helpers-atividade.js';

initDelegation();
beforeEach(() => { prepararDom(); window.render = vi.fn(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); limparAutosaves(); });

const PUT = { [`PUT ${B}/escopo`]: { ok: true, mudou_hash: false } };
const digitar = (campo, valor) => { campo.value = valor; campo.dispatchEvent(new Event('input', { bubbles: true })); };
const painel = () => el('at-corpo');

describe('campos', () => {
  it('Finalidade, Volume mensal e processamento automatizado, com label visível e ajuda ligada por aria-describedby, sem ícone "?"', async () => {
    await abrir(renderAtividade, PUT);
    const finalidade = el('at-finalidade');
    expect(finalidade.labels[0].textContent).toBe('Finalidade (obrigatório)');
    expect(finalidade.value).toBe('Formalizar a rescisão do contrato de trabalho.');
    expect(el('at-volume').labels[0].textContent).toBe('Volume mensal');
    expect(el('at-processamento').labels[0].textContent).toBe('Os Dados Pessoais são submetidos a processamento automatizado?');
    for (const id of ['at-finalidade', 'at-volume', 'at-processamento']) {
      const ajuda = el(`${id}-ajuda`);
      expect(ajuda.textContent.length).toBeGreaterThan(10);
      expect(el(id).getAttribute('aria-describedby')).toContain(`${id}-ajuda`);
    }
    expect(painel().textContent).not.toContain('?)');
  });

  it('o select tem as três opções de processamento automatizado, com o valor gravado marcado', async () => {
    await abrir(renderAtividade, PUT);
    const opcoes = [...el('at-processamento').options].filter((o) => o.value).map((o) => [o.value, o.textContent]);
    expect(opcoes).toEqual([['nao', 'Não, não são submetidos.'], ['apoio', 'Sim, como apoio à decisão humana.'], ['decisao', 'Sim, com decisão automatizada.']]);
    expect(el('at-processamento').value).toBe('nao');
  });

  it('não há botão Salvar na aba', async () => {
    await abrir(renderAtividade, PUT);
    expect([...painel().querySelectorAll('button')].map((b) => b.textContent)).toEqual([]);
  });
});

describe('autosave', () => {
  it('digitar dispara UM PUT /escopo por rajada, 800 ms depois, com { finalidade }', async () => {
    const f = await abrir(renderAtividade, PUT);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    digitar(el('at-finalidade'), 'Formalizar a ');
    await vi.advanceTimersByTimeAsync(500);
    digitar(el('at-finalidade'), 'Formalizar a saída do colaborador.');
    await vi.advanceTimersByTimeAsync(799);
    expect(chamadas(f)).not.toContain(`PUT ${B}/escopo`);
    await vi.advanceTimersByTimeAsync(2);
    vi.useRealTimers();
    await esperar(() => expect(el('at-salvo').textContent).toMatch(/^Salvo às \d{2}:\d{2}$/));
    expect(chamadas(f).filter((c) => c === `PUT ${B}/escopo`)).toHaveLength(1);
    expect(corpoDe(f, `PUT ${B}/escopo`)).toEqual({ finalidade: 'Formalizar a saída do colaborador.' });
    expect(el('at-salvo').getAttribute('role')).toBe('status');
  });

  it('volume e processamento vão no mesmo lote, e "Selecione" limpa (null)', async () => {
    const f = await abrir(renderAtividade, PUT);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    digitar(el('at-volume'), '300 por mês');
    el('at-processamento').value = 'apoio';
    el('at-processamento').dispatchEvent(new Event('change', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(801);
    vi.useRealTimers();
    await esperar(() => expect(corpoDe(f, `PUT ${B}/escopo`)).toEqual({ volume_mensal: '300 por mês', processamento_automatizado: 'apoio' }));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    el('at-processamento').value = '';
    el('at-processamento').dispatchEvent(new Event('change', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(801);
    vi.useRealTimers();
    await esperar(() => expect(corpoDe(f, `PUT ${B}/escopo`)).toEqual({ processamento_automatizado: null }));
  });

  it('finalidade vazia NÃO envia e diz "A finalidade é obrigatória"', async () => {
    const f = await abrir(renderAtividade, PUT);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    digitar(el('at-finalidade'), '   ');
    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();
    expect(chamadas(f)).not.toContain(`PUT ${B}/escopo`);
    expect(el('at-finalidade-erro').textContent).toBe('A finalidade é obrigatória');
    expect(el('at-finalidade').getAttribute('aria-invalid')).toBe('true');
    digitar(el('at-finalidade'), 'Outra finalidade');
    expect(el('at-finalidade-erro').textContent).toBe('');
  });

  it('409 (atividade cancelada) mostra a mensagem do servidor no status', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u, o = {}) => {
      const k = `${o.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`;
      if (k === `PUT ${B}/escopo`) return resposta(situacao409, 409);
      if (k === `GET ${B}/ficha`) return resposta(FICHA());
      if (k === `GET ${P}/ropa`) return resposta({ ok: true, records: [] });
      return resposta({ error: 'nada' }, 404);
    }));
    await renderAtividade(el('c'), el('h'), el('a'));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    digitar(el('at-volume'), 'x');
    await vi.advanceTimersByTimeAsync(801);
    vi.useRealTimers();
    await esperar(() => expect(el('at-salvo').textContent).toBe('Atividade cancelada: reative para editar'));
  });

  it('atividade cancelada: campos desabilitados', async () => {
    await abrir(renderAtividade, PUT, FICHA((f) => { f.situacao.codigo = 'cancelada'; return f; }));
    for (const id of ['at-finalidade', 'at-volume', 'at-processamento']) expect(el(id).disabled).toBe(true);
  });
});
