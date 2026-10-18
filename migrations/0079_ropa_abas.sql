-- 0079: RoPA em abas, clone do legado (spec 2026-10-16). Aditiva: nada existente é reescrito e o código anterior ignora as colunas.
-- Nada disto entra no conteúdo congelado da aprovação do tratamento (src/services/pedidos.ts, DOCUMENTOS.tratamento): os dados de etapa
-- escrevem nas colunas que JÁ estão no hash, e só quando a pessoa edita (spec 4.4). A única escrita em linha existente é o IDR dos riscos
-- que já tinham atividade (sequencial por criação).
-- Os catálogos (catalogo_itens e os vínculos) nascem VAZIOS: esta migration não semeia titular, dado, medida nem motivo (decisão do dono, 16/10/2026).
-- Backup antes: npm run db:backup. Conferir depois: PRAGMA table_info(ropa_records) mostra volume_mensal.
-- ADD COLUMN não é idempotente ("duplicate column"): aplicar uma vez, pelo `migrations apply`.

-- ─── ropa_records: cabeçalho, escopo, agentes, base jurídica, gaps e materialização ───
ALTER TABLE ropa_records ADD COLUMN nome TEXT CHECK (nome IS NULL OR length(nome) <= 200);
ALTER TABLE ropa_records ADD COLUMN descricao_atividade TEXT CHECK (descricao_atividade IS NULL OR length(descricao_atividade) <= 8000);
ALTER TABLE ropa_records ADD COLUMN volume_mensal TEXT CHECK (volume_mensal IS NULL OR length(volume_mensal) <= 200);
ALTER TABLE ropa_records ADD COLUMN processamento_automatizado TEXT CHECK (processamento_automatizado IS NULL OR processamento_automatizado IN ('nao', 'apoio', 'decisao'));
ALTER TABLE ropa_records ADD COLUMN papel_controlador INTEGER CHECK (papel_controlador IS NULL OR papel_controlador IN (0, 1));
ALTER TABLE ropa_records ADD COLUMN papel_operador INTEGER CHECK (papel_operador IS NULL OR papel_operador IN (0, 1));
ALTER TABLE ropa_records ADD COLUMN previsao_legal TEXT CHECK (previsao_legal IS NULL OR length(previsao_legal) <= 500);
ALTER TABLE ropa_records ADD COLUMN base_legal_finalidade TEXT CHECK (base_legal_finalidade IS NULL OR length(base_legal_finalidade) <= 2000);
ALTER TABLE ropa_records ADD COLUMN base_art11_na INTEGER CHECK (base_art11_na IS NULL OR base_art11_na IN (0, 1));
ALTER TABLE ropa_records ADD COLUMN gaps_nao_aplicavel INTEGER CHECK (gaps_nao_aplicavel IS NULL OR gaps_nao_aplicavel IN (0, 1));
ALTER TABLE ropa_records ADD COLUMN etapas_materializadas_em DATETIME;
-- Carimbo de "Reabrir atividade" (spec 6): a situação exibida compara com a data da aprovação vigente; a prova do pedido não é tocada.
ALTER TABLE ropa_records ADD COLUMN reaberta_em DATETIME;

-- ─── tratamento_ciclo (0074): o cabeçalho da etapa ───
-- `descricao` (0074) tem teto de 1.000 e fica como está; a descrição nova é `descricao_etapa`. Prazo da Eliminação = ropa_records.retention_period.
ALTER TABLE tratamento_ciclo ADD COLUMN origem TEXT CHECK (origem IS NULL OR json_valid(origem));
ALTER TABLE tratamento_ciclo ADD COLUMN solicita_consentimento INTEGER CHECK (solicita_consentimento IS NULL OR solicita_consentimento IN (0, 1));
ALTER TABLE tratamento_ciclo ADD COLUMN descricao_etapa TEXT CHECK (descricao_etapa IS NULL OR length(descricao_etapa) <= 4000);
ALTER TABLE tratamento_ciclo ADD COLUMN descarte TEXT CHECK (descarte IS NULL OR length(descarte) <= 2000);
ALTER TABLE tratamento_ciclo ADD COLUMN migrado INTEGER NOT NULL DEFAULT 0 CHECK (migrado IN (0, 1));

