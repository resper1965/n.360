import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0081 from '../migrations/0081_paridade_legado.sql?raw';

const colunas = async (t: string) => ((await env.DB.prepare(`PRAGMA table_info(${t})`).all()).results as { name: string }[]).map((c) => c.name);
const recusa = async (sql: string) => { await expect(env.DB.prepare(sql).run()).rejects.toThrow(); };

describe('migration 0081: paridade com o legado (descrição da área e documentos em arquivo)', () => {
  it('sobre o formato anterior: acrescenta departamentos.descricao, preserva as linhas e cria documentos_arquivo', async () => {
    await applySchema();
    // O formato anterior: sem a coluna e sem a tabela (DROP COLUMN em vez de recriar departamentos, que outras tabelas referenciam).
    await execSql(`DROP TABLE IF EXISTS documentos_arquivo; ALTER TABLE departamentos DROP COLUMN descricao; ALTER TABLE catalogo_itens DROP COLUMN descricao;`);
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES ('p81', 'Cliente Ficticio', 'ISO 27001', 'controller', 'Active')`),
      env.DB.prepare(`INSERT INTO departamentos (id, project_id, nome) VALUES ('d81', 'p81', 'Financeiro')`),
      env.DB.prepare(`INSERT INTO catalogo_itens (id, project_id, tipo, nome) VALUES ('c81', 'p81', 'titular', 'Titular Ficticio')`),
    ]);

    await execSql(migration0081);

    expect(await colunas('departamentos')).toContain('descricao');
    expect(await env.DB.prepare(`SELECT nome, descricao FROM departamentos WHERE id = 'd81'`).first()).toEqual({ nome: 'Financeiro', descricao: null });
    expect(await colunas('catalogo_itens')).toContain('descricao');
    expect(await env.DB.prepare(`SELECT nome, descricao FROM catalogo_itens WHERE id = 'c81'`).first()).toEqual({ nome: 'Titular Ficticio', descricao: null });
    await expect(env.DB.prepare(`UPDATE catalogo_itens SET descricao = 'x' WHERE id = 'c81'`).run()).resolves.toBeTruthy();
    await recusa(`INSERT INTO catalogo_itens (id, project_id, tipo, nome, descricao) VALUES ('c82', 'p81', 'dado', 'Dado Ficticio', 'nao')`); // só titular
    expect(await colunas('documentos_arquivo')).toEqual(['id', 'project_id', 'nome', 'tipo', 'status', 'vencimento', 'sem_vencimento', 'responsavel_parte_id',
      'r2_key', 'arquivo_nome', 'arquivo_tipo', 'criado_por', 'created_at', 'updated_at']);

    await env.DB.prepare(`DELETE FROM projects WHERE id = 'p81'`).run();
  }, 120_000);

  it('o schema canônico traz o mesmo, com os CHECKs de tipo, status, arquivo e vencimento', async () => {
    await applySchema();
    expect(await colunas('departamentos')).toContain('descricao');
    await env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES ('p81', 'Cliente Ficticio', 'ISO 27001', 'controller', 'Active')`).run();
    const ins = (id: string, tipo: string, status: string, extra = 'NULL, 0, NULL') =>
      `INSERT INTO documentos_arquivo (id, project_id, nome, tipo, status, vencimento, sem_vencimento, arquivo_tipo) VALUES ('${id}', 'p81', 'Doc', '${tipo}', '${status}', ${extra})`;
    await env.DB.prepare(ins('ok', 'politica', 'publicado', `'2027-01-31', 0, 'pdf'`)).run();
    await recusa(ins('t', 'planilha', 'rascunho'));
    await recusa(ins('s', 'politica', 'vigente'));
    await recusa(ins('a', 'politica', 'rascunho', `NULL, 0, 'exe'`));
    await recusa(ins('v', 'politica', 'rascunho', `'2027-01-31', 1, NULL`)); // sem vencimento com data
    const idx = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'documentos_arquivo' AND name = 'idx_documentos_arquivo_projeto'`).first();
    expect(idx).not.toBeNull();
    await env.DB.prepare(`DELETE FROM projects WHERE id = 'p81'`).run();
    expect(await env.DB.prepare(`SELECT 1 FROM documentos_arquivo WHERE id = 'ok'`).first()).toBeNull(); // cascata do projeto
  });
});
