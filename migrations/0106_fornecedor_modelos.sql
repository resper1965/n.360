-- 0106_fornecedor_modelos.sql — modelos de avaliação de fornecedor da consultoria (spec 2026-11-09-ciclo-avaliacao-fornecedor-design).
-- Os ALTER rodam uma vez pelo runner; tabelas, índices e gatilho são repetíveis; os UPDATE/DELETE de dados rodam uma vez com o runner.
-- Verificar: SELECT name FROM sqlite_master WHERE name IN ('fornecedor_modelos','fornecedor_modelo_perguntas','homologacao_ajustes','homologacao_email_some'); -- 4
--            SELECT name FROM pragma_table_info('homologacoes') WHERE name IN ('tipo','email_destino','lembrete_em'); -- 3
ALTER TABLE homologacao_perguntas ADD COLUMN tipo TEXT CHECK (tipo IS NULL OR tipo IN ('critico', 'medio', 'pequeno'));
ALTER TABLE avaliacoes_terceiro ADD COLUMN tipo_avaliado TEXT;
ALTER TABLE homologacoes ADD COLUMN tipo TEXT;
ALTER TABLE homologacoes ADD COLUMN email_destino TEXT;
ALTER TABLE homologacoes ADD COLUMN lembrete_em DATETIME;
CREATE TABLE IF NOT EXISTS fornecedor_modelos (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('critico', 'medio', 'pequeno', 'grande_provedor')),
    prazo_meses INTEGER NOT NULL CHECK (prazo_meses BETWEEN 1 AND 60),
    origem TEXT NOT NULL DEFAULT 'padrao' CHECK (origem IN ('padrao', 'consultoria')),
    atualizado_por TEXT,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (org_id, tipo)
);
CREATE TABLE IF NOT EXISTS fornecedor_modelo_perguntas (
    id TEXT PRIMARY KEY,
    modelo_id TEXT NOT NULL REFERENCES fornecedor_modelos(id) ON DELETE CASCADE,
    tema TEXT NOT NULL CHECK (length(tema) BETWEEN 1 AND 80),
    texto TEXT NOT NULL CHECK (length(texto) BETWEEN 1 AND 500),
    ordem INTEGER NOT NULL DEFAULT 0,
    ativa INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0, 1)),
    origem TEXT NOT NULL DEFAULT 'consultoria' CHECK (origem IN ('padrao', 'consultoria')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fornecedor_modelo_perguntas ON fornecedor_modelo_perguntas(modelo_id, ordem);
CREATE TABLE IF NOT EXISTS homologacao_ajustes (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    modelo_pergunta_id TEXT NOT NULL REFERENCES fornecedor_modelo_perguntas(id) ON DELETE CASCADE,
    ativa INTEGER NOT NULL DEFAULT 0 CHECK (ativa IN (0, 1)),
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, modelo_pergunta_id)
);
CREATE TRIGGER IF NOT EXISTS homologacao_email_some
AFTER UPDATE OF status ON homologacoes
WHEN NEW.status <> 'aberta' AND NEW.email_destino IS NOT NULL
BEGIN
    UPDATE homologacoes SET email_destino = NULL WHERE id = NEW.id;
END;
UPDATE avaliacoes_terceiro SET tipo_avaliado = (SELECT p.terceiro_tipo FROM partes p WHERE p.id = avaliacoes_terceiro.parte_id) WHERE tipo_avaliado IS NULL;
UPDATE homologacoes SET tipo = (SELECT p.terceiro_tipo FROM partes p WHERE p.id = homologacoes.parte_id) WHERE tipo IS NULL;
DELETE FROM homologacao_perguntas WHERE origem = 'padrao';
