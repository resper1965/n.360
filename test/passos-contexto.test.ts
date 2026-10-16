import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import { carregarContexto, CONSULTAS_ENTIDADE } from '../src/services/passos/contexto';
import { ENTIDADES } from '../src/data/passos/tipos';

describe('carregarContexto (D1 real)', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','A','ISO 27001','controller','Active'), ('p-b','B','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat) VALUES ('r1','p-a','Base','Vazamento'), ('r2','p-b','Outra','Queda')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, role_category, job_title) VALUES ('p-a','Maria','executivo','CEO')`),
      env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES ('ev-a','p-a','a.md','k','h','x'), ('ev-b','p-b','b.md','k2','h','x')`),
      env.DB.prepare(`INSERT INTO project_interviews (id, project_id, track, question, answer) VALUES ('i1','p-a','executiva','q','a'), ('i2','p-a','executiva','q2','a')`),
      env.DB.prepare(`INSERT INTO project_phase_answers (id, project_id, phase_number, question_key, answer, updated_by) VALUES ('a1','p-a',3,'p3_q1','Escopo X','c@x.test'), ('a2','p-a',3,'p3_q2','   ',NULL)`),
    ]);
  });

  it('conta só o projeto pedido, em toda entidade da lista fechada', async () => {
    const c = await carregarContexto(env.DB, 'p-a');
    expect(c.entidades.riscos).toBe(1);
    expect(c.entidades.governanca).toBe(1);
    expect(Object.keys(c.entidades).sort()).toEqual([...ENTIDADES].sort());
    for (const e of ENTIDADES) expect(CONSULTAS_ENTIDADE[e]).toMatch(/project_id = \?/);
  });
  it('evidências, trilhas e respostas são do projeto; resposta em branco não conta', async () => {
    const c = await carregarContexto(env.DB, 'p-a');
    expect([...c.evidencias]).toEqual(['ev-a']);
    expect([...c.trilhas]).toEqual(['executiva']);
    expect([...c.respostas.keys()]).toEqual(['p3_q1']);
    expect(c.respostas.get('p3_q1')).toMatchObject({ valor: 'Escopo X', por: 'c@x.test' });
  });
});
