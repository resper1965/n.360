import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';
import { semearCatalogo } from '../src/services/requisitos';
import { visaoDoEncarregado } from '../src/services/encarregado';
import { exportarProjeto } from '../src/portabilidade';

/**
 * F3 (migration 0074): ciclo de vida do dado por etapa e bases legais adicionais (com o texto do GDPR), pelas sub-rotas da atividade
 * no n.privacy. Fora do conteúdo congelado da aprovação; quem lê (LIA exigida, painel do encarregado, DPIA, relatório) passa a considerar.
 */
const P = 'cb-proj';
const OUTRO = 'cb-outro';
const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'c-cb' };

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, extra: object = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  }), { ...workerEnv(), ...extra } as any);
const json = async <T>(r: Response) => (await r.json()) as T;
const base = (rid: string, p = P) => `/api/v1/projects/${p}/ropa/${rid}`;
type Etapa = { etapa: string; rotulo: string; situacao: string | null; item_id: string | null; item_nome: string | null; descricao: string | null };
type Bases = { principal: { id: string } | null; adicionais: { requisito_id: string; referencia: string; titulo: string; observacao: string | null }[]; base_gdpr: string | null };

let consultor: Record<string, string>, cliente: Record<string, string>, soIso: Record<string, string>;
let n = 0;
async function novo(corpo: object = {}) {
  const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa`, { processing_purpose: `Atividade ${++n}`, ...corpo });
  expect(r.status, await r.clone().text()).toBe(201);
  return (await json<{ id: string }>(r)).id;
}
const ciclo = async (rid: string) => (await json<{ etapas: Etapa[] }>(await chamar(consultor, 'GET', `${base(rid)}/ciclo`))).etapas;
const bases = async (rid: string) => json<Bases>(await chamar(consultor, 'GET', `${base(rid)}/bases`));
const putCiclo = (rid: string, etapas: object[], h = consultor) => chamar(h, 'PUT', `${base(rid)}/ciclo`, { etapas });
const putBases = (rid: string, corpo: object, h = consultor) => chamar(h, 'PUT', `${base(rid)}/bases`, corpo);

beforeAll(async () => {
  await applySchema();
  await semearCatalogo(env.DB);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?1, 'Cliente', 'LGPD', 'Controller', 'Active', 'org_ness'), (?2, 'Outro', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', ?1, 'org_ness'),
      ('u-iso', 'iso@cliente.com', 'x', 'Iso', 'org_user', ?1, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-cb', ?1, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'), ('g-cb2', ?2, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-cb', 'u-cons', ?, datetime('now','+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('cb-alheio', ?, 'Do outro')`).bind(OUTRO),
    env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('cb-erp', ?1, 'ERP Exemplo', 'sistema'), ('cb-arq', ?1, 'Arquivo de pastas', 'base'), ('cb-alheio-i', ?2, 'Alheio', 'sistema')`).bind(P, OUTRO),
  ]);
  await habilitarPrivacy(P, OUTRO);
  await concederModulos('u-cli', ['privacy']);
  await env.DB.prepare(`DELETE FROM usuario_modulos WHERE user_id = 'u-iso'`).run();
  await concederModulos('u-iso', ['iso']);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user', client_project_id: P });
  soIso = await sessionFor({ id: 'u-iso', email: 'iso@cliente.com', role: 'org_user', client_project_id: P });
}, 60_000);

describe('ciclo de vida da atividade', () => {
  it('lê as seis etapas na ordem, grava as que vieram e mantém o que não veio', async () => {
    const rid = await novo();
    expect((await ciclo(rid)).map((e) => [e.etapa, e.situacao])).toEqual([
      ['coleta', null], ['uso', null], ['compartilhamento_interno', null], ['compartilhamento_externo', null], ['armazenamento', null], ['eliminacao', null],
    ]);
    const r = await putCiclo(rid, [
      { etapa: 'coleta', situacao: 'registrada', item_id: 'cb-erp', descricao: 'Formulário de admissão' },
      { etapa: 'compartilhamento_externo', situacao: 'nao_aplicavel' },
    ]);
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await ciclo(rid)).find((e) => e.etapa === 'coleta')).toMatchObject({ situacao: 'registrada', item_id: 'cb-erp', item_nome: 'ERP Exemplo', descricao: 'Formulário de admissão' });
    // só a situação: item e descrição ficam
    await putCiclo(rid, [{ etapa: 'coleta', situacao: 'registrada' }]);
    expect((await ciclo(rid)).find((e) => e.etapa === 'coleta')).toMatchObject({ item_id: 'cb-erp', descricao: 'Formulário de admissão' });
    // passar a "não se aplica" solta o item
    await putCiclo(rid, [{ etapa: 'coleta', situacao: 'nao_aplicavel' }]);
    expect((await ciclo(rid)).find((e) => e.etapa === 'coleta')).toMatchObject({ situacao: 'nao_aplicavel', item_id: null });
    const t = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'ropa.ciclo' AND project_id = ? ORDER BY rowid DESC LIMIT 1`).bind(P).first<{ details: string }>();
    expect(t!.details).toContain('coleta nao_aplicavel');
    expect((await env.DB.prepare(`SELECT group_concat(details) AS d FROM audit_logs WHERE action = 'ropa.ciclo'`).first<{ d: string }>())!.d).not.toContain('Formulário');
  });

  it('recusa etapa inválida, repetida, item de outro projeto e item em etapa que não se aplica; atividade alheia é 404', async () => {
    const rid = await novo();
    expect((await putCiclo(rid, [{ etapa: 'venda', situacao: 'registrada' }])).status).toBe(400);
    expect((await putCiclo(rid, [{ etapa: 'uso', situacao: 'registrada' }, { etapa: 'uso', situacao: 'nao_aplicavel' }])).status).toBe(400);
    const alheio = await putCiclo(rid, [{ etapa: 'uso', situacao: 'registrada', item_id: 'cb-alheio-i' }]);
    expect(alheio.status).toBe(400);
    expect((await json<{ invalidos: string[] }>(alheio)).invalidos).toEqual(['cb-alheio-i']);
    expect((await putCiclo(rid, [{ etapa: 'uso', situacao: 'nao_aplicavel', item_id: 'cb-erp' }])).status).toBe(400);
    expect((await putCiclo('cb-alheio', [{ etapa: 'uso', situacao: 'registrada' }])).status).toBe(404);
    expect((await chamar(consultor, 'GET', `${base('cb-alheio')}/ciclo`)).status).toBe(404);
    expect((await ciclo(rid)).every((e) => e.situacao === null)).toBe(true);
  });
});

