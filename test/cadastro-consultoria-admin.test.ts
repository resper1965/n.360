import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * "Cadastrar agora" na entrevista do RoPA vale para o administrador da consultoria: o servidor aceita as três criações
 * (pessoa, área, sistema) no projeto da própria organização e recusa em projeto de outra.
 */
const P = 'cad-p';
const OUTRA = 'cad-outra';
const chamar = (h: Record<string, string>, caminho: string, corpo: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(corpo),
  }), workerEnv() as never);

let adm: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO organizations (id, name, slug) VALUES ('org_cad', 'Outra', 'outra-cad')`),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'X', 'LGPD', 'Controller', 'Active', 'org_cad')`).bind(OUTRA),
  ]);
  adm = await sessionFor({ id: 'cad-adm', email: 'adm@ness.lat', role: 'consultoria_admin', org_id: 'org_ness' });
});

describe('consultoria_admin cadastra durante a entrevista', () => {
  it('cria pessoa, área e sistema no projeto da própria organização', async () => {
    const pessoa = await chamar(adm, `/api/v1/projects/${P}/partes`, { tipo: 'pessoa', nome: 'Ana Exemplo', email: null });
    expect([200, 201]).toContain(pessoa.status);
    const area = await chamar(adm, `/api/v1/projects/${P}/departamentos`, { nome: 'Financeiro' });
    expect([200, 201]).toContain(area.status);
    const sistema = await chamar(adm, `/api/v1/projects/${P}/assets`, { name: 'Sistema de folha', category: 'Software' });
    expect([200, 201]).toContain(sistema.status);
  });

  it('em projeto de outra organização é recusado', async () => {
    for (const [caminho, corpo] of [
      [`/api/v1/projects/${OUTRA}/partes`, { tipo: 'pessoa', nome: 'Bia Exemplo', email: null }],
      [`/api/v1/projects/${OUTRA}/departamentos`, { nome: 'Jurídico' }],
      [`/api/v1/projects/${OUTRA}/assets`, { name: 'CRM', category: 'Software' }],
    ] as const) {
      const r = await chamar(adm, caminho, corpo);
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
    }
  });
});
