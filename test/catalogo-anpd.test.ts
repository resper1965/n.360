import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';
import { semearCatalogo } from '../src/services/requisitos';
import { ANPD } from '../src/data/anpd';
import { LGPD_VERSAO } from '../src/data/lgpd';

const PAIS = ['anpd:res2-2022', 'anpd:res15-2024', 'anpd:res18-2024', 'anpd:res19-2024'];

describe('catálogo ANPD', () => {
  beforeAll(async () => { await applySchema(); });

  it('ids no padrão anpd:resN-AAAA e filho anpd:resN-AAAA:artN; cada resolução é pai, cada artigo aponta para ela', () => {
    for (const r of ANPD) {
      expect(r.id).toMatch(/^anpd:res\d+-\d{4}(:art\d+(-[a-z])?)?$/);
      expect(r.titulo.length).toBeLessThanOrEqual(120);
      if (r.id.includes(':art')) expect(r.pai_id).toBe(r.id.split(':art')[0]);
      else expect(r.pai_id).toBeNull();
    }
    expect(new Set(ANPD.map((r) => r.id)).size).toBe(ANPD.length);
    for (const p of PAIS) expect(ANPD.some((r) => r.id === p && r.pai_id === null), p).toBe(true);
    expect(ANPD.filter((r) => r.pai_id === null).map((r) => r.id).sort()).toEqual([...PAIS].sort());
    for (const p of PAIS) expect(ANPD.some((r) => r.pai_id === p), `${p} sem artigo`).toBe(true);
  });

  it('referência do filho no formato "Res. CD/ANPD 15/2024, art. 6"', () => {
    expect(ANPD.find((r) => r.id === 'anpd:res15-2024:art6')?.referencia).toBe('Res. CD/ANPD 15/2024, art. 6');
    expect(ANPD.find((r) => r.id === 'anpd:res15-2024')?.referencia).toBe('Res. CD/ANPD 15/2024');
    for (const r of ANPD.filter((x) => x.pai_id)) expect(r.referencia).toMatch(/^Res\. CD\/ANPD \d+\/\d{4}, art\. \d+(-[A-Z])?$/);
  });

  it('semear grava na fonte anpd, é idempotente e a rota de fontes lista anpd', async () => {
    const conta = async () => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM requisitos WHERE fonte_id = 'anpd'`).first<{ n: number }>())!.n;
    await semearCatalogo(env.DB);
    expect(await conta()).toBe(ANPD.length);
    await semearCatalogo(env.DB);
    expect(await conta()).toBe(ANPD.length);
    expect((await env.DB.prepare(`SELECT pai_id FROM requisitos WHERE id = 'anpd:res15-2024:art6'`).first<{ pai_id: string }>())!.pai_id).toBe('anpd:res15-2024');

    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-anpd', 'adm-anpd@ness.lat', 'x', 'Adm', 'platform_admin', 'org_ness')`).run();
    const h = await sessionFor({ id: 'u-anpd', email: 'adm-anpd@ness.lat', role: 'platform_admin' });
    const res = await app.fetch(new Request('http://localhost/api/v1/requisitos/fontes', { headers: h }), workerEnv() as any);
    expect(res.status).toBe(200);
    const fontes = (await res.json()) as { id: string; requisitos: number }[];
    expect(fontes.find((f) => f.id === 'anpd')?.requisitos).toBe(ANPD.length);
  });

  it('fonte já existente com versão antiga recebe a versão atual no seed', async () => {
    await env.DB.prepare(`UPDATE requisito_fontes SET versao = '2018' WHERE id = 'lgpd'`).run();
    const r = await semearCatalogo(env.DB);
    expect(r.fontes).toBe(1); // só a lgpd mudou
    expect((await env.DB.prepare(`SELECT versao FROM requisito_fontes WHERE id = 'lgpd'`).first<{ versao: string }>())!.versao).toBe(LGPD_VERSAO);
    expect((await semearCatalogo(env.DB)).fontes).toBe(0);
  });
});
