// test/migration-0108.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql, seedTwoProjects } from './helpers/d1';
import mig from '../migrations/0108_ot_desvios.sql?raw';

const um = <T>(sql: string) => env.DB.prepare(sql).all<T>();
const desvio = (id: string, o: { tipo?: string; chave?: string; dados?: string; situacao?: string } = {}) =>
  env.DB.prepare(
    `INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, situacao, primeira_vez, ultima_vez)
     VALUES (?, 'proj-a', 's-a', ?, ?, ?, ?, '2026-11-01', '2026-11-01')`,
  ).bind(id, o.tipo ?? 'fluxo', o.chave ?? id, o.dados ?? '{}', o.situacao ?? 'aberto').run();

describe('migration 0108: desvios do n.ot', () => {
  beforeAll(async () => {
    await applySchema(); await seedTwoProjects();
    await env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s-a', 'proj-a', 'SE A')`).run();
  });

  it('cria a tabela e os 2 índices; a migração é repetível', async () => {
    await execSql(mig);
    expect((await um(`SELECT name FROM sqlite_master WHERE name = 'ot_desvios'`)).results).toHaveLength(1);
    expect((await um(`SELECT name FROM sqlite_master WHERE name IN ('idx_ot_desvios_situacao','idx_ot_desvios_site')`)).results).toHaveLength(2);
  });

  it('recusa tipo fora de fluxo|ativo e situacao fora da lista', async () => {
    await expect(desvio('d1', { tipo: 'rede' })).rejects.toThrow(/CHECK/);
    await expect(desvio('d2', { situacao: 'fechado' })).rejects.toThrow(/CHECK/);
    await desvio('d3', { tipo: 'ativo', situacao: 'aceito' });
  });

  it('recusa (project_id, tipo, chave_sensor) repetido', async () => {
    await desvio('d4', { chave: 'k' });
    await expect(desvio('d5', { chave: 'k' })).rejects.toThrow(/UNIQUE/);
    await desvio('d6', { chave: 'k', tipo: 'ativo' });
  });

  it('recusa ip/mac em claro em dados e aceita o cifrado', async () => {
    await expect(desvio('d7', { dados: '{"ip":"10.0.0.1"}' })).rejects.toThrow(/CHECK/);
    await expect(desvio('d8', { dados: '{"mac":"aa:bb"}' })).rejects.toThrow(/CHECK/);
    await expect(desvio('d9', { dados: '{"ip_cifrado":"10.0.0.1"}' })).rejects.toThrow(/CHECK/);
    await desvio('d10', { dados: '{"ip_cifrado":"ot1:abc"}' });
  });

  it('apagar o projeto apaga os desvios', async () => {
    await env.DB.prepare(`DELETE FROM projects WHERE id = 'proj-a'`).run();
    expect((await um(`SELECT 1 FROM ot_desvios WHERE project_id = 'proj-a'`)).results).toHaveLength(0);
  });
});