describe('bases legais da atividade', () => {
  it('grava e troca as adicionais e o texto do GDPR; a principal não muda', async () => {
    const rid = await novo({ legal_basis: 'Execução de contrato ou procedimentos preliminares', base_legal_id: 'lgpd:art7:v' });
    expect(await bases(rid)).toMatchObject({ principal: { id: 'lgpd:art7:v' }, adicionais: [], base_gdpr: null });
    const r = await putBases(rid, { adicionais: [{ requisito_id: 'lgpd:art7:ii', observacao: 'Dados fiscais' }, { requisito_id: 'lgpd:art11:ii-a' }], base_gdpr: 'Art. 6(1)(b), execução de contrato' });
    expect(r.status, await r.clone().text()).toBe(200);
    const b = await bases(rid);
    expect(b.adicionais.map((a) => [a.requisito_id, a.referencia, a.observacao])).toEqual([['lgpd:art11:ii-a', 'art. 11, II, a', null], ['lgpd:art7:ii', 'art. 7, II', 'Dados fiscais']]);
    expect(b.base_gdpr).toBe('Art. 6(1)(b), execução de contrato');
    expect(b.principal!.id).toBe('lgpd:art7:v');
    // só o GDPR: as adicionais ficam
    await putBases(rid, { base_gdpr: null });
    expect(await bases(rid)).toMatchObject({ base_gdpr: null, adicionais: [{}, {}] });
    await putBases(rid, { adicionais: [] });
    expect((await bases(rid)).adicionais).toEqual([]);
  });

  it('recusa requisito que não é base, inexistente, repetido ou igual à principal; atividade alheia é 404', async () => {
    const rid = await novo({ legal_basis: 'Consentimento', base_legal_id: 'lgpd:art7:i' });
    const naoBase = await putBases(rid, { adicionais: [{ requisito_id: 'lgpd:art18:i' }, { requisito_id: 'nao:existe' }] });
    expect(naoBase.status).toBe(400);
    expect((await json<{ invalidos: string[] }>(naoBase)).invalidos).toEqual(['lgpd:art18:i', 'nao:existe']);
    expect((await putBases(rid, { adicionais: [{ requisito_id: 'lgpd:art7:i' }] })).status).toBe(400);
    expect((await putBases(rid, { adicionais: [{ requisito_id: 'lgpd:art7:ii' }, { requisito_id: 'lgpd:art7:ii' }] })).status).toBe(400);
    expect((await putBases(rid, { base_gdpr: 'x'.repeat(301) })).status).toBe(400);
    expect((await putBases('cb-alheio', { base_gdpr: 'Art. 6' })).status).toBe(404);
    expect((await bases(rid)).adicionais).toEqual([]);
  });
});

