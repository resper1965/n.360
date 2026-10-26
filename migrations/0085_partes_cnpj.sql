-- 0085: CNPJ da organização em `partes` (decisão D4 do dono, 26/10/2026). Só organização tem CNPJ: pessoa não tem o campo (o CHECK recusa),
-- porque CPF de pessoa natural fica fora do núcleo. Só dígitos, 14; os dígitos verificadores são conferidos na API (cnpjValido).
-- Um CNPJ por projeto (índice parcial). Aditiva: uma coluna nula e um índice; nenhuma linha existente muda.
-- Antes de aplicar em produção (só com o "sim" do dono): npm run db:backup.
ALTER TABLE partes ADD COLUMN cnpj TEXT CHECK (cnpj IS NULL OR (tipo = 'organizacao' AND length(cnpj) = 14 AND cnpj NOT GLOB '*[^0-9]*'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_partes_cnpj ON partes(project_id, cnpj) WHERE cnpj IS NOT NULL;
