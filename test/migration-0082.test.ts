import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0082 from '../migrations/0082_aceite_risco.sql?raw';

const colunas = async (t: string) => ((await env.DB.prepare(`PRAGMA table_info(${t})`).all()).results as { name: string }[]).map((c) => c.name);

describe('migration 0082: aceite de risco digitado vira Accepted com a marca de registro à mão', () => {
  it('sobre o formato anterior: cria aceite_manual e só leva a Accepted o Accept com nome e ainda aberto', async () => {
    await applySchema();
    await execSql(`ALTER TABLE risks DROP COLUMN aceite_manual;`);
    const ins = (id: string, treatment: string, por: string | null, status: string) =>
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, treatment, status, accepted_by, accepted_at) VALUES (?, 'p82', 'ERP', 'Ameaca', ?, ?, ?, '2026-05-10')`)
        .bind(id, treatment, status, por);
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES ('p82', 'Cliente Ficticio', 'ISO 27001', 'controller', 'Active')`),
      ins('r1', 'Accept', 'Diretoria', 'Open'),
      ins('r2', 'Accept', '  ', 'Open'),
      ins('r3', 'Accept', 'Diretoria', 'Closed'),
      ins('r4', 'Mitigate', 'Diretoria', 'Open'),
    ]);

    await execSql(migration0082);

    expect(await colunas('risks')).toContain('aceite_manual');
    const { results } = await env.DB.prepare(`SELECT id, status, aceite_manual, accepted_by, accepted_at FROM risks WHERE project_id = 'p82' ORDER BY id`).all();
    expect(results).toEqual([
      { id: 'r1', status: 'Accepted', aceite_manual: 1, accepted_by: 'Diretoria', accepted_at: '2026-05-10' },
      { id: 'r2', status: 'Open', aceite_manual: 0, accepted_by: '  ', accepted_at: '2026-05-10' },
      { id: 'r3', status: 'Closed', aceite_manual: 0, accepted_by: 'Diretoria', accepted_at: '2026-05-10' },
      { id: 'r4', status: 'Open', aceite_manual: 0, accepted_by: 'Diretoria', accepted_at: '2026-05-10' },
    ]);
    await env.DB.prepare(`DELETE FROM projects WHERE id = 'p82'`).run();
  }, 30_000);

  it('o schema canônico traz aceite_manual com padrão 0', async () => {
    await applySchema();
    const col = ((await env.DB.prepare(`PRAGMA table_info(risks)`).all()).results as { name: string; notnull: number; dflt_value: string }[])
      .find((c) => c.name === 'aceite_manual');
    expect(col).toMatchObject({ notnull: 1, dflt_value: '0' });
  });
});
