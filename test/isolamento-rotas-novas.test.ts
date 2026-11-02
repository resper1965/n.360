import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, sessionFor, habilitarPrivacy, concederModulos } from './helpers/d1';
import { chamar, json } from './helpers/ropa-abas';
import { semearCatalogo } from '../src/services/requisitos';

/**
 * Isolamento entre projetos (e organizações) nas rotas novas do n.360: mescla de partes e itens, requisitos de documento em
 * arquivo, documentos de terceiro, ativos da Eliminação e atividades de um controle. Dois projetos de organizações diferentes
 * (A em `org_ness`, B em `org_b`); quem é de A tenta operar com ids de B. A resposta tem de ser 400/403/404 e o banco de B
 * não pode mudar, nem o texto de B aparecer na resposta. Tudo fictício.
 */
const A = 'iso-rn-a';
const B = 'iso-rn-b';
const SEGREDO = 'ZZB-SEGREDO'; // todo texto de B carrega este marcador; não pode aparecer em resposta a quem é de A
const NEGADO = [400, 403, 404];

type H = Record<string, string>;
let consA: H; let cliA: H; let admA: H;
let req: string;
let ridA: string;

/** Fotografia de tudo o que é de B nas tabelas que as rotas tocam, mais as ligações em A que apontam para id de B. */
async function fotoDeB(): Promise<string> {
  const tabelas = ['partes', 'itens', 'documentos', 'documentos_arquivo', 'documento_partes', 'documentos_arquivo_partes',
    'documentos_arquivo_requisitos', 'ropa_records', 'tratamento_itens', 'tratamento_etapa_itens', 'tratamento_ciclo',
    'tratamento_medidas', 'compliance_controls', 'parte_vinculos'];
  const foto: Record<string, unknown> = {};
  for (const t of tabelas) {
    foto[t] = (await env.DB.prepare(`SELECT * FROM ${t} WHERE project_id = ? ORDER BY rowid`).bind(B).all()).results;
  }
  // Em A, nada pode apontar para id de B (todo id de B começa com `zzb-`).
  foto.refsEmA = (await env.DB.prepare(
    `SELECT 'tei' t, item_id x FROM tratamento_etapa_itens WHERE project_id = ?1 AND item_id LIKE 'zzb-%'
     UNION ALL SELECT 'ti', item_id FROM tratamento_itens WHERE project_id = ?1 AND item_id LIKE 'zzb-%'
     UNION ALL SELECT 'dp', documento_id FROM documento_partes WHERE project_id = ?1 AND (documento_id LIKE 'zzb-%' OR parte_id LIKE 'zzb-%')
     UNION ALL SELECT 'dap', documento_arquivo_id FROM documentos_arquivo_partes WHERE project_id = ?1 AND (documento_arquivo_id LIKE 'zzb-%' OR parte_id LIKE 'zzb-%')
     UNION ALL SELECT 'dar', documento_arquivo_id FROM documentos_arquivo_requisitos WHERE project_id = ?1 AND documento_arquivo_id LIKE 'zzb-%'`
  ).bind(A).all()).results;
  return JSON.stringify(foto);
}

/** A tentativa: status de recusa, B intacto e nada de B na resposta. */
async function tentar(h: H, metodo: string, caminho: string, corpo?: unknown): Promise<{ status: number; corpo: string }> {
  const antes = await fotoDeB();
  const r = await chamar(h, metodo, caminho, corpo);
  const texto = await r.text();
  expect(NEGADO, `${metodo} ${caminho} -> ${r.status} ${texto}`).toContain(r.status);
  expect(texto).not.toContain(SEGREDO);
  expect(await fotoDeB()).toBe(antes);
  return { status: r.status, corpo: texto };
}

