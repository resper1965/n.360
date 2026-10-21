import { SQL_TITULOS_ADICIONAIS } from '../bases';
import { ehLegitimoInteresse } from '../lia';
import { estadoDasEtapas } from './etapas-estado';
import type { Conferencia, EstadoEtapa, ItemConferencia } from './tipos';

export type EntradaConferencia = {
  finalidade: string | null; etapas: EstadoEtapa[]; temBase: boolean; dadosSensiveis: boolean; art11Incisos: number; art11Na: boolean;
  impactoFinalizado: boolean; gapsAbertosSemResponsavel: number; gaps: number; gapsNaoAplicavel: boolean; medidas: number; riscos: number;
  transferencia: boolean; salvaguarda: string | null; liaExigida: boolean; liaConcluida: boolean;
};

/** Função pura: o que impede (bloqueios) e o que só avisa (avisos) antes de pedir a aprovação. Sistema vazio: bloqueia e avisa, nunca quebra. */
/** Dado sensível sem inciso do art. 11 nem "Não Aplicável": a regra única da conferência, das abas e da próxima pergunta. */
export const sensivelSemArt11 = (sensivel: unknown, art11Incisos: number, art11Na: unknown) => !!sensivel && !art11Incisos && !art11Na;
/** O Escopo pede volume mensal OU descrição, além da finalidade. */
export const temVolumeOuDescricao = (d: { volume_mensal?: unknown; descricao_atividade?: unknown }) =>
  !!(String(d.volume_mensal ?? '').trim() || String(d.descricao_atividade ?? '').trim());

export function montarConferencia(e: EntradaConferencia): Conferencia {
  const bloqueios: ItemConferencia[] = [];
  const avisos: ItemConferencia[] = [];
  const pendentes = e.etapas.filter((x) => x.situacao === 'pendente').length;
  if (!String(e.finalidade ?? '').trim()) bloqueios.push({ id: 'sem_finalidade', aba: 'escopo', texto: 'Escopo: preencha a finalidade.' });
  if (pendentes) bloqueios.push({ id: 'etapa_pendente', aba: 'tratamento', texto: `Tratamento de Dados: ${pendentes} ${pendentes === 1 ? 'etapa pendente' : 'etapas pendentes'}.` });
  if (sensivelSemArt11(e.dadosSensiveis, e.art11Incisos, e.art11Na)) bloqueios.push({ id: 'sensivel_sem_art11', aba: 'base_juridica', texto: 'Base Jurídica: há dado sensível; informe o inciso do art. 11 ou marque Não Aplicável.' });
  if (!e.impactoFinalizado) bloqueios.push({ id: 'impacto_nao_finalizado', aba: 'impacto', texto: 'Teste de Impacto: finalize o teste.' });
  if (e.gapsAbertosSemResponsavel) bloqueios.push({ id: 'gap_sem_responsavel', aba: 'gaps', texto: `Controle de GAPs: ${e.gapsAbertosSemResponsavel} ${e.gapsAbertosSemResponsavel === 1 ? 'gap sem responsável' : 'gaps sem responsável'}.` });
  if (!e.medidas) avisos.push({ id: 'sem_medidas', aba: 'medidas', texto: 'Nenhuma medida de segurança registrada.' });
  if (!e.riscos) avisos.push({ id: 'sem_riscos', aba: 'riscos', texto: 'Nenhum risco registrado.' });
  if (!e.temBase && !e.dadosSensiveis) avisos.push({ id: 'sem_base', aba: 'base_juridica', texto: 'Nenhuma base jurídica registrada.' });
  if (e.transferencia && !String(e.salvaguarda ?? '').trim()) avisos.push({ id: 'transferencia_sem_salvaguarda', aba: 'agentes', texto: 'Transferência internacional sem salvaguarda.' });
  if (e.liaExigida && !e.liaConcluida) avisos.push({ id: 'lia_pendente', aba: 'base_juridica', texto: 'Legítimo interesse sem a LIA concluída.' });
  if (!e.gaps && !e.gapsNaoAplicavel) avisos.push({ id: 'gaps_nao_tratados', aba: 'gaps', texto: 'Controle de GAPs: registre os gaps ou marque Não Aplicável.' });
  return { pronta: bloqueios.length === 0, bloqueios, avisos };
}

