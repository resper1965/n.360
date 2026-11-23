import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0120 from '../migrations/0120_risco_aceite_residual.sql?raw';

/**
 * 0120 (aceite do risco residual): cria risco_aceites e risco_alcadas e reconstrói pedidos e pedido_destinatarios para o CHECK de
 * `tipo` aceitar 'risco'. A reconstrução não pode perder nem mudar pedido algum, e os gatilhos de prova voltam.
 */
const definicao = async (nome: string) =>
  ((await env.DB.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).bind(nome).first<{ sql: string }>())?.sql ?? '').replace(/\s+/g, ' ').trim();
const objetos = async () => (await env.DB.prepare(`SELECT type || ':' || name AS o FROM sqlite_master WHERE tbl_name IN ('pedidos', 'pedido_destinatarios', 'risco_aceites', 'risco_alcadas') ORDER BY 1`)
  .all<{ o: string }>()).results.map((r) => r.o);

describe('migration 0120 — aceite do risco residual', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('m120', 'C', 'ISO 27001', 'Controller', 'Active', 'org_ness')`),
      env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, status, criado_por) VALUES
        ('pd-a', 'org_ness', 'm120', 'dpia', 'd1', 'DPIA: Folha', 'ceo', '{"x":1}', 'h1', 'aprovado', 'cons@ness.lat'),
        ('pd-b', 'org_ness', 'm120', 'documento', 'doc1', 'Documento: PSI', 'ciso', '{"y":2}', 'h2', 'aberto', 'cons@ness.lat')`),
      env.DB.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, email, status, decidido_em, canal, hash_lido) VALUES
        ('dd-a', 'pd-a', 'ceo@x.com', 'aprovado', '2026-11-01T10:00:00Z', 'conta', 'h1'), ('dd-b', 'pd-b', 'lider@x.com', 'pendente', NULL, NULL, NULL)`),
    ]);
  });

  it('schema.sql e a migration chegam ao mesmo resultado; os pedidos e as decisões ficam iguais; repetível no que é IF NOT EXISTS', async () => {
    const antes = { objetos: await objetos(), pedidos: await definicao('pedidos'), aceites: await definicao('risco_aceites'),
      linhas: (await env.DB.prepare('SELECT * FROM pedidos ORDER BY id').all()).results, dest: (await env.DB.prepare('SELECT * FROM pedido_destinatarios ORDER BY id').all()).results };
    await execSql(migration0120);
    expect(await objetos()).toEqual(antes.objetos);
    // O RENAME grava o nome entre aspas; o resto da definição é o mesmo.
    expect((await definicao('pedidos')).replace('"pedidos"', 'pedidos')).toBe(antes.pedidos);
    expect(await definicao('risco_aceites')).toBe(antes.aceites);
    expect((await env.DB.prepare('SELECT * FROM pedidos ORDER BY id').all()).results).toEqual(antes.linhas);
    expect((await env.DB.prepare('SELECT * FROM pedido_destinatarios ORDER BY id').all()).results).toEqual(antes.dest);
  });

  it('o tipo risco entra; a prova do pedido e da decisão segue imutável; a FK do destinatário aponta para pedidos', async () => {
    await env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, criado_por)
      VALUES ('pd-r', 'org_ness', 'm120', 'risco', 'rk1', 'Aceite', 'ceo', '{}', 'h3', 'cons@ness.lat')`).run();
    await expect(env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, criado_por)
      VALUES ('pd-x', 'org_ness', 'm120', 'outro', 'x', 'X', 'ceo', '{}', 'h', 'c')`).run()).rejects.toThrow();
    await expect(env.DB.prepare(`UPDATE pedidos SET hash = 'outro' WHERE id = 'pd-b'`).run()).rejects.toThrow();
    await expect(env.DB.prepare(`UPDATE pedido_destinatarios SET status = 'recusado' WHERE id = 'dd-a'`).run()).rejects.toThrow();
    const fk = (await env.DB.prepare(`PRAGMA foreign_key_list(pedido_destinatarios)`).all<{ table: string }>()).results.map((r) => r.table);
    expect(fk).toEqual(['pedidos']);
  });
});
