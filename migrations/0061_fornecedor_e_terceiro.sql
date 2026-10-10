-- 0061: fornecedor (n.iso) e terceiro (n.privacy) viram UMA parte. `vendors` passa a ser o perfil de segurança
-- (due diligence ISO) da parte organização; a avaliação de validade do n.privacy continua em avaliacoes_terceiro.
ALTER TABLE vendors ADD COLUMN parte_id TEXT REFERENCES partes(id) ON DELETE CASCADE;

-- Vendor cujo projeto não existe mais (órfão de quando a FK não era conferida) fica de fora de toda a carga: a parte exige
-- projeto, e o INSERT abortaria a migration inteira. Ele segue com parte_id NULL (já não aparecia em lista nenhuma).

-- parte que falta (por nome normalizado, organização ATIVA, mesmo projeto; parte inativa de mesmo nome não serve, como no POST)
-- ponytail: espaços internos repetidos não são colapsados; nomes assim viram parte nova
INSERT INTO partes (id, project_id, tipo, nome)
SELECT lower(hex(randomblob(16))), v.project_id, 'organizacao', trim(v.name)
  FROM vendors v
 WHERE EXISTS (SELECT 1 FROM projects pr WHERE pr.id = v.project_id)
   AND NOT EXISTS (SELECT 1 FROM partes p WHERE p.project_id = v.project_id AND p.tipo = 'organizacao' AND p.status = 'ativa'
                     AND lower(trim(p.nome)) = lower(trim(v.name)))
 GROUP BY v.project_id, lower(trim(v.name));

UPDATE vendors SET parte_id = (
  SELECT p.id FROM partes p WHERE p.project_id = vendors.project_id AND p.tipo = 'organizacao' AND p.status = 'ativa'
     AND lower(trim(p.nome)) = lower(trim(vendors.name)) ORDER BY p.created_at, p.rowid LIMIT 1)
 WHERE parte_id IS NULL
   AND EXISTS (SELECT 1 FROM projects pr WHERE pr.id = vendors.project_id)
   AND NOT EXISTS (SELECT 1 FROM vendors v2 WHERE v2.project_id = vendors.project_id
                     AND lower(trim(v2.name)) = lower(trim(vendors.name)) AND v2.rowid < vendors.rowid);

-- vendor repetido no projeto (mesmo nome normalizado): o mais antigo ficou com a parte; cada repetido ganha parte
-- própria, senão o índice único abaixo abortaria a migration. A conciliação mostra esses nomes como ambíguos.
INSERT INTO partes (id, project_id, tipo, nome)
SELECT 'vendor-' || v.id, v.project_id, 'organizacao', trim(v.name) FROM vendors v WHERE v.parte_id IS NULL AND EXISTS (SELECT 1 FROM projects pr WHERE pr.id = v.project_id);
UPDATE vendors SET parte_id = 'vendor-' || id WHERE parte_id IS NULL AND EXISTS (SELECT 1 FROM projects pr WHERE pr.id = vendors.project_id);

INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id)
SELECT lower(hex(randomblob(16))), v.project_id, v.parte_id, 'terceiro', 'projeto', v.project_id
  FROM vendors v WHERE v.parte_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_parte ON vendors(parte_id);

-- organização já tipada como terceiro no n.privacy antes da 0061: ganha o vínculo e o perfil de segurança que o gatilho
-- (criado abaixo) daria a partir de agora
INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id)
SELECT lower(hex(randomblob(16))), p.project_id, p.id, 'terceiro', 'projeto', p.project_id
  FROM partes p WHERE p.tipo = 'organizacao' AND p.terceiro_tipo IS NOT NULL;

INSERT INTO vendors (id, project_id, name, parte_id)
SELECT lower(hex(randomblob(8))), p.project_id, p.nome, p.id
  FROM partes p WHERE p.tipo = 'organizacao' AND p.terceiro_tipo IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM vendors v WHERE v.parte_id = p.id);

CREATE TRIGGER IF NOT EXISTS vendor_perfil_do_terceiro
AFTER INSERT ON parte_vinculos
WHEN NEW.papel = 'terceiro' AND NEW.alvo_tipo = 'projeto'
BEGIN
  INSERT OR IGNORE INTO vendors (id, project_id, name, parte_id)
  SELECT lower(hex(randomblob(8))), NEW.project_id, p.nome, p.id FROM partes p WHERE p.id = NEW.parte_id AND p.tipo = 'organizacao';
END;

CREATE TRIGGER IF NOT EXISTS vendor_nome_da_parte
AFTER UPDATE OF nome ON partes
BEGIN
  UPDATE vendors SET name = NEW.nome WHERE parte_id = NEW.id;
END;
