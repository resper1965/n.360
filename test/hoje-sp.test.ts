import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { hojeEmSaoPaulo, diaMaisSP, mesesMaisSP } from '../src/services/hoje';
import { visaoDoEncarregado } from '../src/services/encarregado';
import { applySchema, habilitarPrivacy } from './helpers/d1';

const FONTES = import.meta.glob('../src/services/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const P = 'hsp-proj';

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P),
    // validade no dia 20/10 escrita com hora: a comparação é pelo dia
    env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, valido_ate)
                    VALUES ('hsp-ev1', ?1, 'a.pdf', 'k1', 'h', 'x', '2026-10-20T23:00:00Z'), ('hsp-ev2', ?1, 'b.pdf', 'k2', 'h', 'x', '2026-10-19')`).bind(P),
  ]);
  await habilitarPrivacy(P);
});
afterEach(() => vi.useRealTimers());

describe('"hoje" é o dia de São Paulo', () => {
  it('21h30 de Brasília ainda é o mesmo dia; meia-noite e meia de Brasília já é o seguinte', () => {
    expect(hojeEmSaoPaulo(new Date('2026-10-21T00:30:00Z'))).toBe('2026-10-20');
    expect(hojeEmSaoPaulo(new Date('2026-10-21T03:30:00Z'))).toBe('2026-10-21');
    expect(diaMaisSP(7, new Date('2026-10-21T00:30:00Z'))).toBe('2026-10-27');
  });

  it('+12 meses é o mesmo dia do ano seguinte em São Paulo, não 365 dias', () => {
    expect(mesesMaisSP(12, new Date('2027-03-01T12:00:00Z'))).toBe('2028-03-01'); // 365 dias dariam 29/02/2028
    expect(mesesMaisSP(12, new Date('2026-11-13T01:00:00Z'))).toBe('2027-11-12'); // 22h de 12/11 em Brasília
    expect(mesesMaisSP(12, new Date('2028-02-29T12:00:00Z'))).toBe('2029-03-01'); // 29/02 sem par no ano seguinte
  });

  it('às 21h30 de Brasília a evidência que vence hoje não está vencida no encarregado', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T00:30:00Z'));
    const v = await visaoDoEncarregado(env.DB, P);
    expect(v.evidencias.a_corrigir).toBe(1); // só a de 19/10
    expect(v.evidencias.vencem_em_7_dias).toBe(1); // a de hoje, mesmo escrita com hora
  });

  it('nenhum serviço calcula "hoje" pelo relógio em UTC', () => {
    const fora = Object.entries(FONTES)
      .filter(([, src]) => /new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)|date\('now'\)\s*\)?\s*(?:OR|AND|\))/.test(src))
      .map(([arq]) => arq);
    expect(fora).toEqual([]);
  });
});
