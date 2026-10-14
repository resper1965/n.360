import { describe, it, expect } from 'vitest';
import { PERGUNTAS_IMPACTO, recomendarRipd, type RespostaImpacto } from '../src/services/impacto';

describe('catálogo do teste de impacto', () => {
  it('tem 2 perguntas de critério geral e 11 de critério específico, com id estável e texto', () => {
    expect(PERGUNTAS_IMPACTO.filter((p) => p.grupo === 'geral').map((p) => p.id)).toEqual(['afeta_direitos', 'larga_escala']);
    expect(PERGUNTAS_IMPACTO.filter((p) => p.grupo === 'especifico').map((p) => p.id)).toEqual([
      'sensiveis', 'vulneraveis', 'finalidade_distinta', 'compartilhamento_novo', 'monitoramento', 'perfilizacao',
      'combinacao', 'transferencia', 'tecnologia_inovadora', 'decisao_automatizada', 'legitimo_interesse',
    ]);
    expect(PERGUNTAS_IMPACTO.every((p) => p.texto.length > 20)).toBe(true);
  });
});

describe('recomendarRipd', () => {
  const todas = (v: RespostaImpacto) => Object.fromEntries(PERGUNTAS_IMPACTO.map((p) => [p.id, v])) as Record<string, RespostaImpacto>;
  it('um critério geral E um específico marcados recomendam o RIPD e listam os motivos', () => {
    const r = recomendarRipd({ ...todas('nao'), larga_escala: 'sim', sensiveis: 'sim', monitoramento: 'sim' });
    expect(r).toEqual({ resultado: 'recomendado', motivos: ['larga_escala', 'sensiveis', 'monitoramento'] });
  });
  it('só específico, ou só geral, não basta para recomendar', () => {
    expect(recomendarRipd({ ...todas('nao'), sensiveis: 'sim' })).toEqual({ resultado: 'dispensavel_a_confirmar', motivos: [] });
    expect(recomendarRipd({ ...todas('nao'), larga_escala: 'sim' })).toEqual({ resultado: 'dispensavel_a_confirmar', motivos: [] });
  });
  it('tudo respondido sem geral E específico deixa dispensável, mas a confirmação é humana', () => {
    expect(recomendarRipd(todas('nao')).resultado).toBe('dispensavel_a_confirmar');
  });
  it('pergunta sem resposta ou "não sei" deixa incompleto, salvo quando já há geral e específico', () => {
    expect(recomendarRipd({ sensiveis: 'nao' }).resultado).toBe('incompleto');
    expect(recomendarRipd(todas('nao_sei')).resultado).toBe('incompleto');
    expect(recomendarRipd({ ...todas('nao_sei'), larga_escala: 'sim', perfilizacao: 'sim' }).resultado).toBe('recomendado');
  });
});
