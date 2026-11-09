import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';
import { avisosDeHomologacao } from '../src/services/homologacao';

/** Fatia 4 do ciclo de avaliação do fornecedor: prorrogar, novo link, lembrete ao fornecedor e sino da equipe. Dados fictícios. */
const P = 'cl-proj';
const base = `/api/v1/projects/${P}/homologacoes`;
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;

let consultor: Record<string, string>, cliente: Record<string, string>;
let enviados: { to: string[]; subject: string; html: string; text: string; reply_to?: string }[] = [];

const criar = async (corpo: object = {}) => {
  const r = await chamar(consultor, 'POST', base, { parte_id: 'cl-f', ...corpo });
  expect(r.status, await r.clone().text()).toBe(201);
  return json<{ id: string; url: string; expira_em: string }>(r);
};
const linha = (id: string) => env.DB.prepare('SELECT status, email_destino, lembrete_em, expira_em FROM homologacoes WHERE id = ?').bind(id)
  .first<{ status: string; email_destino: string | null; lembrete_em: string | null; expira_em: string }>();
const venceEm = (id: string, modificador: string) => env.DB.prepare(`UPDATE homologacoes SET expira_em = datetime('now', ?) WHERE id = ?`).bind(modificador, id).run();
const sinos = (tipo: string) => env.DB.prepare(`SELECT user_id, title, message FROM notifications WHERE type = ? ORDER BY user_id`).bind(tipo).all<{ user_id: string; title: string; message: string }>().then((r) => r.results);

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente Ficticio', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('cl-cons', 'cons@cl.lat', 'x', 'Cons Ficticio', 'consultor', NULL, 'org_ness'),
      ('cl-cli', 'cli@cl.lat', 'x', 'Cli', 'org_admin', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('cl-g', ?, 'Cons', 'cons@cl.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, terceiro_tipo) VALUES ('cl-f', ?, 'organizacao', 'Fornecedor Ficticio', 'medio')`).bind(P),
  ]);
  await habilitarPrivacy(P);
  await concederModulos(['cl-cons', 'cl-cli'], ['privacy']);
  consultor = await sessionFor({ id: 'cl-cons', email: 'cons@cl.lat', role: 'consultor', org_id: 'org_ness' });
  cliente = await sessionFor({ id: 'cl-cli', email: 'cli@cl.lat', role: 'org_admin', client_project_id: P, org_id: 'org_ness' });
});

beforeEach(() => {
  enviados = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((async (u: RequestInfo | URL, init?: RequestInit) => {
    if (!String(u).startsWith('https://api.resend.com/')) throw new Error(`fetch inesperado: ${u}`);
    enviados.push(JSON.parse(String(init?.body)));
    return new Response('{}', { status: 200 });
  }) as typeof fetch);
});
afterEach(() => vi.restoreAllMocks());

