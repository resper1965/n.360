import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData, seedTwoProjects } from './helpers/d1';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { workerEnv, habilitarOt, concederModulos, designarConsultor, sessionFor } from './helpers/d1';
import { criarReferencia, lerReferencias, apagarReferencia } from '../src/services/ot-referencias';

const TODOS = JSON.stringify(['site1', 'site2', 'siteB']);
const A = 'proj-a', B = 'proj-b';
const run = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).run();
const ins = (id: string, cols: Record<string, string | null>) =>
  run(`INSERT INTO ot_referencias (id, project_id, ${Object.keys(cols).join(',')}, criado_por) VALUES (?, ?, ${Object.keys(cols).map(() => '?').join(',')}, 'u')`, id, A, ...Object.values(cols));
const nref = async () => (await env.DB.prepare('SELECT count(*) n FROM ot_referencias').first<{ n: number }>())!.n;

describe('ot_referencias (0115)', () => {
  beforeAll(async () => { await applySchema(); });
  beforeEach(async () => {
    await resetData(); await seedTwoProjects();
    for (const [p, r] of [[A, 'risk1'], [B, 'riskB']]) await run(`INSERT INTO risks (id, project_id, asset, threat) VALUES (?, ?, 'a', 't')`, r, p);
    await run(`INSERT INTO corrective_actions (id, project_id, title) VALUES ('acao1', ?, 'x')`, A);
    await run(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em, status) VALUES ('inc1', ?, 'IN-1', 't', '2026-10-01', 'aberto')`, A);
    for (const [id, p] of [['site1', A], ['site2', A], ['siteB', B]]) await run(`INSERT INTO ot_sites (id, project_id, nome) VALUES (?, ?, ?)`, id, p, id);
    await run(`INSERT INTO ot_ativos (id, project_id, site_id, nome) VALUES ('at1', ?, 'site1', 'RTU')`, A);
    await run(`INSERT INTO ot_ativos (id, project_id, site_id, nome) VALUES ('at2', ?, 'site2', 'PLC')`, A);
    for (const d of ['d1', 'd2']) await run(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, primeira_vez, ultima_vez) VALUES (?, ?, 'site1', 'fluxo', ?, 'x', 'x')`, d, A, d);
  });

  it('a conexão tem foreign_keys ligado (os CASCADE abaixo não passam em vazio)', async () => {
    expect((await env.DB.prepare('PRAGMA foreign_keys').first<{ foreign_keys: number }>())!.foreign_keys).toBe(1);
    await expect(ins('rx', { risk_id: 'nao-existe', ot_site_id: 'site1' })).rejects.toThrow();
  });

  it('CHECKs: exatamente um alvo do núcleo e ao menos um de OT', async () => {
    await expect(ins('r1', { risk_id: 'risk1', acao_id: 'acao1', ot_site_id: 'site1' })).rejects.toThrow(/CHECK/);
    await expect(ins('r2', { ot_site_id: 'site1' })).rejects.toThrow(/CHECK/);
    await expect(ins('r3', { risk_id: 'risk1' })).rejects.toThrow(/CHECK/);
    await ins('r4', { risk_id: 'risk1', ot_site_id: 'site1' });
  });

  it('CASCADE: apagar risco, ação, incidente, site ou ativo apaga a referência', async () => {
    await ins('a', { risk_id: 'risk1', ot_site_id: 'site1' });
    await ins('b', { acao_id: 'acao1', ot_site_id: 'site1' });
    await ins('c', { incidente_id: 'inc1', ot_site_id: 'site1' });
    await ins('d', { risk_id: 'risk1', ot_ativo_id: 'at2' });
    await run(`DELETE FROM risks WHERE id = 'risk1'`);
    expect(await nref()).toBe(2); // a e d saíram
    await run(`DELETE FROM corrective_actions WHERE id = 'acao1'`);
    await run(`DELETE FROM incidentes WHERE id = 'inc1'`);
    expect(await nref()).toBe(0);
    await run(`INSERT INTO risks (id, project_id, asset, threat) VALUES ('risk1', ?, 'a', 't')`, A);
    await ins('e', { risk_id: 'risk1', ot_site_id: 'site1' });
    await ins('f', { risk_id: 'risk1', ot_ativo_id: 'at2' });
    await run(`DELETE FROM ot_sites WHERE id = 'site1'`); // leva o ativo at1, os desvios e a referência 'e'
    expect(await nref()).toBe(1);
    await run(`DELETE FROM ot_sites WHERE id = 'site2'`);
    expect(await nref()).toBe(0);
  });

  it('UNIQUE(ot_desvio_id): um desvio por item; vários NULL passam; CASCADE do desvio', async () => {
    await ins('u1', { risk_id: 'risk1', ot_desvio_id: 'd1', ot_site_id: 'site1' });
    await expect(ins('u2', { acao_id: 'acao1', ot_desvio_id: 'd1', ot_site_id: 'site1' })).rejects.toThrow(/UNIQUE/);
    await ins('u3', { risk_id: 'risk1', ot_site_id: 'site1' });
    await ins('u4', { acao_id: 'acao1', ot_site_id: 'site1' });
    await run(`DELETE FROM ot_desvios WHERE id = 'd1'`);
    expect(await nref()).toBe(2);
  });

  it('FK composta: site/ativo de outro projeto não entra nem direto no banco', async () => {
    await expect(ins('x1', { risk_id: 'risk1', ot_site_id: 'siteB' })).rejects.toThrow(/FOREIGN KEY/);
  });

  it('serviço: recusa alvo de outro projeto, alvo removido, alvo duplo e desvio já ligado', async () => {
    const ok = await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_site_id: 'site1' }, 'u', TODOS);
    expect(ok.ok).toBe(true);
    const f = (r: Awaited<ReturnType<typeof criarReferencia>>) => (r.ok ? 'ok' : r.status);
    expect(f(await criarReferencia(env.DB, A, { tipo: 'risk', id: 'riskB' }, { ot_site_id: 'site1' }, 'u', TODOS))).toBe(404);
    expect(f(await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_site_id: 'siteB' }, 'u', TODOS))).toBe(404);
    expect(f(await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_site_id: 'site1', ot_ativo_id: 'at1' }, 'u', TODOS))).toBe(400);
    await run(`UPDATE ot_sites SET status = 'removido' WHERE id = 'site2'`);
    await run(`UPDATE ot_ativos SET status = 'removido' WHERE id = 'at1'`);
    expect(f(await criarReferencia(env.DB, A, { tipo: 'acao', id: 'acao1' }, { ot_site_id: 'site2' }, 'u', TODOS))).toBe(404);
    expect(f(await criarReferencia(env.DB, A, { tipo: 'acao', id: 'acao1' }, { ot_ativo_id: 'at1' }, 'u', TODOS))).toBe(404);
    expect(f(await criarReferencia(env.DB, A, { tipo: 'acao', id: 'acao1' }, { ot_desvio_id: 'd1' }, 'u', TODOS))).toBe('ok');
    expect(f(await criarReferencia(env.DB, A, { tipo: 'incidente', id: 'inc1' }, { ot_desvio_id: 'd1' }, 'u', TODOS))).toBe(409);
    expect(f(await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_ativo_id: 'at2' }, 'u', JSON.stringify(['site1'])))).toBe(404);
  });

  it('leitura: filtra por sites permitidos (ativo e desvio pelo site deles) e esconde removidos', async () => {
    await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_site_id: 'site1' }, 'u', TODOS);
    await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_ativo_id: 'at2' }, 'u', TODOS);
    await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_desvio_id: 'd1' }, 'u', TODOS);
    const todos = JSON.stringify(['site1', 'site2']);
    expect(await lerReferencias(env.DB, A, { nucleo: { tipo: 'risk', id: 'risk1' } }, todos)).toHaveLength(3);
    expect(await lerReferencias(env.DB, A, {}, JSON.stringify(['site1']))).toHaveLength(2);
    expect(await lerReferencias(env.DB, A, {}, JSON.stringify(['site2']))).toHaveLength(1);
    expect(await lerReferencias(env.DB, A, {}, '[]')).toHaveLength(0);
    expect(await lerReferencias(env.DB, B, {}, todos)).toHaveLength(0);
    expect(await lerReferencias(env.DB, A, { ot_ativo_id: 'at2' }, todos)).toHaveLength(1);
    await run(`UPDATE ot_ativos SET status = 'removido' WHERE id = 'at2'`);
    expect(await lerReferencias(env.DB, A, {}, todos)).toHaveLength(2);
  });

  it('serviço: site fora do escopo do técnico, tipo inválido, ativo em site removido', async () => {
    const r = await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_ativo_id: 'at2' }, 'u', JSON.stringify(['site1']));
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(!r.ok && r.error).toMatch(/não encontrado/);
    for (const tipo of ['constructor', '__proto__'])
      expect(await criarReferencia(env.DB, A, { tipo, id: 'x' } as never, { ot_site_id: 'site1' }, 'u', TODOS)).toMatchObject({ ok: false, status: 400, error: 'Tipo de alvo inválido' });
    expect(await lerReferencias(env.DB, A, { nucleo: { tipo: 'constructor', id: 'x' } as never }, TODOS)).toEqual([]);
    await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_ativo_id: 'at2' }, 'u', TODOS);
    await run(`UPDATE ot_sites SET status = 'removido' WHERE id = 'site2'`);
    expect(await lerReferencias(env.DB, A, {}, TODOS)).toHaveLength(0);
    expect(await criarReferencia(env.DB, A, { tipo: 'acao', id: 'acao1' }, { ot_ativo_id: 'at2' }, 'u', TODOS)).toMatchObject({ ok: false, status: 404 });
  });

  it('leitura por site inclui referências a ativos daquele site', async () => {
    await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_ativo_id: 'at1' }, 'u', TODOS);
    await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_ativo_id: 'at2' }, 'u', TODOS);
    expect(await lerReferencias(env.DB, A, { ot_site_id: 'site1' }, TODOS)).toHaveLength(1);
  });

  it('apagar com site restrito: fora do escopo é "não achou" (nem o 409 do vínculo do desvio vaza)', async () => {
    const SO2 = JSON.stringify(['site2']);
    const { ehVinculoDoDesvio } = await import('../src/services/ot-referencias');
    const r = await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_site_id: 'site1' }, 'u', TODOS);
    if (!r.ok) throw new Error();
    expect(await apagarReferencia(env.DB, A, r.id, SO2)).toBe(false);
    expect(await nref()).toBe(1);
    await run(`INSERT INTO ot_referencias (id, project_id, acao_id, ot_site_id, ot_desvio_id, criado_por) VALUES ('rd', ?, 'acao1', 'site1', 'd1', 'u')`, A);
    expect(await ehVinculoDoDesvio(env.DB, A, 'rd', SO2)).toBe(false);
    expect(await ehVinculoDoDesvio(env.DB, A, 'rd', TODOS)).toBe(true);
    expect(await apagarReferencia(env.DB, A, r.id, TODOS)).toBe(true);
  });

  it('apagar: só no próprio projeto', async () => {
    const r = await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_site_id: 'site1' }, 'u', TODOS);
    if (!r.ok) throw new Error();
    expect(await apagarReferencia(env.DB, B, r.id, TODOS)).toBe(false);
    expect(await apagarReferencia(env.DB, A, r.id, TODOS)).toBe(true);
    expect(await nref()).toBe(0);
  });
});

