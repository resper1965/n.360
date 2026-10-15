import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';

/**
 * "O cliente age" (onda 1 do diagnóstico de 15/10/2026): o administrador do cliente (`org_admin`) registra e responde o pedido do
 * titular e registra e avalia o incidente do PRÓPRIO projeto. `org_user` e `client` continuam só leitura (allow-list do RBAC), o
 * cliente de outro projeto não alcança, e a trilha leva o e-mail de quem fez. Encerrar incidente é só da equipe da consultoria (403 no servidor).
 */
const P = 'ct-proj';
const OUTRO = 'ct-outro';
const B = `/api/v1/projects/${P}`;

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());

let consultor: Record<string, string>, orgAdmin: Record<string, string>, colaborador: Record<string, string>, leitor: Record<string, string>, alheio: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('ct-oa', 'encarregado@cliente.teste', 'x', 'Enc', 'org_admin', ?1, 'org_ness'),
      ('ct-ou', 'colab@cliente.teste', 'x', 'Colab', 'org_user', ?1, 'org_ness'),
      ('ct-cl', 'leitor@cliente.teste', 'x', 'Leitor', 'client', ?1, 'org_ness'),
      ('ct-alheio', 'enc@outro.teste', 'x', 'Alheio', 'org_admin', ?2, 'org_ness'),
      ('ct-cons', 'cons@ness.teste', 'x', 'Cons', 'consultor', NULL, 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-ct', ?, 'Cons', 'cons@ness.teste', 'consultor', 'Consultor')`).bind(P),
  ]);
  await habilitarPrivacy(P, OUTRO);
  await concederModulos(['ct-oa', 'ct-ou', 'ct-cl', 'ct-alheio'], ['privacy']);
  consultor = await sessionFor({ id: 'ct-cons', email: 'cons@ness.teste', role: 'consultor' });
  orgAdmin = await sessionFor({ id: 'ct-oa', email: 'encarregado@cliente.teste', role: 'org_admin', client_project_id: P });
  colaborador = await sessionFor({ id: 'ct-ou', email: 'colab@cliente.teste', role: 'org_user', client_project_id: P });
  leitor = await sessionFor({ id: 'ct-cl', email: 'leitor@cliente.teste', role: 'client', client_project_id: P });
  alheio = await sessionFor({ id: 'ct-alheio', email: 'enc@outro.teste', role: 'org_admin', client_project_id: OUTRO });
});

const trilha = (acao: string) => env.DB.prepare(`SELECT actor FROM audit_logs WHERE action = ? AND project_id = ? ORDER BY created_at DESC LIMIT 1`)
  .bind(acao, P).first<{ actor: string }>();

describe('pedido do titular pelo administrador do cliente', () => {
  it('registra, responde e a trilha leva o e-mail dele', async () => {
    const r = await chamar(orgAdmin, 'POST', `${B}/titular-pedidos`, { tipo: 'acesso', canal: 'email', recebido_em: '2026-10-01' });
    expect(r.status).toBe(201);
    const { id } = await r.json() as { id: string };
    expect((await trilha('titular.pedido_criado'))?.actor).toBe('encarregado@cliente.teste');

    const up = await chamar(orgAdmin, 'PUT', `${B}/titular-pedidos/${id}`, { status: 'respondido', resposta_texto: 'Enviamos a cópia dos dados.' });
    expect(up.status).toBe(200);
    const p = await env.DB.prepare('SELECT status, resposta_texto FROM titular_pedidos WHERE id = ?').bind(id).first<{ status: string; resposta_texto: string }>();
    expect(p).toEqual({ status: 'respondido', resposta_texto: 'Enviamos a cópia dos dados.' });
    expect((await trilha('titular.pedido_atualizado'))?.actor).toBe('encarregado@cliente.teste');
  });

  it('org_user e client leem, mas não registram nem respondem', async () => {
    const criado = await (await chamar(orgAdmin, 'POST', `${B}/titular-pedidos`, { tipo: 'correcao' })).json() as { id: string };
    for (const h of [colaborador, leitor]) {
      expect((await chamar(h, 'GET', `${B}/titular-pedidos`)).status).toBe(200);
      expect((await chamar(h, 'POST', `${B}/titular-pedidos`, { tipo: 'acesso' })).status).toBe(403);
      expect((await chamar(h, 'PUT', `${B}/titular-pedidos/${criado.id}`, { status: 'em_andamento' })).status).toBe(403);
    }
  });

  it('o administrador de outro cliente não alcança o projeto', async () => {
    const criado = await (await chamar(orgAdmin, 'POST', `${B}/titular-pedidos`, { tipo: 'oposicao' })).json() as { id: string };
    expect((await chamar(alheio, 'GET', `${B}/titular-pedidos`)).status).toBe(403);
    expect((await chamar(alheio, 'POST', `${B}/titular-pedidos`, { tipo: 'acesso' })).status).toBe(403);
    expect((await chamar(alheio, 'PUT', `${B}/titular-pedidos/${criado.id}`, { status: 'negado' })).status).toBe(403);
    expect((await env.DB.prepare('SELECT status FROM titular_pedidos WHERE id = ?').bind(criado.id).first<{ status: string }>())?.status).toBe('recebido');
  });
});

