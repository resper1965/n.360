import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0075 from '../migrations/0075_homologacao_fornecedor.sql?raw';
import migration0106 from '../migrations/0106_fornecedor_modelos.sql?raw';

/** F5: questionário de homologação (`homologacao_perguntas`) e envios (`homologacoes`) com o gatilho de imutabilidade. */
const colunas = async (t: string) => (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((c) => c.name);
const run = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).run();

describe('migration 0075 — homologação de fornecedor', () => {
  it('sobre o banco de antes: cria as tabelas e o gatilho sem tocar no que existe', async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('m75', 'C', 'LGPD', 'Controller', 'Active')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('m75-p', 'm75', 'organizacao', 'Fornecedor Ficticio')`),
    ]);
    await execSql('DROP TABLE homologacoes; DROP TABLE homologacao_perguntas;');
    const antes = await env.DB.prepare(`SELECT * FROM partes WHERE id = 'm75-p'`).first();
    await execSql(migration0075);
    expect(await env.DB.prepare(`SELECT * FROM partes WHERE id = 'm75-p'`).first()).toEqual(antes);
    expect(await colunas('homologacao_perguntas')).toEqual(['id', 'project_id', 'tema', 'texto', 'ordem', 'ativa', 'origem', 'created_at', 'updated_at']);
    expect(await colunas('homologacoes')).toEqual(['id', 'project_id', 'parte_id', 'token_hash', 'expira_em', 'status', 'perguntas_json', 'respostas_json',
      'enviada_em', 'resultado', 'avaliacao_id', 'concluida_por', 'concluida_em', 'criado_por', 'created_at', 'updated_at']);
    expect(await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'homologacao_imutavel'`).first()).not.toBeNull();
    // as colunas que a 0106 acrescenta a estas tabelas (o gatilho do schema canônico lê `email_destino`), e então o schema canônico
    await execSql((migration0106.match(/ALTER TABLE (homologacoes|homologacao_perguntas) [^;]*;/g) ?? []).join('\n'));
    await applySchema(); // convive com o schema canônico
  }, 30_000);

  describe('integridade no banco', () => {
    beforeAll(async () => {
      await applySchema();
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('c75', 'C', 'LGPD', 'Controller', 'Active')`),
        env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('c75-p', 'c75', 'organizacao', 'Fornecedor Ficticio')`),
      ]);
    });
    const homologacao = (id: string, status = 'aberta') =>
      run(`INSERT INTO homologacoes (id, project_id, parte_id, token_hash, expira_em, status, perguntas_json) VALUES (?, 'c75', 'c75-p', ?, '2099-01-01 00:00:00', ?, '[]')`, id, `h-${id}`, status);

    it('CHECK de status, resultado, ativa e origem; token_hash único', async () => {
      await homologacao('h1');
      await expect(homologacao('h2', 'perdida')).rejects.toThrow(/CHECK/);
      await expect(run(`INSERT INTO homologacoes (id, project_id, parte_id, token_hash, expira_em, perguntas_json) VALUES ('h3', 'c75', 'c75-p', 'h-h1', '2099-01-01', '[]')`)).rejects.toThrow(/UNIQUE/);
      await expect(run(`UPDATE homologacoes SET resultado = 'talvez' WHERE id = 'h1'`)).rejects.toThrow(/CHECK/);
      await expect(run(`INSERT INTO homologacao_perguntas (id, project_id, tema, texto, ativa) VALUES ('q1', 'c75', 'T', 'P', 2)`)).rejects.toThrow(/CHECK/);
      await expect(run(`INSERT INTO homologacao_perguntas (id, project_id, tema, texto, origem) VALUES ('q2', 'c75', 'T', 'P', 'outra')`)).rejects.toThrow(/CHECK/);
      await expect(run(`INSERT INTO homologacao_perguntas (id, project_id, tema, texto) VALUES ('q3', 'c75', 'T', '')`)).rejects.toThrow(/CHECK/);
    });

    it('perguntas congeladas; respostas só mudam aberta; não volta a aberta', async () => {
      await homologacao('h4');
      await run(`UPDATE homologacoes SET respostas_json = '{"a":1}' WHERE id = 'h4'`);
      await expect(run(`UPDATE homologacoes SET perguntas_json = '[1]' WHERE id = 'h4'`)).rejects.toThrow(/imutaveis/);
      await expect(run(`UPDATE homologacoes SET token_hash = 'outro' WHERE id = 'h4'`)).rejects.toThrow(/imutaveis/);
      await run(`UPDATE homologacoes SET status = 'respondida', enviada_em = CURRENT_TIMESTAMP WHERE id = 'h4'`);
      await expect(run(`UPDATE homologacoes SET respostas_json = '{}' WHERE id = 'h4'`)).rejects.toThrow(/imutaveis/);
      await expect(run(`UPDATE homologacoes SET status = 'aberta' WHERE id = 'h4'`)).rejects.toThrow(/imutaveis/);
      await run(`UPDATE homologacoes SET status = 'concluida', resultado = 'aprovado' WHERE id = 'h4'`);
      expect((await env.DB.prepare(`SELECT respostas_json FROM homologacoes WHERE id = 'h4'`).first<{ respostas_json: string }>())!.respostas_json).toBe('{"a":1}');
    });

    it('apagar a parte apaga as homologações', async () => {
      await homologacao('h5');
      await run(`DELETE FROM partes WHERE id = 'c75-p'`);
      expect((await env.DB.prepare(`SELECT count(*) AS n FROM homologacoes WHERE project_id = 'c75'`).first<{ n: number }>())!.n).toBe(0);
    });
  });
});
