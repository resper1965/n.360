import { describe, it, expect } from 'vitest';
import { ETAPAS_COMUNS, FASES_DO_ISO, etapaDaFase } from '../src/data/programa';
import { etapasDoIso, etapasDoOt, primeiroMarco, ETAPA_DO_PASSO_OT } from '../src/services/programa';
import { obterCatalogo } from '../src/data/passos/catalogo';
import { ENTIDADES } from '../src/data/passos/tipos';
import type { ContextoProjeto, LinhaFase } from '../src/services/passos/contexto';

const ctx = (fases: [number, LinhaFase][] = [], checados: { fase: number; id: string }[] = []): ContextoProjeto => ({
  progresso: new Map(checados.map(({ fase, id }) => [id, { phase_number: fase, item_id: id, is_checked: 1, checked_at: '2026-11-01 10:00:00', evidence_id: null, notes: null,
    assigned_to: null, due_date: null, bloqueio_motivo: null, bloqueio_responsavel: null, bloqueado_em: null, excecao_motivo: null, excecao_por: null, excecao_em: null }])),
  respostas: new Map(), evidencias: new Set(), trilhas: new Set(), pedidos: new Map(), fases: new Map(fases),
  entidades: Object.fromEntries(ENTIDADES.map((e) => [e, 0])) as ContextoProjeto['entidades'],
});
const todasAsFases = (status = 'pending', legado: string | null = null): [number, LinhaFase][] => Array.from({ length: 41 }, (_, n) => [n, { status, legado_status: legado }]);

describe('fronteira do n.iso (decisão 6)', () => {
  it('cada fase de 0 a 40 cai em exatamente uma etapa, e nada fora disso', () => {
    for (let f = 0; f <= 40; f++) {
      const em = ETAPAS_COMUNS.filter(({ id }) => f >= FASES_DO_ISO[id][0] && f <= FASES_DO_ISO[id][1]);
      expect(em.length, `fase ${f}`).toBe(1);
      expect(etapaDaFase(f), `fase ${f}`).toBe(em[0].id);
    }
    for (const f of [-1, 41, 99]) expect(etapaDaFase(f)).toBeNull();
  });
  it('os valores da spec: Começar 0-6, Levantar 7-8, Avaliar 9-10, Tratar 11-28, Operar 29-40', () => {
    expect(FASES_DO_ISO).toEqual({ comecar: [0, 6], levantar: [7, 8], avaliar: [9, 10], tratar: [11, 28], operar: [29, 40] });
    expect(ETAPAS_COMUNS.map((e) => e.rotulo)).toEqual(['Começar', 'Levantar', 'Avaliar', 'Tratar', 'Operar']);
  });
  it('toda fase do catálogo de passos tem etapa', () => {
    expect(obterCatalogo().fases.filter((f) => etapaDaFase(f.numero) === null)).toEqual([]);
  });
});

describe('etapasDoIso (puro)', () => {
  it('sem fases carregadas: Começar, 0 de 41, e o próximo é carregar as fases', () => {
    const p = etapasDoIso(obterCatalogo(), ctx());
    expect(p).toMatchObject({ etapa: 'comecar', feitos: 0, total: 41, proximo: { texto: 'Carregar as fases da jornada', tela: 'project-detail' } });
    expect(p.etapas.map((e) => [e.id, e.total])).toEqual([['comecar', 7], ['levantar', 2], ['avaliar', 2], ['tratar', 18], ['operar', 12]]);
  });
  it('fase concluída pelo select antigo (legado_status) conta como feita sem materializar (o GET da Bancada é quem grava)', () => {
    const fases = todasAsFases();
    fases[0] = [0, { status: 'completed', legado_status: 'completed' }];
    fases[1] = [1, { status: 'skipped', legado_status: 'skipped' }];
    const p = etapasDoIso(obterCatalogo(), ctx(fases));
    expect(p.etapas[0]).toMatchObject({ id: 'comecar', feitos: 2, total: 7 });
    expect(p.etapa).toBe('comecar');
    expect(p.proximo).toMatchObject({ tela: 'project-detail' });
    expect(p.proximo?.texto).toMatch(/^Fase \d+: /);
  });
  it('Começar inteiro feito (passos marcados nas fases 0-6): a etapa em curso é Levantar', () => {
    const cat = obterCatalogo();
    const checados = cat.passos.filter((x) => x.fase <= 6).map((x) => ({ fase: x.fase, id: x.id }));
    const p = etapasDoIso(cat, ctx(todasAsFases(), checados));
    expect(p.etapas[0]).toMatchObject({ feitos: 7, total: 7 });
    expect(p.etapa).toBe('levantar');
    expect(p.feitos).toBe(7);
  });
});

describe('etapasDoOt (puro)', () => {
  it('todo próximo passo do site tem etapa', () => {
    expect(Object.keys(ETAPA_DO_PASSO_OT).sort()).toEqual(['aguardar_base', 'aguardar_lote', 'comecar', 'em_operacao', 'pedir_base', 'revalidar', 'revisar']);
  });
  it('sem site: Começar, 0 de 0, cadastrar o primeiro site; nenhum nome de site em lugar nenhum', () => {
    const p = etapasDoOt([]);
    expect(p).toMatchObject({ etapa: 'comecar', feitos: 0, total: 0, proximo: { texto: 'Cadastrar o primeiro site', tela: 'ot', aba: 'sites' } });
  });
  it('a etapa do módulo é a do site mais atrasado; em operação com desvio aberto é Tratar', () => {
    const p = etapasDoOt([{ proximo_passo: 'em_operacao', desvios_abertos: 1 }, { proximo_passo: 'pedir_base', desvios_abertos: 0 }]);
    expect(p.etapa).toBe('avaliar');
    expect(p.total).toBe(2);
    expect(p.feitos).toBe(0); // em operação sem desvio = feito; com desvio ainda é Tratar
    expect(p.proximo).toEqual({ texto: 'Pedir a aprovação da base', tela: 'ot', aba: 'sites' });
    expect(etapasDoOt([{ proximo_passo: 'em_operacao', desvios_abertos: 2 }])).toMatchObject({ etapa: 'tratar', proximo: { texto: 'Tratar os desvios abertos' } });
    expect(etapasDoOt([{ proximo_passo: 'revalidar', desvios_abertos: 0 }])).toMatchObject({ etapa: 'operar', feitos: 1, total: 1 });
  });
});

describe('primeiroMarco', () => {
  it('a menor data, ignorando vazios', () => {
    expect(primeiroMarco(null, '2026-05-04 10:00:00', '2026-03-10T10:00:00Z')).toBe('2026-03-10T10:00:00Z');
    expect(primeiroMarco(null, undefined)).toBeNull();
  });
});
