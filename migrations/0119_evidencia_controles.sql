-- 0119 — evidência ligada a vários controles (N:N). Aditiva.
-- Antes, cada evidência tinha um controle só (evidence.control_id), e o mesmo documento que cobre
-- vários controles precisava ser duplicado. Agora o vínculo é evidencia_controles; evidence.control_id
-- fica como o PRIMEIRO vínculo, para leitura compatível, e não é apagado nem alterado aqui.
--
-- Carga: todo control_id de hoje vira o primeiro vínculo, quando evidência e controle são do MESMO
-- projeto. O vínculo legado a controle de outro projeto (ou de evidência sem projeto) não é carregado:
-- seria evidência de um cliente aparecendo no controle de outro. Ele continua em evidence.control_id.
--
-- ANTES de aplicar em produção, rode e anote (deve ser 0; se não for, avise antes de aplicar):
--   SELECT COUNT(*) FROM evidence e WHERE e.control_id IS NOT NULL AND NOT EXISTS (
--     SELECT 1 FROM compliance_controls c WHERE c.id = e.control_id AND c.project_id = e.project_id);
-- e o total que deve ser carregado:
--   SELECT COUNT(*) FROM evidence e JOIN compliance_controls c ON c.id = e.control_id AND c.project_id = e.project_id;
-- DEPOIS de aplicar: SELECT COUNT(*) FROM evidencia_controles; deve ser igual ao total acima.

CREATE TABLE IF NOT EXISTS evidencia_controles (
    evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    control_id TEXT NOT NULL REFERENCES compliance_controls(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ligado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (evidence_id, control_id)
);
CREATE INDEX IF NOT EXISTS idx_evid_controles_controle ON evidencia_controles(control_id);
CREATE INDEX IF NOT EXISTS idx_evid_controles_projeto ON evidencia_controles(project_id);

INSERT OR IGNORE INTO evidencia_controles (evidence_id, control_id, project_id, ligado_por, created_at)
  SELECT e.id, e.control_id, e.project_id, e.uploaded_by, COALESCE(e.created_at, CURRENT_TIMESTAMP)
    FROM evidence e JOIN compliance_controls c ON c.id = e.control_id AND c.project_id = e.project_id;

-- Isolamento no banco: evidência e controle do mesmo projeto da linha.
CREATE TRIGGER IF NOT EXISTS evidencia_controles_do_projeto
BEFORE INSERT ON evidencia_controles
WHEN NOT EXISTS (SELECT 1 FROM evidence e WHERE e.id = NEW.evidence_id AND e.project_id IS NEW.project_id)
  OR NOT EXISTS (SELECT 1 FROM compliance_controls c WHERE c.id = NEW.control_id AND c.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'evidência ou controle inexistente ou de outro projeto');
END;

-- Toda evidência nova com control_id (upload, checklist, importação, agente) nasce com esse vínculo.
CREATE TRIGGER IF NOT EXISTS evidencia_controle_inicial
AFTER INSERT ON evidence
WHEN NEW.control_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM compliance_controls c WHERE c.id = NEW.control_id AND c.project_id IS NEW.project_id)
BEGIN
    INSERT OR IGNORE INTO evidencia_controles (evidence_id, control_id, project_id, ligado_por)
      VALUES (NEW.id, NEW.control_id, NEW.project_id, NEW.uploaded_by);
END;
