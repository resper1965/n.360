import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0117 from '../migrations/0117_titular_canal.sql?raw';

/** 0117 (canal do titular, spec 2026-11-19): migration e schema.sql criam a MESMA tabela; aditiva e repetível; CASCADE do projeto, SET NULL da parte. */
const definicao = async () =>
  ((await env.DB.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'titular_canal'`).first<{ sql: string }>())?.sql ?? '')
    .replace(/\s+/g, ' ').trim();

describe('migration 0117 — canal do titular', () => {
  beforeAll(async () => { await applySchema(); });

  it('schema.sql e a migration criam a mesma tabela (texto igual, sem contar espaços); repetível', async () => {
    const doSchema = await definicao();
    expect(doSchema).toContain('CREATE TABLE');
    await execSql('DROP TABLE titular_canal;');
    await execSql(migration0117);
    await execSql(migration0117);
    expect(await definicao()).toBe(doSchema);
  });

  it('colunas na ordem, nenhuma de token ou hash (o link do portal nunca é gravado), nada ot_', async () => {
    const { results } = await env.DB.prepare('PRAGMA table_info(titular_canal)').all<{ name: string }>();
    expect(results.map((c) => c.name)).toEqual(['id', 'project_id', 'email', 'telefone', 'formulario_url', 'divulgacao_url',
      'responsavel_parte_id', 'conferido_em', 'conferido_por', 'atualizado_por', 'updated_at']);
  });

  it('uma linha por projeto; tamanhos no CHECK; apagar a parte só limpa o responsável; apagar o projeto apaga o canal', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('m117', 'C', 'ISO 27001', 'Controller', 'Active')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('m117-p', 'm117', 'pessoa', 'Ana Exemplo')`),
      env.DB.prepare(`INSERT INTO titular_canal (id, project_id, email, responsavel_parte_id) VALUES ('m117-c', 'm117', 'privacidade@exemplo.com.br', 'm117-p')`),
    ]);
    await expect(env.DB.prepare(`INSERT INTO titular_canal (id, project_id) VALUES ('m117-c2', 'm117')`).run()).rejects.toThrow();
    await expect(env.DB.prepare(`UPDATE titular_canal SET telefone = ? WHERE id = 'm117-c'`).bind('9'.repeat(41)).run()).rejects.toThrow();
    await expect(env.DB.prepare(`UPDATE titular_canal SET divulgacao_url = ? WHERE id = 'm117-c'`).bind(`https://x.com/${'a'.repeat(490)}`).run()).rejects.toThrow();
    await env.DB.prepare(`DELETE FROM partes WHERE id = 'm117-p'`).run();
    expect(await env.DB.prepare(`SELECT responsavel_parte_id AS r FROM titular_canal WHERE id = 'm117-c'`).first()).toEqual({ r: null });
    await env.DB.prepare(`DELETE FROM projects WHERE id = 'm117'`).run();
    expect(await env.DB.prepare(`SELECT 1 FROM titular_canal WHERE id = 'm117-c'`).first()).toBeNull();
  });
});
