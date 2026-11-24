import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, resetData, sessionFor } from './helpers/d1';

/**
 * A avaliação por IA (POST /evidence/:id/evaluate) grava o veredito em `avaliacao_ia`
 * (coluna própria, migration 0117) e NUNCA sobrescreve `evaluation_notes` (nota humana).
 * Antes, cada reavaliação apagava a nota — foi preciso restaurá-la à mão em produção.
 */
const P = 'p-aval';
let consultor: Record<string, string>;

// Stub da IA: devolve o markdown passado, como em signatures.test.ts.
const avaliar = (id: string, saida: string) =>
  worker.fetch(
    new Request(`http://localhost/api/v1/evidence/${id}/evaluate`, {
      method: 'POST',
      headers: { ...consultor, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'conteúdo da evidência' }),
    }),
    { ...env, AI: { run: async () => ({ response: saida }) } } as any,
  );

const evidencia = (id: string) =>
  env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first<Record<string, unknown>>();

beforeAll(async () => { await applySchema(); });

beforeEach(async () => {
  await resetData();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Cliente Exemplo', 'ISO 27001:2022', 'Controller', 'Active')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('ctrl-1', ?, 'ISO 27001:2022', 'A.5.1')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('ctrl-2', ?, 'ISO 27001:2022', 'A.5.2')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor')`),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES (?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
    // Evidência com NOTA HUMANA já escrita e ligada ao controle.
    env.DB.prepare(`INSERT INTO evidence (id, project_id, control_id, file_name, r2_key, file_hash, uploaded_by, evaluation_notes) VALUES ('ev-1', ?, 'ctrl-1', 'e.md', 'x/e.md', 'h', 'alguem@x.com', 'nota humana da triagem')`).bind(P),
  ]);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', name: 'Cons', role: 'consultor' });
});

describe('avaliação por IA em campo separado', () => {
  it('grava avaliacao_ia e preserva a nota humana', async () => {
    const res = await avaliar('ev-1', '# Veredito: PARCIAL\n- **Score de Confiança**: 60\n\nObservações da IA.');
    expect(res.status, await res.text()).toBe(200);
    const ev = await evidencia('ev-1');
    expect(ev!.evaluation_notes).toBe('nota humana da triagem'); // intacta
    expect(String(ev!.avaliacao_ia)).toContain('PARCIAL');       // veredito da IA no campo próprio
    expect(ev!.evaluation_status).toBe('partial');
  });

  it('reavaliar duas vezes não toca a nota humana e sobrescreve só avaliacao_ia', async () => {
    await avaliar('ev-1', '# Veredito: NÃO CONFORME');
    await avaliar('ev-1', '# Veredito: PARCIAL');
    const ev = await evidencia('ev-1');
    expect(ev!.evaluation_notes).toBe('nota humana da triagem');
    expect(String(ev!.avaliacao_ia)).toContain('PARCIAL');
    expect(String(ev!.avaliacao_ia)).not.toContain('NÃO CONFORME');
  });

  // Tarefa 3: trocar o controle não zera avaliação nem aprovação (valem para o conteúdo); a avaliação da IA fica, rotulada como da IA.
  it('religar o controle zera avaliacao_ia e mantém a situação e a nota humana', async () => {
    await avaliar('ev-1', '# Veredito: PARCIAL');
    expect(String((await evidencia('ev-1'))!.avaliacao_ia)).toContain('PARCIAL');
    const res = await worker.fetch(new Request('http://localhost/api/v1/evidence/ev-1', {
      method: 'PUT', headers: { ...consultor, 'Content-Type': 'application/json' }, body: JSON.stringify({ control_id: 'ctrl-2' }),
    }), { ...env, AI: { run: async () => ({ response: '' }) } } as any);
    expect(res.status).toBe(200);
    const ev = await evidencia('ev-1');
    expect(ev!.avaliacao_ia).toBeNull();
    expect(ev!.evaluation_score).toBeNull();
    expect(ev!.evaluation_status).toBe('partial');
    expect(ev!.evaluation_notes).toBe('nota humana da triagem');
  });

  it('GET de evidências devolve avaliacao_ia', async () => {
    await avaliar('ev-1', '# Veredito: PARCIAL\n\ntexto');
    const lista = await worker.fetch(new Request(`http://localhost/api/v1/projects/${P}/evidence`, { headers: consultor }), { ...env, AI: { run: async () => ({ response: '' }) } } as any);
    const { evidence } = await lista.json<any>();
    expect(evidence.find((e: any) => e.id === 'ev-1').avaliacao_ia).toContain('PARCIAL');
  });
});
