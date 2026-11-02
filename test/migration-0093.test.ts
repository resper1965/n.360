// test/migration-0093.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql, seedTwoProjects } from './helpers/d1';
import mig from '../migrations/0093_ot_levantamento.sql?raw';

// 0093: sessão de levantamento, achados e roteiro (spec descoberta operacional, L1). Repetível; ot_lotes não é refeita.
describe('migration 0093: levantamento do n.ot', () => {
  beforeAll(async () => { await applySchema(); await seedTwoProjects(); });

  it('cria as tabelas, a coluna em ot_lotes e carrega 15 perguntas; é repetível', async () => {
    await execSql(mig.replace(/ALTER TABLE ot_lotes[^;]*;/, '')); // sobre o schema.sql, que já tem o bloco e a coluna (ALTER não é repetível)
    const t = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ot_levantamentos','ot_achados','ot_roteiro_perguntas')`).all();
    expect(t.results.length).toBe(3);
    const cols = await env.DB.prepare(`SELECT name FROM pragma_table_info('ot_lotes') WHERE name = 'levantamento_id'`).all();
    expect(cols.results.length).toBe(1);
    const n = await env.DB.prepare('SELECT count(*) AS n FROM ot_roteiro_perguntas').first<{ n: number }>();
    expect(n?.n).toBe(15);
  });

  it('CHECKs: tipo, situação, entidade, origem e IP/MAC só cifrados', async () => {
    await env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s-m', 'proj-a', 'S')`).run();
    const sessao = (tipo: string) => env.DB.prepare(`INSERT INTO ot_levantamentos (id, project_id, site_id, tipo, realizado_em, criado_por) VALUES (?, 'proj-a', 's-m', ?, '2026-11-01', 'u')`).bind(`l-${tipo}`, tipo).run();
    await expect(sessao('palestra')).rejects.toThrow();
    await sessao('entrevista');
    const achado = (dados: string) => env.DB.prepare(`INSERT INTO ot_achados (id, project_id, levantamento_id, dados, criado_por) VALUES (?, 'proj-a', 'l-entrevista', ?, 'u')`).bind(crypto.randomUUID(), dados).run();
    await expect(achado('{"ip":"10.0.0.1"}')).rejects.toThrow();
    await expect(achado('{"ip_cifrado":"10.0.0.1"}')).rejects.toThrow();
    await achado('{"ip_cifrado":"ot1:k1:abc"}');
  });
});
