-- 0097_orgaos_publicos.sql — órgãos públicos destinatários da atividade, um por linha (aba Agentes de Tratamento).
-- Aditiva e repetível (IF NOT EXISTS); não toca tabela existente. `ropa_records.recipients` continua sendo o texto
-- do conteúdo congelado da aprovação: o serviço o reescreve a partir destas linhas a cada gravação.
-- Verificar depois de aplicar:
--   SELECT name FROM sqlite_master WHERE name = 'tratamento_orgaos_publicos'; -- 1 linha
CREATE TABLE IF NOT EXISTS tratamento_orgaos_publicos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    nome TEXT NOT NULL CHECK (length(nome) BETWEEN 1 AND 200),
    obrigacao_legal TEXT CHECK (obrigacao_legal IS NULL OR length(obrigacao_legal) <= 500),
    created_by TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_orgaos_publicos_ropa ON tratamento_orgaos_publicos(ropa_id);
CREATE TRIGGER IF NOT EXISTS orgaos_publicos_do_projeto_ins BEFORE INSERT ON tratamento_orgaos_publicos
WHEN NOT EXISTS (SELECT 1 FROM ropa_records r WHERE r.id = NEW.ropa_id AND r.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'tratamento inexistente ou de outro projeto');
END;
