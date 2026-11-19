import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import schemaSql from '../schema.sql?raw';
import migration0069 from '../migrations/0069_ropa_riscos_lgpd.sql?raw';

/** A `ropa_records` como era antes da 0069: o CREATE TABLE do schema canônico sem as duas colunas novas. */
const ropaAntiga = () => {
  const ini = schemaSql.indexOf('CREATE TABLE IF NOT EXISTS ropa_records (');
  const bloco = schemaSql.slice(ini, schemaSql.indexOf(');', ini) + 2);
  expect(bloco).toContain('dados_sensiveis');
  expect(bloco).toContain('criancas_adolescentes');
  return bloco.split('\n').filter((l) => !l.includes('dados_sensiveis') && !l.includes('criancas_adolescentes') && !l.includes('migration 0069')).join('\n').replace(/,(\s*\n\s*\);)$/, '$1');
};

describe('migration 0069 — riscos do tratamento (art. 11 e art. 14)', () => {
  it('sobre a ropa_records antiga: preserva as linhas e cria as duas colunas com 0', async () => {
    await applySchema();
    await execSql(`DROP TABLE ropa_records; ${ropaAntiga()}`);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('m69', 'C', 'LGPD', 'Controller', 'Active')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, dpia_required) VALUES ('r-velho', 'm69', 'Folha', 1)`),
    ]);
    const antes = await env.DB.prepare(`SELECT * FROM ropa_records WHERE id = 'r-velho'`).first();

    await execSql(migration0069);

    expect(await env.DB.prepare(`SELECT * FROM ropa_records WHERE id = 'r-velho'`).first()).toEqual({ ...antes, dados_sensiveis: 0, criancas_adolescentes: 0 });
    await env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, dados_sensiveis, criancas_adolescentes) VALUES ('r-novo', 'm69', 'Creche', 1, 1)`).run();
    expect(await env.DB.prepare(`SELECT dados_sensiveis, criancas_adolescentes FROM ropa_records WHERE id = 'r-novo'`).first()).toEqual({ dados_sensiveis: 1, criancas_adolescentes: 1 });
    await applySchema(); // convive com o schema canônico
  }, 120_000);
});
