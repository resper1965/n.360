-- 0112 — n.ot: assessment RO-CB.BR.01 (spec 2026-11-11 fluidez §5 e §6). Aditiva.
-- Verificar depois de aplicar: SELECT name FROM sqlite_master WHERE name IN ('ot_avaliacoes','ot_requisito_evidencias') → 2 linhas.
CREATE TABLE IF NOT EXISTS ot_avaliacoes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    requisito_id TEXT NOT NULL REFERENCES ot_requisitos(id),
    situacao TEXT NOT NULL CHECK (situacao IN ('atende', 'parcial', 'nao_atende', 'nao_se_aplica')),
    justificativa TEXT,
    responsavel_id TEXT,
    proxima_revisao TEXT,
    confirmado_por TEXT,
    confirmado_em DATETIME,
    atualizado_por TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, requisito_id),
    CHECK (situacao = 'atende' OR length(trim(coalesce(justificativa, ''))) >= 3)
);
CREATE INDEX IF NOT EXISTS idx_ot_avaliacoes_projeto ON ot_avaliacoes(project_id);
CREATE TABLE IF NOT EXISTS ot_requisito_evidencias (
    evidencia_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    requisito_id TEXT NOT NULL REFERENCES ot_requisitos(id),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (evidencia_id, requisito_id)
);
CREATE INDEX IF NOT EXISTS idx_ot_req_evid_projeto ON ot_requisito_evidencias(project_id, requisito_id);
