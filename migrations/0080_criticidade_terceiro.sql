-- 0080: avaliação de criticidade do fornecedor (spec 2026-10-18). Aditiva: cria uma tabela nova e não altera nenhuma existente.
-- Histórico append-only: a avaliação mais recente é a atual (como em avaliacoes_terceiro). O nível é derivado no servidor.
-- Sem carga: nenhuma avaliação é semeada. CREATE ... IF NOT EXISTS: pode ser aplicada de novo sem erro.
-- Backup antes: npm run db:backup. Conferir depois: PRAGMA table_info(criticidades_terceiro) e SELECT count(*) (esperado 0).

CREATE TABLE IF NOT EXISTS criticidades_terceiro (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parte_id TEXT NOT NULL REFERENCES partes(id) ON DELETE CASCADE,
    impacto TEXT NOT NULL CHECK (impacto IN ('alto', 'medio', 'baixo')),
    exclusividade TEXT NOT NULL CHECK (exclusividade IN ('sem_alternativas', 'poucas_alternativas', 'varias_alternativas')),
    risco_financeiro TEXT NOT NULL CHECK (risco_financeiro IN ('alto', 'medio', 'baixo')),
    conformidade TEXT NOT NULL CHECK (conformidade IN ('regulamentado', 'sem_regulamentacao')),
    risco_reputacional TEXT NOT NULL CHECK (risco_reputacional IN ('alto', 'medio', 'baixo')),
    nivel TEXT NOT NULL CHECK (nivel IN ('alto', 'medio', 'baixo')),
    avaliado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_criticidade_terceiro_parte ON criticidades_terceiro(parte_id, created_at);
CREATE INDEX IF NOT EXISTS idx_criticidade_terceiro_projeto ON criticidades_terceiro(project_id);
