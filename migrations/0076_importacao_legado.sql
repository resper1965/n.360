-- 0076: importação do legado (F6). `importacao_itens.entidade` passa a aceitar `risco`, `gap`, `impacto`, `ciclo` e `bases`, e a
-- tabela ganha `aviso` (o aviso da gravação, que hoje só volta na resposta da confirmação, para o relatório de reconciliação contar).
-- CHECK só muda por rebuild no SQLite: molde exato da 0067. Só esta tabela muda; nenhuma tabela aponta para `importacao_itens`, então o
-- DROP não cascateia nada; as FKs dela para lote, arquivo e projeto (CASCADE) seguem iguais e os três índices são recriados.
-- A cópia vai para `importacao_itens_new` ANTES do DROP: se parar no meio, a tabela original continua inteira (confira
-- `importacao_itens_new` antes de repetir). NÃO é idempotente (`CREATE TABLE` sem `IF NOT EXISTS`): aplicar uma vez, pelo `migrations apply`.

CREATE TABLE importacao_itens_new (
    id TEXT PRIMARY KEY,
    importacao_id TEXT NOT NULL REFERENCES importacoes(id) ON DELETE CASCADE,
    arquivo_id TEXT NOT NULL REFERENCES importacao_arquivos(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    entidade TEXT NOT NULL DEFAULT 'tratamento' CHECK (entidade IN ('tratamento', 'terceiro', 'documento', 'dpia', 'lia', 'titular_pedido', 'incidente', 'consentimento', 'risco', 'gap', 'impacto', 'ciclo', 'bases')),
    dados TEXT NOT NULL DEFAULT '{}',
    origem TEXT CHECK (origem IS NULL OR length(origem) <= 500),
    confianca TEXT NOT NULL DEFAULT 'baixa' CHECK (confianca IN ('alta', 'media', 'baixa')),
    faltando TEXT NOT NULL DEFAULT '[]',
    duplicata_de TEXT,
    decisao TEXT NOT NULL DEFAULT 'pendente' CHECK (decisao IN ('pendente', 'aceito', 'descartado', 'gravado', 'recusado')),
    motivo TEXT,
    registro_id TEXT,
    aviso TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO importacao_itens_new (id, importacao_id, arquivo_id, project_id, entidade, dados, origem, confianca, faltando, duplicata_de, decisao, motivo, registro_id, created_at, updated_at)
    SELECT id, importacao_id, arquivo_id, project_id, entidade, dados, origem, confianca, faltando, duplicata_de, decisao, motivo, registro_id, created_at, updated_at FROM importacao_itens;

DROP TABLE importacao_itens;
ALTER TABLE importacao_itens_new RENAME TO importacao_itens;

CREATE INDEX IF NOT EXISTS idx_importacao_itens_lote ON importacao_itens(importacao_id, decisao);
CREATE INDEX IF NOT EXISTS idx_importacao_itens_arquivo ON importacao_itens(arquivo_id);
CREATE INDEX IF NOT EXISTS idx_importacao_itens_projeto ON importacao_itens(project_id);
