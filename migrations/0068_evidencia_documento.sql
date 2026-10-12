-- 0068: importação de programa, fatia 3 (documentos). O arquivo original de um documento importado fica guardado como evidência
-- LIGADA ao documento: `evidence.documento_id` (nulo nas demais; apagar o documento só solta a ligação, a evidência fica).
-- ADD COLUMN não é idempotente ("duplicate column"): aplicar uma vez, pelo `migrations apply`.
ALTER TABLE evidence ADD COLUMN documento_id TEXT REFERENCES documentos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_evidence_documento ON evidence(documento_id);
