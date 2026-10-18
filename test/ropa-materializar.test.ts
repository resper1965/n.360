import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { prepararProjeto, chamar, json, base, novaAtividade, novoItem, P, type Sessoes } from './helpers/ropa-abas';
import { linha } from './helpers/ropa-abas-a';

/** Materialização preguiçosa dos dados planos na Coleta (spec 4.5, plano A2.4). Atividade "de antes": texto plano, sem etapas. */
describe('materialização dos dados planos na Coleta', () => {
  let s: Sessoes;
  let rid: string;
  let vazio: string;
  const COLS = 'SELECT data_subjects, data_categories, dados_sensiveis, retention_period FROM ropa_records WHERE id = ?';
  beforeAll(async () => {
    s = await prepararProjeto();
    await novoItem('mz-i1', 'Sistema exemplo 1');
    await novoItem('mz-i2', 'Sistema exemplo 2');
    rid = await novaAtividade(s.consultor);
    await env.DB.prepare(`UPDATE ropa_records SET data_subjects = ?, data_categories = ?, dados_sensiveis = 1, retention_period = '5 anos' WHERE id = ?`)
      .bind('Titular exemplo A, Titular exemplo B; Titular exemplo A', 'Dado exemplo 1, Saúde', rid).run();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO tratamento_itens (ropa_id, item_id, project_id) VALUES (?, ?, ?), (?, ?, ?)').bind(rid, 'mz-i1', P, rid, 'mz-i2', P),
      env.DB.prepare(`INSERT INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao, item_id, descricao) VALUES (?, ?, 'uso', 'registrada', 'mz-i1', 'Descrição da F3')`).bind(rid, P),
    ]);
    vazio = await novaAtividade(s.consultor);
  });

  const lerEtapas = async (r: string, h = s.consultor) => json<any>(await chamar(h, 'GET', `${base(r)}/etapas`));

  it('a primeira leitura materializa: titulares sem repetição, dados com sensível, Coleta registrada e migrada', async () => {
    const corpo = await lerEtapas(rid);
    const coleta = corpo.etapas[0];
    expect(coleta).toMatchObject({ situacao: 'pendente', migrado: true });
    expect(coleta.titulares.map((t: { nome: string }) => t.nome)).toEqual(['Titular Exemplo A', 'Titular Exemplo B']);
    for (const t of coleta.titulares) expect(t.dados.map((d: { nome: string }) => d.nome)).toEqual(['Dado Exemplo 1', 'Saúde']);
    expect(coleta.titulares[0].dados.find((d: { nome: string }) => d.nome === 'Saúde').sensivel).toBe(true);
    expect(coleta.ativos.map((a: { item_id: string }) => a.item_id)).toEqual(['mz-i1', 'mz-i2']);
    expect(await linha('SELECT etapas_materializadas_em e FROM ropa_records WHERE id = ?', rid)).toMatchObject({ e: expect.any(String) });
  });

  it('a etapa de uso recebe o ativo e a descrição da F3; as etapas 3 a 6 ficam pendentes; Eliminação lê o prazo', async () => {
    const corpo = await lerEtapas(rid);
    expect(corpo.etapas[1]).toMatchObject({ etapa: 'uso', descricao: 'Descrição da F3' });
    expect(corpo.etapas[1].ativos.map((a: { item_id: string }) => a.item_id)).toEqual(['mz-i1']);
    for (const e of corpo.etapas.slice(2)) expect(e.situacao).toBe('pendente');
    expect(corpo.etapas[5]).toMatchObject({ prazo: '5 anos' });
  });

  it('a segunda leitura não grava nada; o texto do hash fica byte a byte igual', async () => {
    const antes = { catalogo: await linha('SELECT count(*) n FROM catalogo_itens WHERE project_id = ?', P), etapa: await linha('SELECT count(*) n FROM tratamento_etapa_titulares WHERE ropa_id = ?', rid) };
    const cols = await linha(COLS, rid);
    await lerEtapas(rid);
    expect(await linha('SELECT count(*) n FROM catalogo_itens WHERE project_id = ?', P)).toEqual(antes.catalogo);
    expect(await linha('SELECT count(*) n FROM tratamento_etapa_titulares WHERE ropa_id = ?', rid)).toEqual(antes.etapa);
    expect(await linha(COLS, rid)).toEqual(cols);
    expect(cols).toEqual({ data_subjects: 'Titular exemplo A, Titular exemplo B; Titular exemplo A', data_categories: 'Dado exemplo 1, Saúde', dados_sensiveis: 1, retention_period: '5 anos' });
  });

  it('gravar os titulares da Coleta zera "migrado" (a pessoa confirmou)', async () => {
    const titulares = await json<any>(await chamar(s.consultor, 'GET', `/api/v1/projects/${P}/catalogos/titulares`));
    const ids = titulares.itens.map((i: { id: string }) => i.id);
    const r = await chamar(s.consultor, 'PUT', `${base(rid)}/etapas/coleta/titulares`, { titulares: ids.map((id: string) => ({ titular_id: id, dados_ids: [] })) });
    expect(r.status).toBe(400); // dados_ids vazio não passa (ao menos um dado)
    const dados = (await json<any>(await chamar(s.consultor, 'GET', `/api/v1/projects/${P}/catalogos/dados`))).itens.map((i: { id: string }) => i.id);
    const ok = await chamar(s.consultor, 'PUT', `${base(rid)}/etapas/coleta/titulares`, { titulares: ids.map((id: string) => ({ titular_id: id, dados_ids: dados })) });
    expect(ok.status).toBe(200);
    expect((await lerEtapas(rid)).etapas[0].migrado).toBe(false);
  });

  it('atividade sem texto de titulares: Coleta sem titulares, não migrada, sem erro', async () => {
    const corpo = await lerEtapas(vazio);
    expect(corpo.etapas[0]).toMatchObject({ migrado: false, titulares: [] });
  });

  it('leitura por leitor (org_user) também materializa', async () => {
    const outra = await novaAtividade(s.consultor);
    await env.DB.prepare(`UPDATE ropa_records SET data_subjects = 'Titular exemplo C' WHERE id = ?`).bind(outra).run();
    const corpo = await lerEtapas(outra, s.cliente);
    expect(corpo.etapas[0].titulares.map((t: { nome: string }) => t.nome)).toEqual(['Titular Exemplo C']);
  });

  it('duas leituras simultâneas não duplicam o catálogo', async () => {
    const outra = await novaAtividade(s.consultor);
    await env.DB.prepare(`UPDATE ropa_records SET data_subjects = 'Titular exemplo D', data_categories = 'Dado exemplo 9' WHERE id = ?`).bind(outra).run();
    await Promise.all([lerEtapas(outra), lerEtapas(outra)]);
    expect(await linha(`SELECT count(*) n FROM catalogo_itens WHERE project_id = ? AND tipo = 'titular' AND nome = 'Titular Exemplo D'`, P)).toEqual({ n: 1 });
    expect(await linha(`SELECT count(*) n FROM tratamento_etapa_titulares WHERE ropa_id = ?`, outra)).toEqual({ n: 1 });
  });
});
