import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

// Spec 2026-11-26, decisão 4 (PR2, Task 2.2): o cliente leitor (`client` com ot) lê só Painel, Assessment e Relatórios; site, desvio e
// inventário ficam fora, no servidor. Nas rotas que ele lê, o que é inventário (por_zona, subsidio) sai da resposta.
type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
const chamar = (h: H, metodo: string, caminho: string) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...h } }), workerEnv());

const LE = ['/requisitos', '/assessment', '/conformidade', '/indicadores', '/relatorio/conformidade', '/permissoes'];
const NAO = ['/sites', '/zonas', '/ativos', '/fluxos', '/desvios', '/desvios?contagem=1', '/lotes', '/levantamentos', '/achados?site_id=s1', '/acessos',
  '/referencias', '/fornecedores', '/sensores/pontos', '/sites/s1/situacao', '/sites/s1/sensores', '/agente', '/roteiro'];

let gestor: H, tec: H, cli: H, cons: H;
beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-gestor', 'gestor@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'),
      ('u-tec', 'tec@cliente.teste', 'x', 'Técnico', 'org_user', 'proj-a'),
      ('u-cli', 'cli@cliente.teste', 'x', 'Leitura', 'client', 'proj-a')`),
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase) VALUES ('s1', 'proj-a', 'SE Norte Exemplo', 'em_operacao')`),
    env.DB.prepare(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES ('z1', 'proj-a', 's1', 'Zona Norte', 2)`),
    env.DB.prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez) VALUES
      ('d1', 'proj-a', 's1', 'fluxo', 'chave-sensor-1', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z')`),
    env.DB.prepare(`INSERT INTO ot_site_acessos (site_id, user_id, project_id, concedido_por) VALUES ('s1', 'u-tec', 'proj-a', 'teste')`),
  ]);
  await designarConsultor('cons-ot@ness.lat', 'proj-a');
  await concederModulos(['u-gestor', 'u-tec', 'u-cli', 'cons:cons-ot@ness.lat'], ['ot']);
  gestor = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  tec = await sessionFor({ id: 'u-tec', email: 'tec@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  cli = await sessionFor({ id: 'u-cli', email: 'cli@cliente.teste', role: 'client', client_project_id: 'proj-a' });
  cons = await sessionFor({ id: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', role: 'consultor' });
});

describe('leitor do n.ot no servidor', () => {
  it('leitor (client com ot): 200 no que é dele', async () => {
    for (const p of LE) { const r = await chamar(cli, 'GET', P + p); expect(r.status, `${p} ${await r.clone().text()}`).toBe(200); }
  });
  it('leitor: 403 em todo o resto, sem nome de site no corpo', async () => {
    for (const p of NAO) { const r = await chamar(cli, 'GET', P + p); expect(r.status, p).toBe(403); expect(await r.text()).not.toContain('SE Norte'); }
  });
  it('leitor: nenhuma escrita (o guarda de escrita já cortava; o do leitor também)', async () => {
    expect((await chamar(cli, 'POST', `${P}/sites`)).status).toBe(403);
  });
  it('leitor: nada de inventário nas rotas que lê (por_zona tem nome e id de zona e site; subsidio, respostas de levantamento por site)', async () => {
    const ind = await (await chamar(cli, 'GET', `${P}/indicadores`)).json<Record<string, unknown>>();
    expect(ind).not.toHaveProperty('por_zona');
    expect(ind).toHaveProperty('por_nivel');
    expect(JSON.stringify(ind)).not.toContain('Zona Norte');
    const ass = await (await chamar(cli, 'GET', `${P}/assessment`)).json<{ itens: Record<string, unknown>[] }>();
    for (const i of ass.itens) expect(i).not.toHaveProperty('subsidio');
  });
  it('quem não é leitor segue com por_zona e subsidio', async () => {
    const ind = await (await chamar(cons, 'GET', `${P}/indicadores`)).json<Record<string, unknown>>();
    expect(ind).toHaveProperty('por_zona');
    const ass = await (await chamar(cons, 'GET', `${P}/assessment`)).json<{ itens: { tipo: string }[] }>();
    expect(ass.itens.filter((i) => i.tipo === 'politica').every((i) => 'subsidio' in i)).toBe(true);
  });
  it('Gestor, consultor e técnico seguem como antes', async () => {
    for (const h of [gestor, cons, tec]) expect((await chamar(h, 'GET', `${P}/sites`)).status).toBe(200);
    expect((await chamar(tec, 'GET', `${P}/desvios`)).status).toBe(200);
  });
});
