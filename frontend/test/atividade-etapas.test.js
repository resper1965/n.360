// As seis etapas do Tratamento de Dados: acordeão, bloqueio, painéis por etapa, Não Aplicável e autosave. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import contrato from '../../contracts/ropa-abas/etapas.json';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { renderAtividade } from '../src/views/atividade.js';
import { limparAutosaves } from '../src/atividade/estado.js';
import { B, P, FICHA, prepararDom, abrir, corpoDe, esperar, chamadas } from './helpers-atividade.js';

initDelegation();
beforeEach(() => { prepararDom(); window.render = vi.fn(); window.history.replaceState(null, '', '/?aba=tratamento'); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); limparAutosaves(); });

// A Coleta pendente bloqueia as etapas 2 a 6 (regra do servidor, espelhada no fixture).
const ETAPAS = (mudar = (x) => x) => {
  const e = structuredClone(contrato);
  e.etapas.forEach((x) => { x.bloqueada = x.etapa !== 'coleta' && e.etapas[0].situacao !== 'concluida'; });
  return mudar(e);
};
const porEtapa = (e, id) => e.etapas.find((x) => x.etapa === id);
const bloco = (id) => document.querySelector(`[data-etapa="${id}"]`);
const botao = (id) => bloco(id).querySelector('.at-etapa-botao');
const rotas = (etapas = ETAPAS(), extra = {}) => ({
  [`GET ${B}/etapas`]: etapas,
  [`GET ${P}/assets`]: [{ id: 'i1', name: 'Sistema exemplo' }, { id: 'i2', name: 'Arquivo exemplo' }],
  [`GET ${P}/departamentos`]: [{ id: 'dp1', nome: 'Recursos Humanos', status: 'ativa' }, { id: 'dp2', nome: 'Financeiro', status: 'ativa' }],
  [`GET ${P}/partes`]: [{ id: 'pt1', nome: 'Fornecedor exemplo', tipo: 'organizacao' }],
  [`GET ${P}/catalogos/titulares`]: { ok: true, itens: [] },
  [`GET ${P}/catalogos/dados`]: { ok: true, itens: [] },
  [`PUT ${B}/etapas/coleta`]: { ok: true },
  [`PUT ${B}/etapas/armazenamento/ativos`]: { ok: true },
  [`PUT ${B}/etapas/eliminacao`]: { ok: true },
  [`PUT ${B}/etapas/uso`]: { ok: true },
  [`PUT ${B}/etapas/uso/ativos`]: { ok: true },
  [`PUT ${B}/etapas/coleta/ativos`]: { ok: true },
  ...extra,
});
const abrirTab = (etapas, extra, ficha = FICHA()) => abrir(renderAtividade, rotas(etapas, extra), ficha);

