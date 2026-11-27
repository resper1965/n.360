import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { inventarioPorLote } from './helpers/ot';
import { chavesOt } from '../src/services/ot-cifra';
import { aprovarLote } from '../src/services/ot-coleta';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

// Spec 2026-11-26, decisão 3: ativo e fluxo entram, mudam e saem por lote decidido por outra pessoa (`alvo_id`, `remover`). D1 real.
type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
const chamar = (h: H, metodo: string, caminho: string, corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
}), workerEnv());
const ok = async <T = Record<string, unknown>>(r: Promise<Response>, status: number) => { const x = await r; expect(x.status, await x.clone().text()).toBe(status); return x.json<T>(); };

type Item = { entidade?: 'ativo' | 'fluxo'; dados: Record<string, unknown> };
type LidoItem = { linha: number; decisao: string; motivo: string | null; erros: { campo: string; motivo: string }[]; duplicata_de?: string | null; registro_id?: string | null };
/** Levantamento, achados e envio (como o ajudante, sem aprovar): devolve o id do lote. */
async function lote(h: H, site: string, itens: Item[]) {
  const lev = await ok<{ id: string }>(chamar(h, 'POST', `${P}/levantamentos`, { site_id: site, tipo: 'visita', realizado_em: '2026-11-26' }), 201);
  const achados: string[] = [];
  for (const i of itens) achados.push((await ok<{ id: string }>(chamar(h, 'POST', `${P}/levantamentos/${lev.id}/achados`, { entidade: i.entidade ?? 'ativo', dados: i.dados, evidencia: 'teste' }), 201)).id);
  return (await ok<{ id: string }>(chamar(h, 'POST', `${P}/levantamentos/${lev.id}/enviar`, { achados }), 201)).id;
}
const aprovar = (h: H, l: string) => ok<{ criados: number; atualizados: number; removidos: number; recusados: number; pendentes: number }>(chamar(h, 'POST', `${P}/lotes/${l}/aprovar`), 200);
const lerLote = (h: H, l: string) => ok<{ lote: { status: string }; itens: LidoItem[]; nomes_alvos?: Record<string, string> }>(chamar(h, 'GET', `${P}/lotes/${l}`), 200);
const item0 = async (h: H, l: string) => (await lerLote(h, l)).itens[0];

const ATIVO_431 = { no_arciber: true, categoria_arciber: 'centro_operacao', tipo_dispositivo: 'RTU', fabricante: 'F', funcao: 'telecontrole',
  ip: '10.9.0.1', protocolos_portas: [{ protocolo: 'DNP3', porta: 20000 }], firmware_so_versao: '1.0' };