ALTER TABLE tratamento_bases ADD COLUMN finalidade TEXT CHECK (finalidade IS NULL OR length(finalidade) <= 2000);
ALTER TABLE corrective_actions ADD COLUMN recomendacao TEXT CHECK (recomendacao IS NULL OR length(recomendacao) <= 4000);
ALTER TABLE risks ADD COLUMN idr INTEGER;
ALTER TABLE risks ADD COLUMN treatment_due_date TEXT CHECK (treatment_due_date IS NULL OR treatment_due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');

-- IDR retroativo: sequencial por atividade, na ordem de criação. Risco sem atividade (só n.iso) fica sem IDR.
UPDATE risks SET idr = (
  SELECT count(*) FROM risks r2 WHERE r2.ropa_id = risks.ropa_id
    AND (COALESCE(r2.created_at, '') < COALESCE(risks.created_at, '') OR (COALESCE(r2.created_at, '') = COALESCE(risks.created_at, '') AND r2.id <= risks.id))
) WHERE ropa_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_risks_ropa_idr ON risks(ropa_id, idr) WHERE ropa_id IS NOT NULL AND idr IS NOT NULL;

-- ─── Catálogo do projeto: titulares, dados pessoais, medidas e motivos de risco (spec 4.2) ───
CREATE TABLE IF NOT EXISTS catalogo_itens (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('titular', 'dado', 'medida', 'motivo_risco')),
    nome TEXT NOT NULL COLLATE NOCASE CHECK (length(nome) BETWEEN 1 AND 200),
    sensivel INTEGER NOT NULL DEFAULT 0 CHECK (sensivel IN (0, 1) AND (tipo = 'dado' OR sensivel = 0)),
    descricao_padrao TEXT CHECK (descricao_padrao IS NULL OR (tipo = 'motivo_risco' AND length(descricao_padrao) <= 2000)),
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, tipo, nome)
);

-- ─── Ciclo de vida por etapa (spec 4.2). A Eliminação não tem linhas de ativo: herda a leitura do Armazenamento. ───
CREATE TABLE IF NOT EXISTS tratamento_etapa_itens (
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    etapa TEXT NOT NULL CHECK (etapa IN ('coleta', 'uso', 'compartilhamento_interno', 'compartilhamento_externo', 'armazenamento')),
    item_id TEXT NOT NULL REFERENCES itens(id) ON DELETE CASCADE,
    local_armazenamento TEXT CHECK (local_armazenamento IS NULL OR (etapa = 'armazenamento' AND length(local_armazenamento) <= 200)),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (ropa_id, etapa, item_id)
);
CREATE INDEX IF NOT EXISTS idx_etapa_itens_item ON tratamento_etapa_itens(item_id);

CREATE TABLE IF NOT EXISTS tratamento_interno_areas (
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    departamento_id TEXT NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (ropa_id, departamento_id)
);

