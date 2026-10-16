import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { semearBancada } from './helpers/passos';
import { materializarLegado } from '../src/services/passos/legado';
import { carregarContexto } from '../src/services/passos/contexto';
import { gravarSituacoes } from '../src/services/passos/fase';
import { PHASE_CHECKLISTS } from '../src/constants';

describe('materializarLegado e gravarSituacoes (D1 real)', () => {
  beforeAll(async () => {
    await semearBancada();
    await env.DB.batch([
      env.DB.prepare(`UPDATE project_phases SET status='completed', legado_status='completed', completed_at='2026-01-01' WHERE project_id='p-a' AND phase_number IN (3,4)`),
      env.DB.prepare(`UPDATE project_phases SET status='skipped', legado_status='skipped' WHERE project_id='p-a' AND phase_number = 5`),
      env.DB.prepare(`UPDATE project_phases SET status='blocked', legado_status='blocked' WHERE project_id='p-a' AND phase_number = 6`),
      env.DB.prepare(`UPDATE project_phases SET status='in_progress', legado_status='in_progress' WHERE project_id='p-a' AND phase_number = 7`),
      env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES ('ev-l','p-a','l.md','kl','h','x')`),
      env.DB.prepare(`INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, evidence_id, notes) VALUES ('cl1','p-a',3,'p3_1',1,'ev-l','nota minha')`),
    ]);
  });

  it('marca cada passo com a exceção, preserva o já marcado, encerra o legado e é idempotente', async () => {
    expect(await materializarLegado(env.DB, 'p-a')).toBe(3);
    const itens = PHASE_CHECKLISTS[3].map((i) => i.id);
    const { results } = await env.DB.prepare(`SELECT item_id, is_checked, excecao_motivo, checked_by, evidence_id, notes FROM checklist_progress WHERE project_id='p-a' AND phase_number=3`).all<any>();
    expect(results).toHaveLength(itens.length);
    for (const r of results) {
      expect(r.is_checked).toBe(1);
      expect(r.checked_by).toBeNull();
      if (r.item_id === 'p3_1') { expect(r.excecao_motivo).toBeNull(); expect(r.evidence_id).toBe('ev-l'); expect(r.notes).toBe('nota minha'); }
      else expect(r.excecao_motivo).toBe('Fase concluída antes da Bancada (situação manual)');
    }
    const f5 = await env.DB.prepare(`SELECT excecao_motivo FROM checklist_progress WHERE project_id='p-a' AND phase_number=5 LIMIT 1`).first<any>();
    expect(f5.excecao_motivo).toBe('Fase dispensada antes da Bancada (situação manual)');
    const { results: fases } = await env.DB.prepare(`SELECT phase_number, legado_status FROM project_phases WHERE project_id='p-a' AND phase_number IN (3,4,5,6)`).all<any>();
    expect(Object.fromEntries(fases.map((f: any) => [f.phase_number, f.legado_status]))).toEqual({ 3: null, 4: null, 5: null, 6: 'blocked' });
    const antes = await env.DB.prepare(`SELECT COUNT(*) AS n, SUM(is_checked) AS s FROM checklist_progress WHERE project_id='p-a'`).first<any>();
    expect(await materializarLegado(env.DB, 'p-a')).toBe(0);
    expect(await env.DB.prepare(`SELECT COUNT(*) AS n, SUM(is_checked) AS s FROM checklist_progress WHERE project_id='p-a'`).first()).toEqual(antes);
  });

  it('gravarSituacoes: concluída fica, bloqueada legada fica, in_progress manual sem dado volta a pending, e completed_at é zerado', async () => {
    await gravarSituacoes(env.DB, 'p-a', await carregarContexto(env.DB, 'p-a'));
    const { results } = await env.DB.prepare(`SELECT phase_number, status, completed_at FROM project_phases WHERE project_id='p-a' AND phase_number IN (3,4,5,6,7,8)`).all<any>();
    const st = Object.fromEntries(results.map((r: any) => [r.phase_number, r.status]));
    expect(st).toEqual({ 3: 'completed', 4: 'completed', 5: 'completed', 6: 'blocked', 7: 'pending', 8: 'pending' });
    await env.DB.prepare(`UPDATE project_phases SET completed_at='2026-01-01' WHERE project_id='p-a' AND phase_number=8`).run();
    await env.DB.prepare(`UPDATE project_phases SET status='completed' WHERE project_id='p-a' AND phase_number=8`).run();
    await gravarSituacoes(env.DB, 'p-a', await carregarContexto(env.DB, 'p-a'));
    const f8 = await env.DB.prepare(`SELECT status, completed_at FROM project_phases WHERE project_id='p-a' AND phase_number=8`).first<any>();
    expect(f8).toEqual({ status: 'pending', completed_at: null });
  });
});
