-- 0122 — evidência do tratamento ligada ao RISCO (N:N). Aditiva: cria uma tabela, dois índices e um gatilho; não altera dado nenhum.
-- O plano de tratamento faz parte do estado aceito do risco (0120): editar o plano para dizer "cumprido" derrubaria o aceite.
-- Ligar a evidência ao risco registra o cumprimento sem tocar o risco: a tabela não entra no conteúdo congelado nem no hash do aceite.
--
-- DEPOIS de aplicar: `PRAGMA table_info(evidencia_riscos)` lista 5 colunas e `SELECT COUNT(*) FROM evidencia_riscos` devolve 0.
CREATE TABLE IF NOT EXISTS evidencia_riscos (
    evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    risk_id TEXT NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ligado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (evidence_id, risk_id)
);
CREATE INDEX IF NOT EXISTS idx_evid_riscos_risco ON evidencia_riscos(risk_id);
CREATE INDEX IF NOT EXISTS idx_evid_riscos_projeto ON evidencia_riscos(project_id);

-- Isolamento no banco: evidência e risco do mesmo projeto da linha.
CREATE TRIGGER IF NOT EXISTS evidencia_riscos_do_projeto
BEFORE INSERT ON evidencia_riscos
WHEN NOT EXISTS (SELECT 1 FROM evidence e WHERE e.id = NEW.evidence_id AND e.project_id IS NEW.project_id)
  OR NOT EXISTS (SELECT 1 FROM risks r WHERE r.id = NEW.risk_id AND r.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'evidência ou risco inexistente ou de outro projeto');
END;
