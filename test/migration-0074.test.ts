import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0074 from '../migrations/0074_ciclo_e_bases.sql?raw';

/** F3: ciclo de vida por etapa (`tratamento_ciclo`), bases adicionais (`tratamento_bases`) e `ropa_records.base_gdpr`. */
const colunas = async (t: string) => (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((c) => c.name);
const ins = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).run();

describe('migration 0074 — ciclo de vida e bases adicionais', () => {
  it('sobre o banco de antes: preserva o registro, cria as tabelas e a coluna vazia', async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('m74', 'C', 'LGPD', 'Controller', 'Active')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, legal_basis) VALUES ('m74-r', 'm74', 'Folha', 'Consentimento')`),
    ]);
    await execSql('DROP TABLE tratamento_ciclo; DROP TABLE tratamento_bases; ALTER TABLE ropa_records DROP COLUMN base_gdpr;');
    const antes = await env.DB.prepare(`SELECT * FROM ropa_records WHERE id = 'm74-r'`).first();
    await execSql(migration0074);
    expect(await env.DB.prepare(`SELECT * FROM ropa_records WHERE id = 'm74-r'`).first()).toEqual({ ...antes, base_gdpr: null });
    expect(await colunas('tratamento_ciclo')).toEqual(['ropa_id', 'project_id', 'etapa', 'situacao', 'item_id', 'descricao', 'atualizado_por', 'atualizado_em']);
    expect(await colunas('tratamento_bases')).toEqual(['ropa_id', 'requisito_id', 'project_id', 'observacao', 'created_at']);
    await applySchema(); // convive com o schema canônico
  }, 30_000);

  describe('integridade no banco', () => {
    beforeAll(async () => {
      await applySchema();
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('c74', 'C', 'LGPD', 'Controller', 'Active'), ('c74-o', 'O', 'LGPD', 'Controller', 'Active')`),
        env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('c74-r', 'c74', 'Folha'), ('c74-ro', 'c74-o', 'Alheia')`),
        env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('c74-i', 'c74', 'ERP', 'sistema'), ('c74-io', 'c74-o', 'Alheio', 'sistema')`),
        env.DB.prepare(`INSERT OR IGNORE INTO requisito_fontes (id, nome) VALUES ('lgpd', 'LGPD')`),
        env.DB.prepare(`INSERT OR IGNORE INTO requisitos (id, fonte_id, referencia, titulo) VALUES ('lgpd:art7:ii', 'lgpd', 'art. 7, II', 'Cumprimento de obrigação legal ou regulatória')`),
      ]);
    });

    it('aceita etapa e situação do catálogo e recusa o resto', async () => {
      await ins(`INSERT INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao, item_id) VALUES ('c74-r', 'c74', 'coleta', 'registrada', 'c74-i')`);
      await expect(ins(`INSERT INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao) VALUES ('c74-r', 'c74', 'venda', 'registrada')`)).rejects.toThrow(/CHECK/);
      await expect(ins(`INSERT INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao) VALUES ('c74-r', 'c74', 'uso', 'talvez')`)).rejects.toThrow(/CHECK/);
      await expect(ins(`INSERT INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao, item_id) VALUES ('c74-r', 'c74', 'uso', 'nao_aplicavel', 'c74-i')`)).rejects.toThrow(/CHECK/);
      await expect(ins(`INSERT INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao) VALUES ('c74-r', 'c74', 'coleta', 'registrada')`)).rejects.toThrow(/UNIQUE|PRIMARY/);
    });

    it('recusa item ou tratamento de outro projeto, ao inserir e ao alterar', async () => {
      await expect(ins(`INSERT INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao, item_id) VALUES ('c74-r', 'c74', 'uso', 'registrada', 'c74-io')`)).rejects.toThrow(/outro projeto/);
      await expect(ins(`INSERT INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao) VALUES ('c74-ro', 'c74', 'uso', 'registrada')`)).rejects.toThrow(/outro projeto/);
      await expect(ins(`UPDATE tratamento_ciclo SET item_id = 'c74-io' WHERE ropa_id = 'c74-r' AND etapa = 'coleta'`)).rejects.toThrow(/outro projeto/);
    });

    it('apagar o item solta a etapa; apagar o tratamento apaga ciclo e bases', async () => {
      await ins(`INSERT INTO tratamento_bases (ropa_id, requisito_id, project_id) VALUES ('c74-r', 'lgpd:art7:ii', 'c74')`);
      await ins(`DELETE FROM itens WHERE id = 'c74-i'`);
      expect(await env.DB.prepare(`SELECT situacao, item_id FROM tratamento_ciclo WHERE ropa_id = 'c74-r' AND etapa = 'coleta'`).first()).toEqual({ situacao: 'registrada', item_id: null });
      await ins(`DELETE FROM ropa_records WHERE id = 'c74-r'`);
      expect(await env.DB.prepare(`SELECT (SELECT count(*) FROM tratamento_ciclo WHERE ropa_id = 'c74-r') + (SELECT count(*) FROM tratamento_bases WHERE ropa_id = 'c74-r') AS n`).first()).toEqual({ n: 0 });
    });
  });
});
