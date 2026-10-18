// Catálogos inline (criar na hora), seletor genérico e reuso de ativo, área e parceiro. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { listarItens, criarItem, chave, ORIGENS } from '../src/atividade/catalogo-inline.js';
import { abrirSelecao } from '../src/atividade/modal-selecao.js';
import { P, prepararDom, chamadas, corpoDe, esperar, servir, resposta } from './helpers-atividade.js';

initDelegation();
const raiz = () => document.getElementById('modal-content');
const q = (sel) => raiz().querySelector(sel);
const qa = (sel) => [...raiz().querySelectorAll(sel)];
beforeEach(() => { prepararDom(); window.render = vi.fn(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const ITENS = [{ id: 'a1', nome: 'Sistema exemplo' }, { id: 'a2', nome: 'Planilha exemplo' }];
const base = (extra = {}) => ({ pid: 'p9', selecionados: [], titulo: 'Ativos', tipo: 'ativo', buscaRotulo: 'Buscar ativo', ...extra });

describe('catálogo do projeto', () => {
  it('lê a forma real do catálogo { ok, itens } e devolve id, nome e sensível', async () => {
    servir({ [`GET ${P}/catalogos/dados`]: { ok: true, itens: [{ id: 'd1', nome: 'Saúde exemplo', sensivel: 1, descricao_padrao: null, status: 'ativo' }] } });
    expect(await listarItens('p9', 'dado')).toEqual([{ id: 'd1', nome: 'Saúde exemplo', sensivel: true }]);
  });

  it('criação de catálogo responde { ok, item }: o id e o nome vêm de dentro de item (antes ficavam undefined)', async () => {
    servir({ [`POST ${P}/catalogos/titulares`]: { ok: true, item: { id: 't7', nome: 'Cliente exemplo', sensivel: false, descricao_padrao: null, status: 'ativo' } } });
    const r = await criarItem('p9', 'titular', { nome: 'cliente exemplo' }, []);
    expect(r.item).toEqual({ id: 't7', nome: 'Cliente exemplo', sensivel: false });
  });

  it('projeto novo: a lista vem vazia e a leitura não grava nada', async () => {
    const f = servir({ [`GET ${P}/catalogos/titulares`]: { ok: true, itens: [] } });
    expect(await listarItens('p9', 'titular')).toEqual([]);
    expect(chamadas(f)).toEqual([`GET ${P}/catalogos/titulares`]);
  });

  it('chave ignora acento, caixa e espaço repetido', () => {
    expect(chave('  Atestado   MÉDICO ')).toBe(chave('atestado medico'));
  });

  it('nome repetido (sem acento nem caixa) não cria: devolve a duplicata sem POST', async () => {
    const f = servir({});
    const r = await criarItem('p9', 'titular', { nome: 'COLABORADOR' }, [{ id: 't1', nome: 'Colaborador' }]);
    expect(r).toEqual({ duplicata: { id: 't1', nome: 'Colaborador' } });
    expect(chamadas(f)).toEqual([]);
  });

  it('409 do servidor vira duplicata com o existente', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta({ error: 'Já existe.', existente: { id: 't1', nome: 'Colaborador' } }, 409)));
    const r = await criarItem('p9', 'titular', { nome: 'Colaborador novo' }, []);
    expect(r.duplicata).toEqual({ id: 't1', nome: 'Colaborador' });
  });

  it('dado: POST com o nome e a marca de sensível; o servidor padroniza o nome', async () => {
    const f = servir({ [`POST ${P}/catalogos/dados`]: { ok: true, item: { id: 'd9', nome: 'Dado exemplo novo', sensivel: true } } });
    const r = await criarItem('p9', 'dado', { nome: 'dado exemplo novo', sensivel: true }, []);
    expect(corpoDe(f, `POST ${P}/catalogos/dados`)).toEqual({ nome: 'dado exemplo novo', sensivel: true });
    expect(r.item).toEqual({ id: 'd9', nome: 'Dado exemplo novo', sensivel: true });
  });

  it('ativo, área e parceiro usam os cadastros que já existem (reuso)', async () => {
    const f = servir({ [`POST ${P}/assets`]: { id: 'a9' }, [`POST ${P}/departamentos`]: { id: 'dp9' }, [`POST ${P}/partes`]: { id: 'pt9' } });
    await criarItem('p9', 'ativo', { nome: 'Sistema novo', categoria: 'Software' }, []);
    await criarItem('p9', 'area', { nome: 'Financeiro' }, []);
    await criarItem('p9', 'parceiro', { nome: 'Fornecedor exemplo' }, []);
    expect(corpoDe(f, `POST ${P}/assets`)).toEqual({ name: 'Sistema novo', category: 'Software' });
    expect(corpoDe(f, `POST ${P}/departamentos`)).toEqual({ nome: 'Financeiro' });
    expect(corpoDe(f, `POST ${P}/partes`)).toEqual({ tipo: 'organizacao', nome: 'Fornecedor exemplo' });
  });
});

