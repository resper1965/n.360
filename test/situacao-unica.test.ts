import { describe, it, expect } from 'vitest';
import { situacaoUnica, situacaoDoItemTecnico } from '../src/services/situacao-unica';

describe('situacaoUnica (V1 → vocabulário único)', () => {
  const casos: [string | null | undefined, string][] = [
    ['Implemented', 'atende'], ['Compliant', 'atende'], ['APPROVED', 'atende'], ['COMPLETED', 'atende'], ['CONFORME', 'atende'],
    ['Partial', 'parcial'], ['In Progress', 'parcial'], ['qualquer coisa desconhecida', 'parcial'],
    ['Planned', 'nao_atende'],
    ['Missing', 'nao_avaliado'], ['NOT STARTED', 'nao_avaliado'], ['NOT_STARTED', 'nao_avaliado'], ['', 'nao_avaliado'], ['   ', 'nao_avaliado'], [null, 'nao_avaliado'], [undefined, 'nao_avaliado'],
    ['Not Applicable', 'nao_se_aplica'],
  ];
  it.each(casos)('%j → %s', (entrada, esperado) => expect(situacaoUnica(entrada)).toBe(esperado));
});

describe('situacaoDoItemTecnico (V3, D2: nunca vira atende)', () => {
  it('nao_atende fica nao_atende', () => expect(situacaoDoItemTecnico('nao_atende')).toEqual({ situacao: 'nao_atende', derivado: 'nao_atende' }));
  it('evidencia_no_inventario NÃO vira atende', () => {
    const r = situacaoDoItemTecnico('evidencia_no_inventario');
    expect(r.situacao).toBe('nao_avaliado');
    expect(r.derivado).toBe('evidencia_no_inventario');
  });
  it('sem_evidencia e nulo viram nao_avaliado', () => {
    expect(situacaoDoItemTecnico('sem_evidencia').situacao).toBe('nao_avaliado');
    expect(situacaoDoItemTecnico(null)).toEqual({ situacao: 'nao_avaliado', derivado: null });
  });
});
