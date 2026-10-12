import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, execSql, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';
import migration0061 from '../migrations/0061_fornecedor_e_terceiro.sql?raw';

/** Fornecedor do n.iso e terceiro do n.privacy são a MESMA parte: `vendors` é o perfil de segurança da parte organização. */
const P = 'ft-proj';
const SO_ISO = 'ft-iso';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;

let consultor: Record<string, string>;
type V = { id: string; name: string; parte_id: string; trust_score: number; notes?: string };
const vendors = async (p = P) => (await json<{ vendors: V[] }>(await chamar(consultor, 'GET', `/api/v1/projects/${p}/vendors`))).vendors;
const contarPartes = async () => (await env.DB.prepare('SELECT count(*) AS n FROM partes WHERE project_id = ?').bind(P).first<{ n: number }>())!.n;
const vinculoTerceiro = (parteId: string, p = P) =>
  env.DB.prepare(`SELECT 1 AS ok FROM parte_vinculos WHERE parte_id = ? AND papel = 'terceiro' AND alvo_tipo = 'projeto' AND alvo_id = ?`).bind(parteId, p).first();

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Só ISO', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, SO_ISO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-ft', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-ft1', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'), ('g-ft2', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P, SO_ISO),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('ft-delta', ?, 'organizacao', 'Delta Serviços'), ('ft-reuso', ?, 'organizacao', 'Reuso Exemplo')`).bind(P, P),
  ]);
  await habilitarPrivacy(P);
  consultor = await sessionFor({ id: 'u-ft', email: 'cons@ness.lat', role: 'consultor' });
});

describe('rotas de vendors sobre a parte', () => {
  let gama: string;
  let gamaParte: string;

  it('POST cria a parte organização com vínculo terceiro; o terceiro aparece no n.privacy e o vendor traz parte_id', async () => {
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/vendors`, { name: 'Gama', has_iso27001: 1 });
    expect(r.status).toBe(201);
    gama = (await json<{ id: string }>(r)).id;
    const parte = await env.DB.prepare(`SELECT id FROM partes WHERE project_id = ? AND nome = 'Gama' AND tipo = 'organizacao'`).bind(P).first<{ id: string }>();
    expect(parte).toBeTruthy();
    gamaParte = parte!.id;
    expect(await vinculoTerceiro(gamaParte)).toEqual({ ok: 1 });
    const terceiros = await json<{ id: string; nome: string }[]>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/terceiros`));
    expect(terceiros.map((t) => t.nome)).toContain('Gama');
    const v = (await vendors()).find((x) => x.id === gama)!;
    expect(v).toMatchObject({ name: 'Gama', parte_id: gamaParte, trust_score: 20 });
  });

  it('POST com nome de parte que já existe reaproveita a parte', async () => {
    const antes = await contarPartes();
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/vendors`, { name: '  reuso exemplo ' });
    expect(r.status).toBe(201);
    expect(await contarPartes()).toBe(antes);
    const id = (await json<{ id: string }>(r)).id;
    expect((await vendors()).find((x) => x.id === id)!.parte_id).toBe('ft-reuso');
  });

  it('PUT renomeia a parte', async () => {
    const r = await chamar(consultor, 'PUT', `/api/v1/vendors/${gama}`, { name: 'Gama Nova' });
    expect(r.status).toBe(200);
    expect(await env.DB.prepare('SELECT nome FROM partes WHERE id = ?').bind(gamaParte).first()).toEqual({ nome: 'Gama Nova' });
  });

  it('PUT apara o nome na parte e no perfil', async () => {
    expect((await chamar(consultor, 'PUT', `/api/v1/vendors/${gama}`, { name: '  Gama Nova  ' })).status).toBe(200);
    expect(await env.DB.prepare('SELECT nome FROM partes WHERE id = ?').bind(gamaParte).first()).toEqual({ nome: 'Gama Nova' });
    expect(await env.DB.prepare('SELECT name FROM vendors WHERE id = ?').bind(gama).first()).toEqual({ name: 'Gama Nova' });
  });

  it('POST de fornecedor que já tem perfil é 409 e não mexe no perfil', async () => {
    const r1 = await chamar(consultor, 'POST', `/api/v1/projects/${P}/vendors`, { name: 'Zeta', notes: 'primeira' });
    expect(r1.status).toBe(201);
    const id = (await json<{ id: string }>(r1)).id;
    const r2 = await chamar(consultor, 'POST', `/api/v1/projects/${P}/vendors`, { name: ' zeta ', notes: 'segunda', has_iso27001: 1 });
    expect(r2.status).toBe(409);
    expect(await json(r2)).toEqual({ error: 'Fornecedor já cadastrado neste projeto', id });
    expect(await env.DB.prepare('SELECT notes, trust_score FROM vendors WHERE id = ?').bind(id).first()).toEqual({ notes: 'primeira', trust_score: 0 });
  });

  it('POST não reaproveita parte inativa de mesmo nome: cria parte nova, visível na lista', async () => {
    await env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, status) VALUES ('ft-inativa', ?, 'organizacao', 'Inativa Exemplo', 'inativa')`).bind(P).run();
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/vendors`, { name: 'Inativa Exemplo' });
    expect(r.status).toBe(201);
    const id = (await json<{ id: string }>(r)).id;
    const v = (await vendors()).find((x) => x.id === id)!;
    expect(v.parte_id).not.toBe('ft-inativa');
    expect(v.name).toBe('Inativa Exemplo');
  });

  it('tipar no n.privacy uma organização sem vendor cria o perfil de segurança (trust_score 0)', async () => {
    const r = await chamar(consultor, 'PUT', `/api/v1/projects/${P}/terceiros/ft-delta/tipo`, { terceiro_tipo: 'medio' });
    expect(r.status).toBe(200);
    const v = (await vendors()).find((x) => x.parte_id === 'ft-delta');
    expect(v).toMatchObject({ name: 'Delta Serviços', trust_score: 0 });
    expect(await vinculoTerceiro('ft-delta')).toEqual({ ok: 1 });
  });

  it('DELETE tira o perfil e o vínculo terceiro; a parte e a avaliação dela ficam', async () => {
    await env.DB.prepare(`INSERT INTO avaliacoes_terceiro (id, project_id, parte_id, metodo, resultado, valido_ate) VALUES ('ft-av', ?, ?, 'questionario', 'aprovado', '2999-01-01')`).bind(P, gamaParte).run();
    const r = await chamar(consultor, 'DELETE', `/api/v1/vendors/${gama}`);
    expect(r.status).toBe(200);
    expect(await env.DB.prepare('SELECT 1 FROM vendors WHERE id = ?').bind(gama).first()).toBeNull();
    expect(await vinculoTerceiro(gamaParte)).toBeNull();
    expect(await env.DB.prepare('SELECT nome FROM partes WHERE id = ?').bind(gamaParte).first()).toEqual({ nome: 'Gama Nova' });
    expect(await env.DB.prepare(`SELECT id FROM avaliacoes_terceiro WHERE id = 'ft-av'`).first()).toEqual({ id: 'ft-av' });
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM audit_logs WHERE action = 'vendor.deleted'`).first()).toEqual({ n: 1 });
  });

  it('perfil sem vínculo terceiro some da lista e volta, com os dados de antes, quando o vínculo é recriado', async () => {
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/vendors`, { name: 'Vinculo Exemplo', notes: 'guardada' });
    const { id } = await json<{ id: string }>(r);
    const parteId = (await vendors()).find((x) => x.id === id)!.parte_id;
    const vin = await env.DB.prepare(`SELECT id FROM parte_vinculos WHERE parte_id = ? AND papel = 'terceiro'`).bind(parteId).first<{ id: string }>();
    expect((await chamar(consultor, 'DELETE', `/api/v1/projects/${P}/partes/${parteId}/vinculos/${vin!.id}`)).status).toBe(200);
    expect((await vendors()).find((x) => x.id === id)).toBeUndefined();
    const nova = await chamar(consultor, 'POST', `/api/v1/projects/${P}/partes/${parteId}/vinculos`, { papel: 'terceiro', alvo_tipo: 'projeto', alvo_id: P });
    expect(nova.status).toBe(201);
    expect((await vendors()).find((x) => x.id === id)).toMatchObject({ id, name: 'Vinculo Exemplo', notes: 'guardada' });
    // sem o vínculo de novo, e pelo cadastro: o POST traz o perfil de volta sem sobrescrever; com o vínculo, segue 409
    await env.DB.prepare(`DELETE FROM parte_vinculos WHERE parte_id = ? AND papel = 'terceiro'`).bind(parteId).run();
    const volta = await chamar(consultor, 'POST', `/api/v1/projects/${P}/vendors`, { name: 'Vinculo Exemplo' });
    expect(volta.status).toBe(200);
    expect((await json<{ id: string }>(volta)).id).toBe(id);
    expect((await vendors()).find((x) => x.id === id)).toMatchObject({ notes: 'guardada' });
    expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/vendors`, { name: 'Vinculo Exemplo' })).status).toBe(409);
    const csv = await (await chamar(consultor, 'GET', `/api/v1/projects/${P}/export/vendors`)).text();
    expect(csv).toContain('Vinculo Exemplo');
    await env.DB.prepare(`DELETE FROM parte_vinculos WHERE parte_id = ? AND papel = 'terceiro'`).bind(parteId).run();
    expect(await (await chamar(consultor, 'GET', `/api/v1/projects/${P}/export/vendors`)).text()).not.toContain('Vinculo Exemplo');
  });

  it('perfil de parte inativa já tipada como terceiro não aparece na lista', async () => {
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/vendors`, { name: 'Tipada Inativa' });
    const { id } = await json<{ id: string }>(r);
    const parteId = (await vendors()).find((x) => x.id === id)!.parte_id;
    await env.DB.prepare(`UPDATE partes SET status = 'inativa', terceiro_tipo = 'medio' WHERE id = ?`).bind(parteId).run();
    expect((await vendors()).find((x) => x.id === id)).toBeUndefined();
  });

  it('projeto só n.iso: POST /vendors funciona (faixa núcleo)', async () => {
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${SO_ISO}/vendors`, { name: 'Épsilon' });
    expect(r.status).toBe(201);
    expect((await vendors(SO_ISO)).map((v) => v.name)).toEqual(['Épsilon']);
  });
});

// Por último: recria `vendors` no formato de antes da 0061 e aplica a migration.
describe('migration 0061', () => {
  it('liga o vendor à parte de mesmo nome (ou cria uma), com vínculo terceiro; nenhum vendor sem parte', async () => {
    // Sem a FK de project_id na tabela recriada: é o jeito de ter o vendor órfão que produção pode ter (FK não conferida no passado).
    // Cada comando em linha própria: execSql fecha gatilho na linha do END.
    await execSql(`DROP TRIGGER IF EXISTS vendor_perfil_do_terceiro;
DROP TRIGGER IF EXISTS vendor_nome_da_parte;
DROP INDEX IF EXISTS idx_vendors_parte;
DROP TABLE vendors;
CREATE TABLE vendors (id TEXT PRIMARY KEY, project_id TEXT, name TEXT NOT NULL, category TEXT, has_iso27001 INTEGER DEFAULT 0, has_iso27701 INTEGER DEFAULT 0, has_soc2 INTEGER DEFAULT 0, trust_score INTEGER DEFAULT 0, diligence_level TEXT DEFAULT 'High', dpa_signed INTEGER DEFAULT 0, last_assessment_date TEXT, notes TEXT, status TEXT DEFAULT 'Active', has_mfa INTEGER DEFAULT 0, has_encryption INTEGER DEFAULT 0, has_backup INTEGER DEFAULT 0, has_incident_plan INTEGER DEFAULT 0, has_pentest INTEGER DEFAULT 0, trust_center_url TEXT, dpa_url TEXT, attached_certifications TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('ft-leg', 'Legado', 'ISO 27001', 'Controller', 'Active', 'org_ness')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('ft-acme', 'ft-leg', 'organizacao', ' acme nuvem ')`),
      env.DB.prepare(`INSERT INTO vendors (id, project_id, name) VALUES ('v-acme', 'ft-leg', 'Acme Nuvem'), ('v-beta', 'ft-leg', 'Beta Ltda'), ('v-beta2', 'ft-leg', 'beta ltda '), ('v-orfao', 'projeto-apagado', 'Órfão')`),
      // tipada como terceiro no n.privacy antes da 0061, sem vínculo nem perfil
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, terceiro_tipo) VALUES ('ft-tipada', 'ft-leg', 'organizacao', 'Tipada Exemplo', 'critico')`),
      // parte INATIVA com o nome do vendor: não serve (o POST também não a reaproveita); o vendor ganha parte nova ativa
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, status) VALUES ('ft-velha', 'ft-leg', 'organizacao', 'Velha Exemplo', 'inativa')`),
      env.DB.prepare(`INSERT INTO vendors (id, project_id, name) VALUES ('v-velha', 'ft-leg', 'Velha Exemplo')`),
      env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-ft3', 'ft-leg', 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`),
    ]);
    await execSql(migration0061);
    const pid = async (id: string) => (await env.DB.prepare('SELECT parte_id FROM vendors WHERE id = ?').bind(id).first<{ parte_id: string }>())!.parte_id;
    expect(await pid('v-acme')).toBe('ft-acme');
    const beta = await pid('v-beta');
    expect(await env.DB.prepare('SELECT tipo, nome FROM partes WHERE id = ?').bind(beta).first()).toEqual({ tipo: 'organizacao', nome: 'Beta Ltda' });
    // o repetido ganha parte própria (o índice único não deixa dois perfis na mesma parte)
    const beta2 = await pid('v-beta2');
    expect(beta2).toBeTruthy();
    expect(beta2).not.toBe(beta);
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM partes WHERE project_id = 'ft-leg'`).first()).toEqual({ n: 6 });
    const velha = await pid('v-velha');
    expect(velha).not.toBe('ft-velha');
    expect(await env.DB.prepare('SELECT nome, status FROM partes WHERE id = ?').bind(velha).first()).toEqual({ nome: 'Velha Exemplo', status: 'ativa' });
    expect((await vendors('ft-leg')).map((v) => v.id)).toContain('v-velha');
    expect(await vinculoTerceiro('ft-acme', 'ft-leg')).toEqual({ ok: 1 });
    expect(await vinculoTerceiro(beta, 'ft-leg')).toEqual({ ok: 1 });
    // o órfão não derruba a migration e fica sem parte; todo o resto tem parte
    expect(await env.DB.prepare('SELECT id FROM vendors WHERE parte_id IS NULL').all().then((r) => r.results)).toEqual([{ id: 'v-orfao' }]);
    // a organização já tipada ganhou vínculo e perfil
    expect(await vinculoTerceiro('ft-tipada', 'ft-leg')).toEqual({ ok: 1 });
    expect(await env.DB.prepare(`SELECT project_id, name, trust_score FROM vendors WHERE parte_id = 'ft-tipada'`).first()).toEqual({ project_id: 'ft-leg', name: 'Tipada Exemplo', trust_score: 0 });
    // os gatilhos voltaram com a migration
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name IN ('vendor_perfil_do_terceiro', 'vendor_nome_da_parte')`).first()).toEqual({ n: 2 });
  });
});
