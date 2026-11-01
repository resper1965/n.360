import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

// Levantamento do n.ot (spec 2026-11-01, L1): sessões, achados, confronto sem oráculo, envio ao lote. D1 real.
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

let gestor: H, tec: H, cons: H, cli: H;
const ids: Record<string, string> = {};
beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
    ('u-gestor', 'gestor@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'),
    ('u-tec', 'tec@cliente.teste', 'x', 'Técnico', 'org_user', 'proj-a'),
    ('u-cli', 'cli@cliente.teste', 'x', 'Leitura', 'client', 'proj-a')`).run();
  await designarConsultor('cons-ot@ness.lat', 'proj-a');
  await concederModulos(['u-gestor', 'u-tec', 'u-cli', 'cons:cons-ot@ness.lat'], ['ot']);
  gestor = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  tec = await sessionFor({ id: 'u-tec', email: 'tec@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  cli = await sessionFor({ id: 'u-cli', email: 'cli@cliente.teste', role: 'client', client_project_id: 'proj-a' });
  cons = await sessionFor({ id: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', role: 'consultor' });
  ids.s1 = await criar(cons, 'sites', { nome: 'SE Norte' });
  ids.s2 = await criar(cons, 'sites', { nome: 'SE Sul' });
  ids.a1 = await criar(cons, 'ativos', { site_id: ids.s1, nome: 'RTU 1', ip: '10.1.1.10' });
  expect((await chamar(gestor, 'POST', `${P}/acessos`, { user_id: 'u-tec', site_id: ids.s1 })).status).toBe(201);
  ids.lev1 = await criar(cons, 'levantamentos', { site_id: ids.s1, tipo: 'entrevista', realizado_em: '2026-11-01', funcao: 'Operador', turno: 'B', notas: 'usa TeamViewer' });
  ids.lev2 = await criar(cons, 'levantamentos', { site_id: ids.s2, tipo: 'visita', realizado_em: '2026-11-01' });
});

describe('levantamento: acesso e texto livre', () => {
  it('roteiro lista 15 perguntas em ordem', async () => {
    const r = await chamar(cons, 'GET', `${P}/roteiro`);
    const { perguntas } = await r.json<{ perguntas: { ordem: number }[] }>();
    expect(perguntas.length).toBe(15);
    expect(perguntas[0].ordem).toBe(1);
  });

  it('técnico e cliente não criam sessão; técnico só lê sessões dos sites dele', async () => {
    expect((await chamar(tec, 'POST', `${P}/levantamentos`, { site_id: ids.s1, tipo: 'visita', realizado_em: '2026-11-01' })).status).toBe(403);
    expect((await chamar(cli, 'POST', `${P}/levantamentos`, { site_id: ids.s1, tipo: 'visita', realizado_em: '2026-11-01' })).status).toBe(403);
    const lista = await (await chamar(tec, 'GET', `${P}/levantamentos`)).json<{ levantamentos: { id: string }[] }>();
    expect(lista.levantamentos.map((l) => l.id)).toEqual([ids.lev1]);
    expect((await chamar(tec, 'GET', `${P}/levantamentos/${ids.lev2}`)).status).toBe(404);
  });

  it('notas com IP ou e-mail: 400; chave de API: 403 (P0-2)', async () => {
    expect((await chamar(cons, 'PUT', `${P}/levantamentos/${ids.lev1}`, { notas: 'IHM em 10.0.0.5' })).status).toBe(400);
    expect((await chamar(cons, 'PUT', `${P}/levantamentos/${ids.lev1}`, { notas: 'fale com ana@x.com' })).status).toBe(400);
    const r = await app.fetch(new Request(`http://localhost${P}/levantamentos`, { headers: { 'X-API-Key': 'qualquer' } }), workerEnv());
    expect([401, 403]).toContain(r.status);
  });

  it('documento sem título: 400', async () => {
    expect((await chamar(cons, 'POST', `${P}/levantamentos`, { site_id: ids.s1, tipo: 'documento', realizado_em: '2026-11-01' })).status).toBe(400);
  });
});

