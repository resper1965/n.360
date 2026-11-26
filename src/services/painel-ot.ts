import { ehConsultor, ehPapelCliente } from '../helpers';
import { adminDireto } from './organizacao';
import { gestorArciberDireto, podeVerCompleto, sitesPermitidos, TETO_LEITURA_OT, type AtorOt } from './ot-inventario';
import { areaEEtapa, proximoPassoDe, sitesComZonas411, type Area, type Fase } from './ot-fase';
import { TEXTO_OT, type SiteNoPrograma } from './programa';
import { situacaoSensor, type Cred } from './ot-sensor';
import type { ItemFazer, Passo, Proximo, Saude } from './painel';
import { quadrosOt } from './painel-ot-quadros';

/**
 * Bloco do n.ot no painel de entrada (onda 0, spec 2026-11-14-onda0). Só contagem de pendência e nome de site: nunca IP, MAC,
 * nome de ativo ou de sonda, nem contagem de ativos ou achados (seria oráculo do inventário). Limitado aos sites da pessoa.
 * No `?modulo=ot` (Painel do n.ot, spec 2026-11-19) a resposta sai por papel em `respostaDoOt`.
 */
export type AtorPainelOt = AtorOt & { client_project_id?: string | null };
/** Quem lê o Painel do n.ot (spec 2026-11-19, decisões 1, 3 e 4): Gestor ARCiber e equipe, técnico por site, leitor. */
export type PapelPainelOt = 'gestor' | 'equipe' | 'tecnico' | 'leitor';
export type EstadoSonda = 'em_dia' | 'atrasada' | 'parada';
/** Uma linha do quadro "Por site": nome de site e contagens (P0-6). `sonda` só existe para quem abre a rota de sonda (`podeVerCompleto`). */
export type LinhaSiteOt = { id: string; nome: string; fase: string; area: Area; etapa: 1 | 2 | 3 | 4 | null; proximo: string; desvios_abertos: number; revalidar_em: string | null; obra_ate: string | null; sonda?: EstadoSonda | null };

const DIA_MS = 86_400_000;
const plural = (q: number, um: string, varios: string) => `${q} ${q === 1 ? um : varios}`;
const exemplos = (nomes: string[]) => nomes.slice(0, 3).join(', ') + (nomes.length > 3 ? ` e mais ${nomes.length - 3}` : '');
const PIOR_SONDA: EstadoSonda[] = ['parada', 'atrasada', 'em_dia'];

