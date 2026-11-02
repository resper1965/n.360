-- 0094_ot_achados_l2.sql — n.ot L2 (spec 2026-11-01 §2): achado ligado à pergunta do roteiro e ao item do lote.
-- Aditiva: duas colunas e um índice em ot_achados; nenhuma tabela é refeita.
-- Verificar depois de aplicar: SELECT name FROM pragma_table_info('ot_achados') WHERE name IN ('pergunta_id','lote_item_id') → 2 linhas.
ALTER TABLE ot_achados ADD COLUMN pergunta_id TEXT REFERENCES ot_roteiro_perguntas(id) ON DELETE SET NULL;
ALTER TABLE ot_achados ADD COLUMN lote_item_id TEXT;
CREATE INDEX IF NOT EXISTS idx_ot_achados_lote_item ON ot_achados(lote_item_id);
