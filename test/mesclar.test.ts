import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarPrivacy } from './helpers/d1';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;
const A = '/api/v1/projects/proj-a';
const B = '/api/v1/projects/proj-b';
let plat: Record<string, string>;
let cliente: Record<string, string>;

const n = async (sql: string, ...b: unknown[]) => (await env.DB.prepare(sql).bind(...b).first<{ n: number }>())!.n;
const mesclar = (base: string, corpo: object) => chamar(plat, 'POST', `${base}/mesclar`, corpo);

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  await habilitarPrivacy('proj-a', 'proj-b');
  plat = await sessionFor({ id: 'u-pa-mesc', email: 'pa-mesc@ness.lat', role: 'platform_admin' });
  cliente = await sessionFor({ id: 'u-cl-mesc', email: 'cl-mesc@x.lat', role: 'client', client_project_id: 'proj-a' });
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email, terceiro_tipo) VALUES ('k1', 'proj-a', 'organizacao', 'Nuvem Fictícia', NULL, NULL)`),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email, cnpj, terceiro_tipo) VALUES ('d1', 'proj-a', 'organizacao', 'Nuvem Ficticia Ltda', 'dpo@nuvem.example', '11222333000181', 'medio')`),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('pp1', 'proj-a', 'pessoa', 'Ana Exemplo')`),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('pp2', 'proj-a', 'pessoa', 'Ana Exemplo Dup')`),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('ob1', 'proj-b', 'organizacao', 'Org de B')`),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, owner_parte_id) VALUES ('ra1', 'proj-a', 'Atividade fictícia', 'd1')`),
    env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, owner_parte_id) VALUES ('rk1', 'proj-a', 'Servidor', 'Queda', 'd1')`),
    // vínculos: d1 e k1 operam a mesma atividade (colide), só d1 é suboperador de pp... e há um vínculo de pessoa sobre d1
    env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('v1', 'proj-a', 'k1', 'operador', 'tratamento', 'ra1')`),
    env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('v2', 'proj-a', 'd1', 'operador', 'tratamento', 'ra1')`),
    env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('v3', 'proj-a', 'pp1', 'responsavel', 'parte', 'd1')`),
    env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo, descricao) VALUES ('ik', 'proj-a', 'Sistema de folha', 'sistema', NULL)`),
    env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo, descricao) VALUES ('id', 'proj-a', 'Sistema de Folha ', 'sistema', 'Descrição do duplicado')`),
    env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('ib', 'proj-b', 'Item de B', 'sistema')`),
    env.DB.prepare(`INSERT INTO tratamento_itens (ropa_id, item_id, project_id) VALUES ('ra1', 'id', 'proj-a')`),
    env.DB.prepare(`UPDATE risks SET asset_id = 'id' WHERE id = 'rk1'`),
  ]);
});

describe('mesclar duplicata (D5)', () => {
  it('sem confirmar só mostra a prévia e não grava nada', async () => {
    const r = await mesclar(A, { tabela: 'partes', manter: 'k1', remover: 'd1' });
    expect(r.status).toBe(200);
    const p = await json<{ previa: boolean; efeitos: { rotulo: string; n: number }[]; tratamentos: number }>(r);
    expect(p.previa).toBe(true);
    expect(p.efeitos.map((e) => e.rotulo)).toEqual(expect.arrayContaining(['Responsável de risco', 'Responsável de atividade (RoPA)', 'Papéis (vínculos)']));
    expect(p.tratamentos).toBe(1);
    expect(await n(`SELECT count(*) AS n FROM risks WHERE owner_parte_id = 'd1'`)).toBe(1);
    expect(await n(`SELECT count(*) AS n FROM partes WHERE id = 'd1' AND status = 'ativa'`)).toBe(1);
  });

  it('parte: move responsáveis, vínculos (sem duplicar), CNPJ, e-mail e tipo; inativa o duplicado; trilha sem nome', async () => {
    const r = await mesclar(A, { tabela: 'partes', manter: 'k1', remover: 'd1', confirmar: true });
    expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
    expect(await n(`SELECT count(*) AS n FROM risks WHERE owner_parte_id = 'k1'`)).toBe(1);
    expect(await n(`SELECT count(*) AS n FROM ropa_records WHERE owner_parte_id = 'k1'`)).toBe(1);
    // o operador da atividade existia nos dois: fica um só, no que permanece
    expect(await n(`SELECT count(*) AS n FROM parte_vinculos WHERE papel = 'operador' AND alvo_id = 'ra1'`)).toBe(1);
    expect(await n(`SELECT count(*) AS n FROM parte_vinculos WHERE parte_id = 'd1'`)).toBe(0);
    // quem respondia pelo duplicado passa a responder pelo que fica
    expect(await n(`SELECT count(*) AS n FROM parte_vinculos WHERE parte_id = 'pp1' AND alvo_id = 'k1'`)).toBe(1);
    expect(await env.DB.prepare(`SELECT email, cnpj, terceiro_tipo FROM partes WHERE id = 'k1'`).first()).toEqual({ email: 'dpo@nuvem.example', cnpj: '11222333000181', terceiro_tipo: 'medio' });
    expect(await env.DB.prepare(`SELECT status, cnpj FROM partes WHERE id = 'd1'`).first()).toEqual({ status: 'inativa', cnpj: null });
    const trilha = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'cadastro.mesclado' ORDER BY rowid DESC`).first<{ details: string }>();
    expect(trilha?.details).toContain('d1 mesclado em k1');
    expect(trilha?.details).not.toContain('Nuvem');
  });

  it('item: move o ativo do risco e a ligação com a atividade; o duplicado vira removido', async () => {
    const r = await mesclar(A, { tabela: 'itens', manter: 'ik', remover: 'id', confirmar: true });
    expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
    expect((await env.DB.prepare(`SELECT asset_id FROM risks WHERE id = 'rk1'`).first<{ asset_id: string }>())?.asset_id).toBe('ik');
    expect(await n(`SELECT count(*) AS n FROM tratamento_itens WHERE ropa_id = 'ra1' AND item_id = 'ik'`)).toBe(1);
    expect(await env.DB.prepare(`SELECT status FROM itens WHERE id = 'id'`).first()).toEqual({ status: 'removido' });
    expect((await env.DB.prepare(`SELECT descricao FROM itens WHERE id = 'ik'`).first<{ descricao: string }>())?.descricao).toBe('Descrição do duplicado');
  });

  it('recusas: mesmo cadastro, tipo diferente, já inativo, encarregado, CNPJ diferente, outro projeto, papel sem acesso', async () => {
    expect((await mesclar(A, { tabela: 'partes', manter: 'k1', remover: 'k1' })).status).toBe(409);
    expect((await mesclar(A, { tabela: 'partes', manter: 'k1', remover: 'pp1' })).status).toBe(409); // organização × pessoa
    expect((await mesclar(A, { tabela: 'partes', manter: 'k1', remover: 'd1' })).status).toBe(409); // d1 já inativo
    expect((await mesclar(A, { tabela: 'partes', manter: 'pp1', remover: 'ob1' })).status).toBe(404); // de outro projeto
    expect((await mesclar(B, { tabela: 'partes', manter: 'k1', remover: 'ob1' })).status).toBe(404); // k1 não é de B
    await env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('vdpo', 'proj-a', 'pp2', 'encarregado', 'projeto', 'proj-a')`).run();
    const dpo = await mesclar(A, { tabela: 'partes', manter: 'pp1', remover: 'pp2', confirmar: true });
    expect(dpo.status).toBe(409);
    expect((await json<{ error: string }>(dpo)).error).toMatch(/encarregado/);
    expect(await n(`SELECT count(*) AS n FROM partes WHERE id = 'pp2' AND status = 'ativa'`)).toBe(1);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, cnpj) VALUES ('c1', 'proj-a', 'organizacao', 'Org Um', '45723174000110')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, cnpj) VALUES ('c2', 'proj-a', 'organizacao', 'Org Dois', '99888777000100')`),
    ]);
    expect((await mesclar(A, { tabela: 'partes', manter: 'c1', remover: 'c2' })).status).toBe(409); // CNPJ diferente
    expect((await mesclar(A, { tabela: 'partes', manter: 'k1', remover: 'd1', tabela_x: 1 })).status).toBe(400); // corpo estrito
    expect((await chamar(cliente, 'POST', `${A}/mesclar`, { tabela: 'partes', manter: 'c1', remover: 'c2' })).status).toBe(403);
  });
});

