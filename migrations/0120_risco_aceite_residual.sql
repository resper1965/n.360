-- 0120 — aceite do risco residual (ISO/IEC 27001, 6.1.3 e).
--
-- 1) risco_aceites: a prova de cada aceite (estado congelado + hash, aceitante, alçada, data UTC, canal), com gatilho de
--    isolamento por projeto e gatilho de imutabilidade (só o encerramento de um aceite vigente muda a linha).
-- 2) risco_alcadas: quem aceita, por nível do risco residual (sem linha, a Direção).
-- 3) pedidos.tipo passa a aceitar 'risco' (pedido de aceite em "Minhas aprovações"). É o mesmo molde da 0051 e da 0055: as
--    duas tabelas de pedido são reconstruídas com os mesmos dados, a filha antiga cai primeiro, o RENAME reescreve a FK e os
--    dois gatilhos de prova e os sete índices são recriados no fim. Nenhuma linha muda de valor.
--
-- Nenhum dado existente é alterado: riscos já aceitos (status Accepted, aceite antigo sem senha) seguem como estão e aparecem
-- como "aceito" sem linha em risco_aceites.
--
-- ANTES de aplicar em produção: `npm run db:backup`; confira que `PRAGMA table_info(pedidos)` e `PRAGMA table_info(pedido_destinatarios)`
-- batem com o schema.sql (13 e 16 colunas), e anote `SELECT COUNT(*) FROM pedidos` e `SELECT COUNT(*) FROM pedido_destinatarios`.
-- DEPOIS: as duas contagens iguais às de antes; `SELECT name FROM sqlite_master WHERE name IN ('pedido_prova_imutavel',
-- 'pedido_dest_prova_imutavel', 'risco_aceite_imutavel', 'risco_aceite_do_projeto')` devolve 4 linhas; `PRAGMA table_info(risco_aceites)`
-- lista 22 colunas.

