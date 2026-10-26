-- 0083: respostas do questionário do RIPD (decisão do dono de 26/10/2026, spec 2026-10-26-ripd-questionario-design.md).
-- Ficam em tabela própria, FORA das colunas do hash da aprovação (COLUNAS_DPIA): gravar resposta não derruba aprovação.
-- Aditiva: só cria a tabela, o índice e o gatilho. Antes de aplicar em produção (só com o "sim" do dono): npm run db:backup.
CREATE TABLE IF NOT EXISTS dpia_respostas (
    dpia_id TEXT NOT NULL REFERENCES dpia_assessments(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    pergunta TEXT NOT NULL CHECK (length(pergunta) BETWEEN 1 AND 60),
    resposta TEXT NOT NULL CHECK (length(resposta) <= 2000),
    updated_by TEXT,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (dpia_id, pergunta)
);
CREATE INDEX IF NOT EXISTS idx_dpia_respostas_projeto ON dpia_respostas(project_id);

CREATE TRIGGER IF NOT EXISTS dpia_respostas_do_projeto_ins BEFORE INSERT ON dpia_respostas
WHEN NOT EXISTS (SELECT 1 FROM dpia_assessments d WHERE d.id = NEW.dpia_id AND d.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'RIPD inexistente ou de outro projeto');
END;
