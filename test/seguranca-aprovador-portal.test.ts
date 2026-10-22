import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

/**
 * Endurecimento do aprovador e do portal de políticas (dados fictícios):
 * - senha definida por outra pessoa não aprova até a troca;
 * - a linha de quem assina na matriz de governança é do administrador do cliente;
 * - o portal de políticas só manda código a e-mail ligado ao projeto, com limite por IP.
 */
const P = 'sap-proj';
const SENHA = 'password123';
type Enviado = { to: string[]; subject: string; text: string; reply_to?: string };
let enviados: Enviado[] = [];
let adm: Record<string, string>, cons: Record<string, string>, orgAdmin: Record<string, string>;

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, extra: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), { ...workerEnv(), RESEND_API_KEY: 're_teste', ...extra });

beforeAll(async () => {
  await applySchema();
  const senha = await hashPassword(SENHA);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente Fictício', 'ISO 27701', 'controller', 'Active', 'org_ness')`).bind(P),
    ...['a', 'b', 'c'].map((d) => env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, data_category_risk, necessity_proportionality, technical_measures, residual_risk_level, status)
      VALUES (?, ?, 'Folha', 'Salário', 'Necessário', 'Criptografia', 'Medium', 'Under Review')`).bind(`sap-dpia-${d}`, P)),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('sap-adm', 'adm@ness.lat', ?, 'Adm', 'platform_admin', NULL, 'org_ness'),
      ('sap-cons', 'cons@ness.lat', ?, 'Cons', 'consultor', NULL, 'org_ness'),
      ('sap-oa', 'admin@cliente.lat', ?, 'Admin Cliente', 'org_admin', ?, 'org_ness'),
      ('sap-dir', 'dir@cliente.lat', ?, 'Dora Diretora', 'client', ?, 'org_ness')`).bind(senha, senha, senha, P, senha, P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('sap-g-cons', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'),
      ('sap-g-dir', ?, 'Dora Diretora', 'dir@cliente.lat', 'executivo', 'CEO'),
      ('sap-g-ti', ?, 'Tito TI', 'ti@cliente.lat', 'operacional', 'Analista de TI')`).bind(P, P, P),
  ]);
  adm = await sessionFor({ id: 'sap-adm', email: 'adm@ness.lat', name: 'Adm', role: 'platform_admin', org_id: 'org_ness' });
  cons = await sessionFor({ id: 'sap-cons', email: 'cons@ness.lat', role: 'consultor', org_id: 'org_ness' });
  orgAdmin = await sessionFor({ id: 'sap-oa', email: 'admin@cliente.lat', role: 'org_admin', client_project_id: P, org_id: 'org_ness' });
}, 60_000);

beforeEach(() => {
  enviados = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((async (u: RequestInfo | URL, init?: RequestInit) => {
    if (!String(u).startsWith('https://api.resend.com/')) throw new Error(`fetch inesperado: ${u}`);
    enviados.push(JSON.parse(String(init?.body)));
    return new Response('{}', { status: 200 });
  }) as typeof fetch);
});
afterEach(() => vi.restoreAllMocks());

describe('senha definida por outra pessoa', () => {
  const pedido = async (dpia: string) => {
    const r = await chamar(cons, 'POST', `/api/v1/projects/${P}/pedidos`, { tipo: 'dpia', ref_id: dpia, papel_exigido: 'ceo', destinatarios: [{ email: 'dir@cliente.lat' }] });
    expect(r.status, await r.clone().text()).toBe(201);
    return (await r.json()) as { id: string; hash: string };
  };

  it('gestor não define a senha de outro: a atual deixa de valer e o link vai ao e-mail da conta', async () => {
    const antes = (await env.DB.prepare('SELECT password_hash AS h FROM users WHERE id = ?').bind('sap-dir').first<{ h: string }>())!.h;
    const put = await chamar(adm, 'PUT', '/api/v1/users/sap-dir', { password: 'Senha-Do-Gestor-1' });
    expect(put.status, await put.clone().text()).toBe(200);
    const conta = (await env.DB.prepare('SELECT password_hash AS h, requires_password_change AS r FROM users WHERE id = ?').bind('sap-dir').first<{ h: string; r: number }>())!;
    expect(conta.r).toBe(1);
    expect(conta.h).not.toBe(antes);
    // Nem a senha que o gestor mandou nem a antiga entram.
    expect((await chamar({}, 'POST', '/api/v1/auth/login', { email: 'dir@cliente.lat', password: 'Senha-Do-Gestor-1' })).status).toBe(401);
    expect((await chamar({}, 'POST', '/api/v1/auth/login', { email: 'dir@cliente.lat', password: SENHA })).status).toBe(401);

    const aviso = enviados.find((e) => e.to[0] === 'dir@cliente.lat')!;
    expect(aviso.text).not.toContain('Senha-Do-Gestor-1');
    expect(aviso.reply_to).toBe('adm@ness.lat');
    const token = /#convite=([0-9a-f]{64})/.exec(aviso.text)![1];
    expect((await chamar({}, 'POST', '/api/v1/auth/criar-senha', { token, newPassword: 'Senha-Da-Dora-1' })).status).toBe(200);
    const login = await chamar({}, 'POST', '/api/v1/auth/login', { email: 'dir@cliente.lat', password: 'Senha-Da-Dora-1' });
    expect(login.status, await login.clone().text()).toBe(200);
    const dir = { Authorization: `Bearer ${((await login.json()) as { token: string }).token}` };
    const p1 = await pedido('sap-dpia-a');
    const ok = await chamar(dir, 'POST', `/api/v1/pedidos/${p1.id}/aprovar`, { senha: 'Senha-Da-Dora-1' });
    expect(ok.status, await ok.clone().text()).toBe(200);
  });

  it('marca de senha de outro: aprovação recusada até a troca', async () => {
    await env.DB.prepare('UPDATE users SET requires_password_change = 1, password_hash = ? WHERE id = ?').bind(await hashPassword(SENHA), 'sap-dir').run();
    const dir = await sessionFor({ id: 'sap-dir', email: 'dir@cliente.lat', role: 'client', client_project_id: P, org_id: 'org_ness' });
    const p1 = await pedido('sap-dpia-b');
    const negado = await chamar(dir, 'POST', `/api/v1/pedidos/${p1.id}/aprovar`, { senha: SENHA });
    expect(negado.status).toBe(403);
    expect(((await negado.json()) as { error: string }).error).toBe('Troque a senha definida por outra pessoa antes de aprovar.');
    expect((await chamar(dir, 'POST', '/api/v1/pedidos/lote', { senha: SENHA, itens: [{ tipo: 'pedido', id: p1.id, hash_visto: p1.hash }] })).status).toBe(403);
    expect((await chamar(dir, 'POST', `/api/v1/projects/${P}/dpia/sap-dpia-b/approve`, { role: 'ceo' })).status).toBe(403);
  });

  it('gestor que não é da plataforma não troca o e-mail de outra conta', async () => {
    const r = await chamar(orgAdmin, 'PUT', '/api/v1/users/sap-dir', { email: 'outro@atacante.lat' });
    expect(r.status).toBe(403);
    expect((await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind('sap-dir').first<{ email: string }>())!.email).toBe('dir@cliente.lat');
    // Mandar o mesmo e-mail (a tela manda sempre) não conta como troca.
    expect((await chamar(orgAdmin, 'PUT', '/api/v1/users/sap-dir', { email: 'dir@cliente.lat', name: 'Dora' })).status).toBe(200);
  });

  it('a própria pessoa trocando pela troca comum também libera', async () => {
    await env.DB.prepare('UPDATE users SET requires_password_change = 1, password_hash = ? WHERE id = ?').bind(await hashPassword(SENHA), 'sap-dir').run();
    const dir = await sessionFor({ id: 'sap-dir', email: 'dir@cliente.lat', role: 'client', client_project_id: P, org_id: 'org_ness' });
    const p = await pedido('sap-dpia-c');
    expect((await chamar(dir, 'POST', `/api/v1/pedidos/${p.id}/aprovar`, { senha: SENHA })).status).toBe(403);
    const troca = await chamar(dir, 'POST', '/api/v1/auth/change-password', { oldPassword: SENHA, newPassword: 'Senha-Da-Dora-2' });
    expect(troca.status, await troca.clone().text()).toBe(200);
    const dir2 = await sessionFor({ id: 'sap-dir', email: 'dir@cliente.lat', role: 'client', client_project_id: P, org_id: 'org_ness' });
    const ok = await chamar(dir2, 'POST', `/api/v1/pedidos/${p.id}/aprovar`, { senha: 'Senha-Da-Dora-2' });
    expect(ok.status, await ok.clone().text()).toBe(200);
  });
});

describe('linha de quem assina na matriz de governança', () => {
  const linha = { name: 'Nova CISO', email: 'ciso@cliente.lat', role_category: 'executivo', job_title: 'CISO' };

  it('consultor, plataforma e chave não criam, alteram nem removem linha de assinatura; outras linhas seguem livres', async () => {
    for (const h of [cons, adm]) {
      expect((await chamar(h, 'POST', `/api/v1/projects/${P}/governance`, linha)).status).toBe(403);
      expect((await chamar(h, 'POST', `/api/v1/projects/${P}/governance`, { id: 'sap-g-dir', name: 'Dora', email: 'outra@ness.lat', role_category: 'executivo', job_title: 'CEO' })).status).toBe(403);
      // rebaixar o cargo também é mexer na linha de quem assina
      expect((await chamar(h, 'POST', `/api/v1/projects/${P}/governance`, { id: 'sap-g-dir', name: 'Dora', email: 'dir@cliente.lat', role_category: 'executivo', job_title: 'Gerente' })).status).toBe(403);
      expect((await chamar(h, 'DELETE', `/api/v1/projects/${P}/governance/sap-g-dir`)).status).toBe(403);
      // promover uma linha comum a quem assina, idem
      expect((await chamar(h, 'POST', `/api/v1/projects/${P}/governance`, { id: 'sap-g-ti', name: 'Tito TI', email: 'ti@cliente.lat', role_category: 'operacional', job_title: 'DPO' })).status).toBe(403);
    }
    expect((await env.DB.prepare('SELECT email, job_title FROM project_governance WHERE id = ?').bind('sap-g-dir').first())).toEqual({ email: 'dir@cliente.lat', job_title: 'CEO' });
    const comum = await chamar(cons, 'POST', `/api/v1/projects/${P}/governance`, { id: 'sap-g-ti', name: 'Tito TI', email: 'ti@cliente.lat', role_category: 'operacional', job_title: 'Analista sênior' });
    expect(comum.status, await comum.clone().text()).toBe(200);
  });

  it('o administrador do cliente cria, altera e remove a linha de assinatura', async () => {
    expect((await chamar(orgAdmin, 'POST', `/api/v1/projects/${P}/governance`, linha)).status).toBe(200);
    const id = (await env.DB.prepare(`SELECT id FROM project_governance WHERE project_id = ? AND email = 'ciso@cliente.lat'`).bind(P).first<{ id: string }>())!.id;
    expect((await chamar(orgAdmin, 'POST', `/api/v1/projects/${P}/governance`, { ...linha, id, email: 'ciso2@cliente.lat' })).status).toBe(200);
    expect((await chamar(orgAdmin, 'DELETE', `/api/v1/projects/${P}/governance/${id}`)).status).toBe(200);
  });

  it('editar a parte encarregada não desvia a regra pela sincronização com a governança', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('sap-g-dpo', ?, 'Duda DPO', 'dpo@cliente.lat', 'dpo', 'DPO')`).bind(P),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES ('sap-parte-dpo', ?, 'pessoa', 'Duda DPO', 'dpo@cliente.lat')`).bind(P),
      env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('sap-v-dpo', ?, 'sap-parte-dpo', 'encarregado', 'projeto', ?)`).bind(P, P),
    ]);
    const r = await chamar(cons, 'PUT', `/api/v1/projects/${P}/partes/sap-parte-dpo`, { email: 'cons@ness.lat' });
    expect(r.status).toBe(403);
    expect((await env.DB.prepare('SELECT email FROM project_governance WHERE id = ?').bind('sap-g-dpo').first<{ email: string }>())!.email).toBe('dpo@cliente.lat');
    const ok = await chamar(orgAdmin, 'PUT', `/api/v1/projects/${P}/partes/sap-parte-dpo`, { email: 'dpo2@cliente.lat' });
    expect(ok.status, await ok.clone().text()).toBe(200);
    expect((await env.DB.prepare('SELECT email FROM project_governance WHERE id = ?').bind('sap-g-dpo').first<{ email: string }>())!.email).toBe('dpo2@cliente.lat');
  });
});

