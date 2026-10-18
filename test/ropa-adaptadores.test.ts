import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { prepararProjeto, chamar, json, base, novaAtividade, novoItem, P, type Sessoes } from './helpers/ropa-abas';
import { abrirPedido, pedidosAbertos, linha } from './helpers/ropa-abas-a';

/** Adaptadores do cadastro antigo e da F3 sobre o modelo por etapa (plano A2.5). Nomes fictícios. */
describe('adaptadores da F3 e do cadastro antigo', () => {
  let s: Sessoes;
  beforeAll(async () => {
    s = await prepararProjeto();
    await novoItem('ad-i1', 'Sistema exemplo 1');
    await novoItem('ad-i2', 'Sistema exemplo 2');
    await novoItem('ad-i3', 'Sistema exemplo 3');
  });

  it('PUT do ciclo (F3) grava o cabeçalho e acrescenta o item como ativo da etapa; GET devolve o formato antigo', async () => {
    const rid = await novaAtividade(s.consultor);
    const r = await chamar(s.consultor, 'PUT', `${base(rid)}/ciclo`, { etapas: [{ etapa: 'uso', situacao: 'registrada', item_id: 'ad-i1', descricao: 'Descrição da F3' }] });
    expect(r.status).toBe(200);
    expect(await linha('SELECT item_id FROM tratamento_etapa_itens WHERE ropa_id = ? AND etapa = ?', rid, 'uso')).toEqual({ item_id: 'ad-i1' });
    const lido = (await json<{ etapas: any[] }>(await chamar(s.consultor, 'GET', `${base(rid)}/ciclo`))).etapas.find((e) => e.etapa === 'uso');
    expect(lido).toMatchObject({ situacao: 'registrada', item_id: 'ad-i1', descricao: 'Descrição da F3' });
  });

  it('PUT do ciclo (F3) não muda o hash nem substitui o pedido aberto', async () => {
    const rid = await novaAtividade(s.consultor);
    const pedido = await abrirPedido(s.consultor, rid);
    await chamar(s.consultor, 'PUT', `${base(rid)}/ciclo`, { etapas: [{ etapa: 'uso', situacao: 'registrada', item_id: 'ad-i2' }] });
    expect(await pedidosAbertos(rid)).toEqual([pedido]);
  });

  it('PUT /itens (antigo) acrescenta à Coleta quando a atividade já tem ativos por etapa; nunca remove da Coleta', async () => {
    const rid = await novaAtividade(s.consultor);
    await chamar(s.consultor, 'PUT', `${base(rid)}/etapas/coleta`, { descricao: 'Descrição exemplo' });
    await chamar(s.consultor, 'PUT', `${base(rid)}/etapas/coleta/ativos`, { ativos: [{ item_id: 'ad-i1' }] });
    const r = await chamar(s.consultor, 'PUT', `${base(rid)}/itens`, { itens: ['ad-i3'] });
    expect(r.status).toBe(200);
    const ids = (await env.DB.prepare('SELECT item_id FROM tratamento_etapa_itens WHERE ropa_id = ? AND etapa = ? ORDER BY rowid').bind(rid, 'coleta').all<{ item_id: string }>()).results.map((x) => x.item_id);
    expect(ids).toEqual(['ad-i1', 'ad-i3']);
  });

  it('relatório imprime as etapas com a marca de dado sensível, e nada de outra atividade', async () => {
    const outra = await novaAtividade(s.consultor, { processing_purpose: 'Atividade alheia exemplo' });
    const rid = await novaAtividade(s.consultor, { processing_purpose: 'Atividade relatório exemplo' });
    const t = (await json<{ item: { id: string } }>(await chamar(s.consultor, 'POST', `/api/v1/projects/${P}/catalogos/titulares`, { nome: 'Titular relatório' }))).item.id;
    const d = (await json<{ item: { id: string } }>(await chamar(s.consultor, 'POST', `/api/v1/projects/${P}/catalogos/dados`, { nome: 'Saúde' }))).item.id;
    await chamar(s.consultor, 'PUT', `${base(rid)}/etapas/coleta`, { descricao: 'Descrição exemplo' });
    await chamar(s.consultor, 'PUT', `${base(rid)}/etapas/coleta/titulares`, { titulares: [{ titular_id: t, dados_ids: [d] }] });
    const html = await (await chamar(s.consultor, 'GET', `${base(rid)}/relatorio`)).text();
    expect(html).toContain('Coleta');
    expect(html).toContain('Compartilhamento Externo');
    expect(html).toContain('Saúde (dado sensível)');
    expect(html).not.toContain(`Atividade alheia exemplo`);
    expect(outra).not.toBe(rid);
  });
});
