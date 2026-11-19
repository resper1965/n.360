import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import { carteira } from '../src/services/painel';

// Carteira: as linhas ot.* da trilha só contam no último movimento do projeto que TEM o ot hoje (podeVerOt por projeto),
// mesmo para quem tem o módulo na pessoa. Projeto B teve atividade do n.ot antes de o módulo sair dele.
beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('cp-a', 'A', 'ISO 27001', 'controller', 'Active'), ('cp-b', 'B', 'ISO 27001', 'controller', 'Active')`),
    env.DB.prepare(`DELETE FROM projeto_modulos WHERE project_id IN ('cp-a', 'cp-b')`),
    env.DB.prepare(`INSERT INTO projeto_modulos (project_id, modulo) VALUES ('cp-a', 'iso'), ('cp-a', 'ot'), ('cp-b', 'iso')`),
    env.DB.prepare(`INSERT INTO audit_logs (id, action, actor, details, project_id, created_at) VALUES
      ('ca1', 'cadastro.criado', 'x', 'd', 'cp-a', '2030-01-01 10:00:00'), ('ca2', 'ot.site.criado', 'x', 'd', 'cp-a', '2031-01-01 10:00:00'),
      ('cb1', 'cadastro.criado', 'x', 'd', 'cp-b', '2030-02-02 10:00:00'), ('cb2', 'ot.site.criado', 'x', 'd', 'cp-b', '2031-02-02 10:00:00')`),
  ]);
});

describe('carteira: último movimento e o n.ot por projeto', () => {
  const em = async (mods: ('iso' | 'ot')[], id: string) => (await carteira(env.DB, null, mods)).find((x) => x.id === id)?.ultimo_movimento;
  it('pessoa com ot: o projeto sem ot não conta as linhas ot.*; o projeto com ot conta', async () => {
    expect(await em(['iso', 'ot'], 'cp-b')).toBe('2030-02-02 10:00:00');
    expect(await em(['iso', 'ot'], 'cp-a')).toBe('2031-01-01 10:00:00');
  });
  it('pessoa sem ot: nenhum projeto conta as linhas ot.*', async () => {
    expect(await em(['iso'], 'cp-a')).toBe('2030-01-01 10:00:00');
    expect(await em(['iso'], 'cp-b')).toBe('2030-02-02 10:00:00');
  });
});
