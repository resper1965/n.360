import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema, seedTwoProjects } from './helpers/d1';
import migration0092 from '../migrations/0092_ot_coleta.sql?raw';

const C = 'ot1:k1:aXY=:Y3Q=';
const lote = (id: string, c: Record<string, unknown> = {}) => {
  const t = { id, project_id: 'proj-a', site_id: 's-a', fonte: 'planilha', criado_por: 'u-x', ...c };
  return env.DB.prepare(`INSERT INTO ot_lotes (${Object.keys(t).join(', ')}) VALUES (${Object.keys(t).map(() => '?').join(', ')})`).bind(...Object.values(t)).run();
};
const item = (id: string, dados: unknown, c: Record<string, unknown> = {}) => {
  const t = { id, project_id: 'proj-a', lote_id: 'l-a', linha: 2, dados: JSON.stringify(dados), ...c };
  return env.DB.prepare(`INSERT INTO ot_lote_itens (${Object.keys(t).join(', ')}) VALUES (${Object.keys(t).map(() => '?').join(', ')})`).bind(...Object.values(t)).run();
};

describe('migration 0092: coleta do n.ot (lotes em staging)', () => {
  beforeAll(async () => {
    await applySchema();
    for (const t of ['ot_lote_itens', 'ot_lotes']) await execSql(`DROP TABLE IF EXISTS ${t};`);
    await execSql(migration0092);
    await execSql(migration0092); // repetível
    await seedTwoProjects();
    await env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s-a', 'proj-a', 'SE A'), ('s-b', 'proj-b', 'SE B')`).run();
  });

  it('estados e fontes fechados por CHECK; o lote nasce processando; site de outro projeto não entra', async () => {
    await lote('l-a');
    expect(await env.DB.prepare(`SELECT status FROM ot_lotes WHERE id = 'l-a'`).first('status')).toBe('processando');
    await expect(lote('l-x', { status: 'aprovado' })).rejects.toThrow(/CHECK/);
    await expect(lote('l-y', { fonte: 'email' })).rejects.toThrow(/CHECK/);
    await expect(lote('l-z', { site_id: 's-b' })).rejects.toThrow(/FOREIGN KEY/);
  });

  it('staging nunca guarda IP/MAC em claro: só a forma ot1, e as chaves ip/mac são recusadas', async () => {
    await item('i-ok', { nome: 'RTU', ip_cifrado: C, ip_hash: 'h', mac_cifrado: null });
    for (const [i, d] of [{ ip: '10.0.0.1' }, { mac: 'aa:bb:cc:dd:ee:ff' }, { ip_cifrado: '10.0.0.1' }, { mac_cifrado: 'aabbccddeeff' }].entries()) {
      await expect(item(`i-x${i}`, d), JSON.stringify(d)).rejects.toThrow(/CHECK/);
    }
    await expect(item('i-dec', {}, { decisao: 'aprovado' })).rejects.toThrow(/CHECK/);
    await expect(item('i-proj', {}, { project_id: 'proj-b' })).rejects.toThrow(/FOREIGN KEY/);
  });

  it('apagar o lote leva os itens; apagar o projeto leva tudo', async () => {
    await lote('l-b');
    await item('i-b', {}, { lote_id: 'l-b' });
    await env.DB.prepare(`DELETE FROM ot_lotes WHERE id = 'l-b'`).run();
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM ot_lote_itens WHERE lote_id = 'l-b'`).first('n')).toBe(0);
    await env.DB.prepare(`DELETE FROM projects WHERE id = 'proj-a'`).run();
    for (const t of ['ot_lotes', 'ot_lote_itens']) expect(await env.DB.prepare(`SELECT count(*) AS n FROM ${t}`).first('n'), t).toBe(0);
  });
});
