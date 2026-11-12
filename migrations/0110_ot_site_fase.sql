-- 0110_ot_site_fase.sql — n.ot: fase do site (spec 2026-11-11 fluidez §6). Aditiva: 5 colunas em ot_sites (ALTER, roda uma vez pelo runner). Todo site existente nasce em_levantamento.
-- Verificar depois de aplicar: SELECT name FROM pragma_table_info('ot_sites') WHERE name IN ('fase','base_pedida_em','base_pedida_por','base_aprovada_em','base_aprovada_por') → 5 linhas.
ALTER TABLE ot_sites ADD COLUMN fase TEXT NOT NULL DEFAULT 'em_levantamento'
  CHECK (fase IN ('em_levantamento', 'base_em_aprovacao', 'em_operacao', 'em_obra'));
ALTER TABLE ot_sites ADD COLUMN base_pedida_em DATETIME;
ALTER TABLE ot_sites ADD COLUMN base_pedida_por TEXT;
ALTER TABLE ot_sites ADD COLUMN base_aprovada_em DATETIME;
ALTER TABLE ot_sites ADD COLUMN base_aprovada_por TEXT;
