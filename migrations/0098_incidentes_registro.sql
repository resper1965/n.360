-- 0098_incidentes_registro.sql — registro completo do incidente (fatia 1, spec 2026-11-04-incidentes-legado-design).
-- Aditiva: colunas novas por ALTER TABLE ADD COLUMN (rodam uma vez pelo runner; a tabela e o CHECK da 0058 não mudam) e três tabelas
-- novas IF NOT EXISTS. Verificar depois de aplicar:
--   SELECT name FROM pragma_table_info('incidentes') WHERE name IN ('origem_alerta','severidade','tipo','comprometimento','titulares_estimados','criterios_risco','fim_em'); -- 7 linhas
--   SELECT name FROM sqlite_master WHERE name IN ('incidente_departamentos','incidente_dados','incidente_anexos'); -- 3 linhas
ALTER TABLE incidentes ADD COLUMN origem_alerta TEXT CHECK (origem_alerta IS NULL OR length(origem_alerta) <= 500);
ALTER TABLE incidentes ADD COLUMN severidade TEXT CHECK (severidade IS NULL OR severidade IN ('baixa', 'media', 'alta', 'critica'));
ALTER TABLE incidentes ADD COLUMN tipo TEXT CHECK (tipo IS NULL OR tipo IN ('acesso_indevido', 'vazamento', 'perda', 'indisponibilidade', 'alteracao_indevida', 'terceiro', 'malware', 'engenharia_social', 'outro'));
-- Listas fechadas em JSON (validadas no servidor): comprometimento C/I/D e critérios do risco relevante.
ALTER TABLE incidentes ADD COLUMN comprometimento TEXT CHECK (comprometimento IS NULL OR json_valid(comprometimento));
ALTER TABLE incidentes ADD COLUMN titulares_estimados INTEGER CHECK (titulares_estimados IS NULL OR titulares_estimados >= 0);
ALTER TABLE incidentes ADD COLUMN criterios_risco TEXT CHECK (criterios_risco IS NULL OR json_valid(criterios_risco));
ALTER TABLE incidentes ADD COLUMN fim_em TEXT;

-- Áreas afetadas (cadastro de Áreas).
CREATE TABLE IF NOT EXISTS incidente_departamentos (
    incidente_id TEXT NOT NULL REFERENCES incidentes(id) ON DELETE CASCADE,
    departamento_id TEXT NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (incidente_id, departamento_id)
);
CREATE TRIGGER IF NOT EXISTS incidente_departamentos_do_projeto BEFORE INSERT ON incidente_departamentos
WHEN NOT EXISTS (SELECT 1 FROM incidentes i WHERE i.id = NEW.incidente_id AND i.project_id IS NEW.project_id)
  OR NOT EXISTS (SELECT 1 FROM departamentos d WHERE d.id = NEW.departamento_id AND d.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'incidente ou área inexistente ou de outro projeto');
END;

-- Titulares × dados afetados (catálogo do projeto, o mesmo do RoPA).
CREATE TABLE IF NOT EXISTS incidente_dados (
    incidente_id TEXT NOT NULL REFERENCES incidentes(id) ON DELETE CASCADE,
    titular_id TEXT NOT NULL REFERENCES catalogo_itens(id) ON DELETE CASCADE,
    dado_id TEXT NOT NULL REFERENCES catalogo_itens(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (incidente_id, titular_id, dado_id)
);
CREATE TRIGGER IF NOT EXISTS incidente_dados_do_projeto BEFORE INSERT ON incidente_dados
WHEN NOT EXISTS (SELECT 1 FROM incidentes i WHERE i.id = NEW.incidente_id AND i.project_id IS NEW.project_id)
  OR NOT EXISTS (SELECT 1 FROM catalogo_itens t WHERE t.id = NEW.titular_id AND t.project_id IS NEW.project_id AND t.tipo = 'titular')
  OR NOT EXISTS (SELECT 1 FROM catalogo_itens d WHERE d.id = NEW.dado_id AND d.project_id IS NEW.project_id AND d.tipo = 'dado')
BEGIN
    SELECT RAISE(ABORT, 'incidente, titular ou dado inexistente ou de outro projeto');
END;

-- Evidências do incidente (PDF/DOC/DOCX até 5 MB, tipo conferido pelo conteúdo, como os anexos do gap).
CREATE TABLE IF NOT EXISTS incidente_anexos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    incidente_id TEXT NOT NULL REFERENCES incidentes(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL CHECK (length(file_name) <= 255),
    r2_key TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'doc', 'docx')),
    file_size INTEGER NOT NULL CHECK (file_size BETWEEN 1 AND 5242880),
    uploaded_by TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_incidente_anexos ON incidente_anexos(incidente_id);
-- Incidente encerrado não ganha área, dado nem evidência (a trava do serviço sozinha perde a corrida com o encerramento).
CREATE TRIGGER IF NOT EXISTS incidente_departamentos_aberto BEFORE INSERT ON incidente_departamentos
WHEN (SELECT status FROM incidentes WHERE id = NEW.incidente_id) = 'encerrado'
BEGIN
    SELECT RAISE(ABORT, 'incidente encerrado não muda');
END;
CREATE TRIGGER IF NOT EXISTS incidente_dados_aberto BEFORE INSERT ON incidente_dados
WHEN (SELECT status FROM incidentes WHERE id = NEW.incidente_id) = 'encerrado'
BEGIN
    SELECT RAISE(ABORT, 'incidente encerrado não muda');
END;
CREATE TRIGGER IF NOT EXISTS incidente_anexos_do_projeto BEFORE INSERT ON incidente_anexos
WHEN NOT EXISTS (SELECT 1 FROM incidentes i WHERE i.id = NEW.incidente_id AND i.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'incidente inexistente ou de outro projeto');
END;
CREATE TRIGGER IF NOT EXISTS incidente_anexos_aberto BEFORE INSERT ON incidente_anexos
WHEN (SELECT status FROM incidentes WHERE id = NEW.incidente_id) = 'encerrado'
BEGIN
    SELECT RAISE(ABORT, 'incidente encerrado não muda');
END;
