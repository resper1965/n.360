import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, workerEnv, sessionFor } from './helpers/d1';

const SENHA = 'Senha-forte-123!';
const json = { 'Content-Type': 'application/json' };
const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv() as any);
const um = <T = any>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<T>();
const S: Record<string, Record<string, string>> = {};
const novaOrg = (o: Record<string, unknown> = {}) => ({
  nome: 'Empresa Direta', slug: 'empresa-direta', cnpj: '11222333000181', adminEmail: 'admin@direta.lat', adminNome: 'Admin Direta',
  maxProjetos: 5, maxUsuarios: 10, termoVersao: 'direta-v1-2026-11', ...o,
});

afterEach(() => vi.restoreAllMocks());
beforeAll(async () => {
  await applySchema();
  const h = await hashPassword(SENHA);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id, ativo) VALUES ('u-pa','pa@ness.lat',?,'PA','platform_admin','org_ness',1)`).bind(h),
  ]);
  S.pa = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
});

describe('criação de organização com tipo', () => {
  it('sem tipo nasce consultoria', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}'));
    const r = await chamar('POST', '/api/v1/platform/orgs', S.pa, novaOrg({ nome: 'C', slug: 'cons-x', adminEmail: 'a@cons.lat' }));
    expect(r.status).toBe(201);
    expect((await um('SELECT tipo FROM organizations WHERE id = ?', 'org_cons-x')).tipo).toBe('consultoria');
  });
  it('direta com módulos escolhidos na criação', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"x"}'));
    const r = await chamar('POST', '/api/v1/platform/orgs', S.pa, novaOrg({ tipo: 'direta', modulos: ['iso', 'privacy'] }));
    expect(r.status).toBe(201);
    const o = await um('SELECT tipo, modulos_contratados m FROM organizations WHERE id = ?', 'org_empresa-direta');
    expect(o.tipo).toBe('direta');
    expect(JSON.parse(o.m)).toEqual(['iso', 'privacy']);
  });
  it('tipo inválido é recusado e o tipo não muda depois de criado', async () => {
    expect((await chamar('POST', '/api/v1/platform/orgs', S.pa, novaOrg({ slug: 'x-y-z', adminEmail: 'z@z.lat', tipo: 'outra' }))).status).toBe(400);
    const r = await chamar('PUT', '/api/v1/platform/orgs/org_empresa-direta', S.pa, { tipo: 'consultoria' });
    expect(r.status).toBe(400); // atualizarOrgSchema é strict: não aceita o campo
    expect((await um('SELECT tipo FROM organizations WHERE id = ?', 'org_empresa-direta')).tipo).toBe('direta');
  });
});
