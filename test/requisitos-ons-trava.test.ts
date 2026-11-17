import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { resetComCatalogo, sessionFor, workerEnv, habilitarPrivacy, habilitarOt, concederModulos } from './helpers/d1';
import { sha256Hex } from '../src/helpers';
import { criarDocumento } from '../src/services/documentos';
import { semearCatalogo } from '../src/services/requisitos';
import { fonteVisivel } from '../src/modulos';

/** P0-2 (onda 2, Task 6): a fonte ONS (n.ot) só é visível/usável pela PESSOA com o módulo `ot`. Invisível = inexistente (404/vazio/400 "desconhecidos"). */

const P = 'ons-p';
const ONS = 'ons-ro-cb-br-01';
const R1 = 'ons-ro-cb-br-01-rev00-4.1.1';
const AGENTE = { userId: 'u-ot', email: 'ot@ness.lat', projectId: P, concessaoId: 'c-ons' };
const JUST = 'O cliente não opera esta função de rede.';
const DECISAO = { 'X-Agente-Ferramenta': 'niso_excluir_requisito', 'X-Agente-Confirmado': '1', 'X-Agente-Motivo': encodeURIComponent('o consultor confirmou') };

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, extra: object = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  }), { ...workerEnv(), ...extra } as any);
const json = async <T = any>(r: Response) => (await r.json()) as T;

let ot: Record<string, string>, semOt: Record<string, string>, admin: Record<string, string>, chave: Record<string, string>;
let doc: string;
const base = `/api/v1/projects/${P}`;

