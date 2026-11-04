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
