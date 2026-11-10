-- 0107_requisito_exclusoes.sql — requisito "não aplicável" por projeto, com justificativa (spec 2026-11-09-requisito-nao-aplicavel-design).
-- Aditiva e repetível. Desmarcar apaga a linha; marcar e desmarcar vão para a trilha (sem a justificativa).
-- Verificar: SELECT name FROM sqlite_master WHERE name = 'requisito_exclusoes'; -- 1
CREATE TABLE IF NOT EXISTS requisito_exclusoes (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    requisito_id TEXT NOT NULL REFERENCES requisitos(id) ON DELETE CASCADE,
    justificativa TEXT NOT NULL CHECK (length(trim(justificativa)) >= 20 AND length(justificativa) <= 2000),
    decidido_por TEXT NOT NULL,
    decidido_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, requisito_id)
);
