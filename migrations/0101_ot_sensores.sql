-- 0101_ot_sensores.sql — n.ot: sonda com envio automático. Sondas, credenciais, envios idempotentes e chave de novidade nos achados/fluxos.
-- Aditiva: duas colunas por ALTER (rodam uma vez pelo runner) e o resto repetível (IF NOT EXISTS).
-- Verificar depois de aplicar: SELECT name FROM sqlite_master WHERE name IN ('ot_sensores','ot_sensor_credenciais','ot_sensor_envios') → 3 linhas;
--                              SELECT name FROM pragma_table_info('ot_achados') WHERE name = 'chave_sensor' → 1 linha.
ALTER TABLE ot_achados ADD COLUMN chave_sensor TEXT;
ALTER TABLE ot_fluxos_pendentes ADD COLUMN chave_sensor TEXT;
CREATE INDEX IF NOT EXISTS idx_ot_achados_chave_sensor ON ot_achados(project_id, chave_sensor);
CREATE INDEX IF NOT EXISTS idx_ot_fluxos_pend_chave ON ot_fluxos_pendentes(project_id, chave_sensor);
CREATE TABLE IF NOT EXISTS ot_sensores (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    site_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    faixa_origem TEXT NOT NULL,
    situacao TEXT NOT NULL DEFAULT 'ativa' CHECK (situacao IN ('ativa', 'revogada')),
    criado_por TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id, project_id),
    FOREIGN KEY (site_id, project_id) REFERENCES ot_sites(id, project_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS ot_sensor_credenciais (
    id TEXT PRIMARY KEY,
    sensor_id TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    chave_hash TEXT NOT NULL UNIQUE,
    expira_em DATETIME NOT NULL,
    situacao TEXT NOT NULL DEFAULT 'ativa' CHECK (situacao IN ('ativa', 'revogada')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sensor_id, project_id) REFERENCES ot_sensores(id, project_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS ot_sensor_envios (
    id TEXT PRIMARY KEY,
    sensor_id TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    impressao TEXT NOT NULL,
    situacao TEXT NOT NULL DEFAULT 'processando' CHECK (situacao IN ('processando', 'concluido')),
    levantamento_id TEXT,
    periodo_inicio TEXT,
    periodo_fim TEXT,
    capture_loss REAL,
    versao_script TEXT,
    contagens TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(contagens) AND json_type(contagens) = 'object'),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (sensor_id, impressao),
    FOREIGN KEY (sensor_id, project_id) REFERENCES ot_sensores(id, project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ot_sensor_envios ON ot_sensor_envios(sensor_id, created_at);
