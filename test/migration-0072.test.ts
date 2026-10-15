import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import schemaSql from '../schema.sql?raw';
import migration0072 from '../migrations/0072_tratamento_impacto.sql?raw';

/** O CREATE TABLE do schema canônico sem as linhas que a 0072 acrescenta (a tabela como era antes dela). */
const antiga = (tabela: string, ...colunas: string[]) => {
  const ini = schemaSql.indexOf(`CREATE TABLE IF NOT EXISTS ${tabela} (`);
  const bloco = schemaSql.slice(ini, schemaSql.indexOf(');', ini) + 2);
  for (const c of colunas) expect(bloco).toContain(c);
  return bloco.split('\n').filter((l) => !colunas.some((c) => l.includes(c)) && !l.includes('migration 0072')).join('\n').replace(/,(\s*\n\s*\);)$/, '$1');
};

describe('migration 0072 — teste de impacto do tratamento', () => {
  it('sobre as tabelas antigas: preserva as linhas, cria a tabela e as colunas vazias', async () => {
    await applySchema();
    const ropa = antiga('ropa_records', 'impacto_finalizado_em');
    const dpia = antiga('dpia_assessments', 'origem_hash');
    const lia = antiga('lia_assessments', 'origem_hash');
    await execSql(`DROP TABLE tratamento_impacto; DROP TABLE lia_assessments; DROP TABLE dpia_assessments; DROP TABLE ropa_records; ${ropa} ${dpia} ${lia}`);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('m72', 'C', 'LGPD', 'Controller', 'Active')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, dpia_required) VALUES ('r-velho', 'm72', 'Folha', 1)`),
      env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, ropa_id, processing_name) VALUES ('d-velha', 'm72', 'r-velho', 'Folha')`),
      env.DB.prepare(`INSERT INTO lia_assessments (id, project_id, ropa_id) VALUES ('l-velha', 'm72', 'r-velho')`),
    ]);
    const antes = await Promise.all(['ropa_records', 'dpia_assessments', 'lia_assessments'].map((t) => env.DB.prepare(`SELECT * FROM ${t}`).first()));

    await execSql(migration0072);

    expect(await env.DB.prepare(`SELECT * FROM ropa_records`).first()).toEqual({ ...antes[0], impacto_finalizado_em: null });
    expect(await env.DB.prepare(`SELECT * FROM dpia_assessments`).first()).toEqual({ ...antes[1], origem_hash: null });
    expect(await env.DB.prepare(`SELECT * FROM lia_assessments`).first()).toEqual({ ...antes[2], origem_hash: null });
    const cols = (await env.DB.prepare(`SELECT name FROM pragma_table_info('tratamento_impacto')`).all<{ name: string }>()).results.map((c) => c.name);
    expect(cols).toEqual(['ropa_id', 'project_id', 'pergunta', 'resposta', 'atualizado_por', 'atualizado_em']);
    await applySchema(); // convive com o schema canônico
  }, 30_000);

  it('aceita só sim, nao e nao_sei, uma resposta por pergunta, e apagar o tratamento apaga as respostas', async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('mi-p', 'C', 'LGPD', 'Controller', 'Active', 'org_ness')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('mi-r', 'mi-p', 'Folha')`),
    ]);
    const inserir = (resposta: string) => env.DB.prepare(`INSERT INTO tratamento_impacto (ropa_id, project_id, pergunta, resposta) VALUES ('mi-r', 'mi-p', 'sensiveis', ?)`).bind(resposta).run();
    await inserir('sim');
    await expect(inserir('nao')).rejects.toThrow(/UNIQUE|PRIMARY/);
    await expect(env.DB.prepare(`INSERT INTO tratamento_impacto (ropa_id, project_id, pergunta, resposta) VALUES ('mi-r', 'mi-p', 'outra', 'talvez')`).run()).rejects.toThrow(/CHECK/);
    expect(await env.DB.prepare(`SELECT impacto_finalizado_em FROM ropa_records WHERE id = 'mi-r'`).first()).toEqual({ impacto_finalizado_em: null });
    await env.DB.prepare(`DELETE FROM ropa_records WHERE id = 'mi-r'`).run();
    expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM tratamento_impacto WHERE ropa_id = 'mi-r'`).first()).toEqual({ n: 0 });
  });
});