/** Tudo o que a conferência e a ficha leem da atividade, numa consulta só (cada subconsulta filtra `project_id` E `ropa_id`). */
export type DadosAtividade = {
  id: string; nome: string | null; finalidade: string | null; descricao_atividade: string | null; volume_mensal: string | null; processamento_automatizado: string | null;
  owner_parte_id: string | null; owner_nome: string | null; papel_controlador: number | null; papel_operador: number | null;
  dados_sensiveis: number | null; base_legal_id: string | null; base_art11_na: number | null; gaps_nao_aplicavel: number | null;
  international_transfers: number | null; transfer_safeguards: string | null; legal_basis: string | null; base_gdpr: string | null;
  impacto_finalizado_em: string | null; base_titulo: string | null; adicionais: string | null; lia_status: string | null;
  art7: number; art11: number; gdpr: number; gdpr_li: number; medidas: number; riscos: number; gaps: number; gaps_abertos: number; sem_responsavel: number;
  respondidas: number; logs: number;
  status: string | null; reaberta_em: string | null; areas_json: string | null; empresa: string | null; iso: number;
  ultima_aprovacao_por: string | null; ultima_aprovacao_em: string | null;
};

export async function lerDadosAtividade(db: D1Database, projectId: string, ropaId: string): Promise<DadosAtividade | null> {
  return db.prepare(
    `SELECT r.id, r.nome, r.processing_purpose AS finalidade, r.descricao_atividade, r.volume_mensal, r.processamento_automatizado,
            r.owner_parte_id, pa.nome AS owner_nome, r.papel_controlador, r.papel_operador, r.dados_sensiveis, r.base_legal_id, r.base_art11_na,
            r.gaps_nao_aplicavel, r.international_transfers, r.transfer_safeguards, r.legal_basis, r.base_gdpr, r.impacto_finalizado_em, r.status, r.reaberta_em,
            q.titulo AS base_titulo, ${SQL_TITULOS_ADICIONAIS} AS adicionais,
      (SELECT l.status FROM lia_assessments l WHERE l.ropa_id = r.id AND l.project_id = r.project_id) AS lia_status,
      (SELECT count(*) FROM tratamento_bases b WHERE b.ropa_id = r.id AND b.project_id = r.project_id AND b.requisito_id LIKE 'lgpd:art7:%')
        + COALESCE(r.base_legal_id LIKE 'lgpd:art7:%', 0) AS art7,
      (SELECT count(*) FROM tratamento_bases b WHERE b.ropa_id = r.id AND b.project_id = r.project_id AND b.requisito_id LIKE 'lgpd:art11:%')
        + COALESCE(r.base_legal_id LIKE 'lgpd:art11:%', 0) AS art11,
      (SELECT count(*) FROM tratamento_bases_gdpr g WHERE g.ropa_id = r.id AND g.project_id = r.project_id) AS gdpr,
      (SELECT count(*) FROM tratamento_bases_gdpr g WHERE g.ropa_id = r.id AND g.project_id = r.project_id AND g.base = 'interesses_legitimos') AS gdpr_li,
      (SELECT count(*) FROM tratamento_medidas m WHERE m.ropa_id = r.id AND m.project_id = r.project_id) AS medidas,
      (SELECT count(*) FROM risks k WHERE k.ropa_id = r.id AND k.project_id = r.project_id) AS riscos,
      (SELECT count(*) FROM corrective_actions a WHERE a.ropa_id = r.id AND a.project_id = r.project_id) AS gaps,
      (SELECT count(*) FROM corrective_actions a WHERE a.ropa_id = r.id AND a.project_id = r.project_id AND COALESCE(a.status, 'Open') <> 'Closed') AS gaps_abertos,
      (SELECT count(*) FROM corrective_actions a WHERE a.ropa_id = r.id AND a.project_id = r.project_id AND COALESCE(a.status, 'Open') <> 'Closed' AND a.assigned_to_parte_id IS NULL) AS sem_responsavel,
      (SELECT count(*) FROM tratamento_impacto t WHERE t.ropa_id = r.id AND t.project_id = r.project_id) AS respondidas,
      (SELECT count(*) FROM audit_logs l WHERE l.project_id = r.project_id AND ((l.entity_type = 'ropa' AND l.entity_id = r.id) OR l.details LIKE 'ROPA ' || r.id || ':%')) AS logs,
      (SELECT json_group_array(json_object('id', d.id, 'nome', d.nome)) FROM tratamento_departamentos t JOIN departamentos d ON d.id = t.departamento_id
        WHERE t.ropa_id = r.id AND t.project_id = r.project_id) AS areas_json,
      COALESCE(NULLIF((SELECT e.razao_social FROM empresas e WHERE e.project_id = r.project_id), ''), (SELECT p.client_name FROM projects p WHERE p.id = r.project_id)) AS empresa,
      (SELECT count(*) FROM projeto_modulos m WHERE m.project_id = r.project_id AND m.modulo = 'iso') AS iso,
      (SELECT COALESCE(NULLIF(pd.nome, ''), pd.email) FROM pedido_destinatarios pd JOIN pedidos pe ON pe.id = pd.pedido_id
        WHERE pe.project_id = r.project_id AND pe.tipo = 'tratamento' AND pe.ref_id = r.id AND pd.status = 'aprovado' ORDER BY pd.decidido_em DESC, pd.rowid DESC LIMIT 1) AS ultima_aprovacao_por,
      (SELECT pd.decidido_em FROM pedido_destinatarios pd JOIN pedidos pe ON pe.id = pd.pedido_id
        WHERE pe.project_id = r.project_id AND pe.tipo = 'tratamento' AND pe.ref_id = r.id AND pd.status = 'aprovado' ORDER BY pd.decidido_em DESC, pd.rowid DESC LIMIT 1) AS ultima_aprovacao_em
       FROM ropa_records r LEFT JOIN requisitos q ON q.id = r.base_legal_id LEFT JOIN partes pa ON pa.id = r.owner_parte_id AND pa.project_id = r.project_id
      WHERE r.id = ? AND r.project_id = ?`
  ).bind(ropaId, projectId).first<DadosAtividade>();
}

