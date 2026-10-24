import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

const P = 'p-pgen';
let h: Record<string, string>;
const respostas: unknown[] = [];
let aoRodar: (() => Promise<void>) | null = null;
const AI = { run: async () => { if (aoRodar) { const f = aoRodar; aoRodar = null; await f(); } return respostas.shift() ?? { choices: [{ message: { content: 'Texto da seção.' }, finish_reason: 'stop' }] }; } };
const chamar = (metodo: string, caminho: string, corpo?: unknown, hdr = h, projeto = P) =>
  app.fetch(new Request(`http://localhost/api/v1/projects/${projeto}${caminho}`, { method: metodo, headers: { ...hdr, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }), { ...workerEnv(), AI } as never);

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente Gen', 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT OR IGNORE INTO projeto_modulos (project_id, modulo) VALUES (?, 'iso')`).bind(P),
    env.DB.prepare(`INSERT OR IGNORE INTO requisito_fontes (id, nome, versao) VALUES ('iso27001:2022', 'ISO/IEC 27001', '2022')`),
    env.DB.prepare(`INSERT OR IGNORE INTO requisitos (id, fonte_id, referencia, titulo) VALUES ('iso27001:2022:A.8.24', 'iso27001:2022', 'A.8.24', 'Criptografia'), ('iso27001:2022:A.5.15', 'iso27001:2022', 'A.5.15', 'Controle de acesso')`),
  ]);
  h = await sessionFor({ id: 'pg-c', email: 'pg@ness.lat', role: 'platform_admin', org_id: 'org_ness' });
});

