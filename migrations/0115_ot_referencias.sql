-- 0115 — onda 3: referência núcleo → OT (satélite ot_*, fora da exportação). Aditiva. Verificar depois de aplicar:
--   SELECT name FROM sqlite_master WHERE name = 'ot_referencias' → 1 linha.
CREATE TABLE IF NOT EXISTS ot_referencias (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    risk_id TEXT REFERENCES risks(id) ON DELETE CASCADE,
    acao_id TEXT REFERENCES corrective_actions(id) ON DELETE CASCADE,
    incidente_id TEXT REFERENCES incidentes(id) ON DELETE CASCADE,
    ot_site_id TEXT,
    ot_ativo_id TEXT,
    ot_desvio_id TEXT REFERENCES ot_desvios(id) ON DELETE CASCADE,
    criado_por TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((risk_id IS NOT NULL) + (acao_id IS NOT NULL) + (incidente_id IS NOT NULL) = 1),
    CHECK (ot_site_id IS NOT NULL OR ot_ativo_id IS NOT NULL),
    UNIQUE (ot_desvio_id),
    FOREIGN KEY (ot_site_id, project_id) REFERENCES ot_sites(id, project_id) ON DELETE CASCADE,
    FOREIGN KEY (ot_ativo_id, project_id) REFERENCES ot_ativos(id, project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ot_ref_projeto ON ot_referencias(project_id);
CREATE INDEX IF NOT EXISTS idx_ot_ref_risk ON ot_referencias(risk_id);
CREATE INDEX IF NOT EXISTS idx_ot_ref_acao ON ot_referencias(acao_id);
CREATE INDEX IF NOT EXISTS idx_ot_ref_incidente ON ot_referencias(incidente_id);
