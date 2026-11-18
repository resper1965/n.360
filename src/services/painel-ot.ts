import { ehConsultor } from '../helpers';
import { adminDireto } from './organizacao';
import { gestorArciberDireto, podeEditarOt, sitesPermitidos, TETO_LEITURA_OT, type AtorOt } from './ot-inventario';
import { proximoPassoDe, sitesComZonas411, type Fase } from './ot-fase';
import type { SiteNoPrograma } from './programa';
import { situacaoSensor, type Cred } from './ot-sensor';
import type { ItemFazer, Passo, Proximo } from './painel';

/**
 * Bloco do n.ot no painel de entrada (onda 0, spec 2026-11-14-onda0). Só contagem de pendência e nome de site: nunca IP, MAC,
 * nome de ativo ou de sonda, nem contagem de ativos ou achados (seria oráculo do inventário). Limitado aos sites da pessoa.
 */
export type AtorPainelOt = AtorOt & { client_project_id?: string | null };

const DIA_MS = 86_400_000;
const plural = (q: number, um: string, varios: string) => `${q} ${q === 1 ? um : varios}`;
const exemplos = (nomes: string[]) => nomes.slice(0, 3).join(', ') + (nomes.length > 3 ? ` e mais ${nomes.length - 3}` : '');

export async function blocoOt(db: D1Database, projectId: string, ator: AtorPainelOt, dia: string, agora: Date) {
  const sites = await sitesPermitidos(db, ator, projectId);
  const em7 = new Date(Date.parse(dia) + 7 * DIA_MS).toISOString().slice(0, 10);
  // Mesmo critério da tela do módulo (ot-inicio.js, pendenciasDoPapel). Gestor: org_admin do projeto ou o admin direto designado Gestor ARCiber. Aprova: org_admin, consultor e admin direto; a tela tira o consultoria_admin
  // (o servidor, em podeAprovar, o aceita no projeto designado: divergência registrada, vale a tela). Agente e chave de API nunca.
  const pessoa = ator.agente !== true && !ator.id.startsWith('apikey:');
  const gestor = (ator.role === 'org_admin' && ator.client_project_id === projectId) || (pessoa && await gestorArciberDireto(db, ator, projectId));
  const aprova = pessoa && (ator.role === 'org_admin' || ehConsultor(ator) || await adminDireto(db, ator, projectId));
  const edita = podeEditarOt(ator);
  const NO_SITE = 'site_id IN (SELECT value FROM json_each(?2))';
  const [sts, cont, sondas, creds, rasc, lotesRev, zonas, conteudo, revalid, desv] = await db.batch([
    db.prepare(`SELECT id, nome, fase, substr(obra_ate, 1, 10) AS obra_ate, base_aprovada_em FROM ot_sites
      WHERE project_id = ?1 AND status = 'ativo' AND id IN (SELECT value FROM json_each(?2)) ORDER BY nome LIMIT ${TETO_LEITURA_OT}`).bind(projectId, sites),
    db.prepare(`SELECT
        (SELECT count(*) FROM ot_desvios WHERE project_id = ?1 AND ${NO_SITE} AND situacao = 'aberto') AS desvios,
        (SELECT count(*) FROM ot_desvios WHERE project_id = ?1 AND ${NO_SITE} AND situacao = 'aberto'
          AND site_id NOT IN (SELECT id FROM ot_sites WHERE project_id = ?1 AND obra_ate IS NOT NULL)) AS desvios_fora_de_obra,
        (SELECT count(*) FROM ot_lotes WHERE project_id = ?1 AND ${NO_SITE} AND status = 'em_revisao' AND criado_por IS NOT ?5) AS lotes,
        (SELECT count(*) FROM ot_desvios WHERE project_id = ?1 AND ${NO_SITE} AND situacao = 'aceito' AND substr(aceito_ate, 1, 10) <= ?3) AS aceites,
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
  ]);
  const lista = sts.results as { id: string; nome: string; fase: string; obra_ate: string | null; base_aprovada_em: string | null }[];
  const c = cont.results[0] as { desvios: number; desvios_fora_de_obra: number; lotes: number; aceites: number; revisoes: number };
  const cs = creds.results as (Cred & { sensor_id: string })[];
  const paradas = (sondas.results as { id: string; site_id: string; created_at: string; ultimo_envio: string | null }[])
    .filter((s) => situacaoSensor(s.ultimo_envio ?? s.created_at, cs.filter((k) => k.sensor_id === s.id), agora) === 'parada');
  const nome = (id: string) => lista.find((s) => s.id === id)?.nome ?? '';
  const emAprovacao = lista.filter((s) => s.fase === 'base_em_aprovacao');
  const obras = lista.filter((s) => (s.fase === 'em_obra' || s.fase === 'base_em_aprovacao') && s.obra_ate && s.obra_ate <= em7);

  const item = (grupo: ItemFazer['grupo'], q: number, um: string, varios: string, contexto: string, acao: string, aba: string): ItemFazer[] =>
    q > 0 ? [{ grupo, quando: grupo === 'atraso' ? 'Agora' : 'Nesta semana', texto: plural(q, um, varios), contexto, acao, tela: 'ot', aba, modulo: 'ot' }] : [];
  const itens: ItemFazer[] = [
    ...(edita ? item('atraso', paradas.length, 'sonda parada', 'sondas paradas', exemplos([...new Set(paradas.map((s) => nome(s.site_id)))]), 'Ver as sondas', 'acessos') : []),
    ...(gestor ? item('atraso', c.revisoes, 'requisito com revisão vencida', 'requisitos com revisão vencida', 'Assessment da RO-CB.BR.01', 'Abrir o assessment', 'assessment') : []),
    // a tela tira os desvios de site com obra ativa (situacao.obra = obra_ate preenchida); o número do topo segue contando todos
    ...(aprova ? item('semana', c.desvios_fora_de_obra, 'desvio aberto', 'desvios abertos', 'O sensor viu o que não está na base aprovada', 'Ver os desvios', 'sites') : []),
    ...(aprova ? item('semana', c.lotes, 'lote aguardando revisão', 'lotes aguardando revisão', 'Coleta enviada, esperando quem aprova', 'Revisar os lotes', 'sites') : []),
    ...(gestor ? item('semana', emAprovacao.length, 'base aguardando aprovação', 'bases aguardando aprovação', exemplos(emAprovacao.map((s) => s.nome)), 'Abrir os sites', 'sites') : []),
    ...(gestor ? item('semana', obras.length, 'obra vence em até 7 dias', 'obras vencem em até 7 dias', exemplos(obras.map((s) => s.nome)), 'Abrir os sites', 'sites') : []),
    ...(gestor ? item('semana', c.aceites, 'aceite de desvio vence em até 7 dias', 'aceites de desvio vencem em até 7 dias', 'Depois do prazo, o desvio reabre', 'Ver os desvios', 'sites') : []),
  ];
  const por = <T extends { site_id: string }>(r: unknown) => new Map((r as T[]).map((x) => [x.site_id, x]));
  const [mRasc, mLotes, mRev, mDesv] = [rasc, lotesRev, revalid, desv].map((r) => por<{ site_id: string; n: number; em?: string | null }>(r.results));
  const [mZonas, mConteudo] = [zonas, conteudo].map((r) => new Set((r.results as { site_id: string }[]).map((x) => x.site_id)));
  // A régua do programa (P0-4): um item por site permitido, sem nome; a rota só o repassa a quem tem o bloco `ot`.
  const sitesPrograma: SiteNoPrograma[] = lista.map((s) => ({
    proximo_passo: proximoPassoDe({ fase: s.fase as Fase, revalidar_em: mRev.get(s.id)?.em ?? null, tem_conteudo: mConteudo.has(s.id), zonas_4_1_1: mZonas.has(s.id),
      rascunhos_bloqueiam: Number(mRasc.get(s.id)?.n ?? 0), lotes_em_revisao: Number(mLotes.get(s.id)?.n ?? 0) }),
    desvios_abertos: Number(mDesv.get(s.id)?.n ?? 0),
  }));
  const comecando = lista.length === 0;
  return {
    comecando, itens, sitesPrograma, proximo: null as Proximo,
    // Marco do programa (onda 4, decisão 8): a primeira base aprovada entre os sites DESTA pessoa (P0-4). O painel não o devolve.
    marco: lista.map((s) => s.base_aprovada_em).filter((d): d is string => !!d).sort()[0] ?? null,
    numeros: [[`${lista.filter((s) => s.fase === 'em_operacao').length} de ${lista.length}`, 'sites em operação'], [String(c.desvios), 'desvios abertos']] as [string, string][],
    cobertura: [] as never[], vencimentos: [] as never[], riscos: [] as never[],
    passos: [{ texto: 'Cadastrar o primeiro site', contexto: 'O inventário do n.ot começa pelo site', feito: !comecando, acao: 'Abrir o n.ot', tela: 'ot' }] as Passo[],
  };
}
