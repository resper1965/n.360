-- 0105_titular_acompanhamento.sql — código de acompanhamento do pedido do titular (spec 2026-11-06-titular-consulta-protocolo-design).
-- Aditiva: o ALTER roda uma vez pelo runner; o índice é repetível. Só o SHA-256 do código; pedido sem código não é consultável.
-- Verificar: SELECT name FROM pragma_table_info('titular_pedidos') WHERE name = 'acompanhamento_hash'; -- 1 linha
--            SELECT name FROM sqlite_master WHERE name = 'idx_titular_pedidos_acompanhamento'; -- 1 linha
ALTER TABLE titular_pedidos ADD COLUMN acompanhamento_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_titular_pedidos_acompanhamento ON titular_pedidos(acompanhamento_hash) WHERE acompanhamento_hash IS NOT NULL;
