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
    expect(Object.keys(linhas[0]).sort()).toEqual(['data', 'evento', 'mudancas', 'nome', 'secao']);
    expect(JSON.stringify(linhas)).not.toContain('sigiloso');
  });

  it('D3: escolha, marca e áreas entram com antes e depois; texto livre fica só como "Alteração"', async () => {
    const a = await novaAtividade(s.consultor);
    await chamar(s.consultor, 'PUT', `${base(a)}/escopo`, { processamento_automatizado: 'nao' });
    const r = await chamar(s.consultor, 'PUT', `${base(a)}/escopo`, { processamento_automatizado: 'decisao', descricao_atividade: 'Texto livre sigiloso exemplo', finalidade: 'Finalidade sigilosa exemplo' });
    expect(r.status).toBe(200);
    await chamar(s.consultor, 'PUT', `${base(a)}/agentes`, { papel_controlador: true, transfer_safeguards: 'Cláusula sigilosa exemplo' });
    const linhas = await json<any[]>(await chamar(s.consultor, 'GET', `${base(a)}/logs?limite=10`));
    const escopo = linhas.find((x) => x.secao === 'Escopo' && x.mudancas.some((m: any) => m.depois === 'decisao'));
    expect(escopo.mudancas).toEqual([{ campo: 'processamento_automatizado', antes: 'nao', depois: 'decisao' }]);
    const agentes = linhas.find((x) => x.secao === 'Agentes de Tratamento');
    expect(agentes.mudancas).toEqual([{ campo: 'papel_controlador', antes: '(vazio)', depois: '1' }]);
    const { results } = await env.DB.prepare(`SELECT details FROM audit_logs WHERE entity_id = ? AND action = 'ropa.secao'`).bind(a).all<{ details: string }>();
    expect(JSON.stringify(results)).not.toContain('sigiloso');
    expect(JSON.stringify(linhas)).not.toContain('sigiloso');
  });

  it('D3: a situação grava de e para; só entra campo da lista fixa', async () => {
    const a = await novaAtividade(s.consultor);
    await registrarSecao(env.DB, 'cons@ness.lat', P, a, 'Escopo', 'Alteração', '', [
      { campo: 'situacao', antes: 'Draft', depois: 'Under Review' },
      { campo: 'descricao_atividade', antes: 'texto antigo sigiloso', depois: 'texto novo sigiloso' },
    ]);
    const linhas = await json<any[]>(await chamar(s.consultor, 'GET', `${base(a)}/logs?limite=5`));
    expect(linhas[0].mudancas).toEqual([{ campo: 'situacao', antes: 'Draft', depois: 'Under Review' }]);
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
