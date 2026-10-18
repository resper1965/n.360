import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { prepararProjeto, chamar, comoAgente, json, base, novaAtividade, P, OUTRO, type Sessoes } from './helpers/ropa-abas';
import { abrirPedido, pedidosAbertos, novaParte, novaArea, linha } from './helpers/ropa-abas-a';

describe('ficha em abas: aba Escopo', () => {
  let s: Sessoes;
  beforeAll(async () => {
    s = await prepararProjeto();
    await novaParte('es-p1', 'Responsável exemplo');
    await novaParte('es-alheia', 'Parte alheia', OUTRO);
    await novaArea('es-a1', 'Área exemplo 1');
    await novaArea('es-a2', 'Área exemplo 2');
    await novaArea('es-alheia-a', 'Área alheia', OUTRO);
  });
  const put = (rid: string, corpo: unknown, h = s.consultor) => chamar(h, 'PUT', `${base(rid)}/escopo`, corpo);

  it('campos fora do hash gravam sem substituir o pedido aberto', async () => {
    const rid = await novaAtividade(s.consultor);
    const pedido = await abrirPedido(s.consultor, rid);
    const r = await put(rid, { volume_mensal: '1000 titulares', descricao_atividade: 'Descrição exemplo', nome: 'Nome exemplo', processamento_automatizado: 'nao' });
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ ok: true, mudou_hash: false });
    expect(await pedidosAbertos(rid)).toEqual([pedido]);
    expect(await linha('SELECT nome, volume_mensal, processamento_automatizado FROM ropa_records WHERE id = ?', rid)).toMatchObject({ nome: 'Nome exemplo', volume_mensal: '1000 titulares', processamento_automatizado: 'nao' });
  });

  it('a finalidade está no hash: muda e substitui o pedido aberto; a mesma não', async () => {
    const rid = await novaAtividade(s.consultor, { processing_purpose: 'Finalidade A' });
    const pedido = await abrirPedido(s.consultor, rid);
    const igual = await put(rid, { finalidade: 'Finalidade A' });
    expect((await json(igual)).mudou_hash).toBe(false);
    expect(await pedidosAbertos(rid)).toEqual([pedido]);
    const r = await put(rid, { finalidade: 'Outra finalidade' });
    expect((await json(r)).mudou_hash).toBe(true);
    expect((await linha('SELECT processing_purpose p FROM ropa_records WHERE id = ?', rid)).p).toBe('Outra finalidade');
    expect(await pedidosAbertos(rid)).not.toContain(pedido);
  });

  it('finalidade vazia é 400; corpo com campo a mais é 400', async () => {
    const rid = await novaAtividade(s.consultor);
    expect((await put(rid, { finalidade: '' })).status).toBe(400);
    expect((await put(rid, { qualquer: 1 })).status).toBe(400);
  });

  it('owner_parte_id: da parte do projeto passa, alheia é 400, null limpa', async () => {
    const rid = await novaAtividade(s.consultor);
    expect((await put(rid, { owner_parte_id: 'es-p1' })).status).toBe(200);
    expect((await linha('SELECT owner_parte_id o FROM ropa_records WHERE id = ?', rid)).o).toBe('es-p1');
    const alheia = await put(rid, { owner_parte_id: 'es-alheia' });
    expect(alheia.status).toBe(400);
    expect((await json(alheia)).error).toBe('owner_parte_id inexistente ou de outro projeto');
    expect((await put(rid, { owner_parte_id: null })).status).toBe(200);
    expect((await linha('SELECT owner_parte_id o FROM ropa_records WHERE id = ?', rid)).o).toBeNull();
  });

  it('areas_ids troca as áreas (hash só se a lista mudou) e recusa área de outro projeto', async () => {
    const rid = await novaAtividade(s.consultor);
    const pedido = await abrirPedido(s.consultor, rid);
    expect(await json(await put(rid, { areas_ids: [] }))).toMatchObject({ mudou_hash: false });
    expect(await pedidosAbertos(rid)).toEqual([pedido]);
    const r = await put(rid, { areas_ids: ['es-a1', 'es-a2'] });
    expect(await json(r)).toMatchObject({ mudou_hash: true });
    const n = await linha('SELECT count(*) n FROM tratamento_departamentos WHERE ropa_id = ?', rid);
    expect(n.n).toBe(2);
    const pedido2 = (await pedidosAbertos(rid))[0];
    expect(await json(await put(rid, { areas_ids: ['es-a2', 'es-a1'] }))).toMatchObject({ mudou_hash: false });
    expect(await pedidosAbertos(rid)).toEqual([pedido2]);
    const ruim = await put(rid, { areas_ids: ['es-alheia-a'] });
    expect(ruim.status).toBe(400);
    expect((await linha('SELECT count(*) n FROM tratamento_departamentos WHERE ropa_id = ?', rid)).n).toBe(2);
  });

  it('corpo vazio não altera nada nem confere pedido', async () => {
    const rid = await novaAtividade(s.consultor);
    const pedido = await abrirPedido(s.consultor, rid);
    const antes = await linha('SELECT * FROM ropa_records WHERE id = ?', rid);
    expect(await json(await put(rid, {}))).toEqual({ ok: true, mudou_hash: false });
    expect(await linha('SELECT * FROM ropa_records WHERE id = ?', rid)).toEqual(antes);
    expect(await pedidosAbertos(rid)).toEqual([pedido]);
  });

  it('atividade cancelada: 409; inexistente e de outro projeto: 404', async () => {
    const rid = await novaAtividade(s.consultor);
    await env.DB.prepare(`UPDATE ropa_records SET status = 'Inactive' WHERE id = ?`).bind(rid).run();
    const r = await put(rid, { volume_mensal: 'x' });
    expect(r.status).toBe(409);
    expect((await json(r)).error).toBe('Atividade cancelada: reative para editar');
    expect((await put('nao-existe', {})).status).toBe(404);
    expect((await chamar(s.outro, 'PUT', `${base(rid)}/escopo`, {})).status).toBe(403);
  });

  it('pessoa sem o n.privacy: 403; o cliente com o módulo grava', async () => {
    const rid = await novaAtividade(s.consultor);
    expect((await put(rid, {}, s.soIso)).status).toBe(403);
    expect((await put(rid, { volume_mensal: 'v' }, s.adminCliente)).status).toBe(200);
  });

  it('o agente grava, e a trilha leva a seção sem o texto', async () => {
    const rid = await novaAtividade(s.consultor);
    const r = await comoAgente('PUT', `${base(rid)}/escopo`, { descricao_atividade: 'Texto livre sigiloso exemplo' });
    expect(r.status).toBe(200);
    const l = await linha('SELECT * FROM audit_logs WHERE action = ? AND entity_id = ?', 'ropa.secao', rid);
    expect(l.field).toBe('Escopo / Alteração');
    expect(JSON.stringify(l)).not.toContain('sigiloso');
  });

  it('sem nenhum cadastro prévio o PUT funciona (sistema vazio)', async () => {
    const rid = await novaAtividade(s.consultor);
    expect((await put(rid, { nome: 'Só o nome', areas_ids: [], owner_parte_id: null })).status).toBe(200);
  });
});