describe('papéis, faixa e agente', () => {
  it('o cliente lê e não grava; quem não tem o n.privacy leva 403; o agente grava ciclo e bases', async () => {
    const rid = await novo();
    expect((await chamar(cliente, 'GET', `${base(rid)}/ciclo`)).status).toBe(200);
    expect((await chamar(cliente, 'GET', `${base(rid)}/bases`)).status).toBe(200);
    expect((await putCiclo(rid, [{ etapa: 'uso', situacao: 'registrada' }], cliente)).status).toBe(403);
    expect((await putBases(rid, { base_gdpr: 'Art. 6' }, cliente)).status).toBe(403);
    expect((await chamar(soIso, 'GET', `${base(rid)}/ciclo`)).status).toBe(403);
    expect((await chamar(soIso, 'GET', `${base(rid)}/bases`)).status).toBe(403);
    const ag = (metodo: string, caminho: string, corpo?: unknown) => chamar({}, metodo, caminho, corpo, { AGENTE });
    expect((await ag('PUT', `${base(rid)}/ciclo`, { etapas: [{ etapa: 'armazenamento', situacao: 'registrada', item_id: 'cb-arq' }] })).status).toBe(200);
    expect((await ag('PUT', `${base(rid)}/bases`, { adicionais: [{ requisito_id: 'lgpd:art7:ii' }] })).status).toBe(200);
  });
});

