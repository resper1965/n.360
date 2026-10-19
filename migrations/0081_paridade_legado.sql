-- 0081: paridade com o legado, frente B (spec 2026-10-19-paridade-legado-menu-design.md). Aditiva: uma coluna nula e uma tabela nova.
-- departamentos ganha a descrição da área (nula nas linhas existentes). documentos_arquivo é o documento do legado: um arquivo com
-- metadados (tipo, situação, vencimento, responsável); não substitui os documentos versionados (políticas). Sem carga.
-- NÃO é idempotente (ADD COLUMN): aplicar só pelo migrations apply. Backup antes: npm run db:backup.
-- Conferir depois: PRAGMA table_info(departamentos) mostra descricao; PRAGMA table_info(documentos_arquivo); SELECT count(*) (esperado 0).

ALTER TABLE departamentos ADD COLUMN descricao TEXT;
-- catalogo_itens ganha a descrição do titular (nula nas linhas existentes). Coluna nova, sem mexer no CHECK de descricao_padrao.
ALTER TABLE catalogo_itens ADD COLUMN descricao TEXT CHECK (descricao IS NULL OR (tipo = 'titular' AND length(descricao) <= 2000));

CREATE TABLE IF NOT EXISTS documentos_arquivo (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('politica', 'norma', 'procedimento', 'termo', 'contrato', 'aditivo', 'relatorio', 'outro')),
    status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicado', 'obsoleto')),
    vencimento DATE,
    sem_vencimento INTEGER NOT NULL DEFAULT 0 CHECK (sem_vencimento IN (0, 1)),
    responsavel_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
    r2_key TEXT,
    arquivo_nome TEXT,
    arquivo_tipo TEXT CHECK (arquivo_tipo IS NULL OR arquivo_tipo IN ('pdf', 'doc', 'docx')),
    criado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (sem_vencimento = 0 OR vencimento IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_documentos_arquivo_projeto ON documentos_arquivo(project_id, nome);
