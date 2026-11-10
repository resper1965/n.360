-- 0103_incidente_postmortem.sql — post mortem do incidente (fatia 5, spec 2026-11-04-incidentes-legado-design): uma resposta por
-- pergunta (`src/data/incidente-postmortem.ts`, as 14 do legado). Abre só depois do encerramento: os gatilhos recusam gravar resposta em
-- incidente que não está encerrado, também por SQL direto. Responder não reabre o incidente. Aditiva e repetível. Verificar:
--   SELECT name FROM sqlite_master WHERE name IN ('incidente_postmortem','incidente_postmortem_ins','incidente_postmortem_upd'); -- 3 linhas
CREATE TABLE IF NOT EXISTS incidente_postmortem (
    incidente_id TEXT NOT NULL REFERENCES incidentes(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    pergunta TEXT NOT NULL CHECK (length(pergunta) BETWEEN 1 AND 60),
    resposta TEXT NOT NULL CHECK (length(resposta) BETWEEN 1 AND 5000),
    updated_by TEXT,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (incidente_id, pergunta)
);
CREATE INDEX IF NOT EXISTS idx_incidente_postmortem_projeto ON incidente_postmortem(project_id);
CREATE TRIGGER IF NOT EXISTS incidente_postmortem_ins BEFORE INSERT ON incidente_postmortem
WHEN NOT EXISTS (SELECT 1 FROM incidentes i WHERE i.id = NEW.incidente_id AND i.project_id IS NEW.project_id AND i.status = 'encerrado')
BEGIN
    SELECT RAISE(ABORT, 'post mortem só de incidente encerrado do mesmo projeto');
END;
CREATE TRIGGER IF NOT EXISTS incidente_postmortem_upd BEFORE UPDATE ON incidente_postmortem
WHEN NOT EXISTS (SELECT 1 FROM incidentes i WHERE i.id = NEW.incidente_id AND i.project_id IS NEW.project_id AND i.status = 'encerrado')
BEGIN
    SELECT RAISE(ABORT, 'post mortem só de incidente encerrado do mesmo projeto');
END;
