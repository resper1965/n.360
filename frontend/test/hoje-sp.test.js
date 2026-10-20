import { describe, it, expect, afterEach, vi } from 'vitest';
import { hojeSP, emDiasSP } from '../src/hoje.js';
import { emAtraso } from '../src/views/gaps.js';

const FONTES = import.meta.glob('../src/**/*.js', { query: '?raw', import: 'default', eager: true });
afterEach(() => vi.useRealTimers());

describe('hoje na tela é o dia de São Paulo', () => {
  it('21h30 de Brasília ainda é o dia; o prazo de hoje não está em atraso', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T00:30:00Z'));
    expect(hojeSP()).toBe('2026-10-20');
    expect(emDiasSP(7)).toBe('2026-10-27');
    expect(emAtraso({ status: 'Open', prazo: '2026-10-20' })).toBe(false);
    expect(emAtraso({ status: 'Open', prazo: '2026-10-19' })).toBe(true);
  });

  it('nenhuma tela calcula hoje por toISOString nem pelo fuso do navegador', () => {
    const fora = Object.entries(FONTES)
      .filter(([arq]) => !arq.endsWith('/hoje.js'))
      .filter(([, src]) => /new Date\(\)\.toISOString\(\)\.(?:slice\(0, ?10\)|split\('T'\)\[0\])|getTimezoneOffset\(\)/.test(src))
      .map(([arq]) => arq);
    expect(fora).toEqual([]);
  });
});
