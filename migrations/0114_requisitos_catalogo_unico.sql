-- 0114 — onda 2: catálogo único de requisitos (spec 2026-11-17). Aditiva e repetível.
-- Verificar depois de aplicar:
--   SELECT count(*) FROM requisitos WHERE fonte_id = 'ons-ro-cb-br-01'                 → 25
--   SELECT count(*) FROM ot_requisitos WHERE requisito_id IS NULL                       → 0
ALTER TABLE requisitos ADD COLUMN texto TEXT;
ALTER TABLE requisitos ADD COLUMN fonte_texto TEXT;
ALTER TABLE requisitos ADD COLUMN categoria TEXT;
ALTER TABLE ot_requisitos ADD COLUMN requisito_id TEXT REFERENCES requisitos(id);

INSERT OR IGNORE INTO requisito_fontes (id, nome, versao, vigente_desde)
  VALUES ('ons-ro-cb-br-01', 'ONS RO-CB.BR.01 (requisitos mínimos de segurança cibernética)', 'Rev.00', '2021-07-09');

-- Mesmo id de ot_requisitos: nenhuma FK nem URL existente muda. O texto é o da norma pública, portado e conferido na 0090.
INSERT OR IGNORE INTO requisitos (id, fonte_id, referencia, titulo, papel, pai_id, texto, fonte_texto, categoria)
  SELECT id, 'ons-ro-cb-br-01', codigo, titulo, NULL, NULL, descricao,
         'ONS RO-CB.BR.01 Rev.00, vigência 09/07/2021; texto portado de OT2net e conferido contra o PDF (migration 0090)', categoria
    FROM ot_requisitos;

UPDATE ot_requisitos SET requisito_id = id WHERE requisito_id IS NULL;
