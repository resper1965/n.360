import { ehConsultor } from '../helpers';
import { podeEditarOt, sitesPermitidos, TETO_LEITURA_OT, type AtorOt } from './ot-inventario';
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
  const gestor = ator.role === 'org_admin' && ator.client_project_id === projectId;
  // Mesmo critério da tela do módulo (ot-inicio.js, pendenciasDoPapel). Aprova: org_admin e consultor; a tela tira o consultoria_admin
  // (o servidor, em podeAprovar, o aceita no projeto designado: divergência registrada, vale a tela). Agente e chave de API nunca.
  const pessoa = ator.agente !== true && !ator.id.startsWith('apikey:');
  const aprova = pessoa && (ator.role === 'org_admin' || ehConsultor(ator));
  const edita = podeEditarOt(ator);
  const NO_SITE = 'site_id IN (SELECT value FROM json_each(?2))';
  const [sts, cont, sondas, creds] = await db.batch([
    db.prepare(`SELECT id, nome, fase, substr(obra_ate, 1, 10) AS obra_ate FROM ot_sites
      WHERE project_id = ?1 AND status = 'ativo' AND id IN (SELECT value FROM json_each(?2)) ORDER BY nome LIMIT ${TETO_LEITURA_OT}`).bind(projectId, sites),
    db.prepare(`SELECT
        (SELECT count(*) FROM ot_desvios WHERE project_id = ?1 AND ${NO_SITE} AND situacao = 'aberto') AS desvios,
        (SELECT count(*) FROM ot_lotes WHERE project_id = ?1 AND ${NO_SITE} AND status = 'em_revisao' AND criado_por IS NOT ?5) AS lotes,
        (SELECT count(*) FROM ot_desvios WHERE project_id = ?1 AND ${NO_SITE} AND situacao = 'aceito' AND substr(aceito_ate, 1, 10) <= ?3) AS aceites,
        (SELECT count(*) FROM ot_avaliacoes WHERE project_id = ?1 AND proxima_revisao IS NOT NULL AND proxima_revisao < ?4) AS revisoes`)
      .bind(projectId, sites, em7, dia, ator.id),
    db.prepare(`SELECT s.id, s.site_id, s.created_at,
        (SELECT created_at FROM ot_sensor_envios e WHERE e.sensor_id = s.id AND e.situacao = 'concluido' ORDER BY e.created_at DESC LIMIT 1) AS ultimo_envio
      FROM ot_sensores s WHERE s.project_id = ?1 AND s.situacao = 'ativa' AND s.${NO_SITE} LIMIT ${TETO_LEITURA_OT}`).bind(projectId, sites),
    db.prepare(`SELECT sensor_id, expira_em, situacao FROM ot_sensor_credenciais WHERE project_id = ?1 AND situacao = 'ativa' AND expira_em > ?2 LIMIT ${TETO_LEITURA_OT}`)
      .bind(projectId, agora.toISOString()),
  ]);
  const lista = sts.results as { id: string; nome: string; fase: string; obra_ate: string | null }[];
  const c = cont.results[0] as { desvios: number; lotes: number; aceites: number; revisoes: number };
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
    ...(aprova ? item('semana', c.desvios, 'desvio aberto', 'desvios abertos', 'O sensor viu o que não está na base aprovada', 'Ver os desvios', 'sites') : []),
    ...(aprova ? item('semana', c.lotes, 'lote aguardando revisão', 'lotes aguardando revisão', 'Coleta enviada, esperando quem aprova', 'Revisar os lotes', 'sites') : []),
    ...(gestor ? item('semana', emAprovacao.length, 'base aguardando aprovação', 'bases aguardando aprovação', exemplos(emAprovacao.map((s) => s.nome)), 'Abrir os sites', 'sites') : []),
    ...(gestor ? item('semana', obras.length, 'obra vence em até 7 dias', 'obras vencem em até 7 dias', exemplos(obras.map((s) => s.nome)), 'Abrir os sites', 'sites') : []),
    ...(gestor ? item('semana', c.aceites, 'aceite de desvio vence em até 7 dias', 'aceites de desvio vencem em até 7 dias', 'Depois do prazo, o desvio reabre', 'Ver os desvios', 'sites') : []),
  ];
  const comecando = lista.length === 0;
  return {
    comecando, itens, proximo: null as Proximo,
    numeros: [[`${lista.filter((s) => s.fase === 'em_operacao').length} de ${lista.length}`, 'sites em operação'], [String(c.desvios), 'desvios abertos']] as [string, string][],
    cobertura: [] as never[], vencimentos: [] as never[], riscos: [] as never[],
    passos: [{ texto: 'Cadastrar o primeiro site', contexto: 'O inventário do n.ot começa pelo site', feito: !comecando, acao: 'Abrir o n.ot', tela: 'ot' }] as Passo[],
  };
}
