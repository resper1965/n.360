import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0084 from '../migrations/0084_lia_respostas.sql?raw';

const colunas = async (t: string) => ((await env.DB.prepare(`PRAGMA table_info(${t})`).all()).results as { name: string }[]).map((c) => c.name);
const recusa = async (sql: string) => { await expect(env.DB.prepare(sql).run()).rejects.toThrow(); };
const semear = () => env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES ('p84', 'Cliente Ficticio', 'ISO 27001', 'controller', 'Active')`),
  env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES ('p84b', 'Outro Ficticio', 'ISO 27001', 'controller', 'Active')`),
  env.DB.prepare(`INSERT OR IGNORE INTO ropa_records (id, project_id, processing_purpose) VALUES ('r84', 'p84', 'Atividade ficticia')`),
  env.DB.prepare(`INSERT OR IGNORE INTO lia_assessments (id, project_id, ropa_id, status) VALUES ('l84', 'p84', 'r84', 'rascunho')`),
]);

describe('migration 0084: respostas do questionário da LIA', () => {
  it('sobre o formato anterior: cria a tabela sem tocar nas linhas de lia_assessments', async () => {
    await applySchema();
    await execSql(`DROP TABLE IF EXISTS lia_respostas;`); // o formato anterior: sem a tabela (o gatilho cai com ela)
    await semear();
    const antes = await env.DB.prepare(`SELECT * FROM lia_assessments WHERE id = 'l84'`).first();
    const colunasLia = await colunas('lia_assessments');

    await execSql(migration0084);

    expect(await colunas('lia_respostas')).toEqual(['ropa_id', 'project_id', 'pergunta', 'resposta', 'updated_by', 'updated_at']);
    expect(await colunas('lia_assessments')).toEqual(colunasLia); // aditiva: a LIA existente não muda
    expect(await env.DB.prepare(`SELECT * FROM lia_assessments WHERE id = 'l84'`).first()).toEqual(antes);
    await execSql(migration0084); // rodar de novo não quebra
    await env.DB.prepare(`DELETE FROM ropa_records WHERE project_id IN ('p84', 'p84b')`).run();
    await env.DB.prepare(`DELETE FROM projects WHERE id IN ('p84', 'p84b')`).run();
  }, 30_000);

  it('o schema canônico traz o mesmo: CHECKs, gatilho de projeto, índice e cascata', async () => {
    await applySchema();
    await semear();
    const ins = (ropa: string, projeto: string, pergunta: string, resposta: string) =>
      `INSERT INTO lia_respostas (ropa_id, project_id, pergunta, resposta) VALUES ('${ropa}', '${projeto}', '${pergunta}', '${resposta}')`;
    await env.DB.prepare(ins('r84', 'p84', 'finalidades', 'Texto ficticio')).run();
    await recusa(ins('r84', 'p84', 'finalidades', 'repetida')); // PK (ropa_id, pergunta)
    await recusa(ins('r84', 'p84b', 'beneficios_empresa', 'x')); // tratamento de outro projeto
    await recusa(ins('inexistente', 'p84', 'beneficios_empresa', 'x'));
    await recusa(ins('r84', 'p84', 'a'.repeat(61), 'x')); // pergunta até 60
    await recusa(ins('r84', 'p84', 'beneficios_empresa', 'a'.repeat(2001))); // resposta até 2000
    const idx = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_lia_respostas_projeto'`).first();
    expect(idx).not.toBeNull();
    await env.DB.prepare(`DELETE FROM ropa_records WHERE id = 'r84'`).run();
    expect(await env.DB.prepare(`SELECT 1 FROM lia_respostas WHERE ropa_id = 'r84'`).first()).toBeNull(); // cascata do tratamento
    await env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('r84', 'p84', 'Atividade ficticia')`).run();
    await env.DB.prepare(ins('r84', 'p84', 'beneficios_empresa', 'x')).run();
    await env.DB.prepare(`DELETE FROM ropa_records WHERE project_id = 'p84'`).run(); // ropa_records não cascateia do projeto (legado): sai antes
    await env.DB.prepare(`DELETE FROM projects WHERE id = 'p84'`).run();
    expect(await env.DB.prepare(`SELECT 1 FROM lia_respostas WHERE project_id = 'p84'`).first()).toBeNull(); // nada sobra
    await env.DB.prepare(`DELETE FROM projects WHERE id = 'p84b'`).run();
  });
});
