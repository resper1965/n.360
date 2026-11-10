-- 0091 — n.ot: inventário (sites, zonas, ativos, fluxos e o acesso por site). Spec 2026-10-30-n-ot-modulo-n360-design §6.
--
-- Isolamento no banco: toda referência entre tabelas ot_* é FK composta com o project_id (site, zona e ativo de outro projeto
-- não entram nem por bug de rota); a zona do ativo é do MESMO site. Exclusão lógica (`status` ativo/removido) nos cadastros;
-- a física só vem do projeto (ON DELETE CASCADE).
-- `ot_ativos`: IP e MAC só cifrados pelo servidor (`ot1:<kid>:`, AES-GCM com AAD) e com HMAC por projeto para achar duplicado.
-- O CHECK `ot_ativos_4_3_1` exige, para ativo do ARCiber, os campos do item 4.3.1 da RO-CB.BR.01: tipo, fabricante, função,
-- IP ou MAC, protocolo/porta (ao menos um) e firmware/SO (ou "não aplicável"), mais a categoria do 3.1.
-- Aditiva e repetível (CREATE IF NOT EXISTS). Conferir depois: SELECT name FROM sqlite_master WHERE name LIKE 'ot_%' lista as
-- cinco tabelas e os índices.

CREATE TABLE IF NOT EXISTS ot_sites (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'outro' CHECK (tipo IN ('subestacao', 'usina', 'centro_operacao', 'outro')),
    criticidade TEXT CHECK (criticidade IS NULL OR criticidade IN ('alta', 'media', 'baixa')),
    localizacao TEXT,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'removido')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_ot_sites_projeto ON ot_sites(project_id);

CREATE TABLE IF NOT EXISTS ot_zonas (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    site_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    nivel_purdue INTEGER NOT NULL CHECK (nivel_purdue BETWEEN 0 AND 5),
    tipo TEXT NOT NULL DEFAULT 'outra' CHECK (tipo IN ('supervisao', 'dmz_operativa', 'corporativa', 'outra')),
    descricao TEXT,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'removido')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id, project_id),
    UNIQUE (id, project_id, site_id),
    FOREIGN KEY (site_id, project_id) REFERENCES ot_sites(id, project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ot_zonas_site ON ot_zonas(project_id, site_id);

CREATE TABLE IF NOT EXISTS ot_ativos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    site_id TEXT NOT NULL,
    zona_id TEXT,
    nome TEXT NOT NULL,
    no_arciber INTEGER NOT NULL DEFAULT 0 CHECK (no_arciber IN (0, 1)),
    categoria_arciber TEXT CHECK (categoria_arciber IS NULL OR categoria_arciber IN ('centro_operacao', 'infra_dados_voz', 'ambiente_ons')),
    tipo_dispositivo TEXT,
    fabricante TEXT,
    modelo TEXT,
    funcao TEXT,
    ip_cifrado TEXT CHECK (ip_cifrado IS NULL OR ip_cifrado LIKE 'ot1:%'),
    mac_cifrado TEXT CHECK (mac_cifrado IS NULL OR mac_cifrado LIKE 'ot1:%'),
    ip_hash TEXT,
    mac_hash TEXT,
    protocolos_portas TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(protocolos_portas) AND json_type(protocolos_portas) = 'array'),
    firmware_so_versao TEXT,
    firmware_nao_aplicavel INTEGER NOT NULL DEFAULT 0 CHECK (firmware_nao_aplicavel IN (0, 1)),
    ultima_verificacao_em DATETIME,
    verificado_por TEXT,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'removido')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id, project_id),
    FOREIGN KEY (site_id, project_id) REFERENCES ot_sites(id, project_id) ON DELETE CASCADE,
    FOREIGN KEY (zona_id, project_id, site_id) REFERENCES ot_zonas(id, project_id, site_id) ON DELETE CASCADE,
    CONSTRAINT ot_ativos_4_3_1 CHECK (no_arciber = 0 OR (
        categoria_arciber IS NOT NULL
        AND trim(coalesce(tipo_dispositivo, '')) <> '' AND trim(coalesce(fabricante, '')) <> '' AND trim(coalesce(funcao, '')) <> ''
        AND (ip_cifrado IS NOT NULL OR mac_cifrado IS NOT NULL)
        AND json_array_length(protocolos_portas) > 0
        AND (trim(coalesce(firmware_so_versao, '')) <> '' OR firmware_nao_aplicavel = 1)
    ))
);
CREATE INDEX IF NOT EXISTS idx_ot_ativos_site ON ot_ativos(project_id, site_id);
CREATE INDEX IF NOT EXISTS idx_ot_ativos_ip_hash ON ot_ativos(project_id, ip_hash);
CREATE INDEX IF NOT EXISTS idx_ot_ativos_mac_hash ON ot_ativos(project_id, mac_hash);

-- Cada ponta é um ativo OU uma zona. Fluxo externo pode ter uma ponta só (a outra fica fora da organização).
CREATE TABLE IF NOT EXISTS ot_fluxos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    site_id TEXT NOT NULL,
    origem_ativo_id TEXT,
    origem_zona_id TEXT,
    destino_ativo_id TEXT,
    destino_zona_id TEXT,
    protocolo TEXT,
    porta INTEGER CHECK (porta IS NULL OR porta BETWEEN 0 AND 65535),
    direcao TEXT NOT NULL DEFAULT 'unidirecional' CHECK (direcao IN ('unidirecional', 'bidirecional')),
    finalidade TEXT,
    externo INTEGER NOT NULL DEFAULT 0 CHECK (externo IN (0, 1)),
    via_vpn INTEGER NOT NULL DEFAULT 0 CHECK (via_vpn IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'removido')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id, project_id) REFERENCES ot_sites(id, project_id) ON DELETE CASCADE,
    FOREIGN KEY (origem_ativo_id, project_id) REFERENCES ot_ativos(id, project_id) ON DELETE CASCADE,
    FOREIGN KEY (destino_ativo_id, project_id) REFERENCES ot_ativos(id, project_id) ON DELETE CASCADE,
    FOREIGN KEY (origem_zona_id, project_id) REFERENCES ot_zonas(id, project_id) ON DELETE CASCADE,
    FOREIGN KEY (destino_zona_id, project_id) REFERENCES ot_zonas(id, project_id) ON DELETE CASCADE,
    CHECK ((origem_ativo_id IS NOT NULL) + (origem_zona_id IS NOT NULL) <= 1),
    CHECK ((destino_ativo_id IS NOT NULL) + (destino_zona_id IS NOT NULL) <= 1),
    CHECK ((origem_ativo_id IS NOT NULL) + (origem_zona_id IS NOT NULL) + (destino_ativo_id IS NOT NULL) + (destino_zona_id IS NOT NULL)
        >= 2 - externo)
);
CREATE INDEX IF NOT EXISTS idx_ot_fluxos_site ON ot_fluxos(project_id, site_id);

-- Sites que um técnico (org_user) enxerga. Sem linha = nenhum site (modelo de ameaças, P0-4).
CREATE TABLE IF NOT EXISTS ot_site_acessos (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    site_id TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    concedido_por TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, site_id),
    FOREIGN KEY (site_id, project_id) REFERENCES ot_sites(id, project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ot_site_acessos_projeto ON ot_site_acessos(project_id, user_id);
