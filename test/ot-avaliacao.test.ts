import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { conformidadeOt, conformidadePorSite, ITENS_TECNICOS } from '../src/services/ot-conformidade';
import { applySchema, execSql, resetData, seedTwoProjects } from './helpers/d1';
import mig from '../migrations/0112_ot_assessment.sql?raw';

const P = 'proj-a';
const run = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).run();

describe('ot-avaliacao: migração 0112 e conformidade técnica por site', () => {
  beforeAll(async () => { await applySchema(); });
  beforeEach(async () => {
    await resetData(); await seedTwoProjects();
    for (const s of ['s1', 's2']) await run(`INSERT INTO ot_sites (id, project_id, nome) VALUES (?, ?, ?)`, s, P, s);
  });

  it('0112 é reaplicável e o CHECK recusa parcial sem justificativa', async () => {
    await execSql(mig);
    await run(`INSERT OR IGNORE INTO ot_requisitos (id, framework, codigo, titulo, versao) VALUES ('rq', 'F', '9.9', 't', 'v')`);
    const ins = (sit: string, just: string | null) => run(`INSERT INTO ot_avaliacoes (id, project_id, requisito_id, situacao, justificativa, atualizado_por) VALUES (?, ?, 'rq', ?, ?, 'u')`, `a-${sit}-${just}`, P, sit, just);
    await expect(ins('parcial', null)).rejects.toThrow(/CHECK/);
    await expect(ins('parcial', ' a ')).rejects.toThrow(/CHECK/);
    await ins('atende', null);
  });

  it('por site: o site com zonas 2, 3 e 4 difere do que não tem', async () => {
    for (const n of [2, 3, 4]) await run(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES (?, ?, 's1', 'z', ?)`, `z${n}`, P, n);
    await run(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES ('zx', ?, 's2', 'z', 4)`, P);
    await run(`INSERT INTO ot_fluxos (id, project_id, site_id, origem_zona_id, destino_zona_id, externo, via_vpn) VALUES ('f1', ?, 's2', 'zx', 'zx', 1, 0)`, P);
    const r = await conformidadePorSite(env.DB, P, ['s1', 's2']);
    expect(Object.keys(r.s1).sort()).toEqual([...ITENS_TECNICOS].sort());
    expect(r.s1['4.1.1'].situacao).toBe('evidencia_no_inventario');
    expect(r.s2['4.1.1'].situacao).toBe('nao_atende');
    expect(r.s2['4.1.3'].situacao).toBe('nao_atende');
    expect(r.s1['4.1.3'].situacao).toBe('sem_evidencia');
    expect(r.s1['4.2.1']).toEqual(r.s2['4.2.1']);
    expect(await conformidadePorSite(env.DB, P, [])).toEqual({});
  });

  it('o agregado concorda com os sites (mesma regra)', async () => {
    const todos = await conformidadeOt(env.DB, P, JSON.stringify(['s1', 's2']));
    const por = await conformidadePorSite(env.DB, P, ['s1']);
    const item = todos.itens.find((i) => i.codigo === '4.1.1');
    if (item) expect(item.situacao).toBe('nao_atende');
    expect(por.s1['4.1.1'].situacao).toBe('nao_atende');
  });
});
