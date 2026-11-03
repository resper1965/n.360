import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { prepararProjeto, chamar, comoAgente, json, base, novaAtividade, P, OUTRO, type Sessoes } from './helpers/ropa-abas';

describe('Riscos no formato do legado (IDR, motivo, Tratar)', () => {
  let s: Sessoes;
  beforeAll(async () => { s = await prepararProjeto(); });
  const criar = async (rid: string, extra: object = {}) => {
    const r = await chamar(s.consultor, 'POST', `${base(rid)}/riscos`, { threat: 'Motivo exemplo', vulnerability: 'Descrição exemplo', impact: 3, probability: 4, ...extra });
    expect(r.status, await r.clone().text()).toBe(201);
    return (await json<{ id: string }>(r)).id;
  };
  const lista = async (rid: string) => (await json<{ riscos: any[] }>(await chamar(s.consultor, 'GET', `${base(rid)}/riscos`))).riscos;
  const idrDe = async (id: string) => (await env.DB.prepare('SELECT idr FROM risks WHERE id = ?').bind(id).first<{ idr: number | null }>())!.idr;

  it('IDR sequencial por atividade; a outra atividade começa em 1; apagar o 1 não o reutiliza', async () => {
    const a = await novaAtividade(s.consultor);
    const b = await novaAtividade(s.consultor);
    const a1 = await criar(a);
    const a2 = await criar(a);
    const b1 = await criar(b);
    expect([await idrDe(a1), await idrDe(a2), await idrDe(b1)]).toEqual([1, 2, 1]);
    expect((await chamar(s.consultor, 'DELETE', `${base(a)}/riscos/${a1}`)).status).toBe(200);
    const a3 = await criar(a);
    expect(await idrDe(a3)).toBe(3);
  });

  it('GET devolve idr, risk_level e residual_level, em ordem de IDR', async () => {
    const a = await novaAtividade(s.consultor);
    const baixo = await criar(a, { impact: 1, probability: 1 });
    const alto = await criar(a, { impact: 5, probability: 5, residual_impact: 2, residual_probability: 2 });
    const l = await lista(a);
    expect(l.map((r) => r.id)).toEqual([baixo, alto]);
    expect(l[0]).toMatchObject({ idr: 1, risk_level: 'Low', residual_level: null });
    expect(l[1]).toMatchObject({ idr: 2, risk_level: 'Critical', residual_level: 'Low' });
  });

  it('"Tratar": estratégia, residual calculado e prazo; prazo inválido é 400', async () => {
    const a = await novaAtividade(s.consultor);
    const id = await criar(a);
    const r = await chamar(s.consultor, 'PUT', `${base(a)}/riscos/${id}`, { treatment: 'Accept', residual_impact: 2, residual_probability: 2, treatment_due_date: '2026-12-01' });
    expect(r.status).toBe(200);
    expect(await env.DB.prepare('SELECT treatment, residual_level, treatment_due_date FROM risks WHERE id = ?').bind(id).first()).toEqual({ treatment: 'Accept', residual_level: 'Low', treatment_due_date: '2026-12-01' });
    expect((await chamar(s.consultor, 'PUT', `${base(a)}/riscos/${id}`, { treatment_due_date: '01/12/2026' })).status).toBe(400);
    expect((await chamar(s.consultor, 'PUT', `${base(a)}/riscos/${id}`, { treatment_due_date: null })).status).toBe(200);
    expect((await env.DB.prepare('SELECT treatment_due_date FROM risks WHERE id = ?').bind(id).first<any>())!.treatment_due_date).toBeNull();
  });

  it('criar já com o prazo de tratamento; notas continuam 1 a 5', async () => {
    const a = await novaAtividade(s.consultor);
    const id = await criar(a, { treatment_due_date: '2027-01-15' });
    expect((await env.DB.prepare('SELECT treatment_due_date FROM risks WHERE id = ?').bind(id).first<any>())!.treatment_due_date).toBe('2027-01-15');
    expect((await chamar(s.consultor, 'POST', `${base(a)}/riscos`, { threat: 'x', impact: 6, probability: 1 })).status).toBe(400);
  });

  it('motivos: vazios no projeto novo (nada semeado) e depois os pares já usados, distintos, só deste projeto', async () => {
    // O outro projeto da fixture (OUTRO) nunca teve risco: é o "projeto novo".
    const a = await novaAtividade(s.outro, {}, OUTRO);
    // motivos do PROJETO (exclui a lista de referência de riscos de privacidade, que vem marcada `referencia: true`)
    const m = async () => (await json<{ motivos: any[] }>(await chamar(s.outro, 'GET', `${base(a, OUTRO)}/riscos/motivos`))).motivos.filter((x) => !x.referencia);
    expect(await m()).toEqual([]);
    // a lista de referência está presente mesmo no projeto novo
    expect((await json<{ motivos: any[] }>(await chamar(s.outro, 'GET', `${base(a, OUTRO)}/riscos/motivos`))).motivos.some((x) => x.referencia)).toBe(true);
    await chamar(s.outro, 'POST', `${base(a, OUTRO)}/riscos`, { threat: 'Vazamento exemplo', vulnerability: 'Descrição A', impact: 2, probability: 2 });
    await chamar(s.outro, 'POST', `${base(a, OUTRO)}/riscos`, { threat: 'Vazamento exemplo', vulnerability: 'Descrição A', impact: 3, probability: 3 });
    expect(await m()).toEqual([{ nome: 'Vazamento exemplo', descricao_padrao: 'Descrição A' }]);
    // o motivo usado não é semeado no catálogo do projeto
    const { env } = await import('cloudflare:test');
    expect((await env.DB.prepare(`SELECT count(*) n FROM catalogo_itens WHERE project_id = ? AND tipo = 'motivo_risco'`).bind(OUTRO).first<{ n: number }>())!.n).toBe(0);
    // não vaza para o outro projeto
    const deP = await novaAtividade(s.consultor);
    const doP = (await json<{ motivos: any[] }>(await chamar(s.consultor, 'GET', `${base(deP)}/riscos/motivos`))).motivos;
    expect(doP.find((x) => x.nome === 'Vazamento exemplo')).toBeUndefined();
    expect((await chamar(s.outro, 'GET', `${base('nao-existe', OUTRO)}/riscos/motivos`)).status).toBe(404);
    expect((await chamar(s.outro, 'GET', `${base(deP)}/riscos/motivos`)).status).toBeGreaterThanOrEqual(403);
  });

  it('o risco aparece na matriz do n.iso com ropa_id e idr; editar pelo n.iso mantém o IDR e o prazo', async () => {
    const a = await novaAtividade(s.consultor);
    const id = await criar(a, { treatment_due_date: '2027-02-01' });
    const matriz = await json<{ risks: any[] }>(await chamar(s.consultor, 'GET', `/api/v1/projects/${P}/risks`));
    expect(matriz.risks.find((r) => r.id === id)).toMatchObject({ ropa_id: a, idr: 1, treatment_due_date: '2027-02-01' });
    const put = await chamar(s.consultor, 'PUT', `/api/v1/risks/${id}`, { impact: 4 });
    expect(put.status, await put.clone().text()).toBe(200);
    expect(await env.DB.prepare('SELECT idr, ropa_id, treatment_due_date, impact FROM risks WHERE id = ?').bind(id).first()).toEqual({ idr: 1, ropa_id: a, treatment_due_date: '2027-02-01', impact: 4 });
  });

  it('o agente MCP cria e atualiza risco, mas não aceita nem apaga', async () => {
    const a = await novaAtividade(s.consultor);
    expect((await comoAgente('POST', `${base(a)}/riscos`, { threat: 'Risco do agente', impact: 2, probability: 2 })).status).toBe(201);
  });
});
