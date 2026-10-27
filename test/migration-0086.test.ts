import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0086 from '../migrations/0086_arquivo_dpa_cobertura.sql?raw';

const tabelas = async () => ((await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'documentos_arquivo_%' ORDER BY name`).all()).results as { name: string }[]).map((t) => t.name);

describe('migration 0086: documento em arquivo como DPA e cobertura', () => {
  it('sobre o formato anterior: cria as duas tabelas vazias e não mexe em nada existente; repetir é inofensivo', async () => {
    await applySchema();
    await execSql(`DROP TABLE documentos_arquivo_partes; DROP TABLE documentos_arquivo_requisitos;`); // o formato anterior
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p86', 'Cliente Ficticio', 'LGPD', 'controller', 'Active')`).run();
    await env.DB.prepare(`INSERT INTO documentos_arquivo (id, project_id, nome, tipo) VALUES ('d86', 'p86', 'Documento existente', 'outro')`).run();
    expect(await tabelas()).toEqual([]);

    await execSql(migration0086);
    await execSql(migration0086);

    expect(await tabelas()).toEqual(['documentos_arquivo_partes', 'documentos_arquivo_requisitos']);
    for (const t of ['documentos_arquivo_partes', 'documentos_arquivo_requisitos']) expect((await env.DB.prepare(`SELECT count(*) AS n FROM ${t}`).first<{ n: number }>())!.n).toBe(0);
    expect((await env.DB.prepare(`SELECT nome FROM documentos_arquivo WHERE id = 'd86'`).first())).toEqual({ nome: 'Documento existente' });
  });

  it('papel só dpa, contrato ou outro; apagar o documento leva as ligações', async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p86b', 'Cliente Ficticio', 'LGPD', 'controller', 'Active')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('o86b', 'p86b', 'organizacao', 'Org Ficticia')`),
      env.DB.prepare(`INSERT INTO documentos_arquivo (id, project_id, nome, tipo) VALUES ('d86b', 'p86b', 'Documento', 'contrato')`),
      env.DB.prepare(`INSERT INTO documentos_arquivo_partes (documento_arquivo_id, parte_id, papel, project_id) VALUES ('d86b', 'o86b', 'dpa', 'p86b')`),
    ]);
    await expect(env.DB.prepare(`INSERT INTO documentos_arquivo_partes (documento_arquivo_id, parte_id, papel, project_id) VALUES ('d86b', 'o86b', 'termo', 'p86b')`).run()).rejects.toThrow();
    await env.DB.prepare(`DELETE FROM documentos_arquivo WHERE id = 'd86b'`).run();
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM documentos_arquivo_partes`).first<{ n: number }>())!.n).toBe(0);
  });
});
