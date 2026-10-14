import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Aprovação em lote: cada item passa pela MESMA regra da aprovação individual (autoridade, segregação, hash); o lote só
 * junta a senha. Item que falha não derruba os outros e a resposta diz por quê.
 */
const P = 'lote-proj';
const SENHA = 'password123';
let lider: Record<string, string>, cons: Record<string, string>, cliente: Record<string, string>;
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());

type Res = { tipo: string; id: string; resultado: 'aprovado' | 'ignorado'; motivo?: string };
const lote = (h: Record<string, string>, itens: unknown[], senha = SENHA) => chamar(h, 'POST', '/api/v1/pedidos/lote', { senha, itens });
const corpoLote = async (r: Response) => (await r.json()) as { ok: boolean; aprovados: number; resultados: Res[] };

const pedidoDe = async (dpia: string) => {
  const r = await chamar(cons, 'POST', `/api/v1/projects/${P}/pedidos`, { tipo: 'dpia', ref_id: dpia, papel_exigido: 'ciente', destinatarios: [{ email: 'lider@ness.lat' }] });
  expect(r.status, await r.clone().text()).toBe(201);
  return (await r.json()) as { id: string; hash: string };
};
const statusDoPedido = async (id: string) =>
  (await env.DB.prepare('SELECT status FROM pedido_destinatarios WHERE pedido_id = ?').bind(id).first<{ status: string }>())?.status;
const enviarEvidencia = async (nome: string) => {
  const form = new FormData();
  form.append('file', new File([`conteudo ${nome}`], `${nome}.txt`, { type: 'text/plain' }));
  const up = await app.fetch(new Request(`http://localhost/api/v1/projects/${P}/evidence/upload`, { method: 'POST', headers: cliente, body: form }), workerEnv());
  expect(up.status).toBe(201);
  const { id } = (await up.json()) as { id: string };
  const hash = String((await env.DB.prepare('SELECT file_hash FROM evidence WHERE id = ?').bind(id).first<{ file_hash: string }>())!.file_hash);
  return { id, hash };
};
const assinada = async (id: string) => (await env.DB.prepare('SELECT ciso_approved_by FROM evidence WHERE id = ?').bind(id).first<{ ciso_approved_by: string | null }>())?.ciso_approved_by;

beforeAll(async () => {
  await applySchema();
  const senha = await hashPassword(SENHA);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27701', 'controller', 'Active', 'org_ness')`).bind(P),
    ...['d1', 'd2', 'd3', 'd4', 'd5'].map((d) => env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, data_category_risk, necessity_proportionality, technical_measures, residual_risk_level, status)
      VALUES (?, ?, 'Folha', 'Salário', 'Necessário', 'Criptografia', 'Medium', 'Under Review')`).bind(`lote-${d}`, P)),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-lider', 'lider@ness.lat', ?, 'Lia Lider', 'consultor', NULL, 'org_ness'),
      ('u-cons', 'cons@ness.lat', ?, 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', ?, 'org_ness')`).bind(senha, senha, P),
    env.DB.prepare(`INSERT OR IGNORE INTO organizations (id, name, slug) VALUES ('org_alheia', 'Outra', 'outra')`),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('lote-alheio', 'Alheio', 'ISO 27701', 'controller', 'Active', 'org_alheia')`),
    env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, file_hash, r2_key, uploaded_by) VALUES ('ev-alheia', 'lote-alheio', 'a.txt', 'abc123', 'k', 'x@outra.lat')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('g-lider', ?, 'Lia Lider', 'lider@ness.lat', 'consultor', 'Líder do SGSI'),
      ('g-cons', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P, P),
  ]);
  lider = await sessionFor({ id: 'u-lider', email: 'lider@ness.lat', name: 'Lia Lider', role: 'consultor' });
  cons = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', name: 'Cli', role: 'org_user', client_project_id: P });
}, 60_000);

describe('lote misto', () => {
  it('aprova o que pode, ignora o que mudou, o que já foi decidido e a evidência do próprio autor, e diz por quê', async () => {
    const p1 = await pedidoDe('lote-d1');
    const p2 = await pedidoDe('lote-d2');
    const p3 = await pedidoDe('lote-d3');
    const e1 = await enviarEvidencia('um');
    const e2 = await enviarEvidencia('dois');
    // a evidência do próprio líder: segregação de funções
    const form = new FormData();
    form.append('file', new File(['do lider'], 'lider.txt', { type: 'text/plain' }));
    const up = await app.fetch(new Request(`http://localhost/api/v1/projects/${P}/evidence/upload`, { method: 'POST', headers: lider, body: form }), workerEnv());
    const e3 = (await up.json()) as { id: string };
    const e3hash = String((await env.DB.prepare('SELECT file_hash FROM evidence WHERE id = ?').bind(e3.id).first<{ file_hash: string }>())!.file_hash);

    // p3 já decidido antes do lote
    expect((await chamar(lider, 'POST', `/api/v1/pedidos/${p3.id}/aprovar`, { senha: SENHA })).status).toBe(200);

    const r = await lote(lider, [
      { tipo: 'pedido', id: p1.id, hash_visto: p1.hash },
      { tipo: 'pedido', id: p2.id, hash_visto: 'f'.repeat(64) },
      { tipo: 'pedido', id: p3.id, hash_visto: p3.hash },
      { tipo: 'evidencia', id: e1.id, hash_visto: e1.hash },
      { tipo: 'evidencia', id: e2.id, hash_visto: 'e'.repeat(64) },
      { tipo: 'evidencia', id: e3.id, hash_visto: e3hash },
    ]);
    expect(r.status).toBe(200);
    const j = await corpoLote(r);
    const por = (id: string) => j.resultados.find((x) => x.id === id)!;
    expect(j.aprovados).toBe(2);
    expect(por(p1.id).resultado).toBe('aprovado');
    expect(por(p2.id)).toMatchObject({ resultado: 'ignorado', motivo: expect.stringContaining('conteúdo mudou') });
    expect(por(p3.id)).toMatchObject({ resultado: 'ignorado', motivo: expect.stringContaining('não está mais aberto') });
    expect(por(e1.id).resultado).toBe('aprovado');
    expect(por(e2.id)).toMatchObject({ resultado: 'ignorado', motivo: expect.stringContaining('conteúdo da evidência mudou') });
    expect(por(e3.id)).toMatchObject({ resultado: 'ignorado', motivo: expect.stringContaining('Quem enviou') });

    expect(await statusDoPedido(p1.id)).toBe('ciente');
    expect(await statusDoPedido(p2.id)).toBe('pendente');
    expect(await assinada(e1.id)).toBe('Lia Lider');
    expect(await assinada(e2.id)).toBeNull();
    expect(await assinada(e3.id)).toBeNull();
    const t = await env.DB.prepare(`SELECT count(*) AS n FROM audit_logs WHERE action = 'aprovacao.lote'`).first<{ n: number }>();
    expect(t?.n).toBe(1);
  });
});

