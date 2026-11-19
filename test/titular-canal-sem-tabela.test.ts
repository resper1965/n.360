import { describe, it, expect, beforeAll, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import { resumoDoCanal } from '../src/services/titular-canal';
import { gerarPortal } from '../src/services/titular-pedidos';

/** Produção antes da 0117 (deploy fora do workflow): o resumo não derruba o painel; o canal conta como não registrado. */
describe('resumoDoCanal sem a tabela titular_canal', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('st', 'C', 'ISO 27001', 'Controller', 'Active')`).run();
    await gerarPortal(env.DB, 'st', 'cons@ness.teste');
    await env.DB.prepare('DROP TABLE titular_canal').run();
  });

  it('devolve o canal vazio (com o portal), registra o aviso e não lança', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await resumoDoCanal(env.DB, 'st')).toEqual({ meios: [], portal_ativo: true, divulgado: false, conferido_em: null });
    expect(log.mock.calls.flat().join(' ')).toContain('titular_canal_ausente');
    log.mockRestore();
  });

  it('outro erro de banco continua subindo: só a tabela ausente é tolerada', async () => {
    const db = { prepare: (sql: string) => (sql.includes('titular_canal')
      ? { bind: () => ({ first: async () => { throw new Error('D1_ERROR: database is locked'); } }) }
      : env.DB.prepare(sql)) } as unknown as D1Database;
    await expect(resumoDoCanal(db, 'st')).rejects.toThrow('database is locked');
  });
});