describe('quem lê as bases e o ciclo', () => {
  it('LIA exigida também por base adicional de legítimo interesse ou pelo texto do GDPR', async () => {
    const rid = await novo({ legal_basis: 'Execução de contrato ou procedimentos preliminares', base_legal_id: 'lgpd:art7:v' });
    const lia = async () => (await json<{ lia: { exigida: boolean } }>(await chamar(consultor, 'GET', `${base(rid)}/ligacoes`))).lia.exigida;
    expect(await lia()).toBe(false);
    await putBases(rid, { adicionais: [{ requisito_id: 'lgpd:art7:ix' }] });
    expect(await lia()).toBe(true);
    await putBases(rid, { adicionais: [], base_gdpr: 'Art. 6(1)(f), legítimo interesse' });
    expect(await lia()).toBe(true);
  });

  it('painel do encarregado: base adicional ou do GDPR tira o tratamento de "sem base"; adicional de legítimo interesse pede LIA', async () => {
    const antes = (await visaoDoEncarregado(env.DB, P)).tratamentos;
    const so = await novo();
    const comAdicional = await novo();
    const comGdpr = await novo();
    await putBases(comAdicional, { adicionais: [{ requisito_id: 'lgpd:art7:ix' }] });
    await putBases(comGdpr, { base_gdpr: 'Art. 6(1)(a), consentimento' });
    const depois = (await visaoDoEncarregado(env.DB, P)).tratamentos;
    expect(depois.sem_base_legal - antes.sem_base_legal).toBe(1); // só `so`
    expect(depois.lia_pendente - antes.lia_pendente).toBe(1); // só `comAdicional`
    expect(so).toBeTruthy();
  });

  it('a DPIA criada do tratamento herda o ciclo e as bases adicionais', async () => {
    const rid = await novo({ legal_basis: 'Consentimento', base_legal_id: 'lgpd:art7:i', retention_period: '5 anos' });
    await putCiclo(rid, [
      { etapa: 'coleta', situacao: 'registrada', item_id: 'cb-erp', descricao: 'Portal do cliente' },
      { etapa: 'compartilhamento_externo', situacao: 'nao_aplicavel' },
    ]);
    await putBases(rid, { adicionais: [{ requisito_id: 'lgpd:art7:ii' }], base_gdpr: 'Art. 6(1)(a)' });
    const r = await chamar(consultor, 'POST', `${base(rid)}/dpia`);
    expect(r.status, await r.clone().text()).toBe(201);
    const d = await env.DB.prepare('SELECT data_flow_description, necessity_proportionality FROM dpia_assessments WHERE ropa_id = ?').bind(rid).first<{ data_flow_description: string; necessity_proportionality: string }>();
    expect(d!.data_flow_description).toContain('Ciclo de vida: Coleta: ERP Exemplo - Portal do cliente; Compartilhamento externo: não se aplica');
    expect(d!.necessity_proportionality).toContain('Bases adicionais: art. 7, II - Cumprimento de obrigação legal ou regulatória.');
    expect(d!.necessity_proportionality).toContain('GDPR: Art. 6(1)(a).');
    expect(d!.necessity_proportionality).toContain('Retenção: 5 anos.');
  });

  it('selo "mudou na origem": DPIA e LIA avisam quando o tratamento mudou depois que nasceram, sem invalidar nada', async () => {
    const rid = await novo({ processing_purpose: 'Com selo', legal_basis: 'Legítimo interesse', base_legal_id: 'lgpd:art7:ix' });
    await chamar(consultor, 'POST', `${base(rid)}/dpia`);
    await chamar(consultor, 'PUT', `${base(rid)}/lia`, { finalidade_legitima: 'Prevenir fraude' });
    type Lig = { lia: { origem_mudou: boolean }; dpias: { origem_mudou: boolean }[] };
    const lig = async () => json<Lig>(await chamar(consultor, 'GET', `${base(rid)}/ligacoes`));
    const lista = async () => (await json<{ assessments: { ropa_id: string; origem_mudou: boolean }[] }>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/dpia`))).assessments.find((a) => a.ropa_id === rid)!;
    expect(await lig()).toMatchObject({ lia: { origem_mudou: false }, dpias: [{ origem_mudou: false }] });
    expect((await lista()).origem_mudou).toBe(false);
    // ciclo e bases não estão no hash: não mudam a origem
    await putCiclo(rid, [{ etapa: 'uso', situacao: 'registrada' }]);
    await putBases(rid, { base_gdpr: 'Art. 6(1)(f)' });
    expect((await lig()).dpias[0].origem_mudou).toBe(false);
    expect((await chamar(consultor, 'PUT', `/api/v1/ropa/${rid}`, { processing_purpose: 'Com selo', retention_period: '2 anos' })).status).toBe(200);
    expect(await lig()).toMatchObject({ lia: { origem_mudou: true }, dpias: [{ origem_mudou: true }] });
    expect((await lista()).origem_mudou).toBe(true);
  });

  it('o relatório do RoPA mostra as bases adicionais, o GDPR e o ciclo', async () => {
    const rid = await novo({ processing_purpose: 'Relatório com ciclo' });
    await putCiclo(rid, [{ etapa: 'armazenamento', situacao: 'registrada', item_id: 'cb-arq', descricao: 'Pasta <b>física</b>' }]);
    await putBases(rid, { adicionais: [{ requisito_id: 'lgpd:art7:ii' }], base_gdpr: 'Art. 6(1)(c)' });
    const html = await (await chamar(consultor, 'GET', `/api/v1/projects/${P}/ropa/report`)).text();
    const card = html.slice(html.indexOf('Relatório com ciclo'));
    expect(card).toContain('Armazenamento: Arquivo de pastas - Pasta &lt;b&gt;física&lt;/b&gt;');
    expect(card).toContain('art. 7, II - Cumprimento de obrigação legal ou regulatória');
    expect(card).toContain('Art. 6(1)(c)');
  });

  it('a portabilidade leva o ciclo e as bases do projeto, e nada do vizinho', async () => {
    const rid = await novo();
    await putCiclo(rid, [{ etapa: 'eliminacao', situacao: 'registrada', descricao: 'Exclusão do sistema' }]);
    await putBases(rid, { adicionais: [{ requisito_id: 'lgpd:art7:ii' }] });
    const { dados } = await exportarProjeto(env as any, P);
    expect((dados.tratamento_ciclo as any[]).some((l) => l.ropa_id === rid && l.etapa === 'eliminacao')).toBe(true);
    expect((dados.tratamento_bases as any[]).some((l) => l.ropa_id === rid)).toBe(true);
    expect([...(dados.tratamento_ciclo as any[]), ...(dados.tratamento_bases as any[])].every((l) => l.project_id === P)).toBe(true);
  });
});
