import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

// platform_admin age na organização do X-Org-Id (a sessão dele é da org_ness): a área comercial segue o tipo da organização ATIVA
// (decisão 11: a direta não tem área comercial). Antes, `ehComercial` lia o tipo da sessão e tratava a direta como consultoria.
const chamar = (caminho: string, headers: Record<string, string>) =>
  app.fetch(new Request('http://localhost' + caminho, { headers }), workerEnv() as any);
let pa: Record<string, string>, adminCons: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  const h = await hashPassword('Senha-forte-123!');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO organizations (id, name, slug, max_projects, max_users, tipo) VALUES ('org_d','Direta','direta-d',10,10,'direta'), ('org_c','Consultoria','cons-c',10,10,'consultoria')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id, ativo) VALUES
      ('u-pa','pa@ness.lat',?,'PA','platform_admin','org_ness',1), ('u-ca','ca@cons.lat',?,'CA','consultoria_admin','org_c',1)`).bind(h, h),
    env.DB.prepare(`INSERT INTO leads (id, company_name, status, org_id) VALUES ('l-d','Prospect D','New','org_d'), ('l-c','Prospect C','New','org_c')`),
  ]);
  pa = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  adminCons = await sessionFor({ id: 'u-ca', email: 'ca@cons.lat', role: 'consultoria_admin', org_id: 'org_c' });
});

describe('platform_admin com X-Org-Id: a área comercial segue o tipo da organização ativa', () => {
  for (const rota of ['/api/v1/propostas', '/api/v1/servicos']) {
    it(`${rota}: direta 403; consultoria 200; sem cabeçalho (org_ness) 200; organização inexistente 403`, async () => {
      expect((await chamar(rota, { ...pa, 'X-Org-Id': 'org_d' })).status).toBe(403);
      expect((await chamar(rota, { ...pa, 'X-Org-Id': 'org_c' })).status).toBe(200);
      expect((await chamar(rota, pa)).status).toBe(200);
      expect((await chamar(rota, { ...pa, 'X-Org-Id': 'org_nao_existe' })).status).toBe(403);
    });
  }

  it('dashboard: o lead da direta não é contado para o platform_admin nela; o da consultoria é', async () => {
    const leads = async (org: string) => (await (await chamar('/api/v1/dashboard', { ...pa, 'X-Org-Id': org })).json<{ leads: number }>()).leads;
    expect(await leads('org_d')).toBe(0);
    expect(await leads('org_c')).toBe(1);
  });

  it('o cabeçalho de quem não é platform_admin continua ignorado (o da consultoria segue comercial, mesmo apontando a direta)', async () => {
    expect((await chamar('/api/v1/propostas', { ...adminCons, 'X-Org-Id': 'org_d' })).status).toBe(200);
  });
});
