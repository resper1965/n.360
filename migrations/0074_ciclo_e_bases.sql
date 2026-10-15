-- 0074: ciclo de vida do dado por etapa e bases legais adicionais da atividade de tratamento (F3). Tudo aditivo e FORA do conteúdo
-- congelado da aprovação do RoPA e da DPIA: `base_legal_id` continua a base PRINCIPAL (sem cópia para a tabela nova).
-- `tratamento_ciclo`: uma linha por etapa, `registrada` ou `nao_aplicavel`, com um item opcional (o sistema ou arquivo da etapa).
-- O tratamento e o item têm de ser do projeto da linha: dois gatilhos (molde da 0056) recusam o contrário, inclusive em SQL direto.
-- `tratamento_bases`: bases adicionais do catálogo de requisitos (o tipo, art. 7, art. 11 ou GDPR, sai do id do requisito).
-- `ropa_records.base_gdpr`: texto livre até o catálogo do GDPR ter material jurídico revisado.
-- ADD COLUMN não é idempotente ("duplicate column"): aplicar uma vez, pelo `migrations apply`.
CREATE TABLE IF NOT EXISTS tratamento_ciclo (
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    etapa TEXT NOT NULL CHECK (etapa IN ('coleta', 'uso', 'compartilhamento_interno', 'compartilhamento_externo', 'armazenamento', 'eliminacao')),
    situacao TEXT NOT NULL CHECK (situacao IN ('registrada', 'nao_aplicavel')),
    item_id TEXT REFERENCES itens(id) ON DELETE SET NULL,
    descricao TEXT CHECK (descricao IS NULL OR length(descricao) <= 1000),
    atualizado_por TEXT,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ropa_id, etapa),
    CHECK (situacao = 'registrada' OR item_id IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_tratamento_ciclo_projeto ON tratamento_ciclo(project_id);
CREATE INDEX IF NOT EXISTS idx_tratamento_ciclo_item ON tratamento_ciclo(item_id);

CREATE TRIGGER IF NOT EXISTS tratamento_ciclo_do_projeto_ins
BEFORE INSERT ON tratamento_ciclo
WHEN NOT EXISTS (SELECT 1 FROM ropa_records r WHERE r.id = NEW.ropa_id AND r.project_id IS NEW.project_id)
  OR (NEW.item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM itens i WHERE i.id = NEW.item_id AND i.project_id IS NEW.project_id))
BEGIN
    SELECT RAISE(ABORT, 'tratamento ou item inexistente ou de outro projeto');
END;

CREATE TRIGGER IF NOT EXISTS tratamento_ciclo_do_projeto_upd
BEFORE UPDATE ON tratamento_ciclo
WHEN NOT EXISTS (SELECT 1 FROM ropa_records r WHERE r.id = NEW.ropa_id AND r.project_id IS NEW.project_id)
  OR (NEW.item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM itens i WHERE i.id = NEW.item_id AND i.project_id IS NEW.project_id))
BEGIN
    SELECT RAISE(ABORT, 'tratamento ou item inexistente ou de outro projeto');
END;

CREATE TABLE IF NOT EXISTS tratamento_bases (
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    requisito_id TEXT NOT NULL REFERENCES requisitos(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    observacao TEXT CHECK (observacao IS NULL OR length(observacao) <= 500),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ropa_id, requisito_id)
);
CREATE INDEX IF NOT EXISTS idx_tratamento_bases_projeto ON tratamento_bases(project_id);

ALTER TABLE ropa_records ADD COLUMN base_gdpr TEXT;
