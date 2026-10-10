-- 0063: CAPA pode nascer de um incidente (n.iso, A.5.26/A.5.27). O incidente passa a ser do núcleo.
ALTER TABLE corrective_actions ADD COLUMN incidente_id TEXT REFERENCES incidentes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_capa_incidente ON corrective_actions(incidente_id);
