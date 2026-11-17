import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';
import { semearCatalogo } from '../src/services/requisitos';

beforeAll(applySchema);

describe('migration 0114: ONS no catálogo único', () => {
  it('a ONS está no catálogo com os mesmos ids, texto e categoria de ot_requisitos', async () => {
    const { results } = await env.DB.prepare(
      `SELECT o.id, o.codigo, o.titulo, o.descricao, o.categoria, r.id AS rid, r.fonte_id, r.referencia, r.titulo AS rtitulo, r.texto, r.categoria AS rcat, o.requisito_id
         FROM ot_requisitos o LEFT JOIN requisitos r ON r.id = o.id`).all<any>();
    expect(results.length).toBe(25);
    for (const x of results) {
      expect(x.rid).toBe(x.id);
      expect(x.fonte_id).toBe('ons-ro-cb-br-01');
      expect(x.referencia).toBe(x.codigo);
      expect(x.rtitulo).toBe(x.titulo);
      expect(x.texto).toBe(x.descricao);
      expect(x.rcat).toBe(x.categoria);
      expect(x.requisito_id).toBe(x.id);
    }
  });

  it('semearCatalogo não toca na ONS e é idempotente', async () => {
    const conta = async () => (await env.DB.prepare(`SELECT count(*) AS n FROM requisitos WHERE fonte_id = 'ons-ro-cb-br-01'`).first<{ n: number }>())!.n;
    await semearCatalogo(env.DB);
    const r2 = await semearCatalogo(env.DB);
    expect(r2).toEqual({ fontes: 0, requisitos: 0, mapeamentos: 0 });
    expect(await conta()).toBe(25);
  });

  it('rotas globais: platform_admin (todos os módulos) vê a ONS; a trava por pessoa está em requisitos-ons-trava.test.ts', async () => {
    const h = await sessionFor({ id: 'u-adm-ons', email: 'adm-ons@ness.lat', role: 'platform_admin' });
    const get = async (c: string) => (await app.fetch(new Request('http://localhost' + c, { headers: h }), workerEnv() as any)).json() as Promise<any[]>;
    expect((await get('/api/v1/requisitos/fontes')).find((f) => f.id === 'ons-ro-cb-br-01')?.requisitos).toBe(25);
    expect((await get('/api/v1/requisitos?fonte=ons-ro-cb-br-01')).length).toBe(25);
  });
});