describe('acordeão das seis etapas', () => {
  it('seis botões com o rótulo do legado e o estado escrito no nome acessível', async () => {
    await abrirTab();
    const botoes = [...document.querySelectorAll('.at-etapa-botao')];
    expect(botoes).toHaveLength(6);
    expect(botoes.map((b) => b.querySelector('.at-etapa-rotulo').textContent.trim())).toEqual(['1. Coleta', '2. Uso ou Processamento', '3. Compartilhamento Interno', '4. Compartilhamento Externo', '5. Armazenamento', '6. Eliminação']);
    expect(botao('coleta').getAttribute('aria-label')).toBe('1. Coleta, pendente');
    expect(botao('coleta').getAttribute('aria-expanded')).toBe('false');
    // chevron funcional, fora da árvore de acessibilidade
    botoes.forEach((b) => expect(b.querySelector('svg.at-chevron').getAttribute('aria-hidden')).toBe('true'));
  });

  it('etapa atual: sem nenhuma aberta, a primeira pendente; ao abrir outra, a aberta', async () => {
    await abrirTab(ETAPAS((x) => { x.etapas.forEach((y) => { y.bloqueada = false; }); porEtapa(x, 'coleta').situacao = 'concluida'; return x; }));
    const atuais = () => [...document.querySelectorAll('.at-etapa-botao[aria-current="step"]')].map((b) => b.dataset.etapaBotao);
    expect(atuais()).toEqual(['uso']);
    botao('armazenamento').click();
    expect(botao('armazenamento').getAttribute('aria-expanded')).toBe('true');
    expect(atuais()).toEqual(['armazenamento']);
    botao('armazenamento').click();
    expect(botao('armazenamento').getAttribute('aria-expanded')).toBe('false');
    expect(atuais()).toEqual(['uso']);
  });

  it('etapa concluída leva data-sit="concluida" (a cor de sucesso no CSS) e o CSS a pinta de --success-ink', async () => {
    await abrirTab(ETAPAS((x) => { porEtapa(x, 'coleta').situacao = 'concluida'; x.etapas.forEach((y) => { y.bloqueada = false; }); return x; }));
    const sit = botao('coleta').querySelector('.at-etapa-situacao');
    expect(sit.dataset.sit).toBe('concluida');
    expect(sit.textContent).toBe('Concluído');
    const css = Object.values(import.meta.glob('../src/style.css', { query: '?raw', import: 'default', eager: true }))[0];
    expect(css).toContain('.at-etapa-situacao[data-sit="concluida"] { color: var(--success-ink); }');
    expect(css).not.toContain('data-sit="registrada"');
  });

  it('etapas bloqueadas: aria-disabled, o texto "Conclua a Coleta primeiro" e nada abre', async () => {
    await abrirTab();
    expect(botao('uso').getAttribute('aria-disabled')).toBe('true');
    expect(botao('uso').textContent).toContain('Conclua a Coleta primeiro');
    botao('uso').click();
    expect(botao('uso').getAttribute('aria-expanded')).toBe('false');
    expect(bloco('uso').querySelector('.et-corpo')).toBeNull();
  });

  it('um h2 da aba e um h3 por etapa; nenhum .btn-primary na aba', async () => {
    await abrirTab();
    expect(document.querySelectorAll('#at-painel h3')).toHaveLength(6);
    expect(document.querySelectorAll('#at-corpo .btn-primary')).toHaveLength(0);
  });

  it('a situação de cada etapa aparece no resumo em duas colunas: Concluído e Não Aplicável', async () => {
    const e = ETAPAS((x) => {
      porEtapa(x, 'coleta').situacao = 'concluida'; porEtapa(x, 'coleta').faltas = [];
      porEtapa(x, 'armazenamento').nao_aplicavel = true; porEtapa(x, 'armazenamento').situacao = 'nao_aplicavel'; porEtapa(x, 'armazenamento').bloqueada = false;
      return x;
    });
    await abrirTab(e);
    const linhas = [...document.querySelectorAll('.et-resumo tbody tr')];
    expect(linhas[0].children[1].textContent).toBe('Sim');
    expect(linhas[4].children[2].textContent).toBe('Sim');
    expect(document.querySelector('.et-resumo thead').textContent).toContain('Concluído');
    expect(document.querySelector('.et-resumo thead').textContent).toContain('Não Aplicável');
  });
});

describe('Coleta aberta', () => {
  it('painéis Titulares (com a contagem de dados) e Ativos, e os campos da Coleta', async () => {
    await abrirTab();
    botao('coleta').click();
    const corpo = bloco('coleta');
    expect(corpo.querySelector('#at-et-coleta-titulares').textContent).toContain('Titular exemplo A');
    expect(corpo.textContent).toContain('(1 dado selecionado)');
    expect(corpo.textContent).toContain('+ Adicionar Titulares');
    expect(corpo.textContent).toContain('Sistema exemplo');
    expect(corpo.textContent).toContain('+ Adicionar Ativos');
    expect(corpo.querySelector('[data-campo="descricao"]')).not.toBeNull();
    expect(corpo.querySelector('fieldset legend').textContent).toBe('Origem dos Dados');
    expect(corpo.textContent).toContain('Solicita consentimento?');
    expect(corpo.textContent).toContain('Há tratamento de Dados Pessoais de Crianças e/ou Adolescentes neste Processo?');
  });

  it('migrado: faixa "Migrado do cadastro anterior: confirme os dados de cada titular"', async () => {
    await abrirTab(ETAPAS((x) => { porEtapa(x, 'coleta').migrado = true; return x; }));
    botao('coleta').click();
    expect(bloco('coleta').textContent).toContain('Migrado do cadastro anterior: confirme os dados de cada titular');
  });

  it('sem titulares, a lista explica o que é titular', async () => {
    await abrirTab(ETAPAS((x) => { porEtapa(x, 'coleta').titulares = []; return x; }));
    botao('coleta').click();
    expect(bloco('coleta').textContent).toContain('Titular é a pessoa cujos dados são tratados');
  });
});

