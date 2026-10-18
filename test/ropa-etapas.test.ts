import { describe, it, expect } from 'vitest';
import { situacaoDaEtapa, type DadosDaEtapa } from '../src/services/ropa-abas/etapas';

/** Situação derivada de cada etapa (função pura, spec 5). Uma linha por caso. */
const base = (o: Partial<DadosDaEtapa>): DadosDaEtapa => ({
  etapa: 'coleta', naoAplicavel: false, descricao: 'Descrição exemplo', ativos: [{ local_armazenamento: null }], areas: 0, parceiros: 0,
  titularesDaColeta: [{ titular_id: 't1', dados: 1 }], titularesDaEtapa: [], prazo: null, descarte: null,
  armazenamento: { naoAplicavel: false, ativos: 0 }, ...o,
});

describe('situação derivada da etapa', () => {
  it('Coleta concluída com descrição, titular com dado e ativo', () => {
    expect(situacaoDaEtapa(base({}))).toEqual({ etapa: 'coleta', situacao: 'concluida', faltas: [] });
  });
  it('Coleta sem descrição: pendente', () => {
    expect(situacaoDaEtapa(base({ descricao: '  ' }))).toMatchObject({ situacao: 'pendente', faltas: ['descrição'] });
  });
  it('Coleta com titular sem dado: pendente', () => {
    expect(situacaoDaEtapa(base({ titularesDaColeta: [{ titular_id: 't1', dados: 0 }] })).faltas).toContain('dados de cada titular');
  });
  it('Coleta sem titular: pendente', () => {
    expect(situacaoDaEtapa(base({ titularesDaColeta: [] })).faltas).toContain('ao menos um titular');
  });
  it('Uso concluída com todo titular da Coleta definido', () => {
    expect(situacaoDaEtapa(base({ etapa: 'uso', titularesDaEtapa: [{ titular_id: 't1', situacao: 'definido', dados: 1 }] })).situacao).toBe('concluida');
  });
  it('Uso com titular pendente: pendente', () => {
    expect(situacaoDaEtapa(base({ etapa: 'uso', titularesDaEtapa: [] })).faltas).toContain('titulares da Coleta');
  });
  it('titular "nao_usa" conta como definido', () => {
    expect(situacaoDaEtapa(base({ etapa: 'uso', titularesDaEtapa: [{ titular_id: 't1', situacao: 'nao_usa', dados: 0 }] })).situacao).toBe('concluida');
  });
  it('Uso sem Coleta com titulares: pede a Coleta', () => {
    expect(situacaoDaEtapa(base({ etapa: 'uso', titularesDaColeta: [] })).faltas).toContain('defina os titulares na Coleta');
  });
  it('Compartilhamento Interno sem área: pendente', () => {
    expect(situacaoDaEtapa(base({ etapa: 'compartilhamento_interno', areas: 0 })).faltas).toContain('ao menos uma área');
  });
  it('Compartilhamento Externo sem parceiro: pendente', () => {
    expect(situacaoDaEtapa(base({ etapa: 'compartilhamento_externo', parceiros: 0 })).faltas).toContain('ao menos um parceiro');
  });
  it('Armazenamento com ativo sem local: pendente', () => {
    expect(situacaoDaEtapa(base({ etapa: 'armazenamento', ativos: [{ local_armazenamento: null }] })).faltas).toContain('local de armazenamento de cada ativo');
  });
  it('Eliminação sem prazo ou descarte: pendente', () => {
    const r = situacaoDaEtapa(base({ etapa: 'eliminacao', ativos: [], armazenamento: { naoAplicavel: false, ativos: 1 } }));
    expect(r.faltas).toEqual(expect.arrayContaining(['prazo', 'descarte']));
  });
  it('Eliminação com Armazenamento Não Aplicável não exige ativos', () => {
    const r = situacaoDaEtapa(base({ etapa: 'eliminacao', ativos: [], prazo: '5 anos', descarte: 'Exclusão', armazenamento: { naoAplicavel: true, ativos: 0 }, titularesDaEtapa: [{ titular_id: 't1', situacao: 'definido', dados: 1 }] }));
    expect(r.situacao).toBe('concluida');
  });
  it('etapa Não Aplicável: nao_aplicavel, sem faltas, mesmo vazia', () => {
    expect(situacaoDaEtapa(base({ etapa: 'compartilhamento_externo', naoAplicavel: true, descricao: null, ativos: [], parceiros: 0, titularesDaColeta: [] })))
      .toEqual({ etapa: 'compartilhamento_externo', situacao: 'nao_aplicavel', faltas: [] });
  });
});
