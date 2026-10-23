import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { situacaoDaAtividade, acoesDoMenu } from '../src/services/ropa-abas/situacao';
import { prepararProjeto, chamar, comoAgente, comoAgenteDecidindo, json, base, novaAtividade, aprovarTratamentoDeTeste, P, type Sessoes } from './helpers/ropa-abas';
import { aprovacoesDoProjeto } from '../src/services/documentos';

const ap = (ciso: string | null, ceo: string | null = null) => ({ ciso: ciso ? { por: 'Fulano', em: ciso } : null, ceo: ceo ? { por: 'Beltrana', em: ceo } : null });
const sem = ap(null);
const baseEntrada = { reaberta_em: null, aprovacao: sem, aprovacao_anterior: null };

describe('situação exibida (spec 6)', () => {
  it('Draft e Active sem aprovação: Rascunho', () => {
    expect(situacaoDaAtividade({ ...baseEntrada, status: 'Draft' }).codigo).toBe('rascunho');
    expect(situacaoDaAtividade({ ...baseEntrada, status: 'Active' }).codigo).toBe('rascunho');
    expect(situacaoDaAtividade({ ...baseEntrada, status: null }).codigo).toBe('rascunho');
  });
  it('Under Review: Em Revisão', () => { expect(situacaoDaAtividade({ ...baseEntrada, status: 'Under Review' })).toMatchObject({ codigo: 'em_revisao', rotulo: 'Em Revisão' }); });
  it('pedido aprovado com o hash vigente: Aprovada, mesmo com o status em Under Review (o pedido não escreve o status)', () => {
    expect(situacaoDaAtividade({ ...baseEntrada, status: 'Under Review', aprovacao: ap('2026-10-10 10:00:00') }).codigo).toBe('aprovada');
  });
  it('assinatura direta antiga (status Approved): Aprovada', () => { expect(situacaoDaAtividade({ ...baseEntrada, status: 'Approved' }).codigo).toBe('aprovada'); });
  it('reaberta depois da aprovação: Em Revisão em nova revisão; nova aprovação depois da reabertura: Aprovada de novo', () => {
    const reaberta = { ...baseEntrada, status: 'Under Review', aprovacao: ap('2026-10-10 10:00:00'), reaberta_em: '2026-10-11 09:00:00' };
    expect(situacaoDaAtividade(reaberta)).toMatchObject({ codigo: 'em_revisao', em_nova_revisao: true });
    expect(situacaoDaAtividade({ ...reaberta, aprovacao: ap('2026-10-12 08:00:00') }).codigo).toBe('aprovada');
  });
  it('mudou depois da aprovação: sem aprovação vigente e com anterior, o selo de desatualizada aparece e a situação segue o status', () => {
    expect(situacaoDaAtividade({ ...baseEntrada, status: 'Under Review', aprovacao_anterior: { por: 'Fulano', em: 'x' } })).toMatchObject({ codigo: 'em_revisao', aprovacao_desatualizada: true });
  });
  it('Inactive vence tudo: Cancelada', () => {
    expect(situacaoDaAtividade({ ...baseEntrada, status: 'Inactive', aprovacao: ap('2026-10-10 10:00:00') }).codigo).toBe('cancelada');
  });
});

