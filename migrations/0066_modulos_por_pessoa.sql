-- 0066 — n.360, fatia 3: módulos por PESSOA (spec 2026-10-12-n360-modulos-por-pessoa-design).
--
-- Até aqui o acesso a n.iso/n.privacy dependia só do projeto (`projeto_modulos`). Agora a rota de faixa iso/privacy exige
-- também que a pessoa tenha o módulo (`usuario_modulos`). `platform_admin` tem todos sem linha; `stakeholder` não precisa
-- (só alcança pedidos, núcleo). Repetível: CREATE IF NOT EXISTS, UPDATE idempotente, INSERT OR IGNORE.

CREATE TABLE IF NOT EXISTS usuario_modulos (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    modulo TEXT NOT NULL CHECK (modulo IN ('iso', 'privacy')),
    concedido_por TEXT,
    concedido_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, modulo)
);

-- Papéis legados gravados como os papéis de hoje (o mapa de src/middleware/auth.ts continua, para sessões antigas).
UPDATE users SET role = 'platform_admin' WHERE role = 'admin';
UPDATE users SET role = 'consultor' WHERE role = 'consultant';
UPDATE users SET role = 'client' WHERE role = 'client_admin';
UPDATE users SET role = 'org_user' WHERE role IN ('user', 'employee');

-- Carga inicial: cada conta recebe o que já usa. Cliente: os módulos do projeto dele.
INSERT OR IGNORE INTO usuario_modulos (user_id, modulo, concedido_por)
    SELECT u.id, pm.modulo, 'migracao' FROM users u JOIN projeto_modulos pm ON pm.project_id = u.client_project_id
     WHERE u.role IN ('org_admin', 'org_user', 'client');
-- Equipe: o contrato da organização (ilegível ou vazio = n.iso, como `parseModulos`).
INSERT OR IGNORE INTO usuario_modulos (user_id, modulo, concedido_por)
    SELECT u.id, j.value, 'migracao' FROM users u, organizations o,
           json_each(CASE WHEN json_valid(o.modulos_contratados) THEN o.modulos_contratados ELSE '[]' END) j
     WHERE o.id = u.org_id AND u.role IN ('consultor', 'consultoria_admin', 'comercial') AND j.value IN ('iso', 'privacy');
INSERT OR IGNORE INTO usuario_modulos (user_id, modulo, concedido_por)
    SELECT u.id, 'iso', 'migracao' FROM users u
     WHERE u.role IN ('consultor', 'consultoria_admin', 'comercial')
       AND NOT EXISTS (SELECT 1 FROM usuario_modulos um WHERE um.user_id = u.id);

-- Conta nova recebe o mesmo padrão, por qualquer caminho de criação (POST /users, SSO, SCIM, organização nova).
-- `POST /users` com `modulos` troca o padrão pelo pedido. Grafias legadas incluídas: o /auth/setup antigo gravava `consultant`.
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
