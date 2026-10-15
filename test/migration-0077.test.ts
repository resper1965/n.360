import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0077 from '../migrations/0077_convite_senha.sql?raw';

/** Convite com link para criar a senha: `convites_senha`, uma linha por conta, token único, some com a conta. */
const colunas = async (t: string) => (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((c) => c.name);
const run = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).run();

describe('migration 0077 — convite com link', () => {
  it('sobre o banco de antes: cria a tabela sem tocar nas contas; aplicar de novo não falha', async () => {
    await applySchema();
    await run(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('m77', 'm77@ficticio.lat', 'x', 'M', 'org_user')`);
    await execSql('DROP TABLE convites_senha;');
    const antes = await env.DB.prepare(`SELECT * FROM users WHERE id = 'm77'`).first();
    await execSql(migration0077);
    await execSql(migration0077);
    expect(await env.DB.prepare(`SELECT * FROM users WHERE id = 'm77'`).first()).toEqual(antes);
    expect(await colunas('convites_senha')).toEqual(['user_id', 'token_hash', 'expira_em', 'criado_por', 'created_at']);
  }, 30_000);

  it('uma linha por conta, hash único, e some com a conta', async () => {
    await applySchema();
    await run(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('c77a', 'a77@ficticio.lat', 'x', 'A', 'org_user'), ('c77b', 'b77@ficticio.lat', 'x', 'B', 'org_user')`);
    await run(`INSERT INTO convites_senha (user_id, token_hash, expira_em) VALUES ('c77a', 'h1', '2099-01-01 00:00:00')`);
    await expect(run(`INSERT INTO convites_senha (user_id, token_hash, expira_em) VALUES ('c77b', 'h1', '2099-01-01 00:00:00')`)).rejects.toThrow(/UNIQUE/);
    await expect(run(`INSERT INTO convites_senha (user_id, token_hash, expira_em) VALUES ('c77a', 'h2', '2099-01-01 00:00:00')`)).rejects.toThrow(/UNIQUE|PRIMARY/);
    await run(`DELETE FROM users WHERE id = 'c77a'`);
    expect(await env.DB.prepare(`SELECT 1 FROM convites_senha WHERE user_id = 'c77a'`).first()).toBeNull();
  });
});
