import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0089 from '../migrations/0089_modulo_ot.sql?raw';

// O banco de antes da 0089: as duas tabelas com o CHECK de dois módulos e os gatilhos da 0060 e da 0066.
const ANTERIOR = `
DROP TRIGGER IF EXISTS projeto_modulos_do_contrato;
DROP TRIGGER IF EXISTS usuario_modulos_padrao;
DROP TABLE usuario_modulos;
DROP TABLE projeto_modulos;
CREATE TABLE projeto_modulos (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    modulo TEXT NOT NULL CHECK (modulo IN ('iso', 'privacy')),
    habilitado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    habilitado_por TEXT NOT NULL DEFAULT 'sistema',
    PRIMARY KEY (project_id, modulo)
);
CREATE TRIGGER projeto_modulos_do_contrato AFTER INSERT ON projects
BEGIN
    INSERT OR IGNORE INTO projeto_modulos (project_id, modulo, habilitado_por)
        SELECT NEW.id, j.value, 'sistema' FROM organizations o, json_each(CASE WHEN json_valid(o.modulos_contratados) THEN o.modulos_contratados ELSE '[]' END) j
         WHERE o.id = NEW.org_id AND j.value IN ('iso', 'privacy');
    INSERT OR IGNORE INTO projeto_modulos (project_id, modulo, habilitado_por)
        SELECT NEW.id, 'iso', 'sistema' WHERE NOT EXISTS (SELECT 1 FROM projeto_modulos WHERE project_id = NEW.id);
END;
CREATE TABLE usuario_modulos (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    modulo TEXT NOT NULL CHECK (modulo IN ('iso', 'privacy')),
    concedido_por TEXT,
    concedido_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, modulo)
);
CREATE TRIGGER usuario_modulos_padrao AFTER INSERT ON users
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
END;`;

const doProjeto = async (p: string) => ((await env.DB.prepare('SELECT modulo FROM projeto_modulos WHERE project_id = ? ORDER BY modulo').bind(p).all<{ modulo: string }>()).results).map((r) => r.modulo);
const daPessoa = async (u: string) => ((await env.DB.prepare('SELECT modulo FROM usuario_modulos WHERE user_id = ? ORDER BY modulo').bind(u).all<{ modulo: string }>()).results).map((r) => r.modulo);
const conta = (id: string, role: string, projeto: string | null, org = 'org_ness') =>
  env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES (?, ?, 'h', ?, ?, ?, ?)`).bind(id, `${id}@exemplo.teste`, id, role, projeto, org);

describe('migration 0089: módulo n.OT nos CHECKs de projeto_modulos e usuario_modulos', () => {
  it('ponto de risco: no D1, refazer a tabela com os gatilhos de pé falha no RENAME (por isso a 0089 os derruba antes)', async () => {
    await applySchema();
    await execSql(`CREATE TABLE usuario_modulos_x (user_id TEXT, modulo TEXT); DROP TABLE usuario_modulos;`);
    await expect(env.DB.prepare('ALTER TABLE usuario_modulos_x RENAME TO usuario_modulos').run()).rejects.toThrow(/error in trigger usuario_modulos_padrao/);
  });

  it('sobre o formato anterior: preserva as linhas, aceita ot, recusa xyz, gatilhos seguem dando o contrato, e é repetível', async () => {
    await applySchema();
    await execSql(ANTERIOR);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO organizations (id, name, slug, modulos_contratados) VALUES ('o89', 'Org exemplo', 'o89', '["iso","privacy","ot"]')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p89', 'Cliente exemplo', 'x', 'c', 'Active', 'org_ness')`),
      env.DB.prepare(`INSERT OR IGNORE INTO projeto_modulos (project_id, modulo, habilitado_por) VALUES ('p89', 'privacy', 'pessoa')`),
      conta('u89', 'org_user', 'p89'),
    ]);
    await expect(env.DB.prepare(`INSERT INTO projeto_modulos (project_id, modulo) VALUES ('p89', 'ot')`).run()).rejects.toThrow();
    const antes = (await env.DB.prepare('SELECT * FROM projeto_modulos WHERE project_id = ? ORDER BY modulo').bind('p89').all()).results;

    await execSql(migration0089);
    await execSql(migration0089); // repetível

    expect((await env.DB.prepare('SELECT * FROM projeto_modulos WHERE project_id = ? ORDER BY modulo').bind('p89').all()).results).toEqual(antes);
    expect(await daPessoa('u89')).toEqual(['iso', 'privacy']);
    await env.DB.prepare(`INSERT INTO projeto_modulos (project_id, modulo) VALUES ('p89', 'ot')`).run();
    await expect(env.DB.prepare(`INSERT INTO projeto_modulos (project_id, modulo) VALUES ('p89', 'xyz')`).run()).rejects.toThrow();
    await expect(env.DB.prepare(`INSERT INTO usuario_modulos (user_id, modulo) VALUES ('u89', 'xyz')`).run()).rejects.toThrow();

    // projeto novo: o contrato da organização, agora com ot
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p89-novo', 'Cliente novo', 'x', 'c', 'Active', 'o89')`).run();
    expect(await doProjeto('p89-novo')).toEqual(['iso', 'ot', 'privacy']);
    // FK continua: apagar a conta leva as linhas
    await env.DB.prepare(`DELETE FROM users WHERE id = 'u89'`).run();
    expect(await daPessoa('u89')).toEqual([]);
  });

  it('P0-1: conta nova (cliente ou equipe, inclusive por SCIM) NÃO recebe ot pelo gatilho; só a concessão explícita dá', async () => {
    await applySchema();
    await execSql(migration0089);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO organizations (id, name, slug, modulos_contratados) VALUES ('o89b', 'Org exemplo', 'o89b', '["iso","privacy","ot"]')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p89b', 'Cliente exemplo', 'x', 'c', 'Active', 'o89b')`),
    ]);
    expect(await doProjeto('p89b')).toEqual(['iso', 'ot', 'privacy']);

    await env.DB.batch([conta('c89', 'org_user', 'p89b', 'o89b'), conta('e89', 'consultor', null, 'o89b')]);
    expect(await daPessoa('c89')).toEqual(['iso', 'privacy']);
    expect(await daPessoa('e89')).toEqual(['iso', 'privacy']);

    await env.DB.prepare(`INSERT INTO usuario_modulos (user_id, modulo, concedido_por) VALUES ('c89', 'ot', 'pessoa')`).run();
    expect(await daPessoa('c89')).toEqual(['iso', 'ot', 'privacy']);
  });
});