describe('demais etapas', () => {
  it('Uso sem ativos explica o que é ativo', async () => {
    await abrirTab(ETAPAS((x) => { x.etapas.forEach((e) => { e.bloqueada = false; }); return x; }));
    botao('uso').click();
    expect(bloco('uso').textContent).toContain('Ativo é um sistema, arquivo ou base que guarda ou usa dados');
  });

  it('Uso: Titulares em lista só de status, com "Pendente" ou "Definido" em texto', async () => {
    await abrirTab(ETAPAS((x) => { x.etapas.forEach((e) => { e.bloqueada = false; }); return x; }));
    botao('uso').click();
    const titulares = bloco('uso').querySelector('.et-titulares-status');
    expect(titulares.textContent).toContain('Titular exemplo A');
    expect(titulares.textContent).toContain('Pendente');
  });

  it('Compartilhamento Interno: a área da própria atividade vem travada, com o texto', async () => {
    await abrirTab(ETAPAS((x) => { x.etapas.forEach((e) => { e.bloqueada = false; }); return x; }));
    botao('compartilhamento_interno').click();
    const travada = bloco('compartilhamento_interno').querySelector('[aria-disabled="true"]');
    expect(travada.textContent).toContain('Recursos Humanos');
    expect(travada.textContent).toContain('já é a área da atividade');
  });

  it('Compartilhamento Externo: painel Parceiros', async () => {
    await abrirTab(ETAPAS((x) => { x.etapas.forEach((e) => { e.bloqueada = false; }); return x; }));
    botao('compartilhamento_externo').click();
    expect(bloco('compartilhamento_externo').textContent).toContain('Parceiros');
  });

  it('Armazenamento: tabela Ativos | Armazenamento com local editável, gravado sozinho em 800 ms', async () => {
    const f = await abrirTab(ETAPAS((x) => { x.etapas.forEach((e) => { e.bloqueada = false; }); porEtapa(x, 'armazenamento').ativos = [{ item_id: 'i1', nome: 'Sistema exemplo', local_armazenamento: null, travado: false }]; return x; }));
    botao('armazenamento').click();
    const cabecalhos = [...bloco('armazenamento').querySelectorAll('table th')].map((t) => t.textContent);
    expect(cabecalhos.slice(0, 2)).toEqual(['Ativos', 'Armazenamento']);
    const local = bloco('armazenamento').querySelector('input[data-item="i1"]');
    local.value = 'Servidor exemplo';
    local.dispatchEvent(new Event('input', { bubbles: true }));
    expect(chamadas(f)).not.toContain(`PUT ${B}/etapas/armazenamento/ativos`);
    await esperar(() => expect(corpoDe(f, `PUT ${B}/etapas/armazenamento/ativos`)).toBeDefined());
    expect(corpoDe(f, `PUT ${B}/etapas/armazenamento/ativos`)).toEqual({ ativos: [{ item_id: 'i1', local_armazenamento: 'Servidor exemplo' }] });
  });

  it('Eliminação: tabela só de leitura (herdada) e Prazo e Descarte lado a lado', async () => {
    await abrirTab(ETAPAS((x) => { x.etapas.forEach((e) => { e.bloqueada = false; }); porEtapa(x, 'armazenamento').ativos = [{ item_id: 'i1', nome: 'Sistema exemplo', local_armazenamento: 'Servidor exemplo', travado: false }]; return x; }));
    botao('eliminacao').click();
    const corpo = bloco('eliminacao');
    expect(corpo.querySelectorAll('table input')).toHaveLength(0);
    expect(corpo.querySelector('table').textContent).toContain('Servidor exemplo');
    expect(corpo.querySelector('.et-duas [data-campo="prazo"]')).not.toBeNull();
    expect(corpo.querySelector('.et-duas [data-campo="descarte"]')).not.toBeNull();
  });
});

