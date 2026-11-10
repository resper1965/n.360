// test/migration-0096.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql, seedTwoProjects } from './helpers/d1';
import mig from '../migrations/0096_ot_agente_coleta.sql?raw';

// 0096 (L5): interruptor do agente de coleta em projects. Aditiva; ALTER não é repetível, então o teste roda o resto.
describe('migration 0096: agente de coleta do n.ot', () => {
  beforeAll(async () => { await applySchema(); await seedTwoProjects(); });

  it('projects tem agente_coleta_ot com default 0; o resto da migração é repetível', async () => {
    await execSql(mig.replace(/ALTER TABLE projects[^;]*;/g, ''));
    const col = await env.DB.prepare(`SELECT dflt_value FROM pragma_table_info('projects') WHERE name = 'agente_coleta_ot'`).first<{ dflt_value: string }>();
    expect(col?.dflt_value).toBe('0');
    const p = await env.DB.prepare(`SELECT agente_coleta_ot AS v FROM projects WHERE id = 'proj-a'`).first<{ v: number }>();
    expect(p?.v).toBe(0);
  });

  it('recusa valor fora de 0/1', async () => {
    await expect(env.DB.prepare(`UPDATE projects SET agente_coleta_ot = 2 WHERE id = 'proj-a'`).run()).rejects.toThrow();
  });
});
