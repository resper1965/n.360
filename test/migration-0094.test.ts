// test/migration-0094.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql, seedTwoProjects } from './helpers/d1';
import mig from '../migrations/0094_ot_achados_l2.sql?raw';

// 0094 (L2): vínculo achado → pergunta do roteiro e achado → item do lote. Aditiva; ALTER não é repetível, então o teste roda o resto.
describe('migration 0094: achados da L2', () => {
  beforeAll(async () => { await applySchema(); await seedTwoProjects(); });

  it('ot_achados tem pergunta_id e lote_item_id; o resto da migração é repetível', async () => {
    await execSql(mig.replace(/ALTER TABLE ot_achados[^;]*;/g, ''));
    const cols = await env.DB.prepare(`SELECT name FROM pragma_table_info('ot_achados') WHERE name IN ('pergunta_id','lote_item_id')`).all();
    expect(cols.results.length).toBe(2);
  });

  it('pergunta_id aceita pergunta do catálogo e recusa id inexistente', async () => {
    await env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s-94', 'proj-a', 'S')`).run();
    await env.DB.prepare(`INSERT INTO ot_levantamentos (id, project_id, site_id, tipo, realizado_em, criado_por) VALUES ('l-94', 'proj-a', 's-94', 'entrevista', '2026-11-02', 'u')`).run();
    const achado = (p: string) => env.DB.prepare(`INSERT INTO ot_achados (id, project_id, levantamento_id, pergunta_id, criado_por) VALUES (?, 'proj-a', 'l-94', ?, 'u')`).bind(crypto.randomUUID(), p).run();
    await achado('rot-01');
    await expect(achado('rot-99')).rejects.toThrow();
  });
});
