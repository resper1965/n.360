import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0087 from '../migrations/0087_eliminacao_ativos_proprios.sql?raw';
import migration0088 from '../migrations/0088_gatilho_etapa_itens.sql?raw';

const gatilhos = async () => ((await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'tratamento_etapa_itens'`).all()).results as { name: string }[]).map((t) => t.name);

describe('migration 0088: o gatilho de isolamento volta depois da 0087', () => {
  it('a 0087 sozinha perde o gatilho; a 0088 o devolve (repetir é inofensivo) e SQL direto de outro projeto é recusado', async () => {
    await applySchema();
    await execSql(migration0087); // refaz a tabela: o DROP leva o gatilho
    expect(await gatilhos()).toEqual([]);

    await execSql(migration0088);
    await execSql(migration0088);
    expect(await gatilhos()).toEqual(['etapa_itens_do_projeto_ins']);

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p88a', 'Cliente Ficticio A', 'LGPD', 'controller', 'Active'), ('p88b', 'Cliente Ficticio B', 'LGPD', 'controller', 'Active')`),
      env.DB.prepare(`INSERT INTO itens (id, project_id, tipo, nome) VALUES ('i88a', 'p88a', 'ativo', 'Sistema A'), ('i88b', 'p88b', 'ativo', 'Sistema B')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('r88a', 'p88a', 'Finalidade A')`),
    ]);
    const ligar = (item: string) => env.DB.prepare(`INSERT INTO tratamento_etapa_itens (ropa_id, etapa, item_id, project_id) VALUES ('r88a', 'eliminacao', ?, 'p88a')`).bind(item).run();
    await expect(ligar('i88b')).rejects.toThrow(/outro projeto/);
    await ligar('i88a');
  });
});
