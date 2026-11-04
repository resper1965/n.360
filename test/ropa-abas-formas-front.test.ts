import { describe, it, expect, beforeAll } from 'vitest';
import { prepararProjeto, chamar, json, base, novaAtividade, P, type Sessoes } from './helpers/ropa-abas';

/** As formas de resposta que a ficha em abas (frontend/src/atividade/) lê. Se uma mudar aqui, a tela quebra em silêncio. */
describe('ficha em abas: formas que o frontend lê', () => {
  let s: Sessoes;
  let rid: string;
  beforeAll(async () => {
    s = await prepararProjeto();
    rid = await novaAtividade(s.consultor);
  });

  it('projeto novo: listas vazias, nunca erro (o sistema vazio explica, não quebra)', async () => {
    // motivos nunca é vazio: traz a lista de referência de riscos de privacidade (só sugestão, `referencia: true`); nada do projeto.
    const motivos = (await json<{ motivos: { referencia?: boolean }[] }>(await chamar(s.consultor, 'GET', `${base(rid)}/riscos/motivos`))).motivos;
    expect(motivos.length).toBeGreaterThan(0);
    expect(motivos.every((m) => m.referencia === true)).toBe(true);
    expect(await json(await chamar(s.consultor, 'GET', `${base(rid)}/medidas`))).toEqual([]);
    expect(await json(await chamar(s.consultor, 'GET', `${base(rid)}/medidas/sugestoes`))).toEqual([]);
    expect(await json(await chamar(s.consultor, 'GET', `${base(rid)}/medidas/controles`))).toEqual([]);
    expect(await json(await chamar(s.consultor, 'GET', `${base(rid)}/gaps`))).toEqual({ ok: true, gaps: [], nao_aplicavel: false });
    expect(await json(await chamar(s.consultor, 'GET', `${base(rid)}/logs`))).toEqual(expect.any(Array));
  });

  it('a lista do projeto traz a situação e as colunas do escopo e dos agentes que as abas leem', async () => {
    await chamar(s.consultor, 'PUT', `${base(rid)}/escopo`, { volume_mensal: '100', processamento_automatizado: 'nao' });
    await chamar(s.consultor, 'PUT', `${base(rid)}/agentes`, { papel_controlador: true });
    const lista = (await json<any>(await chamar(s.consultor, 'GET', `/api/v1/projects/${P}/ropa`))).records as any[]; // o api() do frontend desembrulha {ok, records}
    const r = lista.find((x) => x.id === rid);
    expect(r.situacao).toMatchObject({ codigo: 'rascunho', rotulo: 'Rascunho' });
    expect(r).toMatchObject({ volume_mensal: '100', processamento_automatizado: 'nao', papel_controlador: 1 });
  });

  it('medida: POST devolve o id e a lista traz as chaves da linha; a sugestão é texto', async () => {
    const c = await chamar(s.consultor, 'POST', `${base(rid)}/medidas`, { medida: 'Controle de acesso', status: 'ativa' });
    expect(c.status).toBe(201);
    expect((await json(c)).id).toEqual(expect.any(String));
    const [m] = await json<any[]>(await chamar(s.consultor, 'GET', `${base(rid)}/medidas`));
    expect(Object.keys(m)).toEqual(expect.arrayContaining(['id', 'medida', 'status', 'descricao', 'controle', 'controle_deixou_de_estar_implementado']));
    expect(await json(await chamar(s.consultor, 'GET', `${base(rid)}/medidas/sugestoes`))).toEqual(['Controle de acesso']);
  });

  it('logs: linhas {secao, evento, nome, data}; "antes" com a data da última linha pagina no formato aceito', async () => {
    const linhas = await json<any[]>(await chamar(s.consultor, 'GET', `${base(rid)}/logs?limite=50`));
    expect(linhas.length).toBeGreaterThan(0);
    expect(Object.keys(linhas[0]).sort()).toEqual(['data', 'evento', 'mudancas', 'nome', 'secao']);
    expect((await chamar(s.consultor, 'GET', `${base(rid)}/logs?limite=50&antes=${encodeURIComponent(linhas[linhas.length - 1].data)}`)).status).toBe(200);
  });

  it('risco novo: o tratamento ainda é o padrão do servidor (Mitigate); a tela só trata como tratado com estratégia fora do padrão, residual ou prazo', async () => {
    const c = await chamar(s.consultor, 'POST', `${base(rid)}/riscos`, { threat: 'Acesso indevido', probability: 3, impact: 3 });
    expect(c.status).toBe(201);
    const lista = await json<any>(await chamar(s.consultor, 'GET', `${base(rid)}/riscos`));
    const riscos = Array.isArray(lista) ? lista : lista.riscos;
    expect(riscos[0]).toMatchObject({ threat: 'Acesso indevido', treatment: 'Mitigate', residual_level: null, treatment_due_date: null });
    expect(riscos[0].idr).toBeDefined();
    expect(await json(await chamar(s.consultor, 'GET', `${base(rid)}/riscos/motivos`))).toEqual({ motivos: expect.any(Array) });
  });
});
