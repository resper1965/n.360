-- 0075: homologação de fornecedor por questionário (F5). Tudo aditivo.
-- `homologacao_perguntas`: o questionário do projeto (o modelo padrão é semeado pelo código na primeira leitura, ids determinísticos,
-- `INSERT OR IGNORE`). Pergunta não se apaga: desativa (`ativa = 0`).
-- `homologacoes`: um envio por terceiro (parte organização). O link é credencial: só o SHA-256 do token (`token_hash`, único). As
-- perguntas são CONGELADAS na criação (`perguntas_json`); as respostas (`respostas_json`) só mudam enquanto `status = 'aberta'`.
-- O gatilho `homologacao_imutavel` vale também para SQL direto. A conclusão grava uma linha em `avaliacoes_terceiro` (`avaliacao_id`).
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
