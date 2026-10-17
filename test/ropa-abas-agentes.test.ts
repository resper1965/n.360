import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { prepararProjeto, chamar, json, base, novaAtividade, type Sessoes } from './helpers/ropa-abas';
import { abrirPedido, pedidosAbertos, linha } from './helpers/ropa-abas-a';

describe('ficha em abas: aba Agentes de Tratamento', () => {
  let s: Sessoes;
  beforeAll(async () => { s = await prepararProjeto(); });
  const put = (rid: string, corpo: unknown) => chamar(s.consultor, 'PUT', `${base(rid)}/agentes`, corpo);
  const col = (rid: string) => linha('SELECT papel_controlador c, papel_operador o, international_transfers t, transfer_safeguards sg FROM ropa_records WHERE id = ?', rid);

  it('papéis gravam 1/0 sem tocar o hash e sem substituir o pedido', async () => {
    const rid = await novaAtividade(s.consultor);
    const pedido = await abrirPedido(s.consultor, rid);
    const r = await put(rid, { papel_controlador: true, papel_operador: false });
    expect(await json(r)).toEqual({ ok: true, mudou_hash: false });
    expect(await col(rid)).toMatchObject({ c: 1, o: 0 });
    expect(await pedidosAbertos(rid)).toEqual([pedido]);
  });

  it('transferência internacional e salvaguardas estão no hash; o mesmo valor não muda', async () => {
    const rid = await novaAtividade(s.consultor);
    const pedido = await abrirPedido(s.consultor, rid);
    // o padrão do banco já é "não": repetir não muda
    expect((await json(await put(rid, { international_transfers: false }))).mudou_hash).toBe(false);
    expect(await pedidosAbertos(rid)).toEqual([pedido]);
    expect((await json(await put(rid, { international_transfers: true }))).mudou_hash).toBe(true);
    const p2 = (await pedidosAbertos(rid))[0];
    expect(p2).not.toBe(pedido);
    expect((await json(await put(rid, { international_transfers: true }))).mudou_hash).toBe(false);
    expect((await json(await put(rid, { transfer_safeguards: 'Cláusulas-padrão (exemplo)' }))).mudou_hash).toBe(true);
    expect((await json(await put(rid, { transfer_safeguards: 'Cláusulas-padrão (exemplo)' }))).mudou_hash).toBe(false);
    expect(await pedidosAbertos(rid)).not.toContain(p2);
    expect(await col(rid)).toMatchObject({ t: 1, sg: 'Cláusulas-padrão (exemplo)' });
  });

  it('desmarcar a transferência internacional não apaga as transferências cadastradas', async () => {
    const rid = await novaAtividade(s.consultor);
    await put(rid, { international_transfers: true });
    const t = await chamar(s.consultor, 'POST', `${base(rid)}/transferencias`, { pais: 'País exemplo' });
    expect(t.status).toBe(201);
    await put(rid, { international_transfers: false });
    expect((await linha('SELECT count(*) n FROM tratamento_transferencias WHERE ropa_id = ?', rid)).n).toBe(1);
  });

  it('null volta o papel a "não informado"', async () => {
    const rid = await novaAtividade(s.consultor);
    await put(rid, { papel_operador: true });
    await put(rid, { papel_operador: null });
    expect((await col(rid)).o).toBeNull();
  });

  it('cancelada: 409; corpo vazio: 200 sem alteração; campo a mais: 400', async () => {
    const rid = await novaAtividade(s.consultor);
    const antes = await linha('SELECT * FROM ropa_records WHERE id = ?', rid);
    expect(await json(await put(rid, {}))).toEqual({ ok: true, mudou_hash: false });
    expect(await linha('SELECT * FROM ropa_records WHERE id = ?', rid)).toEqual(antes);
    expect((await put(rid, { outro: 1 })).status).toBe(400);
    await env.DB.prepare(`UPDATE ropa_records SET status = 'Inactive' WHERE id = ?`).bind(rid).run();
    expect((await put(rid, { papel_controlador: true })).status).toBe(409);
  });
});
