-- 0116 — onda 3: fornecedor de OT (satélite ot_*, fora da exportação). Aditiva. Verificar depois de aplicar:
--   SELECT name FROM sqlite_master WHERE name = 'ot_fornecedores' → 1 linha.
CREATE TABLE IF NOT EXISTS ot_fornecedores (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parte_id TEXT NOT NULL REFERENCES partes(id) ON DELETE CASCADE,
    papel TEXT NOT NULL CHECK (papel IN ('integrador', 'fabricante', 'acesso_remoto')),
    ot_site_id TEXT,
    ot_fluxo_id TEXT REFERENCES ot_fluxos(id) ON DELETE CASCADE,
    criado_por TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (ot_site_id IS NOT NULL OR ot_fluxo_id IS NOT NULL),
    FOREIGN KEY (ot_site_id, project_id) REFERENCES ot_sites(id, project_id) ON DELETE CASCADE
);
-- UNIQUE comum não barra duplicata com NULL (o SQLite trata cada NULL como distinto): o índice troca NULL por ''.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ot_forn_unico ON ot_fornecedores(project_id, parte_id, papel, COALESCE(ot_site_id, ''), COALESCE(ot_fluxo_id, ''));
CREATE INDEX IF NOT EXISTS idx_ot_forn_projeto ON ot_fornecedores(project_id);
CREATE INDEX IF NOT EXISTS idx_ot_forn_parte ON ot_fornecedores(parte_id);
