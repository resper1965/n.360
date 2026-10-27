-- 0087: a Eliminação passa a ter ativos próprios (antes lia os do Armazenamento, somente leitura).
-- SQLite não altera CHECK: a tabela é refeita com 'eliminacao' na lista de etapas. Nenhuma tabela aponta para ela (é folha), então o
-- DROP não cascateia nada. As linhas existentes são copiadas como estão.
-- Cópia de continuidade: cada ativo do Armazenamento vira também ativo da Eliminação, para o que a tela já mostrava (os ativos
-- herdados) continuar igual. `tratamento_itens` (o hash da aprovação) já tem esses itens: o hash não muda. Depois é escolha da pessoa.
-- Backup antes: npm run db:backup. Conferir depois: SELECT etapa, count(*) FROM tratamento_etapa_itens GROUP BY etapa lista 'eliminacao'
-- com o mesmo total do 'armazenamento'. Aplicar uma vez, pelo `migrations apply`.

CREATE TABLE tratamento_etapa_itens_nova (
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    etapa TEXT NOT NULL CHECK (etapa IN ('coleta', 'uso', 'compartilhamento_interno', 'compartilhamento_externo', 'armazenamento', 'eliminacao')),
    item_id TEXT NOT NULL REFERENCES itens(id) ON DELETE CASCADE,
    local_armazenamento TEXT CHECK (local_armazenamento IS NULL OR (etapa = 'armazenamento' AND length(local_armazenamento) <= 200)),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (ropa_id, etapa, item_id)
);

INSERT INTO tratamento_etapa_itens_nova (ropa_id, etapa, item_id, local_armazenamento, project_id)
  SELECT ropa_id, etapa, item_id, local_armazenamento, project_id FROM tratamento_etapa_itens;

INSERT OR IGNORE INTO tratamento_etapa_itens_nova (ropa_id, etapa, item_id, local_armazenamento, project_id)
  SELECT ropa_id, 'eliminacao', item_id, NULL, project_id FROM tratamento_etapa_itens WHERE etapa = 'armazenamento';

DROP TABLE tratamento_etapa_itens;
ALTER TABLE tratamento_etapa_itens_nova RENAME TO tratamento_etapa_itens;
CREATE INDEX IF NOT EXISTS idx_etapa_itens_item ON tratamento_etapa_itens(item_id);
