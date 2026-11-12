-- 0111_ot_site_obra.sql — n.ot: obra no site (spec 2026-11-11 fluidez §4 e §6). Aditiva: 5 colunas em ot_sites (ALTER, roda uma vez pelo runner). Site existente fica sem obra.
-- Verificar depois de aplicar: SELECT name FROM pragma_table_info('ot_sites') WHERE name IN ('obra_ate','obra_justificativa','obra_renovada','obra_aberta_em','obra_aberta_por') → 5 linhas.
ALTER TABLE ot_sites ADD COLUMN obra_ate DATETIME;
ALTER TABLE ot_sites ADD COLUMN obra_justificativa TEXT;
ALTER TABLE ot_sites ADD COLUMN obra_renovada INTEGER NOT NULL DEFAULT 0 CHECK (obra_renovada IN (0, 1));
ALTER TABLE ot_sites ADD COLUMN obra_aberta_em DATETIME;
ALTER TABLE ot_sites ADD COLUMN obra_aberta_por TEXT;