describe('política temática: criar e gerar', () => {
  it('lista os temas com documento_id', async () => {
    const r = await (await chamar('GET', '/politicas/temas')).json<{ temas: { codigo: string; documento_id: string | null }[] }>();
    expect(r.temas.length).toBeGreaterThan(0);
    expect(r.temas.every((t) => 'documento_id' in t)).toBe(true);
  });

  it('cria pelo tema, liga os requisitos e devolve 409 na segunda vez', async () => {
    const r = await chamar('POST', '/politicas', { tema: 'POL-CRY' });
    expect(r.status).toBe(201);
    const { id } = await r.json<{ id: string }>();
    const reqs = (await env.DB.prepare('SELECT requisito_id FROM documento_requisitos WHERE documento_id = ?').bind(id).all()).results;
    expect(reqs.map((x: any) => x.requisito_id)).toEqual(['iso27001:2022:A.8.24']);
    const doc = await env.DB.prepare(`SELECT tipo, titulo, status FROM documentos WHERE id = ?`).bind(id).first();
    expect(doc).toMatchObject({ tipo: 'politica', status: 'rascunho' });
    const dup = await chamar('POST', '/politicas', { tema: 'POL-CRY' });
    expect(dup.status).toBe(409);
    expect((await dup.json<any>()).id).toBe(id);
  });

  it('tema desconhecido e requisito inexistente dão 400', async () => {
    expect((await chamar('POST', '/politicas', { tema: 'POL-NAO' })).status).toBe(400);
    const antes = (await env.DB.prepare(`SELECT count(*) n FROM documentos WHERE project_id = ?`).bind(P).first<{ n: number }>())!.n;
    const r = await chamar('POST', '/politicas', { titulo: 'POL-W Livre', requisitos: ['nao:existe'] });
    expect(r.status).toBe(400);
    expect((await r.json<any>()).desconhecidos).toEqual(['nao:existe']);
    expect((await env.DB.prepare(`SELECT count(*) n FROM documentos WHERE project_id = ?`).bind(P).first<{ n: number }>())!.n).toBe(antes);
  });

  it('gera uma seção e grava só nela, em rascunho', async () => {
    const { id } = await (await chamar('POST', '/politicas', { titulo: 'POL-X Tema livre', requisitos: ['iso27001:2022:A.5.15'] })).json<{ id: string }>();
    const r = await chamar('POST', `/documentos/${id}/secoes/1/gerar`);
    expect(r.status).toBe(200);
    const texto = (await env.DB.prepare(`SELECT texto FROM documento_versoes WHERE documento_id = ? AND estado = 'rascunho'`).bind(id).first<{ texto: string }>())!.texto;
    expect(texto).toContain('## 1. Objetivo\n\nTexto da seção.');
    expect(texto).toContain('## 2. Escopo\n\n> Seção a gerar.');
    expect(await env.DB.prepare(`SELECT 1 FROM documento_versoes WHERE documento_id = ? AND estado = 'vigente'`).bind(id).first()).toBeNull();
    expect((await chamar('POST', `/documentos/${id}/secoes/99/gerar`)).status).toBe(404);
  });

  it('cortada duas vezes grava com o aviso de incompleta', async () => {
    const { id } = await (await chamar('POST', '/politicas', { titulo: 'POL-Y Outro', requisitos: [] })).json<{ id: string }>();
    respostas.push({ choices: [{ message: { content: 'Começo' }, finish_reason: 'length' }] }, { choices: [{ message: { content: ' e mais' }, finish_reason: 'length' }] });
    const r = await (await chamar('POST', `/documentos/${id}/secoes/1/gerar`)).json<any>();
    expect(r).toMatchObject({ cortada: true, secao: { situacao: 'incompleta' } });
  });

  it('resposta com marcador de modelo não grava (422)', async () => {
    const { id } = await (await chamar('POST', '/politicas', { titulo: 'POL-Z Mais um', requisitos: [] })).json<{ id: string }>();
    respostas.push({ choices: [{ message: { content: 'A [Organization Name] deve' }, finish_reason: 'stop' }] });
    expect((await chamar('POST', `/documentos/${id}/secoes/1/gerar`)).status).toBe(422);
    const t = (await env.DB.prepare(`SELECT texto FROM documento_versoes WHERE documento_id = ?`).bind(id).first<{ texto: string }>())!.texto;
    expect(t).not.toContain('Organization Name');
  });

  it('documento sem seções dá 409', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo) VALUES ('d-livre', ?, 'politica', 'Texto solto')`).bind(P),
      env.DB.prepare(`INSERT INTO documento_versoes (id, project_id, documento_id, numero, texto, hash, estado, origem, criado_por) VALUES ('v-livre', ?, 'd-livre', 1, 'sem seções', 'h', 'rascunho', 'humano', 'x')`).bind(P),
    ]);
    expect((await chamar('POST', '/documentos/d-livre/secoes/1/gerar')).status).toBe(409);
  });
});

describe('política temática: concorrência e guarda', () => {
  it('não perde a edição feita em outra seção durante a geração', async () => {
    const { id } = await (await chamar('POST', '/politicas', { titulo: 'POL-L Corrida', requisitos: [] })).json<{ id: string }>();
    aoRodar = async () => {
      const v = await env.DB.prepare(`SELECT id, texto FROM documento_versoes WHERE documento_id = ? AND estado = 'rascunho'`).bind(id).first<{ id: string; texto: string }>();
      await env.DB.prepare('UPDATE documento_versoes SET texto = ? WHERE id = ?').bind(v!.texto.replace('## 2. Escopo\n\n> Seção a gerar.', '## 2. Escopo\n\nEdição humana.'), v!.id).run();
    };
    expect((await chamar('POST', `/documentos/${id}/secoes/1/gerar`)).status).toBe(200);
    const t = (await env.DB.prepare(`SELECT texto FROM documento_versoes WHERE documento_id = ? AND estado = 'rascunho'`).bind(id).first<{ texto: string }>())!.texto;
    expect(t).toContain('Edição humana.');
    expect(t).toContain('## 1. Objetivo\n\nTexto da seção.');
  });

  it('norma dá 409; só versão vigente gera um rascunho e preserva a vigente', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo) VALUES ('d-norma', ?, 'norma', 'NOR-1 X')`).bind(P),
      env.DB.prepare(`INSERT INTO documento_versoes (id, project_id, documento_id, numero, texto, hash, estado, origem, criado_por) VALUES ('v-norma', ?, 'd-norma', 1, '## 1. A\n\n> Seção a gerar.', 'h', 'rascunho', 'humano', 'x')`).bind(P),
      env.DB.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo, status) VALUES ('d-vig', ?, 'politica', 'POL-V Vigente', 'vigente')`).bind(P),
      env.DB.prepare(`INSERT INTO documento_versoes (id, project_id, documento_id, numero, texto, hash, estado, origem, criado_por) VALUES ('v-vig', ?, 'd-vig', 1, '## 1. A\n\nTexto antigo.', 'h', 'vigente', 'humano', 'x')`).bind(P),
    ]);
    expect((await chamar('POST', '/documentos/d-norma/secoes/1/gerar')).status).toBe(409);
    expect((await chamar('POST', '/documentos/d-vig/secoes/1/gerar')).status).toBe(200);
    const vig = await env.DB.prepare(`SELECT texto FROM documento_versoes WHERE documento_id = 'd-vig' AND estado = 'vigente'`).first<{ texto: string }>();
    const rasc = await env.DB.prepare(`SELECT texto FROM documento_versoes WHERE documento_id = 'd-vig' AND estado = 'rascunho'`).first<{ texto: string }>();
    expect(vig!.texto).toContain('Texto antigo.');
    expect(rasc!.texto).toContain('Texto da seção.');
  });
});

describe('política temática: papel e isolamento', () => {
  it('org_user recebe 403 ao criar', async () => {
    const u = await sessionFor({ id: 'pg-u', email: 'pg-u@cliente.lat', role: 'org_user', org_id: 'org_ness' });
    expect((await chamar('POST', '/politicas', { tema: 'POL-IAM' }, u)).status).toBe(403);
  });

  it('projeto de outra organização não é alcançado', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO organizations (id, name) VALUES ('org_outra', 'Outra')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-pgen-x', 'Alheio', 'ISO 27001', 'controller', 'Active', 'org_outra')`),
      env.DB.prepare(`INSERT OR IGNORE INTO projeto_modulos (project_id, modulo) VALUES ('p-pgen-x', 'iso')`),
    ]);
    const o = await sessionFor({ id: 'pg-o', email: 'pg-o@cliente.lat', role: 'client', org_id: 'org_ness' });
    expect([403, 404]).toContain((await chamar('POST', '/politicas', { tema: 'POL-IAM' }, o, 'p-pgen-x')).status);
  });
});
