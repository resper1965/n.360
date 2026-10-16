import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Interruptor da área comercial (`COMERCIAL_ATIVO`, decisão do dono de 15/10/2026): desligado, as rotas comerciais
 * respondem 404 para pessoa e chave de API, como se não existissem; nada é apagado. O agente MCP segue alcançando o que a
 * matriz dele permite (agente-comercial.test.ts). `/api/v1/org` (identidade da organização) continua.
 * A suíte roda com o interruptor LIGADO (wrangler.test.jsonc): os testes comerciais antigos provam o "ligado".
 */
const com = (valor: string | undefined) => {
  const e = workerEnv();
  if (valor === undefined) delete e.COMERCIAL_ATIVO; else e.COMERCIAL_ATIVO = valor;
  return e;
};
const pedir = (caminho: string, e: any, init: RequestInit = {}) => worker.fetch(new Request('http://localhost' + caminho, init), e);

const ROTAS = ['/api/v1/leads', '/api/v1/funil', '/api/v1/proposals', '/api/v1/proposals/config/pricing', '/api/v1/servicos',
  '/api/v1/propostas', '/api/v1/assessments', '/api/v1/pricing-config', '/api/v1/leads/l-1'];

describe('interruptor da área comercial', () => {
  let adm: Record<string, string>;
  let cli: Record<string, string>;
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-pa', 'pa@ness.lat', 'x', 'PA', 'platform_admin')`),
      env.DB.prepare(`INSERT INTO assessments (id, client_name, status, org_id) VALUES ('as-1', 'Cliente', 'completed', 'org_ness')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, assessment_id) VALUES ('p-c', 'Cliente', 'ISO 27001', 'controller', 'active', 'as-1')`),
      env.DB.prepare(`INSERT INTO leads (id, company_name, status, org_id) VALUES ('l-1', 'Prospect', 'New', 'org_ness')`),
    ]);
    adm = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
    cli = await sessionFor({ id: 'u-cl', email: 'cl@cliente.lat', role: 'client', client_project_id: 'p-c' });
  }, 60_000);

  for (const [rotulo, valor] of [['desligado', 'false'], ['ausente', undefined]] as const) {
    it(`${rotulo}: 404 em toda rota comercial, para o platform_admin`, async () => {
      for (const r of ROTAS) expect((await pedir(r, com(valor), { headers: adm })).status, r).toBe(404);
      const novo = await pedir('/api/v1/leads', com(valor), { method: 'POST', headers: { ...adm, 'Content-Type': 'application/json' }, body: '{"company_name":"X"}' });
      expect(novo.status).toBe(404);
    });
  }

  it('desligado: o portal do cliente e a página pública da proposta também somem', async () => {
    expect((await pedir('/api/v1/client/assessment', com('true'), { headers: cli })).status).toBe(200);
    expect((await pedir('/api/v1/client/assessment', com('false'), { headers: cli })).status).toBe(404);
    // As outras já davam 404 de "não achei": o corpo prova que quem respondeu foi o interruptor.
    const ver = () => ({ method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.5.5.5' }, body: '{"token":"x"}' });
    for (const [r, init] of [['/api/v1/client/proposal', { headers: cli }], ['/api/v1/public/propostas/ver', ver()], ['/api/v1/assessments/public/tok', {}]] as const) {
      const res = await pedir(r, com('false'), init as RequestInit);
      expect([res.status, await res.json()], r).toEqual([404, { error: 'Não encontrado' }]);
    }
  });

  it('desligado: a identidade da organização (/org) continua', async () => {
    expect((await pedir('/api/v1/org/config', com('false'), { headers: adm })).status).toBe(200);
  });

  it('ligado: as rotas respondem como sempre', async () => {
    expect((await pedir('/api/v1/leads', com('true'), { headers: adm })).status).toBe(200);
    expect((await pedir('/api/v1/funil', com('true'), { headers: adm })).status).toBe(200);
  });

  it('/auth/me diz se a área está ligada', async () => {
    const me = async (v: string | undefined) => (await (await pedir('/api/v1/auth/me', com(v), { headers: adm })).json<any>()).user.comercial_ativo;
    expect(await me('true')).toBe(true);
    expect(await me('false')).toBe(false);
    expect(await me(undefined)).toBe(false);
  });
});
