import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { situacaoSensor, vencendo } from '../src/services/ot-sensor';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

const P = '/api/v1/projects/proj-a';
type H = Record<string, string>;
const chamar = (h: H, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv());
const BODY = { nome: 'Sonda SE Norte', faixa_origem: '200.10.0.0/24' };

describe('cadastro de sondas', () => {
  let gestor: H, cli: H, cons: H;
  let sensor: { id: string };
  beforeAll(async () => {
    await applySchema();
    await seedTwoProjects();
    await habilitarOt('proj-a', 'proj-b');
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-gestor', 'gestor@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'),
      ('u-cli', 'cli@cliente.teste', 'x', 'Leitura', 'client', 'proj-a')`).run();
    await designarConsultor('cons-ot@ness.lat', 'proj-a');
    await concederModulos(['u-gestor', 'u-cli', 'cons:cons-ot@ness.lat'], ['ot']);
    gestor = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
    cli = await sessionFor({ id: 'u-cli', email: 'cli@cliente.teste', role: 'client', client_project_id: 'proj-a' });
    cons = await sessionFor({ id: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', role: 'consultor' });
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s-a', 'proj-a', 'SE A'), ('s-b', 'proj-b', 'SE B')`),
      env.DB.prepare(`INSERT INTO ot_sensores (id, project_id, site_id, nome, faixa_origem, criado_por) VALUES ('sen-b', 'proj-b', 's-b', 'Outra', '10.0.0.0/8', 'x')`),
    ]);
  });

  it('quem vê mascarado recebe 403 nas 5 rotas', async () => {
    for (const [m, c, corpo] of [
      ['GET', `${P}/ot/sites/s-a/sensores`], ['POST', `${P}/ot/sites/s-a/sensores`, BODY], ['POST', `${P}/ot/sensores/x/credenciais`, {}],
      ['DELETE', `${P}/ot/sensores/x/credenciais/y`], ['DELETE', `${P}/ot/sensores/x`],
    ] as const) expect((await chamar(cli, m, c, corpo)).status, `${m} ${c}`).toBe(403);
  });

  it('corpo inválido: 400', async () => {
    for (const corpo of [{ nome: 'x' }, { ...BODY, faixa_origem: '300.1.1.1/24' }, { ...BODY, nome: 'joao@x.com' }]) {
      expect((await chamar(cons, 'POST', `${P}/ot/sites/s-a/sensores`, corpo)).status).toBe(400);
    }
  });

  it('cria: credencial ots_ só na resposta, SHA-256 no banco, conf e trilha sem a credencial', async () => {
    const r = await chamar(cons, 'POST', `${P}/ot/sites/s-a/sensores`, BODY);
    expect(r.status).toBe(201);
    const j = await r.json<{ sensor: { id: string }; credencial: string; expira_em: string; conf: string }>();
    sensor = j.sensor;
    expect(j.credencial).toMatch(/^ots_[0-9a-f]{64}$/);
    expect(j.conf).toContain(`credencial = ${j.credencial}`);
    expect(j.conf).toMatch(/url = http\S+\/ot-sensor\/resumo/);
    const k = await env.DB.prepare('SELECT chave_hash FROM ot_sensor_credenciais WHERE sensor_id = ?').bind(sensor.id).first<{ chave_hash: string }>();
    expect(k?.chave_hash).toBe(await sha256Hex(j.credencial));
    const { results } = await env.DB.prepare(`SELECT * FROM audit_logs WHERE action LIKE 'ot.sensor.%'`).all();
    expect(results.map((a) => (a as { action: string }).action)).toEqual(['ot.sensor.criado']);
    expect(JSON.stringify(results)).not.toContain('ots_');
    expect(await (await chamar(cons, 'GET', `${P}/ot/sites/s-a/sensores`)).text()).not.toContain(j.credencial);
  });

  it('lista: saúde, vencendo e credenciais', async () => {
    const j = await (await chamar(gestor, 'GET', `${P}/ot/sites/s-a/sensores`)).json<{ sensores: Record<string, unknown>[] }>();
    expect(j.sensores).toHaveLength(1);
    expect(j.sensores[0]).toMatchObject({ id: sensor.id, saude: 'em_dia', ultimo_envio: null, vencendo: false });
    expect(j.sensores[0].credenciais).toHaveLength(1);
  });

  it('segunda credencial ok, terceira 409; revogar uma deixa a outra', async () => {
    const r2 = await chamar(cons, 'POST', `${P}/ot/sensores/${sensor.id}/credenciais`, {});
    expect(r2.status).toBe(201);
    expect((await r2.json<{ credencial: string }>()).credencial).toMatch(/^ots_/);
    const r3 = await chamar(cons, 'POST', `${P}/ot/sensores/${sensor.id}/credenciais`, {});
    expect(r3.status).toBe(409);
    expect((await r3.json<{ error: string }>()).error).toBe('Esta sonda já tem duas credenciais ativas');
    const { id } = (await env.DB.prepare(`SELECT id FROM ot_sensor_credenciais WHERE sensor_id = ? ORDER BY created_at LIMIT 1`).bind(sensor.id).first<{ id: string }>())!;
    expect((await chamar(cons, 'DELETE', `${P}/ot/sensores/${sensor.id}/credenciais/${id}`)).status).toBe(200);
    expect((await chamar(cons, 'DELETE', `${P}/ot/sensores/${sensor.id}/credenciais/${id}`)).status).toBe(404);
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ot_sensor_credenciais WHERE sensor_id = ? AND situacao = 'ativa'`).bind(sensor.id).first<{ n: number }>();
    expect(n?.n).toBe(1);
    const acoes = await env.DB.prepare(`SELECT action, details FROM audit_logs WHERE action LIKE 'ot.sensor.%' ORDER BY rowid`).all<{ action: string; details: string }>();
    expect(acoes.results.map((a) => a.action)).toEqual(['ot.sensor.criado', 'ot.sensor.credencial', 'ot.sensor.credencial']);
    expect(acoes.results[2].details).toContain('revogada');
  });

  it('credencial vencida não conta no teto de 2', async () => {
    await env.DB.prepare(`INSERT INTO ot_sensores (id, project_id, site_id, nome, faixa_origem, criado_por) VALUES ('sen-v', 'proj-a', 's-a', 'V', '10.0.0.0/8', 'x')`).run();
    await env.DB.prepare(`INSERT INTO ot_sensor_credenciais (id, sensor_id, project_id, chave_hash, expira_em) VALUES
      ('cv1', 'sen-v', 'proj-a', 'h1', '2020-01-01T00:00:00.000Z'), ('cv2', 'sen-v', 'proj-a', 'h2', '2020-01-01T00:00:00.000Z')`).run();
    expect((await chamar(cons, 'POST', `${P}/ot/sensores/sen-v/credenciais`, {})).status).toBe(201);
    expect((await chamar(cons, 'POST', `${P}/ot/sensores/sen-v/credenciais`, {})).status).toBe(201);
    expect((await chamar(cons, 'POST', `${P}/ot/sensores/sen-v/credenciais`, {})).status).toBe(409);
  });

  it('sonda de outro projeto: 404 (P0-4)', async () => {
    expect((await chamar(cons, 'POST', `${P}/ot/sensores/sen-b/credenciais`, {})).status).toBe(404);
    expect((await chamar(cons, 'DELETE', `${P}/ot/sensores/sen-b`)).status).toBe(404);
    expect((await chamar(cons, 'GET', `${P}/ot/sites/s-b/sensores`)).status).toBe(404);
    expect((await chamar(cons, 'POST', `${P}/ot/sites/s-b/sensores`, BODY)).status).toBe(404);
  });

  it('revogar a sonda revoga todas as credenciais', async () => {
    expect((await chamar(cons, 'DELETE', `${P}/ot/sensores/${sensor.id}`)).status).toBe(200);
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ot_sensor_credenciais WHERE sensor_id = ? AND situacao = 'ativa'`).bind(sensor.id).first<{ n: number }>();
    expect(n?.n).toBe(0);
    const ult = await env.DB.prepare(`SELECT action FROM audit_logs WHERE action LIKE 'ot.sensor.%' ORDER BY rowid DESC LIMIT 1`).first<{ action: string }>();
    expect(ult?.action).toBe('ot.sensor.revogado');
    expect((await chamar(cons, 'POST', `${P}/ot/sensores/${sensor.id}/credenciais`, {})).status).toBe(404);
    const j = await (await chamar(cons, 'GET', `${P}/ot/sites/s-a/sensores`)).json<{ sensores: { id: string }[] }>();
    expect(j.sensores.some((x) => x.id === sensor.id)).toBe(false);
  });
});

