import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData, seedTwoProjects } from './helpers/d1';
import { criarReferencia, lerReferencias, apagarReferencia } from '../src/services/ot-referencias';

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
    const ok = await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_site_id: 'site1' }, 'u');
    expect(ok.ok).toBe(true);
    const f = (r: Awaited<ReturnType<typeof criarReferencia>>) => (r.ok ? 'ok' : r.status);
    expect(f(await criarReferencia(env.DB, A, { tipo: 'risk', id: 'riskB' }, { ot_site_id: 'site1' }, 'u'))).toBe(404);
    expect(f(await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_site_id: 'siteB' }, 'u'))).toBe(404);
    expect(f(await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_site_id: 'site1', ot_ativo_id: 'at1' }, 'u'))).toBe(400);
    await run(`UPDATE ot_sites SET status = 'removido' WHERE id = 'site2'`);
    await run(`UPDATE ot_ativos SET status = 'removido' WHERE id = 'at1'`);
    expect(f(await criarReferencia(env.DB, A, { tipo: 'acao', id: 'acao1' }, { ot_site_id: 'site2' }, 'u'))).toBe(404);
    expect(f(await criarReferencia(env.DB, A, { tipo: 'acao', id: 'acao1' }, { ot_ativo_id: 'at1' }, 'u'))).toBe(404);
    expect(f(await criarReferencia(env.DB, A, { tipo: 'acao', id: 'acao1' }, { ot_desvio_id: 'd1' }, 'u'))).toBe('ok');
    expect(f(await criarReferencia(env.DB, A, { tipo: 'incidente', id: 'inc1' }, { ot_desvio_id: 'd1' }, 'u'))).toBe(409);
    expect(f(await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_ativo_id: 'at2' }, 'u', JSON.stringify(['site1'])))).toBe(404);
  });

  it('leitura: filtra por sites permitidos (ativo e desvio pelo site deles) e esconde removidos', async () => {
    await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_site_id: 'site1' }, 'u');
    await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_ativo_id: 'at2' }, 'u');
    await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_desvio_id: 'd1' }, 'u');
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

  it('apagar: só no próprio projeto', async () => {
    const r = await criarReferencia(env.DB, A, { tipo: 'risk', id: 'risk1' }, { ot_site_id: 'site1' }, 'u');
    if (!r.ok) throw new Error();
    expect(await apagarReferencia(env.DB, B, r.id)).toBe(false);
    expect(await apagarReferencia(env.DB, A, r.id)).toBe(true);
    expect(await nref()).toBe(0);
  });
});
