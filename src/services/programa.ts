import { ETAPAS_COMUNS, etapaDaFase, type EtapaComum } from '../data/programa';
import type { Catalogo } from '../data/passos/tipos';
import { montarBancada } from './passos/estado';
import { obterCatalogo } from '../data/passos/catalogo';
import { carregarContexto, type ContextoProjeto } from './passos/contexto';
import { situacaoDoSite, type ProximoPasso } from './ot-fase';
import { sitesPermitidos } from './ot-inventario';
import type { AtorPainelOt } from './painel-ot';
import type { Modulo } from '../modulos';

// Onda 4: a régua comum de cada módulo, derivada do que já existe. SÓ LÊ (as funções daqui são puras; a que lê o banco é
// `etapasDoPrograma`, que usa só leituras). Nenhum número da onda 2 sai daqui.

export type ResumoDaEtapa = { id: EtapaComum; rotulo: string; feitos: number; total: number };
export type ProximoDoPrograma = { texto: string; tela: string; aba?: string; fase?: number; passo?: string };
export type PassoDaTrilha = { id: string; ordem: number; rotulo: string; etapa: EtapaComum; feito: boolean; tela: string; acao: string };
export type ProgramaDoModulo = { etapa: EtapaComum; feitos: number; total: number; proximo: ProximoDoPrograma | null; etapas: ResumoDaEtapa[]; passos?: PassoDaTrilha[] };

const ORDEM: readonly EtapaComum[] = ETAPAS_COMUNS.map((e) => e.id);
const indice = (e: EtapaComum) => ORDEM.indexOf(e);
const soma = (xs: number[]) => xs.reduce((t, n) => t + n, 0);

/** O primeiro marco entre fontes (SQL do painel, base aprovada do n.ot): a menor data; vazios não contam. */
export const primeiroMarco = (...marcos: (string | null | undefined)[]): string | null => marcos.filter((m): m is string => !!m).sort()[0] ?? null;

/** n.iso: as fases do catálogo agrupadas por `FASES_DO_ISO`. A etapa em curso é a primeira com fase por fazer. */
export function etapasDoIso(cat: Catalogo, ctx: ContextoProjeto): ProgramaDoModulo {
  const b = montarBancada(cat, ctx);
  const situacao = new Map(b.fases.map((f) => [f.numero, f.situacao]));
  // Fase que o select antigo deu por concluída ou dispensada e ainda não foi materializada (quem grava é o GET da Bancada): feita.
  const feita = (n: number) => situacao.get(n) === 'completed' || ['completed', 'skipped'].includes(ctx.fases.get(n)?.legado_status ?? '');
  const etapas = ETAPAS_COMUNS.map(({ id, rotulo }) => {
    const fs = cat.fases.filter((f) => etapaDaFase(f.numero) === id);
    return { id, rotulo, feitos: fs.filter((f) => feita(f.numero)).length, total: fs.length };
  });
  const titulo = (n: number) => cat.fases.find((f) => f.numero === n)?.titulo ?? `Fase ${n}`;
  const proximo: ProximoDoPrograma | null = !b.tem_fases ? { texto: 'Carregar as fases da jornada', tela: 'project-detail' }
    : b.continuar ? { texto: `Fase ${b.continuar.fase}: ${titulo(b.continuar.fase)}`, tela: 'project-detail', fase: b.continuar.fase, passo: b.continuar.passo } : null;
  return { etapa: etapas.find((e) => e.feitos < e.total)?.id ?? 'operar', feitos: soma(etapas.map((e) => e.feitos)), total: soma(etapas.map((e) => e.total)), proximo, etapas };
}

/** n.ot: o próximo passo do site (`situacaoDoSite`) na etapa comum. Em operação com desvio aberto, o site está em Tratar. */
export const ETAPA_DO_PASSO_OT: Record<ProximoPasso, EtapaComum> = {
  comecar: 'comecar', revisar: 'levantar', aguardar_lote: 'levantar', pedir_base: 'avaliar', aguardar_base: 'avaliar', em_operacao: 'operar', revalidar: 'operar',
};
const TEXTO_OT: Record<ProximoPasso, string> = {
  comecar: 'Começar o levantamento do site', revisar: 'Revisar os achados do levantamento', aguardar_lote: 'Revisar o lote de aprovação',
  pedir_base: 'Pedir a aprovação da base', aguardar_base: 'Aprovar a base do site', em_operacao: 'Acompanhar a operação', revalidar: 'Revalidar os ativos',
};
export type SiteNoPrograma = { proximo_passo: ProximoPasso; desvios_abertos: number };

