-- 0104_titular_identidade_encaminhamento.sql — conferência de identidade e encaminhamento a ponto focal do pedido do titular
-- (spec 2026-11-06-titular-identidade-encaminhamento-design). Aditiva: os ALTER rodam uma vez pelo runner; o resto é repetível.
-- Verificar: SELECT name FROM pragma_table_info('titular_pedidos') WHERE name LIKE 'identidade_%'; -- 4 linhas
--            SELECT name FROM sqlite_master WHERE name IN ('titular_pedido_encaminhamentos','titular_encaminhamentos_do_projeto'); -- 2 linhas
ALTER TABLE titular_pedidos ADD COLUMN identidade_metodo TEXT CHECK (identidade_metodo IN ('documento_foto', 'dados_cadastrais', 'canal_autenticado', 'presencial', 'outro'));
ALTER TABLE titular_pedidos ADD COLUMN identidade_obs TEXT CHECK (length(identidade_obs) <= 500);
ALTER TABLE titular_pedidos ADD COLUMN identidade_por TEXT;
ALTER TABLE titular_pedidos ADD COLUMN identidade_em TEXT;
CREATE TABLE IF NOT EXISTS titular_pedido_encaminhamentos (
    id TEXT PRIMARY KEY,
    pedido_id TEXT NOT NULL REFERENCES titular_pedidos(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parte_id TEXT NOT NULL REFERENCES partes(id),
    prazo TEXT NOT NULL,
    mensagem TEXT NOT NULL CHECK (length(mensagem) BETWEEN 1 AND 2000),
    status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'respondido', 'cancelado')),
    retorno TEXT CHECK (length(retorno) <= 5000),
    enviado_por TEXT NOT NULL,
    enviado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    retorno_por TEXT,
    retorno_em DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (status <> 'respondido' OR (retorno IS NOT NULL AND length(retorno) >= 1))
);
CREATE INDEX IF NOT EXISTS idx_titular_encaminhamentos_pedido ON titular_pedido_encaminhamentos(pedido_id, created_at);
CREATE INDEX IF NOT EXISTS idx_titular_encaminhamentos_prazo ON titular_pedido_encaminhamentos(project_id, status, prazo);
CREATE TRIGGER IF NOT EXISTS titular_encaminhamentos_do_projeto BEFORE INSERT ON titular_pedido_encaminhamentos
WHEN NOT EXISTS (SELECT 1 FROM titular_pedidos t WHERE t.id = NEW.pedido_id AND t.project_id IS NEW.project_id)
  OR NOT EXISTS (SELECT 1 FROM partes p WHERE p.id = NEW.parte_id AND p.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'pedido ou pessoa de outro projeto');
END;
