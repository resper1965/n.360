import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0121 from '../migrations/0121_aceite_independente_do_status.sql?raw';

/**
 * 0121 (aceite independente do status): risco `Accepted` com aceite vigente volta ao status de antes do aceite (status_anterior),
 * com uma linha de trilha por risco. Não toca risco_aceites, nem o aceite antigo (Accepted sem linha), nem aceite encerrado.
 */
const aceite = (id: string, risco: string, situacao: string, anterior: string | null) => env.DB.prepare(
  `INSERT INTO risco_aceites (id, project_id, risk_id, aceito_por, papel, aceito_em, nivel_residual, controles_json, conteudo_json, hash, status_anterior, situacao,
     encerrado_em, encerrado_por, motivo)
   VALUES (?, 'm121', ?, 'ceo@x.com', 'ceo', ?, 'Low', '[]', '{}', ?, ?, ?, CASE WHEN ?7 IS NULL THEN NULL ELSE ?3 END, ?7, ?7)`).bind(id, risco, `2026-11-2${id.length}T10:00:00Z`, 'h'.repeat(64), anterior, situacao,
    situacao === 'vigente' ? null : 'ceo@x.com');
const status = async () => Object.fromEntries((await env.DB.prepare(`SELECT id, status FROM risks WHERE project_id = 'm121' ORDER BY id`).all<{ id: string; status: string }>())
  .results.map((r) => [r.id, r.status]));
const trilhas = async () => (await env.DB.prepare(`SELECT actor, details, project_id, entity_id, old_value, new_value FROM audit_logs
  WHERE action = 'risk.status_corrigido_aceite' ORDER BY entity_id`).all()).results;

describe('migration 0121 — o aceite do residual não muda o status', () => {
  let provas: unknown[];
  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('m121', 'C', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).run();
    await env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, impact, probability, risk_level, status, residual_impact, residual_probability, residual_level) VALUES
      ('r-a', 'm121', 'A', 'T', 3, 3, 'Medium', 'Accepted', 1, 1, 'Low'), ('r-b', 'm121', 'B', 'T', 3, 3, 'Medium', 'Accepted', 1, 1, 'Low'),
      ('r-legado', 'm121', 'C', 'T', 3, 3, 'Medium', 'Accepted', 1, 1, 'Low'), ('r-revogado', 'm121', 'D', 'T', 3, 3, 'Medium', 'Accepted', 1, 1, 'Low'),
      ('r-aberto', 'm121', 'E', 'T', 3, 3, 'Medium', 'Open', 1, 1, 'Low')`).run();
    await env.DB.batch([aceite('a1', 'r-a', 'vigente', 'Open'), aceite('a22', 'r-b', 'vigente', 'Mitigated'), aceite('a333', 'r-revogado', 'revogado', 'Open'),
      aceite('a4444', 'r-aberto', 'vigente', 'Open')]);
    provas = (await env.DB.prepare('SELECT * FROM risco_aceites ORDER BY id').all()).results;
  });

  it('volta ao status anterior só o Accepted com aceite vigente; uma trilha por risco; risco_aceites intacto; repetível', async () => {
    await execSql(migration0121);
    expect(await status()).toEqual({ 'r-a': 'Open', 'r-aberto': 'Open', 'r-b': 'Mitigated', 'r-legado': 'Accepted', 'r-revogado': 'Accepted' });
    expect(await trilhas()).toEqual([
      { actor: 'sistema:migration-0121', details: 'Risco r-a: status Accepted -> Open; o aceite do residual não muda o status (migration 0121)', project_id: 'm121', entity_id: 'r-a', old_value: 'Accepted', new_value: 'Open' },
      { actor: 'sistema:migration-0121', details: 'Risco r-b: status Accepted -> Mitigated; o aceite do residual não muda o status (migration 0121)', project_id: 'm121', entity_id: 'r-b', old_value: 'Accepted', new_value: 'Mitigated' },
    ]);
    expect((await env.DB.prepare('SELECT * FROM risco_aceites ORDER BY id').all()).results).toEqual(provas);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM risks r WHERE r.status = 'Accepted' AND EXISTS (SELECT 1 FROM risco_aceites a WHERE a.risk_id = r.id AND a.situacao = 'vigente')`).first<{ n: number }>())!.n).toBe(0);
    await execSql(migration0121);
    expect(await trilhas()).toHaveLength(2);
  });
});
