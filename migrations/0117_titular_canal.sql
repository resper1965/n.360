-- 0117 — canal do titular (spec 2026-11-19-canal-do-titular-design). Aditiva e repetível. Uma linha por projeto: por onde o titular fala
-- com a empresa e a página pública onde canal e encarregado aparecem. Nunca guarda o link do portal (credencial; o serviço recusa).
-- `id` existe para as varreduras de isolamento (pulam tabela sem `id`); o UNIQUE de project_id garante uma linha por projeto.
-- Verificar depois de aplicar: PRAGMA table_info(titular_canal) → 11 colunas.
CREATE TABLE IF NOT EXISTS titular_canal (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    email TEXT CHECK (email IS NULL OR length(email) <= 200),
    telefone TEXT CHECK (telefone IS NULL OR length(telefone) <= 40),
    formulario_url TEXT CHECK (formulario_url IS NULL OR length(formulario_url) <= 500),
    divulgacao_url TEXT CHECK (divulgacao_url IS NULL OR length(divulgacao_url) <= 500),
    responsavel_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
    conferido_em TEXT,
    conferido_por TEXT,
    atualizado_por TEXT,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
