import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { avaliarRisco } from '../src/services/incidentes';
import { atualizarPedido } from '../src/services/titular-pedidos';
import { avisosDePrazo } from '../src/services/avisos-prazo';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

// Auditoria de segurança, rodada 2: notas de endurecimento.
const P = 'p-end';
const json = { 'Content-Type': 'application/json' };
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...h },
    body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv());
const comoAgente = (metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: json, body: JSON.stringify(corpo) }),
    { ...workerEnv(), AGENTE: { userId: 'end-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'c-end' } } as any);
const um = <T = any>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<T>();

/** D1 que, logo antes do UPDATE vigiado, aplica a escrita concorrente (outra pessoa chegou primeiro). */
function comCorrida(prefixo: string, concorrente: () => Promise<unknown>): D1Database {
  return new Proxy(env.DB, {
    get(alvo, k) {
      if (k !== 'prepare') return Reflect.get(alvo, k).bind?.(alvo) ?? Reflect.get(alvo, k);
      return (sql: string) => {
        const stmt = alvo.prepare(sql);
        if (!sql.startsWith(prefixo)) return stmt;
        return { bind: (...b: unknown[]) => ({ run: async () => { await concorrente(); return stmt.bind(...b).run(); } }) } as unknown as D1PreparedStatement;
      };
    },
  });
}

let pa: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente E', 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT OR IGNORE INTO projeto_modulos (project_id, modulo) VALUES (?, 'iso'), (?, 'privacy')`).bind(P, P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('end-pa', 'pa@ness.lat', 'x', 'PA', 'platform_admin', NULL, 'org_ness'),
      ('end-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'),
      ('end-iso', 'so-iso@ness.lat', 'x', 'Só ISO', 'consultor', NULL, 'org_ness')`),
    env.DB.prepare(`DELETE FROM usuario_modulos WHERE user_id IN ('end-cons', 'end-iso')`),
    env.DB.prepare(`INSERT INTO usuario_modulos (user_id, modulo) VALUES ('end-cons', 'iso'), ('end-cons', 'privacy'), ('end-iso', 'iso')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('g-e1', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'), ('g-e2', ?, 'Só ISO', 'so-iso@ness.lat', 'consultor', 'Consultor')`).bind(P, P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-end', 'end-cons', ?, datetime('now', '+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em, risco_titular, status) VALUES ('in-e', ?, 'IN-2026-0001', 'Vazamento', '2026-10-01', 'baixo', 'avaliado')`).bind(P),
    env.DB.prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em, status, prazo_em) VALUES
      ('tp-e', ?, 'PT-2026-0001', 'acesso', '2026-10-01', 'em_andamento', '2026-10-20'),
      ('tp-av', ?, 'PT-2026-0002', 'acesso', '2026-10-01', 'recebido', '2026-10-30')`).bind(P, P),
    env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, impact, probability, status, accepted_by, accepted_at) VALUES ('rk-e', ?, 'Servidor', 'Queda', 2, 2, 'Accepted', 'pa@ness.lat', '2026-10-01')`).bind(P),
  ]);
  pa = await sessionFor({ id: 'end-pa', email: 'pa@ness.lat', role: 'platform_admin', org_id: 'org_ness' });
});

describe('corridas no incidente e no pedido do titular', () => {
  it('avaliação que chega depois do encerramento não reabre o incidente', async () => {
    const db = comCorrida('UPDATE incidentes SET risco_titular', () => env.DB.prepare(`UPDATE incidentes SET status = 'encerrado' WHERE id = 'in-e'`).run());
    const r = await avaliarRisco(db, P, 'in-e', 'cons@ness.lat', { risco_titular: 'relevante' });
    expect(r.ok).toBe(false);
    expect((await um(`SELECT status, risco_titular FROM incidentes WHERE id = 'in-e'`))).toMatchObject({ status: 'encerrado', risco_titular: 'baixo' });
  });

  it('edição que chega depois da resposta não a sobrescreve', async () => {
    const db = comCorrida('UPDATE titular_pedidos SET', () => env.DB.prepare(
      `UPDATE titular_pedidos SET status = 'respondido', resposta_texto = 'enviada', respondido_em = datetime('now') WHERE id = 'tp-e'`).run());
    const r = await atualizarPedido(db, P, 'tp-e', 'cons@ness.lat', { descricao: 'outra' });
    expect(r.ok).toBe(false);
    expect((await um(`SELECT status, resposta_texto FROM titular_pedidos WHERE id = 'tp-e'`))).toMatchObject({ status: 'respondido', resposta_texto: 'enviada' });
  });
});

describe('agente no pedido do titular', () => {
  it('não responde, não nega e não muda o prazo', async () => {
    const url = `/api/v1/projects/${P}/titular-pedidos/tp-av`;
    expect((await comoAgente('PUT', url, { status: 'negado', resposta_texto: 'não' })).status).toBe(403);
    expect((await comoAgente('PUT', url, { prazo_em: '2027-01-01' })).status).toBe(403);
    expect((await comoAgente('PUT', url, { status: 'em_andamento' })).status).toBe(200);
  });
});

describe('aceite de risco', () => {
  it('mudar impacto de risco aceito o devolve a Aberto e apaga o aceite', async () => {
    const r = await chamar(pa, 'PUT', '/api/v1/risks/rk-e', { impact: 5 });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await um(`SELECT status, accepted_by, accepted_at FROM risks WHERE id = 'rk-e'`)).toMatchObject({ status: 'Open', accepted_by: null, accepted_at: null });
    expect(await um(`SELECT 1 AS x FROM audit_logs WHERE action = 'risk.aceite_invalidado'`)).not.toBeNull();
  });
});

describe('avisos de prazo', () => {
  it('quem não tem o n.privacy não recebe aviso do pedido do titular', async () => {
    await avisosDePrazo({ ...workerEnv(), RESEND_API_KEY: undefined } as any, '2026-10-23');
    const quem = (await env.DB.prepare(`SELECT DISTINCT user_id FROM avisos_prazo WHERE fonte = 'titular_pedido'`).all<{ user_id: string }>()).results.map((x) => x.user_id);
    expect(quem).toContain('end-cons');
    expect(quem).not.toContain('end-iso');
  });
});