beforeAll(async () => {
  await resetComCatalogo();
  await semearCatalogo(env.DB);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-adm', 'adm@ness.lat', 'x', 'Adm', 'platform_admin', NULL, 'org_ness'),
      ('u-ot', 'ot@ness.lat', 'x', 'Ot', 'consultor', NULL, 'org_ness'),
      ('u-priv', 'priv@ness.lat', 'x', 'Priv', 'consultor', NULL, 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-ot', ?1, 'Ot', 'ot@ness.lat', 'consultor', 'C'), ('g-pv', ?1, 'Priv', 'priv@ness.lat', 'consultor', 'C')`).bind(P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-ons', 'u-ot', ?, datetime('now','+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('k-ons', ?, ?, 'k', 'read', 'Active')`).bind(P, await sha256Hex('chave-ons')),
    env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES ('ev-ons', ?, 'a.pdf', 'k', 'h', 'u')`).bind(P),
    env.DB.prepare(`INSERT INTO documentos_arquivo (id, project_id, nome, tipo, status, r2_key, arquivo_nome, arquivo_tipo) VALUES ('da-ons', ?, 'DPA', 'contrato', 'publicado', 'k/x.pdf', 'x.pdf', 'pdf')`).bind(P),
  ]);
  await habilitarPrivacy(P);
  await habilitarOt(P);
  await concederModulos('u-ot', ['iso', 'privacy', 'ot']);
  await concederModulos('u-priv', ['iso', 'privacy']);
  ot = await sessionFor({ id: 'u-ot', email: 'ot@ness.lat', role: 'consultor' });
  semOt = await sessionFor({ id: 'u-priv', email: 'priv@ness.lat', role: 'consultor' });
  admin = await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'platform_admin' });
  chave = { 'X-API-Key': 'chave-ons' };
  const c = await criarDocumento(env.DB, P, 'ot@ness.lat', { tipo: 'politica', titulo: 'Política', texto: 'v1' });
  if (!c.ok) throw new Error('doc');
  doc = c.id;
});

// [rótulo, cabeçalhos, env extra]
const SEM_ACESSO: [string, Record<string, string>, object][] = [['pessoa só iso/privacy', {}, {}], ['agente (conta com ot)', {}, { AGENTE }], ['chave de API', {}, {}]];
const quem = (rot: string) => (rot.startsWith('pessoa') ? semOt : rot.startsWith('agente') ? {} : chave);

describe('fonteVisivel (unidade)', () => {
  it('só pessoa com ot vê a fonte do n.ot; as demais fontes são de todos', () => {
    expect(fonteVisivel(ONS, ['ot'], { id: 'u' })).toBe(true);
    expect(fonteVisivel(ONS, ['iso', 'privacy'], { id: 'u' })).toBe(false);
    expect(fonteVisivel(ONS, ['ot'], { id: 'u', agente: true })).toBe(false);
    expect(fonteVisivel(ONS, ['ot'], { id: 'apikey:k' })).toBe(false);
    expect(fonteVisivel(ONS, [], {})).toBe(false);
    expect(fonteVisivel('lgpd', [], { agente: true })).toBe(true);
  });
});

describe('rotas globais', () => {
  it('GET /requisitos?fonte=ONS: pessoa com ot e platform_admin veem 25; os demais []', async () => {
    for (const h of [ot, admin]) expect(await json(await chamar(h, 'GET', `/api/v1/requisitos?fonte=${ONS}`))).toHaveLength(25);
    for (const [rot, , extra] of SEM_ACESSO) {
      const r = await chamar(quem(rot), 'GET', `/api/v1/requisitos?fonte=${ONS}`, undefined, extra);
      expect(r.status, rot).toBe(200);
      expect(await json(r), rot).toEqual([]);
    }
  });

  it('GET /requisitos sem filtro e GET /fontes: a ONS só aparece para quem vê', async () => {
    for (const h of [ot, admin]) {
      expect((await json<any[]>(await chamar(h, 'GET', '/api/v1/requisitos/fontes'))).find((f) => f.id === ONS)?.requisitos).toBe(25);
      expect((await json<any[]>(await chamar(h, 'GET', '/api/v1/requisitos'))).filter((r) => r.fonte_id === ONS)).toHaveLength(25);
    }
    for (const [rot, , extra] of SEM_ACESSO) {
      const f = await json<any[]>(await chamar(quem(rot), 'GET', '/api/v1/requisitos/fontes', undefined, extra));
      expect(f.map((x) => x.id), rot).not.toContain(ONS);
      expect(f.map((x) => x.id), rot).toContain('lgpd');
      const l = await json<any[]>(await chamar(quem(rot), 'GET', '/api/v1/requisitos', undefined, extra));
      expect(l.some((r) => r.fonte_id === ONS), rot).toBe(false);
      expect(l.length, rot).toBeGreaterThan(100);
    }
  });

  it('GET /requisitos/:id: 200 para quem vê; 404 (não 403) para quem não vê', async () => {
    for (const h of [ot, admin]) expect((await chamar(h, 'GET', `/api/v1/requisitos/${R1}`)).status).toBe(200);
    for (const [rot, , extra] of SEM_ACESSO) expect((await chamar(quem(rot), 'GET', `/api/v1/requisitos/${R1}`, undefined, extra)).status, rot).toBe(404);
  });

  it('os mapeamentos de um requisito comum não vazam um requisito ONS', async () => {
    await env.DB.prepare(`INSERT INTO requisito_mapeamentos (de_id, para_id, tipo, estado, validado_por, validado_em) VALUES ('lgpd:art7', ?, 'relacionado', 'validado_juridico', 'x', '2026-11-01')`).bind(R1).run();
    const dosVeem = await json<any>(await chamar(ot, 'GET', '/api/v1/requisitos/lgpd:art7'));
    expect(dosVeem.mapeamentos.some((m: any) => m.para_id === R1)).toBe(true);
    const sem = await json<any>(await chamar(semOt, 'GET', '/api/v1/requisitos/lgpd:art7'));
    expect(sem.mapeamentos.some((m: any) => m.para_id === R1)).toBe(false);
    await env.DB.prepare(`DELETE FROM requisito_mapeamentos WHERE para_id = ?`).bind(R1).run();
  });
});

describe('rotas de projeto', () => {
  it('GET lacunas?fonte=ONS: pessoa com ot 200 (25 itens); os demais 200 vazio, igual a fonte inexistente', async () => {
    const r = await chamar(ot, 'GET', `${base}/requisitos/lacunas?fonte=${ONS}`);
    expect(r.status).toBe(200);
    expect((await json(r)).itens).toHaveLength(25);
    const inexistente = await json(await chamar(semOt, 'GET', `${base}/requisitos/lacunas?fonte=nao-existe`));
    for (const [rot, , extra] of SEM_ACESSO) {
      const x = await chamar(quem(rot), 'GET', `${base}/requisitos/lacunas?fonte=${ONS}`, undefined, extra);
      expect(x.status, rot).toBe(200);
      expect(await json(x), rot).toEqual({ ...inexistente, fonte: ONS });
    }
    expect((await chamar(semOt, 'GET', `${base}/requisitos/lacunas?fonte=lgpd`)).status).toBe(200);
  });

  it('PUT/DELETE exclusão de requisito ONS: pessoa com ot 200; pessoa sem ot e agente com decisão 404; chave 403 (leitura)', async () => {
    expect((await chamar(semOt, 'PUT', `${base}/requisitos/${R1}/exclusao`, { justificativa: JUST })).status).toBe(404);
    expect((await chamar({}, 'PUT', `${base}/requisitos/${R1}/exclusao`, { justificativa: JUST }, { AGENTE })).status).toBe(403); // sem decisão confirmada
    expect((await chamar(DECISAO, 'PUT', `${base}/requisitos/${R1}/exclusao`, { justificativa: JUST }, { AGENTE })).status).toBe(404); // P0-2
    expect((await chamar(DECISAO, 'DELETE', `${base}/requisitos/${R1}/exclusao`, undefined, { AGENTE })).status).toBe(404);
    expect((await chamar(chave, 'PUT', `${base}/requisitos/${R1}/exclusao`, { justificativa: JUST })).status).toBe(403);
    expect((await chamar(semOt, 'DELETE', `${base}/requisitos/${R1}/exclusao`)).status).toBe(404);
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM requisito_exclusoes WHERE requisito_id = ?`).bind(R1).first('n')).toBe(0);
    expect((await chamar(ot, 'PUT', `${base}/requisitos/${R1}/exclusao`, { justificativa: JUST })).status).toBe(200);
    expect((await chamar(semOt, 'DELETE', `${base}/requisitos/${R1}/exclusao`)).status).toBe(404);
    expect((await chamar(ot, 'DELETE', `${base}/requisitos/${R1}/exclusao`)).status).toBe(200);
    // requisito comum segue valendo para o agente com decisão
    expect((await chamar(DECISAO, 'PUT', `${base}/requisitos/lgpd:art8/exclusao`, { justificativa: JUST }, { AGENTE })).status).toBe(200);
    expect((await chamar(DECISAO, 'DELETE', `${base}/requisitos/lgpd:art8/exclusao`, undefined, { AGENTE })).status).toBe(200);
  });

  // 3o: status do agente no PUT (documento em arquivo é só da interface: 403 antes do handler)
  const ligacoes: [string, string, number][] = [['documento', `${base}/documentos/DOC/requisitos`, 400], ['documento em arquivo', `${base}/documentos-arquivo/da-ons/requisitos`, 403], ['evidência', `${base}/evidence/ev-ons/requisitos`, 400]];
  for (const [nome, caminho, stAgente] of ligacoes) {
    it(`PUT/GET requisitos de ${nome}: id ONS é "desconhecido" (400) sem ot; pessoa com ot liga; GET filtra`, async () => {
      const url = caminho.replace('DOC', doc);
      for (const [rot, , extra] of SEM_ACESSO.slice(0, 2)) {
        const r = await chamar(quem(rot), 'PUT', url, { requisitos: [R1] }, extra);
        expect(r.status, rot).toBe(rot.startsWith('agente') ? stAgente : 400);
        if (r.status === 400) expect((await json(r)).desconhecidos, rot).toEqual([R1]);
      }
      expect((await chamar(chave, 'PUT', url, { requisitos: [R1] })).status).toBe(403); // chave é leitura
      expect((await chamar(ot, 'PUT', url, { requisitos: [R1, 'lgpd:art7'] })).status).toBe(200);
      const ver = async (h: Record<string, string>, extra: object = {}) => {
        const b = await json(await chamar(h, 'GET', url, undefined, extra));
        return (Array.isArray(b) ? b : b.requisitos).map((x: any) => x.id).sort();
      };
      expect(await ver(ot)).toEqual(['lgpd:art7', R1].sort());
      expect(await ver(semOt)).toEqual(['lgpd:art7']);
      expect(await ver({}, { AGENTE })).toEqual(['lgpd:art7']);
      expect(await ver(chave)).toEqual(['lgpd:art7']);
    });
  }

  it('política: criar e promover com requisito ONS é recusado (400) sem ot', async () => {
    const r = await chamar(semOt, 'POST', `${base}/politicas`, { titulo: 'Nova política', requisitos: [R1] });
    expect(r.status).toBe(400);
    expect((await json(r)).desconhecidos).toEqual([R1]);
  });
});

