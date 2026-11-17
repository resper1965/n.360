-- Sonda da onda 2 (SOMENTE LEITURA: só SELECT, não altera nada).
-- Rodar ANTES da migration 0114 e guardar a saída no PR:
--   wrangler d1 execute niso-db --remote --file scripts/sonda-onda2.sql
SELECT 'requisitos_por_fonte' AS sonda, fonte_id AS chave, count(*) AS n FROM requisitos GROUP BY fonte_id;
SELECT 'status_distintos' AS sonda, status AS chave, count(*) AS n FROM compliance_controls GROUP BY status ORDER BY n DESC;
SELECT 'controles_sem_requisito' AS sonda, standard AS chave, count(*) AS n FROM compliance_controls WHERE requisito_id IS NULL GROUP BY standard;
SELECT 'nao_aplicavel_sem_justificativa' AS sonda, 'Not Applicable' AS chave, count(*) AS n FROM compliance_controls
  WHERE status = 'Not Applicable' AND trim(COALESCE(description, '')) = '';
SELECT 'mapeamentos' AS sonda, estado AS chave, count(*) AS n FROM requisito_mapeamentos GROUP BY estado;
SELECT 'ot_requisitos' AS sonda, 'linhas' AS chave, count(*) AS n FROM ot_requisitos;
