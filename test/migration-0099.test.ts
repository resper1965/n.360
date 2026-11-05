// test/migration-0099.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql, seedTwoProjects } from './helpers/d1';
import mig from '../migrations/0099_ot_sensores.sql?raw';

const um = <T>(sql: string) => env.DB.prepare(sql).all<T>();
const sensor = `INSERT INTO ot_sensores (id, project_id, site_id, nome, faixa_origem, criado_por) VALUES ('sn1', 'proj-a', 's-a', 'Sonda', '10.0.0.0/8', 'u')`;

// 0099: sondas com envio automático. ALTER não é repetível, então o teste roda o resto.
describe('migration 0099: sondas, credenciais e envios do n.ot', () => {
  beforeAll(async () => {
    await applySchema(); await seedTwoProjects();
    await env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s-a', 'proj-a', 'SE A')`).run();
  });

  it('cria as 3 tabelas e os 2 índices de chave_sensor; o resto da migração é repetível', async () => {
    await execSql(mig.replace(/ALTER TABLE [^;]*;/g, ''));
    expect((await um(`SELECT name FROM sqlite_master WHERE name IN ('ot_sensores','ot_sensor_credenciais','ot_sensor_envios')`)).results).toHaveLength(3);
    expect((await um(`SELECT name FROM sqlite_master WHERE name IN ('idx_ot_achados_chave_sensor','idx_ot_fluxos_pend_chave')`)).results).toHaveLength(2);
    for (const t of ['ot_achados', 'ot_fluxos_pendentes']) {
      expect((await um(`SELECT name FROM pragma_table_info('${t}') WHERE name = 'chave_sensor'`)).results).toHaveLength(1);
    }
  });

  it('recusa sonda sem faixa_origem', async () => {
    await expect(env.DB.prepare(`INSERT INTO ot_sensores (id, project_id, site_id, nome, criado_por) VALUES ('x', 'proj-a', 's-a', 'S', 'u')`).run()).rejects.toThrow(/NOT NULL/);
  });

  it('recusa o mesmo (sensor_id, impressao) duas vezes', async () => {
    await env.DB.prepare(sensor).run();
    const envio = (id: string) => env.DB.prepare(`INSERT INTO ot_sensor_envios (id, sensor_id, project_id, impressao) VALUES ('${id}', 'sn1', 'proj-a', 'h1')`).run();
    await envio('e1');
    await expect(envio('e2')).rejects.toThrow(/UNIQUE/);
  });

  it('recusa situacao fora de processando|concluido', async () => {
    await expect(env.DB.prepare(`INSERT INTO ot_sensor_envios (id, sensor_id, project_id, impressao, situacao) VALUES ('e3', 'sn1', 'proj-a', 'h3', 'falhou')`).run()).rejects.toThrow(/CHECK/);
  });

  it('recusa contagens que não seja objeto JSON', async () => {
    await expect(env.DB.prepare(`INSERT INTO ot_sensor_envios (id, sensor_id, project_id, impressao, contagens) VALUES ('e4', 'sn1', 'proj-a', 'h4', '[]')`).run()).rejects.toThrow(/CHECK/);
  });

  it('apagar o projeto apaga sonda, credenciais e envios', async () => {
    await env.DB.prepare(`INSERT INTO ot_sensor_credenciais (id, sensor_id, project_id, chave_hash, expira_em) VALUES ('c1', 'sn1', 'proj-a', 'hash', '2027-01-01')`).run();
    await env.DB.prepare(`DELETE FROM projects WHERE id = 'proj-a'`).run();
    for (const t of ['ot_sensores', 'ot_sensor_credenciais', 'ot_sensor_envios']) {
      expect((await um(`SELECT 1 FROM ${t} WHERE project_id = 'proj-a'`)).results).toHaveLength(0);
    }
  });
});
