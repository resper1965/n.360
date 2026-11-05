-- 0099_incidentes_anpd.sql — comunicação à ANPD completa (fatia 2, spec 2026-11-04-incidentes-legado-design).
-- Uma comunicação por incidente (decisão do dono de 04/11: a complementar fica para depois), então colunas e não tabela.
-- Aditiva: ALTER TABLE ADD COLUMN, roda uma vez pelo runner; a tabela e o CHECK da 0058 não mudam. Verificar depois de aplicar:
--   SELECT name FROM pragma_table_info('incidentes') WHERE name IN ('anpd_protocolo','anpd_canal','anpd_justificativa'); -- 3 linhas
ALTER TABLE incidentes ADD COLUMN anpd_protocolo TEXT CHECK (anpd_protocolo IS NULL OR length(anpd_protocolo) <= 100);
ALTER TABLE incidentes ADD COLUMN anpd_canal TEXT CHECK (anpd_canal IS NULL OR anpd_canal IN ('sei', 'formulario_anpd', 'email', 'outro'));
ALTER TABLE incidentes ADD COLUMN anpd_justificativa TEXT CHECK (anpd_justificativa IS NULL OR length(anpd_justificativa) <= 5000);
