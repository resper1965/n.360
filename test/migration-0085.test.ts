import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0085 from '../migrations/0085_partes_cnpj.sql?raw';

const colunas = async (t: string) => ((await env.DB.prepare(`PRAGMA table_info(${t})`).all()).results as { name: string }[]).map((c) => c.name);
const recusa = async (sql: string) => { await expect(env.DB.prepare(sql).run()).rejects.toThrow(); };
const semear = () => env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES ('p85', 'Cliente Ficticio', 'ISO 27001', 'controller', 'Active')`),
  env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES ('p85b', 'Outro Ficticio', 'ISO 27001', 'controller', 'Active')`),
  env.DB.prepare(`INSERT OR IGNORE INTO partes (id, project_id, tipo, nome) VALUES ('pa85', 'p85', 'organizacao', 'Org Existente')`),
  env.DB.prepare(`INSERT OR IGNORE INTO partes (id, project_id, tipo, nome) VALUES ('pp85', 'p85', 'pessoa', 'Pessoa Existente')`),
]);

describe('migration 0085: CNPJ da organização em partes', () => {
  it('sobre o formato anterior: acrescenta a coluna sem mudar nenhuma linha', async () => {
    await applySchema();
    await execSql(`DROP INDEX IF EXISTS idx_partes_cnpj; ALTER TABLE partes DROP COLUMN cnpj;`); // o formato anterior
    await semear();
    const antes = (await env.DB.prepare(`SELECT * FROM partes ORDER BY id`).all()).results;
    expect(await colunas('partes')).not.toContain('cnpj');

    await execSql(migration0085);

    expect(await colunas('partes')).toContain('cnpj');
    const depois = (await env.DB.prepare(`SELECT * FROM partes ORDER BY id`).all()).results as Record<string, unknown>[];
    expect(depois.map(({ cnpj, ...resto }) => resto)).toEqual(antes); // aditiva: o resto das colunas é o mesmo
    expect(depois.every((p) => p.cnpj === null)).toBe(true);
  });

  it('só organização tem CNPJ, só dígitos, 14; um por projeto', async () => {
    await applySchema();
    await semear();
    await env.DB.prepare(`UPDATE partes SET cnpj = '11222333000181' WHERE id = 'pa85'`).run();
    await recusa(`UPDATE partes SET cnpj = '11222333000181' WHERE id = 'pp85'`); // pessoa
    await recusa(`UPDATE partes SET cnpj = '11.222.333/0001-81' WHERE id = 'pa85'`); // máscara
    await recusa(`UPDATE partes SET cnpj = '123' WHERE id = 'pa85'`); // tamanho
    await env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, cnpj) VALUES ('pc85', 'p85b', 'organizacao', 'Mesma Matriz', '11222333000181')`).run(); // outro projeto pode
    await recusa(`INSERT INTO partes (id, project_id, tipo, nome, cnpj) VALUES ('pd85', 'p85', 'organizacao', 'Duplicada', '11222333000181')`); // mesmo projeto não
    await env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('pe85', 'p85', 'organizacao', 'Sem CNPJ 1')`).run();
    await env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('pf85', 'p85', 'organizacao', 'Sem CNPJ 2')`).run(); // nulo não colide
    await env.DB.prepare(`DELETE FROM partes WHERE project_id IN ('p85', 'p85b')`).run();
    await env.DB.prepare(`DELETE FROM projects WHERE id IN ('p85', 'p85b')`).run();
  });
});