describe('achados: confronto sem oráculo e envio ao lote', () => {
  it('achado com IP de ativo existente: consultor vê "confirma"; técnico não recebe confronto', async () => {
    ids.ach1 = await criar(cons, `levantamentos/${ids.lev1}/achados`, { dados: { nome: 'RTU 1', ip: '10.1.1.10' }, evidencia: 'RTU da sala' });
    ids.ach2 = await criar(cons, `levantamentos/${ids.lev1}/achados`, { dados: { nome: 'Notebook IHM', ip: '10.1.1.99' }, evidencia: 'notebook pessoal na IHM' });
    const c = await (await chamar(cons, 'GET', `${P}/levantamentos/${ids.lev1}`)).json<{ achados: { id: string; confronto?: string; alvo_id?: string }[] }>();
    expect(c.achados.find((a) => a.id === ids.ach1)).toMatchObject({ confronto: 'confirma', alvo_id: ids.a1 });
    expect(c.achados.find((a) => a.id === ids.ach2)).toMatchObject({ confronto: 'novo' });
    const t = await (await chamar(tec, 'GET', `${P}/levantamentos/${ids.lev1}`)).text();
    expect(t).not.toMatch(/confronto|alvo_id/);
    expect(t).not.toContain('10.1.1.99');
  });

  it('leitura sem máscara da sessão grava ot.inventario.ver_sensivel (P0-6); mascarada não grava', async () => {
    const conta = async () => (await env.DB.prepare(`SELECT count(*) AS n FROM audit_logs WHERE action = 'ot.inventario.ver_sensivel'`).first<{ n: number }>())!.n;
    const n0 = await conta();
    expect((await chamar(cons, 'GET', `${P}/levantamentos/${ids.lev1}`)).status).toBe(200);
    expect(await conta()).toBe(n0 + 1);
    const l = await env.DB.prepare(`SELECT entity_type, entity_id, details FROM audit_logs WHERE action = 'ot.inventario.ver_sensivel' ORDER BY rowid DESC LIMIT 1`).first<Record<string, string>>();
    expect(l).toMatchObject({ entity_type: 'ot_levantamento', entity_id: ids.lev1 });
    expect(l!.details).not.toMatch(/10\.1\.1/);
    expect((await chamar(tec, 'GET', `${P}/levantamentos/${ids.lev1}`)).status).toBe(200);
    expect(await conta()).toBe(n0 + 1);
  });

  it('enviar cria lote ligado à sessão; quem criou não aprova; o gestor aprova', async () => {
    const r = await chamar(cons, 'POST', `${P}/levantamentos/${ids.lev1}/enviar`, { achados: [ids.ach2] });
    expect(r.status, await r.clone().text()).toBe(201);
    const { id: lote } = await r.json<{ id: string }>();
    expect(await env.DB.prepare('SELECT levantamento_id FROM ot_lotes WHERE id = ?').bind(lote).first()).toEqual({ levantamento_id: ids.lev1 });
    expect((await chamar(cons, 'POST', `${P}/lotes/${lote}/aprovar`)).status).toBe(403);
    expect((await chamar(gestor, 'POST', `${P}/lotes/${lote}/aprovar`)).status).toBe(200);
    expect((await chamar(cons, 'POST', `${P}/levantamentos/${ids.lev1}/enviar`, { achados: [ids.ach2] })).status).toBe(400); // já enviado
    expect((await chamar(cons, 'PUT', `${P}/levantamentos/${ids.lev1}/achados/${ids.ach2}`, { evidencia: 'outra' })).status).toBe(409);
  });

  it('IP do achado (criado e editado pela rota) chega intacto ao ativo aprovado: AAD do id da linha', async () => {
    const novo = await criar(cons, `levantamentos/${ids.lev1}/achados`, { dados: { nome: 'Switch campo', ip: '10.1.1.77' }, evidencia: 'switch no painel' });
    const editado = await criar(cons, `levantamentos/${ids.lev1}/achados`, { dados: { nome: 'Gateway celular' }, evidencia: 'modem 4G' });
    expect((await chamar(cons, 'PUT', `${P}/levantamentos/${ids.lev1}/achados/${editado}`, { dados: { nome: 'Gateway celular', ip: '10.1.1.78' } })).status).toBe(200);
    const r = await chamar(cons, 'POST', `${P}/levantamentos/${ids.lev1}/enviar`, { achados: [novo, editado] });
    expect(r.status, await r.clone().text()).toBe(201);
    expect((await chamar(gestor, 'POST', `${P}/lotes/${(await r.json<{ id: string }>()).id}/aprovar`)).status).toBe(200);
    const { ativos } = await (await chamar(cons, 'GET', `${P}/ativos?site_id=${ids.s1}`)).json<{ ativos: { nome: string; ip: string }[] }>();
    expect(ativos.find((a) => a.nome === 'Switch campo')?.ip).toBe('10.1.1.77');
    expect(ativos.find((a) => a.nome === 'Gateway celular')?.ip).toBe('10.1.1.78');
  });

  it('teto de 2.000 achados por sessão', async () => {
    await env.DB.prepare(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 2000)
      INSERT INTO ot_achados (id, project_id, levantamento_id, dados, evidencia, criado_por) SELECT 'massa-'||i, 'proj-a', ?, '{}', 'x', 'u' FROM n`).bind(ids.lev2).run();
    expect((await chamar(cons, 'POST', `${P}/levantamentos/${ids.lev2}/achados`, { dados: { nome: 'x' }, evidencia: 'y' })).status).toBe(400);
  });

  it('planilha da Coleta ligada a uma sessão documental grava levantamento_id; sessão de outro tipo é recusada', async () => {
    const doc = await criar(cons, 'levantamentos', { site_id: ids.s1, tipo: 'documento', realizado_em: '2026-11-01', documento_titulo: 'Inventário 2023' });
    const enviar = (lev: string) => {
      const fd = new FormData();
      fd.set('site_id', ids.s1); fd.set('levantamento_id', lev);
      fd.set('file', new File(['nome;fabricante\nSwitch A;Fab'], 'inv.csv'));
      return app.fetch(new Request(`http://localhost${P}/lotes`, { method: 'POST', headers: cons, body: fd }), workerEnv());
    };
    const r = await enviar(doc);
    expect(r.status, await r.clone().text()).toBe(201);
    const { id } = await r.json<{ id: string }>();
    expect(await env.DB.prepare('SELECT levantamento_id FROM ot_lotes WHERE id = ?').bind(id).first()).toEqual({ levantamento_id: doc });
    expect((await enviar(ids.lev1)).status).toBe(400); // lev1 é entrevista
  });

  it('sessão documental não perde o título: documento_titulo null é 400', async () => {
    const doc = await criar(cons, 'levantamentos', { site_id: ids.s1, tipo: 'documento', realizado_em: '2026-11-01', documento_titulo: 'Diagrama de rede' });
    expect((await chamar(cons, 'PUT', `${P}/levantamentos/${doc}`, { documento_titulo: null })).status).toBe(400);
    expect((await chamar(cons, 'PUT', `${P}/levantamentos/${ids.lev1}`, { documento_titulo: null })).status).toBe(200); // entrevista: título opcional
  });

  it('1.500 achados em rascunho: GET com confronto em todos, sem uma consulta por achado', async () => {
    const lev = await criar(cons, 'levantamentos', { site_id: ids.s1, tipo: 'visita', realizado_em: '2026-11-02' });
    await env.DB.prepare(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 1500)
      INSERT INTO ot_achados (id, project_id, levantamento_id, dados, evidencia, criado_por) SELECT 'muitos-'||i, 'proj-a', ?, '{"nome":"RTU 1"}', 'x', 'u' FROM n`).bind(lev).run();
    let consultas = 0;
    const db = new Proxy(env.DB, { get: (t, k) => k === 'prepare' ? (sql: string) => { consultas++; return t.prepare(sql); } : Reflect.get(t, k).bind?.(t) ?? Reflect.get(t, k) });
    const r = await app.fetch(new Request(`http://localhost${P}/levantamentos/${lev}`, { headers: cons }), { ...workerEnv(), DB: db });
    expect(r.status).toBe(200);
    const { achados } = await r.json<{ achados: { confronto?: string }[] }>();
    expect(achados).toHaveLength(1500);
    expect(achados.every((a) => a.confronto === 'novo' || a.confronto === 'confirma')).toBe(true);
    expect(consultas).toBeLessThan(50);
  });

  it('remoção é lógica: some da lista e do GET', async () => {
    expect((await chamar(cons, 'DELETE', `${P}/levantamentos/${ids.lev2}`)).status).toBe(200);
    expect((await chamar(cons, 'GET', `${P}/levantamentos/${ids.lev2}`)).status).toBe(404);
    expect(await env.DB.prepare('SELECT status FROM ot_levantamentos WHERE id = ?').bind(ids.lev2).first()).toEqual({ status: 'removido' });
  });
});
