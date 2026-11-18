import { describe, it, expect } from 'vitest';
import { ETAPAS_COMUNS, FASES_DO_ISO, etapaDaFase, PASSOS_PRIVACY, CRITERIOS_PRIVACY } from '../src/data/programa';
import { etapasDoIso, etapasDoOt, primeiroMarco, ETAPA_DO_PASSO_OT, etapasDoPrivacy, criterioPrivacy, type VisaoDoEncarregado } from '../src/services/programa';
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

const visao = (x: Record<string, unknown> = {}): VisaoDoEncarregado => ({
  encarregados: [], tratamentos: { total: 0, sem_base_legal: 0, sem_responsavel: 0, lia_pendente: 0, dpia_pendente: 0, com_terceiro_vencido: 0 },
  terceiros: { total: 0, sem_tipo: 0, pendentes: 0, vencidos: 0, reprovados: 0, com_pendencia: 0 }, prazos_legais: { nao_definidos: ['titular.resposta'] },
  pedidos_titular: { atrasados: 0 }, incidentes: { comunicacoes_atrasadas: 0 }, lgpd: { carregada: false }, ...x,
}) as unknown as VisaoDoEncarregado;

describe('trilha do n.privacy (7 etapas da skill, derivadas)', () => {
  it('7 passos, ordens 0 a 6, critério da lista fechada, etapa comum e tela conhecida', () => {
    expect(PASSOS_PRIVACY.map((p) => p.ordem).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const p of PASSOS_PRIVACY) expect(CRITERIOS_PRIVACY, p.id).toContain(p.criterio);
    expect(PASSOS_PRIVACY.map((p) => [p.rotulo, p.etapa])).toEqual([['Partida', 'comecar'], ['Encarregado', 'comecar'], ['Inventário', 'levantar'],
      ['Bases e riscos', 'avaliar'], ['Terceiros', 'tratar'], ['Documentos e cobertura', 'tratar'], ['Titular e incidentes', 'operar']]);
  });
  it('projeto vazio: nada feito, Começar, próximo é a Partida', () => {
    const p = etapasDoPrivacy(visao());
    expect(p).toMatchObject({ etapa: 'comecar', feitos: 0, total: 7, proximo: { texto: 'Partida', tela: 'importacao' } });
    expect(p.passos!.every((x) => !x.feito)).toBe(true);
  });
  it('encarregado e inventário completo: Começar e Levantar feitos; a etapa em curso é Avaliar', () => {
    const p = etapasDoPrivacy(visao({ encarregados: [{ id: 'e', nome: 'E', email: null }],
      tratamentos: { total: 3, sem_base_legal: 0, sem_responsavel: 0, lia_pendente: 1, dpia_pendente: 0, com_terceiro_vencido: 0 } }));
    expect(p.etapas.slice(0, 3).map((e) => [e.id, e.feitos, e.total])).toEqual([['comecar', 2, 2], ['levantar', 1, 1], ['avaliar', 0, 1]]);
    expect(p.etapa).toBe('avaliar');
  });
  it('etapa 5 exige os três prazos cadastrados e nada atrasado', () => {
    expect(criterioPrivacy('prazos_e_atrasos', visao({ prazos_legais: { nao_definidos: [] } }))).toBe(true);
    expect(criterioPrivacy('prazos_e_atrasos', visao({ prazos_legais: { nao_definidos: [] }, pedidos_titular: { atrasados: 1 } }))).toBe(false);
    expect(criterioPrivacy('prazos_e_atrasos', visao())).toBe(false);
  });
  it('cobertura só com o catálogo LGPD carregado e sem lacuna', () => {
    expect(criterioPrivacy('cobertura_lgpd', visao({ lgpd: { carregada: true, lacunas: 0, total: 10 } }))).toBe(true);
    expect(criterioPrivacy('cobertura_lgpd', visao({ lgpd: { carregada: false } }))).toBe(false);
    expect(criterioPrivacy('cobertura_lgpd', visao({ lgpd: { carregada: false, lacunas: 0 } }))).toBe(false);
  });
  it('critério desconhecido falha fechado', () => {
    expect(criterioPrivacy('qualquer_coisa', visao({ encarregados: [{}], tratamentos: { total: 9 } }))).toBe(false);
  });
  // Cada critério vira falso/verdadeiro por exatamente o campo que o define (mutação de cada regra).
  it('cada critério: verdadeiro no caso feito, falso quando o campo que o define falha', () => {
    const trat = (x: object) => ({ total: 2, sem_base_legal: 0, sem_responsavel: 0, lia_pendente: 0, dpia_pendente: 0, com_terceiro_vencido: 0, ...x });
    const ter = (x: object) => ({ total: 2, sem_tipo: 0, pendentes: 0, vencidos: 0, reprovados: 0, com_pendencia: 0, ...x });
    const casos: [string, Record<string, unknown>, Record<string, unknown>][] = [
      ['algum_cadastro', { terceiros: ter({}) }, {}],
      ['encarregado', { encarregados: [{}] }, {}],
      ['inventario_completo', { tratamentos: trat({}) }, { tratamentos: trat({ sem_base_legal: 1 }) }],
      ['inventario_completo', { tratamentos: trat({}) }, { tratamentos: trat({ sem_responsavel: 1 }) }],
      ['bases_e_riscos', { tratamentos: trat({}) }, { tratamentos: trat({ lia_pendente: 1 }) }],
      ['bases_e_riscos', { tratamentos: trat({}) }, { tratamentos: trat({ dpia_pendente: 1 }) }],
      ['terceiros_em_dia', { terceiros: ter({}) }, { terceiros: ter({ sem_tipo: 1 }) }],
      ['terceiros_em_dia', { terceiros: ter({}) }, { terceiros: ter({ pendentes: 1 }) }],
      ['terceiros_em_dia', { terceiros: ter({}) }, { terceiros: ter({ vencidos: 1 }) }],
      ['terceiros_em_dia', { terceiros: ter({}) }, { terceiros: ter({ reprovados: 1 }) }],
      ['prazos_e_atrasos', { prazos_legais: { nao_definidos: [] } }, { prazos_legais: { nao_definidos: [] }, incidentes: { comunicacoes_atrasadas: 1 } }],
      ['cobertura_lgpd', { lgpd: { carregada: true, lacunas: 0 } }, { lgpd: { carregada: true, lacunas: 2 } }],
    ];
    for (const [c, ok, ruim] of casos) { expect(criterioPrivacy(c, visao(ok)), c).toBe(true); expect(criterioPrivacy(c, visao(ruim)), c).toBe(false); }
    expect(criterioPrivacy('algum_cadastro', visao())).toBe(false);
    expect(criterioPrivacy('inventario_completo', visao())).toBe(false); // vazio não é completo
    expect(criterioPrivacy('terceiros_em_dia', visao())).toBe(false);
  });
});
