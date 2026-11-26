import { describe, it, expect } from 'vitest';
import { areaEEtapa, condicoesDaBase, faltaParaAvancar } from '../src/services/ot-fase';

// Spec 2026-11-26 §1: a fase do banco fica; área e etapa saem de um mapa puro.
const x = (o: Partial<Parameters<typeof areaEEtapa>[0]> = {}) => ({ fase: 'em_levantamento' as const, obra_ate: null, ativos: 0,
  zonas_4_1_1: false, rascunhos_bloqueiam: 0, lotes_em_revisao: 0, ...o });

describe('areaEEtapa', () => {
  it('sem zonas dos níveis 2, 3 e 4: Implantação, etapa 1 (Cadastrar)', () => {
    expect(areaEEtapa(x())).toEqual({ area: 'implantacao', etapa: 1 });
    expect(areaEEtapa(x({ ativos: 3 }))).toEqual({ area: 'implantacao', etapa: 1 });
  });
  it('zonas ok e nenhum ativo nem rascunho: etapa 2 (Levantar)', () => {
    expect(areaEEtapa(x({ zonas_4_1_1: true }))).toEqual({ area: 'implantacao', etapa: 2 });
  });
  it('rascunho fora da sonda ou lote em revisão: etapa 3 (Revisar), mesmo sem zonas', () => {
    expect(areaEEtapa(x({ zonas_4_1_1: true, ativos: 1, rascunhos_bloqueiam: 2 })).etapa).toBe(3);
    expect(areaEEtapa(x({ zonas_4_1_1: true, ativos: 1, lotes_em_revisao: 1 })).etapa).toBe(3);
  });
  it('tudo pronto ou base pedida: etapa 4 (Aprovar a base)', () => {
    expect(areaEEtapa(x({ zonas_4_1_1: true, ativos: 1 })).etapa).toBe(4);
    expect(areaEEtapa(x({ fase: 'base_em_aprovacao', zonas_4_1_1: true, ativos: 1 }))).toEqual({ area: 'implantacao', etapa: 4 });
  });
  it('em operação: Operação, sem etapa; em obra (ou base pedida com obra): Obra, com a etapa', () => {
    expect(areaEEtapa(x({ fase: 'em_operacao' }))).toEqual({ area: 'operacao', etapa: null });
    expect(areaEEtapa(x({ fase: 'em_obra', obra_ate: '2026-12-20', zonas_4_1_1: true, ativos: 1 }))).toEqual({ area: 'obra', etapa: 4 });
    expect(areaEEtapa(x({ fase: 'base_em_aprovacao', obra_ate: '2026-12-20', zonas_4_1_1: true, ativos: 1 })).area).toBe('obra');
  });
  it('obra com zona faltando (a zona muda na obra, Task 3a.5): Obra, etapa 1; a tela da obra mostra as quatro etapas', () => {
    expect(areaEEtapa(x({ fase: 'em_obra', obra_ate: '2026-12-20', ativos: 1 }))).toEqual({ area: 'obra', etapa: 1 });
  });
});

describe('faltaParaAvancar: só o que falta para sair da etapa atual', () => {
  it('etapa 1: só as zonas (o ativo é da etapa 2)', () => {
    expect(faltaParaAvancar(x())).toEqual(['Faltam zonas nos níveis Purdue 2, 3 e 4']);
  });
  it('etapa 2: só o ativo', () => {
    expect(faltaParaAvancar(x({ zonas_4_1_1: true }))).toEqual(['Nenhum ativo no inventário do site']);
  });
  it('etapa 3: só rascunhos e lotes, mesmo sem zonas', () => {
    expect(faltaParaAvancar(x({ rascunhos_bloqueiam: 2, lotes_em_revisao: 1 }))).toEqual([
      'Há 2 achado(s) em rascunho para revisar', 'Há 1 lote(s) de aprovação em revisão']);
  });
});

describe('condicoesDaBase: a checagem completa, separada', () => {
  it('lista TODAS as condições, na ordem de faltaParaBase hoje (ot-fase.ts:71-76), com o ativo por último', () => {
    expect(condicoesDaBase(x({ rascunhos_bloqueiam: 2, lotes_em_revisao: 1 }))).toEqual([
      'Há 2 achado(s) em rascunho para revisar', 'Há 1 lote(s) de aprovação em revisão',
      'Faltam zonas nos níveis Purdue 2, 3 e 4', 'Nenhum ativo no inventário do site']);
  });
});

describe('falta: casos sem nada', () => {
  it('pronto para pedir a base: lista vazia; em operação: lista vazia', () => {
    expect(faltaParaAvancar(x({ zonas_4_1_1: true, ativos: 1 }))).toEqual([]);
    expect(faltaParaAvancar(x({ fase: 'em_operacao' }))).toEqual([]);
  });
  it('nenhum texto leva nome, IP ou MAC (só contagem)', () => {
    for (const t of faltaParaAvancar(x({ rascunhos_bloqueiam: 1, lotes_em_revisao: 1 }))) expect(t).not.toMatch(/\d+\.\d+\.\d+\.\d+|[0-9a-f]{2}:[0-9a-f]{2}/i);
  });
});
