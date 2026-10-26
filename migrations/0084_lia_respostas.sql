-- 0084: respostas do questionário da LIA, as 12 perguntas do legado (decisão do dono de 26/10/2026, spec 2026-10-26-lia-12-perguntas-design.md).
-- Tabela própria, no molde de dpia_respostas (0083): as colunas de lia_assessments continuam e viram a aba Conclusão.
-- Aditiva: só cria a tabela, o índice e o gatilho. Antes de aplicar em produção (só com o "sim" do dono): npm run db:backup.
CREATE TABLE IF NOT EXISTS lia_respostas (
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    pergunta TEXT NOT NULL CHECK (length(pergunta) BETWEEN 1 AND 60),
    resposta TEXT NOT NULL CHECK (length(resposta) <= 2000),
    updated_by TEXT,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ropa_id, pergunta)
);
CREATE INDEX IF NOT EXISTS idx_lia_respostas_projeto ON lia_respostas(project_id);

CREATE TRIGGER IF NOT EXISTS lia_respostas_do_projeto_ins BEFORE INSERT ON lia_respostas
WHEN NOT EXISTS (SELECT 1 FROM ropa_records r WHERE r.id = NEW.ropa_id AND r.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'tratamento inexistente ou de outro projeto');
END;