describe('substituição do conjunto preserva ligações ONS de quem não as vê', () => {
  const alvos: [string, () => string][] = [['documento', () => `${base}/documentos/${doc}/requisitos`], ['documento em arquivo', () => `${base}/documentos-arquivo/da-ons/requisitos`], ['evidência', () => `${base}/evidence/ev-ons/requisitos`]];
  for (const [nome, url] of alvos) {
    it(`${nome}: pessoa sem ot grava [lgpd] e a ligação ONS fica`, async () => {
      expect((await chamar(ot, 'PUT', url(), { requisitos: [R1] })).status).toBe(200);
      expect((await chamar(semOt, 'PUT', url(), { requisitos: ['lgpd:art8'] })).status).toBe(200);
      const b = await json(await chamar(ot, 'GET', url()));
      expect((Array.isArray(b) ? b : b.requisitos).map((x: any) => x.id).sort()).toEqual(['lgpd:art8', R1].sort());
      const s = await json(await chamar(semOt, 'GET', url()));
      expect((Array.isArray(s) ? s : s.requisitos).map((x: any) => x.id)).toEqual(['lgpd:art8']);
    });
  }
});

describe('400 de requisito oculto é igual ao de requisito inexistente', () => {
  it('PUT com [oculto] e com [inexistente] (e misturados): mesmo status e mesmo formato, uma lista só', async () => {
    for (const url of [`${base}/documentos/${doc}/requisitos`, `${base}/documentos-arquivo/da-ons/requisitos`, `${base}/evidence/ev-ons/requisitos`]) {
      const a = await chamar(semOt, 'PUT', url, { requisitos: [R1] });
      const b = await chamar(semOt, 'PUT', url, { requisitos: ['nao-existe'] });
      expect(a.status).toBe(400);
      expect(b.status).toBe(400);
      expect(await json(a)).toEqual({ error: 'Requisito não encontrado', desconhecidos: [R1] });
      expect(await json(b)).toEqual({ error: 'Requisito não encontrado', desconhecidos: ['nao-existe'] });
      const m = await chamar(semOt, 'PUT', url, { requisitos: [R1, 'nao-existe'] });
      expect((await json(m)).desconhecidos).toEqual([R1, 'nao-existe']);
    }
  });
});

