// Aba Tratamento de Dados: carga, falha, o "Ver o fluxo" (diagrama escapado) e a ausência da ponte. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import contrato from '../../contracts/ropa-abas/etapas.json';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { renderAtividade } from '../src/views/atividade.js';
import { limparAutosaves } from '../src/atividade/estado.js';
import { B, P, FICHA, REGISTRO, prepararDom, abrir, esperar, resposta } from './helpers-atividade.js';

initDelegation();
beforeEach(() => { prepararDom(); window.render = vi.fn(); window.history.replaceState(null, '', '/?aba=tratamento'); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); limparAutosaves(); });

const rotas = (extra = {}) => ({
  [`GET ${B}/etapas`]: structuredClone(contrato),
  [`GET ${P}/assets`]: [],
  [`GET ${P}/catalogos/titulares`]: [],
  [`GET ${P}/catalogos/dados`]: [],
  [`GET ${P}/departamentos`]: [],
  [`GET ${P}/partes`]: [],
  ...extra,
});

describe('aba Tratamento de Dados', () => {
  it('monta as seis etapas no lugar da ponte, sem a faixa de "Edite em Continuar a entrevista"', async () => {
    await abrir(renderAtividade, rotas());
    expect(document.querySelectorAll('.at-etapa-botao')).toHaveLength(6);
    expect(document.querySelector('#at-corpo').textContent).not.toContain('Continuar a entrevista');
  });

  it('falha ao carregar: mensagem de erro (não o estado vazio) e "Tentar de novo"', async () => {
    const ficha = FICHA();
    const registro = REGISTRO();
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const p = new URL(url, 'http://localhost').pathname;
      if (p.endsWith('/etapas')) return resposta({ error: 'Falha interna.' }, 500);
      if (p.endsWith('/ficha')) return resposta(ficha);
      if (p.endsWith('/ropa')) return resposta({ ok: true, records: [registro] });
      return resposta([]);
    }));
    await renderAtividade(document.getElementById('c'), document.getElementById('h'), document.getElementById('a'));
    await esperar(() => expect(document.querySelector('#at-corpo [role="alert"]')).not.toBeNull());
    expect(document.querySelector('#at-corpo .empty-state')).toBeNull();
    expect(document.querySelector('#at-corpo [data-action="atRepintar"]').textContent).toBe('Tentar de novo');
  });

  it('"Ver o fluxo" abre o diagrama derivado escapado (sem script vivo)', async () => {
    await abrir(renderAtividade, rotas({ [`GET ${B}/diagrama`]: { mermaid: 'flowchart LR\n  A["<script>alert(1)</script>"] --> B' } }));
    document.querySelector('[data-acao="ver-fluxo"]').click();
    await esperar(() => expect(document.querySelector('.modal-title').textContent).toBe('Fluxo do tratamento'));
    const pre = document.querySelector('#modal-content pre');
    expect(pre.textContent).toContain('<script>alert(1)</script>');
    expect(document.querySelector('#modal-content script')).toBeNull();
    expect(document.querySelectorAll('#modal-content .btn-primary')).toHaveLength(0);
  });

  it('o diagrama que não carrega mostra a falha no próprio modal', async () => {
    await abrir(renderAtividade, rotas({ [`GET ${B}/diagrama`]: { error: 'x' }, }));
    document.querySelector('[data-acao="ver-fluxo"]').click();
    await esperar(() => expect(document.querySelector('.modal-title')).not.toBeNull());
    expect(document.querySelector('#modal-content').textContent).toContain('Não foi possível carregar o fluxo');
  });
});

// Os arquivos existem no build (glob) e a casca lê o fonte (?raw): sem `node:fs`, que o jsdom não carrega.
const ARQUIVOS = import.meta.glob(['../src/**/*.js', './*.test.js'], { query: '?raw', import: 'default', eager: true });

describe('fim da ponte', () => {
  it('o arquivo da ponte e o teste dela foram apagados', () => {
    expect(Object.keys(ARQUIVOS).some((k) => k.endsWith('aba-tratamento-ponte.js'))).toBe(false);
    expect(Object.keys(ARQUIVOS).some((k) => k.endsWith('atividade-ponte.test.js'))).toBe(false);
  });

  it('a casca importa a aba nova', () => {
    const fonte = ARQUIVOS['../src/views/atividade.js'];
    expect(fonte).toContain('../atividade/aba-tratamento.js');
    expect(fonte).not.toContain('aba-tratamento-ponte');
  });
});
