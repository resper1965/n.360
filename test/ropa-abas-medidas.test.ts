import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { prepararProjeto, chamar, comoAgente, json, base, novaAtividade, P, OUTRO, type Sessoes } from './helpers/ropa-abas';
import { abrirPedido, pedidosAbertos, linha } from './helpers/ropa-abas-a';

describe('ficha em abas: aba Medidas de Segurança', () => {
  let s: Sessoes;
  beforeAll(async () => {
    s = await prepararProjeto();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('me-c1', ?, 'ISO27001', 'A.8.24 Criptografia exemplo', 'Implemented'), ('me-c2', ?, 'ISO27001', 'A.5.1 Política exemplo', 'Missing')`).bind(P, P),
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('me-alheio', ?, 'ISO27001', 'A.9 Controle alheio', 'Implemented')`).bind(OUTRO),
    ]);
  });
  const medidas = async (rid: string) => json<any[]>(await chamar(s.consultor, 'GET', `${base(rid)}/medidas`));

  it('sistema vazio: lista, sugestões e controles respondem 200 e vazios', async () => {
    const rid = await novaAtividade(s.consultor);
    expect(await medidas(rid)).toEqual([]);
    expect(await json(await chamar(s.consultor, 'GET', `${base(rid)}/medidas/sugestoes`))).toEqual([]);
  });

  it('cria, lista em ordem de criação, atualiza parcial e as sugestões vêm só do que o projeto já usou', async () => {
    const rid = await novaAtividade(s.consultor);
    const a = await chamar(s.consultor, 'POST', `${base(rid)}/medidas`, { medida: 'Medida exemplo A', status: 'ativa', descricao: 'Descrição exemplo' });
    expect(a.status).toBe(201);
    const idA = (await json(a)).id;
    await chamar(s.consultor, 'POST', `${base(rid)}/medidas`, { medida: 'Medida exemplo B', status: 'planejada' });
    const l = await medidas(rid);
    expect(l.map((m) => m.medida)).toEqual(['Medida exemplo A', 'Medida exemplo B']);
    expect(l[0]).toMatchObject({ status: 'ativa', descricao: 'Descrição exemplo', controle: null, controle_deixou_de_estar_implementado: false });
    const u = await chamar(s.consultor, 'PUT', `${base(rid)}/medidas/${idA}`, { status: 'em_implantacao' });
    expect(u.status).toBe(200);
    expect((await medidas(rid))[0]).toMatchObject({ medida: 'Medida exemplo A', status: 'em_implantacao', descricao: 'Descrição exemplo' });
    const sug = await json(await chamar(s.consultor, 'GET', `${base(rid)}/medidas/sugestoes`));
    expect(sug).toContain('Medida exemplo A');
    expect((await chamar(s.consultor, 'POST', `${base(rid)}/medidas`, { medida: '', status: 'ativa' })).status).toBe(400);
    expect((await chamar(s.consultor, 'POST', `${base(rid)}/medidas`, { medida: 'x', status: 'invalido' })).status).toBe(400);
    expect((await chamar(s.consultor, 'PUT', `${base(rid)}/medidas/inexistente`, { status: 'ativa' })).status).toBe(404);
  });

  it('DELETE: equipe e org_admin apagam, o agente é 403, id de outra atividade é 404', async () => {
    const rid = await novaAtividade(s.consultor);
    const outra = await novaAtividade(s.consultor);
    const mk = async (r: string) => (await json(await chamar(s.consultor, 'POST', `${base(r)}/medidas`, { medida: 'M', status: 'ativa' }))).id;
    const m1 = await mk(rid); const m2 = await mk(rid); const mOutra = await mk(outra);
    expect((await comoAgente('DELETE', `${base(rid)}/medidas/${m1}`)).status).toBe(403);
    expect((await chamar(s.consultor, 'DELETE', `${base(rid)}/medidas/${mOutra}`)).status).toBe(404);
    expect((await chamar(s.consultor, 'DELETE', `${base(rid)}/medidas/${m1}`)).status).toBe(200);
    expect((await chamar(s.adminCliente, 'DELETE', `${base(rid)}/medidas/${m2}`)).status).toBe(200);
    expect(await medidas(rid)).toEqual([]);
    expect(await medidas(outra)).toHaveLength(1);
  });

  it('ligação ao n.iso: só controle implementado do próprio projeto', async () => {
    const rid = await novaAtividade(s.consultor);
    const cs = await json<any[]>(await chamar(s.consultor, 'GET', `${base(rid)}/medidas/controles`));
    expect(cs).toEqual([{ id: 'me-c1', titulo: 'A.8.24 Criptografia exemplo' }]);
    for (const controle_id of ['me-c2', 'me-alheio', 'nao-existe']) {
      const r = await chamar(s.consultor, 'POST', `${base(rid)}/medidas`, { medida: 'M', status: 'ativa', controle_id });
      expect(r.status, controle_id).toBe(400);
    }
    const ok = await chamar(s.consultor, 'POST', `${base(rid)}/medidas`, { medida: 'M', status: 'ativa', controle_id: 'me-c1' });
    expect(ok.status).toBe(201);
    expect((await medidas(rid))[0].controle).toEqual({ id: 'me-c1', titulo: 'A.8.24 Criptografia exemplo', implementado: true });
    const id = (await json(ok)).id;
    expect((await chamar(s.consultor, 'PUT', `${base(rid)}/medidas/${id}`, { controle_id: 'me-alheio' })).status).toBe(400);
    expect((await chamar(s.consultor, 'PUT', `${base(rid)}/medidas/${id}`, { controle_id: null })).status).toBe(200);
    expect((await medidas(rid))[0].controle).toBeNull();
  });

  it('controle que deixa de estar implementado é avisado na leitura, sem gravar nada', async () => {
    const rid = await novaAtividade(s.consultor);
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('me-c3', ?, 'ISO27001', 'A.8.1 Exemplo', 'Implemented')`).bind(P).run();
    await chamar(s.consultor, 'POST', `${base(rid)}/medidas`, { medida: 'M', status: 'ativa', controle_id: 'me-c3' });
    await env.DB.prepare(`UPDATE compliance_controls SET status = 'Missing' WHERE id = 'me-c3'`).run();
    const m = (await medidas(rid))[0];
    expect(m.controle).toMatchObject({ id: 'me-c3', implementado: false });
    expect(m.controle_deixou_de_estar_implementado).toBe(true);
    expect((await linha('SELECT controle_id c FROM tratamento_medidas WHERE id = ?', m.id)).c).toBe('me-c3');
  });

  it('projeto sem o n.iso: controles é [] e a ligação é recusada', async () => {
    await env.DB.prepare(`DELETE FROM projeto_modulos WHERE project_id = ? AND modulo = 'iso'`).bind(P).run();
    try {
      const rid = await novaAtividade(s.consultor);
      expect(await json(await chamar(s.consultor, 'GET', `${base(rid)}/medidas/controles`))).toEqual([]);
      expect((await chamar(s.consultor, 'POST', `${base(rid)}/medidas`, { medida: 'M', status: 'ativa', controle_id: 'me-c1' })).status).toBe(400);
      expect((await chamar(s.consultor, 'POST', `${base(rid)}/medidas`, { medida: 'M', status: 'ativa' })).status).toBe(201);
    } finally {
      await env.DB.prepare(`INSERT OR IGNORE INTO projeto_modulos (project_id, modulo, habilitado_por) VALUES (?, 'iso', 'teste')`).bind(P).run();
    }
  });

  it('nenhuma escrita de medida substitui pedido aberto; a trilha não leva o texto', async () => {
    const rid = await novaAtividade(s.consultor);
    const pedido = await abrirPedido(s.consultor, rid);
    const c = await chamar(s.consultor, 'POST', `${base(rid)}/medidas`, { medida: 'Medida sigilosa exemplo', status: 'ativa' });
    const id = (await json(c)).id;
    await chamar(s.consultor, 'PUT', `${base(rid)}/medidas/${id}`, { descricao: 'Mais sigilo' });
    await chamar(s.consultor, 'DELETE', `${base(rid)}/medidas/${id}`);
    expect(await pedidosAbertos(rid)).toEqual([pedido]);
    const { results } = await env.DB.prepare(`SELECT * FROM audit_logs WHERE action = 'ropa.secao' AND entity_id = ? ORDER BY rowid`).bind(rid).all<any>();
    expect(results.map((l) => l.field)).toEqual(['Medidas de Segurança / Inclusão', 'Medidas de Segurança / Alteração', 'Medidas de Segurança / Exclusão']);
    expect(JSON.stringify(results)).not.toContain('sigilo');
  });

  it('atividade cancelada: escrita é 409, leitura segue', async () => {
    const rid = await novaAtividade(s.consultor);
    const id = (await json(await chamar(s.consultor, 'POST', `${base(rid)}/medidas`, { medida: 'M', status: 'ativa' }))).id;
    await env.DB.prepare(`UPDATE ropa_records SET status = 'Inactive' WHERE id = ?`).bind(rid).run();
    expect((await chamar(s.consultor, 'POST', `${base(rid)}/medidas`, { medida: 'N', status: 'ativa' })).status).toBe(409);
    expect((await chamar(s.consultor, 'PUT', `${base(rid)}/medidas/${id}`, { status: 'planejada' })).status).toBe(409);
    expect((await chamar(s.consultor, 'DELETE', `${base(rid)}/medidas/${id}`)).status).toBe(409);
    expect(await medidas(rid)).toHaveLength(1);
  });

  it('atividade inexistente: 404 em todas as leituras', async () => {
    for (const c of ['medidas', 'medidas/sugestoes', 'medidas/controles']) {
      expect((await chamar(s.consultor, 'GET', `${base('nao-existe')}/${c}`)).status, c).toBe(404);
    }
  });
});
