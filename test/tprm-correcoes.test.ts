import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';

/**
 * Correções do TPRM (análise de 09/11/2026): DPA versionado só vale vigente; fornecedor inativo não recebe avaliação nem questionário
 * e some dos alertas do RoPA; o parceiro do Compartilhamento Externo conta; tipo, criticidade e avaliação são da equipe e do org_admin.
 */
const P = 'tc-tprm';
const B = `/api/v1/projects/${P}`;
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const publico = (acao: string, corpo: unknown) => app.fetch(new Request(`http://localhost/api/v1/public/homologacao/${acao}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
}), workerEnv());

let consultor: Record<string, string>, orgAdmin: Record<string, string>, orgUser: Record<string, string>;
const VENCIDA = '2020-01-01';

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('tc-cons', 'cons@ness.teste', 'x', 'Cons', 'consultor', NULL, 'org_ness'),
      ('tc-adm', 'adm@cliente.teste', 'x', 'Adm', 'org_admin', ?1, 'org_ness'),
      ('tc-usr', 'usr@cliente.teste', 'x', 'Usr', 'org_user', ?1, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-tc', ?, 'Cons', 'cons@ness.teste', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, terceiro_tipo) VALUES
      ('f-dpa', ?1, 'organizacao', 'Nuvem DPA', 'pequeno'), ('f-ina', ?1, 'organizacao', 'Antigo Ltda', 'pequeno'),
      ('f-ext', ?1, 'organizacao', 'Externo SA', 'pequeno'), ('f-old', ?1, 'organizacao', 'Desligado SA', 'pequeno')`).bind(P),
    env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES
      ('tv1', ?1, 'f-dpa', 'terceiro', 'projeto', ?1), ('tv2', ?1, 'f-ina', 'terceiro', 'projeto', ?1),
      ('tv3', ?1, 'f-ext', 'terceiro', 'projeto', ?1), ('tv4', ?1, 'f-old', 'terceiro', 'projeto', ?1)`).bind(P),
    env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo) VALUES ('tc-doc', ?, 'DPA Nuvem')`).bind(P),
    env.DB.prepare(`INSERT INTO documento_partes (documento_id, parte_id, papel, project_id) VALUES ('tc-doc', 'f-dpa', 'dpa', ?)`).bind(P),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('tc-ropa', ?, 'Folha de pagamento')`).bind(P),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, status) VALUES ('tc-cancelada', ?, 'Atividade cancelada', 'Inactive')`).bind(P),
    env.DB.prepare(`INSERT INTO tratamento_externo_parceiros (ropa_id, parte_id, project_id) VALUES ('tc-ropa', 'f-ext', ?1), ('tc-cancelada', 'f-ext', ?1)`).bind(P),
    env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('tv5', ?, 'f-old', 'operador', 'tratamento', 'tc-ropa')`).bind(P),
    env.DB.prepare(`INSERT INTO avaliacoes_terceiro (id, project_id, parte_id, metodo, resultado, valido_ate, avaliado_por) VALUES
      ('av-ext', ?1, 'f-ext', 'questionario', 'aprovado', ?2, 'x'), ('av-old', ?1, 'f-old', 'questionario', 'aprovado', ?2, 'x')`).bind(P, VENCIDA),
  ]);
  await env.DB.prepare(`UPDATE partes SET status = 'inativa' WHERE id = 'f-old'`).run();
  await env.DB.prepare(`UPDATE vendors SET has_iso27001 = 1, trust_score = 99, diligence_level = 'Low' WHERE parte_id = 'f-dpa'`).run();
  await habilitarPrivacy(P);
  await concederModulos(['tc-cons', 'tc-adm', 'tc-usr'], ['privacy']);
  consultor = await sessionFor({ id: 'tc-cons', email: 'cons@ness.teste', role: 'consultor' });
  orgAdmin = await sessionFor({ id: 'tc-adm', email: 'adm@cliente.teste', role: 'org_admin', client_project_id: P });
  orgUser = await sessionFor({ id: 'tc-usr', email: 'usr@cliente.teste', role: 'org_user', client_project_id: P });
});

type T = { id: string; dpa: boolean; pendencias: string[]; seguranca?: { trust_score: number; diligence_level: string } };
const terceiro = async (id: string) => ((await (await chamar(consultor, 'GET', `${B}/terceiros`)).json()) as T[]).find((t) => t.id === id)!;

describe('DPA versionado só vale vigente', () => {
  it('rascunho ligado como DPA não fecha a pendência nem soma no índice; vigente fecha', async () => {
    expect(await terceiro('f-dpa')).toMatchObject({ dpa: false });
    expect((await terceiro('f-dpa')).pendencias).toContain('DPA');
    // a ficha calcula o índice agora (ISO 27001 = 20, sem DPA), não o 99 gravado
    let ficha = (await (await chamar(consultor, 'GET', `${B}/terceiros/f-dpa`)).json()) as T;
    expect(ficha.seguranca).toMatchObject({ trust_score: 20, diligence_level: 'High' });
    await env.DB.prepare(`UPDATE documentos SET status = 'vigente' WHERE id = 'tc-doc'`).run();
    expect(await terceiro('f-dpa')).toMatchObject({ dpa: true });
    ficha = (await (await chamar(consultor, 'GET', `${B}/terceiros/f-dpa`)).json()) as T;
    expect(ficha.seguranca).toMatchObject({ trust_score: 30 });
    await env.DB.prepare(`UPDATE documentos SET status = 'obsoleto' WHERE id = 'tc-doc'`).run();
    expect(await terceiro('f-dpa')).toMatchObject({ dpa: false });
  });
});

describe('fornecedor inativo', () => {
  it('o link do questionário deixa de valer, e não recebe questionário nem avaliação nova', async () => {
    const r = await chamar(consultor, 'POST', `${B}/homologacoes`, { parte_id: 'f-ina' });
    expect(r.status, await r.clone().text()).toBe(201);
    const token = ((await r.json()) as { url: string }).url.split('#')[1];
    expect((await publico('ver', { token })).status).toBe(200);
    await env.DB.prepare(`UPDATE partes SET status = 'inativa' WHERE id = 'f-ina'`).run();
    expect((await publico('ver', { token })).status).toBe(404);
    expect((await chamar(consultor, 'POST', `${B}/homologacoes`, { parte_id: 'f-ina' })).status).toBe(409);
    expect((await chamar(consultor, 'POST', `${B}/terceiros/f-ina/avaliacoes`, { resultado: 'aprovado', valido_ate: '2099-01-01' })).status).toBe(409);
  });
});

describe('alertas do RoPA', () => {
  it('a atividade aponta o parceiro do Compartilhamento Externo vencido e esquece o fornecedor inativo', async () => {
    const r = await chamar(consultor, 'GET', `${B}/ropa/tc-ropa/ligacoes`);
    expect(r.status, await r.clone().text()).toBe(200);
    const { terceiros_com_avaliacao_vencida: vencidos } = (await r.json()) as { terceiros_com_avaliacao_vencida: { parte_id: string }[] };
    expect(vencidos.map((v) => v.parte_id)).toEqual(['f-ext']);
    const enc = (await (await chamar(consultor, 'GET', `${B}/encarregado`)).json()) as { tratamentos: { com_terceiro_vencido: number } };
    expect(enc.tratamentos.com_terceiro_vencido).toBe(1); // a atividade cancelada não conta
  });
});

describe('tipo, criticidade e avaliação: a equipe e o administrador do cliente', () => {
  const CRIT = { impacto: 'baixo', exclusividade: 'varias_alternativas', risco_financeiro: 'baixo', conformidade: 'sem_regulamentacao', risco_reputacional: 'baixo' };
  it('o usuário comum do cliente recebe 403; o administrador do cliente e o consultor gravam; o questionário segue só da equipe', async () => {
    expect((await chamar(orgUser, 'PUT', `${B}/terceiros/f-ext/tipo`, { terceiro_tipo: 'medio' })).status).toBe(403);
    expect((await chamar(orgUser, 'POST', `${B}/terceiros/f-ext/avaliacoes`, { resultado: 'aprovado', valido_ate: '2099-01-01' })).status).toBe(403);
    expect((await chamar(orgUser, 'POST', `${B}/terceiros/f-ext/criticidades`, CRIT)).status).toBe(403);
    expect((await chamar(orgAdmin, 'PUT', `${B}/terceiros/f-ext/tipo`, { terceiro_tipo: 'medio' })).status).toBe(200);
    expect((await chamar(orgAdmin, 'POST', `${B}/terceiros/f-ext/criticidades`, CRIT)).status).toBe(201);
    expect((await chamar(orgAdmin, 'POST', `${B}/terceiros/f-ext/avaliacoes`, { resultado: 'aprovado', valido_ate: '2099-01-01' })).status).toBe(201);
    expect((await chamar(orgAdmin, 'POST', `${B}/homologacoes`, { parte_id: 'f-ext' })).status).toBe(403);
    expect((await chamar(consultor, 'POST', `${B}/terceiros/f-ext/avaliacoes`, { resultado: 'aprovado', valido_ate: '2099-01-01' })).status).toBe(201);
  });
});
