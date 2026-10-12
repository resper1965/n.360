-- 0069: riscos do tratamento no RoPA. Dados sensíveis (LGPD art. 11) e crianças e adolescentes (art. 14), ao lado de
-- transferência internacional e de RIPD exigida. Colunas novas com DEFAULT 0: as linhas existentes ficam como estão.
-- ADD COLUMN não é idempotente ("duplicate column"): aplicar uma vez, pelo `migrations apply`.
ALTER TABLE ropa_records ADD COLUMN dados_sensiveis INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ropa_records ADD COLUMN criancas_adolescentes INTEGER NOT NULL DEFAULT 0;
