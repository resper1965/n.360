import { describe, it, expect, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0087 from '../migrations/0087_eliminacao_ativos_proprios.sql?raw';

// Reconstrói o esquema (DROP + applySchema): numa máquina lenta/carregada passa fácil de 5 s.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const itens = async (rid: string, etapa: string) => ((await env.DB.prepare(`SELECT item_id FROM tratamento_etapa_itens WHERE ropa_id = ? AND etapa = ? ORDER BY item_id`).bind(rid, etapa).all()).results as { item_id: string }[]).map((r) => r.item_id);

describe('migration 0087: a Eliminação passa a ter ativos próprios', () => {
  it('sobre o formato anterior: a etapa nova passa a valer, os ativos do Armazenamento são copiados e o resto fica como está', async () => {
    await applySchema();
    // o formato anterior: CHECK sem 'eliminacao'
    await execSql(`DROP TABLE tratamento_etapa_itens;
      CREATE TABLE tratamento_etapa_itens (
        ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
        etapa TEXT NOT NULL CHECK (etapa IN ('coleta', 'uso', 'compartilhamento_interno', 'compartilhamento_externo', 'armazenamento')),
        item_id TEXT NOT NULL REFERENCES itens(id) ON DELETE CASCADE,
        local_armazenamento TEXT CHECK (local_armazenamento IS NULL OR (etapa = 'armazenamento' AND length(local_armazenamento) <= 200)),
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        PRIMARY KEY (ropa_id, etapa, item_id)
      );`);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p87', 'Cliente Ficticio', 'LGPD', 'controller', 'Active')`),
      env.DB.prepare(`INSERT INTO itens (id, project_id, tipo, nome) VALUES ('i87a', 'p87', 'ativo', 'Sistema exemplo A'), ('i87b', 'p87', 'ativo', 'Sistema exemplo B')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('r87', 'p87', 'Finalidade exemplo')`),
      env.DB.prepare(`INSERT INTO tratamento_etapa_itens (ropa_id, etapa, item_id, local_armazenamento, project_id) VALUES ('r87', 'coleta', 'i87a', NULL, 'p87'), ('r87', 'armazenamento', 'i87a', 'Servidor exemplo', 'p87'), ('r87', 'armazenamento', 'i87b', NULL, 'p87')`),
    ]);
    await expect(env.DB.prepare(`INSERT INTO tratamento_etapa_itens (ropa_id, etapa, item_id, project_id) VALUES ('r87', 'eliminacao', 'i87a', 'p87')`).run()).rejects.toThrow();

    await execSql(migration0087);

    expect(await itens('r87', 'eliminacao')).toEqual(['i87a', 'i87b']);
    expect(await itens('r87', 'armazenamento')).toEqual(['i87a', 'i87b']);
    expect(await itens('r87', 'coleta')).toEqual(['i87a']);
    expect(await env.DB.prepare(`SELECT local_armazenamento AS l FROM tratamento_etapa_itens WHERE etapa = 'armazenamento' AND item_id = 'i87a'`).first()).toEqual({ l: 'Servidor exemplo' });
    // local de armazenamento continua só do Armazenamento; apagar o ativo continua levando as linhas; o índice voltou
    await expect(env.DB.prepare(`UPDATE tratamento_etapa_itens SET local_armazenamento = 'x' WHERE etapa = 'eliminacao'`).run()).rejects.toThrow();
    expect(await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_etapa_itens_item'`).first()).toEqual({ name: 'idx_etapa_itens_item' });
    await env.DB.prepare(`DELETE FROM itens WHERE id = 'i87b'`).run();
    expect(await itens('r87', 'eliminacao')).toEqual(['i87a']);
  });
});