describe('pontos a esclarecer', () => {
  let gestor: H, cli: H;
  beforeAll(async () => {
    // o esquema e os projetos vêm do describe acima (mesmo arquivo, mesmo banco)
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-g2', 'g2@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'), ('u-c2', 'c2@cliente.teste', 'x', 'Leitura', 'client', 'proj-a')`).run();
    await concederModulos(['u-g2', 'u-c2'], ['ot']);
    gestor = await sessionFor({ id: 'u-g2', email: 'g2@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
    cli = await sessionFor({ id: 'u-c2', email: 'c2@cliente.teste', role: 'client', client_project_id: 'proj-a' });
    const SENSOR = 'Sensor de rede (Zeek): 5 conexões';
    const ach = (id: string, lev: string, proj: string, ent: string, sit: string, ev: string) =>
      env.DB.prepare(`INSERT INTO ot_achados (id, project_id, levantamento_id, entidade, situacao, evidencia, criado_por) VALUES (?, ?, ?, ?, ?, ?, 'x')`).bind(id, proj, lev, ent, sit, ev);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, status) VALUES ('p-ok', 'proj-a', 'SE ok', 'ativo'), ('p-off', 'proj-a', 'SE off', 'removido'), ('p-b', 'proj-b', 'SE b', 'ativo')`),
      env.DB.prepare(`INSERT INTO ot_levantamentos (id, project_id, site_id, tipo, realizado_em, criado_por) VALUES
        ('pl-ok', 'proj-a', 'p-ok', 'documento', '2026-11-04', 'sensor:z'), ('pl-off', 'proj-a', 'p-off', 'documento', '2026-11-04', 'sensor:z'), ('pl-b', 'proj-b', 'p-b', 'documento', '2026-11-04', 'sensor:z')`),
      ach('x1', 'pl-ok', 'proj-a', 'ativo', 'rascunho', SENSOR), ach('x2', 'pl-ok', 'proj-a', 'ativo', 'rascunho', SENSOR), ach('x3', 'pl-ok', 'proj-a', 'fluxo', 'rascunho', SENSOR),
      ach('x4', 'pl-ok', 'proj-a', 'ativo', 'enviado', SENSOR), ach('x5', 'pl-ok', 'proj-a', 'ativo', 'descartado', SENSOR),
      ach('x6', 'pl-ok', 'proj-a', 'ativo', 'rascunho', 'Entrevista com o operador'),
      ach('x7', 'pl-off', 'proj-a', 'ativo', 'rascunho', SENSOR), ach('x8', 'pl-b', 'proj-b', 'ativo', 'rascunho', SENSOR),
    ]);
  });

  it('conta rascunhos da sonda por entidade; ignora enviado, descartado, outra evidência, site não permitido e outro projeto', async () => {
    const r = await chamar(gestor, 'GET', `${P}/ot/sensores/pontos`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ativos: 2, fluxos: 1 });
  });

  it('quem vê mascarado: 403', async () => {
    expect((await chamar(cli, 'GET', `${P}/ot/sensores/pontos`)).status).toBe(403);
  });

  it('não grava trilha de dado sensível', async () => {
    const { results } = await env.DB.prepare(`SELECT 1 FROM audit_logs WHERE action = 'ot.inventario.ver_sensivel'`).all();
    expect(results).toHaveLength(0);
  });
});

describe('situacaoSensor / vencendo', () => {
  const agora = new Date('2026-11-05T12:00:00Z');
  const h = (n: number) => new Date(agora.getTime() - n * 3_600_000).toISOString();
  const em = (dias: number) => new Date(agora.getTime() + dias * 86_400_000).toISOString();
  const ok = [{ expira_em: em(200), situacao: 'ativa' }];
  it('limites de horas', () => {
    expect(situacaoSensor(h(25), ok, agora)).toBe('em_dia');
    expect(situacaoSensor(h(27), ok, agora)).toBe('atrasada');
    expect(situacaoSensor(h(73), ok, agora)).toBe('parada');
  });
  it('sonda sem envio mede a partir da criação', () => {
    expect(situacaoSensor(h(1), ok, agora)).toBe('em_dia');
    expect(situacaoSensor(h(73), ok, agora)).toBe('parada');
  });
  it('aceita o formato do D1 (sem T nem fuso)', () => {
    expect(situacaoSensor(h(25).slice(0, 19).replace('T', ' '), ok, agora)).toBe('em_dia');
  });
  it('credencial vencida ou revogada: parada', () => {
    expect(situacaoSensor(h(1), [{ expira_em: em(-1), situacao: 'ativa' }], agora)).toBe('parada');
    expect(situacaoSensor(h(1), [{ expira_em: em(200), situacao: 'revogada' }], agora)).toBe('parada');
  });
  it('vencendo', () => {
    expect(vencendo([{ expira_em: em(29), situacao: 'ativa' }], agora)).toBe(true);
    expect(vencendo(ok, agora)).toBe(false);
    expect(vencendo([{ expira_em: em(10), situacao: 'ativa' }, { expira_em: em(300), situacao: 'ativa' }], agora)).toBe(false);
  });
});
