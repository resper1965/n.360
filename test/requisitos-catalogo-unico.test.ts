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

describe('texto normativo só onde a licença permite', () => {
  const put = async (h: Record<string, string>, id: string, body: unknown) =>
    app.fetch(new Request('http://localhost/api/v1/requisitos/' + encodeURIComponent(id), { method: 'PUT', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify(body) }), workerEnv() as any);
  const texto = async (id: string) => env.DB.prepare('SELECT texto, fonte_texto FROM requisitos WHERE id = ?').bind(id).first<{ texto: string | null; fonte_texto: string | null }>();
  const FONTE = 'LGPD, Lei 13.709/2018, texto oficial no Planalto';

  it('invariante: depois de semearCatalogo nenhum requisito ISO tem texto e os 25 da ONS têm o texto de ot_requisitos', async () => {
    await semearCatalogo(env.DB);
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM requisitos WHERE fonte_id LIKE 'iso%' AND texto IS NOT NULL`).first<{ n: number }>())!.n).toBe(0);
    const { results } = await env.DB.prepare(`SELECT o.descricao, r.texto FROM ot_requisitos o JOIN requisitos r ON r.id = o.id`).all<any>();
    expect(results.length).toBe(25);
    for (const x of results) expect(x.texto).toBe(x.descricao);
  });

  it('ISO com texto: 400 em português e nada gravado', async () => {
    const adm = await sessionFor({ id: 'u-adm-tx', email: 'adm-tx@ness.lat', role: 'platform_admin' });
    const r = await put(adm, 'iso27001:2022:A.5.1', { titulo: 'Políticas', texto: 'texto protegido', fonte_texto: FONTE });
    expect(r.status).toBe(400);
    expect(((await r.json()) as any).error).toContain('protegido por licença');
    expect(await texto('iso27001:2022:A.5.1')).toEqual({ texto: null, fonte_texto: null });
  });

  it('LGPD com texto e origem: 200, grava e a trilha não leva o texto inteiro; GET devolve o texto', async () => {
    const adm = await sessionFor({ id: 'u-adm-tx', email: 'adm-tx@ness.lat', role: 'platform_admin' });
    const corpo = 'T'.repeat(500);
    expect((await put(adm, 'lgpd:art7', { titulo: 'Bases legais', texto: corpo, fonte_texto: FONTE })).status).toBe(200);
    expect(await texto('lgpd:art7')).toEqual({ texto: corpo, fonte_texto: FONTE });
    const log = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'requisitos.titulo' AND details LIKE '%lgpd:art7%' ORDER BY rowid DESC`).first<{ details: string }>();
    expect(log!.details).toContain('texto atualizado (500 caracteres)');
    expect(log!.details).not.toContain(corpo);
    const g = await app.fetch(new Request('http://localhost/api/v1/requisitos/' + encodeURIComponent('lgpd:art7'), { headers: adm }), workerEnv() as any);
    expect(((await g.json()) as any).texto).toBe(corpo);
  });

  it('texto sem fonte_texto: 400; consultor: 403', async () => {
    const adm = await sessionFor({ id: 'u-adm-tx', email: 'adm-tx@ness.lat', role: 'platform_admin' });
    expect((await put(adm, 'lgpd:art8', { titulo: 'x', texto: 'sem origem' })).status).toBe(400);
    const cons = await sessionFor({ id: 'u-cons-tx', email: 'cons-tx@ness.lat', role: 'consultant' });
    expect((await put(cons, 'lgpd:art8', { titulo: 'x', texto: 'a', fonte_texto: FONTE })).status).toBe(403);
  });
});