CREATE TABLE IF NOT EXISTS tratamento_externo_parceiros (
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    parte_id TEXT NOT NULL REFERENCES partes(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (ropa_id, parte_id)
);

CREATE TABLE IF NOT EXISTS tratamento_etapa_titulares (
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    etapa TEXT NOT NULL CHECK (etapa IN ('coleta', 'uso', 'compartilhamento_interno', 'compartilhamento_externo', 'armazenamento', 'eliminacao')),
    titular_id TEXT NOT NULL REFERENCES catalogo_itens(id) ON DELETE CASCADE,
    situacao TEXT NOT NULL CHECK (situacao IN ('definido', 'nao_usa') AND (etapa <> 'coleta' OR situacao = 'definido')),
    atualizado_por TEXT,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (ropa_id, etapa, titular_id)
);

CREATE TABLE IF NOT EXISTS tratamento_etapa_dados (
    ropa_id TEXT NOT NULL,
    etapa TEXT NOT NULL,
    titular_id TEXT NOT NULL,
    dado_id TEXT NOT NULL REFERENCES catalogo_itens(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (ropa_id, etapa, titular_id, dado_id),
    FOREIGN KEY (ropa_id, etapa, titular_id) REFERENCES tratamento_etapa_titulares(ropa_id, etapa, titular_id) ON DELETE CASCADE
);

-- ─── Medidas de segurança, bases do GDPR e anexos de gap ───
CREATE TABLE IF NOT EXISTS tratamento_medidas (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    medida TEXT NOT NULL CHECK (length(medida) BETWEEN 1 AND 200),
    status TEXT NOT NULL CHECK (status IN ('ativa', 'em_implantacao', 'planejada')),
    descricao TEXT CHECK (descricao IS NULL OR length(descricao) <= 2000),
    controle_id TEXT REFERENCES compliance_controls(id) ON DELETE SET NULL,
    created_by TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_medidas_ropa ON tratamento_medidas(ropa_id);

CREATE TABLE IF NOT EXISTS tratamento_bases_gdpr (
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    base TEXT NOT NULL CHECK (base IN ('consentimento', 'contrato', 'interesses_legitimos', 'interesses_vitais', 'obrigacao_legal', 'tarefa_publica')),
    finalidade TEXT NOT NULL CHECK (length(finalidade) BETWEEN 1 AND 2000),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (ropa_id, base)
);

CREATE TABLE IF NOT EXISTS acao_anexos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    acao_id TEXT NOT NULL REFERENCES corrective_actions(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL CHECK (length(file_name) <= 255),
    r2_key TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'doc', 'docx')),
    file_size INTEGER NOT NULL CHECK (file_size BETWEEN 1 AND 5242880),
    uploaded_by TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_acao_anexos_acao ON acao_anexos(acao_id);

-- ─── Integridade de tenant (molde da 0056 e da 0074): SQL direto também é recusado. ───
CREATE TRIGGER IF NOT EXISTS etapa_itens_do_projeto_ins BEFORE INSERT ON tratamento_etapa_itens
WHEN NOT EXISTS (SELECT 1 FROM ropa_records r WHERE r.id = NEW.ropa_id AND r.project_id IS NEW.project_id)
  OR NOT EXISTS (SELECT 1 FROM itens i WHERE i.id = NEW.item_id AND i.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'tratamento ou item inexistente ou de outro projeto');
END;

CREATE TRIGGER IF NOT EXISTS interno_areas_do_projeto_ins BEFORE INSERT ON tratamento_interno_areas
WHEN NOT EXISTS (SELECT 1 FROM ropa_records r WHERE r.id = NEW.ropa_id AND r.project_id IS NEW.project_id)
  OR NOT EXISTS (SELECT 1 FROM departamentos d WHERE d.id = NEW.departamento_id AND d.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'tratamento ou área inexistente ou de outro projeto');
END;

CREATE TRIGGER IF NOT EXISTS externo_parceiros_do_projeto_ins BEFORE INSERT ON tratamento_externo_parceiros
WHEN NOT EXISTS (SELECT 1 FROM ropa_records r WHERE r.id = NEW.ropa_id AND r.project_id IS NEW.project_id)
  OR NOT EXISTS (SELECT 1 FROM partes p WHERE p.id = NEW.parte_id AND p.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'tratamento ou parte inexistente ou de outro projeto');
END;

CREATE TRIGGER IF NOT EXISTS etapa_titulares_do_projeto_ins BEFORE INSERT ON tratamento_etapa_titulares
WHEN NOT EXISTS (SELECT 1 FROM ropa_records r WHERE r.id = NEW.ropa_id AND r.project_id IS NEW.project_id)
  OR NOT EXISTS (SELECT 1 FROM catalogo_itens c WHERE c.id = NEW.titular_id AND c.tipo = 'titular' AND c.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'tratamento ou titular inexistente ou de outro projeto');
END;

CREATE TRIGGER IF NOT EXISTS etapa_dados_do_projeto_ins BEFORE INSERT ON tratamento_etapa_dados
WHEN NOT EXISTS (SELECT 1 FROM catalogo_itens c WHERE c.id = NEW.dado_id AND c.tipo = 'dado' AND c.project_id IS NEW.project_id)
  OR NOT EXISTS (SELECT 1 FROM ropa_records r WHERE r.id = NEW.ropa_id AND r.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'tratamento ou dado inexistente ou de outro projeto');
END;

CREATE TRIGGER IF NOT EXISTS medidas_do_projeto_ins BEFORE INSERT ON tratamento_medidas
WHEN NOT EXISTS (SELECT 1 FROM ropa_records r WHERE r.id = NEW.ropa_id AND r.project_id IS NEW.project_id)
  OR (NEW.controle_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM compliance_controls c WHERE c.id = NEW.controle_id AND c.project_id IS NEW.project_id))
BEGIN
    SELECT RAISE(ABORT, 'tratamento ou controle inexistente ou de outro projeto');
END;

CREATE TRIGGER IF NOT EXISTS bases_gdpr_do_projeto_ins BEFORE INSERT ON tratamento_bases_gdpr
WHEN NOT EXISTS (SELECT 1 FROM ropa_records r WHERE r.id = NEW.ropa_id AND r.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'tratamento inexistente ou de outro projeto');
END;

CREATE TRIGGER IF NOT EXISTS acao_anexos_do_projeto_ins BEFORE INSERT ON acao_anexos
WHEN NOT EXISTS (SELECT 1 FROM corrective_actions a WHERE a.id = NEW.acao_id AND a.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'ação inexistente ou de outro projeto');
END;
