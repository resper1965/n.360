import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';

/** Fornecedores (n.privacy): a lista traz nível, DPA e atividades; a ficha traz e-mail, perfil de segurança e as atividades das duas origens. */
const P = 'ff-proj';
const OUTRO = 'ff-outro';
const base = `/api/v1/projects/${P}/terceiros`;

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;

const todosBaixo = { impacto: 'baixo', exclusividade: 'varias_alternativas', risco_financeiro: 'baixo', conformidade: 'sem_regulamentacao', risco_reputacional: 'baixo' };

let consultor: Record<string, string>, alheio: Record<string, string>;
type Item = { id: string; nivel: string | null; dpa: boolean; atividades: number; tratamentos: number };
type Ficha = { email: string | null; seguranca: { id: string; name: string; has_mfa: number } | null; tratamentos_afetados: { id: string; finalidade: string; origem: string }[] };

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente FF', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Outro FF', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-ff', 'ff@ness.lat', 'x', 'FF', 'consultor', NULL, 'org_ness'), ('u-ffo', 'ffo@exemplo.com', 'x', 'FFO', 'org_user', ?, 'org_ness')`).bind(OUTRO),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-ff', ?, 'FF', 'ff@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES ('ff-a', ?1, 'organizacao', 'Fornecedor Exemplo', 'contato@fornecedor.exemplo'), ('ff-b', ?1, 'organizacao', 'Fornecedor Sem Perfil', NULL)`).bind(P),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('ff-r1', ?1, 'Folha de pagamento'), ('ff-r2', ?1, 'Cobrança'), ('ff-r3', ?1, 'Marketing')`).bind(P),
    // r1 nas duas origens (conta uma vez, origem vínculo); r2 só no vínculo; r3 só no compartilhamento externo
    env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('ff-v1', ?1, 'ff-a', 'operador', 'tratamento', 'ff-r1'), ('ff-v2', ?1, 'ff-a', 'operador', 'tratamento', 'ff-r2')`).bind(P),
    env.DB.prepare(`INSERT INTO tratamento_externo_parceiros (ropa_id, parte_id, project_id) VALUES ('ff-r1', 'ff-a', ?1), ('ff-r3', 'ff-a', ?1)`).bind(P),
    env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo, status) VALUES ('ff-d1', ?, 'DPA Exemplo', 'vigente'), ('ff-d2', ?, 'Contrato Exemplo', 'vigente')`).bind(P, P),
    env.DB.prepare(`INSERT INTO documento_partes (documento_id, parte_id, papel, project_id) VALUES ('ff-d1', 'ff-a', 'dpa', ?1), ('ff-d2', 'ff-b', 'contrato', ?1)`).bind(P),
  ]);
  await habilitarPrivacy(P, OUTRO);
  await concederModulos('u-ffo', ['privacy']);
  consultor = await sessionFor({ id: 'u-ff', email: 'ff@ness.lat', role: 'consultor' });
  alheio = await sessionFor({ id: 'u-ffo', email: 'ffo@exemplo.com', role: 'org_user', client_project_id: OUTRO });
  // tipificar cria o vínculo terceiro, e o gatilho cria o perfil de segurança
  expect((await chamar(consultor, 'PUT', `${base}/ff-a/tipo`, { terceiro_tipo: 'medio' })).status).toBe(200);
});

describe('lista de fornecedores', () => {
  it('sem criticidade o nível é null; DPA só com papel dpa; atividades une as duas origens sem duplicar', async () => {
    const l = await json<Item[]>(await chamar(consultor, 'GET', base));
    const a = l.find((t) => t.id === 'ff-a')!, b = l.find((t) => t.id === 'ff-b')!;
    expect(a).toMatchObject({ nivel: null, dpa: true, atividades: 3, tratamentos: 3 });
    expect(b).toMatchObject({ nivel: null, dpa: false, atividades: 0, tratamentos: 0 });
  });

  it('o nível é o da criticidade mais recente', async () => {
    expect((await chamar(consultor, 'POST', `${base}/ff-b/criticidades`, todosBaixo)).status).toBe(201);
    expect((await chamar(consultor, 'POST', `${base}/ff-b/criticidades`, { ...todosBaixo, impacto: 'medio' })).status).toBe(201);
    const l = await json<Item[]>(await chamar(consultor, 'GET', base));
    expect(l.find((t) => t.id === 'ff-b')!.nivel).toBe('medio');
  });
});

describe('ficha do fornecedor', () => {
  it('traz o e-mail, o perfil de segurança e as atividades com a origem', async () => {
    const f = await json<Ficha>(await chamar(consultor, 'GET', `${base}/ff-a`));
    expect(f.email).toBe('contato@fornecedor.exemplo');
    expect(f.seguranca).toMatchObject({ name: 'Fornecedor Exemplo' });
    expect(f.seguranca!.id).toBeTruthy();
    expect(f.tratamentos_afetados).toEqual([
      { id: 'ff-r2', finalidade: 'Cobrança', origem: 'vinculo' },
      { id: 'ff-r1', finalidade: 'Folha de pagamento', origem: 'vinculo' },
      { id: 'ff-r3', finalidade: 'Marketing', origem: 'compartilhamento_externo' },
    ]);
  });

  it('parte sem vínculo terceiro não tem perfil de segurança', async () => {
    const f = await json<Ficha>(await chamar(consultor, 'GET', `${base}/ff-c-inexistente`));
    expect(f).toMatchObject({ error: expect.any(String) });
    await env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('ff-c', ?, 'organizacao', 'Fornecedor Solto')`).bind(P).run();
    expect((await json<Ficha>(await chamar(consultor, 'GET', `${base}/ff-c`))).seguranca).toBeNull();
  });

  it('o histórico de criticidade traz as cinco respostas de cada linha', async () => {
    const r = await json<{ historico: Record<string, string>[] }>(await chamar(consultor, 'GET', `${base}/ff-b/criticidades`));
    expect(r.historico).toHaveLength(2);
    expect(r.historico[0]).toMatchObject({ impacto: 'medio', exclusividade: 'varias_alternativas', risco_financeiro: 'baixo', conformidade: 'sem_regulamentacao', risco_reputacional: 'baixo' });
  });

  it('outro projeto não vê a ficha nem a lista', async () => {
    expect((await chamar(alheio, 'GET', `${base}/ff-a`)).status).toBe(403);
    expect((await chamar(alheio, 'GET', base)).status).toBe(403);
    const deles = await json<{ id: string }[]>(await chamar(alheio, 'GET', `/api/v1/projects/${OUTRO}/terceiros`));
    expect(deles.map((t) => t.id)).not.toContain('ff-a');
    expect((await chamar(alheio, 'GET', `/api/v1/projects/${OUTRO}/terceiros/ff-a`)).status).toBe(404);
  });
});
