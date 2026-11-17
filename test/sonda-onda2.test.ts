import { describe, it, expect } from 'vitest';
import sonda from '../scripts/sonda-onda2.sql?raw';

// A sonda roda contra produção: trava para que ela continue somente leitura.
describe('scripts/sonda-onda2.sql', () => {
  it('só tem SELECT', () => {
    const sql = sonda.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    const comandos = sql.split(';').map((s) => s.trim()).filter(Boolean);
    expect(comandos.length).toBe(6);
    for (const c of comandos) expect(c).toMatch(/^SELECT\b/i);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|PRAGMA)\b/i);
  });
});
