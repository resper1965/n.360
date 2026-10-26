import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0083 from '../migrations/0083_ripd_respostas.sql?raw';

const colunas = async (t: string) => ((await env.DB.prepare(`PRAGMA table_info(${t})`).all()).results as { name: string }[]).map((c) => c.name);
const recusa = async (sql: string) => { await expect(env.DB.prepare(sql).run()).rejects.toThrow(); };
const semear = () => env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES ('p83', 'Cliente Ficticio', 'ISO 27001', 'controller', 'Active')`),
  env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES ('p83b', 'Outro Ficticio', 'ISO 27001', 'controller', 'Active')`),
  env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, system_name, status) VALUES ('d83', 'p83', 'Sistema Ficticio', 'Draft')`),
]);

describe('migration 0083: respostas do questionário do RIPD', () => {
  it('sobre o formato anterior: cria a tabela sem tocar nas linhas de dpia_assessments', async () => {
    await applySchema();
    await execSql(`DROP TABLE IF EXISTS dpia_respostas;`); // o formato anterior: sem a tabela (o gatilho cai com ela)
    await semear();
    const antes = await env.DB.prepare(`SELECT * FROM dpia_assessments WHERE id = 'd83'`).first();
    const colunasDpia = await colunas('dpia_assessments');

    await execSql(migration0083);

    expect(await colunas('dpia_respostas')).toEqual(['dpia_id', 'project_id', 'pergunta', 'resposta', 'updated_by', 'updated_at']);
    expect(await colunas('dpia_assessments')).toEqual(colunasDpia); // aditiva: nenhuma coluna a mais no RIPD, logo nada no hash
    expect(await env.DB.prepare(`SELECT * FROM dpia_assessments WHERE id = 'd83'`).first()).toEqual(antes);
    await env.DB.prepare(`DELETE FROM projects WHERE id IN ('p83', 'p83b')`).run();
  }, 30_000);

  it('o schema canônico traz o mesmo: CHECKs, gatilho de projeto, índice e cascata', async () => {
    await applySchema();
    await semear();
    const ins = (dpia: string, projeto: string, pergunta: string, resposta: string) =>
      `INSERT INTO dpia_respostas (dpia_id, project_id, pergunta, resposta) VALUES ('${dpia}', '${projeto}', '${pergunta}', '${resposta}')`;
    await env.DB.prepare(ins('d83', 'p83', 'o_que_muda', 'Texto ficticio')).run();
    await recusa(ins('d83', 'p83', 'o_que_muda', 'repetida')); // PK (dpia_id, pergunta)
    await recusa(ins('d83', 'p83b', 'beneficios', 'x')); // RIPD de outro projeto
    await recusa(ins('inexistente', 'p83', 'beneficios', 'x'));
    await recusa(ins('d83', 'p83', 'a'.repeat(61), 'x')); // pergunta até 60
    await recusa(ins('d83', 'p83', 'beneficios', 'a'.repeat(2001))); // resposta até 2000
    const idx = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_dpia_respostas_projeto'`).first();
    expect(idx).not.toBeNull();
    await env.DB.prepare(`DELETE FROM dpia_assessments WHERE id = 'd83'`).run();
    expect(await env.DB.prepare(`SELECT 1 FROM dpia_respostas WHERE dpia_id = 'd83'`).first()).toBeNull(); // cascata do RIPD
    await env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id) VALUES ('d83', 'p83')`).run();
    await env.DB.prepare(ins('d83', 'p83', 'beneficios', 'x')).run();
    await env.DB.prepare(`DELETE FROM projects WHERE id = 'p83'`).run();
    expect(await env.DB.prepare(`SELECT 1 FROM dpia_respostas WHERE project_id = 'p83'`).first()).toBeNull(); // cascata do projeto
    await env.DB.prepare(`DELETE FROM projects WHERE id = 'p83b'`).run();
  });
});
