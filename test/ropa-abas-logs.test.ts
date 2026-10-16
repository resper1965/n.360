import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { prepararProjeto, chamar, json, base, novaAtividade, P, OUTRO, type Sessoes } from './helpers/ropa-abas';
import { registrarSecao } from '../src/services/ropa-abas/logs';
import { logAudit } from '../src/helpers';

describe('ficha em abas: Logs ROPA', () => {
  let s: Sessoes;
  let rid: string;
  beforeAll(async () => {
    s = await prepararProjeto();
    rid = await novaAtividade(s.consultor);
  });

  it('registrarSecao grava uma linha sem texto livre', async () => {
    await registrarSecao(env.DB, 'cons@ness.lat', P, rid, 'Controle de GAPS', 'Alteração');
    const l = await env.DB.prepare(`SELECT * FROM audit_logs WHERE action = 'ropa.secao' AND entity_id = ?`).bind(rid).first<any>();
    expect(l).toMatchObject({ entity_type: 'ropa', field: 'Controle de GAPS / Alteração', project_id: P, actor: 'cons@ness.lat' });
    expect(l.details).toBe(`ROPA ${rid}: Alteração`);
    expect(l.justification ?? '').toBe('');
  });

  it('lista do mais recente ao mais antigo, com as linhas antigas das rotas da F1 a F3', async () => {
    await logAudit(env.DB, 'ropa.impacto', 'cons@ness.lat', `ROPA ${rid}: teste de impacto (sensiveis)`, 'motivo sigiloso exemplo', '', P);
    await registrarSecao(env.DB, 'cons@ness.lat', P, rid, 'Escopo', 'Alteração');
    const r = await chamar(s.consultor, 'GET', `${base(rid)}/logs`);
    expect(r.status).toBe(200);
    const linhas = await json<any[]>(r);
    expect(linhas[0]).toMatchObject({ secao: 'Escopo', evento: 'Alteração', nome: 'Consultor exemplo' });
    expect(linhas.find((x) => x.secao === 'Teste de Impacto')).toBeTruthy();
    expect(Object.keys(linhas[0]).sort()).toEqual(['data', 'evento', 'nome', 'secao']);
    expect(JSON.stringify(linhas)).not.toContain('sigiloso');
  });

  it('o nome sem usuário cai no e-mail mascarado; "system" sai como está', async () => {
    await registrarSecao(env.DB, 'apagado@cliente.exemplo', P, rid, 'Medidas de Segurança', 'Inclusão');
    await registrarSecao(env.DB, 'system', P, rid, 'Medidas de Segurança', 'Exclusão');
    const linhas = await json<any[]>(await chamar(s.consultor, 'GET', `${base(rid)}/logs?limite=10`));
    expect(linhas.find((x) => x.evento === 'Inclusão').nome).toBe('a***@cliente.exemplo');
    expect(linhas.find((x) => x.evento === 'Exclusão').nome).toBe('system');
  });

  it('limite e antes paginam; parâmetro inválido é 400', async () => {
    const dois = await json<any[]>(await chamar(s.consultor, 'GET', `${base(rid)}/logs?limite=2`));
    expect(dois).toHaveLength(2);
    const antes = await json<any[]>(await chamar(s.consultor, 'GET', `${base(rid)}/logs?antes=2000-01-01 00:00:00`));
    expect(antes).toEqual([]);
    expect((await chamar(s.consultor, 'GET', `${base(rid)}/logs?limite=0`)).status).toBe(400);
    expect((await chamar(s.consultor, 'GET', `${base(rid)}/logs?antes=ontem`)).status).toBe(400);
  });

  it('o cliente lê; outro projeto e atividade alheia são 404', async () => {
    expect((await chamar(s.cliente, 'GET', `${base(rid)}/logs`)).status).toBe(200);
    expect((await chamar(s.consultor, 'GET', `${base('nao-existe')}/logs`)).status).toBe(404);
    const alheia = await novaAtividade(s.outro, {}, OUTRO);
    expect((await chamar(s.consultor, 'GET', `${base(alheia)}/logs`)).status).toBe(404);
    expect((await chamar(s.consultor, 'GET', `${base(rid, OUTRO)}/logs`)).status).toBe(403);
  });

  it('atividade nova: a lista responde 200 (sistema vazio)', async () => {
    const nova = await novaAtividade(s.consultor);
    const r = await chamar(s.consultor, 'GET', `${base(nova)}/logs`);
    expect(r.status).toBe(200);
    expect(Array.isArray(await json(r))).toBe(true);
  });
});
