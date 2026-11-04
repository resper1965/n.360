-- 0097_ot_sensor_rede.sql — n.ot L3: sensor de rede (resumo do Zeek). Faixas internas do site e fluxos pendentes (só hash, nunca IP em claro).
-- Aditiva: uma coluna em ot_sites (ALTER, roda uma vez pelo runner) e uma tabela nova repetível (IF NOT EXISTS).
-- Verificar depois de aplicar: SELECT name FROM pragma_table_info('ot_sites') WHERE name = 'faixas_internas' → 1 linha;
--                              SELECT name FROM sqlite_master WHERE name = 'ot_fluxos_pendentes' → 1 linha.
ALTER TABLE ot_sites ADD COLUMN faixas_internas TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(faixas_internas) AND json_type(faixas_internas) = 'array');

-- Hash nulo = lado externo (nunca o HMAC de IP externo); ao menos um lado é interno.
CREATE TABLE IF NOT EXISTS ot_fluxos_pendentes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    levantamento_id TEXT NOT NULL,
    origem_ip_hash TEXT,
    destino_ip_hash TEXT,
    dados TEXT NOT NULL CHECK (json_valid(dados) AND json_type(dados) = 'object'),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (origem_ip_hash IS NOT NULL OR destino_ip_hash IS NOT NULL),
    FOREIGN KEY (levantamento_id, project_id) REFERENCES ot_levantamentos(id, project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ot_fluxos_pend_origem ON ot_fluxos_pendentes(project_id, origem_ip_hash);
CREATE INDEX IF NOT EXISTS idx_ot_fluxos_pend_destino ON ot_fluxos_pendentes(project_id, destino_ip_hash);
