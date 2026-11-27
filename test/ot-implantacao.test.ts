import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

// Spec 2026-11-26 §3 (PR6, Task 6.1): a lista de verificação do projeto, só contagens, só para quem edita.
type H = Record<string, string>;
type Passo = { id: string; estado: string; detalhe: string; link: Record<string, string> };
const P = '/api/v1/projects/proj-a/ot';
const CHAVE = 'chave-ot-implantacao';
const AGENTE = { userId: 'cons:cons-impl@ness.lat', email: 'cons-impl@ness.lat', projectId: 'proj-a', concessaoId: 'c-impl' };
const chamar = (h: H, caminho = `${P}/implantacao`, extra: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, { method: 'GET', headers: h }), { ...workerEnv(), ...extra });
const lista = async (h: H) => {
  const r = await chamar(h);
  expect(r.status, await r.clone().text()).toBe(200);
  return (await r.json<{ passos: Passo[] }>()).passos;
};
const passo = async (h: H, id: string) => (await lista(h)).find((p) => p.id === id)!;
const limpar = () => env.DB.batch([
  env.DB.prepare(`DELETE FROM ot_fornecedores`), env.DB.prepare(`DELETE FROM partes WHERE id LIKE 'pf-%'`),
  env.DB.prepare(`DELETE FROM ot_sensor_envios`), env.DB.prepare(`DELETE FROM ot_sensor_credenciais`), env.DB.prepare(`DELETE FROM ot_sensores`),
  env.DB.prepare(`DELETE FROM ot_site_acessos`), env.DB.prepare(`DELETE FROM ot_sites`),
  env.DB.prepare(`DELETE FROM project_governance WHERE job_title = 'Gestor ARCiber'`),
  env.DB.prepare(`UPDATE projects SET agente_coleta_ot = 0`), env.DB.prepare(`UPDATE users SET ativo = 1`),
]);
const site = (id: string, projeto = 'proj-a', extra = '') =>
  env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, created_at${extra ? ', ' + extra.split('=')[0] : ''}) VALUES (?, ?, ?, '2026-01-0${id.slice(-1)}'${extra ? ', ' + extra.split('=')[1] : ''})`).bind(id, projeto, `Site ${id} Exemplo`).run();
const sonda = (id: string, siteId: string, situacao = 'ativa') =>
  env.DB.prepare(`INSERT INTO ot_sensores (id, project_id, site_id, nome, faixa_origem, criado_por, situacao) VALUES (?, 'proj-a', ?, 'Sonda Norte', '10.0.0.0/24', 'x', ?)`).bind(id, siteId, situacao).run();


let cons: H, tec: H, cli: H, pa: H, gestor: H;
beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-tec', 'tec@cliente.teste', 'x', 'Técnico', 'org_user', 'proj-a'),
      ('u-cli', 'cli@cliente.teste', 'x', 'Leitura', 'client', 'proj-a'),
      ('u-gestor', 'gestor@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-pa', 'pa@ness.lat', 'x', 'PA', 'platform_admin')`),
    env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('key-impl', 'proj-a', ?, 'escrita', 'write', 'Active')`).bind(await sha256Hex(CHAVE)),
  ]);
  await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-b', 'b@cliente.teste', 'x', 'B', 'org_user', 'proj-b')`).run();
  await designarConsultor(AGENTE.email, 'proj-a');
  await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-impl', ?, 'proj-a', datetime('now', '+30 days'))`).bind(AGENTE.userId).run();
  await concederModulos(['u-tec', 'u-cli', 'u-gestor', 'u-pa', 'u-b', AGENTE.userId], ['ot']);
  cons = await sessionFor({ id: AGENTE.userId, email: AGENTE.email, role: 'consultor' });
  tec = await sessionFor({ id: 'u-tec', email: 'tec@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  cli = await sessionFor({ id: 'u-cli', email: 'cli@cliente.teste', role: 'client', client_project_id: 'proj-a' });
  gestor = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  pa = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
});


