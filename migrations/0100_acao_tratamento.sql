-- 0100_acao_tratamento.sql — tratamento da ação corretiva do incidente (fatia 4, spec 2026-11-04-incidentes-legado-design).
-- Aditiva: ALTER TABLE ADD COLUMN, roda uma vez pelo runner. A ação continua sendo a mesma `corrective_actions` (CAPA do n.iso, gap da
-- atividade); a coluna é opcional e só a ação do incidente a usa por ora. Verificar depois de aplicar:
--   SELECT name FROM pragma_table_info('corrective_actions') WHERE name = 'tratamento'; -- 1 linha
ALTER TABLE corrective_actions ADD COLUMN tratamento TEXT CHECK (tratamento IS NULL OR tratamento IN ('contencao', 'correcao', 'aperfeicoamento'));
