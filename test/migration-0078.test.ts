import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0078 from '../migrations/0078_bancada_trilha.sql?raw';

const colunas = async (t: string) => ((await env.DB.prepare(`PRAGMA table_info(${t})`).all()).results as { name: string }[]).map((c) => c.name);

describe('migration 0078: bancada da trilha', () => {
  it('sobre o formato anterior: acrescenta as 8 colunas, congela a situação antiga e preserva as linhas', async () => {
    await applySchema();
    await execSql(`DROP TABLE IF EXISTS checklist_progress; DROP TABLE IF EXISTS project_phase_answers; DROP TABLE IF EXISTS project_phases;
      CREATE TABLE project_phases (id TEXT PRIMARY KEY, project_id TEXT, phase_number INTEGER NOT NULL, title TEXT NOT NULL, status TEXT DEFAULT 'Pending', notes TEXT, completed_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE checklist_progress (id TEXT PRIMARY KEY, project_id TEXT, phase_number INTEGER NOT NULL, item_id TEXT NOT NULL, is_checked INTEGER DEFAULT 0, notes TEXT, assigned_to TEXT, due_date TEXT);
      CREATE TABLE project_phase_answers (id TEXT PRIMARY KEY, project_id TEXT, phase_number INTEGER NOT NULL, question_key TEXT NOT NULL, answer TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
    await env.DB.batch([
      ...(['completed', 'blocked', 'in_progress', 'skipped'] as const).map((s, i) =>
        env.DB.prepare(`INSERT INTO project_phases (id, project_id, phase_number, title, status) VALUES (?, 'm78', ?, 'F', ?)`).bind(`f${i}`, i, s)),
      env.DB.prepare(`INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked) VALUES ('c1', 'm78', 3, 'p3_3', 1)`),
      env.DB.prepare(`INSERT INTO project_phase_answers (id, project_id, phase_number, question_key, answer) VALUES ('a1', 'm78', 3, 'p3_q1', 'x')`),
    ]);

    await execSql(migration0078);

    expect(await colunas('checklist_progress')).toEqual(expect.arrayContaining(
      ['bloqueio_motivo', 'bloqueio_responsavel', 'bloqueado_em', 'excecao_motivo', 'excecao_por', 'excecao_em']));
    expect(await colunas('project_phase_answers')).toContain('updated_by');
    expect(await colunas('project_phases')).toContain('legado_status');
    const fases = (await env.DB.prepare('SELECT id, legado_status FROM project_phases ORDER BY id').all()).results;
    expect(fases).toEqual([
      { id: 'f0', legado_status: 'completed' }, { id: 'f1', legado_status: 'blocked' }, { id: 'f2', legado_status: null }, { id: 'f3', legado_status: 'skipped' },
    ]);
    expect(await env.DB.prepare(`SELECT is_checked FROM checklist_progress WHERE id = 'c1'`).first()).toEqual({ is_checked: 1 });
    expect(await env.DB.prepare(`SELECT answer FROM project_phase_answers WHERE id = 'a1'`).first()).toEqual({ answer: 'x' });

    await execSql('DROP TABLE checklist_progress; DROP TABLE project_phase_answers; DROP TABLE project_phases;');
    await applySchema(); // restaura o schema canônico para os outros testes
  }, 30_000);

  it('o schema canônico já traz as mesmas colunas', async () => {
    await applySchema();
    expect(await colunas('checklist_progress')).toContain('excecao_motivo');
    expect(await colunas('project_phase_answers')).toContain('updated_by');
    expect(await colunas('project_phases')).toContain('legado_status');
  });
});
