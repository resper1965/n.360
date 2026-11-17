-- 0113 — organização do tipo direta (spec 2026-11-16 onda 1). Aditiva: DEFAULT 'consultoria' dispensa backfill.
-- Verificar depois de aplicar: SELECT count(*) FROM organizations WHERE tipo = 'consultoria' → igual ao total de organizações.
ALTER TABLE organizations ADD COLUMN tipo TEXT NOT NULL DEFAULT 'consultoria' CHECK (tipo IN ('consultoria', 'direta'));