describe('incidente pelo administrador do cliente', () => {
  it('registra, avalia e registra a comunicação; a trilha leva o e-mail dele', async () => {
    const r = await chamar(orgAdmin, 'POST', `${B}/incidentes`, { titulo: 'Envio por engano', ciencia_em: '2026-10-14' });
    expect(r.status).toBe(201);
    const { id } = await r.json() as { id: string };
    expect((await chamar(orgAdmin, 'PUT', `${B}/incidentes/${id}/risco`, { risco_titular: 'relevante', avaliacao_texto: 'Dado de saúde' })).status).toBe(200);
    expect((await chamar(orgAdmin, 'POST', `${B}/incidentes/${id}/comunicacoes`, { destino: 'anpd' })).status).toBe(200);
    for (const acao of ['incidente.criado', 'incidente.risco', 'incidente.comunicacao']) {
      expect((await trilha(acao))?.actor).toBe('encarregado@cliente.teste');
    }
  });

  it('org_user, client e o cliente de outro projeto não gravam', async () => {
    const { id } = await (await chamar(orgAdmin, 'POST', `${B}/incidentes`, { titulo: 'Perda de notebook', ciencia_em: '2026-10-14' })).json() as { id: string };
    for (const h of [colaborador, leitor]) {
      expect((await chamar(h, 'POST', `${B}/incidentes`, { titulo: 'X', ciencia_em: '2026-10-14' })).status).toBe(403);
      expect((await chamar(h, 'PUT', `${B}/incidentes/${id}/risco`, { risco_titular: 'baixo' })).status).toBe(403);
      expect((await chamar(h, 'POST', `${B}/incidentes/${id}/comunicacoes`, { destino: 'anpd' })).status).toBe(403);
    }
    expect((await chamar(alheio, 'PUT', `${B}/incidentes/${id}/risco`, { risco_titular: 'baixo' })).status).toBe(403);
    expect((await chamar(alheio, 'POST', `${B}/incidentes/${id}/comunicacoes`, { destino: 'anpd' })).status).toBe(403);
  });
});

describe('encerrar incidente', () => {
  const pronto = async () => {
    const { id } = await (await chamar(orgAdmin, 'POST', `${B}/incidentes`, { titulo: 'Vazamento de planilha', ciencia_em: '2026-10-14' })).json() as { id: string };
    expect((await chamar(orgAdmin, 'PUT', `${B}/incidentes/${id}/risco`, { risco_titular: 'baixo' })).status).toBe(200);
    return id;
  };
  const status = async (id: string) => (await env.DB.prepare('SELECT status FROM incidentes WHERE id = ?').bind(id).first<{ status: string }>())?.status;

  it('o administrador do cliente recebe 403 com mensagem em português e o incidente não muda', async () => {
    const id = await pronto();
    const r = await chamar(orgAdmin, 'POST', `${B}/incidentes/${id}/encerrar`);
    expect(r.status).toBe(403);
    expect((await r.json() as { error: string }).error).toBe('Encerrar o incidente é feito pela equipe da consultoria');
    expect(await status(id)).toBe('avaliado');
  });

  it('org_user e client também não encerram', async () => {
    const id = await pronto();
    for (const h of [colaborador, leitor]) expect((await chamar(h, 'POST', `${B}/incidentes/${id}/encerrar`)).status).toBe(403);
    expect(await status(id)).toBe('avaliado');
  });

  it('a equipe da consultoria encerra e a trilha leva o e-mail dela', async () => {
    const id = await pronto();
    expect((await chamar(consultor, 'POST', `${B}/incidentes/${id}/encerrar`)).status).toBe(200);
    expect(await status(id)).toBe('encerrado');
    expect((await trilha('incidente.encerrado'))?.actor).toBe('cons@ness.teste');
  });

  it('o CHECK do banco continua: encerrar sem risco avaliado é recusado em SQL direto', async () => {
    const { id } = await (await chamar(orgAdmin, 'POST', `${B}/incidentes`, { titulo: 'Sem avaliação', ciencia_em: '2026-10-14' })).json() as { id: string };
    await expect(env.DB.prepare(`UPDATE incidentes SET status = 'encerrado' WHERE id = ?`).bind(id).run()).rejects.toThrow(/CHECK/);
  });
});
