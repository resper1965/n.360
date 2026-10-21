import { SQL_CLASSE_CONTROLE } from '../classe-controle';
import { SQL_EH_FORNECEDOR } from '../terceiros';
import { ENTIDADES, type Entidade } from '../../data/passos/tipos';

/** Uma consulta por entidade, todas com `project_id = ?`. Lista fechada: o catálogo só cita as chaves daqui. */
export const CONSULTAS_ENTIDADE: Record<Entidade, string> = {
  riscos: `SELECT COUNT(*) AS n FROM risks WHERE project_id = ?`,
  ativos: `SELECT COUNT(*) AS n FROM itens WHERE project_id = ? AND status = 'ativo'`,
  controles_implementados: `SELECT COUNT(*) AS n FROM compliance_controls WHERE project_id = ? AND (${SQL_CLASSE_CONTROLE}) = 'feito'`,
  documentos_vigentes: `SELECT COUNT(*) AS n FROM documentos WHERE project_id = ? AND status = 'vigente'`,
  atividades_ropa: `SELECT COUNT(*) AS n FROM ropa_records WHERE project_id = ?`,
  ripd: `SELECT COUNT(*) AS n FROM dpia_assessments WHERE project_id = ?`,
  fornecedores: `SELECT COUNT(*) AS n FROM partes p WHERE project_id = ? AND ${SQL_EH_FORNECEDOR}`,
  treinamentos: `SELECT COUNT(*) AS n FROM training_records WHERE project_id = ?`,
  auditorias: `SELECT COUNT(*) AS n FROM audit_schedule WHERE project_id = ?`,
  analises_criticas: `SELECT COUNT(*) AS n FROM management_reviews WHERE project_id = ?`,
  acoes_corretivas: `SELECT COUNT(*) AS n FROM corrective_actions WHERE project_id = ?`,
  partes_interessadas: `SELECT COUNT(*) AS n FROM stakeholders WHERE project_id = ?`,
  governanca: `SELECT COUNT(*) AS n FROM project_governance WHERE project_id = ?`,
  incidentes: `SELECT COUNT(*) AS n FROM incidentes WHERE project_id = ?`,
  metricas: `SELECT COUNT(*) AS n FROM performance_metrics WHERE project_id = ?`,
};

export interface LinhaProgresso {
  phase_number: number; item_id: string; is_checked: number; checked_at: string | null; evidence_id: string | null; notes: string | null;
  assigned_to: string | null; due_date: string | null; bloqueio_motivo: string | null; bloqueio_responsavel: string | null;
  bloqueado_em: string | null; excecao_motivo: string | null; excecao_por: string | null; excecao_em: string | null;
}
export interface Resposta { valor: string; atualizado_em: string | null; por: string | null }
export interface LinhaFase { status: string; legado_status: string | null }

/** Tudo o que o avaliador precisa de um projeto, lido de uma vez (um `batch`, ~21 consultas), e não por passo. */
export interface ContextoProjeto {
  progresso: Map<string, LinhaProgresso>;   // por item_id
  respostas: Map<string, Resposta>;         // por question_key (chave de chaveDoCampo)
  entidades: Record<Entidade, number>;
  evidencias: Set<string>;                  // ids de evidência DESTE projeto
  trilhas: Set<string>;                     // trilhas com ao menos uma resposta de entrevista
  pedidos: Map<string, number>;             // `${tipo}:${status}` -> quantos
  fases: Map<number, LinhaFase>;
}

export async function carregarContexto(db: D1Database, projectId: string): Promise<ContextoProjeto> {
  const r = await db.batch([
    db.prepare(`SELECT phase_number, item_id, is_checked, checked_at, evidence_id, notes, assigned_to, due_date, bloqueio_motivo,
                  bloqueio_responsavel, bloqueado_em, excecao_motivo, excecao_por, excecao_em FROM checklist_progress WHERE project_id = ?`).bind(projectId),
    db.prepare(`SELECT question_key, answer, updated_at, updated_by FROM project_phase_answers WHERE project_id = ?`).bind(projectId),
    db.prepare(`SELECT id FROM evidence WHERE project_id = ?`).bind(projectId),
    db.prepare(`SELECT DISTINCT track FROM project_interviews WHERE project_id = ?`).bind(projectId),
    db.prepare(`SELECT tipo, status, COUNT(*) AS n FROM pedidos WHERE project_id = ? GROUP BY tipo, status`).bind(projectId),
    db.prepare(`SELECT phase_number, status, legado_status FROM project_phases WHERE project_id = ?`).bind(projectId),
    ...ENTIDADES.map((e) => db.prepare(CONSULTAS_ENTIDADE[e]).bind(projectId)),
  ]);
  const linhas = <T>(i: number) => (r[i].results ?? []) as T[];
  return {
    progresso: new Map(linhas<LinhaProgresso>(0).map((l) => [l.item_id, l])),
    respostas: new Map(linhas<{ question_key: string; answer: string | null; updated_at: string | null; updated_by: string | null }>(1)
      .filter((l) => (l.answer ?? '').trim() !== '')
      .map((l) => [l.question_key, { valor: l.answer as string, atualizado_em: l.updated_at, por: l.updated_by }])),
    evidencias: new Set(linhas<{ id: string }>(2).map((l) => l.id)),
    trilhas: new Set(linhas<{ track: string }>(3).map((l) => l.track)),
    pedidos: new Map(linhas<{ tipo: string; status: string; n: number }>(4).map((l) => [`${l.tipo}:${l.status}`, Number(l.n)])),
    fases: new Map(linhas<{ phase_number: number; status: string; legado_status: string | null }>(5).map((l) => [l.phase_number, { status: l.status, legado_status: l.legado_status }])),
    entidades: Object.fromEntries(ENTIDADES.map((e, i) => [e, Number(linhas<{ n: number }>(6 + i)[0]?.n ?? 0)])) as Record<Entidade, number>,
  };
}
