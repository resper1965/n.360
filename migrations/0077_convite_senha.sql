-- 0077: convite com link para criar a senha (decisão do dono, 15/10). Uma linha por conta com convite pendente: só o SHA-256 do
-- token (CSPRNG), a expiração (72 h) e quem convidou. Reenviar é INSERT OR REPLACE (o token anterior deixa de valer); usar é DELETE
-- condicional (uso único). Some com a conta (ON DELETE CASCADE). Aditiva e idempotente; nada existente muda.
CREATE TABLE IF NOT EXISTS convites_senha (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expira_em DATETIME NOT NULL,
    criado_por TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
