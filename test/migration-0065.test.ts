import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0065 from '../migrations/0065_ness_contrata_privacy.sql?raw';

const modulos = async (id: string) =>
  (await env.DB.prepare(`SELECT modulos_contratados AS m FROM organizations WHERE id = ?`).bind(id).first<{ m: string }>())!.m;

describe('migration 0065 — org_ness contrata o n.privacy', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(`INSERT INTO organizations (id, name, slug, plan, status) VALUES ('org_outra', 'Outra', 'outra', 'consultoria', 'Active')`).run();
  });

  it('org_ness com ["iso"] passa a ["iso","privacy"]; aplicar de novo não muda nada', async () => {
    expect(await modulos('org_ness')).toBe('["iso"]');
    await execSql(migration0065);
    expect(await modulos('org_ness')).toBe('["iso","privacy"]');
    await execSql(migration0065);
    expect(await modulos('org_ness')).toBe('["iso","privacy"]');
  });

  it('valor diferente de ["iso"] fica intocado, e outra organização também', async () => {
    await env.DB.prepare(`UPDATE organizations SET modulos_contratados = '["privacy"]' WHERE id = 'org_ness'`).run();
    await execSql(migration0065);
    expect(await modulos('org_ness')).toBe('["privacy"]');
    expect(await modulos('org_outra')).toBe('["iso"]');
  });
});
