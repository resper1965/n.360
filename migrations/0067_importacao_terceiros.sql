-- 0067: importação de programa de privacidade, fatia 2 (terceiros). `importacao_itens.entidade` passa a aceitar `terceiro` e, de uma
-- vez, as entidades das fatias 3 e 4 (`documento`, `dpia`, `lia`, `titular_pedido`, `incidente`, `consentimento`): CHECK só muda por
-- rebuild no SQLite, e reconstruir a tabela a cada fatia seria risco sem ganho (mesma razão da 0055). O código ainda só grava
-- `tratamento` e `terceiro`. NÃO é idempotente (rebuild, `CREATE TABLE` sem `IF NOT EXISTS`): aplicar uma vez, pelo
-- `migrations apply`; se parar no meio, confira `importacao_itens_new` antes de repetir.
-- De quebra, `duplicata_de` e `registro_id` perdem a FK para `ropa_records`: num item
-- `terceiro` eles apontam para `partes`, então a coluna guarda o id do registro conforme a entidade (sem FK, como
-- `parte_vinculos.alvo_id`). Nenhuma tabela aponta para `importacao_itens`, então o DROP não cascateia nada; as FKs dela para
-- lote, arquivo e projeto (CASCADE) seguem iguais. Os três índices são recriados.

CREATE TABLE importacao_itens_new (
    id TEXT PRIMARY KEY,
    importacao_id TEXT NOT NULL REFERENCES importacoes(id) ON DELETE CASCADE,
    arquivo_id TEXT NOT NULL REFERENCES importacao_arquivos(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    entidade TEXT NOT NULL DEFAULT 'tratamento' CHECK (entidade IN ('tratamento', 'terceiro', 'documento', 'dpia', 'lia', 'titular_pedido', 'incidente', 'consentimento')),
    dados TEXT NOT NULL DEFAULT '{}',
    origem TEXT CHECK (origem IS NULL OR length(origem) <= 500),
    confianca TEXT NOT NULL DEFAULT 'baixa' CHECK (confianca IN ('alta', 'media', 'baixa')),
    faltando TEXT NOT NULL DEFAULT '[]',
    duplicata_de TEXT,
    decisao TEXT NOT NULL DEFAULT 'pendente' CHECK (decisao IN ('pendente', 'aceito', 'descartado', 'gravado', 'recusado')),
    motivo TEXT,
    registro_id TEXT,
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
