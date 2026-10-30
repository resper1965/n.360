-- 0089 — n.ot: o módulo `ot` entra nos CHECKs de `projeto_modulos` e `usuario_modulos`.
--
-- SQLite não altera CHECK: as duas tabelas são refeitas (receita da 0087) e as linhas copiadas como estão. Nenhuma tabela aponta
-- para elas (são folhas) e nenhum índice ou gatilho é definido SOBRE elas. Mas os gatilhos `projeto_modulos_do_contrato` (ON projects)
-- e `usuario_modulos_padrao` (ON users) as CITAM, e no D1 o RENAME falha com "error in trigger ...: no such table" se eles estiverem de
-- pé (test/migration-0089.test.ts prova). Por isso saem ANTES e voltam DEPOIS, na mesma migration.
-- Gatilhos: o projeto novo recebe `ot` se a organização contratou (contrato é explícito). A conta nova NÃO recebe `ot` por padrão,
-- nem cliente (o SCIM do IdP do cliente cria conta) nem equipe: `ot` só entra em `usuario_modulos` por concessão explícita
-- (modelo de ameaças do n.ot, P0-1).
-- Repetível: as tabelas `_nova` não sobram de uma execução completa e a cópia é INSERT OR IGNORE.
-- Backup antes: npm run db:backup. Conferir antes e depois: SELECT modulo, count(*) FROM projeto_modulos GROUP BY modulo e o mesmo em
-- usuario_modulos dão os mesmos totais; SELECT name FROM sqlite_master WHERE type = 'trigger' AND name IN ('projeto_modulos_do_contrato',
-- 'usuario_modulos_padrao') lista os dois.

DROP TRIGGER IF EXISTS projeto_modulos_do_contrato;
DROP TRIGGER IF EXISTS usuario_modulos_padrao;

CREATE TABLE IF NOT EXISTS projeto_modulos_nova (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    modulo TEXT NOT NULL CHECK (modulo IN ('iso', 'privacy', 'ot')),
    habilitado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    habilitado_por TEXT NOT NULL DEFAULT 'sistema',
    PRIMARY KEY (project_id, modulo)
);
INSERT OR IGNORE INTO projeto_modulos_nova (project_id, modulo, habilitado_em, habilitado_por)
    SELECT project_id, modulo, habilitado_em, habilitado_por FROM projeto_modulos;
DROP TABLE projeto_modulos;
ALTER TABLE projeto_modulos_nova RENAME TO projeto_modulos;

CREATE TABLE IF NOT EXISTS usuario_modulos_nova (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    modulo TEXT NOT NULL CHECK (modulo IN ('iso', 'privacy', 'ot')),
    concedido_por TEXT,
    concedido_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, modulo)
);
INSERT OR IGNORE INTO usuario_modulos_nova (user_id, modulo, concedido_por, concedido_em)
    SELECT user_id, modulo, concedido_por, concedido_em FROM usuario_modulos;
DROP TABLE usuario_modulos;
ALTER TABLE usuario_modulos_nova RENAME TO usuario_modulos;

CREATE TRIGGER projeto_modulos_do_contrato AFTER INSERT ON projects
BEGIN
    INSERT OR IGNORE INTO projeto_modulos (project_id, modulo, habilitado_por)
        SELECT NEW.id, j.value, 'sistema' FROM organizations o, json_each(CASE WHEN json_valid(o.modulos_contratados) THEN o.modulos_contratados ELSE '[]' END) j
         WHERE o.id = NEW.org_id AND j.value IN ('iso', 'privacy', 'ot');
    INSERT OR IGNORE INTO projeto_modulos (project_id, modulo, habilitado_por)
        SELECT NEW.id, 'iso', 'sistema' WHERE NOT EXISTS (SELECT 1 FROM projeto_modulos WHERE project_id = NEW.id);
END;

CREATE TRIGGER usuario_modulos_padrao AFTER INSERT ON users
BEGIN
    INSERT OR IGNORE INTO usuario_modulos (user_id, modulo, concedido_por)
        SELECT NEW.id, pm.modulo, 'padrao' FROM projeto_modulos pm
         WHERE pm.project_id = NEW.client_project_id AND pm.modulo IN ('iso', 'privacy')
           AND NEW.role IN ('org_admin', 'org_user', 'client', 'client_admin', 'user', 'employee');
    INSERT OR IGNORE INTO usuario_modulos (user_id, modulo, concedido_por)
        SELECT NEW.id, j.value, 'padrao' FROM organizations o,
               json_each(CASE WHEN json_valid(o.modulos_contratados) THEN o.modulos_contratados ELSE '[]' END) j
         WHERE o.id = NEW.org_id AND j.value IN ('iso', 'privacy')
           AND NEW.role IN ('consultor', 'consultant', 'consultoria_admin', 'comercial');
    INSERT OR IGNORE INTO usuario_modulos (user_id, modulo, concedido_por)
        SELECT NEW.id, 'iso', 'padrao'
         WHERE NEW.role IN ('consultor', 'consultant', 'consultoria_admin', 'comercial')
           AND NOT EXISTS (SELECT 1 FROM usuario_modulos WHERE user_id = NEW.id);
END;
