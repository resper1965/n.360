-- 0108_ot_desvios.sql — n.ot: desvios (fluxo ou ativo fora do esperado) com situação e prazo de aceite. Aditiva e repetível.
-- Verificar depois de aplicar: SELECT name FROM sqlite_master WHERE name = 'ot_desvios' → 1 linha.
CREATE TABLE IF NOT EXISTS ot_desvios (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    site_id TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('fluxo', 'ativo')),
    chave_sensor TEXT NOT NULL,
    dados TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(dados) AND json_type(dados) = 'object'
        AND json_type(dados, '$.ip') IS NULL AND json_type(dados, '$.mac') IS NULL
        AND (json_extract(dados, '$.ip_cifrado') IS NULL OR json_extract(dados, '$.ip_cifrado') LIKE 'ot1:%')
        AND (json_extract(dados, '$.mac_cifrado') IS NULL OR json_extract(dados, '$.mac_cifrado') LIKE 'ot1:%')),
    situacao TEXT NOT NULL DEFAULT 'aberto' CHECK (situacao IN ('aberto', 'regularizado', 'tratado', 'aceito')),
    aceito_ate DATETIME,
    nota TEXT,
    primeira_vez DATETIME NOT NULL,
    ultima_vez DATETIME NOT NULL,
    ocorrencias INTEGER NOT NULL DEFAULT 1,
    sensor_id TEXT,
    atualizado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, tipo, chave_sensor),
    FOREIGN KEY (site_id, project_id) REFERENCES ot_sites(id, project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ot_desvios_situacao ON ot_desvios(project_id, situacao);
CREATE INDEX IF NOT EXISTS idx_ot_desvios_site ON ot_desvios(project_id, site_id);
