-- 0072: teste de impacto do tratamento (13 perguntas do legado: 2 de critério geral e 11 de específico), uma resposta por pergunta.
-- A pergunta é texto validado no código (o catálogo pode mudar sem migration). Nada disso entra no conteúdo congelado da aprovação
-- do RoPA nem da DPIA. `origem_hash`: o hash do conteúdo do tratamento quando a DPIA/LIA nasceu dele (NULL nas existentes).
-- ADD COLUMN não é idempotente ("duplicate column"): aplicar uma vez, pelo `migrations apply`.
CREATE TABLE IF NOT EXISTS tratamento_impacto (
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    pergunta TEXT NOT NULL,
    resposta TEXT NOT NULL CHECK (resposta IN ('sim', 'nao', 'nao_sei')),
    atualizado_por TEXT,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ropa_id, pergunta)
);
CREATE INDEX IF NOT EXISTS idx_tratamento_impacto_projeto ON tratamento_impacto(project_id);
ALTER TABLE ropa_records ADD COLUMN impacto_finalizado_em DATETIME;
ALTER TABLE dpia_assessments ADD COLUMN origem_hash TEXT;
ALTER TABLE lia_assessments ADD COLUMN origem_hash TEXT;
