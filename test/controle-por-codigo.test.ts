import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData } from './helpers/d1';
import { idDoControle } from '../src/helpers';

describe('idDoControle', () => {
  beforeEach(async () => {
    await applySchema(); await resetData();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES
      ('p1','C','ISO 27001:2022','Controller','Active'), ('p2','C','ISO 27001:2022','Controller','Active'),
      ('p3','C','ISO 27001:2022','Controller','Active'), ('p4','C','ISO 27001:2022','Controller','Active')`).run();
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES
      ('ctrl-a51','p1','ISO 27001:2022','A.5.1 Políticas'),
      ('A.5.1','p2','ISO 27001:2022','A.5.1 Políticas'),
      ('ctrl_b_a51','p3','ISO 27001:2022','A.5.1 Políticas'),
      ('x9f2k1','p4','ISO 27001:2022','A.5.1 — Políticas'),
      ('y7','p4','ISO 27001:2022','A.5.10 — Uso aceitável')`).run();
  });

  it('acha o controle pelos quatro formatos de id', async () => {
    expect(await idDoControle(env.DB, 'p1', 'A.5.1')).toBe('ctrl-a51');
    expect(await idDoControle(env.DB, 'p2', 'A.5.1')).toBe('A.5.1');
    expect(await idDoControle(env.DB, 'p3', 'A.5.1')).toBe('ctrl_b_a51');
    expect(await idDoControle(env.DB, 'p4', 'A.5.1')).toBe('x9f2k1');
  });
  it('aceita o próprio id e não confunde A.5.1 com A.5.10', async () => {
    expect(await idDoControle(env.DB, 'p1', 'ctrl-a51')).toBe('ctrl-a51');
    expect(await idDoControle(env.DB, 'p4', 'A.5.10')).toBe('y7');
  });
  it('% e _ não casam controle arbitrário (sem curinga do cliente)', async () => {
    expect(await idDoControle(env.DB, 'p4', '%')).toBeNull();
    expect(await idDoControle(env.DB, 'p4', '_')).toBeNull();
  });
  it('não atravessa projeto', async () => {
    expect(await idDoControle(env.DB, 'p4', 'ctrl-a51')).toBeNull();
  });
});