describe('ações do menu por situação e papel (spec 6)', () => {
  const equipe = { equipe: true, orgAdmin: false, podeRevogar: false, podePedir: true };
  const admin = { equipe: false, orgAdmin: true, podeRevogar: true, podePedir: true };
  const cliente = { equipe: false, orgAdmin: false, podeRevogar: false, podePedir: false };
  const s = (codigo: any) => ({ codigo, rotulo: '', aprovacao_desatualizada: false, em_nova_revisao: false });
  const ligadas = (a: Record<string, { habilitada: boolean }>) => Object.entries(a).filter(([, v]) => v.habilitada).map(([k]) => k).sort();
  it('Rascunho: só "Alterar para Em revisão", imprimir, cancelar e excluir', () => {
    expect(ligadas(acoesDoMenu(s('rascunho'), { ...equipe, bloqueios: 0 }))).toEqual(['alterar_para_em_revisao', 'cancelar', 'excluir', 'imprimir']);
  });
  it('Em Revisão: Conferir/Aprovar só sem bloqueio e para quem pede; com bloqueio diz quantos', () => {
    expect(acoesDoMenu(s('em_revisao'), { ...equipe, bloqueios: 0 }).conferir_aprovar.habilitada).toBe(true);
    expect(acoesDoMenu(s('em_revisao'), { ...equipe, bloqueios: 2 }).conferir_aprovar).toEqual({ habilitada: false, motivo: 'Há 2 pendências a resolver antes de pedir a aprovação.' });
    expect(acoesDoMenu(s('em_revisao'), { ...equipe, bloqueios: 1 }).conferir_aprovar.motivo).toBe('Há 1 pendência a resolver antes de pedir a aprovação.');
    expect(acoesDoMenu(s('em_revisao'), { ...cliente, bloqueios: 0 }).conferir_aprovar.habilitada).toBe(false);
  });
  it('Aprovada: Reabrir só para quem revoga (platform_admin, org_admin), nunca para a equipe comum', () => {
    expect(acoesDoMenu(s('aprovada'), { ...admin, bloqueios: 0 }).reabrir.habilitada).toBe(true);
    expect(acoesDoMenu(s('aprovada'), { ...equipe, bloqueios: 0 }).reabrir.habilitada).toBe(false);
  });
  it('Cancelada: só Reativar, Imprimir e Excluir (equipe)', () => {
    expect(ligadas(acoesDoMenu(s('cancelada'), { ...equipe, bloqueios: 0 }))).toEqual(['excluir', 'imprimir', 'reativar']);
  });
  it('Excluir é só da equipe da ness. (como hoje)', () => { expect(acoesDoMenu(s('rascunho'), { ...admin, bloqueios: 0 }).excluir.habilitada).toBe(false); });
});

