-- 0092 — n.ot: coleta (lotes e itens em staging). Spec 2026-10-30-n-ot-modulo-n360-design §6/§7; modelo de ameaças P0-3, P0-5.
--
-- Tabelas próprias, e não `importacoes`: os CHECK de lá estão presos às entidades do n.privacy. Máquina de estados espelhada:
-- processando -> em_revisao -> gravando -> concluido | rejeitado; erro (falha na carga); recebendo e erro_ia ficam para a N4 (IA).
-- Nada grava direto no inventário: o item só vira `ot_ativos` na aprovação. O arquivo original nunca vai ao R2 (P0-3, §12.1
-- pergunta 4): o parse é em memória, por isso não há `r2_key`. O CHECK de `dados` garante que IP/MAC só entram cifrados (ot1:).
-- Lote não concluído expira em 7 dias (manutencao.ts). Aditiva e repetível (CREATE IF NOT EXISTS). Conferir depois:
-- SELECT name FROM sqlite_master WHERE name LIKE 'ot_lote%' lista as duas tabelas e os índices.

CREATE TABLE IF NOT EXISTS ot_lotes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    site_id TEXT NOT NULL,
    fonte TEXT NOT NULL CHECK (fonte IN ('manual', 'planilha', 'ferramenta_ot', 'ia')),
    status TEXT NOT NULL DEFAULT 'processando'
        CHECK (status IN ('recebendo', 'processando', 'em_revisao', 'gravando', 'concluido', 'rejeitado', 'erro', 'erro_ia')),
    criado_por TEXT NOT NULL,
    decidido_por TEXT,
    decidido_em DATETIME,
    motivo TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id, project_id),
    FOREIGN KEY (site_id, project_id) REFERENCES ot_sites(id, project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ot_lotes_site ON ot_lotes(project_id, site_id);
CREATE INDEX IF NOT EXISTS idx_ot_lotes_criador ON ot_lotes(criado_por, created_at);

-- `dados` tem a forma da linha de `ot_ativos` (IP/MAC cifrados com AAD do item, hashes por projeto); `erros` = [{campo, motivo}],
-- nunca o valor (P1-7). `duplicata_de` só sai para quem vê completo (P0-5).
CREATE TABLE IF NOT EXISTS ot_lote_itens (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    lote_id TEXT NOT NULL,
    linha INTEGER NOT NULL,
    entidade TEXT NOT NULL DEFAULT 'ativo' CHECK (entidade IN ('ativo', 'zona', 'fluxo')),
    dados TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(dados) AND json_type(dados) = 'object'
        AND json_type(dados, '$.ip') IS NULL AND json_type(dados, '$.mac') IS NULL
        AND coalesce(json_extract(dados, '$.ip_cifrado') LIKE 'ot1:%', 1) AND coalesce(json_extract(dados, '$.mac_cifrado') LIKE 'ot1:%', 1)),
    erros TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(erros) AND json_type(erros) = 'array'),
    duplicata_de TEXT,
    decisao TEXT NOT NULL DEFAULT 'pendente' CHECK (decisao IN ('pendente', 'aceito', 'descartado', 'gravado', 'recusado')),
    motivo TEXT,
    registro_id TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lote_id, project_id) REFERENCES ot_lotes(id, project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ot_lote_itens_lote ON ot_lote_itens(lote_id, linha);
