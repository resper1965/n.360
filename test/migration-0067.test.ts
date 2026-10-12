import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0064 from '../migrations/0064_importacoes.sql?raw';
import migration0067 from '../migrations/0067_importacao_terceiros.sql?raw';

const item = (id: string, entidade: string, ref: string | null = null) =>
  env.DB.prepare(`INSERT INTO importacao_itens (id, importacao_id, arquivo_id, project_id, entidade, dados, duplicata_de, registro_id) VALUES (?, 'l67', 'a67', 'm67', ?, '{}', ?, ?)`)
    .bind(id, entidade, ref, ref);

describe('migration 0067 — importacao_itens aceita a entidade terceiro', () => {
  it('sobre o banco da 0064: preserva os itens, aceita terceiro (com id de parte) e mantém índices e cascata', async () => {
    await applySchema();
    await execSql('DROP TABLE IF EXISTS importacao_itens; DROP TABLE IF EXISTS importacao_arquivos; DROP TABLE IF EXISTS importacoes;');
    await execSql(migration0064);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('m67', 'C', 'LGPD', 'Controller', 'Active')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('r67', 'm67', 'Folha')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('pa67', 'm67', 'organizacao', 'Fornecedor')`),
      env.DB.prepare(`INSERT INTO importacoes (id, project_id) VALUES ('l67', 'm67')`),
      env.DB.prepare(`INSERT INTO importacao_arquivos (id, importacao_id, project_id, nome, mime, tamanho, r2_key) VALUES ('a67', 'l67', 'm67', 'a.csv', 'text/csv', 1, 'k')`),
      item('i-trat', 'tratamento', 'r67'),
    ]);
    // antes: terceiro é recusado pelo CHECK
    await expect(item('i-x', 'terceiro').run()).rejects.toThrow();
    const antes = (await env.DB.prepare('SELECT * FROM importacao_itens ORDER BY id').all()).results;

    await execSql(migration0067);

    expect((await env.DB.prepare('SELECT * FROM importacao_itens ORDER BY id').all()).results).toEqual(antes);
    await item('i-terc', 'terceiro', 'pa67').run(); // id de parte em duplicata_de/registro_id: sem FK para ropa_records
    await expect(item('i-outro', 'documento').run()).rejects.toThrow();
    for (const n of ['idx_importacao_itens_lote', 'idx_importacao_itens_arquivo', 'idx_importacao_itens_projeto']) {
      expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").bind(n).first(), n).toBeTruthy();
    }
    // apagar o lote ainda leva os itens
    await env.DB.prepare(`DELETE FROM importacoes WHERE id = 'l67'`).run();
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM importacao_itens`).first<{ n: number }>())!.n).toBe(0);

    await applySchema(); // convive com o schema canônico
  }, 30_000);

  it('o schema canônico aceita terceiro e recusa entidade fora da lista', async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES ('m67', 'C', 'LGPD', 'Controller', 'Active')`),
      env.DB.prepare(`INSERT OR IGNORE INTO importacoes (id, project_id) VALUES ('l67', 'm67')`),
      env.DB.prepare(`INSERT OR IGNORE INTO importacao_arquivos (id, importacao_id, project_id, nome, mime, tamanho, r2_key) VALUES ('a67', 'l67', 'm67', 'a.csv', 'text/csv', 1, 'k')`),
    ]);
    await item('s-terc', 'terceiro', 'qualquer-parte').run();
    await expect(item('s-x', 'historico').run()).rejects.toThrow();
  });
});
