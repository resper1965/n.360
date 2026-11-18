import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0071 from '../migrations/0071_empresas.sql?raw';

describe('migration 0071 — cadastro da empresa do projeto', () => {
  it('sobre o banco sem `empresas`: uma linha por projeto, sem perder dado, e os CHECKs valem', async () => {
    await applySchema();
    await execSql('DROP TABLE empresas');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, cnpj, sector, employee_count) VALUES
        ('m71a', 'Alfa Fictícia', 'ISO 27001', 'Controller', 'active', '11.111.111/0001-91', 'Varejo', 12),
        ('m71b', 'Beta Fictícia', 'ISO 27001', 'Controller', 'active', '123', NULL, NULL),
        ('m71c', '  ', 'ISO 27001', 'Controller', 'active', NULL, '', 0)`),
    ]);
    const antes = await env.DB.prepare('SELECT * FROM projects ORDER BY id').all();

    await execSql(migration0071);
    await execSql(migration0071); // repetível: OR IGNORE e IF NOT EXISTS

    const { results } = await env.DB.prepare('SELECT project_id, cnpj, documento_alternativo, razao_social, setor, funcionarios, pais FROM empresas ORDER BY project_id').all();
    expect(results).toEqual([
      { project_id: 'm71a', cnpj: '11111111000191', documento_alternativo: null, razao_social: 'Alfa Fictícia', setor: 'Varejo', funcionarios: 12, pais: 'BR' },
      { project_id: 'm71b', cnpj: null, documento_alternativo: '123', razao_social: 'Beta Fictícia', setor: null, funcionarios: null, pais: 'BR' },
      { project_id: 'm71c', cnpj: null, documento_alternativo: null, razao_social: null, setor: null, funcionarios: 0, pais: 'BR' },
    ]);
    // as colunas antigas ficam como estavam
    expect((await env.DB.prepare('SELECT * FROM projects ORDER BY id').all()).results).toEqual(antes.results);

    for (const sql of [
      `UPDATE empresas SET cnpj = '1111111100019' WHERE project_id = 'm71a'`,
      `UPDATE empresas SET cnpj = '11111111000a91' WHERE project_id = 'm71a'`,
      `UPDATE empresas SET uf = 'sp' WHERE project_id = 'm71a'`,
      `UPDATE empresas SET funcionarios = -1 WHERE project_id = 'm71a'`,
      `UPDATE empresas SET data_abertura = '03/05/2010' WHERE project_id = 'm71a'`,
    ]) await expect(env.DB.prepare(sql).run(), sql).rejects.toThrow(/CHECK/);

    // some com o projeto
    await env.DB.prepare(`DELETE FROM projects WHERE id = 'm71c'`).run();
    expect(await env.DB.prepare(`SELECT 1 FROM empresas WHERE project_id = 'm71c'`).first()).toBeNull();
    await applySchema(); // convive com o schema canônico
  }, 120_000);
});
