// test/migration-0106.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import mig from '../migrations/0106_fornecedor_modelos.sql?raw';

/** Migration 0106: modelos de avaliação de fornecedor da consultoria (spec 2026-11-09-ciclo-avaliacao-fornecedor-design). */
const run = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).run();

describe('migration 0106: modelos de fornecedor', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('m6-org', 'Consultoria', 'm6-org')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('m6p', 'C', 'LGPD', 'Controller', 'Active', 'm6-org')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, terceiro_tipo) VALUES ('m6-f', 'm6p', 'organizacao', 'Fornecedor', 'critico')`),
      env.DB.prepare(`INSERT INTO avaliacoes_terceiro (id, project_id, parte_id, metodo, resultado, valido_ate) VALUES ('m6-a', 'm6p', 'm6-f', 'auditoria', 'aprovado', '2099-01-01')`),
      env.DB.prepare(`INSERT INTO homologacoes (id, project_id, parte_id, token_hash, expira_em, perguntas_json, email_destino) VALUES ('m6-h', 'm6p', 'm6-f', 'h', '2099-01-01', '[]', 'f@exemplo.invalid')`),
      env.DB.prepare(`INSERT INTO homologacao_perguntas (id, project_id, tema, texto, origem) VALUES ('m6-q1', 'm6p', 'T', 'Padrão', 'padrao'), ('m6-q2', 'm6p', 'T', 'Própria', 'projeto')`),
    ]);
    await execSql(mig.replace(/ALTER TABLE [^;]*;/g, ''));
  });

  it('dados: tipo da avaliação e do envio vêm do tipo atual; a pergunta padrão do projeto sai, a própria fica', async () => {
    expect(await env.DB.prepare(`SELECT tipo_avaliado FROM avaliacoes_terceiro WHERE id = 'm6-a'`).first('tipo_avaliado')).toBe('critico');
    expect(await env.DB.prepare(`SELECT tipo FROM homologacoes WHERE id = 'm6-h'`).first('tipo')).toBe('critico');
    const ids = (await env.DB.prepare(`SELECT id FROM homologacao_perguntas WHERE project_id = 'm6p'`).all<{ id: string }>()).results.map((r) => r.id);
    expect(ids).toEqual(['m6-q2']);
  });

  it('modelo: um por tipo e organização; tipo e prazo fechados', async () => {
    await run(`INSERT INTO fornecedor_modelos (id, org_id, tipo, prazo_meses) VALUES ('m6-m', 'm6-org', 'critico', 12)`);
    await expect(run(`INSERT INTO fornecedor_modelos (id, org_id, tipo, prazo_meses) VALUES ('m6-m2', 'm6-org', 'critico', 24)`)).rejects.toThrow(/UNIQUE/);
    await expect(run(`INSERT INTO fornecedor_modelos (id, org_id, tipo, prazo_meses) VALUES ('m6-m3', 'm6-org', 'enorme', 12)`)).rejects.toThrow();
    await expect(run(`INSERT INTO fornecedor_modelos (id, org_id, tipo, prazo_meses) VALUES ('m6-m4', 'm6-org', 'medio', 61)`)).rejects.toThrow();
    await run(`INSERT INTO fornecedor_modelo_perguntas (id, modelo_id, tema, texto) VALUES ('m6-mp', 'm6-m', 'T', 'Pergunta')`);
    await run(`INSERT INTO homologacao_ajustes (project_id, modelo_pergunta_id) VALUES ('m6p', 'm6-mp')`);
    await expect(run(`INSERT INTO homologacao_perguntas (id, project_id, tema, texto, tipo) VALUES ('m6-q3', 'm6p', 'T', 'X', 'grande_provedor')`)).rejects.toThrow();
  });

  it('o e-mail do fornecedor some quando a homologação sai de aberta', async () => {
    await run(`UPDATE homologacoes SET status = 'respondida' WHERE id = 'm6-h'`);
    expect(await env.DB.prepare(`SELECT email_destino FROM homologacoes WHERE id = 'm6-h'`).first('email_destino')).toBeNull();
  });
});
