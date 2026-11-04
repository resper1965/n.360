// test/migration-0097.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql, seedTwoProjects } from './helpers/d1';
import mig from '../migrations/0097_ot_sensor_rede.sql?raw';

// 0097 (L3): faixas internas do site e fluxos pendentes do sensor. ALTER não é repetível, então o teste roda o resto.
describe('migration 0097: sensor de rede do n.ot', () => {
  beforeAll(async () => { await applySchema(); await seedTwoProjects(); });

  it('ot_sites tem faixas_internas com default []; o resto da migração é repetível', async () => {
    await execSql(mig.replace(/ALTER TABLE ot_sites[^;]*;/g, ''));
    const col = await env.DB.prepare(`SELECT dflt_value FROM pragma_table_info('ot_sites') WHERE name = 'faixas_internas'`).first<{ dflt_value: string }>();
    expect(col?.dflt_value).toBe(`'[]'`);
    const t = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE name = 'ot_fluxos_pendentes'`).all();
    expect(t.results).toHaveLength(1);
  });

  it('recusa dados que não seja objeto JSON', async () => {
    await expect(env.DB.prepare(`INSERT INTO ot_fluxos_pendentes (id, project_id, levantamento_id, origem_ip_hash, dados) VALUES ('f1', 'proj-a', 'l1', 'h', '[]')`).run()).rejects.toThrow(/CHECK/);
  });
});