export async function blocoOt(db: D1Database, projectId: string, ator: AtorPainelOt, dia: string, agora: Date, detalhe = false) {
  const sites = await sitesPermitidos(db, ator, projectId);
  const em7 = new Date(Date.parse(dia) + 7 * DIA_MS).toISOString().slice(0, 10);
  // Mesmo critério da tela do módulo (ot-inicio.js, pendenciasDoPapel). Gestor: org_admin do projeto ou o admin direto designado Gestor ARCiber. Aprova: org_admin, consultor e admin direto; a tela tira o consultoria_admin
  // (o servidor, em podeAprovar, o aceita no projeto designado: divergência registrada, vale a tela). Agente e chave de API nunca.
  const pessoa = ator.agente !== true && !ator.id.startsWith('apikey:');
  const gestor = (ator.role === 'org_admin' && ator.client_project_id === projectId) || (pessoa && await gestorArciberDireto(db, ator, projectId));
  const aprova = pessoa && (ator.role === 'org_admin' || ehConsultor(ator) || await adminDireto(db, ator, projectId));
  // Sondas (item e coluna Sonda): só quem abre a rota de sonda (`podeVerCompleto`, como `/sites/:sid/sensores` em routes/ot.ts).
  // Com `podeEditarOt`, o platform_admin e o consultoria_admin não designado viam um número que não abrem (spec 2026-11-19).
  const veSondas = await podeVerCompleto(db, ator, projectId);
  const papel: PapelPainelOt = gestor ? 'gestor' : ator.role === 'org_user' ? 'tecnico' : ehPapelCliente(ator) ? 'leitor' : 'equipe';
  const NO_SITE = 'site_id IN (SELECT value FROM json_each(?2))';
  const [sts, cont, sondas, creds, rasc, lotesRev, zonas, conteudo, revalid, desv, ativosPorSite] = await db.batch([
    db.prepare(`SELECT id, nome, fase, substr(obra_ate, 1, 10) AS obra_ate, base_aprovada_em FROM ot_sites
      WHERE project_id = ?1 AND status = 'ativo' AND id IN (SELECT value FROM json_each(?2)) ORDER BY nome LIMIT ${TETO_LEITURA_OT}`).bind(projectId, sites),
    db.prepare(`SELECT
        (SELECT count(*) FROM ot_desvios WHERE project_id = ?1 AND ${NO_SITE} AND situacao = 'aberto') AS desvios,
        (SELECT count(*) FROM ot_desvios WHERE project_id = ?1 AND ${NO_SITE} AND situacao = 'aberto'
          AND site_id NOT IN (SELECT id FROM ot_sites WHERE project_id = ?1 AND obra_ate IS NOT NULL)) AS desvios_fora_de_obra,
        (SELECT count(*) FROM ot_lotes WHERE project_id = ?1 AND ${NO_SITE} AND status = 'em_revisao' AND criado_por IS NOT ?5) AS lotes,
        (SELECT count(*) FROM ot_desvios WHERE project_id = ?1 AND ${NO_SITE} AND situacao = 'aceito' AND substr(aceito_ate, 1, 10) <= ?3) AS aceites,
        (SELECT CASE WHEN count(DISTINCT site_id) = 1 THEN min(site_id) END FROM ot_desvios WHERE project_id = ?1 AND ${NO_SITE} AND situacao = 'aceito' AND substr(aceito_ate, 1, 10) <= ?3) AS aceites_site,
        (SELECT count(*) FROM ot_avaliacoes WHERE project_id = ?1 AND proxima_revisao IS NOT NULL AND proxima_revisao < ?4) AS revisoes`)
      .bind(projectId, sites, em7, dia, ator.id),
    db.prepare(`SELECT s.id, s.site_id, s.created_at,
        (SELECT created_at FROM ot_sensor_envios e WHERE e.sensor_id = s.id AND e.situacao = 'concluido' ORDER BY e.created_at DESC LIMIT 1) AS ultimo_envio
      FROM ot_sensores s WHERE s.project_id = ?1 AND s.situacao = 'ativa' AND s.${NO_SITE} LIMIT ${TETO_LEITURA_OT}`).bind(projectId, sites),
    db.prepare(`SELECT sensor_id, expira_em, situacao FROM ot_sensor_credenciais WHERE project_id = ?1 AND situacao = 'ativa' AND expira_em > ?2 LIMIT ${TETO_LEITURA_OT}`)
      .bind(projectId, agora.toISOString()),
    // Para a régua do programa (onda 4): o que `situacaoDoSite` leria site a site, em lote e sobre OS MESMOS sites (mesmo teto), no mesmo batch.
    db.prepare(`SELECT l.site_id, count(*) AS n FROM ot_achados a JOIN ot_levantamentos l ON l.id = a.levantamento_id AND l.project_id = a.project_id
      WHERE a.project_id = ?1 AND l.status = 'ativo' AND a.situacao = 'rascunho' AND a.chave_sensor IS NULL AND l.site_id IN (SELECT value FROM json_each(?2)) GROUP BY l.site_id`).bind(projectId, sites),
    db.prepare(`SELECT site_id, count(*) AS n FROM ot_lotes WHERE project_id = ?1 AND status = 'em_revisao' AND ${NO_SITE} GROUP BY site_id`).bind(projectId, sites),
    db.prepare(sitesComZonas411('site_id IN (SELECT value FROM json_each(?))')).bind(projectId, sites),
    db.prepare(`SELECT site_id FROM ot_levantamentos WHERE project_id = ?1 AND status = 'ativo' AND ${NO_SITE} UNION
      SELECT site_id FROM ot_ativos WHERE project_id = ?1 AND status = 'ativo' AND ${NO_SITE}`).bind(projectId, sites),
    db.prepare(`SELECT site_id, date(min(ultima_verificacao_em), '+24 months') AS em FROM ot_ativos
      WHERE project_id = ?1 AND status = 'ativo' AND no_arciber = 1 AND ${NO_SITE} GROUP BY site_id`).bind(projectId, sites),
    db.prepare(`SELECT site_id, count(*) AS n FROM ot_desvios WHERE project_id = ?1 AND situacao = 'aberto' AND ${NO_SITE} GROUP BY site_id`).bind(projectId, sites),
    // Área e etapa por site (spec 2026-11-26 §1): a etapa 2 olha se há ativo; uma consulta agrupada, constante (não cresce com os sites).
    db.prepare(`SELECT site_id, count(*) AS n FROM ot_ativos WHERE project_id = ?1 AND status = 'ativo' AND ${NO_SITE} GROUP BY site_id`).bind(projectId, sites),
  ]);
  const lista = sts.results as { id: string; nome: string; fase: string; obra_ate: string | null; base_aprovada_em: string | null }[];
  const c = cont.results[0] as { desvios: number; desvios_fora_de_obra: number; lotes: number; aceites: number; aceites_site: string | null; revisoes: number };
  const cs = creds.results as (Cred & { sensor_id: string })[];
  const sondasLidas = sondas.results as { id: string; site_id: string; created_at: string; ultimo_envio: string | null }[];
  const estados = sondasLidas.map((s) => ({ site_id: s.site_id, estado: situacaoSensor(s.ultimo_envio ?? s.created_at, cs.filter((k) => k.sensor_id === s.id), agora) }));
  const paradas = estados.filter((s) => s.estado === 'parada');
  const nome = (id: string) => lista.find((s) => s.id === id)?.nome ?? '';
  const emAprovacao = lista.filter((s) => s.fase === 'base_em_aprovacao');
  const obras = lista.filter((s) => (s.fase === 'em_obra' || s.fase === 'base_em_aprovacao') && s.obra_ate && s.obra_ate <= em7);

  const por = <T extends { site_id: string }>(r: unknown) => new Map((r as T[]).map((x) => [x.site_id, x]));
  const [mRasc, mLotes, mRev, mDesv, mAtivos] = [rasc, lotesRev, revalid, desv, ativosPorSite].map((r) => por<{ site_id: string; n: number; em?: string | null }>(r.results));
  // Spec 2026-11-26 §7: o item leva o site quando o grupo é de um site só (id de site permitido: tudo acima sai de `sites`); abas finais.
  const umSo = (ids: string[]) => { const u = [...new Set(ids)]; return u.length === 1 ? u[0] : undefined; };
  const comObra = new Set(lista.filter((s) => s.obra_ate).map((s) => s.id));
  const siteDesvios = umSo([...mDesv.keys()].filter((id) => !comObra.has(id)));
  const item = (grupo: ItemFazer['grupo'], q: number, um: string, varios: string, contexto: string, acao: string, aba?: string, site?: string): ItemFazer[] =>
    q > 0 ? [{ grupo, quando: grupo === 'atraso' ? 'Agora' : 'Nesta semana', texto: plural(q, um, varios), contexto, acao, tela: 'ot', ...(aba ? { aba } : {}), ...(site ? { site } : {}), modulo: 'ot' }] : [];
  const itens: ItemFazer[] = [
    ...(veSondas ? item('atraso', paradas.length, 'sonda parada', 'sondas paradas', exemplos([...new Set(paradas.map((s) => nome(s.site_id)))]), 'Ver as sondas', 'sondas') : []),
    ...(gestor ? item('atraso', c.revisoes, 'requisito com revisão vencida', 'requisitos com revisão vencida', 'Assessment da RO-CB.BR.01', 'Abrir o assessment', 'assessment') : []),
    // a tela tira os desvios de site com obra ativa (situacao.obra = obra_ate preenchida); o número do topo segue contando todos
    ...(aprova ? item('semana', c.desvios_fora_de_obra, 'desvio aberto', 'desvios abertos', 'O sensor viu o que não está na base aprovada', 'Ver os desvios', 'desvios', siteDesvios) : []),
    ...(aprova ? item('semana', c.lotes, 'lote aguardando revisão', 'lotes aguardando revisão', 'Coleta enviada, esperando quem aprova', 'Revisar os lotes', 'revisar', umSo([...mLotes.keys()])) : []),
    ...(gestor ? item('semana', emAprovacao.length, 'base aguardando aprovação', 'bases aguardando aprovação', exemplos(emAprovacao.map((s) => s.nome)), 'Abrir os sites', 'base', umSo(emAprovacao.map((s) => s.id))) : []),
    ...(gestor ? item('semana', obras.length, 'obra vence em até 7 dias', 'obras vencem em até 7 dias', exemplos(obras.map((s) => s.nome)), 'Abrir os sites', undefined, umSo(obras.map((s) => s.id))) : []),
    ...(gestor ? item('semana', c.aceites, 'aceite de desvio vence em até 7 dias', 'aceites de desvio vencem em até 7 dias', 'Depois do prazo, o desvio reabre', 'Ver os desvios', 'desvios', c.aceites_site ?? undefined) : []),
  ];
  const [mZonas, mConteudo] = [zonas, conteudo].map((r) => new Set((r.results as { site_id: string }[]).map((x) => x.site_id)));
  // A régua do programa (P0-4): um item por site permitido, sem nome; a rota só o repassa a quem tem o bloco `ot`.
  const sitesPrograma: SiteNoPrograma[] = lista.map((s) => ({
    id: s.id,
    proximo_passo: proximoPassoDe({ fase: s.fase as Fase, revalidar_em: mRev.get(s.id)?.em ?? null, tem_conteudo: mConteudo.has(s.id), zonas_4_1_1: mZonas.has(s.id),
      rascunhos_bloqueiam: Number(mRasc.get(s.id)?.n ?? 0), lotes_em_revisao: Number(mLotes.get(s.id)?.n ?? 0) }),
    desvios_abertos: Number(mDesv.get(s.id)?.n ?? 0),
  }));
  // Quadro "Por site" (PR2): o mesmo lote, nenhuma consulta a mais. O texto do passo é o da régua (em operação com desvio = Tratar).
  const sondaDo = (id: string) => { const t = estados.filter((s) => s.site_id === id).map((s) => s.estado); return PIOR_SONDA.find((p) => t.includes(p)) ?? null; };
  const porSite: LinhaSiteOt[] = lista.map((s, i) => {
    const p = sitesPrograma[i];
    return { id: s.id, nome: s.nome, fase: s.fase,
      ...areaEEtapa({ fase: s.fase as Fase, obra_ate: s.obra_ate, ativos: Number(mAtivos.get(s.id)?.n ?? 0), zonas_4_1_1: mZonas.has(s.id),
        rascunhos_bloqueiam: Number(mRasc.get(s.id)?.n ?? 0), lotes_em_revisao: Number(mLotes.get(s.id)?.n ?? 0) }),
      proximo: p.proximo_passo === 'em_operacao' && p.desvios_abertos > 0 ? 'Tratar os desvios abertos' : TEXTO_OT[p.proximo_passo],
      desvios_abertos: p.desvios_abertos, revalidar_em: mRev.get(s.id)?.em ?? null, obra_ate: s.obra_ate, ...(veSondas ? { sonda: sondaDo(s.id) } : {}) };
  });
  // A credencial válida que vence por último, por sonda dos sites permitidos (a de `vencendo` em ot-sensor.ts).
  const credenciais = sondasLidas.flatMap((s) => { const v = cs.filter((k) => k.sensor_id === s.id).map((k) => k.expira_em).sort(); return v.length ? [{ site_id: s.site_id, expira_em: v[v.length - 1] }] : []; });
  // Quadros (PR3): só no ?modulo=ot e não para o técnico (são da organização); um db.batch + o de conformidadePorSite, nunca por site.
  const quadros = detalhe && papel !== 'tecnico'
    ? await quadrosOt(db, projectId, dia, { sites, lista, revalidar: new Map(lista.map((s) => [s.id, mRev.get(s.id)?.em ?? null])), credenciais, gestor, veSondas, soResumo: papel === 'leitor' })
    : null;
  const comecando = lista.length === 0;
  return {
    comecando, papel, itens, sitesPrograma, porSite, proximo: (quadros?.proximo ?? null) as Proximo, quadros,
    // Marco do programa (onda 4, decisão 8): a primeira base aprovada entre os sites DESTA pessoa (P0-4). O painel não o devolve.
    marco: lista.map((s) => s.base_aprovada_em).filter((d): d is string => !!d).sort()[0] ?? null,
    numeros: [[`${lista.filter((s) => s.fase === 'em_operacao').length} de ${lista.length}`, 'sites em operação'], [String(c.desvios), 'desvios abertos']] as [string, string][],
    cobertura: [] as never[], vencimentos: [] as never[], riscos: [] as never[],
    passos: [{ texto: 'Cadastrar o primeiro site', contexto: 'O inventário do n.ot começa pelo site', feito: !comecando, acao: 'Abrir o n.ot', tela: 'ot' }] as Passo[],
  };
}

export type BlocoOt = Awaited<ReturnType<typeof blocoOt>>;

/**
 * O bloco do n.ot no `?modulo=ot` (Painel do n.ot, spec 2026-11-19, decisões 1, 3 e 4), por papel. O Início do n.360 NÃO passa por
 * aqui: nenhum campo novo fora do `?modulo=ot` (oráculo do inventário). Gestor ARCiber e equipe: tudo; técnico: os sites dele e os
 * números deles (P0-4); leitor: a frase (nada de desvio, site ou sonda).
 */
export function respostaDoOt(b: BlocoOt, saude: Saude) {
  const q = b.quadros;
  // Leitor (decisão 3): a frase e o resumo da RO-CB em números; nada de desvio, site, sonda ou item por item.
  if (b.papel === 'leitor') return { saude, comecando: b.comecando, ...(q ? { conformidade: { resumo: q.resumo } } : {}) };
  const base = { saude, numeros: b.numeros, comecando: b.comecando, por_site: b.porSite };
  if (b.papel === 'tecnico') return base;
  return { ...base, fazer: b.itens, passos: b.passos, ...(q?.completo ?? {}) };
}