beforeAll(async () => {
  await applySchema();
  await semearCatalogo(env.DB);
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO organizations (id, name, slug) VALUES ('org_b', 'Consultoria B exemplo', 'consultoria-b-exemplo')`),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES
      (?1, 'Cliente A exemplo', 'LGPD', 'Controller', 'Active', 'org_ness'), (?2, 'Cliente B exemplo', 'LGPD', 'Controller', 'Active', 'org_b')`).bind(A, B),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('rn-cons-a', 'cons-a@ness.lat', 'x', 'Consultor A', 'consultor', NULL, 'org_ness'),
      ('rn-cli-a', 'cli-a@cliente.exemplo', 'x', 'Cliente A', 'org_user', ?1, 'org_ness'),
      ('rn-adm-a', 'adm-a@cliente.exemplo', 'x', 'Admin A', 'org_admin', ?1, 'org_ness'),
      ('rn-cons-b', 'cons-b@b.lat', 'x', 'Consultor B', 'consultor', NULL, 'org_b')`).bind(A),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('rn-g1', ?1, 'Consultor A', 'cons-a@ness.lat', 'consultor', 'Consultor'), ('rn-g2', ?2, 'Consultor B', 'cons-b@b.lat', 'consultor', 'Consultor')`).bind(A, B),
  ]);
  await habilitarPrivacy(A, B);
  await concederModulos(['rn-cli-a', 'rn-adm-a'], ['iso', 'privacy']);
  consA = await sessionFor({ id: 'rn-cons-a', email: 'cons-a@ness.lat', role: 'consultor' });
  cliA = await sessionFor({ id: 'rn-cli-a', email: 'cli-a@cliente.exemplo', role: 'org_user', client_project_id: A });
  admA = await sessionFor({ id: 'rn-adm-a', email: 'adm-a@cliente.exemplo', role: 'org_admin', client_project_id: A });

  req = (await env.DB.prepare('SELECT id FROM requisitos ORDER BY rowid LIMIT 1').first<{ id: string }>())!.id;

  // Projeto A: partes, itens, documentos (versionado e em arquivo).
  // Projeto B: o mesmo, mais as ligações que uma rota quebrada poderia mover, apagar ou devolver.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES
      ('rna-p1', ?1, 'organizacao', 'Parte A1'), ('rna-p2', ?1, 'organizacao', 'Parte A2'),
      ('zzb-p1', ?2, 'organizacao', 'Parte B1 ${SEGREDO}'), ('zzb-p2', ?2, 'organizacao', 'Parte B2 ${SEGREDO}')`).bind(A, B),
    env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES
      ('rna-i1', ?1, 'Sistema A1', 'sistema'), ('rna-i2', ?1, 'Sistema A2', 'sistema'),
      ('zzb-i1', ?2, 'Sistema B1 ${SEGREDO}', 'sistema'), ('zzb-i2', ?2, 'Sistema B2 ${SEGREDO}', 'sistema')`).bind(A, B),
    env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo) VALUES ('rna-doc', ?1, 'Política A'), ('zzb-doc', ?2, 'Política B ${SEGREDO}')`).bind(A, B),
    env.DB.prepare(`INSERT INTO documentos_arquivo (id, project_id, nome, tipo) VALUES
      ('rna-arq', ?1, 'Contrato A', 'contrato'), ('zzb-arq', ?2, 'Contrato B ${SEGREDO}', 'contrato')`).bind(A, B),
    env.DB.prepare(`INSERT INTO documentos_arquivo_partes (documento_arquivo_id, parte_id, papel, project_id) VALUES ('zzb-arq', 'zzb-p1', 'dpa', ?)`).bind(B),
    env.DB.prepare(`INSERT INTO documento_partes (documento_id, parte_id, papel, project_id) VALUES ('zzb-doc', 'zzb-p1', 'dpa', ?)`).bind(B),
    env.DB.prepare(`INSERT INTO documentos_arquivo_requisitos (documento_arquivo_id, requisito_id, project_id) VALUES ('zzb-arq', ?, ?)`).bind(req, B),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, nome) VALUES ('zzb-rid', ?, 'Atividade B ${SEGREDO}', 'Atividade B ${SEGREDO}')`).bind(B),
    env.DB.prepare(`INSERT INTO tratamento_itens (ropa_id, item_id, project_id) VALUES ('zzb-rid', 'zzb-i1', ?)`).bind(B),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('zzb-ctrl', ?, 'ISO 27001', 'Controle B ${SEGREDO}')`).bind(B),
    env.DB.prepare(`INSERT INTO tratamento_medidas (id, project_id, ropa_id, medida, status, controle_id) VALUES ('zzb-med', ?, 'zzb-rid', 'Medida B ${SEGREDO}', 'ativa', 'zzb-ctrl')`).bind(B),
  ]);

  // Atividade de A com a Coleta pronta pela API, para a Eliminação não parar no 409 "Conclua a Coleta antes".
  const r = await chamar(consA, 'POST', `/api/v1/projects/${A}/ropa`, { processing_purpose: 'Atividade A exemplo' });
  if (r.status !== 201) throw new Error(`atividade A: ${r.status} ${await r.text()}`);
  ridA = (await json<{ id: string }>(r)).id;
  const t1 = (await json(await chamar(consA, 'POST', `/api/v1/projects/${A}/catalogos/titulares`, { nome: 'Titular exemplo' }))).item.id;
  const d1 = (await json(await chamar(consA, 'POST', `/api/v1/projects/${A}/catalogos/dados`, { nome: 'Dado exemplo' }))).item.id;
  const et = `/api/v1/projects/${A}/ropa/${ridA}/etapas`;
  for (const [c, corpo] of [['/coleta', { descricao: 'Descrição exemplo' }], ['/coleta/titulares', { titulares: [{ titular_id: t1, dados_ids: [d1] }] }],
    ['/coleta/ativos', { ativos: [{ item_id: 'rna-i1' }] }]] as const) {
    const x = await chamar(consA, 'PUT', et + c, corpo);
    if (x.status !== 200) throw new Error(`coleta ${c}: ${x.status} ${await x.text()}`);
  }
});

describe('controle positivo (o setup alcança as rotas: a recusa abaixo é da guarda, não de setup quebrado)', () => {
  it('consultor de A mescla prévia de A, lê requisitos do próprio arquivo, liga e grava ativo da Eliminação de A', async () => {
    expect((await chamar(consA, 'POST', `/api/v1/projects/${A}/mesclar`, { tabela: 'partes', manter: 'rna-p1', remover: 'rna-p2' })).status).toBe(200);
    expect((await chamar(consA, 'GET', `/api/v1/projects/${A}/documentos-arquivo/rna-arq/requisitos`)).status).toBe(200);
    expect((await chamar(consA, 'PUT', `/api/v1/projects/${A}/ropa/${ridA}/etapas/eliminacao/ativos`, { ativos: [{ item_id: 'rna-i2' }] })).status).toBe(200);
  });
});

describe('1. mescla de partes e itens', () => {
  const m = (p: string) => `/api/v1/projects/${p}/mesclar`;
  for (const tabela of ['partes', 'itens'] as const) {
    const [a1, b1, b2] = tabela === 'partes' ? ['rna-p1', 'zzb-p1', 'zzb-p2'] : ['rna-i1', 'zzb-i1', 'zzb-i2'];
    for (const confirmar of [undefined, true]) {
      const rot = confirmar ? 'execução' : 'prévia';
      it(`${tabela} (${rot}): dois cadastros de B pelo projeto A`, async () => {
        await tentar(consA, 'POST', m(A), { tabela, manter: b1, remover: b2, ...(confirmar ? { confirmar } : {}) });
      });
      it(`${tabela} (${rot}): A fica, B é removido`, async () => {
        await tentar(consA, 'POST', m(A), { tabela, manter: a1, remover: b1, ...(confirmar ? { confirmar } : {}) });
      });
      it(`${tabela} (${rot}): B fica, A é removido`, async () => {
        const antesA = await env.DB.prepare(`SELECT status FROM ${tabela} WHERE id = ?`).bind(a1).first();
        await tentar(consA, 'POST', m(A), { tabela, manter: b1, remover: a1, ...(confirmar ? { confirmar } : {}) });
        expect(await env.DB.prepare(`SELECT status FROM ${tabela} WHERE id = ?`).bind(a1).first()).toEqual(antesA);
      });
      it(`${tabela} (${rot}): pela URL do projeto B`, async () => {
        await tentar(consA, 'POST', m(B), { tabela, manter: b1, remover: b2, ...(confirmar ? { confirmar } : {}) });
      });
    }
  }
});

describe('2. requisitos de documento em arquivo', () => {
  const u = (p: string, id: string) => `/api/v1/projects/${p}/documentos-arquivo/${id}/requisitos`;
  it('GET com id de B pelo projeto A', async () => { expect((await tentar(consA, 'GET', u(A, 'zzb-arq'))).status).toBe(404); });
  it('GET pela URL do projeto B', async () => { await tentar(consA, 'GET', u(B, 'zzb-arq')); });
  it('PUT com id de B pelo projeto A (troca o conjunto: apagaria a ligação de B)', async () => {
    expect((await tentar(consA, 'PUT', u(A, 'zzb-arq'), { requisitos: [] })).status).toBe(404);
    await tentar(consA, 'PUT', u(A, 'zzb-arq'), { requisitos: [req] });
  });
  it('PUT pela URL do projeto B', async () => { await tentar(consA, 'PUT', u(B, 'zzb-arq'), { requisitos: [] }); });
  it('PUT com requisito inexistente no documento de A: 400 e nada gravado', async () => {
    const r = await tentar(consA, 'PUT', u(A, 'rna-arq'), { requisitos: ['requisito-que-nao-existe'] });
    expect(r.status).toBe(400);
    expect(await env.DB.prepare(`SELECT count(*) n FROM documentos_arquivo_requisitos WHERE documento_arquivo_id = 'rna-arq'`).first()).toEqual({ n: 0 });
  });
});

describe('3. documentos de terceiro', () => {
  const u = (p: string, parte: string) => `/api/v1/projects/${p}/terceiros/${parte}/documentos`;
  it('POST arquivo_id de B na parte de A', async () => { expect((await tentar(consA, 'POST', u(A, 'rna-p1'), { arquivo_id: 'zzb-arq', papel: 'dpa' })).status).toBe(400); });
  it('POST documento_id de B na parte de A', async () => { expect((await tentar(consA, 'POST', u(A, 'rna-p1'), { documento_id: 'zzb-doc', papel: 'dpa' })).status).toBe(400); });
  it('POST na parte de B pelo projeto A, com documento de A', async () => {
    await tentar(consA, 'POST', u(A, 'zzb-p1'), { arquivo_id: 'rna-arq', papel: 'dpa' });
    await tentar(consA, 'POST', u(A, 'zzb-p1'), { documento_id: 'rna-doc', papel: 'dpa' });
  });
  it('POST pela URL do projeto B', async () => { await tentar(consA, 'POST', u(B, 'zzb-p2'), { arquivo_id: 'zzb-arq', papel: 'dpa' }); });
  it('DELETE da ligação de B (origem=arquivo e versionado) pelo projeto A', async () => {
    await tentar(consA, 'DELETE', `${u(A, 'zzb-p1')}/zzb-arq?papel=dpa&origem=arquivo`);
    await tentar(consA, 'DELETE', `${u(A, 'rna-p1')}/zzb-arq?papel=dpa&origem=arquivo`);
    await tentar(consA, 'DELETE', `${u(A, 'zzb-p1')}/zzb-doc?papel=dpa`);
  });
  it('DELETE pela URL do projeto B', async () => { await tentar(consA, 'DELETE', `${u(B, 'zzb-p1')}/zzb-arq?papel=dpa&origem=arquivo`); });
});

describe('4. ativos da Eliminação', () => {
  it('item de B na atividade de A: 400 com o id recusado', async () => {
    const r = await tentar(consA, 'PUT', `/api/v1/projects/${A}/ropa/${ridA}/etapas/eliminacao/ativos`, { ativos: [{ item_id: 'zzb-i1' }] });
    expect(r.status).toBe(400);
    expect(JSON.parse(r.corpo).invalidos).toEqual(['zzb-i1']);
  });
  it('atividade de B pelo projeto A (com item de A e com item de B)', async () => {
    await tentar(consA, 'PUT', `/api/v1/projects/${A}/ropa/zzb-rid/etapas/eliminacao/ativos`, { ativos: [{ item_id: 'rna-i1' }] });
    await tentar(consA, 'PUT', `/api/v1/projects/${A}/ropa/zzb-rid/etapas/eliminacao/ativos`, { ativos: [] });
    await tentar(consA, 'PUT', `/api/v1/projects/${A}/ropa/zzb-rid/etapas/eliminacao/ativos`, { ativos: [{ item_id: 'zzb-i2' }] });
  });
  it('pela URL do projeto B', async () => {
    await tentar(consA, 'PUT', `/api/v1/projects/${B}/ropa/zzb-rid/etapas/eliminacao/ativos`, { ativos: [{ item_id: 'zzb-i2' }] });
  });
});

describe('5. atividades de um controle', () => {
  it('controle de B, pelo consultor e pelo cliente de A', async () => {
    expect((await tentar(consA, 'GET', '/api/v1/controls/zzb-ctrl/atividades')).status).toBe(403);
    expect((await tentar(cliA, 'GET', '/api/v1/controls/zzb-ctrl/atividades')).status).toBe(403);
  });
  it('controle inexistente', async () => { await tentar(consA, 'GET', '/api/v1/controls/zzb-nao-existe/atividades'); });
});

describe('6. cliente não mescla (ato da equipe)', () => {
  for (const [papel, h] of [['org_user', () => cliA], ['org_admin', () => admA]] as const) {
    it(`${papel} de A mesclando cadastros do próprio projeto: 403 e nada muda`, async () => {
      const antes = (await env.DB.prepare(`SELECT id, status FROM partes WHERE project_id = ? UNION ALL SELECT id, status FROM itens WHERE project_id = ? ORDER BY id`).bind(A, A).all()).results;
      for (const corpo of [{ tabela: 'partes', manter: 'rna-p1', remover: 'rna-p2', confirmar: true }, { tabela: 'itens', manter: 'rna-i1', remover: 'rna-i2', confirmar: true },
        { tabela: 'partes', manter: 'rna-p1', remover: 'rna-p2' }]) {
        const r = await chamar(h(), 'POST', `/api/v1/projects/${A}/mesclar`, corpo);
        expect(r.status, await r.text()).toBe(403);
      }
      expect((await env.DB.prepare(`SELECT id, status FROM partes WHERE project_id = ? UNION ALL SELECT id, status FROM itens WHERE project_id = ? ORDER BY id`).bind(A, A).all()).results).toEqual(antes);
      await tentar(h(), 'POST', `/api/v1/projects/${A}/mesclar`, { tabela: 'partes', manter: 'zzb-p1', remover: 'zzb-p2', confirmar: true });
    });
  }
});
