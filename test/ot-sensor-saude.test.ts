import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { avisarSensores } from '../src/services/ot-sensor';
import { manutencaoDiaria } from '../src/manutencao';
import { applySchema, resetData, seedTwoProjects } from './helpers/d1';

const ha = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString().slice(0, 19).replace('T', ' ');
const futuro = new Date(Date.now() + 200 * 86_400_000).toISOString();
const sonda = (id: string, nome: string, criada: string, situacao = 'ativa') =>
  env.DB.prepare(`INSERT INTO ot_sensores (id, project_id, site_id, nome, faixa_origem, criado_por, situacao, created_at) VALUES (?, 'proj-a', 's-a', ?, '200.10.0.0/24', 'x', ?, ?)`).bind(id, nome, situacao, criada);
const cred = (sid: string) =>
  env.DB.prepare(`INSERT INTO ot_sensor_credenciais (id, sensor_id, project_id, chave_hash, expira_em) VALUES (?, ?, 'proj-a', ?, ?)`).bind('k-' + sid, sid, 'h-' + sid, futuro);
const envio = (id: string, sid: string, criado: string) =>
  env.DB.prepare(`INSERT INTO ot_sensor_envios (id, sensor_id, project_id, impressao, situacao, created_at) VALUES (?, ?, 'proj-a', ?, 'concluido', ?)`).bind(id, sid, id, criado);

describe('saúde da coleta', () => {
  beforeEach(async () => {
    await applySchema(); await resetData(); await seedTwoProjects();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s-a', 'proj-a', 'Subestação Norte')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-g', 'gestor@cliente.teste', 'x', 'G', 'org_admin', 'proj-a'), ('u-c', 'cli@cliente.teste', 'x', 'C', 'client', 'proj-a')`),
      sonda('em-dia', 'Em dia', ha(500)), cred('em-dia'), envio('e1', 'em-dia', ha(1)),
      sonda('atrasada', 'Atrasada', ha(500)), cred('atrasada'), envio('e2', 'atrasada', ha(30)),
      sonda('parada', 'Sonda Parada', ha(500)), cred('parada'), envio('e3', 'parada', ha(100)),
      sonda('revogada', 'Revogada', ha(500), 'revogada'), cred('revogada'),
    ]);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('conta, grava trilha só com contagem e ignora sonda revogada', async () => {
    const r = await avisarSensores({ ...env } as any, new Date());
    expect(r).toEqual({ atrasadas: 1, paradas: 1, emails: 1 });
    const t = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'ot.sensor.atrasado' ORDER BY rowid DESC LIMIT 1`).first<{ details: string }>();
    expect(t!.details).toBe('Sondas atrasadas: 1; paradas: 1');
  });

  it('e-mail só da parada, ao org_admin, com nome da sonda e do site e sem IP', async () => {
    const enviados: any[] = [];
    vi.stubGlobal('fetch', async (_u: string, i: RequestInit) => { enviados.push(JSON.parse(i.body as string)); return new Response('{}'); });
    await avisarSensores({ ...env, RESEND_API_KEY: 'k' } as any, new Date());
    expect(enviados).toHaveLength(1);
    const m = enviados[0];
    expect(m.to).toEqual(['gestor@cliente.teste']);
    expect(m.subject).toContain('Sonda Parada');
    expect(m.text).toContain('Subestação Norte');
    expect(m.subject + m.html + m.text).not.toMatch(/200\.10|\d+\.\d+\.\d+\.\d+/);
  });

  it('sonda em dia cuja única credencial ativa venceu: parada', async () => {
    await env.DB.batch([sonda('vencida', 'Vencida', ha(500)), envio('e4', 'vencida', ha(1)),
      env.DB.prepare(`INSERT INTO ot_sensor_credenciais (id, sensor_id, project_id, chave_hash, expira_em) VALUES ('k-venc', 'vencida', 'proj-a', 'h-venc', ?)`)
        .bind(new Date(Date.now() - 86_400_000).toISOString())]);
    expect(await avisarSensores({ ...env } as any, new Date())).toMatchObject({ atrasadas: 1, paradas: 2 });
  });

  it('sem RESEND_API_KEY não lança', async () => {
    await expect(avisarSensores({ ...env, RESEND_API_KEY: undefined } as any, new Date())).resolves.toMatchObject({ paradas: 1 });
  });
});

describe('manutenção da coleta', () => {
  beforeEach(async () => {
    await applySchema(); await resetData(); await seedTwoProjects();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s-a', 'proj-a', 'SE')`),
      sonda('s1', 'S', ha(1)),
    ]);
  });

  it('apaga envios com 401 dias e mantém os de 399', async () => {
    await env.DB.batch([envio('velho', 's1', ha(401 * 24)), envio('novo', 's1', ha(399 * 24))]);
    await manutencaoDiaria(env as any);
    const { results } = await env.DB.prepare('SELECT id FROM ot_sensor_envios').all<{ id: string }>();
    expect(results.map((r) => r.id)).toEqual(['novo']);
  });

  it('achado descartado: com chave 90 dias, sem chave 30', async () => {
    await env.DB.prepare(`INSERT INTO ot_levantamentos (id, project_id, site_id, tipo, realizado_em, criado_por) VALUES ('l1', 'proj-a', 's-a', 'documento', '2026-01-01', 'x')`).run();
    const ach = (id: string, dias: number, chave: string | null) =>
      env.DB.prepare(`INSERT INTO ot_achados (id, project_id, levantamento_id, situacao, criado_por, chave_sensor, updated_at) VALUES (?, 'proj-a', 'l1', 'descartado', 'x', ?, ?)`).bind(id, chave, ha(dias * 24));
    await env.DB.batch([ach('c60', 60, 'k'), ach('c91', 91, 'k'), ach('n31', 31, null), ach('n29', 29, null)]);
    await manutencaoDiaria(env as any);
    const { results } = await env.DB.prepare('SELECT id FROM ot_achados ORDER BY id').all<{ id: string }>();
    expect(results.map((r) => r.id)).toEqual(['c60', 'n29']);
  });
});
