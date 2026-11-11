import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { manutencaoDiaria } from '../src/manutencao';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

// Levantamento do n.ot (spec 2026-11-01, L2): achado de fluxo. Base da L1: sessões, achados, confronto sem oráculo, envio ao lote. D1 real.
type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
const chamar = (h: H, metodo: string, caminho: string, corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
}), workerEnv());
const criar = async (h: H, rota: string, corpo: unknown) => {
  const r = await chamar(h, 'POST', `${P}/${rota}`, corpo);
  expect(r.status, `${rota} ${await r.clone().text()}`).toBe(201);
  return (await r.json<{ id: string }>()).id;
};

let gestor: H, cons: H;
const ids: Record<string, string> = {};
type Ach = { id: string; situacao: string; lote_id: string | null; desfecho: string | null; motivo?: string; registro_id?: string };
type Item = { id: string; decisao: string };
const achados = async (lev: string) => (await (await chamar(cons, 'GET', `${P}/levantamentos/${lev}`)).json<{ achados: Ach[] }>()).achados;
const achado = async (id: string, lev = ids.lev) => (await achados(lev)).find((a) => a.id === id)!;
const novo = (nome: string, ip: string, lev = ids.lev) => criar(cons, `levantamentos/${lev}/achados`, { dados: { nome, ip }, evidencia: 'e' });
const enviar = async (lista: string[]) => { const r = await chamar(cons, 'POST', `${P}/levantamentos/${ids.lev}/enviar`, { achados: lista }); expect(r.status).toBe(201); return (await r.json<{ id: string }>()).id; };
const itens = async (lote: string) => (await (await chamar(gestor, 'GET', `${P}/lotes/${lote}`)).json<{ itens: Item[] }>()).itens;
const recusar = (h: H, lote: string, item: string, motivo = 'IP errado') => chamar(h, 'POST', `${P}/lotes/${lote}/itens/${item}/recusar`, { motivo });

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-gestor', 'gestor@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a')`).run();
  await designarConsultor('cons-ot@ness.lat', 'proj-a');
  await concederModulos(['u-gestor', 'cons:cons-ot@ness.lat'], ['ot']);
  gestor = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  cons = await sessionFor({ id: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', role: 'consultor' });
  ids.site = await criar(cons, 'sites', { nome: 'SE Item' });
  ids.lev = await criar(cons, 'levantamentos', { site_id: ids.site, tipo: 'visita', realizado_em: '2026-11-05' });
});

