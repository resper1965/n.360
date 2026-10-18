import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import { semearCatalogo, lacunasDaFonte } from '../src/services/requisitos';

// Regra: só controle IMPLEMENTADO cobre (com equivalente); Partial/In Progress dão no máximo parcial; o resto não conta.
const CASOS: [string | null, 'equivalente' | 'parcial', 'coberto' | 'parcial' | 'lacuna'][] = [
  ['Implemented', 'equivalente', 'coberto'], ['Implemented', 'parcial', 'parcial'],
  ['Compliant', 'equivalente', 'coberto'],
  ['Partial', 'equivalente', 'parcial'], ['Partial', 'parcial', 'parcial'],
  ['In Progress', 'equivalente', 'parcial'], ['In Progress', 'parcial', 'parcial'],
  ['Planned', 'equivalente', 'lacuna'], ['Planned', 'parcial', 'lacuna'],
  ['Missing', 'equivalente', 'lacuna'], ['Not Applicable', 'equivalente', 'lacuna'],
  [null, 'equivalente', 'lacuna'],
];

describe('cobertura por status do controle', () => {
  beforeAll(async () => {
    await applySchema();
    await semearCatalogo(env.DB);
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('pc', 'Cliente', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).run();
    const lote = [];
    CASOS.forEach(([status, tipo], i) => {
      lote.push(env.DB.prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo) VALUES (?, 'iso27001:2022', ?, 'x')`).bind(`t:iso${i}`, `t${i}`));
      lote.push(env.DB.prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo) VALUES (?, 'lgpd', ?, 'x')`).bind(`t:lgpd${i}`, `t${i}`));
      lote.push(env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, requisito_id) VALUES (?, 'pc', 'ISO 27001:2022', 'c', ?, ?)`).bind(`tc${i}`, status, `t:iso${i}`));
      lote.push(env.DB.prepare(`INSERT INTO requisito_mapeamentos (de_id, para_id, tipo, estado, validado_por, validado_em) VALUES (?, ?, ?, 'validado_juridico', 'Jurídico', '2026-10-10')`).bind(`t:iso${i}`, `t:lgpd${i}`, tipo));
    });
    await env.DB.batch(lote);
  });

  it.each(CASOS.map((c, i) => [...c, i] as const))('%s + %s => %s', async (status, tipo, esperado, i) => {
    const item = (await lacunasDaFonte(env.DB, 'pc', 'lgpd')).find((l) => l.requisito_id === `t:lgpd${i}`)!;
    expect(item.situacao).toBe(esperado);
    if (esperado !== 'lacuna') expect(item.origens).toMatchObject([{ tipo: 'controle', status, mapeamento: tipo }]);
  });
});
