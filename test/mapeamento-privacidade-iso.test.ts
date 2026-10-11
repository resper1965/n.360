import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import { semearCatalogo, lacunasDaFonte } from '../src/services/requisitos';
import { MAPEAMENTOS } from '../src/data/mapeamento-privacidade-iso';

describe('mapeamento proposto', () => {
  beforeAll(async () => { await applySchema(); await semearCatalogo(env.DB); });

  it('todo par aponta para requisito que existe no catálogo, sem par repetido', async () => {
    const ids = new Set((await env.DB.prepare('SELECT id FROM requisitos').all<{ id: string }>()).results.map((r) => r.id));
    for (const m of MAPEAMENTOS) { expect(ids.has(m.de), m.de).toBe(true); expect(ids.has(m.para), m.para).toBe(true); }
    expect(new Set(MAPEAMENTOS.map((m) => `${m.de}|${m.para}`)).size).toBe(MAPEAMENTOS.length);
  });

  it('entra como proposto e não conta na cobertura', async () => {
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM requisito_mapeamentos WHERE estado = 'proposto'`).first<{ n: number }>();
    expect(n!.n).toBe(MAPEAMENTOS.length);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('mp', 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness')`),
    ]);
    const m = MAPEAMENTOS.find((x) => x.tipo === 'equivalente') ?? MAPEAMENTOS[0];
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, title, status, standard, requisito_id) VALUES ('c1', 'mp', ?, 'Implemented', 'ISO 27001:2022', ?)`).bind(`${m.de.split(':').pop()} — x`, m.de).run();
    const fonte = m.para.split(':')[0];
    const item = (await lacunasDaFonte(env.DB, 'mp', fonte)).find((l) => l.requisito_id === m.para)!;
    expect(item.situacao).toBe('lacuna');
  });

  it('ressemear não rebaixa mapeamento já validado', async () => {
    const m = MAPEAMENTOS[0];
    await env.DB.prepare(`UPDATE requisito_mapeamentos SET estado = 'validado_juridico', validado_por = 'Jurídico', validado_em = '2026-10-10' WHERE de_id = ? AND para_id = ?`).bind(m.de, m.para).run();
    await semearCatalogo(env.DB);
    const r = await env.DB.prepare('SELECT estado FROM requisito_mapeamentos WHERE de_id = ? AND para_id = ?').bind(m.de, m.para).first<{ estado: string }>();
    expect(r!.estado).toBe('validado_juridico');
  });

  it('traz os pares de governança da cláusula A.5 (política, papéis, segregação, direção, autoridades)', () => {
    const tipo = (code: string, para: string) => MAPEAMENTOS.find((m) => m.de === `iso27001:2022:${code}` && m.para === para)?.tipo;
    expect(tipo('A.5.1', 'lgpd:art46')).toBe('parcial');
    expect(tipo('A.5.2', 'lgpd:art37')).toBe('relacionado');
    expect(tipo('A.5.3', 'lgpd:art37')).toBe('relacionado');
    expect(tipo('A.5.4', 'lgpd:art7')).toBe('relacionado');
    expect(tipo('A.5.5', 'lgpd:art9')).toBe('relacionado');
  });

  it('cobre os pontos de contato óbvios', () => {
    const tem = (para: string) => MAPEAMENTOS.some((m) => m.para === para);
    for (const p of ['lgpd:art37', 'lgpd:art38', 'lgpd:art46', 'lgpd:art48', 'lgpd:art41', 'lgpd:art18']) expect(tem(p), p).toBe(true);
  });
});