export function entradaDaConferencia(r: DadosAtividade, etapas: EstadoEtapa[]): EntradaConferencia {
  return {
    finalidade: r.finalidade, etapas, temBase: !!(r.base_legal_id || r.art7 || r.art11 || r.gdpr || String(r.legal_basis ?? '').trim()),
    dadosSensiveis: !!r.dados_sensiveis, art11Incisos: r.art11, art11Na: !!r.base_art11_na, impactoFinalizado: !!r.impacto_finalizado_em,
    gapsAbertosSemResponsavel: r.sem_responsavel, gaps: r.gaps, gapsNaoAplicavel: !!r.gaps_nao_aplicavel, medidas: r.medidas, riscos: r.riscos,
    transferencia: !!r.international_transfers, salvaguarda: r.transfer_safeguards,
    liaExigida: ehLegitimoInteresse(r.legal_basis, r.base_titulo, r.adicionais, r.base_gdpr) || r.gdpr_li > 0, liaConcluida: r.lia_status === 'concluida',
  };
}

/** null: a atividade não é do projeto. */
export async function carregarConferencia(db: D1Database, projectId: string, ropaId: string): Promise<Conferencia | null> {
  const r = await lerDadosAtividade(db, projectId, ropaId);
  if (!r) return null;
  return montarConferencia(entradaDaConferencia(r, await estadoDasEtapas(db, projectId, ropaId)));
}