describe('prorrogar e novo link', () => {
  it('o e-mail do fornecedor fica gravado só enquanto a homologação está aberta', async () => {
    const h = await criar({ email: 'contato@fornecedor.lat' });
    expect((await linha(h.id))!.email_destino).toBe('contato@fornecedor.lat');
    expect((await chamar(consultor, 'POST', `${base}/${h.id}/cancelar`)).status).toBe(200);
    expect(await linha(h.id)).toMatchObject({ status: 'cancelada', email_destino: null });
  });

  it('prorrogar: só a equipe, só aberta (vencida sem resposta inclusive), conta de agora e libera o lembrete de novo', async () => {
    const h = await criar();
    await venceEm(h.id, '-1 day');
    await env.DB.prepare(`UPDATE homologacoes SET lembrete_em = CURRENT_TIMESTAMP WHERE id = ?`).bind(h.id).run();
    expect((await chamar(cliente, 'PUT', `${base}/${h.id}/prazo`, { dias: 10 })).status).toBe(403);
    expect((await chamar(consultor, 'PUT', `${base}/${h.id}/prazo`, { dias: 61 })).status).toBe(400);
    const r = await chamar(consultor, 'PUT', `${base}/${h.id}/prazo`, { dias: 10 });
    expect(r.status, await r.clone().text()).toBe(200);
    const depois = (await linha(h.id))!;
    expect(depois.lembrete_em).toBeNull();
    expect(Date.parse(depois.expira_em + 'Z') - Date.now()).toBeGreaterThan(9 * 86_400_000);
    expect((await json<{ expira_em: string }>(r)).expira_em).toBe(depois.expira_em);
    await env.DB.prepare(`UPDATE homologacoes SET status = 'respondida', enviada_em = CURRENT_TIMESTAMP WHERE id = ?`).bind(h.id).run();
    expect((await chamar(consultor, 'PUT', `${base}/${h.id}/prazo`, { dias: 10 })).status).toBe(409);
    expect((await chamar(consultor, 'PUT', `${base}/nao-existe/prazo`, { dias: 10 })).status).toBe(404);
  });

  it('novo link: cancela a aberta, cria outra para o mesmo fornecedor com o link uma vez; respondida não ganha link novo', async () => {
    const h = await criar({ email: 'antigo@fornecedor.lat' });
    expect((await chamar(cliente, 'POST', `${base}/${h.id}/novo-link`, {})).status).toBe(403);
    const r = await chamar(consultor, 'POST', `${base}/${h.id}/novo-link`, { dias: 20, email: 'novo@fornecedor.lat' });
    expect(r.status, await r.clone().text()).toBe(201);
    const nova = await json<{ id: string; url: string }>(r);
    expect(nova.id).not.toBe(h.id);
    expect(nova.url).toContain('/homologacao#');
    expect(await linha(h.id)).toMatchObject({ status: 'cancelada', email_destino: null });
    expect(await linha(nova.id)).toMatchObject({ status: 'aberta', email_destino: 'novo@fornecedor.lat' });
    expect(await env.DB.prepare('SELECT parte_id FROM homologacoes WHERE id = ?').bind(nova.id).first('parte_id')).toBe('cl-f');
    expect((await chamar(consultor, 'POST', `${base}/${h.id}/novo-link`, {})).status).toBe(409);
    await chamar(consultor, 'POST', `${base}/${nova.id}/cancelar`);
  });
});

describe('avisos da rotina das 08:00', () => {
  it('sino da equipe: vence em 3 dias, vencido sem resposta e respondido parado; uma vez cada; prorrogar rearma', async () => {
    const vence = await criar();
    await venceEm(vence.id, '+2 days');
    const vencida = await criar();
    await venceEm(vencida.id, '-1 day');
    const parada = await criar();
    await env.DB.prepare(`UPDATE homologacoes SET status = 'respondida', enviada_em = datetime('now', '-3 days') WHERE id = ?`).bind(parada.id).run();
    await avisosDeHomologacao(workerEnv());
    expect(await sinos('homologacao_vence')).toEqual([expect.objectContaining({ user_id: 'cl-cons', title: 'Questionário vence em 3 dias' })]);
    expect((await sinos('homologacao_vencida'))[0].message).toContain('Fornecedor Ficticio');
    expect(await sinos('homologacao_parada')).toHaveLength(1);
    await avisosDeHomologacao(workerEnv());
    expect(await sinos('homologacao_vence')).toHaveLength(1);
    expect(await sinos('homologacao_parada')).toHaveLength(1);
    // prorrogado para outra data, o link que vence de novo avisa de novo
    await chamar(consultor, 'PUT', `${base}/${vence.id}/prazo`, { dias: 1 });
    await avisosDeHomologacao(workerEnv());
    expect(await sinos('homologacao_vence')).toHaveLength(2);
    for (const h of [vence, vencida, parada]) await chamar(consultor, 'POST', `${base}/${h.id}/cancelar`);
  });

  it('lembrete ao fornecedor: um só, sem o link, só com e-mail gravado e com o envio configurado de verdade', async () => {
    const com = await criar({ email: 'contato@fornecedor.lat' });
    const sem = await criar();
    await venceEm(com.id, '+2 days');
    await venceEm(sem.id, '+2 days');
    await avisosDeHomologacao(workerEnv()); // sem a chave: nada sai e nada é marcado
    expect(enviados).toHaveLength(0);
    expect((await linha(com.id))!.lembrete_em).toBeNull();
    const comChave = { ...workerEnv(), RESEND_API_KEY: 're_teste' } as ReturnType<typeof workerEnv>;
    const r = await avisosDeHomologacao(comChave);
    expect(r.lembretes).toBe(1);
    expect(enviados.map((e) => e.to[0])).toEqual(['contato@fornecedor.lat']);
    const m = enviados[0];
    expect(m.subject).toContain('Fornecedor Ficticio');
    expect(m.reply_to).toBe('cons@cl.lat');
    expect(m.html + m.text).not.toContain('/homologacao#');
    expect((await linha(com.id))!.lembrete_em).not.toBeNull();
    await avisosDeHomologacao(comChave);
    expect(enviados).toHaveLength(1);
  });
});