/**
 * Unidade do n.ot é o site: a etapa do módulo é a do site mais atrasado; feito = site em operação sem desvio aberto. Nunca leva nome de site.
 * `sitesPermitidos` já vem FILTRADO pelo chamador (`sitesPermitidos()` de ot-inventario, P0-4): esta função não filtra nada.
 */
export function etapasDoOt(sitesPermitidos: SiteNoPrograma[]): ProgramaDoModulo {
  const sites = sitesPermitidos;
  const etapaDe = (s: SiteNoPrograma): EtapaComum => {
    const e = ETAPA_DO_PASSO_OT[s.proximo_passo] ?? 'comecar';
    return e === 'operar' && s.desvios_abertos > 0 ? 'tratar' : e;
  };
  const doSite = sites.map(etapaDe);
  const etapas = ETAPAS_COMUNS.map(({ id, rotulo }) => ({ id, rotulo, total: sites.length,
    feitos: doSite.filter((e) => indice(e) > indice(id) || (id === 'operar' && e === 'operar')).length }));
  if (!sites.length) return { etapa: 'comecar', feitos: 0, total: 0, proximo: { texto: 'Cadastrar o primeiro site', tela: 'ot', aba: 'sites' }, etapas };
  const i = doSite.reduce((m, e, k) => (indice(e) < indice(doSite[m]) ? k : m), 0);
  const texto = doSite[i] === 'tratar' ? 'Tratar os desvios abertos' : TEXTO_OT[sites[i].proximo_passo];
  return { etapa: doSite[i], feitos: doSite.filter((e) => e === 'operar').length, total: sites.length, proximo: { texto, tela: 'ot', aba: 'sites' }, etapas };
}

export type LidosDoPainel = { otAtor?: AtorPainelOt | null };

/**
 * `programa.etapas` do GET /painel (onda 4, decisão 7). SÓ LÊ: `carregarContexto` + `montarBancada`, nunca a rota da Bancada, cujo
 * GET grava (`materializarLegado`, `gravarSituacoes`). O n.ot entra só com `otAtor`, que o painel passa apenas quando montou o bloco
 * `ot` (módulo no projeto E na pessoa; nunca agente nem chave: P0-1/P0-2); os sites vêm de `sitesPermitidos` (P0-4).
 */
export async function etapasDoPrograma(db: D1Database, projectId: string, modulos: readonly Modulo[], lidos: LidosDoPainel = {}): Promise<Partial<Record<Modulo, ProgramaDoModulo>>> {
  const r: Partial<Record<Modulo, ProgramaDoModulo>> = {};
  if (modulos.includes('iso')) r.iso = etapasDoIso(obterCatalogo(), await carregarContexto(db, projectId));
  const a = lidos.otAtor;
  if (modulos.includes('ot') && a && a.agente !== true && !a.id.startsWith('apikey:')) {
    const sites = JSON.parse(await sitesPermitidos(db, a, projectId)) as string[];
    // shortcut: uma situacaoDoSite por site (6 consultas cada); trocar por consulta agregada se um projeto passar de ~50 sites
    const [situacoes, desvios] = await Promise.all([
      Promise.all(sites.map((id) => situacaoDoSite(db, projectId, id))),
      db.prepare(`SELECT site_id, count(*) AS n FROM ot_desvios WHERE project_id = ? AND situacao = 'aberto' AND site_id IN (SELECT value FROM json_each(?)) GROUP BY site_id`)
        .bind(projectId, JSON.stringify(sites)).all<{ site_id: string; n: number }>(),
    ]);
    const porSite = new Map(desvios.results.map((d) => [d.site_id, Number(d.n)]));
    r.ot = etapasDoOt(situacoes.flatMap((s, i) => (s ? [{ proximo_passo: s.proximo_passo, desvios_abertos: porSite.get(sites[i]) ?? 0 }] : [])));
  }
  return r;
}