describe('POST /situacao (a máquina de estados sobre a aprovação por pedido)', () => {
  let s: Sessoes;
  beforeAll(async () => { s = await prepararProjeto(); });
  const situacao = (h: Record<string, string>, rid: string, corpo: unknown) => chamar(h, 'POST', `${base(rid)}/situacao`, corpo);
  const ficha = async (rid: string) => json<any>(await chamar(s.consultor, 'GET', `${base(rid)}/ficha`));
  const status = async (rid: string) => (await env.DB.prepare('SELECT status FROM ropa_records WHERE id = ?').bind(rid).first<{ status: string }>())!.status;

  it('enviar para revisão leva Draft a Under Review; repetir é 409', async () => {
    const rid = await novaAtividade(s.consultor);
    expect((await ficha(rid)).situacao.codigo).toBe('rascunho');
    const r = await situacao(s.consultor, rid, { acao: 'enviar_revisao' });
    expect(r.status).toBe(200);
    expect(await status(rid)).toBe('Under Review');
    expect((await ficha(rid)).situacao).toMatchObject({ codigo: 'em_revisao', rotulo: 'Em Revisão' });
    const de_novo = await situacao(s.consultor, rid, { acao: 'enviar_revisao' });
    expect(de_novo.status).toBe(409);
    expect((await json(de_novo)).error).toBe('Ação indisponível para a situação atual');
  });

  it('cancelar cancela o pedido ABERTO, deixa a atividade somente leitura; reativar volta a Under Review', async () => {
    const rid = await novaAtividade(s.consultor);
    await env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, conteudo_json, hash, papel_exigido, status, criado_por)
      VALUES ('sit-aberto', 'org_ness', ?, 'tratamento', ?, 'Tratamento: exemplo', '{}', 'h-aberto', 'ciso', 'aberto', 'cons@ness.lat')`).bind(P, rid).run();
    expect((await situacao(s.consultor, rid, { acao: 'cancelar', motivo: 'abc' })).status).toBe(400);
    expect((await situacao(s.consultor, rid, { acao: 'cancelar', motivo: 'duplicada, ver outra' })).status).toBe(200);
    expect(await status(rid)).toBe('Inactive');
    expect((await env.DB.prepare(`SELECT status FROM pedidos WHERE id = 'sit-aberto'`).first<{ status: string }>())!.status).toBe('cancelado');
    expect((await ficha(rid)).situacao.codigo).toBe('cancelada');
    // somente leitura: escrita de aba 409, leitura 200
    const gap = await chamar(s.consultor, 'POST', `${base(rid)}/gaps`, { gap: 'Gap exemplo', responsavel_parte_id: 'x' });
    expect(gap.status).toBe(409);
    expect((await json(gap)).error).toBe('Atividade cancelada: reative para editar');
    expect((await chamar(s.consultor, 'GET', `${base(rid)}/gaps`)).status).toBe(200);
    expect((await chamar(s.consultor, 'GET', `${base(rid)}/ficha`)).status).toBe(200);
    // cancelar de novo: 409; reativar: Under Review
    expect((await situacao(s.consultor, rid, { acao: 'cancelar', motivo: 'duplicada, ver outra' })).status).toBe(409);
    expect((await situacao(s.consultor, rid, { acao: 'reativar' })).status).toBe(200);
    expect(await status(rid)).toBe('Under Review');
  });

  it('reabrir atividade aprovada por pedido: org_admin; consultor comum 403; a prova fica intacta; nova decisão volta a Aprovada', async () => {
    const rid = await aprovarTratamentoDeTeste(env.DB, P);
    await env.DB.prepare(`UPDATE ropa_records SET status = 'Under Review' WHERE id = ?`).bind(rid).run();
    const foto = async () => JSON.stringify([
      (await env.DB.prepare('SELECT * FROM pedidos WHERE ref_id = ? ORDER BY id').bind(rid).all()).results,
      (await env.DB.prepare('SELECT d.* FROM pedido_destinatarios d JOIN pedidos p ON p.id = d.pedido_id WHERE p.ref_id = ? ORDER BY d.id').bind(rid).all()).results,
    ]);
    expect((await ficha(rid)).situacao.codigo).toBe('aprovada');
    const antes = await foto();
    expect((await situacao(s.consultor, rid, { acao: 'reabrir', motivo: 'rever a base legal' })).status).toBe(403);
    expect((await situacao(s.cliente, rid, { acao: 'reabrir', motivo: 'rever a base legal' })).status).toBe(403);
    const r = await situacao(s.adminCliente, rid, { acao: 'reabrir', motivo: 'rever a base legal' });
    expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
    expect(await status(rid)).toBe('Under Review');
    expect(await foto()).toBe(antes);
    expect((await ficha(rid)).situacao).toMatchObject({ codigo: 'em_revisao', em_nova_revisao: true });
    // nova decisão (pedido novo, mesmo hash) depois do carimbo volta a Aprovada
    const p = (await env.DB.prepare('SELECT * FROM pedidos WHERE ref_id = ?').bind(rid).first<any>())!;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, conteudo_json, hash, papel_exigido, status, criado_por) VALUES ('sit-p2', ?, ?, 'tratamento', ?, ?, ?, ?, 'ciso', 'aprovado', 'cons@ness.lat')`)
        .bind(p.org_id, P, rid, p.titulo, p.conteudo_json, p.hash),
      env.DB.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, email, nome, status, decidido_em) VALUES ('sit-d2', 'sit-p2', 'dpo@cliente.exemplo', 'Encarregado exemplo', 'aprovado', datetime('now', '+1 minute'))`),
    ]);
    expect((await ficha(rid)).situacao).toMatchObject({ codigo: 'aprovada', em_nova_revisao: false });
    // mudar o conteúdo derruba a aprovação (hash)
    await env.DB.prepare(`UPDATE ropa_records SET processing_purpose = 'Outra finalidade exemplo' WHERE id = ?`).bind(rid).run();
    expect((await aprovacoesDoProjeto(env.DB, P, rid, 'tratamento')).get(rid)!.ciso).toBeNull();
  });

  it('reabrir atividade com assinatura direta antiga limpa as assinaturas', async () => {
    const rid = await novaAtividade(s.consultor);
    await env.DB.prepare(`UPDATE ropa_records SET status = 'Approved', ciso_approved_by = 'a@x.exemplo', ciso_approved_at = datetime('now'), ciso_approved_ip = '1.1.1.1', ciso_approved_ua = 'ua',
      ceo_approved_by = 'b@x.exemplo', ceo_approved_at = datetime('now'), ceo_approved_ip = '1.1.1.2', ceo_approved_ua = 'ua' WHERE id = ?`).bind(rid).run();
    expect((await ficha(rid)).situacao.codigo).toBe('aprovada');
    expect((await situacao(s.adminCliente, rid, { acao: 'reabrir', motivo: 'rever a base legal' })).status).toBe(200);
    const l = (await env.DB.prepare('SELECT * FROM ropa_records WHERE id = ?').bind(rid).first<any>())!;
    expect(l.status).toBe('Under Review');
    for (const c of ['by', 'at', 'ip', 'ua']) { expect(l[`ciso_approved_${c}`], c).toBeNull(); expect(l[`ceo_approved_${c}`], c).toBeNull(); }
    expect(l.reaberta_em).not.toBeNull();
  });

  it('motivo curto é 400; cliente org_user não cancela (403); atividade de outro projeto é 404', async () => {
    const rid = await novaAtividade(s.consultor);
    expect((await situacao(s.consultor, rid, { acao: 'reabrir', motivo: 'abc' })).status).toBe(400);
    expect((await situacao(s.cliente, rid, { acao: 'cancelar', motivo: 'motivo válido aqui' })).status).toBe(403);
    expect((await situacao(s.consultor, 'nao-existe', { acao: 'enviar_revisao' })).status).toBe(404);
    expect((await chamar(s.outro, 'POST', `${base(rid)}/situacao`, { acao: 'enviar_revisao' })).status).toBeGreaterThanOrEqual(403);
    expect(await status(rid)).toBe('Draft');
  });

  it('o agente MCP sem a ferramenta não muda a situação (403 nas quatro ações)', async () => {
    const rid = await novaAtividade(s.consultor);
    for (const corpo of [{ acao: 'enviar_revisao' }, { acao: 'reativar' }, { acao: 'reabrir', motivo: 'motivo válido' }, { acao: 'cancelar', motivo: 'motivo válido' }]) {
      const r = await comoAgente('POST', `${base(rid)}/situacao`, corpo);
      expect(r.status, JSON.stringify(corpo)).toBe(403);
      expect((await json(r)).error).toContain('niso_situacao_atividade');
    }
    expect(await status(rid)).toBe('Draft');
  });

  it('o agente muda a situação pela ferramenta niso_situacao_atividade, com confirmação e motivo', async () => {
    const rid = await novaAtividade(s.consultor);
    const r = await comoAgenteDecidindo('niso_situacao_atividade', 'POST', `${base(rid)}/situacao`, { acao: 'enviar_revisao' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await ficha(rid)).situacao.codigo).toBe('em_revisao');
  });

  it('a trilha: uma linha por seção sem o motivo e uma ropa.situacao com o motivo em justification', async () => {
    const rid = await novaAtividade(s.consultor);
    await situacao(s.consultor, rid, { acao: 'cancelar', motivo: 'duplicada, ver outra' });
    const secao = await env.DB.prepare(`SELECT details, field FROM audit_logs WHERE entity_id = ? AND action = 'ropa.secao'`).bind(rid).first<any>();
    expect(secao.field).toBe('Situação / Cancelada');
    expect(secao.details).not.toContain('duplicada');
    const sit = await env.DB.prepare(`SELECT justification, project_id FROM audit_logs WHERE action = 'ropa.situacao' AND details LIKE ?`).bind(`ROPA ${rid}:%`).first<any>();
    expect(sit).toMatchObject({ justification: 'duplicada, ver outra', project_id: P });
  });

  it('nada do serviço nem das rotas grava assinatura para APROVAR (só limpa a antiga)', () => {
    const fontes = import.meta.glob(['../src/services/ropa-abas/*.ts', '../src/routes/ropa-abas.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    expect(Object.keys(fontes).length).toBeGreaterThan(5);
    const achados = Object.entries(fontes).flatMap(([arq, txt]) =>
      [...txt.matchAll(/(ciso|ceo)_approved_\w+\s*=\s*(?!NULL\b)\S+/gi)].map((m) => `${arq}: ${m[0]}`));
    expect(achados).toEqual([]);
    // a leitura enxerga a limpeza que existe de fato
    expect(Object.values(fontes).some((t) => /ciso_approved_by = NULL/.test(t))).toBe(true);
  });
});
