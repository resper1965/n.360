-- 0082: aceite de risco num modelo só (decisão do dono de 20/10/2026, spec 2026-10-20-frente2-regras-unicas-design.md, B2).
-- O n.iso gravava o aceite como tratamento "Accept" com nome digitado e status aberto; Painel e Prontidão não o contavam.
-- Estes riscos passam a Accepted, guardando o nome e a data digitados, com aceite_manual = 1 ("aceite registrado à mão").
-- Antes de aplicar em produção (só com o "sim" do dono, depois de npm run db:backup), conferir quantos mudam:
--   SELECT count(*) FROM risks WHERE treatment = 'Accept' AND trim(COALESCE(accepted_by, '')) <> ''
--     AND COALESCE(status, 'Open') NOT IN ('Accepted', 'Closed', 'Mitigated');
ALTER TABLE risks ADD COLUMN aceite_manual INTEGER NOT NULL DEFAULT 0;
UPDATE risks SET status = 'Accepted', aceite_manual = 1
  WHERE treatment = 'Accept' AND trim(COALESCE(accepted_by, '')) <> ''
    AND COALESCE(status, 'Open') NOT IN ('Accepted', 'Closed', 'Mitigated');
