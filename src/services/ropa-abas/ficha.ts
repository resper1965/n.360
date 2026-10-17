import { aprovacoesDoProjeto } from '../documentos';
import { PERGUNTAS_IMPACTO } from '../impacto';
import { entradaDaConferencia, lerDadosAtividade, montarConferencia, type DadosAtividade } from './conferencia';
import { estadoDasEtapas } from './etapas-estado';
import { acoesDoMenu, papelDe, podePedirAprovacao, situacaoDaAtividade } from './situacao';
import type { AbaId } from '../../schemas/ropa-abas';
import type { EstadoAba, EstadoEtapa, Ficha } from './tipos';

type Estado = { estado: EstadoAba; resumo: string };
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Função pura: o estado de cada aba (texto, nunca só cor). Sistema vazio: tudo `vazio` ou `pendente`, nunca erro. */
export function estadoDasAbas(d: DadosAtividade, etapas: EstadoEtapa[]): Record<AbaId, Estado> {
  const feitas = etapas.filter((e) => e.situacao !== 'pendente').length;
  const total = Math.max(etapas.length, 1);
  const sensivelSemArt11 = !!d.dados_sensiveis && !d.art11 && !d.base_art11_na;
  const temBase = !!(d.base_legal_id || d.art7 || d.art11 || d.gdpr || String(d.legal_basis ?? '').trim());
  const perguntas = PERGUNTAS_IMPACTO.length;
  const respondidas = Math.min(d.respondidas, perguntas);
  return {
    escopo: String(d.finalidade ?? '').trim() && (String(d.volume_mensal ?? '').trim() || String(d.descricao_atividade ?? '').trim())
      ? { estado: 'feito', resumo: 'Finalidade preenchida.' }
      : { estado: 'pendente', resumo: String(d.finalidade ?? '').trim() ? 'Falta o volume mensal ou a descrição.' : 'Falta a finalidade.' },
    tratamento: feitas === etapas.length && etapas.length
      ? { estado: 'feito', resumo: `${etapas.length} de ${etapas.length} etapas concluídas.` }
      : { estado: 'pendente', resumo: `${feitas} de ${total} etapas concluídas.` },
    agentes: d.papel_controlador || d.papel_operador
      ? { estado: 'feito', resumo: [d.papel_controlador ? 'Controlador' : '', d.papel_operador ? 'Operador' : ''].filter(Boolean).join(' e ') + '.' }
      : { estado: 'pendente', resumo: 'Papel não informado.' },
    medidas: d.medidas ? { estado: 'feito', resumo: plural(d.medidas, 'medida', 'medidas') + '.' } : { estado: 'vazio', resumo: 'Nenhuma medida registrada.' },
    base_juridica: sensivelSemArt11 ? { estado: 'pendente', resumo: 'Dado sensível: falta o inciso do art. 11 ou Não Aplicável.' }
      : temBase ? { estado: 'feito', resumo: [d.art7 ? plural(d.art7, 'inciso do art. 7º', 'incisos do art. 7º') : '', d.art11 ? plural(d.art11, 'inciso do art. 11', 'incisos do art. 11') : '', d.gdpr ? 'GDPR' : ''].filter(Boolean).join(', ') || 'Base registrada.' }
      : { estado: 'vazio', resumo: 'Nenhuma base jurídica registrada.' },
    gaps: d.gaps_nao_aplicavel ? { estado: 'na', resumo: 'Não Aplicável.' }
      : !d.gaps ? { estado: 'vazio', resumo: 'Nenhum gap registrado.' }
      : d.gaps_abertos ? { estado: 'pendente', resumo: `${plural(d.gaps, 'gap', 'gaps')}, ${plural(d.gaps_abertos, 'aberto', 'abertos')}.` }
      : { estado: 'feito', resumo: `${plural(d.gaps, 'gap', 'gaps')}, todos fechados.` },
    impacto: d.impacto_finalizado_em ? { estado: 'feito', resumo: 'Teste finalizado.' } : { estado: 'pendente', resumo: `${respondidas} de ${perguntas} respondidas.` },
    riscos: d.riscos ? { estado: 'feito', resumo: plural(d.riscos, 'risco', 'riscos') + '.' } : { estado: 'vazio', resumo: 'Nenhum risco registrado.' },
    logs: d.logs ? { estado: 'feito', resumo: plural(d.logs, 'registro', 'registros') + '.' } : { estado: 'vazio', resumo: 'Nenhum registro.' },
  };
}

/** A ficha: cabeçalho, situação, menu Ações e o estado das abas, em poucas consultas. null: a atividade não é do projeto. */
export async function montarFicha(db: D1Database, projectId: string, ropaId: string, user: { email?: string; role?: string; client_project_id?: string | null; org_id?: string | null }): Promise<Ficha | null> {
  const d = await lerDadosAtividade(db, projectId, ropaId);
  if (!d) return null;
  const [etapas, aprovacoes, podePedir] = await Promise.all([
    estadoDasEtapas(db, projectId, ropaId), aprovacoesDoProjeto(db, projectId, ropaId, 'tratamento'), podePedirAprovacao(db, user, projectId),
  ]);
  const aprovacao = aprovacoes.get(ropaId) ?? { ciso: null, ceo: null };
  const vigente = !!(aprovacao.ciso || aprovacao.ceo);
  const anterior = !vigente && d.ultima_aprovacao_em ? { por: d.ultima_aprovacao_por ?? '', em: d.ultima_aprovacao_em } : null;
  const situacao = situacaoDaAtividade({ status: d.status, reaberta_em: d.reaberta_em, aprovacao, aprovacao_anterior: anterior });
  const bloqueios = montarConferencia(entradaDaConferencia(d, etapas)).bloqueios.length;
  let areas: { id: string; nome: string }[] = [];
  try { areas = d.areas_json ? JSON.parse(d.areas_json) : []; } catch { areas = []; }
  return {
    ok: true,
    registro: {
      id: d.id, nome: d.nome || d.finalidade || '', finalidade: d.finalidade ?? '', descricao_atividade: d.descricao_atividade,
      responsavel: d.owner_parte_id ? { id: d.owner_parte_id, nome: d.owner_nome ?? '' } : null, areas, empresa: d.empresa ?? '',
    },
    situacao,
    acoes: acoesDoMenu(situacao, papelDe(user, podePedir, bloqueios)),
    abas: estadoDasAbas(d, etapas),
    modulos: { iso: d.iso > 0 },
    proxima_pergunta: null,
  };
}

