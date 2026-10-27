import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { prepararProjeto, chamar, comoAgente, json, base, novaAtividade, novoItem, aprovarTratamentoDeTeste, P, OUTRO, type Sessoes } from './helpers/ropa-abas';
import { novaArea, novaParte, linha } from './helpers/ropa-abas-a';

/** Rotas das etapas (spec 8.2, plano A2.3). Atividade nova, sem dado de cliente: nomes genéricos. */
describe('rotas das etapas do tratamento', () => {
  let s: Sessoes;
  let t1: string; let t2: string; let d1: string; let d2: string;
  beforeAll(async () => {
    s = await prepararProjeto();
    t1 = (await json(await chamar(s.consultor, 'POST', `/api/v1/projects/${P}/catalogos/titulares`, { nome: 'Titular exemplo A' }))).item.id;
    t2 = (await json(await chamar(s.consultor, 'POST', `/api/v1/projects/${P}/catalogos/titulares`, { nome: 'Titular exemplo B' }))).item.id;
    d1 = (await json(await chamar(s.consultor, 'POST', `/api/v1/projects/${P}/catalogos/dados`, { nome: 'Dado exemplo 1' }))).item.id;
    d2 = (await json(await chamar(s.consultor, 'POST', `/api/v1/projects/${P}/catalogos/dados`, { nome: 'Dado exemplo 2' }))).item.id;
    await novoItem('rt-i1', 'Sistema exemplo 1');
    await novoItem('rt-i2', 'Sistema exemplo 2');
    await novoItem('rt-alheio', 'Sistema alheio', OUTRO);
    await novaArea('rt-a1', 'Área exemplo 1');
    await novaArea('rt-a2', 'Área exemplo 2');
    await novaParte('rt-p1', 'Parceiro exemplo 1');
  });

  const put = (rid: string, caminho: string, corpo: unknown, h = s.consultor) => chamar(h, 'PUT', `${base(rid)}/etapas${caminho}`, corpo);
  const lerEtapas = async (rid: string) => (await json<{ etapas: any[] }>(await chamar(s.consultor, 'GET', `${base(rid)}/etapas`))).etapas;
  const coletaPronta = async (rid: string) => {
    await put(rid, '/coleta', { descricao: 'Descrição exemplo' });
    await put(rid, '/coleta/titulares', { titulares: [{ titular_id: t1, dados_ids: [d1] }] });
    await put(rid, '/coleta/ativos', { ativos: [{ item_id: 'rt-i1' }] });
  };

  it('D6 (decisão de 26/10/2026): trocar titulares e dados da Coleta de atividade aprovada deixa a aprovação desatualizada e não mexe na prova do pedido', async () => {
    const rid = await aprovarTratamentoDeTeste(env.DB, P);
    const ficha = async () => (await json<any>(await chamar(s.consultor, 'GET', `${base(rid)}/ficha`))).situacao;
    expect(await ficha()).toMatchObject({ codigo: 'aprovada', aprovacao_desatualizada: false });
    const prova = () => env.DB.prepare(`SELECT status, hash, conteudo_json FROM pedidos WHERE id = ?`).bind(`${P}-p`).first();
    const antes = await prova();
    // a descrição da Coleta NÃO entra no conteúdo congelado; os titulares e os dados dela, sim
    await lerEtapas(rid); // materializa a atividade (os textos viram etapas)
    expect((await put(rid, '/coleta', { descricao: 'Descrição nova, depois da aprovação' })).status).toBe(200);
    expect(await ficha()).toMatchObject({ codigo: 'aprovada', aprovacao_desatualizada: false });
    expect((await put(rid, '/coleta/titulares', { titulares: [{ titular_id: t2, dados_ids: [d2] }] })).status).toBe(200);
    expect(await ficha()).toMatchObject({ codigo: 'rascunho', aprovacao_desatualizada: true });
    expect(await prova()).toEqual(antes); // a prova imutável do que foi aprovado continua como estava
  });

  it('GET /etapas devolve as seis etapas, a forma do contrato e materializa (projeto novo: tudo pendente)', async () => {
    const rid = await novaAtividade(s.consultor);
    const r = await chamar(s.consultor, 'GET', `${base(rid)}/etapas`);
    expect(r.status).toBe(200);
    const corpo = await json(r);
    expect(corpo).toMatchObject({ ok: true, materializada: true });
    expect(corpo.etapas.map((e: { etapa: string }) => e.etapa)).toEqual(['coleta', 'uso', 'compartilhamento_interno', 'compartilhamento_externo', 'armazenamento', 'eliminacao']);
    expect(corpo.etapas[0]).toMatchObject({ rotulo: 'Coleta', situacao: 'pendente', bloqueada: false, faltas: expect.arrayContaining(['descrição']) });
    expect(corpo.etapas[1]).toMatchObject({ bloqueada: true });
  });

  it('etapa 2 a 6 com a Coleta pendente: 409 "Conclua a Coleta antes" (o servidor bloqueia, não só a tela)', async () => {
    const rid = await novaAtividade(s.consultor);
    const r = await put(rid, '/uso', { descricao: 'Descrição exemplo' });
    expect(r.status).toBe(409);
    expect((await json(r)).error).toBe('Conclua a Coleta antes');
    expect((await put(rid, '/uso/ativos', { ativos: [{ item_id: 'rt-i1' }] })).status).toBe(409);
  });

  it('titular de etapa com dado fora da Coleta: 400 com os ids; nao_usa com dado: 400 pelo esquema', async () => {
    const rid = await novaAtividade(s.consultor);
    await coletaPronta(rid);
    const fora = await put(rid, `/uso/titulares/${t1}`, { dados_ids: [d2] });
    expect(fora.status).toBe(400);
    expect((await json(fora)).invalidos).toEqual([d2]);
    expect((await put(rid, `/uso/titulares/${t1}`, { dados_ids: [d1], nao_usa: true })).status).toBe(400);
    expect((await put(rid, `/uso/titulares/${t1}`, { dados_ids: [d1] })).status).toBe(200);
  });

  it('Não Aplicável apaga as linhas filhas da etapa e zera a descrição; sair volta registrada e vazia', async () => {
    const rid = await novaAtividade(s.consultor);
    await coletaPronta(rid);
    await put(rid, '/uso', { descricao: 'Descrição exemplo' });
    await put(rid, '/uso/ativos', { ativos: [{ item_id: 'rt-i2' }] });
    await put(rid, `/uso/titulares/${t1}`, { dados_ids: [d1] });
    expect((await put(rid, '/uso', { nao_aplicavel: true })).status).toBe(200);
    expect(await linha('SELECT count(*) n FROM tratamento_etapa_itens WHERE ropa_id = ? AND etapa = ?', rid, 'uso')).toMatchObject({ n: 0 });
    expect(await linha('SELECT count(*) n FROM tratamento_etapa_titulares WHERE ropa_id = ? AND etapa = ?', rid, 'uso')).toMatchObject({ n: 0 });
    const uso = (await lerEtapas(rid)).find((e) => e.etapa === 'uso');
    expect(uso).toMatchObject({ situacao: 'nao_aplicavel', descricao: null, ativos: [] });
    expect((await put(rid, '/uso', { descricao: 'Tentativa' })).status).toBe(409);
    expect((await put(rid, '/uso', { nao_aplicavel: false })).status).toBe(200);
    const volta = (await lerEtapas(rid)).find((e) => e.etapa === 'uso');
    expect(volta).toMatchObject({ situacao: 'pendente', nao_aplicavel: false, descricao: null });
  });

  it('tirar um titular da Coleta tira dele de todas as etapas; tirar um dado tira dos titulares delas', async () => {
    const rid = await novaAtividade(s.consultor);
    await coletaPronta(rid);
    await put(rid, '/coleta/titulares', { titulares: [{ titular_id: t1, dados_ids: [d1, d2] }, { titular_id: t2, dados_ids: [d2] }] });
    await put(rid, '/uso/ativos', { ativos: [{ item_id: 'rt-i2' }] });
    await put(rid, `/uso/titulares/${t1}`, { dados_ids: [d1, d2] });
    await put(rid, `/uso/titulares/${t2}`, { dados_ids: [d2] });
    await put(rid, '/coleta/titulares', { titulares: [{ titular_id: t1, dados_ids: [d1] }] });
    expect(await linha('SELECT count(*) n FROM tratamento_etapa_titulares WHERE ropa_id = ? AND titular_id = ?', rid, t2)).toMatchObject({ n: 0 });
    expect(await linha('SELECT count(*) n FROM tratamento_etapa_dados WHERE ropa_id = ? AND etapa = ? AND dado_id = ?', rid, 'uso', d2)).toMatchObject({ n: 0 });
  });

  it('área da própria atividade (cabeçalho) é 400 no Compartilhamento Interno; área do projeto passa', async () => {
    const rid = await novaAtividade(s.consultor);
    await coletaPronta(rid);
    await env.DB.prepare('INSERT INTO tratamento_departamentos (ropa_id, departamento_id, project_id) VALUES (?, ?, ?)').bind(rid, 'rt-a1', P).run();
    const ruim = await put(rid, '/compartilhamento_interno/areas', { departamentos_ids: ['rt-a1'] });
    expect(ruim.status).toBe(400);
    expect((await json(ruim)).invalidos).toEqual(['rt-a1']);
    expect((await put(rid, '/compartilhamento_interno/areas', { departamentos_ids: ['rt-a2'] })).status).toBe(200);
  });

  it('Eliminação tem ativos próprios (0087), independentes do Armazenamento, e entram no hash; local só no Armazenamento', async () => {
    const rid = await novaAtividade(s.consultor);
    await coletaPronta(rid);
    await put(rid, '/armazenamento/ativos', { ativos: [{ item_id: 'rt-i1', local_armazenamento: 'Servidor exemplo' }] });
    expect((await put(rid, '/eliminacao/ativos', { ativos: [{ item_id: 'rt-i2' }] })).status).toBe(200);
    const el = (await lerEtapas(rid)).find((e) => e.etapa === 'eliminacao');
    expect(el.ativos.map((a: { item_id: string }) => a.item_id)).toEqual(['rt-i2']);
    expect(el.faltas).not.toContain('ao menos um ativo');
    // o Armazenamento não mudou, e o ativo escolhido na Eliminação foi para o conteúdo da aprovação (tratamento_itens)
    const arm = (await lerEtapas(rid)).find((e) => e.etapa === 'armazenamento');
    expect(arm.ativos.map((a: { item_id: string }) => a.item_id)).toEqual(['rt-i1']);
    expect(await linha('SELECT count(*) n FROM tratamento_itens WHERE ropa_id = ? AND item_id = ?', rid, 'rt-i2')).toMatchObject({ n: 1 });
    // tirar da Eliminação limpa a lista; o item que sai de todas as etapas sai do hash
    expect((await put(rid, '/eliminacao/ativos', { ativos: [] })).status).toBe(200);
    expect(await linha('SELECT count(*) n FROM tratamento_itens WHERE ropa_id = ? AND item_id = ?', rid, 'rt-i2')).toMatchObject({ n: 0 });
    expect((await put(rid, '/eliminacao/ativos', { ativos: [{ item_id: 'rt-i1', local_armazenamento: 'Servidor exemplo' }] })).status).toBe(400);
    expect((await put(rid, '/uso/ativos', { ativos: [{ item_id: 'rt-i1', local_armazenamento: 'Servidor exemplo' }] })).status).toBe(400);
  });

  it('ativo de outro projeto é 400 com o id; parceiro de fora também', async () => {
    const rid = await novaAtividade(s.consultor);
    await coletaPronta(rid);
    const r = await put(rid, '/uso/ativos', { ativos: [{ item_id: 'rt-alheio' }] });
    expect(r.status).toBe(400);
    expect((await json(r)).invalidos).toEqual(['rt-alheio']);
    expect((await put(rid, '/compartilhamento_externo/parceiros', { partes_ids: ['rt-p-inexistente'] })).status).toBe(400);
  });

  it('atividade cancelada: 409 nas escritas de etapa', async () => {
    const rid = await novaAtividade(s.consultor);
    await env.DB.prepare(`UPDATE ropa_records SET status = 'Inactive' WHERE id = ?`).bind(rid).run();
    expect((await put(rid, '/coleta', { descricao: 'Descrição exemplo' })).status).toBe(409);
  });

  it('agente grava etapa (200) e não rascunha pela rota de rascunho (403)', async () => {
    const rid = await novaAtividade(s.consultor);
    const r = await comoAgente('PUT', `${base(rid)}/etapas/coleta`, { descricao: 'Descrição do agente' });
    expect(r.status).toBe(200);
    const rascunho = await comoAgente('POST', `${base(rid)}/etapas/coleta/rascunho`, {});
    expect(rascunho.status).toBe(403);
  });

  it('trilha da etapa é "Tratamento de Dados / Alteração (<etapa>)" e não leva o texto', async () => {
    const rid = await novaAtividade(s.consultor);
    await put(rid, '/coleta', { descricao: 'Texto sigiloso exemplo' });
    const log = await linha<{ field: string; action: string; details: string }>(
      `SELECT field, action, details FROM audit_logs WHERE entity_id = ? AND action = 'ropa.secao' ORDER BY rowid DESC LIMIT 1`, rid);
    expect(log?.field).toBe('Tratamento de Dados / Alteração (coleta)');
    expect(JSON.stringify(log)).not.toContain('Texto sigiloso exemplo');
  });

  it('gatilhos recusam item de outro projeto em SQL direto (sem o serviço)', async () => {
    const rid = await novaAtividade(s.consultor);
    await expect(env.DB.prepare("INSERT INTO tratamento_etapa_itens (ropa_id, etapa, item_id, project_id) VALUES (?, 'uso', 'rt-alheio', ?)").bind(rid, P).run()).rejects.toThrow();
  });

  it('etapa inexistente é 404', async () => {
    const rid = await novaAtividade(s.consultor);
    expect((await put(rid, '/inventada', { descricao: 'x' })).status).toBe(404);
  });

  it('registro de outro projeto não é lido nem escrito pela rota (404)', async () => {
    const rid = await novaAtividade(s.outro, {}, OUTRO);
    expect((await chamar(s.consultor, 'GET', `${base(rid)}/etapas`)).status).toBe(404);
    expect((await put(rid, '/coleta', { descricao: 'x' })).status).toBe(404);
  });
});
