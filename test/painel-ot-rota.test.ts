import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { sha256Hex } from '../src/helpers';
import app from '../src/index';
import { applySchema, seedTwoProjects, habilitarOt, concederModulos, designarConsultor, sessionFor, workerEnv } from './helpers/d1';
import { situacaoNaCarteira } from '../src/services/painel';

// n.ot no painel e na carteira (onda 0): rota contra o D1 real.
type H = Record<string, string>;
const chamar = (h: H, caminho: string) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv() as any);
let gestor: H, semOt: H, cons: H;

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-g', 'g@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'), ('u-s', 's@cliente.teste', 'x', 'Sem OT', 'org_admin', 'proj-a')`),
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase) VALUES ('s1', 'proj-a', 'SE Norte', 'em_operacao')`),
    env.DB.prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez) VALUES
      ('d1', 'proj-a', 's1', 'fluxo', 'k1', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z')`),
  ]);
  await env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('key-p', 'proj-a', ?, 'painel', 'write', 'Active')`).bind(await sha256Hex('chave-painel-ot')).run();
  await concederModulos(['u-g'], ['iso', 'ot']);
  await concederModulos(['u-s'], ['iso']);
  await designarConsultor('c@ness.lat', 'proj-a');
  const c = await env.DB.prepare(`SELECT id FROM users WHERE email = 'c@ness.lat'`).first<{ id: string }>();
  await concederModulos([c!.id], ['iso', 'ot']);
  gestor = await sessionFor({ id: 'u-g', email: 'g@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  semOt = await sessionFor({ id: 'u-s', email: 's@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  cons = await sessionFor({ id: c!.id, email: 'c@ness.lat', role: 'consultor' });
});

describe('painel com o n.ot', () => {
  it('?modulo=ot devolve o bloco para quem tem o módulo', async () => {
    const r = await chamar(cons, '/api/v1/projects/proj-a/painel?modulo=ot');
    expect(r.status).toBe(200);
    const d = await r.json() as any;
    expect(d.modulos.ot.comecando).toBe(false);
    expect(d.modulos.ot.fazer.map((i: any) => i.texto)).toContain('1 desvio aberto');
    expect(d.programa.estado).not.toBe('comecando');
  });

  it('cliente recebe só a frase e os números', async () => {
    const d = await (await chamar(gestor, '/api/v1/projects/proj-a/painel?modulo=ot')).json() as any;
    expect(d.modulos.ot.numeros).toEqual([['1 de 1', 'sites em operação'], ['1', 'desvios abertos']]);
    expect(d.modulos.ot.fazer).toBeUndefined();
  });

  it('pessoa sem o módulo: 403 no pedido direto e nada do n.ot no painel geral', async () => {
    expect((await chamar(semOt, '/api/v1/projects/proj-a/painel?modulo=ot')).status).toBe(403);
    const d = await (await chamar(semOt, '/api/v1/projects/proj-a/painel')).json() as any;
    expect(d.modulos.ot).toBeUndefined();
    expect(JSON.stringify(d)).not.toContain('desvio');
  });

  it('projeto sem o n.ot: 403', async () => {
    expect((await chamar(cons, '/api/v1/projects/proj-b/painel?modulo=ot')).status).toBe(403);
  });

  it('chave de API nunca recebe o n.ot (P0-2)', async () => {
    // mesmo arranjo de test/ot-modulo.test.ts: chave real no cabeçalho X-API-Key (principal `apikey:<id>`)
    const r = await chamar({ 'X-API-Key': 'chave-painel-ot' }, '/api/v1/projects/proj-a/painel?modulo=ot');
    expect(r.status).toBe(403);
    expect((await chamar({ 'X-API-Key': 'chave-painel-ot' }, '/api/v1/carteira')).status).not.toBe(500);
  });
});

describe('carteira com o n.ot', () => {
  it('função pura: desvio aberto e sonda parada pedem atenção e apontam para o n.ot', () => {
    const base = { modulos: ['ot'] as any, pedidos_atrasados: 0, comunicacoes_atrasadas: 0, acoes_vencidas: 0, terceiros_vencidos: 0, vence_7_dias: 0,
      tratamentos: 0, controles: 0, proximo: null };
    expect(situacaoNaCarteira({ ...base, sites: 1, desvios_abertos: 2, sondas_paradas: 1 }))
      .toMatchObject({ tom: 'atraso', modulo: 'ot', situacao: '1 sonda parada', urgente: '1 sonda parada e 2 desvios abertos' });
    expect(situacaoNaCarteira({ ...base, sites: 1, desvios_abertos: 2 })).toMatchObject({ tom: 'semana', modulo: 'ot', situacao: '2 desvios abertos' });
    expect(situacaoNaCarteira({ ...base, sites: 1 })).toMatchObject({ tom: 'ok', situacao: 'Em dia' });
    expect(situacaoNaCarteira({ ...base, sites: 0 })).toMatchObject({ situacao: 'Começando' });
  });

  it('rota: o consultor com o módulo vê o desvio; quem não tem o módulo não vê', async () => {
    const d = await (await chamar(cons, '/api/v1/carteira')).json() as any;
    expect(d.projetos.find((p: any) => p.id === 'proj-a')).toMatchObject({ situacao: '1 desvio aberto', modulo_urgente: 'ot' });
    const s = await (await chamar(semOt, '/api/v1/carteira')).json() as any;
    expect(JSON.stringify(s)).not.toContain('desvio');
  });
});
