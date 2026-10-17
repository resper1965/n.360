import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { prepararProjeto, chamar, json, base, novaAtividade, type Sessoes } from './helpers/ropa-abas';
import { abrirPedido, pedidosAbertos, linha } from './helpers/ropa-abas-a';
import { escolherPrincipal } from '../src/services/ropa-abas/base-juridica';

describe('escolherPrincipal (a base que está no hash)', () => {
  it('mantém a atual enquanto ela continua selecionada', () => {
    expect(escolherPrincipal('lgpd:art7:v', ['lgpd:art7:ii', 'lgpd:art7:v'])).toBe('lgpd:art7:v');
  });
  it('sem atual, ou com a atual desmarcada, vale o primeiro inciso do art. 7º', () => {
    expect(escolherPrincipal(null, ['lgpd:art11:i', 'lgpd:art7:ii'])).toBe('lgpd:art7:ii');
    expect(escolherPrincipal('lgpd:art7:v', ['lgpd:art7:ii'])).toBe('lgpd:art7:ii');
  });
  it('só art. 11: vale o primeiro dele; nada selecionado: nenhuma', () => {
    expect(escolherPrincipal(null, ['lgpd:art11:ii-f'])).toBe('lgpd:art11:ii-f');
    expect(escolherPrincipal('lgpd:art7:v', [])).toBeNull();
  });
});

