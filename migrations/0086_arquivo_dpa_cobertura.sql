-- 0086: o documento em arquivo (0081) passa a poder servir de DPA/contrato do fornecedor e de cobertura de requisito (decisão do dono, 27/10/2026).
-- Duas tabelas novas, espelho de `documento_partes` e `documento_requisitos` (que ligam só os documentos versionados). Nada existente muda.
-- Só conta como DPA ou cobertura o arquivo PUBLICADO e com arquivo anexado (a regra vive no servidor, não aqui).
-- Antes de aplicar em produção (só com o "sim" do dono): npm run db:backup.
-- Conferir depois: SELECT name FROM sqlite_master WHERE name LIKE 'documentos_arquivo_%' (duas tabelas e dois índices); count(*) = 0 nas duas.
CREATE TABLE IF NOT EXISTS documentos_arquivo_partes (
    documento_arquivo_id TEXT NOT NULL REFERENCES documentos_arquivo(id) ON DELETE CASCADE,
    parte_id TEXT NOT NULL REFERENCES partes(id) ON DELETE CASCADE,
    papel TEXT NOT NULL DEFAULT 'dpa' CHECK (papel IN ('dpa', 'contrato', 'outro')),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (documento_arquivo_id, parte_id, papel)
);
CREATE INDEX IF NOT EXISTS idx_doc_arquivo_partes_parte ON documentos_arquivo_partes(parte_id);

CREATE TABLE IF NOT EXISTS documentos_arquivo_requisitos (
    documento_arquivo_id TEXT NOT NULL REFERENCES documentos_arquivo(id) ON DELETE CASCADE,
    requisito_id TEXT NOT NULL REFERENCES requisitos(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (documento_arquivo_id, requisito_id)
);
CREATE INDEX IF NOT EXISTS idx_doc_arquivo_req_requisito ON documentos_arquivo_requisitos(requisito_id);
