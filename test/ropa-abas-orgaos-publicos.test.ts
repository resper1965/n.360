// Órgãos públicos destinatários da atividade (0097): um por linha; cada escrita regrava `recipients` (conteúdo congelado). Dados fictícios.
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { prepararProjeto, chamar, json, base, novaAtividade, OUTRO, type Sessoes } from './helpers/ropa-abas';
import { abrirPedido, pedidosAbertos, linha } from './helpers/ropa-abas-a';

describe('ficha em abas: órgãos públicos destinatários', () => {
  let s: Sessoes;
  beforeAll(async () => { s = await prepararProjeto(); });
  const rota = (rid: string, resto = '') => `${base(rid)}/orgaos-publicos${resto}`;
  const recipients = async (rid: string) => (await linha<{ r: string | null }>('SELECT recipients r FROM ropa_records WHERE id = ?', rid))?.r;

  it('cadastrar, editar e remover regravam o texto da aprovação e substituem o pedido aberto', async () => {
    const rid = await novaAtividade(s.consultor);
    const pedido = await abrirPedido(s.consultor, rid);
    const c = await chamar(s.consultor, 'POST', rota(rid), { nome: 'Órgão exemplo A', obrigacao_legal: 'Lei exemplo 1' });
    expect(c.status).toBe(201);
    const { id } = await json(c);
    expect(await recipients(rid)).toBe('Órgão exemplo A (Lei exemplo 1)');
    const p2 = (await pedidosAbertos(rid))[0];
    expect(p2).not.toBe(pedido);
    await chamar(s.consultor, 'POST', rota(rid), { nome: 'Órgão exemplo B' });
    expect(await recipients(rid)).toBe('Órgão exemplo A (Lei exemplo 1); Órgão exemplo B');
    expect((await chamar(s.consultor, 'PUT', rota(rid, `/${id}`), { obrigacao_legal: null })).status).toBe(200);
    expect(await recipients(rid)).toBe('Órgão exemplo A; Órgão exemplo B');
    const lido = await json(await chamar(s.consultor, 'GET', rota(rid)));
    expect(lido.orgaos.map((o: any) => o.nome)).toEqual(['Órgão exemplo A', 'Órgão exemplo B']);
    expect(lido.texto_anterior).toBeNull();
    for (const o of lido.orgaos) expect((await chamar(s.consultor, 'DELETE', rota(rid, `/${o.id}`))).status).toBe(200);
    expect(await recipients(rid)).toBeNull();
    const { results } = await env.DB.prepare(`SELECT field FROM audit_logs WHERE action = 'ropa.secao' AND entity_id = ? ORDER BY rowid`).bind(rid).all<any>();
    expect(results.map((l) => l.field)).toContain('Agentes de Tratamento / Inclusão');
    expect(JSON.stringify(results)).not.toContain('Lei exemplo');
  });

  it('texto livre antigo sai como texto_anterior até o primeiro cadastro, que o substitui', async () => {
    const rid = await novaAtividade(s.consultor);
    await env.DB.prepare('UPDATE ropa_records SET recipients = ? WHERE id = ?').bind('Texto exemplo antigo', rid).run();
    expect(await json(await chamar(s.consultor, 'GET', rota(rid)))).toEqual({ orgaos: [], texto_anterior: 'Texto exemplo antigo' });
    await chamar(s.consultor, 'POST', rota(rid), { nome: 'Órgão exemplo A' });
    expect(await recipients(rid)).toBe('Órgão exemplo A');
  });

  it('corpo inválido é 400; órgão de outra atividade é 404; atividade cancelada é 409', async () => {
    const rid = await novaAtividade(s.consultor);
    const outra = await novaAtividade(s.consultor);
    expect((await chamar(s.consultor, 'POST', rota(rid), { nome: '' })).status).toBe(400);
    expect((await chamar(s.consultor, 'POST', rota(rid), { nome: 'A', extra: 1 })).status).toBe(400);
    const { id } = await json(await chamar(s.consultor, 'POST', rota(outra), { nome: 'Órgão exemplo A' }));
    expect((await chamar(s.consultor, 'PUT', rota(rid, `/${id}`), { nome: 'B' })).status).toBe(404);
    expect((await chamar(s.consultor, 'DELETE', rota(rid, `/${id}`))).status).toBe(404);
    await env.DB.prepare(`UPDATE ropa_records SET status = 'Inactive' WHERE id = ?`).bind(outra).run();
    expect((await chamar(s.consultor, 'POST', rota(outra), { nome: 'Órgão exemplo B' })).status).toBe(409);
    expect((await chamar(s.consultor, 'GET', rota(outra))).status).toBe(200);
  });

  it('o banco recusa a linha com atividade de outro projeto', async () => {
    const rid = await novaAtividade(s.consultor);
    await expect(env.DB.prepare(`INSERT INTO tratamento_orgaos_publicos (id, project_id, ropa_id, nome) VALUES ('op-x', ?, ?, 'X')`).bind(OUTRO, rid).run())
      .rejects.toThrow(/outro projeto/);
  });

  it('cliente só lê; teto de 20 por atividade', async () => {
    const rid = await novaAtividade(s.consultor);
    expect((await chamar(s.cliente, 'POST', rota(rid), { nome: 'Órgão exemplo A' })).status).toBe(403);
    for (let i = 0; i < 20; i++) expect((await chamar(s.consultor, 'POST', rota(rid), { nome: `Órgão ${i}` })).status).toBe(201);
    expect((await chamar(s.consultor, 'POST', rota(rid), { nome: 'Órgão 21' })).status).toBe(409);
  });
});
