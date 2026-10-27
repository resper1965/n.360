-- 0088: devolve o gatilho de isolamento de `tratamento_etapa_itens` que a 0087 levou embora.
-- A 0087 refez a tabela (DROP + RENAME) e o DROP apaga os gatilhos da tabela; o `etapa_itens_do_projeto_ins` (0079, molde da 0056/0074)
-- não foi recriado. O código recusa item de outro projeto (`foraDoProjeto`), então não houve caminho explorável, mas SQL direto
-- deixou de ser recusado. Aditiva e idempotente (IF NOT EXISTS): mesma definição da 0079 e do schema.sql.
-- Conferir depois: SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'tratamento_etapa_itens' lista o gatilho.

CREATE TRIGGER IF NOT EXISTS etapa_itens_do_projeto_ins BEFORE INSERT ON tratamento_etapa_itens
WHEN NOT EXISTS (SELECT 1 FROM ropa_records r WHERE r.id = NEW.ropa_id AND r.project_id IS NEW.project_id)
  OR NOT EXISTS (SELECT 1 FROM itens i WHERE i.id = NEW.item_id AND i.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'tratamento ou item inexistente ou de outro projeto');
END;
