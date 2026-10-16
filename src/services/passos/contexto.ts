import { type Entidade } from '../../data/passos/tipos';

// Esqueleto do pacote 0: só as consultas de contagem (código da tarefa A1). O pacote A completa o arquivo (`carregarContexto`).
/** Uma consulta por entidade, todas com `project_id = ?`. Lista fechada: o catálogo só cita as chaves daqui. */
export const CONSULTAS_ENTIDADE: Record<Entidade, string> = {
  riscos: `SELECT COUNT(*) AS n FROM risks WHERE project_id = ?`,
  ativos: `SELECT COUNT(*) AS n FROM itens WHERE project_id = ? AND status = 'ativo'`,
  controles_implementados: `SELECT COUNT(*) AS n FROM compliance_controls WHERE project_id = ? AND status IN ('Implemented', 'Compliant')`,
  documentos_vigentes: `SELECT COUNT(*) AS n FROM documentos WHERE project_id = ? AND status = 'vigente'`,
  atividades_ropa: `SELECT COUNT(*) AS n FROM ropa_records WHERE project_id = ?`,
  ripd: `SELECT COUNT(*) AS n FROM dpia_assessments WHERE project_id = ?`,
  fornecedores: `SELECT COUNT(*) AS n FROM vendors WHERE project_id = ?`,
  treinamentos: `SELECT COUNT(*) AS n FROM training_records WHERE project_id = ?`,
  auditorias: `SELECT COUNT(*) AS n FROM audit_schedule WHERE project_id = ?`,
  analises_criticas: `SELECT COUNT(*) AS n FROM management_reviews WHERE project_id = ?`,
  acoes_corretivas: `SELECT COUNT(*) AS n FROM corrective_actions WHERE project_id = ?`,
  partes_interessadas: `SELECT COUNT(*) AS n FROM stakeholders WHERE project_id = ?`,
  governanca: `SELECT COUNT(*) AS n FROM project_governance WHERE project_id = ?`,
  incidentes: `SELECT COUNT(*) AS n FROM incidentes WHERE project_id = ?`,
  metricas: `SELECT COUNT(*) AS n FROM performance_metrics WHERE project_id = ?`,
};
