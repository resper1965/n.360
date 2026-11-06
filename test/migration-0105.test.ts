// test/migration-0105.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import mig from '../migrations/0105_titular_acompanhamento.sql?raw';

describe('migration 0105: código de acompanhamento do pedido do titular', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('m5a', 'A', 'LGPD', 'Controller', 'Active', 'org_ness')`).run();
  });
  it('coluna e índice único parcial; o índice é repetível', async () => {
    await execSql(mig.replace(/ALTER TABLE [^;]*;/g, ''));
    const cols = (await env.DB.prepare(`SELECT name FROM pragma_table_info('titular_pedidos') WHERE name = 'acompanhamento_hash'`).all()).results;
    expect(cols).toHaveLength(1);
    const ins = (id: string, prot: string, h: string | null) => env.DB.prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em, acompanhamento_hash) VALUES (?, 'm5a', ?, 'acesso', '2026-11-01', ?)`).bind(id, prot, h).run();
    await ins('m5p1', 'PT-2026-0001', null);
    await ins('m5p2', 'PT-2026-0002', null); // vários sem código
    await ins('m5p3', 'PT-2026-0003', 'abc');
    await expect(ins('m5p4', 'PT-2026-0004', 'abc')).rejects.toThrow(/UNIQUE/);
  });
});
