import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { listarTerceiros } from '../src/services/terceiros';
import { CONSULTAS_ENTIDADE } from '../src/services/passos/contexto';
import { pontoDePartida } from '../src/services/ponto-de-partida';
import { applySchema, sessionFor, workerEnv, designarConsultor, habilitarPrivacy } from './helpers/d1';

/** Quem é fornecedor: organização ativa que não é só parte interessada. O mesmo critério no n.iso, no n.privacy e nas contagens. */
const P = 'fc-proj';
const chamar = (h: Record<string, string>, caminho: string, metodo = 'GET', corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
}), workerEnv());
let consultor: Record<string, string>;
type Linha = { parte_id: string; id: string | null; name: string; project_id: string; trust_score: number | null };
const lista = async () => (await (await chamar(consultor, `/api/v1/projects/${P}/vendors`)).json<{ vendors: Linha[] }>()).vendors;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P),
    // criada em Partes, sem perfil de segurança nem vínculo terceiro
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('fc-org', ?, 'organizacao', 'Nuvem Exemplo')`).bind(P),
    // só parte interessada: não é fornecedor
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('fc-pi', ?, 'organizacao', 'Autoridade Exemplo')`).bind(P),
    env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('fc-v', ?, 'fc-pi', 'parte_interessada', 'projeto', ?)`).bind(P, P),
  ]);
  await habilitarPrivacy(P);
  await designarConsultor('cons@ness.lat', P);
  consultor = await sessionFor({ id: 'cons:cons@ness.lat', email: 'cons@ness.lat', role: 'consultor' });
});

describe('fornecedor: o mesmo critério nos dois módulos', () => {
  it('organização criada em Partes aparece no n.iso (sem perfil) e no n.privacy; parte interessada não', async () => {
    const vendors = await lista();
    expect(vendors.map((v) => v.parte_id)).toEqual(['fc-org']);
    expect(vendors[0]).toMatchObject({ id: null, name: 'Nuvem Exemplo', project_id: P, trust_score: null });
    expect((await listarTerceiros(env.DB, P)).map((t) => t.id)).toEqual(['fc-org']);
  });

  it('Bancada e ponto de partida contam o mesmo fornecedor', async () => {
    expect(await env.DB.prepare(CONSULTAS_ENTIDADE.fornecedores).bind(P).first()).toEqual({ n: 1 });
    expect((await pontoDePartida(env.DB, P)).cadastro.terceiros).toBe(1);
  });

  it('CSV: fornecedor sem perfil sai com as células do perfil vazias, nunca "null"; o DPA (da parte) diz Não', async () => {
    const csv = await (await chamar(consultor, `/api/v1/projects/${P}/export/vendors`)).text();
    expect(csv.split('\r\n')[1]).toBe('"Nuvem Exemplo";"";"";"";"";"";"Não"'); // o DPA é da parte (documento ligado), não do perfil
  });

  it('criar a avaliação pelo POST reaproveita a parte; remover a avaliação deixa o fornecedor na lista', async () => {
    const r = await chamar(consultor, `/api/v1/projects/${P}/vendors`, 'POST', { name: 'Nuvem Exemplo', has_iso27001: 1 });
    expect(r.status).toBe(201);
    const { id } = await r.json<{ id: string }>();
    expect(await lista()).toEqual([expect.objectContaining({ id, parte_id: 'fc-org', trust_score: 20 })]);
    expect((await chamar(consultor, `/api/v1/vendors/${id}`, 'DELETE')).status).toBe(200);
    expect(await lista()).toEqual([expect.objectContaining({ id: null, parte_id: 'fc-org' })]);
    expect((await listarTerceiros(env.DB, P)).map((t) => t.id)).toEqual(['fc-org']);
  });

  it('com parte_id, a avaliação vai para a parte da linha, mesmo com outra de mesmo nome', async () => {
    await env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('fc-org2', ?, 'organizacao', 'nuvem exemplo')`).bind(P).run();
    const r = await chamar(consultor, `/api/v1/projects/${P}/vendors`, 'POST', { name: 'nuvem exemplo', parte_id: 'fc-org2' });
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await env.DB.prepare('SELECT parte_id FROM vendors WHERE id = ?').bind((await r.json<{ id: string }>()).id).first()).toEqual({ parte_id: 'fc-org2' });
    // parte de outro projeto, ou que não é fornecedor, não serve
    expect((await chamar(consultor, `/api/v1/projects/${P}/vendors`, 'POST', { name: 'x', parte_id: 'fc-pi' })).status).toBe(404);
  });
});
