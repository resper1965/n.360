import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import schemaSql from '../schema.sql?raw';
import migration0068 from '../migrations/0068_evidencia_documento.sql?raw';

/** A `evidence` como era antes da 0068: o CREATE TABLE do schema canônico sem a linha da coluna nova. */
const evidenceAntiga = () => {
  const ini = schemaSql.indexOf('CREATE TABLE IF NOT EXISTS evidence (');
  const bloco = schemaSql.slice(ini, schemaSql.indexOf(');', ini) + 2);
  expect(bloco).toContain('documento_id');
  return bloco.split('\n').filter((l) => !l.includes('documento_id') && !l.includes('migration 0068')).join('\n').replace(/,(\s*\n\s*\);)$/, '$1');
};

describe('migration 0068 — evidência ligada a documento', () => {
  it('sobre a evidence antiga: preserva as linhas, cria documento_id (SET NULL ao apagar o documento) e o índice', async () => {
    await applySchema();
    await execSql(`DROP TABLE evidence; ${evidenceAntiga()}`);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('m68', 'C', 'LGPD', 'Controller', 'Active')`),
      env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo) VALUES ('d68', 'm68', 'Política')`),
      env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES ('e-velha', 'm68', 'a.pdf', 'k', 'h', 'x')`),
    ]);
    const antes = await env.DB.prepare(`SELECT * FROM evidence WHERE id = 'e-velha'`).first();

    await execSql(migration0068);

    expect(await env.DB.prepare(`SELECT * FROM evidence WHERE id = 'e-velha'`).first()).toEqual({ ...antes, documento_id: null });
    await env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, documento_id) VALUES ('e-doc', 'm68', 'b.pdf', 'k2', 'h', 'x', 'd68')`).run();
    expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_evidence_documento'").first()).toBeTruthy();
    await env.DB.prepare(`DELETE FROM documentos WHERE id = 'd68'`).run();
    expect(await env.DB.prepare(`SELECT documento_id FROM evidence WHERE id = 'e-doc'`).first()).toEqual({ documento_id: null });
    await applySchema(); // convive com o schema canônico
  }, 30_000);
});
