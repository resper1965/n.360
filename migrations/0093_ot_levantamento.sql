-- 0093 — n.ot, descoberta operacional (L1): sessões de levantamento (entrevista, visita, documento), achados e roteiro.
-- Spec: OT2net docs/superpowers/specs/2026-11-01-n-ot-descoberta-operacional-design.md. Operador sem nome (só função/turno).
-- IP/MAC só cifrados (ot1:), mesmo CHECK da 0092. ot_lotes NÃO é refeita (gatilhos e RENAME no D1, ver 0089): só ganha a coluna.
-- Repetível: IF NOT EXISTS e INSERT OR IGNORE; a coluna nova é aplicada uma vez pelo runner de migrações.

CREATE TABLE IF NOT EXISTS ot_levantamentos (
    id TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    site_id TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('entrevista', 'visita', 'documento')),
    realizado_em TEXT NOT NULL,
    funcao TEXT,
    turno TEXT,
    documento_titulo TEXT,
    documento_data TEXT,
    notas TEXT NOT NULL DEFAULT '',
    roteiro TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(roteiro) AND json_type(roteiro) = 'object'),
    situacao TEXT NOT NULL DEFAULT 'aberto' CHECK (situacao IN ('aberto', 'encerrado')),
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'removido')),
    criado_por TEXT NOT NULL,
    encerrado_em DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE (id, project_id),
    FOREIGN KEY (site_id, project_id) REFERENCES ot_sites(id, project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ot_levantamentos_projeto ON ot_levantamentos(project_id, site_id);

CREATE TABLE IF NOT EXISTS ot_achados (
    id TEXT NOT NULL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    levantamento_id TEXT NOT NULL,
    entidade TEXT NOT NULL DEFAULT 'ativo' CHECK (entidade IN ('ativo', 'fluxo')),
    dados TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(dados) AND json_type(dados) = 'object'
        AND json_type(dados, '$.ip') IS NULL AND json_type(dados, '$.mac') IS NULL
        AND (json_extract(dados, '$.ip_cifrado') IS NULL OR json_extract(dados, '$.ip_cifrado') LIKE 'ot1:%')
        AND (json_extract(dados, '$.mac_cifrado') IS NULL OR json_extract(dados, '$.mac_cifrado') LIKE 'ot1:%')),
    erros TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(erros) AND json_type(erros) = 'array'),
    evidencia TEXT NOT NULL DEFAULT '',
    origem TEXT NOT NULL DEFAULT 'consultor' CHECK (origem IN ('consultor', 'ia', 'agente')),
    situacao TEXT NOT NULL DEFAULT 'rascunho' CHECK (situacao IN ('rascunho', 'enviado', 'descartado')),
    lote_id TEXT,
    criado_por TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (levantamento_id, project_id) REFERENCES ot_levantamentos(id, project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ot_achados_sessao ON ot_achados(levantamento_id, situacao);

CREATE TABLE IF NOT EXISTS ot_roteiro_perguntas (
    id TEXT NOT NULL PRIMARY KEY,
    ordem INTEGER NOT NULL,
    texto TEXT NOT NULL,
    item_norma TEXT NOT NULL,
    entidade_esperada TEXT CHECK (entidade_esperada IS NULL OR entidade_esperada IN ('ativo', 'fluxo', 'ativo_fluxo')),
    tipos_sessao TEXT NOT NULL DEFAULT '["entrevista","visita"]' CHECK (json_valid(tipos_sessao))
);

INSERT OR IGNORE INTO ot_roteiro_perguntas (id, ordem, texto, item_norma, entidade_esperada) VALUES
 ('rot-01', 1, 'Algum equipamento desta sala é acessado de fora da empresa? Por qual ferramenta?', '4.1.3', 'fluxo'),
 ('rot-02', 2, 'Fornecedores acessam remotamente? Como pedem e como entram?', '4.1.3, 4.5.1.5', 'fluxo'),
 ('rot-03', 3, 'Há algum computador aqui com acesso à internet, mesmo que só às vezes?', '4.1.2', 'ativo_fluxo'),
 ('rot-04', 4, 'Algum notebook pessoal ou de terceiro é ligado à rede ou à IHM?', '4.3.1', 'ativo'),
 ('rot-05', 5, 'Como os arquivos entram e saem (pendrive, e-mail, pasta compartilhada)?', '4.1.4', 'ativo_fluxo'),
 ('rot-06', 6, 'Como é feita a atualização de firmware e de sistema? Quem traz o arquivo?', '4.4.1, 4.4.2', 'ativo'),
 ('rot-07', 7, 'Equipamento novo é ligado antes ou depois de atualizado?', '4.4.2', 'ativo'),
 ('rot-08', 8, 'Há senhas compartilhadas entre turnos ou anotadas em algum lugar?', '4.5.1.1, 4.5.1.2', NULL),
 ('rot-09', 9, 'Algum equipamento ainda usa a senha de fábrica?', '4.5.1.6', 'ativo'),
 ('rot-10', 10, 'Quem tem acesso de administrador? Alguém que já saiu ainda tem?', '4.5.1.4, 4.5.1.5', NULL),
 ('rot-11', 11, 'Há antivírus nas estações? Ele é atualizado?', '4.1.4', 'ativo'),
 ('rot-12', 12, 'Existe algum equipamento que ninguém sabe bem para que serve, mas não se desliga?', '4.3.1', 'ativo'),
 ('rot-13', 13, 'Há modem, roteador 4G ou link de dados fora do padrão?', '4.1.2, 4.1.3', 'ativo_fluxo'),
 ('rot-14', 14, 'Quando algo estranho acontece na rede, a quem vocês avisam?', '4.6.3, 4.6.4', NULL),
 ('rot-15', 15, 'Os equipamentos guardam registro de quem entrou e do que fez?', '4.6.1', 'ativo');

ALTER TABLE ot_lotes ADD COLUMN levantamento_id TEXT REFERENCES ot_levantamentos(id) ON DELETE SET NULL;
