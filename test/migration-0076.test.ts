import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0064 from '../migrations/0064_importacoes.sql?raw';
import migration0067 from '../migrations/0067_importacao_terceiros.sql?raw';
import migration0076 from '../migrations/0076_importacao_legado.sql?raw';

const item = (id: string, entidade: string, decisao = 'pendente', motivo: string | null = null) =>
  env.DB.prepare(`INSERT INTO importacao_itens (id, importacao_id, arquivo_id, project_id, entidade, dados, decisao, motivo, registro_id) VALUES (?, 'l76', 'a76', 'm76', ?, '{"x":1}', ?, ?, 'reg')`)
    .bind(id, entidade, decisao, motivo);

const ANTIGAS = ['tratamento', 'terceiro', 'documento', 'dpia', 'lia', 'titular_pedido', 'incidente', 'consentimento'];
const NOVAS = ['risco', 'gap', 'impacto', 'ciclo', 'bases'];

describe('migration 0076 — importacao_itens aceita as entidades do legado e guarda o aviso', () => {
  it('sobre o banco da 0067 com itens: nada some nem muda, as novas entram, aviso nasce nulo, índices e cascata seguem', async () => {
    await applySchema();
    await execSql('DROP TABLE IF EXISTS importacao_itens; DROP TABLE IF EXISTS importacao_arquivos; DROP TABLE IF EXISTS importacoes;');
    await execSql(migration0064);
    await execSql(migration0067);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('m76', 'C', 'LGPD', 'Controller', 'Active')`),
      env.DB.prepare(`INSERT INTO importacoes (id, project_id) VALUES ('l76', 'm76')`),
      env.DB.prepare(`INSERT INTO importacao_arquivos (id, importacao_id, project_id, nome, mime, tamanho, r2_key) VALUES ('a76', 'l76', 'm76', 'a.csv', 'text/csv', 1, 'k')`),
      ...ANTIGAS.map((e, i) => item(`i-${e}`, e, i % 2 ? 'gravado' : 'recusado', i % 2 ? null : 'motivo antigo')),
    ]);
    await expect(item('i-x', 'risco').run()).rejects.toThrow();
    const antes = (await env.DB.prepare('SELECT * FROM importacao_itens ORDER BY id').all()).results;
    expect(antes).toHaveLength(ANTIGAS.length);

    await execSql(migration0076);

    const depois = (await env.DB.prepare('SELECT * FROM importacao_itens ORDER BY id').all<Record<string, unknown>>()).results;
    expect(depois.map(({ aviso, ...resto }) => { expect(aviso).toBeNull(); return resto; })).toEqual(antes);
    for (const e of NOVAS) await item(`n-${e}`, e).run();
    await env.DB.prepare(`UPDATE importacao_itens SET aviso = 'responsável não encontrado' WHERE id = 'n-risco'`).run();
    await expect(item('n-outro', 'ativo').run()).rejects.toThrow();
    for (const n of ['idx_importacao_itens_lote', 'idx_importacao_itens_arquivo', 'idx_importacao_itens_projeto']) {
      expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").bind(n).first(), n).toBeTruthy();
    }
    expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE name = 'importacao_itens_new'").first()).toBeNull();
    await env.DB.prepare(`DELETE FROM importacoes WHERE id = 'l76'`).run();
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM importacao_itens`).first<{ n: number }>())!.n).toBe(0);

    await applySchema();
  }, 30_000);

  it('o schema canônico aceita as mesmas entidades e tem a coluna aviso', async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES ('m76', 'C', 'LGPD', 'Controller', 'Active')`),
      env.DB.prepare(`INSERT OR IGNORE INTO importacoes (id, project_id) VALUES ('l76', 'm76')`),
      env.DB.prepare(`INSERT OR IGNORE INTO importacao_arquivos (id, importacao_id, project_id, nome, mime, tamanho, r2_key) VALUES ('a76', 'l76', 'm76', 'a.csv', 'text/csv', 1, 'k')`),
    ]);
    for (const e of [...ANTIGAS, ...NOVAS]) await item(`s-${e}`, e).run();
    await expect(item('s-x', 'historico').run()).rejects.toThrow();
    const cols = (await env.DB.prepare(`SELECT name FROM pragma_table_info('importacao_itens')`).all<{ name: string }>()).results.map((c) => c.name);
    expect(cols).toContain('aviso');
  });
});