describe('o que o lote recusa', () => {
  it('senha errada: 401 e nada é decidido', async () => {
    const p = await pedidoDe('lote-d4');
    const r = await lote(lider, [{ tipo: 'pedido', id: p.id, hash_visto: p.hash }], 'senha-errada');
    expect(r.status).toBe(401);
    expect(await statusDoPedido(p.id)).toBe('pendente');
  });

  it('corpo inválido: vazio, mais de 50, tipo desconhecido, campo a mais e hash faltando são 400', async () => {
    const item = { tipo: 'pedido', id: 'x', hash_visto: 'h' };
    expect((await lote(lider, [])).status).toBe(400);
    expect((await lote(lider, Array.from({ length: 51 }, () => item))).status).toBe(400);
    expect((await lote(lider, [{ ...item, tipo: 'controle' }])).status).toBe(400);
    expect((await lote(lider, [{ ...item, extra: 1 }])).status).toBe(400);
    expect((await lote(lider, [{ tipo: 'pedido', id: 'x' }])).status).toBe(400);
  });

  it('pedido de outra pessoa e evidência inexistente são ignorados, sem derrubar o lote', async () => {
    const p = await pedidoDe('lote-d5');
    const r = await lote(cons, [{ tipo: 'pedido', id: p.id, hash_visto: p.hash }, { tipo: 'evidencia', id: 'nao-existe', hash_visto: 'h' }]);
    expect(r.status).toBe(200);
    const j = await corpoLote(r);
    expect(j.aprovados).toBe(0);
    expect(j.resultados.every((x) => x.resultado === 'ignorado')).toBe(true);
    expect(await statusDoPedido(p.id)).toBe('pendente');
  });
});

describe('isolamento entre organizações', () => {
  it('evidência de outra organização e evidência inexistente têm a mesma resposta, e a alheia não é assinada', async () => {
    const r = await lote(lider, [{ tipo: 'evidencia', id: 'ev-alheia', hash_visto: 'abc123' }, { tipo: 'evidencia', id: 'nao-existe', hash_visto: 'abc123' }]);
    expect(r.status).toBe(200);
    const j = await corpoLote(r);
    expect(j.aprovados).toBe(0);
    expect(j.resultados.map((x) => x.motivo)).toEqual(['Item não encontrado ou sem acesso', 'Item não encontrado ou sem acesso']);
    expect(await assinada('ev-alheia')).toBeNull();
  });
});
