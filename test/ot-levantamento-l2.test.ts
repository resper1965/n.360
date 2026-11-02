import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

// Levantamento do n.ot (spec 2026-11-01, L2): achado de fluxo. Base da L1: sessões, achados, confronto sem oráculo, envio ao lote. D1 real.
type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
const chamar = (h: H, metodo: string, caminho: string, corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
}), workerEnv());
const criar = async (h: H, rota: string, corpo: unknown) => {
  const r = await chamar(h, 'POST', `${P}/${rota}`, corpo);
  expect(r.status, `${rota} ${await r.clone().text()}`).toBe(201);
  return (await r.json<{ id: string }>()).id;
};

let gestor: H, tec: H, cons: H, cli: H;
const ids: Record<string, string> = {};
beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
    ('u-gestor', 'gestor@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'),
    ('u-tec', 'tec@cliente.teste', 'x', 'Técnico', 'org_user', 'proj-a'),
    ('u-cli', 'cli@cliente.teste', 'x', 'Leitura', 'client', 'proj-a')`).run();
  await designarConsultor('cons-ot@ness.lat', 'proj-a');
  await concederModulos(['u-gestor', 'u-tec', 'u-cli', 'cons:cons-ot@ness.lat'], ['ot']);
  gestor = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  tec = await sessionFor({ id: 'u-tec', email: 'tec@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  cli = await sessionFor({ id: 'u-cli', email: 'cli@cliente.teste', role: 'client', client_project_id: 'proj-a' });
  cons = await sessionFor({ id: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', role: 'consultor' });
  ids.s1 = await criar(cons, 'sites', { nome: 'SE Norte' });
  ids.s2 = await criar(cons, 'sites', { nome: 'SE Sul' });
  ids.a1 = await criar(cons, 'ativos', { site_id: ids.s1, nome: 'RTU 1', ip: '10.1.1.10' });
  ids.a2 = await criar(cons, 'ativos', { site_id: ids.s1, nome: 'IHM 1', ip: '10.1.1.11' });
  ids.a3 = await criar(cons, 'ativos', { site_id: ids.s2, nome: 'RTU Sul', ip: '10.2.1.10' });
  ids.z1 = await criar(cons, 'zonas', { site_id: ids.s1, nome: 'Supervisão', nivel_purdue: 2 });
  expect((await chamar(gestor, 'POST', `${P}/acessos`, { user_id: 'u-tec', site_id: ids.s1 })).status).toBe(201);
  ids.lev1 = await criar(cons, 'levantamentos', { site_id: ids.s1, tipo: 'entrevista', realizado_em: '2026-11-01', funcao: 'Operador', turno: 'B', notas: 'usa TeamViewer' });
  ids.lev2 = await criar(cons, 'levantamentos', { site_id: ids.s2, tipo: 'visita', realizado_em: '2026-11-01' });
});


type Ach = { id: string; entidade: string; pergunta_id: string | null; dados: Record<string, unknown>; erros: { campo: string }[]; confronto?: string; alvo_id?: string };
const sessao = async (h: H) => (await (await chamar(h, 'GET', `${P}/levantamentos/${ids.lev1}`)).json<{ achados: Ach[] }>()).achados;
const fluxoAch = (dados: Record<string, unknown>, extra: Record<string, unknown> = {}) => chamar(cons, 'POST', `${P}/levantamentos/${ids.lev1}/achados`,
  { entidade: 'fluxo', dados, evidencia: 'relatado', ...extra });

describe('achado de fluxo (L2)', () => {
  it('cria com pergunta e devolve entidade, pergunta_id e dados', async () => {
    const r = await fluxoAch({ origem_ativo_id: ids.a1, destino_ativo_id: ids.a2, protocolo: 'Modbus', porta: 502 }, { pergunta_id: 'rot-01' });
    expect(r.status).toBe(201);
    const { id, erros } = await r.json<{ id: string; erros: unknown[] }>();
    expect(erros).toEqual([]);
    expect(await sessao(cons)).toContainEqual(expect.objectContaining({ id, entidade: 'fluxo', pergunta_id: 'rot-01', dados: expect.objectContaining({ porta: 502 }) }));
  });

  it('pergunta inexistente: 400', async () => {
    expect((await fluxoAch({ origem_ativo_id: ids.a1, destino_ativo_id: ids.a2 }, { pergunta_id: 'rot-99' })).status).toBe(400);
  });

  it('ponta de outro site: 201 com erro no campo e fora de dados', async () => {
    const r = await fluxoAch({ origem_ativo_id: ids.a3, destino_ativo_id: ids.a2 });
    expect(r.status).toBe(201);
    const { id, erros } = await r.json<{ id: string; erros: { campo: string }[] }>();
    expect(erros.map((e) => e.campo)).toContain('origem_ativo_id');
    expect((await sessao(cons)).find((a) => a.id === id)!.dados).not.toHaveProperty('origem_ativo_id');
  });

  it('confronto: confirma, contradiz, novo; técnico não recebe confronto', async () => {
    const f = await criar(cons, 'fluxos', { site_id: ids.s1, origem_ativo_id: ids.a1, destino_ativo_id: ids.a2, externo: false });
    const conf = await criar(cons, `levantamentos/${ids.lev1}/achados`, { entidade: 'fluxo', dados: { origem_ativo_id: ids.a1, destino_ativo_id: ids.a2 }, evidencia: 'x' });
    const contra = await criar(cons, `levantamentos/${ids.lev1}/achados`, { entidade: 'fluxo', dados: { origem_ativo_id: ids.a1, destino_ativo_id: ids.a2, externo: true }, evidencia: 'x' });
    const novo = await criar(cons, `levantamentos/${ids.lev1}/achados`, { entidade: 'fluxo', dados: { origem_ativo_id: ids.a2, destino_zona_id: ids.z1 }, evidencia: 'x' });
    const c = await sessao(cons);
    expect(c.find((a) => a.id === conf)).toMatchObject({ confronto: 'confirma', alvo_id: f });
    expect(c.find((a) => a.id === contra)).toMatchObject({ confronto: 'contradiz', alvo_id: f });
    expect(c.find((a) => a.id === novo)).toMatchObject({ confronto: 'novo', alvo_id: null });
    for (const a of await sessao(tec)) { expect(a).not.toHaveProperty('confronto'); expect(a).not.toHaveProperty('alvo_id'); }
  });

  it('PUT: entidade é 400; porta inválida é 200 com erro', async () => {
    const id = await criar(cons, `levantamentos/${ids.lev1}/achados`, { entidade: 'fluxo', dados: { origem_ativo_id: ids.a2, destino_ativo_id: ids.a1 }, evidencia: 'x' });
    const u = `${P}/levantamentos/${ids.lev1}/achados/${id}`;
    expect((await chamar(cons, 'PUT', u, { entidade: 'ativo' })).status).toBe(400);
    expect((await chamar(cons, 'PUT', u, { dados: { origem_ativo_id: ids.a2, destino_ativo_id: ids.a1, porta: 70000 } })).status).toBe(200);
    expect((await sessao(cons)).find((a) => a.id === id)!.erros.map((e) => e.campo)).toContain('porta');
  });

  it('achado de ativo segue como na L1: IP existente confirma', async () => {
    const id = await criar(cons, `levantamentos/${ids.lev1}/achados`, { dados: { nome: 'RTU 1', ip: '10.1.1.10' }, evidencia: 'x' });
    expect((await sessao(cons)).find((a) => a.id === id)).toMatchObject({ entidade: 'ativo', confronto: 'confirma', alvo_id: ids.a1 });
  });
});
