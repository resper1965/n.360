-- 0117 — avaliação por IA em campo próprio: a saída de niso_evaluate_evidence deixa de
-- sobrescrever evaluation_notes (nota humana) e passa a gravar em avaliacao_ia. Aditiva.
-- Verificar depois de aplicar:
--   PRAGMA table_info(evidence) → deve listar a coluna avaliacao_ia.
ALTER TABLE evidence ADD COLUMN avaliacao_ia TEXT;