describe('Não Aplicável', () => {
  it('com conteúdo, pede confirmação; confirmado, grava nao_aplicavel e bloqueia os campos', async () => {
    const e = ETAPAS((x) => { x.etapas.forEach((y) => { y.bloqueada = false; }); porEtapa(x, 'uso').descricao = 'Uso no sistema.'; return x; });
    const f = await abrirTab(e);
    botao('uso').click();
    bloco('uso').querySelector('[data-na]').click();
    await esperar(() => expect(document.querySelector('[data-confirmar="sim"]')).not.toBeNull());
    expect(document.body.textContent).toContain('Os dados desta etapa serão apagados');
    expect(chamadas(f)).not.toContain(`PUT ${B}/etapas/uso`);
    document.querySelector('[data-confirmar="sim"]').click();
    await esperar(() => expect(corpoDe(f, `PUT ${B}/etapas/uso`)).toEqual({ nao_aplicavel: true }));
  });

  it('etapa que o servidor diz Não Aplicável: checkbox marcado, campos desabilitados, o acordeão mostra o estado', async () => {
    await abrirTab(ETAPAS((x) => { x.etapas.forEach((y) => { y.bloqueada = false; }); const u = porEtapa(x, 'uso'); u.nao_aplicavel = true; u.situacao = 'nao_aplicavel'; u.faltas = []; return x; }));
    expect(botao('uso').getAttribute('aria-label')).toBe('2. Uso ou Processamento, não aplicável');
    botao('uso').click();
    expect(bloco('uso').querySelector('[data-na]').checked).toBe(true);
    expect(bloco('uso').querySelector('[data-campo="descricao"]').disabled).toBe(true);
    expect(bloco('uso').querySelector('[data-acao="add-ativo"]').disabled).toBe(true);
  });

  it('copiloto da descrição: botão de rascunho numa etapa editável e nenhum numa etapa Não Aplicável', async () => {
    await abrirTab(ETAPAS((x) => { x.etapas.forEach((y) => { y.bloqueada = false; }); return x; }));
    botao('uso').click();
    expect(bloco('uso').querySelector('[data-copiloto="rascunhar"]')).not.toBeNull();
    expect(bloco('uso').querySelector('[data-campo="descricao"]').disabled).toBe(false);
  });

  it('copiloto da descrição: sem botão na etapa que o servidor diz Não Aplicável', async () => {
    await abrirTab(ETAPAS((x) => { x.etapas.forEach((y) => { y.bloqueada = false; }); const u = porEtapa(x, 'uso'); u.nao_aplicavel = true; u.situacao = 'nao_aplicavel'; u.faltas = []; return x; }));
    botao('uso').click();
    expect(bloco('uso').querySelector('[data-copiloto="rascunhar"]')).toBeNull();
  });

  it('cancelar a confirmação não grava nada', async () => {
    const e = ETAPAS((x) => { x.etapas.forEach((y) => { y.bloqueada = false; }); porEtapa(x, 'uso').descricao = 'Uso no sistema.'; return x; });
    const f = await abrirTab(e);
    botao('uso').click();
    bloco('uso').querySelector('[data-na]').click();
    await esperar(() => expect(document.querySelector('[data-confirmar="nao"]')).not.toBeNull());
    document.querySelector('[data-confirmar="nao"]').click();
    await new Promise((ok) => setTimeout(ok, 30));
    expect(chamadas(f)).not.toContain(`PUT ${B}/etapas/uso`);
    expect(bloco('uso').querySelector('[data-na]').checked).toBe(false);
  });
});

describe('autosave por campo', () => {
  it('a descrição grava 800 ms depois de parar de digitar, com "Salvo às" em role=status da etapa', async () => {
    const f = await abrirTab(ETAPAS((x) => { x.etapas.forEach((y) => { y.bloqueada = false; }); return x; }));
    botao('uso').click();
    const area = bloco('uso').querySelector('[data-campo="descricao"]');
    area.value = 'Uso na folha.';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    expect(chamadas(f)).not.toContain(`PUT ${B}/etapas/uso`);
    await esperar(() => expect(corpoDe(f, `PUT ${B}/etapas/uso`)).toEqual({ descricao: 'Uso na folha.' }));
    await esperar(() => expect(bloco('uso').querySelector('[role="status"]').textContent).toMatch(/^Salvo às \d{2}:\d{2}$/));
  });
});

describe('onde estou: guiado e próxima pendência abrem a etapa', () => {
  const guiada = FICHA((f) => { f.lacunas = [{ aba: 'tratamento', campo: 'coleta.descricao' }, { aba: 'agentes', campo: 'papel' }]; f.proxima_pergunta = f.lacunas[0]; return f; });

  it('modo guiado: o painel é coluna irmã do tabpanel, conta as perguntas em aberto e o foco abre a etapa antes de ir ao campo', async () => {
    window.history.replaceState(null, '', '/?aba=tratamento&modo=guiado');
    S.atividade.avancou = true;
    await abrirTab(undefined, undefined, guiada);
    const area = document.querySelector('.at-area');
    expect(area.classList.contains('at-area-guiada')).toBe(true);
    expect([...area.children].map((x) => x.id || x.className)).toEqual(['at-painel', 'at-guiado']);
    expect(area.querySelector('.at-guiado-contagem').textContent).toBe('Pergunta 1 de 2 em aberto');
    expect(botao('coleta').getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('at-et-c-coleta').hidden).toBe(false);
    expect(document.activeElement.id).toBe('et-desc-coleta');
  });

  it('"Ir para a próxima pendência" troca para a aba e abre a primeira etapa pendente', async () => {
    window.history.replaceState(null, '', '/?aba=escopo');
    await abrir(renderAtividade, rotas(ETAPAS(), { [`PUT ${B}/escopo`]: { ok: true, mudou_hash: false } }));
    document.querySelector('[data-action="atIrParaPendencia"]').click();
    await esperar(() => expect(document.querySelector('[role="tab"][aria-selected="true"]').id).toBe('at-aba-tratamento'));
    await esperar(() => expect(botao('coleta').getAttribute('aria-expanded')).toBe('true'));
    expect(botao('coleta').getAttribute('aria-current')).toBe('step');
    expect(document.activeElement).toBe(botao('coleta'));
  });
});
