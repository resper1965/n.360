-- nISO | Database Schema v3.0
-- Delivery Engine for ness. Consultants
-- Cloudflare D1 (SQLite)

-- ═══════════════════════════════════════════════
-- CORE: USERS & AUTH
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    -- NULLABLE de propósito: `platform_admin` e `consultor` não pertencem a
    -- projeto nenhum. Endurecer aqui trancaria a plataforma para fora dela mesma.
    client_project_id TEXT,
    requires_password_change INTEGER DEFAULT 0,
    -- Segundo fator (TOTP). Desligado por padrão; habilitar é ação do usuário.
    totp_secret TEXT,
    totp_enabled INTEGER DEFAULT 0,
    totp_recovery_hashes TEXT,
    totp_last_window INTEGER,
    -- Contador atômico de tentativas do segundo fator (balde de 5 min).
    totp_fail_count INTEGER DEFAULT 0,
    totp_fail_window INTEGER,
    -- Desprovisionamento por SCIM (migration 0028). Conta desativada CONTINUA
    -- existindo — a trilha referencia o e-mail dela, e apagar reescreveria o
    -- passado — mas não autentica. DEFAULT 1: nada muda para quem já existe.
    ativo INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- Consultoria a que a conta de equipe pertence (migration 0040). Para o
    -- usuário de cliente NÃO vale: a organização dele é a do projeto.
    org_id TEXT NOT NULL DEFAULT 'org_ness'
);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);

-- ═══════════════════════════════════════════════
-- STREAM A: CRM & PRÉ-SALES (Leads, Proposals, Contracts)
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    contact_name TEXT,
    contact_email TEXT,
    status TEXT DEFAULT 'New', -- New, Assessment, Proposal, Won, Lost
    source TEXT,

    -- Dados CNPJ (BrasilAPI)
    cnpj TEXT,
    razao_social TEXT,
    nome_fantasia TEXT,
    natureza_juridica TEXT,
    porte TEXT,                           -- MEI, ME, EPP, DEMAIS
    capital_social REAL,
    cnae_fiscal INTEGER,
    cnae_fiscal_descricao TEXT,
    data_inicio_atividade TEXT,
    situacao_cadastral TEXT,              -- ATIVA, BAIXADA, etc.

    -- Endereço
    logradouro TEXT,
    numero TEXT,
    complemento TEXT,
    bairro TEXT,
    municipio TEXT,
    uf TEXT,
    cep TEXT,

    -- Contato extra
    telefone TEXT,

    -- QSA (sócios) como JSON
    qsa TEXT,

    -- Metadado da consulta
    cnpj_fetched_at DATETIME,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- Organização dona do registro (spec do sistema de propostas, seção 8).
    -- Sem REFERENCES: ALTER TABLE não aceita FK com default não nulo, e o DDL
    -- precisa ser o mesmo aqui e na migration 0036.
    org_id TEXT NOT NULL DEFAULT 'org_ness'
);

CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY,
    lead_id TEXT REFERENCES leads(id),
    assessment_id TEXT,
    status TEXT DEFAULT 'Draft', -- Draft, Sent, Approved, Rejected
    content_html TEXT, -- Printable HTML proposal
    total_price REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME,
    -- Organização dona do registro (spec do sistema de propostas, seção 8).
    -- Sem REFERENCES: ALTER TABLE não aceita FK com default não nulo, e o DDL
    -- precisa ser o mesmo aqui e na migration 0036.
    org_id TEXT NOT NULL DEFAULT 'org_ness'
);

CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    proposal_id TEXT REFERENCES proposals(id),
    lead_id TEXT REFERENCES leads(id),
    status TEXT DEFAULT 'Pending', -- Pending, Signed
    document_r2_key TEXT,
    signed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- Organização dona do registro (spec do sistema de propostas, seção 8).
    -- Sem REFERENCES: ALTER TABLE não aceita FK com default não nulo, e o DDL
    -- precisa ser o mesmo aqui e na migration 0036.
    org_id TEXT NOT NULL DEFAULT 'org_ness',
    -- Contrato novo, gerado pelo aceite da proposta (fatia 4). Sem FK: proposal_id acima aponta para a tabela antiga.
    proposta_id TEXT,
    documento_hash TEXT,
    valor_projeto REAL,
    mensalidade REAL,
    prazo_minimo_meses INTEGER,
    servicos TEXT,
    projeto_id TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_proposta ON contracts(proposta_id) WHERE proposta_id IS NOT NULL;

-- ═══════════════════════════════════════════════
-- STREAM B: ASSESSMENT PRE-SALES
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    lead_id TEXT REFERENCES leads(id),
    client_name TEXT NOT NULL,
    status TEXT DEFAULT 'In Progress',
    complexity TEXT,
    converted_project_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    access_token TEXT,
    pricing_override REAL,
    pricing_desconto REAL,
    pricing_notas TEXT,
    -- Organização dona do registro (spec do sistema de propostas, seção 8).
    -- Sem REFERENCES: ALTER TABLE não aceita FK com default não nulo, e o DDL
    -- precisa ser o mesmo aqui e na migration 0036.
    org_id TEXT NOT NULL DEFAULT 'org_ness'
);

CREATE TABLE IF NOT EXISTS assessment_answers (
    id TEXT PRIMARY KEY,
    assessment_id TEXT REFERENCES assessments(id),
    block INTEGER NOT NULL,
    question_key TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT,
    complexity_impact TEXT,
    gap_detected INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Respostas do questionário POR FASE da jornada (PHASE_QUESTIONS). Ligado ao
-- PROJETO (não ao assessment comercial). Uma linha por (projeto, fase, pergunta).
CREATE TABLE IF NOT EXISTS project_phase_answers (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    phase_number INTEGER NOT NULL,
    question_key TEXT NOT NULL,
    answer TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT,
    UNIQUE(project_id, phase_number, question_key)
);

-- Interpretação da IA por fase, PERSISTIDA (uma linha por projeto+fase). O
-- diagnóstico deixa de ser recalculado a cada abertura: fica salvo e é servido do
-- cache. `answers_hash` guarda o SHA-256 das respostas que geraram a interpretação
-- — quando as respostas mudam, o hash diverge e a fase é reinterpretada; enquanto
-- isso, a última interpretação salva ainda é servida (marcada como desatualizada).
CREATE TABLE IF NOT EXISTS project_phase_interpretations (
    project_id TEXT NOT NULL REFERENCES projects(id),
    phase_number INTEGER NOT NULL,
    interpretacao TEXT NOT NULL,
    fonte TEXT NOT NULL,
    answers_hash TEXT NOT NULL,
    model TEXT,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, phase_number)
);

-- ═══════════════════════════════════════════════
-- STREAM B: DELIVERY ENGINE
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    project_name TEXT,
    client_name TEXT NOT NULL,
    sector TEXT,
    scope TEXT,
    standards TEXT NOT NULL,
    org_role TEXT NOT NULL,
    status TEXT DEFAULT 'Active',
    assessment_id TEXT,
    cnpj TEXT,
    employee_count INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    language TEXT DEFAULT 'pt-BR',
    repository_url TEXT,
    repository_token TEXT,
    proposta_id TEXT,
    -- Consultoria dona do projeto (migration 0040). Sem REFERENCES, como nas
    -- tabelas comerciais: ALTER TABLE não aceita FK com default.
    org_id TEXT NOT NULL DEFAULT 'org_ness'
);
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);

CREATE TABLE IF NOT EXISTS project_phases (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    phase_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'Pending',
    notes TEXT,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    legado_status TEXT
);