describe('mesclar: acertos da revisão de segurança (27/10/2026)', () => {
  it('o e-mail do duplicado passa para o cadastro que fica quando este não é encarregado', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES ('em-k', 'proj-a', 'pessoa', 'Pessoa Fica', NULL)`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES ('em-d', 'proj-a', 'pessoa', 'Pessoa Some', 'some@exemplo.test')`),
    ]);
    const r = await mesclar(A, { tabela: 'partes', manter: 'em-k', remover: 'em-d', confirmar: true });
    expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
    expect(await env.DB.prepare(`SELECT email FROM partes WHERE id = 'em-k'`).first()).toEqual({ email: 'some@exemplo.test' });
  });

  it('encarregado que fica sem e-mail NÃO recebe o e-mail do duplicado, e a prévia avisa (a linha de assinatura é da interface)', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES ('en-k', 'proj-a', 'pessoa', 'Encarregada Fica', NULL)`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES ('en-d', 'proj-a', 'pessoa', 'Encarregada Some', 'dup-dpo@exemplo.test')`),
      env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('en-v', 'proj-a', 'en-k', 'encarregado', 'projeto', 'proj-a')`),
    ]);
    const previa = await json<{ avisos: string[] }>(await mesclar(A, { tabela: 'partes', manter: 'en-k', remover: 'en-d' }));
    expect(previa.avisos.join(' ')).toContain('e-mail do duplicado não será copiado');
    const r = await mesclar(A, { tabela: 'partes', manter: 'en-k', remover: 'en-d', confirmar: true });
    expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
    expect(await env.DB.prepare(`SELECT email FROM partes WHERE id = 'en-k'`).first()).toEqual({ email: null });
  });

  it('depois de mesclar, o índice de confiança do fornecedor que fica já conta o DPA que veio do duplicado', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('fk', 'proj-a', 'organizacao', 'Fornecedor Fica')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('fd', 'proj-a', 'organizacao', 'Fornecedor Some')`),
      env.DB.prepare(`INSERT INTO vendors (id, project_id, name, parte_id, trust_score, diligence_level) VALUES ('vf', 'proj-a', 'Fornecedor Fica', 'fk', 0, 'High')`),
      env.DB.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo, status) VALUES ('dc-dpa', 'proj-a', 'politica', 'DPA exemplo', 'vigente')`),
      env.DB.prepare(`INSERT INTO documento_partes (documento_id, parte_id, papel, project_id) VALUES ('dc-dpa', 'fd', 'dpa', 'proj-a')`),
    ]);
    expect(await n(`SELECT trust_score AS n FROM vendors WHERE id = 'vf'`)).toBe(0);
    const r = await mesclar(A, { tabela: 'partes', manter: 'fk', remover: 'fd', confirmar: true });
    expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
    expect(await n(`SELECT count(*) AS n FROM documento_partes WHERE parte_id = 'fk' AND papel = 'dpa'`)).toBe(1);
    expect(await n(`SELECT trust_score AS n FROM vendors WHERE id = 'vf'`)).toBe(10); // só o DPA pontua (10)
  });
});
