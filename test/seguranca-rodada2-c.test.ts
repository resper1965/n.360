import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { emailLigadoAoProjeto } from '../src/routes/public';
import { criarDocumento, publicarVersao, salvarRascunho } from '../src/services/documentos';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

// Auditoria de segurança, rodada 2 (achados 8 a 15).
const P = 'p-r2c';
const Q = 'q-r2c';
const json = { 'Content-Type': 'application/json' };
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, 'CF-Connecting-IP': '203.0.113.9', ...h },
    body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv());
const comoAgente = (metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, 'X-Agente-Confirmado': '1' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo) }),
    { ...workerEnv(), AGENTE: { userId: 'r2c-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'c-r2c' } } as any);
const um = <T = any>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<T>();

let pa: Record<string, string>, cons: Record<string, string>, oa: Record<string, string>, leitor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente C', 'ISO 27001', 'controller', 'Active', 'org_ness'), (?, 'Cliente Q', 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(P, Q),
    env.DB.prepare(`INSERT OR IGNORE INTO projeto_modulos (project_id, modulo) VALUES (?, 'iso'), (?, 'privacy')`).bind(P, P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('r2c-pa', 'pa@ness.lat', 'x', 'PA', 'platform_admin', NULL, 'org_ness'),
      ('r2c-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'),
      ('r2c-oa', 'admin@cliente-c.lat', 'x', 'Admin', 'org_admin', ?, 'org_ness'),
      ('r2c-ou', 'leitor@cliente-c.lat', 'x', 'Leitor', 'org_user', ?, 'org_ness')`).bind(P, P),
    env.DB.prepare(`INSERT OR IGNORE INTO usuario_modulos (user_id, modulo) VALUES ('r2c-cons', 'iso'), ('r2c-cons', 'privacy'), ('r2c-ou', 'iso'), ('r2c-ou', 'privacy')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('g-c1', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'),
      ('g-c2', ?, 'Diretora', 'ceo@cliente-c.lat', 'executivo', 'Direção')`).bind(P, P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-r2c', 'r2c-cons', ?, datetime('now', '+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email, status) VALUES
      ('pt-op', ?, 'pessoa', 'Operador', 'contato@fornecedor.lat', 'ativa'),
      ('pt-in', ?, 'pessoa', 'Ex', 'ex@antigo.lat', 'inativa'),
      ('pt-ok', ?, 'pessoa', 'Colab', 'colab@parceiro.lat', 'ativa'),
      ('pt-org', ?, 'organizacao', 'Fornecedor X', NULL, 'ativa')`).bind(P, P, P, P),
    env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('pv-op', ?, 'pt-op', 'operador', 'projeto', ?)`).bind(P, P),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('ro-c', ?, 'Folha')`).bind(P),
    env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, ropa_id) VALUES ('rk-ativ', ?, 'Folha', 'Vazamento', 'ro-c')`).bind(P),
    env.DB.prepare(`INSERT INTO corrective_actions (id, project_id, title, ropa_id) VALUES ('ca-ativ', ?, 'Gap', 'ro-c')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, ciso_approved_by, ciso_approved_ip, ciso_approved_ua) VALUES ('ctl-c', ?, 'ISO 27001', 'A.5.1', 'ciso@cliente-c.lat', '198.51.100.77', 'UA-ASSINANTE')`).bind(P),
  ]);
  pa = await sessionFor({ id: 'r2c-pa', email: 'pa@ness.lat', role: 'platform_admin', org_id: 'org_ness' });
  cons = await sessionFor({ id: 'r2c-cons', email: 'cons@ness.lat', role: 'consultor', org_id: 'org_ness' });
  oa = await sessionFor({ id: 'r2c-oa', email: 'admin@cliente-c.lat', role: 'org_admin', client_project_id: P, org_id: 'org_ness' });
  leitor = await sessionFor({ id: 'r2c-ou', email: 'leitor@cliente-c.lat', role: 'org_user', client_project_id: P, org_id: 'org_ness' });
});

describe('8. domínio de SSO', () => {
  const sso = (dominios: string) => ({ issuer: 'https://idp.exemplo.lat', client_id: 'id', client_secret: 's', dominios, papel_padrao: 'org_user', ativo: true });
  it('um domínio, um SSO ativo; domínio público recusado', async () => {
    expect((await chamar(pa, 'PUT', `/api/v1/projects/${P}/sso`, sso('cliente-c.lat'))).status).toBe(200);
    expect((await chamar(pa, 'PUT', `/api/v1/projects/${Q}/sso`, sso('outro.lat, Cliente-C.lat'))).status).toBe(409);
    expect((await chamar(pa, 'PUT', `/api/v1/projects/${Q}/sso`, sso('gmail.com'))).status).toBe(400);
    // regravar o próprio projeto continua valendo
    expect((await chamar(pa, 'PUT', `/api/v1/projects/${P}/sso`, sso('cliente-c.lat'))).status).toBe(200);
    await env.DB.prepare('DELETE FROM project_sso').run();
  });
});

describe('9. eliminação do titular', () => {
  const corpo = (identificador: string) => ({ identificador, justificativa: 'pedido do titular' });
  it('não anonimiza a linha de assinatura nem a de consultor da governança', async () => {
    expect((await chamar(cons, 'POST', `/api/v1/projects/${P}/data-subject/erase`, corpo('ceo@cliente-c.lat'))).status).toBe(409);
    expect((await chamar(oa, 'POST', `/api/v1/projects/${P}/data-subject/erase`, corpo('cons@ness.lat'))).status).toBe(409);
    expect((await um(`SELECT email FROM project_governance WHERE id = 'g-c2'`)).email).toBe('ceo@cliente-c.lat');
  });
  it('o agente não elimina', async () => {
    expect((await comoAgente('POST', `/api/v1/projects/${P}/data-subject/erase`, corpo('colab@parceiro.lat'))).status).toBe(403);
  });
});

describe('10. e-mail ligado ao projeto (portal de políticas)', () => {
  const ligado = (email: string) => emailLigadoAoProjeto(env.DB, P, 'org_ness', email);
  it('parte de terceiro ou inativa não liga; parte ativa só pelo e-mail exato', async () => {
    expect(await ligado('contato@fornecedor.lat')).toBe(false);
    expect(await ligado('outro@fornecedor.lat')).toBe(false);
    expect(await ligado('ex@antigo.lat')).toBe(false);
    expect(await ligado('colab@parceiro.lat')).toBe(true);
    expect(await ligado('qualquer@parceiro.lat')).toBe(false);
  });
  it('domínio da conta ou da governança do cliente liga; provedor público não', async () => {
    expect(await ligado('novo@cliente-c.lat')).toBe(true);
    expect(await ligado('alguem@proton.me')).toBe(false);
  });
});

describe('11. exportação completa', () => {
  it('papel de leitura não leva IP nem navegador de quem assinou; a equipe leva', async () => {
    const r = await chamar(leitor, 'GET', `/api/v1/projects/${P}/export`);
    expect(r.status, await r.clone().text()).toBe(200);
    const texto = await r.text();
    expect(texto).not.toContain('198.51.100.77');
    expect(texto).not.toContain('UA-ASSINANTE');
    expect(texto).toContain('ciso@cliente-c.lat');
    expect(await (await chamar(cons, 'GET', `/api/v1/projects/${P}/export`)).text()).toContain('198.51.100.77');
  });
});

describe('12 e 13. agente por rota paralela', () => {
  it('não apaga risco nem gap da atividade por /risks e /capa', async () => {
    expect((await comoAgente('DELETE', '/api/v1/risks/rk-ativ')).status).toBe(403);
    expect((await comoAgente('DELETE', '/api/v1/capa/ca-ativ')).status).toBe(403);
    expect(await um(`SELECT 1 AS x FROM risks WHERE id = 'rk-ativ'`)).not.toBeNull();
    expect(await um(`SELECT 1 AS x FROM corrective_actions WHERE id = 'ca-ativ'`)).not.toBeNull();
  });
  it('não define tipo nem registra avaliação do fornecedor', async () => {
    expect((await comoAgente('PUT', `/api/v1/projects/${P}/terceiros/pt-org/tipo`, { terceiro_tipo: 'grande_provedor' })).status).toBe(403);
    expect((await comoAgente('POST', `/api/v1/projects/${P}/terceiros/pt-org/avaliacoes`, { resultado: 'aprovado', valido_ate: '2030-01-01' })).status).toBe(403);
  });
});

describe('14 e 15. versão revisada e versão lida', () => {
  it('publicar recusa rascunho que mudou depois de revisado', async () => {
    const c = await criarDocumento(env.DB, P, 'cons@ness.lat', { tipo: 'politica', titulo: 'Política de Teste', texto: 'texto A' });
    if (!c.ok) throw new Error(c.error);
    const v1 = await um<{ hash: string }>(`SELECT hash FROM documento_versoes WHERE documento_id = ? AND numero = 1`, c.id);
    await salvarRascunho(env.DB, P, c.id, 'outro@ness.lat', 'texto B', 'humano');
    expect((await chamar(cons, 'POST', `/api/v1/projects/${P}/documentos/${c.id}/versoes/1/publicar?hash=${v1!.hash}`)).status).toBe(409);
    const v2 = await um<{ hash: string }>(`SELECT hash FROM documento_versoes WHERE documento_id = ? AND numero = 1`, c.id);
    expect((await chamar(cons, 'POST', `/api/v1/projects/${P}/documentos/${c.id}/versoes/1/publicar?hash=${v2!.hash}`)).status).toBe(200);
  });

  it('a ciência do portal recusa versão que já não é a vigente', async () => {
    const c = await criarDocumento(env.DB, P, 'cons@ness.lat', { tipo: 'politica', titulo: 'Política do Portal', texto: 'v1' });
    if (!c.ok) throw new Error(c.error);
    await publicarVersao(env.DB, P, c.id, 1, 'cons@ness.lat');
    await salvarRascunho(env.DB, P, c.id, 'cons@ness.lat', 'v2', 'humano');
    await publicarVersao(env.DB, P, c.id, 2, 'cons@ness.lat');
    await env.SESSIONS.put('pubpol_sess_tok-r2c', JSON.stringify({ project_id: P, name: 'Colab', email: 'colab@parceiro.lat' }));
    const ack = (numero: number) => chamar({}, 'POST', '/api/v1/public/policies/ack?token=tok-r2c', { documento_id: c.id, numero });
    expect((await ack(1)).status).toBe(409);
    const ok = await ack(2);
    expect(ok.status, await ok.clone().text()).toBe(200);
    expect(((await ok.json()) as { numero: number }).numero).toBe(2);
  });
});
