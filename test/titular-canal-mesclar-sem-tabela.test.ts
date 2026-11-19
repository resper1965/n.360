import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import { mesclar, previaDaMescla } from '../src/services/mesclar';

/** Código publicado antes da 0117: prévia e mescla de partes seguem sem a tabela (nada de 500); o resto do erro continua subindo. */
describe('mescla de partes sem a tabela titular_canal', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('ms', 'C', 'ISO 27001', 'Controller', 'Active')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('ms-a', 'ms', 'pessoa', 'Ana'), ('ms-b', 'ms', 'pessoa', 'Ana Dup')`),
    ]);
    await env.DB.prepare('DROP TABLE titular_canal').run();
  });

  // Devolve o schema canônico (recria titular_canal): o teste não depende do isolamento de armazenamento por arquivo.
  afterAll(async () => { await applySchema(); });

  it('prévia e mescla funcionam e registram o aviso', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await previaDaMescla(env.DB, 'partes', 'ms', 'ms-a', 'ms-b')).toMatchObject({ ok: true });
    expect(await mesclar(env.DB, 'partes', 'ms', 'cons@ness.teste', 'ms-a', 'ms-b')).toMatchObject({ ok: true });
    expect(log.mock.calls.flat().join(' ')).toContain('titular_canal_ausente');
    log.mockRestore();
    expect((await env.DB.prepare(`SELECT status FROM partes WHERE id = 'ms-b'`).first<{ status: string }>())?.status).toBe('inativa');
  });

  it('outro erro de banco sobe: só a tabela ausente é tolerada', async () => {
    await env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('ms-c', 'ms', 'pessoa', 'C'), ('ms-d', 'ms', 'pessoa', 'D')`).run();
    const db = { prepare: (sql: string) => (sql.includes('PRAGMA table_info(titular_canal)') ? { all: async () => { throw new Error('D1_ERROR: database is locked'); } } : env.DB.prepare(sql)) } as unknown as D1Database;
    await expect(previaDaMescla(db, 'partes', 'ms', 'ms-c', 'ms-d')).rejects.toThrow('database is locked');
  });
});
