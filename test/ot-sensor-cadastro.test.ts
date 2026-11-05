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
    expect(results.length).toBeGreaterThan(0);
    expect(JSON.stringify(results)).not.toContain('ots_');
    expect(await (await chamar(cons, 'GET', `${P}/ot/sites/s-a/sensores`)).text()).not.toContain(j.credencial);
  });

  it('lista: saúde, vencendo e credenciais', async () => {
    const j = await (await chamar(gestor, 'GET', `${P}/ot/sites/s-a/sensores`)).json<{ sensores: Record<string, unknown>[] }>();
    expect(j.sensores).toHaveLength(1);
    expect(j.sensores[0]).toMatchObject({ id: sensor.id, saude: 'atrasada', ultimo_envio: null, vencendo: false });
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
    expect((await chamar(cons, 'POST', `${P}/ot/sensores/${sensor.id}/credenciais`, {})).status).toBe(404);
    const j = await (await chamar(cons, 'GET', `${P}/ot/sites/s-a/sensores`)).json<{ sensores: unknown[] }>();
    expect(j.sensores).toHaveLength(0);
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
  });
});
