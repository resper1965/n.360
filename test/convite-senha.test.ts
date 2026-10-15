import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';
import { hashPassword, sha256Hex } from '../src/helpers';

/**
 * Convite com link para criar a senha (decisão do dono, 15/10/2026): a conta nasce sem senha, o e-mail leva o link (token no
 * fragmento, só o hash no banco, 72 h, uso único) e nunca uma senha. Dados fictícios.
 */
type Enviado = { to: string[]; subject: string; html: string; text: string };
let enviados: Enviado[] = [];
let ip = 0;
const ENV = { ...workerEnv(), RESEND_API_KEY: 're_teste' };
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.77.0.${++ip % 250}`, ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), ENV as any);
const tokenDe = (e: Enviado) => /#convite=([0-9a-f]{64})/.exec(e.text)?.[1] ?? '';
const P = 'cv-proj';
const SENHA = 'Minha-senha-nova-1';
const GENERICO = 'Este link não vale mais. Peça um convite novo a quem convidou ou use "Esqueci a senha".';
let admin: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('cv-adm', 'adm@cv.lat', ?, 'Adm', 'platform_admin', 'org_ness')`).bind(await hashPassword('x-senha-qualquer')),
    env.DB.prepare(`INSERT INTO project_sso (project_id, issuer, client_id, client_secret, dominios, ativo) VALUES (?, 'https://idp.sso.lat', 'cid', 'seg', 'sso.lat', 1)`).bind(P),
  ]);
  admin = await sessionFor({ id: 'cv-adm', email: 'adm@cv.lat', name: 'Adm', role: 'platform_admin' });
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

const criarConta = async (email: string) => {
  const r = await chamar(admin, 'POST', '/api/v1/users', { email, name: 'Pessoa Convidada', role: 'org_user', client_project_id: P, password: 'Senha-que-ninguem-usa-1' });
  expect(r.status, await r.clone().text()).toBe(201);
  return (await r.json() as { id: string }).id;
};
const login = (email: string, password: string) => chamar({}, 'POST', '/api/v1/auth/login', { email, password });
const criarSenha = (token: string, newPassword = SENHA) => chamar({}, 'POST', '/api/v1/auth/criar-senha', { token, newPassword });