describe('rotas /ot/referencias', () => {
  const P = '/api/v1/projects/proj-a';
  const CHAVE = 'chave-ref-leitura';
  const AGENTE = { userId: 'cons:cons-ref@ness.lat', email: 'cons-ref@ness.lat', projectId: 'proj-a', concessaoId: 'c-ref' };
  type H = Record<string, string>;
  const chamar = (h: H, metodo: string, caminho: string, corpo?: unknown, extra: Record<string, unknown> = {}) =>
    app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), { ...workerEnv(), ...extra });
  let cons: H, tec: H, sem: H, chave: H, refId: string;

  beforeAll(async () => {
    await applySchema(); await resetData(); await seedTwoProjects(); await habilitarOt(A);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-tec', 'tec@c.teste', 'x', 'T', 'org_user', 'proj-a'), ('u-sem', 'sem@c.teste', 'x', 'S', 'org_user', 'proj-a')`),
      env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('key-ref', 'proj-a', ?, 'k', 'read', 'Active')`).bind(await sha256Hex(CHAVE)),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat) VALUES ('risk1', 'proj-a', 'a', 't'), ('riskB', 'proj-b', 'a', 't')`),
      env.DB.prepare(`INSERT INTO corrective_actions (id, project_id, title) VALUES ('acao1', 'proj-a', 'x')`),
      env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em, status) VALUES ('inc1', 'proj-a', 'IN-1', 't', '2026-10-01', 'aberto')`),
      env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('site1', 'proj-a', 'S1'), ('site2', 'proj-a', 'S2'), ('siteRem', 'proj-a', 'SR')`),
      env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, nome) VALUES ('at1', 'proj-a', 'site1', 'RTU'), ('at2', 'proj-a', 'site2', 'PLC')`),
      env.DB.prepare(`UPDATE ot_sites SET status = 'removido' WHERE id = 'siteRem'`),
      env.DB.prepare(`INSERT INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES ('u-tec', 'site2', 'proj-a', 'x')`),
    ]);
    await designarConsultor(AGENTE.email, 'proj-a'); await designarConsultor('cons-ref@ness.lat', 'proj-a');
    await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-ref', ?, 'proj-a', datetime('now', '+30 days'))`).bind(AGENTE.userId).run();
    await concederModulos(['u-tec', 'cons:cons-ref@ness.lat', AGENTE.userId], ['iso', 'ot']);
    await concederModulos(['u-sem'], ['iso']);
    const s = (id: string, role: string, extra = {}) => sessionFor({ id, email: `${id}@c.teste`, role, ...extra });
    cons = await sessionFor({ id: 'cons:cons-ref@ness.lat', email: 'cons-ref@ness.lat', role: 'consultor' });
    tec = await s('u-tec', 'org_user', { client_project_id: 'proj-a' });
    sem = await s('u-sem', 'org_user', { client_project_id: 'proj-a' });
    chave = { 'X-API-Key': CHAVE };
  });

  it('consultor cria (201), lê e filtra; técnico de outro site não a vê nem cria (403)', async () => {
    const r = await chamar(cons, 'POST', `${P}/ot/referencias`, { risk_id: 'risk1', ot_ativo_id: 'at1' });
    expect(r.status, await r.clone().text()).toBe(201);
    refId = (await r.json<{ id: string }>()).id;
    const l = await (await chamar(cons, 'GET', `${P}/ot/referencias?risk_id=risk1`)).json<{ referencias: { id: string }[] }>();
    expect(l.referencias.map((x) => x.id)).toEqual([refId]);
    expect((await (await chamar(cons, 'GET', `${P}/ot/referencias?ot_site_id=site1`)).json<{ referencias: unknown[] }>()).referencias).toHaveLength(1);
    expect((await (await chamar(cons, 'GET', `${P}/ot/referencias?ot_site_id=site2`)).json<{ referencias: unknown[] }>()).referencias).toHaveLength(0);
    // técnico só tem o site2: a referência ao ativo do site1 não aparece
    const t = await chamar(tec, 'GET', `${P}/ot/referencias`);
    expect(t.status).toBe(200);
    expect((await t.json<{ referencias: unknown[] }>()).referencias).toEqual([]);
    expect((await chamar(tec, 'POST', `${P}/ot/referencias`, { risk_id: 'risk1', ot_ativo_id: 'at1' })).status).toBe(403);
    expect((await chamar(tec, 'DELETE', `${P}/ot/referencias/${refId}`)).status).toBe(403);
    // o técnico vê o que é do site dele
    const r2 = await chamar(cons, 'POST', `${P}/ot/referencias`, { acao_id: 'acao1', ot_site_id: 'site2' });
    expect(r2.status).toBe(201);
    expect((await (await chamar(tec, 'GET', `${P}/ot/referencias`)).json<{ referencias: unknown[] }>()).referencias).toHaveLength(1);
  });

  it('corpo estrito: sem alvo do núcleo, dois alvos, sem alvo de OT ou campo extra → 400', async () => {
    for (const b of [{ ot_site_id: 'site1' }, { risk_id: 'risk1', acao_id: 'acao1', ot_site_id: 'site1' }, { risk_id: 'risk1' }, { risk_id: 'risk1', ot_site_id: 'site1', project_id: 'proj-b' }])
      expect((await chamar(cons, 'POST', `${P}/ot/referencias`, b)).status, JSON.stringify(b)).toBe(400);
  });

  it('pessoa sem ot, chave de API e agente: 403 em GET/POST/DELETE', async () => {
    for (const [h, extra] of [[sem, {}], [chave, {}], [{}, { AGENTE }]] as [H, Record<string, unknown>][]) {
      for (const [m, u, b] of [['GET', '', undefined], ['POST', '', { risk_id: 'risk1', ot_site_id: 'site1' }], ['DELETE', `/${refId}`, undefined]] as const) {
        const r = await chamar(h, m, `${P}/ot/referencias${u}`, b, extra);
        expect(r.status, `${m} ${JSON.stringify(h)}`).toBe(403);
        expect(await r.text()).not.toContain(refId);
      }
    }
    expect(await nref()).toBe(2);
  });

  it('alvo do núcleo de outro projeto: 404; alvo de OT removido: 404', async () => {
    expect((await chamar(cons, 'POST', `${P}/ot/referencias`, { risk_id: 'riskB', ot_site_id: 'site1' })).status).toBe(404);
    expect((await chamar(cons, 'POST', `${P}/ot/referencias`, { risk_id: 'risk1', ot_site_id: 'siteRem' })).status).toBe(404);
  });

  it('DELETE: 200 e some; de novo 404; de outro projeto 404', async () => {
    expect((await chamar(cons, 'DELETE', `${P}/ot/referencias/${refId}`)).status).toBe(200);
    expect((await chamar(cons, 'DELETE', `${P}/ot/referencias/${refId}`)).status).toBe(404);
    const trilha = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action LIKE 'ot.referencia.%'`).all<{ details: string }>();
    expect(trilha.results.map((x) => x.details).sort()).toEqual(['Referência criada', 'Referência criada', 'Referência removida']);
  });

  it('o núcleo não vaza a referência (listas e detalhe, pessoa com ot)', async () => {
    const r = await chamar(cons, 'POST', `${P}/ot/referencias`, { incidente_id: 'inc1', ot_ativo_id: 'at1' });
    const id = (await r.json<{ id: string }>()).id;
    await chamar(cons, 'POST', `${P}/ot/referencias`, { risk_id: 'risk1', ot_ativo_id: 'at1' });
    for (const rota of ['risks', 'capa', 'incidentes', 'incidentes/inc1']) {
      const res = await chamar(cons, 'GET', `${P}/${rota}`);
      expect(res.status, rota).toBe(200);
      const t = await res.text();
      for (const x of [id, 'ot_site_id', 'ot_ativo_id', 'ot_referencias', 'at1']) expect(t, `${rota} vazou ${x}`).not.toContain(x);
    }
  });

  it('a exportação do projeto (pessoa com ot e chave de leitura) não leva a tabela nem os ids do OT', async () => {
    for (const h of [cons, chave]) {
      const res = await chamar(h, 'GET', `${P}/export`);
      expect(res.status).toBe(200);
      const t = await res.text();
      for (const x of ['ot_referencias', 'at1', 'ot_ativo_id']) expect(t).not.toContain(x);
    }
  });
});
