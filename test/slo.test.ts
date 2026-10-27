import { describe, it, expect } from 'vitest';
import { avaliarSlo, TETOS, type MedidaSlo } from '../src/services/slo';
import sloMjs from '../scripts/slo.mjs?raw';

/**
 * SLO medido dentro do Worker (src/services/slo.ts, spec 2026-10-27-slo-no-worker). A avaliação é pura;
 * os números de entrada são fictícios.
 */

const medida = (o: Partial<MedidaSlo> = {}): MedidaSlo => ({ total: 1000, erros5xx: 0, totalSemIa: 900, p95Ms: 300, p99Ms: 500, ...o });

describe('avaliarSlo (puro)', () => {
  it('sistema saudável: sem violação', () => {
    expect(avaliarSlo(medida())).toEqual([]);
  });

  it('5xx acima de 1% do total (e ao menos um erro): alerta, citando taxa, contagem e teto', () => {
    const v = avaliarSlo(medida({ total: 1000, erros5xx: 20 }));
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('2.00%');
    expect(v[0]).toContain('20 de 1000');
    expect(v[0]).toContain('1%');
  });

  it('exatamente no teto de 1% não alerta; zero erro nunca alerta, qualquer que seja o total', () => {
    expect(avaliarSlo(medida({ total: 1000, erros5xx: 10 }))).toEqual([]);
    expect(avaliarSlo(medida({ total: 0, erros5xx: 0 }))).toEqual([]);
  });

  it('baixo volume: um erro em 30 requisições estoura 1% e É para alertar', () => {
    expect(avaliarSlo(medida({ total: 30, erros5xx: 1, totalSemIa: 30 })).join(' ')).toContain('1 de 30');
  });

  it('p95 acima de 800 ms com volume suficiente: alerta, citando p95, p99 e teto', () => {
    const v = avaliarSlo(medida({ p95Ms: 1672, p99Ms: 3034 }));
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('1672 ms');
    expect(v[0]).toContain('3034 ms');
    expect(v[0]).toContain('800 ms');
  });

  it('p95 só é avaliado com 20 requisições ou mais fora da IA: abaixo disso é ruído', () => {
    expect(avaliarSlo(medida({ totalSemIa: 19, p95Ms: 5000 }))).toEqual([]);
    expect(avaliarSlo(medida({ totalSemIa: 20, p95Ms: 5000 }))).toHaveLength(1);
  });

  it('os dois estourados: duas violações', () => {
    expect(avaliarSlo(medida({ erros5xx: 50, p95Ms: 900 }))).toHaveLength(2);
  });
});

describe('paridade com scripts/slo.mjs (os tetos não podem divergir)', () => {
  const dele = (nome: string) => Number(new RegExp(`const ${nome} = ([0-9.]+);`).exec(sloMjs)![1]);
  it('mesmos tetos e mesmo volume mínimo', () => {
    expect(TETOS.taxa5xxMax).toBe(dele('TAXA_5XX_MAX'));
    expect(TETOS.p95MaxMs).toBe(dele('P95_MAX_MS'));
    expect(TETOS.volumeMinimoP95).toBe(dele('VOLUME_MINIMO_P95'));
  });
  it('mesmas rotas de IA fora do p95', () => {
    const lista = /const ROTAS_DE_IA = \[([^\]]+)\]/.exec(sloMjs)![1].split(',').map((s) => s.trim().replace(/'/g, ''));
    expect([...TETOS.rotasDeIa]).toEqual(lista);
  });
});
