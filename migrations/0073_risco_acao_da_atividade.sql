-- 0073: a atividade de tratamento passa a ter riscos e ações no MESMO cadastro do n.iso (risks e corrective_actions).
-- ropa_id fica NULL nos registros existentes: não há como saber a que atividade um risco ISO pertence (sem backfill).
-- SET NULL: apagar a atividade não apaga o risco nem a ação. O residual (nota depois do tratamento) vale para os dois módulos;
-- residual_level é calculado no servidor, como risk_level. Nada disso entra no conteúdo congelado da aprovação do RoPA.
-- ADD COLUMN não é idempotente ("duplicate column"): aplicar uma vez, pelo `migrations apply`.
ALTER TABLE risks ADD COLUMN ropa_id TEXT REFERENCES ropa_records(id) ON DELETE SET NULL;
ALTER TABLE risks ADD COLUMN residual_impact INTEGER CHECK (residual_impact IS NULL OR residual_impact BETWEEN 1 AND 5);
ALTER TABLE risks ADD COLUMN residual_probability INTEGER CHECK (residual_probability IS NULL OR residual_probability BETWEEN 1 AND 5);
ALTER TABLE risks ADD COLUMN residual_level TEXT;
ALTER TABLE corrective_actions ADD COLUMN ropa_id TEXT REFERENCES ropa_records(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_risks_ropa ON risks(ropa_id);
CREATE INDEX IF NOT EXISTS idx_capa_ropa ON corrective_actions(ropa_id);