CREATE TABLE IF NOT EXISTS project_scope_changes (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    previous_scope TEXT,
    new_scope TEXT NOT NULL,
    change_reason TEXT NOT NULL,
    security_impact TEXT NOT NULL,
    approved_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_interviews (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    track TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT,
    interviewee TEXT,
    gap_detected TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- CORE TABLES (Existing, preserved)
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    details TEXT,
    justification TEXT,
    ip_address TEXT,
    -- NULLABLE de propósito: a maioria das chamadas de `logAudit` registra ação
    -- de plataforma (login, user.created, MFA) que não pertence a projeto algum.
    -- NOT NULL aqui derrubaria o registro dessas ações — perder trilha para
    -- ganhar constraint é o inverso do objetivo.
    project_id TEXT,
    -- Trilha por CAMPO (migration 0025). Nullable: a maioria das chamadas de
    -- logAudit registra acao de plataforma, que nao tem campo antes/depois.
    -- `operation_id` agrupa a operacao — uma acao em lote sobre 3 controles
    -- gera 3 linhas com o mesmo id — e liga a operacao ao registro de que ela
    -- foi desfeita. Desfazer NAO apaga linha: a tabela e append-only.
    entity_type TEXT,
    entity_id TEXT,
    field TEXT,
    old_value TEXT,
    new_value TEXT,
    operation_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_project ON audit_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_operation ON audit_logs(operation_id);
-- Retenção x imutabilidade (S-log): esta tabela é append-only por design
-- (integridade de log, ISO 27001 A.8.15). Isso está em TENSÃO com um limite de
-- retenção por expurgo (LGPD/ISO 27701 minimização): não se pode DELETE sem
-- afrouxar os triggers abaixo, o que enfraquece a imutabilidade. A escolha aqui
-- é: minimizar na ESCRITA (details nunca guarda conteúdo de titular — ver
-- helpers.ts:logAudit) e manter a trilha imutável. Um expurgo por tempo é
-- decisão de governança do controlador (exigiria um processo autorizado que
-- relaxe os triggers) — não é feito silenciosamente no código.
-- Trilha de auditoria imutável (append-only): bloqueia UPDATE/DELETE no nível do DB.
CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;
CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;

-- SCIM 2.0 (migration 0028): o token que o IdP do cliente usa para provisionar e
-- desprovisionar. Guardado como HASH — quem tem acesso ao banco não deve
-- conseguir se passar pelo IdP do cliente.
CREATE TABLE IF NOT EXISTS project_scim (
    project_id TEXT PRIMARY KEY REFERENCES projects(id),
    token_hash TEXT NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    criado_por TEXT,
    ultimo_uso_em DATETIME
);
CREATE INDEX IF NOT EXISTS idx_project_scim_token ON project_scim(token_hash);

-- SSO por OIDC, por tenant (migration 0027). Tabela vazia = nenhum tenant usa
-- SSO, e o login por senha segue sendo o único caminho. `client_secret` é
-- gravado cifrado (src/secret-crypto.ts).
CREATE TABLE IF NOT EXISTS project_sso (
    project_id TEXT PRIMARY KEY REFERENCES projects(id),
    issuer TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    dominios TEXT NOT NULL,
    papel_padrao TEXT NOT NULL DEFAULT 'org_user',
    ativo INTEGER NOT NULL DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_por TEXT
);
CREATE INDEX IF NOT EXISTS idx_project_sso_ativo ON project_sso(ativo);

-- Política de segurança por tenant (migration 0026). Tabela vazia significa
-- "todo mundo na postura padrão da plataforma": ausência de linha nunca é
-- interpretada como restrição.
CREATE TABLE IF NOT EXISTS project_security_policy (
    project_id TEXT PRIMARY KEY REFERENCES projects(id),
    mfa_obrigatorio INTEGER NOT NULL DEFAULT 0,
    sessao_ttl_seg INTEGER,
    ip_allowlist TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS compliance_controls (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    standard TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'Missing',
    maturity INTEGER DEFAULT 0,
    owner TEXT,
    ciso_approved_by TEXT,
    ciso_approved_at TEXT,
    ciso_approved_ip TEXT,
    ciso_approved_ua TEXT,
    ceo_approved_by TEXT,
    ceo_approved_at TEXT,
    ceo_approved_ip TEXT,
    ceo_approved_ua TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    owner_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
    requisito_id TEXT REFERENCES requisitos(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS evidence (
    id TEXT PRIMARY KEY,
    control_id TEXT REFERENCES compliance_controls(id),
    project_id TEXT,
    file_name TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    twyn_ref TEXT,
    file_type TEXT,
    file_size INTEGER,
    uploaded_by TEXT NOT NULL,
    -- Domínio canônico (D2, ver constants.ts EVALUATION_STATUSES): pending |
    -- conforming | partial | non_conforming. Só o servidor escreve (sem input
    -- livre). Sem CHECK aqui de propósito: evidence é referenciada por FK
    -- (compliance_progress.evidence_id), então um rebuild p/ adicionar CHECK
    -- arriscaria a integridade — a consistência é garantida na origem (constante +
    -- normalização dos writes).
    evaluation_status TEXT DEFAULT 'pending',
    evaluation_score REAL,
    evaluation_notes TEXT,
    ciso_approved_by TEXT,
    ciso_approved_at TEXT,
    ciso_approved_ip TEXT,
    ciso_approved_ua TEXT,
    ceo_approved_by TEXT,
    ceo_approved_at TEXT,
    ceo_approved_ip TEXT,
    ceo_approved_ua TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    valido_ate TEXT,
    -- Arquivo original de documento importado (fatia 3 da importação, migration 0068): apagar o documento só solta a ligação.
    documento_id TEXT REFERENCES documentos(id) ON DELETE SET NULL
);

-- ═══════════════════════════════════════════════
-- PORTAL DO AUDITOR EXTERNO
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS auditor_tokens (
    id TEXT PRIMARY KEY,
    -- NOT NULL (migration 0021): o token é o único fator de um caminho público
    -- (`/api/v1/public/auditor/*`, isento do authMiddleware). Sem projeto ele é
    -- concessão de acesso sem escopo — não é dado válido. Ver o cabeçalho da
    -- 0021 para o critério de quais tabelas foram endurecidas e quais não.
    project_id TEXT NOT NULL REFERENCES projects(id),
    -- SHA-256 do token do link (migration 0045). O token em si sai uma vez, na URL.
    token_hash TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME,
    revoked_by TEXT
);

-- ═══════════════════════════════════════════════
-- NOTIFICATIONS
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    type TEXT NOT NULL,      -- assessment_done, proposal_ready, contract_signed, phase_completed
    title TEXT NOT NULL,
    message TEXT,
    read INTEGER DEFAULT 0,
    link TEXT,
    action_type TEXT,
    target_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_assessment_answers_block ON assessment_answers(assessment_id, block);
CREATE INDEX IF NOT EXISTS idx_project_phases ON project_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_project_interviews ON project_interviews(project_id, track);
CREATE INDEX IF NOT EXISTS idx_evidence_control ON evidence(control_id);
CREATE INDEX IF NOT EXISTS idx_auditor_tokens ON auditor_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_cnpj ON leads(cnpj);
CREATE INDEX IF NOT EXISTS idx_proposals_lead ON proposals(lead_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);

-- ═══════════════════════════════════════════════
-- SPRINT 4: RISK ASSESSMENT, VENDORS (KYV), TRAINING
-- ═══════════════════════════════════════════════

-- Itens do inventário (migration 0048; eram `assets`). Núcleo fino: o que os dois produtos usam.
-- `responsavel_texto` é transitório: o dono vira vínculo em `parte_vinculos` (fatia 1.3).
CREATE TABLE IF NOT EXISTS itens (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    descricao TEXT,
    responsavel_texto TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'removido')),
    tipo TEXT NOT NULL DEFAULT 'ativo' CHECK (tipo IN ('sistema', 'ativo', 'base', 'processo')),
    departamento_id TEXT REFERENCES departamentos(id) ON DELETE SET NULL
);

-- Bloco do n.iso (1:1). `project_id` repete o do item porque a portabilidade exporta por essa coluna.
CREATE TABLE IF NOT EXISTS item_seguranca (
    item_id TEXT PRIMARY KEY REFERENCES itens(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    categoria TEXT,
    subtipo TEXT,
    classificacao TEXT DEFAULT 'Confidential',
    criticidade TEXT DEFAULT 'Medium',
    localizacao TEXT,
    nota_c INTEGER DEFAULT 3,
    nota_i INTEGER DEFAULT 3,
    nota_d INTEGER DEFAULT 3
);
CREATE INDEX IF NOT EXISTS idx_itens_projeto ON itens(project_id, tipo, status);

CREATE TABLE IF NOT EXISTS risks (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    asset_id TEXT REFERENCES itens(id) ON DELETE SET NULL,
    asset TEXT NOT NULL,
    threat TEXT NOT NULL,
    vulnerability TEXT,
    impact INTEGER NOT NULL DEFAULT 3,
    probability INTEGER NOT NULL DEFAULT 3,
    risk_score INTEGER GENERATED ALWAYS AS (impact * probability) STORED,
    risk_level TEXT,
    treatment TEXT DEFAULT 'Mitigate',
    treatment_plan TEXT,
    control_id TEXT REFERENCES compliance_controls(id) ON DELETE SET NULL,
    owner TEXT,
    status TEXT DEFAULT 'Open',
    accepted_by TEXT,
    accepted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    owner_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
    -- Risco da atividade de tratamento do n.privacy e risco residual, migration 0073. residual_level calculado no servidor.
    ropa_id TEXT REFERENCES ropa_records(id) ON DELETE SET NULL,
    residual_impact INTEGER CHECK (residual_impact IS NULL OR residual_impact BETWEEN 1 AND 5),
    residual_probability INTEGER CHECK (residual_probability IS NULL OR residual_probability BETWEEN 1 AND 5),
    residual_level TEXT,
    -- Ficha em abas (migration 0079): IDR sequencial por atividade e prazo de tratamento.
    idr INTEGER,
    treatment_due_date TEXT CHECK (treatment_due_date IS NULL OR treatment_due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    -- Migration 0082: 1 = aceite legado digitado no n.iso (nome e data à mão), levado a Accepted; o aceite novo é carimbado pelo servidor.
    aceite_manual INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_risks_ropa_idr ON risks(ropa_id, idr) WHERE ropa_id IS NOT NULL AND idr IS NOT NULL;

CREATE TABLE IF NOT EXISTS risk_history (
    id TEXT PRIMARY KEY,
    risk_id TEXT REFERENCES risks(id) ON DELETE CASCADE,
    project_id TEXT,
    impact INTEGER NOT NULL,
    probability INTEGER NOT NULL,
    risk_level TEXT NOT NULL,
    assessment_date DATETIME DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    name TEXT NOT NULL,
    category TEXT,
    has_iso27001 INTEGER DEFAULT 0,
    has_iso27701 INTEGER DEFAULT 0,
    has_soc2 INTEGER DEFAULT 0,
    trust_score INTEGER DEFAULT 0,
    diligence_level TEXT DEFAULT 'High',
    dpa_signed INTEGER DEFAULT 0,
    last_assessment_date TEXT,
    notes TEXT,
    status TEXT DEFAULT 'Active',
    has_mfa INTEGER DEFAULT 0,
    has_encryption INTEGER DEFAULT 0,
    has_backup INTEGER DEFAULT 0,
    has_incident_plan INTEGER DEFAULT 0,
    has_pentest INTEGER DEFAULT 0,
    trust_center_url TEXT,
    dpa_url TEXT,
    attached_certifications TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- perfil de segurança (due diligence ISO) da parte organização; o terceiro do n.privacy é a mesma parte (0061)
    parte_id TEXT REFERENCES partes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS training_records (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    employee_name TEXT NOT NULL,
    training_name TEXT NOT NULL,
    completion_date TEXT,
    score INTEGER,
    status TEXT DEFAULT 'Pending',
    evidence_file TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_risks_project ON risks(project_id);
CREATE INDEX IF NOT EXISTS idx_vendors_project ON vendors(project_id);
CREATE INDEX IF NOT EXISTS idx_training_project ON training_records(project_id);

-- ═══════════════════════════════════════════════
-- SPRINT 5+6+7: ROPA, AUDIT CALENDAR, CAPA, API KEYS, WEBHOOKS
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ropa_records (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    processing_purpose TEXT NOT NULL,
    data_categories TEXT,
    data_subjects TEXT,
    legal_basis TEXT,
    consent_details TEXT,
    data_subject_rights_details TEXT,
    retention_period TEXT,
    recipients TEXT,
    international_transfers INTEGER DEFAULT 0,
    transfer_safeguards TEXT,
    dpia_required INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Active',
    owner TEXT,
    ciso_approved_by TEXT,
    ciso_approved_at TEXT,
    ciso_approved_ip TEXT,
    ciso_approved_ua TEXT,
    ceo_approved_by TEXT,
    ceo_approved_at TEXT,
    ceo_approved_ip TEXT,
    ceo_approved_ua TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    owner_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
    base_legal_id TEXT REFERENCES requisitos(id) ON DELETE SET NULL,
    -- Riscos do tratamento (migration 0069): LGPD art. 11 e art. 14.
    dados_sensiveis INTEGER NOT NULL DEFAULT 0,
    criancas_adolescentes INTEGER NOT NULL DEFAULT 0,
    -- Teste de impacto finalizado (migration 0072), com as respostas em tratamento_impacto.
    impacto_finalizado_em DATETIME,
    -- Base do GDPR (migration 0074), texto livre até o catálogo do GDPR ter material jurídico revisado; fora do hash da aprovação.
    base_gdpr TEXT,
    -- Ficha em abas (migration 0079): cabeçalho, escopo, agentes, base jurídica, gaps e materialização. Fora do hash da aprovação.
    nome TEXT CHECK (nome IS NULL OR length(nome) <= 200),
    descricao_atividade TEXT CHECK (descricao_atividade IS NULL OR length(descricao_atividade) <= 8000),
    volume_mensal TEXT CHECK (volume_mensal IS NULL OR length(volume_mensal) <= 200),
    processamento_automatizado TEXT CHECK (processamento_automatizado IS NULL OR processamento_automatizado IN ('nao', 'apoio', 'decisao')),
    papel_controlador INTEGER CHECK (papel_controlador IS NULL OR papel_controlador IN (0, 1)),
    papel_operador INTEGER CHECK (papel_operador IS NULL OR papel_operador IN (0, 1)),
    previsao_legal TEXT CHECK (previsao_legal IS NULL OR length(previsao_legal) <= 500),
    base_legal_finalidade TEXT CHECK (base_legal_finalidade IS NULL OR length(base_legal_finalidade) <= 2000),
    base_art11_na INTEGER CHECK (base_art11_na IS NULL OR base_art11_na IN (0, 1)),
    gaps_nao_aplicavel INTEGER CHECK (gaps_nao_aplicavel IS NULL OR gaps_nao_aplicavel IN (0, 1)),
    etapas_materializadas_em DATETIME,
    reaberta_em DATETIME
);

CREATE TABLE IF NOT EXISTS audit_schedule (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    audit_type TEXT NOT NULL,
    title TEXT NOT NULL,
    scheduled_date TEXT NOT NULL,
    auditor_name TEXT,
    scope TEXT,
    status TEXT DEFAULT 'Planned',
    findings_count INTEGER DEFAULT 0,
    notes TEXT,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS corrective_actions (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    audit_id TEXT REFERENCES audit_schedule(id) ON DELETE CASCADE,
    risk_id TEXT REFERENCES risks(id) ON DELETE CASCADE,
    control_id TEXT REFERENCES compliance_controls(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    root_cause TEXT,
    action_plan TEXT,
    severity TEXT DEFAULT 'Medium',
    assigned_to TEXT,
    due_date TEXT,
    status TEXT DEFAULT 'Open',
    resolution TEXT,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    assigned_to_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
    incidente_id TEXT REFERENCES incidentes(id) ON DELETE SET NULL,
    -- Ação da atividade de tratamento do n.privacy, migration 0073
    ropa_id TEXT REFERENCES ropa_records(id) ON DELETE SET NULL,
    -- Ficha em abas (migration 0079)
    recomendacao TEXT CHECK (recomendacao IS NULL OR length(recomendacao) <= 4000)
);

CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    -- NOT NULL (migration 0021): todo o isolamento de tenant de uma chave se
    -- apoia neste campo — é ele que vira `client_project_id` em
    -- `src/middleware/auth.ts`. Chave sem projeto era chave sem escopo, com
    -- visão dos projetos de todos os tenants (PR #41). A guarda de runtime
    -- continua lá; aqui o caso deixa de ser representável.
    project_id TEXT NOT NULL REFERENCES projects(id),
    key_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    permissions TEXT DEFAULT 'read',
    last_used_at DATETIME,
    expires_at DATETIME,
    status TEXT DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    -- NOT NULL (migration 0021): webhook sem projeto não aparece em nenhuma
    -- listagem (`WHERE project_id = ?`) e ainda assim passa em
    -- `requireResourceAccess` para usuário com `client_project_id` nulo —
    -- `null !== null` é falso em JS. Linha órfã aqui é só buraco de acesso.
    project_id TEXT NOT NULL REFERENCES projects(id),
    url TEXT NOT NULL,
    events TEXT NOT NULL,
    secret TEXT,
    status TEXT DEFAULT 'Active',
    last_triggered_at DATETIME,
    failure_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ropa_project ON ropa_records(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_schedule_project ON audit_schedule(project_id);
CREATE INDEX IF NOT EXISTS idx_capa_project ON corrective_actions(project_id);
CREATE INDEX IF NOT EXISTS idx_capa_incidente ON corrective_actions(incidente_id);
CREATE INDEX IF NOT EXISTS idx_capa_ropa ON corrective_actions(ropa_id);
CREATE INDEX IF NOT EXISTS idx_risks_ropa ON risks(ropa_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id);
-- Unicidade do hash de API key (o lookup de autenticação depende disso).
-- Precisa vir DEPOIS do CREATE TABLE acima — em banco limpo, um índice declarado
-- antes da tabela faz o schema.sql inteiro falhar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_webhooks_project ON webhooks(project_id);

-- ═══════════════════════════════════════════════
-- SPRINT 8: MARKET READY
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    plan TEXT DEFAULT 'trial',
    max_projects INTEGER DEFAULT 3,
    max_users INTEGER DEFAULT 5,
    owner_id TEXT,
    logo_url TEXT,
    status TEXT DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    cnpj TEXT,
    cor_destaque TEXT DEFAULT '#00ade8',
    selo_niso INTEGER NOT NULL DEFAULT 1,
    prefixo_proposta TEXT,
    proximo_numero INTEGER NOT NULL DEFAULT 1,
    -- JSON validado por configOrgSchema (src/schemas/domain.ts). Texto cru,
    -- escapado só na hora de virar HTML.
    config_preco TEXT,
    textos TEXT,
    secoes_desligadas TEXT,
    -- Termo de uso da consultoria (migration 0040): data do aceite e versão.
    termo_aceito_em DATETIME,
    termo_versao TEXT,
    -- Chave do logo no R2 (migration 0040).
    logo_chave TEXT,
    -- Módulos que a consultoria contratou: o teto do que cada projeto pode habilitar (migration 0047).
    modulos_contratados TEXT NOT NULL DEFAULT '["iso"]'
);
-- Prefixo de proposta único entre organizações (migration 0040): a conferência na rota tem corrida,
-- o índice decide. Parcial: organização sem prefixo (NULL) não conflita com outra.
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_prefixo ON organizations(prefixo_proposta) WHERE prefixo_proposta IS NOT NULL;

INSERT OR IGNORE INTO organizations (id, name, slug, plan, status, prefixo_proposta, proximo_numero, textos)
VALUES ('org_ness', 'ness.', 'ness', 'interno', 'Active', 'NESS', 1, '{"sobre":"A ness. é uma consultoria de segurança da informação e privacidade. Implementa sistemas de gestão de segurança e de privacidade até a certificação, com método próprio e com o trabalho registrado no n.iso, onde o cliente acompanha cada controle, evidência e decisão.","comoTrabalhamos":"## Como trabalhamos\n\nO projeto segue o ciclo de melhoria contínua da própria norma: planejar o sistema, implementá-lo, verificar se funciona e corrigir o que não funciona. Cada fase termina com uma entrega aprovada pela empresa, e nenhuma começa sem que a anterior tenha critério de aceite cumprido.\n\n## Princípios\n\n- O sistema é da empresa, não da consultoria. Documentos são escritos com as áreas e na linguagem delas, para serem usados depois.\n- Evidência desde o primeiro dia. Tudo o que é feito fica registrado no n.iso, onde o auditor encontra o que precisa.\n- Quem implementa não audita. A auditoria interna é conduzida por auditor que não participou da implementação (cláusula 9.2).\n- Proporcionalidade. Controles na medida do risco, sem burocracia que a empresa não consiga manter.\n\n## Ritmo e comunicação\n\n- Reunião de acompanhamento, semanal, 1 h, com o ponto focal e o líder do projeto: andamento, bloqueios, próximas tarefas.\n- Oficinas temáticas, conforme a fase, com as áreas envolvidas: riscos, processos, privacidade, controles.\n- Comitê do projeto, mensal, 1 h, com a direção e o líder do projeto: decisões, aceite de riscos, aprovações.\n- Relatório de status, quinzenal, para o ponto focal e a direção: situação por fase, riscos do projeto.\n\n## O n.iso no projeto\n\nA empresa recebe acesso ao n.iso durante todo o projeto. Ali ficam o escopo, os riscos, a Declaração de Aplicabilidade, as políticas, as evidências por controle, o ROPA e os DPIAs. As aprovações da direção são registradas com data e responsável, e a trilha de auditoria guarda quem fez o quê.","premissas":"- A empresa designa um ponto focal com autoridade para decidir e com pelo menos 30% do tempo dedicado ao projeto.\n- A direção participa do comitê mensal e das aprovações nos marcos previstos.\n- As áreas cumprem os prazos de resposta combinados, de até cinco dias úteis por pedido.\n- O escopo aprovado em F1 não muda de forma relevante durante o projeto.\n- As correções técnicas apontadas pelo diagnóstico são executadas pela equipe da empresa ou por terceiros contratados por ela.","termos":"## Obrigações da ness.\n\n- Executar os serviços descritos com a equipe e a qualificação apresentadas.\n- Cumprir o cronograma, salvo atrasos causados por premissas não atendidas.\n- Manter sigilo sobre toda informação da contratante a que tiver acesso.\n- Comunicar por escrito qualquer fato que ameace prazo, escopo ou qualidade.\n\n## Obrigações da contratante\n\n- Disponibilizar pessoas, informações e acessos necessários nos prazos combinados.\n- Aprovar ou rejeitar entregas em até cinco dias úteis, com justificativa.\n- Executar as correções técnicas sob sua responsabilidade.\n- Contratar o organismo certificador e pagar as taxas correspondentes.\n- Efetuar os pagamentos nas datas acordadas.\n\n## Propriedade das entregas\n\nOs documentos produzidos para a contratante passam a pertencer a ela após o pagamento correspondente. Metodologias, modelos e ferramentas da ness. continuam de sua propriedade, com licença de uso perpétua para a contratante no escopo do sistema de gestão.\n\n## Confidencialidade\n\nAs partes mantêm em sigilo as informações trocadas durante a negociação e a execução, por todo o contrato e por cinco anos após o seu término. Não se aplica a informações públicas, já conhecidas pela parte receptora ou cuja divulgação seja exigida por lei ou ordem judicial.\n\n## Proteção de dados pessoais\n\nNa execução dos serviços, a ness. atua como operadora dos dados pessoais a que tiver acesso, tratando-os apenas conforme as instruções da contratante e para a finalidade deste contrato, nos termos da LGPD.\n\n- Medidas de segurança técnicas e administrativas compatíveis com a natureza dos dados.\n- Comunicação de incidente de segurança à contratante em até 48 horas da ciência.\n- Suboperadores, incluindo o n.iso, apenas com informação prévia à contratante.\n- Devolução ou eliminação dos dados ao fim do contrato, com confirmação por escrito.\n\n## Vigência\n\nO contrato vigora da assinatura até a conclusão da fase F7 ou até 30 semanas, o que ocorrer primeiro, podendo ser prorrogado por aditivo.\n\n## Rescisão\n\nQualquer parte pode rescindir mediante aviso por escrito com 30 dias de antecedência. Os serviços prestados até a data da rescisão são devidos proporcionalmente. Em caso de descumprimento não sanado em 15 dias após notificação, a rescisão é imediata.\n\nSe a contratante encerrar o contrato com a consultoria, os registros do projeto no n.iso podem ser transferidos para uma conta própria da contratante, mediante contratação direta.\n\n## Foro\n\nFica eleito o foro da comarca de São Paulo (SP) para dirimir questões oriundas deste contrato, com renúncia a qualquer outro.","pagamentoPadrao":"40/30/30"}');

CREATE TABLE IF NOT EXISTS certification_tracking (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    standard TEXT NOT NULL DEFAULT 'ISO 27001:2022',
    stage TEXT DEFAULT 'Gap Assessment',
    target_date TEXT,
    stage1_date TEXT,
    stage1_status TEXT DEFAULT 'Pending',
    stage2_date TEXT,
    stage2_status TEXT DEFAULT 'Pending',
    certificate_number TEXT,
    certificate_expiry TEXT,
    registrar TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_chat_history (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    user_id TEXT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cert_project ON certification_tracking(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_project ON ai_chat_history(project_id);

-- ═══════════════════════════════════════════════
-- DOCUMENT INTAKE PIPELINE
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS project_documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    document_type TEXT NOT NULL,  -- organograma, policy, inventory, topology, systems, contracts, incidents, certifications, floorplan, audit_report, ropa, backup_dr
    filename TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    file_hash TEXT,
    file_size INTEGER,
    file_type TEXT,
    status TEXT DEFAULT 'uploaded',  -- uploaded, extracting, extracted, confirmed, failed
    extracted_data TEXT,     -- JSON estruturado extraído pela AI
    extracted_summary TEXT,  -- Texto legível para revisão pelo consultor
    uploaded_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projdocs_project ON project_documents(project_id);

-- -----------------------------------------------
-- SPRINT F: CHECKLIST PERSISTENCE
-- -----------------------------------------------

CREATE TABLE IF NOT EXISTS checklist_progress (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT REFERENCES projects(id),
    phase_number INTEGER NOT NULL,
    item_id TEXT NOT NULL,
    is_checked INTEGER DEFAULT 0,
    checked_by TEXT REFERENCES users(id),
    checked_at DATETIME,
    evidence_id TEXT REFERENCES evidence(id),
    notes TEXT,
    assigned_to TEXT,
    due_date TEXT,
    assigned_to_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
    bloqueio_motivo TEXT,
    bloqueio_responsavel TEXT,
    bloqueado_em DATETIME,
    excecao_motivo TEXT,
    excecao_por TEXT,
    excecao_em DATETIME,
    UNIQUE(project_id, phase_number, item_id)
);
CREATE INDEX IF NOT EXISTS idx_checklist_progress_project ON checklist_progress(project_id);

-- -----------------------------------------------
-- SPRINT A: CONTEXT & STAKEHOLDERS
-- -----------------------------------------------

CREATE TABLE IF NOT EXISTS stakeholders (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT REFERENCES projects(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'external',
    category TEXT,
    requirements TEXT,
    influence TEXT DEFAULT 'Medium',
    communication_method TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stakeholders_project ON stakeholders(project_id);

CREATE TABLE IF NOT EXISTS context_analysis (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT REFERENCES projects(id) UNIQUE,
    internal_strengths TEXT,
    internal_weaknesses TEXT,
    external_opportunities TEXT,
    external_threats TEXT,
    legal_requirements TEXT,
    contractual_requirements TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_context_analysis_project ON context_analysis(project_id);

-- -----------------------------------------------
-- SPRINT D: AUDIT FINDINGS & MANAGEMENT REVIEW
-- -----------------------------------------------

CREATE TABLE IF NOT EXISTS audit_findings (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    audit_id TEXT REFERENCES audit_schedule(id),
    project_id TEXT REFERENCES projects(id),
    control_id TEXT,
    finding_type TEXT NOT NULL DEFAULT 'observation',
    description TEXT NOT NULL,
    evidence_reviewed TEXT,
    auditor_notes TEXT,
    capa_id TEXT REFERENCES corrective_actions(id),
    status TEXT DEFAULT 'Open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_findings_audit ON audit_findings(audit_id);

CREATE TABLE IF NOT EXISTS management_reviews (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT REFERENCES projects(id),
    review_date DATE NOT NULL,
    attendees TEXT,
    agenda_json TEXT,
    decisions TEXT,
    action_items TEXT,
    minutes_url TEXT,
    status TEXT DEFAULT 'Planned',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ciso_signed_by TEXT,
    ciso_signed_at DATETIME,
    ciso_signed_ip TEXT,
    ceo_signed_by TEXT,
    ceo_signed_at DATETIME,
    ceo_signed_ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_mgmt_reviews_project ON management_reviews(project_id);

-- -----------------------------------------------
-- SPRINT E: AUDITOR COLLABORATION HUB
-- -----------------------------------------------

CREATE TABLE IF NOT EXISTS auditor_notes (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT REFERENCES projects(id),
    auditor_token TEXT NOT NULL,
    control_id TEXT REFERENCES compliance_controls(id),
    note_type TEXT DEFAULT 'question', -- question, observation, evidence_request
    content TEXT NOT NULL,
    response TEXT,
    responded_by TEXT REFERENCES users(id),
    responded_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auditor_notes_project ON auditor_notes(project_id);

-- -----------------------------------------------
-- SPRINT GAPS: ATIVOS, KPIS E ACEITES DE POLÍTICAS
-- -----------------------------------------------

-- ponytail: definição canônica de `itens` (eram `assets`) unificada acima (inclui type/criticality/
-- description). A duplicata que existia aqui foi removida — CREATE TABLE IF NOT EXISTS
-- fazia a segunda ser silenciosamente ignorada e divergir da usada pelo código.

CREATE TABLE IF NOT EXISTS performance_metrics (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id TEXT REFERENCES projects(id),
  metric_name TEXT NOT NULL,
  target_value REAL,
  current_value REAL,
  frequency TEXT DEFAULT 'Monthly', -- Weekly, Monthly, Quarterly, Annual
  last_measured_at DATE,
  owner TEXT,
  status TEXT DEFAULT 'On Track', -- On Track, At Risk, Critical
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_metrics_project ON performance_metrics(project_id);

CREATE TABLE IF NOT EXISTS policy_acknowledgments (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id TEXT REFERENCES projects(id),
  policy_type TEXT NOT NULL, -- ISP, AUP, ACP, IRP, etc.
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  acknowledged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_acknowledgments_project ON policy_acknowledgments(project_id);

CREATE TABLE IF NOT EXISTS dpia_assessments (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    system_name TEXT,
    data_flow_description TEXT,
    data_subjects_types TEXT,
    personal_data_categories TEXT,
    necessity_proportionality TEXT,
    risks_identified TEXT,
    mitigation_measures TEXT,
    dpo_opinion TEXT,
    dpo_signature TEXT,
    ceo_signature TEXT,
    -- Colunas usadas pelo código atual (create/update/approve/report de DPIA)
    ropa_id TEXT,
    processing_name TEXT,
    data_category_risk TEXT,
    technical_measures TEXT,
    residual_risk_level TEXT,
    dpo_recommendations TEXT,
    dpo_approved_by TEXT,
    dpo_approved_at TEXT,
    status TEXT DEFAULT 'Draft', -- Draft, Under Review, Approved
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- Hash do conteúdo do tratamento quando a DPIA nasceu dele (migration 0072), fora do conteúdo congelado da DPIA.
    origem_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_dpia_project ON dpia_assessments(project_id);

CREATE TABLE IF NOT EXISTS project_governance (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    role_category TEXT NOT NULL, -- 'consultor', 'executivo', 'tech', 'operacoes'
    job_title TEXT NOT NULL,     -- 'CEO', 'CTO', 'CISO', 'DPO', etc.
    is_primary INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_project_governance_project ON project_governance(project_id);

-- Concessão de acesso de um agente de IA (MCP remoto) a UM projeto, em nome
-- de um consultor. O token OAuth carrega `concessaoId`; esta linha é o que
-- revalida o acesso a cada chamada e o que o cliente vê e revoga.
CREATE TABLE IF NOT EXISTS agente_concessoes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    cliente_mcp TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    ultimo_uso_em DATETIME,
    expira_em DATETIME NOT NULL,
    revogado_em DATETIME,
    revogado_por TEXT,
    -- migration 0070: consultor implementa; auditor só lê e registra achado e nota (ISO 27001, 9.2)
    papel TEXT NOT NULL DEFAULT 'consultor' CHECK (papel IN ('consultor', 'auditor'))
);
CREATE INDEX IF NOT EXISTS idx_agente_concessoes_projeto ON agente_concessoes(project_id);

-- -----------------------------------------------
-- POLICY VERSION CONTROL (ISO 27001 A.5.1)
-- -----------------------------------------------

CREATE TABLE IF NOT EXISTS policy_versions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    control_id TEXT REFERENCES compliance_controls(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    policy_text TEXT NOT NULL,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_policy_versions_control ON policy_versions(project_id, control_id);
-- -----------------------------------------------
-- POLICY TEMPLATES (Migrated from constants.ts)
-- -----------------------------------------------

CREATE TABLE IF NOT EXISTS policy_templates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  iso_ref TEXT NOT NULL,
  category TEXT DEFAULT 'Organizational',
  difficulty TEXT DEFAULT 'Standard',
  estimated_time TEXT DEFAULT '45 min',
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
-- -----------------------------------------------
-- KNOWLEDGE BASE (RAG) — ingestão de documentos do projeto
-- -----------------------------------------------

CREATE TABLE IF NOT EXISTS project_knowledge (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT DEFAULT 'other',
    content TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_project ON project_knowledge(project_id);

-- -----------------------------------------------
-- SCOPE CHANGES (solicitações de alteração de escopo do projeto)
-- -----------------------------------------------

CREATE TABLE IF NOT EXISTS scope_changes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    change_description TEXT NOT NULL,
    reason TEXT,
    impact_analysis TEXT,
    requested_by TEXT,
    status TEXT DEFAULT 'Pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_scope_changes_project ON scope_changes(project_id);

-- Contador de rate limit atômico (janela fixa) — ver migrations/0024 e rateLimitD1.
CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    window_start INTEGER NOT NULL
);

-- -----------------------------------------------
-- Documentos legais do n.iso (migration 0024)
-- -----------------------------------------------
-- A `classification` é CAMPO DO DOCUMENTO, não julgamento de quem publica: é
-- ela que decide se uma versão nova apenas avisa ('comum') ou barra o acesso
-- até o aceite ('material' — mudança de base legal ou de retenção).
CREATE TABLE IF NOT EXISTS legal_documents (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    version TEXT NOT NULL,
    classification TEXT NOT NULL CHECK (classification IN ('comum', 'material')),
    title TEXT NOT NULL,
    url TEXT,
    published_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (kind, version)
);
CREATE INDEX IF NOT EXISTS idx_legal_documents_kind ON legal_documents(kind, published_at);

-- Data, IP e user-agent: sem os três o registro não prova nada em disputa.
CREATE TABLE IF NOT EXISTS legal_acceptances (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    document_id TEXT NOT NULL REFERENCES legal_documents(id),
    accepted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip TEXT,
    user_agent TEXT,
    UNIQUE (user_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user ON legal_acceptances(user_id);

-- -----------------------------------------------
-- ÍNDICES em colunas quentes (filtros frequentes)
-- -----------------------------------------------
CREATE INDEX IF NOT EXISTS idx_evidence_project ON evidence(project_id);
CREATE INDEX IF NOT EXISTS idx_controls_project ON compliance_controls(project_id);
CREATE INDEX IF NOT EXISTS idx_users_client_project ON users(client_project_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- Catálogo de serviços da organização (spec do sistema de propostas, seção 3).
-- Campos de lista/estrutura são JSON validado por servicoSchema, e a proposta
-- (fatia 3) guarda CÓPIA do serviço, então editar aqui não muda proposta gerada.
CREATE TABLE IF NOT EXISTS servicos (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    norma TEXT NOT NULL DEFAULT '',
    descricao TEXT NOT NULL DEFAULT '',
    tipo TEXT NOT NULL CHECK (tipo IN ('projeto', 'avulso', 'recorrente')),
    forma_preco TEXT CHECK (forma_preco IS NULL OR forma_preco IN ('fixo', 'esforco')),
    valor_fixo REAL,
    mensalidade REAL,
    prazo_minimo_meses INTEGER,
    dias_por_faixa TEXT,
    fases TEXT,
    entregaveis TEXT,
    criterio_aceite TEXT NOT NULL DEFAULT '',
    incluso_mes TEXT,
    premissas TEXT,
    exclusoes TEXT,
    ativo INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_servicos_org ON servicos(org_id, ativo);

-- Proposta comercial (spec do sistema de propostas, seções 4 e 5). Cada revisão
-- é uma linha: mesmo numero, revisao + 1. O documento gerado é congelado.
CREATE TABLE IF NOT EXISTS propostas (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    lead_id TEXT REFERENCES leads(id),
    assessment_id TEXT REFERENCES assessments(id),
    numero TEXT,
    revisao INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aguardando_aprovacao', 'gerada', 'enviada', 'visualizada', 'aceita', 'recusada', 'expirada', 'substituida')),
    cliente TEXT NOT NULL,
    validade_dias INTEGER NOT NULL DEFAULT 30,
    pagamento TEXT NOT NULL DEFAULT '40/30/30',
    contexto TEXT NOT NULL DEFAULT '',
    escopo TEXT NOT NULL DEFAULT '',
    observacoes TEXT NOT NULL DEFAULT '',
    -- Seções de texto reescritas nesta proposta: JSON {secaoId: texto}. Ver documento-proposta.ts.
    secoes_editadas TEXT,
    consultor_email TEXT,
    total_projeto REAL NOT NULL DEFAULT 0,
    mensalidade REAL NOT NULL DEFAULT 0,
    memoria TEXT,
    margem TEXT,
    desconto_aprovado_por TEXT,
    desconto_aprovado_em DATETIME,
    documento_conteudo TEXT,
    documento_html TEXT,
    documento_hash TEXT,
    gerada_em DATETIME,
    valida_ate DATE,
    criada_por TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- Envio e aceite (fatia 4). Só o hash do token é guardado, nunca o token.
    token_hash TEXT,
    link_gerado_em DATETIME,
    enviada_em DATETIME,
    enviada_para TEXT,
    visualizada_em DATETIME,
    aceite_nome TEXT,
    aceite_cargo TEXT,
    aceite_email TEXT,
    aceite_ip TEXT,
    aceite_em DATETIME,
    aceite_origem TEXT CHECK (aceite_origem IS NULL OR aceite_origem IN ('link', 'manual')),
    aceite_comprovante TEXT,
    recusa_motivo TEXT,
    ajuste_mensagem TEXT,
    contrato_id TEXT,
    projeto_id TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_propostas_token ON propostas(token_hash) WHERE token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_propostas_numero ON propostas(org_id, numero, revisao);
CREATE INDEX IF NOT EXISTS idx_propostas_org ON propostas(org_id, status);

CREATE TABLE IF NOT EXISTS proposta_itens (
    id TEXT PRIMARY KEY,
    proposta_id TEXT NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
    ordem INTEGER NOT NULL,
    servico_id TEXT,
    servico TEXT NOT NULL,
    dias REAL,
    meses INTEGER,
    valor_base REAL NOT NULL DEFAULT 0,
    desconto_pct REAL NOT NULL DEFAULT 0,
    valor REAL NOT NULL DEFAULT 0,
    texto_cliente TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_proposta_itens ON proposta_itens(proposta_id, ordem);

-- Pedidos de aprovação/ciência (acesso de stakeholders, fatia 2).
-- `pedidos`: um por documento/ação, com o conteúdo CONGELADO no momento do pedido
-- e o SHA-256 dele. Documento alterado depois vira `substituido`: nunca se aprova
-- texto diferente do lido. `org_id` e `project_id` vêm do projeto (isolamento).
-- `pedido_destinatarios`: uma linha por pessoa, com a prova da decisão (quando,
-- IP, user-agent, hash lido, canal, MFA). `token_hash` é da fatia 3 (link).
CREATE TABLE IF NOT EXISTS pedidos (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('dpia', 'politica', 'documento', 'excecao', 'tratamento', 'avaliacao_terceiro')),
    ref_id TEXT NOT NULL,
    titulo TEXT NOT NULL,
    papel_exigido TEXT NOT NULL CHECK (papel_exigido IN ('ciso', 'ceo', 'ciente')),
    conteudo_json TEXT NOT NULL,
    hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'aprovado', 'recusado', 'substituido', 'cancelado')),
    substituido_por TEXT,
    criado_por TEXT NOT NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pedidos_projeto ON pedidos(project_id, status);
CREATE INDEX IF NOT EXISTS idx_pedidos_documento ON pedidos(tipo, ref_id, status);
-- Um pedido "em pé" aberto por documento para a ciência do portal público (criado_por = 'sistema:portal'):
-- dois acessos simultâneos não criam dois contêineres. A substituição marca o antigo ANTES de criar o novo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_portal_aberto ON pedidos(tipo, ref_id) WHERE criado_por = 'sistema:portal' AND status = 'aberto';
-- Pedido também é prova (0043): conteúdo, hash e documento nunca mudam; fechado não muda de status
-- nem de substituto. `org_id` livre (transferência de projeto). DELETE livre (cascata do projeto).
CREATE TRIGGER IF NOT EXISTS pedido_prova_imutavel
BEFORE UPDATE ON pedidos
WHEN NEW.hash IS NOT OLD.hash
  OR NEW.conteudo_json IS NOT OLD.conteudo_json
  OR NEW.tipo IS NOT OLD.tipo
  OR NEW.ref_id IS NOT OLD.ref_id
  OR NEW.papel_exigido IS NOT OLD.papel_exigido
  OR (OLD.status <> 'aberto' AND (NEW.status IS NOT OLD.status OR NEW.substituido_por IS NOT OLD.substituido_por))
BEGIN
    SELECT RAISE(ABORT, 'prova de pedido e imutavel');
END;

CREATE TABLE IF NOT EXISTS pedido_destinatarios (
    id TEXT PRIMARY KEY,
    pedido_id TEXT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    nome TEXT,
    email TEXT NOT NULL,
    user_id TEXT,
    token_hash TEXT,
    token_expira_em DATETIME,
    aberto_em DATETIME,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'ciente', 'aprovado', 'recusado')),
    decidido_em DATETIME,
    canal TEXT CHECK (canal IS NULL OR canal IN ('conta', 'link', 'portal')),
    ip TEXT,
    user_agent TEXT,
    hash_lido TEXT,
    mfa_usado INTEGER,
    motivo TEXT
);
CREATE INDEX IF NOT EXISTS idx_pedido_dest_pedido ON pedido_destinatarios(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_dest_email ON pedido_destinatarios(email);
CREATE INDEX IF NOT EXISTS idx_pedido_dest_user ON pedido_destinatarios(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedido_dest_token ON pedido_destinatarios(token_hash) WHERE token_hash IS NOT NULL;
-- Prova imutável (0042): decisão gravada não muda; correção é um pedido novo.
CREATE TRIGGER IF NOT EXISTS pedido_dest_prova_imutavel
BEFORE UPDATE ON pedido_destinatarios
WHEN OLD.status <> 'pendente'
BEGIN
    SELECT RAISE(ABORT, 'prova de pedido decidido e imutavel');
END;

-- Avisos de prazo (0046): registro de idempotência da rotina diária (src/services/avisos-prazo.ts).
CREATE TABLE IF NOT EXISTS avisos_prazo (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    fonte TEXT NOT NULL,
    item_id TEXT NOT NULL,
    marco TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vence_em TEXT NOT NULL,
    titulo TEXT NOT NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    email_enviado_em DATETIME,
    UNIQUE(fonte, item_id, marco, user_id, vence_em)
);
CREATE INDEX IF NOT EXISTS idx_avisos_prazo_email ON avisos_prazo(email_enviado_em, user_id);

-- ─── Núcleo do n.privacy, fatia 1.1 (migration 0047) ───
CREATE TABLE IF NOT EXISTS projeto_modulos (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    modulo TEXT NOT NULL CHECK (modulo IN ('iso', 'privacy')),
    habilitado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    habilitado_por TEXT NOT NULL DEFAULT 'sistema',
    PRIMARY KEY (project_id, modulo)
);
-- Módulo inicial do projeto novo = o contrato da organização (0060; antes, sempre `iso`).
CREATE TRIGGER IF NOT EXISTS projeto_modulos_do_contrato AFTER INSERT ON projects
BEGIN
    INSERT OR IGNORE INTO projeto_modulos (project_id, modulo, habilitado_por)
        SELECT NEW.id, j.value, 'sistema' FROM organizations o, json_each(CASE WHEN json_valid(o.modulos_contratados) THEN o.modulos_contratados ELSE '[]' END) j
         WHERE o.id = NEW.org_id AND j.value IN ('iso', 'privacy');
    INSERT OR IGNORE INTO projeto_modulos (project_id, modulo, habilitado_por)
        SELECT NEW.id, 'iso', 'sistema' WHERE NOT EXISTS (SELECT 1 FROM projeto_modulos WHERE project_id = NEW.id);
END;

CREATE TABLE IF NOT EXISTS departamentos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    descricao TEXT, -- 0081: descrição da área (tela Áreas do n.privacy)
    UNIQUE (project_id, nome)
);

-- Pessoa ou organização do projeto. O papel é do vínculo, não da parte. Sem CPF (spec 4.2).
-- user_id liga a pessoa à conta quando existe; a API da 1.1 não o escreve (entra na conciliação, 1.3).
CREATE TABLE IF NOT EXISTS partes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'pessoa' CHECK (tipo IN ('pessoa', 'organizacao')),
    nome TEXT NOT NULL,
    email TEXT,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'inativa')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    terceiro_tipo TEXT CHECK (terceiro_tipo IS NULL OR terceiro_tipo IN ('grande_provedor', 'medio', 'pequeno', 'critico'))
);
CREATE INDEX IF NOT EXISTS idx_partes_projeto ON partes(project_id, status);

-- alvo_id não tem FK: aponta para tabelas diferentes conforme alvo_tipo. A API confere que o alvo
-- existe NO projeto antes de gravar.
CREATE TABLE IF NOT EXISTS parte_vinculos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parte_id TEXT NOT NULL REFERENCES partes(id) ON DELETE CASCADE,
    papel TEXT NOT NULL CHECK (papel IN ('encarregado', 'dono_processo', 'dono_sistema', 'operador', 'cocontrolador', 'suboperador', 'terceiro', 'responsavel', 'parte_interessada')),
    alvo_tipo TEXT NOT NULL CHECK (alvo_tipo IN ('projeto', 'item', 'departamento', 'tratamento', 'parte')),
    alvo_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (parte_id, papel, alvo_tipo, alvo_id)
);
CREATE INDEX IF NOT EXISTS idx_parte_vinculos_alvo ON parte_vinculos(project_id, alvo_tipo, alvo_id);

-- Fornecedor (n.iso) e terceiro (n.privacy) são a mesma parte (0061): o vínculo `terceiro` no projeto cria o perfil em
-- `vendors`, e o nome da parte manda no nome do perfil.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_parte ON vendors(parte_id);

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

-- Documentos e versões (fatia 3.1 do núcleo do n.privacy). Só CREATE ... IF NOT EXISTS, sem carga: o hash
-- (SHA-256 canônico) não se calcula em SQLite, então as políticas que já existem entram por
-- POST /api/v1/projects/:projectId/documentos/importar, por projeto e repetível.
CREATE TABLE IF NOT EXISTS documentos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'politica' CHECK (tipo IN ('politica', 'norma', 'procedimento')),
    titulo TEXT NOT NULL,
    pai_id TEXT REFERENCES documentos(id) ON DELETE SET NULL,
    dono_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
    revisar_a_cada_meses INTEGER CHECK (revisar_a_cada_meses IS NULL OR revisar_a_cada_meses BETWEEN 1 AND 120),
    revisar_ate TEXT,
    status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'vigente', 'obsoleto')),
    origem_control_id TEXT REFERENCES compliance_controls(id) ON DELETE SET NULL, -- transitório: sai quando a ciência passar para a versão (3.3)
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_documentos_projeto ON documentos(project_id, tipo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_documentos_controle ON documentos(origem_control_id) WHERE origem_control_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_evidence_documento ON evidence(documento_id);

-- Uma versão vigente e um rascunho, no máximo, por documento (índices parciais): é a trava contra duas
-- publicações simultâneas. `project_id` se repete aqui para a tabela entrar na portabilidade.
CREATE TABLE IF NOT EXISTS documento_versoes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    documento_id TEXT NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
    numero INTEGER NOT NULL,
    texto TEXT NOT NULL,
    hash TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho', 'vigente', 'substituida')),
    origem TEXT NOT NULL DEFAULT 'humano' CHECK (origem IN ('humano', 'agente', 'gerador')),
    criado_por TEXT,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (documento_id, numero)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_versao_vigente ON documento_versoes(documento_id) WHERE estado = 'vigente';
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_versao_rascunho ON documento_versoes(documento_id) WHERE estado = 'rascunho';

-- Exceções a documentos (fatia 3.5 do núcleo do n.privacy). Só CREATE ... IF NOT EXISTS, sem carga.
--
-- Uma exceção diz a quem ou ao quê ela vale (`escopo`), por quê (`motivo`) e até quando (`vence_em`, AAAA-MM-DD).
-- A aprovação NÃO tem coluna aqui: é um pedido `tipo = 'excecao'` (a 0051 já aceita) com `ref_id` = esta linha, e a
-- prova é a linha do destinatário. A exceção está aprovada se existe pedido aprovado com o hash do conteúdo atual
-- (escopo, motivo, vence_em): mudar qualquer um invalida a aprovação sozinho. `status` guarda só o que é ato:
-- `ativa` ou `revogada`. Vencida, aprovada e aguardando são derivadas.
CREATE TABLE IF NOT EXISTS documento_excecoes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    documento_id TEXT NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
    escopo TEXT NOT NULL,
    motivo TEXT NOT NULL,
    vence_em TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'revogada')),
    criado_por TEXT,
    revogada_em DATETIME,
    revogada_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_excecoes_documento ON documento_excecoes(documento_id, status);
CREATE INDEX IF NOT EXISTS idx_excecoes_projeto ON documento_excecoes(project_id, status, vence_em);

-- Catálogo de requisitos (fatia 2, migration 0053)
CREATE TABLE IF NOT EXISTS requisito_fontes (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    versao TEXT,
    vigente_desde TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requisitos (
    id TEXT PRIMARY KEY,
    fonte_id TEXT NOT NULL REFERENCES requisito_fontes(id),
    referencia TEXT NOT NULL,
    titulo TEXT NOT NULL,
    pai_id TEXT REFERENCES requisitos(id),
    papel TEXT CHECK (papel IS NULL OR papel IN ('controlador', 'operador')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (fonte_id, referencia)
);
CREATE INDEX IF NOT EXISTS idx_requisitos_fonte ON requisitos(fonte_id, referencia);
CREATE INDEX IF NOT EXISTS idx_requisitos_pai ON requisitos(pai_id);

CREATE TABLE IF NOT EXISTS requisito_mapeamentos (
    de_id TEXT NOT NULL REFERENCES requisitos(id) ON DELETE CASCADE,
    para_id TEXT NOT NULL REFERENCES requisitos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('equivalente', 'parcial', 'relacionado')),
    estado TEXT NOT NULL DEFAULT 'proposto' CHECK (estado IN ('proposto', 'validado_juridico')),
    validado_por TEXT,
    validado_em TEXT,
    nota TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (de_id, para_id),
    CHECK (de_id <> para_id),
    CHECK (estado = 'proposto' OR (validado_por IS NOT NULL AND validado_em IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_mapeamentos_para ON requisito_mapeamentos(para_id);

CREATE TABLE IF NOT EXISTS documento_requisitos (
    documento_id TEXT NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
    requisito_id TEXT NOT NULL REFERENCES requisitos(id),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (documento_id, requisito_id)
);
CREATE INDEX IF NOT EXISTS idx_doc_requisitos_requisito ON documento_requisitos(requisito_id);
CREATE INDEX IF NOT EXISTS idx_doc_requisitos_projeto ON documento_requisitos(project_id);

-- Ligações do tratamento (fatia 4.1, migration 0054)
CREATE TABLE IF NOT EXISTS tratamento_itens (
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES itens(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ropa_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_trat_itens_item ON tratamento_itens(item_id);

CREATE TABLE IF NOT EXISTS tratamento_departamentos (
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    departamento_id TEXT NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ropa_id, departamento_id)
);
CREATE INDEX IF NOT EXISTS idx_trat_deptos_depto ON tratamento_departamentos(departamento_id);

CREATE TABLE IF NOT EXISTS tratamento_transferencias (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    pais TEXT NOT NULL,
    destinatario_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
    mecanismo TEXT,
    observacao TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_trat_transf_ropa ON tratamento_transferencias(ropa_id);
CREATE INDEX IF NOT EXISTS idx_trat_transf_projeto ON tratamento_transferencias(project_id);

-- DPIA ligada ao tratamento e LIA (fatia 5, migration 0056)
CREATE TRIGGER IF NOT EXISTS dpia_ropa_do_projeto_ins
BEFORE INSERT ON dpia_assessments
WHEN NEW.ropa_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ropa_records r WHERE r.id = NEW.ropa_id AND r.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'ropa_id inexistente ou de outro projeto');
END;

CREATE TRIGGER IF NOT EXISTS dpia_ropa_do_projeto_upd
BEFORE UPDATE OF ropa_id ON dpia_assessments
WHEN NEW.ropa_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ropa_records r WHERE r.id = NEW.ropa_id AND r.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'ropa_id inexistente ou de outro projeto');
END;

CREATE TRIGGER IF NOT EXISTS dpia_ropa_apagada
AFTER DELETE ON ropa_records
BEGIN
    UPDATE dpia_assessments SET ropa_id = NULL WHERE ropa_id = OLD.id;
END;

CREATE TABLE IF NOT EXISTS lia_assessments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ropa_id TEXT NOT NULL UNIQUE REFERENCES ropa_records(id) ON DELETE CASCADE,
    finalidade_legitima TEXT,
    necessidade TEXT,
    balanceamento TEXT,
    salvaguardas TEXT,
    conclusao TEXT CHECK (conclusao IS NULL OR conclusao IN ('prevalece', 'nao_prevalece')),
    status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'concluida')),
    concluida_em DATETIME,
    concluida_por TEXT,
    criado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Hash do conteúdo do tratamento quando a LIA nasceu (migration 0072).
    origem_hash TEXT,
    CHECK (status = 'rascunho' OR (conclusao IS NOT NULL AND concluida_em IS NOT NULL AND concluida_por IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_lia_projeto ON lia_assessments(project_id, status);

-- Teste de impacto do tratamento (migration 0072): uma resposta por pergunta do catálogo de src/services/impacto.ts.
-- Fora do conteúdo congelado da aprovação do RoPA.
CREATE TABLE IF NOT EXISTS tratamento_impacto (
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    pergunta TEXT NOT NULL,
    resposta TEXT NOT NULL CHECK (resposta IN ('sim', 'nao', 'nao_sei')),
    atualizado_por TEXT,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ropa_id, pergunta)
);
CREATE INDEX IF NOT EXISTS idx_tratamento_impacto_projeto ON tratamento_impacto(project_id);

-- Ciclo de vida por etapa e bases legais adicionais da atividade (migration 0074). Fora do conteúdo congelado da aprovação.
CREATE TABLE IF NOT EXISTS tratamento_ciclo (
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    etapa TEXT NOT NULL CHECK (etapa IN ('coleta', 'uso', 'compartilhamento_interno', 'compartilhamento_externo', 'armazenamento', 'eliminacao')),
    situacao TEXT NOT NULL CHECK (situacao IN ('registrada', 'nao_aplicavel')),
    item_id TEXT REFERENCES itens(id) ON DELETE SET NULL,
    descricao TEXT CHECK (descricao IS NULL OR length(descricao) <= 1000),
    atualizado_por TEXT,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Ficha em abas (migration 0079): cabeçalho da etapa.
    origem TEXT CHECK (origem IS NULL OR json_valid(origem)),
    solicita_consentimento INTEGER CHECK (solicita_consentimento IS NULL OR solicita_consentimento IN (0, 1)),
    descricao_etapa TEXT CHECK (descricao_etapa IS NULL OR length(descricao_etapa) <= 4000),
    descarte TEXT CHECK (descarte IS NULL OR length(descarte) <= 2000),
    migrado INTEGER NOT NULL DEFAULT 0 CHECK (migrado IN (0, 1)),
    PRIMARY KEY (ropa_id, etapa),
    CHECK (situacao = 'registrada' OR item_id IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_tratamento_ciclo_projeto ON tratamento_ciclo(project_id);
CREATE INDEX IF NOT EXISTS idx_tratamento_ciclo_item ON tratamento_ciclo(item_id);

CREATE TRIGGER IF NOT EXISTS tratamento_ciclo_do_projeto_ins
BEFORE INSERT ON tratamento_ciclo
WHEN NOT EXISTS (SELECT 1 FROM ropa_records r WHERE r.id = NEW.ropa_id AND r.project_id IS NEW.project_id)
  OR (NEW.item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM itens i WHERE i.id = NEW.item_id AND i.project_id IS NEW.project_id))
BEGIN
    SELECT RAISE(ABORT, 'tratamento ou item inexistente ou de outro projeto');
END;

CREATE TRIGGER IF NOT EXISTS tratamento_ciclo_do_projeto_upd
BEFORE UPDATE ON tratamento_ciclo
WHEN NOT EXISTS (SELECT 1 FROM ropa_records r WHERE r.id = NEW.ropa_id AND r.project_id IS NEW.project_id)
  OR (NEW.item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM itens i WHERE i.id = NEW.item_id AND i.project_id IS NEW.project_id))
BEGIN
    SELECT RAISE(ABORT, 'tratamento ou item inexistente ou de outro projeto');
END;

CREATE TABLE IF NOT EXISTS tratamento_bases (
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    requisito_id TEXT NOT NULL REFERENCES requisitos(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    observacao TEXT CHECK (observacao IS NULL OR length(observacao) <= 500),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Ficha em abas (migration 0079): finalidade por inciso.
    finalidade TEXT CHECK (finalidade IS NULL OR length(finalidade) <= 2000),
    PRIMARY KEY (ropa_id, requisito_id)
);
CREATE INDEX IF NOT EXISTS idx_tratamento_bases_projeto ON tratamento_bases(project_id);

-- Terceiros tipificados (fatia 6, migration 0057)
CREATE TABLE IF NOT EXISTS avaliacoes_terceiro (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parte_id TEXT NOT NULL REFERENCES partes(id) ON DELETE CASCADE,
    metodo TEXT NOT NULL CHECK (metodo IN ('trust_center', 'questionario', 'auditoria')),
    resultado TEXT NOT NULL CHECK (resultado IN ('aprovado', 'com_ressalvas', 'reprovado')),
    valido_ate TEXT NOT NULL,
    evidencia_url TEXT,
    observacao TEXT,
    avaliado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_aval_terceiro_parte ON avaliacoes_terceiro(parte_id, created_at);
CREATE INDEX IF NOT EXISTS idx_aval_terceiro_projeto ON avaliacoes_terceiro(project_id, valido_ate);

CREATE TABLE IF NOT EXISTS documento_partes (
    documento_id TEXT NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
    parte_id TEXT NOT NULL REFERENCES partes(id) ON DELETE CASCADE,
    papel TEXT NOT NULL DEFAULT 'dpa' CHECK (papel IN ('dpa', 'contrato', 'outro')),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (documento_id, parte_id, papel)
);
CREATE INDEX IF NOT EXISTS idx_doc_partes_parte ON documento_partes(parte_id);

-- Avaliação de criticidade do fornecedor (migration 0080): histórico; o nível é derivado no servidor
CREATE TABLE IF NOT EXISTS criticidades_terceiro (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parte_id TEXT NOT NULL REFERENCES partes(id) ON DELETE CASCADE,
    impacto TEXT NOT NULL CHECK (impacto IN ('alto', 'medio', 'baixo')),
    exclusividade TEXT NOT NULL CHECK (exclusividade IN ('sem_alternativas', 'poucas_alternativas', 'varias_alternativas')),
    risco_financeiro TEXT NOT NULL CHECK (risco_financeiro IN ('alto', 'medio', 'baixo')),
    conformidade TEXT NOT NULL CHECK (conformidade IN ('regulamentado', 'sem_regulamentacao')),
    risco_reputacional TEXT NOT NULL CHECK (risco_reputacional IN ('alto', 'medio', 'baixo')),
    nivel TEXT NOT NULL CHECK (nivel IN ('alto', 'medio', 'baixo')),
    avaliado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_criticidade_terceiro_parte ON criticidades_terceiro(parte_id, created_at);
CREATE INDEX IF NOT EXISTS idx_criticidade_terceiro_projeto ON criticidades_terceiro(project_id);

-- Documento do legado (0081): arquivo com metadados (tipo, situação, vencimento, responsável), separado dos documentos versionados.
CREATE TABLE IF NOT EXISTS documentos_arquivo (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('politica', 'norma', 'procedimento', 'termo', 'contrato', 'aditivo', 'relatorio', 'outro')),
    status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicado', 'obsoleto')),
    vencimento DATE,
    sem_vencimento INTEGER NOT NULL DEFAULT 0 CHECK (sem_vencimento IN (0, 1)),
    responsavel_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
    r2_key TEXT,
    arquivo_nome TEXT,
    arquivo_tipo TEXT CHECK (arquivo_tipo IS NULL OR arquivo_tipo IN ('pdf', 'doc', 'docx')),
    criado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (sem_vencimento = 0 OR vencimento IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_documentos_arquivo_projeto ON documentos_arquivo(project_id, nome);

-- Titular, incidente e consentimento (fatia 7, migration 0058)
CREATE TABLE IF NOT EXISTS parametros_legais (
    chave TEXT PRIMARY KEY,
    valor INTEGER NOT NULL CHECK (valor > 0),
    unidade TEXT NOT NULL CHECK (unidade IN ('horas', 'dias_corridos', 'dias_uteis')),
    fonte TEXT NOT NULL,
    revisado_em TEXT NOT NULL,
    revisado_por TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS titular_pedidos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    protocolo TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('confirmacao', 'acesso', 'correcao', 'anonimizacao_bloqueio_eliminacao', 'portabilidade', 'informacao_compartilhamento', 'revogacao_consentimento', 'oposicao', 'outro')),
    canal TEXT NOT NULL DEFAULT 'outro' CHECK (canal IN ('email', 'telefone', 'formulario', 'presencial', 'outro')),
    titular_nome TEXT,
    titular_contato TEXT,
    descricao TEXT,
    recebido_em TEXT NOT NULL,
    prazo_em TEXT,
    status TEXT NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido', 'em_andamento', 'respondido', 'negado', 'arquivado')),
    respondido_em TEXT,
    resposta_texto TEXT,
    responsavel_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
    criado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, protocolo),
    CHECK (status NOT IN ('respondido', 'negado') OR respondido_em IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_titular_pedidos_projeto ON titular_pedidos(project_id, status, prazo_em);

CREATE TABLE IF NOT EXISTS incidentes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    protocolo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    ocorrido_em TEXT,
    ciencia_em TEXT NOT NULL,
    risco_titular TEXT CHECK (risco_titular IS NULL OR risco_titular IN ('sem_risco', 'baixo', 'relevante')),
    avaliacao_texto TEXT,
    comunicacao_anpd_em TEXT,
    comunicacao_titular_em TEXT,
    prazo_anpd_em TEXT,
    prazo_titular_em TEXT,
    status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'avaliado', 'comunicado', 'encerrado')),
    responsavel_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
    criado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, protocolo),
    CHECK (status <> 'encerrado' OR risco_titular IS NOT NULL),
    CHECK (status <> 'encerrado' OR risco_titular <> 'relevante' OR comunicacao_anpd_em IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_incidentes_projeto ON incidentes(project_id, status);

CREATE TABLE IF NOT EXISTS consentimentos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    titular_ref TEXT NOT NULL,
    finalidade TEXT NOT NULL,
    versao_aviso TEXT NOT NULL,
    obtido_em TEXT NOT NULL,
    canal TEXT,
    revogado_em TEXT,
    revogado_por TEXT,
    criado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_consentimentos_ropa ON consentimentos(ropa_id);
CREATE INDEX IF NOT EXISTS idx_consentimentos_projeto ON consentimentos(project_id, revogado_em);

-- Evidência com validade e requisito (fatia 8, migration 0059)
CREATE TABLE IF NOT EXISTS evidencia_requisitos (
    evidencia_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    requisito_id TEXT NOT NULL REFERENCES requisitos(id),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (evidencia_id, requisito_id)
);
CREATE INDEX IF NOT EXISTS idx_evid_requisitos_requisito ON evidencia_requisitos(requisito_id);
CREATE INDEX IF NOT EXISTS idx_evid_requisitos_projeto ON evidencia_requisitos(project_id);
CREATE INDEX IF NOT EXISTS idx_evidence_validade ON evidence(valido_ate);

-- Importação de programa de privacidade (n.privacy, migration 0064)
CREATE TABLE IF NOT EXISTS importacoes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    criado_por TEXT,
    status TEXT NOT NULL DEFAULT 'recebendo' CHECK (status IN ('recebendo', 'processando', 'em_revisao', 'gravando', 'concluida', 'cancelada')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_importacoes_projeto ON importacoes(project_id, created_at);

CREATE TABLE IF NOT EXISTS importacao_arquivos (
    id TEXT PRIMARY KEY,
    importacao_id TEXT NOT NULL REFERENCES importacoes(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    mime TEXT NOT NULL,
    tamanho INTEGER NOT NULL,
    r2_key TEXT NOT NULL,
    tipo TEXT CHECK (tipo IS NULL OR tipo IN ('inventario', 'terceiros', 'documento', 'avaliacao', 'historico', 'desconhecido')),
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processado', 'aguardando', 'erro')),
    erro TEXT,
    modelo TEXT,
    blocos_total INTEGER,
    bloco_atual INTEGER NOT NULL DEFAULT 0,
    blocos_falhos TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_importacao_arquivos_lote ON importacao_arquivos(importacao_id);
CREATE INDEX IF NOT EXISTS idx_importacao_arquivos_projeto ON importacao_arquivos(project_id);

CREATE TABLE IF NOT EXISTS importacao_itens (
    id TEXT PRIMARY KEY,
    importacao_id TEXT NOT NULL REFERENCES importacoes(id) ON DELETE CASCADE,
    arquivo_id TEXT NOT NULL REFERENCES importacao_arquivos(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    entidade TEXT NOT NULL DEFAULT 'tratamento' CHECK (entidade IN ('tratamento', 'terceiro', 'documento', 'dpia', 'lia', 'titular_pedido', 'incidente', 'consentimento', 'risco', 'gap', 'impacto', 'ciclo', 'bases')),
    dados TEXT NOT NULL DEFAULT '{}',
    origem TEXT CHECK (origem IS NULL OR length(origem) <= 500),
    confianca TEXT NOT NULL DEFAULT 'baixa' CHECK (confianca IN ('alta', 'media', 'baixa')),
    faltando TEXT NOT NULL DEFAULT '[]',
    -- id do registro conforme a entidade (ropa_records ou partes), sem FK desde a 0067
    duplicata_de TEXT,
    decisao TEXT NOT NULL DEFAULT 'pendente' CHECK (decisao IN ('pendente', 'aceito', 'descartado', 'gravado', 'recusado')),
    motivo TEXT,
    registro_id TEXT,
    -- aviso da gravação (migration 0076), contado no relatório de reconciliação
    aviso TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_importacao_itens_lote ON importacao_itens(importacao_id, decisao);
CREATE INDEX IF NOT EXISTS idx_importacao_itens_arquivo ON importacao_itens(arquivo_id);
CREATE INDEX IF NOT EXISTS idx_importacao_itens_projeto ON importacao_itens(project_id);

-- ─── n.360, fatia 3: módulos por pessoa (migration 0066) ───
CREATE TABLE IF NOT EXISTS usuario_modulos (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    modulo TEXT NOT NULL CHECK (modulo IN ('iso', 'privacy')),
    concedido_por TEXT,
    concedido_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, modulo)
);
-- Conta nova recebe o padrão (cliente: os módulos do projeto; equipe: o contrato da organização, ou n.iso). Ver a 0066.
CREATE TRIGGER IF NOT EXISTS usuario_modulos_padrao AFTER INSERT ON users
BEGIN
    INSERT OR IGNORE INTO usuario_modulos (user_id, modulo, concedido_por)
        SELECT NEW.id, pm.modulo, 'padrao' FROM projeto_modulos pm
         WHERE pm.project_id = NEW.client_project_id
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

-- ─── Cadastro da empresa do projeto (migration 0071) ───
CREATE TABLE IF NOT EXISTS empresas (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    cnpj TEXT CHECK (cnpj IS NULL OR (length(cnpj) = 14 AND cnpj NOT GLOB '*[^0-9]*')),
    documento_alternativo TEXT,
    razao_social TEXT,
    nome_fantasia TEXT,
    natureza_juridica TEXT,
    porte TEXT,
    data_abertura TEXT CHECK (data_abertura IS NULL OR data_abertura GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    situacao_cadastral TEXT,
    cnae_codigo TEXT,
    cnae_descricao TEXT,
    setor TEXT,
    funcionarios INTEGER CHECK (funcionarios IS NULL OR funcionarios >= 0),
    cep TEXT,
    logradouro TEXT,
    numero TEXT,
    complemento TEXT,
    bairro TEXT,
    municipio TEXT,
    uf TEXT CHECK (uf IS NULL OR (length(uf) = 2 AND uf GLOB '[A-Z][A-Z]')),
    pais TEXT NOT NULL DEFAULT 'BR',
    telefone TEXT,
    email TEXT,
    site TEXT,
    representante_nome TEXT,
    representante_cargo TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_empresas_cnpj ON empresas(cnpj);

-- Homologação de fornecedor por questionário (F5, migration 0075). Só o hash do token do link; perguntas congeladas na criação;
-- respostas imutáveis depois do envio (gatilho homologacao_imutavel). A conclusão grava em avaliacoes_terceiro.
CREATE TABLE IF NOT EXISTS homologacao_perguntas (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tema TEXT NOT NULL CHECK (length(tema) BETWEEN 1 AND 80),
    texto TEXT NOT NULL CHECK (length(texto) BETWEEN 1 AND 500),
    ordem INTEGER NOT NULL DEFAULT 0,
    ativa INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0, 1)),
    origem TEXT NOT NULL DEFAULT 'projeto' CHECK (origem IN ('padrao', 'projeto')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_homologacao_perguntas_projeto ON homologacao_perguntas(project_id, ordem);

CREATE TABLE IF NOT EXISTS homologacoes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parte_id TEXT NOT NULL REFERENCES partes(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expira_em DATETIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'respondida', 'concluida', 'cancelada')),
    perguntas_json TEXT NOT NULL,
    respostas_json TEXT NOT NULL DEFAULT '{}',
    enviada_em DATETIME,
    resultado TEXT CHECK (resultado IS NULL OR resultado IN ('aprovado', 'com_ressalvas', 'reprovado')),
    avaliacao_id TEXT REFERENCES avaliacoes_terceiro(id) ON DELETE SET NULL,
    concluida_por TEXT,
    concluida_em DATETIME,
    criado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_homologacoes_projeto ON homologacoes(project_id, parte_id, created_at);

CREATE TRIGGER IF NOT EXISTS homologacao_imutavel
BEFORE UPDATE ON homologacoes
WHEN NEW.perguntas_json IS NOT OLD.perguntas_json OR NEW.token_hash IS NOT OLD.token_hash
  OR NEW.parte_id IS NOT OLD.parte_id OR NEW.project_id IS NOT OLD.project_id
  OR (OLD.status != 'aberta' AND NEW.respostas_json IS NOT OLD.respostas_json)
  OR (OLD.status != 'aberta' AND NEW.status = 'aberta')
BEGIN
    SELECT RAISE(ABORT, 'homologacao: perguntas e respostas enviadas sao imutaveis');
END;

-- Convite com link para criar a senha (migration 0077): só o SHA-256 do token, 72 h, uso único (DELETE condicional), reenviar substitui.
CREATE TABLE IF NOT EXISTS convites_senha (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expira_em DATETIME NOT NULL,
    criado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Ficha em abas (migration 0079): catálogo do projeto, ciclo por etapa, medidas, bases do GDPR, anexos de gap e gatilhos de tenant. Os catálogos nascem vazios.
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
    descricao TEXT CHECK (descricao IS NULL OR (tipo = 'titular' AND length(descricao) <= 2000)),
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

-- Respostas do questionário do RIPD (migration 0083): fora do hash da aprovação (COLUNAS_DPIA).
CREATE TABLE IF NOT EXISTS dpia_respostas (
    dpia_id TEXT NOT NULL REFERENCES dpia_assessments(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    pergunta TEXT NOT NULL CHECK (length(pergunta) BETWEEN 1 AND 60),
    resposta TEXT NOT NULL CHECK (length(resposta) <= 2000),
    updated_by TEXT,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (dpia_id, pergunta)
);
CREATE INDEX IF NOT EXISTS idx_dpia_respostas_projeto ON dpia_respostas(project_id);

CREATE TRIGGER IF NOT EXISTS dpia_respostas_do_projeto_ins BEFORE INSERT ON dpia_respostas
WHEN NOT EXISTS (SELECT 1 FROM dpia_assessments d WHERE d.id = NEW.dpia_id AND d.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'RIPD inexistente ou de outro projeto');
END;