describe('origens dos dados', () => {
  it('a lista da tela é a mesma de src/data/ropa-abas/origens.ts (o backend valida pelo mesmo conjunto)', async () => {
    const fonteTs = (await import('../../src/data/ropa-abas/origens.ts?raw')).default;
    const doBackend = [...fonteTs.matchAll(/id: '([a-z_]+)', rotulo: '([^']+)'/g)].map((m) => [m[1], m[2]]);
    expect(ORIGENS).toEqual(doBackend);
    expect(ORIGENS).toHaveLength(6);
  });
});

describe('seletor genérico', () => {
  it('busca sem acento nem caixa', () => {
    abrirSelecao(base({ itens: [{ id: 'x1', nome: 'Atestado Médico' }, { id: 'x2', nome: 'Cargo' }], aoGravar: vi.fn() }));
    const busca = q('[data-es-busca]');
    busca.value = 'medico';
    busca.dispatchEvent(new Event('input', { bubbles: true }));
    const visiveis = qa('input[data-es-item]').filter((i) => !i.closest('li').hidden).map((i) => i.value);
    expect(visiveis).toEqual(['x1']);
  });

  it('item já usado nesta etapa: travado, com o texto "já usado" e sempre entra na gravação', async () => {
    const gravar = vi.fn();
    abrirSelecao(base({ itens: [{ id: 'a1', nome: 'Sistema exemplo', travado: true }, { id: 'a2', nome: 'Planilha exemplo' }], selecionados: [], aoGravar: gravar }));
    const travado = q('input[data-es-item][value="a1"]');
    expect(travado.disabled).toBe(true);
    expect(travado.getAttribute('aria-disabled')).toBe('true');
    expect(travado.closest('li').textContent).toContain('já usado nesta etapa');
    q('input[data-es-item][value="a2"]').click();
    q('[data-es-gravar]').click();
    await esperar(() => expect(gravar).toHaveBeenCalled());
    expect(gravar.mock.calls[0][0].sort()).toEqual(['a1', 'a2']);
  });

  it('dado sensível aparece como texto, não só como cor', () => {
    abrirSelecao(base({ tipo: 'dado', titulo: 'Dados', itens: [{ id: 'd1', nome: 'Saúde', sensivel: true }], aoGravar: vi.fn() }));
    expect(q('[data-es-item][value="d1"]').closest('li').textContent).toContain('Dado sensível');
  });

  it('lista vazia explica o que é e oferece criar pelo rodapé (catálogo nasce vazio)', () => {
    abrirSelecao(base({ itens: [], vazio: { titulo: 'Nenhum ativo cadastrado', texto: 'Ativo é um sistema, arquivo ou base que guarda dados.' }, aoGravar: vi.fn() }));
    expect(raiz().textContent).toContain('Ativo é um sistema, arquivo ou base que guarda dados.');
    expect(q('[data-es-criar]').textContent).toBe('+ Criar ativo');
    expect(q('[data-es-gravar]').disabled).toBe(true);
  });

  it('"+ Criar" cria, seleciona o novo e só então Gravar habilita', async () => {
    const f = servir({ [`POST ${P}/assets`]: { id: 'a9', name: 'Sistema novo' } });
    const gravar = vi.fn();
    abrirSelecao(base({ itens: ITENS, aoGravar: gravar }));
    q('[data-es-criar]').click();
    q('.es-criar-nome').value = 'Sistema novo';
    q('.es-criar-nome').dispatchEvent(new Event('input', { bubbles: true }));
    q('[data-es-confirmar]').click();
    await esperar(() => expect(q('input[data-es-item][value="a9"]').checked).toBe(true));
    expect(corpoDe(f, `POST ${P}/assets`)).toEqual({ name: 'Sistema novo', category: 'Software' });
    expect(q('[data-es-gravar]').disabled).toBe(false);
    q('[data-es-gravar]').click();
    await esperar(() => expect(gravar).toHaveBeenCalled());
    expect(gravar.mock.calls[0][0]).toContain('a9');
  });

  it('duplicata na criação oferece "Usar este" e seleciona o existente', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta({ error: 'Já existe.', existente: { id: 'a1', nome: 'Sistema exemplo' } }, 409)));
    abrirSelecao(base({ itens: ITENS, aoGravar: vi.fn() }));
    q('[data-es-criar]').click();
    q('.es-criar-nome').value = 'sistema EXEMPLO';
    q('.es-criar-nome').dispatchEvent(new Event('input', { bubbles: true }));
    q('[data-es-confirmar]').click();
    await esperar(() => expect(q('[data-es-usar]')).not.toBeNull());
    expect(q('.es-criar-erro').textContent).toBe('Já existe: Sistema exemplo. Usar este?');
    q('[data-es-usar]').click();
    expect(q('input[data-es-item][value="a1"]').checked).toBe(true);
  });

  it('"Selecionar todos" marca só os itens livres, nunca os travados', () => {
    abrirSelecao(base({ itens: [{ id: 'a1', nome: 'Sistema exemplo', travado: true }, { id: 'a2', nome: 'Planilha exemplo' }], aoGravar: vi.fn() }));
    q('[data-es-todos]').click();
    expect(q('input[data-es-item][value="a2"]').checked).toBe(true);
    expect(q('[data-es-todos]').checked).toBe(true);
  });
});
