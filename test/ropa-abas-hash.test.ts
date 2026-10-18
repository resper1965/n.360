import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { aprovacoesDoProjeto } from '../src/services/documentos';
import { prepararProjeto, chamar, json, base, aprovarTratamentoDeTeste, P, type Sessoes } from './helpers/ropa-abas';

/**
 * O hash do tratamento (pacote S). As escritas do pacote S NÃO tocam coluna do conteúdo congelado, então nenhuma delas chama
 * `conferirPedidosDoDocumento`: a aprovação anterior continua valendo e o pedido aberto continua aberto, com o mesmo hash. Uma linha
 * por rota de escrita do pacote (a tabela da spec 4.4); o pacote A e o líder acrescentam as suas.
 */
describe('hash intocável: as escritas do pacote S', () => {
  let s: Sessoes;
  let rid: string;
  const aprovacao = async () => (await aprovacoesDoProjeto(env.DB, P, rid, 'tratamento')).get(rid)!;
  const hashDoPedido = async () => (await env.DB.prepare(`SELECT hash FROM pedidos WHERE ref_id = ? AND id = ?`).bind(rid, `${P}-p`).first<{ hash: string }>())!.hash;
  let hash0: string;

  beforeAll(async () => {
    s = await prepararProjeto();
    rid = await aprovarTratamentoDeTeste(env.DB, P);
    await env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('hs-p', ?, 'pessoa', 'Responsável exemplo')`).bind(P).run();
    await env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, conteudo_json, hash, papel_exigido, status, criado_por)
      VALUES ('hs-aberto', 'org_ness', ?, 'tratamento', ?, 'Tratamento: exemplo', '{}', 'h-aberto', 'ceo', 'aberto', 'cons@ness.lat')`).bind(P, rid).run();
    hash0 = await hashDoPedido();
  });

  const intacto = async (rotulo: string) => {
    expect((await aprovacao()).ciso, `${rotulo}: aprovação CISO`).not.toBeNull();
    expect(await hashDoPedido(), `${rotulo}: hash do pedido`).toBe(hash0);
    expect((await env.DB.prepare(`SELECT status FROM pedidos WHERE id = 'hs-aberto'`).first<any>())!.status, `${rotulo}: pedido aberto`).toBe('aberto');
  };

  it('abrir a ficha, a conferência e o relatório não mexe em nada (aprovação de antes da 0079 continua valendo)', async () => {
    await intacto('antes');
    for (const c of ['ficha', 'conferencia', 'relatorio', 'gaps']) expect((await chamar(s.consultor, 'GET', `${base(rid)}/${c}`)).status, c).toBe(200);
    await intacto('leituras');
  });

  it('POST/PUT/DELETE /gaps, /gaps/nao-aplicavel e os anexos NÃO chamam a conferência', async () => {
    const g = await json<{ id: string }>(await chamar(s.consultor, 'POST', `${base(rid)}/gaps`, { gap: 'Gap exemplo', responsavel_parte_id: 'hs-p' }));
    await intacto('POST /gaps');
    await chamar(s.consultor, 'PUT', `${base(rid)}/gaps/${g.id}`, { status: 'Closed', recomendacao: 'r' });
    await intacto('PUT /gaps/:id');
    await chamar(s.consultor, 'DELETE', `${base(rid)}/gaps/${g.id}`);
    await intacto('DELETE /gaps/:id');
    await chamar(s.consultor, 'PUT', `${base(rid)}/gaps/nao-aplicavel`, { valor: true });
    await intacto('PUT /gaps/nao-aplicavel');
    await chamar(s.consultor, 'PUT', `${base(rid)}/gaps/nao-aplicavel`, { valor: false });
  });

  it('riscos (POST/PUT/DELETE) e ações da atividade NÃO chamam a conferência', async () => {
    const r = await json<{ id: string }>(await chamar(s.consultor, 'POST', `${base(rid)}/riscos`, { threat: 'Risco exemplo', impact: 3, probability: 3 }));
    await intacto('POST /riscos');
    await chamar(s.consultor, 'PUT', `${base(rid)}/riscos/${r.id}`, { treatment: 'Accept', residual_impact: 1, residual_probability: 1, treatment_due_date: '2027-01-01' });
    await intacto('PUT /riscos/:id');
    await chamar(s.consultor, 'DELETE', `${base(rid)}/riscos/${r.id}`);
    await intacto('DELETE /riscos/:id');
  });

  it('cancelar e reativar NÃO mudam o hash: a aprovação vigente volta a valer; o pedido ABERTO é cancelado (só ele)', async () => {
    await env.DB.prepare(`UPDATE ropa_records SET status = 'Under Review' WHERE id = ?`).bind(rid).run();
    expect((await chamar(s.consultor, 'POST', `${base(rid)}/situacao`, { acao: 'cancelar', motivo: 'cancelada para o teste' })).status).toBe(200);
    expect((await env.DB.prepare(`SELECT status FROM pedidos WHERE id = 'hs-aberto'`).first<any>())!.status).toBe('cancelado');
    expect((await env.DB.prepare(`SELECT status, hash FROM pedidos WHERE id = ?`).bind(`${P}-p`).first<any>())).toEqual({ status: 'aprovado', hash: hash0 });
    expect((await aprovacao()).ciso).not.toBeNull();
    expect((await chamar(s.consultor, 'POST', `${base(rid)}/situacao`, { acao: 'reativar' })).status).toBe(200);
    const f = await json<any>(await chamar(s.consultor, 'GET', `${base(rid)}/ficha`));
    expect(f.situacao.codigo).toBe('aprovada');
  });

  it('reabrir NÃO apaga a prova nem muda o hash; só a situação exibida muda', async () => {
    expect((await chamar(s.adminCliente, 'POST', `${base(rid)}/situacao`, { acao: 'reabrir', motivo: 'reabrir para o teste' })).status).toBe(200);
    expect(await hashDoPedido()).toBe(hash0);
    expect((await aprovacao()).ciso).not.toBeNull();
    const f = await json<any>(await chamar(s.consultor, 'GET', `${base(rid)}/ficha`));
    expect(f.situacao).toMatchObject({ codigo: 'em_revisao', em_nova_revisao: true });
  });
});
