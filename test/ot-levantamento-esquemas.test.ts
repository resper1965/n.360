// test/ot-levantamento-esquemas.test.ts
import { describe, it, expect } from 'vitest';
import { temPii } from '../src/services/rascunhos-privacy';
import { otLevantamentoCriarSchema, otAchadoCriarSchema, otEnviarAchadosSchema } from '../src/schemas/ot';

describe('texto livre do levantamento (spec §6)', () => {
  it('temPii pega CPF, e-mail e telefone, e não pega texto comum', () => {
    expect(temPii('CPF 123.456.789-09 do operador')).toBe(true);
    expect(temPii('mande para joao@empresa.com.br')).toBe(true);
    expect(temPii('ligue (21) 99876-5432')).toBe(true);
    expect(temPii('Operador do turno B usa TeamViewer para o fornecedor entrar')).toBe(false);
  });

  it('notas recusam IP, MAC e dado pessoal; operador nunca tem campo de nome', () => {
    const base = { site_id: 's1', tipo: 'entrevista', realizado_em: '2026-11-01', funcao: 'Operador', turno: 'B' };
    expect(otLevantamentoCriarSchema.safeParse({ ...base, notas: 'usa TeamViewer' }).success).toBe(true);
    expect(otLevantamentoCriarSchema.safeParse({ ...base, notas: 'IHM em 10.0.0.5' }).success).toBe(false);
    expect(otLevantamentoCriarSchema.safeParse({ ...base, notas: 'falar com ana@x.com' }).success).toBe(false);
    expect(otLevantamentoCriarSchema.safeParse({ ...base, nome: 'Ana' }).success).toBe(false);
  });

  it('documento exige título; achado exige evidência sem endereço; envio tem teto', () => {
    expect(otLevantamentoCriarSchema.safeParse({ site_id: 's1', tipo: 'documento', realizado_em: '2026-11-01' }).success).toBe(false);
    expect(otAchadoCriarSchema.safeParse({ dados: { nome: 'Notebook IHM' }, evidencia: 'notebook pessoal ligado à IHM' }).success).toBe(true);
    expect(otAchadoCriarSchema.safeParse({ dados: { nome: 'x' }, evidencia: 'em 10.1.1.1' }).success).toBe(false);
    expect(otEnviarAchadosSchema.safeParse({ achados: [] }).success).toBe(false);
  });
});
