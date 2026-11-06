-- 0102_incidente_analises_imutavel.sql — a análise do incidente encerrado também não muda por UPDATE (complementa a 0101, que só
-- barrava a inclusão). Sem gatilho de DELETE: a exclusão do projeto ou do incidente cascateia. Aditiva e repetível. Verificar:
--   SELECT name FROM sqlite_master WHERE name = 'incidente_analises_encerrado_upd'; -- 1 linha
CREATE TRIGGER IF NOT EXISTS incidente_analises_encerrado_upd BEFORE UPDATE ON incidente_analises
WHEN (SELECT status FROM incidentes WHERE id = OLD.incidente_id) = 'encerrado'
  OR (SELECT status FROM incidentes WHERE id = NEW.incidente_id) = 'encerrado'
BEGIN
    SELECT RAISE(ABORT, 'incidente encerrado não muda');
END;
