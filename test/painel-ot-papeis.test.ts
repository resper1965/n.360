import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, seedTwoProjects, habilitarOt, concederModulos, designarConsultor, sessionFor, workerEnv } from './helpers/d1';

// Painel do n.ot por papel (spec 2026-11-19-paineis-do-n-ot, PR2): Gestor ARCiber com "O que fazer" só no ?modulo=ot (decisão 1);
// técnico só os sites dele (decisão 4, P0-4); leitor só a frase (decisão 3); sonda só para quem abre a rota de sonda. D1 real.
type H = Record<string, string>;
const chamar = (h: H, caminho: string) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv() as any);
const pedir = async (h: H, q: string) => { const r = await chamar(h, `/api/v1/projects/proj-a/painel${q}`); expect(r.status).toBe(200); return (await r.json()) as any; };
const ot = (h: H) => pedir(h, '?modulo=ot');
const n360 = (h: H) => pedir(h, '');
let gestor: H, tecnico: H, leitor: H, cons: H, plat: H;

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-g', 'g@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'), ('u-t', 't@cliente.teste', 'x', 'Tecnico', 'org_user', 'proj-a'),
      ('u-l', 'l@cliente.teste', 'x', 'Leitor', 'client', 'proj-a'), ('u-p', 'p@ness.lat', 'x', 'Plataforma', 'platform_admin', NULL)`),
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase) VALUES ('s1', 'proj-a', 'SE Norte Exemplo', 'em_operacao'), ('s2', 'proj-a', 'SE Sul Exemplo', 'em_levantamento')`),
    env.DB.prepare(`INSERT INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES ('u-t', 's1', 'proj-a', 'x')`),
    env.DB.prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez) VALUES
      ('d1', 'proj-a', 's1', 'fluxo', 'chave-sensor-1', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z'),
      ('d2', 'proj-a', 's2', 'fluxo', 'chave-sensor-2', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z')`),
    env.DB.prepare(`INSERT INTO ot_sensores (id, project_id, site_id, nome, faixa_origem, criado_por, created_at) VALUES ('sn1', 'proj-a', 's1', 'Sonda Norte', '10.0.0.0/8', 'u-g', '2026-11-01 00:00:00')`),
    env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, nome, ip_cifrado) VALUES ('at1', 'proj-a', 's1', 'Ativo Secreto XYZ', 'ot1:segredo')`),
  ]);
  await concederModulos(['u-g', 'u-t', 'u-l', 'u-p'], ['iso', 'ot']);
  await designarConsultor('c@ness.lat', 'proj-a');
  const c = await env.DB.prepare(`SELECT id FROM users WHERE email = 'c@ness.lat'`).first<{ id: string }>();
  await concederModulos([c!.id], ['iso', 'ot']);
  gestor = await sessionFor({ id: 'u-g', email: 'g@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  tecnico = await sessionFor({ id: 'u-t', email: 't@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  leitor = await sessionFor({ id: 'u-l', email: 'l@cliente.teste', role: 'client', client_project_id: 'proj-a' });
  plat = await sessionFor({ id: 'u-p', email: 'p@ness.lat', role: 'platform_admin' });
  cons = await sessionFor({ id: c!.id, email: 'c@ness.lat', role: 'consultor' });
});

describe('?modulo=ot por papel', () => {
  it('Gestor ARCiber: "O que fazer" e Por site no ?modulo=ot; no Início do n.360 continua sem os dois (decisão 1)', async () => {
    const d = await ot(gestor);
    expect(d.visao).toBe('cliente');
    expect(d.modulos.ot.fazer.map((i: any) => i.texto)).toEqual(expect.arrayContaining(['1 sonda parada', '2 desvios abertos']));
    expect(d.modulos.ot.por_site.map((s: any) => s.nome)).toEqual(['SE Norte Exemplo', 'SE Sul Exemplo']);
    expect(d.modulos.ot.por_site[0]).toMatchObject({ id: 's1', fase: 'em_operacao', proximo: 'Tratar os desvios abertos', desvios_abertos: 1, sonda: 'parada' });
    const g = await n360(gestor);
    expect(g.modulos.ot.fazer).toBeUndefined();
    expect(g.modulos.ot.por_site).toBeUndefined();
  });
  it('consultor: o bloco da equipe; no Início do n.360 nenhum campo novo (oráculo do inventário)', async () => {
    const d = await ot(cons);
    expect(Object.keys(d.modulos.ot).sort()).toEqual(['comecando', 'fazer', 'numeros', 'passos', 'por_site', 'saude']);
    const g = await n360(cons);
    expect(g.modulos.ot.por_site).toBeUndefined();
  });
  it('técnico: só os sites dele, sem "O que fazer" nem total do projeto (P0-4)', async () => {
    const d = await ot(tecnico);
    expect(Object.keys(d.modulos.ot).sort()).toEqual(['comecando', 'numeros', 'por_site', 'saude']);
    expect(d.modulos.ot.por_site.map((s: any) => s.id)).toEqual(['s1']);
    expect(d.modulos.ot.numeros).toEqual([['1 de 1', 'sites em operação'], ['1', 'desvios abertos']]);
    expect(d.programa.etapas.ot.total).toBe(1);
    expect('sonda' in d.modulos.ot.por_site[0]).toBe(false);
    expect(JSON.stringify(d)).not.toContain('SE Sul');
  });
  it('leitor (client): só a frase; nada de desvio, site, sonda ou "O que fazer" (decisão 3)', async () => {
    const d = await ot(leitor);
    expect(Object.keys(d.modulos.ot).sort()).toEqual(['comecando', 'saude']);
    expect(JSON.stringify(d.modulos.ot)).not.toMatch(/desvio|SE Norte|sonda/i);
    // a resposta HTTP inteira, não só o bloco: nenhuma contagem de desvio (nota d do PR1)
    expect(JSON.stringify(d)).not.toMatch(/desvio/i);
  });
  it('leitor (client) no Início do n.360 (sem ?modulo): igual a hoje, frase e números', async () => {
    const g = await n360(leitor);
    expect(g.modulos.ot.numeros).toEqual([['1 de 2', 'sites em operação'], ['2', 'desvios abertos']]);
    expect(g.modulos.ot.fazer).toBeUndefined();
  });
  it('platform_admin não abre a rota de sonda: nem item, nem coluna', async () => {
    const d = await ot(plat);
    expect(d.modulos.ot.fazer.map((i: any) => i.texto).join(' ')).not.toContain('sonda');
    expect(d.modulos.ot.por_site.every((s: any) => !('sonda' in s))).toBe(true);
  });
  it('nenhuma resposta leva IP, MAC, nome de ativo, nome de sonda, faixa ou chave do sensor (P0-6)', async () => {
    for (const h of [gestor, tecnico, leitor, cons, plat]) {
      const corpo = JSON.stringify(await ot(h));
      expect(corpo).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
      expect(corpo).not.toMatch(/([0-9a-f]{2}:){5}[0-9a-f]{2}/i);
      for (const x of ['Sonda Norte', 'Ativo Secreto XYZ', 'ot1:', 'chave-sensor']) expect(corpo, x).not.toContain(x);
    }
  });
});
