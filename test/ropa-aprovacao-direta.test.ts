// Aprovação direta antiga (assinaturas na linha) cai em toda escrita do conteúdo congelado, também pelas rotas antigas; gap com
// responsável só em texto aparece pelo nome. Dados fictícios.
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { prepararProjeto, chamar, json, base, novaAtividade, novoItem, P, type Sessoes } from './helpers/ropa-abas';
import { novaParte, linha } from './helpers/ropa-abas-a';

describe('aprovação direta antiga e responsável em texto', () => {
  let s: Sessoes;
  beforeAll(async () => { s = await prepararProjeto(); });
  const aprovar = (rid: string) => env.DB.prepare(`UPDATE ropa_records SET status = 'Approved', ciso_approved_by = 'ciso@cliente.exemplo', ciso_approved_at = '2026-01-01' WHERE id = ?`).bind(rid).run();
  const estado = (rid: string) => linha('SELECT status, ciso_approved_by FROM ropa_records WHERE id = ?', rid);
  const CAIU = { status: 'Under Review', ciso_approved_by: null };

  it('transferência e vínculo de parte (rotas antigas) derrubam a aprovação direta', async () => {
    const rid = await novaAtividade(s.consultor);
    await aprovar(rid);
    expect((await chamar(s.consultor, 'POST', `${base(rid)}/transferencias`, { pais: 'País exemplo' })).status).toBe(201);
    expect(await estado(rid)).toEqual(CAIU);

    const rid2 = await novaAtividade(s.consultor);
    await novaParte('pad-org', 'Empresa exemplo AD');
    await env.DB.prepare(`UPDATE partes SET tipo = 'organizacao' WHERE id = 'pad-org'`).run();
    await aprovar(rid2);
    const r = await chamar(s.consultor, 'POST', `/api/v1/projects/${P}/partes/pad-org/vinculos`, { papel: 'operador', alvo_tipo: 'tratamento', alvo_id: rid2 });
    expect(r.status).toBe(201);
    expect(await estado(rid2)).toEqual(CAIU);
  });

  it('itens: trocar o conjunto derruba; mandar o mesmo conjunto não', async () => {
    const rid = await novaAtividade(s.consultor);
    await novoItem('pad-item', 'Sistema exemplo AD');
    expect((await chamar(s.consultor, 'PUT', `${base(rid)}/itens`, { itens: ['pad-item'] })).status).toBe(200);
    await aprovar(rid);
    expect((await chamar(s.consultor, 'PUT', `${base(rid)}/itens`, { itens: ['pad-item'] })).status).toBe(200);
    expect(await estado(rid)).toMatchObject({ status: 'Approved' });
    expect((await chamar(s.consultor, 'PUT', `${base(rid)}/itens`, { itens: [] })).status).toBe(200);
    expect(await estado(rid)).toEqual(CAIU);
  });

  it('mescla: item só do ciclo de vida (fora do conteúdo congelado) mantém a aprovação; item ligado à atividade derruba', async () => {
    const mesclar = (manter: string, remover: string) =>
      chamar(s.consultor, 'POST', `/api/v1/projects/${P}/mesclar`, { tabela: 'itens', manter, remover, confirmar: true });
    const rid = await novaAtividade(s.consultor);
    await novoItem('pad-m1', 'Sistema exemplo M1');
    await novoItem('pad-m2', 'Sistema exemplo M2');
    await env.DB.prepare(`INSERT INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao, item_id) VALUES (?, ?, 'uso', 'registrada', 'pad-m2')`).bind(rid, P).run();
    await aprovar(rid);
    expect((await mesclar('pad-m1', 'pad-m2')).status).toBe(200);
    expect(await estado(rid)).toMatchObject({ status: 'Approved' });

    const rid2 = await novaAtividade(s.consultor);
    await novoItem('pad-m3', 'Sistema exemplo M3');
    await novoItem('pad-m4', 'Sistema exemplo M4');
    expect((await chamar(s.consultor, 'PUT', `${base(rid2)}/itens`, { itens: ['pad-m4'] })).status).toBe(200);
    await aprovar(rid2);
    expect((await mesclar('pad-m3', 'pad-m4')).status).toBe(200);
    expect(await estado(rid2)).toEqual(CAIU);
  });

  it('gap com responsável só em texto aparece pelo nome na aba e na lista do projeto', async () => {
    const rid = await novaAtividade(s.consultor);
    await chamar(s.consultor, 'POST', `${base(rid)}/acoes`, { title: 'Ação exemplo AD' });
    await env.DB.prepare(`UPDATE corrective_actions SET assigned_to = 'Pessoa exemplo' WHERE ropa_id = ?`).bind(rid).run();
    const aba = await json(await chamar(s.consultor, 'GET', `${base(rid)}/gaps`));
    expect(aba.gaps[0].responsavel).toEqual({ id: null, nome: 'Pessoa exemplo' });
    const projeto = await json(await chamar(s.consultor, 'GET', `/api/v1/projects/${P}/ropa/gaps`));
    expect(projeto.gaps.find((g: any) => g.ropa_id === rid).responsavel).toBe('Pessoa exemplo');
  });
});