let gestor: H, cons: H;
const ids: Record<string, string> = {};
beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
    ('u-gestor', 'gestor@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a')`).run();
  await designarConsultor('cons-ot@ness.lat', 'proj-a');
  await concederModulos(['u-gestor', 'cons:cons-ot@ness.lat'], ['ot']);
  gestor = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  cons = await sessionFor({ id: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', role: 'consultor' });
  ids.s1 = (await ok<{ id: string }>(chamar(cons, 'POST', `${P}/sites`, { nome: 'SE Norte Exemplo' }), 201)).id;
  ids.s2 = (await ok<{ id: string }>(chamar(cons, 'POST', `${P}/sites`, { nome: 'SE Sul Exemplo' }), 201)).id;
});
// O teto de 20 lotes por dia por pessoa (ot-coleta.ts:17) vale para o autor: cada caso zera os lotes de ontem para não esbarrar nele.
const semTeto = () => env.DB.prepare(`UPDATE ot_lotes SET created_at = datetime('now', '-2 days')`).run();

describe('alvo_id e remover no achado e no lote', () => {
  it('alterar por alvo_id: renomear ativo sem IP nem MAC atualiza o MESMO ativo (o índice por nome não casaria; P1-4 não devolve "alvo mudou")', async () => {
    await semTeto();
    const [id] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'RTU 1', fabricante: 'F', modelo: 'M' } }] });
    const l = await lote(cons, ids.s1, [{ dados: { alvo_id: id, nome: 'RTU 1 renomeada' } }]);
    expect((await item0(gestor, l)).duplicata_de).toBe(id);
    expect(await aprovar(gestor, l)).toMatchObject({ atualizados: 1, criados: 0, pendentes: 0 });
    expect((await (await chamar(cons, 'GET', `${P}/ativos/${id}`)).json<{ nome: string }>()).nome).toBe('RTU 1 renomeada');
  });

  it('alterar por alvo_id sem nome: não é erro (o nome é o do alvo)', async () => {
    await semTeto();
    const [id] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'IED 2' } }] });
    expect((await item0(gestor, await lote(cons, ids.s1, [{ dados: { alvo_id: id, funcao: 'proteção' } }]))).erros).toEqual([]);
  });

  it('4.3.1: alteração que toca campo do 4.3.1 sem recoletar zera a verificação; com todos os campos recoletados, carimba', async () => {
    await semTeto();
    const [id] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'RTU V', ...ATIVO_431 } }] });
    const verificado = async () => (await env.DB.prepare('SELECT verificado_por FROM ot_ativos WHERE id = ?').bind(id).first<{ verificado_por: string | null }>())!.verificado_por;
    expect(await verificado()).not.toBeNull();
    await aprovar(gestor, await lote(cons, ids.s1, [{ dados: { alvo_id: id, firmware_so_versao: '2.0' } }]));
    expect(await verificado()).toBeNull();
    await aprovar(gestor, await lote(cons, ids.s1, [{ dados: { alvo_id: id, ...ATIVO_431, firmware_so_versao: '2.0' } }]));
    expect(await verificado()).not.toBeNull();
  });

  it('remover: o ativo sai das listas só depois do lote aprovado por outra pessoa; a remoção não carimba verificação', async () => {
    await semTeto();
    const [id] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'Switch velho' } }] });
    const l = await lote(cons, ids.s1, [{ dados: { alvo_id: id, remover: true } }]);
    expect((await chamar(cons, 'GET', `${P}/ativos/${id}`)).status).toBe(200);
    expect((await chamar(cons, 'POST', `${P}/lotes/${l}/aprovar`)).status).toBe(403);
    expect((await aprovar(gestor, l)).removidos).toBe(1);
    expect((await chamar(cons, 'GET', `${P}/ativos/${id}`)).status).toBe(404);
    expect(await env.DB.prepare('SELECT status, verificado_por FROM ot_ativos WHERE id = ?').bind(id).first()).toEqual({ status: 'removido', verificado_por: null });
    expect(await item0(gestor, l)).toMatchObject({ decisao: 'gravado', registro_id: id });
    // trilha só com ids e contagens (P0-6)
    const t = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'ot.lote.aprovado' ORDER BY rowid DESC LIMIT 1`).first<{ details: string }>();
    expect(t!.details).toMatch(/1 removido\(s\)/);
    expect(t!.details).not.toMatch(/Switch velho/);
  });

  it('P0-4: alvo_id de ativo de OUTRO site tem o mesmo desfecho de id inexistente', async () => {
    await semTeto();
    const [outro] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s2, itens: [{ dados: { nome: 'Do outro site' } }] });
    const [r1, r2] = [await lote(cons, ids.s1, [{ dados: { alvo_id: outro, remover: true } }]), await lote(cons, ids.s1, [{ dados: { alvo_id: 'nao-existe', remover: true } }])];
    const [i1, i2] = [await item0(gestor, r1), await item0(gestor, r2)];
    expect([i1.erros, i1.duplicata_de]).toEqual([i2.erros, i2.duplicata_de]);
    expect(i1.erros).toEqual([{ campo: 'alvo_id', motivo: 'registro não encontrado neste site' }]);
    expect((await aprovar(gestor, r1)).removidos).toBe(0);
    expect((await chamar(cons, 'GET', `${P}/ativos/${outro}`)).status).toBe(200);
    // alteração por alvo_id de outro site também não toca o alvo
    await aprovar(gestor, await lote(cons, ids.s1, [{ dados: { alvo_id: outro, nome: 'Tomado' } }]));
    expect((await (await chamar(cons, 'GET', `${P}/ativos/${outro}`)).json<{ nome: string }>()).nome).toBe('Do outro site');
  });

  it('P1-4 na remoção: alvo editado depois da revisão do item não é removido; o item volta a pendente', async () => {
    await semTeto();
    const [id] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'Painel X' } }] });
    const l = await lote(cons, ids.s1, [{ dados: { alvo_id: id, remover: true } }]);
    await env.DB.prepare(`UPDATE ot_ativos SET funcao = 'editado', updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now', '+1 second') WHERE id = ?`).bind(id).run();
    expect((await aprovar(gestor, l)).removidos).toBe(0);
    expect((await chamar(cons, 'GET', `${P}/ativos/${id}`)).status).toBe(200);
    expect(await item0(gestor, l)).toMatchObject({ decisao: 'pendente', motivo: expect.stringMatching(/revis/i) });
  });

  it('remover sem alvo_id é erro do item', async () => {
    await semTeto();
    expect((await item0(gestor, await lote(cons, ids.s1, [{ dados: { remover: true } }]))).erros[0]).toMatchObject({ campo: 'alvo_id' });
  });

  it('fluxo: alterar por alvo_id sem repetir as pontas; remover por alvo_id', async () => {
    await semTeto();
    const [a1, a2] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'A' } }, { dados: { nome: 'B' } }] });
    const [f] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ entidade: 'fluxo', dados: { origem_ativo_id: a1, destino_ativo_id: a2, protocolo: 'Modbus' } }] });
    expect(await aprovar(gestor, await lote(cons, ids.s1, [{ entidade: 'fluxo', dados: { alvo_id: f, porta: 502 } }]))).toMatchObject({ atualizados: 1, criados: 0 });
    expect(await env.DB.prepare('SELECT porta, origem_ativo_id FROM ot_fluxos WHERE id = ?').bind(f).first()).toEqual({ porta: 502, origem_ativo_id: a1 });
    expect((await aprovar(gestor, await lote(cons, ids.s1, [{ entidade: 'fluxo', dados: { alvo_id: f, remover: true } }]))).removidos).toBe(1);
    expect((await (await chamar(cons, 'GET', `${P}/fluxos`)).json<{ fluxos: { id: string }[] }>()).fluxos.map((x) => x.id)).not.toContain(f);
  });

  it('fluxo com alvo_id removido antes da aprovação: item recusado, lote conclui (nunca o INSERT de pontas vazias)', async () => {
    await semTeto();
    const [a1, a2] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'C' } }, { dados: { nome: 'D' } }] });
    const [f] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ entidade: 'fluxo', dados: { origem_ativo_id: a1, destino_ativo_id: a2 } }] });
    const l = await lote(cons, ids.s1, [{ entidade: 'fluxo', dados: { alvo_id: f, porta: 503 } }]);
    await env.DB.prepare(`UPDATE ot_fluxos SET status = 'removido' WHERE id = ?`).bind(f).run();
    expect(await aprovar(gestor, l)).toMatchObject({ criados: 0, recusados: 1, pendentes: 0 });
    expect((await lerLote(gestor, l)).lote.status).toBe('concluido');
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM ot_fluxos WHERE site_id = ? AND origem_ativo_id IS NULL AND origem_zona_id IS NULL`).bind(ids.s1).first('n')).toBe(0);
  });

  it('ativo com alvo_id removido antes da aprovação: item recusado (não fica pendente para sempre), lote conclui', async () => {
    await semTeto();
    const [id] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'E' } }] });
    const l = await lote(cons, ids.s1, [{ dados: { alvo_id: id, funcao: 'x' } }]);
    await env.DB.prepare(`UPDATE ot_ativos SET status = 'removido' WHERE id = ?`).bind(id).run();
    expect(await aprovar(gestor, l)).toMatchObject({ criados: 0, atualizados: 0, recusados: 1, pendentes: 0 });
    expect((await lerLote(gestor, l)).lote.status).toBe('concluido');
  });
});

describe('nomes_alvos em GET /lotes/:id', () => {
  it('nome do ativo e rota do fluxo de cada alvo_id; alvo de outro site não aparece (P0-4)', async () => {
    await semTeto();
    const [a, b, c] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'Switch velho' } }, { dados: { nome: 'A' } }, { dados: { nome: 'B' } }] });
    const [f] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ entidade: 'fluxo', dados: { origem_ativo_id: b, destino_ativo_id: c } }] });
    const [outro] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s2, itens: [{ dados: { nome: 'Do outro site' } }] });
    const l = await lote(cons, ids.s1, [{ dados: { alvo_id: a, remover: true } }, { entidade: 'fluxo', dados: { alvo_id: f, porta: 1 } }, { dados: { alvo_id: outro, nome: 'X' } }]);
    for (const h of [gestor, cons]) expect((await lerLote(h, l)).nomes_alvos).toEqual({ [a]: 'Switch velho', [f]: 'A → B' });
    // a fila de revisão e o levantamento (achados ainda em rascunho) trazem o mesmo nome do alvo, só do site
    const lev = await ok<{ id: string }>(chamar(cons, 'POST', `${P}/levantamentos`, { site_id: ids.s1, tipo: 'visita', realizado_em: '2026-11-26' }), 201);
    for (const dados of [{ alvo_id: a, remover: true }, { alvo_id: outro, nome: 'Y' }]) await ok(chamar(cons, 'POST', `${P}/levantamentos/${lev.id}/achados`, { dados, evidencia: 'teste' }), 201);
    const fila = (await ok<{ nomes_alvos: Record<string, string> }>(chamar(cons, 'GET', `${P}/achados?site_id=${ids.s1}`), 200)).nomes_alvos;
    expect(fila).toMatchObject({ [a]: 'Switch velho' });
    expect(fila).not.toHaveProperty(outro);
    expect((await ok<{ nomes_alvos: Record<string, string> }>(chamar(cons, 'GET', `${P}/levantamentos/${lev.id}`), 200)).nomes_alvos).toEqual({ [a]: 'Switch velho' });
  });
});

/** D1 cujo `batch` roda `antes` (uma edição concorrente) e depois o batch de verdade; com `falhar`, lança. */
const dbCom = (antes: () => Promise<unknown>, falhar = false) => new Proxy(env.DB, { get: (t, k) => k === 'batch'
  ? async (stmts: D1PreparedStatement[]) => { await antes(); if (falhar) throw new Error('falha forçada'); return t.batch(stmts); }
  : (typeof (t as unknown as Record<string | symbol, unknown>)[k] === 'function' ? ((t as unknown as Record<string | symbol, (...a: unknown[]) => unknown>)[k]).bind(t) : (t as unknown as Record<string | symbol, unknown>)[k]) }) as D1Database;
const aprovarCom = (db: D1Database, l: string) => aprovarLote(db, chavesOt(env)!, { id: 'u-gestor', email: 'gestor@cliente.teste' }, 'proj-a', JSON.stringify([ids.s1, ids.s2]), l);
const NO_FUTURO = `strftime('%Y-%m-%d %H:%M:%f', 'now', '+1 second')`;

describe('revisão: fluxo por lote sem prender o lote e com a trava P1-4', () => {
  it('externo de ponta única: alterar para externo=false é erro do item; o lote conclui (o CHECK de ot_fluxos nunca é atingido)', async () => {
    await semTeto();
    const [a1] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'Ext 1' } }] });
    const [f] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ entidade: 'fluxo', dados: { origem_ativo_id: a1, externo: true, finalidade: 'Suporte' } }] });
    const l = await lote(cons, ids.s1, [{ entidade: 'fluxo', dados: { alvo_id: f, externo: false } }]);
    expect((await item0(gestor, l)).erros).toEqual([{ campo: 'externo', motivo: 'Fluxo de uma ponta só precisa ser externo' }]);
    expect(await aprovar(gestor, l)).toMatchObject({ recusados: 1, pendentes: 0 });
    expect((await lerLote(gestor, l)).lote.status).toBe('concluido');
    expect(await env.DB.prepare('SELECT externo FROM ot_fluxos WHERE id = ?').bind(f).first('externo')).toBe(1);
  });

  it('defesa na aprovação: item que chegaria ao CHECK é recusado; batch que lança volta o lote a em_revisao (nunca preso em gravando)', async () => {
    await semTeto();
    const [a1] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'Ext 2' } }] });
    const [f] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ entidade: 'fluxo', dados: { origem_ativo_id: a1, externo: true } }] });
    const l = await lote(cons, ids.s1, [{ entidade: 'fluxo', dados: { alvo_id: f, porta: 1 } }]);
    // o staging não passa mais pela validação: força o externo=0 direto no item
    await env.DB.prepare(`UPDATE ot_lote_itens SET dados = json_set(dados, '$.externo', 0) WHERE lote_id = ?`).bind(l).run();
    expect(await aprovar(gestor, l)).toMatchObject({ recusados: 1, atualizados: 0 });
    const l2 = await lote(cons, ids.s1, [{ entidade: 'fluxo', dados: { alvo_id: f, porta: 2 } }]);
    await expect(aprovarCom(dbCom(async () => null, true), l2)).rejects.toThrow('falha forçada');
    expect((await lerLote(gestor, l2)).lote.status).toBe('em_revisao');
    // a trilha diz que a aprovação parou e quanto ficou gravado, só com contagem (P0-6: sem nome nem IP)
    const t = await env.DB.prepare(`SELECT actor, details, entity_id FROM audit_logs WHERE action = 'ot.lote.aprovacao_interrompida' AND entity_id = ?`).bind(l2).all<{ actor: string; details: string; entity_id: string }>();
    expect(t.results).toEqual([{ actor: 'gestor@cliente.teste', details: `Aprovação do lote ${l2} interrompida: 0 item(ns) gravado(s) no lote; o resto segue pendente`, entity_id: l2 }]);
    expect(await aprovar(gestor, l2)).toMatchObject({ atualizados: 1, pendentes: 0 });
  });

  it('P1-4 no fluxo: alvo editado depois da revisão volta o item a pendente; edição entre a leitura e a gravação também', async () => {
    await semTeto();
    const [a1, a2] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'P1' } }, { dados: { nome: 'P2' } }] });
    const [f] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ entidade: 'fluxo', dados: { origem_ativo_id: a1, destino_ativo_id: a2, porta: 10 } }] });
    const l = await lote(cons, ids.s1, [{ entidade: 'fluxo', dados: { alvo_id: f, porta: 11 } }]);
    await env.DB.prepare(`UPDATE ot_fluxos SET porta = 99, updated_at = ${NO_FUTURO} WHERE id = ?`).bind(f).run();
    expect(await aprovar(gestor, l)).toMatchObject({ atualizados: 0, pendentes: 1 });
    expect(await item0(gestor, l)).toMatchObject({ decisao: 'pendente', motivo: expect.stringMatching(/mudou depois da revisão/) });
    expect(await env.DB.prepare('SELECT porta FROM ot_fluxos WHERE id = ?').bind(f).first('porta')).toBe(99);
    // revisado de novo; agora a edição concorrente chega entre a leitura e o batch: o WHERE do updated_at não sobrescreve
    await env.DB.prepare(`UPDATE ot_fluxos SET updated_at = '2026-01-01 00:00:00.000' WHERE id = ?`).bind(f).run();
    await env.DB.prepare(`UPDATE ot_lote_itens SET updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE lote_id = ?`).bind(l).run();
    const r = await aprovarCom(dbCom(() => env.DB.prepare(`UPDATE ot_fluxos SET porta = 77, updated_at = ${NO_FUTURO} WHERE id = ?`).bind(f).run()), l);
    expect(r).toMatchObject({ ok: true, pendentes: 1 });
    expect(await env.DB.prepare('SELECT porta FROM ot_fluxos WHERE id = ?').bind(f).first('porta')).toBe(77);
  });

  it('dois externos de uma ponta só do mesmo ativo, no mesmo lote: dois fluxos (o externo de ponta única não casa pelo índice)', async () => {
    await semTeto();
    const [a1] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'Dois acessos' } }] });
    const fs = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [
      { entidade: 'fluxo', dados: { origem_ativo_id: a1, externo: true, via_vpn: false, finalidade: 'Fornecedor' } },
      { entidade: 'fluxo', dados: { origem_ativo_id: a1, externo: true, via_vpn: true, finalidade: 'ONS' } }] });
    expect(new Set(fs).size).toBe(2);
    const { results } = await env.DB.prepare(`SELECT finalidade, via_vpn FROM ot_fluxos WHERE origem_ativo_id = ? AND status = 'ativo' ORDER BY finalidade`).bind(a1).all();
    expect(results).toEqual([{ finalidade: 'Fornecedor', via_vpn: 0 }, { finalidade: 'ONS', via_vpn: 1 }]);
  });

  it('remoção: edição entre a leitura e a gravação (WHERE do updated_at) não remove; o item fica pendente', async () => {
    await semTeto();
    const [id] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'Corrida' } }] });
    const l = await lote(cons, ids.s1, [{ dados: { alvo_id: id, remover: true } }]);
    const r = await aprovarCom(dbCom(() => env.DB.prepare(`UPDATE ot_ativos SET funcao = 'concorrente', updated_at = ${NO_FUTURO} WHERE id = ?`).bind(id).run()), l);
    expect(r).toMatchObject({ ok: true, removidos: 0, pendentes: 1 });
    expect(await env.DB.prepare('SELECT status, funcao FROM ot_ativos WHERE id = ?').bind(id).first()).toEqual({ status: 'ativo', funcao: 'concorrente' });
    expect(await item0(gestor, l)).toMatchObject({ decisao: 'pendente' });
  });
});

describe('PR3c: some a gravação direta; troca de ponta no achado de fluxo', () => {
  it('não há mais gravação direta de ativo nem de fluxo (decisão 3), para nenhum papel (404, nunca 405)', async () => {
    for (const h of [gestor, cons]) {
      expect((await chamar(h, 'POST', `${P}/ativos`, { site_id: ids.s1, nome: 'Direto' })).status).toBe(404);
      expect((await chamar(h, 'PUT', `${P}/ativos/x`, { nome: 'Direto' })).status).toBe(404);
      expect((await chamar(h, 'DELETE', `${P}/ativos/x`)).status).toBe(404);
      expect((await chamar(h, 'POST', `${P}/fluxos`, { site_id: ids.s1 })).status).toBe(404);
      expect((await chamar(h, 'PUT', `${P}/fluxos/x`, {})).status).toBe(404);
      expect((await chamar(h, 'DELETE', `${P}/fluxos/x`)).status).toBe(404);
    }
  });

  it('4.3.1 no lote: ativo do ARCiber incompleto é erro do item, com a lista dos campos', async () => {
    await semTeto();
    const l = await lote(cons, ids.s1, [{ dados: { nome: 'Sem campos', no_arciber: true, protocolos_portas: [] } }]);
    expect((await item0(gestor, l)).erros).toContainEqual(expect.objectContaining({ campo: '4.3.1', motivo: expect.stringContaining('4.3.1') }));
  });

  it('campo livre com IPv4, IPv6 ou MAC no nome do ativo ou na finalidade do fluxo: erro do achado e nunca chega ao lote (PII)', async () => {
    await semTeto();
    const [a1] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'Pii base' } }] });
    const lev = await ok<{ id: string }>(chamar(cons, 'POST', `${P}/levantamentos`, { site_id: ids.s1, tipo: 'visita', realizado_em: '2026-11-26' }), 201);
    const achar = async (entidade: string, dados: Record<string, unknown>) => (await ok<{ id: string; erros?: { campo: string }[] }>(
      chamar(cons, 'POST', `${P}/levantamentos/${lev.id}/achados`, { entidade, dados, evidencia: 'teste' }), 201));
    for (const nome of ['gw 10.0.0.1', 'host 2001:db8::1', 'aa:bb:cc:dd:ee:ff']) {
      const a = await achar('ativo', { nome });
      expect(a.erros, nome).toContainEqual(expect.objectContaining({ campo: 'nome' }));
    }
    const f = await achar('fluxo', { origem_ativo_id: a1, externo: true, finalidade: 'para aabb.ccdd.eeff' });
    expect(f.erros).toContainEqual(expect.objectContaining({ campo: 'finalidade' }));
    const l = await ok<{ id: string }>(chamar(cons, 'POST', `${P}/levantamentos/${lev.id}/enviar`, { achados: [f.id] }), 201);
    expect(JSON.stringify((await lerLote(gestor, l.id)).itens[0])).not.toContain('aabb.ccdd.eeff');
  });

  it('fluxo: achado por alvo_id que troca a ponta de ativo para zona (destino_zona_id sem limpar destino_ativo_id) nunca deixa as duas pontas do mesmo lado', async () => {
    await semTeto();
    const [a1, a2] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'Z1' } }, { dados: { nome: 'Z2' } }] });
    const [f] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ entidade: 'fluxo', dados: { origem_ativo_id: a1, destino_ativo_id: a2 } }] });
    const z = (await ok<{ id: string }>(chamar(cons, 'POST', `${P}/zonas`, { site_id: ids.s1, nome: 'Zona destino', nivel_purdue: 3 }), 201)).id;
    const l = await lote(cons, ids.s1, [{ entidade: 'fluxo', dados: { alvo_id: f, destino_zona_id: z } }]);
    expect((await item0(gestor, l)).erros[0]).toMatchObject({ campo: 'pontas' });
    expect(await aprovar(gestor, l)).toMatchObject({ atualizados: 0, pendentes: 0 });
    expect(await env.DB.prepare('SELECT destino_ativo_id AS da, destino_zona_id AS dz FROM ot_fluxos WHERE id = ?').bind(f).first()).toEqual({ da: a2, dz: null });
  });
});
