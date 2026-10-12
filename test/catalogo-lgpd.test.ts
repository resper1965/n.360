import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import { semearCatalogo } from '../src/services/requisitos';
import { LGPD } from '../src/data/lgpd';

describe('catálogo LGPD', () => {
  beforeAll(async () => { await applySchema(); await semearCatalogo(env.DB); });

  it('ids no padrão do código: lgpd:artN e filho lgpd:artN:inciso, referência legível', () => {
    for (const r of LGPD) {
      expect(r.id).toMatch(/^lgpd:art\d+(-[a-z])?(:[a-z0-9-]+)?$/);
      expect(r.referencia).toMatch(/^art\. \d+/);
      if (r.pai_id) expect(LGPD.some((p) => p.id === r.pai_id)).toBe(true);
    }
    expect(new Set(LGPD.map((r) => r.id)).size).toBe(LGPD.length);
  });

  it('traz as bases legais (art. 7 I–X, art. 11) como filhos, que a tela de ligações do RoPA usa', () => {
    const filhos = (pai: string) => LGPD.filter((r) => r.pai_id === pai).map((r) => r.id);
    expect(filhos('lgpd:art7')).toEqual(['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'].map((x) => `lgpd:art7:${x}`));
    expect(filhos('lgpd:art11').length).toBeGreaterThanOrEqual(2);
    expect(LGPD.some((r) => r.id === 'lgpd:art7:ix' && r.referencia === 'art. 7, IX')).toBe(true);
  });

  it('cobre os deveres centrais: registro, RIPD, encarregado, segurança, incidente, direitos do titular', () => {
    for (const id of ['lgpd:art18', 'lgpd:art37', 'lgpd:art38', 'lgpd:art41', 'lgpd:art46', 'lgpd:art48']) expect(LGPD.some((r) => r.id === id), id).toBe(true);
  });

  it('semear grava na fonte lgpd e é idempotente', async () => {
    const conta = async () => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM requisitos WHERE fonte_id = 'lgpd'`).first<{ n: number }>())!.n;
    expect(await conta()).toBe(LGPD.length);
    await semearCatalogo(env.DB);
    expect(await conta()).toBe(LGPD.length);
    const pai = await env.DB.prepare(`SELECT pai_id FROM requisitos WHERE id = 'lgpd:art7:ix'`).first<{ pai_id: string }>();
    expect(pai!.pai_id).toBe('lgpd:art7');
  });
});