describe('ficha em abas: aba Base Jurídica', () => {
  let s: Sessoes;
  beforeAll(async () => { s = await prepararProjeto(); });
  const put = (rid: string, corpo: unknown) => chamar(s.consultor, 'PUT', `${base(rid)}/base-juridica`, corpo);
  const get = async (rid: string) => json<any>(await chamar(s.consultor, 'GET', `${base(rid)}/base-juridica`));
  const FIN = 'Finalidade do inciso (exemplo)';
  const reg = (rid: string) => linha('SELECT base_legal_id b, legal_basis lb, base_legal_finalidade f, base_art11_na na, previsao_legal pl, base_gdpr g FROM ropa_records WHERE id = ?', rid);

  it('sistema vazio: o GET responde com tudo vazio', async () => {
    const rid = await novaAtividade(s.consultor);
    const r = await get(rid);
    expect(r).toEqual({ ok: true, previsao_legal: null, lgpd: [], art11: { nao_aplicavel: false, incisos: [] }, gdpr: [], lia_exigida: false, base_gdpr_texto_anterior: null, legal_basis_texto: null });
  });

  it('dois incisos do art. 7º: a primeira vira principal, a outra adicional; o hash muda e o pedido é substituído', async () => {
    const rid = await novaAtividade(s.consultor);
    const pedido = await abrirPedido(s.consultor, rid);
    const r = await put(rid, { lgpd: [{ requisito_id: 'lgpd:art7:ii', finalidade: FIN }, { requisito_id: 'lgpd:art7:v', finalidade: 'Outra finalidade (exemplo)' }] });
    expect(await json(r)).toEqual({ ok: true, mudou_hash: true });
    expect(await reg(rid)).toMatchObject({ b: 'lgpd:art7:ii', lb: 'Cumprimento de obrigação legal ou regulatória', f: FIN });
    expect(await pedidosAbertos(rid)).not.toContain(pedido);
    const g = await get(rid);
    expect(g.lgpd.map((x: any) => [x.requisito_id, x.principal, x.finalidade, x.finalidade_pendente])).toEqual([
      ['lgpd:art7:ii', true, FIN, false], ['lgpd:art7:v', false, 'Outra finalidade (exemplo)', false]]);
    expect(Object.keys(g.lgpd[0]).sort()).toEqual(['finalidade', 'finalidade_pendente', 'principal', 'referencia', 'requisito_id', 'titulo']);
  });

  it('trocar só a finalidade de um inciso, a previsão legal ou o art. 11 não substitui pedido', async () => {
    const rid = await novaAtividade(s.consultor);
    await put(rid, { lgpd: [{ requisito_id: 'lgpd:art7:ii', finalidade: FIN }, { requisito_id: 'lgpd:art7:v', finalidade: FIN }] });
    const pedido = await abrirPedido(s.consultor, rid);
    const a = await put(rid, { lgpd: [{ requisito_id: 'lgpd:art7:ii', finalidade: 'Finalidade nova (exemplo)' }, { requisito_id: 'lgpd:art7:v', finalidade: 'Outra nova (exemplo)' }], previsao_legal: 'Lei exemplo' });
    expect(await json(a)).toEqual({ ok: true, mudou_hash: false });
    expect((await put(rid, { art11: { nao_aplicavel: true, incisos: [] } })).status).toBe(200);
    expect(await pedidosAbertos(rid)).toEqual([pedido]);
    expect(await reg(rid)).toMatchObject({ f: 'Finalidade nova (exemplo)', pl: 'Lei exemplo', na: 1 });
  });

  it('a principal já escolhida continua mesmo se a ordem do corpo mudar', async () => {
    const rid = await novaAtividade(s.consultor);
    await put(rid, { lgpd: [{ requisito_id: 'lgpd:art7:v', finalidade: FIN }, { requisito_id: 'lgpd:art7:ii', finalidade: FIN }] });
    expect((await reg(rid)).b).toBe('lgpd:art7:v');
    const r = await put(rid, { lgpd: [{ requisito_id: 'lgpd:art7:ii', finalidade: FIN }, { requisito_id: 'lgpd:art7:v', finalidade: FIN }] });
    expect((await json(r)).mudou_hash).toBe(false);
    expect((await reg(rid)).b).toBe('lgpd:art7:v');
  });

  it('recusas: finalidade vazia, requisito inexistente ou que não é base, inciso repetido, Não Aplicável com incisos', async () => {
    const rid = await novaAtividade(s.consultor);
    expect((await put(rid, { lgpd: [{ requisito_id: 'lgpd:art7:ii', finalidade: '' }] })).status).toBe(400);
    const inexistente = await put(rid, { lgpd: [{ requisito_id: 'lgpd:art7:zz', finalidade: FIN }] });
    expect(inexistente.status).toBe(400);
    expect((await json(inexistente)).invalidos).toEqual(['lgpd:art7:zz']);
    expect((await put(rid, { lgpd: [{ requisito_id: 'lgpd:art6', finalidade: FIN }] })).status).toBe(400);
    expect((await put(rid, { lgpd: [{ requisito_id: 'lgpd:art7:ii', finalidade: FIN }, { requisito_id: 'lgpd:art7:ii', finalidade: FIN }] })).status).toBe(400);
    expect((await put(rid, { art11: { nao_aplicavel: true, incisos: [{ requisito_id: 'lgpd:art11:i', finalidade: FIN }] } })).status).toBe(400);
    expect((await put(rid, { gdpr: [{ base: 'contrato', finalidade: FIN }, { base: 'contrato', finalidade: FIN }] })).status).toBe(400);
    expect((await put(rid, { gdpr: [{ base: 'inventada', finalidade: FIN }] })).status).toBe(400);
    expect(await reg(rid)).toMatchObject({ b: null });
  });

  it('só art. 11: o primeiro inciso é a principal; combinar com art. 7º mantém os dois', async () => {
    const rid = await novaAtividade(s.consultor);
    await put(rid, { art11: { nao_aplicavel: false, incisos: [{ requisito_id: 'lgpd:art11:i', finalidade: FIN }] } });
    expect((await reg(rid)).b).toBe('lgpd:art11:i');
    await put(rid, { lgpd: [{ requisito_id: 'lgpd:art7:ii', finalidade: FIN }] }); // art. 11 gravado é mantido
    const g = await get(rid);
    expect(g.art11.incisos.map((x: any) => x.requisito_id)).toEqual(['lgpd:art11:i']);
    expect(g.lgpd.map((x: any) => x.requisito_id)).toEqual(['lgpd:art7:ii']);
    expect((await reg(rid)).b).toBe('lgpd:art11:i'); // a principal gravada continua
  });

  it('GDPR: substitui tratamento_bases_gdpr e não mexe no texto antigo, que o GET devolve à parte', async () => {
    const rid = await novaAtividade(s.consultor);
    await env.DB.prepare(`UPDATE ropa_records SET base_gdpr = 'Texto antigo exemplo' WHERE id = ?`).bind(rid).run();
    const pedido = await abrirPedido(s.consultor, rid);
    const r = await put(rid, { gdpr: [{ base: 'contrato', finalidade: FIN }, { base: 'interesses_legitimos', finalidade: FIN }] });
    expect(await json(r)).toEqual({ ok: true, mudou_hash: false });
    expect(await pedidosAbertos(rid)).toEqual([pedido]);
    expect((await reg(rid)).g).toBe('Texto antigo exemplo');
    const g = await get(rid);
    expect(g.base_gdpr_texto_anterior).toBe('Texto antigo exemplo');
    expect(g.gdpr).toEqual([{ base: 'contrato', rotulo: 'Contrato', finalidade: FIN }, { base: 'interesses_legitimos', rotulo: 'Interesses legítimos', finalidade: FIN }]);
    expect(g.lia_exigida).toBe(true);
    await put(rid, { gdpr: [] });
    expect((await get(rid)).gdpr).toEqual([]);
  });

  it('legítimo interesse no art. 7º também exige a LIA', async () => {
    const rid = await novaAtividade(s.consultor);
    await put(rid, { lgpd: [{ requisito_id: 'lgpd:art7:ix', finalidade: FIN }] });
    expect((await get(rid)).lia_exigida).toBe(true);
  });

  it('linha da F3 sem finalidade vem com finalidade_pendente; texto antigo em legal_basis não é apagado', async () => {
    const rid = await novaAtividade(s.consultor, { legal_basis: 'Consentimento (texto antigo)' });
    await env.DB.prepare(`INSERT INTO tratamento_bases (ropa_id, requisito_id, project_id) VALUES (?, 'lgpd:art7:v', ?)`).bind(rid, 'ra-proj').run();
    const g = await get(rid);
    expect(g.lgpd).toEqual([expect.objectContaining({ requisito_id: 'lgpd:art7:v', finalidade: '', finalidade_pendente: true, principal: false })]);
    expect(g.legal_basis_texto).toBe('Consentimento (texto antigo)');
    await put(rid, { previsao_legal: 'Só a previsão' });
    expect((await reg(rid)).lb).toBe('Consentimento (texto antigo)');
    expect((await json(await put(rid, { lgpd: [] }))).mudou_hash).toBe(false);
    expect((await reg(rid)).lb).toBe('Consentimento (texto antigo)');
  });

  it('cancelada: 409; inexistente: 404; corpo vazio não grava nem confere', async () => {
    const rid = await novaAtividade(s.consultor);
    expect(await json(await put(rid, {}))).toEqual({ ok: true, mudou_hash: false });
    await env.DB.prepare(`UPDATE ropa_records SET status = 'Inactive' WHERE id = ?`).bind(rid).run();
    expect((await put(rid, { previsao_legal: 'x' })).status).toBe(409);
    expect((await chamar(s.consultor, 'GET', `${base('nao-existe')}/base-juridica`)).status).toBe(404);
    expect((await chamar(s.consultor, 'GET', `${base(rid)}/base-juridica`)).status).toBe(200);
  });
});
