-- 0096_ot_agente_coleta.sql — n.ot L5: interruptor do agente externo de coleta, por projeto (desligado por padrão).
-- Aditiva: uma coluna em projects. A chave do agente usa api_keys.permissions = 'ot_coleta' (sem CHECK; só a rota do n.ot a grava).
-- Verificar depois de aplicar: SELECT name FROM pragma_table_info('projects') WHERE name = 'agente_coleta_ot' → 1 linha.
ALTER TABLE projects ADD COLUMN agente_coleta_ot INTEGER NOT NULL DEFAULT 0 CHECK (agente_coleta_ot IN (0, 1));
