import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import schemaSql from '../schema.sql?raw';
import migration0070 from '../migrations/0070_agente_papel.sql?raw';

/** A `agente_concessoes` como era antes da 0070: o CREATE TABLE do schema canônico sem a coluna `papel`. */
const concessoesAntiga = () => {
  const ini = schemaSql.indexOf('CREATE TABLE IF NOT EXISTS agente_concessoes (');
  const bloco = schemaSql.slice(ini, schemaSql.indexOf(');', ini) + 2);
  expect(bloco).toContain('papel');
  return bloco.split('\n').filter((l) => !l.includes('papel') && !l.includes('migration 0070')).join('\n').replace(/,(\s*\n\s*\);)$/, '$1');
};

describe('migration 0070 — papel do agente na concessão', () => {
  it('sobre a agente_concessoes antiga: a concessão existente vira consultor e o CHECK recusa papel desconhecido', async () => {
    await applySchema();
    await execSql(`DROP TABLE agente_concessoes; ${concessoesAntiga()}`);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('m70', 'C', 'ISO 27001', 'Controller', 'Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u70', 'c70@ness.lat', 'x', 'C', 'consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-velha', 'u70', 'm70', datetime('now', '+30 days'))`),
    ]);
    const antes = await env.DB.prepare(`SELECT * FROM agente_concessoes WHERE id = 'c-velha'`).first();

    await execSql(migration0070);

    expect(await env.DB.prepare(`SELECT * FROM agente_concessoes WHERE id = 'c-velha'`).first()).toEqual({ ...antes, papel: 'consultor' });
    await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em, papel) VALUES ('c-aud', 'u70', 'm70', datetime('now', '+30 days'), 'auditor')`).run();
    await expect(env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em, papel) VALUES ('c-x', 'u70', 'm70', datetime('now', '+30 days'), 'admin')`).run()).rejects.toThrow(/CHECK/);
    await applySchema(); // convive com o schema canônico
  }, 120_000);
});
