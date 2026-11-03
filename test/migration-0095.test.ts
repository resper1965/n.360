// test/migration-0095.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql, seedTwoProjects } from './helpers/d1';
import mig from '../migrations/0095_ot_perfis_depara.sql?raw';

// 0095 (L4): perfis de de-para (cabeçalho de planilha → campos do ativo). Aditiva e repetível.
describe('migration 0095: perfis de de-para', () => {
  beforeAll(async () => { await applySchema(); await seedTwoProjects(); });

  it('cria a tabela; é repetível', async () => {
    await execSql(mig);
    await execSql(mig);
    const t = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = 'ot_perfis_depara'`).all();
    expect(t.results.length).toBe(1);
  });

  it('CHECKs: assinatura de 64, mapeamento objeto, uma assinatura por projeto', async () => {
    const ins = (id: string, proj: string, ass: string, map: string) => env.DB.prepare(`INSERT INTO ot_perfis_depara (id, project_id, nome, assinatura, mapeamento, criado_por)
      VALUES (?, ?, 'Perfil', ?, ?, 'u')`).bind(id, proj, ass, map).run();
    const a = 'a'.repeat(64);
    await ins('p1', 'proj-a', a, '{"0":"nome"}');
    await expect(ins('p2', 'proj-a', a, '{"0":"nome"}')).rejects.toThrow();
    await ins('p3', 'proj-b', a, '{"0":"nome"}');
    await expect(ins('p4', 'proj-a', 'curta', '{}')).rejects.toThrow();
    await expect(ins('p5', 'proj-a', 'b'.repeat(64), '["nome"]')).rejects.toThrow();
  });
});
