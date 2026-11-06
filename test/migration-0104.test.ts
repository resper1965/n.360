// test/migration-0104.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import mig from '../migrations/0104_titular_identidade_encaminhamento.sql?raw';

describe('migration 0104: identidade e encaminhamento do pedido do titular', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('m4a', 'A', 'LGPD', 'Controller', 'Active', 'org_ness'), ('m4b', 'B', 'LGPD', 'Controller', 'Active', 'org_ness')`),
      env.DB.prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em) VALUES ('m4p', 'm4a', 'PT-2026-0001', 'acesso', '2026-10-01')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES ('m4pa', 'm4a', 'pessoa', 'Ponto Focal', 'pf@exemplo.invalid'), ('m4pb', 'm4b', 'pessoa', 'Alheio', 'x@exemplo.invalid')`),
    ]);
  });
  it('colunas e tabela; o resto da migration é repetível; listas fechadas e gatilho de projeto', async () => {
    await execSql(mig.replace(/ALTER TABLE [^;]*;/g, ''));
    const cols = (await env.DB.prepare(`SELECT name FROM pragma_table_info('titular_pedidos') WHERE name LIKE 'identidade_%'`).all()).results;
    expect(cols).toHaveLength(4);
    await expect(env.DB.prepare(`UPDATE titular_pedidos SET identidade_metodo = 'telepatia' WHERE id = 'm4p'`).run()).rejects.toThrow();
    const ins = (parte: string, status = 'aguardando') => env.DB.prepare(`INSERT INTO titular_pedido_encaminhamentos (id, pedido_id, project_id, parte_id, prazo, mensagem, status, enviado_por) VALUES (?, 'm4p', 'm4a', ?, '2026-12-01', 'Ver dados', ?, 'a@ness.lat')`).bind(`e-${parte}-${status}`, parte, status).run();
    await ins('m4pa');
    await expect(ins('m4pb')).rejects.toThrow(/outro projeto/);
    await expect(ins('m4pa', 'perdido')).rejects.toThrow();
    await expect(env.DB.prepare(`INSERT INTO titular_pedido_encaminhamentos (id, pedido_id, project_id, parte_id, prazo, mensagem, status, enviado_por) VALUES ('e-r', 'm4p', 'm4a', 'm4pa', '2026-12-01', 'x', 'respondido', 'a')`).run()).rejects.toThrow();
  });
});
