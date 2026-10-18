import { describe, it, expect, beforeAll } from 'vitest';
import { prepararProjeto, chamar, json, base, novaAtividade, novoItem, P, type Sessoes } from './helpers/ropa-abas';
import { abrirPedido, pedidosAbertos, linha } from './helpers/ropa-abas-a';

/** Escrita derivada no hash (spec 4.4, plano A2.3). Cada caso é uma linha da tabela da spec. Nomes fictícios. */
describe('escrita derivada das etapas no conteúdo congelado', () => {
  let s: Sessoes;
  let t1: string; let t2: string; let d1: string; let d2: string; let ds: string;
  beforeAll(async () => {
    s = await prepararProjeto();
    t1 = (await json(await chamar(s.consultor, 'POST', `/api/v1/projects/${P}/catalogos/titulares`, { nome: 'Titular exemplo A' }))).item.id;
    t2 = (await json(await chamar(s.consultor, 'POST', `/api/v1/projects/${P}/catalogos/titulares`, { nome: 'Titular exemplo B' }))).item.id;
    d1 = (await json(await chamar(s.consultor, 'POST', `/api/v1/projects/${P}/catalogos/dados`, { nome: 'Dado exemplo 1' }))).item.id;
    d2 = (await json(await chamar(s.consultor, 'POST', `/api/v1/projects/${P}/catalogos/dados`, { nome: 'Dado exemplo 2' }))).item.id;
    ds = (await json(await chamar(s.consultor, 'POST', `/api/v1/projects/${P}/catalogos/dados`, { nome: 'Saúde' }))).item.id;
    await novoItem('dv-i1', 'Sistema exemplo 1');
    await novoItem('dv-i2', 'Sistema exemplo 2');
    await novoItem('dv-i3', 'Sistema exemplo 3');
  });

  const etapa = (rid: string, e: string, corpo: unknown, h = s.consultor) => chamar(h, 'PUT', `${base(rid)}/etapas/${e}`, corpo);
  const coleta = (rid: string, titulares: unknown, h = s.consultor) => chamar(h, 'PUT', `${base(rid)}/etapas/coleta/titulares`, { titulares }, {});
  const ativos = (rid: string, e: string, lista: unknown[], h = s.consultor) => chamar(h, 'PUT', `${base(rid)}/etapas/${e}/ativos`, { ativos: lista });
  const registro = (rid: string) => linha<{ data_subjects: string; data_categories: string; dados_sensiveis: number; retention_period: string; criancas_adolescentes: number }>(
    'SELECT data_subjects, data_categories, dados_sensiveis, retention_period, criancas_adolescentes FROM ropa_records WHERE id = ?', rid);

  /** Coleta concluída (descrição, titular com dado, ativo): é o que destrava as etapas 2 a 6. */
  const coletaPronta = async (rid: string) => {
    await etapa(rid, 'coleta', { descricao: 'Descrição exemplo' });
    await coleta(rid, [{ titular_id: t1, dados_ids: [d1] }]);
    await ativos(rid, 'coleta', [{ item_id: 'dv-i3' }]);
  };

  it('titulares e dados da Coleta escrevem nomes, categorias e sensível no registro, e substituem o pedido', async () => {
    const rid = await novaAtividade(s.consultor);
    const pedido = await abrirPedido(s.consultor, rid);
    const r = await coleta(rid, [{ titular_id: t2, dados_ids: [d2, d1] }, { titular_id: t1, dados_ids: [d1] }]);
    expect(r.status).toBe(200);
    expect(await json(r)).toMatchObject({ ok: true, mudou_hash: true });
    const reg = await registro(rid);
    expect(reg.data_subjects).toBe('Titular Exemplo A, Titular Exemplo B');
    expect(reg.data_categories).toBe('Dado Exemplo 1, Dado Exemplo 2');
    expect(reg.dados_sensiveis).toBe(0);
    expect(await pedidosAbertos(rid)).not.toContain(pedido);
  });

  it('a mesma gravação de novo não muda o hash e não substitui o pedido', async () => {
    const rid = await novaAtividade(s.consultor);
    await coleta(rid, [{ titular_id: t1, dados_ids: [d1] }]);
    const pedido = await abrirPedido(s.consultor, rid);
    const r = await coleta(rid, [{ titular_id: t1, dados_ids: [d1] }]);
    expect(await json(r)).toMatchObject({ mudou_hash: false });
    expect(await pedidosAbertos(rid)).toEqual([pedido]);
  });

  it('dado sensível na Coleta marca o registro como sensível', async () => {
    const rid = await novaAtividade(s.consultor);
    await coleta(rid, [{ titular_id: t1, dados_ids: [ds] }]);
    expect((await registro(rid)).dados_sensiveis).toBe(1);
  });

  it('crianças e adolescentes no registro (hash); consentimento só na etapa (fora do hash)', async () => {
    const rid = await novaAtividade(s.consultor);
    const pedido = await abrirPedido(s.consultor, rid);
    const c = await etapa(rid, 'coleta', { criancas_adolescentes: true });
    expect(await json(c)).toMatchObject({ mudou_hash: true });
    expect((await registro(rid)).criancas_adolescentes).toBe(1);
    expect(await pedidosAbertos(rid)).not.toContain(pedido);
    const k = await etapa(rid, 'coleta', { solicita_consentimento: true });
    expect(await json(k)).toMatchObject({ mudou_hash: false });
    expect(await linha<{ solicita_consentimento: number }>('SELECT solicita_consentimento FROM tratamento_ciclo WHERE ropa_id = ? AND etapa = ?', rid, 'coleta'))
      .toMatchObject({ solicita_consentimento: 1 });
  });

  it('prazo da Eliminação grava retention_period (hash); só o descarte não muda o hash', async () => {
    const rid = await novaAtividade(s.consultor);
    await coletaPronta(rid);
    const p = await etapa(rid, 'eliminacao', { prazo: '5 anos (exemplo)', descarte: 'Exclusão lógica (exemplo)' });
    expect(await json(p)).toMatchObject({ mudou_hash: true });
    expect((await registro(rid)).retention_period).toBe('5 anos (exemplo)');
    const pedido = await abrirPedido(s.consultor, rid);
    const d = await etapa(rid, 'eliminacao', { descarte: 'Destruição (exemplo)' });
    expect(await json(d)).toMatchObject({ mudou_hash: false });
    expect(await pedidosAbertos(rid)).toEqual([pedido]);
  });

  it('ativos da etapa acrescentam ao hash; trocar remove só o que nenhuma etapa usa; item ligado por fora fica', async () => {
    const rid = await novaAtividade(s.consultor);
    await coletaPronta(rid);
    const { env } = await import('cloudflare:test');
    await env.DB.prepare('INSERT INTO tratamento_itens (ropa_id, item_id, project_id) VALUES (?, ?, ?)').bind(rid, 'dv-i2', P).run();
    const a1 = await ativos(rid, 'uso', [{ item_id: 'dv-i1' }]);
    expect(await json(a1)).toMatchObject({ mudou_hash: true });
    expect(await linha('SELECT count(*) n FROM tratamento_itens WHERE ropa_id = ? AND item_id = ?', rid, 'dv-i1')).toMatchObject({ n: 1 });
    await ativos(rid, 'uso', []);
    expect(await linha('SELECT count(*) n FROM tratamento_itens WHERE ropa_id = ? AND item_id = ?', rid, 'dv-i1')).toMatchObject({ n: 0 });
    expect(await linha('SELECT count(*) n FROM tratamento_itens WHERE ropa_id = ? AND item_id = ?', rid, 'dv-i2')).toMatchObject({ n: 1 });
  });

  it('descrição, áreas, parceiros, titular de etapa e local de armazenamento não mexem no hash', async () => {
    const rid = await novaAtividade(s.consultor);
    await coletaPronta(rid);
    await ativos(rid, 'uso', [{ item_id: 'dv-i1' }]);
    const pedido = await abrirPedido(s.consultor, rid);
    expect(await json(await etapa(rid, 'uso', { descricao: 'Descrição exemplo' }))).toMatchObject({ mudou_hash: false });
    expect(await json(await chamar(s.consultor, 'PUT', `${base(rid)}/etapas/uso/titulares/${t1}`, { dados_ids: [d1] }))).toMatchObject({ mudou_hash: false });
    expect(await pedidosAbertos(rid)).toEqual([pedido]);
  });

  it('PUT antigo de data_subjects: livre sem titulares na Coleta, 409 com titulares divergentes, 200 com o valor derivado', async () => {
    const rid = await novaAtividade(s.consultor);
    const livre = await chamar(s.consultor, 'PUT', `/api/v1/ropa/${rid}`, { data_subjects: 'Texto livre', processing_purpose: 'Atividade exemplo' });
    expect(livre.status).toBe(200);
    await coleta(rid, [{ titular_id: t1, dados_ids: [d1] }]);
    const ruim = await chamar(s.consultor, 'PUT', `/api/v1/ropa/${rid}`, { data_subjects: 'Outro texto', processing_purpose: 'Atividade exemplo' });
    expect(ruim.status).toBe(409);
    expect((await json(ruim)).error).toBe('Titulares e dados desta atividade são registrados na etapa Coleta');
    const igual = await chamar(s.consultor, 'PUT', `/api/v1/ropa/${rid}`, { data_subjects: 'titular EXEMPLO a', processing_purpose: 'Atividade exemplo' });
    expect(igual.status).toBe(200);
  });
});
