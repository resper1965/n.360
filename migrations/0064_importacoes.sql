-- 0064: importação de programa de privacidade (n.privacy, fatia 1). Lote, arquivos (no R2 STORAGE) e itens propostos
-- pelo agente, que só viram registro do RoPA depois do "sim" de uma pessoa. Tabelas novas: nada existente muda.

CREATE TABLE IF NOT EXISTS importacoes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    criado_por TEXT,
    status TEXT NOT NULL DEFAULT 'recebendo' CHECK (status IN ('recebendo', 'processando', 'em_revisao', 'gravando', 'concluida', 'cancelada')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_importacoes_projeto ON importacoes(project_id, created_at);

CREATE TABLE IF NOT EXISTS importacao_arquivos (
    id TEXT PRIMARY KEY,
    importacao_id TEXT NOT NULL REFERENCES importacoes(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    mime TEXT NOT NULL,
    tamanho INTEGER NOT NULL,
    r2_key TEXT NOT NULL,
    tipo TEXT CHECK (tipo IS NULL OR tipo IN ('inventario', 'terceiros', 'documento', 'avaliacao', 'historico', 'desconhecido')),
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processado', 'aguardando', 'erro')),
    erro TEXT,
    modelo TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_importacao_arquivos_lote ON importacao_arquivos(importacao_id);
CREATE INDEX IF NOT EXISTS idx_importacao_arquivos_projeto ON importacao_arquivos(project_id);

CREATE TABLE IF NOT EXISTS importacao_itens (
    id TEXT PRIMARY KEY,
    importacao_id TEXT NOT NULL REFERENCES importacoes(id) ON DELETE CASCADE,
    arquivo_id TEXT NOT NULL REFERENCES importacao_arquivos(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    entidade TEXT NOT NULL DEFAULT 'tratamento' CHECK (entidade IN ('tratamento')),
    dados TEXT NOT NULL DEFAULT '{}',
    origem TEXT CHECK (origem IS NULL OR length(origem) <= 500),
    confianca TEXT NOT NULL DEFAULT 'baixa' CHECK (confianca IN ('alta', 'media', 'baixa')),
    faltando TEXT NOT NULL DEFAULT '[]',
    duplicata_de TEXT REFERENCES ropa_records(id) ON DELETE SET NULL,
    decisao TEXT NOT NULL DEFAULT 'pendente' CHECK (decisao IN ('pendente', 'aceito', 'descartado', 'gravado', 'recusado')),
    motivo TEXT,
    registro_id TEXT REFERENCES ropa_records(id) ON DELETE SET NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_importacao_itens_lote ON importacao_itens(importacao_id, decisao);
CREATE INDEX IF NOT EXISTS idx_importacao_itens_arquivo ON importacao_itens(arquivo_id);
CREATE INDEX IF NOT EXISTS idx_importacao_itens_projeto ON importacao_itens(project_id);
