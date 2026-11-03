import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';

/**
 * Portal público de solicitações do titular (migration 0096, spec 2026-11-03). Link por projeto (só o SHA-256 do token), recepção
 * pública que cria o pedido (canal `formulario`) e devolve o protocolo, e tratativas do atendimento. Reversão da decisão de 09/10.
 */
const P = 'tp-proj';
const B = `/api/v1/projects/${P}`;

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());

const publico = (corpo: unknown) =>
  app.fetch(new Request('http://localhost/api/v1/public/titular-pedidos/abrir', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  }), workerEnv());

let consultor: Record<string, string>, leitor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('tp-cons', 'cons@ness.teste', 'x', 'Cons', 'consultor', NULL, 'org_ness'),
      ('tp-cl', 'leitor@cliente.teste', 'x', 'Leitor', 'client', ?1, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-tp', ?, 'Cons', 'cons@ness.teste', 'consultor', 'Consultor')`).bind(P),
  ]);
  await habilitarPrivacy(P);
  await concederModulos(['tp-cons', 'tp-cl'], ['privacy']);
  consultor = await sessionFor({ id: 'tp-cons', email: 'cons@ness.teste', role: 'consultor' });
  leitor = await sessionFor({ id: 'tp-cl', email: 'leitor@cliente.teste', role: 'client', client_project_id: P });
});

const tokenDe = (url: string) => url.split('#')[1];

describe('link público do portal', () => {
  let token = '';

  it('nasce desligado; a equipe gera o link; GET passa a ativo', async () => {
    expect(await (await chamar(consultor, 'GET', `${B}/titular-portal`)).json()).toMatchObject({ ativo: false });
    const r = await chamar(consultor, 'POST', `${B}/titular-portal`);
    expect(r.status, await r.clone().text()).toBe(201);
    const { url } = await r.json() as { url: string };
    expect(url).toContain('/solicitacao#');
    token = tokenDe(url);
    expect(token.length).toBeGreaterThan(10);
    expect(await (await chamar(consultor, 'GET', `${B}/titular-portal`)).json()).toMatchObject({ ativo: true });
    // só o hash no banco, nunca o token
    const linha = await env.DB.prepare('SELECT token_hash FROM titular_portais WHERE project_id = ?').bind(P).first<{ token_hash: string }>();
    expect(linha!.token_hash).not.toContain(token);
  });

  it('o cliente (read-only) não gera o link', async () => {
    expect((await chamar(leitor, 'POST', `${B}/titular-portal`)).status).toBe(403);
  });

  it('recepção pública cria o pedido (canal formulário) e devolve o protocolo', async () => {
    const r = await publico({ token, tipo: 'acesso', titular_nome: 'Fulano de Tal', titular_contato: 'fulano@exemplo.com', descricao: 'Quero acesso aos meus dados.' });
    expect(r.status, await r.clone().text()).toBe(201);
    const { protocolo } = await r.json() as { protocolo: string };
    expect(protocolo).toMatch(/^PT-\d{4}-\d+$/);
    const pedidos = await (await chamar(consultor, 'GET', `${B}/titular-pedidos`)).json() as any[];
    const p = pedidos.find((x) => x.protocolo === protocolo);
    expect(p).toMatchObject({ tipo: 'acesso', canal: 'formulario', titular_nome: 'Fulano de Tal', status: 'recebido' });
    expect((await env.DB.prepare('SELECT criado_por FROM titular_pedidos WHERE protocolo = ? AND project_id = ?').bind(protocolo, P).first<{ criado_por: string }>())!.criado_por).toBe('sistema:portal');
  });

  it('token desconhecido: 404; corpo inválido: 400', async () => {
    expect((await publico({ token: 'nao-existe-token-aqui', tipo: 'acesso', titular_nome: 'X', titular_contato: 'x@e.com', descricao: 'y' })).status).toBe(404);
    expect((await publico({ token, tipo: 'invalido', titular_nome: 'X', titular_contato: 'x@e.com', descricao: 'y' })).status).toBe(400);
    expect((await publico({ token, tipo: 'acesso', titular_nome: '', titular_contato: 'x@e.com', descricao: 'y' })).status).toBe(400);
  });

  it('desativar o portal derruba o link: a recepção passa a dar o mesmo 404', async () => {
    expect((await chamar(consultor, 'POST', `${B}/titular-portal/desativar`)).status).toBe(200);
    expect((await publico({ token, tipo: 'acesso', titular_nome: 'X', titular_contato: 'x@e.com', descricao: 'y' })).status).toBe(404);
  });
});

describe('tratativas do atendimento', () => {
  let pedidoId = '';
  beforeAll(async () => {
    const r = await chamar(consultor, 'POST', `${B}/titular-pedidos`, { tipo: 'acesso', recebido_em: '2026-10-01' });
    pedidoId = (await r.json() as { id: string }).id;
  });

  it('a equipe registra tratativas e elas são listadas em ordem; tipo inválido é 400', async () => {
    expect((await chamar(consultor, 'POST', `${B}/titular-pedidos/${pedidoId}/tratativas`, { tipo: 'encaminhamento', texto: 'Encaminhado ao ponto focal de RH.' })).status).toBe(201);
    expect((await chamar(consultor, 'POST', `${B}/titular-pedidos/${pedidoId}/tratativas`, { tipo: 'evidencia', texto: 'Recebida a planilha do RH.' })).status).toBe(201);
    const lista = await (await chamar(consultor, 'GET', `${B}/titular-pedidos/${pedidoId}/tratativas`)).json() as any[];
    expect(lista.map((t) => t.tipo)).toEqual(['encaminhamento', 'evidencia']);
    expect((await chamar(consultor, 'POST', `${B}/titular-pedidos/${pedidoId}/tratativas`, { tipo: 'coisa', texto: 'x' })).status).toBe(400);
  });

  it('o cliente (read-only) não registra tratativa, mas lê', async () => {
    expect((await chamar(leitor, 'POST', `${B}/titular-pedidos/${pedidoId}/tratativas`, { tipo: 'nota', texto: 'x' })).status).toBe(403);
    expect((await chamar(leitor, 'GET', `${B}/titular-pedidos/${pedidoId}/tratativas`)).status).toBe(200);
  });

  it('pedido inexistente: 404', async () => {
    expect((await chamar(consultor, 'GET', `${B}/titular-pedidos/nao-existe/tratativas`)).status).toBe(404);
  });
});
