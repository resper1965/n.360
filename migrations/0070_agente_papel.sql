-- 0070: papel do agente remoto na concessão. 'consultor' implementa (o alcance de sempre); 'auditor' só lê o projeto e
-- registra achado e nota de auditoria (ISO 27001, 9.2). DEFAULT 'consultor': toda concessão existente fica como era.
-- ADD COLUMN não é idempotente ("duplicate column"): aplicar uma vez, pelo `migrations apply`.
ALTER TABLE agente_concessoes ADD COLUMN papel TEXT NOT NULL DEFAULT 'consultor' CHECK (papel IN ('consultor', 'auditor'));
