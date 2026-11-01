import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { chavesOt } from '../src/services/ot-cifra';
import { prepararAchado, confrontar, enviarAoLote } from '../src/services/ot-levantamento';
import { applySchema, seedTwoProjects, habilitarOt, workerEnv } from './helpers/d1';

const chaves = chavesOt(workerEnv())!;
beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s1', 'proj-a', 'SE Norte'), ('s2', 'proj-a', 'SE Sul')`),
    env.DB.prepare(`INSERT INTO ot_levantamentos (id, project_id, site_id, tipo, realizado_em, criado_por) VALUES ('lev', 'proj-a', 's1', 'entrevista', '2026-11-01', 'u-c')`),
  ]);
});

describe('achado: cifra própria, confronto no site, envio ao lote', () => {
  it('prepararAchado cifra IP com a AAD de ot_achados e aceita campos incompletos', async () => {
    const r = await prepararAchado(chaves, 'proj-a', 's1', 'ach-1', { nome: 'Notebook IHM', ip: '10.9.9.9' });
    expect(String(r.dados.ip_cifrado)).toMatch(/^ot1:/);
    expect(r.dados).not.toHaveProperty('ip');
    expect(r.erros.some((e) => e.campo === '4.3.1')).toBe(false); // sem no_arciber, nada do 4.3.1 é cobrado
  });

  it('confrontar: confirma ativo do mesmo site pelo IP; ativo de outro site não casa (sem oráculo)', async () => {
    const a = await prepararAchado(chaves, 'proj-a', 's1', 'tmp', { nome: 'X', ip: '10.7.7.7' });
    await env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, nome, ip_cifrado, ip_hash) VALUES ('at-1', 'proj-a', 's1', 'RTU', ?, ?)`).bind(a.dados.ip_cifrado, a.dados.ip_hash).run();
    expect(await confrontar(env.DB, 'proj-a', 's1', a.dados)).toEqual({ confronto: 'confirma', alvo_id: 'at-1' });
    expect(await confrontar(env.DB, 'proj-a', 's2', a.dados)).toEqual({ confronto: 'novo', alvo_id: null });
  });

  it('enviarAoLote cria lote manual ligado à sessão e marca os achados como enviados', async () => {
    const p = await prepararAchado(chaves, 'proj-a', 's1', 'ach-2', { nome: 'Pendrive de firmware', ip: '10.5.5.5' });
    await env.DB.prepare(`INSERT INTO ot_achados (id, project_id, levantamento_id, dados, erros, evidencia, criado_por) VALUES ('ach-2', 'proj-a', 'lev', ?, '[]', 'pendrive', 'u-c')`)
      .bind(JSON.stringify(p.dados)).run();
    const r = await enviarAoLote(env.DB, chaves, { id: 'u-c' }, 'proj-a', { id: 'lev', site_id: 's1' }, ['ach-2']);
    expect(r.ok).toBe(true);
    const lote = await env.DB.prepare('SELECT fonte, levantamento_id FROM ot_lotes WHERE id = ?').bind((r as { id: string }).id).first();
    expect(lote).toEqual({ fonte: 'manual', levantamento_id: 'lev' });
    const ach = await env.DB.prepare(`SELECT situacao, lote_id FROM ot_achados WHERE id = 'ach-2'`).first();
    expect(ach).toEqual({ situacao: 'enviado', lote_id: (r as { id: string }).id });
  });

  it('retenção: descartado há 31 dias sai; enviado fica', async () => {
    await env.DB.prepare(`INSERT INTO ot_achados (id, project_id, levantamento_id, dados, evidencia, situacao, criado_por, updated_at)
      VALUES ('ach-velho', 'proj-a', 'lev', '{}', 'x', 'descartado', 'u', datetime('now', '-31 days'))`).run();
    const { manutencaoDiaria } = await import('../src/manutencao');
    const r = await manutencaoDiaria(env as any);
    expect(r.retencao.ot_achados).toBeGreaterThanOrEqual(1);
    expect(await env.DB.prepare(`SELECT 1 FROM ot_achados WHERE id = 'ach-velho'`).first()).toBeNull();
    expect(await env.DB.prepare(`SELECT 1 FROM ot_achados WHERE id = 'ach-2'`).first()).not.toBeNull();
  });
});