afterEach(limpar);
describe('GET /ot/implantacao', () => {
  it('projeto vazio: tudo falta, agente é opcional, na ordem do spec (consultor não conta como pessoa do cliente)', async () => {
    await env.DB.prepare(`DELETE FROM usuario_modulos WHERE user_id IN ('u-tec', 'u-cli', 'u-gestor')`).run();
    const ps = await lista(cons);
    await concederModulos(['u-tec', 'u-cli', 'u-gestor'], ['ot']);
    expect(ps.map((p) => [p.id, p.estado])).toEqual([['modulo', 'falta'], ['gestor', 'falta'], ['tecnicos', 'falta'], ['site', 'falta'],
      ['sonda', 'falta'], ['agente', 'opcional'], ['fornecedores', 'falta'], ['assessment', 'falta'], ['base', 'falta']]);
    expect(ps.find((p) => p.id === 'base')!.link).toEqual({ tela: 'implantacao' });
  });

  it('projeto com sites: feito/falta corretos; base leva ao primeiro site em implantação', async () => {
    await site('s1'); await site('s2');
    await env.DB.batch([
      env.DB.prepare(`UPDATE projects SET agente_coleta_ot = 1 WHERE id = 'proj-a'`),
      env.DB.prepare(`INSERT INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES ('u-tec', 's1', 'proj-a', 'x')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('proj-a', 'G', 'gestor@cliente.teste', 'tech', 'Gestor ARCiber')`),
    ]);
    const ps = Object.fromEntries((await lista(cons)).map((p) => [p.id, p]));
    expect(ps.modulo.estado).toBe('feito');
    expect(ps.gestor.estado).toBe('feito');
    expect(ps.tecnicos).toMatchObject({ estado: 'feito', detalhe: '1 acesso concedido' });
    expect(ps.site).toMatchObject({ estado: 'feito', detalhe: '2 sites', link: { tela: 'implantacao', aba: 'novo-site' } });
    expect(ps.agente.estado).toBe('feito');
    expect(ps.base).toMatchObject({ estado: 'falta', link: { tela: 'site', site: 's1' } });
    await env.DB.prepare(`UPDATE ot_sites SET fase = 'em_operacao', base_aprovada_em = datetime('now') WHERE id = 's1'`).run();
    expect(await passo(cons, 'base')).toMatchObject({ estado: 'feito', detalhe: '1 base aprovada', link: { tela: 'site', site: 's2' } });
  });

  it('pessoa do cliente sem o n.ot, ou desativada, não conta no passo modulo', async () => {
    await env.DB.prepare(`DELETE FROM usuario_modulos WHERE user_id IN ('u-tec', 'u-cli', 'u-gestor')`).run();
    await concederModulos(['u-tec'], ['ot']);
    try {
      expect((await passo(cons, 'modulo')).estado).toBe('feito');
      await env.DB.prepare(`UPDATE users SET ativo = 0 WHERE id = 'u-tec'`).run();
      expect((await passo(cons, 'modulo')).estado).toBe('falta');
    } finally { await concederModulos(['u-cli', 'u-gestor'], ['ot']); await concederModulos(['u-tec'], ['ot']); }
  });

  it('isolamento: sites, acessos, sondas e base de outro projeto não contam', async () => {
    await site('s1', 'proj-b');
    await env.DB.batch([
      env.DB.prepare(`UPDATE ot_sites SET base_aprovada_em = datetime('now') WHERE id = 's1'`),
      env.DB.prepare(`INSERT INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES ('u-b', 's1', 'proj-b', 'x')`),
      env.DB.prepare(`UPDATE projects SET agente_coleta_ot = 1 WHERE id = 'proj-b'`),
    ]);
    const ps = await lista(cons);
    expect(ps.filter((p) => p.estado === 'feito').map((p) => p.id)).toEqual(['modulo']); // as três contas do cliente de proj-a têm o ot
    expect(ps.find((p) => p.id === 'agente')!.estado).toBe('opcional');
  });

  it('site removido não conta em tecnicos, site, base nem fornecedores', async () => {
    await site('s1', 'proj-a', "status='removido'");
    await env.DB.batch([
      env.DB.prepare(`UPDATE ot_sites SET base_aprovada_em = datetime('now') WHERE id = 's1'`),
      env.DB.prepare(`INSERT INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES ('u-tec', 's1', 'proj-a', 'x')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('pf-1', 'proj-a', 'organizacao', 'Integradora Exemplo')`),
      env.DB.prepare(`INSERT INTO ot_fornecedores (id, project_id, parte_id, papel, ot_site_id, criado_por) VALUES ('of1', 'proj-a', 'pf-1', 'integrador', 's1', 'x')`),
    ]);
    const ps = Object.fromEntries((await lista(cons)).map((p) => [p.id, p.estado]));
    expect(ps).toMatchObject({ tecnicos: 'falta', site: 'falta', base: 'falta', fornecedores: 'falta' });
  });

  it('fornecedor: conta o vínculo de parte ativa em site ativo; parte inativa não', async () => {
    await site('s1');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('pf-1', 'proj-a', 'organizacao', 'Integradora Exemplo')`),
      env.DB.prepare(`INSERT INTO ot_fornecedores (id, project_id, parte_id, papel, ot_site_id, criado_por) VALUES ('of1', 'proj-a', 'pf-1', 'integrador', 's1', 'x')`),
    ]);
    expect(await passo(cons, 'fornecedores')).toMatchObject({ estado: 'feito', detalhe: '1 fornecedor' });
    await env.DB.prepare(`UPDATE partes SET status = 'inativa' WHERE id = 'pf-1'`).run();
    expect((await passo(cons, 'fornecedores')).estado).toBe('falta');
  });

  it('sonda: detalhe diz criada, instalada (credencial ativa) e primeiro envio', async () => {
    await site('s1'); await sonda('z1', 's1'); await sonda('z2', 's1');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ot_sensor_credenciais (id, sensor_id, project_id, chave_hash, expira_em) VALUES ('c1', 'z1', 'proj-a', 'h-impl-1', ?)`).bind(new Date(Date.now() + 30 * 86_400_000).toISOString()),
      env.DB.prepare(`INSERT INTO ot_sensor_envios (id, sensor_id, project_id, impressao, situacao) VALUES ('e1', 'z1', 'proj-a', 'i1', 'concluido')`),
    ]);
    expect(await passo(cons, 'sonda')).toMatchObject({ estado: 'feito', detalhe: '2 sondas; 1 instalada; 1 com primeiro envio' });
  });

  it('credencial vencida hoje, horas atrás, não conta como instalada', async () => {
    await site('s1'); await sonda('z1', 's1');
    await env.DB.prepare(`INSERT INTO ot_sensor_credenciais (id, sensor_id, project_id, chave_hash, expira_em) VALUES ('c1', 'z1', 'proj-a', 'h-impl-3', ?)`).bind(new Date(Date.now() - 3_600_000).toISOString()).run();
    expect((await passo(cons, 'sonda')).detalhe).toBe('1 sonda; 0 instaladas; 0 com primeiro envio');
  });

  it('sonda revogada não conta: credencial e envio só de sonda ativa', async () => {
    await site('s1'); await sonda('z1', 's1', 'revogada');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ot_sensor_credenciais (id, sensor_id, project_id, chave_hash, expira_em) VALUES ('c1', 'z1', 'proj-a', 'h-impl-2', ?)`).bind(new Date(Date.now() + 30 * 86_400_000).toISOString()),
      env.DB.prepare(`INSERT INTO ot_sensor_envios (id, sensor_id, project_id, impressao, situacao) VALUES ('e1', 'z1', 'proj-a', 'i1', 'concluido')`),
    ]);
    expect(await passo(cons, 'sonda')).toMatchObject({ estado: 'falta', detalhe: '0 sondas; 0 instaladas; 0 com primeiro envio' });
  });

  it('platform_admin e Gestor veem a lista', async () => {
    for (const h of [pa, gestor]) expect((await lista(h)).length).toBe(9);
  });

  it('P0: técnico, leitor, agente e chave de API: 403', async () => {
    for (const h of [tec, cli]) expect((await chamar(h)).status).toBe(403);
    expect((await chamar({}, `${P}/implantacao`, { AGENTE })).status).toBe(403);
    expect((await chamar({ 'X-API-Key': CHAVE })).status).toBe(403);
  });

  it('P0-6: nenhum nome de pessoa, sonda ou ativo, nenhum IP/MAC no corpo', async () => {
    await site('s1'); await sonda('z1', 's1');
    const t = await (await chamar(cons)).text();
    expect(t).not.toMatch(/@|\d+\.\d+\.\d+\.\d+|Sonda Norte|RTU|Exemplo/);
  });

  it('um db.batch: o número de consultas não cresce com 50 sites', async () => {
    const contar = async () => {
      const sqls: string[] = [];
      const DB = new Proxy(env.DB, { get: (t, k) => (k === 'prepare' ? (q: string) => { sqls.push(q); return t.prepare(q); } : (t as any)[k]?.bind?.(t) ?? (t as any)[k]) });
      expect((await chamar(cons, `${P}/implantacao`, { DB })).status).toBe(200);
      return sqls.filter((q) => /\bot_/.test(q)).length;
    };
    const antes = await contar();
    await env.DB.batch(Array.from({ length: 50 }, (_, i) => env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES (?, 'proj-a', ?)`).bind(`mass-${i}`, `Massa ${i}`)));
    expect(await contar()).toBe(antes);
  });
});
