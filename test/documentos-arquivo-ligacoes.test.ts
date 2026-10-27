import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';
import { listarTerceiros, lerTerceiro, temDpa } from '../src/services/terceiros';
import { lacunasDaFonte } from '../src/services/requisitos';
import { SQL_VENDORS_VISIVEIS } from '../src/routes/vendors';
import { mesclar } from '../src/services/mesclar';

/** O documento em arquivo (0081) como DPA do fornecedor e como cobertura de requisito (0086). Tudo fictício. */
const P = 'p-dal';
const base = `/api/v1/projects/${P}`;
let plat: Record<string, string>;

const chamar = (metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...plat }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;
const comDpa = async (id: string) => (await listarTerceiros(env.DB, P)).find((t) => t.id === id)?.dpa;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente Ficticio', 'LGPD', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-dal-b', 'Outro Ficticio', 'LGPD', 'controller', 'Active', 'org_ness')`),
    env.DB.prepare(`INSERT OR IGNORE INTO projeto_modulos (project_id, modulo) VALUES (?, 'iso'), (?, 'privacy')`).bind(P, P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, terceiro_tipo) VALUES ('fo1', ?, 'organizacao', 'Fornecedora Um', 'medio')`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, terceiro_tipo) VALUES ('fo2', ?, 'organizacao', 'Fornecedora Um Dup', 'medio')`).bind(P),
    // da1: publicado e com arquivo; da2: rascunho; da3: publicado sem arquivo; db1: de outro projeto
    env.DB.prepare(`INSERT INTO documentos_arquivo (id, project_id, nome, tipo, status, r2_key, arquivo_nome, arquivo_tipo) VALUES ('da1', ?, 'DPA assinado', 'contrato', 'publicado', 'k/da1.pdf', 'dpa.pdf', 'pdf')`).bind(P),
    env.DB.prepare(`INSERT INTO documentos_arquivo (id, project_id, nome, tipo, status, r2_key, arquivo_nome, arquivo_tipo) VALUES ('da2', ?, 'DPA em rascunho', 'contrato', 'rascunho', 'k/da2.pdf', 'dpa2.pdf', 'pdf')`).bind(P),
    env.DB.prepare(`INSERT INTO documentos_arquivo (id, project_id, nome, tipo, status) VALUES ('da3', ?, 'DPA sem arquivo', 'contrato', 'publicado')`).bind(P),
    env.DB.prepare(`INSERT INTO documentos_arquivo (id, project_id, nome, tipo, status, r2_key, arquivo_nome, arquivo_tipo) VALUES ('db1', 'p-dal-b', 'DPA de outro', 'contrato', 'publicado', 'k/db1.pdf', 'db1.pdf', 'pdf')`),
    env.DB.prepare(`INSERT OR IGNORE INTO requisito_fontes (id, nome, versao) VALUES ('lgpd-dal', 'LGPD', '2018')`),
    env.DB.prepare(`INSERT OR IGNORE INTO requisitos (id, fonte_id, referencia, titulo) VALUES ('rq-dal-1', 'lgpd-dal', 'Art. 37', 'Registro das operações'), ('rq-dal-2', 'lgpd-dal', 'Art. 41', 'Encarregado')`),
  ]);
  plat = await sessionFor({ id: 'u-dal', email: 'dal@ness.lat', role: 'platform_admin', org_id: 'org_ness' });
}, 60_000);

describe('arquivo como DPA do fornecedor', () => {
  it('liga pela rota do terceiro; recusa os dois ids, nenhum, repetido e arquivo de outro projeto', async () => {
    const url = `${base}/terceiros/fo1/documentos`;
    expect((await chamar('POST', url, { arquivo_id: 'da1', papel: 'dpa' })).status).toBe(201);
    expect((await chamar('POST', url, { arquivo_id: 'da1', papel: 'dpa' })).status).toBe(409);
    expect((await chamar('POST', url, { arquivo_id: 'da1', documento_id: 'x' })).status).toBe(400);
    expect((await chamar('POST', url, { papel: 'dpa' })).status).toBe(400);
    const fora = await chamar('POST', url, { arquivo_id: 'db1' });
    expect(fora.status).toBe(400);
    expect(await json<{ error: string }>(fora)).toMatchObject({ error: expect.stringMatching(/outro projeto/) });
  });

  it('só conta como DPA o arquivo publicado e com arquivo anexado', async () => {
    expect(await comDpa('fo1')).toBe(true);
    expect(await temDpa(env.DB, 'fo1')).toBe(true);
    await chamar('POST', `${base}/terceiros/fo2/documentos`, { arquivo_id: 'da2', papel: 'dpa' }); // rascunho
    expect(await comDpa('fo2')).toBe(false);
    await chamar('POST', `${base}/terceiros/fo2/documentos`, { arquivo_id: 'da3', papel: 'dpa' }); // sem arquivo
    expect(await comDpa('fo2')).toBe(false);
    await chamar('POST', `${base}/terceiros/fo2/documentos`, { arquivo_id: 'da1', papel: 'contrato' }); // publicado, mas é contrato
    expect(await comDpa('fo2')).toBe(false);
    await env.DB.prepare(`UPDATE documentos_arquivo SET status = 'publicado' WHERE id = 'da2'`).run();
    expect(await comDpa('fo2')).toBe(true);
    await env.DB.prepare(`UPDATE documentos_arquivo SET status = 'obsoleto' WHERE id = 'da2'`).run();
    expect(await comDpa('fo2')).toBe(false);
  });

  it('a ficha lista o arquivo ligado com a origem; o export de fornecedores traz o DPA', async () => {
    const f = await lerTerceiro(env.DB, P, 'fo1');
    expect(f?.documentos_ligados).toEqual([{ id: 'da1', titulo: 'DPA assinado', status: 'publicado', papel: 'dpa', origem: 'arquivo' }]);
    expect(f?.documentos).toBe(1);
    const v = (await env.DB.prepare(SQL_VENDORS_VISIVEIS).bind(P).all<{ parte_id: string; dpa: number; dpa_documentos: string }>()).results.find((x) => x.parte_id === 'fo1')!;
    expect(v.dpa).toBe(1);
    expect(JSON.parse(v.dpa_documentos)).toEqual([{ id: 'da1', titulo: 'DPA assinado' }]);
  });

  it('desliga pela rota (origem=arquivo) e apagar o arquivo desfaz a ligação', async () => {
    expect((await chamar('DELETE', `${base}/terceiros/fo1/documentos/da1?papel=dpa`)).status).toBe(404); // sem origem=arquivo é o documento versionado
    expect((await chamar('DELETE', `${base}/terceiros/fo1/documentos/da1?papel=dpa&origem=arquivo`)).status).toBe(200);
    expect(await comDpa('fo1')).toBe(false);
    await chamar('POST', `${base}/terceiros/fo1/documentos`, { arquivo_id: 'da1', papel: 'dpa' });
    expect(await comDpa('fo1')).toBe(true);
    await env.DB.prepare(`INSERT INTO documentos_arquivo (id, project_id, nome, tipo, status) VALUES ('da9', ?, 'Provisório', 'outro', 'rascunho')`).bind(P).run();
    await chamar('POST', `${base}/terceiros/fo1/documentos`, { arquivo_id: 'da9', papel: 'outro' });
    expect((await chamar('DELETE', `${base}/documentos-arquivo/da9`)).status).toBe(200);
    expect(await env.DB.prepare(`SELECT 1 FROM documentos_arquivo_partes WHERE documento_arquivo_id = 'da9'`).first()).toBeNull();
  });

  it('a mescla de partes leva o arquivo ligado para o cadastro que fica', async () => {
    await env.DB.prepare(`DELETE FROM documentos_arquivo_partes WHERE parte_id = 'fo2'`).run();
    await env.DB.prepare(`INSERT INTO documentos_arquivo_partes (documento_arquivo_id, parte_id, papel, project_id) VALUES ('da1', 'fo2', 'dpa', ?)`).bind(P).run(); // colide com fo1
    await env.DB.prepare(`INSERT INTO documentos_arquivo_partes (documento_arquivo_id, parte_id, papel, project_id) VALUES ('da1', 'fo2', 'outro', ?)`).bind(P).run();
    const r = await mesclar(env.DB, 'partes', P, 'u', 'fo1', 'fo2');
    expect('ok' in r && r.efeitos.map((e) => e.rotulo)).toContain('Documento em arquivo ligado (DPA, contrato)');
    const ligs = (await env.DB.prepare(`SELECT parte_id, papel FROM documentos_arquivo_partes WHERE documento_arquivo_id = 'da1' ORDER BY papel`).all()).results;
    expect(ligs).toEqual([{ parte_id: 'fo1', papel: 'dpa' }, { parte_id: 'fo1', papel: 'outro' }]);
  });
});

describe('arquivo como cobertura de requisito', () => {
  const get = (id: string) => lacunasDaFonte(env.DB, P, 'lgpd-dal').then((l) => l.find((x) => x.requisito_id === id)!);

  it('PUT liga os requisitos; recusa desconhecido (400), arquivo de outro projeto (404) e corpo estranho (400)', async () => {
    const url = `${base}/documentos-arquivo/da1/requisitos`;
    expect((await chamar('PUT', url, { requisitos: ['rq-dal-1'] })).status).toBe(200);
    expect(await json(await chamar('GET', url))).toEqual([expect.objectContaining({ id: 'rq-dal-1', referencia: 'Art. 37' })]);
    const desc = await chamar('PUT', url, { requisitos: ['nao-existe'] });
    expect(desc.status).toBe(400);
    expect(await json(desc)).toMatchObject({ desconhecidos: ['nao-existe'] });
    expect((await chamar('PUT', `${base}/documentos-arquivo/db1/requisitos`, { requisitos: ['rq-dal-1'] })).status).toBe(404);
    expect((await chamar('PUT', url, { requisitos: ['rq-dal-1'], extra: 1 })).status).toBe(400);
  });

  it('arquivo publicado e com arquivo cobre o requisito; rascunho, obsoleto e sem arquivo não', async () => {
    const c = await get('rq-dal-1');
    expect(c.situacao).toBe('coberto');
    expect(c.origens).toEqual([{ tipo: 'documento', id: 'da1', titulo: 'DPA assinado', arquivo: true }]);
    await chamar('PUT', `${base}/documentos-arquivo/da2/requisitos`, { requisitos: ['rq-dal-2'] }); // da2 está obsoleto agora
    expect((await get('rq-dal-2')).situacao).toBe('lacuna');
    await chamar('PUT', `${base}/documentos-arquivo/da3/requisitos`, { requisitos: ['rq-dal-2'] }); // publicado, sem arquivo
    expect((await get('rq-dal-2')).situacao).toBe('lacuna');
    await env.DB.prepare(`UPDATE documentos_arquivo SET status = 'rascunho' WHERE id = 'da1'`).run();
    expect((await get('rq-dal-1')).situacao).toBe('lacuna');
  });

  it('trocar o conjunto substitui o anterior e deixa trilha', async () => {
    await env.DB.prepare(`UPDATE documentos_arquivo SET status = 'publicado' WHERE id = 'da1'`).run();
    await chamar('PUT', `${base}/documentos-arquivo/da1/requisitos`, { requisitos: ['rq-dal-2'] });
    expect((await get('rq-dal-1')).situacao).toBe('lacuna');
    expect((await get('rq-dal-2')).situacao).toBe('coberto');
    const trilha = await env.DB.prepare(`SELECT action FROM audit_logs WHERE project_id = ? AND action = 'documento_arquivo.requisitos'`).bind(P).first();
    expect(trilha).not.toBeNull();
  });
});