describe('políticas: incorporar e promover preservam ligações ONS ocultas', () => {
  const doc2 = (id: string, controle: string | null) => env.DB.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo, status, origem_control_id) VALUES (?, ?, 'politica', ?, 'vigente', ?)`).bind(id, P, id, controle);
  const lig = (d: string, r: string) => env.DB.prepare(`INSERT INTO documento_requisitos (documento_id, requisito_id, project_id) VALUES (?, ?, ?)`).bind(d, r, P);
  const ligados = async (d: string) => ((await env.DB.prepare(`SELECT requisito_id FROM documento_requisitos WHERE documento_id = ?`).bind(d).all<{ requisito_id: string }>()).results.map((x) => x.requisito_id)).sort();
  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, requisito_id) VALUES ('c-i1', ?1, 'ISO 27001', 'x', 'Missing', 'lgpd:art7'), ('c-i2', ?1, 'ISO 27001', 'y', 'Missing', 'lgpd:art7'), ('c-p1', ?1, 'ISO 27001', 'z', 'Missing', 'lgpd:art9')`).bind(P),
      doc2('d-o1', 'c-i1'), doc2('d-o2', 'c-i2'), doc2('d-t1', null), doc2('d-t2', null), doc2('d-pr', 'c-p1'),
      lig('d-t1', R1), lig('d-t1', 'lgpd:art8'), lig('d-t2', 'lgpd:art8'), lig('d-pr', R1), lig('d-pr', 'lgpd:art8'),
    ]);
  });

  it('incorporar: sem ot recebe a mesma resposta com e sem ligação oculta, e a ligação ONS fica', async () => {
    const com = await chamar(semOt, 'POST', `${base}/politicas/organizar/incorporar`, { origem: 'd-o1', destino: 'd-t1' });
    const sem = await chamar(semOt, 'POST', `${base}/politicas/organizar/incorporar`, { origem: 'd-o2', destino: 'd-t2' });
    expect(com.status).toBe(200);
    expect(sem.status).toBe(200);
    expect(await json(com)).toEqual(await json(sem));
    expect(await ligados('d-t1')).toEqual(['lgpd:art7', 'lgpd:art8', R1].sort());
    expect(await ligados('d-t2')).toEqual(['lgpd:art7', 'lgpd:art8']);
  });

  it('promover: sem ot troca só as ligações visíveis; a ONS fica', async () => {
    const r = await chamar(semOt, 'POST', `${base}/documentos/d-pr/promover`, { titulo: 'd-pr', requisitos: ['lgpd:art7'] });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await ligados('d-pr')).toEqual(['lgpd:art7', R1].sort());
  });
});

describe('ROPA', () => {
  it('base_legal_id de requisito ONS é recusada para todos (400), inclusive quem tem ot', async () => {
    for (const h of [ot, admin]) {
      const r = await chamar(h, 'POST', `${base}/ropa`, { processing_purpose: 'x', data_categories: 'x', data_subjects: 'x', legal_basis: 'x', retention_period: 'x', base_legal_id: R1 });
      expect(r.status).toBe(400);
      expect((await json(r)).error).toContain('base_legal_id');
    }
  });
});