describe('convite por link', () => {
  it('o e-mail traz o link e nenhuma senha; o banco guarda só o hash; a conta não entra antes do link', async () => {
    const id = await criarConta('nova@cv.lat');
    const e = enviados.find((x) => x.to[0] === 'nova@cv.lat')!;
    const token = tokenDe(e);
    expect(token).toHaveLength(64);
    expect(e.html).toContain('Criar minha senha');
    expect(e.html + e.text).not.toContain('Senha-que-ninguem-usa-1');
    expect(e.html + e.text).not.toMatch(/[Ss]enha tempor/);
    const linha = await env.DB.prepare('SELECT token_hash, expira_em FROM convites_senha WHERE user_id = ?').bind(id).first<{ token_hash: string; expira_em: string }>();
    expect(linha!.token_hash).toBe(await sha256Hex(token));
    expect(linha!.token_hash).not.toContain(token);
    const horas = (Date.parse(linha!.expira_em.replace(' ', 'T') + 'Z') - Date.now()) / 3_600_000;
    expect(horas).toBeGreaterThan(71);
    expect(horas).toBeLessThanOrEqual(72);
    expect((await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(id).first<string>('password_hash'))).toBe('convite:sem-senha-local');
    expect((await login('nova@cv.lat', 'Senha-que-ninguem-usa-1')).status).toBe(401);
    expect((await login('nova@cv.lat', 'convite:sem-senha-local')).status).toBe(401);
  });

  it('link válido cria a senha, o login funciona e a trilha não leva o token', async () => {
    const id = await criarConta('valida@cv.lat');
    const token = tokenDe(enviados.find((x) => x.to[0] === 'valida@cv.lat')!);
    const r = await criarSenha(token);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toEqual({ ok: true, email: 'valida@cv.lat' });
    const l = await login('valida@cv.lat', SENHA);
    expect(l.status).toBe(200);
    expect((await l.json() as { requiresPasswordChange: boolean }).requiresPasswordChange).toBe(false);
    const trilha = await env.DB.prepare(`SELECT 1 FROM audit_logs WHERE instr(details, ?) > 0 OR instr(action, ?) > 0`).bind(token, token).first();
    expect(trilha).toBeNull();
    expect(await env.DB.prepare(`SELECT 1 FROM audit_logs WHERE action = 'auth.senha_criada_convite' AND actor = 'valida@cv.lat'`).first()).not.toBeNull();
    expect(await env.DB.prepare('SELECT 1 FROM convites_senha WHERE user_id = ?').bind(id).first()).toBeNull();
  });

  it('reutilizado, expirado, adulterado e fora do formato: a mesma resposta genérica', async () => {
    const id = await criarConta('reuso@cv.lat');
    const token = tokenDe(enviados.find((x) => x.to[0] === 'reuso@cv.lat')!);
    expect((await criarSenha(token)).status).toBe(200);
    const respostas = [
      await criarSenha(token, 'Outra-senha-forte-2'), // reutilizado
      await criarSenha(token.slice(0, -1) + (token.endsWith('0') ? '1' : '0')), // adulterado
      await criarSenha('a'.repeat(64)), // inexistente
      await criarSenha('nao-e-hex'), // fora do formato
    ];
    const id2 = await criarConta('vencido@cv.lat');
    const vencido = tokenDe(enviados.find((x) => x.to[0] === 'vencido@cv.lat')!);
    await env.DB.prepare(`UPDATE convites_senha SET expira_em = datetime('now', '-1 minute') WHERE user_id = ?`).bind(id2).run();
    respostas.push(await criarSenha(vencido));
    for (const r of respostas) {
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: GENERICO });
    }
    expect((await login('reuso@cv.lat', 'Outra-senha-forte-2')).status).toBe(401);
    expect(id).toBeTruthy();
  });

  it('senha fora da política: erro do campo, e o convite continua valendo', async () => {
    await criarConta('curta@cv.lat');
    const token = tokenDe(enviados.find((x) => x.to[0] === 'curta@cv.lat')!);
    const r = await criarSenha(token, 'curta');
    expect(r.status).toBe(400);
    expect(JSON.stringify(await r.json())).toContain('pelo menos 8 caracteres');
    expect((await criarSenha(token)).status).toBe(200);
  });

  it('reenviar invalida o link anterior; o novo vale', async () => {
    const id = await criarConta('reenvio@cv.lat');
    const antigo = tokenDe(enviados.find((x) => x.to[0] === 'reenvio@cv.lat')!);
    enviados = [];
    const r = await chamar(admin, 'POST', `/api/v1/users/${id}/reenviar-convite`, {});
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toEqual({ ok: true, emailEnviado: true });
    const novo = tokenDe(enviados[0]);
    expect(novo).not.toBe(antigo);
    expect((await criarSenha(antigo)).status).toBe(400);
    expect((await criarSenha(novo)).status).toBe(200);
    // já entrou: não há convite para reenviar
    expect((await chamar(admin, 'POST', `/api/v1/users/${id}/reenviar-convite`, {})).status).toBe(409);
    const lista = await (await chamar(admin, 'GET', '/api/v1/users')).json() as { id: string; convite_pendente: boolean; requires_password_change?: unknown }[];
    expect(lista.find((u) => u.id === id)).toMatchObject({ convite_pendente: false });
    expect(lista.find((u) => u.id === id)).not.toHaveProperty('requires_password_change');
  });

  it('conta desativada não cria senha pelo link', async () => {
    const id = await criarConta('desativada@cv.lat');
    const token = tokenDe(enviados.find((x) => x.to[0] === 'desativada@cv.lat')!);
    await env.DB.prepare('UPDATE users SET ativo = 0 WHERE id = ?').bind(id).run();
    const r = await criarSenha(token);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: GENERICO });
  });

  it('domínio com SSO ativo: e-mail sem link de senha e nenhum convite gravado', async () => {
    const id = await criarConta('pessoa@sso.lat');
    const e = enviados.find((x) => x.to[0] === 'pessoa@sso.lat')!;
    expect(e.text).not.toContain('#convite=');
    expect(e.text).toContain('login único (SSO)');
    expect(await env.DB.prepare('SELECT 1 FROM convites_senha WHERE user_id = ?').bind(id).first()).toBeNull();
  });
});
