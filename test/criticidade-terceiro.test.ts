import { describe, it, expect } from 'vitest';
import { nivelDaCriticidade, tipoDaCriticidade, RESPOSTAS_CRITICIDADE, type RespostasCriticidade } from '../src/services/criticidade';

/** Criticidade do fornecedor: o pior critério manda; o nível define o tipo, exceto grande_provedor (escolha manual). */
const base: RespostasCriticidade = {
  impacto: 'baixo', exclusividade: 'varias_alternativas', risco_financeiro: 'baixo', conformidade: 'sem_regulamentacao', risco_reputacional: 'baixo',
};
const com = (k: keyof RespostasCriticidade, v: string) => ({ ...base, [k]: v }) as RespostasCriticidade;

describe('nivelDaCriticidade', () => {
  it('tudo baixo é Baixo', () => {
    expect(nivelDaCriticidade(base)).toBe('baixo');
  });
  it('qualquer Médio sem Alto dá Médio', () => {
    expect(nivelDaCriticidade(com('impacto', 'medio'))).toBe('medio');
    expect(nivelDaCriticidade(com('exclusividade', 'poucas_alternativas'))).toBe('medio');
    expect(nivelDaCriticidade(com('risco_financeiro', 'medio'))).toBe('medio');
    expect(nivelDaCriticidade(com('risco_reputacional', 'medio'))).toBe('medio');
  });
  it('qualquer Alto manda sobre os demais', () => {
    expect(nivelDaCriticidade(com('impacto', 'alto'))).toBe('alto');
    expect(nivelDaCriticidade({ ...com('impacto', 'medio'), exclusividade: 'sem_alternativas' })).toBe('alto');
    expect(nivelDaCriticidade(com('risco_financeiro', 'alto'))).toBe('alto');
    expect(nivelDaCriticidade(com('conformidade', 'regulamentado'))).toBe('alto');
    expect(nivelDaCriticidade(com('risco_reputacional', 'alto'))).toBe('alto');
  });
  it('conformidade regulamentada conta como Alto; não regulamentada, como Baixo', () => {
    expect(nivelDaCriticidade(com('conformidade', 'sem_regulamentacao'))).toBe('baixo');
  });
  it('tabela de respostas tem os rótulos de cada bloco', () => {
    expect(RESPOSTAS_CRITICIDADE.impacto).toEqual(['alto', 'medio', 'baixo']);
    expect(RESPOSTAS_CRITICIDADE.exclusividade).toEqual(['sem_alternativas', 'poucas_alternativas', 'varias_alternativas']);
    expect(RESPOSTAS_CRITICIDADE.conformidade).toEqual(['regulamentado', 'sem_regulamentacao']);
  });
});

describe('tipoDaCriticidade', () => {
  it('Alto vira crítico, Médio vira médio, Baixo vira pequeno', () => {
    expect(tipoDaCriticidade('alto', null)).toBe('critico');
    expect(tipoDaCriticidade('medio', null)).toBe('medio');
    expect(tipoDaCriticidade('baixo', null)).toBe('pequeno');
  });
  it('refazer a avaliação troca o tipo anterior', () => {
    expect(tipoDaCriticidade('alto', 'pequeno')).toBe('critico');
    expect(tipoDaCriticidade('baixo', 'critico')).toBe('pequeno');
  });
  it('grande_provedor nunca é trocado automaticamente', () => {
    expect(tipoDaCriticidade('alto', 'grande_provedor')).toBe('grande_provedor');
    expect(tipoDaCriticidade('baixo', 'grande_provedor')).toBe('grande_provedor');
  });
});
