import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';

/**
 * Avisos por e-mail (decisão do dono, 15/10): pedido de APROVAÇÃO criado avisa cada destinatário; o envio do questionário de
 * homologação avisa a equipe (os mesmos do sino). Envio que falha não derruba a rota; sem RESEND_API_KEY nada sai. Dados fictícios.
 */
type Enviado = { to: string[]; from: string; subject: string; html: string; text: string; reply_to?: string };
let enviados: Enviado[] = [];
let resendOk = true;
const P = 'ea-proj';
const CTRL = 'ea-pol';
const TITULO = 'Política <b>de</b> Acesso';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, comChave = true) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), { ...workerEnv(), ...(comChave ? { RESEND_API_KEY: 're_teste' } : {}) } as any);

let consultor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente <Ficticio>', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description, status) VALUES (?, ?, 'ISO 27001:2022', ?, 'Texto da politica.', 'Partial')`).bind(CTRL, P, TITULO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('ea-cons', 'cons@ea.lat', 'x', 'Cons Ficticio', 'consultor', NULL, 'org_ness'),
      ('ea-ciso', 'ciso@cliente.lat', 'x', 'Cida', 'org_user', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('ea-g1', ?1, 'Cons Ficticio', 'cons@ea.lat', 'consultor', 'Consultor'),
      ('ea-g2', ?1, 'Cida', 'ciso@cliente.lat', 'executivo', 'CISO')`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, terceiro_tipo) VALUES ('ea-forn', ?, 'organizacao', 'Fornecedor <Ficticio>', 'medio')`).bind(P),
  ]);
  await habilitarPrivacy(P);
  await concederModulos('ea-cons', ['iso', 'privacy']);
  consultor = await sessionFor({ id: 'ea-cons', email: 'cons@ea.lat', name: 'Cons Ficticio', role: 'consultor', org_id: 'org_ness' });
}, 60_000);

beforeEach(() => {
  enviados = [];
  resendOk = true;
  vi.spyOn(globalThis, 'fetch').mockImplementation((async (u: RequestInfo | URL, init?: RequestInit) => {
    if (!String(u).startsWith('https://api.resend.com/')) throw new Error(`fetch inesperado: ${u}`);
    enviados.push(JSON.parse(String(init?.body)));
    return new Response('{}', { status: resendOk ? 200 : 500 });
  }) as typeof fetch);
});
afterEach(() => vi.restoreAllMocks());

const pedirAprovacao = (comChave = true) => chamar(consultor, 'POST', `/api/v1/projects/${P}/pedidos`,
  { tipo: 'politica', ref_id: CTRL, papel_exigido: 'ciso', destinatarios: [{ email: 'ciso@cliente.lat' }] }, comChave);

describe('pedido de aprovação criado', () => {
  it('o destinatário recebe um e-mail: quem pede, o que aprovar, até quando, link para Minhas aprovações, resposta a quem pediu', async () => {
    const r = await pedirAprovacao();
    expect(r.status, await r.clone().text()).toBe(201);
    expect(enviados).toHaveLength(1);
    const e = enviados[0];
    expect(e.to).toEqual(['ciso@cliente.lat']);
    expect(e.reply_to).toBe('cons@ea.lat');
    expect(e.subject).toMatch(/^Cliente <Ficticio> pede a sua aprovação: /);
    expect(e.subject).toContain(TITULO);
    for (const corpo of [e.html, e.text]) {
      expect(corpo).toContain('Cons Ficticio (cons@ea.lat)');
      expect(corpo).toContain('Política');
      expect(corpo).toContain('Líder SGSI');
      expect(corpo).toContain('Sem data marcada');
      expect(corpo).toContain('https://n360.ness.com.br/?tela=meus-pedidos');
    }
    expect(e.text).toContain(TITULO);
    expect(e.html).toContain('Política &lt;b&gt;de&lt;/b&gt; Acesso');
    expect(e.html).not.toContain('<b>de</b>');
    expect(e.html + e.text).not.toMatch(/n\.iso|n\.privacy/);
  });

  it('falha do Resend não derruba a criação: o pedido fica gravado', async () => {
    resendOk = false;
    const r = await pedirAprovacao();
    expect(r.status).toBe(201);
    const { id } = await r.json() as { id: string };
    expect(await env.DB.prepare('SELECT status FROM pedidos WHERE id = ?').bind(id).first<string>('status')).toBe('aberto');
    expect(enviados).toHaveLength(1);
  });

  it('sem RESEND_API_KEY nada é enviado e o pedido nasce', async () => {
    const r = await pedirAprovacao(false);
    expect(r.status).toBe(201);
    expect(enviados).toHaveLength(0);
  });
});

describe('homologação enviada pelo fornecedor', () => {
  const novaHomologacao = async () => {
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/homologacoes`, { parte_id: 'ea-forn', dias: 10 });
    expect(r.status, await r.clone().text()).toBe(201);
    const { url } = await r.json() as { url: string };
    enviados = [];
    return url.split('#')[1];
  };
  const perguntas = async (token: string) =>
    ((await (await chamar({}, 'POST', '/api/v1/public/homologacao/ver', { token })).json()) as { perguntas: { id: string }[] }).perguntas.map((p) => p.id);

  it('a equipe recebe e-mail com o fornecedor, o percentual e o link de Terceiros; nunca o token; o reenvio não repete', async () => {
    const token = await novaHomologacao();
    const ids = await perguntas(token);
    const metade = ids.slice(0, ids.length / 2);
    const r = await chamar({}, 'POST', '/api/v1/public/homologacao/enviar', { token, respostas: Object.fromEntries(metade.map((q) => [q, { resposta: 'sim' }])) });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(enviados).toHaveLength(1);
    const e = enviados[0];
    expect(e.to).toEqual(['cons@ea.lat']);
    expect(e.subject).toBe('Fornecedor <Ficticio> respondeu à homologação');
    for (const corpo of [e.html, e.text]) {
      expect(corpo).toContain('50% (');
      expect(corpo).toContain('https://n360.ness.com.br/privacy?tela=terceiros');
      expect(corpo).not.toContain(token);
    }
    expect(e.html).toContain('Fornecedor &lt;Ficticio&gt;');
    expect(e.html).not.toContain('<Ficticio>');
    expect(e.from).toMatch(/via n\.privacy|n\.privacy \|/);

    const de_novo = await chamar({}, 'POST', '/api/v1/public/homologacao/enviar', { token, respostas: {} });
    expect(de_novo.status).toBe(404);
    expect(enviados).toHaveLength(1);
  });

  it('falha do Resend não derruba o envio do fornecedor', async () => {
    const token = await novaHomologacao();
    resendOk = false;
    const r = await chamar({}, 'POST', '/api/v1/public/homologacao/enviar', { token, respostas: {} });
    expect(r.status).toBe(200);
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM notifications WHERE type = 'homologacao_enviada' AND user_id = 'ea-cons'`).first<number>('n')).toBeGreaterThan(0);
  });

  it('sem RESEND_API_KEY o sino avisa e nenhum e-mail sai', async () => {
    const token = await novaHomologacao();
    const r = await chamar({}, 'POST', '/api/v1/public/homologacao/enviar', { token, respostas: {} }, false);
    expect(r.status).toBe(200);
    expect(enviados).toHaveLength(0);
  });
});
