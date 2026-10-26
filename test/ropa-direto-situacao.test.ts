// Rodada 3 da auditoria MCP: DELETE e PUT diretos de /api/v1/ropa/:id respeitam a situação derivada (achados 1 e 7).
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { prepararProjeto, chamar, comoAgente, comoAgenteDecidindo, json, base, novaAtividade, aprovarTratamentoDeTeste, P, type Sessoes } from './helpers/ropa-abas';

let s: Sessoes;
beforeAll(async () => { s = await prepararProjeto(); });
const linha = (rid: string) => env.DB.prepare('SELECT status FROM ropa_records WHERE id = ?').bind(rid).first<{ status: string }>();

describe('DELETE /api/v1/ropa/:id com a atividade aprovada por pedido (achado 1)', () => {
  it('aprovada por pedido (status não é Approved): 409 para pessoa e agente, e a linha continua', async () => {
    const rid = await aprovarTratamentoDeTeste(env.DB, P);
    expect((await json(await chamar(s.consultor, 'GET', `${base(rid)}/ficha`))).situacao.codigo).toBe('aprovada');
    const pessoa = await chamar(s.consultor, 'DELETE', `/api/v1/ropa/${rid}`);
    expect(pessoa.status).toBe(409);
    expect((await json(pessoa)).error).toContain('cancele pela situação');
    const agente = await chamar({ 'X-Agente-Confirmado': '1' }, 'DELETE', `/api/v1/ropa/${rid}`, undefined, { AGENTE: { userId: 'ra-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'ra-c' } });
    expect(agente.status).toBe(409);
    expect(await linha(rid)).not.toBeNull();
  });

  it('não aprovada: apaga como antes', async () => {
    const rid = await novaAtividade(s.consultor);
    expect((await chamar(s.consultor, 'DELETE', `/api/v1/ropa/${rid}`)).status).toBe(200);
    expect(await linha(rid)).toBeNull();
  });
});

describe('PUT /api/v1/ropa/:id com status (achado 7)', () => {
  const pedidoAberto = (id: string, rid: string) => env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, conteudo_json, hash, papel_exigido, status, criado_por)
    VALUES (?, 'org_ness', ?, 'tratamento', ?, 'Tratamento: exemplo', '{}', ?, 'ciso', 'aberto', 'cons@ness.lat')`).bind(id, P, rid, `h-${id}`).run();
  const statusPedido = async (id: string) => (await env.DB.prepare('SELECT status FROM pedidos WHERE id = ?').bind(id).first<{ status: string }>())!.status;

  it('agente mudando o status: 403 citando niso_situacao_atividade, nada muda; mesmo status passa', async () => {
    const rid = await novaAtividade(s.consultor);
    const r = await comoAgente('PUT', `/api/v1/ropa/${rid}`, { processing_purpose: 'Finalidade exemplo', status: 'Inactive' });
    expect(r.status).toBe(403);
    expect((await json(r)).error).toContain('niso_situacao_atividade');
    expect((await linha(rid))!.status).toBe('Draft');
    expect((await comoAgente('PUT', `/api/v1/ropa/${rid}`, { processing_purpose: 'Finalidade exemplo', status: 'Draft', retention_period: '5 anos' })).status).toBe(200);
  });

  it('pessoa cancelando pelo PUT: o pedido aberto é cancelado e a trilha ropa.situacao é gravada', async () => {
    const rid = await novaAtividade(s.consultor);
    await pedidoAberto('dir-p1', rid);
    const r = await chamar(s.consultor, 'PUT', `/api/v1/ropa/${rid}`, { processing_purpose: 'Finalidade exemplo', status: 'Inactive' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await linha(rid))!.status).toBe('Inactive');
    expect(await statusPedido('dir-p1')).toBe('cancelado');
    const t = await env.DB.prepare(`SELECT 1 AS ok FROM audit_logs WHERE action = 'ropa.situacao' AND details LIKE ?`).bind(`ROPA ${rid}:%`).first();
    expect(t).not.toBeNull();
  });

  it('cancelar pelo PUT não grava os outros campos do corpo; enviar para revisão grava', async () => {
    const rid = await novaAtividade(s.consultor);
    const ret = () => env.DB.prepare('SELECT retention_period r FROM ropa_records WHERE id = ?').bind(rid).first<{ r: string | null }>();
    expect((await chamar(s.consultor, 'PUT', `/api/v1/ropa/${rid}`, { processing_purpose: 'Finalidade exemplo', status: 'Under Review', retention_period: '3 anos' })).status).toBe(200);
    expect((await ret())!.r).toBe('3 anos');
    expect((await chamar(s.consultor, 'PUT', `/api/v1/ropa/${rid}`, { processing_purpose: 'Finalidade exemplo', status: 'Inactive', retention_period: '9 anos' })).status).toBe(200);
    expect((await linha(rid))!.status).toBe('Inactive');
    expect((await ret())!.r).toBe('3 anos');
  });

  it('pessoa mandando para revisão pelo PUT: grava ropa.situacao; status de destino fora da máquina segue como antes', async () => {
    const rid = await novaAtividade(s.consultor);
    expect((await chamar(s.consultor, 'PUT', `/api/v1/ropa/${rid}`, { processing_purpose: 'Finalidade exemplo', status: 'Under Review' })).status).toBe(200);
    expect((await linha(rid))!.status).toBe('Under Review');
    const t = await env.DB.prepare(`SELECT 1 AS ok FROM audit_logs WHERE action = 'ropa.situacao' AND details LIKE ?`).bind(`ROPA ${rid}:%`).first();
    expect(t).not.toBeNull();
    expect((await chamar(s.consultor, 'PUT', `/api/v1/ropa/${rid}`, { processing_purpose: 'Finalidade exemplo', status: 'Active' })).status).toBe(200);
    expect((await linha(rid))!.status).toBe('Active');
  });

  it('agente com a ferramenta niso_situacao_atividade usa a rota de situação, não o PUT', async () => {
    const rid = await novaAtividade(s.consultor);
    const r = await comoAgenteDecidindo('niso_situacao_atividade', 'PUT', `/api/v1/ropa/${rid}`, { processing_purpose: 'Finalidade exemplo', status: 'Inactive' });
    expect(r.status).toBe(403);
    expect((await json(r)).error).toBe('Forbidden: mudar a situação da atividade é decisão do consultor: use niso_situacao_atividade');
    expect((await linha(rid))!.status).toBe('Draft');
  });
});
