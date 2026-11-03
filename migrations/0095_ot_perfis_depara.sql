-- 0095_ot_perfis_depara.sql — n.ot L4 (spec 2026-11-03 §2): perfis de de-para, cabeçalho de planilha → campos do ativo.
-- Aditiva e repetível (IF NOT EXISTS); não toca tabela existente. Uma assinatura (hash do cabeçalho) por projeto.
-- Verificar depois de aplicar: SELECT name FROM sqlite_master WHERE name='ot_perfis_depara' → 1 linha.
CREATE TABLE IF NOT EXISTS ot_perfis_depara (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    nome TEXT NOT NULL CHECK (length(nome) BETWEEN 1 AND 100),
    fonte TEXT NOT NULL DEFAULT '' CHECK (length(fonte) <= 200),
    assinatura TEXT NOT NULL CHECK (length(assinatura) = 64),
    mapeamento TEXT NOT NULL CHECK (json_valid(mapeamento) AND json_type(mapeamento) = 'object'),
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'removido')),
    criado_por TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, assinatura)
);
CREATE INDEX IF NOT EXISTS idx_ot_perfis_depara_projeto ON ot_perfis_depara(project_id);
