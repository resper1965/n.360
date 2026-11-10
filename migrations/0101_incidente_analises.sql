-- 0101_incidente_analises.sql — análises do incidente (fatia 3, spec 2026-11-04-incidentes-legado-design).
-- Várias análises por incidente, cada uma com autor e data; só o autor altera a sua (regra no serviço). O risco ao titular continua sendo a
-- avaliação formal (`incidentes.risco_titular`); a análise é o registro do trabalho. Aditiva e repetível (IF NOT EXISTS). Verificar:
--   SELECT name FROM sqlite_master WHERE name IN ('incidente_analises','incidente_analises_do_projeto','incidente_analises_aberto'); -- 3 linhas
CREATE TABLE IF NOT EXISTS incidente_analises (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    incidente_id TEXT NOT NULL REFERENCES incidentes(id) ON DELETE CASCADE,
    autor TEXT NOT NULL,
    texto TEXT NOT NULL CHECK (length(texto) BETWEEN 1 AND 10000),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_incidente_analises ON incidente_analises(incidente_id, created_at);
CREATE TRIGGER IF NOT EXISTS incidente_analises_do_projeto BEFORE INSERT ON incidente_analises
WHEN NOT EXISTS (SELECT 1 FROM incidentes i WHERE i.id = NEW.incidente_id AND i.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'incidente inexistente ou de outro projeto');
END;
CREATE TRIGGER IF NOT EXISTS incidente_analises_aberto BEFORE INSERT ON incidente_analises
WHEN (SELECT status FROM incidentes WHERE id = NEW.incidente_id) = 'encerrado'
BEGIN
    SELECT RAISE(ABORT, 'incidente encerrado não muda');
END;
