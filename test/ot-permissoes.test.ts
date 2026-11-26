import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { ehLeitorOt } from '../src/services/ot-permissoes';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

// Spec 2026-11-26 §6 (PR2, Task 2.1): a tela lê do servidor o que a pessoa pode no n.ot. Só booleanos e a tela inicial.
type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
const CHAVE = 'chave-ot-permissoes';
const AGENTE = { userId: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', projectId: 'proj-a', concessaoId: 'c-ot' };
const chamar = (h: H, metodo: string, caminho: string, extra: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: h }), { ...workerEnv(), ...extra });
const permissoes = async (h: H, p = P) => {
  const r = await chamar(h, 'GET', `${p}/permissoes`);
  expect(r.status, await r.clone().text()).toBe(200);
  return r.json<Record<string, unknown>>();
};

let gestor: H, tec: H, cli: H, cons: H, direto: H, semOt: H;
beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-gestor', 'gestor@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'),
      ('u-tec', 'tec@cliente.teste', 'x', 'Técnico', 'org_user', 'proj-a'),
      ('u-cli', 'cli@cliente.teste', 'x', 'Leitura', 'client', 'proj-a'),
      ('u-sem', 'sem@cliente.teste', 'x', 'Sem OT', 'org_admin', 'proj-a')`),
    env.DB.prepare(`INSERT INTO organizations (id, name, slug, tipo) VALUES ('org_dir', 'Direta Exemplo', 'direta-exemplo', 'direta')`),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('proj-d', 'Direta Exemplo', 'ISO 27001', 'controller', 'Active', 'org_dir')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-ad', 'ad@cliente.teste', 'x', 'Admin direto', 'consultoria_admin', 'org_dir')`),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('proj-d', 'Admin direto', 'ad@cliente.teste', 'tech', 'Gestor ARCiber')`),
    env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('key-ot', 'proj-a', ?, 'escrita', 'write', 'Active')`).bind(await sha256Hex(CHAVE)),
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s1', 'proj-a', 'SE Norte Exemplo'), ('s2', 'proj-a', 'SE Sul Exemplo')`),
  ]);
  await habilitarOt('proj-d');
  await designarConsultor(AGENTE.email, 'proj-a');
  await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-ot', ?, 'proj-a', datetime('now', '+30 days'))`).bind(AGENTE.userId).run();
  await concederModulos(['u-gestor', 'u-tec', 'u-cli', 'u-ad', AGENTE.userId], ['ot']);
  gestor = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  tec = await sessionFor({ id: 'u-tec', email: 'tec@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  cli = await sessionFor({ id: 'u-cli', email: 'cli@cliente.teste', role: 'client', client_project_id: 'proj-a' });
  semOt = await sessionFor({ id: 'u-sem', email: 'sem@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  cons = await sessionFor({ id: AGENTE.userId, email: AGENTE.email, role: 'consultor' });
  direto = await sessionFor({ id: 'u-ad', email: 'ad@cliente.teste', role: 'consultoria_admin', org_id: 'org_dir' });
});

describe('GET /ot/permissoes', () => {
  it('Gestor (org_admin): decide; consultor: edita e aprova lote, não é Gestor', async () => {
    expect(await permissoes(gestor)).toMatchObject({ gestor: true, editar: true, aprovar_lote: true, leitor: false, tecnico: false });
    expect(await permissoes(cons)).toMatchObject({ gestor: false, editar: true, aprovar_lote: true, ver_sondas: true });
  });
  it('admin direto no cargo de Gestor ARCiber: gestor true (a tela hoje esconde os botões dele)', async () => {
    expect(await permissoes(direto, '/api/v1/projects/proj-d/ot')).toMatchObject({ gestor: true, editar: true, leitor: false });
  });
  it('técnico e leitor', async () => {
    expect(await permissoes(tec)).toMatchObject({ tecnico: true, editar: false, criar_lote: true, aprovar_lote: false, ver_sondas: false, tela_inicial: 'painel' });
    expect(await permissoes(cli)).toMatchObject({ leitor: true, editar: false, criar_lote: false, aprovar_lote: false, tela_inicial: 'painel' });
  });
  it('tela inicial: Implantação enquanto nenhum site opera; Painel depois', async () => {
    expect((await permissoes(cons)).tela_inicial).toBe('implantacao');
    await env.DB.prepare(`UPDATE ot_sites SET fase = 'em_operacao' WHERE id = 's1'`).run();
    expect((await permissoes(cons)).tela_inicial).toBe('painel');
    await env.DB.prepare(`UPDATE ot_sites SET fase = 'em_levantamento' WHERE id = 's1'`).run();
  });
  it('leitor alinhado com o Painel: org_admin de OUTRO projeto (papel de cliente, não Gestor deste) é leitor', () => {
    expect(ehLeitorOt({ role: 'org_admin', client_project_id: 'proj-b' }, 'proj-a')).toBe(true);
    expect(ehLeitorOt({ role: 'org_admin', client_project_id: 'proj-a' }, 'proj-a')).toBe(false);
    expect(ehLeitorOt({ role: 'org_user', client_project_id: 'proj-a' }, 'proj-a')).toBe(false);
    expect(ehLeitorOt({ role: 'client', client_project_id: 'proj-a' }, 'proj-a')).toBe(true);
    expect(ehLeitorOt({ role: 'consultoria_admin' }, 'proj-a')).toBe(false);
  });
  it('acao_corretiva só com o n.iso no projeto', async () => {
    await env.DB.prepare(`DELETE FROM projeto_modulos WHERE project_id = 'proj-a' AND modulo = 'iso'`).run();
    expect((await permissoes(cons)).acao_corretiva).toBe(false);
    await env.DB.prepare(`INSERT INTO projeto_modulos (project_id, modulo, habilitado_por) VALUES ('proj-a', 'iso', 'teste')`).run();
    expect((await permissoes(cons)).acao_corretiva).toBe(true);
    expect((await permissoes(tec)).acao_corretiva).toBe(false);
  });
  it('P0-2: agente e chave de API, 403; sem ot na pessoa, 403', async () => {
    expect((await chamar({ 'X-API-Key': CHAVE }, 'GET', `${P}/permissoes`)).status).toBe(403);
    expect((await chamar({}, 'GET', `${P}/permissoes`, { AGENTE })).status).toBe(403);
    expect((await chamar(semOt, 'GET', `${P}/permissoes`)).status).toBe(403);
  });
  it('só booleanos e a tela inicial: nenhum id, e-mail ou nome', async () => {
    const { tela_inicial, ...resto } = await permissoes(gestor);
    expect(typeof tela_inicial).toBe('string');
    for (const [k, v] of Object.entries(resto)) expect(typeof v, k).toBe('boolean');
  });
});
