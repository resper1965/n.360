import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { classeDoControle, SQL_CLASSE_CONTROLE } from '../src/services/classe-controle';
import { applySchema, sessionFor, workerEnv, designarConsultor } from './helpers/d1';

/** "Controle implementado" é uma regra só: a função TS, a SQL e o gap-analysis classificam igual (Compliant, legado, é feito). */
const P = 'cc-proj';
const STATUS = ['Implemented', 'Compliant', 'Approved', 'Completed', 'Partial', 'In Progress', 'Planned', 'Missing', 'Not Applicable', null];
const chamar = (h: Record<string, string>, caminho: string) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv());
let consultor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P).run();
  await env.DB.batch(STATUS.map((s, i) => env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES (?, ?, 'ISO 27001:2022', ?, ?)`)
    .bind(`cc-${i}`, P, `A.5.${i + 1} Controle ${i}`, s)));
  await designarConsultor('cons@ness.lat', P);
  consultor = await sessionFor({ id: 'cons:cons@ness.lat', email: 'cons@ness.lat', role: 'consultor', iat: Date.now() });
});

describe('controle implementado: uma regra', () => {
  it('a função TS e a SQL classificam igual, e Compliant (legado) é feito', async () => {
    const { results } = await env.DB.prepare(`SELECT status, ${SQL_CLASSE_CONTROLE} AS classe FROM compliance_controls WHERE project_id = ?`).bind(P).all<{ status: string | null; classe: string }>();
    expect(results).toHaveLength(STATUS.length);
    for (const r of results) expect(classeDoControle(r.status), String(r.status)).toBe(r.classe);
    expect(classeDoControle('Compliant')).toBe('feito');
    expect(classeDoControle('Planned')).toBe('andamento');
  });

  it('gap-analysis conta como implementado o mesmo que o Painel', async () => {
    const res = await chamar(consultor, `/api/v1/projects/${P}/gap-analysis`);
    expect(res.status, await res.clone().text()).toBe(200);
    const g = await res.json<{ applicable: number; coverage_pct: number; gaps: unknown[] }>();
    // 9 aplicáveis (sem o N/A); feitos: Implemented, Compliant, Approved, Completed = 4
    expect(g.applicable).toBe(9);
    expect(g.coverage_pct).toBe(Math.round((4 / 9) * 100));
    expect(g.gaps).toHaveLength(5);
  });
});
