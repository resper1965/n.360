-- 0096_titular_portal.sql — portal público de solicitações do titular (spec 2026-11-03).
-- Aditiva e repetível (IF NOT EXISTS); não toca tabela existente.
-- Verificar depois de aplicar:
--   SELECT name FROM sqlite_master WHERE name IN ('titular_portais','titular_pedido_tratativas'); -- 2 linhas
-- `titular_portais`: um link público por projeto; só o SHA-256 do token do link é guardado (o token sai uma vez).
CREATE TABLE IF NOT EXISTS titular_portais (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
    criado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- `titular_pedido_tratativas`: o histórico do atendimento de cada pedido do titular (comunicação com o
-- titular, encaminhamento a ponto focal, recebimento de evidência, nota interna). Some com o pedido.
CREATE TABLE IF NOT EXISTS titular_pedido_tratativas (
    id TEXT PRIMARY KEY,
    pedido_id TEXT NOT NULL REFERENCES titular_pedidos(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('comunicacao_titular', 'encaminhamento', 'evidencia', 'nota')),
    texto TEXT NOT NULL CHECK (length(texto) BETWEEN 1 AND 5000),
    autor TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_titular_tratativas_pedido ON titular_pedido_tratativas(pedido_id, created_at);
