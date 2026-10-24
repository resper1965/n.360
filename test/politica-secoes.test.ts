import { describe, it, expect } from 'vitest';
import { montarEsqueleto, lerSecoes, trocarSecao, conferirSecao, MARCA_A_GERAR, AVISO_INCOMPLETA } from '../src/services/politica-secoes';

describe('seções da política', () => {
  const base = montarEsqueleto('POL-IAM-001 Controle de Acesso', ['Objetivo', 'Escopo', 'Diretrizes']);
  it('esqueleto com título e seções a gerar', () => {
    expect(base.startsWith('# POL-IAM-001 Controle de Acesso\n')).toBe(true);
    expect(lerSecoes(base).map((s) => [s.n, s.titulo, s.situacao])).toEqual([[1, 'Objetivo', 'a_gerar'], [2, 'Escopo', 'a_gerar'], [3, 'Diretrizes', 'a_gerar']]);
  });
  it('trocar uma seção preserva as outras, inclusive edição à mão', () => {
    const editado = base.replace(`## 2. Escopo\n\n${MARCA_A_GERAR}`, '## 2. Escopo\n\nTexto que o consultor escreveu.\n\n### 2.1 Sub');
    const r = trocarSecao(editado, 1, 'Proteger o acesso.')!;
    expect(lerSecoes(r)[0]).toMatchObject({ corpo: 'Proteger o acesso.', situacao: 'pronta' });
    expect(lerSecoes(r)[1].corpo).toBe('Texto que o consultor escreveu.\n\n### 2.1 Sub');
    expect(trocarSecao(base, 9, 'x')).toBeNull();
  });
  it('seção incompleta é reconhecida', () => {
    expect(lerSecoes(trocarSecao(base, 3, `Parte.\n\n${AVISO_INCOMPLETA}`)!)[2].situacao).toBe('incompleta');
  });
  it('conferência', () => {
    expect(conferirSecao('')).toMatch(/vazia/);
    expect(conferirSecao('A [Organization Name] deve')).toMatch(/marcador/);
    expect(conferirSecao('Aplica-se a {{policy_owner}}')).toMatch(/marcador/);
    expect(conferirSecao('## 4. Outra seção\nTexto')).toMatch(/título/);
    expect(conferirSecao('A empresa controla o acesso.')).toBeNull();
  });
});
