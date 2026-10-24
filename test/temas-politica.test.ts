import { describe, it, expect } from 'vitest';
import { TEMAS_POLITICA, ESQUELETO_PADRAO, ESQUELETO_PSI, esqueletoDo } from '../src/data/temas-politica';
import { ISO_27001_2022 } from '../src/data/iso27001-2022';

describe('catálogo de temas', () => {
  const codigos = new Set(ISO_27001_2022.map((c) => c.code));
  it('todo controle do catálogo existe no Anexo A', () => {
    for (const t of TEMAS_POLITICA) for (const c of t.controles) expect(codigos.has(c), `${t.codigo} ${c}`).toBe(true);
  });
  it('códigos únicos, uma PSI só', () => {
    expect(new Set(TEMAS_POLITICA.map((t) => t.codigo)).size).toBe(TEMAS_POLITICA.length);
    expect(TEMAS_POLITICA.filter((t) => t.psi).length).toBe(1);
  });
  it('esqueletos', () => {
    expect(ESQUELETO_PADRAO).toEqual(['Objetivo', 'Escopo', 'Referências', 'Papéis e responsabilidades', 'Diretrizes', 'Exceções', 'Conformidade e sanções', 'Revisão', 'Controle do documento']);
    expect(ESQUELETO_PSI).toEqual(['Propósito', 'Compromissos da direção', 'Objetivos de segurança da informação e privacidade', 'Papéis e responsabilidades', 'Políticas específicas', 'Revisão', 'Controle do documento']);
    expect(esqueletoDo({ psi: true })).toBe(ESQUELETO_PSI);
  });
});