describe('decisão item a item', () => {
  it('recusar um item pendente devolve o achado a rascunho na mesma resposta, com o motivo', async () => {
    const [a1, a2, a3] = [await novo('I1', '10.8.0.1'), await novo('I2', '10.8.0.2'), await novo('I3', '10.8.0.3')];
    const lote = await enviar([a1, a2, a3]);
    const [i1] = await itens(lote);
    const r = await recusar(gestor, lote, i1.id);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(await achado(a1)).toMatchObject({ situacao: 'rascunho', lote_id: null, desfecho: 'recusado', motivo: 'IP errado' });
    expect(await achado(a2)).toMatchObject({ situacao: 'enviado', desfecho: null });
    // aprovar grava os 2 restantes
    expect((await chamar(gestor, 'POST', `${P}/lotes/${lote}/aprovar`)).status).toBe(200);
    const gravados = await Promise.all([a2, a3].map((id) => achado(id)));
    for (const g of gravados) expect(g).toMatchObject({ situacao: 'enviado', desfecho: 'no_inventario', registro_id: expect.any(String) });
    expect(await achado(a1)).toMatchObject({ situacao: 'rascunho', desfecho: 'recusado' });
    // item já decidido: 409
    expect((await recusar(gestor, lote, i1.id)).status).toBe(409);
  });

  it('autor do lote recebe 403; item inexistente ou de outro lote, 404; motivo curto, 400', async () => {
    const a = await novo('I4', '10.8.0.4');
    const lote = await enviar([a]);
    const [i] = await itens(lote);
    expect((await recusar(cons, lote, i.id)).status).toBe(403);
    expect((await recusar(gestor, lote, 'nao-existe')).status).toBe(404);
    expect((await recusar(gestor, 'lote-que-nao-existe', i.id)).status).toBe(404);
    expect((await recusar(gestor, lote, i.id, 'x')).status).toBe(400);
    expect(await achado(a)).toMatchObject({ situacao: 'enviado' });
  });

  it('item de lote de outro projeto é 404', async () => {
    await env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('site-b2', 'proj-b', 'B')`).run();
    await env.DB.prepare(`INSERT INTO ot_lotes (id, project_id, site_id, fonte, status, criado_por) VALUES ('lote-b2', 'proj-b', 'site-b2', 'manual', 'em_revisao', 'x')`).run();
    await env.DB.prepare(`INSERT INTO ot_lote_itens (id, lote_id, project_id, linha, dados, erros, decisao) VALUES ('item-b2', 'lote-b2', 'proj-b', 1, '{}', '[]', 'pendente')`).run();
    expect((await recusar(gestor, 'lote-b2', 'item-b2')).status).toBe(404);
    expect(await env.DB.prepare(`SELECT decisao FROM ot_lote_itens WHERE id = 'item-b2'`).first()).toEqual({ decisao: 'pendente' });
  });

  it('rejeitar o lote devolve todos os achados na hora, com "Lote rejeitado"; reenviar dá novo item e desfecho null', async () => {
    const [a1, a2] = [await novo('I5', '10.8.0.5'), await novo('I6', '10.8.0.6')];
    const lote = await enviar([a1, a2]);
    expect((await chamar(gestor, 'POST', `${P}/lotes/${lote}/rejeitar`, { motivo: 'lote errado' })).status).toBe(200);
    for (const id of [a1, a2]) expect(await achado(id)).toMatchObject({ situacao: 'rascunho', lote_id: null, desfecho: 'recusado', motivo: 'Lote rejeitado' });
    const antes = await env.DB.prepare('SELECT lote_item_id FROM ot_achados WHERE id = ?').bind(a1).first<{ lote_item_id: string }>();
    const lote2 = await enviar([a1]);
    const depois = await env.DB.prepare('SELECT lote_item_id FROM ot_achados WHERE id = ?').bind(a1).first<{ lote_item_id: string }>();
    expect(depois!.lote_item_id).not.toBe(antes!.lote_item_id);
    expect(lote2).not.toBe(lote);
    expect(await achado(a1)).toMatchObject({ situacao: 'enviado', desfecho: null });
  });

  it('a fila do site traz o desfecho dos achados recusados', async () => {
    const a = await novo('I7', '10.8.0.7');
    const lote = await enviar([a]);
    await recusar(gestor, lote, (await itens(lote))[0].id, 'sem evidência');
    const { achados: fila } = await (await chamar(cons, 'GET', `${P}/achados?site_id=${ids.site}`)).json<{ achados: Ach[] }>();
    expect(fila.find((x) => x.id === a)).toMatchObject({ desfecho: 'recusado', motivo: 'sem evidência' });
  });

  it('enviar do site ignora achado de levantamento arquivado', async () => {
    const lev2 = await criar(cons, 'levantamentos', { site_id: ids.site, tipo: 'visita', realizado_em: '2026-11-06' });
    const a = await novo('I8', '10.8.0.8', lev2);
    await env.DB.prepare(`UPDATE ot_levantamentos SET status = 'removido' WHERE id = ?`).bind(lev2).run();
    const r = await chamar(cons, 'POST', `${P}/sites/${ids.site}/enviar`, { achados: [a] });
    expect(r.status).toBe(400);
    expect(await env.DB.prepare('SELECT situacao FROM ot_achados WHERE id = ?').bind(a).first()).toEqual({ situacao: 'rascunho' });
  });
});