describe('portal de políticas: código só a e-mail ligado ao projeto', () => {
  let ip = 0;
  const pedirCodigo = (email: string, extra: Record<string, unknown> = {}, ipFixo?: string) =>
    chamar({ 'CF-Connecting-IP': ipFixo ?? `10.7.0.${++ip}` }, 'POST', '/api/v1/public/policies/request-otp', { project_id: P, name: '<b>Nome</b>', email }, extra);

  it('e-mail do projeto e do mesmo domínio do cliente recebem; o nome digitado não vai no e-mail', async () => {
    for (const email of ['ti@cliente.lat', 'qualquer@cliente.lat']) {
      const r = await pedirCodigo(email, { ENVIRONMENT: 'production' });
      expect(r.status, await r.clone().text()).toBe(200);
      const e = enviados.find((x) => x.to[0] === email)!;
      expect(e.text).toContain('Olá,');
      expect(e.text).not.toContain('Nome');
    }
  });

  it('domínio público, da consultoria ou desconhecido: mesma resposta, nada enviado, nenhum código guardado', async () => {
    const ok = await (await pedirCodigo('ti@cliente.lat', { ENVIRONMENT: 'production' })).json();
    for (const email of ['alguem@gmail.com', 'outro@ness.com.br', 'intruso@ness.lat', 'x@desconhecido.lat']) {
      const r = await pedirCodigo(email, { ENVIRONMENT: 'production' });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ ...(ok as object), message: `Código de verificação enviado para ${email}.` });
      expect(enviados.some((x) => x.to[0] === email)).toBe(false);
      expect(await env.SESSIONS.get(`otp_${P}_${email}`)).toBeNull();
    }
  });

  it('limite por IP: o 21º pedido na hora do mesmo IP é 429', async () => {
    for (let i = 0; i < 20; i++) expect((await pedirCodigo(`p${i}@cliente.lat`, {}, '10.8.8.8')).status, `pedido ${i + 1}`).toBe(200);
    expect((await pedirCodigo('p20@cliente.lat', {}, '10.8.8.8')).status).toBe(429);
  });

  it('nome acima de 120 caracteres é recusado', async () => {
    const r = await chamar({ 'CF-Connecting-IP': '10.7.9.9' }, 'POST', '/api/v1/public/policies/request-otp', { project_id: P, name: 'x'.repeat(121), email: 'ti@cliente.lat' });
    expect(r.status).toBe(400);
  });
});