-- Aceite do risco residual (ISO/IEC 27001, 6.1.3 e). Um ato por linha, nunca apagado nem reescrito: o que se aceitou (o estado
-- congelado do risco e o hash dele), quem aceitou, com qual alçada, quando (UTC) e por qual canal (direto, com senha, ou pedido).
-- `situacao` só sai de 'vigente' (para 'invalidado', quando o risco muda, ou 'revogado', pelo próprio aceitante com motivo).
CREATE TABLE IF NOT EXISTS risco_aceites (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    risk_id TEXT NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    aceito_por TEXT NOT NULL,
    aceito_nome TEXT,
    papel TEXT NOT NULL CHECK (papel IN ('ceo', 'ciso')),
    aceito_em TEXT NOT NULL,
    nivel_residual TEXT NOT NULL,
    estrategia TEXT,
    controles_json TEXT NOT NULL,
    conteudo_json TEXT NOT NULL,
    hash TEXT NOT NULL,
    justificativa TEXT CHECK (justificativa IS NULL OR length(justificativa) <= 2000),
    pedido_id TEXT,
    ip TEXT,
    user_agent TEXT,
    status_anterior TEXT,
    situacao TEXT NOT NULL DEFAULT 'vigente' CHECK (situacao IN ('vigente', 'invalidado', 'revogado')),
    encerrado_em TEXT,
    encerrado_por TEXT,
    motivo TEXT CHECK (motivo IS NULL OR length(motivo) <= 2000),
    CHECK (situacao = 'vigente' OR (encerrado_em IS NOT NULL AND encerrado_por IS NOT NULL AND motivo IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_risco_aceites_risco ON risco_aceites(risk_id, aceito_em);
CREATE INDEX IF NOT EXISTS idx_risco_aceites_projeto ON risco_aceites(project_id);
-- Um aceite vigente por risco.
CREATE UNIQUE INDEX IF NOT EXISTS idx_risco_aceites_vigente ON risco_aceites(risk_id) WHERE situacao = 'vigente';

CREATE TRIGGER IF NOT EXISTS risco_aceite_do_projeto
BEFORE INSERT ON risco_aceites
WHEN NOT EXISTS (SELECT 1 FROM risks r WHERE r.id = NEW.risk_id AND r.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'risco inexistente ou de outro projeto');
END;

-- Prova: só o encerramento de um aceite vigente muda a linha, e só nas colunas do encerramento.
CREATE TRIGGER IF NOT EXISTS risco_aceite_imutavel
BEFORE UPDATE ON risco_aceites
WHEN OLD.situacao <> 'vigente' OR NEW.situacao = 'vigente'
  OR NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.risk_id IS NOT OLD.risk_id
  OR NEW.aceito_por IS NOT OLD.aceito_por OR NEW.aceito_nome IS NOT OLD.aceito_nome OR NEW.papel IS NOT OLD.papel
  OR NEW.aceito_em IS NOT OLD.aceito_em OR NEW.nivel_residual IS NOT OLD.nivel_residual OR NEW.estrategia IS NOT OLD.estrategia
  OR NEW.controles_json IS NOT OLD.controles_json OR NEW.conteudo_json IS NOT OLD.conteudo_json OR NEW.hash IS NOT OLD.hash
  OR NEW.justificativa IS NOT OLD.justificativa OR NEW.pedido_id IS NOT OLD.pedido_id OR NEW.ip IS NOT OLD.ip
  OR NEW.user_agent IS NOT OLD.user_agent OR NEW.status_anterior IS NOT OLD.status_anterior
BEGIN
    SELECT RAISE(ABORT, 'prova de aceite de risco e imutavel');
END;

-- Alçada de aceite por nível do risco residual: quem aceita ('ceo' = Direção, 'ciso' = Líder SGSI, pela matriz de Governança).
-- Nível sem linha usa 'ceo'.
CREATE TABLE IF NOT EXISTS risco_alcadas (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    nivel TEXT NOT NULL CHECK (nivel IN ('Low', 'Medium', 'High', 'Critical')),
    papel TEXT NOT NULL CHECK (papel IN ('ceo', 'ciso')),
    atualizado_por TEXT NOT NULL,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, nivel)
);

-- Pedido de aceite de risco: 'risco' entra no CHECK de pedidos.tipo.
CREATE TABLE pedidos_new (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('dpia', 'politica', 'documento', 'excecao', 'tratamento', 'avaliacao_terceiro', 'risco')),
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
INSERT INTO pedidos_new (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, status, substituido_por, criado_por, criado_em)
    SELECT id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, status, substituido_por, criado_por, criado_em FROM pedidos;

CREATE TABLE pedido_destinatarios_new (
    id TEXT PRIMARY KEY,
    pedido_id TEXT NOT NULL REFERENCES pedidos_new(id) ON DELETE CASCADE,
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
INSERT INTO pedido_destinatarios_new (id, pedido_id, nome, email, user_id, token_hash, token_expira_em, aberto_em, status, decidido_em, canal, ip, user_agent, hash_lido, mfa_usado, motivo)
    SELECT id, pedido_id, nome, email, user_id, token_hash, token_expira_em, aberto_em, status, decidido_em, canal, ip, user_agent, hash_lido, mfa_usado, motivo FROM pedido_destinatarios;

DROP TABLE pedido_destinatarios;
DROP TABLE pedidos;
ALTER TABLE pedidos_new RENAME TO pedidos;
ALTER TABLE pedido_destinatarios_new RENAME TO pedido_destinatarios;

CREATE INDEX IF NOT EXISTS idx_pedidos_projeto ON pedidos(project_id, status);
CREATE INDEX IF NOT EXISTS idx_pedidos_documento ON pedidos(tipo, ref_id, status);
-- Um pedido "em pé" aberto por documento para a ciência do portal público (criado_por = 'sistema:portal'):
-- dois acessos simultâneos não criam dois contêineres. A substituição marca o antigo ANTES de criar o novo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_portal_aberto ON pedidos(tipo, ref_id) WHERE criado_por = 'sistema:portal' AND status = 'aberto';
CREATE INDEX IF NOT EXISTS idx_pedido_dest_pedido ON pedido_destinatarios(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_dest_email ON pedido_destinatarios(email);
CREATE INDEX IF NOT EXISTS idx_pedido_dest_user ON pedido_destinatarios(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedido_dest_token ON pedido_destinatarios(token_hash) WHERE token_hash IS NOT NULL;

-- Prova imutável do pedido (0043): conteúdo, hash e documento nunca mudam; fechado não muda de status
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

-- Prova imutável do destinatário (0042): decisão gravada não muda; correção é um pedido novo.
CREATE TRIGGER IF NOT EXISTS pedido_dest_prova_imutavel
BEFORE UPDATE ON pedido_destinatarios
WHEN OLD.status <> 'pendente'
BEGIN
    SELECT RAISE(ABORT, 'prova de pedido decidido e imutavel');
END;
