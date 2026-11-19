import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import schemaSql from '../schema.sql?raw';
import migration0073 from '../migrations/0073_risco_acao_da_atividade.sql?raw';

const colunas = async (t: string) => (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((c) => c.name);

/** O CREATE TABLE do schema canônico sem as linhas que a 0073 acrescenta (a tabela como era antes dela). */
const antiga = (tabela: string, ...cols: string[]) => {
  const ini = schemaSql.indexOf(`CREATE TABLE IF NOT EXISTS ${tabela} (`);
  const bloco = schemaSql.slice(ini, schemaSql.indexOf(');', ini) + 2);
  for (const c of cols) expect(bloco).toContain(c);
  return bloco.split('\n').filter((l) => !cols.some((c) => l.includes(c)) && !l.includes('migration 0073')).join('\n').replace(/,(\s*\n\s*\);)$/, '$1');
};

/** Volta ao esquema canônico mesmo se as tabelas ficaram no formato antigo (aí o applySchema sozinho falha: índice em ropa_id). */
const restaurar = async () => {
  await execSql('DROP TABLE IF EXISTS ot_referencias; DROP TABLE IF EXISTS acao_anexos; DROP TABLE IF EXISTS risk_history; DROP TABLE IF EXISTS corrective_actions; DROP TABLE IF EXISTS risks;');
  await applySchema();
};

describe('migration 0073 — risco e ação da atividade de tratamento', () => {
  it('sobre as tabelas antigas: preserva as linhas e acrescenta as colunas vazias', async () => {
    await restaurar();
    try {
      // fixture com id fixo: some mesmo se um try anterior (zumbi após timeout) o deixou
      await env.DB.prepare(`DELETE FROM projects WHERE id = 'm73'`).run();
      const risks = antiga('risks', 'ropa_id', 'residual_impact', 'residual_probability', 'residual_level');
      const capa = antiga('corrective_actions', 'ropa_id');
      await execSql(`DROP TABLE IF EXISTS ot_referencias; DROP TABLE IF EXISTS acao_anexos; DROP TABLE risk_history; DROP TABLE corrective_actions; DROP TABLE risks; ${risks} ${capa}`);
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('m73', 'C', 'ISO 27001', 'Controller', 'Active')`),
        env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, impact, probability, risk_level) VALUES ('k-velho', 'm73', 'ERP', 'Vazamento', 4, 4, 'High')`),
        env.DB.prepare(`INSERT INTO corrective_actions (id, project_id, risk_id, title) VALUES ('a-velha', 'm73', 'k-velho', 'Revisar acessos')`),
      ]);
      const antesRisco = await env.DB.prepare(`SELECT * FROM risks`).first();
      const antesAcao = await env.DB.prepare(`SELECT * FROM corrective_actions`).first();

      await execSql(migration0073);

      expect(await env.DB.prepare(`SELECT * FROM risks`).first()).toEqual({ ...antesRisco, ropa_id: null, residual_impact: null, residual_probability: null, residual_level: null });
      expect(await env.DB.prepare(`SELECT * FROM corrective_actions`).first()).toEqual({ ...antesAcao, ropa_id: null });
      await applySchema(); // convive com o schema canônico
    } finally {
      await restaurar(); // nunca deixa o formato antigo para o teste seguinte
    }
  }, 120_000);

  it('risks e corrective_actions ganham ropa_id; risks ganha o residual', async () => {
    await applySchema();
    expect(await colunas('risks')).toEqual(expect.arrayContaining(['ropa_id', 'residual_impact', 'residual_probability', 'residual_level']));
    expect(await colunas('corrective_actions')).toContain('ropa_id');
  });

  it('residual fora de 1..5 é recusado pelo banco', async () => {
    await applySchema();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('m3-c', 'C', 'LGPD', 'Controller', 'Active', 'org_ness')`).run();
    await expect(env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, residual_impact) VALUES ('m3-x', 'm3-c', 'ERP', 'X', 6)`).run()).rejects.toThrow(/CHECK/);
  });

  it('apagar o tratamento solta o vínculo e mantém o risco e a ação (SET NULL)', async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('m3-p', 'C', 'LGPD', 'Controller', 'Active', 'org_ness')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('m3-r', 'm3-p', 'Folha')`),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, ropa_id) VALUES ('m3-k', 'm3-p', 'ERP', 'Acesso indevido', 'm3-r')`),
      env.DB.prepare(`INSERT INTO corrective_actions (id, project_id, title, ropa_id) VALUES ('m3-a', 'm3-p', 'Ajustar retenção', 'm3-r')`),
    ]);
    await env.DB.prepare(`DELETE FROM ropa_records WHERE id = 'm3-r'`).run();
    expect((await env.DB.prepare(`SELECT ropa_id FROM risks WHERE id = 'm3-k'`).first<{ ropa_id: string | null }>())!.ropa_id).toBeNull();
    expect((await env.DB.prepare(`SELECT ropa_id FROM corrective_actions WHERE id = 'm3-a'`).first<{ ropa_id: string | null }>())!.ropa_id).toBeNull();
  });
});
